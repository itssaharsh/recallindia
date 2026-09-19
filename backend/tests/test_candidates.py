"""matcher.candidates against the demo store seeded by the CDSCO portal and NHTSA pollers."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest

from common import dynamo
from common.schemas import Item
from matcher import candidates
from matcher.candidates import ALL_SOURCES, handler, score_notice

CONTRACT_KEYS = {
    "item",
    "item_id",
    "candidates",
    "count",
    "sources_searched",
    "searched_at",
    "degraded",
}
MEDICINE = {
    "kind": "medicine",
    "name": "Paracetamol Tablets IP 650mg",
    "brand": "Forgo Pharmaceuticals",
    "batch": "FT5427",
}
VEHICLE = {
    "kind": "vehicle",
    "name": "Jeep Compass",
    "make": "jeep",
    "model": "compass",
    "year": 2022,
}


@pytest.fixture(scope="module")
def seeded_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Seed one demo store per module: JUL-2026 portal rows (239) + the NHTSA fixtures."""
    store = tmp_path_factory.mktemp("seed") / "demo_store"
    previous = {key: os.environ.get(key) for key in ("DEMO_MODE", "DEMO_STORE_DIR")}
    os.environ["DEMO_MODE"] = "1"
    os.environ["DEMO_STORE_DIR"] = str(store)
    try:
        from pollers import cdsco_portal, nhtsa

        portal = cdsco_portal.handler({}, None)
        assert portal["degraded"] is False and portal["created"] == 239
        vehicles = nhtsa.handler({}, None)
        assert vehicles["degraded"] is False and vehicles["created"] >= 4
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    return store


@pytest.fixture
def seeded(seeded_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A private copy of the seeded store for each test (items written here stay here)."""
    target = tmp_path / "seeded_store"
    shutil.copytree(seeded_dir, target)
    monkeypatch.setenv("DEMO_STORE_DIR", str(target))
    return target


def _put_item(item_id: str, fields: dict) -> dict:
    item = Item.model_validate({"pk": Item.make_pk(item_id), "item_id": item_id, **fields})
    dynamo.put("items", item.model_dump())
    return item.model_dump()


def _notice(pk: str) -> dict:
    notice = dynamo.get("notices", pk)
    assert notice is not None, pk
    return notice


def _assert_contract(out: dict) -> None:
    assert CONTRACT_KEYS <= set(out)
    assert out["sources_searched"] == ALL_SOURCES == ["cdsco_nsq", "cpsc", "nhtsa", "openfda"]
    assert out["count"] == len(out["candidates"]) <= 5
    assert out["searched_at"].endswith("Z") and len(out["searched_at"]) == 20
    scores = [c["score"] for c in out["candidates"]]
    assert scores == sorted(scores, reverse=True)
    for candidate in out["candidates"]:
        assert set(candidate) == {"notice_pk", "score", "matched_on"}
        assert isinstance(candidate["score"], int) and 80 <= candidate["score"] <= 100
        assert candidate["matched_on"] in candidates.MATCHED_ON
        assert "#" in candidate["notice_pk"] and not candidate["notice_pk"].startswith("meta#")


# --- the demo alert row --------------------------------------------------------------------


def test_demo_medicine_finds_the_forgo_paracetamol_row(seeded) -> None:
    _put_item("med-1", MEDICINE)
    out = handler({"item_id": "med-1", "run": {"execution_arn": "arn:demo"}}, None)
    _assert_contract(out)
    assert out["degraded"] is False and out["count"] >= 1
    assert out["item_id"] == "med-1" and out["item"]["pk"] == "user#med-1"
    assert out["lookup"] == "brand"
    top = out["candidates"][0]
    notice = _notice(top["notice_pk"])
    assert notice["product"].startswith("Paracetamol")
    assert notice["batches"] == ["FT5427"] and notice["source"] == "cdsco_nsq"
    assert notice["brand_lc"] == "forgo pharmaceuticals"
    assert top["matched_on"] == "brand+identifier" and top["score"] >= 95
    # the other Forgo row (a syrup) is a brand hit but not a product match
    assert all(
        _notice(c["notice_pk"])["product"].startswith("Paracetamol") for c in out["candidates"]
    )


def test_item_id_accepted_with_or_without_the_user_prefix(seeded) -> None:
    _put_item("med-1", MEDICINE)
    bare = handler({"item_id": "med-1"}, None)
    prefixed = handler({"item_id": "user#med-1"}, None)
    assert bare["item_id"] == prefixed["item_id"] == "med-1"
    assert bare["candidates"] == prefixed["candidates"] and bare["count"] >= 1


def test_brand_variant_with_legal_form_finds_the_same_row(seeded) -> None:
    _put_item("med-2", {**MEDICINE, "brand": "M/s. Forgo Pharmaceuticals Pvt. Ltd."})
    out = handler({"item_id": "med-2"}, None)
    assert out["count"] >= 1
    top = out["candidates"][0]
    assert _notice(top["notice_pk"])["batches"] == ["FT5427"]
    assert top["matched_on"] == "brand+identifier" and top["score"] >= 95


def test_near_miss_sibling_is_still_a_candidate_on_product(seeded) -> None:
    """Same drug + manufacturer, other batch: a candidate (RangeCheck/Decide dismiss it later)."""
    _put_item("med-3", {**MEDICINE, "batch": "FT5428"})
    out = handler({"item_id": "med-3"}, None)
    assert out["count"] >= 1
    top = out["candidates"][0]
    assert _notice(top["notice_pk"])["batches"] == ["FT5427"]
    assert top["matched_on"] == "brand+product" and top["score"] >= 80


def test_inline_item_event_needs_no_store_row(seeded) -> None:
    out = handler({"item": {"pk": "user#inline", "item_id": "inline", **MEDICINE}}, None)
    assert out["item_id"] == "inline" and out["count"] >= 1
    assert out["item"]["batch"] == "FT5427"


# --- vehicles ----------------------------------------------------------------------------


def test_vehicle_item_matches_nhtsa_by_make_and_model(seeded) -> None:
    _put_item("car-1", VEHICLE)
    out = handler({"item_id": "car-1"}, None)
    _assert_contract(out)
    assert out["degraded"] is False and out["count"] == 4
    assert out["lookup"] == "brand"  # make stands in for the empty brand
    for candidate in out["candidates"]:
        notice = _notice(candidate["notice_pk"])
        assert notice["source"] == "nhtsa" and candidate["notice_pk"].startswith("nhtsa#")
        assert candidate["matched_on"] == "vehicle" and candidate["score"] == 100
        assert {"make": "jeep", "model": "compass", "year_from": 2022, "year_to": 2022} in notice[
            "vehicles"
        ]
    # equal scores: newest published_at first
    published = [_notice(c["notice_pk"])["published_at"] for c in out["candidates"]]
    assert published == sorted(published, reverse=True)
    assert out["candidates"][0]["notice_pk"] == "nhtsa#24V436000"


def test_vehicle_label_wins_over_identifier_match() -> None:
    notice = {
        "pk": "nhtsa#x",
        "product": "Jeep Compass",
        "model": "Compass",
        "batches": [],
        "vehicles": [{"make": "jeep", "model": "compass", "year_from": 2022, "year_to": 2022}],
    }
    assert score_notice(VEHICLE, notice) == (100, "vehicle")
    assert score_notice({**VEHICLE, "model": "wrangler"}, notice) == (
        score_notice({**VEHICLE, "model": "wrangler"}, notice)[0],
        "brand+product",
    )
    medicine_notice = {
        "pk": "cdsco_nsq#x",
        "product": "Paracetamol Tablets IP 650mg",
        "batches": ["FT5427"],
    }
    assert score_notice(MEDICINE, medicine_notice) == (100, "brand+identifier")
    assert score_notice({**MEDICINE, "batch": "FT5428"}, medicine_notice) == (100, "brand+product")
    assert score_notice({**MEDICINE, "name": "Dolo 650"}, medicine_notice)[1] == "brand+identifier"
    assert score_notice({**MEDICINE, "name": "Dolo 650"}, medicine_notice)[0] == 95


# --- nothing matches -----------------------------------------------------------------------


def test_unknown_brand_is_zero_candidates_not_degraded(seeded) -> None:
    _put_item(
        "cooker-1",
        {"kind": "appliance", "name": "Prestige Pressure Cooker 5L", "brand": "Prestige"},
    )
    out = handler({"item_id": "cooker-1"}, None)
    _assert_contract(out)
    assert out["count"] == 0 and out["candidates"] == [] and out["degraded"] is False
    assert len(out["sources_searched"]) == 4
    assert "error" not in out


def test_known_brand_but_unrelated_product_is_zero(seeded) -> None:
    _put_item(
        "med-9", {"kind": "medicine", "name": "Cough Lozenges", "brand": "Forgo Pharmaceuticals"}
    )
    out = handler({"item_id": "med-9"}, None)
    assert out["count"] == 0 and out["degraded"] is False


# --- no-brand fallback -----------------------------------------------------------------------


def test_no_brand_uses_query_source_never_scan_all(seeded, monkeypatch) -> None:
    calls: list[tuple[str, int]] = []
    real_query_source = dynamo.query_source

    def spy(source, **kwargs):
        calls.append((source, kwargs.get("limit")))
        return real_query_source(source, **kwargs)

    def never(*args, **kwargs):  # noqa: ARG001
        raise AssertionError("scan_all must never be used by candidates")

    monkeypatch.setattr(dynamo, "query_source", spy)
    monkeypatch.setattr(dynamo, "scan_all", never)
    _put_item(
        "nobrand-1", {"kind": "medicine", "name": "Paracetamol Tablets IP 650mg", "batch": "FT5427"}
    )
    out = handler({"item_id": "nobrand-1"}, None)
    _assert_contract(out)
    assert out["degraded"] is False and out["lookup"] == "fallback"
    assert [source for source, _ in calls] == ALL_SOURCES
    assert all(limit == candidates.FALLBACK_PER_SOURCE for _, limit in calls)
    assert candidates.FALLBACK_PER_SOURCE * len(ALL_SOURCES) <= 500
    assert out["count"] >= 1
    for candidate in out["candidates"]:
        assert candidate["matched_on"] == "fallback+product"
        # the portal has rows spelled "Paracet amol Tablets IP 650 mg": compare without spaces
        product = _notice(candidate["notice_pk"])["product"].lower().replace(" ", "")
        assert "paracetamol" in product


def test_brand_path_never_touches_query_source_or_scan_all(seeded, monkeypatch) -> None:
    def never(*args, **kwargs):  # noqa: ARG001
        raise AssertionError("brand path must only use query_brand")

    monkeypatch.setattr(dynamo, "query_source", never)
    monkeypatch.setattr(dynamo, "scan_all", never)
    _put_item("med-1", MEDICINE)
    assert handler({"item_id": "med-1"}, None)["count"] >= 1


# --- bookkeeping rows / errors -------------------------------------------------------------------


def test_meta_rows_are_never_candidates(seeded) -> None:
    dynamo.put(
        "notices",
        {
            "pk": "meta#cdsco_portal",
            "source": "cdsco_portal",
            "brand_lc": "forgo pharmaceuticals",
            "product": "Paracetamol Tablets IP 650mg",
            "batches": ["FT5427"],
            "published_at": "2026-07-01",
        },
    )
    _put_item("med-1", MEDICINE)
    out = handler({"item_id": "med-1"}, None)
    assert out["count"] >= 1
    assert all(not c["notice_pk"].startswith(("meta#", "ingest#")) for c in out["candidates"])


def test_missing_item_is_degraded_not_raised(seeded) -> None:
    out = handler({"item_id": "nope"}, None)
    assert out["degraded"] is True and out["error"] == "item not found"
    assert out["count"] == 0 and out["candidates"] == [] and out["item"] is None
    assert out["item_id"] == "nope" and out["sources_searched"] == ALL_SOURCES
    empty = handler({}, None)
    assert (
        empty["degraded"] is True
        and empty["error"] == "item not found"
        and empty["item_id"] is None
    )


def test_store_error_is_degraded_not_raised(monkeypatch) -> None:
    def boom(kind, pk):  # noqa: ARG001
        raise RuntimeError("dynamo down")

    monkeypatch.setattr(dynamo, "get", boom)
    out = handler({"item_id": "med-1"}, None)
    assert out["degraded"] is True and "RuntimeError: dynamo down" in out["error"]
    assert out["count"] == 0 and out["item"] is None
    assert handler(None, None)["degraded"] is True  # type: ignore[arg-type]


def test_decimal_item_fields_are_plain_numbers(seeded) -> None:
    """Live DynamoDB hands back Decimal; the Lambda runtime cannot JSON-serialise it."""
    import json
    from decimal import Decimal

    _put_item("car-2", VEHICLE)
    stored = dynamo.get("items", "user#car-2")
    monkeypatch_get = {**stored, "year": Decimal("2022")}
    out = handler({"item": monkeypatch_get}, None)
    assert out["item"]["year"] == 2022 and isinstance(out["item"]["year"], int)
    json.dumps(out)  # must not raise
