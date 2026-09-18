#!/usr/bin/env python3
"""Seed the 15-item demo world (SPEC.md §Demo world). Implemented in P05.

Usage:
    DEMO_MODE=1 python scripts/seed_demo.py --mock [--reset]
    python scripts/seed_demo.py --live [--reset]

--mock writes into the local DEMO_MODE store; --live writes to DynamoDB via AWS_PROFILE=firstcommit.
--reset deletes all items, cases and events first (never notices).
"""

from __future__ import annotations

import argparse
import sys

NOT_IMPLEMENTED_UNTIL = "P05"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="seed_demo.py",
        description=(
            "Create 15 demo items: 1 real alert (batch in a cdsco_nsq notice), 1 near-miss "
            "(same drug, different batch), 1 vehicle, 12 clear."
        ),
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--mock", action="store_true", help="write into the local DEMO_MODE store (no AWS)"
    )
    mode.add_argument(
        "--live", action="store_true", help="write to DynamoDB (AWS_PROFILE=firstcommit)"
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete all items, cases and events before seeding (never notices)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    mode = "mock" if args.mock else "live"
    print(
        f"seed_demo.py: not implemented until {NOT_IMPLEMENTED_UNTIL} "
        f"(mode={mode}, reset={args.reset})",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
