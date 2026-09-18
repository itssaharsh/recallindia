"""CDSCO NSQ fetch — both adapters (SPEC §Sources, §Ingest pipeline; completed in P03).

* ``cdsco_portal`` (live, 2019→now): cdscoonline.gov.in DataTables GET JSON
  endpoints. ``reportingYears`` → ``publicReportingMonths`` → newest month
  (``MON-YYYY``) → ``filteredNsqDrugTable`` → ``aaData`` rows. Skips extract.
* ``cdsco_pdf`` (archive 2010–Jun 2025 + the ``/ingest`` hero): downloads the
  alert PDF and stores it in the raw bucket for ``cdsco_extract``.

Every network call goes through ``common.demo_mode`` (fixtures in DEMO_MODE). The
portal client itself lives in ``common.cdsco`` (shared with the ``cdsco_portal``
poller) and is re-exported here. P03 adds the archive listing scrape
(``download_file_division.jsp`` → iframe).
"""

from __future__ import annotations

import posixpath
import re
import time
from urllib.parse import unquote, urlsplit

from common import s3
from common.cdsco import (
    JUNE_2025_PDF_URL,
    PORTAL_BASE,
    SOURCE,
    fetch_portal_rows,
    newest_month,
    reporting_months,
    reporting_years,
)
from common.demo_mode import fetch_bytes

__all__ = [
    "JUNE_2025_PDF_URL",
    "PORTAL_BASE",
    "SOURCE",
    "fetch_archive_pdf",
    "fetch_portal_rows",
    "handler",
    "newest_month",
    "pdf_key_for",
    "reporting_months",
    "reporting_years",
]


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
