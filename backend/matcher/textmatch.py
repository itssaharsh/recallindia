"""Fuzzy product / model scoring for the Candidates step (SPEC §Match pipeline step 1).

The only module allowed to import rapidfuzz (``backend/matcher/requirements.txt``); everything
deterministic and stdlib-only lives in ``common.matching``. rapidfuzz is imported inside a
try so a missing wheel degrades to ``difflib`` instead of crashing a Lambda or a test run --
the threshold (``rapidfuzz.fuzz.token_set_ratio >= 80``) is the caller's, not this module's.
"""

from __future__ import annotations

import difflib

from common.matching import normalise_text

try:
    from rapidfuzz import fuzz as _fuzz
except ImportError:  # pragma: no cover - exercised by monkeypatching _fuzz to None in tests
    _fuzz = None

FALLBACK = "difflib"
ENGINE = "rapidfuzz" if _fuzz is not None else FALLBACK


def score(a: str | None, b: str | None) -> int:
    """0..100 similarity of two strings after ``normalise_text``.

    ``rapidfuzz.fuzz.token_set_ratio`` (word order and repeated words do not matter, a
    subset of tokens scores high) or, without rapidfuzz, ``difflib.SequenceMatcher`` ratio x
    100. An empty side scores 0.
    """
    na, nb = normalise_text(a), normalise_text(b)
    if not na or not nb:
        return 0
    if _fuzz is not None:
        return int(round(_fuzz.token_set_ratio(na, nb)))
    return int(round(difflib.SequenceMatcher(None, na, nb).ratio() * 100))


def product_score(item: dict, notice: dict) -> int:
    """Best ``score`` over item name/model vs notice product/title/model, empty fields skipped.

    Pairs: (item.name, notice.product), (item.name, notice.title), (item.model, notice.model),
    (item.model, notice.product). 0 when nothing is comparable.
    """
    name, model = item.get("name"), item.get("model")
    pairs = (
        (name, notice.get("product")),
        (name, notice.get("title")),
        (model, notice.get("model")),
        (model, notice.get("product")),
    )
    best = 0
    for left, right in pairs:
        if left and right:
            best = max(best, score(left, right))
    return best


def vehicle_matches(item: dict, notice: dict) -> bool:
    """True when the item's make and model equal (case/space-insensitive) any ``vehicles[]``
    entry of the notice. Year ranges are RangeCheck's job, not a candidate filter."""
    make = " ".join(str(item.get("make") or "").lower().split())
    model = " ".join(str(item.get("model") or "").lower().split())
    if not make or not model:
        return False
    for vehicle in notice.get("vehicles") or []:
        if not isinstance(vehicle, dict):
            continue
        v_make = " ".join(str(vehicle.get("make") or "").lower().split())
        v_model = " ".join(str(vehicle.get("model") or "").lower().split())
        if v_make == make and v_model == model:
            return True
    return False
