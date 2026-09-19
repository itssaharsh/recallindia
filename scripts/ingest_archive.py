#!/usr/bin/env python3
"""Run the CDSCO archive PDFs through the deployed IngestStateMachine, one month at a time.

Reads the monthly entries the Fetch step recorded in ``meta#cdsco_pdf.listing`` (newest first),
skips the months already in ``ingested`` (unless ``--force``), and for each remaining month calls
``POST /ingest/run {"month": "<MON-YYYY>", "lab_scope": "<scope>"}`` on the live API, polls
``GET /ingest/status/{arn}`` until the execution stops, and prints one summary row
(month, status, method, rows_in, notices_out). Sequential by design (Lambda concurrency is 10 and
Textract jobs are billed per page).

Usage (from the repo root, AWS_PROFILE=firstcommit)::

    python scripts/ingest_archive.py --lab-scope cdsco
    python scripts/ingest_archive.py --months MAY-2025 APR-2025 --force

Exit status: 0 when every month reached SUCCEEDED, 1 otherwise. A JSON summary is written next to
the log (``.backfill/ingest_archive_summary.json``).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SUMMARY = REPO_ROOT / ".backfill" / "ingest_archive_summary.json"
TERMINAL = {"SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"}

log = logging.getLogger("ingest_archive")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--lab-scope", default="cdsco", choices=["cdsco", "state"])
    p.add_argument("--months", nargs="*", help="only these MON-YYYY months (default: all listed)")
    p.add_argument("--force", action="store_true", help="re-run months already ingested")
    p.add_argument("--sleep", type=float, default=2.0, help="seconds between runs (default 2)")
    p.add_argument("--timeout", type=int, default=600, help="seconds to wait per run (default 600)")
    p.add_argument("--stack", default=os.environ.get("STACK_NAME") or "recallindia")
    p.add_argument("--api-url", default=os.environ.get("API_URL"))
    p.add_argument("--table", default=os.environ.get("NOTICES_TABLE"))
    p.add_argument("--summary", default=str(DEFAULT_SUMMARY))
    p.add_argument("--dry-run", action="store_true", help="list the months and stop")
    return p


# --- AWS lookups ----------------------------------------------------------------------


def stack_outputs(stack: str) -> dict[str, str]:
    import boto3

    resp = boto3.client("cloudformation").describe_stacks(StackName=stack)
    return {o["OutputKey"]: o["OutputValue"] for o in resp["Stacks"][0].get("Outputs", [])}


def read_meta(table: str) -> dict[str, Any]:
    import boto3

    item = boto3.resource("dynamodb").Table(table).get_item(Key={"pk": "meta#cdsco_pdf"})
    return item.get("Item") or {}


# --- HTTP ---------------------------------------------------------------------------------


def _request(method: str, url: str, body: dict | None = None, timeout: float = 30) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as err:
        payload = err.read().decode(errors="replace")
        raise RuntimeError(f"{method} {url} -> HTTP {err.code}: {payload[:300]}") from err


def start_run(api: str, month: str, lab_scope: str, force: bool) -> dict:
    return _request(
        "POST", f"{api}/ingest/run", {"month": month, "lab_scope": lab_scope, "force": force}
    )


def wait_for(api: str, arn: str, timeout: int) -> dict:
    url = f"{api}/ingest/status/{urllib.parse.quote(arn, safe='')}"
    deadline = time.monotonic() + timeout
    status: dict = {}
    while time.monotonic() < deadline:
        status = _request("GET", url)
        if status.get("status") in TERMINAL:
            return status
        time.sleep(5)
    status["status"] = status.get("status") or "UNKNOWN"
    status["error"] = f"still {status['status']} after {timeout}s"
    return status


# --- main -----------------------------------------------------------------------------


def select_months(meta: dict, lab_scope: str, only: list[str] | None, force: bool) -> list[str]:
    listing = [
        e
        for e in meta.get("listing") or []
        if e.get("kind") == "monthly" and e.get("lab_scope") == lab_scope and e.get("month")
    ]
    ingested = {
        e.get("month")
        for e in meta.get("ingested") or []
        if e.get("lab_scope", "cdsco") == lab_scope
    }
    months: list[str] = []
    for entry in listing:  # listing is newest first
        month = str(entry["month"]).upper()
        if only and month not in {m.upper() for m in only}:
            continue
        if month in ingested and not force:
            log.info("skip %s (already ingested)", month)
            continue
        if month not in months:
            months.append(month)
    return months


def fmt_row(r: dict) -> str:
    return (
        f"{r['month']:9s} {str(r.get('status')):10s} {str(r.get('method')):11s} "
        f"rows_in={str(r.get('rows_in')):>4s} notices_out={str(r.get('notices_out')):>4s} "
        f"{('error=' + str(r['error'])[:80]) if r.get('error') else ''}"
    )


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_parser().parse_args(argv)
    outputs = stack_outputs(args.stack) if not (args.api_url and args.table) else {}
    api = (args.api_url or outputs.get("ApiUrl") or "").rstrip("/")
    table = args.table or outputs.get("NoticesTableName")
    if not api or not table:
        log.error("need ApiUrl and NoticesTableName (stack %s)", args.stack)
        return 2
    meta = read_meta(table)
    months = select_months(meta, args.lab_scope, args.months, args.force)
    log.info("archive backfill: lab_scope=%s months=%d -> %s", args.lab_scope, len(months), months)
    if args.dry_run or not months:
        return 0

    rows: list[dict] = []
    t0 = time.monotonic()
    for i, month in enumerate(months):
        row: dict[str, Any] = {"month": month}
        try:
            started = start_run(api, month, args.lab_scope, args.force)
            arn = started["execution_arn"]
            row["execution_arn"] = arn
            status = wait_for(api, arn, args.timeout)
            row.update(
                status=status.get("status"),
                method=status.get("method"),
                rows_in=status.get("rows_in"),
                notices_out=status.get("notices_out"),
                error=status.get("error"),
            )
        except Exception as exc:  # one failed month must not stop the loop
            row.update(status="ERROR", error=f"{type(exc).__name__}: {exc}")
        rows.append(row)
        log.info(fmt_row(row))
        if i < len(months) - 1 and args.sleep:
            time.sleep(args.sleep)

    ok = sum(1 for r in rows if r.get("status") == "SUCCEEDED")
    print("\nmonth     status     method      rows_in notices_out")
    for r in rows:
        print(fmt_row(r))
    print(
        f"\narchive backfill: months={len(rows)} succeeded={ok} failed={len(rows) - ok} "
        f"notices_out={sum(int(r.get('notices_out') or 0) for r in rows)} "
        f"took={time.monotonic() - t0:.0f}s"
    )
    Path(args.summary).parent.mkdir(parents=True, exist_ok=True)
    Path(args.summary).write_text(json.dumps(rows, indent=1))
    return 0 if ok == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
