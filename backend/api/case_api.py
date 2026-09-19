"""``/cases/{id}`` actions: approve / reject the claim (the task token), the claim PDF, and
evidence verification (SPEC §Match pipeline steps 6-8).

* ``POST /cases/{id}/approve`` -> ``SendTaskSuccess`` on the WaitForApproval token; the execution
  goes on to Claim and Evidence. ``POST /cases/{id}/reject`` -> ``SendTaskFailure("Rejected")``.
  Both first check the case (unknown -> 404; not an alert, not waiting yet, or already
  answered -> 409) and then win the single-use gate (``common.approval.end_wait``, one
  conditional write); only the winner calls Step Functions, exactly once. A second call, or two
  racing calls, get 409 and never reach Step Functions.
* ``GET /cases/{id}/claim`` -> a presigned URL for the claim letter PDF.
* ``GET /cases/{id}/verify-evidence[?tamper=1]`` -> re-download the snapshot (the exact
  version), re-hash, and ask KMS whether the stored signature matches. ``tamper=1`` is a demo
  control: it flips one byte of the downloaded copy in memory before hashing (nothing stored
  changes), so the signature check must fail.

DEMO_MODE has no Step Functions: the demo chain paused at WaitForApproval with a local token,
and approving runs Claim and Evidence in-process.
"""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import unquote

from common import approval as gate
from common import dynamo, s3, signing
from common.demo_mode import is_demo
from common.notices import now_iso
from common.schemas import AuditEvent, Case

Result = tuple[int, dict]

APPROVER = "demo-user"  # no auth in this app (DEMO_SCRIPT): one demo user
DEMO_TOKEN_PREFIX = "demo-token-"
CLAIM_URL_SECONDS = 600
TAMPER_NOTE = (
    "demo control: one byte of the downloaded copy was flipped in memory; nothing stored changed"
)


def _sfn_client() -> Any:
    """boto3 Step Functions client (module-level so tests can monkeypatch a fake)."""
    import boto3  # lazy: demo mode must not need boto3 credentials

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    return boto3.client("stepfunctions", region_name=region)


def _case_id(params: dict) -> str:
    return unquote(str(params.get("id") or "")).strip()


def _load(case_id: str) -> dict | None:
    case = dynamo.get("cases", Case.make_pk(case_id)) if case_id else None
    return case if case and case.get("rk") == "case" else None  # an events# row is not a case


def public_case(case: dict) -> dict:
    """The case as the API returns it: the task token never leaves the table."""
    out = dict(case)
    if "approval" in out:
        out["approval"] = gate.public(out.get("approval"))
    return out


def _not_answerable(case: dict) -> Result | None:
    """409 unless this is an alert case waiting for an answer."""
    decision = case.get("decision")
    if decision != "alert":
        return 409, {
            "error": f"this case is {decision!r}: only an alert case has a claim to approve",
            "case_id": case.get("case_id"),
        }
    approval = case.get("approval") or {}
    if not approval:
        return 409, {"error": "this case is not waiting for approval", "approval": None}
    if approval.get("status") != "waiting":
        return 409, {
            "error": f"this case was already {approval.get('status')}",
            "approval": gate.public(approval),
        }
    return None


def _append_audit(case_id: str, event: str, detail: dict) -> None:
    case = _load(case_id)
    if case is None:
        return
    case.setdefault("audit", []).append(
        AuditEvent(ts=now_iso(), event=event, detail=detail).model_dump()
    )
    dynamo.put("cases", case)


def _matcher_steps() -> tuple[Any, Any] | None:
    """Claim and Evidence handlers for the in-process demo chain (None in the Lambda layout)."""
    try:
        from matcher import claim, evidence
    except ImportError:
        return None
    return claim.handler, evidence.handler


def _demo_after_approval(case_id: str) -> dict:
    steps = _matcher_steps()
    if steps is None:
        return {"error": "demo chain needs the matcher modules"}
    claim_handler, evidence_handler = steps
    return {
        "claim": claim_handler({"case_id": case_id}, None),
        "evidence": evidence_handler({"case_id": case_id}, None),
    }


def _answer(params: dict, *, approve: bool) -> Result:
    case_id = _case_id(params)
    case = _load(case_id)
    if case is None:
        return 404, {"error": "not found", "case_id": case_id}
    refused = _not_answerable(case)
    if refused:
        return refused
    now = now_iso()
    status = "approved" if approve else "rejected"
    try:
        token = gate.end_wait(
            case_id,
            status=status,
            at=now,
            approver=APPROVER,
            reason=None if approve else "rejected on the case page",
        )
    except gate.TokenGone:
        fresh = _load(case_id) or {}
        return 409, {
            "error": "this case was answered a moment ago",
            "approval": gate.public(fresh.get("approval")),
        }
    body: dict[str, Any] = {"case_id": case_id}
    if is_demo() or token.startswith(DEMO_TOKEN_PREFIX):
        if approve:
            body["demo_chain"] = _demo_after_approval(case_id)
    else:
        try:
            if approve:
                _sfn_client().send_task_success(
                    taskToken=token,
                    output=json.dumps({"approved": True, "approver": APPROVER, "approved_at": now}),
                )
            else:
                _sfn_client().send_task_failure(
                    taskToken=token,
                    error="Rejected",
                    cause=f"Rejected by {APPROVER} on the case page",
                )
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            _append_audit(case_id, "approval.send_failed", {"error": error, "status": status})
            if approve:
                # the token died between the check and now (the 24 h timeout): not approved
                fresh = _load(case_id)
                if fresh is not None:
                    fresh["approval"] = {**(fresh.get("approval") or {}), "status": "expired",
                                         "expired_at": now_iso()}  # fmt: skip
                    dynamo.put("cases", fresh)
                return 409, {
                    "error": f"the approval window has closed ({error})",
                    "case_id": case_id,
                }
            body["warning"] = f"the case is rejected, but Step Functions said: {error}"
    fresh = _load(case_id) or {}
    body["approval"] = gate.public(fresh.get("approval"))
    return 200, body


def approve_case(params: dict, _event: dict) -> Result:
    """``POST /cases/{id}/approve``."""
    return _answer(params, approve=True)


def reject_case(params: dict, _event: dict) -> Result:
    """``POST /cases/{id}/reject``."""
    return _answer(params, approve=False)


def claim_url(params: dict, _event: dict) -> Result:
    """``GET /cases/{id}/claim``: a short-lived link to the claim letter PDF."""
    case_id = _case_id(params)
    case = _load(case_id)
    if case is None:
        return 404, {"error": "not found", "case_id": case_id}
    key = case.get("claim_pdf_s3_key")
    if not key:
        return 404, {
            "error": "no claim letter yet: it is drafted after approval",
            "case_id": case_id,
        }
    try:
        url = s3.presigned_url("claims", str(key), CLAIM_URL_SECONDS)
    except Exception as exc:
        return 502, {"error": f"presign failed: {type(exc).__name__}: {exc}"}
    return 200, {
        "case_id": case_id,
        "key": key,
        "url": url,
        "expires_in": CLAIM_URL_SECONDS,
        "created_at": case.get("claim_created_at"),
    }


def verify_evidence(params: dict, event: dict) -> Result:
    """``GET /cases/{id}/verify-evidence[?tamper=1]``."""
    case_id = _case_id(params)
    case = _load(case_id)
    if case is None:
        return 404, {"error": "not found", "case_id": case_id}
    evidence = case.get("evidence")
    if not isinstance(evidence, dict) or not evidence.get("snapshot_s3_key"):
        return 409, {
            "error": "no signed evidence yet: it is made after approval",
            "case_id": case_id,
        }
    qs = event.get("queryStringParameters") or {}
    tamper = str(qs.get("tamper") or "").strip().lower() in ("1", "true", "yes")
    try:
        data = s3.get_bytes(
            "evidence", str(evidence["snapshot_s3_key"]), evidence.get("snapshot_version_id")
        )
    except Exception as exc:
        return 502, {"error": f"could not read the snapshot: {type(exc).__name__}: {exc}"}
    if tamper and data:
        flipped = bytearray(data)
        flipped[len(flipped) // 2] ^= 0x01
        data = bytes(flipped)
    sha = signing.sha256_hex(data)
    try:
        valid = signing.verify_digest(
            bytes.fromhex(sha),
            str(evidence.get("signature_b64") or ""),
            str(evidence["kms_key_id"]),
        )
    except Exception as exc:
        return 502, {"error": f"KMS Verify failed: {type(exc).__name__}: {exc}"}
    return 200, {
        "case_id": case_id,
        "valid": valid,
        "sha256": sha,
        "recorded_sha256": evidence.get("sha256"),
        "signed_at": evidence.get("signed_at"),
        "key_id": evidence.get("kms_key_id"),
        "algorithm": evidence.get("signing_algorithm"),
        "retain_until": evidence.get("object_lock_retain_until"),
        "snapshot_s3_key": evidence.get("snapshot_s3_key"),
        "tampered": tamper,
        "demo_control": TAMPER_NOTE if tamper else None,
        "checked_at": now_iso(),
    }
