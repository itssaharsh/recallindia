# CLAUDE.md — RecallIndia

Read `SPEC.md`, `DESIGN.md`, `DEMO_SCRIPT.md` before any task. They are the source of truth. `docs/P00-REPORT.md` records what is verified, what is blocked, and the exact external endpoints/fixtures.

## What this is
India publishes product recalls and drug-quality failures as PDFs and web forms nobody reads. RecallIndia turns them into a live feed + public API and tells a person the day something they own is on it, then drafts the claim and signs the evidence. Built for the WeMakeDevs × AWS First Commit hackathon (Sep 17–20 2026).

## Hard rules
- Build only what appears in `DEMO_SCRIPT.md`. No auth, no login, no settings pages, no multi-tenant anything.
- Rules decide, the model explains. Batch/serial/VIN range checks and date logic are deterministic Python. Bedrock verifies against notice text and drafts letters; it never sets alert/hold/dismiss on its own.
- Never write the words "recalled" for a CDSCO NSQ hit (use "failed CDSCO quality test, <month> alert, row N") or "safe" (use "no match in N sources as of <time>").
- Every external call has a `DEMO_MODE=1` fixture path with the identical response shape. CI runs only in demo mode.
- Small commits, conventional messages (`feat:`, `fix:`, `chore:`). Commit after every prompt.
- Python 3.12 for Lambdas, `boto3`, `pytest`. Next.js 15 (App Router) + TypeScript + Tailwind for the app. Infra with AWS SAM (`template.yaml`). No other frameworks.
- Region: `ap-south-1` for everything. Bedrock: `BEDROCK_REGION=ap-south-1` first, automatic fallback to `BEDROCK_FALLBACK_REGION=us-east-1` (see Models).
- AWS credentials: the `default` profile is broken. **Every `aws` / `sam` command uses `--profile firstcommit`** (Makefile: `AWS_PROFILE ?= firstcommit`; `samconfig.toml`: `profile = "firstcommit"`).
- CDSCO fixture is `fixtures/cdsco/nsq_latest.pdf` (June 2025 archive, 6 pages, 59 rows) plus `fixtures/cdsco/nsq_jul2026_all.json` (portal, 239 rows). Two adapters, one Notice shape — see SPEC §Sources.
- Secrets only in `.env` (gitignored); `.env.example` committed.
- When a task is done, end your message with `Report:` followed by what was built, what was NOT built, commands to verify, and any blocker.

## Models (Bedrock)
| Use | Env | ap-south-1 id | us-east-1 fallback id |
|---|---|---|---|
| Verify (notice covers item?) + claim letter | `MODEL_VERIFY` | `global.anthropic.claude-haiku-4-5-20251001-v1:0` (Claude Haiku 4.5) | same id (`global.` profiles are invocable from us-east-1; `us.anthropic.claude-haiku-4-5-20251001-v1:0` also exists) |
| Normalise (CDSCO rows → schema) | `MODEL_NORMALISE` | `apac.amazon.nova-lite-v1:0` (Nova Lite) | `us.amazon.nova-lite-v1:0` |

- All calls go through `backend/common/bedrock.py` (`converse`, temperature 0, strict JSON where a schema is expected). Region fallback swaps the inference-profile prefix (`apac.`→`us.`; `global.` unchanged).
- Never reference Claude 3.5 Sonnet or any Claude 3.x model anywhere (code, prompts, docs, README).
- Until Bedrock model access is granted (P00 blocker) every call returns `Operation not allowed`; the `DEMO_MODE=1` fixture path and the deterministic fallbacks must make the product work without it.

## AI disclosure
This project was built with AI coding assistants (Claude Code / Claude). Listed in README under "AI tools used".
