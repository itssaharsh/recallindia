# VIDEO.md — RecallIndia demo video (target 2:45, hard cap 3:00)

## Recording checklist (after P08-P09-case-and-ui Phase 4 is deployed)
- OBS, 1920×1080, 30 fps, cursor on, no microphone (Descript adds the voice). Chrome at **125% zoom** (≈1536×790 CSS px, the viewport the QA gate checks). Light theme, the only theme.
- Record in **your own copy** of the demo household: on `/mine/` click `Make my own copy` and wait until all 15 cards finish checking. The demo household itself is read-only.
- Warm up: open the live URL once, run one `/ingest` replay, open one case.
- Before generating the voice, replace the month and count in [01] with `cdsco_latest` from `/v1/stats`.
- One MP4 per clip, named below, 2 s of stillness at the start and end.

| # | File | On screen | Length |
|---|---|---|---|
| 01 | 01-title.mp4 | Title card (Descript): "{count} drug samples failed CDSCO quality tests in {month}. Nobody told the people who bought them." | 10 s |
| 02 | 02-ingest.mp4 | `/ingest/?replay=<run>&speed=2&autoplay=1`: PDF page left, row boxes drawing on, rows landing right, counter climbing, checklist ticking | 25 s |
| 03 | 03-feed.mp4 | `/feed/?replay=poll`: counter hero, source pills with health dots, rows landing, one row opened in the side sheet | 13 s |
| 04a | 04a-scan.mp4 | `/mine/` → Add a thing → photo of a real strip → word boxes draw on → batch flies into the foil chip → Check this batch → CLEAR | 15 s |
| 04b | 04b-flip.mp4 | the FT5427 card → Check again → checking → flips red; quote, foil chip on red, notice row | 13 s |
| 04c | 04c-sfn.mp4 | Step Functions console: execution paused at WaitForApproval (cutaway, no paragraph of its own) | 4 s |
| 05 | 05-case.mp4 | `/case/?id=`: outcome line → notice record → Approve claim letter → pipeline steps → seal fills → letter rises → VERIFIED → Run tamper test → INVALID → Verify again | 27 s |
| 05a | 05a-s3.mp4 | S3 console: the snapshot's Object Lock retention (GOVERNANCE, date) (cutaway inside 05) | 3 s |
| 05b | 05b-kms.mp4 | KMS console: the asymmetric signing key (cutaway inside 05) | 2 s |
| 06 | 06-nearmiss.mp4 | the near-miss card: Yours over Listed, one character underlined, dismissed with the reason | 12 s |
| 07 | 07-vehicle.mp4 | the Jeep Compass card: NHTSA 24V436000, model year inside the range, "confirm with your dealer" line | 10 s |
| 08 | 08-api.mp4 | `/api/`: Run request → curl line → JSON; then the same curl in a terminal | 13 s |
| 09 | 09-arch.mp4 | Architecture card (one PNG) | 13 s |
| 10 | 10-cta.mp4 | Live URL + repo card | 5 s |

Total ≈ 2:45.

## Narration (~355 words). Paragraph → clips: [01]→01 · [02]→02 · [03]→03 · [04a]→04a · [04b]→04b+04c · [05]→05 (05a and 05b are cutaways at "Object Lock" and "KMS key") · [06]→06 · [07]→07 · [08]→08 · [09]→09 · [10]→10

**[01]**
India publishes drug quality failures as PDFs nobody reads. In July 2026, two hundred thirty-nine samples failed CDSCO's tests. Nobody told the buyers. This is RecallIndia.

**[02]**
This is a recorded run of a real CDSCO alert, at double speed. Textract reads the table, and every row becomes a structured notice: drug, batch, manufacturer, and the test it failed. The archive comes from PDFs like this one; current months come from CDSCO's portal. Both land in one feed.

**[03]**
The same feed polls CPSC, NHTSA and openFDA every fifteen minutes. Every notice keeps its source, its row number, and where it came from.

**[04a]**
Now the part that matters. I photograph the back of a strip. Textract reads the foil, I confirm the batch, and it's checked against every notice. Mine is clear.

**[04b]**
In my copy of the demo household, one strip is batch FT5427. It's on CDSCO's July list, row twelve. A Step Functions pipeline found it, a plain rule confirmed the batch is listed, and then the pipeline stops and waits for me.

**[05]**
In this demo scenario, it was sold eleven days after the alert. Nothing happens until I approve. I approve: the notice is sealed in S3 Object Lock, locked for thirty days, and its hash is signed with a KMS key. Then the claim letter is written, citing that evidence. Change one byte, and the signature no longer matches.

**[06]**
Same medicine, same maker, one character different in the batch. It's dismissed, with the reason. A false alarm you don't send is the system working.

**[07]**
Vehicles too: this Jeep matches an NHTSA recall by make, model and year, and the card says to confirm with the dealer using the VIN.

**[08]**
And every notice is a public API. One request, and India's notices are JSON.

**[09]**
EventBridge, Lambda, Step Functions, Textract, DynamoDB, S3 Object Lock, KMS, API Gateway, Amplify. My first time with task tokens and Object Lock. The lesson: refusing wrong matches is the hard part.

**[10]**
RecallIndia. Live now. Link below.

Keep the narration true to what's on screen: if the scan in 04a reads something else, or the near-miss card shows other values, say those.

## Descript prompt (Agent Underlord, after importing the clips)
"Assemble the clips in filename order: 01, 02, 03, 04a, 04b, 04c, 05, 06, 07, 08, 09, 10; place 05a and 05b as short cutaways over 05 where the narration says 'Object Lock' and 'KMS key'. Use the narration in VIDEO.md as the voiceover with this mapping: [01]→01, [02]→02, [03]→03, [04a]→04a, [04b]→04b and 04c together, [05]→05, [06]→06, [07]→07, [08]→08, [09]→09, [10]→10. Voice: calm, neutral English (India). Trim or hold each clip so narration and picture end together. Title card for 01 and the architecture card for 09: dark ink #0E1B23 on #ECEEEA, no animation. Burn in captions: dark text on a light box, bottom-centre, no emoji. Remove silences longer than 0.8 s. No music. Keep the stamp sound in 05. Final length 2:50 or less. Export 1080p."
