"""Endpoints the P06 app needs beyond the public API: header stats, photo upload, strip OCR,
paste normalisation and the live checklist of a running check.

* ``GET /v1/stats`` -- notices per source plus each poller's ``meta#`` health, for the feed's
  header counter and health pills. Counts use the source index (``Select=COUNT``, no items
  moved) and are cached for ``STATS_TTL`` seconds per warm Lambda, because every open feed polls.
* ``POST /uploads`` -- a presigned PUT to ``raw/uploads/<uuid>.jpg`` so a phone photo goes
  straight to S3, never through the API.
* ``POST /items/ocr`` -- Textract ``DetectDocumentText`` on that upload, read by
  ``item_parse.parse_strip`` into a prefilled form (nothing saved).
* ``POST /items/normalise`` -- Comprehend entities + ``item_parse.parse_paste_line`` per pasted
  line (nothing saved; the UI posts the confirmed rows to ``POST /items``).
* ``GET /items/{id}/check-status`` -- the five match steps (Candidates, Verify, RangeCheck,
  Decide, Notify) as pending / running / done / failed / skipped, from the execution history, so
  the card's Dynamic Checklist shows real state, not a timer.

No model decides anything (no LLM in the decision path): Textract reads the print, Comprehend
marks spans, deterministic rules do the rest.
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

from common import aws_ai, dynamo, s3
from common.demo_mode import is_demo
from common.notices import read_meta
from common.schemas import Case, Item

try:
    from api import item_parse, match_api, strip_ocr
except ModuleNotFoundError:  # Lambda layout: CodeUri backend/api/ -> siblings at /var/task
    import item_parse  # type: ignore[no-redef]
    import match_api  # type: ignore[no-redef]
    import strip_ocr  # type: ignore[no-redef]

Result = tuple[int, dict]

# --- GET /v1/stats ---------------------------------------------------------------------------

STATS_TTL = 30.0
SOURCES: list[dict[str, Any]] = [
    # ``meta`` names the poller rows; the first one is the source's live health
    {"source": "cdsco_nsq", "label": "CDSCO", "meta": ["cdsco_portal", "cdsco_pdf"],
     "every": "1 day"},
    {"source": "cpsc", "label": "CPSC", "meta": ["cpsc"], "every": "15 min"},
    {"source": "nhtsa", "label": "NHTSA", "meta": ["nhtsa"], "every": "15 min"},
    {"source": "openfda", "label": "openFDA", "meta": ["openfda"], "every": "15 min"},
]  # fmt: skip
_META_FIELDS = ("last_run_at", "last_success_at", "last_error", "degraded", "last_counts")
_stats_cache: dict[str, Any] = {}


def reset_stats_cache() -> None:
    _stats_cache.clear()


def health_of(meta: dict | None) -> str:
    """``healthy`` (last run fine), ``degraded`` (last run failed, an earlier one worked) or
    ``down`` (never ran, or never succeeded)."""
    if not meta:
        return "down"
    if not meta.get("degraded"):
        return "healthy"
    return "degraded" if meta.get("last_success_at") else "down"


def _meta_view(name: str) -> dict | None:
    row = read_meta(name)
    if row is None:
        return None
    return {"name": name, **{k: row.get(k) for k in _META_FIELDS}}


def compute_stats() -> dict:
    sources: list[dict] = []
    runs: list[str] = []
    for spec in SOURCES:
        metas = [m for m in (_meta_view(n) for n in spec["meta"]) if m]
        primary = next((m for m in metas if m["name"] == spec["meta"][0]), None)
        runs += [str(m["last_run_at"]) for m in metas if m.get("last_run_at")]
        sources.append(
            {
                "source": spec["source"],
                "label": spec["label"],
                "count": dynamo.count_source(spec["source"], max_items=1_000_000),
                "health": health_of(primary),
                "last_run_at": (primary or {}).get("last_run_at"),
                "last_success_at": (primary or {}).get("last_success_at"),
                "last_error": (primary or {}).get("last_error"),
                "polls_every": spec["every"],
                "pollers": metas,
            }
        )
    return {
        "total": sum(s["count"] for s in sources),
        "sources_count": len(sources),
        "sources": sources,
        "last_poll_at": max(runs) if runs else None,
        "generated_at": match_api._now(),
    }


def stats(_params: dict, _event: dict) -> Result:
    """``GET /v1/stats``: ``{total, sources_count, sources: [...], last_poll_at}``."""
    now = time.monotonic()
    cached = _stats_cache.get("body")
    if not is_demo() and cached is not None and now < _stats_cache.get("expires", 0):
        return 200, {**cached, "cached": True}
    body = compute_stats()
    _stats_cache.update(body=body, expires=now + STATS_TTL)
    return 200, {**body, "cached": False}


# --- POST /uploads ---------------------------------------------------------------------------

UPLOAD_TYPES = {"image/jpeg": "jpg", "image/png": "png"}
UPLOAD_KEY = re.compile(
    r"^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$"
)
UPLOAD_EXPIRES = 300
UPLOAD_MAX_BYTES = 10 * 1024 * 1024  # Textract's synchronous S3 limit


def create_upload(_params: dict, event: dict) -> Result:
    """``POST /uploads {content_type?}``: presigned PUT for one strip photo (5 minutes)."""
    body = match_api.parse_json_body(event)
    body = body if isinstance(body, dict) else {}
    content_type = str(body.get("content_type") or "image/jpeg").lower()
    if content_type not in UPLOAD_TYPES:
        return 400, {"error": f"content_type must be one of {', '.join(UPLOAD_TYPES)}"}
    key = f"uploads/{uuid.uuid4()}.{UPLOAD_TYPES[content_type]}"
    url = s3.presigned_put_url("raw", key, content_type, UPLOAD_EXPIRES)
    return 200, {
        "key": key,
        "url": url,
        "method": "PUT",
        "headers": {"content-type": content_type},
        "expires_in": UPLOAD_EXPIRES,
        "max_bytes": UPLOAD_MAX_BYTES,
    }


# --- POST /items/ocr -------------------------------------------------------------------------

MAX_LINES_RETURNED = 60


def items_ocr(_params: dict, event: dict) -> Result:
    """``POST /items/ocr {key}``: read an uploaded strip photo into prefilled item fields."""
    body = match_api.parse_json_body(event)
    key = str((body or {}).get("key") or "") if isinstance(body, dict) else ""
    if not UPLOAD_KEY.match(key):
        return 400, {"error": "key must be an uploads/<uuid>.jpg|png key from POST /uploads"}
    try:
        result = strip_ocr.read_strip(key)
    except aws_ai.AwsAiError as exc:
        missing = "InvalidS3Object" in str(exc) or "NoSuchKey" in str(exc)
        return (404 if missing else 502), {"error": str(exc), "key": key}
    lines = result.pop("all_lines")
    # the edge-band lines first: they carry the stamp (batch / Mfg / Exp) the UI shows as read
    lines = [ln for ln in lines if ln.get("edge")] + [ln for ln in lines if not ln.get("edge")]
    return 200, {
        "key": key,
        **result,
        "line_count": len(lines),
        "lines": [
            {"text": ln["text"], "confidence": ln["confidence"], "edge": ln.get("edge")}
            for ln in lines
        ][:MAX_LINES_RETURNED],
    }


# --- POST /items/normalise -------------------------------------------------------------------

MAX_PASTE_LINES = 50
MAX_LINE_CHARS = 300


def items_normalise(_params: dict, event: dict) -> Result:
    """``POST /items/normalise {lines: [...]} | {text}``: one item row per pasted line."""
    body = match_api.parse_json_body(event)
    if not isinstance(body, dict):
        return 400, {"error": 'body must be {"lines": [...]} or {"text": "..."}'}
    raw = body.get("lines")
    if raw is None:
        raw = str(body.get("text") or "").splitlines()
    if not isinstance(raw, list):
        return 400, {"error": "lines must be a list of strings", "field": "lines"}
    lines = [" ".join(str(x).split())[:MAX_LINE_CHARS] for x in raw if str(x or "").strip()]
    if not lines:
        return 400, {"error": "nothing to read: paste one product per line", "field": "lines"}
    if len(lines) > MAX_PASTE_LINES:
        return 400, {"error": f"at most {MAX_PASTE_LINES} lines per request", "field": "lines"}
    source = "comprehend"
    try:
        entities = aws_ai.comprehend_entities_batch(lines)
    except aws_ai.AwsAiError as exc:  # the regex rules still read every line, at lower confidence
        entities, source = [[] for _ in lines], f"unavailable: {exc}"
    rows = [
        item_parse.parse_paste_line(line, ents) for line, ents in zip(lines, entities, strict=True)
    ]
    return 200, {"rows": rows, "count": len(rows), "entities_source": source}


# --- GET /items/{id}/check-status ------------------------------------------------------------

STEPS = ("Candidates", "Verify", "RangeCheck", "Decide", "Notify")
_RESULT_KEY = {
    "Candidates": "candidates",
    "Verify": "verify",
    "RangeCheck": "range_check",
    "Decide": "decide",
    "Notify": "notify",
}
_FAILED_EVENTS = {"TaskFailed", "TaskTimedOut", "LambdaFunctionFailed", "LambdaFunctionTimedOut"}
_HISTORY_PAGES = 3


def _summary(step: str, result: dict) -> dict:
    """The few fields the checklist microcopy needs (never the whole state)."""
    if step == "Candidates":
        return {"count": result.get("count"), "sources": len(result.get("sources_searched") or [])}
    if step == "Verify":
        return {"verifier": result.get("verifier"), "covers_item": result.get("covers_item")}
    if step == "RangeCheck":
        return {k: result.get(k) for k in ("kind", "inside", "listed", "yours")}
    if step == "Decide":
        return {k: result.get(k) for k in ("decision", "reason", "candidates_considered")}
    email = result.get("email") if isinstance(result.get("email"), dict) else {}
    return {"case_id": result.get("case_id"), "email_sent": email.get("sent")}


def steps_from_history(events: list[dict], *, terminal: bool) -> dict[str, dict]:
    """Execution-history events -> ``{step: {state, started_at?, ended_at?, summary?}}``.

    Verify and RangeCheck run once per candidate inside the Map, so a step is ``running`` while
    any entry is still open and ``done`` once every entry has exited. A Task caught into its
    stand-in (VerifyUnavailable, HoldUnavailable) is ``failed``; a step never entered is
    ``pending`` while the execution runs and ``skipped`` after (no candidates -> no Verify).
    """
    steps: dict[str, dict] = {name: {"state": "pending"} for name in STEPS}
    open_count = dict.fromkeys(STEPS, 0)
    current: list[str] = []
    for ev in events or []:
        kind = str(ev.get("type") or "")
        stamp = match_api._iso(ev.get("timestamp"))
        if kind == "TaskStateEntered":
            name = str((ev.get("stateEnteredEventDetails") or {}).get("name") or "")
            if name in steps:
                open_count[name] += 1
                entry = steps[name]
                if entry["state"] in ("pending", "done"):
                    entry["state"] = "running"
                entry.setdefault("started_at", stamp)
                current.append(name)
        elif kind == "TaskStateExited":
            details = ev.get("stateExitedEventDetails") or {}
            name = str(details.get("name") or "")
            if name not in steps:
                continue
            open_count[name] = max(0, open_count[name] - 1)
            entry = steps[name]
            try:
                output = json.loads(details.get("output") or "{}")
            except ValueError:
                output = {}
            result = output.get(_RESULT_KEY[name]) if isinstance(output, dict) else None
            if isinstance(result, dict):
                entry["summary"] = _summary(name, result)
                if result.get("degraded") and entry["state"] != "failed":
                    entry["state"] = "failed"
            if open_count[name] == 0 and entry["state"] != "failed":
                entry["state"] = "done"
            entry["ended_at"] = stamp
            if name in current:
                current.remove(name)
        elif kind in _FAILED_EVENTS and current:
            name = current.pop()
            steps[name].update(state="failed", ended_at=stamp)
    if terminal:
        for entry in steps.values():
            if entry["state"] in ("pending", "running"):
                entry["state"] = "skipped" if entry["state"] == "pending" else "failed"
    elif steps["Decide"]["state"] != "pending":
        for name in ("Verify", "RangeCheck"):  # HasCandidates went straight to Decide
            if steps[name]["state"] == "pending":
                steps[name]["state"] = "skipped"
    return steps


def _steps_from_item(item: dict, case: dict | None) -> tuple[str, dict[str, dict]]:
    """Demo (in-process, synchronous) or an execution Step Functions no longer has."""
    finished = bool(item.get("last_checked_at")) and str(item.get("last_checked_at")) >= str(
        item.get("last_check_at") or ""
    )
    if not finished:
        return "RUNNING", {
            n: {"state": "running" if n == "Candidates" else "pending"} for n in STEPS
        }
    steps = {n: {"state": "done"} for n in STEPS}
    if case is None and item.get("status") == "clear":  # no candidates: straight to Decide
        steps["Verify"] = {"state": "skipped"}
        steps["RangeCheck"] = {"state": "skipped"}
    if case:
        steps["Decide"]["summary"] = {
            "decision": case.get("decision"),
            "reason": case.get("reason"),
        }
        steps["Verify"]["summary"] = {"verifier": case.get("verifier")}
        rc = case.get("range_check") or {}
        steps["RangeCheck"]["summary"] = {k: rc.get(k) for k in ("inside", "listed", "yours")}
        steps["Notify"]["summary"] = {"case_id": case.get("case_id")}
    return "SUCCEEDED", steps


def check_status(params: dict, _event: dict) -> Result:
    """``GET /items/{id}/check-status``: the running (or last) check, step by step."""
    item_id = match_api._path_id(params)
    item = dynamo.get("items", Item.make_pk(item_id)) if item_id else None
    if item is None:
        return 404, {"error": "not found", "item_id": item_id}
    arn = str(item.get("last_check_arn") or "")
    if not arn:
        return 404, {"error": "this item has not been checked yet", "item_id": item_id}
    case = dynamo.get("cases", Case.make_pk(str(item["case_id"]))) if item.get("case_id") else None
    body: dict[str, Any] = {
        "item_id": item_id,
        "execution_arn": arn,
        "case_id": item.get("case_id"),
    }
    if is_demo() or arn.startswith(match_api.LOCAL_ARN_PREFIX) or not arn.startswith("arn:"):
        status, steps = _steps_from_item(item, case)
        stopped = item.get("last_checked_at") if status != "RUNNING" else None
        body.update(status=status, started_at=item.get("last_check_at"), stopped_at=stopped)
    else:
        client = match_api._sfn_client()
        try:
            described = client.describe_execution(executionArn=arn)
            events: list[dict] = []
            kwargs: dict[str, Any] = {"executionArn": arn, "maxResults": 1000,
                                      "includeExecutionData": True}  # fmt: skip
            for _ in range(_HISTORY_PAGES):
                page = client.get_execution_history(**kwargs)
                events += page.get("events", [])
                if not page.get("nextToken"):
                    break
                kwargs["nextToken"] = page["nextToken"]
        except Exception as exc:
            if "ExecutionDoesNotExist" in str(exc):  # expired from history: fall back to the item
                status, steps = _steps_from_item(item, case)
                body.update(status=status, steps=[{"name": n, **steps[n]} for n in STEPS])
                return 200, body
            return 502, {"error": f"{type(exc).__name__}: {exc}", "item_id": item_id}
        status = str(described.get("status") or "RUNNING")
        steps = steps_from_history(events, terminal=status != "RUNNING")
        body.update(status=status, started_at=match_api._iso(described.get("startDate")),
                    stopped_at=match_api._iso(described.get("stopDate")))  # fmt: skip
    body["steps"] = [{"name": n, **steps[n]} for n in STEPS]
    decide = steps["Decide"].get("summary") or {}
    body["decision"] = decide.get("decision") or (case or {}).get("decision")
    return 200, body
