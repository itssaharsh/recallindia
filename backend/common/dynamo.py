"""DynamoDB access for the ``notices`` / ``items`` / ``cases`` tables.

Demo mode keeps each table as a JSON file ``DEMO_STORE_DIR/<kind>.json`` mapping pk -> item,
written atomically; live mode uses ``boto3.resource("dynamodb")``. boto3 is imported lazily
so demo mode needs neither credentials nor the network.
"""

from __future__ import annotations

import json
import os
import tempfile
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from common.demo_mode import demo_store_dir, is_demo

TableKind = Literal["notices", "items", "cases"]
BRAND_INDEX = "brand_lc-index"
# GSI (HASH source, RANGE published_at): the public API's newest-first, paginated per-source
# query. Meta / ingest-run rows have no published_at, so the index never contains them.
SOURCE_INDEX = "source-published_at-index"
# Cases-table GSI (HASH rk, RANGE ts): one newest-first listing per row kind -- ``rk = "case"``
# (Case rows, pk = case_id) and ``rk = "event"`` (Event rows, pk = events#<event_id>) -- for
# GET /events and the /mine timeline (``query_rk``).
RK_INDEX = "rk-ts-index"
# items and cases: one partition per household (sparse; rows without the key are invisible)
HOUSEHOLD_INDEX = "household_id-index"


def table_name(kind: TableKind) -> str:
    """Physical table name from ``NOTICES_TABLE`` / ``ITEMS_TABLE`` / ``CASES_TABLE``."""
    return os.environ.get(f"{kind.upper()}_TABLE") or f"recallindia-{kind}"


# --- demo store -----------------------------------------------------------------


def _store_path(kind: TableKind) -> Path:
    return demo_store_dir() / f"{kind}.json"


def _load(kind: TableKind) -> dict[str, dict]:
    path = _store_path(kind)
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _save(kind: TableKind, data: dict[str, dict]) -> None:
    path = _store_path(kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{kind}.", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1, default=_json_default)
    os.replace(tmp, path)


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


# --- live -----------------------------------------------------------------------


def _region() -> str:
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"


# One boto3 resource per region and one Table per (region, name), reused across calls: a poll
# does hundreds of get+put round trips and a fresh client per call would open a new HTTPS
# connection each time.
_RESOURCES: dict[str, Any] = {}
_TABLES: dict[tuple[str, str], Any] = {}


def _table(kind: TableKind) -> Any:
    region, name = _region(), table_name(kind)
    table = _TABLES.get((region, name))
    if table is None:
        import boto3  # lazy: demo mode must not need boto3 credentials

        resource = _RESOURCES.get(region)
        if resource is None:
            resource = _RESOURCES[region] = boto3.resource("dynamodb", region_name=region)
        table = _TABLES[(region, name)] = resource.Table(name)
    return table


def reset_clients() -> None:
    """Drop the cached boto3 resources/tables (tests, or after changing region/table env)."""
    _RESOURCES.clear()
    _TABLES.clear()


def _to_dynamo(item: dict) -> dict:
    """DynamoDB rejects floats; round-trip through JSON to turn them into Decimal."""
    return json.loads(json.dumps(item, default=_json_default), parse_float=Decimal)


# --- public API -----------------------------------------------------------------


def put(kind: TableKind, item: dict) -> None:
    """Upsert ``item`` (must carry ``pk``)."""
    pk = item["pk"]
    if is_demo():
        data = _load(kind)
        data[pk] = json.loads(json.dumps(item, default=_json_default))
        _save(kind, data)
        return
    _table(kind).put_item(Item=_to_dynamo(item))


def get(kind: TableKind, pk: str) -> dict | None:
    """Fetch one item by pk, or None.

    Strongly consistent: ``upsert_notice`` reads then writes the same pk back to back (NHTSA
    sees one campaign under consecutive model years), and an eventually consistent read could
    hand back the pre-merge item and drop a vehicle year.
    """
    if is_demo():
        return _load(kind).get(pk)
    return _table(kind).get_item(Key={"pk": pk}, ConsistentRead=True).get("Item")


def delete(kind: TableKind, pk: str) -> None:
    """Delete one item by pk (no-op when absent)."""
    if is_demo():
        data = _load(kind)
        if data.pop(pk, None) is not None:
            _save(kind, data)
        return
    _table(kind).delete_item(Key={"pk": pk})


def query_brand(brand_lc: str, limit: int = 50) -> list[dict]:
    """Notices whose ``brand_lc`` equals ``brand_lc`` (GSI ``brand_lc-index``)."""
    if is_demo():
        rows = [n for n in _load("notices").values() if n.get("brand_lc") == brand_lc]
        return rows[:limit]
    from boto3.dynamodb.conditions import Key

    resp = _table("notices").query(
        IndexName=BRAND_INDEX, KeyConditionExpression=Key("brand_lc").eq(brand_lc), Limit=limit
    )
    return list(resp.get("Items", []))


def query_household(kind: TableKind, household_id: str, limit: int = 200) -> list[dict]:
    """Items or cases of one household (GSI ``household_id-index``), newest first.

    The wall and the case list are read through this index, never with a scan: a household is
    a partition, so one household's rows cost one query no matter how many households exist.
    """
    if is_demo():
        rows = [
            r
            for r in _load(kind).values()
            if str(r.get("household_id") or "demo") == household_id and r.get("rk") != "event"
        ]
    else:
        from boto3.dynamodb.conditions import Key

        rows = []
        kwargs: dict[str, Any] = {
            "IndexName": HOUSEHOLD_INDEX,
            "KeyConditionExpression": Key("household_id").eq(household_id),
            "Limit": limit,
        }
        while len(rows) < limit:
            resp = _table(kind).query(**kwargs)
            rows.extend(resp.get("Items", []))
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return rows[:limit]


def _source_sort_key(item: dict) -> tuple[str, str]:
    return (str(item.get("published_at", "")), str(item.get("pk", "")))


def _source_items(source: str, since: str | None, until: str | None = None) -> list[dict]:
    """Demo: rows of ``source`` that the GSI would hold (a string published_at), filtered."""
    out = []
    for item in _load("notices").values():
        published = item.get("published_at")
        if item.get("source") != source or not isinstance(published, str) or not published:
            continue
        if since and published < since:
            continue
        if until and published >= until:
            continue
        out.append(item)
    return out


def query_source(
    source: str,
    *,
    since: str | None = None,
    limit: int = 100,
    exclusive_start_key: dict | None = None,
    ascending: bool = False,
    until: str | None = None,
) -> tuple[list[dict], dict | None]:
    """One page of ``source``'s notices from the ``source-published_at-index`` GSI.

    Newest first by default (``published_at`` desc), optionally only those with
    ``published_at >= since`` and, with ``until``, ``published_at < until`` (a date range, so
    a source can be read in parallel slices); ``limit`` items per page. Returns
    ``(items, last_evaluated_key)``
    where the key (``{pk, source, published_at}``) is passed back as ``exclusive_start_key`` to
    continue, and is None once the last page is reached. As on DynamoDB the key is present
    whenever the page is full, so the last page may be empty (``[]``, None).

    Demo mode orders by ``(published_at, pk)`` -- a total order, so a page boundary is
    deterministic -- and positions strictly after the ``exclusive_start_key`` item.
    """
    limit = max(1, int(limit))
    if is_demo():
        items = sorted(
            _source_items(source, since, until), key=_source_sort_key, reverse=not ascending
        )
        if exclusive_start_key:
            start = _source_sort_key(exclusive_start_key)
            if ascending:
                items = [n for n in items if _source_sort_key(n) > start]
            else:
                items = [n for n in items if _source_sort_key(n) < start]
        page = items[:limit]
        last = None
        # DynamoDB returns a LastEvaluatedKey whenever Limit is reached, even when nothing
        # follows -- so a source with k*limit rows answers a trailing empty page. Mirror that
        # (no look-ahead) so live and demo paginate identically.
        if len(page) == limit:
            tail = page[-1]
            last = {
                "pk": tail["pk"],
                "source": tail["source"],
                "published_at": tail["published_at"],
            }
        return page, last
    from boto3.dynamodb.conditions import Key

    condition = Key("source").eq(source)
    if since and until:
        # between is inclusive on both ends; the range key is a date string, so step the upper
        # bound back one character to keep `until` exclusive
        condition = condition & Key("published_at").between(since, _just_before(until))
    elif since:
        condition = condition & Key("published_at").gte(since)
    elif until:
        condition = condition & Key("published_at").lt(until)
    kwargs: dict[str, Any] = {
        "IndexName": SOURCE_INDEX,
        "KeyConditionExpression": condition,
        "ScanIndexForward": ascending,
        "Limit": limit,
    }
    if exclusive_start_key:
        kwargs["ExclusiveStartKey"] = exclusive_start_key
    resp = _table("notices").query(**kwargs)
    return list(resp.get("Items", [])), resp.get("LastEvaluatedKey") or None


def _just_before(text: str) -> str:
    """The greatest string below ``text`` in DynamoDB's byte order (for an exclusive bound)."""
    return text[:-1] + chr(ord(text[-1]) - 1) + "\uffff" if text else text


def count_source(source: str, *, since: str | None = None, max_items: int = 5000) -> int:
    """Number of ``source`` notices (``published_at >= since``), capped at ``max_items``.

    Live: paged ``Select=COUNT`` queries on the GSI (no items transferred) until the last
    page or the cap; demo: a filter over the file store.
    """
    max_items = max(0, int(max_items))
    if is_demo():
        return min(len(_source_items(source, since)), max_items)
    from boto3.dynamodb.conditions import Key

    condition = Key("source").eq(source)
    if since:
        condition = condition & Key("published_at").gte(since)
    table = _table("notices")
    total = 0
    kwargs: dict[str, Any] = {
        "IndexName": SOURCE_INDEX,
        "KeyConditionExpression": condition,
        "Select": "COUNT",
    }
    while total < max_items:
        kwargs["Limit"] = max_items - total
        resp = table.query(**kwargs)
        total += int(resp.get("Count", 0))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return min(total, max_items)


def _rk_sort_key(item: dict) -> tuple[str, str]:
    return (str(item.get("ts", "")), str(item.get("pk", "")))


def _rk_items(rk: str, since: str | None) -> list[dict]:
    """Demo: rows of the cases store the GSI would hold (that ``rk``, a string ``ts``)."""
    out = []
    for item in _load("cases").values():
        ts = item.get("ts")
        if item.get("rk") != rk or not isinstance(ts, str) or not ts:
            continue
        if since and ts < since:
            continue
        out.append(item)
    return out


def query_rk(
    rk: str,
    *,
    since: str | None = None,
    limit: int = 100,
    exclusive_start_key: dict | None = None,
    ascending: bool = False,
) -> tuple[list[dict], dict | None]:
    """One page of the cases table's ``rk`` rows (``"case"`` | ``"event"``) from ``rk-ts-index``.

    Newest first by default (``ts`` desc), optionally only ``ts >= since``; ``limit`` rows per
    page. Returns ``(items, last_evaluated_key)`` where the key (``{pk, rk, ts}``) is passed
    back as ``exclusive_start_key`` to continue and is None once the last page is reached.
    As on DynamoDB the key is present whenever the page is full, so the last page may be
    empty (``[]``, None) -- the same rule as ``query_source``.

    Demo mode orders by ``(ts, pk)`` -- a total order, so a page boundary is deterministic --
    and positions strictly after the ``exclusive_start_key`` row.
    """
    limit = max(1, int(limit))
    if is_demo():
        items = sorted(_rk_items(rk, since), key=_rk_sort_key, reverse=not ascending)
        if exclusive_start_key:
            start = _rk_sort_key(exclusive_start_key)
            if ascending:
                items = [n for n in items if _rk_sort_key(n) > start]
            else:
                items = [n for n in items if _rk_sort_key(n) < start]
        page = items[:limit]
        last = None
        if len(page) == limit:
            tail = page[-1]
            last = {"pk": tail["pk"], "rk": tail["rk"], "ts": tail["ts"]}
        return page, last
    from boto3.dynamodb.conditions import Key

    condition = Key("rk").eq(rk)
    if since:
        condition = condition & Key("ts").gte(since)
    kwargs: dict[str, Any] = {
        "IndexName": RK_INDEX,
        "KeyConditionExpression": condition,
        "ScanIndexForward": ascending,
        "Limit": limit,
    }
    if exclusive_start_key:
        kwargs["ExclusiveStartKey"] = exclusive_start_key
    resp = _table("cases").query(**kwargs)
    return list(resp.get("Items", [])), resp.get("LastEvaluatedKey") or None


def scan_all(kind: TableKind, limit: int = 500) -> list[dict]:
    """Up to ``limit`` items of a table (paginated scan live; whole file in demo)."""
    if is_demo():
        return list(_load(kind).values())[:limit]
    table = _table(kind)
    items: list[dict] = []
    kwargs: dict[str, Any] = {"Limit": limit}
    while len(items) < limit:
        resp = table.scan(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        kwargs["Limit"] = limit - len(items)
    return items[:limit]
