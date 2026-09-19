"""``/ingest`` endpoints: start a run, per-step status, extracted rows, presigned PDF.

Live, ``POST /ingest/run`` starts the IngestStateMachine and ``GET /ingest/status/{arn}``
maps its execution history (TaskStateEntered / TaskStateExited / TaskFailed / Execution*)
onto the five checklist steps, merged with the ``ingest#<run_id>`` record the tasks write
(``common.ingest_runs``: Textract polling progress, rows_in, method). In DEMO_MODE the run
executes the same handlers synchronously in-process (Fetch -> [Extract] -> Normalise -> Diff
-> Publish, exactly as the ASL wires them) and status comes from the run record alone.

Every function here returns ``(status_code, body)``; ``api.app`` wraps it in the JSON/CORS
response so this module never imports the router.
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import os
import re
import secrets
from typing import Any
from urllib.parse import unquote

from common import ingest_runs, s3
from common.cdsco import canonical_month
from common.demo_mode import is_demo

Result = tuple[int, dict]

STEP_NAMES = ["Fetch", "Extract", "Normalise", "Diff", "Publish"]
# ASL state name -> key of its result in the pipeline state (ResultPath)
STEP_KEYS = {
    "Fetch": "fetch",
    "Extract": "extract",
    "Normalise": "normalise",
    "Diff": "diff",
    "Publish": "publish",
    "RecordFailure": "publish",
}
# what the checklist shows per step (small fields only; never rows/header/listing)
SUMMARY_KEYS = (
    "adapter",
    "month",
    "pdf_url",
    "pdf_s3_key",
    "pages",
    "rows_in",
    "method",
    "fallback_used",
    "notices_out",
    "counts",
    "new",
    "updated",
    "existing",
    "total",
    "published",
    "degraded",
    "error",
    "took_ms",
)
_TERMINAL = frozenset({"SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"})
_TASK_FAILED_EVENTS = frozenset(
    {
        "TaskFailed",
        "TaskTimedOut",
        "TaskStateAborted",
        "LambdaFunctionFailed",
        "LambdaFunctionTimedOut",
        "LambdaFunctionScheduleFailed",
        "LambdaFunctionStartFailed",
    }
)
_EXECUTION_FAILED_EVENTS = frozenset({"ExecutionFailed", "ExecutionTimedOut", "ExecutionAborted"})
PDF_KEY_RE = re.compile(r"^cdsco/[A-Za-z0-9._-]+\.pdf$")
PRESIGN_SECONDS = 900
LOCAL_ARN_PREFIX = "arn:aws:states:local:000000000000:execution:recallindia-ingest:"
_MAX_HISTORY_EVENTS = 500


def _now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.astimezone(dt.UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    return str(value)


def _region() -> str:
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"


def _sfn_client() -> Any:
    """boto3 Step Functions client (module-level so tests can monkeypatch a fake)."""
    import boto3  # lazy: demo mode must not need boto3 credentials

    return boto3.client("stepfunctions", region_name=_region())


def parse_body(event: dict) -> dict | None:
    """JSON body of an HTTP API v2 event (base64 aware); ``{}`` when empty, None when invalid."""
    raw = event.get("body")
    if raw is None or raw == "":
        return {}
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return None
    try:
        body = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return body if isinstance(body, dict) else None


def _summary(result: Any) -> dict:
    if not isinstance(result, dict):
        return {}
    return {k: result[k] for k in SUMMARY_KEYS if k in result and result[k] is not None}


def _execution_arn_for(run_id: str) -> str:
    """Execution ARN for a bare run id (local prefix in demo, the deployed machine live)."""
    if is_demo():
        return LOCAL_ARN_PREFIX + run_id
    machine = os.environ.get("INGEST_STATE_MACHINE_ARN") or ""
    if ":stateMachine:" in machine:
        return machine.replace(":stateMachine:", ":execution:", 1) + ":" + run_id
    return run_id


def _safe_read_run(run_id: str) -> dict | None:
    try:
        return ingest_runs.read_run(run_id)
    except Exception:  # a status poll must not 500 because the table blinked
        return None


# --- POST /ingest/run -----------------------------------------------------------------


def run_ingest(_params: dict, event: dict) -> Result:
    body = parse_body(event)
    if body is None:
        return 400, {"error": "body must be a JSON object"}
    payload: dict[str, Any] = {
        "adapter": str(body.get("adapter") or "pdf"),
        "force": bool(body.get("force", True)),
    }
    for key in ("pdf_url", "num_id", "month", "lab_scope"):
        if body.get(key):
            payload[key] = str(body[key])
    if payload.get("month"):
        # One spelling per month, or "June 2025" and "JUN-2025" would mint two sets of pks.
        month = canonical_month(payload["month"])
        if not month:
            return 400, {"error": f"month {payload['month']!r} is not a month (use e.g. JUN-2025)"}
        payload["month"] = month
    if is_demo():
        return run_demo_chain(payload)
    machine_arn = os.environ.get("INGEST_STATE_MACHINE_ARN")
    if not machine_arn:
        return 500, {
            "error": "INGEST_STATE_MACHINE_ARN is not set on the API function; "
            "deploy template.yaml (ApiFunction.Environment) before starting a run"
        }
    name = f"ingest-{dt.datetime.now(dt.UTC):%Y%m%d%H%M%S}-{secrets.token_hex(2)}"
    try:
        resp = _sfn_client().start_execution(
            stateMachineArn=machine_arn, name=name, input=json.dumps(payload)
        )
    except Exception as exc:
        return 502, {"error": f"start_execution failed: {type(exc).__name__}: {exc}"}
    execution_arn = str(resp.get("executionArn") or "")
    return 202, {
        "execution_arn": execution_arn,
        "run_id": ingest_runs.run_id_from_arn(execution_arn) if execution_arn else name,
        "status": "RUNNING",
        "started_at": _iso(resp.get("startDate")) or _now(),
        "input": payload,
    }


def _ingest_modules() -> dict[str, Any] | None:
    """The four ingest handlers, or None in the Lambda layout (CodeUri backend/api/ only)."""
    try:
        from ingest import cdsco_extract, cdsco_fetch, cdsco_normalise, cdsco_publish
    except ImportError:
        return None
    return {
        "Fetch": cdsco_fetch.handler,
        "Extract": cdsco_extract.handler,
        "Normalise": cdsco_normalise.handler,
        "Diff": cdsco_publish.diff_handler,
        "Publish": cdsco_publish.handler,
    }


def _step_failed(step: str, result: dict) -> bool:
    """A task result counts as failed when it is degraded, or Publish did not publish."""
    if result.get("degraded"):
        return True
    return step == "Publish" and result.get("published") is False


def run_demo_chain(payload: dict) -> Result:
    """DEMO_MODE: run Fetch -> [Extract] -> Normalise -> Diff -> Publish in-process.

    Mirrors the ASL: ``$.run`` from Init, each result under its own key, the FetchOk choice
    on ``$.fetch.adapter``, and -- like the FetchOk / ExtractOk / NormaliseOk / DiffOk
    choices -- a degraded step result routed straight to Publish with ``$.error``
    (RecordFailure) before stopping, so the later steps never run on a missing PDF. Publish
    answering ``published: false`` is a failed step (the ASL's Published choice -> Failed).
    The run record gets the per-step states so ``GET /ingest/status`` can show them without
    an execution history.
    """
    handlers = _ingest_modules()
    if handlers is None:
        return 501, {"error": "demo ingest runner needs the ingest modules"}
    run_id = ingest_runs.run_id_from_arn(None)
    execution_arn = LOCAL_ARN_PREFIX + run_id
    started_at = _now()
    state: dict[str, Any] = {
        **payload,
        "run": {
            "execution_arn": execution_arn,
            "execution_name": run_id,
            "started_at": started_at,
        },
    }
    steps: dict[str, dict] = {name: {"state": "pending"} for name in STEP_NAMES}
    failed_step: str | None = None

    def run_step(name: str) -> dict:
        nonlocal failed_step
        step_started = _now()
        try:
            out = handlers[name](state, None)
            if not isinstance(out, dict):
                out = {"degraded": True, "error": f"{name} returned {type(out).__name__}"}
        except Exception as exc:  # handlers never raise, but the runner must not either
            out = {"degraded": True, "error": f"{type(exc).__name__}: {exc}"}
        state[STEP_KEYS[name]] = out
        degraded = _step_failed(name, out)
        steps[name] = {
            "state": "failed" if degraded else "done",
            "started_at": step_started,
            "ended_at": _now(),
            "summary": _summary(out),
        }
        if degraded and failed_step is None:
            failed_step = name
        return out

    fetch = run_step("Fetch")
    if failed_step is None:
        if fetch.get("adapter") == "cdsco_portal":
            steps["Extract"] = {"state": "skipped", "summary": {"adapter": "cdsco_portal"}}
        else:
            run_step("Extract")
    for name in ("Normalise", "Diff"):
        if failed_step is None:
            run_step(name)
    if failed_step is not None:
        cause = state.get(STEP_KEYS[failed_step], {}).get("error")
        state["error"] = {"Error": f"{failed_step}Degraded", "Cause": str(cause or "degraded")}
        run_step("Publish")
        status = "FAILED"
        for name in STEP_NAMES:
            if steps[name]["state"] == "pending":
                steps[name] = {"state": "skipped"}
    else:
        run_step("Publish")
        status = "SUCCEEDED"

    extract = state.get("extract") or {}
    normalise = state.get("normalise") or {}
    counts = dict(normalise.get("counts") or {})
    counts.update(
        {
            k: v
            for k, v in (
                ("rows_in", normalise.get("rows_in", extract.get("rows_in"))),
                ("notices_out", normalise.get("notices_out")),
            )
            if v is not None
        }
    )
    stopped_at = _now()
    record_fields = {
        "execution_arn": execution_arn,
        "execution_status": status,
        "started_at": started_at,
        "stopped_at": stopped_at,
        "api_steps": steps,
        "adapter": fetch.get("adapter"),
        "month": normalise.get("month") or fetch.get("month"),
        "pdf_url": fetch.get("pdf_url"),
        "pdf_s3_key": fetch.get("pdf_s3_key"),
        "pages": extract.get("pages"),
        "method": extract.get("method"),
        "rows_s3_key": extract.get("rows_s3_key"),
        "rows_in": counts.get("rows_in"),
        "notices_out": counts.get("notices_out"),
        "counts": counts or None,
        "diff": state.get("diff"),
        "error": state.get("error", {}).get("Cause") if failed_step else None,
    }
    try:
        ingest_runs.write_run(run_id, **{k: v for k, v in record_fields.items() if v is not None})
    except Exception:  # the run already happened; a lost status row is not a failed run
        pass
    return 200, {
        "execution_arn": execution_arn,
        "run_id": run_id,
        "status": status,
        "started_at": started_at,
        "stopped_at": stopped_at,
        "steps": steps,
        "counts": counts,
        "method": extract.get("method"),
        "fallback_used": normalise.get("fallback_used", extract.get("fallback_used")),
        "error": record_fields["error"],
    }


# --- GET /ingest/status/{arn} ---------------------------------------------------------


def _blank_steps() -> dict[str, dict]:
    return {name: {"state": "pending"} for name in STEP_NAMES}


def _parse_output(details: dict | None) -> dict:
    raw = (details or {}).get("output")
    if not raw:
        return {}
    try:
        out = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return out if isinstance(out, dict) else {}


def _failure_details(event: dict, kind: str) -> dict:
    """``{Error, Cause}`` from a *Failed / *TimedOut / *Aborted history event.

    boto3 spells the detail keys ``error`` / ``cause``; the ASL ``$.error`` object uses
    ``Error`` / ``Cause``. Accept both.
    """
    details = next(
        (v for k, v in event.items() if k.endswith("EventDetails") and isinstance(v, dict)),
        {},
    )
    return {
        "Error": details.get("error") or details.get("Error") or kind,
        "Cause": details.get("cause") or details.get("Cause"),
    }


def steps_from_history(events: list[dict], *, terminal: bool) -> tuple[dict[str, dict], Any]:
    """Map execution-history events onto the checklist steps.

    Returns ``(steps, error)``: ``steps`` is ``{name: {state, started_at?, ended_at?,
    summary?}}`` and ``error`` the failure ``{Error, Cause}`` of the last failed task /
    execution (None when nothing failed). A task whose result is ``degraded`` (handlers
    never raise) is ``failed``, as is Publish answering ``published: false``;
    ``RecordFailure`` (the Publish Lambda on the failure path) shows as Publish ``failed``;
    a step that was never entered is ``pending`` while the execution runs and ``skipped``
    once it is over.
    """
    steps = _blank_steps()
    current: str | None = None
    error: dict | None = None
    fetch_adapter: str | None = None
    for ev in events or []:
        kind = str(ev.get("type") or "")
        stamp = _iso(ev.get("timestamp"))
        if kind == "TaskStateEntered":
            name = str((ev.get("stateEnteredEventDetails") or {}).get("name") or "")
            if name not in STEP_KEYS:
                continue
            step = "Publish" if name == "RecordFailure" else name
            steps[step] = {"state": "running", "started_at": stamp}
            current = step
        elif kind == "TaskStateExited":
            details = ev.get("stateExitedEventDetails") or {}
            name = str(details.get("name") or "")
            if name not in STEP_KEYS:
                continue
            step = "Publish" if name == "RecordFailure" else name
            out = _parse_output(details)
            result = out.get(STEP_KEYS[name])
            result = result if isinstance(result, dict) else None
            if name == "RecordFailure":
                failed = True
            elif result is not None:
                failed = _step_failed(step, result)
            else:
                failed = "error" in out
            entry = steps.get(step) or {}
            entry.update({"state": "failed" if failed else "done", "ended_at": stamp})
            if result is not None:
                entry["summary"] = _summary(result)
                if failed and result.get("error") and error is None:
                    error = {"Error": f"{step}Degraded", "Cause": str(result["error"])}
            elif "error" in out and isinstance(out["error"], dict):
                entry["summary"] = {"error": out["error"].get("Cause") or out["error"]}
            steps[step] = entry
            if step == "Fetch" and result is not None:
                fetch_adapter = result.get("adapter")
            current = None
        elif kind in _TASK_FAILED_EVENTS or kind in _EXECUTION_FAILED_EVENTS:
            details = _failure_details(ev, kind)
            # the Fail state's static cause must not hide the degraded step's own error
            if error is None or kind in _TASK_FAILED_EVENTS:
                error = details
            if current:
                steps[current]["state"] = "failed"
                steps[current]["ended_at"] = stamp
                if details.get("Cause") or details.get("Error"):
                    steps[current].setdefault("summary", {})["error"] = details.get(
                        "Cause"
                    ) or details.get("Error")
    if fetch_adapter == "cdsco_portal" and steps["Extract"]["state"] == "pending":
        steps["Extract"] = {"state": "skipped", "summary": {"adapter": "cdsco_portal"}}
    if terminal:
        for name in STEP_NAMES:
            if steps[name]["state"] == "pending":
                steps[name] = {"state": "skipped"}
    return steps, error


def _steps_from_record(record: dict) -> dict[str, dict]:
    """Checklist states from a run record alone (demo, or a live record without history)."""
    stored = record.get("api_steps")
    if isinstance(stored, dict) and all(name in stored for name in STEP_NAMES):
        return {name: dict(stored[name]) for name in STEP_NAMES}
    order = ["fetch", "extract", "normalise", "diff", "publish"]
    step = str(record.get("step") or "").lower()
    status = str(record.get("status") or "").lower()
    if step not in order:
        # the tasks write step/status; fall back to which fields are present
        idx = 1 if record.get("rows_in") is not None or record.get("method") else 0
        if record.get("notices_out") is not None:
            idx = 2
        if record.get("diff") is not None or record.get("published") is not None:
            idx = 4
        step, status = order[idx], "done"
    if status not in ("running", "done", "failed"):
        status = "done"
    current = order.index(step)
    steps = _blank_steps()
    for i, name in enumerate(STEP_NAMES):
        if i < current:
            steps[name] = {"state": "done"}
        elif i == current:
            steps[name] = {"state": status}
    if record.get("adapter") == "cdsco_portal":
        steps["Extract"] = {"state": "skipped", "summary": {"adapter": "cdsco_portal"}}
    if status in ("done", "failed") and step == "publish":
        for name in STEP_NAMES:
            if steps[name]["state"] == "pending":
                steps[name] = {"state": "skipped"}
    return steps


def _execution_status_from_record(record: dict, steps: dict[str, dict]) -> str:
    stored = str(record.get("execution_status") or "").upper()
    if stored in _TERMINAL or stored == "RUNNING":
        return stored
    publish = steps["Publish"]["state"]
    if publish == "done":
        return "SUCCEEDED"
    if publish == "failed" or any(s["state"] == "failed" for s in steps.values()):
        return "FAILED"
    return "RUNNING"


def _fallback_used(summaries: dict[str, dict], record: dict | None) -> Any:
    norm = summaries.get("Normalise", {}).get("fallback_used")
    if isinstance(norm, dict):
        return norm
    if record and record.get("fallback_used") is not None:
        return record["fallback_used"]
    extract = summaries.get("Extract", {}).get("fallback_used")
    return norm if norm is not None else extract


def _status_body(
    *,
    execution_arn: str,
    run_id: str,
    status: str,
    started_at: Any,
    stopped_at: Any,
    steps: dict[str, dict],
    record: dict | None,
    error: Any,
) -> dict:
    """Assemble the status response: task summaries first, run record wins for rows fields."""
    record = record or {}
    summaries = {name: (steps[name].get("summary") or {}) for name in STEP_NAMES}
    fetch, extract, normalise = summaries["Fetch"], summaries["Extract"], summaries["Normalise"]
    diff = summaries["Diff"]

    def pick(key: str, *layers: dict) -> Any:
        for layer in layers:
            if layer.get(key) is not None:
                return layer[key]
        return None

    counts = pick("counts", record, normalise, summaries["Publish"])
    body = {
        "execution_arn": execution_arn,
        "run_id": run_id,
        "status": status,
        "started_at": _iso(started_at) or record.get("started_at"),
        "stopped_at": _iso(stopped_at) or record.get("stopped_at"),
        "steps": [{"name": name, **steps[name]} for name in STEP_NAMES],
        "textract": record.get("textract") if record.get("textract") is not None else None,
        "method": pick("method", record, extract),
        "fallback_used": _fallback_used(summaries, record),
        "rows_in": pick("rows_in", record, extract, normalise),
        "notices_out": pick("notices_out", normalise, record),
        "counts": counts,
        "diff": pick("diff", record, {"diff": diff or None}),
        "pdf": {
            "pdf_s3_key": pick("pdf_s3_key", record, extract, fetch),
            "pdf_url": pick("pdf_url", record, extract, fetch),
            "month": pick("month", normalise, record, extract, fetch),
            "pages": pick("pages", record, extract),
        },
        "rows_s3_key": pick("rows_s3_key", record, extract),
        "error": _error_text(error) or record.get("error") or None,
    }
    return body


def _error_text(error: Any) -> str | None:
    if not error:
        return None
    if isinstance(error, dict):
        return str(error.get("Cause") or error.get("Error") or json.dumps(error))
    return str(error)


def ingest_status(params: dict, _event: dict) -> Result:
    raw = unquote(str(params.get("arn") or "")).strip()
    if not raw:
        return 400, {"error": "missing execution arn"}
    run_id = ingest_runs.run_id_from_arn(raw)
    execution_arn = raw if raw.startswith("arn:") else _execution_arn_for(run_id)
    if is_demo():
        return _status_from_record(execution_arn, run_id)
    return _status_live(execution_arn, run_id)


def _status_from_record(execution_arn: str, run_id: str) -> Result:
    record = _safe_read_run(run_id)
    if record is None:
        return 404, {"error": "unknown run", "run_id": run_id}
    steps = _steps_from_record(record)
    status = _execution_status_from_record(record, steps)
    body = _status_body(
        execution_arn=record.get("execution_arn") or execution_arn,
        run_id=run_id,
        status=status,
        started_at=record.get("started_at") or record.get("created_at"),
        stopped_at=record.get("stopped_at") if status in _TERMINAL else None,
        steps=steps,
        record=record,
        error=record.get("error"),
    )
    return 200, body


def _status_live(execution_arn: str, run_id: str) -> Result:
    client = _sfn_client()
    try:
        desc = client.describe_execution(executionArn=execution_arn)
    except Exception as exc:
        text = f"{type(exc).__name__}: {exc}"
        if "ExecutionDoesNotExist" in text or "InvalidArn" in text:
            return 404, {"error": "unknown run", "execution_arn": execution_arn}
        return 502, {"error": f"describe_execution failed: {text}"}
    status = str(desc.get("status") or "RUNNING").upper()
    try:
        history = client.get_execution_history(
            executionArn=execution_arn,
            maxResults=_MAX_HISTORY_EVENTS,
            includeExecutionData=True,
        )
        events = list(history.get("events") or [])
    except Exception:
        events = []
    steps, error = steps_from_history(events, terminal=status in _TERMINAL)
    record = _safe_read_run(run_id)
    if record and not events:
        steps = _steps_from_record(record)
    body = _status_body(
        execution_arn=str(desc.get("executionArn") or execution_arn),
        run_id=run_id,
        status=status,
        started_at=desc.get("startDate"),
        stopped_at=desc.get("stopDate"),
        steps=steps,
        record=record,
        error=error or (desc.get("cause") if status in _TERMINAL - {"SUCCEEDED"} else None),
    )
    return 200, body


# --- GET /ingest/rows?arn= -----------------------------------------------------------


def _rows_key_from_history(execution_arn: str) -> tuple[str | None, bool]:
    """``(rows_s3_key, execution_found)`` from the Extract task output, live only."""
    try:
        client = _sfn_client()
        history = client.get_execution_history(
            executionArn=execution_arn,
            maxResults=_MAX_HISTORY_EVENTS,
            includeExecutionData=True,
        )
    except Exception:
        return None, False
    for ev in history.get("events") or []:
        if ev.get("type") != "TaskStateExited":
            continue
        details = ev.get("stateExitedEventDetails") or {}
        if details.get("name") != "Extract":
            continue
        extract = _parse_output(details).get("extract")
        if isinstance(extract, dict) and extract.get("rows_s3_key"):
            return str(extract["rows_s3_key"]), True
    return None, True


def ingest_rows(_params: dict, event: dict) -> Result:
    qs = event.get("queryStringParameters") or {}
    raw = unquote(str(qs.get("arn") or "")).strip()
    if not raw:
        return 400, {"error": "missing arn (execution arn or run id)"}
    page_filter: int | None = None
    if qs.get("page") not in (None, ""):
        try:
            page_filter = int(str(qs["page"]).strip())
        except ValueError:
            return 400, {"error": "page must be an integer"}
    run_id = ingest_runs.run_id_from_arn(raw)
    record = _safe_read_run(run_id)
    rows_key = str(record.get("rows_s3_key") or "") if record else ""
    found = record is not None
    if not rows_key and not is_demo() and raw.startswith("arn:"):
        history_key, seen = _rows_key_from_history(raw)
        rows_key = history_key or ""
        found = found or seen
    if not found:
        return 404, {"error": "unknown run", "run_id": run_id}
    if not rows_key:
        return 409, {"error": "rows not ready", "run_id": run_id}
    try:
        data = json.loads(s3.get_bytes("raw", rows_key).decode("utf-8"))
    except Exception:
        return 409, {"error": "rows not ready", "run_id": run_id, "rows_s3_key": rows_key}
    if not isinstance(data, dict):
        return 409, {"error": "rows not ready", "run_id": run_id, "rows_s3_key": rows_key}
    rows = [r for r in (data.get("rows") or []) if isinstance(r, dict)]
    if page_filter is not None:
        rows = [r for r in rows if r.get("page") == page_filter]
    return 200, {
        "run_id": run_id,
        "method": data.get("method") or (record or {}).get("method"),
        "pages": data["pages"] if data.get("pages") is not None else (record or {}).get("pages"),
        "header": data.get("header") or [],
        "rows": rows,
        "count": len(rows),
        "page": page_filter,
        "rows_s3_key": rows_key,
    }


# --- GET /ingest/pdf?key= ------------------------------------------------------------


def ingest_pdf(_params: dict, event: dict) -> Result:
    qs = event.get("queryStringParameters") or {}
    key = unquote(str(qs.get("key") or "")).strip()
    if not PDF_KEY_RE.match(key):
        return 400, {"error": "key must look like cdsco/<file>.pdf"}
    try:
        url = s3.presigned_url("raw", key, PRESIGN_SECONDS)
    except Exception as exc:
        return 502, {"error": f"presign failed: {type(exc).__name__}: {exc}"}
    return 200, {"key": key, "url": url, "expires_in": PRESIGN_SECONDS}
