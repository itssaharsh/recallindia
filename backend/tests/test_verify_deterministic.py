"""Deterministic verifier (``BEDROCK_ENABLED=false``): the primary path for the hackathon.

Real notices from the demo pollers (CDSCO portal JUL-2026 fixture, NHTSA fixtures); every test
sets ``BEDROCK_ENABLED`` explicitly -- never the default.
"""

from __future__ import annotations

import pytest

from common import bedrock, dynamo
from common.bedrock import BedrockUnavailable
from matcher.verify import deterministic_verify, quote_is_verbatim, verify
from pollers import cdsco_portal, nhtsa

_CACHE: dict[str, dict] = {}


def _forgo_notice() -> dict:
    """The demo alert row (Paracetamol Tablets IP 650mg / FT5427 / Forgo), loaded once."""
    if "forgo" not in _CACHE:
        out = cdsco_portal.handler({}, None)
        assert out["degraded"] is False and out["upserted"] == 239
        rows = dynamo.query_brand("forgo pharmaceuticals")
        _CACHE["forgo"] = next(n for n in rows if "FT5427" in n["batches"])
    return dict(_CACHE["forgo"])


def _venue_notice() -> dict:
    if "venue" not in _CACHE:
        out = nhtsa.handler({}, None)
        assert out["degraded"] is False
        _CACHE["venue"] = next(
            n
            for n in dynamo.scan_all("notices")
            if n.get("source") == "nhtsa" and n.get("brand_lc") == "hyundai"
            if n.get("model") == "Venue"
        )
    return dict(_CACHE["venue"])


def _item(**over) -> dict:
    base = {
        "pk": "user#i1",
        "item_id": "i1",
        "kind": "medicine",
        "name": "Paracetamol Tablets IP 650mg",
        "brand": "Forgo Pharmaceuticals",
        "batch": "FT5427",
        "status": "clear",
    }
    base.update(over)
    return base


@pytest.fixture(autouse=True)
def bedrock_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    bedrock.reset_invocation_warning()


@pytest.fixture
def no_model(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args, **kwargs):
        pytest.fail("Bedrock must not be called on the deterministic path")

    monkeypatch.setattr(bedrock, "converse", boom)
    monkeypatch.setattr(bedrock, "_client_factory", boom)


def test_hero_row_covers_item(no_model) -> None:
    notice = _forgo_notice()
    out = verify(_item(), notice)
    assert out["covers_item"] is True
    assert out["verifier"] == "deterministic"
    assert out["confidence"] == 0.95
    assert out["reasoning"].startswith("brand 'Forgo Pharmaceuticals' matches; product")
    assert "product 'Paracetamol Tablets IP 650mg' fuzzy 100" in out["reasoning"]
    assert "batch FT5427 in listed [FT5427]" in out["reasoning"]
    assert "quoted: '" in out["reasoning"]
    assert "FT5427" in out["quoted_sentence"]
    assert quote_is_verbatim(out["quoted_sentence"], notice["raw_excerpt"])
    assert out["quoted_sentence"].startswith("Paracetamol Tablets IP 650mg | FT5427")
    assert out["quoted_sentence"].endswith("Dissolution Test.")
    assert out["notice_pk"] == notice["pk"] == "cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713"
    assert out["degraded"] is False
    assert out["notice"] == {
        "product": "Paracetamol Tablets IP 650mg",
        "model": None,
        "brand": "Forgo Pharmaceuticals",
        "source": "cdsco_nsq",
        "published_at": "2026-07-01",
        "title": notice["title"],
        "adapter": "cdsco_portal",
        "batches": ["FT5427"],
    }
    assert "raw_excerpt" not in out["notice"]


def test_sibling_batch_still_covers_the_product(no_model) -> None:
    """Verify judges the product; RangeCheck judges the batch (the near-miss dismiss)."""
    out = verify(_item(batch="FT5428"), _forgo_notice())
    assert out["covers_item"] is True
    assert out["confidence"] == 0.85
    assert out["verifier"] == "deterministic"
    assert "batch FT5428 not in listed [FT5427]" in out["reasoning"]
    assert "fuzzy 100" in out["reasoning"]


def test_hyphen_and_case_insensitive_batch_overlap(no_model) -> None:
    out = verify(_item(batch="ft-5427"), _forgo_notice())
    assert out["covers_item"] is True and out["confidence"] == 0.95
    assert "batch ft-5427 in listed [FT5427]" in out["reasoning"]


def test_brand_mismatch(no_model) -> None:
    out = verify(_item(brand="Zenith Drugs"), _forgo_notice())
    assert out["covers_item"] is False
    assert out["confidence"] == 0.9
    assert out["reasoning"].startswith(
        "brand 'Zenith Drugs' does not match 'Forgo Pharmaceuticals'; product"
    )


def test_item_without_brand_but_listed_batch(no_model) -> None:
    """A photographed strip rarely shows its maker: no brand is unknown, not a mismatch. The
    notice still has to list this exact batch for the same product."""
    out = verify(_item(brand=None), _forgo_notice())
    assert out["covers_item"] is True
    assert out["confidence"] == 0.95
    assert out["reasoning"].startswith(
        "no brand on the item (notice brand 'Forgo Pharmaceuticals')"
    )
    assert "batch FT5427 in listed [FT5427]" in out["reasoning"]


def test_item_without_brand_and_batch_not_listed(no_model) -> None:
    """Without a brand, the product alone is never enough: the batch has to be on the list."""
    out = verify(_item(brand=None, batch="FT5428"), _forgo_notice())
    assert out["covers_item"] is False
    assert out["confidence"] == 0.9
    assert "batch FT5428 not in listed [FT5427]" in out["reasoning"]


def test_item_without_brand_and_other_product(no_model) -> None:
    out = verify(_item(brand=None, name="Cough Syrup 100ml", batch="XX1"), _forgo_notice())
    assert out["covers_item"] is False


def test_brand_match_but_other_product(no_model) -> None:
    out = verify(_item(name="Dolo 650", batch=None), _forgo_notice())
    assert out["covers_item"] is False
    assert out["confidence"] == 0.8
    assert "brand 'Forgo Pharmaceuticals' matches; product 'Dolo 650' fuzzy " in out["reasoning"]
    assert "no batch or serial on the item" in out["reasoning"]


def test_legal_form_noise_in_item_brand(no_model) -> None:
    out = verify(_item(brand="M/s. Forgo Pharmaceuticals Pvt. Ltd."), _forgo_notice())
    assert out["covers_item"] is True and out["confidence"] == 0.95


def test_vehicle_item_vs_nhtsa_notice(no_model) -> None:
    notice = _venue_notice()
    item = {
        "pk": "user#v1",
        "item_id": "v1",
        "kind": "vehicle",
        "name": "Hyundai Venue",
        "brand": None,
        "make": "Hyundai",
        "model": "Venue",
        "year": 2022,
    }
    out = verify(item, notice)
    assert out["covers_item"] is True
    assert out["verifier"] == "deterministic"
    assert out["reasoning"].startswith("brand 'Hyundai' matches; vehicle hyundai venue listed; ")
    assert "no batch or serial on the item" in out["reasoning"]
    assert "model Venue listed" in out["reasoning"]
    assert out["quoted_sentence"] and quote_is_verbatim(
        out["quoted_sentence"], notice["raw_excerpt"]
    )
    assert out["notice"]["source"] == "nhtsa" and out["notice"]["batches"] == []

    other = verify({**item, "make": "Kia", "model": "Seltos", "name": "Kia Seltos"}, notice)
    assert other["covers_item"] is False
    assert other["reasoning"].startswith("brand 'Kia' does not match 'Hyundai'")


def test_wording_rules(no_model) -> None:
    for item in (_item(), _item(batch="FT5428"), _item(brand="Zenith Drugs")):
        out = verify(item, _forgo_notice())
        text = (out["reasoning"] + " " + out["quoted_sentence"]).lower()
        assert "recalled" not in text and "safe" not in text


def test_bedrock_unavailable_on_live_path_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    """Flag says enabled, live mode, but converse raises BedrockUnavailable -> deterministic."""
    notice = _forgo_notice()
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    monkeypatch.setenv("DEMO_MODE", "0")
    calls: list[str] = []

    def unavailable(kind, prompt, **kw):
        calls.append(kind)
        raise BedrockUnavailable("disabled")

    monkeypatch.setattr(bedrock, "converse", unavailable)
    out = verify(_item(), notice)
    assert calls == ["verify"]
    assert out == {**verify_off(notice), "notice_pk": notice["pk"]}


def verify_off(notice: dict) -> dict:
    """The deterministic result for the hero item, computed with the flag off."""
    core = deterministic_verify(_item(), notice)
    assert core["verifier"] == "deterministic" and core["covers_item"] is True
    from matcher.verify import notice_summary

    return {"notice_pk": notice["pk"], **core, "notice": notice_summary(notice), "degraded": False}


def test_demo_mode_without_fixture_is_deterministic(
    monkeypatch: pytest.MonkeyPatch, tmp_path, no_model
) -> None:
    notice = _forgo_notice()
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("FIXTURES_DIR", str(tmp_path / "fixtures"))  # no per-notice fixture
    out = verify(_item(), notice)
    assert out["verifier"] == "deterministic" and out["covers_item"] is True
