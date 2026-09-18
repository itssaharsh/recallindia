"""Match pipeline step ``evidence`` (SPEC §Match pipeline; completed in P09).

P01 placeholder: echoes the event so the Step Functions definition can be
wired and exercised end-to-end before the real logic lands.
Will snapshot the notice URL/PDF into the Object-Locked evidence bucket,
SHA-256 it and sign with the KMS RSA_2048 key; ``verify-evidence`` re-hashes
and calls KMS Verify.
"""

from __future__ import annotations

STEP = "evidence"
PROMPT = "P09"


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    return {"step": STEP, "status": "placeholder", "prompt": PROMPT, **event}
