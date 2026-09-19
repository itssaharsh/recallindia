"""HTTP API router (SPEC §App — public API + app API). One Lambda, one dispatch table.

Parses an API Gateway HTTP API v2 payload (``requestContext.http.method`` +
``rawPath``; ``routeKey`` as a fallback) and dispatches on the SPEC routes.
Implemented: ``GET /health``; the public API ``GET /v1/notices`` (source-index query,
newest-first, opaque cursor -- ``notices_query``), ``GET /v1/notices/{id}``,
``GET /v1/diff``; the ingest API ``POST /ingest/run``, ``GET /ingest/status/{arn}``,
``GET /ingest/rows``, ``GET /ingest/pdf`` (``ingest_api``). Everything else answers 501
with the prompt that completes it (P04/P08/P09). Always JSON, always CORS.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from decimal import Decimal
from typing import Any
from urllib.parse import unquote

from common import dynamo
from common.demo_mode import is_demo
from common.notices import is_meta

try:
    from api import ingest_api, notices_query
except ModuleNotFoundError:  # Lambda layout: CodeUri backend/api/ -> siblings at /var/task
    import ingest_api  # type: ignore[no-redef]
    import notices_query  # type: ignore[no-redef]

CORS_HEADERS = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
}
Route = Callable[[dict, dict], dict]


def _json_default(value: Any) -> Any:
    """DynamoDB hands numbers back as ``Decimal``; emit them as JSON numbers, not strings."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return str(value)


def respond(status: int, body: dict | list) -> dict:
    return {
        "statusCode": status,
        "headers": dict(CORS_HEADERS),
        "body": json.dumps(body, ensure_ascii=False, default=_json_default),
    }


def _not_implemented(prompt: str) -> Route:
    def route(_params: dict, _event: dict) -> dict:
        return respond(501, {"error": "not implemented", "prompt": prompt})

    return route


def _wrap(fn: Callable[[dict, dict], tuple[int, dict]]) -> Route:
    """Adapt an ``(status, body)`` function (ingest_api) to the response shape."""

    def route(params: dict, event: dict) -> dict:
        status, body = fn(params, event)
        return respond(status, body)

    return route


def health(_params: dict, _event: dict) -> dict:
    return respond(200, {"ok": True, "demo": is_demo()})


# --- public API -------------------------------------------------------------------


def _query_string(event: dict) -> dict[str, str]:
    return {k: v for k, v in (event.get("queryStringParameters") or {}).items() if v is not None}


def _paged_notices(qs: dict[str, str], *, since: str | None) -> dict | tuple[list, str | None, int]:
    """Shared by /v1/notices and /v1/diff: parse limit/cursor, run one merged page.

    Returns ``(notices, next_cursor, limit)`` or an error response dict. With a cursor the
    page size is the one the cursor was issued with (its skip arithmetic re-reads the same
    page), so ``limit`` reports the size actually used, not the query-string value.
    """
    source = (qs.get("source") or "").strip() or None
    sources = notices_query.sources_for(source)
    try:
        limit = notices_query.parse_limit(qs.get("limit"))
    except ValueError:
        return respond(400, {"error": "limit must be an integer between 1 and 100"})
    cursor_text = (qs.get("cursor") or "").strip()
    cursor = None
    if cursor_text:
        try:
            cursor = notices_query.decode_cursor(cursor_text, sources=sources, since=since)
        except notices_query.BadCursor:
            return respond(400, {"error": "bad cursor"})
    notices, next_cursor = notices_query.query_page(
        sources, since=since, limit=limit, cursor=cursor
    )
    q = (qs.get("q") or "").strip()
    if q:
        notices = [n for n in notices if notices_query.matches_q(n, q)]
    return notices, next_cursor, int(cursor["limit"]) if cursor else limit


def list_notices(_params: dict, event: dict) -> dict:
    """``GET /v1/notices?source=&since=&q=&limit=&cursor=`` -- never a table scan.

    Newest first, ``limit`` per page (default 50, max 100), ``next_cursor`` null on the last
    page. ``q`` filters the page after pagination, so a filtered page may hold fewer than
    ``limit`` rows while the cursor still advances by a full page. A cursor carries its own
    page size; the response's ``limit`` echoes the size that was used.
    """
    qs = _query_string(event)
    since = (qs.get("since") or "").strip() or None
    if since and not notices_query.valid_date(since):
        return respond(400, {"error": "since must be YYYY-MM-DD"})
    result = _paged_notices(qs, since=since)
    if isinstance(result, dict):
        return result
    notices, next_cursor, limit = result
    return respond(
        200,
        {
            "notices": notices,
            "count": len(notices),
            "next_cursor": next_cursor,
            "source": (qs.get("source") or "").strip() or None,
            "since": since,
            "q": (qs.get("q") or "").strip() or None,
            "limit": limit,
        },
    )


def _notice_pk(raw_id: str) -> str:
    """Path id -> pk: ``source#notice_id`` (URL-encoded) or ``source/notice_id``."""
    text = unquote(raw_id).strip()
    if "#" not in text and "/" in text:
        source, notice_id = text.split("/", 1)
        return f"{source}#{notice_id}"
    return text


def get_notice(params: dict, _event: dict) -> dict:
    pk = _notice_pk(params["id"])
    notice = dynamo.get("notices", pk)
    if notice is None or is_meta(notice):
        return respond(404, {"error": "not found", "id": pk})
    return respond(200, notice)


def diff(_params: dict, event: dict) -> dict:
    """``GET /v1/diff?date=YYYY-MM-DD[&source=&limit=&cursor=]``: what is new since a date.

    ``counts`` is one ``count_source`` per source (capped at 5000 each) plus ``total``;
    ``notices`` is the same newest-first, cursor-paginated listing as ``/v1/notices`` with
    ``since=date``.
    """
    qs = _query_string(event)
    date = (qs.get("date") or "").strip()
    if not notices_query.valid_date(date):
        return respond(400, {"error": "date must be YYYY-MM-DD"})
    source = (qs.get("source") or "").strip() or None
    sources = notices_query.sources_for(source)
    counts = {s: dynamo.count_source(s, since=date, max_items=5000) for s in sources}
    counts["total"] = sum(counts.values())
    result = _paged_notices(qs, since=date)
    if isinstance(result, dict):
        return result
    notices, next_cursor, _limit = result
    return respond(
        200,
        {
            "date": date,
            "source": source,
            "counts": counts,
            "notices": notices,
            "count": len(notices),
            "next_cursor": next_cursor,
        },
    )


# (method, path regex) -> handler. Order matters: first match wins.
ROUTES: list[tuple[str, re.Pattern[str], Route]] = [
    ("GET", re.compile(r"^/health/?$"), health),
    ("GET", re.compile(r"^/v1/notices/?$"), list_notices),
    ("GET", re.compile(r"^/v1/notices/(?P<id>[^/]+(?:/[^/]+)?)/?$"), get_notice),
    ("GET", re.compile(r"^/v1/diff/?$"), diff),
    ("GET", re.compile(r"^/items/?$"), _not_implemented("P04")),
    ("POST", re.compile(r"^/items/?$"), _not_implemented("P04")),
    ("POST", re.compile(r"^/items/(?P<id>[^/]+)/check/?$"), _not_implemented("P04")),
    ("GET", re.compile(r"^/cases/(?P<id>[^/]+)/?$"), _not_implemented("P04")),
    ("POST", re.compile(r"^/cases/(?P<id>[^/]+)/approve/?$"), _not_implemented("P08")),
    ("POST", re.compile(r"^/cases/(?P<id>[^/]+)/reject/?$"), _not_implemented("P08")),
    ("GET", re.compile(r"^/cases/(?P<id>[^/]+)/verify-evidence/?$"), _not_implemented("P09")),
    ("POST", re.compile(r"^/ingest/run/?$"), _wrap(ingest_api.run_ingest)),
    ("GET", re.compile(r"^/ingest/rows/?$"), _wrap(ingest_api.ingest_rows)),
    ("GET", re.compile(r"^/ingest/pdf/?$"), _wrap(ingest_api.ingest_pdf)),
    ("GET", re.compile(r"^/ingest/status/(?P<arn>.+)$"), _wrap(ingest_api.ingest_status)),
]


def _method_and_path(event: dict) -> tuple[str, str]:
    http = (event.get("requestContext") or {}).get("http") or {}
    method = str(http.get("method") or "").upper()
    path = str(event.get("rawPath") or http.get("path") or "")
    route_key = str(event.get("routeKey") or "")
    if (not method or not path) and " " in route_key:
        rk_method, rk_path = route_key.split(" ", 1)
        method, path = method or rk_method.upper(), path or rk_path
    return method, path


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    method, path = _method_and_path(event)
    if method == "OPTIONS":
        return respond(204, {})
    if not method or not path:
        return respond(400, {"error": "bad request", "detail": "missing method or path"})
    path_matched = False
    for route_method, pattern, fn in ROUTES:
        m = pattern.match(path)
        if not m:
            continue
        path_matched = True
        if route_method != method:
            continue
        try:
            return fn(m.groupdict(), event)
        except Exception as exc:  # never raise out of the API Lambda
            return respond(500, {"error": "internal", "detail": f"{type(exc).__name__}: {exc}"})
    if path_matched:
        return respond(405, {"error": "method not allowed", "method": method, "path": path})
    return respond(404, {"error": "not found", "path": path})
