"""Every way to answer a case that should not work (P08-P09 §1a).

The guards are checked against the real Step Functions call path: ``case_api`` is pointed at a
recording fake with ``case_api.is_demo`` off, so a refusal that still called ``SendTaskSuccess``
would show up as a recorded call. Storage stays in the demo store.

Order matters. Unknown id and "not your household" must answer the same way (404), the demo
household is refused before anything is spent (403), and the conditional update is what decides
whether Step Functions is called at all.
"""

from __future__ import annotations

import json

import pytest

from api import app, case_api
from common import dynamo, households
from pollers import cdsco_portal

MINE = "hh_mine2345"
THEIRS = "hh_them2345"
REAL_TOKEN = "AQCEAAAAKgAAAAMAAAAAAAAAA-adversarial-token"  # pragma: allowlist secret


def call(method: str, path: str, body: object = None, household: str | None = MINE):
    event = {"requestContext": {"http": {"method": method}}, "rawPath": path}
    if household:
        event["headers"] = {"x-household": household}
    if body is not None:
        event["body"] = json.dumps(body)
    resp = app.handler(event, None)
    return resp["statusCode"], json.loads(resp["body"] or "{}")


class FakeSfn:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def send_task_success(self, **kw):
        self.calls.append(("success", kw["taskToken"]))
        return {}

    def send_task_failure(self, **kw):
        self.calls.append(("failure", kw["taskToken"]))
        return {}


def _make_case(batch: str, household: str) -> dict:
    status, body = call(
        "POST",
        "/items",
        {
            "kind": "medicine",
            "name": "Paracetamol Tablets IP 650mg",
            "brand": "Forgo Pharmaceuticals",
            "batch": batch,
            "purchase_date": "2026-07-12",
        },
        household=household,
    )
    assert status == 201, body
    item_id = body["items"][0]["item_id"]
    status, check = call("POST", f"/items/{item_id}/check", household=household)
    assert status == 200, check
    return {"item_id": item_id, "case_id": check["case_id"], "status": check["status"]}


@pytest.fixture
def gate(monkeypatch):
    """One waiting alert in ``MINE``, one dismissed case, and a recording Step Functions."""
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    cdsco_portal.handler({}, None)
    alert = _make_case("FT5427", MINE)
    dismissed = _make_case("FT5428", MINE)
    case = dynamo.get("cases", alert["case_id"])
    case["approval"]["task_token"] = REAL_TOKEN  # a live-looking token, not a demo one
    dynamo.put("cases", case)
    fake = FakeSfn()
    monkeypatch.setattr(case_api, "is_demo", lambda: False)
    monkeypatch.setattr(case_api, "_sfn_client", lambda: fake)
    return {"alert": alert, "dismissed": dismissed, "sfn": fake}


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_an_unknown_case_is_404(gate, action):
    status, body = call("POST", f"/cases/case-does-not-exist/{action}")
    assert status == 404 and body["case_id"] == "case-does-not-exist"
    assert gate["sfn"].calls == []


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_another_household_cannot_see_or_answer_the_case(gate, action):
    """Someone else's case is indistinguishable from one that does not exist."""
    case_id = gate["alert"]["case_id"]
    status, body = call("POST", f"/cases/{case_id}/{action}", household=THEIRS)
    assert status == 404 and body["error"] == "not found"
    assert gate["sfn"].calls == []
    # and it is not readable either
    assert call("GET", f"/cases/{case_id}", household=THEIRS)[0] == 404
    # while its owner still sees it waiting
    assert call("GET", f"/cases/{case_id}")[1]["status"] == "waiting_approval"


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_the_demo_household_is_read_only(gate, action, monkeypatch):
    """The wall in the video can be read by anyone and changed by nobody."""
    case = dynamo.get("cases", gate["alert"]["case_id"])
    case["household_id"] = "demo"
    dynamo.put("cases", case)
    status, body = call("POST", f"/cases/{case['case_id']}/{action}", household=None)
    assert status == 403 and body["error"] == "demo_read_only"
    assert gate["sfn"].calls == []
    # a demo case is still readable from any household (the video's case is one)
    assert call("GET", f"/cases/{case['case_id']}", household=THEIRS)[0] == 200


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_a_case_that_is_not_waiting_is_409_and_never_reaches_step_functions(gate, action):
    case_id = gate["dismissed"]["case_id"]
    status, body = call("POST", f"/cases/{case_id}/{action}")
    assert status == 409 and "not waiting for approval" in body["error"]
    assert body["status"] == "near_miss" and body["case"]["decision"] == "dismiss"
    assert gate["sfn"].calls == []


def test_the_token_is_single_use(gate):
    case_id = gate["alert"]["case_id"]
    first, body = call("POST", f"/cases/{case_id}/approve")
    assert first == 200 and body["status"] == "approving"
    second, again = call("POST", f"/cases/{case_id}/approve")
    assert second == 409 and "not waiting for approval" in again["error"]
    third, _ = call("POST", f"/cases/{case_id}/reject")
    assert third == 409
    # exactly one call, with the token that was on the case
    assert gate["sfn"].calls == [("success", REAL_TOKEN)]
    assert "task_token" not in json.dumps(call("GET", f"/cases/{case_id}")[1])


def test_the_approval_cap_stops_a_household_at_five(gate, monkeypatch):
    monkeypatch.setattr(households, "MAX_APPROVALS", 1)
    case_id = gate["alert"]["case_id"]
    assert call("POST", f"/cases/{case_id}/approve")[0] == 200
    # a second waiting case in the same household: the cap, not the token, refuses it
    other = _make_case("FT5427", MINE)
    case = dynamo.get("cases", other["case_id"])
    case["approval"]["task_token"] = REAL_TOKEN
    dynamo.put("cases", case)
    status, body = call("POST", f"/cases/{other['case_id']}/approve")
    assert status == 429 and body["error"] == "demo_busy"
    assert gate["sfn"].calls == [("success", REAL_TOKEN)]  # the capped one never got there
