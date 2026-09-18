"""Match pipeline step ``notify`` (SPEC §Match pipeline; completed in P04).

P01 placeholder: echoes the event so the Step Functions definition can be
wired and exercised end-to-end before the real logic lands.
Will write the ``cases`` row, update ``items.status``, append audit and send SES
mail to NOTIFY_EMAIL for ``alert`` only. Wording rule (CLAUDE.md): a clear item is
"no match in N sources as of <time>", nothing stronger.
"""

from __future__ import annotations

STEP = "notify"
PROMPT = "P04"


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    return {"step": STEP, "status": "placeholder", "prompt": PROMPT, **event}
