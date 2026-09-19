"""P08/P09: the human gate (task token), the claim letter and the signed evidence.

The gate is tested adversarially against the real Step Functions call path: ``case_api`` is
pointed at a recording fake (``_sfn_client``) with ``case_api.is_demo`` off, while storage stays
in the demo store. Every refusal must happen before Step Functions is called.
"""

from __future__ import annotations

import base64
import json
import re

import pytest

from api import app, case_api
from common import approval as gate
from common import dynamo, s3, signing
from matcher import approval as approval_lambda
from matcher import claim, evidence
from pollers import cdsco_portal

REAL_TOKEN = "AQCEAAAAKgAAAAMAAAAAAAAAA-real-task-token"  # pragma: allowlist secret


def _call(method: str, path: str, body: object = None, qs: dict | None = None) -> tuple[int, dict]:
    event = {"requestContext": {"http": {"method": method}}, "rawPath": path}
    if body is not None:
        event["body"] = json.dumps(body)
    if qs:
        event["queryStringParameters"] = qs
    resp = app.handler(event, None)
    return resp["statusCode"], json.loads(resp["body"] or "{}")


class FakeSfn:
    def __init__(self, fail: Exception | None = None):
        self.calls: list[tuple] = []
        self.fail = fail

    def send_task_success(self, **kw):
        self.calls.append(("success", kw["taskToken"], json.loads(kw["output"])))
        if self.fail:
            raise self.fail
        return {}

    def send_task_failure(self, **kw):
        self.calls.append(("failure", kw["taskToken"], kw["error"], kw.get("cause")))
        if self.fail:
            raise self.fail
        return {}


@pytest.fixture
def world(monkeypatch):
    """The July 2026 portal notices, an alert item (bought 11 days after the notice) and its
    near-miss twin, both checked."""
    monkeypatch.setenv("BEDROCK_ENABLED", "false")
    cdsco_portal.handler({}, None)
    ids = {}
    for key, batch in (("alert", "FT5427"), ("dismiss", "FT5428")):
        status, body = _call(
            "POST",
            "/items",
            {
                "kind": "medicine",
                "name": "Paracetamol Tablets IP 650mg",
                "brand": "Forgo Pharmaceuticals",
                "batch": batch,
                "purchase_date": "2026-07-12",
            },
        )
        assert status == 201
        item_id = body["items"][0]["item_id"]
        status, check = _call("POST", f"/items/{item_id}/check")
        assert status == 200, check
        ids[key] = check["case_id"]
        ids[f"{key}_item"] = item_id
        ids[f"{key}_status"] = check["status"]
    return ids


@pytest.fixture
def live_gate(monkeypatch, world):
    """The alert case waiting on a real-looking token, with a recording Step Functions fake."""
    case = dynamo.get("cases", world["alert"])
    case["approval"]["task_token"] = REAL_TOKEN
    dynamo.put("cases", case)
    fake = FakeSfn()
    monkeypatch.setattr(case_api, "is_demo", lambda: False)
    monkeypatch.setattr(case_api, "_sfn_client", lambda: fake)
    return fake


# --- the pause -------------------------------------------------------------------------------


def test_an_alert_pauses_for_approval_and_the_token_never_leaves_the_table(world):
    assert world["alert_status"] == "WAITING_FOR_APPROVAL"
    assert world["dismiss_status"] == "SUCCEEDED"
    stored = dynamo.get("cases", world["alert"])
    assert stored["approval"]["status"] == "waiting" and stored["approval"]["task_token"]
    assert stored["approval"]["token_issued_at"]
    assert any(a["event"] == "approval.requested" for a in stored["audit"])
    status, case = _call("GET", f"/cases/{world['alert']}")
    assert status == 200 and case["approval"]["status"] == "waiting"
    assert "task_token" not in case["approval"]
    status, item = _call("GET", f"/items/{world['alert_item']}")
    assert "task_token" not in item["case"]["approval"]
    assert "task_token" not in json.dumps(
        _call("GET", f"/items/{world['alert_item']}/check-status")[1]
    )


# --- adversarial: refusals never reach Step Functions -------------------------------------------


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_unknown_case_is_404(live_gate, action):
    status, body = _call("POST", f"/cases/case-nope/{action}")
    assert status == 404 and body["case_id"] == "case-nope"
    assert live_gate.calls == []


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_an_events_row_is_not_a_case(live_gate, action):
    events = [r for r in dynamo.scan_all("cases") if str(r["pk"]).startswith("events#")]
    assert events
    status, _ = _call("POST", f"/cases/{events[0]['pk']}/{action}")
    assert status == 404 and live_gate.calls == []


@pytest.mark.parametrize("action", ["approve", "reject"])
def test_a_dismissed_case_is_409(live_gate, world, action):
    status, body = _call("POST", f"/cases/{world['dismiss']}/{action}")
    assert status == 409 and "dismiss" in body["error"]
    assert live_gate.calls == []


def test_a_hold_case_is_409(live_gate, world):
    case = dynamo.get("cases", world["dismiss"])
    case["decision"] = "hold"
    dynamo.put("cases", case)
    status, body = _call("POST", f"/cases/{world['dismiss']}/approve")
    assert status == 409 and "hold" in body["error"] and live_gate.calls == []


def test_an_alert_that_is_not_waiting_yet_is_409(live_gate, world):
    case = dynamo.get("cases", world["alert"])
    del case["approval"]
    dynamo.put("cases", case)
    status, body = _call("POST", f"/cases/{world['alert']}/approve")
    assert status == 409 and body["approval"] is None and live_gate.calls == []


def test_approve_sends_task_success_once_and_the_second_call_is_409(live_gate, world):
    status, body = _call("POST", f"/cases/{world['alert']}/approve")
    assert status == 200, body
    assert body["approval"]["status"] == "approved" and "task_token" not in body["approval"]
    [(kind, token, output)] = live_gate.calls
    assert (kind, token) == ("success", REAL_TOKEN)
    assert output["approved"] is True and output["approver"] == "demo-user"
    stored = dynamo.get("cases", world["alert"])
    assert "task_token" not in stored["approval"] and stored["approval"]["approved_at"]
    assert [a["event"] for a in stored["audit"]].count("approval.approved") == 1
    # single use: again, or the opposite answer, is refused before Step Functions
    for action in ("approve", "reject"):
        status, body = _call("POST", f"/cases/{world['alert']}/{action}")
        assert status == 409 and "already approved" in body["error"]
    assert len(live_gate.calls) == 1


def test_reject_sends_task_failure_and_the_case_is_rejected(live_gate, world):
    status, body = _call("POST", f"/cases/{world['alert']}/reject")
    assert status == 200 and body["approval"]["status"] == "rejected"
    [(kind, token, error, cause)] = live_gate.calls
    assert (kind, token, error) == ("failure", REAL_TOKEN, "Rejected") and "demo-user" in cause
    status, _ = _call("POST", f"/cases/{world['alert']}/approve")
    assert status == 409 and len(live_gate.calls) == 1


def test_two_racing_answers_one_wins(live_gate, world, monkeypatch):
    """The check passed for both, but the conditional write lets exactly one through."""
    token = gate.end_wait(world["alert"], status="approved", at="2026-09-19T10:00:00Z")
    assert token == REAL_TOKEN
    with pytest.raises(gate.TokenGone):
        gate.end_wait(world["alert"], status="rejected", at="2026-09-19T10:00:01Z")
    # and through the API: the case read as waiting, the write lost -> 409, no Step Functions
    case = dynamo.get("cases", world["alert"])
    case["approval"].update(status="waiting", task_token=REAL_TOKEN)
    dynamo.put("cases", case)

    def lost(*_a, **_k):
        raise gate.TokenGone(world["alert"])

    monkeypatch.setattr(gate, "end_wait", lost)
    status, body = _call("POST", f"/cases/{world['alert']}/approve")
    assert status == 409 and "a moment ago" in body["error"] and live_gate.calls == []


def test_a_dead_token_on_approve_expires_the_case(monkeypatch, world):
    case = dynamo.get("cases", world["alert"])
    case["approval"]["task_token"] = REAL_TOKEN
    dynamo.put("cases", case)
    fake = FakeSfn(fail=RuntimeError("TaskTimedOut: Task Timed Out"))
    monkeypatch.setattr(case_api, "is_demo", lambda: False)
    monkeypatch.setattr(case_api, "_sfn_client", lambda: fake)
    status, body = _call("POST", f"/cases/{world['alert']}/approve")
    assert status == 409 and "window has closed" in body["error"]
    stored = dynamo.get("cases", world["alert"])
    assert stored["approval"]["status"] == "expired"
    assert any(a["event"] == "approval.send_failed" for a in stored["audit"])


# --- the approval Lambda --------------------------------------------------------------------


def test_expire_moves_waiting_to_expired_once(world):
    out = approval_lambda.handler({"action": "expire", "case_id": world["alert"]}, None)
    assert out["status"] == "expired"
    stored = dynamo.get("cases", world["alert"])
    assert stored["approval"]["status"] == "expired" and "task_token" not in stored["approval"]
    again = approval_lambda.handler({"action": "expire", "case_id": world["alert"]}, None)
    assert again["status"] == "unchanged"


def test_request_refuses_a_non_alert_or_a_missing_token(world):
    with pytest.raises(ValueError, match="only an alert waits"):
        approval_lambda.handler(
            {"action": "request", "case_id": world["dismiss"], "task_token": "t"}, None
        )
    with pytest.raises(ValueError, match="task_token"):
        approval_lambda.handler({"action": "request", "case_id": world["alert"]}, None)
    with pytest.raises(LookupError):
        approval_lambda.handler(
            {"action": "request", "case_id": "case-nope", "task_token": "t"}, None
        )


# --- demo chain: approve -> claim -> evidence ---------------------------------------------------


@pytest.fixture
def approved(world):
    status, body = _call("POST", f"/cases/{world['alert']}/approve")
    assert status == 200, body
    assert not body["demo_chain"]["claim"]["degraded"], body
    assert not body["demo_chain"]["evidence"]["degraded"], body
    return world


def test_approving_drafts_the_claim_and_seals_the_evidence(approved):
    case = dynamo.get("cases", approved["alert"])
    events = [a["event"] for a in case["audit"]]
    assert events.index("approval.approved") < events.index("claim.drafted")
    assert events.index("claim.drafted") < events.index("evidence.signed")
    status, body = _call("GET", f"/items/{approved['alert_item']}/check-status")
    assert status == 200 and body["status"] == "SUCCEEDED"
    assert {s["name"]: s["state"] for s in body["approval_steps"]} == {
        "WaitForApproval": "done",
        "Claim": "done",
        "Evidence": "done",
    }


def test_the_claim_letter_says_what_it_must(approved):
    case = dynamo.get("cases", approved["alert"])
    text = case["claim_text"]
    assert case["claim_addressee"] == "pharmacy" and "The Pharmacist-in-charge" in text
    assert "batch FT5427" in text and "Forgo Pharmaceuticals" in text
    assert "CDSCO Not of Standard Quality alert for July 2026, row" in text
    assert "failed CDSCO quality test" in text  # the subject line's wording rule
    assert "12 July 2026" in text and "11 days after the notice" in text
    assert "Consumer Protection Act, 2019" in text
    assert "section" not in text.lower()  # a general reference, no section numbers
    # a CDSCO NSQ hit is never a recall (the word, not the product name RecallIndia)
    assert not re.search(r"\brecall(s|ed)?\b", text, flags=re.IGNORECASE)
    assert "safe" not in text.lower().split()
    assert "a refund or a replacement" in text
    assert case["case_id"] in text
    pdf = s3.get_bytes("claims", case["claim_pdf_s3_key"])
    assert pdf.startswith(b"%PDF") and len(pdf) > 1500
    status, body = _call("GET", f"/cases/{approved['alert']}/claim")
    assert status == 200 and body["key"] == case["claim_pdf_s3_key"] and body["url"]


def test_no_sold_after_notice_paragraph_when_bought_before(world):
    case = dynamo.get("cases", world["alert"])
    case["sold_after_notice"] = False
    dynamo.put("cases", case)
    item = dynamo.get("items", f"user#{world['alert_item']}")
    item["purchase_date"] = "2026-06-20"
    dynamo.put("items", item)
    out = claim.handler({"case_id": world["alert"]}, None)
    assert not out["degraded"] and out["sold_after_notice"] is False
    text = dynamo.get("cases", world["alert"])["claim_text"]
    assert "Consumer Protection Act" not in text and "20 June 2026" in text


def test_a_vehicle_letter_goes_to_the_dealer_and_names_the_recall():
    context = claim.letter_context(
        {"case_id": "case-v", "sold_after_notice": False},
        {"kind": "vehicle", "name": "Jeep Compass", "brand": "Jeep", "make": "jeep",
         "model": "compass", "year": 2022},
        {"source": "nhtsa", "notice_id": "24V436000", "published_at": "2024-06-13",
         "url": "https://www.nhtsa.gov/recalls?nhtsaId=24V436000",
         "hazard_or_failed_test": "The rearview image may not display.",
         "remedy": "Dealers will update the radio software, free of charge."},
        "19 September 2026",
    )  # fmt: skip
    text = claim.render_text(context)
    assert context["addressee"] == "dealer" and "Jeep authorised dealer" in text
    assert "NHTSA recall 24V436000" in text and "model year 2022" in text
    assert "Dealers will update the radio software" in text
    assert "Consumer Protection Act" not in text


def test_claim_before_approval_is_404_and_verify_before_evidence_is_409(world):
    assert _call("GET", f"/cases/{world['alert']}/claim")[0] == 404
    assert _call("GET", f"/cases/{world['alert']}/verify-evidence")[0] == 409
    assert _call("GET", "/cases/case-nope/verify-evidence")[0] == 404


# --- evidence -----------------------------------------------------------------------------


def test_evidence_is_the_portal_row_sealed_hashed_and_signed(approved, tmp_path):
    ev = dynamo.get("cases", approved["alert"])["evidence"]
    assert ev["snapshot_kind"] == "portal_row" and ev["content_type"] == "application/json"
    assert ev["object_lock_mode"] == "GOVERNANCE" and ev["kms_key_id"] == signing.DEMO_KEY_ID
    data = s3.get_bytes("evidence", ev["snapshot_s3_key"])
    assert (
        signing.sha256_hex(data)
        == ev["sha256"]
        == ev["snapshot_s3_key"].split("/")[-1][:16] + ev["sha256"][16:]
    )
    snapshot = json.loads(data)
    assert "FT5427" in json.dumps(snapshot["row"]) and "filteredNsqDrugTable" in snapshot["url"]
    retention = json.loads(
        (
            s3._local_path("evidence", ev["snapshot_s3_key"]).with_suffix(".json.retention.json")
        ).read_text()
    )
    assert retention["Mode"] == "GOVERNANCE"
    assert retention["RetainUntilDate"][:10] == ev["object_lock_retain_until"][:10]
    assert signing.verify_digest(bytes.fromhex(ev["sha256"]), ev["signature_b64"], ev["kms_key_id"])
    assert base64.b64decode(ev["signature_b64"])


def test_verify_is_valid_tamper_is_invalid_and_verify_again_is_valid(approved):
    path = f"/cases/{approved['alert']}/verify-evidence"
    status, ok = _call("GET", path)
    assert status == 200 and ok["valid"] is True and ok["sha256"] == ok["recorded_sha256"]
    assert ok["tampered"] is False and ok["demo_control"] is None and ok["signed_at"]
    status, bad = _call("GET", path, qs={"tamper": "1"})
    assert status == 200 and bad["valid"] is False and bad["tampered"] is True
    assert bad["sha256"] != bad["recorded_sha256"] and "demo control" in bad["demo_control"]
    status, again = _call("GET", path)
    assert again["valid"] is True  # nothing stored changed


def test_a_pdf_notice_is_sealed_as_the_pdf_itself(world):
    notice = dynamo.get("notices", dynamo.get("cases", world["alert"])["notice_id"])
    pdf = b"%PDF-1.4 the June alert"
    s3.put_bytes("raw", "cdsco/june.pdf", pdf, "application/pdf")
    notice.update(adapter="cdsco_pdf", pdf_s3_key="cdsco/june.pdf")
    dynamo.put("notices", notice)
    out = evidence.handler({"case_id": world["alert"]}, None)
    assert not out["degraded"] and out["kind"] == "pdf"
    ev = dynamo.get("cases", world["alert"])["evidence"]
    assert ev["content_type"] == "application/pdf" and ev["sha256"] == signing.sha256_hex(pdf)


def test_an_unreachable_source_falls_back_to_the_stored_notice_and_says_so(world, monkeypatch):
    def down(month=None):
        raise RuntimeError("portal down")

    monkeypatch.setattr(evidence, "fetch_portal_rows", down)
    out = evidence.handler({"case_id": world["alert"]}, None)
    assert not out["degraded"] and out["kind"] == "stored_notice"
    assert "portal down" in out["fallback"]
    audit = dynamo.get("cases", world["alert"])["audit"]
    assert (
        audit[-1]["event"] == "evidence.signed" and "portal down" in audit[-1]["detail"]["fallback"]
    )


def test_the_nhtsa_snapshot_is_the_campaign_json():
    url = evidence.source_url({"source": "nhtsa", "notice_id": "24V436000"})
    assert url.endswith("campaignNumber?campaignNumber=24V436000")
    assert evidence.source_url({"source": "cpsc", "notice_id": "10984"}).endswith("RecallID=10984")
    from common.demo_mode import fetch_bytes

    body = json.loads(fetch_bytes(url))
    assert {r["NHTSACampaignNumber"] for r in body["results"]} == {"24V436000"}
