"""NHTSA recalls poller (SPEC §Sources, id `nhtsa`).

P01 placeholder that proves the plumbing. The NHTSA API returns HTTP 400 with a
valid body ``{"Count": 0, ...}`` when a make/model/year has no recalls;
``common.demo_mode.fetch_json`` accepts any status whose body is JSON, and this
module treats ``Count: 0`` as an empty result, not an error. Watchlist polling
and Notice mapping land in P02.
"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlencode

from common.demo_mode import fetch_json

SOURCE = "nhtsa"
BASE_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle"
DEFAULT_VEHICLE = {"make": "honda", "model": "city", "modelYear": 2024}


def build_url(make: str, model: str, model_year: int | str) -> str:
    return f"{BASE_URL}?{urlencode({'make': make, 'model': model, 'modelYear': model_year})}"


def count_records(payload: Any) -> int:
    """``results`` length; an empty ``results`` with ``Count: 0`` is a valid zero."""
    if isinstance(payload, dict):
        results = payload.get("results")
        if isinstance(results, list):
            return len(results)
        count = payload.get("Count")
        if isinstance(count, int):
            return count
    if isinstance(payload, list):
        return len(payload)
    return 0


def handler(event: dict | None, context: object) -> dict:
    t0 = time.monotonic()
    event = event or {}
    make = str(event.get("make") or DEFAULT_VEHICLE["make"]).lower()
    model = str(event.get("model") or DEFAULT_VEHICLE["model"]).lower()
    year = event.get("modelYear") or DEFAULT_VEHICLE["modelYear"]
    url = build_url(make, model, year)
    base = {"source": SOURCE, "vehicle": {"make": make, "model": model, "modelYear": year}}
    try:
        payload = fetch_json(url)
    except Exception as exc:  # never raise on upstream failure
        return {
            **base,
            "fetched": 0,
            "upserted": 0,
            "degraded": True,
            "error": f"{type(exc).__name__}: {exc}",
            "took_ms": int((time.monotonic() - t0) * 1000),
            "note": "mapping in P02",
        }
    return {
        **base,
        "fetched": count_records(payload),
        "upserted": 0,
        "degraded": False,
        "took_ms": int((time.monotonic() - t0) * 1000),
        "note": "mapping in P02",
    }
