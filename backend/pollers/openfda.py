"""openFDA enforcement poller (SPEC §Sources, id `openfda`).

P01 placeholder that proves the plumbing. SPEC rule: openFDA's default order is
oldest-first, so the URL always carries ``sort=report_date:desc``. Device
enforcement, the 30-day search window and Notice mapping land in P02.
"""

from __future__ import annotations

import time
from typing import Any

from common.demo_mode import fetch_json

SOURCE = "openfda"
BASE_URL = "https://api.fda.gov/drug/enforcement.json"
LIMIT = 25


def build_url(limit: int = LIMIT) -> str:
    """Newest-first is explicit: ``sort=report_date:desc`` (SPEC §Sources)."""
    return f"{BASE_URL}?limit={limit}&sort=report_date:desc"


def count_records(payload: Any) -> int:
    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            return len(results)
    if isinstance(payload, list):
        return len(payload)
    return 0


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    url = build_url()
    try:
        payload = fetch_json(url)
    except Exception as exc:  # never raise on upstream failure
        return {
            "source": SOURCE,
            "fetched": 0,
            "upserted": 0,
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
            "took_ms": int((time.monotonic() - t0) * 1000),
            "note": "mapping in P02",
        }
    return {
        "source": SOURCE,
        "fetched": count_records(payload),
        "upserted": 0,
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
        "note": "mapping in P02",
    }
