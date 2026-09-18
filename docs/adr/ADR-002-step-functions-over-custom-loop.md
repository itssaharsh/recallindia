# ADR-002 — Step Functions Standard over a custom orchestration loop

Status: accepted · Date: 2026-09-18

## Context

The match pipeline is a nine-step sequence (Candidates → Verify → RangeCheck → Decide → Notify →
WaitForApproval → Claim → Evidence → Audit) where one step calls Bedrock, one waits for a person to
click Approve, one talks to KMS and an Object-Locked bucket, and every step must be retried on
transient failure and land in `hold` rather than crash. The CDSCO ingest is a second, shorter
sequence (Fetch → Extract → Normalise → Diff → Publish) whose progress the `/ingest` page shows as a
checklist. The obvious alternative is a single Lambda that runs the steps in a loop and stores
progress in DynamoDB; it is less infrastructure but re-implements retries, catch-to-hold routing,
a durable wait for human approval and per-step status, and none of it is visible to a judge.

## Decision

Both pipelines are AWS Step Functions **Standard** state machines defined in `template.yaml`
(`MatchStateMachine`, `IngestStateMachine`). Each Lambda task carries `Retry` (2 attempts, backoff)
and a `Catch` that routes to `hold` with reason "verification unavailable". `Decide` is a `Choice`
state, so the rule table from ADR-001 is readable in the console graph. `WaitForApproval` uses
`.waitForTaskToken`: the token is stored on the case, and the UI's Approve/Reject buttons call
`SendTaskSuccess`/`SendTaskFailure`, so the execution resumes exactly where it paused with no polling
loop of our own. Candidates are verified inside a `Map` with `MaxConcurrency: 2`, which keeps us far
under the account's 10 concurrent Lambda executions. `POST /items/{id}/check` and `POST /ingest/run`
only start executions and return the ARN; `GET /ingest/status/{arn}` reads per-step status straight
from the execution history.

## Consequences

The demo can screen-record the console graph turning green step by step, which is the 0:55 shot in
`DEMO_SCRIPT.md`, and every execution is a durable, inspectable audit trail on top of the
`cases.audit` array. Standard (not Express) is required for `waitForTaskToken` and for executions
that may sit for hours awaiting approval; at demo volume the per-transition pricing is negligible.
The costs are a longer `template.yaml`, state-machine definitions that need `sam validate --lint`
and `cfn-lint` to stay honest, and slightly higher latency per step than an in-process loop — all
acceptable for a pipeline that runs once per item check, not per request.
