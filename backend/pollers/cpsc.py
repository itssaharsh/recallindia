"""CPSC SaferProducts poller (SPEC §Sources, id ``cpsc``).

One poll = the last ``days`` (default 30) of recalls from the JSON Recall API (no key),
mapped to the Notice shape and upserted idempotently on ``pk = cpsc#<RecallID>``. Data facts
from P00 that shape the mapping:

* the response is a bare JSON array; ``RecallDateStart`` / ``RecallDateEnd`` window it;
* identifiers (model numbers, serial numbers, batch/lot/date codes) live in the top-level
  ``Description`` narrative -- ``Products[].Description`` and ``Products[].Model`` are empty
  in the 2026 snapshot, so ``pollers.identifiers`` mines the narrative and the raw text is
  kept in ``raw_excerpt``;
* ``Manufacturers[]`` is usually empty; ``Importers[]`` / ``Distributors[]`` / the leading
  words of ``Products[0].Name`` stand in for the brand;
* CPSC data has quirks (e.g. record 10986 pairs the Char-Broil title with a "LANCHEZ
  Pressure Washers" product) -- the mapping records the fixture as-is, it does not guess.

Every HTTP call goes through ``common.demo_mode.fetch_json`` (fixture ``cpsc/recent.json`` in
DEMO_MODE). The handler never raises: an upstream failure returns ``degraded: true`` and still
writes ``meta#cpsc`` so the UI can say "CPSC: degraded, last success hh:mm".
"""

from __future__ import annotations

import datetime as dt
import logging
import re
import time
from typing import Any

from common.demo_mode import fetch_json
from common.notices import Counts, add, new_counts, upsert_notice, write_meta
from common.schemas import RAW_EXCERPT_MAX, Notice

try:  # local / tests: backend/ is the source root
    from pollers import identifiers
except ModuleNotFoundError:  # Lambda: CodeUri backend/pollers/ puts the siblings in /var/task
    import identifiers

log = logging.getLogger(__name__)

SOURCE = "cpsc"
BASE_URL = "https://www.saferproducts.gov/RestWebServices/Recall"
DEFAULT_DAYS = 30
UNKNOWN_BRAND = "unknown"

# "Char-Broil LLC, of Columbus, Georgia" / "SFactor, of China" -> the company alone, so
# brand_lc is usable for the GSI equality lookup.
_OF_PLACE = re.compile(r",?\s+of\s+(?=[A-Z])")
_WS = re.compile(r"\s+")
_BAD_SCHEME = re.compile(r"^(https?:)/(?!/)", re.IGNORECASE)  # "https:/www.cpsc.gov/..." quirk


# --- fetch ------------------------------------------------------------------------


def build_url(start: dt.date, end: dt.date | None = None) -> str:
    """Recall API URL for ``[start, end]`` (``end`` defaults to today), JSON format."""
    url = f"{BASE_URL}?format=json&RecallDateStart={start.isoformat()}"
    if end is not None:
        url += f"&RecallDateEnd={end.isoformat()}"
    return url


def _records(payload: Any) -> list[dict]:
    """The API returns a bare array; tolerate a wrapped one."""
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if isinstance(payload, dict):
        for key in ("results", "Results", "recalls"):
            if isinstance(payload.get(key), list):
                return [r for r in payload[key] if isinstance(r, dict)]
    return []


def fetch_window(start: dt.date, end: dt.date | None = None) -> list[dict]:
    """Recalls published in ``[start, end]``; raises on upstream failure (callers catch)."""
    return _records(fetch_json(build_url(start, end)))


# --- mapping ----------------------------------------------------------------------


def _text(value: Any) -> str:
    return _WS.sub(" ", str(value or "")).strip()


def _first_name(entries: Any) -> str:
    if isinstance(entries, list):
        for entry in entries:
            if isinstance(entry, dict) and _text(entry.get("Name")):
                return _text(entry["Name"])
    return ""


def clean_company(name: str) -> str:
    """Drop the ", of <City, State>" / "of China" tail CPSC appends to company names."""
    name = _text(name)
    parts = _OF_PLACE.split(name)
    return (parts[0] if len(parts) > 1 else name).strip(" ,;")


def brand_from_product_name(name: str) -> str:
    """Leading brand-looking token(s): first word, plus the second when it is capitalised."""
    words = _text(name).split()
    if not words:
        return ""
    if len(words) > 1 and words[1][:1].isupper() and not words[1].isupper():
        return f"{words[0]} {words[1]}"
    return words[0]


def _brand(rec: dict, product_name: str) -> str:
    for key in ("Manufacturers", "Importers", "Distributors"):
        name = _first_name(rec.get(key))
        if name:
            return clean_company(name)
    return brand_from_product_name(product_name) or UNKNOWN_BRAND


def _remedy(rec: dict) -> str | None:
    parts = [_first_name(rec.get("Remedies"))]
    options = rec.get("RemedyOptions")
    if isinstance(options, list):
        parts.extend(_text(o.get("Option")) for o in options if isinstance(o, dict))
    joined = "; ".join(p for p in parts if p)
    return joined or None


def _url(rec: dict) -> str:
    """The recall page; a handful of CPSC rows carry a broken ``https:/`` scheme."""
    return _BAD_SCHEME.sub(r"\1//", _text(rec.get("URL")))


def _published_at(rec: dict) -> str:
    raw = _text(rec.get("RecallDate") or rec.get("LastPublishDate"))[:10]
    return dt.date.fromisoformat(raw).isoformat()  # ValueError -> record skipped


def map_recall(rec: dict) -> dict:
    """One CPSC recall -> ``Notice.model_dump()``; raises on a record that cannot be mapped."""
    products = [p for p in (rec.get("Products") or []) if isinstance(p, dict)]
    title = _text(rec.get("Title"))
    product_name = _text(products[0].get("Name")) if products else ""
    description = _text(rec.get("Description"))
    product_text = " ".join(
        t for p in products for t in (_text(p.get("Name")), _text(p.get("Description"))) if t
    )
    identifier_text = f"{description} {product_text}".strip()

    models = []
    for p in products:
        m = _text(p.get("Model"))
        if m and m not in models:
            models.append(m)
    model = "; ".join(models) if models else None
    if model is None:
        found = identifiers.extract_models(identifier_text)
        model = found[0] if found else None

    raw_lines = [title, description]
    raw_lines.extend(
        t for p in products for t in (_text(p.get("Name")), _text(p.get("Description"))) if t
    )
    notice = Notice(
        pk=Notice.make_pk(SOURCE, str(rec["RecallID"])),
        source=SOURCE,
        notice_id=str(rec["RecallID"]),
        title=title or product_name or f"CPSC recall {rec['RecallID']}",
        product=product_name or title,
        brand=_brand(rec, product_name),
        model=model,
        batches=identifiers.extract_batches(identifier_text),
        serial_ranges=identifiers.extract_serial_ranges(identifier_text),
        hazard_or_failed_test=_first_name(rec.get("Hazards")),
        remedy=_remedy(rec),
        published_at=_published_at(rec),
        url=_url(rec),
        raw_excerpt="\n".join(line for line in raw_lines if line)[:RAW_EXCERPT_MAX],
    )
    return notice.model_dump()


# --- ingest / poll ----------------------------------------------------------------


def ingest(records: list[dict]) -> Counts:
    """Map + upsert every record; a bad record is logged and counted under ``skipped``."""
    counts = new_counts()
    counts["skipped"] = 0
    for rec in records:
        try:
            add(counts, upsert_notice(map_recall(rec)))
        except Exception as exc:  # one bad record must not stop the poll
            counts["skipped"] += 1
            rid = rec.get("RecallID") if isinstance(rec, dict) else None
            log.warning("cpsc: skipping record %s: %s", rid, exc)
    return counts


def poll(*, days: int = DEFAULT_DAYS, today: dt.date | None = None) -> dict:
    """One poll of the last ``days`` days; never raises, always writes ``meta#cpsc``."""
    t0 = time.monotonic()
    today = today or dt.date.today()
    start = today - dt.timedelta(days=days)
    counts = new_counts()
    counts["skipped"] = 0
    error: str | None = None
    try:
        records = fetch_window(start, today)
    except Exception as exc:  # never raise on upstream failure
        error = f"{type(exc).__name__}: {exc}"
        log.warning("cpsc: fetch failed: %s", error)
        records = []
    else:
        counts = ingest(records)
    counts["fetched"] = len(records)
    took_ms = int((time.monotonic() - t0) * 1000)
    degraded = error is not None
    write_meta(
        SOURCE,
        ok=not degraded,
        counts=counts,
        error=error,
        extra={
            "window": {"start": start.isoformat(), "end": today.isoformat()},
            "took_ms": took_ms,
        },
    )
    out: dict[str, Any] = {"source": SOURCE, **counts, "degraded": degraded, "took_ms": took_ms}
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
        log.exception("cpsc: poll crashed")
        return {
            "source": SOURCE,
            "fetched": 0,
            "upserted": 0,
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
        }
