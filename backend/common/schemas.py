"""Pydantic v2 models for the three DynamoDB tables, exactly as SPEC.md §Data model.

Every model forbids unknown fields so a mis-mapped column fails loudly at write time.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RAW_EXCERPT_MAX = 4096
UNKNOWN_BRAND = "unknown"

Adapter = Literal["cdsco_portal", "cdsco_pdf"]
ItemKind = Literal["medicine", "vehicle", "appliance", "other"]
ItemStatus = Literal["clear", "hold", "alert"]
Decision = Literal["alert", "hold", "dismiss"]
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
        if not self.brand_lc.strip():
            self.brand_lc = self.brand.lower().strip()
        return self


class Item(_Strict):
    """Something the user owns (``items`` table); pk ``user#item_id``."""

    pk: str
    item_id: str
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
    status: ItemStatus = "clear"
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
    """Signed snapshot of the notice stored under S3 Object Lock."""

    sha256: str
    kms_key_id: str
    signature_b64: str
    object_lock_retain_until: str
    snapshot_s3_key: str


class Approval(_Strict):
    """Human approval gate for the claim letter (Step Functions task token)."""

    token_issued_at: str
    approved_at: str | None = None
    approver: str = "demo-user"


class AuditEvent(_Strict):
    """Append-only audit entry on a case."""

    ts: str
    event: str
    detail: dict | None = None


class Case(_Strict):
    """Outcome of matching one item against one notice (``cases`` table)."""

    case_id: str
    pk: str
    item_id: str
    notice_id: str
    decision: Decision
    reason: str
    quoted_sentence: str = ""
    range_check: RangeCheck | None = None
    sold_after_notice: bool = False
    claim_pdf_s3_key: str | None = None
    evidence: Evidence | None = None
    approval: Approval | None = None
    audit: list[AuditEvent] = Field(default_factory=list)
