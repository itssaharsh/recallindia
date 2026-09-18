# ADR-003 — CDSCO NSQ: portal JSON for current months, PDF archive with Textract-primary and pdfplumber fallback

Status: accepted · Date: 2026-09-18

## Context

The original brief assumed CDSCO's monthly "Not of Standard Quality" (NSQ) alerts were PDFs and
that the hero moment was a PDF dissolving into a feed via Amazon Textract. P00 (`docs/P00-REPORT.md`)
found two things. First, CDSCO stopped publishing monthly NSQ PDFs after June 2025: since
28 Aug 2025 the alerts are a DataTables web app at `cdscoonline.gov.in` backed by plain GET JSON
endpoints (`reportingYears` → `publicReportingMonths?year=` → `filteredNsqDrugTable?month=MON-YYYY&
source=All`), with rows in `aaData[]`; the latest month at the time of writing is JUL-2026 with 239
rows, 20 of them Paracetamol, and there is no 2026 PDF at all. The 2010–June 2025 archive is still
PDF, reachable through `download_file_division.jsp?num_id=<b64>` → iframe `src`. Second, Textract
returns `SubscriptionRequiredException` on this account in both regions because it is on the AWS
Free plan, which excludes Textract; that is not an IAM problem and needs a plan upgrade in the
console. Meanwhile `pdfplumber.extract_tables()` with default settings gives one clean 8-column
table per page on `fixtures/cdsco/nsq_latest.pdf` — 59 data rows across 6 pages.

## Decision

One source id, `cdsco_nsq`, with two adapters that write the same `Notice` shape and differ only in
an `adapter` field. **`cdsco_portal`** is the live poller: daily, it reads the newest month from
`publicReportingMonths`, pulls `filteredNsqDrugTable` for it (re-pulling the current month because
rows are appended during the month), and hands the already-tabular rows to `cdsco_normalise`,
skipping extraction entirely; `row_ref = {month, row}`. **`cdsco_pdf`** serves the archive backfill
and the `/ingest` hero: it downloads a PDF to S3 and runs `cdsco_extract`, which calls Textract
`StartDocumentAnalysis` with `FeatureTypes=[TABLES]` inside a try/except and, on any Textract error
or fewer than 5 rows, falls back to `pdfplumber.extract_tables()`; `row_ref = {page, row}` and
`pdf_s3_key` is set. Both feed `cdsco_normalise`, where Nova Lite (temperature 0, strict JSON,
batches of 25 rows) maps columns to the schema with a header-keyword fallback when Bedrock is
unavailable. The feed, matcher and API never distinguish the adapters. The title-card figure comes
from the portal fixture (`nsq_jul2026_all.json`), the `/ingest` shot runs on the June 2025 PDF with
the caption "archive PDF via Textract · current months via portal JSON", and the fallback is
first-class: `DEMO_MODE=1` and CI exercise the pdfplumber path, and the ingest result reports
`fallback_used: {extract, normalise}` so the UI can say which engine ran.

## Consequences

Current data is fresh and cheap — JSON, no OCR, no Bedrock needed for structure — while the 2010 to
2025 archive remains ingestible and the PDF-to-feed dissolve stays honest because it runs on a real
CDSCO alert PDF. Textract remains the primary extractor so the architecture card is truthful once
the plan is upgraded, and until then nothing in the product depends on it. The price is two code
paths to test, a normaliser that must tolerate both the portal's inconsistent casing (`State Lab` /
`State lab`) and PDF cell wrapping, and a demo caption that has to explain why the hero shot uses a
June 2025 document while the headline number is July 2026. Any hit from either adapter is worded as
"failed CDSCO quality test, <month> alert, row N" — never as a recall — because NSQ is a quality
failure notice, not a withdrawal order.
