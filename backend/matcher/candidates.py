"""Match pipeline step ``candidates`` (SPEC §Match pipeline; completed in P04).

P01 placeholder: echoes the event so the Step Functions definition can be
wired and exercised end-to-end before the real logic lands.
Will query the ``brand_lc-index`` GSI and fuzzy-match (rapidfuzz >= 80) on product/model,
returning <= 5 candidate notice pks with scores.
"""

from __future__ import annotations

STEP = "candidates"
PROMPT = "P04"


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    return {"step": STEP, "status": "placeholder", "prompt": PROMPT, **event}
