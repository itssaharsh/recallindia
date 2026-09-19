"""/ingest endpoints: the DEMO_MODE synchronous runner, status, rows, pdf, and the live
Step Functions paths with a fake boto3 client."""

from __future__ import annotations

import base64
import datetime as dt
import json
from urllib.parse import quote

import pytest

from api import app, ingest_api
from common import ingest_runs

# pdfplumber yields 57 data rows on fixtures/cdsco/nsq_latest.pdf (55 with an S.No plus 2 wrapped
# manufacturer continuation rows) -- see DATA_ROWS in test_cdsco_extract_fallback.py.
DATA_ROWS = 57
MACHINE_ARN = "arn:aws:states:ap-south-1:277025716889:stateMachine:recallindia-ingest-277025716889"
EXEC_ARN = MACHINE_ARN.replace(":stateMachine:", ":execution:") + ":ingest-20260918120000-ab12"


def _event(method: str, path: str, qs: dict | None = None, body: str | None = None, **kw) -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "queryStringParameters": {k: str(v) for k, v in (qs or {}).items()},
        "requestContext": {"http": {"method": method, "path": path}},
        "body": body,
        **kw,
    }


def _call(method: str, path: str, qs: dict | None = None, body: str | None = None, **kw):
    out = app.handler(_event(method, path, qs, body, **kw), None)
    return out["statusCode"], json.loads(out["body"])


# --- demo runner -------------------------------------------------------------------------


@pytest.fixture(scope="module")
def demo_run(tmp_path_factory):
    """One demo run shared by the demo tests (the chain takes a few seconds)."""
    import os

    store = tmp_path_factory.mktemp("store")
    previous = {k: os.environ.get(k) for k in ("DEMO_MODE", "DEMO_STORE_DIR", "RAW_BUCKET")}
    os.environ["DEMO_MODE"] = "1"
    os.environ["DEMO_STORE_DIR"] = str(store)
    os.environ.pop("RAW_BUCKET", None)
    try:
        status, body = _call("POST", "/ingest/run", body=json.dumps({"force": True}))
        assert status == 200, body
        yield {"store": str(store), "body": body}
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@pytest.fixture
def demo_store(demo_run, monkeypatch):
    """Point the per-test env (conftest gives a fresh one) back at the shared run's store."""
    monkeypatch.setenv("DEMO_STORE_DIR", demo_run["store"])
    monkeypatch.delenv("RAW_BUCKET", raising=False)
    return demo_run["body"]


def test_demo_run_succeeds_with_counts(demo_store):
    body = demo_store
    assert body["status"] == "SUCCEEDED"
    assert body["execution_arn"].startswith(ingest_api.LOCAL_ARN_PREFIX)
    assert body["run_id"] == body["execution_arn"].rsplit(":", 1)[-1]
    assert body["counts"]["notices_out"] >= 55
    assert body["counts"]["rows_in"] == DATA_ROWS
    assert body["method"] == "pdfplumber"
    assert {name: s["state"] for name, s in body["steps"].items()} == {
        "Fetch": "done",
        "Extract": "done",
        "Normalise": "done",
        "Diff": "done",
        "Publish": "done",
    }
    assert body["steps"]["Extract"]["summary"]["rows_in"] == DATA_ROWS
    assert body["error"] is None


def test_demo_status_from_run_record(demo_store):
    arn = demo_store["execution_arn"]
    for path in (f"/ingest/status/{arn}", f"/ingest/status/{quote(arn, safe='')}"):
        status, body = _call("GET", path)
        assert status == 200, body
        assert body["execution_arn"] == arn and body["run_id"] == demo_store["run_id"]
        assert body["status"] == "SUCCEEDED"
        assert [s["name"] for s in body["steps"]] == ingest_api.STEP_NAMES
        assert all(s["state"] == "done" for s in body["steps"])
        assert body["method"] == "pdfplumber" and body["rows_in"] == DATA_ROWS
        assert body["notices_out"] >= 55 and body["counts"]["notices_out"] >= 55
        assert body["pdf"]["pdf_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf"
        assert body["pdf"]["month"] == "JUN-2025" and body["pdf"]["pages"] == 6
        assert body["rows_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf.rows.json"
        assert body["textract"] is None or isinstance(body["textract"], dict)
        assert body["error"] is None
    # a bare run id works too
    status, body = _call("GET", f"/ingest/status/{demo_store['run_id']}")
    assert status == 200 and body["status"] == "SUCCEEDED"


def test_demo_rows_with_bbox_and_page_filter(demo_store):
    status, body = _call("GET", "/ingest/rows", {"arn": demo_store["run_id"]})
    assert status == 200, body
    assert body["run_id"] == demo_store["run_id"] and body["method"] == "pdfplumber"
    assert body["count"] == len(body["rows"]) == DATA_ROWS and body["pages"] == 6
    assert len(body["header"]) == 8 and body["header"][0].startswith("S.No")
    for row in body["rows"]:
        assert {"page", "row", "cells", "bbox"} <= set(row)
        assert set(row["bbox"]) == {"left", "top", "width", "height"}
        assert all(0 <= row["bbox"][k] <= 1 for k in row["bbox"])
    assert sorted(r["row"] for r in body["rows"]) == list(range(1, DATA_ROWS + 1))
    status, page2 = _call("GET", "/ingest/rows", {"arn": demo_store["execution_arn"], "page": 2})
    assert status == 200 and page2["count"] > 0
    assert {r["page"] for r in page2["rows"]} == {2}
    assert page2["count"] == sum(1 for r in body["rows"] if r["page"] == 2)
    status, body = _call("GET", "/ingest/rows", {"arn": demo_store["run_id"], "page": "x"})
    assert status == 400


def test_pdf_presign_demo_and_bad_key(demo_store):
    status, body = _call("GET", "/ingest/pdf", {"key": "cdsco/CDSCO_NSQ_june25.pdf"})
    assert status == 200
    assert body["key"] == "cdsco/CDSCO_NSQ_june25.pdf" and body["expires_in"] == 900
    assert body["url"].startswith("file://") and body["url"].endswith("CDSCO_NSQ_june25.pdf")
    for bad in ("", "cdsco/../x.pdf", "evidence/x.pdf", "cdsco/x.txt", "cdsco/a b.pdf"):
        status, body = _call("GET", "/ingest/pdf", {"key": bad})
        assert status == 400, bad


def test_unknown_run_is_404(demo_store):
    status, _ = _call("GET", "/ingest/status/" + ingest_api.LOCAL_ARN_PREFIX + "nope")
    assert status == 404
    status, _ = _call("GET", "/ingest/rows", {"arn": "nope"})
    assert status == 404
    status, _ = _call("GET", "/ingest/rows")
    assert status == 400


def test_rows_not_ready_is_409():
    ingest_runs.write_run("r-early", step="extract", status="running")
    status, body = _call("GET", "/ingest/rows", {"arn": "r-early"})
    assert status == 409 and body["error"] == "rows not ready"
    # a record without api_steps: steps inferred from step/status
    status, body = _call("GET", "/ingest/status/r-early")
    assert status == 200 and body["status"] == "RUNNING"
    states = {s["name"]: s["state"] for s in body["steps"]}
    assert states == {
        "Fetch": "done",
        "Extract": "running",
        "Normalise": "pending",
        "Diff": "pending",
        "Publish": "pending",
    }


def test_demo_run_with_a_degraded_fetch_fails_without_notices(monkeypatch):
    from common import dynamo
    from common.notices import is_meta
    from ingest import cdsco_fetch

    def offline():
        raise TimeoutError("cdsco.gov.in timed out")

    monkeypatch.setattr(cdsco_fetch, "list_archive", offline)
    status, body = _call("POST", "/ingest/run", body=json.dumps({"month": "SEP-2031"}))
    assert status == 200 and body["status"] == "FAILED"
    assert {name: s["state"] for name, s in body["steps"].items()} == {
        "Fetch": "failed",
        "Extract": "skipped",
        "Normalise": "skipped",
        "Diff": "skipped",
        "Publish": "failed",
    }
    assert "timed out" in body["error"] and body["counts"] == {}
    assert [n for n in dynamo.scan_all("notices") if not is_meta(n)] == []
    status, st = _call("GET", "/ingest/status/" + body["run_id"])
    assert status == 200 and st["status"] == "FAILED"
    assert {s["name"]: s["state"] for s in st["steps"]}["Publish"] == "failed"
    assert "timed out" in st["error"]


def test_run_month_is_canonicalised_or_rejected(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("INGEST_STATE_MACHINE_ARN", MACHINE_ARN)
    fake = _FakeSfn()
    monkeypatch.setattr(ingest_api, "_sfn_client", lambda: fake)
    status, body = _call("POST", "/ingest/run", body=json.dumps({"month": "June 2025"}))
    assert status == 202 and body["input"]["month"] == "JUN-2025"
    assert json.loads(fake.started[0]["input"])["month"] == "JUN-2025"
    status, body = _call("POST", "/ingest/run", body=json.dumps({"month": "sometime soon"}))
    assert status == 400 and "month" in body["error"] and len(fake.started) == 1


def test_run_rejects_a_non_json_body():
    status, body = _call("POST", "/ingest/run", body="not json")
    assert status == 400


def test_run_demo_needs_the_ingest_modules(monkeypatch):
    monkeypatch.setattr(ingest_api, "_ingest_modules", lambda: None)
    status, body = _call("POST", "/ingest/run", body="{}")
    assert status == 501 and "ingest modules" in body["error"]


# --- live paths with a fake Step Functions client ------------------------------------


class _FakeSfn:
    def __init__(self, *, status="RUNNING", events=None):
        self.started: list[dict] = []
        self.status = status
        self.events = events or []
        self.start = dt.datetime(2026, 9, 18, 12, 0, 0, tzinfo=dt.UTC)

    def start_execution(self, **kw):
        self.started.append(kw)
        return {
            "executionArn": kw["stateMachineArn"].replace(":stateMachine:", ":execution:")
            + ":"
            + kw["name"],
            "startDate": self.start,
        }

    def describe_execution(self, *, executionArn):
        if executionArn.endswith(":missing"):
            raise RuntimeError("ExecutionDoesNotExist: no such execution")
        return {
            "executionArn": executionArn,
            "name": executionArn.rsplit(":", 1)[-1],
            "status": self.status,
            "startDate": self.start,
            "stopDate": None if self.status == "RUNNING" else self.start,
        }

    def get_execution_history(self, **kw):
        assert kw["includeExecutionData"] is True and kw["maxResults"] == 500
        return {"events": list(self.events)}


def _entered(name, ts):
    return {"type": "TaskStateEntered", "timestamp": ts, "stateEnteredEventDetails": {"name": name}}


def _exited(name, ts, state):
    return {
        "type": "TaskStateExited",
        "timestamp": ts,
        "stateExitedEventDetails": {"name": name, "output": json.dumps(state)},
    }


def test_live_start_execution(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("INGEST_STATE_MACHINE_ARN", MACHINE_ARN)
    fake = _FakeSfn()
    monkeypatch.setattr(ingest_api, "_sfn_client", lambda: fake)
    raw = base64.b64encode(json.dumps({"month": "JUN-2025"}).encode()).decode()
    status, body = _call("POST", "/ingest/run", body=raw, isBase64Encoded=True)
    assert status == 202, body
    assert len(fake.started) == 1
    call = fake.started[0]
    assert call["stateMachineArn"] == MACHINE_ARN
    assert call["name"].startswith("ingest-") and len(call["name"].split("-")) == 3
    sent = json.loads(call["input"])
    assert sent["force"] is True and sent["adapter"] == "pdf" and sent["month"] == "JUN-2025"
    assert body["execution_arn"].endswith(":" + call["name"])
    assert body["run_id"] == call["name"] and body["status"] == "RUNNING"
    assert body["started_at"] == "2026-09-18T12:00:00Z"


def test_live_start_without_machine_arn_is_500(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.delenv("INGEST_STATE_MACHINE_ARN", raising=False)
    monkeypatch.setattr(ingest_api, "_sfn_client", lambda: pytest.fail("must not be called"))
    status, body = _call("POST", "/ingest/run", body='{"force": false}')
    assert status == 500 and "INGEST_STATE_MACHINE_ARN" in body["error"]


def test_live_status_maps_history_and_merges_run_record(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("INGEST_STATE_MACHINE_ARN", MACHINE_ARN)
    t0 = dt.datetime(2026, 9, 18, 12, 0, 1, tzinfo=dt.UTC)
    fetch_out = {
        "adapter": "cdsco_pdf",
        "month": "JUN-2025",
        "pdf_s3_key": "cdsco/CDSCO_NSQ_june25.pdf",
        "pdf_url": "https://cdsco.gov.in/x.pdf",
        "degraded": False,
    }
    events = [
        {"type": "ExecutionStarted", "timestamp": t0},
        {"type": "PassStateEntered", "timestamp": t0, "stateEnteredEventDetails": {"name": "Init"}},
        _entered("Fetch", t0),
        _exited("Fetch", t0 + dt.timedelta(seconds=4), {"adapter": "pdf", "fetch": fetch_out}),
        _entered("Extract", t0 + dt.timedelta(seconds=5)),
    ]
    fake = _FakeSfn(status="RUNNING", events=events)
    monkeypatch.setattr(ingest_api, "_sfn_client", lambda: fake)
    record = {
        "pk": "ingest#ingest-20260918120000-ab12",
        "step": "extract",
        "status": "running",
        "textract": {"job_id": "j1", "status": "IN_PROGRESS", "polls": 3, "elapsed_s": 9.5},
    }
    monkeypatch.setattr(ingest_runs, "read_run", lambda run_id: record)

    status, body = _call("GET", "/ingest/status/" + quote(EXEC_ARN, safe=""))
    assert status == 200, body
    assert body["execution_arn"] == EXEC_ARN
    assert body["run_id"] == "ingest-20260918120000-ab12" and body["status"] == "RUNNING"
    states = {s["name"]: s["state"] for s in body["steps"]}
    assert states == {
        "Fetch": "done",
        "Extract": "running",
        "Normalise": "pending",
        "Diff": "pending",
        "Publish": "pending",
    }
    fetch_step = body["steps"][0]
    assert fetch_step["started_at"] == "2026-09-18T12:00:01Z"
    assert fetch_step["ended_at"] == "2026-09-18T12:00:05Z"
    assert fetch_step["summary"]["pdf_s3_key"] == "cdsco/CDSCO_NSQ_june25.pdf"
    assert body["steps"][1]["started_at"] == "2026-09-18T12:00:06Z"
    assert body["textract"]["polls"] == 3 and body["textract"]["status"] == "IN_PROGRESS"
    assert body["pdf"] == {
        "pdf_s3_key": "cdsco/CDSCO_NSQ_june25.pdf",
        "pdf_url": "https://cdsco.gov.in/x.pdf",
        "month": "JUN-2025",
        "pages": None,
    }
    assert body["started_at"] == "2026-09-18T12:00:00Z" and body["stopped_at"] is None
    assert body["rows_in"] is None and body["method"] is None and body["error"] is None

    # a bare run id is expanded to the execution ARN of the deployed machine
    status, body = _call("GET", "/ingest/status/ingest-20260918120000-ab12")
    assert status == 200 and body["execution_arn"] == EXEC_ARN

    # unknown execution -> 404
    status, _ = _call("GET", "/ingest/status/" + EXEC_ARN.rsplit(":", 1)[0] + ":missing")
    assert status == 404


def test_live_status_failed_run_and_portal_skip(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    t0 = dt.datetime(2026, 9, 18, 12, 0, 1, tzinfo=dt.UTC)
    fetch_out = {"adapter": "cdsco_portal", "month": "JUL-2026", "rows_in": 239}
    norm_fail = {"Error": "Lambda.Unknown", "Cause": "Task timed out after 330.00 seconds"}
    events = [
        _entered("Fetch", t0),
        _exited("Fetch", t0, {"fetch": fetch_out}),
        _entered("Normalise", t0),
        {"type": "TaskFailed", "timestamp": t0, "taskFailedEventDetails": norm_fail},
        _exited("Normalise", t0, {"fetch": fetch_out, "error": norm_fail}),
        _entered("RecordFailure", t0),
        _exited(
            "RecordFailure",
            t0,
            {"fetch": fetch_out, "error": norm_fail, "publish": {"published": False}},
        ),
        {"type": "ExecutionFailed", "timestamp": t0, "executionFailedEventDetails": norm_fail},
    ]
    fake = _FakeSfn(status="FAILED", events=events)
    monkeypatch.setattr(ingest_api, "_sfn_client", lambda: fake)
    monkeypatch.setattr(ingest_runs, "read_run", lambda run_id: None)
    status, body = _call("GET", "/ingest/status/" + EXEC_ARN)
    assert status == 200 and body["status"] == "FAILED"
    states = {s["name"]: s["state"] for s in body["steps"]}
    assert states == {
        "Fetch": "done",
        "Extract": "skipped",
        "Normalise": "failed",
        "Diff": "skipped",
        "Publish": "failed",
    }
    assert "timed out" in body["error"]
    assert body["pdf"]["month"] == "JUL-2026"


def test_live_status_degraded_step_and_unpublished_publish_are_failed(monkeypatch):
    """Handlers never raise: a degraded result (or Publish saying published: false) must show
    as a failed step even though no TaskFailed event exists."""
    monkeypatch.setenv("DEMO_MODE", "0")
    t0 = dt.datetime(2026, 9, 18, 12, 0, 1, tzinfo=dt.UTC)
    fetch_out = {"adapter": "cdsco_pdf", "degraded": True, "error": "UpstreamError: timeout"}
    publish_out = {"published": False, "error": "fetch: UpstreamError: timeout", "degraded": False}
    events = [
        _entered("Fetch", t0),
        _exited("Fetch", t0, {"fetch": fetch_out}),
        _entered("RecordFailure", t0),
        _exited("RecordFailure", t0, {"fetch": fetch_out, "publish": publish_out}),
        {
            "type": "ExecutionFailed",
            "timestamp": t0,
            "executionFailedEventDetails": {"error": "IngestPipelineFailed", "cause": "degraded"},
        },
    ]
    fake = _FakeSfn(status="FAILED", events=events)
    monkeypatch.setattr(ingest_api, "_sfn_client", lambda: fake)
    monkeypatch.setattr(ingest_runs, "read_run", lambda run_id: None)
    status, body = _call("GET", "/ingest/status/" + EXEC_ARN)
    assert status == 200 and body["status"] == "FAILED"
    states = {s["name"]: s["state"] for s in body["steps"]}
    assert states["Fetch"] == "failed" and states["Publish"] == "failed"
    assert states["Extract"] == states["Normalise"] == states["Diff"] == "skipped"
    assert "timeout" in body["error"]
    # Publish reached through the success path but not published -> failed too
    steps, error = ingest_api.steps_from_history(
        [_entered("Publish", t0), _exited("Publish", t0, {"publish": publish_out})],
        terminal=True,
    )
    assert steps["Publish"]["state"] == "failed" and "timeout" in error["Cause"]


def test_live_rows_falls_back_to_extract_output(monkeypatch, tmp_path):
    monkeypatch.setenv("DEMO_MODE", "0")
    extract_out = {"rows_s3_key": "cdsco/x.pdf.rows.json", "method": "pdfplumber"}
    events = [_entered("Extract", None), _exited("Extract", None, {"extract": extract_out})]
    fake = _FakeSfn(events=events)
    monkeypatch.setattr(ingest_api, "_sfn_client", lambda: fake)
    monkeypatch.setattr(ingest_runs, "read_run", lambda run_id: None)
    payload = {"method": "pdfplumber", "header": ["S.No"], "pages": 1, "rows": [{"page": 1}]}
    monkeypatch.setattr(
        ingest_api.s3, "get_bytes", lambda kind, key: json.dumps(payload).encode("utf-8")
    )
    status, body = _call("GET", "/ingest/rows", {"arn": EXEC_ARN})
    assert status == 200 and body["count"] == 1 and body["rows_s3_key"] == "cdsco/x.pdf.rows.json"
    # no record and no Extract output -> 409 (the execution exists) ...
    fake.events = [_entered("Fetch", None)]
    status, body = _call("GET", "/ingest/rows", {"arn": EXEC_ARN})
    assert status == 409
    # ... and a bare run id with no record -> 404
    status, body = _call("GET", "/ingest/rows", {"arn": "nope"})
    assert status == 404
