"""Notify (SPEC §Match pipeline step 5): case row, item status, events, SES behaviour.

Feeds the state the ASL hands Notify (``$.candidates.item``, ``$.decide``, ``$.run``) straight to
``matcher.notify.handler`` against an isolated demo store; the live-SES tests keep the file
store (``dynamo.is_demo`` patched) while ``DEMO_MODE=0`` makes Notify call the fake client.
"""

from __future__ import annotations

import pytest
from botocore.exceptions import ClientError

from common import dynamo
from common.schemas import Case, Item, Notice
from matcher import notify

NOTICE_PK = "cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713"
EXCERPT = (
    "Paracetamol Tablets IP 650mg | FT5427 | Oct-2025 | Sep-2027 | Forgo Pharmaceuticals, 27, "
    "DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103 | The sample does not "
    "conforms to the I.P. with respect to Dissolution Test. | State Lab | DTL Bikaner | JUL-2026"
)
QUOTE = "Paracetamol Tablets IP 650mg | FT5427"
RUN = {
    "execution_arn": "arn:aws:states:ap-south-1:1:execution:recallindia-match:check-a-1",
    "execution_name": "check-a-1",
    "started_at": "2026-09-19T10:00:00Z",
}
SOURCES = ["cdsco_nsq", "cpsc", "nhtsa", "openfda"]


def _notice() -> dict:
    return Notice(
        pk=NOTICE_PK,
        source="cdsco_nsq",
        notice_id=NOTICE_PK.split("#", 1)[1],
        adapter="cdsco_portal",
        title="Paracetamol Tablets IP 650mg — failed CDSCO quality test, JUL-2026 alert, row 12",
        product="Paracetamol Tablets IP 650mg",
        brand="Forgo Pharmaceuticals",
        batches=["FT5427"],
        hazard_or_failed_test="Dissolution Test",
        published_at="2026-07-01",
        url="https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
        raw_excerpt=EXCERPT,
    ).model_dump()


def _seed(item_id: str = "item-a", *, purchase_date: str | None = "2026-08-01", **over) -> dict:
    dynamo.put("notices", _notice())
    fields = dict(
        kind="medicine",
        name="Paracetamol Tablets IP 650mg",
        brand="Forgo Pharmaceuticals",
        batch="FT5427",
        purchase_date=purchase_date,
        created_at="2026-09-19T09:00:00Z",
    )
    fields.update(over)
    item = Item(pk=Item.make_pk(item_id), item_id=item_id, **fields).model_dump()
    dynamo.put("items", item)
    return item


def _decide(decision: str, **over) -> dict:
    base = {
        "decision": decision,
        "reason": {
            "alert": "batch FT5427 listed; failed CDSCO quality test, JUL-2026 alert, row 12",
            "hold": "serial format not understood",
            "dismiss": "batch FT5428 not in listed batches [FT5427]",
            "clear": "no match in 4 sources as of 2026-09-19T10:00:05Z",
        }[decision],
        "notice_pk": None if decision == "clear" else NOTICE_PK,
        "quoted_sentence": "" if decision == "clear" else QUOTE,
        "confidence": 0.0 if decision == "clear" else 0.93,
        "verifier": "none" if decision == "clear" else "deterministic",
        "covers_item": None if decision == "clear" else True,
        "range_check": None
        if decision in ("clear", "hold")
        else {
            "inside": decision == "alert",
            "listed": "[FT5427]",
            "yours": "FT5427" if decision == "alert" else "FT5428",
            "kind": "batch",
        },
        "candidates_considered": 0 if decision == "clear" else 1,
        "degraded": False,
    }
    base.update(over)
    return base


def _state(item: dict, decide: dict, *, candidates: bool = True) -> dict:
    state = {"item_id": item["item_id"], "run": dict(RUN), "decide": decide}
    if candidates:
        state["candidates"] = {
            "item": dict(item),
            "item_id": item["item_id"],
            "candidates": [] if decide["decision"] == "clear" else [{"notice_pk": NOTICE_PK}],
            "count": 0 if decide["decision"] == "clear" else 1,
            "sources_searched": SOURCES,
            "searched_at": "2026-09-19T10:00:05Z",
            "degraded": False,
        }
    return state


def _events() -> list[dict]:
    rows, _ = dynamo.query_rk("event", limit=100)
    return rows


def _item(item_id: str = "item-a") -> dict:
    return dynamo.get("items", Item.make_pk(item_id))


# --- alert -----------------------------------------------------------------------------


def test_alert_writes_case_item_and_events():
    item = _seed()
    out = notify.handler(_state(item, _decide("alert")), None)
    assert out["degraded"] is False and out["decision"] == "alert" and out["status"] == "alert"
    assert out["item_id"] == "item-a" and out["case_id"].startswith("case-")
    assert out["email"] == {"sent": False, "error": "DEMO_MODE: SES not called"}

    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    Case.model_validate(case)  # round-trips through the schema
    assert case["pk"] == case["case_id"] == out["case_id"] and case["rk"] == "case"
    assert case["item_id"] == "item-a" and case["notice_id"] == NOTICE_PK
    assert case["decision"] == "alert" and case["reason"].startswith("batch FT5427 listed")
    assert case["quoted_sentence"] == QUOTE
    assert case["range_check"] == {"listed": "[FT5427]", "yours": "FT5427", "inside": True}
    assert case["sold_after_notice"] is True
    assert case["verifier"] == "deterministic" and case["confidence"] == 0.93
    assert case["covers_item"] is True and case["reasoning"] == case["reason"]
    assert case["execution_arn"] == RUN["execution_arn"]
    assert case["created_at"] == case["ts"] and case["ts"].endswith("Z")
    assert [a["event"] for a in case["audit"]] == [
        "case.created",
        "decision.alert",
        "email.skipped",
    ]
    assert case["audit"][0]["detail"] == {
        "decision": "alert",
        "verifier": "deterministic",
        "notice_pk": NOTICE_PK,
    }
    assert case["audit"][1]["detail"] == {"reason": case["reason"]}
    assert all(a["ts"] for a in case["audit"])

    stored = _item()
    assert stored["status"] == "alert" and stored["case_id"] == out["case_id"]
    assert stored["last_checked_at"] == case["created_at"]
    assert stored["created_at"] == "2026-09-19T09:00:00Z"  # untouched fields survive

    events = _events()
    by_type = {e["type"]: e for e in events}
    assert set(by_type) == {"case.alert", "email.skipped"}
    alert = by_type["case.alert"]
    assert alert["event_id"] == out["event_id"] and alert["pk"] == f"events#{out['event_id']}"
    assert alert["item_id"] == "item-a" and alert["case_id"] == out["case_id"]
    assert alert["decision"] == "alert"
    assert alert["message"] == (
        "Paracetamol Tablets IP 650mg: Paracetamol Tablets IP 650mg — failed CDSCO quality "
        "test, JUL-2026 alert, row 12"
    )
    assert ("recall" + "ed") not in alert["message"].lower()
    skipped = by_type["email.skipped"]
    assert skipped["event_id"] == out["email_event_id"] and skipped["case_id"] == out["case_id"]
    assert "DEMO_MODE" in skipped["message"]


@pytest.mark.parametrize(
    ("purchase_date", "expected"),
    [("2026-08-01", True), ("2026-06-01", False), ("2026-07-01", False), (None, False)],
)
def test_sold_after_notice_is_a_date_compare(purchase_date, expected):
    item = _seed(purchase_date=purchase_date)
    out = notify.handler(_state(item, _decide("alert")), None)
    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    assert case["sold_after_notice"] is expected


# --- hold / dismiss / clear ------------------------------------------------------------


def test_hold_writes_case_and_holds_the_item():
    item = _seed()
    out = notify.handler(_state(item, _decide("hold", covers_item=None, confidence=0.4)), None)
    assert out["decision"] == "hold" and out["status"] == "hold" and out["degraded"] is False
    assert out["email"] == {"sent": False, "error": None} and out["email_event_id"] is None
    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    assert case["decision"] == "hold" and case["range_check"] is None
    assert case["covers_item"] is None and case["confidence"] == 0.4
    assert [a["event"] for a in case["audit"]] == ["case.created", "decision.hold"]
    stored = _item()
    assert stored["status"] == "hold" and stored["case_id"] == out["case_id"]
    events = _events()
    assert [e["type"] for e in events] == ["case.hold"]
    assert events[0]["message"] == (
        "Paracetamol Tablets IP 650mg: on hold — serial format not understood"
    )


def test_dismiss_leaves_item_clear_but_keeps_case_id():
    item = _seed(batch="FT5428")
    out = notify.handler(_state(item, _decide("dismiss")), None)
    assert out["decision"] == "dismiss" and out["status"] == "clear"
    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    assert case["decision"] == "dismiss"
    assert case["reason"] == "batch FT5428 not in listed batches [FT5427]"
    assert case["range_check"] == {"listed": "[FT5427]", "yours": "FT5428", "inside": False}
    stored = _item()
    assert stored["status"] == "clear" and stored["case_id"] == out["case_id"]
    events = _events()
    assert [e["type"] for e in events] == ["case.dismiss"]
    assert events[0]["message"] == (
        "Paracetamol Tablets IP 650mg: dismissed — batch FT5428 not in listed batches [FT5427]"
    )
    assert events[0]["decision"] == "dismiss" and events[0]["case_id"] == out["case_id"]


def test_clear_writes_no_case_and_resets_case_id():
    item = _seed(case_id="case-old", status="hold")
    out = notify.handler(_state(item, _decide("clear")), None)
    assert out == {
        "case_id": None,
        "item_id": "item-a",
        "decision": "clear",
        "status": "clear",
        "email": {"sent": False, "error": None},
        "event_id": out["event_id"],
        "email_event_id": None,
        "notice_pk": None,
        "degraded": False,
    }
    assert [r for r in dynamo.scan_all("cases") if r.get("rk") == "case"] == []
    stored = _item()
    assert stored["status"] == "clear" and stored["case_id"] is None
    assert stored["last_checked_at"]
    events = _events()
    assert len(events) == 1 and events[0]["type"] == "item.clear"
    assert events[0]["message"].startswith("no match in 4 sources as of 2026-09-19T10:00:05Z")
    assert events[0]["decision"] == "clear" and events[0]["case_id"] is None
    assert events[0]["item_id"] == "item-a"
    assert "safe" not in events[0]["message"]


def test_clear_without_a_reason_words_it_from_candidates():
    item = _seed()
    out = notify.handler(_state(item, _decide("clear", reason="")), None)
    message = _events()[0]["message"]
    assert message == "no match in 4 sources as of 2026-09-19T10:00:05Z"
    assert out["decision"] == "clear"


# --- HoldUnavailable (no $.candidates) ------------------------------------------------


def test_hold_unavailable_loads_the_item_by_id():
    item = _seed()
    decide = {
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
    state = {
        "item_id": item["item_id"],
        "run": dict(RUN),
        "error": {"Error": "Lambda.Unknown", "Cause": "Task timed out"},
        "decide": decide,
    }
    out = notify.handler(state, None)
    assert out["degraded"] is False and out["decision"] == "hold" and out["status"] == "hold"
    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    assert case["notice_id"] == "" and case["reason"] == "verification unavailable"
    assert case["verifier"] == "none" and case["range_check"] is None
    assert case["sold_after_notice"] is False and case["confidence"] == 0.0
    stored = _item()
    assert stored["status"] == "hold" and stored["case_id"] == out["case_id"]
    assert _events()[0]["message"].endswith("on hold — verification unavailable")


def test_missing_item_or_decide_is_degraded_not_raised():
    out = notify.handler({}, None)
    assert out["degraded"] is True and "decide" in out["error"] and out["case_id"] is None
    out = notify.handler({"item_id": "ghost", "decide": _decide("alert")}, None)
    assert out["degraded"] is True and "ghost" in out["error"]
    out = notify.handler({"item_id": "x", "decide": {"decision": "maybe"}}, None)
    assert out["degraded"] is True
    assert _events() == [] and dynamo.scan_all("cases") == []
    assert notify.handler(None, None)["degraded"] is True


def test_alert_without_notice_row_still_records_the_case():
    item = _seed()
    dynamo.delete("notices", NOTICE_PK)
    out = notify.handler(_state(item, _decide("alert")), None)
    assert out["degraded"] is False and out["decision"] == "alert"
    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    assert case["notice_id"] == NOTICE_PK and case["sold_after_notice"] is False
    alert = next(e for e in _events() if e["type"] == "case.alert")
    assert alert["message"].startswith("Paracetamol Tablets IP 650mg: batch FT5427 listed")


def test_case_id_format():
    case_id = notify.new_case_id("2026-09-19T10:00:00Z")
    assert case_id.startswith("case-20260919100000-") and len(case_id) == len("case-") + 14 + 1 + 6


# --- SES (live mode, fake client) -----------------------------------------------------


class _FakeSes:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.calls: list[dict] = []

    def send_email(self, **kw):
        self.calls.append(kw)
        if self.error is not None:
            raise self.error
        return {"MessageId": "0100019-fake"}


@pytest.fixture
def live_store(monkeypatch):
    """DEMO_MODE=0 for Notify (so SES is attempted) while the tables stay in the file store."""
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setattr(dynamo, "is_demo", lambda: True)
    monkeypatch.setenv("NOTIFY_EMAIL", "demo@example.com")


def _rejected() -> ClientError:
    return ClientError(
        {
            "Error": {
                "Code": "MessageRejected",
                "Message": "Email address is not verified. The following identities failed "
                "the check in region AP-SOUTH-1: demo@example.com",
            }
        },
        "SendEmail",
    )


def test_live_ses_message_rejected_is_skipped_not_raised(live_store, monkeypatch):
    fake = _FakeSes(error=_rejected())
    monkeypatch.setattr(notify, "_ses_client", lambda: fake)
    item = _seed()
    out = notify.handler(_state(item, _decide("alert")), None)
    assert out["degraded"] is False and out["decision"] == "alert"
    assert out["email"]["sent"] is False
    assert "MessageRejected" in out["email"]["error"] and "not verified" in out["email"]["error"]
    assert len(fake.calls) == 1
    types = sorted(e["type"] for e in _events())
    assert types == ["case.alert", "email.skipped"]
    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    assert case["audit"][-1]["event"] == "email.skipped"
    assert "MessageRejected" in case["audit"][-1]["detail"]["error"]


def test_live_ses_success_records_email_sent(live_store, monkeypatch):
    fake = _FakeSes()
    monkeypatch.setattr(notify, "_ses_client", lambda: fake)
    item = _seed()
    out = notify.handler(_state(item, _decide("alert")), None)
    assert out["email"] == {"sent": True, "error": None}
    call = fake.calls[0]
    assert call["Source"] == "demo@example.com"
    assert call["Destination"] == {"ToAddresses": ["demo@example.com"]}
    subject = call["Message"]["Subject"]["Data"]
    assert subject == (
        "[RecallIndia] Paracetamol Tablets IP 650mg — cdsco_nsq JUL-2026-cdsco_portal-b75cfffe3713"
    )
    body = call["Message"]["Body"]["Text"]["Data"]
    assert QUOTE in body and "[FT5427]" in body and out["case_id"] in body
    assert "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug" in body
    assert "sold after notice" in body
    assert ("recall" + "ed") not in body.lower() and " safe" not in body.lower()
    by_type = {e["type"]: e for e in _events()}
    assert set(by_type) == {"case.alert", "email.sent"}
    assert by_type["email.sent"]["detail"]["message_id"] == "0100019-fake"
    case = dynamo.get("cases", Case.make_pk(out["case_id"]))
    assert case["audit"][-1]["event"] == "email.sent"


def test_live_missing_notify_email_is_skipped(live_store, monkeypatch):
    monkeypatch.delenv("NOTIFY_EMAIL", raising=False)
    monkeypatch.setattr(notify, "_ses_client", lambda: pytest.fail("must not be called"))
    item = _seed()
    out = notify.handler(_state(item, _decide("alert")), None)
    assert out["degraded"] is False
    assert out["email"] == {"sent": False, "error": "NOTIFY_EMAIL not set"}
    assert sorted(e["type"] for e in _events()) == ["case.alert", "email.skipped"]


def test_live_hold_and_dismiss_never_email(live_store, monkeypatch):
    monkeypatch.setattr(notify, "_ses_client", lambda: pytest.fail("must not be called"))
    item = _seed()
    for decision in ("hold", "dismiss", "clear"):
        out = notify.handler(_state(item, _decide(decision)), None)
        assert out["email"] == {"sent": False, "error": None}, decision
    assert not any(e["type"].startswith("email.") for e in _events())
