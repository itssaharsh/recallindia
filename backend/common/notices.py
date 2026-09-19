"""Idempotent Notice upserts and per-source ``meta#<source>`` bookkeeping (SPEC §Sources).

Every poller and the CDSCO ingest write notices through ``upsert_notice`` so a re-poll of
the same window is a no-op (``"unchanged"`` never touches the table) and ``first_seen_at``
survives updates. ``write_meta`` records the last run / last success / last error per
source in the notices table under ``pk = meta#<source>`` so the UI can show
"CPSC: degraded, last success hh:mm". Storage goes through ``common.dynamo`` so demo and
live behave the same.
"""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal
from typing import Any, Literal

from common import dynamo
from common.schemas import Notice

UpsertResult = Literal["created", "updated", "unchanged"]
Counts = dict[str, int]

META_PREFIX = "meta#"
# pk prefixes of the bookkeeping rows that share the notices table and must never reach the
# feed / public API: per-source meta rows and per-execution ingest run records
# (``common.ingest_runs``). Neither carries ``published_at``, so the source GSI skips them too.
INTERNAL_PREFIXES = (META_PREFIX, "ingest#")
_BOOKKEEPING = frozenset({"first_seen_at", "updated_at"})
_COUNT_KEYS = ("fetched", "created", "updated", "unchanged", "upserted")


def now_iso() -> str:
    """Current UTC time as ``YYYY-MM-DDTHH:MM:SSZ``."""
    return dt.datetime.now(dt.UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_counts() -> Counts:
    """Fresh ``{fetched, created, updated, unchanged, upserted}`` all at zero."""
    return dict.fromkeys(_COUNT_KEYS, 0)


def add(counts: Counts, result: str) -> None:
    """Increment ``counts[result]`` (and ``upserted`` for created/updated) in place."""
    counts[result] = counts.get(result, 0) + 1
    if result in ("created", "updated"):
        counts["upserted"] = counts.get("upserted", 0) + 1


def _plain(value: Any) -> Any:
    """JSON round-trip so DynamoDB ``Decimal``s compare equal to the ints/floats we wrote."""
    return json.loads(json.dumps(value, default=_json_default))


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


def _comparable(item: dict) -> dict:
    return {k: v for k, v in _plain(item).items() if k not in _BOOKKEEPING}


def _vehicle_key(vehicle: dict) -> tuple:
    return (
        str(vehicle.get("make", "")),
        str(vehicle.get("model", "")),
        vehicle.get("year_from"),
        vehicle.get("year_to"),
    )


def merge_vehicle_lists(existing: list[dict], incoming: list[dict]) -> list[dict]:
    """Union of two vehicle lists, deduped on ``(make, model, year_from, year_to)``, stable."""
    seen: set[tuple] = set()
    out: list[dict] = []
    for vehicle in [*existing, *incoming]:
        key = _vehicle_key(vehicle)
        if key in seen:
            continue
        seen.add(key)
        out.append(dict(vehicle))
    return out


def upsert_notice(notice: dict | Notice, *, merge_vehicles: bool = False) -> UpsertResult:
    """Validate ``notice`` and write it only when new or changed.

    * new pk -> put with ``first_seen_at = updated_at = now`` -> ``"created"``
    * existing, every field except the bookkeeping ones identical -> ``"unchanged"`` (no write)
    * existing, anything else -> put keeping the original ``first_seen_at`` -> ``"updated"``

    ``merge_vehicles`` unions the stored ``vehicles[]`` into the incoming notice first (the
    NHTSA poller sees one campaign once per make/model/year it is queried for).
    """
    model = notice if isinstance(notice, Notice) else Notice.model_validate(notice)
    item = model.model_dump()
    existing = dynamo.get("notices", item["pk"])
    now = now_iso()
    if existing is None:
        item["first_seen_at"] = item.get("first_seen_at") or now
        item["updated_at"] = now
        dynamo.put("notices", item)
        return "created"
    existing = _plain(existing)
    if merge_vehicles:
        item["vehicles"] = merge_vehicle_lists(existing.get("vehicles") or [], item["vehicles"])
    if _comparable(existing) == _comparable(item):
        return "unchanged"
    item["first_seen_at"] = existing.get("first_seen_at") or item.get("first_seen_at") or now
    item["updated_at"] = now
    dynamo.put("notices", item)
    return "updated"


# --- meta#<source> ----------------------------------------------------------------


def meta_pk(source: str) -> str:
    return f"{META_PREFIX}{source}"


def is_meta(item: dict) -> bool:
    """True for the bookkeeping rows that share the notices table (``meta#``, ``ingest#``)."""
    return str(item.get("pk", "")).startswith(INTERNAL_PREFIXES)


def read_meta(source: str) -> dict | None:
    """The stored ``meta#<source>`` row, or None before the first run."""
    return dynamo.get("notices", meta_pk(source))


def write_meta(
    source: str,
    *,
    ok: bool,
    counts: dict | None = None,
    error: str | None = None,
    extra: dict | None = None,
) -> dict:
    """Record one poll: ``last_run_at`` always, ``last_success_at`` only when ``ok``.

    On failure the previous ``last_success_at`` is kept so the UI can still say when the
    source last worked. Returns the stored item.
    """
    now = now_iso()
    previous = read_meta(source) or {}
    item: dict[str, Any] = {
        "pk": meta_pk(source),
        "source": source,
        "last_run_at": now,
        "last_success_at": now if ok else previous.get("last_success_at"),
        "last_error": None if ok else (error or "unknown error"),
        "degraded": not ok,
        "last_counts": dict(counts) if counts is not None else None,
    }
    if extra:
        item.update({k: v for k, v in extra.items() if k not in ("pk", "source")})
    dynamo.put("notices", item)
    return item
