"""End-to-end item wall API in DEMO_MODE through ``api.app.handler``.

One module-scoped world: the CDSCO portal fixture (239 JUL-2026 rows) and the NHTSA fixture
(7 notices) are polled into a fresh store, four items are posted and each one is checked
through the in-process demo chain (Candidates -> Verify/RangeCheck -> Decide -> Notify), the
same handlers the MatchStateMachine runs. Live-path tests use a fake Step Functions client.
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import os
import re

import pytest

from api import app, match_api
from common import dynamo

MACHINE_ARN = "arn:aws:states:ap-south-1:277025716889:stateMachine:recallindia-match-277025716889"
ITEMS = [
    {
        "item_id": "item-a",
        "kind": "medicine",
        "name": "Paracetamol Tablets IP 650mg",
        "brand": "Forgo Pharmaceuticals",
        "batch": "FT5427",
        "purchase_date": "2026-08-01",
    },
    {
        "item_id": "item-b",
        "kind": "medicine",
        "name": "Paracetamol Tablets IP 650mg",
        "brand": "Forgo Pharmaceuticals",
        "batch": "FT5428",
        "purchase_date": "2026-08-01",
    },
    {
        "item_id": "item-v",
        "kind": "vehicle",
        "name": "Jeep Compass",
        "brand": "Jeep",
        "make": "jeep",
        "model": "compass",
        "year": 2022,
    },
    {
        "item_id": "item-k",
        "kind": "appliance",
        "name": "Prestige Deluxe Pressure Cooker",
        "brand": "Prestige",
    },
]


def _event(method: str, path: str, qs: dict | None = None, body=None, **kw) -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "queryStringParameters": {k: str(v) for k, v in (qs or {}).items()},
        "requestContext": {"http": {"method": method, "path": path}},
        # items and cases are scoped by household; "demo" is read-only (P08-P09 §1d)
        "headers": {"x-household": "hh_test2345"},
        "body": json.dumps(body) if isinstance(body, (dict, list)) else body,
        **kw,
    }


def _call(method: str, path: str, qs: dict | None = None, body=None, **kw):
    out = app.handler(_event(method, path, qs, body, **kw), None)
    return out["statusCode"], json.loads(out["body"])


# --- the demo world ----------------------------------------------------------------------


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    """Seed notices, post the four items and check each one; shared by the assertions below."""
    from pollers import cdsco_portal, nhtsa

    store = tmp_path_factory.mktemp("store")
    previous = {k: os.environ.get(k) for k in ("DEMO_MODE", "DEMO_STORE_DIR", "NOTIFY_EMAIL")}
    os.environ["DEMO_MODE"] = "1"
    os.environ["DEMO_STORE_DIR"] = str(store)
    os.environ.pop("NOTIFY_EMAIL", None)
    try:
        assert cdsco_portal.handler({}, None)["created"] == 239
        assert nhtsa.handler({}, None)["created"] == 7
        status, created = _call("POST", "/items", body={"items": ITEMS})
        assert status == 201, created
        checks = {}
        for item in ITEMS:
            status, body = _call("POST", f"/items/{item['item_id']}/check")
            assert status == 200, body
            checks[item["item_id"]] = body
        yield {"store": str(store), "created": created, "checks": checks}
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


@pytest.fixture
def store(world, monkeypatch):
    """Point the per-test env (conftest gives a fresh one) back at the shared world."""
    monkeypatch.setenv("DEMO_STORE_DIR", world["store"])
    return world


def _case_of(store, item_id: str) -> dict:
    status, body = _call("GET", f"/items/{item_id}")
    assert status == 200, body
    assert body["case"] is not None, body
    return body["case"]


def test_post_items_bulk_returns_201_with_four_items(store):
    created = store["created"]
    assert created["count"] == 4 and [i["item_id"] for i in created["items"]] == [
        "item-a",
        "item-b",
        "item-v",
        "item-k",
    ]
    a = created["items"][0]
    assert a["pk"] == "user#item-a" and a["status"] == "clear" and a["case_id"] is None
    assert a["kind"] == "medicine" and a["batch"] == "FT5427"
    assert a["purchase_date"] == "2026-08-01" and a["created_at"].endswith("Z")
    assert created["items"][2]["year"] == 2022 and created["items"][2]["make"] == "jeep"


def test_check_a_is_an_alert_with_a_verbatim_quote(store):
    body = store["checks"]["item-a"]
    # an alert pauses for the human at WaitForApproval (P08): the check itself is done
    assert body["status"] == "WAITING_FOR_APPROVAL" and body["decision"] == "alert", body
    assert body["execution_arn"].startswith(match_api.LOCAL_ARN_PREFIX)
    assert body["run_id"] == body["execution_arn"].rsplit(":", 1)[-1]
    assert body["run_id"].startswith("check-item-a-") and len(body["run_id"]) <= 80
    assert body["item_id"] == "item-a" and body["case_id"]
    assert body["candidates_considered"] >= 1
    assert body["decide"]["verifier"] == "deterministic"
    assert body["decide"]["covers_item"] is True

    case = _case_of(store, "item-a")
    assert case["case_id"] == body["case_id"] and case["decision"] == "alert"
    assert case["verifier"] == "deterministic"
    assert case["notice_id"].startswith("cdsco_nsq#")
    notice = dynamo.get("notices", case["notice_id"])
    assert notice["batches"] == ["FT5427"] and notice["brand"] == "Forgo Pharmaceuticals"
    quote = case["quoted_sentence"]
    assert quote and "FT5427" in quote
    # verbatim, whitespace runs aside (verify.quote_is_verbatim)
    assert " ".join(quote.split()) in " ".join(notice["raw_excerpt"].split())
    assert case["range_check"]["inside"] is True
    assert "FT5427" in case["range_check"]["listed"] and case["range_check"]["yours"] == "FT5427"
    assert case["sold_after_notice"] is True
    assert case["execution_arn"] == body["execution_arn"]
    assert ("recall" + "ed") not in case["reason"].lower()

    status, item = _call("GET", "/items/item-a")
    assert status == 200 and item["status"] == "alert" and item["case_id"] == body["case_id"]
    assert item["last_check_arn"] == body["execution_arn"] and item["last_checked_at"]
    assert item["case"]["case_id"] == body["case_id"]


def test_check_b_is_a_near_miss_dismiss(store):
    body = store["checks"]["item-b"]
    assert body["status"] == "SUCCEEDED" and body["decision"] == "dismiss", body
    reason = body["reason"]
    assert re.match(r"^batch FT5428 not in listed batches \[.*FT5427.*\]$", reason), reason
    if "," not in reason:
        assert reason == "batch FT5428 not in listed batches [FT5427]"
    case = _case_of(store, "item-b")
    assert case["decision"] == "dismiss" and case["reason"] == reason
    assert case["range_check"]["inside"] is False and case["range_check"]["yours"] == "FT5428"
    status, item = _call("GET", "/items/item-b")
    assert status == 200 and item["status"] == "clear" and item["case_id"] == body["case_id"]


def test_check_v_matches_an_nhtsa_notice(store):
    body = store["checks"]["item-v"]
    assert body["decision"] in ("alert", "hold"), body
    assert body["status"] == (
        "WAITING_FOR_APPROVAL" if body["decision"] == "alert" else "SUCCEEDED"
    )
    case = _case_of(store, "item-v")
    assert case["decision"] == body["decision"]
    assert case["notice_id"].startswith("nhtsa#")
    notice = dynamo.get("notices", case["notice_id"])
    assert notice["source"] == "nhtsa"
    assert any(v["make"] == "jeep" and v["model"] == "compass" for v in notice["vehicles"])
    status, item = _call("GET", "/items/item-v")
    assert item["status"] == body["decision"] and item["case_id"] == body["case_id"]


def test_check_k_is_clear_with_no_case(store):
    body = store["checks"]["item-k"]
    assert body["status"] == "SUCCEEDED" and body["decision"] == "clear", body
    assert body["case_id"] is None and body["candidates_considered"] == 0
    assert body["reason"].startswith("no match in 4 sources as of ")
    status, item = _call("GET", "/items/item-k")
    assert status == 200 and item["status"] == "clear" and item["case_id"] is None
    assert item["case"] is None and item["last_checked_at"]
    clear = [e for e in _events_all() if e["type"] == "item.clear"]
    assert len(clear) == 1 and clear[0]["item_id"] == "item-k"
    assert clear[0]["message"].startswith("no match in 4 sources as of")
    assert "safe" not in clear[0]["message"]


def _events_all() -> list[dict]:
    status, body = _call("GET", "/events", {"limit": 100})
    assert status == 200
    return body["events"]


def test_events_newest_first_with_cursor(store):
    status, body = _call("GET", "/events", {"limit": 10})
    assert status == 200, body
    assert body["count"] == len(body["events"]) <= 10 and body["limit"] == 10
    types = [e["type"] for e in body["events"]]
    assert "case.alert" in types and "item.clear" in types and "case.dismiss" in types
    assert "email.skipped" in types  # alert in DEMO_MODE: SES not called
    stamps = [e["ts"] for e in body["events"]]
    assert stamps == sorted(stamps, reverse=True)
    for e in body["events"]:
        assert e["pk"] == f"events#{e['event_id']}" and e["rk"] == "event"
        assert e["message"] and e["decision"] in ("alert", "hold", "dismiss", "clear")
    alert = next(
        e for e in body["events"] if e["type"] == "case.alert" and e["item_id"] == "item-a"
    )
    assert alert["case_id"] == store["checks"]["item-a"]["case_id"]
    assert "failed CDSCO quality test" in alert["message"]

    # page size 2: follow next_cursor to the end, every event exactly once
    seen: list[str] = []
    cursor = None
    for _ in range(20):
        qs = {"limit": 2}
        if cursor:
            qs["cursor"] = cursor
        status, page = _call("GET", "/events", qs)
        assert status == 200, page
        seen.extend(e["event_id"] for e in page["events"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert cursor is None and sorted(seen) == sorted(e["event_id"] for e in body["events"])
    assert len(set(seen)) == len(seen)

    # since = a full timestamp in the future -> nothing; a date -> everything
    status, page = _call("GET", "/events", {"since": "2999-01-01T00:00:00Z"})
    assert status == 200 and page["count"] == 0 and page["next_cursor"] is None
    status, page = _call("GET", "/events", {"since": "2026-01-01"})
    assert status == 200 and page["count"] == body["count"]


def test_events_reject_bad_params(store):
    for bad in ("x", "0", "-1"):
        status, body = _call("GET", "/events", {"limit": bad})
        assert status == 400 and "limit" in body["error"], bad
    status, body = _call("GET", "/events", {"since": "yesterday"})
    assert status == 400 and "since" in body["error"]
    edited = base64.urlsafe_b64encode(
        json.dumps({"pk": "cases#x", "rk": "event", "ts": "t"}).encode()
    ).decode()
    for bad in ("not-base64!", "e30", edited, "eyJwayI6ICJldmVudHMjeCJ9"):
        status, body = _call("GET", "/events", {"cursor": bad})
        assert status == 400 and body["error"] == "bad cursor", bad
    # limit above 100 clamps
    status, body = _call("GET", "/events", {"limit": 500})
    assert status == 200 and body["limit"] == 100


def test_get_case_200_and_404(store):
    case_id = store["checks"]["item-a"]["case_id"]
    status, body = _call("GET", f"/cases/{case_id}")
    assert status == 200 and body["case_id"] == case_id and body["item_id"] == "item-a"
    assert body["rk"] == "case" and body["ts"] == body["created_at"]
    status, body = _call("GET", "/cases/case-nope")
    assert status == 404 and body["error"] == "not found"
    # an event row lives in the same table but is not a case
    event_pk = _events_all()[0]["pk"]
    status, _ = _call("GET", "/cases/" + event_pk.replace("#", "%23"))
    assert status == 404


def test_list_items_sorted_newest_first(store):
    status, body = _call("GET", "/items")
    assert status == 200 and body["count"] == 4
    ids = sorted(i["item_id"] for i in body["items"])
    assert ids == ["item-a", "item-b", "item-k", "item-v"]
    stamps = [i["created_at"] for i in body["items"]]
    assert stamps == sorted(stamps, reverse=True)
    # same created_at -> by name
    names = [i["name"] for i in body["items"]]
    assert names == sorted(names, key=str.lower)
    statuses = {i["item_id"]: i["status"] for i in body["items"]}
    assert statuses["item-a"] == "alert" and statuses["item-b"] == "clear"
    assert statuses["item-k"] == "clear" and statuses["item-v"] in ("alert", "hold")
    status, body = _call("GET", "/items/ghost")
    assert status == 404


# --- validation (fresh store per test) --------------------------------------------------


def test_post_items_validation():
    status, body = _call("POST", "/items", body={"brand": "Forgo"})
    assert status == 400 and body["field"] == "name" and "name" in body["error"]
    status, body = _call("POST", "/items", body={"items": [{"name": "ok"}, {"kind": "medicine"}]})
    assert status == 400 and body["field"] == "name" and body["index"] == 1
    assert _call("GET", "/items")[1]["count"] == 0  # nothing written on a bad batch
    status, body = _call("POST", "/items", body={"name": "x", "kind": "toy"})
    assert status == 400 and body["field"] == "kind"
    status, body = _call("POST", "/items", body={"name": "x", "year": "twenty"})
    assert status == 400 and body["field"] == "year"
    status, body = _call("POST", "/items", body={"name": "x", "purchase_date": "01/08/2026"})
    assert status == 400 and body["field"] == "purchase_date"
    status, body = _call("POST", "/items", body={"name": "x", "item_id": "has space"})
    assert status == 400 and body["field"] == "item_id"
    status, body = _call("POST", "/items", body="not json")
    assert status == 400
    status, body = _call("POST", "/items", body={"items": []})
    assert status == 400
    status, body = _call("POST", "/items", body={"items": [{"name": "a", "item_id": "d"}] * 2})
    assert status == 400 and body["field"] == "item_id"
    # a single object, kind defaults to other, id is minted, year as a numeric string
    status, body = _call("POST", "/items", body={"name": "Milton bottle", "year": "2024"})
    assert status == 201 and body["count"] == 1
    item = body["items"][0]
    assert item["kind"] == "other" and re.match(r"^item-[0-9a-f]{12}$", item["item_id"])
    assert item["year"] == 2024 and item["status"] == "clear"
    # a bare list works too and base64 bodies decode
    raw = base64.b64encode(json.dumps([{"name": "Havells fan", "kind": "appliance"}]).encode())
    status, body = _call("POST", "/items", body=raw.decode(), isBase64Encoded=True)
    assert status == 201 and body["items"][0]["kind"] == "appliance"
    assert _call("GET", "/items")[1]["count"] == 2


def test_check_unknown_item_is_404():
    status, body = _call("POST", "/items/ghost/check")
    assert status == 404 and body["item_id"] == "ghost"


def test_demo_check_needs_the_matcher_modules(monkeypatch):
    _call("POST", "/items", body={"name": "x", "item_id": "i1"})
    monkeypatch.setattr(match_api, "_matcher_modules", lambda: None)
    status, body = _call("POST", "/items/i1/check")
    assert status == 501 and "matcher modules" in body["error"]


def test_demo_check_survives_a_raising_candidates(monkeypatch):
    """A Candidates failure mirrors the ASL's HoldUnavailable: hold, recorded, no exception."""
    from matcher import candidates

    _call("POST", "/items", body={"name": "Dolo 650", "kind": "medicine", "item_id": "i2"})

    def boom(event, context):
        raise RuntimeError("table blinked")

    monkeypatch.setattr(candidates, "handler", boom)
    status, body = _call("POST", "/items/i2/check")
    assert status == 200 and body["status"] == "SUCCEEDED", body
    assert body["decision"] == "hold" and body["reason"] == "verification unavailable"
    assert body["errors"]["Candidates"].startswith("RuntimeError")
    assert body["case_id"]
    status, item = _call("GET", "/items/i2")
    assert item["status"] == "hold" and item["case"]["notice_id"] == ""


# --- live start path with a fake Step Functions client --------------------------------


class _FakeSfn:
    def __init__(self):
        self.started: list[dict] = []
        self.start = dt.datetime(2026, 9, 19, 12, 0, 0, tzinfo=dt.UTC)

    def start_execution(self, **kw):
        self.started.append(kw)
        return {
            "executionArn": kw["stateMachineArn"].replace(":stateMachine:", ":execution:")
            + ":"
            + kw["name"],
            "startDate": self.start,
        }


@pytest.fixture
def live_store(monkeypatch):
    """DEMO_MODE=0 for the API (so it starts an execution) while the tables stay in the file
    store."""
    _call("POST", "/items", body=ITEMS[0])
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setattr(dynamo, "is_demo", lambda: True)


def test_live_check_starts_an_execution(live_store, monkeypatch):
    monkeypatch.setenv("MATCH_STATE_MACHINE_ARN", MACHINE_ARN)
    fake = _FakeSfn()
    monkeypatch.setattr(match_api, "_sfn_client", lambda: fake)
    status, body = _call("POST", "/items/item-a/check")
    assert status == 202, body
    assert len(fake.started) == 1
    call = fake.started[0]
    assert call["stateMachineArn"] == MACHINE_ARN
    assert json.loads(call["input"]) == {"item_id": "item-a"}
    assert call["name"].startswith("check-item-a-") and len(call["name"]) <= 80
    assert re.match(r"^check-item-a-\d{14}-[0-9a-f]{4}$", call["name"])
    assert body["execution_arn"].endswith(":" + call["name"])
    assert body["run_id"] == call["name"] and body["status"] == "RUNNING"
    assert body["item_id"] == "item-a" and body["started_at"] == "2026-09-19T12:00:00Z"
    status, item = _call("GET", "/items/item-a")
    assert status == 200 and item["last_check_arn"] == body["execution_arn"]
    assert item["last_check_at"] and item["status"] == "clear"


def test_live_check_without_machine_arn_is_500(live_store, monkeypatch):
    monkeypatch.delenv("MATCH_STATE_MACHINE_ARN", raising=False)
    monkeypatch.setattr(match_api, "_sfn_client", lambda: pytest.fail("must not be called"))
    status, body = _call("POST", "/items/item-a/check")
    assert status == 500 and "MATCH_STATE_MACHINE_ARN" in body["error"]


def test_live_check_start_failure_is_502(live_store, monkeypatch):
    monkeypatch.setenv("MATCH_STATE_MACHINE_ARN", MACHINE_ARN)

    class Broken:
        def start_execution(self, **kw):
            raise RuntimeError("AccessDeniedException")

    monkeypatch.setattr(match_api, "_sfn_client", lambda: Broken())
    status, body = _call("POST", "/items/item-a/check")
    assert status == 502 and "AccessDeniedException" in body["error"]
    assert _call("GET", "/items/item-a")[1]["last_check_arn"] is None
