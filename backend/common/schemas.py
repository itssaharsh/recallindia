"""Pydantic v2 models for the three DynamoDB tables, exactly as SPEC.md §Data model.

Every model forbids unknown fields so a mis-mapped column fails loudly at write time.
"""

from __future__ import annotations

import datetime as dt
import re
import secrets
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from common.brands import brand_key

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RAW_EXCERPT_MAX = 4096
UNKNOWN_BRAND = "unknown"

Adapter = Literal["cdsco_portal", "cdsco_pdf"]
# No accounts: one header (``X-Household``) scopes items and cases. Everything unlabelled,
# and every read without the header, belongs to the read-only demo household.
DEMO_HOUSEHOLD = "demo"

ItemKind = Literal["medicine", "vehicle", "appliance", "other"]
ItemStatus = Literal["clear", "hold", "alert"]
# A case is only ever written for a candidate notice: alert / hold / dismiss.
Decision = Literal["alert", "hold", "dismiss"]
# What one check of an item ended in (Decide output, events): the three case decisions plus
# "clear" -- no candidate at all, "no match in N sources as of <time>".
Outcome = Literal["alert", "hold", "dismiss", "clear"]
# Who produced covers_item: the model, the deterministic fallback, or nobody (unavailable).
Verifier = Literal["bedrock", "deterministic", "none"]


def _now_iso() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


# Where a notice's facts come from: the regulator's own publication ("primary-official"),
# a secondary republication, or a saved fixture (DEMO_MODE seeds).
SourceConfidence = Literal["primary-official", "secondary", "fixture"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Vehicle(_Strict):
    """A make/model/year range covered by a vehicle notice."""

    make: str
    model: str
    year_from: int
    year_to: int


class RowRef(_Strict):
    """Where a CDSCO row came from: ``{page,row}`` for a PDF, ``{month,row}`` for the portal."""

    page: int | None = None
    row: int | None = None
    month: str | None = None


class Notice(_Strict):
    """One recall / quality-failure notice from any source (``notices`` table)."""

    pk: str
    source: str
    notice_id: str
    adapter: Adapter | None = None
    title: str
    product: str
    brand: str
    brand_lc: str = ""
    model: str | None = None
    batches: list[str] = Field(default_factory=list)
    serial_ranges: list[str] = Field(default_factory=list)
    vehicles: list[Vehicle] = Field(default_factory=list)
    hazard_or_failed_test: str = ""
    remedy: str | None = None
    published_at: str
    url: str
    raw_excerpt: str = ""
    pdf_s3_key: str | None = None
    row_ref: RowRef | None = None
    mfg_date: str | None = None
    exp_date: str | None = None
    lab: str | None = None
    source_confidence: SourceConfidence | None = None
    # bookkeeping set by common.notices.upsert_notice (UTC ISO seconds, "Z")
    first_seen_at: str | None = None
    updated_at: str | None = None

    @staticmethod
    def make_pk(source: str, notice_id: str) -> str:
        """Partition key: ``source#notice_id``."""
        return f"{source}#{notice_id}"

    @field_validator("published_at")
    @classmethod
    def _iso_date(cls, value: str) -> str:
        if not _ISO_DATE.match(value):
            raise ValueError(f"published_at must be YYYY-MM-DD, got {value!r}")
        return value

    @field_validator("raw_excerpt")
    @classmethod
    def _truncate_excerpt(cls, value: str) -> str:
        return value[:RAW_EXCERPT_MAX]

    @model_validator(mode="after")
    def _derive_brand_lc(self) -> Notice:
        # brand_lc is the GSI key; DynamoDB rejects an empty string for a key attribute, so a
        # blank brand (a portal row with no manufacturer, a whitespace Make) becomes "unknown".
        if not self.brand.strip():
            self.brand = UNKNOWN_BRAND
        # Unconditional on purpose: the key is a pure function of the display brand, so a stored
        # row re-validated by upsert_notice, a poller and the cdsco mapping all agree, and the
        # candidates lookup (which calls the same brand_key) can never drift from what is stored.
        # The display ``brand`` is never altered.
        self.brand_lc = brand_key(self.brand) or UNKNOWN_BRAND
        return self


class Item(_Strict):
    """Something the user owns (``items`` table); pk ``user#item_id``.

    ``household_id`` is the only scoping in this app (no accounts): it comes from the
    ``X-Household`` header, defaults to ``demo`` and is the GSI key the wall is read by.
    """

    pk: str
    item_id: str
    household_id: str = DEMO_HOUSEHOLD
    kind: ItemKind
    name: str
    brand: str | None = None
    model: str | None = None
    batch: str | None = None
    serial: str | None = None
    reg_no: str | None = None
    make: str | None = None
    year: int | None = None
    purchase_date: str | None = None
    photo_s3_key: str | None = None
    # who sold it, as the buyer would write it on a letter ("Apollo Pharmacy, Koramangala")
    bought_from: str | None = None
    # set when this item came from "Make my own copy": the demo item it was copied from
    copied_from: str | None = None
    mfg_date: str | None = None  # "2025-10" as read off the strip (P06 Scan strip)
    exp_date: str | None = None
    status: ItemStatus = "clear"
    # Set by POST /items (UTC ISO seconds, "Z"); GET /items sorts newest-first on it.
    created_at: str | None = None
    # Set by POST /items/{id}/check when the MatchStateMachine execution starts ...
    last_check_arn: str | None = None
    last_check_at: str | None = None
    # ... and by Notify when it completes (the time the status/case_id below were decided).
    last_checked_at: str | None = None
    case_id: str | None = None

    @staticmethod
    def make_pk(item_id: str) -> str:
        """Partition key: ``user#item_id`` (single demo user, no auth)."""
        return f"user#{item_id}"


class RangeCheck(_Strict):
    """Deterministic batch/serial/year check result; ``inside`` is None when unknowable."""

    listed: str
    yours: str
    inside: bool | None


class Evidence(_Strict):
    """Signed snapshot of the notice stored under S3 Object Lock (SPEC §Match pipeline step 8).

    ``sha256`` is of the snapshot bytes exactly as stored; ``signature_b64`` is KMS ``Sign``
    over that digest (``signing_algorithm``) with ``kms_key_id``. ``snapshot_kind``: ``pdf``
    (the CDSCO alert PDF itself), ``portal_row`` (the CDSCO portal JSON row, re-fetched),
    ``source_json`` (the NHTSA / CPSC / openFDA record as served) or ``stored_notice`` (the
    notice as ingested, when the source could not be fetched).
    """

    sha256: str
    kms_key_id: str
    # the human-readable name of the same key, for the certificate
    key_alias: str | None = None
    signature_b64: str
    signing_algorithm: str = "RSASSA_PKCS1_V1_5_SHA_256"
    object_lock_mode: str = "GOVERNANCE"
    object_lock_retain_until: str
    snapshot_s3_key: str
    snapshot_version_id: str | None = None
    snapshot_bytes: int | None = None
    content_type: str | None = None
    snapshot_kind: str | None = None
    source_url: str | None = None
    signed_at: str | None = None


ApprovalStatus = Literal["waiting", "approved", "rejected", "expired"]
# The case's own state machine (UI-SPEC §7). "matching" is the window between the check
# starting and Notify writing the outcome; the rest follow the approval gate. "invalid" is
# never stored: a tamper test is a client-side question about a stored signature.
CaseStatus = Literal[
    "matching",
    "waiting_approval",
    "approving",
    "sealing",
    "writing_letter",
    "verifying",
    "verified",
    "rejected",
    "expired",
    "error",
    "needs_you",
    "near_miss",
    "clear",
]
PIPELINE_STEPS = ("approve", "seal_evidence", "write_letter", "verify")


class Approval(_Strict):
    """Human approval gate for the claim letter (Step Functions task token, single use).

    ``task_token`` is set while ``status`` is ``waiting`` and removed in the same conditional
    write that ends the wait (approve / reject / expire), so a token can be spent once. The
    API never returns it.
    """

    status: ApprovalStatus = "waiting"
    task_token: str | None = None
    token_issued_at: str
    approved_at: str | None = None
    rejected_at: str | None = None
    expired_at: str | None = None
    approver: str = "demo-user"
    reason: str | None = None


class StepRecord(_Strict):
    """One step of the post-approval pipeline, as the UI draws it (C-17)."""

    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None


class CaseSteps(_Strict):
    """Approve -> seal evidence -> write letter -> verify signature (the letter cites the seal)."""

    approve: StepRecord = Field(default_factory=StepRecord)
    seal_evidence: StepRecord = Field(default_factory=StepRecord)
    write_letter: StepRecord = Field(default_factory=StepRecord)
    verify: StepRecord = Field(default_factory=StepRecord)


class AuditEvent(_Strict):
    """Append-only audit entry on a case."""

    ts: str
    event: str
    detail: dict | None = None


class Case(_Strict):
    """Outcome of matching one item against one notice (``cases`` table); pk ``case_id``.

    ``rk``/``ts`` are the ``rk-ts-index`` GSI keys shared with ``Event`` rows in the same
    table (``common.dynamo.query_rk``): a newest-first listing of cases is
    ``query_rk("case")``. DynamoDB rejects an empty string for an index key, so a blank ``ts``
    is filled from ``created_at`` (or now) at validation time.
    """

    case_id: str
    pk: str
    item_id: str
    household_id: str = DEMO_HOUSEHOLD
    notice_id: str
    decision: Decision
    # the case's own state (UI-SPEC §7); the decision says what was found, the status says
    # where the case is in the approval pipeline
    status: CaseStatus = "matching"
    steps: CaseSteps = Field(default_factory=CaseSteps)
    reason: str
    quoted_sentence: str = ""
    range_check: RangeCheck | None = None
    sold_after_notice: bool = False
    claim_pdf_s3_key: str | None = None
    # the letter as plain text (what the PDF says), who it is addressed to, when it was drafted
    claim_text: str | None = None
    claim_addressee: str | None = None
    claim_created_at: str | None = None
    evidence: Evidence | None = None
    approval: Approval | None = None
    audit: list[AuditEvent] = Field(default_factory=list)
    # P04 verify/decide detail (SPEC §Match pipeline steps 2 and 4)
    verifier: Verifier | None = None
    confidence: float | None = None
    reasoning: str | None = None
    covers_item: bool | None = None
    execution_arn: str | None = None
    created_at: str | None = None
    rk: Literal["case"] = "case"
    ts: str = ""

    @staticmethod
    def make_pk(case_id: str) -> str:
        """Partition key: the ``case_id`` itself (SPEC: ``cases`` pk ``case_id``)."""
        return case_id

    @model_validator(mode="after")
    def _fill_ts(self) -> Case:
        if not self.ts.strip():
            self.ts = self.created_at or _now_iso()
        return self


class Event(_Strict):
    """In-app activity row (``cases`` table, pk ``events#<event_id>``, ``rk = "event"``).

    Written by Notify / the API for the ``/mine`` timeline and ``GET /events``: one row per
    thing that happened (``check.started``, ``case.alert``, ``case.hold``, ``case.dismiss``,
    ``item.clear``, ``email.sent``, ``email.skipped``). ``message`` is the human line and
    follows the wording rules (never "recalled" for a CDSCO NSQ hit, never "safe": a clear
    item is "no match in N sources as of <time>"). Listed newest-first through
    ``common.dynamo.query_rk("event")`` on the ``rk-ts-index`` GSI.
    """

    pk: str
    event_id: str
    rk: Literal["event"] = "event"
    ts: str
    type: str
    item_id: str | None = None
    case_id: str | None = None
    decision: Outcome | None = None
    message: str
    detail: dict | None = None

    @staticmethod
    def make_pk(event_id: str) -> str:
        """Partition key: ``events#<event_id>`` (SPEC: ``pk=events#<ts>``)."""
        return f"events#{event_id}"

    @staticmethod
    def new_event_id(ts: str | None = None) -> str:
        """``<ts>-<6 hex>``: sortable by time, unique when two events share a second."""
        return f"{ts or _now_iso()}-{secrets.token_hex(3)}"
