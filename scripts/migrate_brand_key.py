#!/usr/bin/env python3
"""Re-key ``brand_lc`` on existing notices to ``common.brands.brand_key(brand)`` (P05b).

Usage (from the repo root)::

    python scripts/migrate_brand_key.py --mock              # the local DEMO_MODE store
    python scripts/migrate_brand_key.py --live --dry-run    # count + sample, write nothing
    python scripts/migrate_brand_key.py --live              # UpdateItem, brand_lc ONLY

Scans the notices table page by page. For each notice whose stored ``brand_lc`` differs from
``brand_key(brand)`` it issues one ``UpdateItem SET brand_lc = :key`` -- no other attribute is
touched, the display ``brand`` least of all -- guarded by a condition that the row still exists
with the same ``brand`` (a row a poller rewrote in the meantime is simply picked up correctly on
the next run). ``meta#`` / ``ingest#`` rows and rows without a brand are skipped. Idempotent, and
resumable: the scan position and counts are checkpointed to ``.backfill/migrate_brand_key.json``
after every page (``--reset`` starts over). Exit 0 = no failures, 1 = some updates failed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
for extra in (REPO_ROOT / "backend", Path(__file__).resolve().parent):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

from common.brands import brand_key  # noqa: E402  (after the sys.path setup above)

CHECKPOINT = REPO_ROOT / ".backfill" / "migrate_brand_key.json"
INTERNAL_PREFIXES = ("meta#", "ingest#")
UNKNOWN = "unknown"
COUNT_KEYS = ("scanned", "already_ok", "updated", "skipped_internal", "skipped_no_brand",
              "conflicts", "failed")  # fmt: skip


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="migrate_brand_key.py", description=__doc__.split("\n\n")[0])
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--mock", action="store_true", help="migrate the local DEMO_MODE store")
    mode.add_argument("--live", action="store_true", help="migrate the deployed notices table")
    p.add_argument("--dry-run", action="store_true", help="report what would change; write nothing")
    p.add_argument("--page-size", type=int, default=200, help="rows per scan page / checkpoint")
    p.add_argument("--reset", action="store_true", help="ignore a saved checkpoint")
    p.add_argument("--stack", default=os.environ.get("STACK_NAME") or "recallindia")
    p.add_argument("--profile", default=os.environ.get("AWS_PROFILE") or "firstcommit")
    p.add_argument("--checkpoint", default=str(CHECKPOINT))
    return p


def wanted_key(brand: object) -> str:
    """The key ``schemas.Notice`` would store for this display brand."""
    return brand_key(str(brand or "")) or UNKNOWN


def classify(row: dict) -> tuple[str, str | None]:
    """``(verdict, new_key)``: ``skipped_internal`` / ``skipped_no_brand`` / ``already_ok`` /
    ``update``."""
    if str(row.get("pk", "")).startswith(INTERNAL_PREFIXES):
        return "skipped_internal", None
    if not str(row.get("brand") or "").strip():
        return "skipped_no_brand", None
    want = wanted_key(row["brand"])
    return ("already_ok", None) if row.get("brand_lc") == want else ("update", want)


# --- live --------------------------------------------------------------------------------


def update_brand_lc(table, row: dict, new_key: str) -> str:
    """One UpdateItem that sets ``brand_lc`` and nothing else. Returns updated|conflicts|failed."""
    from botocore.exceptions import ClientError

    try:
        table.update_item(
            Key={"pk": row["pk"]},
            UpdateExpression="SET #bl = :key",
            ConditionExpression="attribute_exists(#pk) AND #b = :brand",
            ExpressionAttributeNames={"#bl": "brand_lc", "#pk": "pk", "#b": "brand"},
            ExpressionAttributeValues={":key": new_key, ":brand": row["brand"]},
        )
        return "updated"
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return "conflicts"  # the row changed under us; the next run re-evaluates it
        print(f"  FAILED {row['pk']}: {exc}", file=sys.stderr)
        return "failed"


def migrate_live(table, *, dry_run: bool, page_size: int, state: dict, save) -> list[tuple]:
    samples: list[tuple] = []
    kwargs: dict = {
        "ProjectionExpression": "#pk, #b, #bl",
        "ExpressionAttributeNames": {"#pk": "pk", "#b": "brand", "#bl": "brand_lc"},
        "Limit": page_size,
    }
    if state.get("last_key"):
        kwargs["ExclusiveStartKey"] = state["last_key"]
    while True:
        page = table.scan(**kwargs)
        for row in page.get("Items", []):
            state["scanned"] += 1
            verdict, new_key = classify(row)
            if verdict != "update":
                state[verdict] += 1
                continue
            if len(samples) < 8:
                samples.append((row["pk"], row.get("brand"), row.get("brand_lc"), new_key))
            state["updated" if dry_run else update_brand_lc(table, row, new_key)] += 1
        state["last_key"] = page.get("LastEvaluatedKey")
        save(state)
        print(
            f"  page done: scanned={state['scanned']} updated={state['updated']} "
            f"ok={state['already_ok']} failed={state['failed']}"
        )
        if not state["last_key"]:
            return samples
        kwargs["ExclusiveStartKey"] = state["last_key"]


# --- mock --------------------------------------------------------------------------------


def migrate_mock(*, dry_run: bool, state: dict) -> list[tuple]:
    from common import dynamo

    samples: list[tuple] = []
    for row in dynamo.scan_all("notices", limit=1_000_000):
        state["scanned"] += 1
        verdict, new_key = classify(row)
        if verdict != "update":
            state[verdict] += 1
            continue
        if len(samples) < 8:
            samples.append((row["pk"], row.get("brand"), row.get("brand_lc"), new_key))
        if not dry_run:
            dynamo.put("notices", {**row, "brand_lc": new_key})  # every other field as it was
        state["updated"] += 1
    return samples


# --- main --------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    checkpoint = Path(args.checkpoint)
    state = {k: 0 for k in COUNT_KEYS} | {"last_key": None}
    t0 = time.monotonic()

    if args.mock:
        os.environ["DEMO_MODE"] = "1"
        print(f"migrate_brand_key: mode=mock{' (dry run)' if args.dry_run else ''}")
        samples = migrate_mock(dry_run=args.dry_run, state=state)
    else:
        from _live import SetupError, configure_live

        try:
            outputs = configure_live(args.stack, args.profile)
        except SetupError as exc:
            print(f"migrate_brand_key: {exc}", file=sys.stderr)
            return 2
        import boto3

        table = boto3.resource("dynamodb").Table(outputs["NoticesTableName"])
        resumable = not args.dry_run  # a dry run never writes, so it never leaves a checkpoint
        if resumable and not args.reset and checkpoint.is_file():
            saved = json.loads(checkpoint.read_text())
            if saved.get("last_key"):
                state.update(saved)
                print(f"migrate_brand_key: resuming after {state['scanned']} scanned rows")

        def save(current: dict) -> None:
            if resumable:
                checkpoint.parent.mkdir(parents=True, exist_ok=True)
                tmp = checkpoint.with_suffix(".tmp")
                tmp.write_text(json.dumps(current))
                tmp.replace(checkpoint)

        print(
            f"migrate_brand_key: mode=live table={outputs['NoticesTableName']} "
            f"profile={args.profile}{' (DRY RUN - nothing is written)' if args.dry_run else ''}"
        )
        samples = migrate_live(
            table, dry_run=args.dry_run, page_size=args.page_size, state=state, save=save
        )
        if resumable and checkpoint.is_file():
            checkpoint.unlink()  # finished: the next run starts from the top (it is idempotent)

    verb = "would update" if args.dry_run else "updated"
    for pk, brand, old, new in samples:
        print(f"  e.g. {pk[:44]:44s} {brand!r}: {old!r} -> {new!r}")
    print(
        f"migrate_brand_key: scanned={state['scanned']} already_ok={state['already_ok']} "
        f"{verb}={state['updated']} skipped_internal={state['skipped_internal']} "
        f"skipped_no_brand={state['skipped_no_brand']} conflicts={state['conflicts']} "
        f"failed={state['failed']} took={time.monotonic() - t0:.1f}s"
    )
    return 1 if state["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
