"""Schema behaviour pinned by SPEC.md §Data model."""

import pytest
from pydantic import ValidationError

from common.schemas import (
    RAW_EXCERPT_MAX,
    Approval,
    AuditEvent,
    Case,
    Evidence,
    Item,
    Notice,
    RangeCheck,
)


def _notice(**overrides) -> Notice:
    base = dict(
        pk=Notice.make_pk("cdsco_nsq", "JUL-2026#7"),
        source="cdsco_nsq",
        notice_id="JUL-2026#7",
        adapter="cdsco_portal",
        title="Paracetamol Tablets IP 650mg failed CDSCO quality test",
        product="Paracetamol Tablets IP 650mg",
        brand="  Forgo Pharmaceuticals ",
        batches=["FT5427"],
        hazard_or_failed_test="Dissolution",
        published_at="2026-07-01",
        url="https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug",
    )
    base.update(overrides)
    return Notice(**base)


def test_notice_pk_helper() -> None:
    assert Notice.make_pk("cpsc", "26-123") == "cpsc#26-123"
    assert Item.make_pk("abc") == "user#abc"


def test_brand_lc_is_derived_when_empty() -> None:
    assert _notice().brand_lc == "forgo pharmaceuticals"
    assert _notice(brand_lc="custom").brand_lc == "custom"


def test_raw_excerpt_truncated_to_4096() -> None:
    notice = _notice(raw_excerpt="x" * (RAW_EXCERPT_MAX + 500))
    assert len(notice.raw_excerpt) == RAW_EXCERPT_MAX


def test_published_at_rejects_non_iso() -> None:
    with pytest.raises(ValidationError):
        _notice(published_at="21/11/2023")


def test_extra_fields_forbidden() -> None:
    with pytest.raises(ValidationError):
        _notice(unknown_field=1)
    with pytest.raises(ValidationError):
        RangeCheck(listed="A", yours="B", inside=False, extra="no")


def test_item_case_rangecheck_round_trip() -> None:
    item = Item(pk=Item.make_pk("i1"), item_id="i1", kind="medicine", name="Dolo 650", year=None)
    assert Item.model_validate(item.model_dump()) == item

    check = RangeCheck(listed="FT5427", yours="FT5428", inside=False)
    assert RangeCheck.model_validate(check.model_dump()) == check

    case = Case(
        case_id="c1",
        pk="c1",
        item_id="i1",
        notice_id="cdsco_nsq#JUL-2026#7",
        decision="dismiss",
        reason="batch FT5428 not in listed batches [FT5427]",
        range_check=check,
    )
    assert Case.model_validate(case.model_dump()) == case


def test_case_with_evidence_approval_audit() -> None:
    case = Case(
        case_id="c2",
        pk="c2",
        item_id="i1",
        notice_id="cdsco_nsq#JUL-2026#7",
        decision="alert",
        reason="batch FT5427 listed",
        quoted_sentence="Paracetamol Tablets IP 650mg, batch FT5427",
        sold_after_notice=True,
        evidence=Evidence(
            sha256="ab" * 32,
            kms_key_id="alias/recallindia",
            signature_b64="c2ln",
            object_lock_retain_until="2026-10-18",
            snapshot_s3_key="evidence/c2.pdf",
        ),
        approval=Approval(token_issued_at="2026-09-18T10:00:00Z"),
        audit=[AuditEvent(ts="2026-09-18T10:00:00Z", event="created", detail={"by": "test"})],
    )
    dumped = case.model_dump()
    assert dumped["approval"]["approver"] == "demo-user"
    assert dumped["approval"]["approved_at"] is None
    assert Case.model_validate(dumped) == case
