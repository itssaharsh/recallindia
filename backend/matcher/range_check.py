"""Match pipeline step ``range_check`` (SPEC §Match pipeline step 3). Deterministic, no model.

Rules decide, the model explains (ADR-001): nothing here calls Bedrock. The pure core is
unit-tested in ``backend/tests/test_range_check.py``:

* ``check_batch(yours, listed)`` -- exact match, or case/space-insensitive. Hyphens are
  significant ("DL 4471" is not "DL-4471"; ``test_handlers_smoke`` pins it). Near miss:
  ``check_batch("DL-4472", ["DL-4471", "DL-4468"])`` -> False.
* ``check_serial(yours, ranges)`` -- each listed range is one of ``"A12–A99"`` / ``"A12-A99"``
  (same letter prefix, numeric part compared), ``"4000-5200"``, ``"starting with 24"`` /
  ``"beginning with 24"`` / ``"starts with 24"`` / ``"prefix 24"`` (prefix match) or a single
  value (the batch rule). No parseable range -> None; any parseable range contains -> True;
  all parseable and none contain -> False; some unparseable and none contain -> None.
* ``check_vehicle_year(year, vehicles, make, model)`` -- the item's year within any matching
  make/model entry's ``[year_from, year_to]``; ``listed`` is ``"2017–2019"`` (en dash, min
  year_from to max year_to over the matching entries; a single year reads ``"2022"``).
* ``range_check(item, notice)`` -- picks the kind: batch when the item has a batch and the
  notice lists batches; else serial; else vehicle_year for a vehicle item and a notice with
  ``vehicles[]``; else kind ``"none"`` with ``inside`` None.

The handler (Map iterator input ``{candidate, item, run, verify?}``) loads the notice by
``candidate.notice_pk`` and never raises: a missing notice or any error answers
``inside: null`` with ``degraded: true`` so Decide can only hold for that candidate.
"""

from __future__ import annotations

import logging
import re
from decimal import Decimal
from typing import Any

from common import dynamo
from common.matching import norm_identifier

log = logging.getLogger(__name__)

STEP = "range_check"
KINDS = ("batch", "serial", "vehicle_year", "none")
EN_DASH = "–"
# hyphen-minus, hyphen, non-breaking hyphen, figure dash, en dash, em dash, minus sign
_DASH_CLASS = "[-‐‑‒–—−]"
# "A12–A99" / "A12-A99" / "4000-5200" / "A12-99": optional letter prefix, digits, a dash,
# optional (same) letter prefix, digits.
_RANGE = re.compile(r"^\s*([A-Za-z]*)\s*(\d+)\s*" + _DASH_CLASS + r"\s*([A-Za-z]*)\s*(\d+)\s*$")
# "starting with 24" / "beginning with 24" / "starts with 24" / "begins with 24" / "prefix 24"
_PREFIX = re.compile(
    r"^\s*(?:(?:start(?:s|ing)?|begin(?:s|ning)?)\s+with|prefix)\s*[:\-]?\s*(\S+)\s*$",
    re.IGNORECASE,
)
# A single listed serial ("SN-100", "A/12"): one identifier-like token, no spaces.
_SINGLE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9/._\-]*$")
# The item's serial split into letter prefix + number for numeric range comparison.
_VALUE = re.compile(r"^\s*([A-Za-z]*)\s*-?\s*(\d+)\s*$")


def _norm(value: str) -> str:
    """Case/space-insensitive key; hyphens and other punctuation stay significant."""
    return "".join(str(value).split()).upper()


def _clean_list(values: Any) -> list[str]:
    return [str(v).strip() for v in (values or []) if str(v).strip()]


# --- batches ----------------------------------------------------------------------


def check_batch(yours: str, listed: list[str]) -> dict:
    """``{inside: bool|None, listed: [...], yours: str}`` per SPEC §Match pipeline.

    ``inside`` is None when the item has no batch or the notice lists none.
    Near-miss example: ``check_batch("DL-4472", ["DL-4471", "DL-4468"])`` → False.
    """
    yours = str(yours or "").strip()
    listed = _clean_list(listed)
    if not yours or not listed:
        return {"inside": None, "listed": listed, "yours": yours}
    target = _norm(yours)
    inside = any(b == yours or _norm(b) == target for b in listed)
    return {"inside": inside, "listed": listed, "yours": yours}


# --- serial ranges ----------------------------------------------------------------


def parse_range(spec: str) -> dict | None:
    """One listed serial range -> ``{"type": "range"|"prefix"|"single", ...}``, or None.

    None means the text is not something we can compare against ("any unit", "all lots
    before March"); the caller treats it as unknown, never as a miss.
    """
    text = " ".join(str(spec or "").split())
    if not text:
        return None
    m = _RANGE.match(text)
    if m:
        prefix_lo, lo, prefix_hi, hi = (
            m.group(1).upper(),
            int(m.group(2)),
            m.group(3).upper(),
            int(m.group(4)),
        )
        if prefix_hi and prefix_hi != prefix_lo:
            return None  # "A12-B99": two different series, not one numeric range
        low, high = sorted((lo, hi))
        return {"type": "range", "spec": text, "prefix": prefix_lo, "low": low, "high": high}
    m = _PREFIX.match(text)
    if m:
        prefix = norm_identifier(m.group(1))
        return {"type": "prefix", "spec": text, "prefix": prefix} if prefix else None
    if _SINGLE.match(text):
        return {"type": "single", "spec": text, "value": text}
    return None


def _parse_value(text: str) -> tuple[str, int] | None:
    m = _VALUE.match(str(text or ""))
    if not m:
        return None
    return m.group(1).upper(), int(m.group(2))


def _contains(parsed: dict, yours: str) -> bool:
    if parsed["type"] == "range":
        value = _parse_value(yours)
        if value is None:
            return False
        prefix, number = value
        return prefix == parsed["prefix"] and parsed["low"] <= number <= parsed["high"]
    if parsed["type"] == "prefix":
        return norm_identifier(yours).startswith(parsed["prefix"])
    return parsed["value"] == yours or _norm(parsed["value"]) == _norm(yours)


def check_serial(yours: str, ranges: list[str]) -> dict:
    """``{inside: bool|None, listed: [...], yours: str, parsed: [...], unparsed: [...]}``.

    ``inside`` is None when there is nothing to compare, when no listed range is parseable,
    or when none of the parseable ranges contains ``yours`` but an unparseable one might.
    """
    yours = str(yours or "").strip()
    listed = _clean_list(ranges)
    parsed: list[dict] = []
    unparsed: list[str] = []
    for spec in listed:
        entry = parse_range(spec)
        if entry is None:
            unparsed.append(spec)
        else:
            parsed.append(entry)
    result = {
        "inside": None,
        "listed": listed,
        "yours": yours,
        "parsed": [p["spec"] for p in parsed],
        "unparsed": unparsed,
    }
    if not yours or not listed or not parsed:
        return result
    if any(_contains(p, yours) for p in parsed):
        result["inside"] = True
    elif not unparsed:
        result["inside"] = False
    return result


# --- vehicle years ----------------------------------------------------------------


def _key(text: Any) -> str:
    return " ".join(str(text or "").lower().split())


def _as_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float | Decimal):
        return int(value)
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def format_years(year_from: int, year_to: int) -> str:
    """``"2017–2019"`` (en dash) or ``"2022"`` when both ends are the same year."""
    low, high = sorted((int(year_from), int(year_to)))
    return str(low) if low == high else f"{low}{EN_DASH}{high}"


def check_vehicle_year(year: Any, vehicles: list[dict], make: Any, model: Any) -> dict:
    """``{inside: bool|None, listed: str, yours: str, matched: [...]}``.

    ``matched`` are the ``vehicles[]`` entries whose make and model equal the item's
    (lower-cased, whitespace collapsed) with integer year bounds. ``inside`` is None when the
    year is unknown or no entry matches; ``listed`` is still filled from the matching entries
    so a hold can show what the notice covers.
    """
    year_i = _as_int(year)
    yours = str(year_i) if year_i is not None else ""
    make_k, model_k = _key(make), _key(model)
    matched: list[dict] = []
    for vehicle in vehicles or []:
        if not isinstance(vehicle, dict):
            continue
        if not make_k or _key(vehicle.get("make")) != make_k:
            continue
        if not model_k or _key(vehicle.get("model")) != model_k:
            continue
        year_from, year_to = _as_int(vehicle.get("year_from")), _as_int(vehicle.get("year_to"))
        if year_from is None or year_to is None:
            continue
        low, high = sorted((year_from, year_to))
        matched.append({"make": make_k, "model": model_k, "year_from": low, "year_to": high})
    if not matched:
        return {"inside": None, "listed": "", "yours": yours, "matched": []}
    listed = format_years(min(m["year_from"] for m in matched), max(m["year_to"] for m in matched))
    inside = None
    if year_i is not None:
        inside = any(m["year_from"] <= year_i <= m["year_to"] for m in matched)
    return {"inside": inside, "listed": listed, "yours": yours, "matched": matched}


# --- one item against one notice --------------------------------------------------


def range_check(item: dict, notice: dict) -> dict:
    """``{inside, listed: str, yours: str, kind, detail}`` for an item/notice pair.

    Kind precedence: batch, then serial, then vehicle_year, else ``"none"`` (``inside`` None).
    ``listed`` is the human string Decide quotes: batches / ranges joined by ``", "``, or the
    year span ``"2017–2019"``.
    """
    item = item if isinstance(item, dict) else {}
    notice = notice if isinstance(notice, dict) else {}
    batch = str(item.get("batch") or "").strip()
    serial = str(item.get("serial") or "").strip()
    is_vehicle = item.get("kind") == "vehicle"
    year = _as_int(item.get("year"))
    batches = _clean_list(notice.get("batches"))
    ranges = _clean_list(notice.get("serial_ranges"))
    vehicles = [v for v in (notice.get("vehicles") or []) if isinstance(v, dict)]

    if batch and batches:
        result = check_batch(batch, batches)
        return {
            "inside": result["inside"],
            "listed": ", ".join(result["listed"]),
            "yours": result["yours"],
            "kind": "batch",
            "detail": {"batches": result["listed"]},
        }
    if serial and ranges:
        result = check_serial(serial, ranges)
        return {
            "inside": result["inside"],
            "listed": ", ".join(result["listed"]),
            "yours": result["yours"],
            "kind": "serial",
            "detail": {
                "ranges": result["listed"],
                "parsed": result["parsed"],
                "unparsed": result["unparsed"],
            },
        }
    if is_vehicle and vehicles:
        result = check_vehicle_year(item.get("year"), vehicles, item.get("make"), item.get("model"))
        detail: dict[str, Any] = {
            "make": _key(item.get("make")),
            "model": _key(item.get("model")),
            "matched": result["matched"],
        }
        if not result["matched"]:
            detail["reason"] = "no vehicles[] entry for this make/model"
        elif result["inside"] is None:
            detail["reason"] = "item has no model year"
        return {
            "inside": result["inside"],
            "listed": result["listed"],
            "yours": result["yours"],
            "kind": "vehicle_year",
            "detail": detail,
        }
    yours = batch or serial or (str(year) if is_vehicle and year is not None else "")
    reason = (
        "notice lists no batches, serial ranges or vehicles"
        if yours
        else "item has no batch, serial or model year"
    )
    return {
        "inside": None,
        "listed": "",
        "yours": yours,
        "kind": "none",
        "detail": {"reason": reason},
    }


# --- Lambda ---------------------------------------------------------------------------


def _unavailable(notice_pk: str | None, item: dict, error: str) -> dict:
    yours = str(item.get("batch") or item.get("serial") or item.get("year") or "").strip()
    return {
        "notice_pk": notice_pk,
        "inside": None,
        "listed": "",
        "yours": yours,
        "kind": "none",
        "detail": {"error": error},
        "degraded": True,
        "error": error,
    }


def handler(event: dict | None, context: object) -> dict:
    """Map iterator step: ``{candidate, item, run, verify?}`` -> the range check. Never raises.

    The notice is loaded by ``candidate.notice_pk`` (``common.dynamo.get``); an event that
    carries an inline ``notice`` and no pk is checked as given (tests, local runs). A missing
    notice or any exception answers ``inside: null`` with ``degraded: true``.
    """
    event = event if isinstance(event, dict) else {}
    candidate = event.get("candidate") if isinstance(event.get("candidate"), dict) else {}
    item = event.get("item") if isinstance(event.get("item"), dict) else {}
    raw_pk = candidate.get("notice_pk") or event.get("notice_pk")
    notice_pk = str(raw_pk).strip() if raw_pk else None
    try:
        if notice_pk:
            notice = dynamo.get("notices", notice_pk)
            if notice is None:
                return _unavailable(notice_pk, item, f"notice not found: {notice_pk}")
        else:
            notice = event.get("notice") if isinstance(event.get("notice"), dict) else {}
        return {"notice_pk": notice_pk, **range_check(item, notice), "degraded": False}
    except Exception as exc:  # a Lambda error would become a retry, then RangeUnavailable
        log.exception("range_check: failed for %s", notice_pk)
        return _unavailable(notice_pk, item, f"{type(exc).__name__}: {exc}")
