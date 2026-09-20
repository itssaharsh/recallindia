"""An in-memory search index over every notice, for ``GET /v1/notices?q=``.

The listing endpoints never scan (ADR-005); a search that reads one index page at a time can
only find what that page holds, so a batch code from a two-year-old recall was never found. This
module pages every source's ``source-published_at-index`` once (index queries, ~50 of them in
parallel, about a second), keeps the rows in the container's memory, and answers a substring
search over product, brand, model, notice id and listed batches in milliseconds. It is rebuilt
when older than ``SEARCH_INDEX_TTL`` seconds (default ten minutes), so a notice that landed
since then is found on the next rebuild; ``/v1/notices`` without ``q`` is always live. In
DEMO_MODE nothing is cached, so tests see the store as it is.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from common import dynamo
from common.demo_mode import is_demo
from common.notices import is_meta

try:
    from api.notices_query import ALL_SOURCES, matches_q
except ModuleNotFoundError:  # Lambda layout: siblings at /var/task
    from notices_query import ALL_SOURCES, matches_q  # type: ignore[no-redef]

log = logging.getLogger(__name__)

PAGE = 100
MAX_PAGES_PER_SLICE = 40  # 4,000 rows per slice: a slice is a source over one date range
# Date slices: one query chain per (source, range), all in parallel, so the biggest source
# (CDSCO, ~2,700 rows) is read as several short chains rather than one 27-page walk.
SLICE_EDGES = (
    "2020-01-01",
    "2023-01-01",
    "2024-01-01",
    "2025-01-01",
    "2025-07-01",
    "2026-01-01",
    "2026-04-01",
    "2026-07-01",
    "2026-10-01",
)
WORKERS = 8

_lock = threading.Lock()
_cache: dict = {"built_at": 0.0, "rows": []}


def ttl_seconds() -> int:
    if is_demo():
        return 0
    try:
        return max(0, int(os.environ.get("SEARCH_INDEX_TTL", "600")))
    except ValueError:
        return 600


def _slices() -> list[tuple[str | None, str | None]]:
    """(since, until) pairs covering all time: before the first edge, between each pair of
    edges, and after the last."""
    edges = list(SLICE_EDGES)
    return [(None, edges[0])] + list(zip(edges, edges[1:], strict=False)) + [(edges[-1], None)]


def _rows_for(job: tuple[str, str | None, str | None]) -> list[dict]:
    source, since, until = job
    rows: list[dict] = []
    esk = None
    for _ in range(MAX_PAGES_PER_SLICE):
        page, esk = dynamo.query_source(
            source, since=since, until=until, limit=PAGE, exclusive_start_key=esk
        )
        rows.extend(item for item in page if not is_meta(item))
        if esk is None:
            break
    return rows


def _published(item: dict) -> str:
    return str(item.get("published_at") or "")


def build() -> list[dict]:
    """Every notice, newest first: one query chain per (source, date slice), all in parallel."""
    jobs = [(source, since, until) for source in ALL_SOURCES for since, until in _slices()]
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        groups = list(pool.map(_rows_for, jobs))
    seen: set[str] = set()
    rows: list[dict] = []
    for group in groups:
        for item in group:
            pk = str(item.get("pk", ""))
            if pk not in seen:  # a row exactly on a slice edge belongs to one slice, but be sure
                seen.add(pk)
                rows.append(item)
    rows.sort(key=lambda item: (_published(item), str(item.get("pk", ""))), reverse=True)
    return rows


def rows() -> list[dict]:
    """The cached rows, rebuilt when stale. Concurrent callers wait for one rebuild."""
    with _lock:
        age = time.time() - _cache["built_at"]
        if not _cache["rows"] or age >= ttl_seconds():
            started = time.time()
            _cache["rows"] = build()
            _cache["built_at"] = time.time()
            log.info("search index: %d rows in %.1fs", len(_cache["rows"]), time.time() - started)
        return _cache["rows"]


def invalidate() -> None:
    _cache["built_at"] = 0.0


def search(
    q: str, sources: list[str], *, since: str | None, limit: int, offset: int = 0
) -> tuple[list[dict], bool]:
    """Matches for ``q`` within ``sources`` (and ``since``), newest first, ``offset``-paged.

    Returns ``(rows, more)``; ``more`` is True when a further page exists.
    """
    wanted = set(sources)
    hits = [
        item
        for item in rows()
        if item.get("source") in wanted
        and (not since or _published(item) >= since)
        and matches_q(item, q)
    ]
    page = hits[offset : offset + limit]
    return page, offset + limit < len(hits)
