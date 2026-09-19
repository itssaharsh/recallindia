"""common.ingest_runs: ingest#<run_id> records (id derivation, read-merge-put, feed exclusion)."""

from __future__ import annotations

import re

from common import dynamo, ingest_runs
from common.ingest_runs import (
    RUN_PREFIX,
    read_run,
    run_from_event,
    run_id_from_arn,
    run_pk,
    write_run,
)
from common.notices import INTERNAL_PREFIXES, is_meta

ARN = "arn:aws:states:ap-south-1:1:execution:recallindia-ingest-1:ingest-2026"


def test_run_id_from_arn_is_the_execution_name() -> None:
    assert run_id_from_arn(ARN) == "ingest-2026"
    assert run_id_from_arn(f"  {ARN}  ") == "ingest-2026"
    assert run_id_from_arn("plain-name") == "plain-name"


def test_run_id_without_arn_is_a_fresh_local_id() -> None:
    a, b = run_id_from_arn(None), run_id_from_arn("")
    assert re.fullmatch(r"local-\d{8}T\d{6}Z-[0-9a-f]{6}", a), a
    assert re.fullmatch(r"local-\d{8}T\d{6}Z-[0-9a-f]{6}", b), b
    assert a != b


def test_run_pk_and_internal_prefix() -> None:
    assert RUN_PREFIX == "ingest#" and RUN_PREFIX in INTERNAL_PREFIXES
    assert run_pk("ingest-2026") == "ingest#ingest-2026"
    assert is_meta({"pk": run_pk("x")}) and is_meta({"pk": "meta#cdsco_pdf"})
    assert not is_meta({"pk": "cdsco_nsq#JUN-2025-cdsco_pdf-1"})


def test_write_run_read_merge_put_keeps_and_overwrites() -> None:
    assert read_run("r1") is None
    first = write_run("r1", step="extract", status="running", textract={"polls": 1, "pct": 10})
    assert first["pk"] == "ingest#r1" and first["run_id"] == "r1"
    assert first["step"] == "extract" and first["status"] == "running"
    assert first["created_at"] == first["updated_at"]
    stored = read_run("r1")
    assert stored == first

    # given fields overwrite, others are kept, nested dicts replace (no deep merge)
    second = write_run("r1", textract={"polls": 2}, method="pdfplumber", pk="evil")
    assert second["pk"] == "ingest#r1" and second["run_id"] == "r1"
    assert second["step"] == "extract" and second["status"] == "running"
    assert second["textract"] == {"polls": 2}
    assert second["method"] == "pdfplumber"
    assert second["created_at"] == first["created_at"]
    assert "updated_at" in second
    assert read_run("r1") == second

    # a run record never carries published_at (it must stay out of the source GSI)
    third = write_run("r1", published_at="2026-07-01", step="publish", status="done")
    assert "published_at" not in third and third["step"] == "publish"


def test_write_run_many_times_is_one_read_one_put(monkeypatch) -> None:
    calls: list[str] = []
    real_get, real_put = dynamo.get, dynamo.put

    def get(kind, pk):
        calls.append("get")
        return real_get(kind, pk)

    def put(kind, item):
        calls.append("put")
        return real_put(kind, item)

    monkeypatch.setattr(ingest_runs.dynamo, "get", get)
    monkeypatch.setattr(ingest_runs.dynamo, "put", put)
    for i in range(20):
        write_run("hb", textract={"polls": i})
    assert calls == ["get", "put"] * 20
    assert read_run("hb")["textract"] == {"polls": 19}


def test_run_records_never_reach_source_query_or_feed() -> None:
    write_run("r2", step="normalise", source="cdsco_nsq")
    dynamo.put(
        "notices",
        {
            "pk": "cdsco_nsq#JUN-2025-cdsco_pdf-1",
            "source": "cdsco_nsq",
            "published_at": "2025-06-01",
        },
    )
    items, last = dynamo.query_source("cdsco_nsq")
    assert [n["pk"] for n in items] == ["cdsco_nsq#JUN-2025-cdsco_pdf-1"] and last is None
    assert dynamo.count_source("cdsco_nsq") == 1
    feed = [n["pk"] for n in dynamo.scan_all("notices") if not is_meta(n)]
    assert feed == ["cdsco_nsq#JUN-2025-cdsco_pdf-1"]


def test_run_from_event_prefers_asl_init_then_top_level() -> None:
    assert run_from_event({"run": {"execution_arn": ARN}, "execution_arn": "x:y"}) == (
        "ingest-2026",
        ARN,
    )
    assert run_from_event({"execution_arn": "arn:aws:states:r:1:execution:m:direct-1"}) == (
        "direct-1",
        "arn:aws:states:r:1:execution:m:direct-1",
    )
    run_id, arn = run_from_event({"fetch": {"adapter": "cdsco_pdf"}})
    assert arn is None and run_id.startswith("local-")
    run_id, arn = run_from_event(None)
    assert arn is None and run_id.startswith("local-")
    run_id, arn = run_from_event({"run": "not-a-dict", "execution_arn": ""})
    assert arn is None and run_id.startswith("local-")
