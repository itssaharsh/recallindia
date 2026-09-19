# RecallIndia

Deadline: submission is about a week out (≈ Fri 25 Sep 2026 IST; confirm the exact hour on the hackathon schedule page). Originally planned as a Fri–Sun sprint (17–20 Sep).

India publishes its recalls as PDFs and web forms nobody reads; RecallIndia turns them into a live
machine-readable feed and tells you the day the medicine strip in your drawer, the car in your
garage, or the cooker on your stove is on it.

Work in progress — see [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for exactly what gets built (and nothing
else). `SPEC.md` is the source of truth for sources, data model and pipelines; `DESIGN.md` for the
UI; `docs/P00-REPORT.md` for what is verified against the real endpoints and the AWS account.

Built for the WeMakeDevs × AWS First Commit hackathon (Sep 17–20 2026).

## Quickstart

```bash
make install     # .venv + dev deps (+ npm ci once app/ exists, + pre-commit hooks)
make lint        # ruff check + ruff format --check
make test        # pytest with DEMO_MODE=1 — fixtures only, no AWS credentials needed
make             # lists every target
```

- **AWS profile.** The `default` profile's access key is invalid, so the Makefile exports
  `AWS_PROFILE=firstcommit` and `samconfig.toml` pins `profile = "firstcommit"`. Run any ad-hoc
  command the same way: `aws ... --profile firstcommit`, `sam ... --profile firstcommit`.
  Region is `ap-south-1` for everything.
- **DEMO_MODE.** `DEMO_MODE=1` routes every external call (CPSC, NHTSA, openFDA, CDSCO portal and
  PDFs, Bedrock, DynamoDB, S3) to `fixtures/` and a local `.demo_store/` with the identical
  response shape. CI runs only in demo mode. `DEMO_MODE=0` talks to AWS and the upstream sources.
- Local overrides: copy `.env.example` to `.env` (gitignored). `make` includes and exports it
  automatically; for a plain shell run `set -a; . ./.env; set +a` first. Every variable has a
  code default, so set only what you change (`KEY=value`, no quotes, comments on their own lines).
- Deploy: `make validate-template`, then `make deploy-guided` once, `make deploy` afterwards.

## Status after P00/P01

- **Textract is blocked**: the account is on the AWS Free plan, which excludes Textract
  (`SubscriptionRequiredException` in both regions). The `cdsco_pdf` adapter keeps Textract TABLES
  as primary behind a try/except and falls back to `pdfplumber` `page.find_tables()`, which P00
  proved yields a clean 8-column table per page on `fixtures/cdsco/nsq_latest.pdf`: 57 data rows
  (55 with an S.No plus 2 wrapped-manufacturer continuation rows that merge into their
  predecessor), so a demo run publishes 55 notices.
- **Bedrock model access is pending**: every `converse` returns `Operation not allowed` until the
  use-case form is submitted and Claude Haiku 4.5 + Nova Lite are enabled in `ap-south-1` and
  `us-east-1`. `backend/common/bedrock.py` has the fixture path and a deterministic fallback.
- **SES identity is pending**: no verified identity in `ap-south-1` yet (account in sandbox); set
  `NOTIFY_EMAIL` once one is verified.

Details, the exact endpoints, and the re-run commands: [docs/P00-REPORT.md](docs/P00-REPORT.md).

## Layout

```
template.yaml        AWS SAM: DynamoDB, S3 (Object Lock on evidence), KMS, Lambdas, HTTP API,
                     Step Functions, EventBridge schedules
backend/common/      demo_mode, schemas (pydantic), bedrock, dynamo, s3, notices, cdsco,
                     ingest_runs — shipped as CommonLayer
backend/pollers/     cpsc, nhtsa (+ watchlist), openfda, cdsco_portal
backend/ingest/      cdsco_fetch, cdsco_extract, cdsco_normalise, cdsco_publish (Diff + Publish /
                     RecordFailure handlers) — adapters cdsco_portal + cdsco_pdf
backend/matcher/     candidates, verify, range_check, notify, claim, evidence
backend/api/         HTTP API handlers
backend/tests/       pytest, DEMO_MODE=1
app/                 Next.js 15 (P06)
fixtures/            saved raw responses + CDSCO PDFs and portal JSON (P00)
scripts/             seed_demo.py, validate.py, backfill.py (resumable per-source backfill)
docs/adr/            architecture decisions
```

Wording rules that apply to code, UI and docs (CLAUDE.md): a CDSCO NSQ hit is always "failed
CDSCO quality test, <month> alert, row N" — it is a quality-failure notice, not a withdrawal
order; a clean item is always "no match in N sources as of <time>", never a blanket assurance.

## Pollers and backfill

Four pollers write the notices table; each one is a Lambda on an EventBridge Scheduler rule
(`EnableSchedules=true` turns the rules on) and the same code backs `scripts/backfill.py`.

| Source id | What | Cadence | Window per poll |
|---|---|---|---|
| `cpsc` | CPSC SaferProducts recalls (bare JSON array) | every 15 min | last 30 days (`RecallDateStart/End`) |
| `nhtsa` | NHTSA recalls by make/model/year | every 15 min | the watchlist tuples (below) |
| `openfda` | openFDA drug + device enforcement | every 15 min | last 30 days, `sort=report_date:desc`, paged |
| `cdsco_portal` | cdscoonline.gov.in NSQ JSON (source id `cdsco_nsq`, adapter `cdsco_portal`) | daily | the newest reporting month |

- **Watchlist rule (NHTSA).** `backend/pollers/watchlist.py` lists 20 common Indian-market
  models (Maruti Swift/Baleno/Brezza, Hyundai Creta/i20/Venue, Tata Nexon/Punch, Mahindra
  XUV700/Scorpio, Honda City/Amaze, Toyota Innova/Fortuner, Kia Seltos/Sonet, Jeep Compass,
  Volkswagen Tiguan, Hyundai Tucson, Toyota Camry), years 2021–2025. NHTSA is keyed by
  US-market names, so only the 6 entries with a true US-name match are queried (`hyundai/venue`,
  `kia/seltos`, `jeep/compass`, `volkswagen/tiguan`, `hyundai/tucson`, `toyota/camry`); the
  rest are skipped with a note — Honda City is not a Civic. Vehicles from `items` are added to
  the list. NHTSA answers "no results" with HTTP 400 and a valid empty JSON body; that is zero
  results, not an error.
- **Idempotent upsert.** Every record goes through `common.notices.upsert_notice`: validate,
  read `pk = <source>#<notice_id>`, and write only when new (`created`) or changed (`updated`,
  keeping `first_seen_at`); identical rows are `unchanged` and never written. Re-polling and
  re-running a backfill are idempotent.
- **`meta#<source>` rows.** Each poller writes one bookkeeping row in the notices table
  (`meta#cpsc`, `meta#nhtsa`, `meta#openfda`, `meta#cdsco_portal`) with `last_run_at`,
  `last_success_at`, `last_error`, `degraded`, `last_counts`. `degraded: true` means the last
  run did not complete cleanly (upstream error, partial page, bad month); `last_success_at`
  keeps its previous value so the UI can say "CPSC: degraded, last success 09:15". The API
  excludes meta rows from the feed. Pollers never raise on upstream failure — the handler
  returns `{"degraded": true, "error": ...}`.
- **`BEDROCK_ENABLED`** (env, default `true`; template parameter `BedrockEnabled`). When
  `false`, every Bedrock call raises `BedrockUnavailable` immediately and callers use their
  deterministic/template fallback; one warning is logged per Lambda invocation. The pollers
  and the backfill never call Bedrock at all. See [ADR-004](docs/adr/ADR-004-pollers-idempotent-upsert-and-meta.md).

Backfill (`scripts/backfill.py`) walks windows oldest-first — calendar months for `cpsc` and
`openfda` (x drug/device), `make/model/year` tuples for `nhtsa`, portal months for
`cdsco_portal` — sleeping `--sleep` seconds (default 1) between HTTP windows, one request at a
time, backoff on 429/5xx. A cursor file (`.backfill/<source>.json`) is rewritten after every
window, so a killed or failed run resumes where it stopped; `--reset` starts over. A failed
window is logged and retried on the next run, the run continues, and the exit status is 1; a
window whose records were all skipped (every write failed) counts as failed too, never as done.
`--mock` is the only mode switch: without it the run is live whatever `.env` says
(`--profile`, default `firstcommit`, sets `AWS_PROFILE`), and the table names must come from
`NOTICES_TABLE`/`ITEMS_TABLE` or the stack outputs (`--stack`, default `recallindia`) or the
run stops with exit 2 before any window.

```bash
make backfill SOURCE=cpsc YEARS=5             # live, AWS_PROFILE=firstcommit; ~1 request/s
make backfill-mock SOURCE=cdsco_portal YEARS=1 # fixtures + .demo_store, no sleep, no network
make poll-live SOURCE=cpsc                    # invoke recallindia-poller-cpsc-<account> once
make poll-live SOURCE=cdsco-portal            # the CDSCO portal poller (function name uses a dash)

# count rows (meta rows included: one per source that has run)
aws dynamodb scan --table-name recallindia-notices-<account> --select COUNT --profile firstcommit
```

Log lines are one per window (`cpsc 2026-08: fetched=53 created=53 updated=0 unchanged=0
skipped=0`) and a final `backfill cpsc: windows=60 done=60 fetched=... took=..s`.

## Ingest and public API

One Lambda (`backend/api/app.py`) serves both. Every response is JSON with CORS; DynamoDB
`Decimal`s come back as numbers.

### Public API

| Route | What |
|---|---|
| `GET /v1/notices?source=&since=&q=&limit=&cursor=` | Newest-first page of notices. `limit` default 50, max 100 (larger values clamp, non-integers are 400). `since` is `YYYY-MM-DD`. |
| `GET /v1/notices/{id}` | One notice by pk (`cdsco_nsq%23<notice_id>`) or `<source>/<notice_id>`; 404 for unknown ids and for the internal `meta#` / `ingest#` rows. |
| `GET /v1/diff?date=YYYY-MM-DD[&source=&limit=&cursor=]` | `counts` per source since `date` (capped at 5000 each, plus `total`) and the same paginated listing with `since=date`. |

```bash
API=$(make -s api-url)
curl "$API/v1/notices?source=cdsco_nsq&since=2026-07-01&limit=100"      # page 1 + next_cursor
curl "$API/v1/notices?source=cdsco_nsq&since=2026-07-01&limit=100&cursor=<next_cursor>"
curl "$API/v1/notices?q=paracetamol"                                     # every source, merged
curl "$API/v1/notices/cdsco_nsq/JUL-2026-cdsco_portal-3f9a1c0b2d4e"
curl "$API/v1/diff?date=2026-07-01"
make notices-page SOURCE=cdsco_nsq SINCE=2026-07-01 LIMIT=100           # the same, via make
```

- **Index, not scan.** Every listing is a `Query` on the `source-published_at-index` GSI
  (`common.dynamo.query_source`), one query per requested source, `ScanIndexForward=false`.
  The API never scans the table, so all 239 July CDSCO rows come back across three pages of
  100/100/39 no matter how large the table grows. `meta#` and `ingest#` rows have no
  `published_at`, so the index never contains them.
- **Cursor semantics.** `next_cursor` is opaque: base64url(JSON) of a version tag plus, per
  source, the real DynamoDB `LastEvaluatedKey`, how many rows of that page were already handed
  out (`skip`) and whether the source is exhausted. Pass it back unchanged with the same
  `source` and `since`; a cursor from a different query (other `since`, other source set), a
  malformed or edited one (the per-source key must be a real `{pk, source, published_at}`),
  or one from another version is `400 {"error": "bad cursor"}`. The page size travels in the
  cursor: `?limit=` is ignored once a cursor is given and the response's `limit` echoes the
  size in use. `next_cursor` is `null` on the last page; when a source's row count is an
  exact multiple of the page size DynamoDB cannot know the page was the last, so the final
  page may come back empty (`notices: []`, `next_cursor: null`). A single-source listing pages
  with the index key exactly (one query per page); a no-source listing merges the five sources
  newest-first and only emits a row once every source that still has more pages has been read
  down to that date, so pages are non-increasing in `published_at` and every row appears
  exactly once absent concurrent writes: a merged page re-reads the prefix of a partly
  consumed source page, so a row a poller inserts into that prefix between two requests can
  repeat or hide one neighbour (single-source paging is exact). A merged page may
  occasionally be shorter than `limit`; keep following `next_cursor` until it is `null`.
- **`q` is a post-filter.** It matches case-insensitively over `title` / `product` / `brand`
  on the page *after* pagination: a filtered page can hold fewer than `limit` rows (even zero)
  while `next_cursor` still advances by a full page. Follow the cursor to search the rest.

### Ingest API (the `/ingest` hero)

| Route | What |
|---|---|
| `POST /ingest/run` | Body optional `{"pdf_url", "month", "lab_scope", "force" (default true), "adapter" (default "pdf")}`. `month` is canonicalised to `MON-YYYY` ("June 2025", "2025-06" and "JUN-2025" are the same run; anything else is `400`). Live: starts the IngestStateMachine and answers `202 {execution_arn, run_id, status: "RUNNING", started_at, input}`. `DEMO_MODE=1`: runs the same five handlers synchronously in-process and answers `200 {execution_arn, run_id, status, steps, counts}`. |
| `GET /ingest/status/{arn}` | Per-step checklist + counts (below). The ARN may be raw or URL-encoded; a bare `run_id` works too. Unknown run: 404. |
| `GET /ingest/rows?arn=<arn or run_id>[&page=N]` | The extracted rows `{page, row, cells, bbox}` (bbox as fractions of the page) for the PDF overlay; `409 {"error": "rows not ready"}` until Extract has stored them. |
| `GET /ingest/pdf?key=cdsco/<file>.pdf` | `{key, url, expires_in: 900}`: a presigned GET on the raw bucket (`file://` in demo). Keys must match `cdsco/[A-Za-z0-9._-]+.pdf` (Fetch sanitises every archive filename to that shape). The raw bucket carries a read-only CORS rule (GET/HEAD, range headers exposed) so the browser can load the URL directly. |

```bash
make ingest-run                                    # POST /ingest/run -> {"execution_arn": ...}
make ingest-status ARN=arn:aws:states:ap-south-1:...:execution:recallindia-ingest-...:ingest-20260918-ab12
curl "$API/ingest/rows?arn=ingest-20260918-ab12&page=2"
curl "$API/ingest/pdf?key=cdsco/CDSCO_NSQ_june25.pdf"
DEMO_MODE=1 .venv/bin/python -c 'import json,sys; sys.path.insert(0,"backend"); from api import app; \
  print(app.handler({"rawPath":"/ingest/run","requestContext":{"http":{"method":"POST"}}}, None)["body"][:400])'
```

Reading `GET /ingest/status/{arn}`:

- `status` is the execution status (`RUNNING` / `SUCCEEDED` / `FAILED` / `TIMED_OUT` /
  `ABORTED`); `steps` is the ordered checklist `Fetch · Extract · Normalise · Diff · Publish`,
  each `pending` (not entered yet), `running`, `done`, `failed`, or `skipped` (Extract when the
  portal adapter ran; anything never reached once the run is over). Each entered step carries
  `started_at` / `ended_at` and a small `summary` of its task output (`month`, `pdf_s3_key`,
  `rows_in`, `method`, `fallback_used`, `notices_out`, `counts`, `new`).
- A step is `failed` when its task threw, or when its result came back `degraded` (the
  handlers never raise on an upstream failure) -- the state machine checks every result
  (`FetchOk` / `ExtractOk` / `NormaliseOk` / `DiffOk` choices) and routes a degraded step to
  `RecordFailure`, so a flaky cdsco.gov.in ends the execution `FAILED` with nothing published
  rather than extracting a default PDF; Publish answering `published: false` is `failed` too.
- Live, the steps come from the Step Functions execution history (`TaskStateEntered` /
  `TaskStateExited` / `TaskFailed`, `RecordFailure` shows as Publish `failed`) merged with the
  `ingest#<run_id>` record the tasks write; the record wins for `textract` (job id, status,
  polls, elapsed seconds -- Extract heartbeats it on every poll), `rows_in`, `method`,
  `rows_s3_key`. In demo the record is the only source.
- Top-level: `method` (`textract` | `pdfplumber`), `fallback_used`, `rows_in`, `notices_out`,
  `counts` (`created` / `updated` / `unchanged` / `upserted` + `rows_in` / `notices_out`),
  `diff` (`new` / `updated` / `existing` / `total` / `previous`), `pdf` (`pdf_s3_key`,
  `pdf_url`, `month`, `pages`), `rows_s3_key`, `error` (null unless something failed).
  Textract is blocked on this account (Free plan), so live runs report `method: "pdfplumber"`
  with `fallback_used.extract: true` after the Textract attempt fails.

See [ADR-005](docs/adr/ADR-005-source-index-and-cursor-pagination.md) for why the listing is
index-only with a per-source cursor and why `q` is a post-filter.

## AI tools used

Claude Code (Claude) — this project was built with AI coding assistants, per `CLAUDE.md`.

## Non-goals

Auth, multi-user, SMS to Indian numbers (needs DLT), real filing with CDSCO/CCPA, VIN-level SIAM
lookup, retailer integrations.
