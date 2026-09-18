# ADR-004 — Pollers: get-then-put idempotent upsert, `meta#<source>` rows in the notices table, NHTSA watchlist rule

Status: accepted · Date: 2026-09-18

## Context

Four pollers (CPSC, NHTSA, openFDA, CDSCO portal) run on EventBridge schedules and the same
code is replayed by `scripts/backfill.py` over up to five years of windows. Every window
overlaps the previous one on purpose (openFDA and CPSC windows are re-pulled for 30 days; the
CDSCO portal re-pulls the current month because rows are appended during the month; a
resumable backfill re-runs any window that failed). A naive `put_item` per record would rewrite
every notice on every poll, bump `updated_at` for nothing, and make the feed's "new since" view
meaningless. The UI also needs "CPSC: degraded, last success hh:mm" without a separate table,
and NHTSA's API is keyed by make/model/year with US-market names, which most Indian-market cars
do not have.

## Decision

1. **Get-then-put upsert with unchanged detection** (`common.notices.upsert_notice`). The
   notice is validated through `schemas.Notice` (so `brand_lc` is always derived), read back
   by `pk = <source>#<notice_id>`, and compared field by field ignoring the two bookkeeping
   fields. New → put with `first_seen_at = updated_at = now` (`created`); identical → no write
   (`unchanged`); different → put preserving the original `first_seen_at` (`updated`). NHTSA
   passes `merge_vehicles=True` so a campaign seen under several make/model/year queries
   accumulates `vehicles[]` instead of flapping. Two reads-plus-conditional-write per record is
   cheap at our volume (hundreds of rows per poll) and keeps the logic in one place instead of
   DynamoDB condition expressions that cannot express "any field differs". For the upsert to
   mean anything the id must be stable: NHTSA's is the campaign number and the mapped notice
   carries the queried year only in `vehicles[]`; the CDSCO portal's rows have no id and are
   re-pulled daily, so `notice_id` is `<MONTH>-cdsco_portal-<sha1(product|batch|manufacturer)[:12]>`
   (positional `row_ref.row` is kept for display) rather than the row's position, which would
   re-label every later row whenever CDSCO inserts or withdraws one. The reads are strongly
   consistent so back-to-back merges of one campaign never drop a year.
2. **`meta#<source>` rows live in the notices table** (`common.notices.write_meta`), one row
   per source: `last_run_at`, `last_success_at` (only advanced on success, kept on failure),
   `last_error`, `degraded`, `last_counts`, plus source extras (`months` for the CDSCO portal,
   `backfill` summary after a backfill). No extra table, no extra IAM; the feed handler and
   `GET /v1/notices` exclude them with `common.notices.is_meta`. `degraded: true` means the
   last run did not complete cleanly — the feed still serves what was stored earlier, and the UI
   shows the last success time next to the source.
3. **Watchlist rule for NHTSA** (`pollers/watchlist.py`). Twenty Indian-market make/model
   entries are the default feed watchlist, but only entries with a *true* US-name match are
   queried (`hyundai/venue`, `kia/seltos`, `jeep/compass`, `volkswagen/tiguan`,
   `hyundai/tucson`, `toyota/camry`); the rest carry a note and are skipped rather than mapped
   to a "similar" US car (Honda City is not a Civic). Vehicles from `items` are added to the
   list and mapped through the same table. Years default to 2021–2025. An NHTSA HTTP 400 with
   the documented empty JSON body counts as zero results, not a failure.

## Consequences

Re-polling and backfilling are idempotent and may be repeated at any time: the only writes are real changes,
`first_seen_at` is stable, and a killed backfill resumes from its cursor without duplicates.
Meta rows share a table with notices, so every reader that scans the table must filter them
(`is_meta`) — a small, centralised cost. NHTSA coverage is honest but thin: six of twenty
watchlist models; adding an entry means finding a genuine US-market name, not a lookalike.
