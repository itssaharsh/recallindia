"""Match pipeline step ``notify`` (SPEC §Match pipeline step 5): record one check's outcome.

Input is the whole state after Decide: ``$.candidates.item`` (or, when Candidates failed and
HoldUnavailable ran, only ``$.item_id`` -- the item is loaded from the table), ``$.decide`` and
``$.run``. Output ``{case_id | None, item_id, decision, status, email: {sent, error},
event_id, degraded}``.

* ``alert`` / ``hold`` / ``dismiss``: one Case row (``pk = case_id``, ``rk = "case"``) with the
  decision, reason, quoted sentence, range check, ``sold_after_notice`` (purchase_date >
  published_at, ISO string compare, when both are known), verifier detail and an append-only
  ``audit[]``; item.status (alert | hold -> that status, dismiss -> ``clear``), item.case_id
  and item.last_checked_at; one Event ``case.<decision>``. For ``alert`` only, an SES email to
  ``NOTIFY_EMAIL`` followed by an Event ``email.sent`` | ``email.skipped``.
* ``clear``: no Case. item.status ``clear``, item.case_id None, item.last_checked_at; one Event
  ``item.clear`` whose message is Decide's reason ("no match in N sources as of <time>").

Never raises: an SES failure (sandbox, unverified identity, MessageRejected) is logged and
recorded as ``email.skipped``; anything unexpected returns ``degraded: true`` with ``error``.
Wording (CLAUDE.md): the alert message is the notice's own title (for CDSCO NSQ that is
"failed CDSCO quality test, <month> alert, row N"), never a stronger word; a clear item is
only ever "no match in N sources as of <time>".
"""

from __future__ import annotations

import logging
import os
import secrets
from typing import Any

from common import dynamo
from common.demo_mode import is_demo
from common.notices import now_iso
from common.schemas import AuditEvent, Case, Event, Item, RangeCheck

log = logging.getLogger(__name__)

STEP = "notify"
# The sources one check covers (Candidates reports the same list as ``sources_searched``); only
# used to word a clear message when Decide handed over no reason.
ALL_SOURCES = ["cdsco_nsq", "cpsc", "nhtsa", "openfda"]
OUTCOMES = ("alert", "hold", "dismiss", "clear")
VERIFIERS = ("bedrock", "deterministic", "none")
# Decide outcome -> Item.status. A dismissed near-miss leaves the item clear but keeps case_id
# so the wall can show the amber reason (ADR-006).
ITEM_STATUS = {"alert": "alert", "hold": "hold", "dismiss": "clear", "clear": "clear"}
EMAIL_SUBJECT = "[RecallIndia] {product} — {source} {notice_id}"


def _region() -> str:
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"


def _ses_client() -> Any:
    """boto3 SES client (module-level so tests can monkeypatch a fake)."""
    import boto3  # lazy: demo mode must not need boto3 credentials
    from botocore.config import Config

    return boto3.client(
        "ses",
        region_name=_region(),
        config=Config(connect_timeout=5, read_timeout=15, retries={"max_attempts": 1}),
    )


def new_case_id(now: str | None = None) -> str:
    """``case-<YYYYMMDDHHMMSS>-<6 hex>``: sortable by time, unique within a second."""
    stamp = (now or now_iso()).replace("-", "").replace(":", "").replace("T", "").rstrip("Z")
    return f"case-{stamp}-{secrets.token_hex(3)}"


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _load_item(event: dict) -> tuple[dict | None, str]:
    """``(item, item_id)`` for the state: the stored row when it exists, else the snapshot.

    The Candidates snapshot (``$.candidates.item``) identifies the item; the stored row is the
    write base because POST /items/{id}/check may have set ``last_check_arn`` after Candidates
    read its snapshot, and writing the snapshot back would erase it. HoldUnavailable (no
    ``$.candidates``) has only ``$.item_id``.
    """
    candidates = event.get("candidates")
    candidates = candidates if isinstance(candidates, dict) else {}
    snapshot = candidates.get("item")
    snapshot = snapshot if isinstance(snapshot, dict) else None
    item_id = _text(
        event.get("item_id") or candidates.get("item_id") or (snapshot or {}).get("item_id")
    ).strip()
    stored = dynamo.get("items", Item.make_pk(item_id)) if item_id else None
    item = dict(stored) if stored is not None else (dict(snapshot) if snapshot else None)
    if item is not None and not item_id:
        item_id = _text(item.get("item_id")).strip()
    return item, item_id


def sold_after_notice(item: dict, notice: dict | None) -> bool:
    """``purchase_date > published_at`` when both are known (ISO ``YYYY-MM-DD`` strings)."""
    purchased = _text(item.get("purchase_date")).strip()
    published = _text((notice or {}).get("published_at")).strip()
    return bool(purchased and published and purchased > published)


def _range_check(decide: dict) -> RangeCheck | None:
    raw = decide.get("range_check")
    if not isinstance(raw, dict):
        return None
    inside = raw.get("inside")
    return RangeCheck(
        listed=_text(raw.get("listed")),
        yours=_text(raw.get("yours")),
        inside=inside if isinstance(inside, bool) else None,
    )


def _confidence(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _write_event(
    *,
    now: str,
    type_: str,
    item_id: str,
    case_id: str | None,
    decision: str,
    message: str,
    detail: dict | None = None,
) -> str:
    event_id = Event.new_event_id(now)
    row = Event(
        pk=Event.make_pk(event_id),
        event_id=event_id,
        ts=now,
        type=type_,
        item_id=item_id,
        case_id=case_id,
        decision=decision,  # type: ignore[arg-type]
        message=message,
        detail=detail,
    )
    dynamo.put("cases", row.model_dump())
    return event_id


# --- SES ------------------------------------------------------------------------------


def email_body(
    item: dict, notice: dict, case_id: str, decide: dict, range_check: RangeCheck | None
) -> str:
    """Plain-text alert body: what matched, the verbatim quote, the range line, url, case."""
    lines = [
        f"{_text(item.get('name'))} matches a notice in the RecallIndia feed.",
        "",
        f"Notice: {_text(notice.get('title'))}",
        f"Source: {_text(notice.get('source'))} {_text(notice.get('notice_id'))} "
        f"(published {_text(notice.get('published_at'))})",
        f'Quoted from the notice: "{_text(decide.get("quoted_sentence"))}"',
    ]
    if range_check is not None:
        lines.append(
            f"Range check: yours {range_check.yours or '-'} / listed {range_check.listed or '-'} "
            f"/ inside: {range_check.inside}"
        )
    if item.get("purchase_date"):
        lines.append(
            f"Purchased {item['purchase_date']} / notice published {notice.get('published_at')}"
            + (" -> sold after notice" if sold_after_notice(item, notice) else "")
        )
    lines += [
        f"Notice URL: {_text(notice.get('url'))}",
        f"Case: {case_id}",
        "",
        "RecallIndia -- rules decide, the model explains.",
    ]
    return "\n".join(lines)


def send_alert_email(
    item: dict, notice: dict | None, case_id: str, decide: dict, range_check: RangeCheck | None
) -> dict:
    """``send_email`` from and to ``NOTIFY_EMAIL`` (SES sandbox); ``{sent, error}``, never raises.

    A missing NOTIFY_EMAIL, a missing notice, or any SES error (``MessageRejected``, an
    unverified identity, a network failure) is a warning and ``sent: false``.
    """
    to = (os.environ.get("NOTIFY_EMAIL") or "").strip()
    if not to:
        log.warning("notify: NOTIFY_EMAIL not set; alert email skipped")
        return {"sent": False, "error": "NOTIFY_EMAIL not set"}
    if notice is None:
        return {"sent": False, "error": "notice not found; nothing to quote"}
    subject = EMAIL_SUBJECT.format(
        product=_text(notice.get("product")) or _text(item.get("name")),
        source=_text(notice.get("source")),
        notice_id=_text(notice.get("notice_id")),
    )
    body = email_body(item, notice, case_id, decide, range_check)
    try:
        resp = _ses_client().send_email(
            Source=to,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
            },
        )
    except Exception as exc:  # ClientError (MessageRejected, identity not verified), network
        message = f"{type(exc).__name__}: {exc}"
        log.warning("notify: SES send_email failed: %s", message)
        return {"sent": False, "error": message}
    return {"sent": True, "error": None, "message_id": (resp or {}).get("MessageId")}


# --- the step -------------------------------------------------------------------------


def _degraded(event: dict, error: str) -> dict:
    decide = event.get("decide") if isinstance(event.get("decide"), dict) else {}
    log.warning("notify: %s", error)
    return {
        "case_id": None,
        "item_id": _text(event.get("item_id")) or None,
        "decision": decide.get("decision"),
        "status": None,
        "email": {"sent": False, "error": None},
        "event_id": None,
        "degraded": True,
        "error": error,
    }


def _record_clear(
    *, event: dict, item: dict, item_id: str, decide: dict, run: dict, now: str
) -> dict:
    candidates = event.get("candidates") if isinstance(event.get("candidates"), dict) else {}
    reason = _text(decide.get("reason")).strip()
    if not reason:
        searched = candidates.get("sources_searched")
        count = len(searched) if isinstance(searched, list) and searched else len(ALL_SOURCES)
        reason = f"no match in {count} sources as of {candidates.get('searched_at') or now}"
    item.update({"status": "clear", "case_id": None, "last_checked_at": now})
    dynamo.put("items", item)
    event_id = _write_event(
        now=now,
        type_="item.clear",
        item_id=item_id,
        case_id=None,
        decision="clear",
        message=reason,
        detail={
            "sources_searched": candidates.get("sources_searched"),
            "searched_at": candidates.get("searched_at"),
            "execution_arn": run.get("execution_arn"),
        },
    )
    return {
        "case_id": None,
        "item_id": item_id,
        "decision": "clear",
        "status": "clear",
        "email": {"sent": False, "error": None},
        "event_id": event_id,
        "email_event_id": None,
        "notice_pk": None,
        "degraded": False,
    }


def _record_case(*, item: dict, item_id: str, decide: dict, run: dict, now: str) -> dict:
    decision = str(decide["decision"])
    reason = _text(decide.get("reason")).strip() or decision
    notice_pk = _text(decide.get("notice_pk")).strip() or None
    notice = dynamo.get("notices", notice_pk) if notice_pk else None
    case_id = new_case_id(now)
    range_check = _range_check(decide)
    verifier = decide.get("verifier") if decide.get("verifier") in VERIFIERS else None
    covers = decide.get("covers_item")
    case = Case(
        case_id=case_id,
        pk=Case.make_pk(case_id),
        item_id=item_id,
        notice_id=notice_pk or "",
        decision=decision,  # type: ignore[arg-type]
        reason=reason,
        quoted_sentence=_text(decide.get("quoted_sentence")),
        range_check=range_check,
        sold_after_notice=sold_after_notice(item, notice),
        verifier=verifier,
        confidence=_confidence(decide.get("confidence")),
        reasoning=_text(decide.get("reasoning")).strip() or reason,
        covers_item=covers if isinstance(covers, bool) else None,
        execution_arn=_text(run.get("execution_arn")).strip() or None,
        created_at=now,
        audit=[
            AuditEvent(
                ts=now,
                event="case.created",
                detail={"decision": decision, "verifier": verifier, "notice_pk": notice_pk},
            ),
            AuditEvent(ts=now, event=f"decision.{decision}", detail={"reason": reason}),
        ],
    )
    dynamo.put("cases", case.model_dump())

    status = ITEM_STATUS[decision]
    item.update({"status": status, "case_id": case_id, "last_checked_at": now})
    dynamo.put("items", item)

    name = _text(item.get("name")).strip() or item_id
    if decision == "alert":
        title = _text((notice or {}).get("title")).strip()
        message = f"{name}: {title}" if title else f"{name}: {reason}"
    elif decision == "hold":
        message = f"{name}: on hold — {reason}"
    else:
        message = f"{name}: dismissed — {reason}"
    event_id = _write_event(
        now=now,
        type_=f"case.{decision}",
        item_id=item_id,
        case_id=case_id,
        decision=decision,
        message=message,
        detail={
            "notice_pk": notice_pk,
            "source": (notice or {}).get("source"),
            "reason": reason,
            "verifier": verifier,
            "execution_arn": run.get("execution_arn"),
        },
    )

    email: dict[str, Any] = {"sent": False, "error": None}
    email_event_id: str | None = None
    if decision == "alert":
        if is_demo():
            email = {"sent": False, "error": "DEMO_MODE: SES not called"}
        else:
            email = send_alert_email(item, notice, case_id, decide, range_check)
        email_type = "email.sent" if email.get("sent") else "email.skipped"
        email_message = (
            f"{name}: alert email sent"
            if email.get("sent")
            else f"{name}: alert email skipped — {email.get('error')}"
        )
        email_event_id = _write_event(
            now=now,
            type_=email_type,
            item_id=item_id,
            case_id=case_id,
            decision=decision,
            message=email_message,
            detail={"error": email.get("error"), "message_id": email.get("message_id")},
        )
        case.audit.append(
            AuditEvent(ts=now_iso(), event=email_type, detail={"error": email.get("error")})
        )
        dynamo.put("cases", case.model_dump())

    return {
        "case_id": case_id,
        "item_id": item_id,
        "decision": decision,
        "status": status,
        "email": {"sent": bool(email.get("sent")), "error": email.get("error")},
        "event_id": event_id,
        "email_event_id": email_event_id,
        "notice_pk": notice_pk,
        "degraded": False,
    }


def _notify(event: dict) -> dict:
    decide = event.get("decide")
    if not isinstance(decide, dict) or decide.get("decision") not in OUTCOMES:
        return _degraded(event, "missing or malformed $.decide (no decision to record)")
    item, item_id = _load_item(event)
    if item is None:
        return _degraded(event, f"item {item_id or '?'} not found; nothing recorded")
    run = event.get("run") if isinstance(event.get("run"), dict) else {}
    now = now_iso()
    if decide["decision"] == "clear":
        return _record_clear(
            event=event, item=item, item_id=item_id, decide=decide, run=run, now=now
        )
    return _record_case(item=item, item_id=item_id, decide=decide, run=run, now=now)


def handler(event: dict | None, context: object) -> dict:
    """Lambda entry point: record the decision, never raise."""
    event = event if isinstance(event, dict) else {}
    try:
        return _notify(event)
    except Exception as exc:  # the state machine must still see a result under $.notify
        log.exception("notify: unexpected failure")
        return _degraded(event, f"{type(exc).__name__}: {exc}")
