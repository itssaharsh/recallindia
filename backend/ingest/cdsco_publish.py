"""Diff and Publish steps of the IngestStateMachine (SPEC §Ingest pipeline; P03).

* ``diff_handler`` (state ``Diff``): new vs existing for this run, straight from the upsert
  counts ``cdsco_normalise`` produced (a notice is *new* when its pk was not in the table;
  *existing* when the stored row was byte-identical), plus the previous run's counts from
  ``meta#cdsco_pdf`` so the UI can say "41 new since last month".
* ``handler`` (states ``Publish`` and ``RecordFailure``): the bookkeeping every run ends with.
  Success writes ``meta#<adapter>`` ``ok=True`` with the counts, ``last_run`` and the
  ``ingested`` list (this PDF added, deduped by ``pdf_url``); a caught task error (``$.error``
  from the ASL Catch) or a step that returned ``degraded`` writes ``ok=False`` keeping the
  previous ``last_success_at`` / ``listing`` / ``ingested``. Both write the ``ingest#<run_id>``
  record (step ``publish``, status ``done`` / ``failed``) that ``GET /ingest/status/{arn}`` reads.

Neither handler raises: bookkeeping must never fail the pipeline, so every failure comes back
as ``{"published": false, "degraded": true, "error": ...}``.

Meta rows are per adapter: ``meta#cdsco_pdf`` for the archive PDF path (the default) and
``meta#cdsco_portal`` (shared with the ``cdsco_portal`` poller) for the portal branch.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from common.ingest_runs import run_from_event, write_run
from common.notices import now_iso, read_meta, write_meta

try:  # local / tests: backend/ is the source root
    from ingest import cdsco_extract
except ModuleNotFoundError:  # Lambda: CodeUri backend/ingest/ puts the siblings in /var/task
    import cdsco_extract

log = logging.getLogger(__name__)

META_PDF = "cdsco_pdf"
META_PORTAL = "cdsco_portal"
STEPS = ("fetch", "extract", "normalise", "diff")
# write_meta owns these; everything else on the previous meta row is carried over unchanged
_META_OWNED = frozenset(
    {"pk", "source", "last_run_at", "last_success_at", "last_error", "degraded", "last_counts"}
)
_COUNT_KEYS = ("created", "updated", "unchanged", "upserted")


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def meta_source(event: dict | None) -> str:
    """``cdsco_portal`` when the run went through the portal branch, else ``cdsco_pdf``."""
    ev = cdsco_extract.pipeline_event(event, *STEPS)
    adapter = str(ev.get("adapter") or "pdf").removeprefix("cdsco_")
    return META_PORTAL if adapter == "portal" else META_PDF


def _kept_extra(previous: dict | None) -> dict:
    """Fields of the previous meta row that a new write must not lose (listing, ingested...)."""
    return {k: v for k, v in (previous or {}).items() if k not in _META_OWNED}


def _error_text(error: Any) -> str:
    """``$.error`` from an ASL Catch is ``{Error, Cause}``; a direct invoke may pass a string."""
    if isinstance(error, dict):
        name = str(error.get("Error") or "").strip()
        cause = str(error.get("Cause") or "").strip()
        return ": ".join(p for p in (name, cause) if p) or "unknown error"
    return str(error) or "unknown error"


def _degraded_step(event: dict | None) -> str | None:
    """``"<step>: <error>"`` for the first task result that came back degraded, else None."""
    for step in STEPS:
        part = (event or {}).get(step)
        if isinstance(part, dict) and part.get("degraded"):
            return f"{step}: {part.get('error') or 'degraded'}"
    return None


def _safe_write_run(run_id: str, **fields: Any) -> None:
    try:
        write_run(run_id, **fields)
    except Exception as exc:  # bookkeeping must never fail the step
        log.warning("cdsco_publish: could not write run %s: %s", run_id, exc)


# --------------------------------------------------------------------------- Diff


def previous_counts(meta: dict | None) -> dict | None:
    """The previous *publish* counts, or None before the first publish.

    Fetch rewrites ``meta#cdsco_pdf`` (``last_counts`` = listing counts, ``last_run`` dropped)
    before Diff runs, so the counts are taken from ``last_run.counts`` when it survived, else
    from the newest ``ingested`` entry (Fetch carries that list forward; Publish stamps each
    entry with its counts), else from ``last_counts`` only when they are publish counts.
    """
    meta = meta or {}
    last_run = meta.get("last_run")
    if isinstance(last_run, dict) and isinstance(last_run.get("counts"), dict):
        return dict(last_run["counts"])
    entries = [e for e in meta.get("ingested") or [] if isinstance(e, dict) and e.get("counts")]
    if entries:
        newest = max(entries, key=lambda e: str(e.get("ingested_at") or ""))
        return dict(newest["counts"])
    counts = meta.get("last_counts")
    if isinstance(counts, dict) and "created" in counts:
        return dict(counts)
    return None


def diff_handler(event: dict | None, context: object) -> dict:
    """New vs existing for this run: ``{new, updated, existing, total, month, previous}``."""
    t0 = time.monotonic()
    run_id, _ = run_from_event(event)
    try:
        ev = cdsco_extract.pipeline_event(event, "fetch", "extract", "normalise")
        counts = ev.get("counts") if isinstance(ev.get("counts"), dict) else {}
        out = {
            "new": _int(counts.get("created")),
            "updated": _int(counts.get("updated")),
            "existing": _int(counts.get("unchanged")),
            "total": _int(ev.get("notices_out")),
            "month": ev.get("month"),
            "previous": previous_counts(read_meta(meta_source(event))),
            "run_id": run_id,
            "degraded": False,
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
    except Exception as exc:  # never raise on upstream failure
        error = f"{type(exc).__name__}: {exc}"
        _safe_write_run(run_id, step="diff", status="failed", error=error)
        return {
            "new": 0,
            "updated": 0,
            "existing": 0,
            "total": 0,
            "run_id": run_id,
            "degraded": True,
            "error": error,
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
    _safe_write_run(
        run_id,
        step="diff",
        status="done",
        diff={k: out[k] for k in ("new", "updated", "existing", "total", "previous")},
    )
    return out


# --------------------------------------------------------------------------- Publish


def _publish_failure(event: dict, run_id: str, source: str, error: str, t0: float) -> dict:
    previous = read_meta(source)
    write_meta(source, ok=False, error=error, extra=_kept_extra(previous))
    _safe_write_run(run_id, step="publish", status="failed", error=error, finished_at=now_iso())
    return {
        "published": False,
        "meta_pk": f"meta#{source}",
        "run_id": run_id,
        "error": error,
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
    }


def _publish_success(event: dict, run_id: str, source: str, t0: float) -> dict:
    ev = cdsco_extract.pipeline_event(event, "fetch", "extract", "normalise")
    diff = event.get("diff") if isinstance(event.get("diff"), dict) else None
    norm_counts = ev.get("counts") if isinstance(ev.get("counts"), dict) else {}
    counts = {
        **{k: _int(norm_counts.get(k)) for k in _COUNT_KEYS},
        "rows_in": _int(ev.get("rows_in")),
        "notices_out": _int(ev.get("notices_out")),
    }
    now = now_iso()
    pdf_url = ev.get("pdf_url")
    last_run = {
        "run_id": run_id,
        "adapter": ev.get("adapter"),
        "month": ev.get("month"),
        "pdf_url": pdf_url,
        "pdf_s3_key": ev.get("pdf_s3_key"),
        "method": ev.get("method"),
        "fallback_used": ev.get("fallback_used"),
        "bedrock": ev.get("bedrock"),
        "counts": counts,
        "diff": {k: diff[k] for k in ("new", "updated", "existing", "total") if k in diff}
        if diff
        else None,
        "finished_at": now,
    }
    previous = read_meta(source) or {}
    extra = _kept_extra(previous)
    ingested = [e for e in (previous.get("ingested") or []) if isinstance(e, dict)]
    if pdf_url:
        entry = {
            "num_id": ev.get("num_id"),
            "pdf_url": pdf_url,
            "pdf_s3_key": ev.get("pdf_s3_key"),
            "month": ev.get("month"),
            "lab_scope": ev.get("lab_scope"),
            "ingested_at": now,
            "run_id": run_id,
            "counts": counts,
        }
        ingested = [e for e in ingested if e.get("pdf_url") != pdf_url] + [entry]
    extra.update({"last_run": last_run, "ingested": ingested})
    extra.setdefault("listing", previous.get("listing") or [])
    write_meta(source, ok=True, counts=counts, extra=extra)
    _safe_write_run(
        run_id,
        step="publish",
        status="done",
        counts=counts,
        diff=last_run["diff"],
        month=ev.get("month"),
        finished_at=now,
    )
    return {
        "published": True,
        "meta_pk": f"meta#{source}",
        "run_id": run_id,
        "counts": counts,
        "diff": last_run["diff"],
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
    }


def handler(event: dict | None, context: object) -> dict:
    """Publish (no ``$.error``) or RecordFailure (``$.error`` present); never raises."""
    t0 = time.monotonic()
    event = event or {}
    run_id, _ = run_from_event(event)
    try:
        source = meta_source(event)
        if event.get("error"):
            return _publish_failure(event, run_id, source, _error_text(event["error"]), t0)
        degraded = _degraded_step(event)
        if degraded:
            return _publish_failure(event, run_id, source, degraded, t0)
        return _publish_success(event, run_id, source, t0)
    except Exception as exc:  # bookkeeping must never fail the pipeline
        error = f"{type(exc).__name__}: {exc}"
        log.warning("cdsco_publish: %s", error)
        _safe_write_run(run_id, step="publish", status="failed", error=error)
        return {
            "published": False,
            "run_id": run_id,
            "error": error,
            "degraded": True,
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
