"""CDSCO NSQ fetch — both adapters (SPEC §Sources, §Ingest pipeline; completed in P03).

* ``cdsco_portal`` (live, 2019→now): cdscoonline.gov.in DataTables GET JSON
  endpoints. ``reportingYears`` → ``publicReportingMonths`` → newest month
  (``MON-YYYY``) → ``filteredNsqDrugTable`` → ``aaData`` rows. Skips extract.
* ``cdsco_pdf`` (archive 2010–Jun 2025 + the ``/ingest`` hero): downloads the
  alert PDF and stores it in the raw bucket for ``cdsco_extract``.

Every network call goes through ``common.demo_mode`` (fixtures in DEMO_MODE).
P03 adds the archive listing scrape (``download_file_division.jsp`` → iframe)
and the ``meta#cdsco`` record.
"""

from __future__ import annotations

import posixpath
import re
import time
from urllib.parse import unquote, urlsplit

from common import s3
from common.demo_mode import fetch_bytes, fetch_json

SOURCE = "cdsco_nsq"
PORTAL_BASE = "https://cdscoonline.gov.in/CDSCO"
JUNE_2025_PDF_URL = (
    "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/"
    "CDSCO%20NSQ%20june25.pdf"
)
_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def _month_index(name: str) -> int:
    key = str(name).strip()[:3].upper()
    return _MONTHS.index(key) if key in _MONTHS else -1


def newest_month() -> str:
    """Resolve the newest reporting month on the portal as ``MON-YYYY`` (3-letter upper)."""
    years = fetch_json(f"{PORTAL_BASE}/reportingYears?tab=nsq")
    year = max(int(y) for y in years if str(y).strip().isdigit())
    months = fetch_json(f"{PORTAL_BASE}/publicReportingMonths?year={year}&tab=nsq")
    valid = [m for m in months if _month_index(m) >= 0]
    if not valid:
        raise ValueError(f"no reporting months for {year}: {months!r}")
    newest = max(valid, key=_month_index)
    return f"{_MONTHS[_month_index(newest)]}-{year}"


def fetch_portal_rows(month: str | None = None) -> list[dict]:
    """Rows (``aaData``) for ``month`` (``MON-YYYY``); newest month when None."""
    month = (month or newest_month()).upper()
    payload = fetch_json(f"{PORTAL_BASE}/filteredNsqDrugTable?month={month}&source=All&tab=nsq")
    rows = payload.get("aaData", []) if isinstance(payload, dict) else payload
    return [r for r in rows if isinstance(r, dict)]


def fetch_archive_pdf(url: str) -> bytes:
    """Download an archive alert PDF (fixture ``cdsco/nsq_latest.pdf`` in DEMO_MODE)."""
    return fetch_bytes(url)


def pdf_key_for(url: str) -> str:
    """``cdsco/<basename>`` with the URL-decoded basename, whitespace → ``_``."""
    name = posixpath.basename(unquote(urlsplit(url).path)) or "nsq_latest.pdf"
    return "cdsco/" + re.sub(r"\s+", "_", name)


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    event = event or {}
    adapter = str(event.get("adapter", "portal")).removeprefix("cdsco_")
    try:
        if adapter == "pdf":
            url = event.get("pdf_url") or JUNE_2025_PDF_URL
            data = fetch_archive_pdf(url)
            key = s3.put_bytes("raw", pdf_key_for(url), data, "application/pdf")
            return {
                "source": SOURCE,
                "adapter": "cdsco_pdf",
                "pdf_url": url,
                "pdf_s3_key": key,
                "bytes": len(data),
                "degraded": False,
                "took_ms": int((time.monotonic() - t0) * 1000),
            }
        month = event.get("month") or newest_month()
        rows = fetch_portal_rows(month)
        return {
            "source": SOURCE,
            "adapter": "cdsco_portal",
            "month": month.upper(),
            "rows_in": len(rows),
            "degraded": False,
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
    except Exception as exc:  # never raise on upstream failure
        return {
            "source": SOURCE,
            "adapter": f"cdsco_{adapter}",
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
