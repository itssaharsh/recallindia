"""openFDA enforcement poller (SPEC §Sources, id ``openfda``): drug + device, last 30 days.

P00 rules baked in:

* openFDA's default order is oldest-first (2015), so every URL carries
  ``sort=report_date:desc`` and a ``search=report_date:[YYYYMMDD+TO+YYYYMMDD]`` window
  (``[`` ``]`` URL-encoded as ``%5B`` ``%5D``, ``+TO+`` literal);
* pages via ``limit`` (max 1000) + ``skip``; ``meta.results.total`` says when to stop;
* "no results" is an HTTP 404 with a JSON ``{"error": {...}}`` body -> zero records;
* ``code_info`` carries lot numbers ("Lot # NC185424, Exp Date: 2/12/2027; Lot # ...") that
  ``pollers.identifiers.extract_batches`` turns into ``batches[]``.

Idempotent upsert on ``pk = openfda#<recall_number>``; ``meta#openfda`` records the run with
per-kind counts. Every HTTP call goes through ``common.demo_mode.fetch_json`` (fixtures
``openfda/drug_enforcement_recent.json`` and ``openfda/device_enforcement.json`` in DEMO_MODE).
"""

from __future__ import annotations

import datetime as dt
import logging
import re
import time
from typing import Any
from urllib.parse import quote

from common.demo_mode import fetch_json, is_demo
from common.notices import Counts, add, new_counts, upsert_notice, write_meta
from common.schemas import RAW_EXCERPT_MAX, Notice

try:  # local / tests: backend/ is the source root
    from pollers import identifiers
except ModuleNotFoundError:  # Lambda: CodeUri backend/pollers/ puts the siblings in /var/task
    import identifiers

log = logging.getLogger(__name__)

SOURCE = "openfda"
KINDS = ("drug", "device")
BASE_URL = "https://api.fda.gov"
DEFAULT_DAYS = 30
DEFAULT_LIMIT = 100
MAX_LIMIT = 1000
MAX_RECORDS = 1000
PRODUCT_MAX = 300
TITLE_MAX = 100

_WS = re.compile(r"\s+")

# Monkeypatchable in tests; only called between live page requests (never in demo mode).
_sleep = time.sleep


# --- fetch ------------------------------------------------------------------------


def build_url(
    kind: str, start: dt.date, end: dt.date, *, limit: int = DEFAULT_LIMIT, skip: int = 0
) -> str:
    """``/<kind>/enforcement.json`` for the window, newest first, paginated by ``skip``."""
    if kind not in KINDS:
        raise ValueError(f"unknown openFDA kind {kind!r}; expected one of {KINDS}")
    limit = max(1, min(int(limit), MAX_LIMIT))
    window = f"%5B{start.strftime('%Y%m%d')}+TO+{end.strftime('%Y%m%d')}%5D"
    return (
        f"{BASE_URL}/{kind}/enforcement.json?search=report_date:{window}"
        f"&sort=report_date:desc&limit={limit}&skip={int(skip)}"
    )


def _page(payload: Any) -> tuple[list[dict], int | None]:
    """``(results, total)`` from one response; the 404 ``{"error": ...}`` body is empty."""
    if not isinstance(payload, dict):
        return [], None
    if "error" in payload and "results" not in payload:
        return [], 0
    results = [r for r in (payload.get("results") or []) if isinstance(r, dict)]
    total = ((payload.get("meta") or {}).get("results") or {}).get("total")
    return results, int(total) if str(total).isdigit() else None


def fetch_window(
    kind: str,
    start: dt.date,
    end: dt.date,
    *,
    limit: int = DEFAULT_LIMIT,
    max_records: int = MAX_RECORDS,
    pause: float = 0.0,
) -> list[dict]:
    """All records of ``kind`` in the window, sequentially paged with ``skip``.

    Stops when a page is shorter than ``limit``, when ``skip >= meta.results.total`` or when
    ``max_records`` is reached. ``pause`` seconds are slept between pages (never in demo mode)
    so a backfill spaces every request, not just every window. Raises on upstream failure
    (callers catch).
    """
    records: list[dict] = []
    skip = 0
    while len(records) < max_records:
        if skip and pause and not is_demo():
            _sleep(pause)
        results, total = _page(fetch_json(build_url(kind, start, end, limit=limit, skip=skip)))
        records.extend(results)
        skip += limit
        if len(results) < limit or (total is not None and skip >= total):
            break
    return records[:max_records]


# --- mapping ----------------------------------------------------------------------


def _text(value: Any) -> str:
    return _WS.sub(" ", str(value or "")).strip()


def _first(values: Any) -> str:
    if isinstance(values, list):
        for v in values:
            if _text(v):
                return _text(v)
    return _text(values) if isinstance(values, str) else ""


def _brand(rec: dict) -> str:
    openfda = rec.get("openfda") if isinstance(rec.get("openfda"), dict) else {}
    return (
        _first(openfda.get("brand_name"))
        or _first(openfda.get("manufacturer_name"))
        or _text(rec.get("recalling_firm"))
        or "unknown"
    )


def _published_at(rec: dict) -> str:
    raw = _text(rec.get("report_date") or rec.get("recall_initiation_date"))
    return dt.datetime.strptime(raw, "%Y%m%d").date().isoformat()  # ValueError -> skipped


def notice_url(kind: str, recall_number: str) -> str:
    """Canonical lookup URL: ``search=recall_number:%22D-0815-2026%22``."""
    quoted = quote(f'"{recall_number}"')
    return f"{BASE_URL}/{kind}/enforcement.json?search=recall_number:{quoted}"


def _raw_excerpt(rec: dict) -> str:
    """Raw (not whitespace-collapsed) product description, reason and code_info, <= 4 KB."""
    parts = (rec.get("product_description"), rec.get("reason_for_recall"), rec.get("code_info"))
    return "\n".join(str(p).strip() for p in parts if p and str(p).strip())[:RAW_EXCERPT_MAX]


def map_record(rec: dict, kind: str) -> dict:
    """One enforcement record -> ``Notice.model_dump()``; raises when it cannot be mapped."""
    if kind not in KINDS:
        raise ValueError(f"unknown openFDA kind {kind!r}")
    recall_number = _text(rec.get("recall_number"))
    if not recall_number:
        raise ValueError("record has no recall_number")
    product = _text(rec.get("product_description"))
    reason = _text(rec.get("reason_for_recall"))
    code_info = _text(rec.get("code_info"))
    batches = identifiers.extract_batches(code_info)
    if identifiers.mentions_all_lots(code_info):
        batches = []
    notice = Notice(
        pk=Notice.make_pk(SOURCE, recall_number),
        source=SOURCE,
        notice_id=recall_number,
        title=f"{kind} recall: {product[:TITLE_MAX]}".strip(),
        product=product[:PRODUCT_MAX] or f"{kind} product",
        brand=_brand(rec),
        model=None,
        batches=batches,
        hazard_or_failed_test=reason,
        remedy=None,
        published_at=_published_at(rec),
        url=notice_url(kind, recall_number),
        raw_excerpt=_raw_excerpt(rec),
    )
    return notice.model_dump()


# --- ingest / poll ----------------------------------------------------------------


def ingest(records: list[dict], kind: str) -> Counts:
    """Map + upsert every record of ``kind``; a bad record is logged and counted as skipped."""
    counts = new_counts()
    counts["skipped"] = 0
    for rec in records:
        try:
            add(counts, upsert_notice(map_record(rec, kind)))
        except Exception as exc:  # one bad record must not stop the poll
            counts["skipped"] += 1
            rid = rec.get("recall_number") if isinstance(rec, dict) else None
            log.warning("openfda/%s: skipping %s: %s", kind, rid, exc)
    return counts


def _merge(total: Counts, part: Counts) -> None:
    for key, value in part.items():
        total[key] = total.get(key, 0) + value


def poll(*, days: int = DEFAULT_DAYS, today: dt.date | None = None) -> dict:
    """Both kinds, last ``days`` days, sequentially; never raises, always writes meta."""
    t0 = time.monotonic()
    today = today or dt.date.today()
    start = today - dt.timedelta(days=days)
    totals = new_counts()
    totals["skipped"] = 0
    per_kind: dict[str, dict] = {}
    errors: list[str] = []
    for kind in KINDS:
        try:
            records = fetch_window(kind, start, today)
        except Exception as exc:  # never raise on upstream failure
            error = f"{type(exc).__name__}: {exc}"
            errors.append(f"{kind}: {error}")
            log.warning("openfda/%s: fetch failed: %s", kind, error)
            per_kind[kind] = {**new_counts(), "skipped": 0, "degraded": True, "error": error}
            continue
        counts = ingest(records, kind)
        counts["fetched"] = len(records)
        per_kind[kind] = {**counts, "degraded": False}
        _merge(totals, counts)
    took_ms = int((time.monotonic() - t0) * 1000)
    degraded = bool(errors)
    error = "; ".join(errors) if errors else None
    write_meta(
        SOURCE,
        ok=not degraded,
        counts=totals,
        error=error,
        extra={
            "kinds": per_kind,
            "window": {"start": start.isoformat(), "end": today.isoformat()},
            "took_ms": took_ms,
        },
    )
    out: dict[str, Any] = {
        "source": SOURCE,
        **totals,
        "kinds": per_kind,
        "degraded": degraded,
        "took_ms": took_ms,
    }
    if error:
        out["error"] = error
    return out


def handler(event: dict | None, context: object) -> dict:
    """Lambda entry point (EventBridge, every 15 min). ``event.days`` overrides the window."""
    event = event or {}
    try:
        days = int(event.get("days") or DEFAULT_DAYS)
    except (TypeError, ValueError):
        days = DEFAULT_DAYS
    try:
        return poll(days=days)
    except Exception as exc:  # belt and braces: a handler never raises
        log.exception("openfda: poll crashed")
        return {
            "source": SOURCE,
            "fetched": 0,
            "upserted": 0,
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
        }
