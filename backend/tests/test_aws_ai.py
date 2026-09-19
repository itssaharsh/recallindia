"""aws_ai wrappers: demo fixtures, live mapping via fake clients, AwsAiError wrapping, blanks."""

from __future__ import annotations

import io

import pytest
from botocore.exceptions import ClientError

from common import aws_ai
from common.aws_ai import AwsAiError, comprehend_entities, polly_mp3, polly_voice, translate
from common.demo_mode import FixtureMissing

FIXED_INPUT = (
    "Paracetamol Tablets IP 650mg, batch FT5427, Forgo Pharmaceuticals, "
    "failed CDSCO quality test, July 2026 alert"
)
ENTITY_KEYS = {"Text", "Type", "Score", "BeginOffset", "EndOffset"}
KAJAL = {
    "Id": "Kajal",
    "Name": "Kajal",
    "Gender": "Female",
    "LanguageCode": "en-IN",
    "LanguageName": "Indian English",
    "AdditionalLanguageCodes": ["hi-IN"],
    "SupportedEngines": ["neural"],
}
ADITI = {
    "Id": "Aditi",
    "Name": "Aditi",
    "Gender": "Female",
    "LanguageCode": "hi-IN",
    "LanguageName": "Hindi",
    "AdditionalLanguageCodes": ["en-IN"],
    "SupportedEngines": ["standard"],
}
JOANNA = {"Id": "Joanna", "LanguageCode": "en-US", "SupportedEngines": ["neural", "standard"]}


def _devanagari(text: str) -> bool:
    return any("ऀ" <= ch <= "ॿ" for ch in text)


def _client_error(operation: str, code: str = "AccessDeniedException") -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": f"{operation} denied"}}, operation)


@pytest.fixture(autouse=True)
def _fresh_voice_cache():
    aws_ai.reset_voice_cache()
    yield
    aws_ai.reset_voice_cache()


# --- demo mode (fixtures recorded from the live ap-south-1 responses) --------------------------


def test_demo_comprehend_entities_from_fixture() -> None:
    entities = comprehend_entities(FIXED_INPUT)
    assert len(entities) >= 1
    assert all(ENTITY_KEYS <= set(e) for e in entities)
    assert any(e["Type"] in {"ORGANIZATION", "OTHER", "QUANTITY", "DATE"} for e in entities) or any(
        "Paracetamol" in e["Text"] for e in entities
    )
    # what P06 relies on: manufacturer, strength and month all come back as spans
    by_type = {e["Type"]: e["Text"] for e in entities}
    assert by_type["ORGANIZATION"] == "Forgo Pharmaceuticals"
    assert by_type["QUANTITY"] == "650mg"
    assert by_type["DATE"] == "July 2026"


def test_demo_comprehend_returns_copies() -> None:
    first = comprehend_entities(FIXED_INPUT)
    first[0]["Text"] = "mutated"
    assert comprehend_entities(FIXED_INPUT)[0]["Text"] != "mutated"


def test_demo_comprehend_answers_only_recorded_text() -> None:
    """One canned response for every line would give every pasted line the same brand."""
    assert comprehend_entities("Havells Efficiencia Neo Ceiling Fan") == []


def test_demo_translate_returns_devanagari() -> None:
    out = translate(FIXED_INPUT)
    assert out and _devanagari(out)
    assert "FT5427" in out  # the batch number survives translation untouched


def test_demo_polly_mp3_is_mp3_bytes() -> None:
    data = polly_mp3("कोई भी पाठ")
    assert isinstance(data, bytes)
    assert data.startswith(b"ID3") or data[:2] == b"\xff\xfb"
    assert len(data) > 1000


def test_demo_polly_voice() -> None:
    assert polly_voice() == ("Kajal", "neural")


def test_demo_missing_fixture_raises(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("FIXTURES_DIR", str(tmp_path))
    with pytest.raises(FixtureMissing):
        comprehend_entities("x")
    with pytest.raises(FixtureMissing):
        translate("x")
    with pytest.raises(FixtureMissing):
        polly_mp3("x")


# --- blank inputs never create a client -----------------------------------------------------


@pytest.fixture
def no_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DEMO_MODE", "0")
    for name in ("_comprehend_client", "_translate_client", "_polly_client"):
        monkeypatch.setattr(
            aws_ai, name, lambda name=name: pytest.fail(f"{name} must not be created")
        )


@pytest.mark.parametrize("text", ["", "   ", "\n\t"])
def test_blank_inputs_short_circuit(no_clients, text: str) -> None:
    assert comprehend_entities(text) == []
    assert translate(text) == ""
    assert polly_mp3(text) == b""


# --- live path with fake clients ------------------------------------------------------------


class _FakeComprehend:
    def __init__(self, log: list[dict], fail: bool = False) -> None:
        self.log, self.fail = log, fail

    def detect_entities(self, **kw):
        self.log.append(kw)
        if self.fail:
            raise _client_error("DetectEntities", "SubscriptionRequiredException")
        return {
            "Entities": [
                {
                    "Score": 0.96,
                    "Type": "ORGANIZATION",
                    "Text": "Forgo Pharmaceuticals",
                    "BeginOffset": 44,
                    "EndOffset": 65,
                }
            ],
            "ResponseMetadata": {"HTTPStatusCode": 200},
        }


class _FakeTranslate:
    def __init__(self, log: list[dict], fail: bool = False) -> None:
        self.log, self.fail = log, fail

    def translate_text(self, **kw):
        self.log.append(kw)
        if self.fail:
            raise _client_error("TranslateText")
        return {
            "TranslatedText": "पेरासिटामोल",
            "SourceLanguageCode": kw["SourceLanguageCode"],
            "TargetLanguageCode": kw["TargetLanguageCode"],
        }


class _FakePolly:
    def __init__(self, log: list[tuple], voices: list[dict], fail_synth: bool = False) -> None:
        self.log, self.voices, self.fail_synth = log, voices, fail_synth

    def describe_voices(self, **kw):
        self.log.append(("describe_voices", kw))
        code = kw["LanguageCode"]
        return {
            "Voices": [
                v
                for v in self.voices
                if v["LanguageCode"] == code or code in v.get("AdditionalLanguageCodes", [])
            ]
        }

    def synthesize_speech(self, **kw):
        self.log.append(("synthesize_speech", kw))
        if self.fail_synth:
            raise _client_error("SynthesizeSpeech", "ValidationException")
        return {"AudioStream": io.BytesIO(b"ID3" + b"\0" * 2000), "ContentType": "audio/mpeg"}


@pytest.fixture
def live(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    return monkeypatch


def test_live_comprehend_maps_entities_and_truncates(live) -> None:
    log: list[dict] = []
    live.setattr(aws_ai, "_comprehend_client", lambda: _FakeComprehend(log))
    out = comprehend_entities("a" * 6000)
    assert out == [
        {
            "Score": 0.96,
            "Type": "ORGANIZATION",
            "Text": "Forgo Pharmaceuticals",
            "BeginOffset": 44,
            "EndOffset": 65,
        }
    ]
    assert log == [{"Text": "a" * 5000, "LanguageCode": "en"}]
    comprehend_entities("x", language_code="hi")
    assert log[-1]["LanguageCode"] == "hi"


def test_live_comprehend_wraps_client_error(live) -> None:
    live.setattr(aws_ai, "_comprehend_client", lambda: _FakeComprehend([], fail=True))
    with pytest.raises(AwsAiError, match=r"^comprehend: .*SubscriptionRequiredException") as info:
        comprehend_entities(FIXED_INPUT)
    assert isinstance(info.value.__cause__, ClientError)


def test_live_translate_maps_text_and_truncates(live) -> None:
    log: list[dict] = []
    live.setattr(aws_ai, "_translate_client", lambda: _FakeTranslate(log))
    assert translate("b" * 12000) == "पेरासिटामोल"
    assert log == [{"Text": "b" * 10000, "SourceLanguageCode": "en", "TargetLanguageCode": "hi"}]
    translate("x", "hi", "en")
    assert (log[-1]["SourceLanguageCode"], log[-1]["TargetLanguageCode"]) == ("hi", "en")


def test_live_translate_wraps_client_error(live) -> None:
    live.setattr(aws_ai, "_translate_client", lambda: _FakeTranslate([], fail=True))
    with pytest.raises(AwsAiError, match=r"^translate: .*AccessDeniedException"):
        translate(FIXED_INPUT)


def test_live_polly_prefers_kajal_neural_and_caches_voices(live) -> None:
    log: list[tuple] = []
    live.setattr(aws_ai, "_polly_client", lambda: _FakePolly(log, [ADITI, KAJAL, JOANNA]))
    assert polly_voice() == ("Kajal", "neural")
    assert log == [
        ("describe_voices", {"LanguageCode": "hi-IN", "IncludeAdditionalLanguageCodes": True})
    ]
    assert polly_voice() == ("Kajal", "neural")
    assert len(log) == 1  # once per process
    aws_ai.reset_voice_cache()
    polly_voice()
    assert len(log) == 2


def test_live_polly_mp3_kajal_request_shape(live) -> None:
    log: list[tuple] = []
    live.setattr(aws_ai, "_polly_client", lambda: _FakePolly(log, [KAJAL, ADITI]))
    data = polly_mp3("क" * 4000)
    assert data.startswith(b"ID3") and len(data) == 2003
    assert log[-1] == (
        "synthesize_speech",
        {
            "Text": "क" * 3000,
            "OutputFormat": "mp3",
            "VoiceId": "Kajal",
            "Engine": "neural",
            "LanguageCode": "hi-IN",
        },
    )


def test_live_polly_falls_back_to_aditi_standard(live) -> None:
    log: list[tuple] = []
    live.setattr(aws_ai, "_polly_client", lambda: _FakePolly(log, [ADITI, JOANNA]))
    assert polly_voice() == ("Aditi", "standard")
    polly_mp3("नमस्ते")
    request = log[-1][1]
    assert (request["VoiceId"], request["Engine"], request["LanguageCode"]) == (
        "Aditi",
        "standard",
        "hi-IN",
    )


def test_live_polly_explicit_voice(live) -> None:
    log: list[tuple] = []
    live.setattr(aws_ai, "_polly_client", lambda: _FakePolly(log, [KAJAL, ADITI]))
    polly_mp3("x", voice="Aditi")
    assert log[-1][1]["VoiceId"] == "Aditi" and log[-1][1]["Engine"] == "standard"
    assert log[-1][1]["LanguageCode"] == "hi-IN"
    polly_mp3("x", voice="Joanna")  # not an Indian voice: no hi-IN LanguageCode forced
    assert log[-1][1]["VoiceId"] == "Joanna" and "LanguageCode" not in log[-1][1]


def test_live_polly_no_preferred_voice_raises(live) -> None:
    log: list[tuple] = []
    live.setattr(aws_ai, "_polly_client", lambda: _FakePolly(log, [JOANNA]))
    with pytest.raises(AwsAiError, match=r"^polly: none of \['Kajal', 'Aditi'\]"):
        polly_voice()
    assert [kw["LanguageCode"] for _, kw in log] == ["hi-IN", "en-IN"]


def test_live_polly_wraps_client_error(live) -> None:
    live.setattr(aws_ai, "_polly_client", lambda: _FakePolly([], [KAJAL], fail_synth=True))
    with pytest.raises(AwsAiError, match=r"^polly: .*ValidationException") as info:
        polly_mp3(FIXED_INPUT)
    assert isinstance(info.value.__cause__, ClientError)


def test_fixture_provenance() -> None:
    """The committed fixtures were recorded for the script's fixed input."""
    import json

    from common.demo_mode import fixture_path

    for name in ("comprehend_entities.json", "translate_en_hi.json"):
        with fixture_path("aws_ai", name).open(encoding="utf-8") as fh:
            assert json.load(fh)["input"] == FIXED_INPUT
