"""common.cdsco: portal month arithmetic and the shared row -> Notice mapping (MAR-2026)."""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

import pytest

from common import cdsco
from ingest import cdsco_extract, cdsco_fetch, cdsco_normalise


def test_portal_months_from_fixtures() -> None:
    assert cdsco.reporting_years() == list(range(2019, 2027))
    assert cdsco.reporting_months(2026) == [
        "JAN-2026",
        "FEB-2026",
        "MAR-2026",
        "APR-2026",
        "MAY-2026",
        "JUN-2026",
        "JUL-2026",
    ]
    assert len(cdsco.reporting_months(2025)) == 12
    assert cdsco.reporting_months(2025)[0] == "JAN-2025"
    assert cdsco.newest_month() == "JUL-2026"


def test_months_since_uses_portal_listing(monkeypatch: pytest.MonkeyPatch) -> None:
    listing = {2024: ["Nov", "Dec"], 2025: ["Jan", "Feb", "Mar"], 2026: ["Jan"]}
    monkeypatch.setattr(cdsco, "reporting_years", lambda: sorted(listing))
    monkeypatch.setattr(
        cdsco, "reporting_months", lambda y: [f"{m[:3].upper()}-{y}" for m in listing[y]]
    )
    today = dt.date(2026, 1, 20)
    assert cdsco.months_since(dt.date(2024, 12, 15), today=today) == [
        "DEC-2024",
        "JAN-2025",
        "FEB-2025",
        "MAR-2025",
        "JAN-2026",
    ]
    assert cdsco.months_since(dt.date(2025, 2, 1), today=dt.date(2025, 2, 28)) == ["FEB-2025"]
    assert cdsco.months_since(dt.date(2027, 1, 1), today=today) == []
    # "MON" only lists months the portal serves; nothing past today
    assert cdsco.months_since(dt.date(2020, 1, 1), today=dt.date(2024, 11, 30)) == ["NOV-2024"]


def test_months_since_one_year_back_in_demo() -> None:
    months = cdsco.months_since(dt.date(2025, 9, 18), today=dt.date(2026, 9, 18))
    assert months[0] == "SEP-2025" and months[-1] == "JUL-2026" and len(months) == 11


def test_mar_2026_fixture_maps_to_190_notices() -> None:
    rows = cdsco.fetch_portal_rows("MAR-2026")
    assert len(rows) == 190
    notices = cdsco.rows_to_notices(rows, adapter="portal", month="MAR-2026")
    assert len(notices) == 190
    assert all(n["batches"] and n["batches"][0] for n in notices)
    assert all(n["brand_lc"] and n["brand_lc"] == n["brand"].lower() for n in notices)
    assert all(n["published_at"] == "2026-03-01" for n in notices)
    assert all(n["adapter"] == "cdsco_portal" and n["source"] == "cdsco_nsq" for n in notices)
    assert [n["row_ref"] for n in notices[:2]] == [
        {"page": None, "row": 1, "month": "MAR-2026"},
        {"page": None, "row": 2, "month": "MAR-2026"},
    ]
    assert len({n["pk"] for n in notices}) == 190
    assert all(n["product"] for n in notices)
    first = notices[0]
    assert first["product"] == rows[0]["str_product_name"].strip()
    key = cdsco.portal_row_key(
        rows[0]["str_product_name"], rows[0]["str_batch_no"], rows[0]["str_manufactured_by"]
    )
    assert re.fullmatch(r"[0-9a-f]{12}", key)
    assert first["notice_id"] == f"MAR-2026-cdsco_portal-{key}"
    assert first["pk"] == f"cdsco_nsq#MAR-2026-cdsco_portal-{key}"
    assert first["brand"] == "Askon Healthcare" and first["batches"] == ["RB-2433"]
    assert first["url"] == cdsco.PORTAL_URL
    assert "failed CDSCO quality test, MAR-2026 alert, row 1" in first["title"]
    assert not any(re.search(r"\d{6}", n["brand_lc"]) for n in notices)
    assert not any("recall" + "ed" in n["title"].lower() for n in notices)


def test_portal_ids_survive_reordering_and_insertions() -> None:
    """The daily re-pull of the current month must keep pk per drug row, not per position."""
    rows = cdsco.fetch_portal_rows("MAR-2026")
    base = {n["pk"]: n for n in cdsco.rows_to_notices(rows, adapter="portal", month="MAR-2026")}
    inserted = [
        {**rows[5], "str_product_name": "Brand New Tablets IP 10mg", "str_batch_no": "NEW-001"},
        *reversed(rows),
    ]
    again = cdsco.rows_to_notices(inserted, adapter="portal", month="MAR-2026")
    assert set(base) <= {n["pk"] for n in again} and len(again) == 191
    for n in again[1:]:
        old = base[n["pk"]]
        assert (n["product"], n["batches"], n["brand"]) == (
            old["product"],
            old["batches"],
            old["brand"],
        )
        assert n["row_ref"]["month"] == "MAR-2026"
    moved = sum(n["row_ref"]["row"] != base[n["pk"]]["row_ref"]["row"] for n in again[1:])
    assert moved >= 189  # row_ref follows the new position (the middle row lands on itself)
    # a cosmetic edit keeps the id; an exact duplicate row gets a suffix instead of colliding
    assert cdsco.portal_row_key(" Tab  A ", "b1", "M/S X") == cdsco.portal_row_key(
        "tab a", "B1", "m/s x"
    )
    dup = cdsco.rows_to_notices([rows[0], rows[0]], adapter="portal", month="MAR-2026")
    assert dup[1]["notice_id"] == dup[0]["notice_id"] + "-2"
    # the PDF adapter keeps its positional scheme (a published file never changes)
    pdf = cdsco.rows_to_notices([list(rows[0].values())], adapter="pdf", month="JUN-2025")
    assert pdf[0]["notice_id"] == "JUN-2025-cdsco_pdf-1"


def test_ingest_modules_re_export_common_cdsco() -> None:
    assert cdsco_normalise.rows_to_notices is cdsco.rows_to_notices
    assert cdsco_normalise.brand_from_manufacturer is cdsco.brand_from_manufacturer
    assert cdsco_normalise.PORTAL_URL == cdsco.PORTAL_URL
    assert cdsco_fetch.newest_month is cdsco.newest_month
    assert cdsco_fetch.fetch_portal_rows is cdsco.fetch_portal_rows
    assert (
        cdsco_extract.JUNE_2025_PDF_URL == cdsco.JUNE_2025_PDF_URL == cdsco_fetch.JUNE_2025_PDF_URL
    )


def test_common_never_imports_ingest_or_pollers() -> None:
    """common ships as the Lambda layer; ingest/pollers are per-function CodeUris."""
    common_dir = Path(cdsco.__file__).parent
    for path in common_dir.glob("*.py"):
        src = path.read_text(encoding="utf-8")
        assert not re.search(r"^\s*(from|import)\s+(ingest|pollers)\b", src, re.M), path.name
