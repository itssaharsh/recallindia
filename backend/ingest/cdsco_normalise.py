"""CDSCO rows → Notice records (SPEC §Ingest pipeline, shared by both adapters; P03).

Bedrock (Nova Lite, ``MODEL_NORMALISE``, temperature 0, strict JSON, batches of 25 rows)
maps messy table cells to the Notice fields; the deterministic header-keyword mapping in
``common.cdsco.rows_to_notices`` is the fallback and -- until model access is granted -- the
path every run takes. Either way ``rows_to_notices`` is the single place a row becomes a
Notice: a valid Bedrock batch is turned back into 8-column ``PDF_DEFAULT_ORDER`` cells (PDF)
or the portal's keyed dict (portal) and mapped like any other row, so the two paths produce
byte-identical notices when the model copies cells verbatim.

Bedrock is attempted only when ``BEDROCK_ENABLED`` is true and not in DEMO_MODE; the first
batch that fails (``BedrockUnavailable``, ``BedrockError``, unparsable or an invalid mapping)
stops further batches for this invocation, so an account without model access costs one
call, not ten.

Wording rule (CLAUDE.md): a CDSCO NSQ hit is "failed CDSCO quality test", never anything
stronger (handled in ``rows_to_notices``).

State-machine contract: the IngestStateMachine stores task results under ``$.fetch`` /
``$.extract``; ``handler`` reads its inputs with ``cdsco_extract.pipeline_event`` (nested
first, top-level wins). Rows arrive inline (``$.extract.rows``: ``{page, row, cells, bbox}``
records + ``header``) or via ``rows_s3_key``; only when neither is present does this
function fetch/extract on its own. Progress goes to ``ingest#<run_id>`` (step ``normalise``).
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from common import bedrock, cdsco, s3
from common.demo_mode import fetch_bytes, is_demo
from common.ingest_runs import run_from_event, write_run
from common.notices import Counts, add, new_counts, upsert_notice

try:  # local / tests: backend/ is the source root
    from ingest import cdsco_extract, cdsco_fetch
except ModuleNotFoundError:  # Lambda: CodeUri backend/ingest/ puts the siblings in /var/task
    import cdsco_extract
    import cdsco_fetch

log = logging.getLogger(__name__)

# The deterministic mapping lives in the common layer (``common.cdsco``) so the
# ``cdsco_portal`` poller shares it; the names are re-exported here for the state machine
# handler and existing tests.
SOURCE = cdsco.SOURCE
PORTAL_URL = cdsco.PORTAL_URL
HEADER_KEYWORDS = cdsco.HEADER_KEYWORDS
PDF_DEFAULT_ORDER = cdsco.PDF_DEFAULT_ORDER
PORTAL_KEYS = cdsco.PORTAL_KEYS
brand_from_manufacturer = cdsco.brand_from_manufacturer
portal_row_key = cdsco.portal_row_key
month_to_iso = cdsco.month_to_iso
month_from_title = cdsco.month_from_title
canonical_month = cdsco.canonical_month
header_map = cdsco.header_map
rows_to_notices = cdsco.rows_to_notices
_records = cdsco._records

SOURCE_CONFIDENCE = "primary-official"
DEFAULT_PDF_MONTH = "JUN-2025"  # the archive fixture (fixtures/cdsco/nsq_latest.pdf)
BEDROCK_BATCH_SIZE = 25
BEDROCK_MAX_TOKENS = 4096
BEDROCK_MIN_FILLED = 0.9  # share of a batch's rows that must come back with product + batch
# Bedrock reply fields, in the order they map onto PDF_DEFAULT_ORDER[1:]
BEDROCK_FIELDS = ("product", "batch", "mfg_date", "exp_date", "manufacturer", "result", "lab")
BEDROCK_SYSTEM = (
    "You map rows of an Indian CDSCO Not-of-Standard-Quality drug alert table to fields. "
    'Reply with ONE JSON object only: {"rows": [...]} with exactly N entries in input order; '
    "each entry has keys product, batch, mfg_date, exp_date, manufacturer, result, lab; "
    'copy values verbatim from the cells; use "" when a value is absent; never invent.'
)
# portal dict key for each Bedrock field (the portal's month column is never remapped)
_PORTAL_FIELD_KEYS = {
    "product": "str_product_name",
    "batch": "str_batch_no",
    "mfg_date": "dt_manufacturing_date",
    "exp_date": "dt_expiry_date",
    "manufacturer": "str_manufactured_by",
    "result": "str_nsq_result",
    "lab": "str_reported_by_lab_or_state",
}

__all__ = [
    "HEADER_KEYWORDS",
    "PDF_DEFAULT_ORDER",
    "PORTAL_KEYS",
    "PORTAL_URL",
    "SOURCE",
    "SOURCE_CONFIDENCE",
    "bedrock_map_rows",
    "brand_from_manufacturer",
    "handler",
    "header_map",
    "month_from_title",
    "month_to_iso",
    "normalise_pdf",
    "portal_row_key",
    "row_ids_from_extract",
    "rows_from_extract",
    "rows_to_notices",
]


def _clean(value: Any) -> str:
    return " ".join(str(value).split()) if value is not None else ""


# --------------------------------------------------------------------------- rows in


def _rows_pages_ids(
    extract: dict,
) -> tuple[list[list[str]], list[int | None], list[int | None]]:
    # one implementation for Normalise and the /ingest run view (common.cdsco)
    return cdsco.rows_pages_ids(extract)


def rows_from_extract(extract: dict) -> tuple[list[list[str]], list[int | None]]:
    """``$.extract`` (or its ``rows_s3_key`` mirror) -> ``(rows, row_pages)`` for the mapping.

    The header row comes first (page None) when the extract carries one, then one cell list
    per ``{page, row, cells, bbox}`` record. Plain ``list`` rows (with an optional parallel
    ``row_pages``) are accepted too, so a hand-built or pre-P03 payload still maps; a header
    embedded as the first plain row is not duplicated.
    """
    rows, pages, _ids = _rows_pages_ids(extract)
    return rows, pages


def row_ids_from_extract(extract: dict) -> list[int | None]:
    """The extractor's ``row`` index per row of :func:`rows_from_extract` (None for the header).

    ``cdsco_extract`` numbers data rows 1..N over the whole PDF and ``GET /ingest/rows``
    reports the same numbers, so a notice's ``row_ref.row`` built from these joins back to
    its row and bbox even after a wrapped continuation row is merged into its predecessor.
    Plain list rows carry no index (None -> ``rows_to_notices`` falls back to counting).
    """
    return _rows_pages_ids(extract)[2]


def _rows_from_store(rows_s3_key: str | None) -> dict | None:
    """The ``{method, header, rows, pages}`` mirror written by ``cdsco_extract``; None if absent."""
    if not rows_s3_key:
        return None
    try:
        stored = json.loads(s3.get_bytes("raw", rows_s3_key).decode())
    except Exception as exc:  # fall through to a fresh extract
        log.warning("could not read extracted rows at %s: %s", rows_s3_key, exc)
        return None
    if isinstance(stored, dict) and isinstance(stored.get("rows"), list):
        return stored
    return None


# --------------------------------------------------------------------------- Bedrock


def _new_bedrock_stats() -> dict:
    return {"enabled": bedrock.is_enabled(), "attempted": 0, "used": 0, "error": None}


def _batch_prompt(header: list[str], batch: list[list[str]]) -> str:
    return (
        f"N = {len(batch)}\n"
        f"header: {json.dumps(header, ensure_ascii=False)}\n"
        f"rows: {json.dumps(batch, ensure_ascii=False)}\n"
        f'Reply with {{"rows": [...]}} only, exactly {len(batch)} entries, input order.'
    )


def _valid_mapping(reply: Any, expected: int) -> list[dict] | None:
    """``{"rows": [...]}`` with ``expected`` dict entries, >= 90 % carrying product + batch."""
    if not isinstance(reply, dict) or not isinstance(reply.get("rows"), list):
        return None
    mapped = reply["rows"]
    if len(mapped) != expected or not all(isinstance(m, dict) for m in mapped):
        return None
    filled = sum(1 for m in mapped if _clean(m.get("product")) and _clean(m.get("batch")))
    if expected and filled < BEDROCK_MIN_FILLED * expected:
        return None
    return mapped


def _cells_for(original: list[str], mapped: dict, sno_index: int | None) -> list[str]:
    """One Bedrock entry -> ``[sno (original), product, ..., lab]`` in PDF_DEFAULT_ORDER."""
    sno = ""
    if sno_index is not None and sno_index < len(original):
        sno = original[sno_index]
    elif original:
        sno = original[0]
    return [_clean(sno), *(_clean(mapped.get(f)) for f in BEDROCK_FIELDS)]


def bedrock_map_rows(
    header: list[str],
    rows: list[list[str]],
    *,
    batch_size: int = BEDROCK_BATCH_SIZE,
    stats: dict | None = None,
) -> list[list[str]] | None:
    """Ask Nova Lite to map ``rows`` (cells under ``header``) to the seven Notice fields.

    Returns a list parallel to ``rows`` of 8-column ``PDF_DEFAULT_ORDER`` cells (original
    S.No kept) for every row of a valid batch, or None when no batch could be used. Rows of
    an unmapped batch are left as their original cells, so the caller must only substitute
    the rows it can trust (see ``_apply_bedrock``). ``stats`` (``{enabled, attempted, used,
    error}``) is filled in place. Skipped entirely in DEMO_MODE or with ``BEDROCK_ENABLED``
    false (one warning per invocation, logged by ``common.bedrock``); the first failed batch
    stops the rest.
    """
    stats = stats if stats is not None else _new_bedrock_stats()
    stats.setdefault("attempted", 0)
    stats.setdefault("used", 0)
    stats.setdefault("error", None)
    if not rows:
        return None
    if not bedrock.is_enabled():
        stats["enabled"] = False
        stats["error"] = "disabled (BEDROCK_ENABLED=false)"
        bedrock._warn_disabled_once()  # the once-per-invocation warning, same as converse()
        return None
    if is_demo():
        stats["error"] = "skipped in DEMO_MODE"
        return None
    sno_index = header_map(header).get("sno") if header else None
    batch_size = max(1, int(batch_size))
    out: list[list[str]] = [list(r) for r in rows]
    valid_any = False
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        stats["attempted"] += 1
        try:
            reply = bedrock.converse_json(
                "normalise",
                _batch_prompt(header, batch),
                system=BEDROCK_SYSTEM,
                max_tokens=BEDROCK_MAX_TOKENS,
                temperature=0.0,
            )
        except Exception as exc:  # converse_json never raises; a fake in tests might
            stats["error"] = f"{type(exc).__name__}: {exc}"
            break
        mapped = _valid_mapping(reply, len(batch))
        if mapped is None:
            stats["error"] = (
                "Bedrock reply unavailable or not a valid mapping "
                f"(batch {stats['attempted']}, {len(batch)} rows)"
            )
            break
        for offset, (original, entry) in enumerate(zip(batch, mapped, strict=True)):
            out[start + offset] = _cells_for(original, entry, sno_index)
        stats["used"] += 1
        valid_any = True
    return out if valid_any else None


def _to_default_order(header: list[str], cells: list[str]) -> list[str]:
    """Deterministic 8-column cells for one row (same order as a Bedrock-mapped row)."""
    mapping = header_map(header) if header else dict(zip(PDF_DEFAULT_ORDER, range(8), strict=True))
    fields = cdsco._fields_from_list(cells, mapping)
    return [fields[f] for f in PDF_DEFAULT_ORDER]


def _apply_bedrock(
    rows: list[list[str]],
    row_pages: list[int | None],
    stats: dict,
    row_ids: list[int | None] | None = None,
) -> tuple[list[list[str]], list[int | None], list[int | None] | None, bool]:
    """PDF rows (header first) -> ``(rows, row_pages, row_ids, fallback_used)``.

    With at least one valid Bedrock batch every row is put into ``PDF_DEFAULT_ORDER``
    (Bedrock cells for used batches, header-keyword cells for the rest) and the header row is
    dropped (from ``row_pages`` / ``row_ids`` too), so ``rows_to_notices`` maps positionally.
    Otherwise the input is returned as is.
    """
    header = rows[0] if rows and cdsco._is_header(rows[0]) else []
    body = rows[1:] if header else rows
    body_pages = row_pages[1:] if header else row_pages
    body_ids = (row_ids[1:] if header else row_ids) if row_ids is not None else None
    total_batches = -(-len(body) // BEDROCK_BATCH_SIZE) if body else 0
    mapped = bedrock_map_rows(header, body, stats=stats)
    if mapped is None:
        return rows, row_pages, row_ids, True
    used_rows = stats["used"] * BEDROCK_BATCH_SIZE
    out = [
        cells if i < used_rows else _to_default_order(header, cells)
        for i, cells in enumerate(mapped)
    ]
    ids = list(body_ids) if body_ids is not None else None
    return out, list(body_pages), ids, stats["used"] < total_batches


def _apply_bedrock_portal(rows: list[dict], stats: dict) -> tuple[list[dict], bool]:
    """Portal dict rows: Bedrock values (verbatim copies) written back under the portal keys."""
    if not rows:
        return rows, True
    header = list(rows[0].keys())
    cells = [[_clean(r.get(k)) for k in header] for r in rows]
    mapped = bedrock_map_rows(header, cells, stats=stats)
    if mapped is None:
        return rows, True
    used_rows = stats["used"] * BEDROCK_BATCH_SIZE
    out: list[dict] = []
    for i, row in enumerate(rows):
        if i >= used_rows:
            out.append(row)
            continue
        values = dict(zip(BEDROCK_FIELDS, mapped[i][1:], strict=True))
        out.append({**row, **{_PORTAL_FIELD_KEYS[f]: v for f, v in values.items()}})
    total_batches = -(-len(rows) // BEDROCK_BATCH_SIZE)
    return out, stats["used"] < total_batches


# --------------------------------------------------------------------------- normalise


def _upsert_all(notices: list[dict]) -> Counts:
    counts = new_counts()
    counts["fetched"] = len(notices)
    for notice in notices:
        add(counts, upsert_notice(notice))
    return counts


def normalise_pdf(extract_like: dict, *, month: str, pdf_s3_key: str | None, pdf_url: str) -> dict:
    """Map an extract (``$.extract`` shape) to notices and upsert them.

    Returns ``{notices, counts, fallback_used: {extract, normalise}, bedrock: {enabled,
    attempted, used, error}}``. ``counts`` are ``common.notices`` counts (created / updated /
    unchanged / upserted, plus ``fetched`` = notices mapped).
    """
    rows, row_pages = rows_from_extract(extract_like)
    row_ids = row_ids_from_extract(extract_like)
    extract_fallback = extract_like.get("fallback_used")
    if isinstance(extract_fallback, dict):
        extract_fallback = extract_fallback.get("extract")
    stats = _new_bedrock_stats()
    rows, row_pages, row_ids, normalise_fallback = _apply_bedrock(rows, row_pages, stats, row_ids)
    notices = rows_to_notices(
        rows,
        adapter="pdf",
        month=month,
        pdf_s3_key=pdf_s3_key,
        url=pdf_url,
        row_pages=row_pages,
        source_confidence=SOURCE_CONFIDENCE,
        row_ids=row_ids,
    )
    return {
        "notices": notices,
        "counts": _upsert_all(notices),
        "fallback_used": {"extract": bool(extract_fallback), "normalise": normalise_fallback},
        "bedrock": stats,
    }


def normalise_portal(rows: list[dict], *, month: str) -> dict:
    """Portal ``aaData`` rows -> notices (same return shape as :func:`normalise_pdf`)."""
    stats = _new_bedrock_stats()
    rows, normalise_fallback = _apply_bedrock_portal(rows, stats)
    notices = rows_to_notices(
        rows, adapter="portal", month=month, source_confidence=SOURCE_CONFIDENCE
    )
    return {
        "notices": notices,
        "counts": _upsert_all(notices),
        "fallback_used": {"extract": False, "normalise": normalise_fallback},
        "bedrock": stats,
    }


def _pdf_month(ev: dict, extract_like: dict, fetch_month: str | None = None) -> str:
    """The canonical ``MON-YYYY`` for this PDF's notices.

    ``$.fetch.month`` (already canonical: Fetch reads it off the listing title) wins over a
    top-level ``month`` (the raw ``POST /ingest/run`` body, spelled however the caller
    liked), then the month named in the title / header, then the fixture's JUN-2025. Every
    candidate goes through ``canonical_month`` so "June 2025" and "JUN-2025" produce the
    same pks; a month that cannot be canonicalised raises (-> degraded) rather than minting
    a second set of notices under a garbage prefix.
    """
    for month in (fetch_month, ev.get("month")):
        if month:
            canonical = canonical_month(str(month))
            if not canonical:
                raise ValueError(f"unrecognised month: {month!r} (expected e.g. JUN-2025)")
            return canonical
    header = extract_like.get("header")
    candidates = [ev.get("title"), " ".join(header) if isinstance(header, list) else None]
    for text in candidates:
        found = month_from_title(text) if text else None
        if found:
            return found
    return DEFAULT_PDF_MONTH


def _pdf_extract_like(ev: dict, pdf_s3_key: str | None, pdf_url: str | None) -> dict:
    """The rows to map: inline ``$.extract``, its S3 mirror, or a fresh extract of the PDF.

    Without rows and without a PDF to extract from (``pdf_url`` is None inside the state
    machine when Fetch produced neither key nor URL) this raises instead of guessing a PDF.
    """
    if isinstance(ev.get("rows"), list) and ev["rows"]:
        return ev
    stored = _rows_from_store(ev.get("rows_s3_key"))
    if stored is not None:
        merged = dict(ev)
        merged.update({k: v for k, v in stored.items() if v is not None})
        return merged
    if pdf_s3_key:
        pdf_bytes = s3.get_bytes("raw", pdf_s3_key)
    elif pdf_url:
        pdf_bytes = fetch_bytes(pdf_url)
    else:
        raise RuntimeError("no extracted rows and fetch produced neither pdf_s3_key nor pdf_url")
    return cdsco_extract.extract_rows(pdf_bytes, s3_key=pdf_s3_key)


def _safe_write_run(run_id: str, **fields: Any) -> None:
    try:
        write_run(run_id, **fields)
    except Exception as exc:  # bookkeeping must never fail the step
        log.warning("cdsco_normalise: could not write run %s: %s", run_id, exc)


def _upstream_failure(event: dict | None, *steps: str) -> str | None:
    """``"<step> degraded: <error>"`` when an earlier task result came back degraded."""
    for step in steps:
        part = (event or {}).get(step)
        if isinstance(part, dict) and part.get("degraded"):
            return f"{step} degraded: {part.get('error') or 'no detail'}"
    return None


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    ev = cdsco_extract.pipeline_event(event, "fetch", "extract")
    adapter = str(ev.get("adapter") or "portal").removeprefix("cdsco_")
    run_id, execution_arn = run_from_event(event)
    _safe_write_run(
        run_id,
        step="normalise",
        status="running",
        adapter=f"cdsco_{adapter}",
        execution_arn=execution_arn,
    )
    month = ev.get("month")
    pdf_s3_key = ev.get("pdf_s3_key") if adapter == "pdf" else None
    pdf_url = None
    fetch = (event or {}).get("fetch") if isinstance(event, dict) else None
    fetch = fetch if isinstance(fetch, dict) else None
    try:
        # The state machine routes a degraded step to RecordFailure before this task runs;
        # a direct invoke with a degraded $.fetch / $.extract must not map a default PDF.
        upstream = _upstream_failure(event, "fetch", "extract")
        if upstream:
            raise RuntimeError(upstream)
        if adapter == "pdf":
            # The June 2025 fixture URL is a direct-invoke convenience only: inside the
            # state machine ($.fetch present) the PDF is whatever Fetch produced, or nothing.
            pdf_url = ev.get("pdf_url") or ev.get("url")
            if not pdf_url and fetch is None:
                pdf_url = cdsco.JUNE_2025_PDF_URL
            extract_like = _pdf_extract_like(ev, pdf_s3_key, pdf_url)
            month = _pdf_month(ev, extract_like, fetch.get("month") if fetch else None)
            result = normalise_pdf(
                extract_like, month=month, pdf_s3_key=pdf_s3_key, pdf_url=pdf_url
            )
            rows_in = len(extract_like.get("rows") or [])
        else:
            rows = ev.get("rows") if isinstance(ev.get("rows"), list) else None
            if rows is None or not all(isinstance(r, dict) for r in rows):
                month = month or cdsco_fetch.newest_month()
                rows = cdsco_fetch.fetch_portal_rows(month)
            month = canonical_month(str(month)) or str(month).strip().upper()
            result = normalise_portal(rows, month=month)
            rows_in = len(rows)
    except Exception as exc:  # never raise on upstream failure
        error = f"{type(exc).__name__}: {exc}"
        _safe_write_run(run_id, step="normalise", status="failed", error=error)
        return {
            "adapter": f"cdsco_{adapter}",
            "month": month,
            "pdf_s3_key": pdf_s3_key,
            "pdf_url": pdf_url,
            "run_id": run_id,
            "degraded": True,
            "error": error,
            "took_ms": int((time.monotonic() - t0) * 1000),
        }
    out = {
        "adapter": f"cdsco_{adapter}",
        "month": month,
        "pdf_s3_key": pdf_s3_key,
        "pdf_url": pdf_url,
        "rows_in": rows_in,
        "notices_out": len(result["notices"]),
        "counts": result["counts"],
        "fallback_used": result["fallback_used"],
        "bedrock": result["bedrock"],
        "source_confidence": SOURCE_CONFIDENCE,
        "run_id": run_id,
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
    }
    _safe_write_run(
        run_id,
        step="normalise",
        status="done",
        month=month,
        rows_in=rows_in,
        notices_out=out["notices_out"],
        counts=out["counts"],
        fallback_used=out["fallback_used"],
        bedrock=out["bedrock"],
    )
    return out
