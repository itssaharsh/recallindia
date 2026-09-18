# DEMO_SCRIPT.md — the 3-minute video (build only what is here)

| t | Shot | Route | Must exist |
|---|---|---|---|
| 0:00 | Title card: "India publishes recalls as PDFs and web tables nobody reads. 239 medicines failed CDSCO quality tests in July 2026 — 20 of them Paracetamol." (figures from `fixtures/cdsco/nsq_jul2026_all.json`) | — | slide |
| 0:12 | Real CDSCO PDF page (`fixtures/cdsco/nsq_latest.pdf`, June 2025 archive alert) on the left; Textract runs (pdfplumber fallback if Textract is unavailable); rows lift off and snap into the feed on the right; counter ticks to 59. On-screen caption: "archive PDF via Textract · current months via portal JSON". Dynamic checklist: Fetch PDF · Extract tables · Normalise · Diff · Publish. | `/ingest` | ingest pipeline (`cdsco_pdf` + `cdsco_portal` adapters), dissolve animation, checklist, caption |
| 0:40 | Feed with source chips (CDSCO · SIAM · CPSC · NHTSA · openFDA); a live poll lands a new row at the top. Header counter with tabular numerals and "last poll hh:mm:ss". | `/` | pollers, feed row |
| 0:55 | Scan a medicine strip → batch number read (Textract) → card appears → "Check" → Step Functions graph (console screen-record) → card flips red: quoted sentence highlighted in the source excerpt; range bar shows your batch inside listed batches. | `/mine` | scan, matcher, card flip, source excerpt, range bar |
| 1:25 | Case: "Purchased 2026-05-02 · CDSCO alert 2026-04-21 → sold after notice." Claim letter drafts → Approve → PDF opens → evidence certificate stamps VERIFIED → click "Tamper test" → SIGNATURE INVALID in red. | `/case/[id]` | claim, task-token approval, Object Lock + KMS, verify endpoint |
| 1:55 | Sibling strip, same drug, different batch → card goes amber → "Dismissed: batch DL-4472 not in listed batches [DL-4471, DL-4468]". | `/mine` | near-miss branch with reason |
| 2:10 | Type a vehicle registration → SIAM/NHTSA hit → Hindi voice note plays (waveform). | `/mine` | stretch: SIAM poller, Polly |
| 2:25 | Terminal: `curl https://<url>/v1/notices?source=cdsco_nsq&since=2026-07-01` → JSON (rows carry `adapter`). | `/api` | public API + docs page |
| 2:40 | Architecture card: EventBridge · Lambda · Textract · Bedrock · Step Functions · DynamoDB · S3 Object Lock · KMS · SES · Amplify. Caption: "First time using Textract tables, Step Functions task tokens, Object Lock." | slide | — |
| 2:55 | Live URL + repo. | — | — |

Rules: 80% product on screen, captions on, 1080p, no talking-head. Record each shot separately; the seed script resets state between takes. Every AWS service must be visible (console or UI), not just named.
