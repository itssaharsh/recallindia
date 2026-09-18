"""Single entry point for every Bedrock call (Claude Haiku 4.5 verify/claim, Nova Lite normalise).

Model ids come from ``MODEL_VERIFY`` / ``MODEL_NORMALISE``. Calls go to ``BEDROCK_REGION`` first
and fall back once to ``BEDROCK_FALLBACK_REGION``, swapping the inference-profile prefix
(``apac.`` <-> ``us.``; ``global.`` untouched). In demo mode the reply is read from
``fixtures/bedrock/<kind>/<key>.json``.

``BEDROCK_ENABLED`` (default true; ``0``/``false``/``no``/``off`` disable) short-circuits
every call -- demo or live -- with ``BedrockUnavailable`` so callers take their deterministic
/ template fallback; one warning is logged per Lambda invocation, not per call.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Any, Literal

from common.demo_mode import FixtureMissing, fixture_path, is_demo

Kind = Literal["verify", "normalise"]

_DEFAULT_MODELS: dict[str, tuple[str, str]] = {
    "verify": ("MODEL_VERIFY", "global.anthropic.claude-haiku-4-5-20251001-v1:0"),
    "normalise": ("MODEL_NORMALISE", "apac.amazon.nova-lite-v1:0"),
}
_FALLBACK_CODES = frozenset(
    {
        "ValidationException",
        "ResourceNotFoundException",
        "AccessDeniedException",
        "ThrottlingException",
        "ServiceUnavailableException",
        "ModelNotReadyException",
    }
)
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


log = logging.getLogger("common.bedrock")

_DISABLED_VALUES = frozenset({"0", "false", "no", "off"})
DISABLED_WARNING = "Bedrock disabled (BEDROCK_ENABLED=false): using deterministic fallback"
# One warning per Lambda invocation: keyed on the X-Ray trace id Lambda sets per invocation
# (``_X_AMZN_TRACE_ID``); without one (local runs, tests) once per process until reset.
_warned = False
_warned_key: str | None = None


class BedrockError(Exception):
    """Both the primary and the fallback region failed."""


class BedrockUnavailable(BedrockError):
    """``BEDROCK_ENABLED`` is false: no call was attempted; use the deterministic fallback."""


def is_enabled() -> bool:
    """``BEDROCK_ENABLED`` env, default true; ``0``/``false``/``no``/``off`` disable."""
    return os.environ.get("BEDROCK_ENABLED", "true").strip().lower() not in _DISABLED_VALUES


def reset_invocation_warning() -> None:
    """Re-arm the once-per-invocation warning (tests, or a long-lived local process)."""
    global _warned, _warned_key
    _warned, _warned_key = False, None


def _warn_disabled_once() -> None:
    global _warned, _warned_key
    key = os.environ.get("_X_AMZN_TRACE_ID")
    if _warned and _warned_key == key:
        return
    _warned, _warned_key = True, key
    log.warning(DISABLED_WARNING)


def _region() -> str:
    return os.environ.get("BEDROCK_REGION", "ap-south-1")


def _fallback_region() -> str:
    return os.environ.get("BEDROCK_FALLBACK_REGION", "us-east-1")


def model_id_for(kind: Kind, region: str) -> str:
    """Model id for ``kind`` adjusted to ``region``'s inference-profile prefix."""
    env_name, default = _DEFAULT_MODELS[kind]
    base = os.environ.get(env_name) or default
    if region.startswith("us-") and base.startswith("apac."):
        return "us." + base[len("apac.") :]
    if region.startswith("ap-") and base.startswith("us."):
        return "apac." + base[len("us.") :]
    return base


def _default_client_factory(region: str) -> Any:
    import boto3  # lazy: demo mode must work without boto3 credentials/network

    return boto3.client("bedrock-runtime", region_name=region)


# Module-level and monkeypatchable so tests can inject a fake client per region.
_client_factory = _default_client_factory


def _demo_reply(kind: Kind, prompt: str, fixture_key: str | None) -> str:
    key = fixture_key or hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12]
    for name in (key, "default"):
        path = fixture_path("bedrock", kind, f"{name}.json")
        if path.is_file():
            with path.open(encoding="utf-8") as fh:
                return str(json.load(fh)["text"])
    raise FixtureMissing(f"fixtures/bedrock/{kind}/{key}.json (and default.json)")


def _is_fallback_error(err: Exception) -> bool:
    from botocore.exceptions import ClientError, EndpointConnectionError

    if isinstance(err, EndpointConnectionError):
        return True
    if isinstance(err, ClientError):
        return err.response.get("Error", {}).get("Code") in _FALLBACK_CODES
    return False


def _invoke(
    kind: Kind, region: str, prompt: str, system: str | None, max_tokens: int, temperature: float
) -> dict:
    model_id = model_id_for(kind, region)
    request: dict[str, Any] = {
        "modelId": model_id,
        "messages": [{"role": "user", "content": [{"text": prompt}]}],
        "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
    }
    if system:
        request["system"] = [{"text": system}]
    resp = _client_factory(region).converse(**request)
    blocks = resp.get("output", {}).get("message", {}).get("content", [])
    text = "".join(block.get("text", "") for block in blocks)
    return {
        "text": text,
        "model_id": model_id,
        "region": region,
        "demo": False,
        "usage": dict(resp.get("usage", {})),
    }


def converse(
    kind: Kind,
    prompt: str,
    *,
    system: str | None = None,
    max_tokens: int = 1024,
    temperature: float = 0.0,
    fixture_key: str | None = None,
) -> dict:
    """Call the ``kind`` model and return ``{text, model_id, region, demo, usage}``.

    Demo mode reads ``fixtures/bedrock/<kind>/<fixture_key or sha256(prompt)[:12]>.json``
    (falling back to ``default.json``). Live: primary region, then one retry in the fallback
    region on access/availability errors; raises ``BedrockError`` when both fail.
    Raises ``BedrockUnavailable`` before doing anything when ``BEDROCK_ENABLED`` is false.
    """
    if not is_enabled():
        _warn_disabled_once()
        raise BedrockUnavailable(DISABLED_WARNING)
    if is_demo():
        return {
            "text": _demo_reply(kind, prompt, fixture_key),
            "model_id": model_id_for(kind, _region()),
            "region": _region(),
            "demo": True,
            "usage": {},
        }
    primary = _region()
    try:
        return _invoke(kind, primary, prompt, system, max_tokens, temperature)
    except Exception as primary_err:
        if not _is_fallback_error(primary_err):
            raise BedrockError(f"{primary}: {primary_err}") from primary_err
        fallback = _fallback_region()
        try:
            return _invoke(kind, fallback, prompt, system, max_tokens, temperature)
        except Exception as fallback_err:
            raise BedrockError(f"{primary_err} | fallback: {fallback_err}") from fallback_err


def extract_json_object(text: str) -> dict | None:
    """First top-level ``{...}`` JSON object in ``text`` (code fences stripped), else None."""
    fenced = _FENCE.search(text)
    candidate = fenced.group(1) if fenced else text
    decoder = json.JSONDecoder()
    for start in (m.start() for m in re.finditer(r"\{", candidate)):
        try:
            value, _ = decoder.raw_decode(candidate, start)
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    return None


def converse_json(kind: Kind, prompt: str, **kw: Any) -> dict | None:
    """``converse`` then parse the reply as one JSON object; None on any failure, never raises."""
    try:
        reply = converse(kind, prompt, **kw)
    except (BedrockError, FixtureMissing):
        return None
    return extract_json_object(reply["text"])
