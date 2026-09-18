"""Bedrock wrapper: demo fixtures, model-id prefix swaps, region fallback, JSON extraction."""

import json

import pytest
from botocore.exceptions import ClientError

from common import bedrock
from common.bedrock import BedrockError, converse, converse_json, model_id_for
from common.demo_mode import fixture_path


def test_demo_converse_returns_default_fixture() -> None:
    out = converse("verify", "does this notice cover the item?")
    assert out["demo"] is True
    assert out["region"] == "ap-south-1"
    assert out["model_id"] == "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    assert json.loads(out["text"])["covers_item"] is None
    assert json.loads(converse("normalise", "map these rows")["text"]) == {"rows": []}


def test_fixture_key_selects_specific_fixture(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    fx = tmp_path / "fixtures"
    (fx / "bedrock" / "verify").mkdir(parents=True)
    (fx / "bedrock" / "verify" / "cdsco-7.json").write_text(json.dumps({"text": "specific"}))
    (fx / "bedrock" / "verify" / "default.json").write_text(json.dumps({"text": "fallback"}))
    monkeypatch.setenv("FIXTURES_DIR", str(fx))
    assert fixture_path("bedrock", "verify", "cdsco-7.json").is_file()
    assert converse("verify", "p", fixture_key="cdsco-7")["text"] == "specific"
    assert converse("verify", "p", fixture_key="missing")["text"] == "fallback"


def test_model_id_prefix_swaps(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MODEL_VERIFY", raising=False)
    monkeypatch.delenv("MODEL_NORMALISE", raising=False)
    assert model_id_for("normalise", "ap-south-1") == "apac.amazon.nova-lite-v1:0"
    assert model_id_for("normalise", "us-east-1") == "us.amazon.nova-lite-v1:0"
    assert model_id_for("verify", "us-east-1") == "global.anthropic.claude-haiku-4-5-20251001-v1:0"
    monkeypatch.setenv("MODEL_VERIFY", "us.anthropic.claude-haiku-4-5-20251001-v1:0")
    assert model_id_for("verify", "ap-south-1") == "apac.anthropic.claude-haiku-4-5-20251001-v1:0"
    assert model_id_for("verify", "us-east-1") == "us.anthropic.claude-haiku-4-5-20251001-v1:0"


class _FakeClient:
    def __init__(self, region: str, log: list[dict], fail_regions: set[str]) -> None:
        self.region, self.log, self.fail_regions = region, log, fail_regions

    def converse(self, **request):
        self.log.append({"region": self.region, **request})
        if self.region in self.fail_regions:
            raise ClientError(
                {"Error": {"Code": "ValidationException", "Message": "Operation not allowed"}},
                "Converse",
            )
        return {
            "output": {"message": {"content": [{"text": '{"rows": [1]}'}]}},
            "usage": {"inputTokens": 3, "outputTokens": 2},
        }


@pytest.fixture
def live_bedrock(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.delenv("MODEL_NORMALISE", raising=False)
    log: list[dict] = []

    def install(fail_regions: set[str]) -> list[dict]:
        monkeypatch.setattr(
            bedrock, "_client_factory", lambda region: _FakeClient(region, log, fail_regions)
        )
        return log

    return install


def test_live_falls_back_to_us_east_1(live_bedrock) -> None:
    log = live_bedrock({"ap-south-1"})
    out = converse("normalise", "map rows", system="strict json", max_tokens=64)
    assert out["region"] == "us-east-1"
    assert out["model_id"] == "us.amazon.nova-lite-v1:0"
    assert out["demo"] is False
    assert out["usage"] == {"inputTokens": 3, "outputTokens": 2}
    assert [c["region"] for c in log] == ["ap-south-1", "us-east-1"]
    assert log[0]["modelId"] == "apac.amazon.nova-lite-v1:0"
    assert log[1]["inferenceConfig"] == {"maxTokens": 64, "temperature": 0.0}
    assert log[1]["system"] == [{"text": "strict json"}]


def test_live_both_regions_failing_raises(live_bedrock) -> None:
    live_bedrock({"ap-south-1", "us-east-1"})
    with pytest.raises(BedrockError, match="fallback:"):
        converse("normalise", "map rows")
    assert converse_json("normalise", "map rows") is None


def test_converse_json_parses_fenced_and_rejects_garbage(monkeypatch, tmp_path) -> None:
    fx = tmp_path / "fixtures" / "bedrock" / "verify"
    fx.mkdir(parents=True)
    fenced = 'Sure:\n```json\n{"covers_item": true, "confidence": 0.9}\n```\ntrailing'
    (fx / "fenced.json").write_text(json.dumps({"text": fenced}))
    (fx / "garbage.json").write_text(json.dumps({"text": "no json here {oops"}))
    monkeypatch.setenv("FIXTURES_DIR", str(tmp_path / "fixtures"))
    assert converse_json("verify", "p", fixture_key="fenced") == {
        "covers_item": True,
        "confidence": 0.9,
    }
    assert converse_json("verify", "p", fixture_key="garbage") is None
    assert converse_json("verify", "p", fixture_key="nope") is None  # no default -> None
