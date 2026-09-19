"""cdsco_fetch archive adapter: listing parse, jsp → PDF resolution, target choice, handler."""

from __future__ import annotations

from pathlib import Path

import pytest

from common import demo_mode
from common.notices import read_meta, write_meta
from ingest import cdsco_fetch

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "cdsco"
JUNE_PDF = (
    "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/"
    "CDSCO%20NSQ%20june25.pdf"
)
JUNE_JSP = (
    "https://cdsco.gov.in/opencms/opencms/system/modules/CDSCO.WEB/elements/"
    "download_file_division.jsp?num_id=MTI5Mjc="
)


@pytest.fixture(scope="module")
def entries() -> list[cdsco_fetch.ArchiveEntry]:
    return cdsco_fetch.parse_listing((FIXTURES / "alerts_listing.html").read_bytes())


def _by_title(entries, title):
    return next(e for e in entries if e.title == title)


# --------------------------------------------------------------------------- parse_listing
def test_parse_listing_counts(entries):
    # 301 <tr> in the page: 300 alert rows + the <th> header row (no download link)
    assert len(entries) == 300
    assert sum(1 for e in entries if cdsco_fetch._NSQ_WORDS.search(e.title)) >= 37
    monthly = [e for e in entries if e.kind == "monthly"]
    assert len(monthly) >= 25
    assert all(e.month and e.jsp_url.startswith("https://cdsco.gov.in/") for e in monthly)
    assert all(e.date[:4].isdigit() and len(e.date) == 10 for e in entries)
    assert {e.kind for e in entries} == {"monthly", "other"}
    assert {e.lab_scope for e in entries} <= {"cdsco", "state"}


def test_parse_listing_newest_cdsco_monthly_is_june_2025(entries):
    monthly_cdsco = [e for e in entries if e.kind == "monthly" and e.lab_scope == "cdsco"]
    newest = max(monthly_cdsco, key=lambda e: e.date)
    assert newest.title == "CDSCO NSQ ALERT FOR THE MONTH OF June 2025"
    assert newest.num_id == "MTI5Mjc="
    assert newest.month == "JUN-2025"
    assert newest.date == "2025-07-18"
    assert newest.lab_scope == "cdsco"
    assert newest.jsp_url == JUNE_JSP
    assert newest.size == "185 KB"
    assert newest.as_dict()["num_id"] == "MTI5Mjc="


def test_parse_listing_title_shapes(entries):
    state = _by_title(entries, "STATE NSQ ALERT FOR THE MONTH OF June 2025")
    assert (state.lab_scope, state.kind, state.month) == ("state", "monthly", "JUN-2025")
    may24 = _by_title(entries, "NSQ May 2024 CDSCO Labs")
    assert (may24.kind, may24.month, may24.lab_scope) == ("monthly", "MAY-2024", "cdsco")
    may24_state = _by_title(entries, "NSQ May 2024 State Labs")
    assert (may24_state.kind, may24_state.lab_scope) == ("monthly", "state")
    assert _by_title(entries, "NSQ ALERT FOR THE MONTH OF JUlY-2024").month == "JUL-2024"
    assert _by_title(entries, "Samples declared NSQ 2017-2023").kind == "other"
    assert (
        _by_title(
            entries, "Availability of Not Standard Quality (NSQ) Alert on New Link in CDSCO Website"
        ).kind
        == "other"
    )
    assert _by_title(entries, "Revise list drug alert May-2025").kind == "other"


def test_parse_listing_tolerates_quoting_and_whitespace():
    html = """
    <table><tr><th>No</th><th>Title</th><th>Date</th><th>Download</th><th>Size</th></tr>
    <TR class="odd">
      <td> 1 </td>
      <td> NSQ ALERT FOR THE MONTH OF MAY&#45;2025 </td>
      <td>2025-Jun-20</td>
      <td><a href="/opencms/x/download_file_division.jsp?num_id=MTI4NDc=">x</a></td>
      <td>10 KB</td>
    </TR>
    <tr><td>2</td><td>Other</td><td>2025-Jun-20</td>
      <td><a href=/opencms/x/download_file_division.jsp?num_id=QUJD>x</a></td>
      <td>1 KB</td></tr>
    </table>
    """
    out = cdsco_fetch.parse_listing(html)
    assert [e.num_id for e in out] == ["MTI4NDc=", "QUJD"]
    assert out[0].title == "NSQ ALERT FOR THE MONTH OF MAY-2025"
    assert out[0].month == "MAY-2025" and out[0].kind == "monthly"
    assert out[0].date == "2025-06-20"
    assert out[1].kind == "other" and out[1].month is None


# --------------------------------------------------------------------------- resolve / download
def test_resolve_pdf_url_from_jsp_fixture():
    assert cdsco_fetch.resolve_pdf_url(JUNE_JSP) == JUNE_PDF


def test_resolve_pdf_url_keeps_encoded_and_pdf_bodies(monkeypatch):
    monkeypatch.setattr(
        cdsco_fetch,
        "fetch_bytes",
        lambda url, **kw: b'<iframe src="/opencms/x/A%20B.pdf" width="100%"></iframe>',
    )
    assert cdsco_fetch.resolve_pdf_url("https://cdsco.gov.in/j.jsp?num_id=1") == (
        "https://cdsco.gov.in/opencms/x/A%20B.pdf"
    )
    monkeypatch.setattr(cdsco_fetch, "fetch_bytes", lambda url, **kw: b"%PDF-1.4 ...")
    assert cdsco_fetch.resolve_pdf_url("https://cdsco.gov.in/direct.pdf") == (
        "https://cdsco.gov.in/direct.pdf"
    )


def test_download_pdf_key_and_reuse():
    key, data = cdsco_fetch.download_pdf(JUNE_PDF)
    assert key == "cdsco/CDSCO_NSQ_june25.pdf" and len(data) == 188_795
    assert cdsco_fetch.pdf_key_for(JUNE_PDF) == key
    ingested = [{"pdf_url": JUNE_PDF, "pdf_s3_key": key, "num_id": "MTI5Mjc="}]
    assert cdsco_fetch.download_pdf(JUNE_PDF, ingested=ingested) == (key, b"")
    key2, data2 = cdsco_fetch.download_pdf(JUNE_PDF, ingested=ingested, force=True)
    assert key2 == key and len(data2) == 188_795


def test_pdf_key_for_sanitises_every_archive_filename():
    """Whatever the archive names a file, the key must pass GET /ingest/pdf's cdsco/<file>.pdf."""
    from api.ingest_api import PDF_KEY_RE

    base = "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/"
    cases = {
        "CDSCO%20NSQ%20june25.pdf": "cdsco/CDSCO_NSQ_june25.pdf",
        "NSQ%20Alert%20(Revised)%20May-2025.pdf": "cdsco/NSQ_Alert_Revised_May-2025.pdf",
        "NSQ&Spurious%20June25.pdf": "cdsco/NSQ_Spurious_June25.pdf",
        "State%20NSQ%20Alert's%20April'25.PDF": "cdsco/State_NSQ_Alert_s_April_25.pdf",
        "NSQ%20%E2%80%93%20March.pdf": "cdsco/NSQ_March.pdf",
    }
    for name, key in cases.items():
        assert cdsco_fetch.pdf_key_for(base + name) == key, name
        assert PDF_KEY_RE.match(key), key


# --------------------------------------------------------------------------- pick_target
def test_pick_target_newest_skips_ingested_and_honours_force(entries):
    target, is_new = cdsco_fetch.pick_target(entries, ingested=[])
    assert target.num_id == "MTI5Mjc=" and is_new is True
    ingested = [{"num_id": "MTI5Mjc=", "pdf_url": JUNE_PDF}]
    target, is_new = cdsco_fetch.pick_target(entries, ingested=ingested)
    assert target.num_id == "MTI4NDc=" and target.month == "MAY-2025" and is_new is True
    target, is_new = cdsco_fetch.pick_target(entries, ingested=ingested, force=True)
    assert target.num_id == "MTI5Mjc=" and is_new is True
    # every cdsco monthly ingested -> newest again, flagged not new
    everything = [{"num_id": e.num_id} for e in entries]
    target, is_new = cdsco_fetch.pick_target(entries, ingested=everything)
    assert target.num_id == "MTI5Mjc=" and is_new is False


def test_pick_target_lab_scope_month_and_pdf_url(entries):
    target, _ = cdsco_fetch.pick_target(entries, lab_scope="state", ingested=[])
    assert target.title == "STATE NSQ ALERT FOR THE MONTH OF June 2025"
    target, _ = cdsco_fetch.pick_target(entries, month="MAY-2024", ingested=[])
    assert target.title == "NSQ May 2024 CDSCO Labs"
    target, _ = cdsco_fetch.pick_target(entries, month="May 2024", lab_scope="state", ingested=[])
    assert target.title == "NSQ May 2024 State Labs"
    assert cdsco_fetch.pick_target(entries, month="DEC-1999", ingested=[]) == (None, False)

    # explicit pdf_url bypasses the listing; the ingested record links it back to its entry
    target, is_new = cdsco_fetch.pick_target(entries, pdf_url=JUNE_PDF, ingested=[])
    assert target.title == "CDSCO NSQ june25.pdf" and target.kind == "other" and is_new
    ingested = [{"num_id": "MTI5Mjc=", "pdf_url": JUNE_PDF}]
    target, is_new = cdsco_fetch.pick_target(entries, pdf_url=JUNE_PDF, ingested=ingested)
    assert target.num_id == "MTI5Mjc=" and target.month == "JUN-2025" and is_new is False
    target, _ = cdsco_fetch.pick_target([], pdf_url="https://x/y/NSQ-March-2024.pdf", ingested=[])
    assert target.month == "MAR-2024"


# --------------------------------------------------------------------------- handler
def test_handler_demo_downloads_june_2025_and_writes_meta():
    out = cdsco_fetch.handler({}, None)
    assert not out["degraded"], out
    assert out["source"] == "cdsco_nsq" and out["adapter"] == "cdsco_pdf"
    assert out["pdf_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf"
    assert out["pdf_url"] == JUNE_PDF
    assert out["month"] == "JUN-2025" and out["lab_scope"] == "cdsco"
    assert out["title"] == "CDSCO NSQ ALERT FOR THE MONTH OF June 2025"
    assert out["num_id"] == "MTI5Mjc="
    assert out["is_new"] is True and out["reused"] is False
    assert out["bytes"] == 188_795
    assert out["listing_count"] == 300 and out["monthly_count"] >= 25

    assert out["counts"] == {"listed": 300, "monthly": out["monthly_count"], "downloaded": 1}

    meta = read_meta("cdsco_pdf")
    assert meta["pk"] == "meta#cdsco_pdf" and meta["degraded"] is False
    assert meta["last_success_at"]
    assert meta["last_counts"] is None  # publish counts only; nothing published yet
    assert meta["last_fetch"]["counts"] == out["counts"]
    assert 25 <= len(meta["listing"]) <= 40
    assert all(e["kind"] == "monthly" for e in meta["listing"])
    assert meta["last_fetch"]["num_id"] == "MTI5Mjc=" and meta["last_fetch"]["is_new"] is True
    assert meta["ingested"] == []


def test_handler_second_run_after_ingested_is_not_new_unless_forced():
    first = cdsco_fetch.handler({}, None)
    previous = read_meta("cdsco_pdf")
    write_meta(
        "cdsco_pdf",
        ok=True,
        counts={"created": 55, "unchanged": 0},  # what Publish stores
        extra={
            "listing": previous["listing"],
            "last_fetch": previous["last_fetch"],
            "ingested": [
                {
                    "num_id": first["num_id"],
                    "pdf_url": first["pdf_url"],
                    "pdf_s3_key": first["pdf_s3_key"],
                    "month": first["month"],
                }
            ],
        },
    )
    # the newest not-yet-ingested cdsco monthly is May 2025 (same fixture PDF in demo)
    second = cdsco_fetch.handler({}, None)
    assert not second["degraded"] and second["is_new"] is True
    assert second["month"] == "MAY-2025" and second["num_id"] == "MTI4NDc="

    same = cdsco_fetch.handler({"month": "JUN-2025"}, None)
    assert not same["degraded"] and same["is_new"] is False
    assert same["reused"] is True and same["bytes"] == 0
    assert same["pdf_s3_key"] == first["pdf_s3_key"] and same["counts"]["downloaded"] == 0
    meta = read_meta("cdsco_pdf")
    assert meta["ingested"][0]["num_id"] == "MTI5Mjc="  # kept
    assert meta["last_counts"] == {"created": 55, "unchanged": 0}  # publish counts kept

    forced = cdsco_fetch.handler({"month": "JUN-2025", "force": True}, None)
    assert not forced["degraded"] and forced["is_new"] is True
    assert forced["reused"] is False and forced["bytes"] == 188_795
    assert forced["num_id"] == "MTI5Mjc="


def test_handler_pdf_url_and_state_scope():
    out = cdsco_fetch.handler({"pdf_url": JUNE_PDF, "month": "June 2025"}, None)
    assert not out["degraded"] and out["pdf_url"] == JUNE_PDF
    assert out["month"] == "JUN-2025" and out["pdf_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf"
    out = cdsco_fetch.handler({"lab_scope": "state"}, None)
    assert not out["degraded"] and out["lab_scope"] == "state"
    assert out["title"] == "STATE NSQ ALERT FOR THE MONTH OF June 2025"


def test_handler_upstream_failure_degrades_and_keeps_last_success(monkeypatch):
    ok = cdsco_fetch.handler({}, None)
    assert not ok["degraded"]
    before = read_meta("cdsco_pdf")

    def boom(url, **kw):
        raise demo_mode.UpstreamError(f"{url}: timed out")

    monkeypatch.setattr(cdsco_fetch, "fetch_bytes", boom)
    out = cdsco_fetch.handler({}, None)
    assert out["degraded"] is True and out["adapter"] == "cdsco_pdf"
    assert "UpstreamError" in out["error"] and "timed out" in out["error"]
    meta = read_meta("cdsco_pdf")
    assert meta["degraded"] is True and meta["last_error"] == out["error"]
    assert meta["last_success_at"] == before["last_success_at"]
    assert meta["listing"] == before["listing"] and meta["last_fetch"] == before["last_fetch"]


def test_handler_records_run_step_and_portal_adapter_still_works():
    from common.ingest_runs import read_run

    arn = "arn:aws:states:ap-south-1:1:execution:recallindia-ingest:fetch-run-1"
    out = cdsco_fetch.handler({"run": {"execution_arn": arn}}, None)
    assert not out["degraded"]
    run = read_run("fetch-run-1")
    assert run["step"] == "fetch" and run["status"] == "done"
    assert run["pdf_s3_key"] == out["pdf_s3_key"] and run["execution_arn"] == arn

    portal = cdsco_fetch.handler({"adapter": "portal"}, None)
    assert portal["adapter"] == "cdsco_portal" and portal["month"] == "JUL-2026"
    assert portal["rows_in"] == 239 and not portal["degraded"]
