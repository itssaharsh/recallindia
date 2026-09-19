# CLAUDE.md — RecallIndia

Read `SPEC.md`, `DESIGN.md`, `UI-SPEC.md`, `DEMO_SCRIPT.md` before any task. They are the source of truth; for anything visual, `UI-SPEC.md` and `DESIGN.md` win.

## What this is
India publishes product recalls and drug-quality failures as PDFs and web forms nobody reads. RecallIndia turns them into a live feed + public API and tells a person the day something they own is on it, then drafts the claim and signs the evidence. Built for the WeMakeDevs × AWS First Commit hackathon (Sep 17–20 2026).

## Hard rules
- Build only what appears in `DEMO_SCRIPT.md` and `UI-SPEC.md`. No auth, no login, no settings pages. Households (X-Household header) are the only scoping; the `demo` household is read-only.
- Rules decide. Batch/serial/VIN range checks and date logic are deterministic Python; the claim letter is a Jinja2 template. Bedrock is blocked on this account and stays off (`BEDROCK_ENABLED=false`); never make a demo path depend on it.
- Never write the words "recalled" for a CDSCO NSQ hit (use "failed CDSCO quality test, <month> alert, row N") or "safe" (use "no match in N sources as of <time>").
- Every external call has a `DEMO_MODE=1` fixture path with the identical response shape. CI runs only in demo mode.
- Small commits, conventional messages (`feat:`, `fix:`, `chore:`). Commit after every prompt.
- Python 3.12 for Lambdas, `boto3`, `pytest`. Next.js 15 (App Router) + TypeScript + Tailwind for the app. Infra with AWS SAM (`template.yaml`). No other frameworks.
- Region: `ap-south-1`. AWS CLI and SAM always with `--profile firstcommit`, never the default profile.
- Secrets only in `.env` (gitignored); `.env.example` committed.
- When a task is done, end your message with `Report:` followed by what was built, what was NOT built, commands to verify, and any blocker.

## AI disclosure
This project was built with AI coding assistants (Claude Code / Claude). Listed in README under "AI tools used".
