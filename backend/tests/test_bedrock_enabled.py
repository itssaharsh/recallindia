"""BEDROCK_ENABLED=false: no client, BedrockUnavailable, one warning per invocation."""

from __future__ import annotations

import logging

import pytest

from common import bedrock
from common.bedrock import BedrockError, BedrockUnavailable, converse, converse_json, is_enabled


@pytest.fixture(autouse=True)
def _fresh_warning():
    bedrock.reset_invocation_warning()
    yield
    bedrock.reset_invocation_warning()


@pytest.fixture
def no_client(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    def factory(region: str):
        calls.append(region)
        pytest.fail("Bedrock client must not be created while disabled")

    monkeypatch.setattr(bedrock, "_client_factory", factory)
    return calls


@pytest.mark.parametrize("value", ["false", "0", "no", "off", "FALSE", " False "])
def test_disabled_values(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("BEDROCK_ENABLED", value)
    assert is_enabled() is False


@pytest.mark.parametrize("value", [None, "false", "0", "no", "off", "anything-else", ""])
def test_disabled_by_default(monkeypatch: pytest.MonkeyPatch, value: str | None) -> None:
    """No LLM in the decision path unless explicitly opted in (quotas held at 0 on this account)."""
    bedrock.reset_invocation_warning()
    if value is None:
        monkeypatch.delenv("BEDROCK_ENABLED", raising=False)
    else:
        monkeypatch.setenv("BEDROCK_ENABLED", value)
    assert is_enabled() is False
    with pytest.raises(BedrockUnavailable):
        converse("verify", "never attempted")


@pytest.mark.parametrize("value", ["true", "1", "yes", "on", "TRUE"])
def test_enabled_only_by_explicit_opt_in(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("BEDROCK_ENABLED", value)
    assert is_enabled() is True
    assert converse("verify", "still works in demo mode")["demo"] is True


def test_live_disabled_raises_without_client(monkeypatch: pytest.MonkeyPatch, no_client) -> None:
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    with pytest.raises(BedrockUnavailable):
        converse("verify", "p")
    assert no_client == []
    assert issubclass(BedrockUnavailable, BedrockError)


def test_demo_disabled_also_raises(monkeypatch: pytest.MonkeyPatch, no_client) -> None:
    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    with pytest.raises(BedrockUnavailable):
        converse("normalise", "map rows")
    assert converse_json("normalise", "map rows") is None
    assert no_client == []


def test_caller_takes_the_deterministic_fallback(
    monkeypatch: pytest.MonkeyPatch, caplog, no_client
) -> None:
    """cdsco_normalise with the flag off: rows still map, one warning, nothing degraded."""
    from ingest import cdsco_normalise

    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    monkeypatch.delenv("_X_AMZN_TRACE_ID", raising=False)
    # _try_bedrock returns early in demo mode; pretend to be live for that check only so the
    # converse_json call is actually attempted (fetch/store still use the demo fixtures).
    monkeypatch.setattr(cdsco_normalise, "is_demo", lambda: False)
    caplog.set_level(logging.WARNING, logger="common.bedrock")
    out = cdsco_normalise.handler({}, None)
    assert out["degraded"] is False and out["notices_out"] == 239
    assert out["fallback_used"]["normalise"] is True
    warnings = [r.getMessage() for r in caplog.records if r.name == "common.bedrock"]
    assert warnings == [bedrock.DISABLED_WARNING]
    assert no_client == []


def test_one_warning_per_invocation(monkeypatch: pytest.MonkeyPatch, caplog, no_client) -> None:
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    monkeypatch.delenv("_X_AMZN_TRACE_ID", raising=False)
    caplog.set_level(logging.WARNING, logger="common.bedrock")

    def warnings() -> list[str]:
        return [r.getMessage() for r in caplog.records if r.name == "common.bedrock"]

    for _ in range(2):
        with pytest.raises(BedrockUnavailable):
            converse("verify", "p")
    assert converse_json("verify", "p") is None
    assert warnings() == ["Bedrock disabled (BEDROCK_ENABLED=false): using deterministic fallback"]

    bedrock.reset_invocation_warning()
    with pytest.raises(BedrockUnavailable):
        converse("verify", "p")
    assert len(warnings()) == 2


def test_new_trace_id_rearms_warning(monkeypatch: pytest.MonkeyPatch, caplog, no_client) -> None:
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    caplog.set_level(logging.WARNING, logger="common.bedrock")
    monkeypatch.setenv("_X_AMZN_TRACE_ID", "Root=1-aaa")
    for _ in range(3):
        assert converse_json("verify", "p") is None
    monkeypatch.setenv("_X_AMZN_TRACE_ID", "Root=1-bbb")
    for _ in range(3):
        assert converse_json("verify", "p") is None
    assert sum(1 for r in caplog.records if r.name == "common.bedrock") == 2
