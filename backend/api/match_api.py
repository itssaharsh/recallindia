"""The item wall API: ``/items``, ``/items/{id}/check``, ``/cases/{id}``, ``/events``.

``POST /items`` validates through ``common.schemas.Item`` and writes the ``items`` table;
``POST /items/{id}/check`` starts the MatchStateMachine (``MATCH_STATE_MACHINE_ARN``) with
``{"item_id"}`` and stores the execution ARN on the item, or -- in DEMO_MODE -- runs the same
five handlers synchronously in-process (Candidates -> [Verify -> RangeCheck per candidate] ->
Decide -> Notify, exactly as ``backend/statemachine/match.asl.json`` wires them, including the
HoldUnavailable / VerifyUnavailable / RangeUnavailable stand-ins). ``GET /cases/{id}`` reads one
Case row; ``GET /events`` pages the Event rows newest-first on the ``rk-ts-index`` GSI with an
opaque cursor.

``GET /items`` is the one listing that scans a table: the items table is the single demo
user's wall (no auth, no tenants, SPEC §Data model ``pk user#item_id``), so its whole content
is what the wall shows and a bounded ``scan_all(limit=500)`` is the query. The public
``/v1/notices`` API never scans (ADR-005).

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
from typing import Any, get_args
from urllib.parse import unquote

from pydantic import ValidationError

from common import dynamo
from common.demo_mode import is_demo
from common.schemas import Case, Item, ItemKind

Result = tuple[int, dict]

ITEM_KINDS: tuple[str, ...] = tuple(get_args(ItemKind))
# request fields copied onto an Item (everything else in the body is ignored)
ITEM_STRING_FIELDS = (
    "name",
    "brand",
    "model",
    "batch",
    "serial",
    "reg_no",
    "make",
    "purchase_date",
    "photo_s3_key",
    "mfg_date",
    "exp_date",
)
MAX_ITEMS_PER_POST = 100
ITEMS_SCAN_LIMIT = 500
DEFAULT_LIMIT = 50
MAX_LIMIT = 100
LOCAL_ARN_PREFIX = "arn:aws:states:local:000000000000:execution:recallindia-match:"
EVENT_CURSOR_KEYS = frozenset({"pk", "rk", "ts"})
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_SINCE = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z?)?$")
# also a valid Step Functions execution-name fragment (no whitespace, : / # ? * and friends)
_ITEM_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_NAME_SAFE = re.compile(r"[^A-Za-z0-9._-]")

# The ASL's Pass stand-ins, so the demo runner degrades exactly like the state machine.
HOLD_UNAVAILABLE: dict[str, Any] = {
    "decision": "hold",
    "reason": "verification unavailable",
    "notice_pk": None,
    "quoted_sentence": "",
    "confidence": 0,
    "verifier": "none",
    "covers_item": None,
    "range_check": None,
    "candidates_considered": 0,
    "degraded": True,
}
VERIFY_UNAVAILABLE: dict[str, Any] = {
    "covers_item": None,
    "quoted_sentence": "",
    "confidence": 0,
    "reasoning": "verification unavailable",
    "verifier": "none",
    "degraded": True,
}
RANGE_UNAVAILABLE: dict[str, Any] = {
    "inside": None,
    "listed": "",
    "yours": "",
    "kind": "none",
    "degraded": True,
}


class BadCursor(ValueError):
    """The events cursor is not one we issued (malformed or edited)."""


class ItemError(ValueError):
    """A request item failed validation; ``field`` names the offending field."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field


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


def parse_json_body(event: dict) -> Any:
    """JSON body of an HTTP API v2 event (base64 aware): ``{}`` when empty, None when invalid.

    Unlike ``ingest_api.parse_body`` a JSON array is returned too (``POST /items`` accepts one).
    """
    raw = event.get("body")
    if raw is None or raw == "":
        return {}
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def parse_limit(value: str | int | None) -> int:
    """``limit`` query value -> int in ``1..MAX_LIMIT`` (default 50, above 100 clamps)."""
    if value is None or str(value).strip() == "":
        return DEFAULT_LIMIT
    limit = int(str(value).strip())
    if limit < 1:
        raise ValueError("limit must be >= 1")
    return min(limit, MAX_LIMIT)


def _path_id(params: dict, key: str = "id") -> str:
    return unquote(str(params.get(key) or "")).strip()


# --- POST /items ----------------------------------------------------------------------


def _year(value: Any) -> int:
    if isinstance(value, bool):
        raise ItemError("year", "year must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not value.is_integer():
            raise ItemError("year", "year must be an integer")
        return int(value)
    try:
        return int(str(value).strip())
    except ValueError:
        raise ItemError("year", "year must be an integer") from None


def build_item(raw: Any, *, now: str) -> dict:
    """Validated Item dict from one request object; raises ``ItemError`` naming the field.

    ``name`` is required; ``kind`` defaults to ``other``; ``year`` must be an integer;
    ``purchase_date`` must be ``YYYY-MM-DD``; ``item_id`` is kept when given (letters, digits,
    ``. _ -``, 64 max) else minted as ``item-<12 hex>``. Unknown keys are ignored.
    """
    if not isinstance(raw, dict):
        raise ItemError("item", "each item must be a JSON object")
    fields: dict[str, Any] = {}
    for key in ITEM_STRING_FIELDS:
        value = raw.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            fields[key] = text
    if "name" not in fields:
        raise ItemError("name", "name is required")
    kind = str(raw.get("kind") or "other").strip().lower()
    if kind not in ITEM_KINDS:
        raise ItemError("kind", f"kind must be one of {', '.join(ITEM_KINDS)}")
    fields["kind"] = kind
    if raw.get("year") not in (None, ""):
        fields["year"] = _year(raw["year"])
    if "purchase_date" in fields and not _ISO_DATE.match(fields["purchase_date"]):
        raise ItemError("purchase_date", "purchase_date must be YYYY-MM-DD")
    item_id = str(raw.get("item_id") or "").strip() or f"item-{secrets.token_hex(6)}"
    if not _ITEM_ID.match(item_id):
        raise ItemError("item_id", "item_id must be 1-64 letters, digits, '.', '_' or '-'")
    try:
        item = Item(
            pk=Item.make_pk(item_id), item_id=item_id, status="clear", created_at=now, **fields
        )
    except ValidationError as exc:
        first = exc.errors()[0]
        loc = ".".join(str(p) for p in first.get("loc", ())) or "item"
        raise ItemError(loc, f"{loc}: {first.get('msg')}") from None
    return item.model_dump()


def create_items(_params: dict, event: dict) -> Result:
    """``POST /items``: ``{"items": [...]}``, a bare list, or one item object -> 201.

    Every item is validated before anything is written, so a bad one (400 naming the field
    and its index) writes nothing. An existing ``item_id`` is overwritten (put).
    """
    body = parse_json_body(event)
    if body is None:
        return 400, {"error": "body must be JSON"}
    if isinstance(body, dict) and "items" in body:
        raws = body["items"]
        if not isinstance(raws, list):
            return 400, {"error": "items must be a list", "field": "items"}
    elif isinstance(body, list):
        raws = body
    elif isinstance(body, dict) and body:
        raws = [body]
    else:
        return 400, {"error": 'body must be an item object or {"items": [...]}'}
    if not raws:
        return 400, {"error": "items is empty", "field": "items"}
    if len(raws) > MAX_ITEMS_PER_POST:
        return 400, {"error": f"at most {MAX_ITEMS_PER_POST} items per request", "field": "items"}
    now = _now()
    items: list[dict] = []
    for index, raw in enumerate(raws):
        try:
            items.append(build_item(raw, now=now))
        except ItemError as exc:
            return 400, {"error": str(exc), "field": exc.field, "index": index}
    ids = [item["item_id"] for item in items]
    if len(set(ids)) != len(ids):
        return 400, {"error": "duplicate item_id in request", "field": "item_id"}
    for item in items:
        dynamo.put("items", item)
    return 201, {"items": items, "count": len(items)}


# --- GET /items, GET /items/{id} -------------------------------------------------------


def list_items(_params: dict, _event: dict) -> Result:
    """``GET /items``: the wall, newest ``created_at`` first, then name (see module docstring)."""
    rows = dynamo.scan_all("items", limit=ITEMS_SCAN_LIMIT)
    items = [r for r in rows if isinstance(r, dict) and str(r.get("pk", "")).startswith("user#")]
    items.sort(key=lambda i: str(i.get("name") or "").lower())
    items.sort(key=lambda i: str(i.get("created_at") or ""), reverse=True)
    return 200, {"items": items, "count": len(items)}


def get_item(params: dict, _event: dict) -> Result:
    """``GET /items/{id}``: the item plus ``case`` (its current Case row, or null)."""
    item_id = _path_id(params)
    item = dynamo.get("items", Item.make_pk(item_id)) if item_id else None
    if item is None:
        return 404, {"error": "not found", "item_id": item_id}
    case = None
    if item.get("case_id"):
        case = dynamo.get("cases", Case.make_pk(str(item["case_id"])))
    return 200, {**item, "case": case}


# --- POST /items/{id}/check -----------------------------------------------------------


def execution_name(item_id: str, now: str) -> str:
    """``check-<item id tail>-<YYYYMMDDHHMMSS>-<4 hex>`` (<= 80 chars, Step Functions safe)."""
    tail = _NAME_SAFE.sub("-", item_id[-12:]) or "item"
    stamp = now.replace("-", "").replace(":", "").replace("T", "").rstrip("Z")
    return f"check-{tail}-{stamp}-{secrets.token_hex(2)}"[:80]


def check_item(params: dict, _event: dict) -> Result:
    """``POST /items/{id}/check``: start a MatchStateMachine execution for the item.

    Live: ``start_execution(input={"item_id"})``, then ``item.last_check_arn`` /
    ``last_check_at`` -> ``202 {execution_arn, run_id, item_id, status: RUNNING}``. DEMO_MODE:
    the chain runs in-process -> ``200`` with the decision (``run_demo_check``).
    """
    item_id = _path_id(params)
    item = dynamo.get("items", Item.make_pk(item_id)) if item_id else None
    if item is None:
        return 404, {"error": "not found", "item_id": item_id}
    if is_demo():
        return run_demo_check(item)
    machine_arn = os.environ.get("MATCH_STATE_MACHINE_ARN")
    if not machine_arn:
        return 500, {
            "error": "MATCH_STATE_MACHINE_ARN is not set on the API function; "
            "deploy template.yaml (ApiFunction.Environment) before starting a check"
        }
    now = _now()
    name = execution_name(item_id, now)
    try:
        resp = _sfn_client().start_execution(
            stateMachineArn=machine_arn, name=name, input=json.dumps({"item_id": item_id})
        )
    except Exception as exc:
        return 502, {"error": f"start_execution failed: {type(exc).__name__}: {exc}"}
    execution_arn = str((resp or {}).get("executionArn") or "")
    item.update({"last_check_arn": execution_arn or name, "last_check_at": now})
    dynamo.put("items", item)
    return 202, {
        "execution_arn": execution_arn,
        "run_id": execution_arn.rsplit(":", 1)[-1] if execution_arn else name,
        "item_id": item_id,
        "status": "RUNNING",
        "started_at": _iso((resp or {}).get("startDate")) or now,
    }


def _matcher_modules() -> dict[str, Any] | None:
    """The five match handlers, or None in the Lambda layout (CodeUri backend/api/ only)."""
    try:
        from matcher import candidates, decide, notify, range_check, verify
    except ImportError:
        return None
    return {
        "candidates": candidates.handler,
        "verify": verify.handler,
        "range_check": range_check.handler,
        "decide": decide.handler,
        "notify": notify.handler,
    }


def _call(fn: Any, payload: dict, fallback: dict | None) -> tuple[dict | None, str | None]:
    """Invoke a handler like a Task: ``(result, error)``; a raise or a non-dict result becomes
    the ASL's Pass stand-in (``fallback``) with the error text, or None when there is none."""
    try:
        out = fn(payload, None)
    except Exception as exc:  # handlers never raise, but the runner must not either
        error = f"{type(exc).__name__}: {exc}"
        return (dict(fallback, error=error) if fallback is not None else None), error
    if not isinstance(out, dict):
        error = f"handler returned {type(out).__name__}"
        return (dict(fallback, error=error) if fallback is not None else None), error
    return out, None


def _count(candidates: dict) -> int:
    try:
        return int(candidates.get("count") or 0)
    except (TypeError, ValueError):
        return 0


def run_demo_check(item: dict) -> Result:
    """DEMO_MODE: Candidates -> Map(Verify -> RangeCheck) -> Decide -> Notify in-process.

    Mirrors the ASL: ``$.run`` from Init, each result under its own key, HasCandidates on
    ``$.candidates.count``, the Map iterator input ``{candidate, item: $.candidates.item,
    run}`` and its output ``{candidate, verify, range_check}``, and every Catch: a Verify or
    RangeCheck failure becomes its null stand-in for that candidate, a Candidates or Decide
    failure becomes HoldUnavailable (``$.candidates`` absent when Candidates failed, so
    Notify loads the item itself). Only Notify failing ends the run FAILED.
    """
    handlers = _matcher_modules()
    if handlers is None:
        return 501, {"error": "demo match runner needs the matcher modules"}
    item_id = str(item["item_id"])
    started_at = _now()
    run_id = execution_name(item_id, started_at)
    execution_arn = LOCAL_ARN_PREFIX + run_id
    item.update({"last_check_arn": execution_arn, "last_check_at": started_at})
    dynamo.put("items", item)
    run = {"execution_arn": execution_arn, "execution_name": run_id, "started_at": started_at}
    state: dict[str, Any] = {"item_id": item_id, "run": run}
    errors: dict[str, str] = {}

    candidates, error = _call(handlers["candidates"], state, None)
    if candidates is None:
        errors["Candidates"] = error or "no result"
        state["error"] = {"Error": "Candidates", "Cause": errors["Candidates"]}
        state["decide"] = dict(HOLD_UNAVAILABLE)
    else:
        state["candidates"] = candidates
        if _count(candidates) > 0:
            snapshot = candidates.get("item") if isinstance(candidates.get("item"), dict) else item
            verified: list[dict] = []
            for candidate in candidates.get("candidates") or []:
                per = {"candidate": candidate, "item": snapshot, "run": run}
                verify, v_err = _call(handlers["verify"], per, VERIFY_UNAVAILABLE)
                if v_err:
                    errors.setdefault("Verify", v_err)
                range_check, r_err = _call(
                    handlers["range_check"], {**per, "verify": verify}, RANGE_UNAVAILABLE
                )
                if r_err:
                    errors.setdefault("RangeCheck", r_err)
                verified.append(
                    {"candidate": candidate, "verify": verify, "range_check": range_check}
                )
            state["verified"] = verified
        decide, error = _call(handlers["decide"], state, None)
        if decide is None:
            errors["Decide"] = error or "no result"
            state["error"] = {"Error": "Decide", "Cause": errors["Decide"]}
            decide = dict(HOLD_UNAVAILABLE)
        state["decide"] = decide

    notify, error = _call(handlers["notify"], state, None)
    if notify is None:
        errors["Notify"] = error or "no result"
        notify = {"case_id": None, "degraded": True, "error": errors["Notify"]}
        status = "FAILED"
    else:
        status = "SUCCEEDED"
    state["notify"] = notify

    decide = state["decide"]
    considered = decide.get("candidates_considered")
    if considered is None:
        considered = len(state.get("verified") or [])
    return 200, {
        "execution_arn": execution_arn,
        "run_id": run_id,
        "item_id": item_id,
        "status": status,
        "started_at": started_at,
        "stopped_at": _now(),
        "decision": decide.get("decision"),
        "reason": decide.get("reason"),
        "case_id": notify.get("case_id"),
        "decide": decide,
        "candidates_considered": considered,
        "notify": notify,
        "errors": errors or None,
    }


# --- GET /cases/{id} ------------------------------------------------------------------


def get_case(params: dict, _event: dict) -> Result:
    case_id = _path_id(params)
    case = dynamo.get("cases", Case.make_pk(case_id)) if case_id else None
    if case is None or case.get("rk") != "case":  # an events# row is not a case
        return 404, {"error": "not found", "case_id": case_id}
    return 200, case


# --- GET /events ----------------------------------------------------------------------


def encode_event_cursor(key: dict) -> str:
    """``LastEvaluatedKey`` of the ``rk-ts-index`` (``{pk, rk, ts}``) -> opaque base64url."""
    raw = json.dumps(
        {k: str(key[k]) for k in sorted(EVENT_CURSOR_KEYS)}, separators=(",", ":")
    ).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_event_cursor(text: str) -> dict:
    """Inverse of ``encode_event_cursor``; raises ``BadCursor`` unless it is exactly an event
    key (``{pk: events#..., rk: "event", ts}`` of non-empty strings), so an edited cursor is a
    400 here rather than a DynamoDB ``ValidationException`` (500) later."""
    text = text.strip()
    try:
        padded = text + "=" * (-len(text) % 4)
        key = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, TypeError) as exc:
        raise BadCursor("bad cursor") from exc
    if not isinstance(key, dict) or set(key) != EVENT_CURSOR_KEYS:
        raise BadCursor("bad cursor")
    if not all(isinstance(v, str) and v for v in key.values()):
        raise BadCursor("bad cursor")
    if key["rk"] != "event" or not key["pk"].startswith("events#"):
        raise BadCursor("bad cursor")
    return key


def list_events(_params: dict, event: dict) -> Result:
    """``GET /events?since=&limit=&cursor=``: Event rows newest-first from ``rk-ts-index``.

    ``since`` is ``YYYY-MM-DD`` or ``YYYY-MM-DDTHH:MM:SSZ`` (``ts >= since``); ``limit``
    default 50, max 100; ``next_cursor`` is null on the last page (as on DynamoDB a full page
    always carries a cursor, so the final page may be empty).
    """
    qs = {k: v for k, v in (event.get("queryStringParameters") or {}).items() if v is not None}
    try:
        limit = parse_limit(qs.get("limit"))
    except ValueError:
        return 400, {"error": "limit must be an integer between 1 and 100"}
    since = (qs.get("since") or "").strip() or None
    if since and not _SINCE.match(since):
        return 400, {"error": "since must be YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ"}
    start: dict | None = None
    cursor_text = (qs.get("cursor") or "").strip()
    if cursor_text:
        try:
            start = decode_event_cursor(cursor_text)
        except BadCursor:
            return 400, {"error": "bad cursor"}
    events, last = dynamo.query_rk("event", since=since, limit=limit, exclusive_start_key=start)
    return 200, {
        "events": events,
        "count": len(events),
        "next_cursor": encode_event_cursor(last) if last else None,
        "since": since,
        "limit": limit,
    }
