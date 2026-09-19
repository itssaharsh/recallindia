"""Match pipeline step 6: WaitForApproval and ExpireApproval (SPEC §Match pipeline).

WaitForApproval invokes this with ``lambda:invoke.waitForTaskToken`` and ``action: request``: the
task token goes onto the case (``approval.status = waiting``, ``token_issued_at``) and the
execution pauses until the case page calls ``POST /cases/{id}/approve`` (SendTaskSuccess) or
``/reject`` (SendTaskFailure). Only ``alert`` decisions get here (the IsAlert choice).

After 24 h without an answer the task times out and ExpireApproval calls this with
``action: expire``: the case moves ``waiting -> expired`` in the same conditional write that
removes the (now dead) token. A case that was approved or rejected in the meantime is left as it is.

``request`` raises on failure on purpose: a token that was never stored would leave the
execution paused for 24 h with nobody able to answer it, so the task fails instead.
"""

from __future__ import annotations

from common.approval import TokenGone, end_wait, request
from common.notices import now_iso

EXPIRY_REASON = "no answer within 24 hours"


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    action = str(event.get("action") or "request")
    case_id = str(event.get("case_id") or "").strip()
    run = event.get("run") if isinstance(event.get("run"), dict) else {}
    if not case_id:
        raise ValueError("case_id is required")
    if action == "request":
        token = str(event.get("task_token") or "").strip()
        if not token:
            raise ValueError("task_token is required")
        approval = request(
            case_id, task_token=token, at=now_iso(), execution_arn=run.get("execution_arn")
        )
        return {"case_id": case_id, "approval": approval}
    if action == "expire":
        try:
            end_wait(
                case_id,
                status="expired",
                at=now_iso(),
                approver="timeout",
                reason=EXPIRY_REASON,
                detail={"execution_arn": run.get("execution_arn")},
            )
        except TokenGone:
            return {"case_id": case_id, "status": "unchanged"}
        return {"case_id": case_id, "status": "expired"}
    raise ValueError(f"unknown action {action!r}")
