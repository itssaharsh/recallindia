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

from common import dynamo, s3, signing
from common.cdsco import PORTAL_BASE, fetch_portal_rows, rows_to_notices
from common.demo_mode import fetch_bytes
from common.notices import now_iso
from common.schemas import AuditEvent, Evidence

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
    case = dynamo.get("cases", case_id)
    if case is None:
        raise LookupError(f"case {case_id!r} not found")
    notice = dynamo.get("notices", str(case.get("notice_id")))
    if not notice:
        raise LookupError(f"notice {case.get('notice_id')!r} not found")
    now = now_iso()
    data, content_type, kind, url, fallback = snapshot(notice, now)
    sha = signing.sha256_hex(data)
    ext = "pdf" if content_type == "application/pdf" else "json"
    key = f"evidence/{case_id}/{sha[:16]}.{ext}"
    retain = dt.datetime.now(dt.UTC).replace(microsecond=0) + dt.timedelta(days=RETAIN_DAYS)
    version = s3.put_locked("evidence", key, data, content_type, retain, mode=LOCK_MODE)
    signature, key_id = signing.sign_digest(bytes.fromhex(sha))
    evidence = Evidence(
        sha256=sha,
        kms_key_id=key_id,
        signature_b64=signature,
        signing_algorithm=signing.ALGORITHM,
        object_lock_mode=LOCK_MODE,
        object_lock_retain_until=retain.strftime("%Y-%m-%dT%H:%M:%SZ"),
        snapshot_s3_key=key,
        snapshot_version_id=version,
        snapshot_bytes=len(data),
        content_type=content_type,
        snapshot_kind=kind,
        source_url=url,
        signed_at=now_iso(),
    )
    case["evidence"] = evidence.model_dump()
    detail = {"sha256": sha, "kms_key_id": key_id, "snapshot_s3_key": key, "kind": kind,
              "retain_until": evidence.object_lock_retain_until, "bytes": len(data)}  # fmt: skip
    if fallback:
        detail["fallback"] = fallback
    case.setdefault("audit", []).append(
        AuditEvent(
            ts=evidence.signed_at or now, event="evidence.signed", detail=detail
        ).model_dump()
    )
    dynamo.put("cases", case)
    return {"case_id": case_id, **detail, "degraded": False}


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    case_id = str(event.get("case_id") or "").strip()
    try:
        if not case_id:
            raise ValueError("case_id is required")
        return seal(case_id)
    except Exception as exc:  # never raise: the case records what went wrong
        error = f"{type(exc).__name__}: {exc}"
        log.warning("evidence for %s failed: %s", case_id, error)
        try:
            case = dynamo.get("cases", case_id) if case_id else None
            if case is not None:
                case.setdefault("audit", []).append(
                    AuditEvent(
                        ts=now_iso(), event="evidence.failed", detail={"error": error}
                    ).model_dump()
                )
                dynamo.put("cases", case)
        except Exception:
            pass
        return {"case_id": case_id or None, "degraded": True, "error": error}
