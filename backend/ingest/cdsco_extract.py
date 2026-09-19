"""CDSCO NSQ PDF → table rows with page + bounding boxes (SPEC §Ingest pipeline; P03).

Textract ``StartDocumentAnalysis`` (FeatureTypes=[TABLES]) on the raw-bucket object is the
primary engine: ``GetDocumentAnalysis`` is polled inside the Lambda with backoff (3 s, ×1.5,
cap 15 s) for up to ``TEXTRACT_TIMEOUT_SECONDS``, rows are rebuilt from TABLE → CELL → WORD
relationships (``RowIndex`` / ``ColumnIndex``), each row's page comes from its TABLE block and
its bbox is the union of the row's CELL ``Geometry.BoundingBox`` (fractions of the page).
``pdfplumber.find_tables()`` (default settings, proven in P00 to give one clean 8-column table
per page) is the fallback — on **any** Textract exception (``SubscriptionRequiredException``
on the Free plan) or fewer than ``MIN_TEXTRACT_ROWS`` data rows — and the direct path in
DEMO_MODE or without an S3 key / ``RAW_BUCKET``. Both paths return the same ``ExtractedRow``
shape::

    {"page": 1, "row": 1, "cells": [8 strings], "bbox": {"left", "top", "width", "height"}}

``row`` is 1-based over the data rows of the whole PDF (header excluded; repeated headers and
footnote tables dropped) so ``cdsco_normalise`` can write ``row_ref = {page, row}`` and the
``/ingest`` overlay (P07) can draw each row over the PDF page. The result is always mirrored
to the raw bucket as ``<pdf_s3_key>.rows.json`` and inlined in the task result only under
``MAX_INLINE_ROWS_BYTES`` (Step Functions caps state at 256 KB).

State-machine contract: the IngestStateMachine stores the Fetch result under ``$.fetch`` and
this function's result under ``$.extract``; ``handler`` reads its inputs from the top level
first and then from ``$.fetch`` (``pipeline_event``). Progress goes to the ``ingest#<run_id>``
record (``common.ingest_runs``) on every Textract poll so ``GET /ingest/status`` can show it.
"""

from __future__ import annotations

import hashlib
import inspect
import io
import json
import logging
import os
import time
from collections.abc import Callable
from typing import Any

from common import s3
from common.cdsco import JUNE_2025_PDF_URL
from common.demo_mode import fetch_bytes, is_demo
from common.ingest_runs import run_from_event, write_run

log = logging.getLogger(__name__)

MIN_TEXTRACT_ROWS = 5
TEXTRACT_POLL_SECONDS = 3.0
TEXTRACT_POLL_BACKOFF = 1.5
TEXTRACT_POLL_CAP_SECONDS = 15.0
TEXTRACT_TIMEOUT_SECONDS = 240
HEADER_PREFIX = "S.No"
# Step Functions caps state payloads at 256 KB; rows are inlined only below this size and
# always mirrored to ``rows_s3_key`` in the raw bucket.
MAX_INLINE_ROWS_BYTES = 200_000
RUN_HEARTBEAT_SECONDS = 2.0
_PIPELINE_META = frozenset({"degraded", "error", "took_ms"})

ExtractedRow = dict[str, Any]  # {"page": int, "row": int, "cells": list[str], "bbox": dict|None}
ProgressFn = Callable[[dict], None]

# monkeypatchable in tests so the polling loop never actually waits
_sleep = time.sleep


def pipeline_event(event: dict | None, *nested: str) -> dict:
    """Flatten an ASL-shaped event: nested task results first, explicit top-level keys win."""
    event = event or {}
    merged: dict = {}
    for name in nested:
        part = event.get(name)
        if isinstance(part, dict):
            merged.update({k: v for k, v in part.items() if k not in _PIPELINE_META})
    merged.update({k: v for k, v in event.items() if k not in nested and v is not None})
    return merged


def _is_header(row: list[str]) -> bool:
    return bool(row) and str(row[0]).strip().replace(" ", "").startswith(HEADER_PREFIX)


def _clean(cell: Any) -> str:
    return " ".join(str(cell).split()) if cell is not None else ""


def _round_box(left: float, top: float, right: float, bottom: float) -> dict:
    clamp = lambda v: min(1.0, max(0.0, v))  # noqa: E731 - tiny local helper
    left, top, right, bottom = clamp(left), clamp(top), clamp(right), clamp(bottom)
    return {
        "left": round(left, 4),
        "top": round(top, 4),
        "width": round(max(0.0, right - left), 4),
        "height": round(max(0.0, bottom - top), 4),
    }


class _RowCollector:
    """Applies the shared row rules to both engines and numbers data rows over the PDF."""

    def __init__(self) -> None:
        self.header: list[str] = []
        self.rows: list[ExtractedRow] = []
        self._width: int | None = None

    def add(self, cells: list[str], *, page: int | None, bbox: dict | None) -> None:
        cells = [_clean(c) for c in cells]
        if _is_header(cells):
            if not self.header:  # the first header defines the column count
                self.header = cells
                self._width = len(cells)
            return  # repeated header on a later page / table
        if not any(cells):
            return
        if self._width is None:  # no header seen yet: the first data row sets the width
            self._width = len(cells)
        if len(cells) != self._width:
            return  # footnotes render as narrow one-column "tables"; not data rows
        self.rows.append({"page": page, "row": len(self.rows) + 1, "cells": cells, "bbox": bbox})


# --------------------------------------------------------------------------- Textract
def _textract_client() -> Any:
    import boto3  # imported here so the pdfplumber-only path never needs it

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    return boto3.client("textract", region_name=region)


def _textract_rows(s3_key: str, on_progress: ProgressFn | None = None) -> dict:
    """Run async Textract TABLES analysis on ``RAW_BUCKET/s3_key``.

    Returns ``{"header", "rows", "textract": {job_id, status, polls, elapsed_s, pages}}``;
    ``on_progress`` receives the ``textract`` dict after every poll. Raises on any Textract
    failure (``SubscriptionRequiredException`` on the Free plan, FAILED jobs, timeouts) — the
    caller falls back to pdfplumber.
    """
    client = _textract_client()
    bucket = s3.bucket_name("raw")
    t0 = time.monotonic()
    job = client.start_document_analysis(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": s3_key}},
        FeatureTypes=["TABLES"],
    )
    job_id = job["JobId"]
    progress = {
        "job_id": job_id,
        "status": "IN_PROGRESS",
        "polls": 0,
        "elapsed_s": 0,
        "pages": None,
    }

    blocks: list[dict] = []
    wait = TEXTRACT_POLL_SECONDS
    deadline = t0 + TEXTRACT_TIMEOUT_SECONDS
    while True:
        page = client.get_document_analysis(JobId=job_id, MaxResults=1000)
        status = page.get("JobStatus")
        progress.update(
            status=status,
            polls=progress["polls"] + 1,
            elapsed_s=round(time.monotonic() - t0, 1),
            pages=(page.get("DocumentMetadata") or {}).get("Pages"),
        )
        if on_progress:
            on_progress(dict(progress))
        if status == "SUCCEEDED":
            blocks.extend(page.get("Blocks", []))
            token = page.get("NextToken")
            while token:
                page = client.get_document_analysis(JobId=job_id, MaxResults=1000, NextToken=token)
                blocks.extend(page.get("Blocks", []))
                token = page.get("NextToken")
            break
        if status in {"FAILED", "PARTIAL_SUCCESS"}:
            raise RuntimeError(f"Textract job {job_id} {status}: {page.get('StatusMessage')}")
        if time.monotonic() > deadline:
            raise TimeoutError(
                f"Textract job {job_id} still {status} after {TEXTRACT_TIMEOUT_SECONDS}s"
            )
        _sleep(wait)
        wait = min(wait * TEXTRACT_POLL_BACKOFF, TEXTRACT_POLL_CAP_SECONDS)

    header, rows = rows_from_blocks_with_bbox(blocks)
    return {"header": header, "rows": rows, "textract": progress}


def _call_textract(s3_key: str, on_progress: ProgressFn | None) -> dict:
    """Invoke ``_textract_rows``; a test double that takes only the key still works."""
    fn = _textract_rows
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        params = {}
    if len(params) >= 2 or any(p.kind is p.VAR_KEYWORD for p in params.values()):
        return fn(s3_key, on_progress=on_progress)
    return fn(s3_key)


def _bbox_union(boxes: list[dict]) -> dict | None:
    """Union of Textract ``BoundingBox`` dicts (``Left/Top/Width/Height`` fractions)."""
    boxes = [b for b in boxes if b and all(k in b for k in ("Left", "Top", "Width", "Height"))]
    if not boxes:
        return None
    left = min(float(b["Left"]) for b in boxes)
    top = min(float(b["Top"]) for b in boxes)
    right = max(float(b["Left"]) + float(b["Width"]) for b in boxes)
    bottom = max(float(b["Top"]) + float(b["Height"]) for b in boxes)
    return _round_box(left, top, right, bottom)


def rows_from_blocks_with_bbox(blocks: list[dict]) -> tuple[list[str], list[ExtractedRow]]:
    """Pure reconstruction of ``(header, rows)`` from Textract blocks.

    Tables are walked in (page, top) order; each row's ``page`` is its TABLE block's ``Page``
    (1 when Textract omits it) and its ``bbox`` the union of its CELL geometry. The header is
    the first ``S.No`` row; repeated headers, empty rows and rows whose width differs from
    the header are dropped; data rows are numbered 1..N over the whole document.
    """
    by_id = {b["Id"]: b for b in blocks if "Id" in b}

    def children(block: dict, want: set[str]) -> list[dict]:
        out: list[dict] = []
        for rel in block.get("Relationships", []) or []:
            if rel.get("Type") != "CHILD":
                continue
            for cid in rel.get("Ids", []):
                child = by_id.get(cid)
                if child and child.get("BlockType") in want:
                    out.append(child)
        return out

    def cell_text(cell: dict) -> str:
        parts: list[str] = []
        for w in children(cell, {"WORD", "SELECTION_ELEMENT"}):
            if w["BlockType"] == "WORD":
                parts.append(w.get("Text", ""))
            elif w.get("SelectionStatus") == "SELECTED":
                parts.append("[x]")
        return _clean(" ".join(parts))

    tables = [b for b in blocks if b.get("BlockType") == "TABLE"]
    tables.sort(
        key=lambda b: (
            b.get("Page") or 0,
            (b.get("Geometry") or {}).get("BoundingBox", {}).get("Top", 0),
        )
    )

    collector = _RowCollector()
    for table in tables:
        page_no = int(table.get("Page") or 1)
        grid: dict[int, dict[int, str]] = {}
        boxes: dict[int, list[dict]] = {}
        max_col = 0
        for cell in children(table, {"CELL"}):
            r, c = int(cell.get("RowIndex", 0)), int(cell.get("ColumnIndex", 0))
            if r <= 0 or c <= 0:
                continue
            grid.setdefault(r, {})[c] = cell_text(cell)
            boxes.setdefault(r, []).append((cell.get("Geometry") or {}).get("BoundingBox") or {})
            max_col = max(max_col, c)
        for r in sorted(grid):
            row = [grid[r].get(c, "") for c in range(1, max_col + 1)]
            collector.add(row, page=page_no, bbox=_bbox_union(boxes.get(r, [])))
    return collector.header, collector.rows


def rows_and_pages_from_blocks(blocks: list[dict]) -> tuple[list[list[str]], list[int | None]]:
    """Legacy shape: ``(rows incl. the header first, row_pages)`` — see the bbox variant."""
    header, rows = rows_from_blocks_with_bbox(blocks)
    cells = [r["cells"] for r in rows]
    pages: list[int | None] = [r["page"] for r in rows]
    if header:
        cells.insert(0, header)
        pages.insert(0, pages[0] if pages else 1)
    return cells, pages


def rows_from_blocks(blocks: list[dict]) -> list[list[str]]:
    """Rows only (see :func:`rows_and_pages_from_blocks`)."""
    return rows_and_pages_from_blocks(blocks)[0]


# --------------------------------------------------------------------------- pdfplumber
def _plumber_row_bbox(table_row: Any, page: Any) -> dict | None:
    """Row bbox (union of its non-None cell boxes, else the row box) as page fractions."""
    cells = [c for c in (getattr(table_row, "cells", None) or []) if c]
    box = (
        (
            min(c[0] for c in cells),
            min(c[1] for c in cells),
            max(c[2] for c in cells),
            max(c[3] for c in cells),
        )
        if cells
        else getattr(table_row, "bbox", None)
    )
    if not box:
        return None
    x0, top, x1, bottom = (float(v) for v in box)
    w, h = float(page.width) or 1.0, float(page.height) or 1.0
    return _round_box(x0 / w, top / h, x1 / w, bottom / h)


def _pdfplumber_rows(pdf_bytes: bytes) -> tuple[list[str], list[ExtractedRow], int]:
    """``find_tables()`` with default settings on every page → ``(header, rows, pages)``.

    Text comes from ``table.extract()``; geometry from ``table.rows[i]`` (same index) scaled
    by the page size. Repeated header rows, empty rows and rows whose width differs from the
    header's (footnotes come back as narrow one-column tables) are dropped.
    """
    import pdfplumber

    collector = _RowCollector()
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = len(pdf.pages)
        for p_index, page in enumerate(pdf.pages):
            for table in page.find_tables() or []:
                text_rows = table.extract() or []
                for i, raw in enumerate(text_rows):
                    table_row = table.rows[i] if i < len(table.rows) else None
                    bbox = _plumber_row_bbox(table_row, page) if table_row is not None else None
                    collector.add(list(raw), page=p_index + 1, bbox=bbox)
    return collector.header, collector.rows, pages


def _page_count(pdf_bytes: bytes) -> int:
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return len(pdf.pages)
    except Exception:  # page count is informational only
        return 0


# --------------------------------------------------------------------------- entry
def _result(
    header: list[str],
    rows: list[ExtractedRow],
    pages: int,
    *,
    method: str,
    fallback_used: bool,
    error: str | None,
    textract: dict | None,
) -> dict:
    return {
        "header": header,
        "rows": rows,
        "pages": pages,
        "method": method,
        "fallback_used": fallback_used,
        "error": error,
        "textract": textract,
    }


def extract_rows(
    pdf_bytes: bytes, *, s3_key: str | None = None, on_progress: ProgressFn | None = None
) -> dict:
    """``{header, rows, pages, method, fallback_used, error, textract}`` for a CDSCO NSQ PDF.

    Textract runs only outside DEMO_MODE with an S3 key and ``RAW_BUCKET``; anything it
    raises, or a result under ``MIN_TEXTRACT_ROWS`` data rows, falls back to pdfplumber with
    ``fallback_used=True`` and the Textract error kept in ``error``.
    """
    skip_textract = is_demo() or s3_key is None or not os.environ.get("RAW_BUCKET")
    if skip_textract:
        header, rows, pages = _pdfplumber_rows(pdf_bytes)
        return _result(
            header, rows, pages, method="pdfplumber", fallback_used=False, error=None, textract=None
        )

    error: str | None = None
    textract: dict | None = None
    try:
        got = _call_textract(s3_key, on_progress)
        textract = got.get("textract")
        rows = got.get("rows") or []
        if len(rows) >= MIN_TEXTRACT_ROWS:
            return _result(
                got.get("header") or [],
                rows,
                textract.get("pages")
                if textract and textract.get("pages")
                else _page_count(pdf_bytes),
                method="textract",
                fallback_used=False,
                error=None,
                textract=textract,
            )
        error = f"Textract returned {len(rows)} rows (< {MIN_TEXTRACT_ROWS})"
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    log.warning("Textract unavailable for %s, falling back to pdfplumber: %s", s3_key, error)

    header, rows, pages = _pdfplumber_rows(pdf_bytes)
    return _result(
        header, rows, pages, method="pdfplumber", fallback_used=True, error=error, textract=textract
    )


def rows_s3_key_for(s3_key: str | None, pdf_bytes: bytes) -> str:
    """``<pdf_s3_key>.rows.json``, or ``cdsco/rows/<sha256[:12]>.json`` without a PDF key."""
    if s3_key:
        return f"{s3_key}.rows.json"
    return f"cdsco/rows/{hashlib.sha256(pdf_bytes).hexdigest()[:12]}.json"


def _store_rows(s3_key: str | None, pdf_bytes: bytes, result: dict) -> str | None:
    """Mirror extracted rows to the raw bucket so Normalise never re-extracts; None on failure."""
    key = rows_s3_key_for(s3_key, pdf_bytes)
    payload = {
        "method": result["method"],
        "header": result["header"],
        "rows": result["rows"],
        "pages": result["pages"],
        "pdf_s3_key": s3_key,
    }
    try:
        return s3.put_bytes(
            "raw", key, json.dumps(payload, ensure_ascii=False).encode(), "application/json"
        )
    except Exception as exc:  # the inline rows still reach Normalise
        log.warning("could not store extracted rows at %s: %s", key, exc)
        return None


def _record_run(run_id: str, **fields: Any) -> None:
    try:
        write_run(run_id, **fields)
    except Exception as exc:  # the run record is a progress mirror, never a failure cause
        log.warning("could not write run record %s: %s", run_id, exc)


def _load_pdf(s3_key: str | None, pdf_url: str) -> bytes:
    if not s3_key:
        return fetch_bytes(pdf_url)
    try:
        return s3.get_bytes("raw", s3_key)
    except FileNotFoundError:
        if not is_demo():
            raise
        # demo store without the object (a reused key from an earlier store): the fixture
        return fetch_bytes(pdf_url)


def _fetch_block(event: dict | None) -> dict | None:
    fetch = (event or {}).get("fetch") if isinstance(event, dict) else None
    return fetch if isinstance(fetch, dict) else None


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    ev = pipeline_event(event, "fetch")
    run_id, execution_arn = run_from_event(event)
    fetch = _fetch_block(event)
    s3_key = ev.get("pdf_s3_key")
    pdf_url = ev.get("pdf_url")
    # The June 2025 fixture URL is a convenience for a direct invoke only. Inside the state
    # machine ($.fetch present) a missing key/URL means Fetch failed, and silently extracting
    # the default PDF would publish last year's notices under whatever month was requested.
    if not pdf_url and not s3_key and fetch is None:
        pdf_url = JUNE_2025_PDF_URL
    month = ev.get("month")
    base = {"adapter": "cdsco_pdf", "pdf_s3_key": s3_key, "pdf_url": pdf_url, "month": month}
    if fetch is not None and (fetch.get("degraded") or not (s3_key or pdf_url)):
        error = (
            f"fetch degraded: {fetch.get('error') or 'no detail'}"
            if fetch.get("degraded")
            else "fetch produced neither pdf_s3_key nor pdf_url"
        )
        _record_run(run_id, step="extract", status="failed", execution_arn=execution_arn)
        _record_run(run_id, error=error, **base)
        return {**base, "run_id": run_id, "degraded": True, "error": error, "took_ms": _ms(t0)}
    _record_run(run_id, step="extract", status="running", execution_arn=execution_arn, **base)

    last_beat = 0.0

    def on_progress(progress: dict) -> None:
        nonlocal last_beat
        now = time.monotonic()
        if now - last_beat < RUN_HEARTBEAT_SECONDS:
            return
        last_beat = now
        _record_run(run_id, step="extract", status="running", textract=progress)

    try:
        pdf_bytes = _load_pdf(s3_key, pdf_url)
        result = extract_rows(pdf_bytes, s3_key=s3_key, on_progress=on_progress)
    except Exception as exc:  # never raise on upstream failure
        error = f"{type(exc).__name__}: {exc}"
        _record_run(run_id, step="extract", status="failed", error=error)
        return {**base, "run_id": run_id, "degraded": True, "error": error, "took_ms": _ms(t0)}

    rows = result["rows"]
    rows_s3_key = _store_rows(s3_key, pdf_bytes, result)
    summary = {
        "pages": result["pages"],
        "method": result["method"],
        "fallback_used": result["fallback_used"],
        "error": result["error"],
        "textract": result["textract"],
        "rows_in": len(rows),
        "rows_s3_key": rows_s3_key,
    }
    _record_run(run_id, step="extract", status="done", **summary)
    out = {
        **base,
        **summary,
        "header": result["header"],
        "run_id": run_id,
        "degraded": False,
        "took_ms": _ms(t0),
    }
    if len(json.dumps(rows, ensure_ascii=False)) <= MAX_INLINE_ROWS_BYTES:
        out["rows"] = rows
    return out


def _ms(t0: float) -> int:
    return int((time.monotonic() - t0) * 1000)
