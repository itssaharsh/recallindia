"""common.matching (stdlib) and matcher.textmatch (rapidfuzz, difflib fallback)."""

from __future__ import annotations

import pytest

from common.matching import (
    brand_variants,
    brands_match,
    identifier_tokens,
    norm_identifier,
    normalise_brand,
    normalise_text,
)
from matcher import textmatch

# fixture-shaped item / notice (fixtures/cdsco/nsq_jul2026_all.json row -> Notice)
ITEM = {
    "pk": "user#i1",
    "item_id": "i1",
    "kind": "medicine",
    "name": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batch": "FT5427",
}
NOTICE = {
    "pk": "cdsco_nsq#JUL-2026-cdsco_portal-abc",
    "source": "cdsco_nsq",
    "adapter": "cdsco_portal",
    "title": "Paracetamol Tablets IP 650mg failed CDSCO quality test",
    "product": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "brand_lc": "forgo pharmaceuticals",
    "model": None,
    "batches": ["FT5427"],
    "hazard_or_failed_test": "Dissolution",
    "published_at": "2026-07-01",
}


# --- normalise_text ---------------------------------------------------------------


def test_normalise_text_lowercases_collapses_and_keeps_inner_punctuation() -> None:
    assert normalise_text("  Paracetamol   Tablets\tIP 650mg ") == "paracetamol tablets ip 650mg"
    assert normalise_text("Paracetamol Tablets I.P. 650mg, (Forgo)") == (
        "paracetamol tablets i.p 650mg forgo"
    )
    assert normalise_text("Martin & Brown Bio-Sciences Pvt.Ltd.") == (
        "martin brown bio-sciences pvt.ltd"
    )
    assert normalise_text("M/s. Zenith") == "m/s zenith"
    assert normalise_text("Dr. Reddy's") == "dr reddys"
    assert normalise_text("ＰＡＲＡ ６５０") == "para 650"  # NFKC folds full-width forms
    assert normalise_text("") == "" and normalise_text(None) == ""
    assert normalise_text("--- / ...") == ""


# --- brands -------------------------------------------------------------------------


def test_normalise_brand_is_the_brand_key() -> None:
    """P05b: one definition. normalise_brand delegates to common.brands.brand_key, so the stored
    ``brand_lc``, the candidates query and the verifier's comparison cannot drift apart."""
    from common.brands import NOISE_TOKENS, brand_key

    for raw in ("M/s. Forgo Pharmaceuticals Pvt. Ltd.", "Zenith Drugs Ltd.", "Acme Corp", None):
        assert normalise_brand(raw) == brand_key(raw)
    assert normalise_brand("M/s. Forgo Pharmaceuticals Pvt. Ltd.") == "forgo pharmaceuticals"
    assert normalise_brand("Forgo Pharmaceuticals") == "forgo pharmaceuticals"
    assert normalise_brand("Zenith Drugs Ltd.") == "zenith drugs"
    assert normalise_brand("Havells India Private Limited") == "havells india"
    assert normalise_brand("Acme Corp") == "acme"
    # changed by the P05b brief: "&" -> "and", and "industries" is now a noise token
    assert (
        normalise_brand("Martin & Brown Bio-Sciences Pvt.Ltd.") == "martin and brown bio-sciences"
    )
    assert normalise_brand("Sun Pharmaceutical Industries Limited") == "sun pharmaceutical"
    # unchanged on purpose: all-legal-words is "no brand", so the verifier never matches on it
    assert normalise_brand("Pvt. Ltd.") == "" and normalise_brand(None) == ""
    for word in ("pharmaceuticals", "labs", "laboratories", "india"):
        assert word not in NOISE_TOKENS  # identity words
    for word in (
        "m/s",
        "ms",
        "pvt",
        "private",
        "ltd",
        "limited",
        "llp",
        "inc",
        "co",
        "corp",
        "company",
        "corporation",
        "industries",
    ):
        assert word in NOISE_TOKENS


def test_brand_variants_are_the_key_then_its_first_token() -> None:
    """P05b: candidates query brand_key(brand), then the first token -- nothing else."""
    assert brand_variants("Forgo Pharmaceuticals Pvt. Ltd.") == ["forgo pharmaceuticals", "forgo"]
    assert brand_variants("  Forgo Pharmaceuticals ") == ["forgo pharmaceuticals", "forgo"]
    # the P05 false negative: with or without the suffix, the lookup keys are identical
    assert brand_variants("Finecure Pharmaceuticals") == brand_variants(
        "Finecure Pharmaceuticals Ltd."
    )
    assert brand_variants("Honda") == ["honda"]
    assert brand_variants("") == [] and brand_variants(None) == []
    assert brand_variants("Pvt Ltd") == []  # no brand identity -> nothing to look up


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ("Forgo Pharmaceuticals", "M/s. Forgo Pharmaceuticals Pvt. Ltd.", True),
        ("Zenith Drugs Ltd.", "Zenith Drugs", True),
        ("Zenith Drugs", "Zenith Drugs Ltd.", True),
        ("Forgo", "Forgo Pharmaceuticals", True),  # one token set contains the other
        ("Forgo Pharmaceuticals", "Forgo Pharma", True),  # first tokens equal, >= 4 chars
        ("Honda", "Hyundai", False),
        ("Honda", "Honda Cars India Ltd", True),
        ("Sun Pharma", "Sun Pharmaceutical Industries", False),  # "sun" is too short a hook
        ("Dr. Reddy's Laboratories", "Dr Reddys Laboratories Ltd", True),
        ("Pvt Ltd", "Pvt Ltd", False),  # nothing left to compare
        ("", "Forgo", False),
        (None, None, False),
    ],
)
def test_brands_match(a, b, expected) -> None:
    assert brands_match(a, b) is expected


# --- identifiers ---------------------------------------------------------------------


def test_identifier_tokens_are_case_space_and_hyphen_insensitive() -> None:
    assert identifier_tokens("DL-4471", "dl 4471") == {"DL4471"}
    assert identifier_tokens("DL-4471", "DL-4472") == {"DL4471", "DL4472"}
    assert identifier_tokens(None, "", "  ", "FT 5427") == {"FT5427"}
    assert identifier_tokens() == set()
    assert norm_identifier("dl–4471") == "DL4471"  # en dash
    assert norm_identifier(" ft5427 ") == "FT5427"
    assert norm_identifier("A/12") == "A/12"  # only whitespace and hyphens are dropped
    assert norm_identifier(None) == ""


# --- textmatch ----------------------------------------------------------------------


def test_score_is_token_set_ratio_on_normalised_text() -> None:
    assert textmatch.ENGINE == "rapidfuzz"
    assert textmatch.score("Paracetamol Tablets IP 650mg", "Paracetamol Tablets IP 650 mg") >= 90
    assert textmatch.score("Paracetamol Tablets IP 650mg", "paracetamol tablets ip 650mg") == 100
    assert textmatch.score("Tablets Paracetamol", "Paracetamol Tablets") == 100  # order-free
    assert textmatch.score("Paracetamol Tablets IP 650mg", "Prestige Pressure Cooker 5L") < 50
    assert textmatch.score("", "Paracetamol") == 0 and textmatch.score(None, None) == 0


def test_score_falls_back_to_difflib_without_rapidfuzz(monkeypatch) -> None:
    monkeypatch.setattr(textmatch, "_fuzz", None)
    assert textmatch.score("Paracetamol Tablets IP 650mg", "Paracetamol Tablets IP 650 mg") >= 90
    assert textmatch.score("Paracetamol Tablets IP 650mg", "Prestige Pressure Cooker 5L") < 50
    assert textmatch.score("", "x") == 0


def test_product_score_on_a_fixture_shaped_item_and_notice() -> None:
    assert textmatch.product_score(ITEM, NOTICE) == 100
    # the near-miss is the same product with another batch: still a candidate (>= 80)
    assert textmatch.product_score({**ITEM, "batch": "FT5428"}, NOTICE) >= 80
    # a strip typed with a spacing/unit variant still clears the threshold
    assert textmatch.product_score({**ITEM, "name": "Paracetamol Tablet IP 650 mg"}, NOTICE) >= 80
    # unrelated household items do not
    assert textmatch.product_score({"name": "Prestige Pressure Cooker 5L"}, NOTICE) < 80
    assert textmatch.product_score({"name": "Dolo 650"}, NOTICE) < 80
    # model pairs count too, and empty fields are skipped rather than scored
    assert (
        textmatch.product_score(
            {"name": "Instant Pot", "model": "DUO60"},
            {"product": "Instant Pot Duo pressure cooker", "model": "DUO60"},
        )
        == 100
    )
    assert textmatch.product_score({"name": None, "model": None}, NOTICE) == 0
    assert textmatch.product_score({}, {}) == 0


def test_vehicle_matches_on_make_and_model_only() -> None:
    notice = {
        "vehicles": [
            {"make": "HONDA", "model": "City", "year_from": 2023, "year_to": 2024},
            {"make": "Honda", "model": "Accord", "year_from": 2024, "year_to": 2024},
        ]
    }
    assert textmatch.vehicle_matches({"make": "Honda", "model": "City", "year": 2021}, notice)
    assert textmatch.vehicle_matches({"make": " honda ", "model": "ACCORD"}, notice)
    assert not textmatch.vehicle_matches({"make": "Honda", "model": "Civic"}, notice)
    assert not textmatch.vehicle_matches({"make": "Hyundai", "model": "City"}, notice)
    assert not textmatch.vehicle_matches({"make": "Honda"}, notice)  # model required
    assert not textmatch.vehicle_matches({"make": "Honda", "model": "City"}, {"vehicles": []})
    assert not textmatch.vehicle_matches({"make": "Honda", "model": "City"}, {})
