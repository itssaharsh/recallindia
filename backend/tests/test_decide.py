"""matcher.decide: SPEC §Match pipeline step 4, table-driven, plus selection and the handler."""

from __future__ import annotations

import re

import pytest

from matcher import decide as decide_mod
from matcher.candidates import ALL_SOURCES
from matcher.decide import (
    HOLD_IDENTIFIER,
    HOLD_YEAR,
    UNAVAILABLE,
    cdsco_wording,
    decide,
    decide_one,
    handler,
)

NOW = "2026-09-19T10:00:00Z"
ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

ITEM = {
    "pk": "user#med-1",
    "item_id": "med-1",
    "kind": "medicine",
    "name": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batch": "FT5427",
}
CDSCO_PK = "cdsco_nsq#JUL-2026-cdsco_portal-abc123def456"
CDSCO_NOTICE = {
    "product": "Paracetamol Tablets IP 650mg",
    "model": None,
    "brand": "Forgo Pharmaceuticals",
    "source": "cdsco_nsq",
    "published_at": "2026-07-01",
    "title": "Paracetamol Tablets IP 650mg — failed CDSCO quality test, JUL-2026 alert, row 12",
    "adapter": "cdsco_portal",
    "batches": ["FT5427"],
}
NHTSA_NOTICE = {
    "product": "Jeep Compass",
    "model": "Compass",
    "brand": "Jeep",
    "source": "nhtsa",
    "published_at": "2022-04-14",
    "title": "Jeep Compass: SEATS:FRONT ASSEMBLY:HEAD RESTRAINT",
    "adapter": None,
    "batches": [],
}
QUOTE = "Paracetamol Tablets IP 650mg | FT5427"


def _block(count: int = 1, *, item: dict | None = None, degraded: bool = False, sources=None):
    return {
        "item": ITEM if item is None else item,
        "item_id": "med-1",
        "candidates": [
            {"notice_pk": f"{CDSCO_PK}-{i}", "score": 95, "matched_on": "brand+identifier"}
            for i in range(count)
        ],
        "count": count,
        "sources_searched": list(ALL_SOURCES) if sources is None else sources,
        "searched_at": NOW,
        "degraded": degraded,
    }


def _entry(
    covers,
    inside,
    kind: str = "batch",
    *,
    yours: str = "FT5427",
    listed: str = "FT5427",
    score: int = 95,
    confidence: float = 0.9,
    reasoning: str = "",
    notice: dict | None = None,
    pk: str = CDSCO_PK,
    verifier: str = "deterministic",
    quoted: str = QUOTE,
) -> dict:
    return {
        "candidate": {"notice_pk": pk, "score": score, "matched_on": "brand+identifier"},
        "verify": {
            "notice_pk": pk,
            "covers_item": covers,
            "quoted_sentence": quoted,
            "confidence": confidence,
            "reasoning": reasoning,
            "verifier": verifier,
            "notice": CDSCO_NOTICE if notice is None else notice,
            "degraded": False,
        },
        "range_check": {
            "notice_pk": pk,
            "inside": inside,
            "listed": listed,
            "yours": yours,
            "kind": kind,
            "detail": {},
            "degraded": False,
        },
    }


# --- the table (SPEC step 4) -------------------------------------------------------------


@pytest.mark.parametrize(
    ("covers", "inside", "kind", "yours", "listed", "decision", "reason"),
    [
        (True, True, "batch", "FT5427", "FT5427", "alert", None),
        (True, None, "batch", "", "FT5427", "hold", HOLD_IDENTIFIER),
        (True, None, "none", "", "", "hold", HOLD_IDENTIFIER),
        (True, None, "vehicle_year", "", "2017–2019", "hold", HOLD_YEAR),
        (None, True, "batch", "FT5427", "FT5427", "hold", UNAVAILABLE),
        (None, None, "none", "", "", "hold", UNAVAILABLE),
        (None, False, "batch", "DL-4472", "DL-4471", "hold", UNAVAILABLE),
        (
            True,
            False,
            "batch",
            "DL-4472",
            "DL-4471, DL-4468",
            "dismiss",
            "batch DL-4472 not in listed batches [DL-4471, DL-4468]",
        ),
        (
            True,
            False,
            "serial",
            "9999",
            "4000-5200, A12–A99",
            "dismiss",
            "serial 9999 outside listed ranges [4000-5200, A12–A99]",
        ),
        (
            True,
            False,
            "vehicle_year",
            "2021",
            "2017–2019",
            "dismiss",
            "year 2021 outside 2017–2019",
        ),
        (False, True, "batch", "FT5427", "FT5427", "dismiss", None),
        (False, None, "none", "", "", "dismiss", None),
        (False, False, "batch", "DL-4472", "DL-4471", "dismiss", None),
    ],
)
def test_decision_table(covers, inside, kind, yours, listed, decision, reason) -> None:
    out = decide(_block(), [_entry(covers, inside, kind, yours=yours, listed=listed)], now=NOW)
    assert out["decision"] == decision
    if reason is not None:
        assert out["reason"] == reason
    elif decision == "alert":
        assert out["reason"] == (
            "failed CDSCO quality test, JUL-2026 alert, row 12; "
            "batch FT5427 in listed batches [FT5427]"
        )
    else:  # covers False
        assert out["reason"] == (
            "model Paracetamol Tablets IP 650mg not covered; "
            "notice lists Paracetamol Tablets IP 650mg"
        )
    assert "recalled" not in out["reason"] and "safe" not in out["reason"].split()
    assert out["covers_item"] is covers
    assert out["range_check"] == {"inside": inside, "listed": listed, "yours": yours, "kind": kind}
    assert out["candidates_considered"] == 1 and out["degraded"] is False
    assert out["notice_pk"] == CDSCO_PK and out["quoted_sentence"] == QUOTE
    assert out["confidence"] == 0.9 and out["verifier"] == "deterministic"


def test_not_covered_reason_uses_model_then_name() -> None:
    item = {**ITEM, "kind": "appliance", "name": "Instant Pot", "model": "DUO-PLUS"}
    notice = {**CDSCO_NOTICE, "source": "cpsc", "product": "Instant Pot Duo", "model": "DUO60"}
    out = decide(_block(item=item), [_entry(False, True, notice=notice)], now=NOW)
    assert out["decision"] == "dismiss"
    assert out["reason"] == "model DUO-PLUS not covered; notice lists DUO60"
    # no model on either side: item name vs notice product
    notice = {**notice, "model": None}
    out = decide(
        _block(item={**item, "model": None}), [_entry(False, True, notice=notice)], now=NOW
    )
    assert out["reason"] == "model Instant Pot not covered; notice lists Instant Pot Duo"


def test_hold_reason_for_a_vehicle_item_even_when_kind_is_none() -> None:
    vehicle = {"kind": "vehicle", "name": "Jeep Compass", "make": "jeep", "model": "compass"}
    out = decide(_block(item=vehicle), [_entry(True, None, "none", yours="", listed="")], now=NOW)
    assert out["decision"] == "hold" and out["reason"] == HOLD_YEAR


def test_hold_carries_the_verifier_reasoning() -> None:
    entry = _entry(None, True, reasoning="quote not found in source", verifier="none")
    out = decide(_block(), [entry], now=NOW)
    assert out["decision"] == "hold" and out["reason"] == "quote not found in source"
    assert out["verifier"] == "none" and out["covers_item"] is None


def test_alert_reason_outside_cdsco_has_no_cdsco_wording() -> None:
    vehicle = {
        "kind": "vehicle",
        "name": "Jeep Compass",
        "make": "jeep",
        "model": "compass",
        "year": 2022,
    }
    entry = _entry(
        True,
        True,
        "vehicle_year",
        yours="2022",
        listed="2022",
        notice=NHTSA_NOTICE,
        pk="nhtsa#22V248000",
    )
    out = decide(_block(item=vehicle), [entry], now=NOW)
    assert out["decision"] == "alert" and out["reason"] == "year 2022 within 2022"
    assert out["notice_pk"] == "nhtsa#22V248000"


def test_cdsco_wording_from_title_or_published_at() -> None:
    assert cdsco_wording(CDSCO_NOTICE) == "failed CDSCO quality test, JUL-2026 alert, row 12"
    assert (
        cdsco_wording({"published_at": "2025-06-01"}) == "failed CDSCO quality test, JUN-2025 alert"
    )
    assert cdsco_wording({}) == "failed CDSCO quality test"
    assert "recalled" not in cdsco_wording(CDSCO_NOTICE)


# --- no candidates / degraded --------------------------------------------------------------


def test_clear_when_no_candidates() -> None:
    out = decide(_block(0), None, now=NOW)
    assert out["decision"] == "clear"
    assert out["reason"] == f"no match in 4 sources as of {NOW}"
    assert out["notice_pk"] is None and out["range_check"] is None
    assert out["quoted_sentence"] == "" and out["confidence"] == 0 and out["verifier"] == "none"
    assert out["covers_item"] is None and out["candidates_considered"] == 0
    assert out["degraded"] is False
    assert "safe" not in out["reason"]
    # an empty verified list is the same as an absent one
    assert decide(_block(0), [], now=NOW)["decision"] == "clear"
    # the source count follows sources_searched
    five = decide(_block(0, sources=[*ALL_SOURCES, "siam"]), None, now=NOW)
    assert five["reason"] == f"no match in 5 sources as of {NOW}"


def test_clear_stamps_current_time_when_now_is_absent() -> None:
    out = decide(_block(0), None)
    stamp = out["reason"].removeprefix("no match in 4 sources as of ")
    assert ISO_Z.match(stamp), out["reason"]


def test_degraded_candidates_hold_verification_unavailable() -> None:
    out = decide(_block(0, degraded=True), None, now=NOW)
    assert out["decision"] == "hold" and out["reason"] == UNAVAILABLE
    assert out["notice_pk"] is None and out["range_check"] is None
    assert out["degraded"] is True and out["candidates_considered"] == 0
    # degraded wins even when something was verified
    also = decide(_block(1, degraded=True), [_entry(True, True)], now=NOW)
    assert also["decision"] == "hold" and also["reason"] == UNAVAILABLE


def test_candidates_without_verified_entries_hold_not_clear() -> None:
    out = decide(_block(2), None, now=NOW)
    assert out["decision"] == "hold" and out["reason"] == UNAVAILABLE and out["degraded"] is True


# --- selection --------------------------------------------------------------------------


def test_alert_beats_hold_beats_dismiss() -> None:
    dismiss = _entry(
        True, False, yours="DL-4472", listed="DL-4471", score=100, confidence=0.99, pk="n#d"
    )
    hold = _entry(None, None, "none", yours="", listed="", score=99, confidence=0.98, pk="n#h")
    alert = _entry(True, True, score=80, confidence=0.5, pk="n#a")
    out = decide(_block(3), [dismiss, hold, alert], now=NOW)
    assert out["decision"] == "alert" and out["notice_pk"] == "n#a"
    assert out["candidates_considered"] == 3
    out = decide(_block(2), [dismiss, hold], now=NOW)
    assert out["decision"] == "hold" and out["notice_pk"] == "n#h"
    out = decide(_block(1), [dismiss], now=NOW)
    assert out["decision"] == "dismiss" and out["notice_pk"] == "n#d"
    assert [
        o["decision"] for o in decide(_block(3), [dismiss, hold, alert], now=NOW)["outcomes"]
    ] == [
        "dismiss",
        "hold",
        "alert",
    ]


def test_highest_confidence_alert_wins_then_score() -> None:
    low = _entry(True, True, score=100, confidence=0.6, pk="n#low", quoted="low")
    high = _entry(True, True, score=85, confidence=0.95, pk="n#high", quoted="high")
    out = decide(_block(2), [low, high], now=NOW)
    assert out["notice_pk"] == "n#high" and out["quoted_sentence"] == "high"
    assert out["confidence"] == 0.95
    tie_a = _entry(True, True, score=90, confidence=0.9, pk="n#a")
    tie_b = _entry(True, True, score=95, confidence=0.9, pk="n#b")
    assert decide(_block(2), [tie_a, tie_b], now=NOW)["notice_pk"] == "n#b"


def test_highest_confidence_hold_wins() -> None:
    weak = _entry(
        None, None, "none", yours="", listed="", confidence=0.2, pk="n#weak", reasoning="weak"
    )
    strong = _entry(True, None, "batch", yours="", listed="FT5427", confidence=0.8, pk="n#strong")
    out = decide(_block(2), [weak, strong], now=NOW)
    assert out["notice_pk"] == "n#strong" and out["reason"] == HOLD_IDENTIFIER


def test_dismiss_of_the_highest_score_candidate() -> None:
    a = _entry(True, False, yours="DL-4472", listed="DL-4471", score=85, confidence=0.99, pk="n#a")
    b = _entry(
        False,
        True,
        score=97,
        confidence=0.3,
        pk="n#b",
        notice={**CDSCO_NOTICE, "product": "Dolo 650"},
    )
    out = decide(_block(2), [a, b], now=NOW)
    assert out["notice_pk"] == "n#b"
    assert out["reason"] == "model Paracetamol Tablets IP 650mg not covered; notice lists Dolo 650"


def test_verify_unavailable_placeholder_entry() -> None:
    """The ASL's VerifyUnavailable Pass has no notice_pk / notice: still a hold."""
    entry = {
        "candidate": {"notice_pk": CDSCO_PK, "score": 95, "matched_on": "brand+identifier"},
        "verify": {
            "covers_item": None,
            "quoted_sentence": "",
            "confidence": 0,
            "reasoning": "verification unavailable",
            "verifier": "none",
            "degraded": True,
        },
        "range_check": {
            "inside": None,
            "listed": "",
            "yours": "",
            "kind": "none",
            "degraded": True,
        },
    }
    out = decide_one(entry, ITEM)
    assert out["decision"] == "hold" and out["reason"] == UNAVAILABLE
    assert out["notice_pk"] == CDSCO_PK and out["verifier"] == "none" and out["confidence"] == 0.0
    full = decide(_block(1), [entry], now=NOW)
    assert (
        full["decision"] == "hold" and full["notice_pk"] == CDSCO_PK and full["degraded"] is False
    )


def test_malformed_entries_never_raise() -> None:
    entries = [{"candidate": None, "verify": "garbage", "range_check": 42}, "not a dict"]
    out = decide(_block(2), entries, now=NOW)  # type: ignore[arg-type]
    assert out["decision"] == "hold" and out["reason"] == UNAVAILABLE
    assert out["candidates_considered"] == 1
    assert decide(None, None, now=NOW)["decision"] == "clear"  # type: ignore[arg-type]


# --- handler ---------------------------------------------------------------------------------


def test_handler_with_verified_absent_is_clear() -> None:
    event = {"item_id": "med-1", "run": {"execution_arn": "arn:demo"}, "candidates": _block(0)}
    assert "verified" not in event
    out = handler(event, None)
    assert out["decision"] == "clear"
    stamp = out["reason"].removeprefix("no match in 4 sources as of ")
    assert ISO_Z.match(stamp), out["reason"]
    assert out["degraded"] is False and out["candidates_considered"] == 0


def test_handler_full_state_matches_decide() -> None:
    entries = [_entry(True, True), _entry(True, False, yours="X", listed="Y", pk="n#x")]
    event = {
        "item_id": "med-1",
        "run": {},
        "candidates": _block(2),
        "verified": entries,
        "now": NOW,
    }
    assert handler(event, None) == decide(_block(2), entries, now=NOW)
    assert handler(event, None)["decision"] == "alert"


def test_handler_never_raises() -> None:
    out = handler({}, None)
    assert out["decision"] == "hold" and out["reason"] == UNAVAILABLE and out["degraded"] is True
    assert handler(None, None)["decision"] == "hold"  # type: ignore[arg-type]
    assert handler({"candidates": "garbage", "verified": "garbage"}, None)["decision"] == "hold"
    out = handler({"candidates": _block(2), "verified": "garbage"}, None)
    assert out["decision"] == "hold" and out["reason"] == UNAVAILABLE


def test_handler_catches_internal_errors(monkeypatch) -> None:
    def boom(*args, **kwargs):  # noqa: ARG001
        raise RuntimeError("boom")

    monkeypatch.setattr(decide_mod, "decide", boom)
    out = handler({"candidates": _block(0)}, None)
    assert out["decision"] == "hold" and out["reason"] == UNAVAILABLE
    assert out["degraded"] is True and "RuntimeError: boom" in out["error"]


def test_the_verifiers_reasoning_travels_with_the_chosen_candidate():
    """Notify stores decide["reasoning"] on the case; it must be the verifier's full account."""
    from matcher import decide as decide_mod

    reasoning = (
        "brand 'Forgo Pharmaceuticals' matches; product 'Paracetamol Tablets IP 650mg' fuzzy 100; "
        "batch FT5427 in listed [FT5427]; quoted: 'Paracetamol Tablets IP 650mg | FT5427'"
    )
    block = {
        "item": {"kind": "medicine", "name": "Paracetamol Tablets IP 650mg", "batch": "FT5427"},
        "candidates": [{"notice_pk": "cdsco_nsq#x", "score": 100}],
        "count": 1,
        "sources_searched": ["cdsco_nsq", "cpsc", "nhtsa", "openfda"],
        "degraded": False,
    }
    verified = [
        {
            "candidate": {"notice_pk": "cdsco_nsq#x", "score": 100},
            "verify": {
                "notice_pk": "cdsco_nsq#x",
                "covers_item": True,
                "quoted_sentence": "Paracetamol Tablets IP 650mg | FT5427",
                "confidence": 0.95,
                "reasoning": reasoning,
                "verifier": "deterministic",
                "notice": {"product": "Paracetamol Tablets IP 650mg", "source": "cdsco_nsq"},
            },
            "range_check": {"inside": True, "listed": "FT5427", "yours": "FT5427", "kind": "batch"},
        }
    ]
    out = decide_mod.decide(block, verified, now="2026-09-19T00:00:00Z")
    assert out["decision"] == "alert"
    assert out["reasoning"] == reasoning
    empty = {**block, "candidates": [], "count": 0}
    cleared = decide_mod.decide(empty, None, now="2026-09-19T00:00:00Z")
    assert cleared["decision"] == "clear" and cleared["reasoning"] == ""
