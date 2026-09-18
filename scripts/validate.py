#!/usr/bin/env python3
"""Check every seeded item and assert the demo-world outcome (SPEC.md §Demo world).

Implemented in P05.

Usage:
    DEMO_MODE=1 python scripts/validate.py --mock
    python scripts/validate.py --live

Expected after the run: exactly 1 alert (medicine), exactly 1 dismiss whose reason starts with
"batch", the vehicle in {alert, hold}, and 12 items with no match. Prints a table and PASS/FAIL;
non-zero exit on FAIL. --mock must run with no AWS credentials.
"""

from __future__ import annotations

import argparse
import sys

NOT_IMPLEMENTED_UNTIL = "P05"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="validate.py",
        description=(
            "Run check on all 15 seeded items and assert 1 alert / 1 dismiss / vehicle / 12 clear."
        ),
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--mock", action="store_true", help="use the local DEMO_MODE store (no AWS credentials)"
    )
    mode.add_argument(
        "--live",
        action="store_true",
        help="start real Step Functions executions (AWS_PROFILE=firstcommit)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    mode = "mock" if args.mock else "live"
    print(
        f"validate.py: not implemented until {NOT_IMPLEMENTED_UNTIL} (mode={mode})",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
