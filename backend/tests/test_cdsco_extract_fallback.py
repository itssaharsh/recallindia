"""cdsco_extract: pdfplumber path on the real fixture, Textract block reconstruction with
bounding boxes, and the Textract → pdfplumber fallback (any exception or < 5 rows)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from common import s3
from common.ingest_runs import read_run
from ingest import cdsco_extract

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "cdsco" / "nsq_latest.pdf"
# 6 pages, one 8-column table per page (page 6 also has a 1-column footnote table): a header
# plus 57 data rows with 8 cells, 55 of which carry an S.No and 2 are wrapped manufacturer
# address continuations (page 5 and page 6) that common.cdsco merges into the previous row.
DATA_ROWS = 57


@pytest.fixture(scope="module")
def pdf_bytes() -> bytes:
    return FIXTURE.read_bytes()


def _assert_bbox(bbox: dict) -> None:
    assert set(bbox) == {"left", "top", "width", "height"}
    assert 0 <= bbox["left"] < bbox["left"] + bbox["width"] <= 1
    assert 0 <= bbox["top"] < bbox["top"] + bbox["height"] <= 1


# --------------------------------------------------------------------------- pdfplumber
def test_demo_mode_uses_pdfplumber_directly(monkeypatch, pdf_bytes):
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")

    def boom(_key, **kw):
        raise AssertionError("Textract must not be called in DEMO_MODE")

    monkeypatch.setattr(cdsco_extract, "_textract_rows", boom)
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["method"] == "pdfplumber"
    assert out["fallback_used"] is False and out["error"] is None and out["textract"] is None
    assert out["pages"] == 6
    header = out["header"]
    assert len(header) == 8 and header[0].startswith("S.No") and "Batch" in header[2]
    rows = out["rows"]
    assert len(rows) == DATA_ROWS
    assert [r["row"] for r in rows] == list(range(1, DATA_ROWS + 1))
    for r in rows:
        assert len(r["cells"]) == 8
        assert 1 <= r["page"] <= 6
        _assert_bbox(r["bbox"])
    assert sorted({r["page"] for r in rows}) == [1, 2, 3, 4, 5, 6]
    assert not any(cdsco_extract._is_header(r["cells"]) for r in rows)  # repeated headers gone
    assert rows[0]["cells"][0] == "1." and rows[0]["cells"][2] == "1-3098"
    assert rows[-1]["cells"][0] == "55."
    assert sum(1 for r in rows if r["cells"][0]) == 55  # 2 continuation rows have no S.No
    # rows on one page are stacked top to bottom
    page1 = [r["bbox"]["top"] for r in rows if r["page"] == 1]
    assert page1 == sorted(page1)


def test_no_s3_key_or_no_bucket_skips_textract(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    monkeypatch.setattr(cdsco_extract, "_textract_rows", lambda *a, **k: pytest.fail("called"))
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key=None)
    assert out["method"] == "pdfplumber" and out["fallback_used"] is False
    monkeypatch.delenv("RAW_BUCKET")
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["method"] == "pdfplumber" and out["fallback_used"] is False


# --------------------------------------------------------------------------- fallback
class _SubscriptionRequiredException(Exception):
    pass


class _BlockedTextract:
    """boto3 Textract client double for the Free plan: every call is refused."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def start_document_analysis(self, **kw):
        self.calls.append(kw)
        raise _SubscriptionRequiredException(
            "An error occurred (SubscriptionRequiredException) when calling the "
            "StartDocumentAnalysis operation: The AWS Access Key Id needs a subscription"
        )


def test_textract_client_exception_falls_back(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    client = _BlockedTextract()
    monkeypatch.setattr(cdsco_extract, "_textract_client", lambda: client)
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert client.calls[0]["DocumentLocation"] == {
        "S3Object": {"Bucket": "recallindia-raw", "Name": "cdsco/nsq_latest.pdf"}
    }
    assert client.calls[0]["FeatureTypes"] == ["TABLES"]
    assert out["fallback_used"] is True and out["method"] == "pdfplumber"
    assert "SubscriptionRequired" in out["error"]
    assert len(out["rows"]) == DATA_ROWS and out["pages"] == 6
    assert out["textract"] is None


def test_textract_rows_double_with_one_arg_still_falls_back(monkeypatch, pdf_bytes):
    """A one-argument monkeypatch of ``_textract_rows`` (older tests) keeps working."""
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")

    def boom(_key):
        raise RuntimeError("SubscriptionRequiredException: needs a subscription for the service")

    monkeypatch.setattr(cdsco_extract, "_textract_rows", boom)
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["fallback_used"] is True and out["method"] == "pdfplumber"
    assert "SubscriptionRequired" in out["error"]


def test_textract_too_few_rows_falls_back(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    few = {
        "header": ["S.No", "P"],
        "rows": [{"page": 1, "row": i, "cells": [str(i), "x"], "bbox": None} for i in (1, 2)],
        "textract": {"job_id": "j", "status": "SUCCEEDED", "polls": 1, "elapsed_s": 3, "pages": 6},
    }
    monkeypatch.setattr(cdsco_extract, "_textract_rows", lambda _k, on_progress=None: few)
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["fallback_used"] is True and out["method"] == "pdfplumber"
    assert "2 rows" in out["error"]
    assert out["textract"]["job_id"] == "j"  # the attempt is still reported
    assert len(out["rows"]) == DATA_ROWS


def test_textract_enough_rows_is_primary(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    rows = [{"page": 1, "row": i, "cells": [str(i)] * 8, "bbox": None} for i in range(1, 7)]
    got = {
        "header": ["S.No", "P", "B", "M", "E", "By", "R", "L"],
        "rows": rows,
        "textract": {"job_id": "j", "status": "SUCCEEDED", "polls": 2, "elapsed_s": 4, "pages": 6},
    }
    seen: list[dict] = []

    def fake(_key, on_progress=None):
        if on_progress:
            on_progress(got["textract"])
            seen.append(got["textract"])
        return got

    monkeypatch.setattr(cdsco_extract, "_textract_rows", fake)
    out = cdsco_extract.extract_rows(
        pdf_bytes, s3_key="cdsco/nsq_latest.pdf", on_progress=lambda p: seen.append(p)
    )
    assert out["method"] == "textract" and out["fallback_used"] is False
    assert out["rows"] == rows and out["pages"] == 6 and out["error"] is None
    assert out["textract"]["polls"] == 2 and len(seen) == 2


# --------------------------------------------------------------------------- Textract blocks
def _blocks(rows: int = 3, cols: int = 3, page: int = 2) -> list[dict]:
    """One TABLE with ``rows`` x ``cols`` CELLs (first row a header), WORD children + geometry."""
    blocks: list[dict] = []
    cells: list[dict] = []
    header = ["S.No", "Product", "Batch No."]
    n = 0
    for r in range(1, rows + 1):
        for c in range(1, cols + 1):
            n += 1
            text = header[c - 1] if r == 1 else f"r{r}c{c}"
            word = {"Id": f"w{n}", "BlockType": "WORD", "Text": text, "Page": page}
            cell = {
                "Id": f"c{n}",
                "BlockType": "CELL",
                "Page": page,
                "RowIndex": r,
                "ColumnIndex": c,
                "Geometry": {
                    "BoundingBox": {
                        "Left": 0.1 + 0.2 * (c - 1),
                        "Top": 0.1 + 0.1 * (r - 1),
                        "Width": 0.2,
                        "Height": 0.1,
                    }
                },
                "Relationships": [{"Type": "CHILD", "Ids": [word["Id"]]}],
            }
            blocks.append(word)
            cells.append(cell)
    blocks.extend(cells)
    blocks.append(
        {
            "Id": "t1",
            "BlockType": "TABLE",
            "Page": page,
            "Geometry": {"BoundingBox": {"Left": 0.1, "Top": 0.1, "Width": 0.6, "Height": 0.3}},
            "Relationships": [{"Type": "CHILD", "Ids": [c["Id"] for c in cells]}],
        }
    )
    return blocks


def test_rows_from_blocks_with_bbox_unions_cells_and_keeps_page():
    header, rows = cdsco_extract.rows_from_blocks_with_bbox(_blocks())
    assert header == ["S.No", "Product", "Batch No."]
    assert [r["row"] for r in rows] == [1, 2]
    assert [r["cells"] for r in rows] == [["r2c1", "r2c2", "r2c3"], ["r3c1", "r3c2", "r3c3"]]
    assert all(r["page"] == 2 for r in rows)
    assert rows[0]["bbox"] == {"left": 0.1, "top": 0.2, "width": 0.6, "height": 0.1}
    assert rows[1]["bbox"] == {"left": 0.1, "top": 0.3, "width": 0.6, "height": 0.1}
    for r in rows:
        _assert_bbox(r["bbox"])
    # legacy shape: header first, page per row
    legacy_rows, pages = cdsco_extract.rows_and_pages_from_blocks(_blocks())
    assert legacy_rows[0] == header and len(legacy_rows) == 3 and pages == [2, 2, 2]
    assert cdsco_extract.rows_from_blocks(_blocks()) == legacy_rows


def test_rows_from_blocks_numbers_across_tables_and_drops_repeated_headers():
    first = _blocks(rows=3, page=1)
    second = _blocks(rows=4, page=2)
    for b in second:  # unique ids for the second table
        b["Id"] = "p2" + b["Id"]
        for rel in b.get("Relationships", []):
            rel["Ids"] = ["p2" + i for i in rel["Ids"]]
    header, rows = cdsco_extract.rows_from_blocks_with_bbox(second + first)  # any block order
    assert header[0] == "S.No"
    assert [(r["page"], r["row"]) for r in rows] == [(1, 1), (1, 2), (2, 3), (2, 4), (2, 5)]


def test_textract_polls_with_backoff_and_reports_progress(monkeypatch):
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    sleeps: list[float] = []
    monkeypatch.setattr(cdsco_extract, "_sleep", lambda s: sleeps.append(s))

    class Client:
        def __init__(self):
            self.n = 0

        def start_document_analysis(self, **kw):
            return {"JobId": "job-1"}

        def get_document_analysis(self, **kw):
            self.n += 1
            if self.n < 4:
                return {"JobStatus": "IN_PROGRESS"}
            return {
                "JobStatus": "SUCCEEDED",
                "DocumentMetadata": {"Pages": 2},
                "Blocks": _blocks(rows=7),
            }

    monkeypatch.setattr(cdsco_extract, "_textract_client", lambda: Client())
    progress: list[dict] = []
    out = cdsco_extract._textract_rows("cdsco/x.pdf", on_progress=progress.append)
    assert sleeps == [3.0, 4.5, 6.75]
    assert [p["status"] for p in progress] == ["IN_PROGRESS"] * 3 + ["SUCCEEDED"]
    assert progress[-1]["polls"] == 4 and progress[-1]["pages"] == 2
    assert out["textract"]["job_id"] == "job-1" and len(out["rows"]) == 6
    assert out["header"] == ["S.No", "Product", "Batch No."]


def test_textract_failed_job_raises(monkeypatch):
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")

    class Client:
        def start_document_analysis(self, **kw):
            return {"JobId": "job-2"}

        def get_document_analysis(self, **kw):
            return {"JobStatus": "FAILED", "StatusMessage": "unsupported document"}

    monkeypatch.setattr(cdsco_extract, "_textract_client", lambda: Client())
    with pytest.raises(RuntimeError, match="job-2 FAILED"):
        cdsco_extract._textract_rows("cdsco/x.pdf")


# --------------------------------------------------------------------------- handler
def test_handler_demo_persists_rows_json_and_run_record():
    arn = "arn:aws:states:ap-south-1:123456789012:execution:recallindia-ingest:run-1"
    out = cdsco_extract.handler({"run": {"execution_arn": arn}}, None)
    assert not out["degraded"], out
    assert out["adapter"] == "cdsco_pdf" and out["method"] == "pdfplumber"
    assert out["fallback_used"] is False and out["textract"] is None and out["error"] is None
    assert out["rows_in"] == DATA_ROWS and out["pages"] == 6
    assert out["pdf_url"] == cdsco_extract.JUNE_2025_PDF_URL and out["pdf_s3_key"] is None
    assert out["run_id"] == "run-1"
    assert len(out["header"]) == 8 and len(out["rows"]) == DATA_ROWS
    assert "engine" not in out

    stored = json.loads(s3.get_bytes("raw", out["rows_s3_key"]))
    assert out["rows_s3_key"].startswith("cdsco/rows/") and out["rows_s3_key"].endswith(".json")
    assert stored["rows"] == out["rows"] and stored["header"] == out["header"]
    assert stored["method"] == "pdfplumber" and stored["pages"] == 6

    run = read_run("run-1")
    assert run["pk"] == "ingest#run-1" and run["execution_arn"] == arn
    assert run["step"] == "extract" and run["status"] == "done"
    assert run["rows_in"] == DATA_ROWS and run["rows_s3_key"] == out["rows_s3_key"]
    assert run["method"] == "pdfplumber" and run["pages"] == 6
    assert "published_at" not in run


def test_handler_reads_pdf_s3_key_from_fetch_result():
    from ingest import cdsco_fetch

    state = {"adapter": "cdsco_pdf"}
    state["fetch"] = cdsco_fetch.handler(state, None)
    out = cdsco_extract.handler(state, None)
    assert not out["degraded"], out
    assert out["pdf_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf"
    assert out["rows_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf.rows.json"
    assert out["month"] == "JUN-2025" and out["pdf_url"] == state["fetch"]["pdf_url"]
    assert json.loads(s3.get_bytes("raw", out["rows_s3_key"]))["pdf_s3_key"] == out["pdf_s3_key"]
    assert out["rows_in"] == DATA_ROWS


def test_handler_inlines_rows_only_under_cap(monkeypatch):
    monkeypatch.setattr(cdsco_extract, "MAX_INLINE_ROWS_BYTES", 10)
    out = cdsco_extract.handler({}, None)
    assert not out["degraded"] and "rows" not in out
    assert out["rows_in"] == DATA_ROWS and out["rows_s3_key"]


def test_handler_degrades_on_upstream_failure(monkeypatch):
    def boom(url, **kw):
        raise RuntimeError("cdsco.gov.in unreachable")

    monkeypatch.setattr(cdsco_extract, "fetch_bytes", boom)
    out = cdsco_extract.handler({"run": {"execution_arn": "arn:x:execution:sm:run-bad"}}, None)
    assert out["degraded"] is True and "unreachable" in out["error"]
    run = read_run("run-bad")
    assert run["step"] == "extract" and run["status"] == "failed"
    assert "unreachable" in run["error"]


def test_handler_refuses_a_degraded_or_empty_fetch(monkeypatch):
    """Inside the state machine the default June 2025 URL is never a fallback."""
    monkeypatch.setattr(cdsco_extract, "fetch_bytes", lambda *a, **k: pytest.fail("downloaded"))
    arn = "arn:x:execution:sm:run-degraded-fetch"
    state = {
        "run": {"execution_arn": arn},
        "fetch": {"adapter": "cdsco_pdf", "degraded": True, "error": "UpstreamError: timeout"},
    }
    out = cdsco_extract.handler(state, None)
    assert out["degraded"] is True and out["error"] == "fetch degraded: UpstreamError: timeout"
    assert out["pdf_url"] is None and out["pdf_s3_key"] is None and "rows" not in out
    run = read_run("run-degraded-fetch")
    assert run["step"] == "extract" and run["status"] == "failed" and "timeout" in run["error"]

    out = cdsco_extract.handler({"fetch": {"adapter": "cdsco_pdf", "degraded": False}}, None)
    assert out["degraded"] is True and "neither pdf_s3_key nor pdf_url" in out["error"]
    # a top-level pdf_url (direct invoke through the machine) still works
    monkeypatch.setattr(cdsco_extract, "fetch_bytes", lambda url, **k: FIXTURE.read_bytes())
    ok = cdsco_extract.handler(
        {"fetch": {"adapter": "cdsco_pdf"}, "pdf_url": "https://cdsco.gov.in/x.pdf"}, None
    )
    assert not ok["degraded"] and ok["rows_in"] == DATA_ROWS


def test_pipeline_event_top_level_wins():
    ev = cdsco_extract.pipeline_event(
        {"fetch": {"pdf_s3_key": "a", "month": "JUN-2025", "degraded": False}, "month": "MAY-2025"},
        "fetch",
    )
    assert ev == {"pdf_s3_key": "a", "month": "MAY-2025"}
