"""pollers.identifiers: conservative regex extraction of serials, lots/batches and models."""

from __future__ import annotations

import pytest

from pollers.identifiers import (
    extract_batches,
    extract_models,
    extract_serial_ranges,
    mentions_all_lots,
)

SERIAL_CASES = [
    ("serial numbers 4000 through 5200", ["4000-5200"]),
    ("Serial Numbers 4000 to 5200 are affected", ["4000-5200"]),
    ("serial numbers beginning with 24", ["starting with 24"]),
    ("serial numbers between A12 and A99", ["A12-A99"]),
    ("serial numbers from 250402212 to 260402893", ["250402212-260402893"]),
    ("serial number range: SQC200034980 - SQC202319171", ["SQC200034980-SQC202319171"]),
    (
        "serial number 0000104-0601120 and serial number 0000116-0000230",
        ["0000104-0601120", "0000116-0000230"],
    ),
    ('serial numbers beginning with "M/L" or "S/M"', ["starting with M/L", "starting with S/M"]),
    ("serial numbers with the prefix PR01 and", ["starting with PR01"]),
    (
        "Serial Number Ranges C3753 - C77735 S73202 - S8442 HA00001 - HA14873",
        ["C3753-C77735", "S73202-S8442", "HA00001-HA14873"],
    ),
    ("serial number WF2236430065 is printed on the label", ["WF2236430065"]),
    ("serial numbers VF52200000-VF54399999.The label", ["VF52200000-VF54399999"]),
    # negatives: never invent a range
    ("no serial numbers are affected", []),
    ("The serial number is located under the mouthpiece", []),
    ("serial numbers below have motors that are included", []),
    ("serial numbers beginning with the following prefixes are included in this recall:", []),
    ("The model and serial number are printed on the left side", []),
    ("", []),
    (None, []),
]

BATCH_CASES = [
    (
        "Lot # NC185424, Exp Date: 2/12/2027; Lot # NC185479, Exp Date: 2/13/2027.",
        ["NC185424", "NC185479"],
    ),
    (
        "Lot # NC193672, NC193795, Exp Date: 04/30/2028; Lot # NC194198",
        ["NC193672", "NC193795", "NC194198"],
    ),
    ("Lot Numbers: A1, B2", ["A1", "B2"]),
    ("lot code 0523", ["0523"]),
    ("batch 4471", ["4471"]),
    ("date code 2211", ["2211"]),
    ("Batch SDC2505001, Date of Expiry: April 30, 2030.", ["SDC2505001"]),
    ("Lot# 2145283, Exp Date: 31-Mar-2030.", ["2145283"]),
    ("Lots: C13W01A, Exp. 3/27/2027; G23W01A, Exp. 7/24/2027", ["C13W01A"]),
    (
        "Lots 25JR01802 25NR01017 25NR01266  UDI-DI 00840861102525",
        ["25JR01802", "25NR01017", "25NR01266"],
    ),
    ("Lot Number: 24ABA808; 2) DYNDH1193, UDI-DI: 10889942499953", ["24ABA808"]),
    (
        "date codes of 2510 (Oct-2025), 2511 (Nov-2025) and 2512 (Dec-2025) are included",
        ["2510", "2511", "2512"],
    ),
    ("batch numbers 24003xx, 24004xx and 24010xx", ["24003xx", "24004xx", "24010xx"]),
    (
        "batch number 250905, 250530 or 250120 on the back of packaging",
        ["250905", "250530", "250120"],
    ),
    ("batch codes PO30592, PO30641 and PO30685", ["PO30592", "PO30641", "PO30685"]),
    ('"Batch: 202509" is printed on a tracking label', ["202509"]),
    ("Lot # NC185424; Lot # NC185424 again", ["NC185424"]),  # dedupe, order kept
    # negatives: no plain English words, no UPCs, no orphan keywords
    ("lot numbers and manufacturing dates are printed on the bottle", []),
    ("The batch number is located on the upper right front of bottle", []),
    ("a lot of fun for everyone", []),
    ("Lot Number Manufacturing Date 850027975177 0515I1 09/2021", []),
    ("date code in year and month (YYMM) format, is located on the bottom shelf", []),
    ("", []),
]

MODEL_CASES = [
    ('model number "HDFS400" appears at the top of the name plate', ["HDFS400"]),
    ("model number “HDFS400” appears at the top", ["HDFS400"]),
    ("model number XR-8801", ["XR-8801"]),
    ("Model numbers HD14P-Z and HX18", ["HD14P-Z", "HX18"]),
    (
        'model numbers "SME004" or "AMG005197_12_Q_GLT" are printed',
        ["SME004", "AMG005197_12_Q_GLT"],
    ),
    ('"Model No.: RV001" is printed on a label', ["RV001"]),
    ("model number BSFIREPIT01 (UPC code 680079015930)", ["BSFIREPIT01"]),
    (
        "SKU numbers 10036671NAT, 10036671SUNB and 10036671BLK",
        ["10036671NAT", "10036671SUNB", "10036671BLK"],
    ),
    ('"SKU: AJ0192-Y-3" and "ASIN: B0CB9WV7XN" are printed', ["AJ0192-Y-3"]),
    ("item number 2012261001 and batch code 0925", ["2012261001"]),
    ("Item Number B11654 and the UPC 669028116546", ["B11654"]),
    # negatives
    ("model number is located on the back of the remote", []),
    ('The units have a "CB" logo plate and "CHARBROIL" printed on the panel', []),
    ("model numbers CRAFTY CARBON RR S (MY2026)", []),
    ("SKU number is 039800143341 or 039800143334", []),  # 12-digit UPCs are not models
    ("item number and warning labels are located on the top", []),
    ("", []),
]


@pytest.mark.parametrize(("text", "expected"), SERIAL_CASES)
def test_extract_serial_ranges(text, expected) -> None:
    assert extract_serial_ranges(text) == expected


@pytest.mark.parametrize(("text", "expected"), BATCH_CASES)
def test_extract_batches(text, expected) -> None:
    assert extract_batches(text) == expected


@pytest.mark.parametrize(("text", "expected"), MODEL_CASES)
def test_extract_models(text, expected) -> None:
    assert extract_models(text) == expected


def test_tokens_are_bounded() -> None:
    long_code = "A" * 30 + "1"
    assert extract_batches(f"lot number {long_code}") == []
    assert extract_models(f'model number "{long_code}"') == []
    assert extract_serial_ranges(f"serial number {long_code}") == []
    many = ", ".join(f"L{i:04d}" for i in range(100))
    assert len(extract_batches(f"lot numbers {many}")) <= 60


def test_mentions_all_lots() -> None:
    assert mentions_all_lots("All lots.")
    assert mentions_all_lots("UDI-DI 05413765852428, all serial numbers")
    assert mentions_all_lots("All batches distributed between 2024 and 2026")
    assert not mentions_all_lots("Lot # NC185424")
    assert not mentions_all_lots("")
