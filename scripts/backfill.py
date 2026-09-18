#!/usr/bin/env python3
"""Backfill one source's notices over N years, one window at a time, resumably.

Usage (from the repo root)::

    python scripts/backfill.py --source cpsc --years 5            # live (--profile firstcommit)
    python scripts/backfill.py --source cdsco_portal --years 1 --mock   # fixtures, no network

``--mock`` is the only switch between the two modes: without it the run is live (``DEMO_MODE``
is forced to 0 whatever ``.env`` says, ``AWS_PROFILE`` is set from ``--profile``, default
``firstcommit``) and the table names must resolve from the stack outputs or ``NOTICES_TABLE``,
otherwise the run stops before any window (exit 2) instead of "completing" against nothing.

Windows per source (oldest first):

* ``cpsc``          calendar months ``YYYY-MM`` -> ``pollers.cpsc.fetch_window`` + ``ingest``
* ``openfda``       the same months x ``drug``/``device`` (``drug:YYYY-MM``) ->
                    ``pollers.openfda.fetch_window(kind, ..., max_records=5000)`` + ``ingest``
* ``nhtsa``         ``make/model/year`` from ``pollers.watchlist.expand`` (US-name matches only)
                    -> ``pollers.nhtsa.fetch_vehicle`` + ``ingest``
* ``cdsco_portal``  portal months ``MON-YYYY`` from ``common.cdsco.months_since`` ->
                    ``pollers.cdsco_portal.ingest_month``

Every window's result goes through ``common.notices.upsert_notice`` (idempotent), the cursor
file is rewritten atomically after every window, completed windows are skipped on rerun, a
failed window is logged and retried on the next run (the run continues; exit status 1). A
window is also failed -- not marked done -- when it fetched records but every one of them was
skipped (the pollers swallow per-record write errors into ``skipped``, so an unreachable or
misnamed table would otherwise look like a finished backfill). HTTP requests are sequential
with ``--sleep`` seconds between windows and between openFDA pages; backoff on 429/5xx lives
in ``common.demo_mode.fetch_json``. Bedrock is never called.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

SOURCES = ("cpsc", "nhtsa", "openfda", "cdsco_portal")
COUNT_KEYS = ("fetched", "created", "updated", "unchanged", "skipped")
DEFAULT_SLEEP = 1.0
DEFAULT_PROFILE = "firstcommit"
EXIT_FAILED_WINDOWS = 1
EXIT_SETUP = 2

log = logging.getLogger("backfill")


# --- CLI ------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="backfill.py",
        description="Backfill notices for one source over N years; resumable via a cursor file.",
    )
    parser.add_argument("--source", required=True, choices=SOURCES, help="source id to backfill")
    parser.add_argument(
        "--years", type=int, default=5, help="how many years back to fetch (default: 5)"
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=None,
        help="seconds to sleep between HTTP windows (default: 1.0; 0 with --mock)",
    )
    parser.add_argument(
        "--cursor-file",
        default=None,
        help="resume cursor path (default: .backfill/<source>.json)",
    )
    parser.add_argument(
        "--mock", action="store_true", help="DEMO_MODE=1: fixtures and the local demo store"
    )
    parser.add_argument(
        "--reset", action="store_true", help="ignore an existing cursor and start over"
    )
    parser.add_argument(
        "--stack",
        default=os.environ.get("STACK_NAME") or "recallindia",
        help="CloudFormation stack to read table names from (default: $STACK_NAME or recallindia)",
    )
    parser.add_argument(
        "--profile",
        default=os.environ.get("AWS_PROFILE") or DEFAULT_PROFILE,
        help=f"AWS profile for live runs (default: $AWS_PROFILE or {DEFAULT_PROFILE})",
    )
    # Test hook: pin "today" so window lists are deterministic (hidden from --help).
    parser.add_argument("--today", default=None, help=argparse.SUPPRESS)
    return parser


# --- dates ---------------------------------------------------------------------------


def years_ago(today: dt.date, years: int) -> dt.date:
    """``today`` minus ``years`` calendar years (29 Feb falls back to 28 Feb)."""
    try:
        return today.replace(year=today.year - years)
    except ValueError:
        return today.replace(year=today.year - years, day=28)


def month_windows(start: dt.date, today: dt.date) -> list[tuple[str, dt.date, dt.date]]:
    """``[(id, first_day, last_day), ...]`` for every calendar month from ``start`` to ``today``.

    The first window begins on the first of ``start``'s month; the last ends on ``today``.
    """
    windows: list[tuple[str, dt.date, dt.date]] = []
    cursor = start.replace(day=1)
    while cursor <= today:
        next_month = (cursor.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        end = min(next_month - dt.timedelta(days=1), today)
        windows.append((cursor.strftime("%Y-%m"), cursor, end))
        cursor = next_month
    return windows


# --- windows per source --------------------------------------------------------------


class Window:
    """One unit of work: an id for the cursor and a zero-argument ``run`` returning counts."""

    __slots__ = ("id", "run")

    def __init__(self, window_id: str, run: Any) -> None:
        self.id = window_id
        self.run = run


def _counts_from(counts: dict | None, fetched: int | None = None) -> dict[str, int]:
    """Normalise a poller ``Counts`` dict to the five keys the log line reports."""
    counts = counts or {}
    out = {k: int(counts.get(k, 0) or 0) for k in COUNT_KEYS}
    if fetched is not None:
        out["fetched"] = fetched
    elif not out["fetched"]:
        out["fetched"] = out["created"] + out["updated"] + out["unchanged"] + out["skipped"]
    return out


def cpsc_windows(years: int, today: dt.date, *, sleep_s: float = 0.0) -> list[Window]:
    from pollers import cpsc

    def make(start: dt.date, end: dt.date):
        def run() -> dict[str, int]:
            records = cpsc.fetch_window(start, end)
            return _counts_from(cpsc.ingest(records), fetched=len(records))

        return run

    return [Window(wid, make(s, e)) for wid, s, e in month_windows(years_ago(today, years), today)]


def openfda_windows(years: int, today: dt.date, *, sleep_s: float = 0.0) -> list[Window]:
    """One window per month x kind; ``sleep_s`` also spaces the ``skip`` pages inside a month."""
    from pollers import openfda

    def make(kind: str, start: dt.date, end: dt.date):
        def run() -> dict[str, int]:
            records = openfda.fetch_window(kind, start, end, max_records=5000, pause=sleep_s)
            return _counts_from(openfda.ingest(records, kind), fetched=len(records))

        return run

    return [
        Window(f"{kind}:{wid}", make(kind, s, e))
        for wid, s, e in month_windows(years_ago(today, years), today)
        for kind in openfda.KINDS
    ]


def nhtsa_windows(years: int, today: dt.date, *, sleep_s: float = 0.0) -> list[Window]:
    from pollers import nhtsa, watchlist

    def make(make_: str, model: str, year: int):
        def run() -> dict[str, int]:
            results = nhtsa.fetch_vehicle(make_, model, year)
            return _counts_from(nhtsa.ingest(results, make_, model, year), fetched=len(results))

        return run

    tuples = watchlist.expand(years=range(today.year - years + 1, today.year + 1))
    return [Window(f"{m}/{mo}/{y}", make(m, mo, y)) for m, mo, y in tuples]


def cdsco_portal_windows(years: int, today: dt.date, *, sleep_s: float = 0.0) -> list[Window]:
    from common import cdsco
    from pollers import cdsco_portal

    def make(month: str):
        def run() -> dict[str, int]:
            return _counts_from(cdsco_portal.ingest_month(month))

        return run

    months = cdsco.months_since(years_ago(today, years), today=today)
    return [Window(month, make(month)) for month in months]


WINDOW_BUILDERS = {
    "cpsc": cpsc_windows,
    "openfda": openfda_windows,
    "nhtsa": nhtsa_windows,
    "cdsco_portal": cdsco_portal_windows,
}


def meta_source(source: str) -> str:
    """``meta#<source>`` key: the poller's META_SOURCE when it has one (cdsco_portal)."""
    if source == "cdsco_portal":
        from pollers import cdsco_portal

        return getattr(cdsco_portal, "META_SOURCE", "cdsco_portal")
    return source


# --- cursor --------------------------------------------------------------------------


def default_cursor_path(source: str) -> Path:
    return REPO_ROOT / ".backfill" / f"{source}.json"


def load_cursor(path: Path, source: str, years: int, *, reset: bool) -> dict:
    """The saved cursor (when it matches ``source``) or a fresh one."""
    fresh = {
        "source": source,
        "years": years,
        "started_at": _now_iso(),
        "done": [],
        "counts": dict.fromkeys(COUNT_KEYS, 0),
        "updated_at": None,
    }
    if reset or not path.is_file():
        return fresh
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        log.warning("cursor %s unreadable (%s); starting over", path, exc)
        return fresh
    if data.get("source") != source:
        log.warning("cursor %s is for source %r; starting over", path, data.get("source"))
        return fresh
    data.setdefault("done", [])
    data.setdefault("counts", {})
    for key in COUNT_KEYS:
        data["counts"].setdefault(key, 0)
    data["years"] = years
    return data


def save_cursor(path: Path, cursor: dict) -> None:
    """Atomic replace so a killed run never leaves a half-written cursor."""
    cursor["updated_at"] = _now_iso()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(cursor, fh, indent=1)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _now_iso() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- AWS table names -----------------------------------------------------------------


class SetupError(RuntimeError):
    """A live run cannot start: no table name could be resolved."""


def resolve_tables(stack: str) -> str:
    """Live runs: the notices table name from the env or the stack outputs; never a guess.

    Returns the resolved ``NOTICES_TABLE`` (also exported, with ``ITEMS_TABLE``). Raises
    ``SetupError`` when the stack cannot be described or has no ``NoticesTableName`` output: the
    code default ``recallindia-notices`` has no account suffix and does not exist, so running
    against it would skip every record and still look like a finished backfill.
    """
    if os.environ.get("NOTICES_TABLE"):
        return os.environ["NOTICES_TABLE"]
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    try:
        import boto3

        client = boto3.client("cloudformation", region_name=region)
        stacks = client.describe_stacks(StackName=stack)["Stacks"]
        outputs = {o["OutputKey"]: o["OutputValue"] for o in stacks[0].get("Outputs", [])}
    except Exception as exc:
        raise SetupError(
            f"could not read the outputs of stack {stack!r} in {region} "
            f"({type(exc).__name__}: {exc}); pass --profile firstcommit / --stack, "
            "or set NOTICES_TABLE"
        ) from exc
    if not outputs.get("NoticesTableName"):
        raise SetupError(
            f"stack {stack!r} has no NoticesTableName output; set NOTICES_TABLE explicitly"
        )
    for key, env in (("NoticesTableName", "NOTICES_TABLE"), ("ItemsTableName", "ITEMS_TABLE")):
        if outputs.get(key) and not os.environ.get(env):
            os.environ[env] = outputs[key]
    log.info("tables from stack %s: %s", stack, os.environ["NOTICES_TABLE"])
    return os.environ["NOTICES_TABLE"]


# --- main ----------------------------------------------------------------------------


def format_counts(counts: dict) -> str:
    return " ".join(f"{k}={int(counts.get(k, 0) or 0)}" for k in COUNT_KEYS)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    log.setLevel(logging.INFO)

    source = args.source
    sleep_s = args.sleep if args.sleep is not None else (0.0 if args.mock else DEFAULT_SLEEP)
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    # --mock is the only mode switch: a DEMO_MODE=1 inherited from .env must not turn the
    # documented live command into a silent fixture run (and vice versa).
    if args.mock:
        os.environ["DEMO_MODE"] = "1"
        log.info("backfill %s: mode=mock (fixtures + local demo store, no network)", source)
    else:
        os.environ["DEMO_MODE"] = "0"
        os.environ["AWS_PROFILE"] = args.profile
        try:
            table = resolve_tables(args.stack)
        except SetupError as exc:
            log.error("backfill %s: %s", source, exc)
            return EXIT_SETUP
        log.info("backfill %s: mode=live profile=%s table=%s", source, args.profile, table)

    from common.notices import write_meta

    cursor_path = Path(args.cursor_file) if args.cursor_file else default_cursor_path(source)
    cursor = load_cursor(cursor_path, source, args.years, reset=args.reset)
    done = set(cursor["done"])
    totals = cursor["counts"]

    t0 = time.monotonic()
    try:
        windows = WINDOW_BUILDERS[source](args.years, today, sleep_s=sleep_s)
    except Exception as exc:  # e.g. the portal month listing is down
        log.error("backfill %s: could not build windows: %s: %s", source, type(exc).__name__, exc)
        write_meta(meta_source(source), ok=False, error=f"{type(exc).__name__}: {exc}")
        return EXIT_FAILED_WINDOWS

    pending = [w for w in windows if w.id not in done]
    log.info(
        "backfill %s: years=%d windows=%d already_done=%d cursor=%s",
        source,
        args.years,
        len(windows),
        len(windows) - len(pending),
        cursor_path,
    )

    failed: list[str] = []
    ran_previous = False
    for window in pending:
        if ran_previous and sleep_s > 0:
            time.sleep(sleep_s)
        ran_previous = True
        try:
            counts = window.run()
        except Exception as exc:  # never abort the run on one upstream failure
            failed.append(window.id)
            log.error("%s %s: failed %s: %s", source, window.id, type(exc).__name__, exc)
            continue
        if counts["fetched"] and counts["skipped"] >= counts["fetched"]:
            # every record failed to write: a storage problem, not bad data -> retry next run
            failed.append(window.id)
            log.error(
                "%s %s: failed, every record was skipped (%s); not marking the window done",
                source,
                window.id,
                format_counts(counts),
            )
            continue
        for key in COUNT_KEYS:
            totals[key] = int(totals.get(key, 0) or 0) + counts[key]
        cursor["done"].append(window.id)
        done.add(window.id)
        save_cursor(cursor_path, cursor)
        log.info("%s %s: %s", source, window.id, format_counts(counts))

    took = time.monotonic() - t0
    summary = {
        "windows": len(windows),
        "done": len(done),
        "failed": len(failed),
        **{k: int(totals.get(k, 0) or 0) for k in COUNT_KEYS},
        "took_s": round(took, 1),
        "years": args.years,
        "finished_at": _now_iso(),
    }
    log.info(
        "backfill %s: windows=%d done=%d %s took=%.1fs",
        source,
        len(windows),
        len(done),
        format_counts(totals),
        took,
    )
    if failed:
        log.error(
            "backfill %s: %d window(s) failed, rerun to retry: %s", source, len(failed), failed
        )
    try:
        write_meta(
            meta_source(source),
            ok=not failed,
            counts={k: summary[k] for k in COUNT_KEYS},
            error=None if not failed else f"backfill: {len(failed)} window(s) failed: {failed[:5]}",
            extra={"backfill": summary},
        )
    except Exception as exc:  # bookkeeping must not turn a finished backfill into a failure
        log.warning("could not write meta#%s: %s: %s", meta_source(source), type(exc).__name__, exc)
    return EXIT_FAILED_WINDOWS if failed else 0


if __name__ == "__main__":
    sys.exit(main())
