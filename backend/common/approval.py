"""The human gate on an alert case (UI-SPEC §7): one Step Functions task token.

``request`` stores the token WaitForApproval's Lambda receives and puts the case in
``waiting_approval``. ``end_wait`` is the only way out, and it is atomic: one conditional write
moves ``waiting_approval`` to ``approving`` / ``rejected`` / ``expired``, removes the token,
stamps the approve step and appends the audit entry, and hands the old token back. A second
approve, an approve racing a reject, or an approve after the 24 h timeout loses the condition and
gets ``TokenGone`` -- so the caller calls Step Functions at most once per token, and never for a
case that is not waiting.
"""

from __future__ import annotations

from typing import Any

from common import dynamo
from common.demo_mode import is_demo
from common.schemas import Approval, AuditEvent, CaseSteps

WAITING = "waiting_approval"
# the case status each ending leaves behind; "approving" then continues in the state machine
ENDINGS = {"approved": "approving", "rejected": "rejected", "expired": "expired"}


class TokenGone(Exception):
    """The case is not waiting for approval (never issued, already used, or expired)."""


def request(case_id: str, *, task_token: str, at: str, execution_arn: str | None) -> dict:
    """WaitForApproval: store the token on the case; returns the stored approval (no token)."""
    case = dynamo.get("cases", case_id)
    if case is None or case.get("rk") != "case":
        raise LookupError(f"case {case_id!r} not found")
    if case.get("decision") != "alert":
        raise ValueError(f"case {case_id!r} is {case.get('decision')!r}: only an alert waits")
    approval = Approval(status="waiting", task_token=task_token, token_issued_at=at)
    steps = CaseSteps(**(case.get("steps") or {}))
    steps.approve.started_at = at
    case["approval"] = approval.model_dump()
    case["steps"] = steps.model_dump()
    case["status"] = WAITING
    case.setdefault("audit", []).append(
        AuditEvent(
            ts=at, event="approval.requested", detail={"execution_arn": execution_arn}
        ).model_dump()
    )
    dynamo.put("cases", case)
    return {k: v for k, v in case["approval"].items() if k != "task_token"}


def end_wait(
    case_id: str,
    *,
    status: str,
    at: str,
    approver: str = "demo-user",
    reason: str | None = None,
    detail: dict | None = None,
) -> str:
    """Atomically end the wait (``waiting_approval`` -> the status that ending leaves behind);
    returns the task token it removed.

    Raises ``TokenGone`` when the case is not waiting (or does not exist).
    """
    if status not in ENDINGS:
        raise ValueError(f"status must be one of {tuple(ENDINGS)}")
    case_status = ENDINGS[status]
    entry = AuditEvent(
        ts=at, event=f"approval.{status}", detail={"approver": approver, **(detail or {})}
    ).model_dump()
    if is_demo():
        return _end_wait_demo(case_id, status=status, case_status=case_status, at=at,
                              approver=approver, reason=reason, entry=entry)  # fmt: skip
    table = dynamo._table("cases")
    try:
        resp = table.update_item(
            Key={"pk": case_id},
            UpdateExpression=(
                "SET #cs = :case_status, approval.#st = :to, approval.#when = :at, "
                "approval.approver = :who, approval.reason = :why, "
                "steps.approve.finished_at = :at, "
                "audit = list_append(if_not_exists(audit, :none), :entry) "
                "REMOVE approval.task_token"
            ),
            ConditionExpression=(
                "attribute_exists(pk) AND #cs = :waiting AND attribute_exists(approval.task_token)"
            ),
            ExpressionAttributeNames={"#st": "status", "#when": f"{status}_at", "#cs": "status"},
            ExpressionAttributeValues={
                ":case_status": case_status,
                ":to": status,
                ":at": at,
                ":who": approver,
                ":why": reason,
                ":waiting": WAITING,
                ":entry": [dynamo._to_dynamo(entry)],
                ":none": [],
            },
            ReturnValues="ALL_OLD",
        )
    except Exception as exc:
        if "ConditionalCheckFailed" in type(exc).__name__ or "ConditionalCheckFailed" in str(exc):
            raise TokenGone(case_id) from None
        raise
    token = ((resp.get("Attributes") or {}).get("approval") or {}).get("task_token")
    if not token:  # cannot happen past the condition; never hand back a blank token
        raise TokenGone(case_id)
    return str(token)


def _end_wait_demo(
    case_id: str,
    *,
    status: str,
    case_status: str,
    at: str,
    approver: str,
    reason: str | None,
    entry: dict,
) -> str:
    data = dynamo._load("cases")
    case: dict[str, Any] | None = data.get(case_id)
    approval = (case or {}).get("approval") or {}
    if not case or case.get("status") != WAITING or not approval.get("task_token"):
        raise TokenGone(case_id)
    token = str(approval.pop("task_token"))
    approval.update({"status": status, f"{status}_at": at, "approver": approver, "reason": reason})
    steps = CaseSteps(**(case.get("steps") or {}))
    steps.approve.finished_at = at
    case.update({"approval": approval, "status": case_status, "steps": steps.model_dump()})
    case.setdefault("audit", []).append(entry)
    dynamo._save("cases", data)
    return token


def public(approval: dict | None) -> dict | None:
    """The approval as the API shows it: never the token."""
    if not isinstance(approval, dict):
        return None
    return {k: v for k, v in approval.items() if k != "task_token"}
