"""HTTP API router (SPEC §App — public API + app API). One Lambda, one dispatch table.

Parses an API Gateway HTTP API v2 payload (``requestContext.http.method`` +
``rawPath``; ``routeKey`` as a fallback) and dispatches on the SPEC routes.
Implemented in P01: ``GET /health``, ``GET /v1/notices``, ``GET /v1/notices/{id}``.
Everything else answers 501 with the prompt that completes it (P03/P04/P08/P09).
Always JSON, always CORS.
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

CORS_HEADERS = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
}


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


def _not_implemented(prompt: str) -> Callable[[dict, dict], dict]:
    def route(_params: dict, _event: dict) -> dict:
        return respond(501, {"error": "not implemented", "prompt": prompt})

    return route


def health(_params: dict, _event: dict) -> dict:
    return respond(200, {"ok": True, "demo": is_demo()})


def list_notices(_params: dict, event: dict) -> dict:
    qs = event.get("queryStringParameters") or {}
    source = (qs.get("source") or "").strip()
    since = (qs.get("since") or "").strip()
    q = (qs.get("q") or "").strip().lower()
    notices = [n for n in dynamo.scan_all("notices") if not is_meta(n)]
    if source:
        notices = [n for n in notices if n.get("source") == source]
    if since:
        notices = [n for n in notices if str(n.get("published_at", "")) >= since]
    if q:
        notices = [
            n
            for n in notices
            if q in " ".join(str(n.get(k, "")) for k in ("title", "product", "brand")).lower()
        ]
    notices.sort(key=lambda n: str(n.get("published_at", "")), reverse=True)
    return respond(200, {"notices": notices, "count": len(notices)})


def get_notice(params: dict, _event: dict) -> dict:
    pk = unquote(params["id"])
    notice = dynamo.get("notices", pk)
    if notice is None:
        return respond(404, {"error": "not found", "id": pk})
    return respond(200, notice)


# (method, path regex) -> handler. Order matters: first match wins.
ROUTES: list[tuple[str, re.Pattern[str], Callable[[dict, dict], dict]]] = [
    ("GET", re.compile(r"^/health/?$"), health),
    ("GET", re.compile(r"^/v1/notices/?$"), list_notices),
    ("GET", re.compile(r"^/v1/notices/(?P<id>[^/]+)/?$"), get_notice),
    ("GET", re.compile(r"^/v1/diff/?$"), _not_implemented("P03")),
    ("GET", re.compile(r"^/items/?$"), _not_implemented("P04")),
    ("POST", re.compile(r"^/items/?$"), _not_implemented("P04")),
    ("POST", re.compile(r"^/items/(?P<id>[^/]+)/check/?$"), _not_implemented("P04")),
    ("GET", re.compile(r"^/cases/(?P<id>[^/]+)/?$"), _not_implemented("P04")),
    ("POST", re.compile(r"^/cases/(?P<id>[^/]+)/approve/?$"), _not_implemented("P08")),
    ("POST", re.compile(r"^/cases/(?P<id>[^/]+)/reject/?$"), _not_implemented("P08")),
    ("GET", re.compile(r"^/cases/(?P<id>[^/]+)/verify-evidence/?$"), _not_implemented("P09")),
    ("POST", re.compile(r"^/ingest/run/?$"), _not_implemented("P03")),
    ("GET", re.compile(r"^/ingest/status/(?P<arn>.+)$"), _not_implemented("P03")),
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
