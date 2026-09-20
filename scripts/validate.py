#!/usr/bin/env python3
"""Check every seeded demo item and assert the demo world (SPEC.md §Demo world).

Usage (from the repo root)::

    DEMO_MODE=1 python scripts/validate.py --mock    # in-process chain, no AWS credentials
    python scripts/validate.py --live                # deployed API + Step Functions

Runs ``check`` on the 15 items one after another (sequential by design: Lambda concurrency is
10), waits for each execution to stop, then asserts:

* exactly 1 ``alert`` among the non-vehicle items: the medicine, ``verifier = deterministic``,
  ``sold_after_notice = true``;
* exactly 1 ``dismiss`` whose reason starts with ``batch FT5428 not in listed batches``;
* the vehicle is ``alert`` or ``hold``;
* the 12 remaining items are ``clear`` (no case).

Prints a table and ``PASS`` / ``FAIL``; exit status 0 / 1 (2 = could not run). ``--mock`` seeds
the local store itself when it is empty; ``--live`` never writes items on its own.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
for extra in (REPO_ROOT / "backend", Path(__file__).resolve().parent):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

import demo_world  # noqa: E402  (after the sys.path setup above)

TERMINAL = {"SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED"}
# an alert pauses at WaitForApproval for the human: the check itself is over (SPEC step 6)
WAITING = "WAITING_FOR_APPROVAL"
DISMISS_PREFIX = f"batch {demo_world.NEAR_MISS_BATCH} not in listed batches"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="validate.py", description=__doc__.split("\n\n")[0])
    mode = p.add_mutually_exclusive_group(required=True)
    mode.add_argument("--mock", action="store_true", help="DEMO_MODE=1, in-process, no credentials")
    mode.add_argument("--live", action="store_true", help="the deployed API and state machine")
    p.add_argument("--stack", default=os.environ.get("STACK_NAME") or "recallindia")
    p.add_argument("--profile", default=os.environ.get("AWS_PROFILE") or "firstcommit")
    p.add_argument("--timeout", type=int, default=120, help="seconds to wait per execution")
    return p


# --- two ways to reach the same API ------------------------------------------------


class MockApi:
    """Calls the API Lambda handler in-process (DEMO_MODE chain; nothing leaves the machine)."""

    def __init__(self) -> None:
        from api import app

        self._handler = app.handler
        self.household = ""

    def call(self, method: str, path: str) -> tuple[int, dict]:
        event = {
            "requestContext": {"http": {"method": method}},
            "rawPath": path,
            "headers": {"x-household": self.household} if self.household else {},
        }
        resp = self._handler(event, None)
        return resp["statusCode"], json.loads(resp["body"] or "{}")

    def wait(self, started: dict, timeout: int) -> str:
        return str(started.get("status") or "SUCCEEDED")  # the demo chain is synchronous


class LiveApi:
    def __init__(self, api_url: str) -> None:
        import boto3

        self._base = api_url.rstrip("/")
        self._sfn = boto3.client("stepfunctions")
        self.household = ""

    def call(self, method: str, path: str) -> tuple[int, dict]:
        req = urllib.request.Request(
            self._base + path, method=method, data=b"" if method == "POST" else None
        )
        if self.household:
            req.add_header("x-household", self.household)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read() or b"{}")

    def wait(self, started: dict, timeout: int) -> str:
        arn = started.get("execution_arn")
        if not arn:
            return "NO_EXECUTION"
        item_id = started.get("item_id")
        deadline = time.monotonic() + timeout
        status = "RUNNING"
        while time.monotonic() < deadline:
            status = self._sfn.describe_execution(executionArn=arn)["status"]
            if status in TERMINAL:
                return status
            if item_id:  # paused for approval = done deciding (check-status reads the history)
                quoted = urllib.parse.quote(str(item_id), safe="")
                code, body = self.call("GET", f"/items/{quoted}/check-status")
                if code == 200 and body.get("status") == WAITING:
                    return WAITING
            time.sleep(2)
        return f"{status} (timed out after {timeout}s)"


# --- run + assert ------------------------------------------------------------------


def item_key(row: dict) -> tuple:
    """What makes a copied item the same thing as its demo-world entry."""
    return (
        str(row.get("kind") or ""),
        str(row.get("name") or "").lower(),
        str(row.get("batch") or row.get("serial") or row.get("reg_no") or row.get("year") or ""),
    )


def own_household(api) -> dict[str, str]:
    """Make a copy of the demo wall and map each demo item to its copy's id.

    The demo household is read-only, so a validation run gets its own copy (UI-SPEC §7): the
    same 15 things, new ids.
    """
    status, made = api.call("POST", "/households")
    if status not in (200, 201) or not made.get("household_id"):
        raise SystemExit(f"validate: POST /households -> HTTP {status}: {made.get('error')}")
    api.household = str(made["household_id"])
    status, listing = api.call("GET", "/items")
    if status != 200:
        raise SystemExit(f"validate: GET /items -> HTTP {status}")
    rows = listing.get("items", [])
    by_source = {str(r["copied_from"]): str(r["item_id"]) for r in rows if r.get("copied_from")}
    by_fields = {item_key(r): str(r["item_id"]) for r in rows}
    copies: dict[str, str] = {}
    for entry in demo_world.DEMO_ITEMS:
        found = by_source.get(entry["item_id"]) or by_fields.get(item_key(entry))
        if found:
            copies[entry["item_id"]] = found
    missing = [e["item_id"] for e in demo_world.DEMO_ITEMS if e["item_id"] not in copies]
    if missing:
        raise SystemExit(f"validate: the copy is missing {missing}")
    print(f"validate: own household {api.household} with {len(copies)} copied things")
    return copies


def wait_for_copy(api, copies: dict[str, str], timeout: int) -> set[str]:
    """Wait for the checks the copy started itself; returns the item ids that never finished.

    ``POST /households`` starts one check per copied item (Map, MaxConcurrency 3). Re-checking
    them here would double every execution, so the validator watches the wall fill instead --
    the same thing a visitor sees -- and only starts a check for an item that never did.
    """
    wanted = set(copies.values())
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status, listing = api.call("GET", "/items")
        rows = {str(r["item_id"]): r for r in listing.get("items", [])} if status == 200 else {}
        pending = {i for i in wanted if not rows.get(i, {}).get("last_checked_at")}
        if not pending:
            return set()
        time.sleep(2)
    return pending


def check_all(api, timeout: int, copies: dict[str, str] | None = None,
              recheck: set[str] | None = None) -> list[dict]:  # fmt: skip
    rows: list[dict] = []
    for entry in demo_world.DEMO_ITEMS:
        item_id = (copies or {}).get(entry["item_id"], entry["item_id"])
        quoted = urllib.parse.quote(item_id, safe="")
        row = {"item_id": entry["item_id"], "copy_id": item_id, "name": entry["name"],
               "expected": entry["expected"]}  # fmt: skip
        if recheck is None or item_id in recheck:
            status, started = api.call("POST", f"/items/{quoted}/check")
            if status not in (200, 202):
                row.update(
                    decision="ERROR", detail=f"check -> HTTP {status}: {started.get('error')}"
                )
                rows.append(row)
                continue
            row["execution"] = api.wait(started, timeout)
        else:
            row["execution"] = "COPY"  # the household copy checked it
        status, item = api.call("GET", f"/items/{quoted}")
        case = item.get("case") or {}
        row.update(
            decision=case.get("decision") or ("clear" if item.get("status") == "clear" else "?"),
            item_status=item.get("status"),
            case_status=case.get("status"),
            verifier=case.get("verifier"),
            sold_after_notice=case.get("sold_after_notice"),
            reason=case.get("reason") or "",
            has_case=bool(case),
        )
        rows.append(row)
    return rows


def assess(rows: list[dict]) -> list[str]:
    """Every way the demo world can be wrong, in words. Empty list = PASS."""
    problems: list[str] = []
    by_id = {r["item_id"]: r for r in rows}
    for r in rows:
        if r.get("decision") in ("ERROR", "?"):
            problems.append(f"{r['item_id']}: {r.get('detail') or 'no decision recorded'}")
        elif r.get("execution") not in (None, "COPY", "SUCCEEDED", WAITING):
            problems.append(f"{r['item_id']}: execution {r['execution']}")

    vehicle = by_id[demo_world.VEHICLE["item_id"]]
    others = [r for r in rows if r is not vehicle]

    alerts = [r for r in others if r.get("decision") == "alert"]
    if [r["item_id"] for r in alerts] != [demo_world.ALERT["item_id"]]:
        problems.append(
            f"expected exactly 1 alert (demo-alert), got {[r['item_id'] for r in alerts]}"
        )
    for r in alerts:
        # an alert must stop at the human gate (WaitForApproval), never run on to a letter
        waiting = r.get("execution") in (None, WAITING) or (
            r.get("case_status") == "waiting_approval"
        )
        if not waiting:
            problems.append(
                f"{r['item_id']}: alert is {r.get('case_status')!r} "
                f"(execution {r.get('execution')!r}), not waiting for approval"
            )
        if r.get("verifier") != "deterministic":
            problems.append(
                f"{r['item_id']}: verifier is {r.get('verifier')!r}, not 'deterministic'"
            )
        if r.get("sold_after_notice") is not True:
            problems.append(f"{r['item_id']}: sold_after_notice is {r.get('sold_after_notice')!r}")

    dismisses = [r for r in rows if r.get("decision") == "dismiss"]
    if [r["item_id"] for r in dismisses] != [demo_world.NEAR_MISS["item_id"]]:
        problems.append(
            f"expected exactly 1 dismiss (demo-nearmiss), got {[r['item_id'] for r in dismisses]}"
        )
    for r in dismisses:
        if not str(r.get("reason", "")).startswith(DISMISS_PREFIX):
            problems.append(f"{r['item_id']}: reason {r.get('reason')!r} lacks {DISMISS_PREFIX!r}")

    if vehicle.get("decision") not in ("alert", "hold"):
        problems.append(f"vehicle decision is {vehicle.get('decision')!r}, expected alert or hold")

    expected_clear = {e["item_id"] for e in demo_world.CLEAR}
    got_clear = {
        r["item_id"] for r in rows if r.get("decision") == "clear" and not r.get("has_case")
    }
    if got_clear != expected_clear:
        problems.append(
            f"expected 12 clear; not clear: {sorted(expected_clear - got_clear)}; "
            f"unexpectedly clear: {sorted(got_clear - expected_clear)}"
        )
    return problems


def print_table(rows: list[dict]) -> None:
    print(f"\n{'item_id':15s} {'expected':14s} {'decision':9s} {'verifier':14s} {'sold':6s} reason")
    for r in rows:
        expected = "alert|hold" if r["expected"] == "vehicle" else r["expected"]
        sold = "" if r.get("sold_after_notice") is None else str(r["sold_after_notice"]).lower()
        reason = (r.get("reason") or r.get("detail") or "")[:70]
        print(
            f"{r['item_id']:15s} {expected:14s} {str(r.get('decision')):9s} "
            f"{str(r.get('verifier') or '-'):14s} {sold:6s} {reason}"
        )


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.mock:
        os.environ["DEMO_MODE"] = "1"
        from common import dynamo

        if dynamo.get("items", f"user#{demo_world.ALERT['item_id']}") is None:
            import seed_demo

            print("validate: local store has no demo items - seeding it first (--mock only)")
            if seed_demo.main(["--mock"]) != 0:
                return 2
        api, mode = MockApi(), "mock (in-process, no AWS credentials)"
    else:
        from _live import SetupError, configure_live

        try:
            outputs = configure_live(args.stack, args.profile)
        except SetupError as exc:
            print(f"validate: {exc}", file=sys.stderr)
            return 2
        api, mode = LiveApi(outputs["ApiUrl"]), f"live ({outputs['ApiUrl']})"
    print(f"validate: mode={mode}; checking {len(demo_world.DEMO_ITEMS)} items sequentially")

    t0 = time.monotonic()
    copies = own_household(api)
    late = wait_for_copy(api, copies, args.timeout)
    if late:
        print(f"validate: {len(late)} item(s) the copy did not check; checking them here")
    rows = check_all(api, args.timeout, copies, late)
    print_table(rows)
    problems = assess(rows)
    counts = {
        d: sum(1 for r in rows if r.get("decision") == d)
        for d in ("alert", "hold", "dismiss", "clear")
    }
    print(f"\ncounts: {counts}  took={time.monotonic() - t0:.1f}s")
    if problems:
        print("FAIL")
        for p in problems:
            print(f"  - {p}")
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
