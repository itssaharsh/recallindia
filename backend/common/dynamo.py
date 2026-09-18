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
