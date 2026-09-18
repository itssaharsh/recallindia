"""CPSC SaferProducts poller (SPEC §Sources, id `cpsc`).

P01 placeholder that proves the plumbing: builds the source URL, fetches through
``common.demo_mode.fetch_json`` (fixture ``cpsc/recent.json`` in DEMO_MODE) and
counts records. Mapping to Notice + upsert lands in P02.
"""

from __future__ import annotations

import datetime as dt
import time
from typing import Any

from common.demo_mode import fetch_json

SOURCE = "cpsc"
BASE_URL = "https://www.saferproducts.gov/RestWebServices/Recall"


def build_url(now: dt.date | None = None) -> str:
    """RecallDateStart = first day of the current year, JSON format."""
    today = now or dt.date.today()
    start = today.replace(month=1, day=1).isoformat()
    return f"{BASE_URL}?format=json&RecallDateStart={start}"


def count_records(payload: Any) -> int:
    """CPSC returns a bare JSON array of recalls."""
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        for key in ("results", "Results", "recalls"):
            if isinstance(payload.get(key), list):
                return len(payload[key])
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
