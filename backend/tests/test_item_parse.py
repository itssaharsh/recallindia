"""api.item_parse: deterministic readers for pasted lines and strip photos (no model decides)."""

from __future__ import annotations

import pytest

from api.item_parse import (
    detect_kind,
    looks_like_batch,
    normalise_month,
    parse_paste_line,
    parse_strip,
)

FINECURE = "Pantoprazole Tablets IP Finecure Pharmaceuticals PEP5001"
ORG = [{"Type": "ORGANIZATION", "Text": "Finecure Pharmaceuticals", "Score": 0.97,
        "BeginOffset": 24, "EndOffset": 48}]  # fmt: skip


# --- tokens ----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("token", "expected"),
    [("PEP5001", True), ("FT5427", True), ("1-3098", True), ("230145", True), ("DL-4471", True),
     ("650", False), ("650mg", False), ("5%w/v", False), ("2026", False), ("IP", False),
     ("ZZ0000", True), ("AB", False), ("TOOLONGBATCHCODE12345", False)],
)  # fmt: skip
def test_looks_like_batch(token: str, expected: bool) -> None:
    assert looks_like_batch(token) is expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("11/2025", "2025-11"), ("NOV.2025", "2025-11"), ("Nov-25", "2025-11"),
     ("SEP 2027", "2027-09"), ("10/25", "2025-10"), ("09-2027", "2027-09"), ("13/2025", None),
     ("soon", None), (None, None)],
)  # fmt: skip
def test_normalise_month(raw, expected) -> None:
    assert normalise_month(raw) == expected


@pytest.mark.parametrize(
    ("text", "kind"),
    [(FINECURE, "medicine"), ("Crocin Advance 500mg", "medicine"), ("Jeep Compass 2022", "vehicle"),
     ("Maruti Suzuki Swift DL8CAF5031", "vehicle"), ("Bajaj Majesty DX-6 Dry Iron", "appliance"),
     ("Bajaj Iron", "appliance"), ("Havells Efficiencia Neo Ceiling Fan", "appliance"),
     ("Hero Splendor bike", "vehicle"), ("Some random thing", "other")],
)  # fmt: skip
def test_detect_kind(text: str, kind: str) -> None:
    assert detect_kind(text) == kind


# --- pasted lines ----------------------------------------------------------------------------


def test_the_acceptance_line_with_comprehend() -> None:
    row = parse_paste_line(FINECURE, ORG)
    assert row["kind"] == "medicine" and row["brand"] == "Finecure Pharmaceuticals"
    assert row["batch"] == "PEP5001" and row["name"] == "Pantoprazole Tablets IP"
    assert row["confidence"] >= 0.9 and row["needs_confirm"] is False


def test_the_acceptance_line_without_comprehend_asks_for_a_tap() -> None:
    row = parse_paste_line(FINECURE, [])
    assert row["brand"] == "Finecure Pharmaceuticals"  # the company-word fallback
    assert row["batch"] == "PEP5001" and row["name"] == "Pantoprazole Tablets IP"
    assert row["needs_confirm"] is True and row["confidence"] < 0.8
    assert any("company word" in w for w in row["why"])


def test_labelled_batch_and_order_do_not_matter() -> None:
    row = parse_paste_line(
        "Batch FT5427 Paracetamol Tablets IP 650mg Forgo Pharmaceuticals",
        [{"Type": "ORGANIZATION", "Text": "Forgo Pharmaceuticals", "Score": 0.96}],
    )
    assert row["batch"] == "FT5427" and row["brand"] == "Forgo Pharmaceuticals"
    assert row["name"] == "Paracetamol Tablets IP 650mg"


def test_strength_is_never_the_batch_and_a_missing_batch_needs_confirm() -> None:
    row = parse_paste_line("Crocin Advance 500mg Tablets GSK", [])
    assert row["batch"] is None and row["kind"] == "medicine"
    assert row["needs_confirm"] is True and any("no batch" in w for w in row["why"])


def test_hyphenated_numeric_cdsco_batch_and_hyphenated_brand() -> None:
    row = parse_paste_line("Dextrose Injection I.P. 5%w/v 1-3098 Tam-Bran Pharmaceuticals", [])
    assert row["batch"] == "1-3098" and row["brand"] == "Tam-Bran Pharmaceuticals"


def test_appliance_model_number_is_not_a_batch() -> None:
    row = parse_paste_line(
        "Bajaj Majesty DX-6 Dry Iron", [{"Type": "ORGANIZATION", "Text": "Bajaj", "Score": 0.9}]
    )
    assert row["kind"] == "appliance" and row["model"] == "DX-6" and row["batch"] is None
    assert row["brand"] == "Bajaj" and "Iron" in row["name"]


def test_vehicle_line() -> None:
    row = parse_paste_line("Jeep Compass 2022 MH12AB1234", [])
    assert (row["kind"], row["make"], row["model"], row["year"], row["reg_no"]) == (
        "vehicle", "jeep", "compass", 2022, "MH12AB1234",
    )  # fmt: skip
    assert row["brand"] == "Jeep" and row["name"] == "Jeep Compass"


def test_nothing_recognisable_needs_confirm() -> None:
    row = parse_paste_line("thing from the market", [])
    assert row["brand"] is None and row["needs_confirm"] is True


# --- strip photos ----------------------------------------------------------------------------


def _line(text: str, top: float, height: float = 0.025, confidence: float = 0.99) -> dict:
    return {"text": text, "top": top, "left": 0.1, "height": height, "width": 0.6,
            "confidence": confidence}  # fmt: skip


STRIP = [
    _line("PARACETAMOL TABLETS IP", 0.08, height=0.08),
    _line("650 mg", 0.18, height=0.05),
    _line("Each uncoated tablet contains:", 0.30),
    _line("Paracetamol IP 650 mg", 0.33),
    _line("B.No. FT5427", 0.50, confidence=0.98),
    _line("Mfg. Dt. 10/2025", 0.54),
    _line("Exp. Dt. SEP.2027", 0.58),
    _line("M.R.P. Rs. 30.91 per 15 tablets", 0.62),
    _line("Mfd. by: Forgo Pharmaceuticals, 27, DIC Ind Area", 0.70, confidence=0.95),
    _line("Barotiwala, Solan (HP) 174103", 0.74),
    _line("Mfg. Lic. No. MB/07/123", 0.78),
]


def test_strip_reads_every_field_from_its_label() -> None:
    out = parse_strip(STRIP)
    f = out["fields"]
    assert f["name"] == "PARACETAMOL TABLETS IP 650 mg"  # the large line + its strength line
    assert f["batch"] == "FT5427" and f["brand"] == "Forgo Pharmaceuticals"
    assert (f["mfg_date"], f["exp_date"]) == ("2025-10", "2027-09")
    assert out["confidence"]["batch"] == 0.98 and out["missing"] == []
    assert out["needs_confirm"] is True  # a photo read is always confirmed with one tap


def test_strip_label_and_value_on_separate_lines() -> None:
    lines = [
        _line("Pantoprazole Gastro-resistant Tablets IP", 0.1, height=0.07),
        _line("Batch No.", 0.5),
        _line("PEP5001", 0.53),
        _line("Exp: 12/2027", 0.6),
    ]
    out = parse_strip(lines)
    assert out["fields"]["batch"] == "PEP5001" and out["fields"]["exp_date"] == "2027-12"
    assert out["fields"]["brand"] is None and out["missing"] == ["brand"]


def test_licence_number_is_not_the_batch() -> None:
    out = parse_strip(
        [_line("Cetirizine Tablets IP", 0.1, 0.06), _line("Mfg. Lic. No. MB/07/123", 0.5)]
    )
    assert out["fields"]["batch"] is None and "batch" in out["missing"]


def test_empty_photo() -> None:
    out = parse_strip([])
    assert out["fields"]["name"] == "" and set(out["missing"]) == {"name", "batch", "brand"}
