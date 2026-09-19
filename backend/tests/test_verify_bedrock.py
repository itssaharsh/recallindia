"""Bedrock path of verify (opt-in, ``common.bedrock.converse`` faked), demo fixture routing
keyed by notice pk, and the Lambda handler contract. Every test sets ``BEDROCK_ENABLED``
explicitly -- never the default."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from common import bedrock, dynamo
from common.bedrock import BedrockError
from common.schemas import Item, Notice
from matcher import verify as verify_mod
from matcher.verify import (
    BEDROCK_ERROR,
    SYSTEM_PROMPT,
    UNPARSEABLE,
    bedrock_verify,
    fixture_key_for,
    handler,
    verify,
)

REPO = Path(__file__).resolve().parents[2]
RAW = (
    "Paracetamol Tablets IP 650mg | FT5427 | Oct-2025 | Sep-2027 | Forgo Pharmaceuticals, 27, "
    "DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103 | The sample does not "
    "conforms to the I.P. with respect to Dissolution Test. | State Lab | DTL Bikaner | JUL-2026"
)
NOTICE = Notice(
    pk=Notice.make_pk("cdsco_nsq", "JUL-2026-cdsco_portal-test0001"),
    source="cdsco_nsq",
    notice_id="JUL-2026-cdsco_portal-test0001",
    adapter="cdsco_portal",
    title="Paracetamol Tablets IP 650mg — failed CDSCO quality test, JUL-2026 alert, row 12",
    product="Paracetamol Tablets IP 650mg",
    brand="Forgo Pharmaceuticals",
    batches=["FT5427"],
    hazard_or_failed_test=(
        "The sample does not conforms to the I.P. with respect to Dissolution Test."
    ),
    published_at="2026-07-01",
    url="https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
    raw_excerpt=RAW,
    row_ref={"month": "JUL-2026", "row": 12},
).model_dump()
ITEM = Item(
    pk=Item.make_pk("i1"),
    item_id="i1",
    kind="medicine",
    name="Paracetamol Tablets IP 650mg",
    brand="Forgo Pharmaceuticals",
    batch="FT5427",
).model_dump()
CANDIDATE = {"notice_pk": NOTICE["pk"], "score": 100, "matched_on": "product"}
RUN = {"execution_arn": "arn:aws:states:ap-south-1:1:execution:m:e1", "started_at": "t"}
CONTRACT_KEYS = {
    "notice_pk",
    "covers_item",
    "quoted_sentence",
    "confidence",
    "reasoning",
    "verifier",
    "notice",
    "degraded",
}
GOOD_REPLY = {
    "covers_item": True,
    "quoted_sentence": "Paracetamol Tablets IP 650mg | FT5427",
    "confidence": 0.91,
    "reasoning": "The notice names Paracetamol Tablets IP 650mg by Forgo Pharmaceuticals.",
}


@pytest.fixture
def live_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    bedrock.reset_invocation_warning()


def _fake_converse(monkeypatch: pytest.MonkeyPatch, text: str | None = None, error=None):
    calls: list[dict] = []

    def fake(kind, prompt, **kw):
        calls.append({"kind": kind, "prompt": prompt, **kw})
        if error is not None:
            raise error
        return {"text": text, "model_id": "fake", "region": "ap-south-1", "demo": False}

    monkeypatch.setattr(bedrock, "converse", fake)
    return calls


# --- live Bedrock path (converse faked) -----------------------------------------------------


def test_valid_reply_is_mapped(monkeypatch: pytest.MonkeyPatch, live_enabled) -> None:
    calls = _fake_converse(monkeypatch, json.dumps(GOOD_REPLY))
    out = verify(ITEM, NOTICE)
    assert set(out) == CONTRACT_KEYS
    assert out["verifier"] == "bedrock"
    assert out["covers_item"] is True
    assert out["quoted_sentence"] == "Paracetamol Tablets IP 650mg | FT5427"
    assert out["confidence"] == 0.91
    assert out["reasoning"] == GOOD_REPLY["reasoning"]
    assert out["notice_pk"] == NOTICE["pk"]
    assert out["degraded"] is False
    assert out["notice"]["product"] == "Paracetamol Tablets IP 650mg"
    assert out["notice"]["batches"] == ["FT5427"] and out["notice"]["adapter"] == "cdsco_portal"
    assert len(calls) == 1
    call = calls[0]
    assert call["kind"] == "verify"
    assert call["system"] == SYSTEM_PROMPT
    assert call["max_tokens"] == 400 and call["temperature"] == 0.0
    assert call["fixture_key"] is None


def test_bedrock_error_is_none_verifier(monkeypatch: pytest.MonkeyPatch, live_enabled) -> None:
    _fake_converse(monkeypatch, error=BedrockError("ap-south-1: denied | fallback: denied"))
    out = verify(ITEM, NOTICE)
    assert out["covers_item"] is None
    assert out["reasoning"] == BEDROCK_ERROR == "verification unavailable (Bedrock error)"
    assert out["verifier"] == "none"
    assert out["quoted_sentence"] == "" and out["confidence"] == 0
    assert out["degraded"] is False and out["notice_pk"] == NOTICE["pk"]


def test_unparseable_reply(monkeypatch: pytest.MonkeyPatch, live_enabled) -> None:
    _fake_converse(monkeypatch, "I am not able to answer that in JSON.")
    out = verify(ITEM, NOTICE)
    assert out["covers_item"] is None
    assert out["reasoning"] == UNPARSEABLE == "unparseable model reply"
    assert out["verifier"] == "bedrock"
    assert out["quoted_sentence"] == "" and out["confidence"] == 0


def test_fenced_json_and_prose_around_it_parse(monkeypatch: pytest.MonkeyPatch, live_enabled):
    _fake_converse(monkeypatch, "Here you go:\n```json\n" + json.dumps(GOOD_REPLY) + "\n```")
    assert bedrock_verify(ITEM, NOTICE)["covers_item"] is True
    _fake_converse(monkeypatch, '[1, 2] then {"covers_item": "null", "quoted_sentence": ""}')
    out = bedrock_verify(ITEM, NOTICE)
    assert out["covers_item"] is None and out["verifier"] == "bedrock"
    assert out["confidence"] == 0.5  # missing confidence


def test_prompt_contents(monkeypatch: pytest.MonkeyPatch, live_enabled) -> None:
    calls = _fake_converse(monkeypatch, json.dumps(GOOD_REPLY))
    long_notice = {**NOTICE, "raw_excerpt": RAW + " " + "y" * 5000}
    verify(ITEM, long_notice)
    system, prompt = calls[0]["system"], calls[0]["prompt"]
    # JSON only, quote copied verbatim, and no range decisions
    assert "Reply with ONE JSON object only" in system
    assert '"covers_item": true|false|null' in system
    assert "copied character-for-character from NOTICE TEXT" in system
    assert "Do not decide whether the item's batch/serial/year is inside a listed range" in system
    assert "only judge whether the notice is about this product from this brand" in system
    # notice fields + the excerpt (capped at 4096) + item fields
    assert "NOTICE TEXT:\n" in prompt
    assert RAW in prompt
    assert "y" * 5000 not in prompt and len(prompt.split("NOTICE TEXT:\n", 1)[1]) < 4096 + 400
    assert "source: cdsco_nsq" in prompt and "batches: FT5427" in prompt
    assert "hazard_or_failed_test: The sample does not conforms" in prompt
    assert "published_at: 2026-07-01" in prompt
    assert "kind: medicine" in prompt and "batch: FT5427" in prompt
    assert "brand: Forgo Pharmaceuticals" in prompt
    assert "name: Paracetamol Tablets IP 650mg" in prompt
    assert "serial: -" in prompt and "year: -" in prompt  # empty item fields are explicit


def test_vehicle_prompt_lists_vehicles(monkeypatch: pytest.MonkeyPatch, live_enabled) -> None:
    calls = _fake_converse(monkeypatch, json.dumps(GOOD_REPLY))
    notice = {
        **NOTICE,
        "source": "nhtsa",
        "adapter": None,
        "batches": [],
        "model": "Venue",
        "vehicles": [{"make": "hyundai", "model": "venue", "year_from": 2020, "year_to": 2022}],
    }
    verify({**ITEM, "kind": "vehicle", "make": "Hyundai", "model": "Venue", "year": 2022}, notice)
    prompt = calls[0]["prompt"]
    assert "vehicles: hyundai venue 2020-2022" in prompt and "batches: -" in prompt
    assert "make: Hyundai" in prompt and "year: 2022" in prompt


# --- demo mode: per-notice fixture keyed by pk ---------------------------------------------


@pytest.fixture
def fixtures_copy(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    """A private FIXTURES_DIR holding a copy of fixtures/bedrock (default.json included)."""
    root = tmp_path / "fixtures"
    shutil.copytree(REPO / "fixtures" / "bedrock", root / "bedrock")
    assert (root / "bedrock" / "verify" / "default.json").is_file()
    monkeypatch.setenv("FIXTURES_DIR", str(root))
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("BEDROCK_ENABLED", "true")
    bedrock.reset_invocation_warning()
    return root


def _no_live_client(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(region):
        pytest.fail("no live Bedrock client in demo mode")

    monkeypatch.setattr(bedrock, "_client_factory", boom)


def test_demo_without_fixture_is_deterministic(monkeypatch, fixtures_copy: Path) -> None:
    _no_live_client(monkeypatch)
    key = fixture_key_for(NOTICE["pk"])
    assert key == "notice-cdsco_nsq_JUL-2026-cdsco_portal-test0001"
    assert not (fixtures_copy / "bedrock" / "verify" / f"{key}.json").exists()
    out = verify(ITEM, NOTICE)
    assert out["verifier"] == "deterministic" and out["covers_item"] is True
    assert out["reasoning"].startswith("brand 'Forgo Pharmaceuticals' matches; product")


def test_demo_with_fixture_uses_bedrock_path(monkeypatch, fixtures_copy: Path) -> None:
    _no_live_client(monkeypatch)
    key = fixture_key_for(NOTICE["pk"])
    path = fixtures_copy / "bedrock" / "verify" / f"{key}.json"
    path.write_text(json.dumps({"text": json.dumps(GOOD_REPLY)}), encoding="utf-8")
    out = verify(ITEM, NOTICE)
    assert out["verifier"] == "bedrock"
    assert out["covers_item"] is True
    assert out["quoted_sentence"] == GOOD_REPLY["quoted_sentence"]
    assert out["confidence"] == 0.91 and out["reasoning"] == GOOD_REPLY["reasoning"]
    assert out["notice_pk"] == NOTICE["pk"] and out["degraded"] is False

    # the guard applies to fixtures too
    bad = {**GOOD_REPLY, "quoted_sentence": "Paracetamol batch FT5427 failed dissolution"}
    path.write_text(json.dumps({"text": json.dumps(bad)}), encoding="utf-8")
    guarded = verify(ITEM, NOTICE)
    assert guarded["verifier"] == "bedrock" and guarded["covers_item"] is None
    assert guarded["reasoning"] == "quote not found in source"


def test_demo_fixture_ignored_when_flag_off(monkeypatch, fixtures_copy: Path) -> None:
    key = fixture_key_for(NOTICE["pk"])
    path = fixtures_copy / "bedrock" / "verify" / f"{key}.json"
    path.write_text(json.dumps({"text": json.dumps(GOOD_REPLY)}), encoding="utf-8")
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    out = verify(ITEM, NOTICE)
    assert out["verifier"] == "deterministic"


# --- handler ------------------------------------------------------------------------------


@pytest.fixture
def demo_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    dynamo.put("notices", NOTICE)
    dynamo.put("items", ITEM)


def test_handler_map_iteration_input(demo_store) -> None:
    out = handler({"candidate": CANDIDATE, "item": ITEM, "run": RUN}, None)
    assert set(out) == CONTRACT_KEYS
    assert out["covers_item"] is True and out["verifier"] == "deterministic"
    assert out["notice_pk"] == NOTICE["pk"]
    assert out["notice"]["title"] == NOTICE["title"] and out["degraded"] is False
    assert "batch FT5427 in listed [FT5427]" in out["reasoning"]


def test_handler_loads_item_by_id(demo_store) -> None:
    out = handler({"candidate": CANDIDATE, "item_id": "i1", "run": RUN}, None)
    assert out["covers_item"] is True and out["verifier"] == "deterministic"
    missing = handler({"candidate": CANDIDATE, "item_id": "nope"}, None)
    assert missing["covers_item"] is None and missing["verifier"] == "none"
    assert missing["reasoning"] == "item not found"
    assert missing["notice"]["product"] == "Paracetamol Tablets IP 650mg"
    assert missing["degraded"] is False


def test_handler_missing_notice(demo_store) -> None:
    out = handler({"candidate": {"notice_pk": "cdsco_nsq#nope"}, "item": ITEM}, None)
    assert out["covers_item"] is None
    assert out["reasoning"] == "notice not found"
    assert out["verifier"] == "none"
    assert out["notice_pk"] == "cdsco_nsq#nope" and out["notice"] is None
    assert out["quoted_sentence"] == "" and out["confidence"] == 0
    assert out["degraded"] is False


@pytest.mark.parametrize(
    "event", [None, {}, "garbage", {"candidate": "garbage"}, {"candidate": {}, "item": ITEM}]
)
def test_handler_never_raises_on_broken_event(demo_store, event) -> None:
    out = handler(event, None)
    assert out["covers_item"] is None and out["verifier"] == "none"
    assert out["reasoning"] == "notice not found"


def test_handler_catches_exceptions(monkeypatch: pytest.MonkeyPatch, demo_store) -> None:
    def boom(kind, pk):
        raise RuntimeError("table offline")

    monkeypatch.setattr(verify_mod.dynamo, "get", boom)
    out = handler({"candidate": CANDIDATE, "item": ITEM, "run": RUN}, None)
    assert out["covers_item"] is None and out["verifier"] == "none"
    assert out["degraded"] is True
    assert out["reasoning"] == "verification unavailable"
    assert out["error"] == "RuntimeError: table offline"
    assert out["notice_pk"] == NOTICE["pk"]


def test_handler_result_is_json_serialisable(demo_store) -> None:
    out = handler({"candidate": CANDIDATE, "item": ITEM, "run": RUN}, None)
    assert json.loads(json.dumps(out)) == out
