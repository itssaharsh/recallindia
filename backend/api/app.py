"""HTTP API router (SPEC §App — public API + app API). One Lambda, one dispatch table.

Parses an API Gateway HTTP API v2 payload (``requestContext.http.method`` +
``rawPath``; ``routeKey`` as a fallback) and dispatches on the SPEC routes.
Implemented: ``GET /health``; the public API ``GET /v1/notices`` (source-index query,
newest-first, opaque cursor -- ``notices_query``), ``GET /v1/notices/{id}``,
``GET /v1/diff``; the ingest API ``POST /ingest/run``, ``GET /ingest/status/{arn}``,
``GET /ingest/rows``, ``GET /ingest/pdf``, ``GET /ingest/runs``, ``GET /ingest/runs/{id}``
(``ingest_api``); the item wall ``POST /items``,
``GET /items``, ``GET /items/{id}``, ``POST /items/{id}/check``, ``GET /cases/{id}``,
``GET /events`` (``match_api``); the case actions ``POST /cases/{id}/approve|reject``,
``GET /cases/{id}/claim``, ``GET /cases/{id}/verify-evidence`` (``case_api``). Always JSON, always
CORS; gzipped when the client accepts it (HTTP APIs do not compress Lambda responses, and a
feed page is ~115 KB of JSON).
"""

from __future__ import annotations

import base64
import gzip
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
    from api import case_api, ingest_api, match_api, notices_query, ui_api
except ModuleNotFoundError:  # Lambda layout: CodeUri backend/api/ -> siblings at /var/task
    import case_api  # type: ignore[no-redef]
    import ingest_api  # type: ignore[no-redef]
    import match_api  # type: ignore[no-redef]
    import notices_query  # type: ignore[no-redef]
    import ui_api  # type: ignore[no-redef]

CORS_HEADERS = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
}
Route = Callable[[dict, dict], dict]
GZIP_MIN_BYTES = 1024  # below this the gzip header costs more than it saves


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


def _accepts_gzip(event: dict) -> bool:
    headers = event.get("headers") or {}
    value = next((v for k, v in headers.items() if str(k).lower() == "accept-encoding"), "")
    return "gzip" in str(value or "").lower()


def compress(response: dict, event: dict) -> dict:
    """gzip a JSON body of ``GZIP_MIN_BYTES`` or more when the request accepts gzip (the HTTP
    API decodes ``isBase64Encoded`` and passes the gzip bytes through with the header)."""
    body = response.get("body")
    if not isinstance(body, str) or response.get("isBase64Encoded") or not _accepts_gzip(event):
        return response
    raw = body.encode("utf-8")
    if len(raw) < GZIP_MIN_BYTES:
        return response
    headers = {**response.get("headers", {}), "content-encoding": "gzip", "vary": "accept-encoding"}
    packed = base64.b64encode(gzip.compress(raw, compresslevel=6, mtime=0)).decode("ascii")
    return {**response, "headers": headers, "body": packed, "isBase64Encoded": True}


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
    ("GET", re.compile(r"^/v1/stats/?$"), _wrap(ui_api.stats)),
    ("POST", re.compile(r"^/uploads/?$"), _wrap(ui_api.create_upload)),
    ("POST", re.compile(r"^/items/ocr/?$"), _wrap(ui_api.items_ocr)),
    ("POST", re.compile(r"^/items/normalise/?$"), _wrap(ui_api.items_normalise)),
    ("GET", re.compile(r"^/items/?$"), _wrap(match_api.list_items)),
    ("POST", re.compile(r"^/items/?$"), _wrap(match_api.create_items)),
    # /items/{id}/check before /items/{id}: first match wins
    ("POST", re.compile(r"^/items/(?P<id>[^/]+)/check/?$"), _wrap(match_api.check_item)),
    ("GET", re.compile(r"^/items/(?P<id>[^/]+)/check-status/?$"), _wrap(ui_api.check_status)),
    ("GET", re.compile(r"^/items/(?P<id>[^/]+)/?$"), _wrap(match_api.get_item)),
    ("GET", re.compile(r"^/cases/(?P<id>[^/]+)/?$"), _wrap(match_api.get_case)),
    ("GET", re.compile(r"^/events/?$"), _wrap(match_api.list_events)),
    ("POST", re.compile(r"^/cases/(?P<id>[^/]+)/approve/?$"), _wrap(case_api.approve_case)),
    ("POST", re.compile(r"^/cases/(?P<id>[^/]+)/reject/?$"), _wrap(case_api.reject_case)),
    ("GET", re.compile(r"^/cases/(?P<id>[^/]+)/claim/?$"), _wrap(case_api.claim_url)),
    (
        "GET",
        re.compile(r"^/cases/(?P<id>[^/]+)/verify-evidence/?$"),
        _wrap(case_api.verify_evidence),
    ),
    ("POST", re.compile(r"^/ingest/run/?$"), _wrap(ingest_api.run_ingest)),
    ("GET", re.compile(r"^/ingest/rows/?$"), _wrap(ingest_api.ingest_rows)),
    ("GET", re.compile(r"^/ingest/pdf/?$"), _wrap(ingest_api.ingest_pdf)),
    ("GET", re.compile(r"^/ingest/status/(?P<arn>.+)$"), _wrap(ingest_api.ingest_status)),
    ("GET", re.compile(r"^/ingest/runs/?$"), _wrap(ingest_api.list_runs)),
    ("GET", re.compile(r"^/ingest/runs/(?P<id>[^/]+)/?$"), _wrap(ingest_api.run_view)),
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
    return compress(_dispatch(event), event)


def _dispatch(event: dict) -> dict:
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
