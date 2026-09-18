"""CDSCO rows → Notice records (SPEC §Ingest pipeline, shared by both adapters; P03).

P01 placeholder: deterministic header-keyword mapping only. The Bedrock path
(``common.bedrock.converse_json("normalise", ...)``, Nova Lite) is wired and
attempted outside DEMO_MODE, but its result is not yet applied, so
``fallback_used.normalise`` is always ``True`` until P03.

Wording rule (CLAUDE.md): a CDSCO NSQ hit is "failed CDSCO quality test", never
anything stronger.

State-machine contract: the IngestStateMachine stores task results under
``$.fetch`` / ``$.extract``; ``handler`` reads its inputs from the top level
first and then from those nested objects. Rows arrive inline (``rows`` +
``row_pages``) or via ``rows_s3_key``; only when neither is present does this
function fetch/extract on its own.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from common import dynamo, s3
from common.bedrock import converse_json
from common.demo_mode import fetch_bytes, is_demo
from common.schemas import Notice, RowRef

try:  # local / tests: backend/ is the source root
    from ingest import cdsco_extract, cdsco_fetch
except ModuleNotFoundError:  # Lambda: CodeUri backend/ingest/ puts the siblings in /var/task
    import cdsco_extract
    import cdsco_fetch

log = logging.getLogger(__name__)

SOURCE = "cdsco_nsq"
PORTAL_URL = "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug"
_MONTHS = {
    m: i
    for i, m in enumerate(
        ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
        start=1,
    )
}

# field -> header keywords (lower-case substring match, first hit wins)
HEADER_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("sno", ("s.no", "s. no", "sno", "sr.", "sl.")),
    ("product", ("product", "drug name", "name of drug")),
    ("batch", ("batch", "lot")),
    ("mfg_date", ("manufacturing date", "mfg", "mfd")),
    ("exp_date", ("expiry", "exp")),
    ("brand", ("manufactured by", "manufacturer", "name of manufacturer")),
    ("result", ("nsq", "result", "reason", "parameter", "declared")),
    ("lab", ("reported by", "laboratory", "lab", "state")),
]
PDF_DEFAULT_ORDER = ["sno", "product", "batch", "mfg_date", "exp_date", "brand", "result", "lab"]
PORTAL_KEYS = {
    "str_product_name": "product",
    "str_batch_no": "batch",
    "dt_manufacturing_date": "mfg_date",
    "dt_expiry_date": "exp_date",
    "str_manufactured_by": "brand",
    "str_nsq_result": "result",
    "str_reporting_source": "reporting_source",
    "str_reported_by_lab_or_state": "lab",
    "dt_reporting_month_year": "month",
}

# Manufacturer cell → brand. The cell is "<company>, <street address>" on both the portal and
# the PDFs; brand_lc must be the company alone for the GSI equality lookup (SPEC §Match 1).
_MS_PREFIX = re.compile(r"^\s*(?:m/s\.?|ms\.)\s*", re.IGNORECASE)
_CORP_SUFFIX = re.compile(
    r"\b(?:(?:pvt|p)\.?\s*ltd\b\.?|private\s+limited\b|limited\b|ltd\b\.?|llp\b|inc\b\.?"
    r"|co\.?\s*ltd\b\.?|pvt\b\.?)",
    re.IGNORECASE,
)
_ADDRESS_TOKEN = re.compile(
    r"(?<!^)(?<!\S)(?:plot|survey|survery|sy\.?|khasra|gat|village|vill\.?|vil|v\.p\.o\.?|h\.b\.|"
    r"sector|sec\.?|industrial|ind\.?|estate|road|distt?\.?|district|tehsil|teh\.?|the\.|"
    r"near|opp\.?|behind|km|pin|\d|[a-z]{1,2}-\d|\S*\d{6}(?!\d))",
    re.IGNORECASE,
)


def brand_from_manufacturer(cell: str) -> str:
    """``"Forgo Pharmaceuticals, 27, DIC Ind Area, ..."`` → ``"Forgo Pharmaceuticals"``.

    Strips a leading ``M/s.``, keeps the text before the first comma, then cuts either
    right after a corporate suffix (``Pvt. Ltd.``/``Ltd.``/``LLP``) or before the first
    address token (``Plot``, ``Khasra``, ``Village``, a number, ...). Falls back to the
    cleaned cell when nothing survives.
    """
    text = _clean(cell)
    text = _MS_PREFIX.sub("", text)
    head = text.split(",", 1)[0]
    suffix = _CORP_SUFFIX.search(head)
    if suffix:
        head = head[: suffix.end()]
    else:
        addr = _ADDRESS_TOKEN.search(head)
        if addr:
            head = head[: addr.start()]
    head = _clean(head).rstrip(" ,;:-")
    return head or text


def month_to_iso(month: str) -> str:
    """``JUL-2026`` / ``July 2026`` / ``2026-07`` → ``2026-07-01`` (first day of month)."""
    text = str(month).strip().upper()
    m = re.search(r"([A-Z]{3})[A-Z]*[\s\-/]*(\d{4})", text)
    if m and m.group(1) in _MONTHS:
        return f"{m.group(2)}-{_MONTHS[m.group(1)]:02d}-01"
    m = re.search(r"(\d{4})[\-/](\d{1,2})", text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"
    raise ValueError(f"unrecognised month: {month!r}")


def _clean(value: Any) -> str:
    return " ".join(str(value).split()) if value is not None else ""


def header_map(header: list[str]) -> dict[str, int]:
    """Map schema field → column index using header keywords; positional fallback."""
    mapping: dict[str, int] = {}
    for idx, cell in enumerate(header):
        low = _clean(cell).lower().replace(" ", "")  # "Manufact uring Date" -> one token
        for field, keys in HEADER_KEYWORDS:
            if field in mapping:
                continue
            if any(k.replace(" ", "") in low for k in keys):
                mapping[field] = idx
                break
    if "product" not in mapping or "batch" not in mapping:
        mapping = {f: i for i, f in enumerate(PDF_DEFAULT_ORDER) if i < len(header)}
    return mapping


def _is_header(row: list[str]) -> bool:
    return bool(row) and _clean(row[0]).replace(" ", "").startswith("S.No")


def _fields_from_list(row: list[str], mapping: dict[str, int]) -> dict[str, str]:
    def col(field: str) -> str:
        i = mapping.get(field)
        return _clean(row[i]) if i is not None and i < len(row) else ""

    return {f: col(f) for f in PDF_DEFAULT_ORDER}


def _fields_from_dict(row: dict) -> dict[str, str]:
    fields = {v: _clean(row.get(k)) for k, v in PORTAL_KEYS.items()}
    # unknown keys: try the header keyword table on the key names
    for key, value in row.items():
        if key in PORTAL_KEYS:
            continue
        low = str(key).lower()
        for field, keys in HEADER_KEYWORDS:
            if not fields.get(field) and any(k in low for k in keys):
                fields[field] = _clean(value)
    return fields


def _records(
    rows: list[list[str]] | list[dict], row_pages: list[int | None] | None = None
) -> list[tuple[dict[str, str], list[str], int | None]]:
    """Header detection + continuation merge → ``[(fields, cells, page), ...]`` in row order.

    A PDF row with neither product nor batch is a wrapped continuation of the
    previous row (typically the manufacturer address); its non-empty cells are
    appended to the previous record instead of becoming a notice of their own.
    ``page`` is the page of the record's first row (None when unknown).
    """
    mapping: dict[str, int] = {f: i for i, f in enumerate(PDF_DEFAULT_ORDER)}
    records: list[tuple[dict[str, str], list[str], int | None]] = []
    for index, raw in enumerate(rows):
        page = row_pages[index] if row_pages and index < len(row_pages) else None
        if isinstance(raw, dict):
            fields = _fields_from_dict(raw)
            cells = [_clean(v) for v in raw.values()]
        else:
            cells = [_clean(c) for c in raw]
            if _is_header(cells):
                mapping = header_map(cells)
                continue
            fields = _fields_from_list(cells, mapping)
        if not fields.get("product") and not fields.get("batch"):
            if records and any(cells):
                prev_fields, prev_cells, prev_page = records[-1]
                for key, value in fields.items():
                    if value:
                        prev_fields[key] = f"{prev_fields.get(key, '')} {value}".strip()
                width = max(len(prev_cells), len(cells))
                merged = [
                    f"{a} {b}".strip() if b else a
                    for a, b in zip(
                        prev_cells + [""] * (width - len(prev_cells)),
                        cells + [""] * (width - len(cells)),
                        strict=True,
                    )
                ]
                records[-1] = (prev_fields, merged, prev_page)
            continue
        records.append((fields, cells, page))
    return records


def rows_to_notices(
    rows: list[list[str]] | list[dict],
    *,
    adapter: str,
    month: str,
    pdf_s3_key: str | None = None,
    url: str = "",
    row_pages: list[int | None] | None = None,
) -> list[dict]:
    """Deterministic mapping of PDF (8-column) or portal (9-key) rows to Notice dicts.

    ``row_ref`` is ``{page, row}`` for the PDF adapter and ``{month, row}`` for the
    portal (SPEC §Data model); ``row`` counts records per PDF/month.
    """
    adapter = adapter if adapter.startswith("cdsco_") else f"cdsco_{adapter}"
    month = str(month).strip().upper()
    published_at = month_to_iso(month)
    if not url:
        url = PORTAL_URL if adapter == "cdsco_portal" else cdsco_extract.JUNE_2025_PDF_URL

    records = _records(rows, row_pages)
    notices: list[dict] = []
    for n, (fields, cells, page) in enumerate(records, start=1):
        row_month = fields.get("month") or month
        batch = fields.get("batch", "")
        row_ref = RowRef(page=page, row=n) if adapter == "cdsco_pdf" else RowRef(month=month, row=n)
        notice = Notice(
            pk=Notice.make_pk(SOURCE, f"{month}-{adapter}-{n}"),
            source=SOURCE,
            notice_id=f"{month}-{adapter}-{n}",
            adapter=adapter,
            title=f"{fields['product']} — failed CDSCO quality test, {row_month} alert, row {n}",
            product=fields["product"],
            brand=brand_from_manufacturer(fields.get("brand", "")),
            batches=[batch] if batch else [],
            hazard_or_failed_test=fields.get("result", ""),
            published_at=published_at,
            url=url,
            raw_excerpt=" | ".join(cells)[:4096],
            pdf_s3_key=pdf_s3_key,
            row_ref=row_ref,
            mfg_date=fields.get("mfg_date") or None,
            exp_date=fields.get("exp_date") or None,
            lab=fields.get("lab") or None,
        )
        notices.append(notice.model_dump())
    return notices


def _try_bedrock(rows: list, month: str) -> None:
    """Wired for P03: ask Nova Lite for a column mapping; result ignored in P01."""
    if is_demo():
        return
    sample = rows[:3]
    prompt = (
        "Map the columns of these CDSCO NSQ table rows to the fields product, batch, "
        "mfg_date, exp_date, brand, result, lab. Reply with one JSON object only.\n"
        f"month: {month}\nrows: {json.dumps(sample, ensure_ascii=False)[:3000]}"
    )
    converse_json("normalise", prompt, max_tokens=512)  # result applied in P03


def _rows_from_store(rows_s3_key: str | None) -> tuple[list | None, list | None]:
    """Rows mirrored by ``cdsco_extract`` (``{rows, row_pages}``); ``(None, None)`` if absent."""
    if not rows_s3_key:
        return None, None
    try:
        stored = json.loads(s3.get_bytes("raw", rows_s3_key).decode())
    except Exception as exc:  # fall through to a fresh extract
        log.warning("could not read extracted rows at %s: %s", rows_s3_key, exc)
        return None, None
    if isinstance(stored, dict) and isinstance(stored.get("rows"), list):
        return stored["rows"], stored.get("row_pages")
    return None, None


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    ev = cdsco_extract.pipeline_event(event, "fetch", "extract")
    adapter = str(ev.get("adapter", "portal")).removeprefix("cdsco_")
    extract_fallback = ev.get("fallback_used")
    if isinstance(extract_fallback, dict):
        extract_fallback = extract_fallback.get("extract")
    try:
        rows = ev.get("rows")
        row_pages = ev.get("row_pages")
        month = ev.get("month")
        pdf_s3_key = ev.get("pdf_s3_key")
        url = ev.get("url") or ""
        if rows is None and adapter == "pdf":
            rows, row_pages = _rows_from_store(ev.get("rows_s3_key"))
        if rows is None:
            if adapter == "pdf":
                pdf_bytes = (
                    s3.get_bytes("raw", pdf_s3_key)
                    if pdf_s3_key
                    else fetch_bytes(ev.get("pdf_url") or cdsco_extract.JUNE_2025_PDF_URL)
                )
                extracted = cdsco_extract.extract_rows(pdf_bytes, s3_key=pdf_s3_key)
                rows, row_pages = extracted["rows"], extracted["row_pages"]
                extract_fallback = extracted["fallback_used"]
            else:
                month = month or cdsco_fetch.newest_month()
                rows = cdsco_fetch.fetch_portal_rows(month)
                extract_fallback = False if extract_fallback is None else extract_fallback
        if adapter == "pdf":
            month = month or "JUN-2025"
            url = url or ev.get("pdf_url") or cdsco_extract.JUNE_2025_PDF_URL
        _try_bedrock(rows, month)
        notices = rows_to_notices(
            rows,
            adapter=adapter,
            month=month,
            pdf_s3_key=pdf_s3_key,
            url=url,
            row_pages=row_pages,
        )
        for notice in notices:
            dynamo.put("notices", notice)
    except Exception as exc:  # never raise on upstream failure
        return {
            "adapter": f"cdsco_{adapter}",
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
    return {
        "adapter": f"cdsco_{adapter}",
        "month": month,
        "pdf_s3_key": pdf_s3_key,
        "rows_in": len(rows),
        "notices_out": len(notices),
        "fallback_used": {"extract": extract_fallback, "normalise": True},
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
    }
