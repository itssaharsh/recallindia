"""Match pipeline step ``claim`` (SPEC §Match pipeline; completed in P09).

P01 placeholder: echoes the event so the Step Functions definition can be
wired and exercised end-to-end before the real logic lands.
Will draft the seller/pharmacy/dealer letter with Claude Haiku 4.5 via
``common.bedrock.converse("verify", ...)`` (MODEL_VERIFY) and render it to PDF
(reportlab) in the claims bucket; adds the Consumer Protection Act paragraph
when purchase_date > published_at.
"""

from __future__ import annotations

STEP = "claim"
PROMPT = "P09"


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    return {"step": STEP, "status": "placeholder", "prompt": PROMPT, **event}
