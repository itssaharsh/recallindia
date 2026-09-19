"""Fetch -> Extract -> Normalise -> Diff -> Publish chained exactly as the IngestStateMachine does.

The ASL stamps ``$.run`` (Init), stores each task result under ``$.fetch`` / ``$.extract`` /
``$.normalise`` / ``$.diff`` / ``$.publish`` and routes a caught error to RecordFailure with
``$.error``. These tests feed those shapes through the real handlers in DEMO_MODE and pin the
cross-step contract (pdf_s3_key, rows reuse, row_ref pages, counts, meta#cdsco_pdf, the
ingest#<run_id> record) plus the Lambda module layout (CodeUri backend/ingest/ -> siblings at
/var/task, ``common`` from the layer).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from common import dynamo, s3
from common.cdsco import JUNE_2025_PDF_URL
from common.ingest_runs import read_run
from common.notices import is_meta, read_meta
from ingest import cdsco_extract, cdsco_fetch, cdsco_normalise, cdsco_publish

BACKEND = Path(__file__).resolve().parents[1]
ARN = "arn:aws:states:ap-south-1:1:execution:recallindia-ingest-1:run-chain"
PDF_KEY = "cdsco/CDSCO_NSQ_june25.pdf"


def _start(**overrides) -> dict:
    state = {
        "adapter": "pdf",
        "force": True,
        "run": {"execution_arn": ARN, "execution_name": "run-chain"},
    }
    state.update(overrides)
    return state


def _run_chain(start: dict) -> dict:
    """Mirror the ASL: $.fetch, Choice on $.fetch.adapter, then extract/normalise/diff/publish."""
    state = dict(start)
    state["fetch"] = cdsco_fetch.handler(state, None)
    if state["fetch"].get("adapter") != "cdsco_portal":
        state["extract"] = cdsco_extract.handler(state, None)
    state["normalise"] = cdsco_normalise.handler(state, None)
    state["diff"] = cdsco_publish.diff_handler(state, None)
    state["publish"] = cdsco_publish.handler(state, None)
    return state


def _notices() -> list[dict]:
    return [n for n in dynamo.scan_all("notices", limit=10_000) if not is_meta(n)]


def test_pdf_chain_demo_end_to_end():
    state = _run_chain(_start())
    fetch, extract, norm = state["fetch"], state["extract"], state["normalise"]
    diff, publish = state["diff"], state["publish"]
    for step in (fetch, extract, norm, diff, publish):
        assert not step.get("degraded"), step

    assert fetch["adapter"] == "cdsco_pdf" and fetch["month"] == "JUN-2025"
    assert fetch["pdf_s3_key"] == PDF_KEY and fetch["pdf_url"] == JUNE_2025_PDF_URL
    assert fetch["is_new"] is True and fetch["bytes"] > 100_000

    assert extract["pdf_s3_key"] == PDF_KEY and extract["method"] == "pdfplumber"
    assert extract["fallback_used"] is False and extract["rows_in"] >= 55
    rows_in = extract["rows_in"]
    assert extract["rows_s3_key"] == f"{PDF_KEY}.rows.json"
    stored = json.loads(s3.get_bytes("raw", extract["rows_s3_key"]))
    assert stored["rows"] == extract["rows"] and stored["header"] == extract["header"]
    assert all({"page", "row", "cells", "bbox"} <= set(r) for r in extract["rows"])

    assert norm["adapter"] == "cdsco_pdf" and norm["month"] == "JUN-2025"
    assert norm["pdf_s3_key"] == PDF_KEY and norm["pdf_url"] == JUNE_2025_PDF_URL
    assert norm["rows_in"] == rows_in and norm["notices_out"] >= 55
    assert norm["counts"]["created"] == norm["notices_out"] >= 55
    assert norm["fallback_used"] == {"extract": False, "normalise": True}
    assert norm["bedrock"]["attempted"] == 0 and norm["run_id"] == "run-chain"
    assert norm["source_confidence"] == "primary-official"

    notices = _notices()
    assert len(notices) == norm["notices_out"]
    assert {n["source"] for n in notices} == {"cdsco_nsq"}
    assert {n["adapter"] for n in notices} == {"cdsco_pdf"}
    assert all(n["batches"] and n["batches"][0] for n in notices)
    assert {n["row_ref"]["page"] for n in notices} == {1, 2, 3, 4, 5, 6}
    assert {n["pdf_s3_key"] for n in notices} == {PDF_KEY}
    assert {n["url"] for n in notices} == {JUNE_2025_PDF_URL}
    assert {n["source_confidence"] for n in notices} == {"primary-official"}
    # row_ref.row is the extractor's data-row index (the number GET /ingest/rows reports), so
    # the two wrapped-manufacturer continuation rows leave gaps instead of shifting every
    # later notice off its bbox: each notice's batch sits in the extract row it points at.
    by_row = {r["row"]: r for r in extract["rows"]}
    rows = [n["row_ref"]["row"] for n in notices]
    assert len(set(rows)) == len(rows) and set(rows) <= set(by_row)
    assert rows_in - len(notices) == 2 and max(rows) == rows_in
    for n in notices:
        src = by_row[n["row_ref"]["row"]]
        assert n["batches"][0] in src["cells"] and src["page"] == n["row_ref"]["page"]
        assert n["notice_id"] == f"JUN-2025-cdsco_pdf-{n['row_ref']['row']}"
    first = min(notices, key=lambda n: n["row_ref"]["row"])
    assert first["brand"] == "Tam-Bran Pharmaceuticals Pvt. Ltd."
    assert first["row_ref"] == {"page": 1, "row": 1, "month": None}
    assert all("failed CDSCO quality test" in n["title"] for n in notices)
    assert all(("recall" + "ed") not in n["title"] for n in notices)

    assert diff["new"] == norm["counts"]["created"] >= 55
    assert diff["updated"] == 0 and diff["existing"] == 0
    assert diff["total"] == norm["notices_out"] and diff["month"] == "JUN-2025"
    assert diff["previous"] is None  # first publish: nothing to compare against

    assert publish["published"] is True and publish["meta_pk"] == "meta#cdsco_pdf"
    assert publish["counts"]["created"] >= 55 and publish["counts"]["rows_in"] == rows_in
    assert publish["counts"]["notices_out"] == norm["notices_out"]
    assert publish["diff"]["new"] == diff["new"]

    meta = read_meta("cdsco_pdf")
    assert meta["degraded"] is False and meta["last_error"] is None
    assert meta["last_success_at"] and meta["last_run_at"]
    assert meta["last_counts"]["created"] >= 55 and meta["last_counts"]["unchanged"] == 0
    june = [e for e in meta["ingested"] if e["pdf_url"] == JUNE_2025_PDF_URL]
    assert len(june) == 1
    assert june[0]["pdf_s3_key"] == PDF_KEY and june[0]["month"] == "JUN-2025"
    assert june[0]["lab_scope"] == "cdsco" and june[0]["ingested_at"]
    assert meta["last_run"]["method"] == "pdfplumber" and meta["last_run"]["run_id"] == "run-chain"
    assert meta["last_run"]["fallback_used"] == {"extract": False, "normalise": True}
    assert meta["last_run"]["diff"]["new"] >= 55
    assert meta["listing"], "the fetch listing must survive Publish"

    run = read_run("run-chain")
    assert run["step"] == "publish" and run["status"] == "done"
    assert run["counts"]["created"] >= 55 and run["diff"]["new"] >= 55
    assert run["execution_arn"] == ARN and run["finished_at"]
    assert "published_at" not in run

    # ingest# / meta# rows never leak into the feed
    assert not [n for n in _notices() if n["pk"].startswith(("meta#", "ingest#"))]


def test_second_run_is_idempotent_and_reuses_the_stored_pdf():
    first = _run_chain(_start())
    assert first["publish"]["published"] is True
    total = first["normalise"]["notices_out"]

    # without force the fetch walks to the newest month not yet ingested (the archive backfill),
    # so pin the month: every June candidate is already in meta.ingested -> reuse, is_new False
    again = _run_chain(
        _start(force=False, month="JUN-2025", run={"execution_arn": ARN.replace("run-chain", "r2")})
    )
    fetch, norm, diff = again["fetch"], again["normalise"], again["diff"]
    assert not fetch["degraded"] and fetch["is_new"] is False
    assert fetch["pdf_s3_key"] == PDF_KEY and fetch["reused"] is True
    assert again["extract"]["rows_in"] == first["extract"]["rows_in"]
    assert norm["notices_out"] == total
    assert norm["counts"]["created"] == 0 and norm["counts"]["unchanged"] == total >= 55
    assert diff["new"] == 0 and diff["existing"] == total
    assert diff["previous"]["created"] == total  # the previous run's counts, for "N new"
    assert again["publish"]["published"] is True
    assert len(_notices()) == total
    meta = read_meta("cdsco_pdf")
    assert len([e for e in meta["ingested"] if e["pdf_url"] == JUNE_2025_PDF_URL]) == 1
    assert meta["last_counts"]["created"] == 0 and meta["last_counts"]["unchanged"] == total
    assert read_run("r2")["status"] == "done"

    # force=True re-downloads but still changes nothing
    forced = _run_chain(_start(run={"execution_arn": ARN.replace("run-chain", "r3")}))
    assert forced["fetch"]["is_new"] is True and forced["fetch"]["bytes"] > 0
    assert forced["normalise"]["counts"]["created"] == 0 and forced["diff"]["new"] == 0


def test_record_failure_path_keeps_last_success():
    ok = _run_chain(_start())
    assert ok["publish"]["published"] is True
    success_at = read_meta("cdsco_pdf")["last_success_at"]

    failed_arn = ARN.replace("run-chain", "run-fail")
    state = {
        "adapter": "pdf",
        "run": {"execution_arn": failed_arn, "execution_name": "run-fail"},
        "fetch": ok["fetch"],
        "error": {"Error": "States.TaskFailed", "Cause": "boom"},
    }
    out = cdsco_publish.handler(state, None)
    assert out["published"] is False and "boom" in out["error"]
    assert out["meta_pk"] == "meta#cdsco_pdf" and out["run_id"] == "run-fail"
    meta = read_meta("cdsco_pdf")
    assert meta["degraded"] is True and "boom" in meta["last_error"]
    assert "States.TaskFailed" in meta["last_error"]
    assert meta["last_success_at"] == success_at
    assert meta["ingested"] and meta["listing"] and meta["last_run"]["run_id"] == "run-chain"
    run = read_run("run-fail")
    assert run["step"] == "publish" and run["status"] == "failed" and "boom" in run["error"]

    # a step that came back degraded (no exception, so no $.error) is a failure too
    degraded = {
        "adapter": "pdf",
        "run": {"execution_arn": ARN.replace("run-chain", "run-deg")},
        "fetch": {"adapter": "cdsco_pdf", "degraded": True, "error": "UpstreamError: 503"},
    }
    out = cdsco_publish.handler(degraded, None)
    assert out["published"] is False and "fetch: UpstreamError: 503" == out["error"]
    assert read_run("run-deg")["status"] == "failed"

    # a plain string error and a bare event still never raise
    assert cdsco_publish.handler({"error": "boom2"}, None)["published"] is False
    assert cdsco_publish.handler(None, None)["published"] is True  # nothing to publish, ok


def test_degraded_fetch_stops_the_chain_before_any_notice(monkeypatch):
    """The flaky-site case: Fetch degrades, and neither Extract nor Normalise may run the
    fixture PDF in its place (the ASL routes $.fetch.degraded to RecordFailure; the handlers
    refuse the default PDF themselves when $.fetch is present)."""
    monkeypatch.setattr(
        cdsco_fetch, "list_archive", lambda: (_ for _ in ()).throw(TimeoutError("cdsco.gov.in"))
    )
    state = _start(month="SEP-2031", run={"execution_arn": ARN.replace("run-chain", "run-flaky")})
    state["fetch"] = cdsco_fetch.handler(state, None)
    assert state["fetch"]["degraded"] is True and "cdsco.gov.in" in state["fetch"]["error"]

    extract = cdsco_extract.handler(state, None)
    assert extract["degraded"] is True and extract["error"].startswith("fetch degraded:")
    assert extract["pdf_url"] is None and "rows_in" not in extract
    state["extract"] = extract
    norm = cdsco_normalise.handler(state, None)
    assert norm["degraded"] is True and "degraded" in norm["error"]
    assert _notices() == []  # nothing published under SEP-2031 (or any month)

    # a fetch that "succeeded" without a PDF is refused the same way
    state = {"adapter": "pdf", "fetch": {"adapter": "cdsco_pdf", "degraded": False}}
    out = cdsco_extract.handler(state, None)
    assert out["degraded"] is True and "neither pdf_s3_key nor pdf_url" in out["error"]
    state["extract"] = out
    assert cdsco_normalise.handler(state, None)["degraded"] is True
    assert _notices() == []
    # RecordFailure books the degraded step, and Publish reports it as not published
    publish = cdsco_publish.handler(
        {**state, "run": {"execution_arn": ARN.replace("run-chain", "run-flaky2")}}, None
    )
    assert publish["published"] is False and publish["error"].startswith("extract: fetch produced")
    assert read_run("run-flaky2")["status"] == "failed"


def test_diff_handler_reads_normalise_counts_and_previous_meta():
    empty = cdsco_publish.diff_handler({}, None)
    assert empty["run_id"].startswith("local-")
    keys = ("new", "updated", "existing", "total", "month", "previous", "degraded")
    assert {k: empty[k] for k in keys} == {
        "new": 0,
        "updated": 0,
        "existing": 0,
        "total": 0,
        "month": None,
        "previous": None,
        "degraded": False,
    }
    state = {
        "run": {"execution_arn": ARN.replace("run-chain", "d1")},
        "fetch": {"adapter": "cdsco_pdf", "month": "JUN-2025"},
        "normalise": {
            "adapter": "cdsco_pdf",
            "month": "JUN-2025",
            "notices_out": 57,
            "counts": {"created": 41, "updated": 2, "unchanged": 14, "upserted": 43},
        },
    }
    out = cdsco_publish.diff_handler(state, None)
    assert out["new"] == 41 and out["updated"] == 2 and out["existing"] == 14
    assert out["total"] == 57 and out["month"] == "JUN-2025" and out["run_id"] == "d1"
    assert read_run("d1")["step"] == "diff" and read_run("d1")["diff"]["new"] == 41

    # diff_handler never raises even when the store is broken
    orig = cdsco_publish.read_meta
    try:
        cdsco_publish.read_meta = lambda source: 1 / 0
        bad = cdsco_publish.diff_handler(state, None)
    finally:
        cdsco_publish.read_meta = orig
    assert bad["degraded"] is True and "ZeroDivisionError" in bad["error"]


def test_normalise_consumes_extract_rows_without_re_extracting(monkeypatch):
    """Normalise must use $.extract.rows (inline) or rows_s3_key, never extract/download again."""
    state = _start()
    state["fetch"] = cdsco_fetch.handler(state, None)
    state["extract"] = cdsco_extract.handler(state, None)
    monkeypatch.setattr(cdsco_extract, "extract_rows", lambda *a, **k: pytest.fail("re-extracted"))
    monkeypatch.setattr(cdsco_normalise, "fetch_bytes", lambda *a, **k: pytest.fail("downloaded"))

    inline = cdsco_normalise.handler(state, None)
    assert not inline["degraded"] and inline["notices_out"] >= 55
    assert inline["rows_in"] == state["extract"]["rows_in"] >= 55

    # payload over the inline cap: rows travel via rows_s3_key only
    del state["extract"]["rows"]
    via_store = cdsco_normalise.handler(state, None)
    assert not via_store["degraded"] and via_store["notices_out"] == inline["notices_out"]
    assert via_store["counts"]["unchanged"] == inline["notices_out"]
    assert {n["row_ref"]["page"] for n in _notices()} == {1, 2, 3, 4, 5, 6}


def test_portal_chain_demo_skips_extract():
    state = _run_chain(_start(adapter="portal"))
    assert state["fetch"]["adapter"] == "cdsco_portal" and "extract" not in state
    norm = state["normalise"]
    assert norm["adapter"] == "cdsco_portal" and norm["month"] == "JUL-2026"
    assert norm["rows_in"] == norm["notices_out"] == 239
    assert norm["counts"]["created"] == 239 and norm["pdf_s3_key"] is None
    assert state["diff"]["new"] == 239 and state["diff"]["total"] == 239
    assert state["publish"]["published"] is True
    # the portal branch books into the poller's meta row, not the PDF's
    assert state["publish"]["meta_pk"] == "meta#cdsco_portal"
    notices = _notices()
    assert len(notices) == 239
    assert all(
        n["row_ref"] == {"page": None, "row": n["row_ref"]["row"], "month": "JUL-2026"}
        for n in notices
    )
    assert {n["url"] for n in notices} == {cdsco_normalise.PORTAL_URL}
    assert {n["source_confidence"] for n in notices} == {"primary-official"}
    assert read_meta("cdsco_pdf") is None
    meta = read_meta("cdsco_portal")
    assert meta["degraded"] is False and meta["last_counts"]["created"] == 239
    assert meta["ingested"] == []  # no PDF on the portal branch


def test_ingest_handlers_import_with_lambda_layout(tmp_path):
    """sys.path = [backend/ingest, <layer>/python] - no backend/ root, so `ingest` is absent."""
    layer = tmp_path / "python"
    layer.mkdir()
    (layer / "common").symlink_to(BACKEND / "common", target_is_directory=True)
    script = f"""
import json, sys
sys.path[:0] = [{str(BACKEND / "ingest")!r}, {str(layer)!r}]
try:
    import ingest
except ModuleNotFoundError:
    pass
else:
    raise SystemExit("ingest package must not be importable in the Lambda layout")
import cdsco_extract, cdsco_fetch, cdsco_normalise, cdsco_publish
state = {{"adapter": "pdf", "force": True, "run": {{"execution_arn": {ARN!r}}}}}
state["fetch"] = cdsco_fetch.handler(state, None)
state["extract"] = cdsco_extract.handler(state, None)
state["normalise"] = cdsco_normalise.handler(state, None)
state["diff"] = cdsco_publish.diff_handler(state, None)
state["publish"] = cdsco_publish.handler(state, None)
fetch = {{"adapter": "cdsco_portal", "month": "JUL-2026"}}
portal = cdsco_normalise.handler({{"fetch": fetch}}, None)
print(json.dumps({{"pdf": state["normalise"], "publish": state["publish"], "portal": portal}}))
"""
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env.update(DEMO_MODE="1", DEMO_STORE_DIR=str(tmp_path / "store"))
    env.pop("RAW_BUCKET", None)
    proc = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, env=env, cwd=str(tmp_path)
    )
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout.strip().splitlines()[-1])
    assert not out["pdf"]["degraded"], out["pdf"]
    assert out["pdf"]["notices_out"] >= 55 and out["pdf"]["pdf_s3_key"] == PDF_KEY
    assert out["publish"]["published"] is True and out["publish"]["counts"]["created"] >= 55
    assert not out["portal"]["degraded"] and out["portal"]["notices_out"] == 239
