"""Match pipeline step ``verify`` (SPEC §Match pipeline step 2; completed in P04).

P01 placeholder handler plus the P04 quote guard: the model's
``quoted_sentence`` MUST be a verbatim substring of the notice ``raw_excerpt``;
otherwise ``covers_item`` becomes ``null`` ("quote not found in source").
Bedrock call (Claude Haiku 4.5 via MODEL_VERIFY, temperature 0) lands in P04.
"""

from __future__ import annotations

STEP = "verify"
PROMPT = "P04"


def quote_is_verbatim(quoted: str, raw_excerpt: str) -> bool:
    """True when ``quoted`` is a non-empty verbatim substring of ``raw_excerpt``.

    Whitespace runs are collapsed on both sides so a line-wrapped PDF excerpt
    still matches; casing and punctuation must match exactly.
    """
    q = " ".join(str(quoted or "").split())
    src = " ".join(str(raw_excerpt or "").split())
    return bool(q) and q in src


def handler(event: dict | None, context: object) -> dict:
    event = event if isinstance(event, dict) else {}
    return {"step": STEP, "status": "placeholder", "prompt": PROMPT, **event}
