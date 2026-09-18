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
  as primary behind a try/except and falls back to `pdfplumber.extract_tables()`, which P00 proved
  yields a clean 8-column table (59 rows) on `fixtures/cdsco/nsq_latest.pdf`.
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
backend/common/      demo_mode, schemas (pydantic), bedrock, dynamo, s3 — shipped as CommonLayer
backend/pollers/     cpsc, nhtsa, openfda
backend/ingest/      cdsco_fetch, cdsco_extract, cdsco_normalise (adapters cdsco_portal + cdsco_pdf)
backend/matcher/     candidates, verify, range_check, notify, claim, evidence
backend/api/         HTTP API handlers
backend/tests/       pytest, DEMO_MODE=1
app/                 Next.js 15 (P06)
fixtures/            saved raw responses + CDSCO PDFs and portal JSON (P00)
scripts/             seed_demo.py, validate.py, backfill.py
docs/adr/            architecture decisions
```

Wording rules that apply to code, UI and docs (CLAUDE.md): a CDSCO NSQ hit is always "failed
CDSCO quality test, <month> alert, row N" — it is a quality-failure notice, not a withdrawal
order; a clean item is always "no match in N sources as of <time>", never a blanket assurance.

## AI tools used

Claude Code (Claude) — this project was built with AI coding assistants, per `CLAUDE.md`.

## Non-goals

Auth, multi-user, SMS to Indian numbers (needs DLT), real filing with CDSCO/CCPA, VIN-level SIAM
lookup, retailer integrations.
