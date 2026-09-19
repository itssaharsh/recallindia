"""Match pipeline step ``decide`` (SPEC §Match pipeline step 4). Deterministic, no model.

Rules decide, the model explains (ADR-001): Verify only said whether the notice text covers
the item and quoted it; this step is the only thing that turns that plus RangeCheck into
``alert`` / ``hold`` / ``dismiss`` / ``clear``.

Per verified candidate (``covers = verify.covers_item``, ``inside = range_check.inside``):

* ``(True, True)``  -> alert
* ``(True, None)``  -> hold, "identifier missing: add the batch or serial to confirm"
  (a vehicle: "model year missing: add the year to confirm")
* ``(None, *)``     -> hold, ``verify.reasoning`` or "verification unavailable"
* ``(True, False)`` -> dismiss, "batch DL-4472 not in listed batches [DL-4471, DL-4468]" /
  "serial 9999 outside listed ranges [4000-5200]" / "year 2021 outside 2017–2019"
* ``(False, *)``    -> dismiss, "model DUO-PLUS not covered; notice lists DUO60"

Selection: any alert (highest confidence, then candidate score) beats any hold (same order)
beats the dismiss of the highest-score candidate. No candidates -> clear, "no match in N
sources as of <time>"; Candidates degraded (or nothing verified) -> hold, "verification
unavailable". Wording (CLAUDE.md): a CDSCO NSQ alert says "failed CDSCO quality test,
<month> alert, row N", never "recalled"; a clear item is never "safe".
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from common.cdsco import MONTH_NAMES
from common.notices import now_iso

try:  # local / tests: backend/ is the source root
    from matcher.candidates import ALL_SOURCES
except ModuleNotFoundError:  # Lambda: CodeUri backend/matcher/ puts the siblings in /var/task
    from candidates import ALL_SOURCES  # type: ignore[no-redef]

log = logging.getLogger(__name__)

STEP = "decide"
DECISIONS = ("alert", "hold", "dismiss", "clear")
UNAVAILABLE = "verification unavailable"
HOLD_IDENTIFIER = "identifier missing: add the batch or serial to confirm"
HOLD_YEAR = "model year missing: add the year to confirm"
CDSCO_SOURCE = "cdsco_nsq"
CDSCO_PHRASE = "failed CDSCO quality test"


def _float(value: Any, default: float = 0.0) -> float:
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, int | float | Decimal):
        return float(value)
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return default


def _int(value: Any, default: int = 0) -> int:
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, int | float | Decimal):
        return int(value)
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _bool_or_none(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def _range_of(entry: dict) -> dict:
    """The four fields Decide carries: ``{inside, listed, yours, kind}`` with safe defaults."""
    raw = entry.get("range_check") if isinstance(entry.get("range_check"), dict) else {}
    kind = raw.get("kind")
    return {
        "inside": _bool_or_none(raw.get("inside")),
        "listed": str(raw.get("listed") or ""),
        "yours": str(raw.get("yours") or ""),
        "kind": kind if kind in ("batch", "serial", "vehicle_year") else "none",
    }


def _month_label(published_at: Any) -> str:
    """``"2026-07-01"`` -> ``"JUL-2026"``; ``""`` when the date is not ISO."""
    text = str(published_at or "")
    if len(text) >= 7 and text[4] == "-" and text[5:7].isdigit() and 1 <= int(text[5:7]) <= 12:
        return f"{MONTH_NAMES[int(text[5:7]) - 1]}-{text[:4]}"
    return ""


def cdsco_wording(notice: dict) -> str:
    """``"failed CDSCO quality test, JUL-2026 alert, row 12"`` for a CDSCO NSQ notice.

    Taken from the notice title (``common.cdsco.rows_to_notices`` writes "<product> — failed
    CDSCO quality test, <month> alert, row N"); rebuilt from ``published_at`` otherwise.
    """
    title = str(notice.get("title") or "")
    if CDSCO_PHRASE in title:
        return (CDSCO_PHRASE + title.split(CDSCO_PHRASE, 1)[1]).strip()
    month = _month_label(notice.get("published_at"))
    return f"{CDSCO_PHRASE}, {month} alert" if month else CDSCO_PHRASE


def alert_reason(range_check: dict, notice: dict) -> str:
    kind, yours, listed = range_check["kind"], range_check["yours"], range_check["listed"]
    if kind == "batch":
        matched = f"batch {yours} in listed batches [{listed}]"
    elif kind == "serial":
        matched = f"serial {yours} within listed ranges [{listed}]"
    elif kind == "vehicle_year":
        matched = f"year {yours} within {listed}"
    else:  # unreachable: alert needs inside True, which needs a kind
        matched = "identifier matches the notice"
    if notice.get("source") == CDSCO_SOURCE:
        return f"{cdsco_wording(notice)}; {matched}"
    return matched


def outside_reason(range_check: dict) -> str:
    """The dismiss reason built from the failing check (SPEC step 4), exact formats."""
    kind, yours, listed = range_check["kind"], range_check["yours"], range_check["listed"]
    if kind == "batch":
        return f"batch {yours} not in listed batches [{listed}]"
    if kind == "serial":
        return f"serial {yours} outside listed ranges [{listed}]"
    if kind == "vehicle_year":
        return f"year {yours} outside {listed}"
    return f"identifier {yours} not in listed [{listed}]"


def not_covered_reason(item: dict, notice: dict) -> str:
    mine = str(item.get("model") or item.get("name") or "").strip() or "unknown"
    theirs = str(notice.get("model") or notice.get("product") or "").strip() or "another product"
    return f"model {mine} not covered; notice lists {theirs}"


def hold_missing_reason(range_check: dict, item: dict) -> str:
    if range_check["kind"] == "vehicle_year" or item.get("kind") == "vehicle":
        return HOLD_YEAR
    return HOLD_IDENTIFIER


def decide_one(entry: dict, item: dict) -> dict:
    """One verified candidate (``{candidate, verify, range_check}``) -> its outcome."""
    candidate = entry.get("candidate") if isinstance(entry.get("candidate"), dict) else {}
    verify = entry.get("verify") if isinstance(entry.get("verify"), dict) else {}
    raw_range = entry.get("range_check") if isinstance(entry.get("range_check"), dict) else {}
    notice = verify.get("notice") if isinstance(verify.get("notice"), dict) else {}
    range_check = _range_of(entry)
    covers, inside = _bool_or_none(verify.get("covers_item")), range_check["inside"]

    if covers is True and inside is True:
        decision, reason = "alert", alert_reason(range_check, notice)
    elif covers is True and inside is None:
        decision, reason = "hold", hold_missing_reason(range_check, item)
    elif covers is None:
        decision, reason = "hold", str(verify.get("reasoning") or "").strip() or UNAVAILABLE
    elif covers is True:  # inside is False
        decision, reason = "dismiss", outside_reason(range_check)
    else:  # covers is False
        decision, reason = "dismiss", not_covered_reason(item, notice)

    notice_pk = verify.get("notice_pk") or raw_range.get("notice_pk") or candidate.get("notice_pk")
    verifier = verify.get("verifier")
    return {
        "decision": decision,
        "reason": reason,
        "notice_pk": str(notice_pk) if notice_pk else None,
        "quoted_sentence": str(verify.get("quoted_sentence") or ""),
        "confidence": _float(verify.get("confidence")),
        "verifier": verifier if verifier in ("bedrock", "deterministic") else "none",
        # the verifier's own human-readable account ("brand '..' matches; product '..' fuzzy 96;
        # batch X in listed [..]; quoted: '..'"); Notify stores it on the case for "Show work"
        "reasoning": str(verify.get("reasoning") or ""),
        "covers_item": covers,
        "range_check": range_check,
        "score": _int(candidate.get("score")),
    }


def select(outcomes: list[dict]) -> dict:
    """Alert (highest confidence, then score) beats hold (same) beats the top-score dismiss."""
    for decision in ("alert", "hold"):
        pool = [o for o in outcomes if o["decision"] == decision]
        if pool:
            return max(pool, key=lambda o: (o["confidence"], o["score"]))
    pool = [o for o in outcomes if o["decision"] == "dismiss"]
    return max(pool, key=lambda o: (o["score"], o["confidence"]))


def _terminal(
    decision: str, reason: str, *, considered: int, degraded: bool, error: str | None = None
) -> dict:
    out: dict[str, Any] = {
        "decision": decision,
        "reason": reason,
        "notice_pk": None,
        "quoted_sentence": "",
        "confidence": 0.0,
        "verifier": "none",
        "reasoning": "",
        "covers_item": None,
        "range_check": None,
        "candidates_considered": considered,
        "outcomes": [],
        "degraded": degraded,
    }
    if error:
        out["error"] = error
    return out


def decide(candidates_block: dict, verified: list[dict] | None, *, now: str | None = None) -> dict:
    """Pure decision over the Candidates block and the ``$.verified[]`` array.

    ``now`` (ISO seconds UTC, ``Z``) is stamped into the clear wording; it defaults to the
    current time.
    """
    block = candidates_block if isinstance(candidates_block, dict) else {}
    item = block.get("item") if isinstance(block.get("item"), dict) else {}
    entries = [e for e in (verified or []) if isinstance(e, dict)]
    count = _int(block.get("count"), default=len(block.get("candidates") or []))

    if block.get("degraded"):
        return _terminal("hold", UNAVAILABLE, considered=0, degraded=True)
    if not entries:
        if count > 0:  # candidates existed but nothing came back verified: never clear
            return _terminal("hold", UNAVAILABLE, considered=0, degraded=True)
        sources = block.get("sources_searched")
        total = len(sources) if isinstance(sources, list) else len(ALL_SOURCES)
        reason = f"no match in {total} sources as of {now or now_iso()}"
        return _terminal("clear", reason, considered=0, degraded=False)

    outcomes = [decide_one(entry, item) for entry in entries]
    best = select(outcomes)
    return {
        "decision": best["decision"],
        "reason": best["reason"],
        "notice_pk": best["notice_pk"],
        "quoted_sentence": best["quoted_sentence"],
        "confidence": best["confidence"],
        "verifier": best["verifier"],
        "reasoning": best["reasoning"],
        "covers_item": best["covers_item"],
        "range_check": best["range_check"],
        "candidates_considered": len(entries),
        "outcomes": [
            {
                "notice_pk": o["notice_pk"],
                "decision": o["decision"],
                "reason": o["reason"],
                "score": o["score"],
                "confidence": o["confidence"],
            }
            for o in outcomes
        ],
        "degraded": False,
    }


def handler(event: dict | None, context: object) -> dict:
    """Lambda entry: the whole state (``$.candidates``, ``$.verified``, ``$.run``); never raises."""
    event = event if isinstance(event, dict) else {}
    try:
        block = event.get("candidates")
        if not isinstance(block, dict):
            # No Candidates output at all: nothing was searched, so this can only be a hold.
            return _terminal(
                "hold", UNAVAILABLE, considered=0, degraded=True, error="no candidates block"
            )
        verified = event.get("verified")
        now = event.get("now") if isinstance(event.get("now"), str) else None
        return decide(block, verified if isinstance(verified, list) else None, now=now)
    except Exception as exc:  # a Lambda error would become a retry, then HoldUnavailable
        log.exception("decide: failed for %r", event.get("item_id"))
        return _terminal(
            "hold", UNAVAILABLE, considered=0, degraded=True, error=f"{type(exc).__name__}: {exc}"
        )
