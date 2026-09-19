"""Match pipeline step 8: signed evidence (SPEC §Match pipeline; ADR-007).

After approval (and the claim letter), keep a copy of the notice as the source published it,
so the claim can later prove what the notice said on the day:

1. **Snapshot** the source: a CDSCO archive notice -> the alert PDF itself (raw bucket); a CDSCO
   portal notice -> its row of the month's portal JSON, re-fetched and matched by notice id;
   NHTSA / CPSC / openFDA -> the recall record as their API serves it. If the source cannot be
   fetched, the notice as ingested (``stored_notice``) -- the audit says which.
2. **Write-once**: the bytes go to the evidence bucket with S3 Object Lock, GOVERNANCE mode,
   retained 30 days (``evidence/<case_id>/<sha256[:16]>.<ext>``).
3. **Hash + sign**: SHA-256 of those exact bytes, signed with the stack's KMS RSA_2048 key
   (``RSASSA_PKCS1_V1_5_SHA_256``, ``common.signing``). The private key never leaves KMS.
4. **Record** ``case.evidence`` (hash, key id, signature, retain-until, snapshot key + version,
   signed-at) and an audit entry. ``GET /cases/{id}/verify-evidence`` re-downloads, re-hashes and
   asks KMS to verify.

Never raises: a failure is ``degraded: true`` with ``error`` and an ``evidence.failed`` audit.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from typing import Any
from urllib.parse import quote

from common import case_state, dynamo, s3, signing
from common.cdsco import PORTAL_BASE, fetch_portal_rows, rows_to_notices
from common.demo_mode import fetch_bytes
from common.notices import now_iso
from common.schemas import Evidence

log = logging.getLogger(__name__)

RETAIN_DAYS = 30
LOCK_MODE = "GOVERNANCE"


def source_url(notice: dict) -> str | None:
    """The machine-readable record of a US notice (the page URL is HTML meant for people)."""
    source, nid = notice.get("source"), str(notice.get("notice_id") or "")
    if source == "nhtsa":
        return f"https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber={quote(nid)}"
    if source == "cpsc":
        base = "https://www.saferproducts.gov/RestWebServices/Recall"
        return f"{base}?format=json&RecallID={quote(nid)}"
    if source == "openfda":
        return str(notice.get("url") or "") or None  # already the openFDA JSON lookup URL
    return None


def _canonical(obj: Any) -> bytes:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def _portal_row(notice: dict, fetched_at: str) -> tuple[bytes, str] | None:
    """The notice's own row of the month's portal JSON, as served; None when it is not there."""
    month = str((notice.get("row_ref") or {}).get("month") or "").upper()
    if not month:
        return None
    url = f"{PORTAL_BASE}/filteredNsqDrugTable?month={month}&source=All&tab=nsq"
    for row in fetch_portal_rows(month):
        try:  # the same mapping Normalise used gives the row its notice id
            mapped = rows_to_notices([row], adapter="portal", month=month, source_confidence=None)
        except Exception:  # one malformed row must not hide the others
            continue
        if mapped and mapped[0].get("notice_id") == notice.get("notice_id"):
            payload = {
                "source": "CDSCO NSQ portal (cdscoonline.gov.in)",
                "url": url,
                "month": month,
                "fetched_at": fetched_at,
                "row": row,
            }
            return _canonical(payload), url
    return None


def snapshot(notice: dict, fetched_at: str) -> tuple[bytes, str, str, str | None, str | None]:
    """``(bytes, content_type, kind, source_url, fallback_reason)`` for a notice."""
    reason: str | None = None
    try:
        if notice.get("source") == "cdsco_nsq":
            if notice.get("adapter") == "cdsco_pdf" and notice.get("pdf_s3_key"):
                data = s3.get_bytes("raw", str(notice["pdf_s3_key"]))
                return data, "application/pdf", "pdf", str(notice.get("url") or ""), None
            got = _portal_row(notice, fetched_at)
            if got:
                return got[0], "application/json", "portal_row", got[1], None
            reason = "the notice's row is no longer on the CDSCO portal"
        else:
            url = source_url(notice)
            if url:
                return fetch_bytes(url), "application/json", "source_json", url, None
            reason = f"no machine-readable URL for source {notice.get('source')!r}"
    except Exception as exc:  # the source is down: keep what was ingested, and say so
        reason = f"{type(exc).__name__}: {exc}"
    stored = {k: v for k, v in notice.items() if k not in ("brand_lc",)}
    return _canonical(stored), "application/json", "stored_notice", notice.get("url"), reason


def seal(case_id: str) -> dict:
    """Snapshot the source, lock it, sign its digest, and record it on the case."""
    case = case_state.begin(case_id, status="sealing", step="seal_evidence")
    notice = dynamo.get("notices", str(case.get("notice_id")))
    if not notice:
        raise LookupError(f"notice {case.get('notice_id')!r} not found")
    now = now_iso()
    data, content_type, kind, url, fallback = snapshot(notice, now)
    sha = signing.sha256_hex(data)
    # one object per snapshot, named by what it contains: the same bytes cannot land twice
    key = f"evidence/{case_id}/{sha}.bin"
    asked = dt.datetime.now(dt.UTC).replace(microsecond=0) + dt.timedelta(days=RETAIN_DAYS)
    version = s3.put_locked("evidence", key, data, content_type, asked, mode=LOCK_MODE)
    # the certificate shows S3's own answer, not what the PUT asked for
    held = s3.head_lock("evidence", key, version)
    signature, key_id = signing.sign_digest(bytes.fromhex(sha))
    evidence = Evidence(
        sha256=sha,
        kms_key_id=key_id,
        key_alias=signing.key_alias(),
        signature_b64=signature,
        signing_algorithm=signing.ALGORITHM,
        object_lock_mode=str(held.get("mode") or LOCK_MODE),
        object_lock_retain_until=str(
            held.get("retain_until") or asked.strftime("%Y-%m-%dT%H:%M:%SZ")
        ),
        snapshot_s3_key=key,
        snapshot_version_id=held.get("version_id") or version,
        snapshot_bytes=len(data),
        content_type=content_type,
        snapshot_kind=kind,
        source_url=url,
        signed_at=now_iso(),
    )
    detail = {"sha256": sha, "kms_key_id": key_id, "snapshot_s3_key": key, "kind": kind,
              "retain_until": evidence.object_lock_retain_until, "bytes": len(data)}  # fmt: skip
    if fallback:
        detail["fallback"] = fallback
    case_state.finish(
        case_id,
        step="seal_evidence",
        fields={"evidence": evidence.model_dump()},
        event="evidence.signed",
        detail=detail,
    )
    return {"case_id": case_id, **detail, "degraded": False}


def verify(case_id: str) -> dict:
    """The last pipeline step: read the locked snapshot back and ask KMS about the signature."""
    case = case_state.begin(case_id, status="verifying", step="verify")
    evidence = case.get("evidence")
    if not isinstance(evidence, dict) or not evidence.get("snapshot_s3_key"):
        raise LookupError(f"case {case_id!r} has no sealed evidence to verify")
    data = s3.get_bytes(
        "evidence", str(evidence["snapshot_s3_key"]), evidence.get("snapshot_version_id")
    )
    sha = signing.sha256_hex(data)
    valid = sha == evidence.get("sha256") and signing.verify_digest(
        bytes.fromhex(sha), str(evidence.get("signature_b64") or ""), str(evidence["kms_key_id"])
    )
    detail = {"valid": valid, "sha256": sha, "key_id": evidence.get("kms_key_id")}
    case_state.finish(
        case_id,
        step="verify",
        status="verified" if valid else "error",
        event="evidence.verified" if valid else "evidence.verify_failed",
        detail=detail,
        error=None if valid else "the stored signature does not match the stored snapshot",
    )
    return {"case_id": case_id, **detail, "degraded": not valid}


def handler(event: dict | None, context: object) -> dict:
    """``{"case_id": ..., "action": "seal" | "verify"}`` (SealEvidence and VerifyEvidence)."""
    event = event if isinstance(event, dict) else {}
    case_id = str(event.get("case_id") or "").strip()
    action = str(event.get("action") or "seal").strip().lower()
    try:
        if not case_id:
            raise ValueError("case_id is required")
        return verify(case_id) if action == "verify" else seal(case_id)
    except Exception as exc:  # never raise: the case records what went wrong
        error = f"{type(exc).__name__}: {exc}"
        log.warning("evidence (%s) for %s failed: %s", action, case_id, error)
        try:
            if case_id:
                case_state.finish(
                    case_id,
                    step="verify" if action == "verify" else "seal_evidence",
                    status="error",
                    event="evidence.failed",
                    detail={"error": error, "action": action},
                    error=error,
                )
        except Exception:
            pass
        return {"case_id": case_id or None, "degraded": True, "error": error}
