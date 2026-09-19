# ADR-005 — Public API: `source-published_at-index` GSI, opaque per-source cursor, `q` as a post-filter

Status: accepted · Date: 2026-09-18

## Context

`GET /v1/notices?source=cdsco_nsq&since=2026-07-01` is the 2:27 video shot and the contract
third parties will build on. The P01 placeholder scanned the notices table (at most 500 items)
and filtered in Python: with ~4,230 rows live it returned 32 of the 239 July CDSCO rows, and the
number would shrink as the pollers add more. The table's only index was `brand_lc-index`
(the matcher's lookup), which says nothing about time. The feed and the diff view both need
"newest first for a source since a date", paged, with a bounded cost per request.

## Decision

1. **One more GSI, `source-published_at-index`** (HASH `source`, RANGE `published_at`,
   projection ALL). `published_at` is already a `YYYY-MM-DD` string on every notice, so the
   range key sorts lexically as a date and `since` is a single `>=` key condition. Every
   listing is `Query(IndexName=..., ScanIndexForward=false, Limit=limit)` through
   `common.dynamo.query_source`; `count_source` is the same query with `Select=COUNT`. The
   bookkeeping rows (`meta#<source>`, `ingest#<run_id>`) carry no `published_at`, so DynamoDB
   never puts them in the index and the API needs no filter to hide them. `scan_all` stays
   for scripts and tests; the API must not call it (a test pins that).
2. **Opaque cursor carrying each source's real `LastEvaluatedKey`.** `next_cursor` is
   base64url(JSON) of `{"v": 1, "src": {<source>: {"esk", "skip", "done"}}, "since",
   "limit"}`. For one source this is exactly DynamoDB pagination: `esk` is the
   `LastEvaluatedKey`, one query per page, no offset arithmetic. A request without `source`
   merges the five sources newest-first from one query each; the page is cut at `limit`, and a
   source whose fetched page was only partly consumed keeps its `esk` and remembers how many
   rows to drop next time (`skip`), while a drained source advances to its key. To keep
   `published_at` non-increasing across pages, a row is only emitted once it is at or above
   the newest "last row" of every source that still has another page (that source's unfetched
   rows can be as new as its page's last row); a drained source is re-read within the same
   request up to a small bound, so a merged page is occasionally short but never wrong
   absent concurrent writes: a partly consumed source page is re-read at the same `esk` and
   its first `skip` rows dropped, so a row a poller inserts inside that already-served prefix
   between two requests shifts the prefix by one (one neighbour repeats or is skipped).
   Single-source paging carries no `skip` and is exact; the page size also travels in the
   cursor and the per-source `esk` is validated as a real `{pk, source, published_at}` key. The
   cursor is validated against the query it is used with (`since`, the set of sources, the
   version) and anything else is `400 bad cursor`, so clients cannot glue a cursor onto a
   different query and silently get the wrong page.
3. **`q` filters after pagination.** DynamoDB cannot search substrings in an index, and a
   `FilterExpression` would still consume the same read capacity while making `Limit` mean
   "items evaluated", so a page could come back empty with a cursor and no bound on how many
   pages that takes. Filtering the merged page keeps every request at one query per source
   and keeps the cursor meaningful; the cost is that a filtered page may hold fewer than
   `limit` rows (documented in the README). Real search is a later concern (OpenSearch or a
   token index), not something to fake with scans.

## Consequences

- The query above returns all 239 July rows as pages of 100/100/39 regardless of table size,
  and `GET /v1/diff?date=` gives exact per-source counts with `Select=COUNT` (capped at 5000).
- Adding the GSI to a live table is an online index build; the index needs the same
  on-demand capacity as the table (roughly doubling write cost per notice, acceptable at
  hundreds of rows per poll).
- Cursors are not stable across schema versions: bumping `v` invalidates old ones (clients
  simply restart from page one), and a cursor that encodes a `LastEvaluatedKey` for a row that
  is later deleted still works (DynamoDB positions after the key, not the row).
- The merged (no-source) listing costs up to `len(sources) + 6` queries per page; the
  single-source listing costs exactly one.
