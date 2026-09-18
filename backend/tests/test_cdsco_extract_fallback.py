"""cdsco_extract: pdfplumber path on the real fixture, and the Textract → pdfplumber fallback."""

from __future__ import annotations

from pathlib import Path

import pytest

from ingest import cdsco_extract

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "cdsco" / "nsq_latest.pdf"


@pytest.fixture(scope="module")
def pdf_bytes() -> bytes:
    return FIXTURE.read_bytes()


def test_demo_mode_uses_pdfplumber_directly(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")

    def boom(_key):
        raise AssertionError("Textract must not be called in DEMO_MODE")

    monkeypatch.setattr(cdsco_extract, "_textract_rows", boom)
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["engine"] == "pdfplumber"
    assert out["fallback_used"] is False and out["error"] is None
    assert out["pages"] == 6
    rows = out["rows"]
    assert len(rows) >= 55
    assert all(len(r) == 8 for r in rows)
    assert rows[0][0].startswith("S.No")
    assert "Batch" in rows[0][2]
    assert sum(1 for r in rows if r[0].startswith("S.No")) == 1  # repeated headers dropped


def test_no_s3_key_skips_textract(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    monkeypatch.setattr(cdsco_extract, "_textract_rows", lambda _k: pytest.fail("called"))
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key=None)
    assert out["engine"] == "pdfplumber" and out["fallback_used"] is False


def test_textract_exception_falls_back(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")

    def boom(_key):
        raise RuntimeError("SubscriptionRequiredException: needs a subscription for the service")

    monkeypatch.setattr(cdsco_extract, "_textract_rows", boom)
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["fallback_used"] is True
    assert out["engine"] == "pdfplumber"
    assert "SubscriptionRequired" in out["error"]
    assert len(out["rows"]) >= 55 and out["pages"] == 6


def test_textract_too_few_rows_falls_back(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    monkeypatch.setattr(cdsco_extract, "_textract_rows", lambda _k: ([["a"], ["b"]], [1, 1]))
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["fallback_used"] is True and out["engine"] == "pdfplumber"
    assert "2 rows" in out["error"]


def test_textract_enough_rows_is_primary(monkeypatch, pdf_bytes):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("RAW_BUCKET", "recallindia-raw")
    fake = [["S.No", "P", "B", "M", "E", "By", "R", "L"]] + [[str(i)] * 8 for i in range(6)]
    monkeypatch.setattr(cdsco_extract, "_textract_rows", lambda _k: (fake, [1] * len(fake)))
    out = cdsco_extract.extract_rows(pdf_bytes, s3_key="cdsco/nsq_latest.pdf")
    assert out["engine"] == "textract" and out["fallback_used"] is False
    assert out["rows"] == fake and out["pages"] == 6
    assert out["row_pages"] == [1] * len(fake)


def test_rows_from_blocks_reconstructs_grid():
    def word(i, text):
        return {"Id": f"w{i}", "BlockType": "WORD", "Text": text}

    def cell(i, r, c, words):
        return {
            "Id": f"c{i}",
            "BlockType": "CELL",
            "RowIndex": r,
            "ColumnIndex": c,
            "Relationships": [{"Type": "CHILD", "Ids": [w["Id"] for w in words]}],
        }

    w = [word(0, "S.No"), word(1, "Batch"), word(2, "1."), word(3, "AB"), word(4, "12")]
    cells = [
        cell(0, 1, 1, [w[0]]),
        cell(1, 1, 2, [w[1]]),
        cell(2, 2, 1, [w[2]]),
        cell(3, 2, 2, [w[3], w[4]]),
    ]
    table = {
        "Id": "t",
        "BlockType": "TABLE",
        "Page": 1,
        "Relationships": [{"Type": "CHILD", "Ids": [c["Id"] for c in cells]}],
    }
    rows = cdsco_extract.rows_from_blocks([table, *cells, *w])
    assert rows == [["S.No", "Batch"], ["1.", "AB 12"]]
    assert cdsco_extract.rows_and_pages_from_blocks([table, *cells, *w])[1] == [1, 1]


def test_handler_demo_reads_fixture(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "1")
    out = cdsco_extract.handler({}, None)
    assert out["adapter"] == "cdsco_pdf" and out["engine"] == "pdfplumber"
    assert out["rows_in"] >= 55 and len(out["first_rows"]) == 3
    assert len(out["rows"]) == len(out["row_pages"]) == out["rows_in"]
    assert out["row_pages"][0] == 1 and out["row_pages"][-1] == 6
    assert out["pdf_url"] == cdsco_extract.JUNE_2025_PDF_URL
