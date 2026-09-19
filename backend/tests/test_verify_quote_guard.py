"""Verify quote guard (P04): ``quoted_sentence`` must be verbatim in ``raw_excerpt``.

Covers ``quote_is_verbatim``, the guard inside ``bedrock_verify`` (``common.bedrock.converse``
faked), reply coercion, and ``quote_from_excerpt`` -- the deterministic verifier's own quote.
"""

from __future__ import annotations

import json

import pytest

from common import bedrock
from matcher.verify import (
    QUOTE_NOT_FOUND,
    bedrock_verify,
    fixture_key_for,
    quote_from_excerpt,
    quote_is_verbatim,
)

RAW = (
    "Paracetamol Tablets IP 650mg | FT5427 | Oct-2025 | Sep-2027 | Forgo Pharmaceuticals, 27, "
    "DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103 | The sample does not "
    "conforms to the I.P. with respect to Dissolution Test. | State Lab | DTL Bikaner | JUL-2026"
)
FAILED_TEST = "The sample does not conforms to the I.P. with respect to Dissolution Test."
NOTICE = {
    "pk": "cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713",
    "source": "cdsco_nsq",
    "notice_id": "JUL-2026-cdsco_portal-b75cfffe3713",
    "adapter": "cdsco_portal",
    "title": "Paracetamol Tablets IP 650mg — failed CDSCO quality test, JUL-2026 alert, row 12",
    "product": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "brand_lc": "forgo pharmaceuticals",
    "model": None,
    "batches": ["FT5427"],
    "serial_ranges": [],
    "vehicles": [],
    "hazard_or_failed_test": FAILED_TEST,
    "published_at": "2026-07-01",
    "url": "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
    "raw_excerpt": RAW,
}
ITEM = {
    "pk": "user#i1",
    "item_id": "i1",
    "kind": "medicine",
    "name": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batch": "FT5427",
}
NHTSA_RAW = (
    "Hyundai Motor America (Hyundai) is recalling certain 2020-2022 Venue vehicles. In the "
    "event of a crash, the front seat belt pretensioners may explode upon deployment.\n"
    "An exploding seat belt pretensioner can project metal fragments into the vehicle.\n"
    "Dealers will secure the seat belt pretensioners with a cap, free of charge."
)


def _fake_converse(monkeypatch: pytest.MonkeyPatch, text: str) -> list[dict]:
    calls: list[dict] = []

    def fake(kind, prompt, **kw):
        calls.append({"kind": kind, "prompt": prompt, **kw})
        return {"text": text, "model_id": "fake", "region": "ap-south-1", "demo": False}

    monkeypatch.setattr(bedrock, "converse", fake)
    return calls


def _reply(**fields) -> str:
    return json.dumps(fields)


# --- quote_is_verbatim -------------------------------------------------------------------


@pytest.mark.parametrize(
    "quoted",
    [
        "FT5427",
        "Paracetamol Tablets IP 650mg | FT5427",
        "FT5427  |  Oct-2025",  # whitespace runs collapse
        "with respect to\nDissolution Test.",  # line-wrapped PDF excerpt
        RAW,
    ],
)
def test_quote_is_verbatim_positive(quoted: str) -> None:
    assert quote_is_verbatim(quoted, RAW) is True


@pytest.mark.parametrize(
    "quoted",
    [
        "paracetamol tablets ip 650mg",  # case change
        "batch FT5427 failed the dissolution test",  # paraphrase
        "The sample does not conform to the I.P.",  # grammar / punctuation edit
        "FT5428",
        "",
        None,
    ],
)
def test_quote_is_verbatim_negative(quoted) -> None:
    assert quote_is_verbatim(quoted, RAW) is False


def test_quote_is_verbatim_empty_source() -> None:
    assert quote_is_verbatim("FT5427", "") is False
    assert quote_is_verbatim("FT5427", None) is False


# --- guard inside bedrock_verify ---------------------------------------------------------


def test_non_substring_quote_voids_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_converse(
        monkeypatch,
        _reply(
            covers_item=True,
            quoted_sentence="Batch FT5427 of Paracetamol failed the dissolution test",
            confidence=0.97,
            reasoning="same product and brand",
        ),
    )
    out = bedrock_verify(ITEM, NOTICE)
    assert out["covers_item"] is None
    assert out["reasoning"] == QUOTE_NOT_FOUND == "quote not found in source"
    assert out["quoted_sentence"] == ""
    assert out["verifier"] == "bedrock"
    assert out["confidence"] == 0.97  # the model's confidence is kept for the audit trail


def test_verbatim_quote_keeps_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_converse(
        monkeypatch,
        _reply(
            covers_item=True,
            quoted_sentence="Paracetamol Tablets IP 650mg | FT5427",
            confidence=0.93,
            reasoning="notice names the same product from Forgo Pharmaceuticals",
        ),
    )
    out = bedrock_verify(ITEM, NOTICE)
    assert out["covers_item"] is True
    assert out["quoted_sentence"] == "Paracetamol Tablets IP 650mg | FT5427"
    assert out["confidence"] == 0.93
    assert out["reasoning"].startswith("notice names the same product")
    assert out["verifier"] == "bedrock"


def test_covers_false_needs_a_quote_too(monkeypatch: pytest.MonkeyPatch) -> None:
    """A negative verdict without a verbatim quote is unsupported -> null (hold, not dismiss)."""
    _fake_converse(monkeypatch, _reply(covers_item=False, quoted_sentence="", confidence=0.8))
    out = bedrock_verify(ITEM, NOTICE)
    assert out["covers_item"] is None and out["reasoning"] == QUOTE_NOT_FOUND


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [("null", None), ("true", True), ("false", False), ("TRUE", True), ("maybe", None), (1, None)],
)
def test_covers_item_strings_coerced(monkeypatch: pytest.MonkeyPatch, raw_value, expected) -> None:
    _fake_converse(
        monkeypatch,
        _reply(covers_item=raw_value, quoted_sentence="FT5427", confidence=0.6, reasoning="r"),
    )
    out = bedrock_verify(ITEM, NOTICE)
    assert out["covers_item"] is expected
    assert out["verifier"] == "bedrock"
    if expected is None:
        assert out["reasoning"] == "r"  # null verdicts are not quote-guarded


@pytest.mark.parametrize(
    ("raw_value", "expected"),
    [(1.7, 1.0), (-3, 0.0), ("abc", 0.5), (None, 0.5), ("0.42", 0.42), (0.5, 0.5)],
)
def test_confidence_clamped(monkeypatch: pytest.MonkeyPatch, raw_value, expected) -> None:
    fields = {"covers_item": True, "quoted_sentence": "FT5427", "reasoning": "r"}
    if raw_value is not None:
        fields["confidence"] = raw_value
    _fake_converse(monkeypatch, _reply(**fields))
    assert bedrock_verify(ITEM, NOTICE)["confidence"] == expected


def test_non_string_quote_is_treated_as_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_converse(monkeypatch, _reply(covers_item=True, quoted_sentence=["FT5427"]))
    out = bedrock_verify(ITEM, NOTICE)
    assert out["covers_item"] is None and out["quoted_sentence"] == ""


# --- quote_from_excerpt -------------------------------------------------------------------


def test_quote_from_excerpt_portal_row() -> None:
    quote = quote_from_excerpt(NOTICE, ITEM)
    assert quote.startswith("Paracetamol Tablets IP 650mg")
    assert "FT5427" in quote
    assert quote.endswith(FAILED_TEST)
    assert "State Lab" not in quote  # the span stops at the last located field
    assert quote_is_verbatim(quote, RAW)


def test_quote_from_excerpt_case_insensitive_maps_back_to_source_case() -> None:
    notice = {**NOTICE, "product": "PARACETAMOL TABLETS IP 650MG", "hazard_or_failed_test": ""}
    quote = quote_from_excerpt(notice, ITEM)
    assert quote == "Paracetamol Tablets IP 650mg | FT5427"
    assert quote_is_verbatim(quote, RAW)


def test_quote_from_excerpt_line_wrapped_source() -> None:
    wrapped = RAW.replace("Dissolution Test.", "Dissolution\nTest.")
    quote = quote_from_excerpt({**NOTICE, "raw_excerpt": wrapped}, ITEM)
    assert quote.endswith("Dissolution\nTest.") and quote_is_verbatim(quote, wrapped)


def test_quote_from_excerpt_sentence_fallback_for_vehicle_notice() -> None:
    notice = {
        "product": "Hyundai Venue",
        "batches": [],
        "hazard_or_failed_test": "SEAT BELTS:FRONT: An exploding seat belt pretensioner",
        "raw_excerpt": NHTSA_RAW,
    }
    item = {"kind": "vehicle", "name": "My car", "make": "Hyundai", "model": "Venue"}
    quote = quote_from_excerpt(notice, item)
    assert quote == "Hyundai Motor America (Hyundai) is recalling certain 2020-2022 Venue vehicles"
    assert quote_is_verbatim(quote, NHTSA_RAW)


def test_quote_from_excerpt_first_word_of_item_name() -> None:
    notice = {"product": "Zzz", "batches": [], "hazard_or_failed_test": "", "raw_excerpt": RAW}
    item = {"kind": "medicine", "name": "Paracetamol 650", "brand": "Someone Else"}
    quote = quote_from_excerpt(notice, item)
    assert quote == "Paracetamol Tablets IP 650mg" and quote_is_verbatim(quote, RAW)


def test_quote_from_excerpt_last_resort_and_empty() -> None:
    raw = "x" * 600
    notice = {"product": "Zzz", "batches": [], "hazard_or_failed_test": "", "raw_excerpt": raw}
    item = {"kind": "other", "name": "Qq", "brand": None}
    quote = quote_from_excerpt(notice, item)
    assert quote == raw[:240] and quote_is_verbatim(quote, raw)
    assert quote_from_excerpt({**notice, "raw_excerpt": ""}, item) == ""
    assert quote_from_excerpt({**notice, "raw_excerpt": "   "}, item) == ""
    assert quote_from_excerpt({}, item) == ""


def test_fixture_key_for() -> None:
    # derived fixture key (public CDSCO row id + 12-hex content hash), not a credential
    expected = "notice-cdsco_nsq_JUL-2026-cdsco_portal-b75cfffe3713"  # pragma: allowlist secret
    assert fixture_key_for(NOTICE["pk"]) == expected
    assert fixture_key_for("nhtsa#22V458000") == "notice-nhtsa_22V458000"
    assert fixture_key_for("a b/c#d") == "notice-a_b_c_d"
    assert len(fixture_key_for("x" * 200)) == len("notice-") + 80
    assert fixture_key_for(None) == "notice-"


def test_a_bare_product_match_widens_to_the_source_line_verbatim() -> None:
    """NHTSA: no batch, and the hazard field carries a component prefix the excerpt never has, so
    only "Jeep Compass" matches. The quote must be the source's own summary line, not two words."""
    summary = (
        "Chrysler (FCA US, LLC) is recalling certain 2022 Jeep Compass vehicles. "
        "The front seat head restraints were not welded properly."
    )
    raw = summary + "\nImproperly welded head restraints can increase the risk of injury."
    notice = {
        "product": "Jeep Compass",
        "batches": [],
        "hazard_or_failed_test": "SEATS:FRONT ASSEMBLY:HEAD RESTRAINT: Improperly welded",
        "raw_excerpt": raw,
    }
    quote = quote_from_excerpt(notice, {"kind": "vehicle", "name": "Jeep Compass"})
    assert quote == summary  # the whole line, not "Jeep Compass"
    assert quote_is_verbatim(quote, raw)
    assert "head restraints were not welded" in quote

    # a very long line is cut at a sentence end and stays a verbatim prefix of that line
    long_line = "Maker is recalling certain Jeep Compass vehicles. " + "Filler sentence here. " * 40
    cut = quote_from_excerpt({**notice, "raw_excerpt": long_line}, {"name": "x"})
    assert len(cut) <= 400 and cut.endswith(".") and long_line.startswith(cut)
    assert quote_is_verbatim(cut, long_line)
