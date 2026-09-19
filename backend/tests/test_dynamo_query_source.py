"""dynamo.query_source / count_source: demo ordering + cursor, and the live GSI Query (moto)."""

from __future__ import annotations

import os

import boto3
import pytest
from moto import mock_aws

from common import dynamo
from common.dynamo import SOURCE_INDEX, count_source, query_source


def _notice(source: str, nid: str, published: str, **extra) -> dict:
    return {
        "pk": f"{source}#{nid}",
        "source": source,
        "notice_id": nid,
        "published_at": published,
        "brand_lc": "x",
        **extra,
    }


def _seed(put) -> list[dict]:
    rows = [
        _notice("cdsco_nsq", "a", "2026-07-01"),
        _notice("cdsco_nsq", "b", "2026-07-01"),
        _notice("cdsco_nsq", "c", "2026-07-01"),
        _notice("cdsco_nsq", "d", "2026-06-01"),
        _notice("cdsco_nsq", "e", "2026-03-01"),
        _notice("cdsco_nsq", "f", "2025-06-01", row_ref={"page": 1, "row": 1}),
        _notice("cpsc", "z", "2026-08-15"),
    ]
    for r in rows:
        put(r)
    put({"pk": "meta#cdsco_nsq", "source": "cdsco_nsq", "degraded": False})
    put({"pk": "ingest#run-1", "source": "cdsco_nsq", "step": "extract"})
    return rows


def _page_through(source: str, *, limit: int, since: str | None = None, ascending=False):
    pks, cursor, pages = [], None, 0
    while True:
        items, cursor = query_source(
            source, since=since, limit=limit, exclusive_start_key=cursor, ascending=ascending
        )
        pages += 1
        pks.extend(n["pk"] for n in items)
        assert len(items) <= limit
        if cursor is None:
            return pks, pages
        assert len(items) == limit  # only a full page carries a key
        assert set(cursor) == {"pk", "source", "published_at"}
        assert cursor["pk"] == items[-1]["pk"]
        assert pages < 50


# --- demo (file store) ----------------------------------------------------------


def test_demo_newest_first_total_order_and_since() -> None:
    _seed(lambda r: dynamo.put("notices", r))
    items, last = query_source("cdsco_nsq")
    assert [n["pk"] for n in items] == [
        "cdsco_nsq#c",
        "cdsco_nsq#b",
        "cdsco_nsq#a",
        "cdsco_nsq#d",
        "cdsco_nsq#e",
        "cdsco_nsq#f",
    ]
    assert last is None
    assert not any(n["pk"].startswith(("meta#", "ingest#")) for n in items)
    items, _ = query_source("cdsco_nsq", since="2026-07-01")
    assert [n["pk"] for n in items] == ["cdsco_nsq#c", "cdsco_nsq#b", "cdsco_nsq#a"]
    items, _ = query_source("cdsco_nsq", since="2026-06-01", ascending=True)
    assert [n["pk"] for n in items] == ["cdsco_nsq#d", "cdsco_nsq#a", "cdsco_nsq#b", "cdsco_nsq#c"]
    assert query_source("nobody") == ([], None)
    assert query_source("cpsc")[0][0]["pk"] == "cpsc#z"


def test_demo_cursor_pages_through_every_row_once() -> None:
    _seed(lambda r: dynamo.put("notices", r))
    items, last = query_source("cdsco_nsq", limit=2)
    assert [n["pk"] for n in items] == ["cdsco_nsq#c", "cdsco_nsq#b"]
    assert last == {"pk": "cdsco_nsq#b", "source": "cdsco_nsq", "published_at": "2026-07-01"}
    items, last = query_source("cdsco_nsq", limit=2, exclusive_start_key=last)
    assert [n["pk"] for n in items] == ["cdsco_nsq#a", "cdsco_nsq#d"]
    items, last = query_source("cdsco_nsq", limit=2, exclusive_start_key=last)
    assert [n["pk"] for n in items] == ["cdsco_nsq#e", "cdsco_nsq#f"]
    # a full page always carries a key (as on DynamoDB); the trailing page is empty
    assert last == {"pk": "cdsco_nsq#f", "source": "cdsco_nsq", "published_at": "2025-06-01"}
    items, last = query_source("cdsco_nsq", limit=2, exclusive_start_key=last)
    assert items == [] and last is None

    pks, pages = _page_through("cdsco_nsq", limit=4)
    assert pks == [
        "cdsco_nsq#c",
        "cdsco_nsq#b",
        "cdsco_nsq#a",
        "cdsco_nsq#d",
        "cdsco_nsq#e",
        "cdsco_nsq#f",
    ]
    assert pages == 2
    pks, pages = _page_through("cdsco_nsq", limit=1, since="2026-07-01")
    assert pks == ["cdsco_nsq#c", "cdsco_nsq#b", "cdsco_nsq#a"]
    assert pages == 4  # 3 full pages + the trailing empty one (rows == k * limit)
    pks, _ = _page_through("cdsco_nsq", limit=2, ascending=True)
    assert pks == [
        "cdsco_nsq#f",
        "cdsco_nsq#e",
        "cdsco_nsq#d",
        "cdsco_nsq#a",
        "cdsco_nsq#b",
        "cdsco_nsq#c",
    ]
    # a cursor pointing at a row that is not in the store still positions correctly
    items, _ = query_source(
        "cdsco_nsq",
        exclusive_start_key={
            "pk": "cdsco_nsq#bb",
            "source": "cdsco_nsq",
            "published_at": "2026-07-01",
        },
    )
    assert [n["pk"] for n in items] == [
        "cdsco_nsq#b",
        "cdsco_nsq#a",
        "cdsco_nsq#d",
        "cdsco_nsq#e",
        "cdsco_nsq#f",
    ]


def test_demo_count_source() -> None:
    _seed(lambda r: dynamo.put("notices", r))
    assert count_source("cdsco_nsq") == 6
    assert count_source("cdsco_nsq", since="2026-07-01") == 3
    assert count_source("cdsco_nsq", max_items=4) == 4
    assert count_source("cpsc") == 1 and count_source("nobody") == 0


def test_demo_239_july_rows_page_completely() -> None:
    for i in range(239):
        dynamo.put("notices", _notice("cdsco_nsq", f"JUL-2026-cdsco_portal-{i:03d}", "2026-07-01"))
    for i in range(190):
        dynamo.put("notices", _notice("cdsco_nsq", f"MAR-2026-cdsco_portal-{i:03d}", "2026-03-01"))
    pks, pages = _page_through("cdsco_nsq", limit=100, since="2026-07-01")
    assert len(pks) == len(set(pks)) == 239 and pages == 3
    assert all("JUL-2026" in pk for pk in pks)
    assert count_source("cdsco_nsq", since="2026-07-01") == 239
    assert count_source("cdsco_nsq") == 429


# --- live (moto DynamoDB with the template's GSI) ------------------------------


@pytest.fixture
def live_table(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_REGION", "ap-south-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("NOTICES_TABLE", "recallindia-notices-test")
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    dynamo.reset_clients()
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-south-1")
        table = ddb.create_table(
            TableName="recallindia-notices-test",
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "brand_lc", "AttributeType": "S"},
                {"AttributeName": "source", "AttributeType": "S"},
                {"AttributeName": "published_at", "AttributeType": "S"},
            ],
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "brand_lc-index",
                    "KeySchema": [{"AttributeName": "brand_lc", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": SOURCE_INDEX,
                    "KeySchema": [
                        {"AttributeName": "source", "KeyType": "HASH"},
                        {"AttributeName": "published_at", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
        )
        yield table
    dynamo.reset_clients()


def test_live_query_source_uses_the_gsi_newest_first_with_cursor(live_table) -> None:
    assert os.environ["DEMO_MODE"] == "0"
    _seed(lambda r: dynamo.put("notices", r))
    items, last = query_source("cdsco_nsq", limit=100)
    pks = [n["pk"] for n in items]
    assert len(pks) == 6 and last is None
    assert [n["published_at"] for n in items] == sorted(
        (n["published_at"] for n in items), reverse=True
    )
    assert not any(pk.startswith(("meta#", "ingest#")) for pk in pks)
    assert "cpsc#z" not in pks
    since, _ = query_source("cdsco_nsq", since="2026-07-01")
    assert {n["pk"] for n in since} == {"cdsco_nsq#a", "cdsco_nsq#b", "cdsco_nsq#c"}

    pks, pages = _page_through("cdsco_nsq", limit=2)
    assert len(pks) == 6 and len(set(pks)) == 6 and pages >= 3
    asc, _ = _page_through("cdsco_nsq", limit=4, ascending=True)
    assert asc[0] == "cdsco_nsq#f" and asc[-1] in {"cdsco_nsq#a", "cdsco_nsq#b", "cdsco_nsq#c"}
    assert query_source("nobody") == ([], None)


def test_live_count_source_pages_with_select_count(live_table, monkeypatch) -> None:
    _seed(lambda r: dynamo.put("notices", r))
    assert count_source("cdsco_nsq") == 6
    assert count_source("cdsco_nsq", since="2026-07-01") == 3
    assert count_source("cdsco_nsq", max_items=4) == 4
    assert count_source("nobody") == 0
    seen: list[dict] = []
    real = live_table.query

    def spy(**kwargs):
        seen.append(kwargs)
        return real(**kwargs)

    monkeypatch.setattr(dynamo._table("notices"), "query", spy)
    assert count_source("cdsco_nsq", max_items=2) == 2
    assert seen and all(k["Select"] == "COUNT" and k["IndexName"] == SOURCE_INDEX for k in seen)
    assert "ProjectionExpression" not in seen[0]
