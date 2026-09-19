"""matcher.range_check: batch / serial / vehicle-year rules, kind selection, handler."""

from __future__ import annotations

import pytest

from common import dynamo
from common.notices import upsert_notice
from matcher.range_check import (
    EN_DASH,
    check_batch,
    check_serial,
    check_vehicle_year,
    format_years,
    handler,
    parse_range,
    range_check,
)

VEHICLES = [
    {"make": "Jeep", "model": "Compass", "year_from": 2017, "year_to": 2019},
    {"make": "jeep", "model": "compass", "year_from": 2018, "year_to": 2018},
    {"make": "kia", "model": "seltos", "year_from": 2021, "year_to": 2025},
]

CDSCO_NOTICE = {
    "pk": "cdsco_nsq#JUL-2026-cdsco_portal-abc123def456",
    "source": "cdsco_nsq",
    "notice_id": "JUL-2026-cdsco_portal-abc123def456",
    "adapter": "cdsco_portal",
    "title": "Paracetamol Tablets IP 650mg — failed CDSCO quality test, JUL-2026 alert, row 12",
    "product": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batches": ["FT5427"],
    "hazard_or_failed_test": "Dissolution",
    "published_at": "2026-07-01",
    "url": "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
    "raw_excerpt": "Paracetamol Tablets IP 650mg | FT5427 | Forgo Pharmaceuticals | Dissolution",
}

MEDICINE = {
    "pk": "user#med-1",
    "item_id": "med-1",
    "kind": "medicine",
    "name": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batch": "FT5427",
}


# --- batches ---------------------------------------------------------------------------


def test_check_batch_exact() -> None:
    assert check_batch("FT5427", ["FT5427"]) == {
        "inside": True,
        "listed": ["FT5427"],
        "yours": "FT5427",
    }


def test_check_batch_case_and_space_insensitive() -> None:
    assert check_batch("ft 5427", ["FT5427"])["inside"] is True
    assert check_batch("FT5427", ["ft 5427"])["inside"] is True
    assert check_batch("DL4471", ["DL 4471"])["inside"] is True
    assert check_batch(" dl-4471 ", ["DL-4471"])["inside"] is True


def test_check_batch_near_miss_preserves_listed() -> None:
    assert check_batch("DL-4472", ["DL-4471", "DL-4468"]) == {
        "inside": False,
        "listed": ["DL-4471", "DL-4468"],
        "yours": "DL-4472",
    }


def test_check_batch_missing_is_none() -> None:
    assert check_batch("", ["DL-4471"])["inside"] is None
    assert check_batch("DL-4471", [])["inside"] is None
    assert check_batch(None, None) == {"inside": None, "listed": [], "yours": ""}
    assert check_batch("DL-4471", ["", "  "])["inside"] is None


def test_check_batch_hyphen_is_significant() -> None:
    """Pinned by test_handlers_smoke: spaces and case are noise, a hyphen is not."""
    assert check_batch("DL 4471", ["DL-4471"])["inside"] is False
    assert check_batch("DL4471", ["DL-4471"])["inside"] is False
    assert check_batch("DL-4471", ["DL4471"])["inside"] is False


# --- serial ranges -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("yours", "expected"),
    [("4500", True), ("4000", True), ("5200", True), ("3999", False), ("5201", False)],
)
def test_check_serial_numeric_range_inside_outside_edges(yours, expected) -> None:
    assert check_serial(yours, ["4000-5200"])["inside"] is expected


@pytest.mark.parametrize("spec", ["A12–A99", "A12-A99", "A12 - A99", "A12—A99"])
@pytest.mark.parametrize(
    ("yours", "expected"),
    [
        ("A50", True),
        ("a50", True),
        ("A-50", True),
        ("A12", True),
        ("A99", True),
        ("A11", False),
        ("A100", False),
        ("B50", False),
        ("50", False),
    ],
)
def test_check_serial_alnum_range_en_dash_and_hyphen(spec, yours, expected) -> None:
    assert check_serial(yours, [spec])["inside"] is expected


@pytest.mark.parametrize(
    ("spec", "yours", "expected"),
    [
        ("starting with 24", "2412345", True),
        ("starting with 24", "3312345", False),
        ("beginning with 24", "24-0099", True),
        ("starts with 24", "2400", True),
        ("starts with 24", "1400", False),
        ("begins with AB", "ab-77", True),
        ("prefix 24", "2401", True),
        ("prefix: 24", "9924", False),
    ],
)
def test_check_serial_prefix_patterns(spec, yours, expected) -> None:
    assert check_serial(yours, [spec])["inside"] is expected


def test_check_serial_unparseable_is_none() -> None:
    out = check_serial("X100", ["any unit"])
    assert out["inside"] is None
    assert out["listed"] == ["any unit"] and out["unparsed"] == ["any unit"] and out["parsed"] == []
    assert check_serial("100", ["all units sold before March 2026"])["inside"] is None
    assert parse_range("any unit") is None
    assert parse_range("A12-B99") is None  # two different series, not one range


def test_check_serial_mixed_unparseable_and_non_matching_is_none() -> None:
    assert check_serial("9999", ["4000-5200", "any unit"])["inside"] is None
    assert check_serial("4500", ["4000-5200", "any unit"])["inside"] is True
    assert check_serial("9999", ["4000-5200", "A12–A99"])["inside"] is False
    assert check_serial("A50", ["4000-5200", "A12–A99"])["inside"] is True


def test_check_serial_single_value_equality() -> None:
    assert check_serial("SN-100", ["SN-100"])["inside"] is True
    assert check_serial("sn 100", ["SN100"])["inside"] is True
    assert check_serial("SN-101", ["SN-100"])["inside"] is False
    assert check_serial("SN 100", ["SN-100"])["inside"] is False  # hyphen significant here too
    assert parse_range("SN-100") == {"type": "single", "spec": "SN-100", "value": "SN-100"}


def test_check_serial_missing_is_none() -> None:
    assert check_serial("", ["4000-5200"])["inside"] is None
    assert check_serial("4500", [])["inside"] is None
    assert check_serial(None, None)["listed"] == []


# --- vehicle years -------------------------------------------------------------------


def test_check_vehicle_year_inside_outside_none() -> None:
    assert check_vehicle_year(2018, VEHICLES, "jeep", "compass")["inside"] is True
    assert check_vehicle_year(2017, VEHICLES, "jeep", "compass")["inside"] is True
    assert check_vehicle_year(2019, VEHICLES, "jeep", "compass")["inside"] is True
    outside = check_vehicle_year(2021, VEHICLES, "jeep", "compass")
    assert outside["inside"] is False and outside["yours"] == "2021"
    no_year = check_vehicle_year(None, VEHICLES, "jeep", "compass")
    assert no_year["inside"] is None and no_year["yours"] == ""
    assert no_year["listed"] == f"2017{EN_DASH}2019"  # still tells the user what is covered
    no_entry = check_vehicle_year(2018, VEHICLES, "jeep", "wrangler")
    assert no_entry["inside"] is None and no_entry["listed"] == "" and no_entry["matched"] == []
    assert check_vehicle_year(2018, [], "jeep", "compass")["inside"] is None
    assert check_vehicle_year(2018, VEHICLES, "", "compass")["inside"] is None


def test_check_vehicle_year_listed_formatting() -> None:
    assert check_vehicle_year(2021, VEHICLES, "jeep", "compass")["listed"] == "2017–2019"
    assert "-" not in check_vehicle_year(2021, VEHICLES, "jeep", "compass")["listed"]
    single = check_vehicle_year(
        2022, [{**VEHICLES[2], "year_from": 2022, "year_to": 2022}], "kia", "seltos"
    )
    assert single["listed"] == "2022" and single["inside"] is True
    assert format_years(2019, 2017) == "2017–2019"
    assert format_years(2022, 2022) == "2022"


def test_check_vehicle_year_make_model_normalised_and_decimal_years() -> None:
    from decimal import Decimal

    out = check_vehicle_year("2018", VEHICLES, " JEEP ", "Compass  ")
    assert out["inside"] is True and out["yours"] == "2018"
    decimals = [
        {
            "make": "Jeep",
            "model": "Compass",
            "year_from": Decimal("2022"),
            "year_to": Decimal("2022"),
        }
    ]
    assert check_vehicle_year(Decimal("2022"), decimals, "jeep", "compass")["inside"] is True
    assert (
        check_vehicle_year(2018, [{"make": "jeep", "model": "compass"}], "jeep", "compass")[
            "inside"
        ]
        is None
    )


# --- range_check(item, notice): kind selection -----------------------------------------


def test_range_check_medicine_batch() -> None:
    out = range_check(MEDICINE, CDSCO_NOTICE)
    assert out["kind"] == "batch" and out["inside"] is True
    assert out["listed"] == "FT5427" and out["yours"] == "FT5427"
    near = range_check(
        {**MEDICINE, "batch": "DL-4472"}, {**CDSCO_NOTICE, "batches": ["DL-4471", "DL-4468"]}
    )
    assert (
        near["inside"] is False
        and near["listed"] == "DL-4471, DL-4468"
        and near["yours"] == "DL-4472"
    )


def test_range_check_serial_when_no_batch() -> None:
    item = {"kind": "appliance", "name": "Instant Pot", "serial": "A50"}
    notice = {"serial_ranges": ["A12–A99", "4000-5200"], "batches": []}
    out = range_check(item, notice)
    assert out["kind"] == "serial" and out["inside"] is True
    assert out["listed"] == "A12–A99, 4000-5200" and out["yours"] == "A50"
    assert out["detail"]["parsed"] == ["A12–A99", "4000-5200"]
    # a batch on the item takes precedence over a serial when the notice lists batches
    both = range_check({**item, "batch": "X1"}, {**notice, "batches": ["X2"]})
    assert both["kind"] == "batch" and both["inside"] is False


def test_range_check_vehicle() -> None:
    item = {
        "kind": "vehicle",
        "name": "Jeep Compass",
        "make": "jeep",
        "model": "compass",
        "year": 2021,
    }
    out = range_check(item, {"vehicles": VEHICLES})
    assert out["kind"] == "vehicle_year" and out["inside"] is False
    assert out["listed"] == "2017–2019" and out["yours"] == "2021"
    assert range_check({**item, "year": 2018}, {"vehicles": VEHICLES})["inside"] is True


def test_range_check_vehicle_without_year_is_none() -> None:
    item = {"kind": "vehicle", "name": "Jeep Compass", "make": "jeep", "model": "compass"}
    out = range_check(item, {"vehicles": VEHICLES})
    assert out["kind"] == "vehicle_year" and out["inside"] is None
    assert out["listed"] == "2017–2019" and out["yours"] == ""
    assert out["detail"]["reason"] == "item has no model year"


def test_range_check_none() -> None:
    out = range_check({**MEDICINE, "batch": None}, CDSCO_NOTICE)
    assert out == {
        "inside": None,
        "listed": "",
        "yours": "",
        "kind": "none",
        "detail": {"reason": "item has no batch, serial or model year"},
    }
    no_batches = range_check(MEDICINE, {**CDSCO_NOTICE, "batches": []})
    assert no_batches["kind"] == "none" and no_batches["inside"] is None
    assert no_batches["yours"] == "FT5427"
    assert range_check({}, {})["kind"] == "none"
    assert range_check(None, None)["inside"] is None  # type: ignore[arg-type]


# --- handler -----------------------------------------------------------------------------


def _event(item: dict, notice_pk: str, verify: dict | None = None) -> dict:
    return {
        "candidate": {"notice_pk": notice_pk, "score": 100, "matched_on": "brand+identifier"},
        "item": item,
        "run": {"execution_arn": "arn:demo", "execution_name": "demo", "started_at": "now"},
        "verify": verify or {"notice_pk": notice_pk, "covers_item": True},
    }


def test_handler_on_demo_store_notice() -> None:
    assert upsert_notice(CDSCO_NOTICE) == "created"
    out = handler(_event(MEDICINE, CDSCO_NOTICE["pk"]), None)
    assert out["notice_pk"] == CDSCO_NOTICE["pk"]
    assert out["inside"] is True and out["kind"] == "batch"
    assert out["listed"] == "FT5427" and out["yours"] == "FT5427"
    assert out["degraded"] is False and "error" not in out


def test_handler_near_miss_gives_decide_its_inputs() -> None:
    notice = {**CDSCO_NOTICE, "batches": ["DL-4471", "DL-4468"]}
    dynamo.put("notices", notice)
    out = handler(_event({**MEDICINE, "batch": "DL-4472"}, notice["pk"]), None)
    assert out["inside"] is False and out["kind"] == "batch"
    assert out["listed"] == "DL-4471, DL-4468" and out["yours"] == "DL-4472"
    assert f"batch {out['yours']} not in listed batches [{out['listed']}]" == (
        "batch DL-4472 not in listed batches [DL-4471, DL-4468]"
    )


def test_handler_missing_notice_is_degraded_not_raised() -> None:
    out = handler(_event(MEDICINE, "cdsco_nsq#nope"), None)
    assert out["degraded"] is True and "notice not found" in out["error"]
    assert out["inside"] is None and out["kind"] == "none" and out["notice_pk"] == "cdsco_nsq#nope"
    assert out["yours"] == "FT5427"


def test_handler_empty_event_and_inline_notice() -> None:
    out = handler({}, None)
    assert out["inside"] is None and out["kind"] == "none" and out["degraded"] is False
    assert out["notice_pk"] is None
    inline = handler({"item": MEDICINE, "notice": CDSCO_NOTICE}, None)
    assert inline["inside"] is True and inline["kind"] == "batch"
    assert handler(None, None)["degraded"] is False  # type: ignore[arg-type]


def test_handler_store_error_is_degraded(monkeypatch) -> None:
    def boom(kind, pk):  # noqa: ARG001
        raise RuntimeError("dynamo down")

    monkeypatch.setattr(dynamo, "get", boom)
    out = handler(_event(MEDICINE, CDSCO_NOTICE["pk"]), None)
    assert out["degraded"] is True and "RuntimeError: dynamo down" in out["error"]
    assert out["inside"] is None and out["kind"] == "none"
