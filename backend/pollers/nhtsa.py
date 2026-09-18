"""NHTSA recalls poller (SPEC §Sources, id ``nhtsa``).

The API is keyed by US-market make/model/year, so one poll walks a watchlist: the default
20 Indian-market cars (``pollers.watchlist``, only those with a true US name) x 2021-2025,
plus every vehicle item a user has added. Requests are sequential with a short pause; a
tuple that fails upstream is recorded in ``errors`` and the poll continues, so partial
results are always kept.

Quirk (P00): NHTSA answers HTTP 400 with a valid body ``{"Count": 0, ...}`` when a
make/model/year has no recalls. ``common.demo_mode.fetch_json`` returns any JSON body
regardless of status, and ``fetch_vehicle`` treats ``Count: 0`` as an empty result.

One campaign covers several model years; ``ingest`` upserts with ``merge_vehicles=True`` so
the stored notice accumulates a ``vehicles[]`` entry per (make, model, year) it was seen for.
Nothing else in the mapped notice depends on the queried year (the title is
``"<Make> <Model>: <component>"``), so a second poll over the same years is all ``unchanged``.

Deadline: the handler passes the Lambda's ``get_remaining_time_in_millis`` into ``poll``; when
less than one tuple's worst-case budget is left, the remaining tuples are recorded as skipped
(``degraded: true``) instead of letting the timeout kill the run before ``meta#nhtsa`` is
written.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import urlencode

from common.demo_mode import fetch_json, is_demo
from common.notices import Counts, add, new_counts, upsert_notice, write_meta
from common.schemas import Notice

try:  # local / tests: backend/ is the source root
    from pollers import watchlist
except ModuleNotFoundError:  # Lambda: CodeUri backend/pollers/ puts the siblings in /var/task
    import watchlist  # type: ignore[no-redef]

log = logging.getLogger(__name__)

SOURCE = "nhtsa"
BASE_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle"
NOTICE_URL = "https://www.nhtsa.gov/recalls?nhtsaId={campaign}"
HAZARD_MAX = 1000
EXCERPT_MAX = 4096
DEFAULT_PAUSE = 0.25
# Per-request budget: NHTSA is fast when it answers at all, so a hung request is cut at 10 s and
# retried once (fetch_json backs off 1 s in between) rather than the 3 x 20 s default.
REQUEST_TIMEOUT = 10.0
REQUEST_RETRIES = 2
# Worst case for one tuple (timeouts + backoff + a few DynamoDB round trips); poll() stops
# starting new tuples when the Lambda has less than this left.
TUPLE_BUDGET_MS = int((REQUEST_TIMEOUT * REQUEST_RETRIES + 1.0 + 4.0) * 1000)
DEADLINE_ERROR = "skipped: Lambda deadline"

# Monkeypatchable in tests; only called between live requests (never in demo mode).
_sleep = time.sleep

_DMY = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
_YMD = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def build_url(make: str, model: str, year: int | str) -> str:
    """``recallsByVehicle?make=..&model=..&modelYear=..`` with lower-cased make/model."""
    query = {"make": str(make).lower(), "model": str(model).lower(), "modelYear": year}
    return f"{BASE_URL}?{urlencode(query)}"


def count_records(payload: Any) -> int:
    """``results`` length; an empty ``results`` with ``Count: 0`` is a valid zero."""
    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            return len(results)
        count = payload.get("Count")
        if isinstance(count, int):
            return count
    if isinstance(payload, list):
        return len(payload)
    return 0


def fetch_vehicle(make: str, model: str, year: int | str) -> list[dict]:
    """Recall records for one make/model/year; ``[]`` for the 400-with-``Count: 0`` answer.

    Records whose ``ModelYear`` disagrees with the queried year are dropped: the live API
    only ever returns the queried year, and the demo fixtures are routed by make/model alone.
    """
    payload = fetch_json(
        build_url(make, model, year), timeout=REQUEST_TIMEOUT, retries=REQUEST_RETRIES
    )
    if isinstance(payload, list):
        results = payload
    elif isinstance(payload, dict):
        results = payload.get("results") or []
    else:
        results = []
    wanted = str(year).strip()
    return [
        r
        for r in results
        if isinstance(r, dict) and str(r.get("ModelYear") or wanted).strip() == wanted
    ]


def parse_date(value: Any) -> str:
    """``DD/MM/YYYY`` (NHTSA's ``ReportReceivedDate``) or ``YYYY-MM-DD`` -> ISO date."""
    text = str(value or "").strip()
    m = _DMY.match(text)
    if m:
        day, month, year = (int(g) for g in m.groups())
        return dt.date(year, month, day).isoformat()
    m = _YMD.match(text)
    if m:
        year, month, day = (int(g) for g in m.groups())
        return dt.date(year, month, day).isoformat()
    raise ValueError(f"unrecognised NHTSA date: {value!r}")


def _title(text: Any) -> str:
    return " ".join(str(text or "").split()).title()


def _clean(text: Any) -> str:
    return " ".join(str(text or "").split())


def map_result(rec: dict, make: str, model: str, year: int | str) -> dict:
    """One ``results[]`` record -> Notice dict (``notice_id`` = ``NHTSACampaignNumber``).

    The result must not depend on the queried ``year`` beyond ``vehicles[]`` (which
    ``upsert_notice`` merges), otherwise a campaign spanning several watched years would be
    rewritten once per year on every poll.
    """
    campaign = _clean(rec.get("NHTSACampaignNumber"))
    if not campaign:
        raise ValueError("record has no NHTSACampaignNumber")
    make_lc = str(rec.get("Make") or make).lower().strip()
    model_lc = str(rec.get("Model") or model).lower().strip()
    make_t, model_t = _title(make_lc), _title(model_lc)
    year_i = int(year)
    component = _clean(rec.get("Component"))
    consequence = _clean(rec.get("Consequence"))
    remedy = _clean(rec.get("Remedy")) or None
    hazard = f"{component}: {consequence}" if component else consequence
    excerpt = "\n".join(
        _clean(rec.get(k)) for k in ("Summary", "Consequence", "Remedy", "Notes")
    ).strip()
    notice = Notice(
        pk=Notice.make_pk(SOURCE, campaign),
        source=SOURCE,
        notice_id=campaign,
        title=f"{make_t} {model_t}: {component}".strip(" :"),
        product=f"{make_t} {model_t}",
        brand=make_t,
        model=model_t,
        vehicles=[{"make": make_lc, "model": model_lc, "year_from": year_i, "year_to": year_i}],
        hazard_or_failed_test=hazard[:HAZARD_MAX],
        remedy=remedy,
        published_at=parse_date(rec.get("ReportReceivedDate")),
        url=NOTICE_URL.format(campaign=campaign),
        raw_excerpt=excerpt[:EXCERPT_MAX],
    )
    return notice.model_dump()


def ingest(results: list[dict], make: str, model: str, year: int | str) -> Counts:
    """Upsert every record (vehicles merged); a bad record is logged, skipped and counted."""
    counts = new_counts()
    counts["skipped"] = 0
    for rec in results:
        counts["fetched"] += 1
        try:
            add(counts, upsert_notice(map_result(rec, make, model, year), merge_vehicles=True))
        except Exception as exc:  # one bad record must not sink the poll
            counts["skipped"] += 1
            log.warning(
                "nhtsa: skipping record %s for %s/%s/%s: %s",
                rec.get("NHTSACampaignNumber") if isinstance(rec, dict) else rec,
                make,
                model,
                year,
                exc,
            )
    return counts


def _merge(total: Counts, part: Counts) -> None:
    for key, value in part.items():
        total[key] = total.get(key, 0) + value


def default_tuples() -> list[watchlist.VehicleTuple]:
    """Watchlist x years plus the user's vehicle items, de-duplicated (order stable)."""
    from common import dynamo  # local import: keeps map_result/ingest usable without a table

    try:
        items = dynamo.scan_all("items")
    except Exception as exc:  # the items table is optional for the feed poll
        log.warning("nhtsa: could not scan items, polling the default watchlist only: %s", exc)
        items = []
    return watchlist.dedupe([*watchlist.expand(), *watchlist.from_items(items)])


def poll(
    *,
    tuples: list[watchlist.VehicleTuple] | None = None,
    pause: float = DEFAULT_PAUSE,
    remaining_ms: Callable[[], int] | None = None,
) -> dict:
    """Query every tuple sequentially; failures are collected, never raised.

    ``remaining_ms`` (the Lambda's ``get_remaining_time_in_millis``) stops the walk before a
    tuple that could not finish in time; the tuples not queried are listed in ``errors`` and
    counted in ``deadline_skipped`` so the run is reported as degraded, not silently short.
    """
    tuples = watchlist.dedupe(tuples) if tuples is not None else default_tuples()
    counts = new_counts()
    counts["skipped"] = 0
    errors: list[dict] = []
    deadline_skipped = 0
    for index, (make, model, year) in enumerate(tuples):
        left = _remaining(remaining_ms)
        if left is not None and left < TUPLE_BUDGET_MS:
            rest = tuples[index:]
            deadline_skipped = len(rest)
            errors.extend(
                {"make": m, "model": mo, "year": y, "error": f"{DEADLINE_ERROR} ({left} ms left)"}
                for m, mo, y in rest
            )
            log.warning("nhtsa: %d tuple(s) not queried, %d ms left", deadline_skipped, left)
            break
        if index and pause and not is_demo():
            _sleep(pause)
        try:
            results = fetch_vehicle(make, model, year)
        except Exception as exc:
            message = f"{type(exc).__name__}: {exc}"
            errors.append({"make": make, "model": model, "year": year, "error": message})
            log.warning("nhtsa: %s/%s/%s failed: %s", make, model, year, message)
            continue
        _merge(counts, ingest(results, make, model, year))
    return {
        "source": SOURCE,
        **counts,
        "queried": len(tuples) - deadline_skipped,
        "deadline_skipped": deadline_skipped,
        "skipped_no_us_match": len(watchlist.skipped()),
        "errors": errors,
        "degraded": bool(errors),
    }


def _remaining(remaining_ms: Callable[[], int] | None) -> int | None:
    if remaining_ms is None:
        return None
    try:
        return int(remaining_ms())
    except Exception:  # a broken context must not stop the poll
        return None


def _remaining_from_context(context: object) -> Callable[[], int] | None:
    """The Lambda context's ``get_remaining_time_in_millis`` when it has one (tests pass None)."""
    method = getattr(context, "get_remaining_time_in_millis", None)
    return method if callable(method) else None


def handler(event: dict | None, context: object) -> dict:
    """Lambda entry point: one poll, ``meta#nhtsa`` written, never raises."""
    t0 = time.monotonic()
    event = event or {}
    try:
        tuples = _tuples_from_event(event)
        result = poll(tuples=tuples, remaining_ms=_remaining_from_context(context))
    except Exception as exc:  # never raise on upstream failure
        result = {
            "source": SOURCE,
            **new_counts(),
            "queried": 0,
            "deadline_skipped": 0,
            "skipped_no_us_match": len(watchlist.skipped()),
            "errors": [{"error": f"{type(exc).__name__}: {exc}"}],
            "degraded": True,
        }
    if result["degraded"]:
        result["error"] = (
            "; ".join(e.get("error", "unknown error") for e in result["errors"][:5])
            or "unknown error"
        )
    result["took_ms"] = int((time.monotonic() - t0) * 1000)
    try:
        write_meta(
            SOURCE,
            ok=not result["degraded"],
            counts={
                k: result[k] for k in ("fetched", "created", "updated", "unchanged", "upserted")
            },
            error=result.get("error"),
            extra={
                "queried": result["queried"],
                "deadline_skipped": result["deadline_skipped"],
                "skipped_no_us_match": result["skipped_no_us_match"],
                "error_count": len(result["errors"]),
            },
        )
    except Exception as exc:  # bookkeeping must not fail the poll
        log.warning("nhtsa: could not write meta: %s", exc)
        result.setdefault("warnings", []).append(f"meta: {type(exc).__name__}: {exc}")
    return result


def _tuples_from_event(event: dict) -> list[watchlist.VehicleTuple] | None:
    """An explicit ``event["vehicles"]`` (``[{make, model, year}]``) overrides the watchlist."""
    vehicles = event.get("vehicles")
    if not isinstance(vehicles, list) or not vehicles:
        return None
    return watchlist.from_items([{"kind": "vehicle", **v} for v in vehicles if isinstance(v, dict)])
