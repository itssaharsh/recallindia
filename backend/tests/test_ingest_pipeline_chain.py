"""Fetch -> Extract -> Normalise chained exactly as the IngestStateMachine wires them.

The ASL stores each task result under ``$.fetch`` / ``$.extract``; these tests feed those
shapes through the handlers and pin the cross-step contract (pdf_s3_key, rows reuse, Textract
attempted outside DEMO_MODE, row_ref pages, brand parsing) plus the Lambda module layout
(CodeUri backend/ingest/ -> siblings at /var/task, ``common`` from the layer).
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

from common import dynamo, s3
from ingest import cdsco_extract, cdsco_fetch, cdsco_normalise

BACKEND = Path(__file__).resolve().parents[1]
FIXTURE_PDF = BACKEND.parent / "fixtures" / "cdsco" / "nsq_latest.pdf"


@pytest.fixture
def demo_store(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("DEMO_STORE_DIR", str(tmp_path / "store"))
    monkeypatch.delenv("RAW_BUCKET", raising=False)
    return tmp_path / "store"


def _run_chain(start: dict) -> dict:
    """Mirror the ASL: ResultPath $.fetch, Choice on $.fetch.adapter, $.extract, $.normalise."""
    state = dict(start)
    state["fetch"] = cdsco_fetch.handler(state, None)
    if state["fetch"].get("adapter") != "cdsco_portal":
        state["extract"] = cdsco_extract.handler(state, None)
    state["normalise"] = cdsco_normalise.handler(state, None)
    return state


def test_pdf_chain_demo_sets_pdf_s3_key_url_and_pages(demo_store):
    state = _run_chain({"adapter": "cdsco_pdf"})
    fetch, extract, norm = state["fetch"], state["extract"], state["normalise"]
    assert not fetch["degraded"] and not extract["degraded"] and not norm["degraded"]
    assert fetch["pdf_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf"
    assert extract["pdf_s3_key"] == fetch["pdf_s3_key"]
    assert extract["rows_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf.rows.json"
    assert json.loads(s3.get_bytes("raw", extract["rows_s3_key"]))["rows"] == extract["rows"]
    assert norm["pdf_s3_key"] == fetch["pdf_s3_key"]
    assert norm["month"] == "JUN-2025" and norm["adapter"] == "cdsco_pdf"
    assert norm["rows_in"] == extract["rows_in"] >= 55
    assert norm["fallback_used"] == {"extract": False, "normalise": True}

    notices = dynamo.scan_all("notices")
    assert len(notices) == norm["notices_out"] >= 55
    assert {n["pdf_s3_key"] for n in notices} == {fetch["pdf_s3_key"]}
    assert {n["url"] for n in notices} == {cdsco_extract.JUNE_2025_PDF_URL}
    assert {n["adapter"] for n in notices} == {"cdsco_pdf"}
    pages = sorted({n["row_ref"]["page"] for n in notices})
    assert pages == [1, 2, 3, 4, 5, 6]
    assert all(n["row_ref"]["month"] is None for n in notices)
    assert sorted(n["row_ref"]["row"] for n in notices) == list(range(1, len(notices) + 1))
    first = min(notices, key=lambda n: n["row_ref"]["row"])
    assert first["brand"] == "Tam-Bran Pharmaceuticals Pvt. Ltd."
    assert first["row_ref"] == {"page": 1, "row": 1, "month": None}
    assert all("recall" + "ed" not in n["title"] for n in notices)


def test_portal_chain_demo_skips_extract(demo_store):
    state = _run_chain({"adapter": "cdsco_portal"})
    assert "extract" not in state
    norm = state["normalise"]
    assert norm["adapter"] == "cdsco_portal" and norm["month"] == "JUL-2026"
    assert norm["rows_in"] == norm["notices_out"] == 239
    assert norm["pdf_s3_key"] is None
    notices = dynamo.scan_all("notices")
    assert all(
        n["row_ref"] == {"page": None, "row": n["row_ref"]["row"], "month": "JUL-2026"}
        for n in notices
    )
    assert {n["url"] for n in notices} == {cdsco_normalise.PORTAL_URL}


def test_pdf_chain_live_attempts_textract_and_reuses_rows(monkeypatch):
    """DEMO_MODE=0: Extract gets pdf_s3_key from $.fetch, tries Textract, Normalise reuses rows."""
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    pdf_bytes = FIXTURE_PDF.read_bytes()
    stored: dict[str, bytes] = {}
    monkeypatch.setattr(s3, "get_bytes", lambda kind, key: stored[key])
    monkeypatch.setattr(
        s3, "put_bytes", lambda kind, key, data, ct="": stored.__setitem__(key, data) or key
    )
    monkeypatch.setattr(cdsco_fetch, "fetch_archive_pdf", lambda url: pdf_bytes)
    textract_calls: list[str] = []

    def textract(key):
        textract_calls.append(key)
        raise RuntimeError("SubscriptionRequiredException: account is on the Free plan")

    monkeypatch.setattr(cdsco_extract, "_textract_rows", textract)
    monkeypatch.setattr(cdsco_normalise, "converse_json", lambda *a, **k: None)
    put: list[dict] = []
    monkeypatch.setattr(dynamo, "put", lambda kind, item: put.append(item))

    state = _run_chain({"adapter": "cdsco_pdf"})
    fetch, extract = state["fetch"], state["extract"]
    assert textract_calls == [fetch["pdf_s3_key"]] == ["cdsco/CDSCO_NSQ_june25.pdf"]
    assert extract["engine"] == "pdfplumber" and extract["fallback_used"] is True
    assert "SubscriptionRequired" in extract["error"]

    # Normalise must consume $.extract.rows rather than extract (or download) again.
    monkeypatch.setattr(cdsco_extract, "extract_rows", lambda *a, **k: pytest.fail("re-extracted"))
    monkeypatch.setattr(
        cdsco_normalise, "fetch_bytes", lambda *a, **k: pytest.fail("re-downloaded")
    )
    put.clear()
    norm = cdsco_normalise.handler(state, None)
    assert not norm["degraded"], norm
    assert norm["fallback_used"] == {"extract": True, "normalise": True}
    assert norm["notices_out"] == len(put) >= 55
    assert {n["pdf_s3_key"] for n in put} == {fetch["pdf_s3_key"]}
    assert {n["row_ref"]["page"] for n in put} == {1, 2, 3, 4, 5, 6}


def test_normalise_falls_back_to_rows_s3_key(demo_store):
    """Payload over the inline cap: rows travel via rows_s3_key only."""
    state = {"adapter": "cdsco_pdf"}
    state["fetch"] = cdsco_fetch.handler(state, None)
    state["extract"] = cdsco_extract.handler(state, None)
    del state["extract"]["rows"], state["extract"]["row_pages"]
    norm = cdsco_normalise.handler(state, None)
    assert not norm["degraded"] and norm["notices_out"] >= 55
    assert {n["row_ref"]["page"] for n in dynamo.scan_all("notices")} == {1, 2, 3, 4, 5, 6}


def test_brand_from_manufacturer_and_gsi_lookup(demo_store):
    b = cdsco_normalise.brand_from_manufacturer
    assert (
        b("Forgo Pharmaceuticals, 27, DIC Ind Area, Barotiwala, Teh: Baddi")
        == "Forgo Pharmaceuticals"
    )
    assert (
        b("M/s. Tam-Bran Pharmaceuticals Pvt. Ltd., Plot No. 212, HSIIDC")
        == "Tam-Bran Pharmaceuticals Pvt. Ltd."
    )
    assert b("ION Healthcare Pvt. Ltd.Baddi- Barotiwala Road Baddi") == "ION Healthcare Pvt. Ltd."
    assert b("Asian Pharma Khasra No. 105-106 village Katha Baddi 173205 HP") == "Asian Pharma"
    assert b("MODI ANTIBIOTICS Plot No-28 G.I.D.C. Estate Odhav") == "MODI ANTIBIOTICS"
    assert b("Finecure Pharmaceuticals Ltd.  PF-5 & 6, Sanand") == "Finecure Pharmaceuticals Ltd."
    assert b("Windlas Biotech Limited, Dehradun") == "Windlas Biotech Limited"
    assert b("") == ""

    out = cdsco_normalise.handler({}, None)
    assert out["notices_out"] == 239
    hits = dynamo.query_brand("forgo pharmaceuticals")
    assert any("FT5427" in n["batches"] for n in hits), hits
    assert b("Magic of Herbs Magic of Herbs Haryana-133001") == "Magic of Herbs Magic of Herbs"
    # no notice keeps a street address / PIN code in brand_lc
    assert not [
        n["brand_lc"] for n in dynamo.scan_all("notices") if re.search(r"\d{6}", n["brand_lc"])
    ]


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
import cdsco_extract, cdsco_fetch, cdsco_normalise
state = {{"adapter": "cdsco_pdf"}}
state["fetch"] = cdsco_fetch.handler(state, None)
state["extract"] = cdsco_extract.handler(state, None)
state["normalise"] = cdsco_normalise.handler(state, None)
fetch = {{"adapter": "cdsco_portal", "month": "JUL-2026"}}
portal = cdsco_normalise.handler({{"fetch": fetch}}, None)
print(json.dumps({{"pdf": state["normalise"], "portal": portal}}))
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
    assert (
        out["pdf"]["notices_out"] >= 55 and out["pdf"]["pdf_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf"
    )
    assert not out["portal"]["degraded"] and out["portal"]["notices_out"] == 239
