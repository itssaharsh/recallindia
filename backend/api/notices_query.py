"""Newest-first, cursor-paginated notice queries for ``GET /v1/notices`` and ``GET /v1/diff``.

Every page comes from ``common.dynamo.query_source`` (the ``source-published_at-index`` GSI):
one Query per requested source, never a table scan. A request without ``source`` merges the
per-source pages newest-first. The cursor is opaque to clients -- base64url(JSON) of
``{"v": 1, "src": {<source>: {"esk", "skip", "done"}}, "since", "limit"}`` -- and carries
each source's real DynamoDB ``LastEvaluatedKey`` (``esk``) plus how many items of that page
were already handed out (``skip``), so a single-source listing pages with the index key
exactly and a merged listing never repeats or drops a row. See ADR-005.
"""

from __future__ import annotations

import base64
import json
import re
from collections import Counter
from typing import Any

from common import dynamo
from common.notices import is_meta

ALL_SOURCES = ["cdsco_nsq", "cpsc", "nhtsa", "openfda", "siam"]
DEFAULT_LIMIT = 50
MAX_LIMIT = 100
CURSOR_VERSION = 1
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_Q_FIELDS = ("title", "product", "brand", "model", "notice_id")
_Q_LIST_FIELDS = ("batches",)
# ``q`` keeps reading until it has a page of matches: pages of Q_PAGE rows, MAX_Q_PAGES at most
# (2,000 rows, about twenty index queries), whatever page size the client asked for
Q_PAGE = 100
MAX_Q_PAGES = 20


class BadCursor(ValueError):
    """The cursor is not one we issued for this query (malformed, other since/sources)."""


def valid_date(text: str | None) -> bool:
    """True for a ``YYYY-MM-DD`` string."""
    return bool(text) and bool(_ISO_DATE.match(str(text)))


def parse_limit(value: str | int | None) -> int:
    """``limit`` query value -> int in ``1..MAX_LIMIT`` (default 50, above 100 clamps).

    Raises ``ValueError`` for a non-integer.
    """
    if value is None or str(value).strip() == "":
        return DEFAULT_LIMIT
    limit = int(str(value).strip())
    if limit < 1:
        raise ValueError("limit must be >= 1")
    return min(limit, MAX_LIMIT)


def sources_for(source: str | None) -> list[str]:
    """The one requested source, or every source (merged newest-first)."""
    return [source] if source else list(ALL_SOURCES)


def matches_q(item: dict, q: str) -> bool:
    """Case-insensitive substring match over title / product / brand / model / notice id and
    every listed batch code, so "FT5427" finds the CDSCO row that lists it."""
    needle = q.lower()
    parts = [str(item.get(k) or "") for k in _Q_FIELDS]
    for k in _Q_LIST_FIELDS:
        value = item.get(k)
        if isinstance(value, list):
            parts.extend(str(v) for v in value)
    return needle in " ".join(parts).lower()


# --- cursor ---------------------------------------------------------------------


def _fresh_state(source: str) -> dict[str, Any]:
    return {"esk": None, "skip": 0, "done": False}


def new_state(sources: list[str], *, since: str | None, limit: int) -> dict[str, Any]:
    return {
        "v": CURSOR_VERSION,
        "src": {s: _fresh_state(s) for s in sources},
        "since": since or None,
        "limit": int(limit),
    }


def encode_cursor(state: dict) -> str:
    raw = json.dumps(state, separators=(",", ":"), sort_keys=True, default=str).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(text: str, *, sources: list[str], since: str | None) -> dict[str, Any]:
    """Parse and validate a cursor against the query it is being used with.

    Raises ``BadCursor`` when it is malformed, from another version, or issued for a
    different ``since`` / set of sources (a cursor only makes sense for the query that
    produced it).
    """
    try:
        padded = text.strip() + "=" * (-len(text.strip()) % 4)
        state = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, TypeError) as exc:
        raise BadCursor("bad cursor") from exc
    if not isinstance(state, dict) or state.get("v") != CURSOR_VERSION:
        raise BadCursor("bad cursor")
    src = state.get("src")
    if not isinstance(src, dict) or set(src) != set(sources):
        raise BadCursor("bad cursor")
    if (state.get("since") or None) != (since or None):
        raise BadCursor("bad cursor")
    try:
        limit = int(state.get("limit"))
    except (TypeError, ValueError) as exc:
        raise BadCursor("bad cursor") from exc
    if not 1 <= limit <= MAX_LIMIT:
        raise BadCursor("bad cursor")
    for source, per_source in src.items():
        if not isinstance(per_source, dict):
            raise BadCursor("bad cursor")
        per_source.setdefault("esk", None)
        try:
            per_source["skip"] = int(per_source.get("skip") or 0)
        except (TypeError, ValueError) as exc:
            raise BadCursor("bad cursor") from exc
        per_source["done"] = bool(per_source.get("done"))
        if per_source["esk"] is not None and not _valid_esk(per_source["esk"], source):
            raise BadCursor("bad cursor")
    state["limit"] = limit
    return state


ESK_KEYS = frozenset({"pk", "source", "published_at"})


def _valid_esk(esk: Any, source: str) -> bool:
    """A ``LastEvaluatedKey`` of the source index: exactly {pk, source, published_at} strings.

    Anything else would reach DynamoDB as an ``ExclusiveStartKey`` and come back as a
    ``ValidationException`` (a 500), so an edited cursor is rejected here as ``400``.
    """
    if not isinstance(esk, dict) or set(esk) != ESK_KEYS:
        return False
    if not all(isinstance(v, str) and v for v in esk.values()):
        return False
    return esk["source"] == source and esk["pk"].startswith(f"{source}#")


# --- paging ---------------------------------------------------------------------

# Extra per-source fetches allowed inside one request to fill a merged page (a drained
# source is re-read at its LastEvaluatedKey). Bounded so one API call is at most
# len(sources) + MAX_EXTRA_FETCHES queries; a merged page may then be short, never wrong.
MAX_EXTRA_FETCHES = 6


def _published(item: dict) -> str:
    return str(item.get("published_at") or "")


def query_page(
    sources: list[str], *, since: str | None, limit: int, cursor: dict | None = None
) -> tuple[list[dict], str | None]:
    """One merged page of notices and the cursor for the next one (None on the last page).

    Per source: ``query_source(limit=limit, exclusive_start_key=esk)`` then drop the first
    ``skip`` items. The remainders are merged by ``(published_at desc, source order, page
    order)``, but an item is only emitted when its ``published_at`` is at or above the
    *floor* -- the newest "last item" among the sources that still have another page --
    because a source's unfetched rows can be as new as its page's last row. A source whose
    page is drained advances to its ``LastEvaluatedKey`` (``done`` when there is none) and is
    re-read within the same request while the page is short (``MAX_EXTRA_FETCHES``); a
    partly consumed page keeps its ``esk`` and grows ``skip``, so it is re-read next time.
    With a single source every page is exactly one index query. When a cursor is given its
    ``limit`` is the page size (the skip arithmetic depends on re-reading the same page).
    """
    state = cursor if cursor is not None else new_state(sources, since=since, limit=limit)
    page_size = int(state["limit"])
    order = {source: idx for idx, source in enumerate(sources)}
    # source -> {"items": remaining page items, "lek": LastEvaluatedKey, "pos": consumed}
    current: dict[str, dict[str, Any]] = {}
    taken: list[tuple[str, int, int, dict]] = []
    fetches = 0

    def fetch(source: str) -> None:
        nonlocal fetches
        per_source = state["src"][source]
        page, last_key = dynamo.query_source(
            source, since=since, limit=page_size, exclusive_start_key=per_source.get("esk")
        )
        fetches += 1
        visible = list(page)[int(per_source.get("skip") or 0) :]
        current[source] = {"items": visible, "lek": last_key, "pos": 0}

    def advance(source: str) -> None:
        """The whole fetched page was handed out: move esk forward (or finish)."""
        cur = current.pop(source)
        per_source = state["src"][source]
        per_source["esk"] = cur["lek"]
        per_source["skip"] = 0
        per_source["done"] = cur["lek"] is None

    while len(taken) < page_size:
        for source in sources:
            if not state["src"][source].get("done") and source not in current:
                if fetches >= len(sources) + MAX_EXTRA_FETCHES:
                    break
                fetch(source)
        live = {s: c for s, c in current.items() if c["pos"] < len(c["items"])}
        for source in [s for s in current if s not in live]:
            advance(source)  # an empty (or already drained) page: step past it
        if not live:
            if all(state["src"][s].get("done") for s in sources):
                break
            if fetches >= len(sources) + MAX_EXTRA_FETCHES:
                break
            continue
        floors = [_published(c["items"][-1]) for c in live.values() if c["lek"] is not None]
        floor = max(floors) if floors else None
        candidates = [
            (_published(item), order[source], pos, item)
            for source, cur in live.items()
            for pos, item in enumerate(cur["items"][cur["pos"] :], start=cur["pos"])
            if floor is None or _published(item) >= floor
        ]
        if not candidates:
            break  # cannot happen: the floor source's remainder is >= floor
        # published_at desc, then source order asc, then page order asc
        candidates.sort(key=lambda t: (t[0], -t[1], -t[2]), reverse=True)
        chosen = candidates[: page_size - len(taken)]
        taken.extend(chosen)
        used = Counter(t[1] for t in chosen)
        for source, cur in live.items():
            cur["pos"] += used.get(order[source], 0)
            if cur["pos"] >= len(cur["items"]):
                advance(source)
        if fetches >= len(sources) + MAX_EXTRA_FETCHES and not any(
            c["pos"] < len(c["items"]) for c in current.values()
        ):
            break

    for source, cur in current.items():
        state["src"][source]["skip"] = int(state["src"][source].get("skip") or 0) + cur["pos"]
    items = [t[3] for t in taken if not is_meta(t[3])]
    all_done = all(state["src"][s].get("done") for s in sources)
    return items, (None if all_done else encode_cursor(state))
