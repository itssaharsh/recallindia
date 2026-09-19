# DEMO_SCRIPT.md — the 3-minute video (build only what is here)

Source of truth for scope. Shot list, lengths and narration are in `VIDEO.md`; screens and components in `UI-SPEC.md`.

| t | Shot | Route | Must exist |
|---|---|---|---|
| 0:00 | Title card with the CDSCO month count from `/v1/stats` | — | slide |
| 0:10 | A recorded run (2×) of a real CDSCO PDF page left; Textract rows get a box drawn on, lift off and land in the notices pane; counter ticks; 5-step checklist ticks | `/ingest?replay=<run>&speed=2&autoplay=1` | pdf.js fix + poster fallback, dissolve, checklist |
| 0:40 | Counter hero, source pills with health, new rows landing, one notice in the side sheet | `/` | pollers, `?replay=poll`, NoticeSheet |
| 0:55 | Photo of a real strip → Textract words draw on → batch flies into the foil chip → check → clear | `/mine` (own household) | scan, FoilChip, checking face |
| 1:10 | FT5427 card → check again → flips red; quote, foil chip, notice row | `/mine` | matcher, flip, alert face |
| 1:25 | Step Functions execution paused at WaitForApproval | console | task token |
| 1:30 | Outcome line → notice record → Approve claim letter → seal → letter → VERIFIED → tamper → INVALID (signature does not match) → verify again | `/case/?id=` | approval gate, Object Lock + KMS, verify endpoint, letter PDF |
| 2:02 | Near-miss card: two foil chips, one character underlined, dismissed with the reason | `/mine` | near-miss branch |
| 2:15 | Jeep Compass matching NHTSA 24V436000 by make, model and year; "confirm with your dealer using the VIN" | `/mine` | vehicle match, RangeBar |
| 2:25 | Try-it console + the same curl in a terminal | `/api` | public API page |
| 2:40 | Architecture card: EventBridge · Lambda · Step Functions · Textract · DynamoDB · S3 Object Lock · KMS · API Gateway · Amplify | slide | — |
| 2:52 | Live URL + repo | slide | — |

Rules: 80% product on screen, captions on, 1080p, no talking head. Record each shot separately in your own household copy. Every AWS service named in the narration is visible on screen (UI, console or the architecture card). Nothing on screen may be a placeholder. VIDEO.md owns the exact timings.
