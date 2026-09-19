"""CDSCO NSQ fetch — both adapters (SPEC §Sources, §Ingest pipeline; P03).

* ``cdsco_pdf`` (archive 2010–Jun 2025 + the ``/ingest`` hero, the default): scrape the
  cdsco.gov.in Alerts listing (one HTML page, ~300 ``<tr>`` rows, DataTables paginates
  client-side), pick the newest monthly NSQ alert of the requested lab scope that is not yet
  recorded in ``meta#cdsco_pdf.ingested``, resolve its ``download_file_division.jsp`` wrapper
  (a one-line ``<iframe src='…pdf'>``) to the real PDF URL, download the PDF into the raw
  bucket under ``cdsco/<basename>`` and record the listing + target in ``meta#cdsco_pdf``.
* ``cdsco_portal`` (live, 2019→now): cdscoonline.gov.in DataTables GET JSON endpoints.
  ``reportingYears`` → ``publicReportingMonths`` → newest month (``MON-YYYY``) →
  ``filteredNsqDrugTable`` → ``aaData`` rows. Skips Extract (the ASL Choice state).

Every network call goes through ``common.demo_mode.fetch_bytes`` (fixtures in DEMO_MODE:
listing → ``cdsco/alerts_listing.html``, any jsp wrapper → the June 2025 wrapper, any PDF →
``cdsco/nsq_latest.pdf``) with a 20 s timeout and 3 tries; the site is flaky. The portal
client lives in ``common.cdsco`` (shared with the ``cdsco_portal`` poller) and is re-exported.

State-machine contract: this is the first task; its result is stored under ``$.fetch`` and
``cdsco_extract`` / ``cdsco_normalise`` read ``pdf_s3_key`` / ``pdf_url`` / ``month`` from it.
Never raises: any failure returns ``{"adapter": "cdsco_pdf", "degraded": true, "error"}`` and
writes ``meta#cdsco_pdf`` with ``ok=False`` (previous ``last_success_at`` kept).
"""

from __future__ import annotations

import datetime as dt
import html
import logging
import posixpath
import re
import time
from dataclasses import asdict, dataclass
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit

from common import s3
from common.cdsco import (
    JUNE_2025_PDF_URL,
    PORTAL_BASE,
    SOURCE,
    canonical_month,
    fetch_portal_rows,
    lab_scope_from_title,
    month_from_title,
    newest_month,
    reporting_months,
    reporting_years,
)
from common.demo_mode import fetch_bytes
from common.ingest_runs import run_from_event, write_run
from common.notices import now_iso, read_meta, write_meta

log = logging.getLogger(__name__)

__all__ = [
    "ARCHIVE_BASE",
    "JUNE_2025_PDF_URL",
    "LISTING_URL",
    "META_SOURCE",
    "PORTAL_BASE",
    "SOURCE",
    "ArchiveEntry",
    "download_pdf",
    "fetch_archive_pdf",
    "fetch_portal_rows",
    "handler",
    "list_archive",
    "newest_month",
    "parse_listing",
    "pdf_key_for",
    "pick_target",
    "reporting_months",
    "reporting_years",
    "resolve_pdf_url",
]

ARCHIVE_BASE = "https://cdsco.gov.in"
LISTING_URL = f"{ARCHIVE_BASE}/opencms/opencms/en/Notifications/Alerts/"
META_SOURCE = "cdsco_pdf"  # meta#cdsco_pdf (the poller keeps meta#cdsco_portal)
HTTP_TIMEOUT = 20
HTTP_RETRIES = 3
MAX_LISTING_IN_META = 40

_TR = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.IGNORECASE | re.DOTALL)
_TD = re.compile(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", re.IGNORECASE | re.DOTALL)
_HREF = re.compile(r"""href\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))""", re.IGNORECASE)
_IFRAME_SRC = re.compile(
    r"""<iframe\b[^>]*?\bsrc\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+))""", re.IGNORECASE | re.DOTALL
)
_TAGS = re.compile(r"<[^>]+>")
_NSQ_WORDS = re.compile(r"\bnsq\b|not\s+of\s+standard|not\s+standard\s+quality", re.IGNORECASE)
_DATE_FORMATS = ("%Y-%b-%d", "%Y-%B-%d", "%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d", "%d/%m/%Y")


@dataclass
class ArchiveEntry:
    """One row of the cdsco.gov.in Alerts listing."""

    title: str
    date: str  # "YYYY-MM-DD" (the listing's "2025-Jul-18"), raw text when unparseable
    jsp_url: str  # absolute download_file_division.jsp?num_id=… wrapper URL
    num_id: str  # the base64 id in the wrapper URL ("MTI5Mjc=")
    size: str  # "185 KB" as listed
    month: str | None  # "MON-YYYY" from the title, None when the title names no month
    lab_scope: str  # "cdsco" (central labs) | "state"
    kind: str  # "monthly" (a monthly NSQ alert) | "other"

    def as_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- listing
def _text(fragment: str) -> str:
    return " ".join(html.unescape(_TAGS.sub(" ", fragment)).split())


def _href(fragment: str) -> str | None:
    m = _HREF.search(fragment)
    if not m:
        return None
    return html.unescape(next(g for g in m.groups() if g is not None)).strip()


def _iso_date(text: str) -> str:
    """``"2025-Jul-18"`` -> ``"2025-07-18"``; unparseable text is returned as-is."""
    raw = _text(text)
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return raw


def _num_id(url: str) -> str:
    values = parse_qs(urlsplit(url).query).get("num_id") or []
    return values[0].strip() if values else ""


def classify_title(title: str) -> tuple[str | None, str, str]:
    """``(month, lab_scope, kind)`` for an alert title.

    ``kind`` is ``"monthly"`` only when the title names a month+year *and* mentions NSQ /
    "not of standard": "CDSCO NSQ ALERT FOR THE MONTH OF June 2025" and "NSQ May 2024 State
    Labs" qualify; "Revise list drug alert May-2025", "List of spurious Drugs for the month of
    June-2025", "Samples declared NSQ 2017-2023" and "Availability of … NSQ Alert on New Link"
    do not.
    """
    month = month_from_title(title)
    kind = "monthly" if month and _NSQ_WORDS.search(title) else "other"
    return month, lab_scope_from_title(title), kind


def parse_listing(page: str | bytes) -> list[ArchiveEntry]:
    """Alerts listing HTML -> entries in listing order (newest first as CDSCO lists them).

    stdlib only (``re`` + ``html.unescape``); tolerant of single/double/unquoted attributes,
    whitespace and ``<th>`` header rows. Rows without a ``download_file_division.jsp`` link
    (the table header) are skipped.
    """
    text = page.decode("utf-8", errors="replace") if isinstance(page, bytes) else page
    entries: list[ArchiveEntry] = []
    for row in _TR.findall(text):
        cells = _TD.findall(row)
        if len(cells) < 4:
            continue
        href = _href(row)
        if not href or "download_file_division" not in href:
            continue
        title = _text(cells[1])
        month, lab_scope, kind = classify_title(title)
        entries.append(
            ArchiveEntry(
                title=title,
                date=_iso_date(cells[2]),
                jsp_url=urljoin(ARCHIVE_BASE, href),
                num_id=_num_id(href),
                size=_text(cells[4]) if len(cells) > 4 else "",
                month=month,
                lab_scope=lab_scope,
                kind=kind,
            )
        )
    return entries


def list_archive() -> list[ArchiveEntry]:
    """Fetch + parse the Alerts listing (fixture ``cdsco/alerts_listing.html`` in DEMO_MODE)."""
    body = fetch_bytes(LISTING_URL, timeout=HTTP_TIMEOUT, retries=HTTP_RETRIES)
    entries = parse_listing(body)
    if not entries:
        raise ValueError(f"no alert rows parsed from {LISTING_URL} ({len(body)} bytes)")
    return entries


def _absolute_pdf_url(src: str) -> str:
    """iframe ``src`` (site-relative, may contain spaces) -> absolute, ``%20``-encoded URL."""
    absolute = urljoin(ARCHIVE_BASE, html.unescape(src).strip())
    parts = urlsplit(absolute)
    path = quote(parts.path, safe="/%")  # keeps already-encoded %20 intact
    query = f"?{quote(parts.query, safe='=&%')}" if parts.query else ""
    return f"{parts.scheme}://{parts.netloc}{path}{query}"


def resolve_pdf_url(jsp_url: str) -> str:
    """``download_file_division.jsp?num_id=…`` -> the PDF URL its ``<iframe src>`` points at.

    The wrapper is a one-line iframe whose ``src`` is site-relative and contains spaces
    (``/opencms/resources/…/CDSCO NSQ june25.pdf``). A wrapper that already serves the PDF
    bytes resolves to itself.
    """
    body = fetch_bytes(jsp_url, timeout=HTTP_TIMEOUT, retries=HTTP_RETRIES)
    if body[:5] == b"%PDF-":
        return jsp_url
    m = _IFRAME_SRC.search(body.decode("utf-8", errors="replace"))
    if not m:
        raise ValueError(f"no <iframe src> in {jsp_url} ({len(body)} bytes)")
    return _absolute_pdf_url(next(g for g in m.groups() if g is not None))


# --------------------------------------------------------------------------- target
def _norm_month(month: str | None) -> str | None:
    """``MON-YYYY`` for any spelling ``common.cdsco.canonical_month`` knows; else upper-cased."""
    if not month:
        return None
    return canonical_month(str(month)) or str(month).strip().upper()


def _ingested_keys(ingested: list[dict] | None) -> tuple[set[str], set[str], set[str]]:
    ids: set[str] = set()
    urls: set[str] = set()
    keys: set[str] = set()
    for rec in ingested or []:
        if not isinstance(rec, dict):
            continue
        if rec.get("num_id"):
            ids.add(str(rec["num_id"]))
        if rec.get("pdf_url"):
            urls.add(str(rec["pdf_url"]))
        if rec.get("pdf_s3_key"):
            keys.add(str(rec["pdf_s3_key"]))
    return ids, urls, keys


def _synthetic_entry(pdf_url: str, *, month: str | None, lab_scope: str) -> ArchiveEntry:
    name = posixpath.basename(unquote(urlsplit(pdf_url).path))
    return ArchiveEntry(
        title=name,
        date="",
        jsp_url="",
        num_id="",
        size="",
        month=month_from_title(name) or _norm_month(month),
        lab_scope=lab_scope,
        kind="other",
    )


def pick_target(
    entries: list[ArchiveEntry],
    *,
    lab_scope: str = "cdsco",
    pdf_url: str | None = None,
    month: str | None = None,
    ingested: list[dict] | None = None,
    force: bool = False,
) -> tuple[ArchiveEntry | None, bool]:
    """Choose the alert to ingest -> ``(entry, is_new)``.

    * ``pdf_url`` bypasses the listing: the matching listing entry (through an ``ingested``
      record with that URL) when there is one, else a synthetic entry named after the file.
    * ``month`` (``"JUN-2025"`` / ``"June 2025"``) selects that month's monthly alert.
    * otherwise the newest monthly entry of ``lab_scope`` (by date, then listing order).

    Entries already in ``ingested`` (by ``num_id`` or ``pdf_url``) are skipped in favour of
    the newest not-yet-ingested one unless ``force``; when every candidate is already
    ingested the newest is returned with ``is_new=False`` so a re-run reuses the stored PDF.
    ``(None, False)`` only when no candidate exists at all.
    """
    ids, urls, _ = _ingested_keys(ingested)
    scope = (lab_scope or "cdsco").strip().lower()
    if pdf_url:
        by_url = next(
            (r for r in ingested or [] if isinstance(r, dict) and r.get("pdf_url") == pdf_url),
            None,
        )
        match = None
        if by_url and by_url.get("num_id"):
            match = next((e for e in entries if e.num_id == by_url["num_id"]), None)
        entry = match or _synthetic_entry(pdf_url, month=month, lab_scope=scope)
        return entry, force or pdf_url not in urls

    wanted = _norm_month(month)
    candidates = [
        e
        for e in entries
        if e.kind == "monthly" and e.lab_scope == scope and (wanted is None or e.month == wanted)
    ]
    if not candidates:
        return None, False
    # newest first: listing date desc, then the listing's own order (stable sort)
    candidates.sort(key=lambda e: e.date, reverse=True)
    if force:
        return candidates[0], True

    def seen(e: ArchiveEntry) -> bool:
        return (bool(e.num_id) and e.num_id in ids) or e.jsp_url in urls

    fresh = next((e for e in candidates if not seen(e)), None)
    return (fresh, True) if fresh else (candidates[0], False)


# --------------------------------------------------------------------------- download
def fetch_archive_pdf(url: str) -> bytes:
    """Download an archive alert PDF (fixture ``cdsco/nsq_latest.pdf`` in DEMO_MODE)."""
    return fetch_bytes(url, timeout=HTTP_TIMEOUT, retries=HTTP_RETRIES)


def pdf_key_for(url: str) -> str:
    """``cdsco/<basename>`` with the URL-decoded basename sanitised to ``[A-Za-z0-9._-]``.

    Whitespace and every other character (``(``, ``&``, ``'`` ... the archive's filenames are
    hand-typed) become ``_``, so the key always satisfies the ``cdsco/<file>.pdf`` shape
    ``GET /ingest/pdf?key=`` accepts and the June 2025 file stays
    ``cdsco/CDSCO_NSQ_june25.pdf``.
    """
    name = posixpath.basename(unquote(urlsplit(url).path)) or "nsq_latest.pdf"
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "nsq_latest.pdf"
    name = name[:-4] + ".pdf" if name.lower().endswith(".pdf") else name + ".pdf"
    return "cdsco/" + name


def download_pdf(
    pdf_url: str, *, ingested: list[dict] | None = None, force: bool = False
) -> tuple[str, bytes]:
    """Download ``pdf_url`` into the raw bucket -> ``(s3_key, bytes)``.

    The key is ``cdsco/<basename>`` (spaces -> ``_``: the June 2025 file becomes
    ``cdsco/CDSCO_NSQ_june25.pdf``). When ``ingested`` already records that key or URL the
    stored object is reused and no bytes are fetched (``b""`` returned) unless ``force``.
    """
    key = pdf_key_for(pdf_url)
    _, urls, keys = _ingested_keys(ingested)
    if not force and (pdf_url in urls or key in keys):
        return key, b""
    data = fetch_archive_pdf(pdf_url)
    if not data:
        raise ValueError(f"empty response for {pdf_url}")
    s3.put_bytes("raw", key, data, "application/pdf")
    return key, data


# --------------------------------------------------------------------------- handler
def _ms(t0: float) -> int:
    return int((time.monotonic() - t0) * 1000)


def _record_run(run_id: str, **fields: object) -> None:
    try:
        write_run(run_id, **fields)
    except Exception as exc:  # the run record is a progress mirror, never a failure cause
        log.warning("could not write run record %s: %s", run_id, exc)


def _fetch_pdf(event: dict, t0: float) -> dict:
    previous = read_meta(META_SOURCE) or {}
    ingested = [r for r in previous.get("ingested") or [] if isinstance(r, dict)]
    force = bool(event.get("force"))
    lab_scope = str(event.get("lab_scope") or "cdsco").strip().lower()
    wanted_url = event.get("pdf_url") or None
    entries: list[ArchiveEntry] = []
    listing_error: str | None = None
    try:
        entries = list_archive()
    except Exception as exc:
        if not wanted_url:
            raise
        listing_error = f"{type(exc).__name__}: {exc}"  # an explicit pdf_url can proceed
    monthly = [e for e in entries if e.kind == "monthly"]

    target, is_new = pick_target(
        entries,
        lab_scope=lab_scope,
        pdf_url=wanted_url,
        month=event.get("month"),
        ingested=ingested,
        force=force,
    )
    if target is None:
        want = event.get("month") or "newest"
        raise LookupError(
            f"no monthly NSQ alert ({lab_scope} labs, {want}) among {len(entries)} listing rows"
        )
    pdf_url = wanted_url or resolve_pdf_url(target.jsp_url)
    month = target.month or _norm_month(event.get("month"))
    key, data = download_pdf(pdf_url, ingested=ingested, force=force)
    reused = not data

    fetch_counts = {
        "listed": len(entries),
        "monthly": len(monthly),
        "downloaded": 0 if reused else 1,
    }
    last_fetch = {
        **target.as_dict(),
        "month": month,
        "pdf_url": pdf_url,
        "pdf_s3_key": key,
        "is_new": is_new,
        "reused": reused,
        "bytes": len(data),
        "counts": fetch_counts,
        "fetched_at": now_iso(),
        "listing_error": listing_error,
    }
    # ``last_counts`` stays the previous *publish* counts (Diff reads them for "N new since the
    # last run"); the listing counts live under ``last_fetch.counts``.
    previous_counts = previous.get("last_counts")
    write_meta(
        META_SOURCE,
        ok=True,
        counts=previous_counts if isinstance(previous_counts, dict) else None,
        extra={
            "listing": [e.as_dict() for e in monthly[:MAX_LISTING_IN_META]],
            "last_fetch": last_fetch,
            "ingested": ingested,
        },
    )
    return {
        "source": SOURCE,
        "adapter": "cdsco_pdf",
        "title": target.title,
        "month": month,
        "lab_scope": target.lab_scope,
        "pdf_url": pdf_url,
        "pdf_s3_key": key,
        "num_id": target.num_id,
        "date": target.date,
        "is_new": is_new,
        "reused": reused,
        "bytes": len(data),
        "listing_count": len(entries),
        "monthly_count": len(monthly),
        "counts": fetch_counts,
        "degraded": False,
        "took_ms": _ms(t0),
    }


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    event = event or {}
    adapter = str(event.get("adapter") or "pdf").removeprefix("cdsco_")
    run_id, execution_arn = run_from_event(event)
    try:
        if adapter == "portal":
            month = event.get("month") or newest_month()
            rows = fetch_portal_rows(month)
            out = {
                "source": SOURCE,
                "adapter": "cdsco_portal",
                "month": month.upper(),
                "rows_in": len(rows),
                "degraded": False,
                "took_ms": _ms(t0),
            }
        else:
            out = _fetch_pdf(event, t0)
    except Exception as exc:  # never raise on upstream failure
        error = f"{type(exc).__name__}: {exc}"
        log.warning("cdsco fetch (%s) degraded: %s", adapter, error)
        if adapter != "portal":
            try:
                previous = read_meta(META_SOURCE) or {}
                write_meta(
                    META_SOURCE,
                    ok=False,
                    error=error,
                    extra={
                        k: previous[k]
                        for k in ("listing", "last_fetch", "ingested")
                        if k in previous
                    },
                )
            except Exception as meta_exc:
                log.warning("could not write meta#%s: %s", META_SOURCE, meta_exc)
        _record_run(run_id, step="fetch", status="failed", error=error, execution_arn=execution_arn)
        return {
            "source": SOURCE,
            "adapter": f"cdsco_{adapter}",
            "degraded": True,
            "error": error,
            "took_ms": _ms(t0),
        }
    _record_run(
        run_id,
        step="fetch",
        status="done",
        execution_arn=execution_arn,
        adapter=out["adapter"],
        month=out.get("month"),
        pdf_url=out.get("pdf_url"),
        pdf_s3_key=out.get("pdf_s3_key"),
        title=out.get("title"),
    )
    return out
