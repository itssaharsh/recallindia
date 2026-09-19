# ADR-008 — A task-token gate and household scoping instead of accounts

(The brief asked for this as ADR-006 and for the evidence record as ADR-003; both numbers were
already taken in this repo — ADR-003 is the CDSCO two-adapter decision and ADR-006 is Decide /
"clear". The evidence record is [ADR-007](ADR-007-object-lock-kms-evidence.md) and this is 008.)

## Context

Two problems, one shape.

**Nothing may be claimed on a person's behalf without them.** The pipeline can find a match, seal
evidence and write a letter in about five seconds. If it did that automatically, RecallIndia
would be writing legal-sounding letters about someone's pharmacy without being asked.

**The demo is public.** The live URL is in the README and the video. Anything a visitor can
click, every visitor can click: a judge opening the site must not be able to change the wall the
next judge sees, and a script must not be able to run the account's KMS and Textract bills up.

The obvious answer to the second problem is accounts. Accounts mean sign-up, sessions, password
resets and a login screen in a three-minute video — a day of work that shows nothing.

## Decision

**The gate is a Step Functions task token, not a flag.** After Notify, an alert enters
`WaitForApproval` (`lambda:invoke.waitForTaskToken`, `TimeoutSeconds` 86400). The Lambda stores
the token on the case; the execution physically cannot reach SealEvidence until
`SendTaskSuccess` is called. There is no code path that seals or writes without a human, because
the next state does not exist until the token is answered.

The answer is a **single conditional write**: `status: waiting_approval -> approving`, which
removes the token and returns it, in one DynamoDB `update_item`. Step Functions is called only
after that write succeeds. A second approve, an approve racing a reject, and an approve after the
timeout all lose the condition and get 409 with the case as it stands.

**Scoping is one header, not an account.** `X-Household` carries an id (`hh_` + 8 base32
characters) the browser keeps in localStorage. Items and cases carry `household_id` and are read
through a GSI on it, so one household is one partition and one query.

- No header, or an unreadable one, means the `demo` household.
- The demo household is **read-only**: no writes, no checks, no approvals (403 `demo_read_only`).
- A case you do not own answers 404, not 403: existence is not leaked.
- Demo cases stay *readable* from any household, so the finished case in the video opens for
  anyone with the link.
- "Make my own copy" (`POST /households`) copies the 15 demo items into a fresh id and checks
  them through one Map at `MaxConcurrency` 3.
- Caps: 100 new households a UTC day, 30 items and 5 approvals per household, each an atomic
  counter row.

## Consequences

- **The demo survives contact with the internet.** The worst a visitor can do is spend one
  household's five approvals.
- **The video records in a copy.** The narrator clicks Approve on their own wall; the demo wall
  is untouched, so the next visitor sees the same thing.
- **An id in localStorage is not security.** Anyone who learns a household id can act as that
  household. That is the right trade for a public demo with a per-household cap and no personal
  data, and it is why this is scoping, not auth.
- **The copies are checked asynchronously.** The Map starts the executions rather than waiting for
  them (`startExecution`, not `.sync`): an alert pauses for up to 24 hours at the gate, and a copy
  must not wait for a human who has not clicked yet.
- **A sparse GSI needs a backfill.** Rows written before households existed have no
  `household_id` and would be invisible; `scripts/backfill_household.py` stamps them `demo`.
