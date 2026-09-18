"""CDSCO NSQ PDF → table rows (SPEC §Ingest pipeline, adapter ``cdsco_pdf``; P03 core).

Textract ``StartDocumentAnalysis`` (FeatureTypes=[TABLES]) on the raw-bucket
object is the primary engine; ``pdfplumber.extract_tables()`` (default
settings, proven in P00 to give a clean 8-column table) is the fallback. Any
Textract exception or a result with fewer than 5 rows falls back. In DEMO_MODE,
or without an S3 key / RAW_BUCKET, Textract is skipped entirely.

Every row carries its 1-based page number (``row_pages`` runs parallel to
``rows``) so ``cdsco_normalise`` can write ``row_ref = {page, row}`` for PDF
notices (SPEC §Data model).

State-machine contract: the IngestStateMachine stores the Fetch result under
``$.fetch`` and this function's result under ``$.extract``; ``handler`` reads
its inputs from the top level first and then from those nested objects, so the
same code serves a direct invoke and an ASL execution.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import time
from typing import Any

from common import s3
from common.demo_mode import fetch_bytes, is_demo

log = logging.getLogger(__name__)

JUNE_2025_PDF_URL = (
    "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/"
    "CDSCO%20NSQ%20june25.pdf"
)
MIN_TEXTRACT_ROWS = 5
TEXTRACT_POLL_SECONDS = 3
TEXTRACT_TIMEOUT_SECONDS = 240
HEADER_PREFIX = "S.No"
# Step Functions caps state payloads at 256 KB; rows are inlined only below this size and
# always mirrored to ``rows_s3_key`` in the raw bucket.
MAX_INLINE_ROWS_BYTES = 200_000
_PIPELINE_META = frozenset({"degraded", "error", "took_ms"})


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


# --------------------------------------------------------------------------- Textract
def _textract_rows(s3_key: str) -> tuple[list[list[str]], list[int | None]]:
    """Run async Textract TABLES analysis on ``RAW_BUCKET/s3_key`` → ``(rows, row_pages)``.

    Rows are reconstructed from TABLE → CELL → WORD relationships ordered by
    ``RowIndex``/``ColumnIndex``; tables are concatenated in page order and a
    repeated header row (first cell ``S.No``) is dropped after the first table.
    """
    import boto3  # imported here so the pdfplumber-only path never needs it

    bucket = s3.bucket_name("raw")
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-south-1"
    client = boto3.client("textract", region_name=region)
    job = client.start_document_analysis(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": s3_key}},
        FeatureTypes=["TABLES"],
    )
    job_id = job["JobId"]

    blocks: list[dict] = []
    deadline = time.monotonic() + TEXTRACT_TIMEOUT_SECONDS
    while True:
        page = client.get_document_analysis(JobId=job_id, MaxResults=1000)
        status = page.get("JobStatus")
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
        time.sleep(TEXTRACT_POLL_SECONDS)

    return rows_and_pages_from_blocks(blocks)


def rows_and_pages_from_blocks(blocks: list[dict]) -> tuple[list[list[str]], list[int | None]]:
    """Pure reconstruction of table rows (+ per-row page numbers) from Textract blocks."""
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
        key=lambda b: (b.get("Page", 0), b.get("Geometry", {}).get("BoundingBox", {}).get("Top", 0))
    )

    rows: list[list[str]] = []
    row_pages: list[int | None] = []
    for t_index, table in enumerate(tables):
        page_no = table.get("Page")
        page_no = int(page_no) if page_no is not None else None
        grid: dict[int, dict[int, str]] = {}
        max_col = 0
        for cell in children(table, {"CELL"}):
            r, c = int(cell.get("RowIndex", 0)), int(cell.get("ColumnIndex", 0))
            if r <= 0 or c <= 0:
                continue
            grid.setdefault(r, {})[c] = cell_text(cell)
            max_col = max(max_col, c)
        for r in sorted(grid):
            row = [grid[r].get(c, "") for c in range(1, max_col + 1)]
            if t_index > 0 and _is_header(row):
                continue
            rows.append(row)
            row_pages.append(page_no)
    return rows, row_pages


def rows_from_blocks(blocks: list[dict]) -> list[list[str]]:
    """Rows only (see :func:`rows_and_pages_from_blocks`)."""
    return rows_and_pages_from_blocks(blocks)[0]


# --------------------------------------------------------------------------- pdfplumber
def _pdfplumber_rows(pdf_bytes: bytes) -> tuple[list[list[str]], int, list[int | None]]:
    """``extract_tables()`` with default settings on every page → ``(rows, pages, row_pages)``.

    Drops repeated header rows on pages > 1 and any row whose width differs from
    the header's (footnotes come back as narrow one-column tables).
    """
    import pdfplumber

    rows: list[list[str]] = []
    row_pages: list[int | None] = []
    width: int | None = None  # column count of the header (first row of page 1)
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        pages = len(pdf.pages)
        for p_index, page in enumerate(pdf.pages):
            for table in page.extract_tables() or []:
                for raw in table:
                    row = [_clean(c) for c in raw]
                    if width is None:
                        width = len(row)
                    elif len(row) != width:
                        # footnotes render as narrow 1-column "tables"; not data rows
                        continue
                    if p_index > 0 and _is_header(row):
                        continue
                    rows.append(row)
                    row_pages.append(p_index + 1)
    return rows, pages, row_pages


def _page_count(pdf_bytes: bytes) -> int:
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return len(pdf.pages)
    except Exception:  # page count is informational only
        return 0


# --------------------------------------------------------------------------- entry
def extract_rows(pdf_bytes: bytes, *, s3_key: str | None = None) -> dict:
    """Return ``{rows, row_pages, pages, engine, fallback_used, error}`` for a CDSCO NSQ PDF."""
    skip_textract = is_demo() or s3_key is None or not os.environ.get("RAW_BUCKET")
    if skip_textract:
        rows, pages, row_pages = _pdfplumber_rows(pdf_bytes)
        return {
            "rows": rows,
            "row_pages": row_pages,
            "pages": pages,
            "engine": "pdfplumber",
            "fallback_used": False,
            "error": None,
        }

    error: str | None = None
    try:
        rows, row_pages = _textract_rows(s3_key)
        if len(rows) >= MIN_TEXTRACT_ROWS:
            return {
                "rows": rows,
                "row_pages": row_pages,
                "pages": _page_count(pdf_bytes),
                "engine": "textract",
                "fallback_used": False,
                "error": None,
            }
        error = f"Textract returned {len(rows)} rows (< {MIN_TEXTRACT_ROWS})"
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    log.warning("Textract unavailable for %s, falling back to pdfplumber: %s", s3_key, error)

    rows, pages, row_pages = _pdfplumber_rows(pdf_bytes)
    return {
        "rows": rows,
        "row_pages": row_pages,
        "pages": pages,
        "engine": "pdfplumber",
        "fallback_used": True,
        "error": error,
    }


def _store_rows(s3_key: str | None, pdf_bytes: bytes, result: dict) -> str | None:
    """Mirror extracted rows to the raw bucket so Normalise never re-extracts; None on failure."""
    key = (
        f"{s3_key}.rows.json"
        if s3_key
        else f"cdsco/rows/{hashlib.sha256(pdf_bytes).hexdigest()[:12]}.json"
    )
    payload = {"rows": result["rows"], "row_pages": result["row_pages"]}
    try:
        return s3.put_bytes(
            "raw", key, json.dumps(payload, ensure_ascii=False).encode(), "application/json"
        )
    except Exception as exc:  # the inline rows still reach Normalise
        log.warning("could not store extracted rows at %s: %s", key, exc)
        return None


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    ev = pipeline_event(event, "fetch")
    s3_key = ev.get("pdf_s3_key")
    pdf_url = ev.get("pdf_url") or JUNE_2025_PDF_URL
    try:
        pdf_bytes = s3.get_bytes("raw", s3_key) if s3_key else fetch_bytes(pdf_url)
        result = extract_rows(pdf_bytes, s3_key=s3_key)
    except Exception as exc:  # never raise on upstream failure
        return {
            "adapter": "cdsco_pdf",
            "pdf_s3_key": s3_key,
            "pdf_url": pdf_url,
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
    rows = result["rows"]
    out = {
        "adapter": "cdsco_pdf",
        "pdf_s3_key": s3_key,
        "pdf_url": pdf_url,
        "month": ev.get("month"),
        "rows_in": len(rows),
        "pages": result["pages"],
        "engine": result["engine"],
        "fallback_used": result["fallback_used"],
        "error": result["error"],
        "rows_s3_key": _store_rows(s3_key, pdf_bytes, result),
        "first_rows": rows[:3],
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
    }
    if len(json.dumps(rows, ensure_ascii=False)) <= MAX_INLINE_ROWS_BYTES:
        out["rows"] = rows
        out["row_pages"] = result["row_pages"]
    return out
