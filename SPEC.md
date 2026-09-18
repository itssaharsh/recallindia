# SPEC.md — RecallIndia

## One sentence
India publishes its recalls as PDFs and web forms nobody reads; RecallIndia turns them into a live machine-readable feed and tells you the day the medicine strip in your drawer, the car in your garage, or the cooker on your stove is on it.

## Why (for the writeup; all sourced)
- India has no central recall database and no consumer notification mechanism; manufacturers notify regulators, and that's it.
- CDSCO publishes a monthly list of drugs that failed quality tests ("Not of Standard Quality", NSQ) — as PDFs until June 2025, as a searchable web table since. **July 2026: 239 medicines failed CDSCO quality tests — 20 of them Paracetamol** (e.g. Paracetamol Tablets IP 650mg, batch FT5427, Forgo Pharmaceuticals). Source: `fixtures/cdsco/nsq_jul2026_all.json` (P00). Nobody turns it into alerts.
- SIAM's voluntary vehicle recall portal: 38 lakh vehicles recalled since 2012, checkable only by typing a VIN into a form.
- CPSC research: direct notification lifts recall response from 57% to 74%; product registration raises return rates by 24 points. India has neither.
- Amazon notifies customers about recalls of items bought on Amazon (worldwide since 2024). This product is for everything Amazon can't see: pharmacies, dealers, local shops, Flipkart.

## Sources (pollers)
| id | Source | Access | Cadence | Notes |
|---|---|---|---|---|
| cdsco_nsq · adapter `cdsco_portal` | CDSCO NSQ portal (cdscoonline.gov.in DataTables, live since Aug 2025) | GET JSON, no auth (browser UA + `JSESSIONID` cookie from `/CDSCO/viewPublicNSQDrug`): `/CDSCO/reportingYears?tab=nsq` → `/CDSCO/publicReportingMonths?year=YYYY&tab=nsq` → `/CDSCO/filteredNsqDrugTable?month=MON-YYYY&source=All&tab=nsq` (`publicNsqDrugTable` = latest month). Rows in `aaData[]`: `str_product_name, str_batch_no, dt_manufacturing_date, dt_expiry_date, str_manufactured_by, str_nsq_result, str_reporting_source, str_reported_by_lab_or_state, dt_reporting_month_year`. | daily (month param = newest month, re-pull current month) | LIVE adapter, 2019→now. Fixture `fixtures/cdsco/nsq_jul2026_all.json` (239 rows). `row_ref = {month, row}`. |
| cdsco_nsq · adapter `cdsco_pdf` | CDSCO monthly NSQ alert PDFs (archive 2010–Jun 2025) | Listing `download_file_division.jsp?num_id=<b64>` → iframe `src` → PDF from cdsco.gov.in → S3 → **Textract TABLES (primary)** → **pdfplumber `extract_tables` fallback** (proven in P00: clean 8-column table, 59 rows on `nsq_latest.pdf`) → Bedrock normalise (regex fallback) | one-off backfill; on demand for `/ingest` | HERO source for the `/ingest` shot. Fixture `fixtures/cdsco/nsq_latest.pdf` (June 2025, 6 pages). Cache PDFs in S3. `row_ref = {page, row}`. Textract is unavailable until the account leaves the Free plan (P00); the fallback must be first-class. |
| siam | SIAM voluntary recall list | HTML scrape of the list page | daily | Stretch. Match on make/model/year, not VIN. |
| cpsc | CPSC SaferProducts recalls | JSON API, no key | 15 min | Backfill 5 years, rate-limited. |
| nhtsa | NHTSA recalls API | JSON, no key | 15 min | Vehicles by make/model/year. **API returns HTTP 400 with a valid empty body** (`{"Count":0,"Message":"Results returned successfully","results":[]}`) when there are no results — the parser must accept any status whose body is parseable JSON and treat `Count: 0` as an empty result, not an error. |
| openfda | openFDA enforcement (drug/device/food) | JSON, no key | 15 min | US drugs; useful for imported OTC. Default order is oldest-first (2015): **always sort newest-first explicitly** (`sort=report_date:desc`, plus a `search=report_date:[YYYYMMDD+TO+YYYYMMDD]` window). |
| ccpa | CCPA orders | manual fixture for hackathon | — | Fixture only; say so. |

Both CDSCO adapters write the same Notice shape with `source: "cdsco_nsq"` and an `adapter` field (`cdsco_portal` | `cdsco_pdf`); the feed, matcher and API never distinguish them.

## Data model (DynamoDB, on-demand)
- `notices` — pk `source#notice_id`, attrs: source, adapter? (`cdsco_portal`|`cdsco_pdf`|null), title, product, brand, model, batches[] (or serial_ranges[] / vehicles[{make,model,year_from,year_to}]), hazard_or_failed_test, remedy, published_at, url, raw_excerpt (≤4 KB), pdf_s3_key?, row_ref? (`{page,row}` for PDF, `{month,row}` for portal), mfg_date?, exp_date?, lab?. GSI `brand_lc` → for candidate lookup.
- `items` — pk `user#item_id`, attrs: kind (medicine|vehicle|appliance|other), name, brand, model?, batch?, serial?, reg_no?, make/model/year?, purchase_date?, photo_s3_key?, status (clear|hold|alert), last_checked_at, case_id?.
- `cases` — pk `case_id`, attrs: item_id, notice_id, decision (alert|hold|dismiss), reason, quoted_sentence, range_check {listed, yours, inside:bool}, sold_after_notice:bool, claim_pdf_s3_key?, evidence {sha256, kms_key_id, signature_b64, object_lock_retain_until, snapshot_s3_key}?, approval {token_issued_at, approved_at?, approver:"demo-user"}, audit[] (append-only events with ts).

## Match pipeline (Step Functions Standard, `MatchStateMachine`)
1. **Candidates** (Lambda): for an item, query `notices` by brand_lc + fuzzy on model/product (rapidfuzz ≥ 80). Output ≤5 candidates.
2. **Verify** (Lambda → Bedrock): prompt = notice raw_excerpt + item fields. Strict JSON out: `{covers_item: bool, quoted_sentence: str, confidence: 0-1, reasoning: str}`. Temperature 0. On Bedrock error → `{covers_item:null}`.
3. **RangeCheck** (Lambda, deterministic): batch exact/prefix match; serial numeric/alnum range; vehicle year range. Output `{inside: bool|null, listed: str, yours: str}`.
4. **Decide** (Choice): `alert` if covers_item && inside; `hold` if covers_item && inside==null, or covers_item==null; `dismiss` otherwise (with reason string built from the failing check).
5. **Notify** (Lambda): write case, set item.status, SES email to `NOTIFY_EMAIL` (sandbox-verified), in-app event.
6. **WaitForApproval** (`.waitForTaskToken`): stores token on case; UI Approve/Reject calls `SendTaskSuccess/Failure`.
7. **Claim** (Lambda → Bedrock → pdf-lib/reportlab): letter to seller/pharmacy/dealer citing notice id, batch, remedy; if `purchase_date > published_at` add Consumer Protection Act paragraph ("sold after notice"). PDF → S3.
8. **Evidence** (Lambda): fetch notice URL/PDF snapshot → S3 bucket with Object Lock (GOVERNANCE, 30 days) → SHA-256 → KMS `Sign` (RSA_2048, RSASSA_PKCS1_V1_5_SHA_256) → store on case. `Verify` endpoint re-hashes and calls KMS `Verify`.
9. **Audit**: every step appends to `cases.audit`.

## Ingest pipeline (CDSCO — two adapters, one Notice shape)
EventBridge daily → `cdsco_fetch` Lambda:
- **`cdsco_portal` (live):** `publicReportingMonths?year=<this year>` → newest month → `filteredNsqDrugTable?month=<MON-YYYY>&source=All` → rows (JSON, already tabular; also re-pull the current month because rows are appended during the month). Skips `cdsco_extract`.
- **`cdsco_pdf` (archive + `/ingest` hero):** list archive alert PDFs (`download_file_division.jsp?num_id=` → iframe `src`), download new ones to S3 → `cdsco_extract`: Textract `StartDocumentAnalysis` FeatureTypes=[TABLES] (poll `GetDocumentAnalysis`) wrapped in try/except → on any Textract error or <5 rows, **pdfplumber `extract_tables()` fallback** (default settings; 8 columns) → rows.

→ `cdsco_normalise` (shared): Bedrock (Nova Lite, temperature 0, strict JSON, batches of 25 rows) maps columns to the Notice schema; fallback header-keyword mapping when Bedrock is unavailable → upsert `notices` with `source: "cdsco_nsq"`, `adapter`, `row_ref` and (PDF only) `pdf_s3_key`. Returns `{adapter, rows_in, notices_out, fallback_used: {extract: bool, normalise: bool}}`.

## App (Next.js on Amplify Hosting; API Gateway HTTP API + Lambda)
Routes: `/` feed · `/ingest` hero · `/mine` item wall · `/case/[id]` · `/api` docs (light theme) · 404.
Public API: `GET /v1/notices?source=&since=&q=` · `GET /v1/notices/{id}` · `GET /v1/diff?date=`.
App API: `POST /items` (paste lines | strip photo → Textract batch OCR | vehicle reg) · `POST /items/{id}/check` (starts state machine) · `GET /cases/{id}` · `POST /cases/{id}/approve|reject` · `GET /cases/{id}/verify-evidence` · `POST /ingest/run` (demo trigger).

## Demo world (seed)
`scripts/seed_demo.py --mock|--live` creates 15 items: 
- 1 real alert: medicine whose batch appears in the fetched CDSCO list (choose at seed time from real `cdsco_nsq` notices, either adapter; fall back to a fixture notice from `fixtures/cdsco/nsq_jul2026_all.json`).
- 1 near-miss: same drug + manufacturer, different batch → must dismiss with reason "batch X not in listed batches [..]".
- 1 vehicle matching an NHTSA/SIAM notice by make/model/year.
- 12 clear items.
Expected after run: 1 alert, 1 dismiss, 1 alert-or-hold (vehicle), 12 clear. `scripts/validate.py` asserts exactly this and prints PASS/FAIL.

## Non-goals (say so in README)
Auth, multi-user, SMS to Indian numbers (needs DLT), real filing with CDSCO/CCPA, VIN-level SIAM lookup, retailer integrations.
