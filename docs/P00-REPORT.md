# P00 — Dependency check report

Run: 2026-09-18 (IST), from WSL2, `aws-cli/2.36.48`, Python 3.12 venv with pdfplumber 0.11.10 / pypdf 6.19.0 / boto3 1.43.97.
AWS account `277025716889` (IAM user `Laptop`, AdministratorAccess), region `ap-south-1`.
**AWS profile note:** the `default` profile's keys are invalid (`InvalidClientTokenId`). Everything below used `AWS_PROFILE=firstcommit`, which works. Fix `default` or export `AWS_PROFILE=firstcommit` before P01.

## Summary

| Dependency | Works? | Notes |
|---|---|---|
| CPSC SaferProducts JSON | **yes** | HTTP 200, 451 recalls since 2026-01-01, 1.37 MB, 22 keys/record. No key needed. `fixtures/cpsc/recent.json`. |
| NHTSA recalls JSON | **yes** (quirk) | Honda City 2024 → HTTP **400** with valid body `{"Count":0,"Message":"Results returned successfully","results":[]}`. NHTSA returns 400 for a valid-but-empty query; parser must not treat non-200 as failure. Honda Accord 2024 → HTTP 200, 3 results, 14 keys/record (saved as a non-empty example). |
| openFDA drug enforcement | **yes** | HTTP 200, 25 results (of 17,965 total), 24 keys/record. Default sort returns 2015 records; add `sort=report_date:desc` in the poller. `fixtures/openfda/drug_enforcement.json`. |
| CDSCO NSQ **PDF** (latest) | **yes, but stale** | Newest official NSQ PDF is **June 2025** (central labs, 6 pages, text-based, not scanned). CDSCO stopped publishing monthly NSQ PDFs after June 2025. `fixtures/cdsco/nsq_latest.pdf`. |
| CDSCO NSQ tables via pdfplumber | **yes** | Default `extract_tables()` gives 1 clean 8-column table per page; 60 rows incl. header across 6 pages (59 data rows). Page 2 first 3 rows below. `text` strategy is worse (ragged). |
| CDSCO NSQ **current data (2026)** | **yes — JSON, not PDF** | Since 28 Aug 2025 NSQ alerts are a DataTables web app at `cdscoonline.gov.in`, backed by plain GET JSON endpoints (no auth, browser UA + JSESSIONID cookie). Latest month = **JUL-2026, 239 rows** (40 CDSCO Labs + 199 State Lab). Saved `fixtures/cdsco/nsq_jul2026_all.json` and `nsq_jul2026_cdl.json`. 20 Paracetamol rows in JUL-2026. |
| Amazon Textract TABLES (async) | **NO** | `SubscriptionRequiredException: The AWS Access Key Id needs a subscription for the service` on `StartDocumentAnalysis`, `StartDocumentTextDetection`, `AnalyzeDocument`, `DetectDocumentText`, in both ap-south-1 and us-east-1. Root cause: account is on the **AWS Free account plan** (`freetier get-account-plan-state` → `accountPlanType: FREE`, $100 credits, expires 2027-03-18); Textract (and Comprehend) are not in the Free plan. Not IAM (AdministratorAccess; Rekognition call succeeds). Temp bucket `recallindia-p00-277025716889` was created, PDF uploaded, and bucket fully deleted afterwards (verified 404). |
| Bedrock model listing | **yes** | `list-foundation-models` works in both regions. ap-south-1 lists Nova Micro/Lite/Pro/2 Lite (INFERENCE_PROFILE only) and 19 Claude ids; us-east-1 lists Nova Micro/Lite/Pro with ON_DEMAND plus 13 Claude ids. Inference profiles: `apac.amazon.nova-*`, `apac.anthropic.claude-*`, `global.anthropic.claude-*`. |
| Bedrock **invoke** (Nova Micro) | **NO** | `converse` → `ValidationException: Operation not allowed` for `amazon.nova-micro-v1:0` and `apac.amazon.nova-micro-v1:0` (ap-south-1), `amazon.nova-micro-v1:0` and `us.amazon.nova-micro-v1:0` (us-east-1). `get-foundation-model-availability` → `authorizationStatus: NOT_AUTHORIZED`. `get-use-case-for-model-access` → *"You have not filled out the request form."* **No model is granted.** |
| Bedrock Claude granted? | **NO** | Claude 3.5 Sonnet, Claude 3 Haiku, Claude Haiku 4.5: `agreementAvailability: NOT_AVAILABLE`, `authorizationStatus: NOT_AUTHORIZED` in both regions. An agreement offer exists for Haiku 4.5 (`offer-fudwqbphlos64`); not accepted (needs you). Determined read-only, no Claude call was made. |
| SES identities (ap-south-1) | **none** | `list-identities` → `[]`. Account is in **sandbox** (`ProductionAccessEnabled=false`, 200/day, 1/sec, plan ESSENTIALS). Nothing to set as `NOTIFY_EMAIL` yet. |
| Lambda concurrent executions | **10** | `L-B99A9384` = 10.0 (account level, adjustable). Design must stay sequential as planned. |
| S3 create/upload/delete | yes | Bucket lifecycle in ap-south-1 worked with `LocationConstraint`. |
| Service Quotas API | yes | — |

## Needs you in the console (in this order)

1. **Billing and Cost Management → Account plan → upgrade FREE → Paid.** Without this Textract does not exist for this account, so the `/ingest` "PDF → feed dissolve" cannot use Textract. (Alternative: drop Textract; pdfplumber parses the PDF cleanly — see below.)
2. **Bedrock console → Model access → fill in the use-case form**, then enable **Amazon Nova Micro / Lite / Pro** and **Claude Haiku 4.5 (+ 3.5/3.7 Sonnet if offered)** in `ap-south-1` and `us-east-1`. Until then every invoke returns `Operation not allowed`. After granting, invoke Nova in ap-south-1 via the `apac.amazon.nova-*` inference-profile ids (no ON_DEMAND there).
3. **SES (ap-south-1) → Verified identities → create an email identity** with your address and click the verification link. Put it in `.env` as `NOTIFY_EMAIL`.
4. **Fix the `default` AWS profile** (its access key is invalid) or standardise on `AWS_PROFILE=firstcommit` in `.env` / Makefile.
5. Optional: Service Quotas → Lambda concurrent executions → request increase from 10 (only if the design ever needs it).

Re-run after 1–3 (from repo root):
```bash
export AWS_PROFILE=firstcommit AWS_DEFAULT_REGION=ap-south-1
B=recallindia-p00-277025716889
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=ap-south-1
aws s3 cp fixtures/cdsco/nsq_latest.pdf s3://$B/cdsco/nsq_latest.pdf
aws textract start-document-analysis --feature-types TABLES \
  --document-location "{\"S3Object\":{\"Bucket\":\"$B\",\"Name\":\"cdsco/nsq_latest.pdf\"}}"
# poll: aws textract get-document-analysis --job-id <JobId>
aws s3 rm s3://$B --recursive && aws s3api delete-bucket --bucket $B
aws bedrock-runtime converse --model-id apac.amazon.nova-micro-v1:0 \
  --messages '[{"role":"user","content":[{"text":"reply OK"}]}]' --inference-config '{"maxTokens":10}'
```

## Fixtures

| File | Bytes | Records | Record keys |
|---|---|---|---|
| `fixtures/cpsc/recent.json` | 1,374,046 | 451 (JSON array) | RecallID, RecallNumber, RecallDate, Description, URL, Title, ConsumerContact, LastPublishDate, Products, Inconjunctions, Images, Injuries, Manufacturers, Retailers, Importers, Distributors, SoldAtLabel, ManufacturerCountries, ProductUPCs, Hazards, Remedies, RemedyOptions |
| `fixtures/nhtsa/honda_city_2024.json` | 66 | 0 (`results`) | — (empty; HTTP 400 with `Count: 0`) |
| `fixtures/nhtsa/honda_accord_2024.json` | 3,612 | 3 (`results`) | Manufacturer, NHTSACampaignNumber, parkIt, parkOutSide, overTheAirUpdate, ReportReceivedDate (DD/MM/YYYY), Component, Summary, Consequence, Remedy, Notes, ModelYear, Make, Model |
| `fixtures/openfda/drug_enforcement.json` | 42,142 | 25 (`results`) | address_1, address_2, center_classification_date, city, classification, code_info, country, distribution_pattern, event_id, initial_firm_notification, openfda, postal_code, product_description, product_quantity, product_type, reason_for_recall, recall_initiation_date, recall_number, recalling_firm, report_date, state, status, termination_date, voluntary_mandated (+ optional more_code_info) |
| `fixtures/cdsco/nsq_latest.pdf` | 188,795 | 6 pages, 59 data rows | June 2025, CDSCO/Central Laboratories. Source: `https://cdsco.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/CDSCO%20NSQ%20june25.pdf` |
| `fixtures/cdsco/nsq_state_jun2025.pdf` | 424,014 | 15 pages | June 2025, State Laboratories (same layout, last column = state). |
| `fixtures/cdsco/nsq_jul2026_all.json` | 117,557 | 239 (`aaData`) | str_product_name, str_batch_no, dt_manufacturing_date, dt_expiry_date, str_manufactured_by, str_nsq_result, str_reporting_source, str_reported_by_lab_or_state, dt_reporting_month_year |
| `fixtures/cdsco/nsq_jul2026_cdl.json` | 21,618 | 40 (`aaData`) | same; `source=CDL` only |
| `fixtures/cdsco/nsq_portal_default.json` | 117,557 | 239 | byte-identical to `nsq_jul2026_all.json` (the portal's default = latest month) |

CPSC data quirk: in record[0], Title/Hazards describe a Char-Broil grill recall but `Products[0]` and `Remedies[0]` refer to LANCHEZ pressure washers. Normalisers must not assume Products/Remedies agree with Title.

## CDSCO — what actually exists (architecture finding)

- **No 2026 NSQ PDF exists** on cdsco.gov.in (Alerts, Latest Alerts, nsq-drugs pages all end at 2025). A DCGI notice dated 28 Aug 2025 moved NSQ alerts to a searchable portal.
- Portal: `https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/` embeds an iframe to `https://cdscoonline.gov.in/CDSCO/viewPublicNSQDrug` (jQuery DataTables). JSON endpoints, GET, browser UA, cookie from the page:
  - `/CDSCO/reportingYears?tab=nsq` → `["2019", …, "2026"]`
  - `/CDSCO/publicReportingMonths?year=2026&tab=nsq` → `["Jan", …, "Jul"]` (Jul 2026 is latest; no Aug yet)
  - `/CDSCO/publicNsqDrugTable` → latest month, all sources
  - `/CDSCO/filteredNsqDrugTable?month=JUL-2026&source=All|State|CDL&tab=nsq`
  - Spurious tab: `/CDSCO/viewPublicSpuriousDrugData`, `/CDSCO/filteredSpuriousDrugTable`
  - Response: `text/plain;charset=ISO-8859-1`, `{iTotalDisplayRecords, iTotalRecords, aaData:[…]}`. `str_reporting_source` has inconsistent casing (`State Lab` / `State lab`).
- Legacy PDFs (2010 → June 2025) are behind `download_file_division.jsp?num_id=<base64>`; the response is a 1-line HTML iframe whose `src` is the real PDF path under `/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/`. cdsco.gov.in served everything to curl with a Chrome UA; no TLS workaround needed.
- pdfplumber on `nsq_latest.pdf`: header row `S.No | Product/Drug Name | Batch No. | Manufacturing Date | Expiry Date | Manufactured By | NSQ Result | Reported by CDSCO Laboratory`. Page 2, first 3 rows (default settings):

| S.No | Product | Batch | Mfg | Exp | Manufacturer | NSQ Result | Lab |
|---|---|---|---|---|---|---|---|
| 9. | Calcium Gluconate Injection I.P. 10 ml. | MV24B36 | 02/2024 | 01/2026 | M/s. Martin & Brown Bio-Sciences Pvt.Ltd., Baddi, HP | Particulate Matter, Extractable Volume and Description | CDL, Kolkata |
| 10. | Rabeprazole Sodium (EC) & Domperidone (SR) Capsules (Sesarab-DSR) | CG23-0372F | 09/2023 | 08/2025 | M/s. Athens Life Sciences, Kala Amb, H.P. | Assay of Rabeprazole Sodium | CDL, Kolkata |
| 11. | Heparin Injection IP 5000 IU/ml (Flagorin) | DP2143 | 08/2022 | 06/2025 | M/s. Divine Laboratories Pvt. Ltd., Vadodara | pH and Assay of Heparin (Anti-factor-IIa activity) | CDL, Kolkata |

**Implications for SPEC/DEMO (your call, not changed here):**
- The `/ingest` hero shot ("real CDSCO PDF → Textract → feed") is still honest for the **June 2025 PDF** and the 2010–2025 backfill, but *current* months come from the portal JSON, so the live `cdsco_fetch` should poll `publicReportingMonths` + `filteredNsqDrugTable` and use the PDF path only for historical/backfill. Textract is not needed for the JSON path at all.
- The title-card number "168 medicines … March 2026" cannot be sourced from a PDF; the portal has MAR-2026 data (fetch with `month=MAR-2026`). JUL-2026 has 239 rows incl. 20 Paracetamol rows (e.g. Paracetamol Tablets IP 650mg, batch FT5427, Forgo Pharmaceuticals).
- `prompts/P03-cdsco-ingest.md` references `fixtures/cdsco/nsq_2026_03.pdf`; the fixture is `fixtures/cdsco/nsq_latest.pdf` (June 2025). Update P03 or copy the file.
- If the account plan is not upgraded, P03 should run pdfplumber first (it works) and treat Textract as optional.

## Environment notes for P01+

- `pip install` into system Python is blocked (PEP 668). Use a venv: `python3 -m venv .venv && .venv/bin/pip install pdfplumber pypdf boto3 requests`. During P00 the venv lived in the session scratchpad.
- `AWS_PROFILE=firstcommit` for all AWS CLI/boto3 calls until `default` is fixed.
- Temporary bucket `recallindia-p00-277025716889` no longer exists (`head-bucket` → 404; `list-buckets` filtered → empty).

## Update 2026-09-19

| Dependency | Now | Evidence |
|---|---|---|
| Account plan | **Paid** (`freetier get-account-plan-state` → `PAID / ACTIVE`) | upgraded in the console after P00 |
| Amazon Textract TABLES (async) | **works** | live `IngestStateMachine` run `ingest-20260919084944-ab53`: `StartDocumentAnalysis` on `raw/cdsco/CDSCO_NSQ_june25.pdf`, job SUCCEEDED after 5 polls / 24.8 s, 6 pages, 57 rows reconstructed from CELL blocks with bounding boxes; pdfplumber fallback not needed |
| Bedrock invoke | still **blocked** | `get-use-case-for-model-access` → form not submitted; `converse` on `apac.amazon.nova-lite-v1:0` → `Operation not allowed`; Nova Lite and Haiku 4.5 `authorizationStatus: NOT_AUTHORIZED` |
| SES identities (ap-south-1) | still **none** | `ses list-identities` → `[]` |

Console actions still open: Bedrock model access (use-case form, then Nova Lite + Claude Haiku 4.5), one SES verified email for `NOTIFY_EMAIL`.

## Update 2026-09-19 (2)

Bedrock is out for the whole hackathon: the quota increase was denied, quotas stay at 0. Decision: **no LLM in the decision path**; the model path stays implemented behind `BEDROCK_ENABLED` (default false). The other AWS AI services were checked live with one call each (`scripts/aws_ai_check.py`, profile `firstcommit`, region `ap-south-1`, input "Paracetamol Tablets IP 650mg, batch FT5427, Forgo Pharmaceuticals, failed CDSCO quality test, July 2026 alert"):

| Service | Works? | Result |
|---|---|---|
| Amazon Comprehend `DetectEntities` (en) | **yes** | 6 entities: `Forgo Pharmaceuticals` ORGANIZATION 0.96, `July 2026` DATE 1.00, `650mg` QUANTITY 0.63, `FT5427` COMMERCIAL_ITEM 0.50, `CDSCO` OTHER 0.41, `IP` OTHER 0.35. Good enough to pull brand / quantity / date out of pasted order lines; batch tokens still need the regex. |
| Amazon Translate en→hi | **yes** | "पेरासिटामोल टैबलेट IP 650mg, बैच FT5427, फोर्गो फार्मास्यूटिकल्स, असफल CDSCO गुणवत्ता परीक्षण, जुलाई 2026 अलर्ट" |
| Amazon Polly | **yes** | `Kajal` (neural, hi-IN) is available in ap-south-1; 56,924-byte MP3. `Aditi` (standard) is the coded fallback. |

Fixtures captured from these calls: `fixtures/aws_ai/comprehend_entities.json`, `translate_en_hi.json`, `polly_sample.mp3`. Use: paste-import normalisation in P06 (Comprehend + regex), Hindi voice note in P10 (Translate + Polly). The claim letter in P09 is a Jinja template.

Still open in the console: one SES verified email for `NOTIFY_EMAIL` (alerts are logged as `email.skipped` until then).

## Update 2026-09-19 (3)

P06 (the app) is live on **Amplify Hosting**: app `recallindia` (`d2jn22qjgettr5`, platform `WEB`, manual zip deployments, branch `main`) at https://main.d2jn22qjgettr5.amplifyapp.com. Its origin is in the template's `AppOrigins` (HTTP API CORS + raw bucket CORS), persisted in `samconfig.toml`. Checked live in a fresh headless Chromium context:

| Path | Works? | Evidence |
|---|---|---|
| Feed | **yes** | 4,868 notices · 4 sources; 50 rows, "Load 50 more" → 100; CDSCO filter; notice sheet with row ref + source excerpt |
| Item wall | **yes** | 15 seeded items: FT5427 alert ("Failed CDSCO quality test, JUL-2026 alert, row 12", quoted row, range bar), FT5428 dismissed ("batch FT5428 not in listed batches [FT5427]"), Jeep alert ("On NHTSA recall 24V436000" + NHTSA summary sentence) |
| Strip photo | **yes** | browser → `POST /uploads` → presigned PUT to S3 (CORS from the Amplify origin) → `POST /items/ocr`: Textract `DetectDocumentText` (whole image + the right edge band) → batch `446AG710`, maker `Acme Generics LLP`, Mfg `2017-06`, Exp `2020-05`, in 6.9 s |
| Paste lines | **yes** | "Pantoprazole Tablets IP Finecure Pharmaceuticals PEP5001" → Comprehend `BatchDetectEntities` + rules → brand `Finecure Pharmaceuticals`, batch `PEP5001`, 0.85 → added → auto check → checklist ○ ◐ ● from the execution history → **alert** ("Failed CDSCO quality test, JUL-2026 alert, row 1") |
| Lighthouse on `/` | a11y **100** | best practices 100, SEO 100, performance 71–75 (simulated mobile; LCP 3.6–3.8 s waits on the client-side stats fetch) |

After the checks the wall was reset to the seeded 15 (`make seed-live && make validate-live` → PASS: 2 alert, 1 dismiss, 12 clear).

Still open: an SES verified identity for `NOTIFY_EMAIL`. `EnableSchedules=false` is set in `samconfig.toml`, so the pollers run only when invoked (`make poll-live`); the header's "last poll" shows the last manual run.

## Update 2026-09-19 (4)

**Schedules on.** `EnableSchedules=true` was set in `samconfig.toml` and deployed at 18:23:59Z. The
first scheduled runs followed within a minute and wrote their `meta#` rows:
- `cdsco_portal`: 18:24:32Z, 239 rows re-pulled, all unchanged.
- `cpsc`: 18:24:36Z, 57 fetched.
- nhtsa / openfda: 18:24:50Z / 18:24:39Z.

CloudWatch `AWS/Scheduler InvocationAttemptCount` was 4 in the 18:15 window (one per schedule) and
has been 3 every 15 minutes since (cpsc, nhtsa, openfda), with no `TargetErrorCount`. The CDSCO
portal poll is daily: next run around 18:24Z.

**`/ingest` (P07) live.** Run `ingest-20260919192223-3c5a`, started with "Run ingest" on the
Amplify app, went through live Textract:

| Step | Result |
|---|---|
| Fetch | 3.2 s |
| Extract | 17.2 s; 4 Textract polls, now recorded with their times |
| Normalise | 55 rows · 0 new · 55 unchanged |
| Diff | 0 new since the last run |
| Publish | done; 27.1 s end to end |

The dissolve landed 55 rows, equal to `notices_out`; 2 continuation lines merged. The banner read
"55 notices · Textract · CDSCO NSQ June 2025 · 0 new since last run". Replaying that run
(`/ingest/?replay=ingest-20260919192223-3c5a`) plays the same steps and ends on the same banner.
`?demo=1` replays `ingest-20260919084944-ab53` with every API request blocked.

Perf gate: Chrome with 4× CPU throttling, a 30 s recording that includes the whole dissolve. The
dissolve averages 54.4–55.5 fps over two runs, and its worst second is 50–51 fps. The first 4 s
of the recording (pdf.js rasterising the 6 pages before the run starts) is below that.

