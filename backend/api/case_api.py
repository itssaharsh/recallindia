"""Case endpoints: the human gate, the claim letter and the signed evidence (UI-SPEC §7).

Guards, in this order, for ``approve`` and ``reject``:

1. the case must exist -> 404;
2. the household comes **only** from the ``X-Household`` header and must own the case -> 404
   (a case you do not own is indistinguishable from one that does not exist);
3. the demo household is read-only -> 403 ``demo_read_only``;
4. a per-household cap on approvals -> 429 ``demo_busy``;
5. a DynamoDB conditional update ``status: waiting_approval -> approving`` (``common.approval``).
   Step Functions is called **only** after that update succeeds, so a token is spent at most
   once and a second answer is a 409 carrying the case as it now stands.

Reads (case, claim, verify-evidence) are allowed from the owning household and, for demo cases,
from any household: the video's case is a demo case and a judge must be able to open it.
"""

from __future__ import annotations

import json
import os
from typing import Any

from common import approval as gate
from common import dynamo, households, s3, signing
from common.demo_mode import is_demo
from common.notices import now_iso
from common.schemas import AuditEvent, Case

Result = tuple[int, dict]

DEMO_TOKEN_PREFIX = "demo-token-"
CLAIM_URL_SECONDS = 300  # UI-SPEC C-18: the letter's links live 5 minutes
TAMPER_BYTE = 1_024
TAMPER_NOTE = (
    "demo control: one byte of the downloaded copy was flipped in memory; nothing stored changed"
)


def _sfn_client() -> Any:
    """boto3 Step Functions client (module-level so tests can monkeypatch a fake)."""
    import boto3  # lazy: demo mode must not need boto3 credentials

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    return boto3.client("stepfunctions", region_name=region)


def _case_id(params: dict) -> str:
    return str((params or {}).get("id") or "").strip()


def _load(case_id: str) -> dict | None:
    case = dynamo.get("cases", Case.make_pk(case_id)) if case_id else None
    return case if case and case.get("rk") == "case" else None


def public_case(case: dict) -> dict:
    """The case as the API returns it: never the task token."""
    return {**case, "approval": gate.public(case.get("approval"))}


def _readable(params: dict, event: dict) -> tuple[dict | None, str, Result | None]:
    """The case if this household may read it, else the refusal to return."""
    case_id = _case_id(params)
    case = _load(case_id)
    household = households.from_event(event)
    if case is None or not households.readable(case, household):
        return None, household, (404, {"error": "not found", "case_id": case_id})
    return case, household, None


def _append_audit(case_id: str, event: str, detail: dict) -> None:
    case = _load(case_id)
    if case is None:
        return
    case.setdefault("audit", []).append(
        AuditEvent(ts=now_iso(), event=event, detail=detail).model_dump()
    )
    dynamo.put("cases", case)


def _matcher_steps() -> tuple[Any, Any, Any] | None:
    """The pipeline Lambdas, imported here so the API Lambda does not need them at import time."""
    try:
        from matcher import claim, evidence
    except ImportError:
        return None
    return evidence.seal, claim.draft, evidence.verify


def _demo_after_approval(case_id: str) -> dict:
    """DEMO_MODE has no Step Functions: run the three steps in order, in process."""
    steps = _matcher_steps()
    if steps is None:
        return {"error": "demo chain needs the matcher modules"}
    seal, draft, verify = steps
    sealed = seal(case_id)
    letter = draft(case_id)
    return {"seal_evidence": sealed, "write_letter": letter, "verify": verify(case_id)}


def _answer(params: dict, event: dict, *, approve: bool) -> Result:
    case_id = _case_id(params)
    case = _load(case_id)
    household = households.from_event(event)
    # 1 + 2: unknown, or not this household's: the same answer either way
    if case is None or not households.owns(case, household):
        return 404, {"error": "not found", "case_id": case_id}
    # 3: the wall the video shows can be read by anyone and changed by nobody
    if households.is_demo_household(household):
        return 403, {"error": "demo_read_only", "case_id": case_id}
    # 4: a public demo is not free compute
    if approve:
        try:
            households.take_approval_slot(household)
        except households.Capped:
            return 429, {"error": "demo_busy", "case_id": case_id}
    now = now_iso()
    status = "approved" if approve else "rejected"
    approver = f"household:{household}"
    # 5: the conditional update is the gate; Step Functions is only called after it succeeds
    try:
        token = gate.end_wait(
            case_id,
            status=status,
            at=now,
            approver=approver,
            reason=None if approve else "rejected on the case page",
        )
    except gate.TokenGone:
        fresh = _load(case_id) or {}
        return 409, {
            "error": "this case is not waiting for approval",
            "case": public_case(fresh) if fresh else None,
            "status": fresh.get("status"),
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
                    output=json.dumps({"approved": True, "approver": approver, "approved_at": now}),
                )
            else:
                _sfn_client().send_task_failure(
                    taskToken=token,
                    error="Rejected",
                    cause=(
                        "The claim was rejected on the case page "
                        "(POST /cases/{id}/reject -> SendTaskFailure); no evidence, no letter."
                    ),
                )
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            _append_audit(case_id, "approval.send_failed", {"error": error, "status": status})
            if approve:
                # the token died between the condition and the call (the 24 h timeout)
                fresh = _load(case_id)
                if fresh is not None:
                    fresh["status"] = "expired"
                    fresh["approval"] = {**(fresh.get("approval") or {}), "status": "expired",
                                         "expired_at": now_iso()}  # fmt: skip
                    dynamo.put("cases", fresh)
                return 409, {
                    "error": f"the approval window has closed ({error})",
                    "case_id": case_id,
                    "status": "expired",
                }
            body["warning"] = f"the case is rejected, but Step Functions said: {error}"
    fresh = _load(case_id) or {}
    body["case"] = public_case(fresh) if fresh else None
    body["status"] = fresh.get("status")
    body["approval"] = gate.public(fresh.get("approval"))
    return 200, body


def approve_case(params: dict, event: dict) -> Result:
    """``POST /cases/{id}/approve``."""
    return _answer(params, event, approve=True)


def reject_case(params: dict, event: dict) -> Result:
    """``POST /cases/{id}/reject``."""
    return _answer(params, event, approve=False)


def get_case(params: dict, event: dict) -> Result:
    """``GET /cases/{id}``: one case, without its task token."""
    case, _household, refused = _readable(params, event)
    if refused:
        return refused
    return 200, public_case(case or {})


def list_cases(_params: dict, event: dict) -> Result:
    """``GET /cases``: this household's cases, newest first (the ``household_id-index`` GSI)."""
    household = households.from_event(event)
    rows = dynamo.query_household("cases", household)
    cases = [public_case(r) for r in rows if r.get("rk") == "case"]
    return 200, {"cases": cases, "count": len(cases), "household_id": household}


def _paragraphs(text: str | None, count: int = 2) -> list[str]:
    """The first paragraphs of the letter, for the preview (C-18) -- never a placeholder."""
    blocks = [b.strip() for b in str(text or "").split("\n\n") if b.strip()]
    body = [b for b in blocks if not b.startswith(("To:", "Subject:", "Dear ")) and len(b) > 60]
    return body[:count]


def claim_url(params: dict, event: dict) -> Result:
    """``GET /cases/{id}/claim``: short-lived links to the letter, plus its opening paragraphs."""
    case, _household, refused = _readable(params, event)
    if refused:
        return refused
    case = case or {}
    case_id = str(case.get("case_id") or _case_id(params))
    key = case.get("claim_pdf_s3_key")
    if not key:
        return 404, {
            "error": "no claim letter yet: it is written after the evidence is sealed",
            "case_id": case_id,
        }
    name = f"recallindia-claim-{case_id}.pdf"
    try:
        view = s3.presigned_url("claims", str(key), CLAIM_URL_SECONDS)
        download = s3.presigned_url(
            "claims",
            str(key),
            CLAIM_URL_SECONDS,
            params={"ResponseContentDisposition": f'attachment; filename="{name}"'},
        )
    except Exception as exc:
        return 502, {"error": f"presign failed: {type(exc).__name__}: {exc}"}
    return 200, {
        "case_id": case_id,
        "key": key,
        "view": view,
        "download": download,
        # kept so an older client (and the demo fixture) still finds a single url
        "url": view,
        "expires_in": CLAIM_URL_SECONDS,
        "created_at": case.get("claim_created_at"),
        "addressee": case.get("claim_addressee"),
        "paragraphs": _paragraphs(case.get("claim_text")),
    }


def verify_evidence(params: dict, event: dict) -> Result:
    """``GET /cases/{id}/verify-evidence[?tamper=1]``.

    Reads the locked object version back, hashes it and asks KMS. ``tamper=1`` flips one byte of
    the downloaded copy in memory first: a labelled demo control. This endpoint never writes the
    case, so a judge's tamper test cannot change what the next visitor sees.
    """
    case, _household, refused = _readable(params, event)
    if refused:
        return refused
    case = case or {}
    case_id = str(case.get("case_id") or _case_id(params))
    evidence = case.get("evidence")
    if not isinstance(evidence, dict) or not evidence.get("snapshot_s3_key"):
        return 409, {
            "error": "no signed evidence yet: it is sealed after you approve",
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
    flipped_index = byte_before = byte_after = None
    if tamper and data:
        index = TAMPER_BYTE if len(data) > TAMPER_BYTE else len(data) // 2
        flipped = bytearray(data)
        byte_before = flipped[index]
        flipped[index] ^= 0x01
        byte_after = flipped[index]
        flipped_index = index
        data = bytes(flipped)
    recomputed = signing.sha256_hex(data)
    try:
        valid = recomputed == str(evidence.get("sha256") or "") and signing.verify_digest(
            bytes.fromhex(recomputed),
            str(evidence.get("signature_b64") or ""),
            str(evidence["kms_key_id"]),
        )
    except Exception as exc:
        return 502, {"error": f"KMS Verify failed: {type(exc).__name__}: {exc}"}
    return 200, {
        "case_id": case_id,
        "valid": valid,
        "sha256": evidence.get("sha256"),
        "recomputed_sha256": recomputed,
        "flipped_byte_index": flipped_index,
        "byte_before": byte_before,
        "byte_after": byte_after,
        "signed_at": evidence.get("signed_at"),
        "key_id": evidence.get("kms_key_id"),
        "key_alias": evidence.get("key_alias"),
        "algorithm": evidence.get("signing_algorithm"),
        "retain_until": evidence.get("object_lock_retain_until"),
        "snapshot_s3_key": evidence.get("snapshot_s3_key"),
        "tampered": tamper,
        "demo_control": TAMPER_NOTE if tamper else None,
        "checked_at": now_iso(),
    }
