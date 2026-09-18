"""CDSCO NSQ portal poller (SPEC §Sources, id ``cdsco_nsq``, adapter ``cdsco_portal``).

Polls the live cdscoonline.gov.in JSON endpoints documented in ``docs/P00-REPORT.md``
(``filteredNsqDrugTable?month=MON-YYYY&source=All&tab=nsq``) and upserts one Notice per row
through the shared mapping in ``common.cdsco.rows_to_notices`` -- the same shape the
Textract/PDF ingest produces. Wired to the daily Scheduler rule in ``template.yaml``.

The handler polls the newest month by default; ``event["months"]`` (``["MAR-2026", ...]``)
selects explicit months for backfills. Every month is attempted sequentially; a month that
fails upstream is recorded in ``errors`` and the rest continue. Nothing here raises.

Wording rule (CLAUDE.md): a row is "failed CDSCO quality test", never anything stronger.
"""

from __future__ import annotations

import logging
import time

from common import cdsco
from common.notices import Counts, add, new_counts, upsert_notice, write_meta

log = logging.getLogger(__name__)

SOURCE = cdsco.SOURCE  # "cdsco_nsq"
ADAPTER = "cdsco_portal"
META_SOURCE = "cdsco_portal"


def fetch_month(month: str) -> list[dict]:
    """Portal rows (``aaData``) for ``month`` (``MON-YYYY``), through ``common.cdsco``."""
    return cdsco.fetch_portal_rows(_norm(month))


def ingest_month(month: str) -> Counts:
    """Fetch one month, map every row, upsert; a bad row is logged, skipped and counted."""
    month = _norm(month)
    counts = new_counts()
    counts["skipped"] = 0
    rows = fetch_month(month)
    counts["fetched"] = len(rows)
    notices = cdsco.rows_to_notices(rows, adapter="portal", month=month)
    for notice in notices:
        try:
            add(counts, upsert_notice(notice))
        except Exception as exc:  # one bad row must not sink the month
            counts["skipped"] += 1
            log.warning("cdsco_portal: skipping %s: %s", notice.get("pk"), exc)
    return counts


def _norm(month: str) -> str:
    return str(month).strip().upper()


def _merge(total: Counts, part: Counts) -> None:
    for key, value in part.items():
        total[key] = total.get(key, 0) + value


def poll(months: list[str] | None = None) -> dict:
    """Ingest ``months`` (default: the portal's newest month); failures collected, not raised."""
    counts = new_counts()
    counts["skipped"] = 0
    errors: list[dict] = []
    rows: dict[str, int] = {}
    try:
        wanted = [_norm(m) for m in months if str(m).strip()] if months else [cdsco.newest_month()]
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        log.warning("cdsco_portal: could not resolve the newest month: %s", message)
        return {
            "source": SOURCE,
            "adapter": ADAPTER,
            **counts,
            "months": [],
            "rows": rows,
            "errors": [{"month": None, "error": message}],
            "degraded": True,
        }
    done: list[str] = []
    for month in wanted:
        try:
            part = ingest_month(month)
        except Exception as exc:
            message = f"{type(exc).__name__}: {exc}"
            errors.append({"month": month, "error": message})
            log.warning("cdsco_portal: %s failed: %s", month, message)
            continue
        rows[month] = part["fetched"]
        done.append(month)
        _merge(counts, part)
    return {
        "source": SOURCE,
        "adapter": ADAPTER,
        **counts,
        "months": done,
        "rows": rows,
        "errors": errors,
        "degraded": bool(errors),
    }


def handler(event: dict | None, context: object) -> dict:
    """Lambda entry point: poll ``event["months"]`` or the newest month; write meta; never raise."""
    t0 = time.monotonic()
    event = event or {}
    months = event.get("months")
    if isinstance(months, str):
        months = [months]
    if not isinstance(months, list):
        months = None
    try:
        result = poll(months)
    except Exception as exc:  # belt and braces: poll already never raises
        result = {
            "source": SOURCE,
            "adapter": ADAPTER,
            **new_counts(),
            "months": [],
            "rows": {},
            "errors": [{"month": None, "error": f"{type(exc).__name__}: {exc}"}],
            "degraded": True,
        }
    if result["degraded"]:
        result["error"] = "; ".join(
            f"{e.get('month') or 'portal'}: {e.get('error', 'unknown error')}"
            for e in result["errors"][:5]
        )
    result["took_ms"] = int((time.monotonic() - t0) * 1000)
    try:
        write_meta(
            META_SOURCE,
            ok=not result["degraded"],
            counts={
                k: result[k] for k in ("fetched", "created", "updated", "unchanged", "upserted")
            },
            error=result.get("error"),
            extra={"months": result["months"], "rows": result["rows"], "adapter": ADAPTER},
        )
    except Exception as exc:  # bookkeeping must not fail the poll
        log.warning("cdsco_portal: could not write meta: %s", exc)
        result.setdefault("warnings", []).append(f"meta: {type(exc).__name__}: {exc}")
    return result
