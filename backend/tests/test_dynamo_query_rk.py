"""dynamo.query_rk: demo ordering + cursor over the cases store, and the live GSI Query (moto).

Also pins the P04 schema additions the index relies on: ``Case.rk``/``ts`` (filled from
``created_at``), ``Case.make_pk``, ``Event`` and ``Item.last_check_*``.
"""

from __future__ import annotations

import os
import re

import boto3
import pytest
from moto import mock_aws
from pydantic import ValidationError

from common import dynamo
from common.dynamo import RK_INDEX, query_rk
from common.schemas import Case, Event, Item

_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_EVENT_ID = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z-[0-9a-f]{6}$")


def _case(case_id: str, ts: str, **extra) -> dict:
    fields = {
        "case_id": case_id,
        "pk": Case.make_pk(case_id),
        "item_id": "i1",
        "notice_id": "cdsco_nsq#JUL-2026-cdsco_portal-abc",
        "decision": "hold",
        "reason": "verification unavailable",
        "created_at": ts,
        **extra,
    }
    return Case(**fields).model_dump()


def _event(event_id: str, ts: str, **extra) -> dict:
    extra.setdefault("type", "check.started")
    extra.setdefault("message", "check started")
    return Event(pk=Event.make_pk(event_id), event_id=event_id, ts=ts, **extra).model_dump()


def _seed(put) -> None:
    for row in (
        _case("c1", "2026-09-19T10:00:00Z"),
        _case("c2", "2026-09-19T10:00:00Z", decision="alert", reason="batch FT5427 listed"),
        _case("c3", "2026-09-19T09:00:00Z"),
        _case("c4", "2026-09-18T09:00:00Z"),
        _event("2026-09-19T10:00:05Z-aaaaaa", "2026-09-19T10:00:05Z", type="case.hold"),
        _event("2026-09-19T09:59:00Z-bbbbbb", "2026-09-19T09:59:00Z"),
        _event(
            "2026-09-17T00:00:00Z-cccccc",
            "2026-09-17T00:00:00Z",
            type="item.clear",
            decision="clear",
            item_id="i2",
            message="no match in 5 sources as of 2026-09-17T00:00:00Z",
        ),
        # rows the GSI never holds: no rk, or rk without a ts
        {"pk": "legacy-case", "item_id": "i0", "decision": "dismiss"},
        {"pk": "half-row", "rk": "case"},
    ):
        put(row)


def _page_through(rk: str, *, limit: int, since: str | None = None, ascending: bool = False):
    pks, cursor, pages = [], None, 0
    while True:
        items, cursor = query_rk(
            rk, since=since, limit=limit, exclusive_start_key=cursor, ascending=ascending
        )
        pages += 1
        pks.extend(n["pk"] for n in items)
        assert len(items) <= limit
        if cursor is None:
            return pks, pages
        assert len(items) == limit  # only a full page carries a key
        assert set(cursor) == {"pk", "rk", "ts"}
        assert cursor["pk"] == items[-1]["pk"] and cursor["rk"] == rk
        assert pages < 50


# --- schemas the index relies on -----------------------------------------------------


def test_case_pk_rk_ts_and_new_fields() -> None:
    assert Case.make_pk("case-1") == "case-1"
    case = _case("c9", "2026-09-19T10:00:00Z", verifier="bedrock", confidence=0.93)
    assert case["rk"] == "case" and case["ts"] == "2026-09-19T10:00:00Z"
    assert case["verifier"] == "bedrock" and case["confidence"] == 0.93
    assert case["reasoning"] is None and case["covers_item"] is None
    assert case["execution_arn"] is None
    assert Case.model_validate(case).model_dump() == case
    # ts given explicitly wins; a blank ts is filled from created_at, else from now
    assert Case.model_validate({**case, "ts": "2026-01-01T00:00:00Z"}).ts == "2026-01-01T00:00:00Z"
    no_created = Case.model_validate({**case, "created_at": None, "ts": "  "})
    assert _TS.match(no_created.ts)
    with pytest.raises(ValidationError):
        Case.model_validate({**case, "rk": "event"})
    with pytest.raises(ValidationError):
        Case.model_validate({**case, "decision": "clear"})  # a case is never "clear"
    with pytest.raises(ValidationError):
        Case.model_validate({**case, "verifier": "model"})


def test_event_schema() -> None:
    assert Event.make_pk("2026-09-19T10:00:00Z-abcdef") == "events#2026-09-19T10:00:00Z-abcdef"
    assert _EVENT_ID.match(Event.new_event_id())
    assert Event.new_event_id("2026-09-19T10:00:00Z").startswith("2026-09-19T10:00:00Z-")
    assert Event.new_event_id() != Event.new_event_id()
    event = _event("2026-09-19T10:00:00Z-abcdef", "2026-09-19T10:00:00Z", decision="clear")
    assert event["rk"] == "event" and event["decision"] == "clear"
    assert event["item_id"] is None and event["case_id"] is None and event["detail"] is None
    assert Event.model_validate(event).model_dump() == event
    with pytest.raises(ValidationError):
        Event.model_validate({**event, "decision": "maybe"})
    with pytest.raises(ValidationError):
        Event.model_validate({**event, "extra": 1})
    with pytest.raises(ValidationError):
        Event(pk="events#x", event_id="x", type="t", message="m")  # ts is required


def test_item_last_check_fields() -> None:
    item = Item(pk=Item.make_pk("i1"), item_id="i1", kind="medicine", name="Dolo 650")
    assert item.last_check_arn is None and item.last_check_at is None
    assert item.last_checked_at is None
    started = item.model_copy(
        update={"last_check_arn": "arn:aws:states:ap-south-1:1:execution:m:x", "last_check_at": "t"}
    )
    assert Item.model_validate(started.model_dump()) == started


# --- demo (file store) -------------------------------------------------------------


def test_demo_newest_first_total_order_and_since() -> None:
    _seed(lambda r: dynamo.put("cases", r))
    items, last = query_rk("case")
    assert [c["pk"] for c in items] == ["c2", "c1", "c3", "c4"]  # (ts desc, pk desc)
    assert last is None
    assert all(c["rk"] == "case" for c in items)
    items, _ = query_rk("case", since="2026-09-19T00:00:00Z")
    assert [c["pk"] for c in items] == ["c2", "c1", "c3"]
    items, _ = query_rk("case", ascending=True)
    assert [c["pk"] for c in items] == ["c4", "c3", "c1", "c2"]
    events, last = query_rk("event")
    assert [e["event_id"] for e in events] == [
        "2026-09-19T10:00:05Z-aaaaaa",
        "2026-09-19T09:59:00Z-bbbbbb",
        "2026-09-17T00:00:00Z-cccccc",
    ]
    assert last is None
    assert events[-1]["message"] == "no match in 5 sources as of 2026-09-17T00:00:00Z"
    assert query_rk("nothing") == ([], None)
    # events written after the last check are what the timeline polls for
    since_events, _ = query_rk("event", since="2026-09-19T10:00:00Z")
    assert [e["type"] for e in since_events] == ["case.hold"]


def test_demo_cursor_pages_through_every_row_once() -> None:
    _seed(lambda r: dynamo.put("cases", r))
    items, last = query_rk("case", limit=2)
    assert [c["pk"] for c in items] == ["c2", "c1"]
    assert last == {"pk": "c1", "rk": "case", "ts": "2026-09-19T10:00:00Z"}
    items, last = query_rk("case", limit=2, exclusive_start_key=last)
    assert [c["pk"] for c in items] == ["c3", "c4"]
    # a full page always carries a key (as on DynamoDB); the trailing page is empty
    assert last == {"pk": "c4", "rk": "case", "ts": "2026-09-18T09:00:00Z"}
    items, last = query_rk("case", limit=2, exclusive_start_key=last)
    assert items == [] and last is None

    pks, pages = _page_through("case", limit=3)
    assert pks == ["c2", "c1", "c3", "c4"] and pages == 2
    pks, pages = _page_through("case", limit=1, since="2026-09-19T00:00:00Z")
    assert pks == ["c2", "c1", "c3"]
    assert pages == 4  # 3 full pages + the trailing empty one (rows == k * limit)
    pks, _ = _page_through("case", limit=2, ascending=True)
    assert pks == ["c4", "c3", "c1", "c2"]
    pks, pages = _page_through("event", limit=2)
    assert len(pks) == 3 and pages == 2
    # a cursor pointing at a row that is not in the store still positions correctly
    items, _ = query_rk(
        "case", exclusive_start_key={"pk": "c15", "rk": "case", "ts": "2026-09-19T10:00:00Z"}
    )
    assert [c["pk"] for c in items] == ["c1", "c3", "c4"]
    assert query_rk("case", limit=0)[0] == [query_rk("case")[0][0]]  # limit is clamped to 1


def test_demo_many_events_page_completely() -> None:
    for i in range(250):
        ts = f"2026-09-19T{i // 60:02d}:{i % 60:02d}:00Z"
        dynamo.put("cases", _event(f"{ts}-{i:06x}", ts))
    pks, pages = _page_through("event", limit=100)
    assert len(pks) == len(set(pks)) == 250 and pages == 3
    newest, _ = query_rk("event", limit=1)
    assert newest[0]["ts"] == "2026-09-19T04:09:00Z"


# --- live (moto DynamoDB with the template's GSI) -----------------------------------


@pytest.fixture
def live_table(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("CASES_TABLE", "recallindia-cases-test")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    dynamo.reset_clients()
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-south-1")
        table = ddb.create_table(
            TableName="recallindia-cases-test",
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "rk", "AttributeType": "S"},
                {"AttributeName": "ts", "AttributeType": "S"},
            ],
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": RK_INDEX,
                    "KeySchema": [
                        {"AttributeName": "rk", "KeyType": "HASH"},
                        {"AttributeName": "ts", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
        )
        yield table
    dynamo.reset_clients()


def test_live_query_rk_uses_the_gsi_newest_first_with_cursor(live_table, monkeypatch) -> None:
    assert os.environ["DEMO_MODE"] == "0"
    _seed(lambda r: dynamo.put("cases", r))
    seen: list[dict] = []
    real = live_table.query

    def spy(**kwargs):
        seen.append(kwargs)
        return real(**kwargs)

    monkeypatch.setattr(dynamo._table("cases"), "query", spy)

    cases, last = query_rk("case", limit=100)
    assert len(cases) == 4 and last is None
    assert [c["ts"] for c in cases] == sorted((c["ts"] for c in cases), reverse=True)
    assert {c["pk"] for c in cases} == {"c1", "c2", "c3", "c4"}
    assert cases[-1]["pk"] == "c4"
    assert seen and all(k["IndexName"] == RK_INDEX for k in seen)
    assert seen[0]["ScanIndexForward"] is False and seen[0]["Limit"] == 100

    since, _ = query_rk("case", since="2026-09-19T00:00:00Z")
    assert {c["pk"] for c in since} == {"c1", "c2", "c3"}
    events, _ = query_rk("event")
    assert [e["type"] for e in events] == ["case.hold", "check.started", "item.clear"]
    assert events[-1]["decision"] == "clear"

    pks, pages = _page_through("case", limit=2)
    assert len(pks) == 4 and len(set(pks)) == 4 and pages >= 2
    asc, _ = _page_through("case", limit=3, ascending=True)
    assert asc[0] == "c4" and set(asc[-2:]) == {"c1", "c2"}
    assert query_rk("nothing") == ([], None)
