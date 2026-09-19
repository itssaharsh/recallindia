# ADR-006 — Decide is a Lambda, "clear" is an item state, and no LLM sits in the decision path

## Context
SPEC §Match pipeline sketched Decide as a Step Functions Choice. The pipeline verifies up to five
candidate notices per item inside a Map state, so the decision is a reduction over a list: pick the
best `alert`, else the best `hold`, else the most relevant `dismiss`, and build the reason string
from the failing check. A Choice state compares scalars on one path; it cannot rank a list or
format `batch FT5428 not in listed batches [FT5427]`. Separately, most items match nothing at
all, and Bedrock turned out to be unavailable for the whole hackathon (quotas held at 0 on this
account, increase denied).

## Decision
- `backend/matcher/decide.py` holds the rule as a pure function (`decide(candidates, verified)`),
  exposed as `DecideFunction`; the Choice that follows only routes `alert` to the approval gate.
  The rule is table-tested (`test_decide.py`) and stays readable in one place (ADR-001: rules
  decide).
- An item with no candidates is **clear**: an item state with the message
  `no match in N sources as of <time>` and an `item.clear` event. It is not a case, so the cases
  table only ever holds alert / hold / dismiss.
- A dismissed near-miss leaves the item `clear` but keeps `case_id`, so the wall can show the amber
  card with the exact dismissal reason without inventing a fourth status colour.
- No LLM in the decision path (by design; Bedrock quotas held at 0 on this account, increase denied — model path implemented behind a flag). The verifier is deterministic (brand match plus product fuzzy ≥ 90 or a listed
  identifier on the item), quotes the notice row verbatim from `raw_excerpt`, and writes a complete
  human-readable `reasoning`. The Bedrock verifier and normaliser remain in the codebase behind
  `BEDROCK_ENABLED` (default false) with the same quote guard.

## Consequences
One more Lambda in the state machine and one more hop per check (tens of milliseconds). Every
decision is reproducible from the stored case (`verifier`, `reasoning`, `range_check`,
`quoted_sentence`), which is what the evidence step in P09 signs. Turning the model path on later
is a parameter change (`BedrockEnabled=true`), not a redesign: Decide consumes the same verdict
shape whichever verifier produced it.
