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
import json
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
    p.add_argument(
        "--no-check", action="store_true", help="seed the items but do not run the matcher on them"
    )
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


def stop_paused_checks(machine_arn: str) -> int:
    """Live reset: stop match executions still running -- in practice paused at WaitForApproval.

    Their cases are deleted with the rest of the demo world; left alone each would wait out the
    24 h approval timeout for a case that no longer exists.
    """
    import boto3

    sfn = boto3.client("stepfunctions")
    stopped = 0
    pages = sfn.get_paginator("list_executions").paginate(
        stateMachineArn=machine_arn, statusFilter="RUNNING"
    )
    for page in pages:
        for execution in page.get("executions", []):
            sfn.stop_execution(
                executionArn=execution["executionArn"],
                cause="seed_demo --reset: the demo world was re-seeded",
            )
            stopped += 1
    return stopped


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


def waiting_cases(skip: set[str]) -> list[tuple[str, str]]:
    """The demo household's cases that are still waiting for a human, as (case_id, item_id)."""
    from common import dynamo
    from common.schemas import Case, Item

    out: list[tuple[str, str]] = []
    for entry in demo_world.DEMO_ITEMS:
        if entry["item_id"] in skip:
            continue
        row = dynamo.get("items", Item.make_pk(entry["item_id"])) or {}
        case_id = str(row.get("case_id") or "")
        case = dynamo.get("cases", Case.make_pk(case_id)) if case_id else None
        if case and case.get("status") == "waiting_approval":
            out.append((case_id, str(entry["item_id"])))
    return out


def check_seeded(mock: bool, skip: set[str], timeout: int = 240) -> dict[str, int]:
    """Run the matcher over the demo items, so the demo wall shows real outcomes.

    The demo household is read-only through the API (``demo_read_only``), so this is the admin
    path: the executions are started directly on the MatchStateMachine, three at a time. The item
    that carries the fixed demo case (``case_demo_ft5427``) is skipped -- it was sealed by
    ``seed_demo_case`` and re-checking it would point the item at a new, unapproved case.
    """
    import time

    from common import dynamo
    from common.notices import now_iso
    from common.schemas import Item

    entries = [e for e in demo_world.DEMO_ITEMS if e["item_id"] not in skip]
    if mock:
        from api import match_api

        for entry in entries:
            row = dynamo.get("items", Item.make_pk(entry["item_id"]))
            if row is not None:
                match_api.run_demo_check(row)
    else:
        import boto3

        from api import match_api

        machine = os.environ.get("MATCH_STATE_MACHINE_ARN") or ""
        if not machine:
            raise SystemExit(
                "seed_demo: MATCH_STATE_MACHINE_ARN is not set; the stack's MatchStateMachineArn "
                "output is what configure_live reads"
            )
        sfn = boto3.client("stepfunctions")
        for index, entry in enumerate(entries):
            item_id = entry["item_id"]
            now = now_iso()
            resp = sfn.start_execution(
                stateMachineArn=machine,
                name=match_api.execution_name(item_id, now),
                input=json.dumps({"item_id": item_id}),
            )
            row = dynamo.get("items", Item.make_pk(item_id))
            if row is not None:
                row.update({"last_check_arn": resp["executionArn"], "last_check_at": now})
                dynamo.put("items", row)
            if index % 3 == 2:  # three at a time, like the household copy does
                time.sleep(1.5)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            pending = []
            for entry in entries:
                row = dynamo.get("items", Item.make_pk(entry["item_id"])) or {}
                if not row.get("last_checked_at"):
                    pending.append(entry["item_id"])
            if not pending:
                break
            time.sleep(3)

    # count the faces the wall shows, not the item statuses: a dismissed near miss keeps
    # status "clear" but reads as "not on the notice" on its card
    counts = {"on a notice": 0, "near miss": 0, "needs you": 0, "clear": 0, "not checked": 0}
    from common.schemas import Case

    for entry in demo_world.DEMO_ITEMS:
        row = dynamo.get("items", Item.make_pk(entry["item_id"])) or {}
        case_id = str(row.get("case_id") or "")
        case = dynamo.get("cases", Case.make_pk(case_id)) if case_id else None
        if not row.get("last_checked_at"):
            counts["not checked"] += 1
        elif row.get("status") == "alert":
            counts["on a notice"] += 1
        elif row.get("status") == "hold":
            counts["needs you"] += 1
        elif (case or {}).get("decision") == "dismiss":
            counts["near miss"] += 1
        else:
            counts["clear"] += 1
    return {k: v for k, v in counts.items() if v}


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
        if not args.mock and outputs.get("MatchStateMachineArn"):
            stopped = stop_paused_checks(outputs["MatchStateMachineArn"])
            print(f"seed_demo: reset stopped {stopped} running match execution(s)")
        deleted = reset(dynamo)
        print(f"seed_demo: reset deleted items={deleted['items']} cases+events={deleted['cases']}")

    written = seed(args.mock)
    alert = written[0]
    # the demo household's finished case lives at a fixed id: /case/?id=case_demo_ft5427
    import seed_demo_case

    case_args = ["--mock"] if args.mock else ["--live", "--profile", args.profile]
    seeded_case = seed_demo_case.main(case_args)
    if seeded_case != 0:
        print("seed_demo: the demo case could not be sealed (see above)", file=sys.stderr)

    # the wall a visitor lands on has to show outcomes, not 15 unchecked cards
    if not args.no_check:
        counts = check_seeded(args.mock, skip={seed_demo_case.ITEM_ID})
        print(f"seed_demo: checked the demo items -> {counts}")
        # a demo case left waiting would read "expired" to whoever opens it tomorrow: finish
        # every alert the checks raised, the way the FT5427 case is finished
        for case_id, item_id in waiting_cases(skip={seed_demo_case.ITEM_ID}):
            status = seed_demo_case.approve_admin(case_id, args.mock)
            print(f"seed_demo: approved {item_id}'s case {case_id} -> {status}")
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
