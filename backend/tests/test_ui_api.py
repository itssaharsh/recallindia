"""api.ui_api: stats, uploads, strip OCR, paste normalise, check status (DEMO_MODE fixtures)."""

from __future__ import annotations

import io
import json

import pytest

from api import app, match_api, strip_ocr, ui_api
from common import aws_ai, dynamo
from common.notices import write_meta
from pollers import cdsco_portal, nhtsa


def _call(method: str, path: str, body: object = None) -> tuple[int, dict]:
    event = {"requestContext": {"http": {"method": method}}, "rawPath": path}
    if body is not None:
        event["body"] = json.dumps(body)
    resp = app.handler(event, None)
    return resp["statusCode"], json.loads(resp["body"] or "{}")


@pytest.fixture(autouse=True)
def _fresh_stats_cache():
    ui_api.reset_stats_cache()
    yield
    ui_api.reset_stats_cache()


# --- GET /v1/stats -----------------------------------------------------------------------------


def test_health_of() -> None:
    assert ui_api.health_of(None) == "down"
    assert ui_api.health_of({"degraded": False, "last_success_at": "t"}) == "healthy"
    assert ui_api.health_of({"degraded": True, "last_success_at": "t"}) == "degraded"
    assert ui_api.health_of({"degraded": True, "last_success_at": None}) == "down"


def test_stats_counts_every_source_and_reads_poller_health() -> None:
    cdsco_portal.handler({}, None)  # 239 JUL-2026 rows, meta#cdsco_portal healthy
    nhtsa.handler({}, None)  # meta#nhtsa healthy
    write_meta("cpsc", ok=True)
    write_meta("cpsc", ok=False, error="HTTP 503")  # degraded, but an earlier run worked
    status, body = _call("GET", "/v1/stats")
    assert status == 200 and body["sources_count"] == 4
    by = {s["label"]: s for s in body["sources"]}
    assert by["CDSCO"]["count"] == 239 and by["CDSCO"]["health"] == "healthy"
    assert by["NHTSA"]["health"] == "healthy" and by["NHTSA"]["count"] > 0
    assert by["CPSC"]["health"] == "degraded" and by["CPSC"]["last_error"] == "HTTP 503"
    assert by["CPSC"]["last_success_at"] and by["openFDA"]["health"] == "down"
    assert body["total"] == sum(s["count"] for s in body["sources"])
    assert body["last_poll_at"] == max(
        s["last_run_at"] for s in body["sources"] if s["last_run_at"]
    )
    assert all("meta#" not in json.dumps(s["count"]) for s in body["sources"])


# --- POST /uploads -----------------------------------------------------------------------------


@pytest.mark.parametrize(("ctype", "ext"), [("image/jpeg", "jpg"), ("image/png", "png")])
def test_upload_hands_out_a_presigned_put(ctype: str, ext: str) -> None:
    status, body = _call("POST", "/uploads", {"content_type": ctype})
    assert status == 200 and ui_api.UPLOAD_KEY.match(body["key"]) and body["key"].endswith(ext)
    assert body["method"] == "PUT" and body["headers"] == {"content-type": ctype}
    assert body["url"].startswith("file://") and body["expires_in"] == 300


def test_upload_refuses_other_types() -> None:
    assert _call("POST", "/uploads", {"content_type": "image/heic"})[0] == 400


# --- POST /items/ocr ---------------------------------------------------------------------------

KEY = "uploads/0b6f2c1e-6a1d-4c9a-9d3f-1b2c3d4e5f60.jpg"


def test_ocr_reads_the_real_recorded_strip() -> None:
    """fixtures/aws_ai/textract_detect_text.json: a real Indian strip (CC BY 3.0, Commons). The
    batch stamp is vertical on the edge, so the full pass misses it and the right band finds it."""
    status, body = _call("POST", "/items/ocr", {"key": KEY})
    assert status == 200 and body["passes"] == ["full", "edge:right"]
    f = body["fields"]
    assert f["batch"] == "446AG710" and f["brand"] == "Acme Generics LLP"  # maker, not marketer
    assert (f["mfg_date"], f["exp_date"]) == ("2017-06", "2020-05")
    assert f["name"].endswith("Tablets") and body["needs_confirm"] is True
    assert "batch" in body["uncertain"]  # 0.58: the UI highlights it for the one-tap confirm
    assert any(line["edge"] == "right" for line in body["lines"])


def test_ocr_stops_after_the_full_pass_when_the_batch_is_there(monkeypatch) -> None:
    blocks = [
        {"BlockType": "LINE", "Text": t, "Confidence": 99.0,
         "Geometry": {"BoundingBox": {"Top": top, "Left": 0.1, "Height": h, "Width": 0.5}}}
        for t, top, h in (("Paracetamol Tablets IP 650 mg", 0.1, 0.08), ("B.No. FT5427", 0.5, 0.03))
    ]  # fmt: skip
    monkeypatch.setattr(aws_ai, "textract_detect_text", lambda bucket, key: {"Blocks": blocks})
    band_calls: list[str] = []

    def band(data: bytes, demo_band: str) -> dict:
        band_calls.append(demo_band)
        return {"Blocks": []}

    monkeypatch.setattr(aws_ai, "textract_detect_text_bytes", band)
    status, body = _call("POST", "/items/ocr", {"key": KEY})
    assert status == 200 and body["passes"] == ["full"] and body["fields"]["batch"] == "FT5427"
    assert band_calls == []


@pytest.mark.parametrize(
    "key", ["", "raw/cdsco/x.pdf", "uploads/../cdsco/x.jpg", "uploads/abc.jpg"]
)
def test_ocr_refuses_keys_that_are_not_uploads(key: str) -> None:
    assert _call("POST", "/items/ocr", {"key": key})[0] == 400


def test_ocr_missing_upload_is_404(monkeypatch) -> None:
    def boom(bucket, key):
        raise aws_ai.AwsAiError("textract: InvalidS3ObjectException: Unable to get object")

    monkeypatch.setattr(aws_ai, "textract_detect_text", boom)
    assert _call("POST", "/items/ocr", {"key": KEY})[0] == 404


def test_crop_band_returns_that_band_as_jpeg() -> None:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (400, 200), "white").save(buf, "JPEG")
    band = strip_ocr.crop_band(buf.getvalue(), (0.70, 0.0, 1.0, 1.0))
    with Image.open(io.BytesIO(band)) as im:
        assert im.format == "JPEG" and im.size == (120, 200)


# --- POST /items/normalise ---------------------------------------------------------------------


def test_normalise_reads_each_pasted_line() -> None:
    text = (
        "Pantoprazole Tablets IP Finecure Pharmaceuticals PEP5001\n\nJeep Compass 2022 MH12AB1234\n"
    )
    status, body = _call("POST", "/items/normalise", {"text": text})
    assert status == 200 and body["count"] == 2 and body["entities_source"] == "comprehend"
    first, second = body["rows"]
    assert (first["brand"], first["batch"], first["name"]) == (
        "Finecure Pharmaceuticals", "PEP5001", "Pantoprazole Tablets IP",
    )  # fmt: skip
    assert first["needs_confirm"] is False
    assert (second["kind"], second["make"], second["year"]) == ("vehicle", "jeep", 2022)


def test_normalise_survives_a_comprehend_outage(monkeypatch) -> None:
    def down(texts, language_code="en"):
        raise aws_ai.AwsAiError("comprehend: ThrottlingException")

    monkeypatch.setattr(aws_ai, "comprehend_entities_batch", down)
    status, body = _call("POST", "/items/normalise", {"lines": ["Dolo 650 Micro Labs ZZ0000"]})
    assert status == 200 and body["entities_source"].startswith("unavailable")
    assert body["rows"][0]["brand"] == "Micro Labs"  # the deterministic rules still read it


@pytest.mark.parametrize("body", [{"text": ""}, {"lines": "one string"}, [], {"lines": ["x"] * 51}])
def test_normalise_bad_bodies(body) -> None:
    assert _call("POST", "/items/normalise", body)[0] == 400


# --- GET /items/{id}/check-status ------------------------------------------------------------


@pytest.fixture
def notices(monkeypatch):
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    cdsco_portal.handler({}, None)


def _add(item: dict) -> str:
    status, body = _call("POST", "/items", item)
    assert status == 201
    return body["items"][0]["item_id"]


def test_check_status_demo_alert_and_clear(notices) -> None:
    alert = _add({"kind": "medicine", "name": "Paracetamol Tablets IP 650mg",
                  "brand": "Forgo Pharmaceuticals", "batch": "FT5427"})  # fmt: skip
    assert _call("GET", f"/items/{alert}/check-status")[0] == 404  # never checked
    assert _call("POST", f"/items/{alert}/check")[0] == 200
    status, body = _call("GET", f"/items/{alert}/check-status")
    assert status == 200 and body["status"] == "SUCCEEDED" and body["decision"] == "alert"
    assert [s["name"] for s in body["steps"]] == list(ui_api.STEPS)
    assert all(s["state"] == "done" for s in body["steps"])

    clear = _add({"kind": "appliance", "name": "Prestige Deluxe Cooker", "brand": "Prestige"})
    _call("POST", f"/items/{clear}/check")
    steps = {
        s["name"]: s["state"] for s in _call("GET", f"/items/{clear}/check-status")[1]["steps"]
    }
    assert steps == {"Candidates": "done", "Verify": "skipped", "RangeCheck": "skipped",
                     "Decide": "done", "Notify": "done"}  # fmt: skip


def _entered(name: str) -> dict:
    return {"type": "TaskStateEntered", "stateEnteredEventDetails": {"name": name}}


def _exited(name: str, key: str, result: dict) -> dict:
    details = {"name": name, "output": json.dumps({key: result})}
    return {"type": "TaskStateExited", "stateExitedEventDetails": details}


def test_steps_from_history_while_the_map_runs() -> None:
    events = [
        _entered("Candidates"),
        _exited("Candidates", "candidates", {"count": 2, "sources_searched": ["a", "b", "c", "d"]}),
        _entered("Verify"), _entered("Verify"),
        _exited("Verify", "verify", {"verifier": "deterministic", "covers_item": True}),
    ]  # fmt: skip
    steps = ui_api.steps_from_history(events, terminal=False)
    assert steps["Candidates"]["state"] == "done"
    assert steps["Candidates"]["summary"] == {"count": 2, "sources": 4}
    assert steps["Verify"]["state"] == "running"  # one of the two iterations still open
    assert steps["RangeCheck"]["state"] == "pending" and steps["Decide"]["state"] == "pending"


def test_steps_from_history_no_candidates_and_failures() -> None:
    none_found = [
        _entered("Candidates"), _exited("Candidates", "candidates", {"count": 0}),
        _entered("Decide"), _exited("Decide", "decide", {"decision": "clear"}),
        _entered("Notify"), _exited("Notify", "notify", {"case_id": None}),
    ]  # fmt: skip
    steps = ui_api.steps_from_history(none_found, terminal=True)
    assert steps["Verify"]["state"] == "skipped" and steps["RangeCheck"]["state"] == "skipped"
    assert steps["Decide"]["summary"]["decision"] == "clear"

    failing = [_entered("Candidates"), {"type": "TaskFailed"}]
    assert ui_api.steps_from_history(failing, terminal=False)["Candidates"]["state"] == "failed"

    degraded = [_entered("Candidates"),
                _exited("Candidates", "candidates", {"count": 0, "degraded": True})]  # fmt: skip
    assert ui_api.steps_from_history(degraded, terminal=True)["Candidates"]["state"] == "failed"


class _FakeSfn:
    def __init__(self, status: str, events: list[dict]) -> None:
        self.status, self.events = status, events

    def describe_execution(self, executionArn: str) -> dict:
        return {"status": self.status, "startDate": "2026-09-19T10:00:00Z"}

    def get_execution_history(self, **kwargs) -> dict:
        assert kwargs["includeExecutionData"] is True
        return {"events": self.events}


def test_check_status_live_path_reads_the_execution_history(monkeypatch, notices) -> None:
    item_id = _add({"kind": "medicine", "name": "Paracetamol Tablets IP 650mg", "batch": "FT5427"})
    item = dynamo.get("items", f"user#{item_id}")
    item.update(last_check_arn="arn:aws:states:ap-south-1:1:execution:recallindia-match-1:c1",
                last_check_at="2026-09-19T10:00:00Z")  # fmt: skip
    dynamo.put("items", item)
    fake = _FakeSfn("RUNNING", [_entered("Candidates")])
    monkeypatch.setattr(ui_api, "is_demo", lambda: False)  # live history, local item store
    monkeypatch.setattr(match_api, "_sfn_client", lambda: fake)
    status, body = _call("GET", f"/items/{item_id}/check-status")
    assert status == 200 and body["status"] == "RUNNING"
    states = {s["name"]: s["state"] for s in body["steps"]}
    assert states["Candidates"] == "running" and states["Notify"] == "pending"
