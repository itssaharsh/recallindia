"""Per-execution ingest run records (``ingest#<run_id>`` rows in the notices table).

The IngestStateMachine tasks (Extract, Normalise, Publish) write their progress here so
``GET /ingest/status/{arn}`` can show per-step state, Textract polling progress and the final
counts without parsing the execution history. One record per execution, keyed by the last
segment of the execution ARN (the execution name); a direct local invoke gets a generated
``local-<utc ts>-<6 hex>`` id.

Records never carry ``published_at``, so the ``source-published_at-index`` GSI skips them, and
``common.notices.is_meta`` (prefix ``ingest#``) keeps them out of the feed and the public API.
``write_run`` is one read + one put with no retries: Extract heartbeats it on every Textract
poll, and the last writer simply wins.
"""

from __future__ import annotations

import datetime as dt
import secrets
from typing import Any

from common import dynamo

RUN_PREFIX = "ingest#"
_FIXED = ("pk", "run_id")
# a run record must never look like a notice to the source GSI
_FORBIDDEN = frozenset({"published_at"})


def _now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_id_from_arn(arn: str | None) -> str:
    """Execution ARN -> its name (last ``:`` segment); None/blank -> a fresh local id.

    ``arn:aws:states:ap-south-1:1:execution:recallindia-ingest-1:ingest-2026`` ->
    ``ingest-2026``.
    """
    text = str(arn or "").strip()
    if text:
        tail = text.rsplit(":", 1)[-1].strip()
        if tail:
            return tail
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"local-{stamp}-{secrets.token_hex(3)}"


def run_pk(run_id: str) -> str:
    """``ingest#<run_id>``."""
    return f"{RUN_PREFIX}{run_id}"


def read_run(run_id: str) -> dict | None:
    """The stored run record, or None when nothing has been written for ``run_id`` yet."""
    return dynamo.get("notices", run_pk(run_id))


def write_run(run_id: str, **fields: Any) -> dict:
    """Read-merge-put ``fields`` into the run record and return the stored item.

    Existing fields are kept, given fields overwrite (nested dicts replace, not deep-merge),
    ``updated_at`` is always set and ``pk`` / ``run_id`` cannot be changed. Safe to call many
    times per second: one strongly consistent read + one put, nothing else.
    """
    item: dict[str, Any] = dict(read_run(run_id) or {})
    item.update({k: v for k, v in fields.items() if k not in _FIXED and k not in _FORBIDDEN})
    now = _now()
    item.setdefault("created_at", now)
    item["updated_at"] = now
    item["pk"] = run_pk(run_id)
    item["run_id"] = run_id
    dynamo.put("notices", item)
    return item


def run_from_event(event: dict | None) -> tuple[str, str | None]:
    """``(run_id, execution_arn | None)`` for a task event.

    The ASL ``Init`` state injects ``$.run.execution_arn`` (``$$.Execution.Id``); a direct
    invoke may pass ``execution_arn`` at the top level; anything else gets a local id.
    """
    event = event or {}
    run = event.get("run")
    arn = run.get("execution_arn") if isinstance(run, dict) else None
    arn = arn or event.get("execution_arn")
    arn = str(arn).strip() if arn else None
    return run_id_from_arn(arn), arn or None
