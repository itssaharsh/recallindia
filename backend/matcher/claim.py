"""Match pipeline step 7: the claim letter (SPEC §Match pipeline). No model: Jinja2 + reportlab.

Runs after the case was approved (WaitForApproval). The letter goes to the seller the item's
kind implies -- a pharmacy for a medicine, the dealer for a vehicle, the retailer otherwise --
and cites the notice (source, id, URL), the product and its batch / serial / model year, the
failed test or the hazard, and the remedy the notice sets out (else a refund or a
replacement). When the item was sold after the notice was published it adds the purchase date
against the notice date and a general reference to the Consumer Protection Act, 2019 (no
section numbers). The template is ``templates/claim_letter.txt.j2``; the same text is rendered
to an A4 PDF in the claims bucket (``<case_id>.pdf``) and kept on the case as ``claim_text``.

Wording (CLAUDE.md): a CDSCO NSQ hit "failed a quality test" -- it is never called a recall.
Never raises: a failure is ``degraded: true`` with ``error`` and an audit entry.
"""

from __future__ import annotations

import datetime as dt
import io
import logging
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from common import case_state, dynamo, s3
from common.notices import now_iso
from common.schemas import Item

log = logging.getLogger(__name__)

TEMPLATE = Path(__file__).with_name("templates") / "claim_letter.txt.j2"
DEFAULT_REMEDY = "a refund or a replacement"
VEHICLE_REMEDY = "the free repair the recall provides"
SOURCE_NAME = {
    "cdsco_nsq": "Central Drugs Standard Control Organisation (CDSCO)",
    "nhtsa": "US National Highway Traffic Safety Administration (NHTSA)",
    "cpsc": "US Consumer Product Safety Commission (CPSC)",
    "openfda": "US Food and Drug Administration (openFDA enforcement report)",
}
SHORT_SOURCE = {"cdsco_nsq": "CDSCO", "nhtsa": "NHTSA", "cpsc": "CPSC", "openfda": "FDA"}
ADDRESSEE = {
    "medicine": ("pharmacy", "The Pharmacist-in-charge", "The pharmacy that sold this medicine"),
    "vehicle": ("dealer", "The Service Manager", "{make} authorised dealer"),
    "appliance": ("retailer", "The Customer Care Manager", "The store that sold this product"),
    "other": ("retailer", "The Customer Care Manager", "The store that sold this product"),
}
MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]  # fmt: skip


def _date(value: Any) -> str | None:
    """``2026-07-12`` / an ISO timestamp -> ``12 July 2026``."""
    text = str(value or "").strip()[:10]
    try:
        day = dt.date.fromisoformat(text)
    except ValueError:
        return None
    return f"{day.day} {MONTHS[day.month - 1]} {day.year}"


def _days_between(earlier: Any, later: Any) -> int | None:
    try:
        a = dt.date.fromisoformat(str(earlier)[:10])
        b = dt.date.fromisoformat(str(later)[:10])
    except ValueError:
        return None
    return (b - a).days


def _month_label(month: str | None) -> str:
    """``JUL-2026`` -> ``July 2026``."""
    text = str(month or "").strip().upper()
    for name in MONTHS:
        if text.startswith(name[:3].upper() + "-"):
            return f"{name} {text.split('-', 1)[1]}"
    return text


def identifier(item: dict, notice: dict) -> str:
    """What the letter names as the item's unit: batch, serial, model year, or model."""
    if item.get("batch"):
        return f"batch {item['batch']}"
    if item.get("serial"):
        return f"serial number {item['serial']}"
    if item.get("year"):
        make = " ".join(str(item.get(k) or "").strip() for k in ("make", "model")).strip()
        return f"model year {item['year']}{f', {make.title()}' if make else ''}"
    if item.get("model"):
        return f"model {item['model']}"
    return "the unit I own"


def letter_context(case: dict, item: dict, notice: dict, today: str) -> dict:
    """Everything the template needs, from the case, the item and the notice."""
    source = str(notice.get("source") or "")
    kind = str(item.get("kind") or "other")
    who, role, place = ADDRESSEE.get(kind, ADDRESSEE["other"])
    make = str(item.get("make") or item.get("brand") or "").strip().title() or "The"
    is_nsq = source == "cdsco_nsq"
    ref = notice.get("row_ref") or {}
    product = str(item.get("name") or notice.get("product") or "the product").strip()
    ident = identifier(item, notice)
    if is_nsq:
        # portal rows carry the month in row_ref; a PDF row's notice id starts with it
        month = _month_label(
            ref.get("month") or str(notice.get("notice_id", "")).split("-cdsco")[0]
        )
        row = f", row {ref['row']}" if ref.get("row") else ""
        notice_ref = f"the CDSCO Not of Standard Quality alert for {month}{row}"
        subject = (
            f"Refund or replacement: {product}, {ident}, failed CDSCO quality test "
            f"({month} alert{row})"
        )
    else:
        notice_ref = f"{SHORT_SOURCE.get(source, source.upper())} recall {notice.get('notice_id')}"
        if kind == "vehicle":
            # the vehicle as its owner would write it: "2022 Jeep Compass", never the
            # normalised matching keys ("jeep", "compass") the index is built on
            label = " ".join(
                str(part) for part in (item.get("year"), product) if str(part or "").strip()
            )
            subject = f"Free repair under recall {notice.get('notice_id')}: {label}"
        else:
            subject = (
                f"Refund, repair or replacement: {product} ({ident}) is covered by {notice_ref}"
            )
    remedy_text = str(notice.get("remedy") or "").strip()
    default_remedy = VEHICLE_REMEDY if kind == "vehicle" else DEFAULT_REMEDY
    remedy = (
        f'the remedy the notice sets out ("{remedy_text.rstrip(".")}"), or {default_remedy}'
        if remedy_text
        else default_remedy
    )
    # a vehicle recall is matched on make, model and year: the dealer confirms it by VIN
    vehicles = notice.get("vehicles") if isinstance(notice.get("vehicles"), list) else []
    by_make_model_year = kind == "vehicle" and bool(vehicles)
    evidence = case.get("evidence") if isinstance(case.get("evidence"), dict) else {}
    purchase = item.get("purchase_date")
    published = notice.get("published_at")
    return {
        "today": today,
        "case_id": case.get("case_id"),
        "addressee": who,
        "addressee_role": role,
        "addressee_place": place.format(make=make),
        "subject": subject,
        "product": product,
        "maker": str(item.get("brand") or notice.get("brand") or "").strip(),
        "identifier": ident,
        "purchase_date": _date(purchase),
        "is_nsq": is_nsq,
        "thing": {"vehicle": "vehicle", "medicine": "medicine"}.get(kind, "product"),
        "source_name": SOURCE_NAME.get(source, source.upper()),
        "notice_ref": notice_ref,
        "published": _date(published) or str(published or "an earlier date"),
        "finding": str(notice.get("hazard_or_failed_test") or "not stated").strip().rstrip("."),
        "lab": str(notice.get("lab") or "").strip(),
        "notice_url": str(notice.get("url") or "").strip(),
        "remedy": remedy,
        "sold_after_notice": bool(case.get("sold_after_notice")) and bool(purchase),
        "days_after": _days_between(published, purchase),
        "bought_from": str(item.get("bought_from") or "").strip(),
        "source_short": SHORT_SOURCE.get(source, source.upper()),
        "by_make_model_year": by_make_model_year,
        "vehicle_span": _vehicle_span(vehicles) if by_make_model_year else "",
        # the letter cites the evidence sealed a step earlier (SealEvidence -> WriteLetter)
        "evidence_sha": str(evidence.get("sha256") or ""),
        "evidence_signed_at": _date(evidence.get("signed_at")) or "",
        "evidence_locked_until": _date(evidence.get("object_lock_retain_until")) or "",
    }


def _vehicle_span(vehicles: list) -> str:
    """ "2022-2023 Jeep Compass" from the notice's own vehicle rows."""
    years, names = [], []
    for v in vehicles:
        if not isinstance(v, dict):
            continue
        for key in ("year_from", "year_to"):
            if isinstance(v.get(key), int):
                years.append(int(v[key]))
        name = " ".join(str(v.get(k) or "").strip() for k in ("make", "model")).strip().title()
        if name and name not in names:
            names.append(name)
    span = f"{min(years)}-{max(years)}" if years else ""
    return " ".join(x for x in (span, ", ".join(names)) if x)


def render_text(context: dict) -> str:
    from jinja2 import Environment, StrictUndefined  # lazy: only this Lambda needs it

    env = Environment(undefined=StrictUndefined, autoescape=False, keep_trailing_newline=True)
    text = env.from_string(TEMPLATE.read_text(encoding="utf-8")).render(**context)
    # at most one blank line between paragraphs, however the template's blocks fall
    lines, blank = [], False
    for line in text.splitlines():
        if line.strip():
            lines.append(line.rstrip())
            blank = False
        elif not blank:
            lines.append("")
            blank = True
    return "\n".join(lines).strip() + "\n"


def _latin(text: str) -> str:
    """reportlab's built-in fonts cover cp1252; anything else would print as a black box."""
    return text.encode("cp1252", "replace").decode("cp1252")


def render_pdf(text: str, *, case_id: str, title: str) -> bytes:
    """The letter as an A4 PDF: a header line, then one paragraph per block of the text."""
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    body = ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=15)
    bold = ParagraphStyle("subject", parent=body, fontName="Helvetica-Bold")
    head = ParagraphStyle(
        "head", parent=body, fontSize=8.5, leading=11, textColor=HexColor("#5b6470")
    )
    out = io.BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=_latin(title),
        author="RecallIndia",
        subject=f"Claim letter, case {case_id}",
    )
    story: list[Any] = [Paragraph(escape(f"RecallIndia · claim letter · case {case_id}"), head)]
    story.append(Spacer(1, 8 * mm))
    for block in text.strip().split("\n\n"):
        style = bold if block.startswith("Subject:") else body
        html = "<br/>".join(escape(_latin(line)) for line in block.splitlines())
        story += [Paragraph(html, style), Spacer(1, 4 * mm)]
    doc.build(story)
    return out.getvalue()


def draft(case_id: str) -> dict:
    """Draft, render and store the letter for ``case_id``; returns the step result."""
    case = case_state.begin(case_id, status="writing_letter", step="write_letter")
    item = dynamo.get("items", Item.make_pk(str(case.get("item_id")))) or {}
    notice = dynamo.get("notices", str(case.get("notice_id"))) or {}
    if not notice:
        raise LookupError(f"notice {case.get('notice_id')!r} not found")
    now = now_iso()
    context = letter_context(case, item, notice, _date(now) or now[:10])
    text = render_text(context)
    pdf = render_pdf(text, case_id=case_id, title=context["subject"])
    key = s3.put_bytes("claims", f"{case_id}.pdf", pdf, "application/pdf")
    case_state.finish(
        case_id,
        step="write_letter",
        fields={
            "claim_pdf_s3_key": key,
            "claim_text": text,
            "claim_addressee": context["addressee"],
            "claim_created_at": now,
        },
        event="claim.drafted",
        detail={
            "pdf_s3_key": key,
            "bytes": len(pdf),
            "addressee": context["addressee"],
            "template": TEMPLATE.name,
            "sold_after_notice": context["sold_after_notice"],
        },
    )
    return {
        "case_id": case_id,
        "claim_pdf_s3_key": key,
        "bytes": len(pdf),
        "addressee": context["addressee"],
        "sold_after_notice": context["sold_after_notice"],
        "degraded": False,
    }


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    case_id = str(event.get("case_id") or "").strip()
    try:
        if not case_id:
            raise ValueError("case_id is required")
        return draft(case_id)
    except Exception as exc:  # never raise: the case records what went wrong
        error = f"{type(exc).__name__}: {exc}"
        log.warning("claim for %s failed: %s", case_id, error)
        try:
            if case_id:
                case_state.finish(
                    case_id,
                    step="write_letter",
                    status="error",
                    event="claim.failed",
                    detail={"error": error},
                    error=error,
                )
        except Exception:
            pass
        return {"case_id": case_id or None, "degraded": True, "error": error}
