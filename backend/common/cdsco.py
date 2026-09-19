"""CDSCO NSQ shared code: row -> Notice mapping and the cdscoonline.gov.in portal client.

Both adapters (``cdsco_portal`` live JSON, ``cdsco_pdf`` archive) and the ``cdsco_portal``
poller produce the same Notice shape (SPEC §Sources) through ``rows_to_notices``. The portal
client wraps the three GET JSON endpoints documented in ``docs/P00-REPORT.md``::

    /CDSCO/reportingYears?tab=nsq                       -> ["2019", ..., "2026"]
    /CDSCO/publicReportingMonths?year=2026&tab=nsq      -> ["Jan", ..., "Jul"]
    /CDSCO/filteredNsqDrugTable?month=MAR-2026&source=All&tab=nsq -> {aaData: [...]}

Every network call goes through ``common.demo_mode.fetch_json`` (fixtures in DEMO_MODE).
Nothing here imports ``ingest`` or ``pollers`` -- this module ships in the common layer.

Wording rule (CLAUDE.md): a CDSCO NSQ hit is "failed CDSCO quality test", never anything
stronger.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import re
from typing import Any

from common.demo_mode import fetch_json
from common.schemas import Notice, RowRef

SOURCE = "cdsco_nsq"
PORTAL_URL = "https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug"
PORTAL_BASE = "https://cdscoonline.gov.in/CDSCO"
JUNE_2025_PDF_URL = (
    "https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/"
    "CDSCO%20NSQ%20june25.pdf"
)
MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
_MONTHS = {m: i for i, m in enumerate(MONTH_NAMES, start=1)}
# A month name (full or 3-letter, any case: "JUlY") followed by a 4-digit year, with any of
# the separators the archive titles use ("June 2025", "MAY-2025", "April-2025", "May, 2024").
# Word boundaries keep "Not Of Standard" from reading as November.
_MONTH_YEAR = re.compile(
    r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?"
    r"|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?[\s\-/,]*((?:19|20)\d{2})\b",
    re.IGNORECASE,
)
_STATE_WORD = re.compile(r"\bstate\b", re.IGNORECASE)

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

# Manufacturer cell -> brand. The cell is "<company>, <street address>" on both the portal and
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


# --- mapping ----------------------------------------------------------------------


def portal_row_key(product: str, batch: str, manufacturer: str) -> str:
    """Stable 12-hex id of a portal row from its content (product | batch | manufacturer cell).

    The portal's ``aaData`` rows carry no id and are re-pulled every day for the current
    month; a positional id would re-label every later row whenever CDSCO inserts, corrects
    or withdraws one. Case and whitespace are normalised so a cosmetic edit keeps the id.
    """
    parts = (_clean(product).lower(), _clean(batch).lower(), _clean(manufacturer).lower())
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:12]


def brand_from_manufacturer(cell: str) -> str:
    """``"Forgo Pharmaceuticals, 27, DIC Ind Area, ..."`` -> ``"Forgo Pharmaceuticals"``.

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
    """``JUL-2026`` / ``July 2026`` / ``2026-07`` -> ``2026-07-01`` (first day of month)."""
    text = str(month).strip().upper()
    m = re.search(r"([A-Z]{3})[A-Z]*[\s\-/]*(\d{4})", text)
    if m and m.group(1) in _MONTHS:
        return f"{m.group(2)}-{_MONTHS[m.group(1)]:02d}-01"
    m = re.search(r"(\d{4})[\-/](\d{1,2})", text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-01"
    raise ValueError(f"unrecognised month: {month!r}")


def month_from_title(text: str | None) -> str | None:
    """Archive alert title -> ``MON-YYYY`` (3-letter upper), or None when it names no month.

    Handles every shape the cdsco.gov.in Alerts listing uses: ``"... MONTH OF June 2025"``,
    ``"... MONTH OF MAY-2025"``, ``"... The Month April-2025"``, ``"NSQ May 2024 State
    Labs"``, ``"JUlY-2024"``, ``"MARCH 2025"``. Titles without a month+year ("Samples
    declared NSQ 2017-2023", a vaccine notice) give None.
    """
    m = _MONTH_YEAR.search(_clean(text))
    if not m:
        return None
    return f"{m.group(1)[:3].upper()}-{m.group(2)}"


def canonical_month(text: str | None) -> str | None:
    """Any month spelling -> ``MON-YYYY`` (3-letter upper), or None when unrecognisable.

    Accepts what :func:`month_from_title` does ("June 2025", "MAY-2025", "NSQ May 2024
    State Labs") plus the portal/ISO shapes ``JUN-2025`` and ``2025-06``. This is the only
    form a notice pk / ``row_ref`` / ``published_at`` is ever derived from, so every entry
    point (``POST /ingest/run``, Fetch, Normalise) canonicalises through it: "June 2025" and
    "JUN-2025" must name the same notices, never two sets.
    """
    if text is None or not str(text).strip():
        return None
    found = month_from_title(str(text))
    if found:
        return found
    try:
        iso = month_to_iso(str(text))
    except ValueError:
        return None
    year, month, _day = iso.split("-")
    return f"{MONTH_NAMES[int(month) - 1]}-{year}"


def lab_scope_from_title(text: str | None) -> str:
    """``"state"`` when the title says State (labs / alert), else ``"cdsco"`` (central labs)."""
    return "state" if _STATE_WORD.search(_clean(text)) else "cdsco"


def _clean(value: Any) -> str:
    return " ".join(str(value).split()) if value is not None else ""


def header_map(header: list[str]) -> dict[str, int]:
    """Map schema field -> column index using header keywords; positional fallback."""
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
    rows: list[list[str]] | list[dict],
    row_pages: list[int | None] | None = None,
    row_ids: list[int | None] | None = None,
) -> list[tuple[dict[str, str], list[str], int | None, int | None]]:
    """Header detection + continuation merge -> ``[(fields, cells, page, row_id), ...]``.

    A PDF row with neither product nor batch is a wrapped continuation of the
    previous row (typically the manufacturer address); its non-empty cells are
    appended to the previous record instead of becoming a notice of their own.
    ``page`` is the page of the record's first row (None when unknown) and ``row_id`` that
    row's entry in ``row_ids`` (the extractor's 1-based data-row index, so a notice can be
    joined back to its ``GET /ingest/rows`` row and bbox; None when not given).
    """
    mapping: dict[str, int] = {f: i for i, f in enumerate(PDF_DEFAULT_ORDER)}
    records: list[tuple[dict[str, str], list[str], int | None, int | None]] = []
    for index, raw in enumerate(rows):
        page = row_pages[index] if row_pages and index < len(row_pages) else None
        row_id = row_ids[index] if row_ids and index < len(row_ids) else None
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
                prev_fields, prev_cells, prev_page, prev_id = records[-1]
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
                records[-1] = (prev_fields, merged, prev_page, prev_id)
            continue
        records.append((fields, cells, page, row_id))
    return records


def rows_to_notices(
    rows: list[list[str]] | list[dict],
    *,
    adapter: str,
    month: str,
    pdf_s3_key: str | None = None,
    url: str = "",
    row_pages: list[int | None] | None = None,
    source_confidence: str | None = "primary-official",
    row_ids: list[int | None] | None = None,
) -> list[dict]:
    """Deterministic mapping of PDF (8-column) or portal (9-key) rows to Notice dicts.

    ``row_ref`` is ``{page, row}`` for the PDF adapter and ``{month, row}`` for the
    portal (SPEC §Data model). For a PDF ``row`` is the extractor's data-row index of the
    record's first row when ``row_ids`` (parallel to ``rows``) is given -- the same number
    ``GET /ingest/rows`` reports, so a wrapped continuation row merged into its predecessor
    leaves a gap instead of shifting every later notice off its bbox -- else the record
    counter; the portal counts records per month. ``notice_id`` is
    ``<MONTH>-cdsco_pdf-<row>`` for a PDF (a published file never changes) and
    ``<MONTH>-cdsco_portal-<portal_row_key>`` for the portal, so the daily re-pull of the
    current month keeps ``pk`` stable per drug row whatever the row order; an exact duplicate
    row within one month gets a ``-2``, ``-3`` ... suffix in row order. Every notice carries
    ``source_confidence`` (default ``"primary-official"``: both adapters read the regulator's
    own publication; pass ``"fixture"`` for demo seeds, None to leave it unset).
    """
    adapter = adapter if adapter.startswith("cdsco_") else f"cdsco_{adapter}"
    month = str(month).strip().upper()
    published_at = month_to_iso(month)
    if not url:
        url = PORTAL_URL if adapter == "cdsco_portal" else JUNE_2025_PDF_URL

    records = _records(rows, row_pages, row_ids)
    notices: list[dict] = []
    seen: dict[str, int] = {}
    for n, (fields, cells, page, row_id) in enumerate(records, start=1):
        row_month = fields.get("month") or month
        batch = fields.get("batch", "")
        if adapter == "cdsco_pdf":
            n = row_id if row_id is not None else n
            row_ref = RowRef(page=page, row=n)
            notice_id = f"{month}-{adapter}-{n}"
        else:
            row_ref = RowRef(month=month, row=n)
            key = portal_row_key(fields["product"], batch, fields.get("brand", ""))
            seen[key] = seen.get(key, 0) + 1
            notice_id = f"{month}-{adapter}-{key}" + (f"-{seen[key]}" if seen[key] > 1 else "")
        notice = Notice(
            pk=Notice.make_pk(SOURCE, notice_id),
            source=SOURCE,
            notice_id=notice_id,
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
            source_confidence=source_confidence,
        )
        notices.append(notice.model_dump())
    return notices


# --- portal client ----------------------------------------------------------------


def _month_index(name: str) -> int:
    """``"Jan"`` / ``"JANUARY"`` / ``"jan-2026"`` -> 0..11, or -1 when unrecognised."""
    key = str(name).strip()[:3].upper()
    return MONTH_NAMES.index(key) if key in MONTH_NAMES else -1


def _month_label(index: int, year: int) -> str:
    return f"{MONTH_NAMES[index]}-{year}"


def reporting_years() -> list[int]:
    """Years the portal lists (``reportingYears``), ascending."""
    years = fetch_json(f"{PORTAL_BASE}/reportingYears?tab=nsq")
    if not isinstance(years, list):
        raise ValueError(f"unexpected reportingYears payload: {years!r}")
    return sorted({int(y) for y in years if str(y).strip().isdigit()})


def reporting_months(year: int) -> list[str]:
    """Months the portal lists for ``year`` as ``MON-YYYY`` (3-letter upper), chronological."""
    months = fetch_json(f"{PORTAL_BASE}/publicReportingMonths?year={int(year)}&tab=nsq")
    if not isinstance(months, list):
        raise ValueError(f"unexpected publicReportingMonths payload: {months!r}")
    indexes = sorted({_month_index(m) for m in months if _month_index(m) >= 0})
    return [_month_label(i, int(year)) for i in indexes]


def newest_month() -> str:
    """Resolve the newest reporting month on the portal as ``MON-YYYY`` (3-letter upper)."""
    years = reporting_years()
    if not years:
        raise ValueError("portal lists no reporting years")
    year = max(years)
    months = reporting_months(year)
    if not months:
        raise ValueError(f"no reporting months for {year}")
    return months[-1]


def months_since(start: dt.date, *, today: dt.date | None = None) -> list[str]:
    """Every portal month from ``start``'s month up to ``today`` (``MON-YYYY``, oldest first).

    Built from ``reporting_years`` + ``reporting_months`` so only months the portal actually
    serves are returned (2019 onwards); one request per candidate year.
    """
    today = today or dt.date.today()
    floor = start.replace(day=1)
    ceiling = today.replace(day=1)
    out: list[str] = []
    for year in reporting_years():
        if year < floor.year or year > ceiling.year:
            continue
        for label in reporting_months(year):
            first = dt.date.fromisoformat(month_to_iso(label))
            if floor <= first <= ceiling:
                out.append(label)
    return out


def fetch_portal_rows(month: str | None = None) -> list[dict]:
    """Rows (``aaData``) for ``month`` (``MON-YYYY``); newest month when None."""
    month = (month or newest_month()).strip().upper()
    payload = fetch_json(f"{PORTAL_BASE}/filteredNsqDrugTable?month={month}&source=All&tab=nsq")
    rows = payload.get("aaData", []) if isinstance(payload, dict) else payload
    return [r for r in rows if isinstance(r, dict)]
