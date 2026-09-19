"""``POST /households`` and ``POST /households/{id}/reset``: your own copy of the demo wall.

There is no sign-up. A visitor clicks "Make my own copy", gets an id (``hh_`` + 8 base32 chars)
that the browser keeps in localStorage, and from then on sends it as ``X-Household``. The copy is
the demo household's items, item for item, and every copy is checked against the notices, so the
wall fills in front of the visitor exactly as the demo wall did.

The checks run through one state machine with a Map at ``MaxConcurrency`` 3, not 15 executions
started at once: a public demo should not be able to start a Textract stampede.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import secrets
from typing import Any

try:  # the Lambda bundle flattens the package; tests import it as api.match_api
    from api import match_api
except ImportError:  # pragma: no cover - import shape only
    import match_api  # type: ignore[no-redef]
from common import dynamo, households
from common.demo_mode import is_demo
from common.notices import now_iso
from common.schemas import DEMO_HOUSEHOLD, Item

log = logging.getLogger(__name__)
Result = tuple[int, dict]

# what a copy keeps from the demo item (identity, not history)
COPIED = (
    "kind",
    "name",
    "brand",
    "model",
    "batch",
    "serial",
    "reg_no",
    "make",
    "year",
    "purchase_date",
    "bought_from",
    "mfg_date",
    "exp_date",
)


def _sfn_client() -> Any:
    import boto3  # lazy: demo mode must not need boto3 credentials

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    return boto3.client("stepfunctions", region_name=region)


def _new_item_id() -> str:
    return f"item-{secrets.token_hex(6)}"


def _copy_demo_items(household_id: str, now: str) -> list[dict]:
    """The demo wall, copied into ``household_id`` with fresh ids and no check history."""
    source = [
        row
        for row in dynamo.query_household("items", DEMO_HOUSEHOLD, limit=households.MAX_ITEMS)
        if str(row.get("pk", "")).startswith("user#")
    ]
    source.sort(key=lambda i: str(i.get("created_at") or ""))
    copies: list[dict] = []
    for row in source[: households.MAX_ITEMS]:
        item_id = _new_item_id()
        copy = Item(
            pk=Item.make_pk(item_id),
            item_id=item_id,
            household_id=household_id,
            copied_from=str(row.get("item_id") or "") or None,
            created_at=now,
            **{k: row.get(k) for k in COPIED if row.get(k) not in (None, "")},
        )
        dynamo.put("items", copy.model_dump())
        copies.append(copy.model_dump())
    return copies


def _start_checks(household_id: str, items: list[dict]) -> str | None:
    """Start the household's checks (one Map, MaxConcurrency 3); returns the execution arn."""
    if is_demo():
        for item in items:  # the demo store runs the chain in process, one item at a time
            match_api.run_demo_check(dynamo.get("items", item["pk"]) or item)
        return None
    machine = os.environ.get("HOUSEHOLD_STATE_MACHINE_ARN")
    if not machine:
        log.warning("HOUSEHOLD_STATE_MACHINE_ARN is not set: the copy will not be checked")
        return None
    stamp = now_iso().replace("-", "").replace(":", "").replace("T", "").rstrip("Z")
    name = f"copy-{household_id}-{stamp}"[:80]
    resp = _sfn_client().start_execution(
        stateMachineArn=machine,
        name=name,
        input=json.dumps(
            {
                "household_id": household_id,
                "items": [{"item_id": i["item_id"], "household_id": household_id} for i in items],
            }
        ),
    )
    return str(resp.get("executionArn") or "")


def _clear(household_id: str) -> int:
    """Delete a household's items and cases (a reset starts from the demo wall again)."""
    removed = 0
    for kind in ("items", "cases"):
        for row in dynamo.query_household(kind, household_id, limit=500):
            pk = str(row.get("pk") or "")
            if pk:
                dynamo.delete(kind, pk)
                removed += 1
    return removed


def create_household(_params: dict, _event: dict) -> Result:
    """``POST /households``: a new id, the demo items copied into it, checks started."""
    day = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d")
    try:
        households.take_daily_slot(day)
    except households.Capped:
        return 429, {"error": "demo_busy", "detail": "too many new households today"}
    household_id = households.new_id()
    now = now_iso()
    items = _copy_demo_items(household_id, now)
    if not items:
        return 503, {"error": "the demo household is empty right now; try again in a minute"}
    execution_arn = _start_checks(household_id, items)
    return 201, {
        "household_id": household_id,
        "items": len(items),
        "checking": bool(execution_arn) or is_demo(),
        "execution_arn": execution_arn,
        "created_at": now,
    }


def reset_household(params: dict, event: dict) -> Result:
    """``POST /households/{id}/reset``: throw the copy away and copy the demo wall again."""
    household_id = str((params or {}).get("id") or "").strip()
    header = households.from_event(event)
    if not households.valid(household_id) or households.is_demo_household(household_id):
        return 404, {"error": "not found", "household_id": household_id}
    if household_id != header:
        return 404, {"error": "not found", "household_id": household_id}
    _clear(household_id)
    now = now_iso()
    items = _copy_demo_items(household_id, now)
    execution_arn = _start_checks(household_id, items)
    return 200, {
        "household_id": household_id,
        "items": len(items),
        "checking": bool(execution_arn) or is_demo(),
        "execution_arn": execution_arn,
        "reset_at": now,
    }


def get_household(params: dict, event: dict) -> Result:
    """``GET /households/{id}``: how many things it holds and how many are still checking."""
    household_id = str((params or {}).get("id") or "").strip() or households.from_event(event)
    if not households.valid(household_id):
        return 404, {"error": "not found", "household_id": household_id}
    items = [
        r
        for r in dynamo.query_household("items", household_id, limit=households.MAX_ITEMS)
        if str(r.get("pk", "")).startswith("user#")
    ]
    checking = sum(1 for i in items if i.get("last_check_at") and not i.get("last_checked_at"))
    cases = [
        r for r in dynamo.query_household("cases", household_id, limit=500) if r.get("rk") == "case"
    ]
    return 200, {
        "household_id": household_id,
        "demo": households.is_demo_household(household_id),
        "items": len(items),
        "checking": checking,
        "cases": len(cases),
        "waiting_approval": sum(1 for c in cases if c.get("status") == "waiting_approval"),
    }
