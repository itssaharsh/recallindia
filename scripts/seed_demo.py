#!/usr/bin/env python3
"""Seed the 15-item demo world (SPEC.md §Demo world): 1 alert, 1 near-miss, 1 vehicle, 12 clear.

Usage (from the repo root)::

    python scripts/seed_demo.py --mock [--reset]     # local DEMO_MODE store, no credentials
    python scripts/seed_demo.py --live [--reset]     # DynamoDB via AWS_PROFILE=firstcommit

The alert item is pinned to a real CDSCO row: "Paracetamol Tablets IP 650mg", Forgo
Pharmaceuticals, batch FT5427 (July 2026 alert). Its ``purchase_date`` is the notice's
``published_at`` + 11 days, so the case reads "sold after notice". ``--reset`` deletes items,
cases and events first and NEVER notices. Item ids are fixed (``demo-alert`` ...), so seeding
twice is idempotent. Rules decide: nothing here calls a model.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
for extra in (REPO_ROOT / "backend", Path(__file__).resolve().parent):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

import demo_world  # noqa: E402  (after the sys.path setup above)

RESETTABLE = ("items", "cases")  # the cases table also holds events; notices are never touched


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="seed_demo.py", description=__doc__.split("\n\n")[0])
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--mock", action="store_true", help="DEMO_MODE=1: local store, fixtures")
    mode.add_argument("--live", action="store_true", help="the deployed stack's DynamoDB tables")
    p.add_argument("--reset", action="store_true", help="delete items, cases and events first")
    p.add_argument("--stack", default=os.environ.get("STACK_NAME") or "recallindia")
    p.add_argument("--profile", default=os.environ.get("AWS_PROFILE") or "firstcommit")
    return p


def reset(dynamo) -> dict[str, int]:
    """Delete every row of the items and cases tables (cases + events). Never notices."""
    deleted: dict[str, int] = {}
    for kind in RESETTABLE:
        assert kind in ("items", "cases"), kind  # a typo must never reach the notices table
        rows = dynamo.scan_all(kind, limit=5000)
        for row in rows:
            dynamo.delete(kind, row["pk"])
        deleted[kind] = len(rows)
    return deleted


def find_alert_notice(dynamo) -> dict | None:
    for notice in dynamo.query_brand(demo_world.ALERT_BRAND_LC, limit=100):
        if demo_world.ALERT_BATCH in (notice.get("batches") or []):
            return notice
    return None


def load_fixture_notices() -> None:
    """Mock only: fill the local store from the saved portal + NHTSA responses."""
    from pollers import cdsco_portal, nhtsa

    cdsco_portal.handler({}, None)
    nhtsa.handler({}, None)


def seed(mock: bool) -> list[dict]:
    from common import dynamo
    from common.notices import now_iso
    from common.schemas import Item

    notice = find_alert_notice(dynamo)
    if notice is None and mock:
        load_fixture_notices()
        notice = find_alert_notice(dynamo)
    if notice is None:
        raise SystemExit(
            "seed_demo: no cdsco_nsq notice lists batch "
            f"{demo_world.ALERT_BATCH} for {demo_world.ALERT_BRAND_LC!r}. "
            "Run the portal backfill first: make backfill SOURCE=cdsco_portal YEARS=1"
        )
    published = dt.date.fromisoformat(str(notice["published_at"])[:10])
    purchase = (published + dt.timedelta(days=demo_world.PURCHASE_OFFSET_DAYS)).isoformat()

    written: list[dict] = []
    for entry in demo_world.DEMO_ITEMS:
        fields = demo_world.item_fields(entry)
        if entry is demo_world.ALERT:
            fields["purchase_date"] = purchase
        item = Item(pk=Item.make_pk(fields["item_id"]), created_at=now_iso(), **fields)
        dynamo.put("items", item.model_dump())
        written.append(
            {**entry, **fields, "notice_pk": notice["pk"], "published_at": str(published)}
        )
    return written


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.mock:
        os.environ["DEMO_MODE"] = "1"
        where = f"mock (local store {os.environ.get('DEMO_STORE_DIR') or '.demo_store'})"
    else:
        from _live import SetupError, configure_live

        try:
            outputs = configure_live(args.stack, args.profile)
        except SetupError as exc:
            print(f"seed_demo: {exc}", file=sys.stderr)
            return 2
        where = f"live (profile {args.profile}, table {outputs['ItemsTableName']})"
    print(f"seed_demo: mode={where}")

    from common import dynamo

    if args.reset:
        deleted = reset(dynamo)
        print(f"seed_demo: reset deleted items={deleted['items']} cases+events={deleted['cases']}")

    written = seed(args.mock)
    alert = written[0]
    print(
        f"seed_demo: alert notice {alert['notice_pk']} published {alert['published_at']} -> "
        f"purchase_date {alert['purchase_date']} (+{demo_world.PURCHASE_OFFSET_DAYS} days)\n"
    )
    print(f"{'item_id':16s} {'expected':15s} {'kind':10s} {'identifier':12s} name")
    for w in written:
        ident = w.get("batch") or (str(w["year"]) if w.get("year") else "-")
        expected = "alert or hold" if w["expected"] == "vehicle" else w["expected"]
        print(f"{w['item_id']:16s} {expected:15s} {w['kind']:10s} {ident:12s} {w['name']}")
    print(
        f"\nseed_demo: wrote {len(written)} items. Next: scripts/validate.py "
        f"{'--mock' if args.mock else '--live'}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
