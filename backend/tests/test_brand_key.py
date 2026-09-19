"""common.brands.brand_key: one deterministic key for however a company name is spelled."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from common.brands import NOISE_TOKENS, brand_key
from common.cdsco import brand_from_manufacturer

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "cdsco"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # the three cases pinned in the P05b brief
        ("M/s. Tam-Bran Pharmaceuticals Pvt. Ltd.", "tam-bran pharmaceuticals"),
        ("Finecure Pharmaceuticals Ltd.", "finecure pharmaceuticals"),
        ("IPCA Laboratories Limited", "ipca laboratories"),  # "laboratories" is identity: kept
        # the same company, spelled the ways CDSCO really spells it
        ("Alencure Biotech Pvt. Ltd.", "alencure biotech"),
        ("Alencure Biotech Pvt.Ltd.", "alencure biotech"),
        ("Avalon Medicines Private Limited", "avalon medicines"),
        ("COTEC HEALTHCARE Pvt. LTD.", "cotec healthcare"),
        ("Cotec Healthcare Pvt. Ltd", "cotec healthcare"),
        ("Forgo Pharmaceuticals (P) Ltd.", "forgo pharmaceuticals"),  # (P) = Private
        ("Forgo Pharmaceuticals", "forgo pharmaceuticals"),
        ("Cris Pharma (India) Ltd.", "cris pharma"),
        # "&" -> "and", initials join, apostrophes vanish, hyphens survive
        ("Martin & Brown Bio-Sciences Pvt.Ltd.", "martin and brown bio-sciences"),
        ("Akums Drugs and Pharmaceuticals Ltd", "akums drugs and pharmaceuticals"),
        ("J.B. Chemicals & Pharmaceuticals Ltd.", "jb chemicals and pharmaceuticals"),
        ("JB Chemicals & Pharmaceuticals", "jb chemicals and pharmaceuticals"),
        ("Dr. Reddy's Laboratories Ltd.", "dr reddys laboratories"),
        ("Sun Pharmaceutical Industries Ltd.", "sun pharmaceutical"),
        ("Ningbo Lanchez E-Commerce Co., Ltd.", "ningbo lanchez e-commerce"),
        ("Tam–Bran Pharmaceuticals", "tam-bran pharmaceuticals"),  # en dash -> hyphen
        ("  Jeep  ", "jeep"),
        # US legal forms: LLC is a legal suffix exactly like Ltd / LLP (333 live CPSC/openFDA rows)
        ("Char-Broil LLC", "char-broil"),
        ("VidaXL LLC", "vidaxl"),
        ("AlEn USA L.L.C.", "alen usa"),  # dotted form
        ("Acme L. L. P.", "acme"),
        # "(P) Ltd." written without the parentheses
        ("Danish Healthcare P Ltd.", "danish healthcare"),
        ("Premier P. LTD", "premier"),
        ("Danish Healthcare (P) Ltd.", "danish healthcare"),
        ("Micro Labs Limited", "micro labs"),
    ],
)
def test_brand_key(raw: str, expected: str) -> None:
    assert brand_key(raw) == expected


def test_blank_and_all_noise_inputs_have_no_key() -> None:
    """ "" means "no brand": the verifier must not treat two all-legal-word strings as a brand
    match, and schemas.Notice stores "unknown" (DynamoDB rejects an empty GSI key)."""
    for raw in ("", None, "   ", "Pvt. Ltd.", "(P) Ltd.", "M/s.", "Industries Ltd"):
        assert brand_key(raw) == "", raw


def test_single_letters_are_identity_not_noise() -> None:
    assert brand_key("P&G Health Ltd") == "p and g health"  # a bare "p" must never be dropped
    assert brand_key("P & G Health Limited") == "p and g health"
    assert brand_key("XYZ Pharma (P) Ltd.") == "xyz pharma"  # the parenthetical form still goes
    assert brand_key("P Square Pharma Ltd") == "p square pharma"  # P not followed by Ltd stays
    assert brand_key("Whele LLC d/b/a Perch") == "whele dba perch"  # d/b/a: see docs/EVAL.md


def test_is_idempotent_and_deterministic() -> None:
    for raw in ("M/s. Tam-Bran Pharmaceuticals Pvt. Ltd.", "J.B. Chemicals & Pharmaceuticals Ltd."):
        once = brand_key(raw)
        assert brand_key(once) == once == brand_key(raw)


def test_typed_with_or_without_the_suffix_is_the_same_key() -> None:
    """The P05 false negative: 'Finecure Pharmaceuticals' must find 'Finecure ... Ltd.'."""
    assert brand_key("Finecure Pharmaceuticals") == brand_key("Finecure Pharmaceuticals Ltd.")
    assert brand_key("finecure pharmaceuticals pvt ltd") == brand_key("FINECURE PHARMACEUTICALS")


def test_identity_words_are_not_noise() -> None:
    for word in ("laboratories", "labs", "pharmaceuticals", "pharma", "healthcare", "biotech"):
        assert word not in NOISE_TOKENS
    assert brand_key("Zenith Laboratories") != brand_key("Zenith Pharmaceuticals")


def test_on_real_cdsco_data_merged_names_are_the_same_company() -> None:
    """Every key shared by several display brands must be one company spelled differently --
    i.e. the names differ only in legal form, case and punctuation -- never two companies."""
    rows = []
    for name in ("nsq_jul2026_all.json", "nsq_mar2026_all.json"):
        rows += json.loads((FIXTURES / name).read_text(encoding="latin-1"))["aaData"]
    brands = {brand_from_manufacturer(r["str_manufactured_by"]) for r in rows}
    groups: dict[str, set[str]] = {}
    for brand in brands:
        key = brand_key(brand)
        assert key, brand  # no empty keys on real data
        groups.setdefault(key, set()).add(brand)
    merged = {k: v for k, v in groups.items() if len(v) > 1}
    assert len(merged) >= 20  # CDSCO really does spell the same firm several ways

    # Independent of brand_key on purpose (a check written in terms of brand_key could never
    # fail): de-punctuate the DISPLAY name, then delete legal forms as plain substrings. If
    # brand_key ever merged two real companies -- say by dropping an identity word such as
    # "pharmaceuticals" -- their residues would differ here and this fails.
    def residue(name: str) -> str:
        text = name.lower().strip()
        text = re.sub(r"\([^)]*\)", "", text).replace("&", "and")
        text = re.sub(r"^m\s*/\s*s\.?", "", text)
        text = re.sub(r"\bp\.?\s+(?=(?:ltd|limited)\b)", "", text)  # "P Ltd" = "(P) Ltd"
        text = "".join(ch for ch in text if ch.isalnum())
        for legal in ("privatelimited", "pvtltd", "limited", "private", "pvt", "ltd", "llp", "llc"):
            text = text.removesuffix(legal)
        return text

    for key, names in merged.items():
        assert len({residue(n) for n in names}) == 1, (key, sorted(names))
