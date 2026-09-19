"""Stamp ``household_id`` on rows written before households existed (P08-P09 §1d).

The ``household_id-index`` GSI is sparse: a row without the attribute is invisible to it, so
``GET /items`` would return an empty wall for a table seeded earlier. Every unlabelled item and
case belongs to the read-only ``demo`` household.

    python scripts/backfill_household.py --live --profile firstcommit      # dry run
    python scripts/backfill_household.py --live --profile firstcommit --write
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--live", action="store_true", help="the deployed tables (DEMO_MODE=0)")
    parser.add_argument("--write", action="store_true", help="write (default: dry run)")
    parser.add_argument("--household", default="demo")
    parser.add_argument("--stack", default="recallindia")
    parser.add_argument("--profile", default="firstcommit")
    parser.add_argument("--region", default="ap-south-1")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.live:
        from _live import SetupError, configure_live

        try:
            configure_live(args.stack, args.profile, args.region)
        except SetupError as exc:
            print(f"backfill_household: {exc}", file=sys.stderr)
            return 2
    else:
        os.environ["DEMO_MODE"] = "1"

    from common import dynamo

    total = 0
    for kind, keep in (("items", lambda r: str(r.get("pk", "")).startswith("user#")),
                       ("cases", lambda r: r.get("rk") == "case")):  # fmt: skip
        rows = [r for r in dynamo.scan_all(kind, limit=1000) if keep(r)]
        missing = [r for r in rows if not str(r.get("household_id") or "").strip()]
        print(f"{kind}: {len(rows)} rows, {len(missing)} without household_id")
        for row in missing:
            if args.write:
                row["household_id"] = args.household
                dynamo.put(kind, row)
            total += 1
    print(f"{'stamped' if args.write else 'would stamp'} {total} rows as {args.household!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
