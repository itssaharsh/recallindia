"""The demo household's finished case, at a fixed id (P08-P09 §1d).

`/case/?id=case_demo_ft5427` is the link in the README and the one a judge opens from the demo
wall: it must always exist and always be finished (sealed, letter written, verified), because the
demo household is read-only and nobody can approve it.

This script builds that case from the live demo item and runs the three pipeline steps directly
-- the internal override of the human gate -- so no task token and no Step Functions execution is
involved. ``seed_demo.py --reset`` calls it, so the id survives a reset.

    python scripts/seed_demo_case.py --live --profile firstcommit
    python scripts/seed_demo_case.py --mock
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

import demo_world  # noqa: E402  (after sys.path)

CASE_ID = "case_demo_ft5427"
ITEM_ID = demo_world.ALERT["item_id"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--mock", action="store_true", help="the local demo store")
    parser.add_argument("--live", action="store_true", help="the deployed stack")
    parser.add_argument("--stack", default="recallindia")
    parser.add_argument("--profile", default="firstcommit")
    parser.add_argument("--region", default="ap-south-1")
    return parser


def make_case(dynamo, item: dict, notice: dict, now: str) -> dict:
    """The case the matcher would have written, at the fixed id."""
    from common.schemas import Approval, AuditEvent, Case, RangeCheck

    listed = ", ".join(str(b) for b in (notice.get("batches") or []))
    batch = str(item.get("batch") or "")
    reason = (
        f"failed CDSCO quality test, {(notice.get('row_ref') or {}).get('month')} alert, "
        f"row {(notice.get('row_ref') or {}).get('row')}; "
        f"batch {batch} in listed batches [{listed}]"
    )
    case = Case(
        case_id=CASE_ID,
        pk=Case.make_pk(CASE_ID),
        item_id=ITEM_ID,
        household_id="demo",
        notice_id=str(notice["pk"]),
        decision="alert",
        status="approving",  # the three steps below move it to verified
        reason=reason,
        quoted_sentence=str(notice.get("raw_excerpt") or "").split("\n")[0],
        range_check=RangeCheck(listed=listed, yours=batch, inside=True),
        sold_after_notice=True,
        verifier="deterministic",
        confidence=0.95,
        reasoning=(
            f"brand {notice.get('brand')!r} matches; product {item.get('name')!r} fuzzy 100; "
            f"batch {batch} in listed [{listed}]"
        ),
        covers_item=True,
        created_at=now,
        approval=Approval(
            status="approved",
            token_issued_at=now,
            approved_at=now,
            approver="seed:demo-household",
            task_token=None,
        ),
        audit=[
            AuditEvent(ts=now, event="case.created", detail={"decision": "alert", "seed": True}),
            AuditEvent(ts=now, event="decision.alert", detail={"reason": reason}),
            AuditEvent(
                ts=now,
                event="approval.approved",
                detail={"approver": "seed:demo-household", "note": "seeded, not a task token"},
            ),
        ],
    )
    data = case.model_dump()
    data["steps"]["approve"] = {"started_at": now, "finished_at": now, "error": None}
    dynamo.put("cases", data)
    item["case_id"] = CASE_ID
    item["status"] = "alert"
    item["last_checked_at"] = now
    item["last_check_at"] = now
    # not a Step Functions arn on purpose: check-status then answers from the item and the case
    # (this case was sealed by the seed, not by an execution), so the case page asks once and
    # gets its verification chain instead of a 404.
    item["last_check_arn"] = f"seeded:{CASE_ID}"
    dynamo.put("items", item)
    return data


def approve_admin(case_id: str, mock: bool, timeout: int = 240) -> str:
    """Approve a waiting case without going through the API, and return the case's status.

    The demo household is read-only (``demo_read_only``), so a judge cannot answer its cases --
    and a case left waiting expires 24 h after a reset, which is what a judge would then read.
    The seed answers them here instead: the same conditional write the API does, then the task
    token is spent so the state machine itself seals the evidence, writes the letter and verifies
    the signature (and the paused execution ends).
    """
    import time

    from common import approval as gate
    from common import dynamo
    from common.notices import now_iso

    case = dynamo.get("cases", case_id)
    if case is None:
        raise SystemExit(f"seed_demo_case: no case {case_id!r}")
    if case.get("status") == "verified":
        return "verified"
    try:
        token = gate.end_wait(
            case_id, status="approved", at=now_iso(), approver="seed:demo-household"
        )
    except gate.TokenGone:
        return str((dynamo.get("cases", case_id) or {}).get("status") or "")

    if mock or token.startswith("demo-token-"):
        from matcher import claim, evidence

        evidence.seal(case_id)
        claim.draft(case_id)
        evidence.verify(case_id)
    else:
        import boto3

        boto3.client("stepfunctions").send_task_success(
            taskToken=token,
            output=json.dumps(
                {"approved": True, "approver": "seed:demo-household", "approved_at": now_iso()}
            ),
        )
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            status = str((dynamo.get("cases", case_id) or {}).get("status") or "")
            if status in ("verified", "error", "rejected", "expired"):
                break
            time.sleep(2)
    return str((dynamo.get("cases", case_id) or {}).get("status") or "")


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.live:
        from _live import SetupError, configure_live

        try:
            configure_live(args.stack, args.profile, args.region)
        except SetupError as exc:
            print(f"seed_demo_case: {exc}", file=sys.stderr)
            return 2
    else:
        os.environ["DEMO_MODE"] = "1"

    from common import dynamo
    from common.notices import now_iso
    from common.schemas import Item
    from matcher import claim, evidence

    item = dynamo.get("items", Item.make_pk(ITEM_ID))
    if item is None:
        print(f"seed_demo_case: no item {ITEM_ID!r}; run seed_demo.py first", file=sys.stderr)
        return 2
    from seed_demo import find_alert_notice

    notice = find_alert_notice(dynamo)
    if notice is None:
        print("seed_demo_case: no CDSCO notice lists the demo batch", file=sys.stderr)
        return 2

    now = now_iso()
    make_case(dynamo, item, notice, now)
    sealed = evidence.seal(CASE_ID)
    letter = claim.draft(CASE_ID)
    checked = evidence.verify(CASE_ID)
    case = dynamo.get("cases", CASE_ID) or {}
    print(
        f"seed_demo_case: {CASE_ID} -> {case.get('status')}\n"
        f"  evidence  sha256 {sealed.get('sha256', '')[:16]}… · {sealed.get('kind')} · "
        f"locked until {sealed.get('retain_until')}\n"
        f"  letter    {letter.get('claim_pdf_s3_key')} ({letter.get('bytes')} bytes, "
        f"to the {letter.get('addressee')})\n"
        f"  verify    valid={checked.get('valid')}"
    )
    return 0 if case.get("status") == "verified" else 1


if __name__ == "__main__":
    sys.exit(main())
