#!/usr/bin/env python3
"""Backfill one source's notices over N years.

P02 implements cpsc/nhtsa/openfda; P03 the CDSCO PDF archive (cdsco_nsq).

Usage:
    python scripts/backfill.py --source cpsc --years 5

Paginates month by month, sleeps 1s between requests, keeps a resumable cursor file, logs counts.
Sequential only (Lambda concurrency on this account is 10).
"""

from __future__ import annotations

import argparse
import sys

SOURCES = ("cpsc", "nhtsa", "openfda", "cdsco_nsq")
NOT_IMPLEMENTED_UNTIL = "P02 (cpsc/nhtsa/openfda) / P03 (cdsco_nsq)"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="backfill.py",
        description="Backfill notices for one source; resumable via a cursor file.",
    )
    parser.add_argument("--source", required=True, choices=SOURCES, help="source id to backfill")
    parser.add_argument(
        "--years", type=int, default=5, help="how many years back to fetch (default: 5)"
    )
    parser.add_argument(
        "--cursor-file",
        default=None,
        help="resume cursor path (default: .demo_store/backfill-<source>.cursor)",
    )
    parser.add_argument(
        "--sleep", type=float, default=1.0, help="seconds to sleep between requests (default: 1)"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(
        f"backfill.py: not implemented until {NOT_IMPLEMENTED_UNTIL} "
        f"(source={args.source}, years={args.years})",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
