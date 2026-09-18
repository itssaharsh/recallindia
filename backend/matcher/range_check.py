"""Match pipeline step ``range_check`` (SPEC §Match pipeline step 3; completed in P04).

Deterministic, no model. ``check_batch`` implements the SPEC batch rule now:
exact match, or case/space-insensitive. Serial ranges and vehicle years land
in P04. ``inside`` is ``None`` when there is nothing to compare.
"""

from __future__ import annotations

STEP = "range_check"
PROMPT = "P04"


def _norm(value: str) -> str:
    return "".join(str(value).split()).upper()


def check_batch(yours: str, listed: list[str]) -> dict:
    """``{inside: bool|None, listed: [...], yours: str}`` per SPEC §Match pipeline.

    ``inside`` is None when the item has no batch or the notice lists none.
    Near-miss example: ``check_batch("DL-4472", ["DL-4471", "DL-4468"])`` → False.
    """
    yours = str(yours or "").strip()
    listed = [str(b).strip() for b in (listed or []) if str(b).strip()]
    if not yours or not listed:
        return {"inside": None, "listed": listed, "yours": yours}
    target = _norm(yours)
    inside = any(b == yours or _norm(b) == target for b in listed)
    return {"inside": inside, "listed": listed, "yours": yours}


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    out = {"step": STEP, "status": "placeholder", "prompt": PROMPT, **event}
    item, notice = event.get("item"), event.get("notice")
    if isinstance(item, dict) and isinstance(notice, dict) and item.get("batch") is not None:
        out["range_check"] = check_batch(item.get("batch", ""), notice.get("batches") or [])
    return out
