"""The case's status and its four pipeline steps, written in one place (UI-SPEC §7).

Every step after the human gate is the same shape: mark the case as running that step, do the
work, then record the result. ``begin`` and ``finish`` keep the status, the step timestamps and
the audit trail consistent, so the UI can draw C-17 from the case alone and never from a timer.

    approve -> seal_evidence -> write_letter -> verify

A failed step leaves ``status = "error"`` and the reason on that step and in ``reason``, which is
what the card and the case page show.
"""

from __future__ import annotations

from typing import Any

from common import dynamo
from common.notices import now_iso
from common.schemas import PIPELINE_STEPS, AuditEvent, CaseSteps


def _load(case_id: str) -> dict:
    case = dynamo.get("cases", case_id)
    if case is None or case.get("rk") != "case":
        raise LookupError(f"case {case_id!r} not found")
    return case


def begin(case_id: str, *, status: str, step: str) -> dict:
    """Mark ``step`` as started and move the case to ``status``; returns the case."""
    if step not in PIPELINE_STEPS:
        raise ValueError(f"step must be one of {PIPELINE_STEPS}")
    case = _load(case_id)
    steps = CaseSteps(**(case.get("steps") or {}))
    record = getattr(steps, step)
    record.started_at = now_iso()
    record.error = None
    case["steps"] = steps.model_dump()
    case["status"] = status
    dynamo.put("cases", case)
    return case


def finish(
    case_id: str,
    *,
    step: str,
    status: str | None = None,
    fields: dict[str, Any] | None = None,
    event: str | None = None,
    detail: dict | None = None,
    error: str | None = None,
) -> dict:
    """Record the end of ``step``: its time, anything it produced, one audit entry."""
    if step not in PIPELINE_STEPS:
        raise ValueError(f"step must be one of {PIPELINE_STEPS}")
    case = _load(case_id)
    at = now_iso()
    steps = CaseSteps(**(case.get("steps") or {}))
    record = getattr(steps, step)
    record.finished_at = at
    record.error = error
    case["steps"] = steps.model_dump()
    case.update(fields or {})
    if status:
        case["status"] = status
    if error:
        case["reason"] = error
    if event:
        case.setdefault("audit", []).append(
            AuditEvent(ts=at, event=event, detail=detail).model_dump()
        )
    dynamo.put("cases", case)
    return case
