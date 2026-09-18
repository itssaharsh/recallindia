# ADR-001 — Rules decide, the model explains

Status: accepted · Date: 2026-09-18

## Context

A match between an item someone owns and a notice has three outcomes — `alert`, `hold`, `dismiss` —
and a wrong `alert` (telling someone their medicine failed a quality test when it did not) or a
wrong `dismiss` (missing a batch that is listed) is the worst thing this product can do. The checks
that settle most matches are mechanical: is the batch string in the listed batches, is the serial
inside `A12–A99`, is the model year within `[year_from, year_to]`, was the purchase date after
`published_at`. A language model is good at reading a messy notice excerpt and saying whether it
covers the item, and at drafting a claim letter, but it is non-deterministic, it can be unavailable
(Bedrock access is still pending on this account, see `docs/P00-REPORT.md`), and its output cannot
be replayed or unit-tested the way a range check can.

## Decision

The decision is made by deterministic Python and the model only supplies evidence and prose. Batch,
serial, VIN/year and date logic live in `backend/matcher/range_check.py` as pure functions with
table-driven tests. Bedrock (Claude Haiku 4.5 via `MODEL_VERIFY`, temperature 0, strict JSON)
answers one question per candidate — `{covers_item, quoted_sentence, confidence, reasoning}` — and
`quoted_sentence` must be a verbatim substring of the notice's `raw_excerpt`, enforced in code; a
quote that is not found sets `covers_item` to `null`. Any Bedrock error also yields `null`. The
Step Functions `Decide` state then applies the fixed table from `SPEC.md`: `alert` only when the
model says the notice covers the item **and** the range check says the identifier is inside;
`hold` when either is unknown; `dismiss` otherwise, with a reason string built from the failing
check ("batch DL-4472 not in listed batches [DL-4471, DL-4468]"). The model never sets the outcome
and never invents an identifier. The same rule applies to the claim letter: the model drafts it,
but the "sold after notice" paragraph is added by a date comparison, not by the model's judgement.

## Consequences

Every outcome is explainable from stored fields: the case row carries `range_check`, the quoted
sentence and the reason, so the UI can highlight the sentence in the source excerpt and draw the
range bar without re-asking anything. `DEMO_MODE=1` works end to end with fixture verdicts because
the decision path does not depend on a live model. The cost is conservatism: an ambiguous serial
format or an unavailable model produces `hold`, which needs a human, and a notice whose only
identifier is prose the regexes miss will not alert on its own. We accept that; a human-confirmed
`hold` is recoverable, a confident wrong `alert` is not.
