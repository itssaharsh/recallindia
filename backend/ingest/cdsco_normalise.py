"""CDSCO rows → Notice records (SPEC §Ingest pipeline, shared by both adapters; P03).

P01 placeholder: deterministic header-keyword mapping only. The Bedrock path
(``common.bedrock.converse_json("normalise", ...)``, Nova Lite) is wired and
attempted outside DEMO_MODE, but its result is not yet applied, so
``fallback_used.normalise`` is always ``True`` until P03.

Wording rule (CLAUDE.md): a CDSCO NSQ hit is "failed CDSCO quality test", never
anything stronger.

State-machine contract: the IngestStateMachine stores task results under
``$.fetch`` / ``$.extract``; ``handler`` reads its inputs from the top level
first and then from those nested objects. Rows arrive inline (``rows`` +
``row_pages``) or via ``rows_s3_key``; only when neither is present does this
function fetch/extract on its own.
"""

from __future__ import annotations

import json
import logging
import time

from common import cdsco, dynamo, s3
from common.bedrock import converse_json
from common.demo_mode import fetch_bytes, is_demo

try:  # local / tests: backend/ is the source root
    from ingest import cdsco_extract, cdsco_fetch
except ModuleNotFoundError:  # Lambda: CodeUri backend/ingest/ puts the siblings in /var/task
    import cdsco_extract
    import cdsco_fetch

log = logging.getLogger(__name__)

# The deterministic mapping lives in the common layer (``common.cdsco``) so the
# ``cdsco_portal`` poller shares it; the names are re-exported here for the state machine
# handler and existing tests.
SOURCE = cdsco.SOURCE
PORTAL_URL = cdsco.PORTAL_URL
HEADER_KEYWORDS = cdsco.HEADER_KEYWORDS
PDF_DEFAULT_ORDER = cdsco.PDF_DEFAULT_ORDER
PORTAL_KEYS = cdsco.PORTAL_KEYS
brand_from_manufacturer = cdsco.brand_from_manufacturer
portal_row_key = cdsco.portal_row_key
month_to_iso = cdsco.month_to_iso
header_map = cdsco.header_map
rows_to_notices = cdsco.rows_to_notices
_records = cdsco._records

__all__ = [
    "HEADER_KEYWORDS",
    "PDF_DEFAULT_ORDER",
    "PORTAL_KEYS",
    "PORTAL_URL",
    "SOURCE",
    "brand_from_manufacturer",
    "handler",
    "header_map",
    "month_to_iso",
    "portal_row_key",
    "rows_to_notices",
]


def _try_bedrock(rows: list, month: str) -> None:
    """Wired for P03: ask Nova Lite for a column mapping; result ignored in P01."""
    if is_demo():
        return
    sample = rows[:3]
    prompt = (
        "Map the columns of these CDSCO NSQ table rows to the fields product, batch, "
        "mfg_date, exp_date, brand, result, lab. Reply with one JSON object only.\n"
        f"month: {month}\nrows: {json.dumps(sample, ensure_ascii=False)[:3000]}"
    )
    converse_json("normalise", prompt, max_tokens=512)  # result applied in P03


def _rows_from_store(rows_s3_key: str | None) -> tuple[list | None, list | None]:
    """Rows mirrored by ``cdsco_extract`` (``{rows, row_pages}``); ``(None, None)`` if absent."""
    if not rows_s3_key:
        return None, None
    try:
        stored = json.loads(s3.get_bytes("raw", rows_s3_key).decode())
    except Exception as exc:  # fall through to a fresh extract
        log.warning("could not read extracted rows at %s: %s", rows_s3_key, exc)
        return None, None
    if isinstance(stored, dict) and isinstance(stored.get("rows"), list):
        return stored["rows"], stored.get("row_pages")
    return None, None


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    ev = cdsco_extract.pipeline_event(event, "fetch", "extract")
    adapter = str(ev.get("adapter", "portal")).removeprefix("cdsco_")
    extract_fallback = ev.get("fallback_used")
    if isinstance(extract_fallback, dict):
        extract_fallback = extract_fallback.get("extract")
    try:
        rows = ev.get("rows")
        row_pages = ev.get("row_pages")
        month = ev.get("month")
        pdf_s3_key = ev.get("pdf_s3_key")
        url = ev.get("url") or ""
        if rows is None and adapter == "pdf":
            rows, row_pages = _rows_from_store(ev.get("rows_s3_key"))
        if rows is None:
            if adapter == "pdf":
                pdf_bytes = (
                    s3.get_bytes("raw", pdf_s3_key)
                    if pdf_s3_key
                    else fetch_bytes(ev.get("pdf_url") or cdsco_extract.JUNE_2025_PDF_URL)
                )
                extracted = cdsco_extract.extract_rows(pdf_bytes, s3_key=pdf_s3_key)
                rows, row_pages = extracted["rows"], extracted["row_pages"]
                extract_fallback = extracted["fallback_used"]
            else:
                month = month or cdsco_fetch.newest_month()
                rows = cdsco_fetch.fetch_portal_rows(month)
                extract_fallback = False if extract_fallback is None else extract_fallback
        if adapter == "pdf":
            month = month or "JUN-2025"
            url = url or ev.get("pdf_url") or cdsco_extract.JUNE_2025_PDF_URL
        _try_bedrock(rows, month)
        notices = rows_to_notices(
            rows,
            adapter=adapter,
            month=month,
            pdf_s3_key=pdf_s3_key,
            url=url,
            row_pages=row_pages,
        )
        for notice in notices:
            dynamo.put("notices", notice)
    except Exception as exc:  # never raise on upstream failure
        return {
            "adapter": f"cdsco_{adapter}",
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
    return {
        "adapter": f"cdsco_{adapter}",
        "month": month,
        "pdf_s3_key": pdf_s3_key,
        "rows_in": len(rows),
        "notices_out": len(notices),
        "fallback_used": {"extract": extract_fallback, "normalise": True},
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
    }
