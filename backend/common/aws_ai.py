"""Comprehend, Translate and Polly wrappers with ``DEMO_MODE`` fixtures under ``fixtures/aws_ai/``.

What each is for:

* ``comprehend_entities`` -- paste-import normalisation (P06): entity spans (ORGANIZATION,
  QUANTITY, DATE, OTHER ...) in a pasted free-text line, so the deterministic identifier rules
  know which tokens are the manufacturer, the strength and the date. It never decides a match.
* ``translate`` -- English -> Hindi for the alert text and the voice-note script.
* ``polly_voice`` / ``polly_mp3`` -- the Hindi voice note played on ``/mine`` (P10): Kajal
  (neural, hi-IN) preferred, Aditi (standard) as the fallback.

Every function has a demo path that returns the identical shape from a saved live response, so
the product runs with no credentials. Live failures are raised as ``AwsAiError`` naming the
service -- never swallowed. boto3 is imported lazily and the ``_*_client`` factories are
module-level so tests monkeypatch them with fakes.
"""

from __future__ import annotations

import json
import os
from typing import Any

from common.demo_mode import FixtureMissing, fixture_path, is_demo

REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
PREFERRED_VOICES: tuple[str, ...] = ("Kajal", "Aditi")
# Bilingual (hi-IN / en-IN) voices: ``LanguageCode="hi-IN"`` selects the Hindi pronunciation.
HINDI_VOICES = frozenset({"Kajal", "Aditi"})
DEMO_VOICE: tuple[str, str] = ("Kajal", "neural")
_VOICE_LANGUAGES = ("hi-IN", "en-IN")
_FIXTURE_DIR = "aws_ai"
# Per-request text limits (chars): Comprehend 5000, Translate 10000 bytes, Polly 3000 billed.
_COMPREHEND_MAX_CHARS = 5000
_TRANSLATE_MAX_CHARS = 10000
_POLLY_MAX_CHARS = 3000


class AwsAiError(Exception):
    """A live Comprehend / Translate / Polly call failed; the message names the service."""


# --- clients (module-level so tests monkeypatch them) -----------------------------------------


def _comprehend_client() -> Any:
    import boto3  # lazy: demo mode must not need boto3 credentials

    return boto3.client("comprehend", region_name=REGION)


def _translate_client() -> Any:
    import boto3  # lazy

    return boto3.client("translate", region_name=REGION)


def _polly_client() -> Any:
    import boto3  # lazy

    return boto3.client("polly", region_name=REGION)


def _call(service: str, method: Any, **kwargs: Any) -> Any:
    """Invoke one boto3 client method, wrapping botocore failures in ``AwsAiError``."""
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        return method(**kwargs)
    except (BotoCoreError, ClientError) as err:
        raise AwsAiError(f"{service}: {err}") from err


def _fixture(name: str):
    path = fixture_path(_FIXTURE_DIR, name)
    if not path.is_file():
        raise FixtureMissing(f"fixtures/{_FIXTURE_DIR}/{name}")
    return path


def _json_fixture(name: str) -> dict:
    with _fixture(name).open(encoding="utf-8") as fh:
        return json.load(fh)


def _blank(text: str | None) -> bool:
    return not text or not text.strip()


# --- Comprehend ------------------------------------------------------------------------------


def comprehend_entities(text: str, *, language_code: str = "en") -> list[dict]:
    """Entity spans in ``text``: ``[{Text, Type, Score, BeginOffset, EndOffset}, ...]``.

    Paste-import normalisation (P06): tells the deterministic rules which tokens of a pasted
    line are the manufacturer (ORGANIZATION), strength (QUANTITY), month (DATE) or product
    (OTHER). Live: Comprehend ``DetectEntities`` on the first 5000 chars. Demo: the
    ``Entities`` of ``fixtures/aws_ai/comprehend_entities.json``. Blank text -> ``[]`` with
    no call. Raises ``AwsAiError`` on a live failure.
    """
    if _blank(text):
        return []
    if is_demo():
        return [dict(e) for e in _json_fixture("comprehend_entities.json")["Entities"]]
    resp = _call(
        "comprehend",
        _comprehend_client().detect_entities,
        Text=text[:_COMPREHEND_MAX_CHARS],
        LanguageCode=language_code,
    )
    return [dict(e) for e in resp.get("Entities", [])]


# --- Translate -------------------------------------------------------------------------------


def translate(text: str, source: str = "en", target: str = "hi") -> str:
    """``text`` translated from ``source`` to ``target`` (default English -> Hindi).

    Used for the alert text and the voice-note script (P10). Live: Translate ``TranslateText``
    on the first 10000 chars. Demo: ``TranslatedText`` of ``fixtures/aws_ai/translate_en_hi.json``.
    Blank text -> ``""`` with no call. Raises ``AwsAiError`` on a live failure.
    """
    if _blank(text):
        return ""
    if is_demo():
        return str(_json_fixture("translate_en_hi.json")["TranslatedText"])
    resp = _call(
        "translate",
        _translate_client().translate_text,
        Text=text[:_TRANSLATE_MAX_CHARS],
        SourceLanguageCode=source,
        TargetLanguageCode=target,
    )
    return str(resp["TranslatedText"])


# --- Polly -----------------------------------------------------------------------------------

# ``DescribeVoices`` result per language code, filled once per process (VoiceId -> voice).
_voices_by_language: dict[str, dict[str, dict]] = {}


def reset_voice_cache() -> None:
    """Forget the cached ``DescribeVoices`` results (tests, or a long-lived local process)."""
    _voices_by_language.clear()


def _voices_for(language_code: str) -> dict[str, dict]:
    if language_code not in _voices_by_language:
        resp = _call(
            "polly",
            _polly_client().describe_voices,
            LanguageCode=language_code,
            IncludeAdditionalLanguageCodes=True,
        )
        _voices_by_language[language_code] = {
            v["Id"]: dict(v) for v in resp.get("Voices", []) if "Id" in v
        }
    return _voices_by_language[language_code]


def _engine_for(voice: dict) -> str:
    return "neural" if "neural" in voice.get("SupportedEngines", []) else "standard"


def polly_voice(preferred: tuple[str, ...] = PREFERRED_VOICES) -> tuple[str, str]:
    """``(VoiceId, Engine)`` for the Hindi voice note (P10): first of ``preferred`` that exists.

    Live: ``DescribeVoices`` for hi-IN (then en-IN only if needed), once per process; Engine is
    ``"neural"`` when the voice's ``SupportedEngines`` lists it, else ``"standard"``. Demo:
    ``("Kajal", "neural")``. Raises ``AwsAiError`` when none of ``preferred`` is available in
    ``REGION`` (or the lookup fails).
    """
    if is_demo():
        return DEMO_VOICE
    seen: dict[str, dict] = {}
    for code in _VOICE_LANGUAGES:
        seen.update(_voices_for(code))
        for name in preferred:
            if name in seen:
                return name, _engine_for(seen[name])
    raise AwsAiError(
        f"polly: none of {list(preferred)} available in {REGION} (voices: {sorted(seen)})"
    )


def _engine_for_id(voice_id: str) -> str:
    for code in _VOICE_LANGUAGES:
        voice = _voices_for(code).get(voice_id)
        if voice is not None:
            return _engine_for(voice)
    return "standard"


def polly_mp3(text: str, *, voice: str | None = None) -> bytes:
    """MP3 bytes of ``text`` spoken by ``voice`` (default ``polly_voice()``): the P10 voice note.

    Live: ``SynthesizeSpeech`` on the first 3000 chars, ``OutputFormat="mp3"``, Engine from
    ``DescribeVoices``, ``LanguageCode="hi-IN"`` for the bilingual Kajal/Aditi voices. Demo:
    ``fixtures/aws_ai/polly_sample.mp3``. Blank text -> ``b""`` with no call. Raises
    ``AwsAiError`` on a live failure.
    """
    if _blank(text):
        return b""
    if is_demo():
        return _fixture("polly_sample.mp3").read_bytes()
    if voice is None:
        voice_id, engine = polly_voice()
    else:
        voice_id, engine = voice, _engine_for_id(voice)
    request: dict[str, Any] = {
        "Text": text[:_POLLY_MAX_CHARS],
        "OutputFormat": "mp3",
        "VoiceId": voice_id,
        "Engine": engine,
    }
    if voice_id in HINDI_VOICES:
        request["LanguageCode"] = "hi-IN"
    resp = _call("polly", _polly_client().synthesize_speech, **request)
    return resp["AudioStream"].read()
