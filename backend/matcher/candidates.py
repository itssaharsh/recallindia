"""Match pipeline step ``candidates`` (SPEC §Match pipeline step 1). Deterministic, no model.

Input: the whole execution state (``{item_id, run}``), or ``{item: {...}}`` for a local run.
``item_id`` is accepted with or without the ``user#`` prefix.

Algorithm (rules decide, the model explains -- ADR-001):

1. Load the item (``pk = user#<item_id>``). A vehicle's ``make`` stands in for an empty brand.
2. Brand path: for every ``common.matching.brand_variants(brand)`` query the ``brand_lc`` GSI
   (``dynamo.query_brand``, 100 rows each) and union the rows by pk.
   No-brand fallback (no brand and no make): one page of <= 125 rows per source in
   ``ALL_SOURCES`` through ``dynamo.query_source`` (<= 500 rows in total, never ``scan_all``).
3. Score every row: ``s = textmatch.product_score(item, notice)``; an identifier token shared
   between the item (batch / serial / model) and the notice (batches / serial_ranges / model)
   lifts it to >= 95 (``brand+identifier``); a ``vehicles[]`` make/model match lifts it to 100
   (``vehicle``, which wins the label). Keep ``s >= 80``; default label ``brand+product``,
   ``fallback+product`` on the fallback path. Bookkeeping rows (``meta#``, ``ingest#``) never
   qualify.
4. Sort by score desc, then ``published_at`` desc; keep <= 5.

Output ``{item, item_id, candidates: [{notice_pk, score, matched_on}], count, sources_searched,
searched_at, degraded}`` (plus ``lookup``: ``brand`` | ``fallback``). A missing item or any
error never raises: ``{item: null, candidates: [], count: 0, degraded: true, error}`` so the
state machine's Decide answers hold.
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Any

from common import dynamo
from common.matching import brand_variants, identifier_tokens
from common.notices import is_meta, now_iso
from common.schemas import Item

try:  # local / tests: backend/ is the source root
    from matcher import textmatch
except ModuleNotFoundError:  # Lambda: CodeUri backend/matcher/ puts the siblings in /var/task
    import textmatch  # type: ignore[no-redef]

log = logging.getLogger(__name__)

STEP = "candidates"
# Every source the matcher searches today; "siam" joins in P10. The clear wording counts them:
# "no match in 4 sources as of <time>".
ALL_SOURCES = ["cdsco_nsq", "cpsc", "nhtsa", "openfda"]
THRESHOLD = 80
IDENTIFIER_SCORE = 95
VEHICLE_SCORE = 100
MAX_CANDIDATES = 5
BRAND_QUERY_LIMIT = 100
# 4 sources x 125 = SPEC's 500-notice cap for the no-brand fallback.
FALLBACK_PER_SOURCE = 125
ITEM_PREFIX = "user#"
MATCHED_ON = ("brand+product", "brand+identifier", "vehicle", "fallback+product")


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


def _plain(value: Any) -> Any:
    """JSON round trip: DynamoDB ``Decimal``s become numbers the Lambda runtime can serialise."""
    return json.loads(json.dumps(value, default=_json_default))


def normalise_item_id(item_id: Any) -> str:
    """``"user#abc"`` and ``"abc"`` both name item ``abc``."""
    text = str(item_id or "").strip()
    return text[len(ITEM_PREFIX) :] if text.startswith(ITEM_PREFIX) else text


def load_item(event: dict) -> tuple[str | None, dict | None]:
    """``(item_id, item)`` from an inline ``event["item"]`` or the store by ``event["item_id"]``."""
    inline = event.get("item")
    if isinstance(inline, dict) and inline:
        item = _plain(inline)
        item_id = normalise_item_id(item.get("item_id") or item.get("pk") or event.get("item_id"))
        return (item_id or None), item
    item_id = normalise_item_id(event.get("item_id"))
    if not item_id:
        return None, None
    stored = dynamo.get("items", Item.make_pk(item_id))
    return item_id, (_plain(stored) if isinstance(stored, dict) else None)


def brand_of(item: dict) -> str:
    """The lookup brand: ``item.brand``, else ``item.make`` (a vehicle's brand is its make)."""
    return str(item.get("brand") or "").strip() or str(item.get("make") or "").strip()


def score_notice(item: dict, notice: dict) -> tuple[int, str]:
    """``(score, matched_on)`` for one notice; the strongest signal names the label.

    Identifier match (>= 95, ``brand+identifier``) is applied before the vehicle match
    (100, ``vehicle``) so a vehicle whose model also matches the notice's ``model`` field is
    still labelled ``vehicle``.
    """
    score = int(textmatch.product_score(item, notice))
    matched_on = "brand+product"
    mine = identifier_tokens(item.get("batch"), item.get("serial"), item.get("model"))
    theirs = identifier_tokens(
        *(notice.get("batches") or []), *(notice.get("serial_ranges") or []), notice.get("model")
    )
    if mine & theirs:
        score, matched_on = max(score, IDENTIFIER_SCORE), "brand+identifier"
    if textmatch.vehicle_matches(item, notice):
        score, matched_on = max(score, VEHICLE_SCORE), "vehicle"
    return score, matched_on


def brand_lookup(brand: str) -> list[dict]:
    """Union (by pk, first seen wins) of the ``brand_lc`` GSI rows for every brand variant."""
    seen: dict[str, dict] = {}
    for variant in brand_variants(brand):
        for row in dynamo.query_brand(variant, limit=BRAND_QUERY_LIMIT):
            pk = str(row.get("pk") or "")
            if pk and pk not in seen:
                seen[pk] = row
    return list(seen.values())


def fallback_lookup() -> list[dict]:
    """One newest-first page per source (<= 500 rows in total); never a table scan."""
    rows: list[dict] = []
    for source in ALL_SOURCES:
        page, _last = dynamo.query_source(source, limit=FALLBACK_PER_SOURCE)
        rows.extend(page)
    return rows


def rank(item: dict, rows: list[dict], *, fallback: bool = False) -> list[dict]:
    """Score ``rows`` against ``item``; the top <= 5 with ``score >= 80`` as candidate dicts."""
    scored: list[tuple[int, str, dict]] = []
    for notice in rows:
        if not isinstance(notice, dict) or is_meta(notice) or not notice.get("pk"):
            continue
        score, matched_on = score_notice(item, notice)
        if score < THRESHOLD:
            continue
        if fallback:
            matched_on = "fallback+product"
        candidate = {"notice_pk": str(notice["pk"]), "score": score, "matched_on": matched_on}
        scored.append((score, str(notice.get("published_at") or ""), candidate))
    scored.sort(key=lambda entry: (entry[0], entry[1]), reverse=True)
    return [candidate for _score, _published, candidate in scored[:MAX_CANDIDATES]]


def find_candidates(item: dict) -> tuple[list[dict], str]:
    """``(candidates, lookup)`` where lookup is ``"brand"`` or ``"fallback"``."""
    brand = brand_of(item)
    if brand:
        return rank(item, brand_lookup(brand)), "brand"
    return rank(item, fallback_lookup(), fallback=True), "fallback"


def _result(
    item_id: str | None,
    item: dict | None,
    candidates: list[dict],
    searched_at: str,
    *,
    lookup: str | None = None,
    error: str | None = None,
) -> dict:
    out: dict[str, Any] = {
        "item": item,
        "item_id": item_id,
        "candidates": candidates,
        "count": len(candidates),
        "sources_searched": list(ALL_SOURCES),
        "searched_at": searched_at,
        "degraded": error is not None,
    }
    if lookup:
        out["lookup"] = lookup
    if error is not None:
        out["error"] = error
    return out


def handler(event: dict | None, context: object) -> dict:
    """Lambda entry: ``{item_id, run}`` (or ``{item}``) -> the candidates block; never raises."""
    event = event if isinstance(event, dict) else {}
    searched_at = now_iso()
    item_id: str | None = None
    try:
        item_id, item = load_item(event)
        if item is None:
            return _result(item_id, None, [], searched_at, error="item not found")
        candidates, lookup = find_candidates(item)
        return _result(item_id, item, candidates, searched_at, lookup=lookup)
    except Exception as exc:  # a Lambda error would become a retry, then HoldUnavailable
        log.exception("candidates: failed for %r", item_id or event.get("item_id"))
        return _result(item_id, None, [], searched_at, error=f"{type(exc).__name__}: {exc}")
