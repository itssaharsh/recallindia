# /case/?id= : the claim, sealed

This is the climax of the video. The user opens an alert from My things and sees one sentence about what happened to them. Below it are the notice exactly as the regulator published it and their batch checked against the list. At the bottom is a cobalt band where the evidence seal lands and the claim letter is written.

Mockups: `v3/mock/case.html` (verified, demo), `v3/mock/case-waiting.html` (own household, waiting for approval), `v3/mock/case-invalid.html` (after the tamper test). All three are built from one template: `<html data-state="v|w|i">` plus `data-s="…"` on the parts that change between states.

| PNG | What it shows |
|---|---|
| `mockups/case-1536.png` | Verified demo case, first viewport at 1536×790 |
| `mockups/case-full-1536.png` | Verified, full page (Show work open) |
| `mockups/case-waiting-1536.png` | Own household, "Waiting for you", with the inline gate and the pipeline paused on step 1 |
| `mockups/case-invalid-1536.png` | After "Run tamper test", scrolled to the outcome band, with the seal INVALID |
| `mockups/case-390.png` | Verified, first viewport at 390×844 |
| `mockups/case-full-390.png` | Verified, full page at 390 |

---

## 1. Screen

**Purpose.** Show one person what went wrong, the proof, and what they get. Within 10 seconds a juror should be able to say: "they were sold a strip that CDSCO had already flagged. The app kept a copy of the notice that can't be changed, and wrote the letter."

**First 10 seconds (1536×790, verified demo).**
1. 0–2 s: the red band ("On a notice · Failed CDSCO quality test · JUL-2026 alert, row 12") and the headline "You were sold this strip **11 days** after CDSCO flagged it."
2. 2–5 s: the calendar strip, where 01 is ringed, 02–11 are tinted and 12 is filled, under the bracket "11 days". Then the foil chip FT5427.
3. 5–8 s: the aside's cobalt "Claim letter ready" block with the VERIFIED mini seal, and four checked pipeline steps with real durations.
4. 8–10 s: the start of "The notice, as CDSCO published it", which carries CDSCO's own sentence with "Dissolution Test" highlighted.

In the waiting state, the inline gate "Waiting for you · Approve and seal evidence" takes the same position as the receipt. Its top is at y=469 and it is fully visible in the first viewport.

**Page states** (`?state=` accepts the values below; the default comes from `case.status`):

| `?state=` | Source (`GET /cases/{id}` → `status`, plus verify) | What changes |
|---|---|---|
| `loading` | before the first response | Skeleton header (red band drawn, text bars), aside skeleton. No spinner over the whole page. |
| `waiting` | `waiting_approval` | Gate shown, band = empty slot, aside paused on step 1 (`case-waiting-1536.png`) |
| `readonly` | `waiting_approval` and demo household | Gate shown with primary button "Make my own copy" instead of Approve, plus the line "The demo household is read-only. Make your own copy to approve this case." |
| `approving` | `approving` | Gate is collapsing into the receipt, step 1 is filling |
| `sealing` | `sealing` | Receipt shown, step 2 active, band slot shows "Sealing row 12…" |
| `writing` | `writing_letter` | Band is cobalt with the SEALED seal, step 3 active, paper still a ghost |
| `verifying` | `verifying` | Paper written, step 4 active, seal centre still shows the lock |
| `verified` | `verified` + verify `valid:true` | `case-1536.png` |
| `invalid` | `verified` + verify `tampered:true, valid:false` | `case-invalid-1536.png` |
| `rejected` | `rejected` | Receipt variant: "You dismissed this match at {HH:MM} IST. Nothing was sealed." Band slot: "Nothing was sealed: this case was dismissed." Aside steps 2–4 greyed with "Skipped". |
| `expired` | `expired` | Same as rejected, with the copy "This approval expired at {HH:MM} IST. Nothing was sealed." plus the button "Check this thing again". |
| `failed` | any `steps.*.error` | The failed step's node turns red (×). Inline error card under the receipt: "{Step} failed: {error}. Nothing was sent to anyone." with the button "Check status again". |

## 2. Layout

### 1536 (and every width from 1440 up)
Measured from the mockup at 1536×790:

| Region | x, y, w, h (px) |
|---|---|
| App nav (shared) | 0, 0, 1536, 64 (sticky) |
| Crumbs row | 32, 80, 1472, 44 |
| Case header card | 32, 136, 1472, 309 (red band 52 tall) |
| Header tile / headline / foil / calendar | tile 61, 249, 132×132 · h1 221, 235, 774×96 · foil 221, 366, 175×52 · calendar 1023, 220, 452×190 |
| Body grid | top 469: main column 1044 wide, gap 28, aside 400 wide |
| Receipt (verified) / Gate (waiting) | 32, 469, 1044×56 / 1044×234 |
| Notice card | 32, 549, 1044×543 |
| Batch vs list card | 32, 1116, 1044×381 |
| Outcome band | 32, 1521, 1044×808 (waiting: 617). Paper 500 wide, certificate 456 wide, gap 32 |
| Show work | 32, 2352, 1472 wide: full width under the body grid (open 451, closed 103) |
| Aside (case file) | 1104, 469, 400×639, `position: sticky; top: 84px` |

- Page gutter 32. The main column holds a vertical stack with gap 24. Show work sits under the grid at full width, 24 px below it, with 72 px of padding under it. The sticky aside therefore runs from the receipt to the end of the band, which is where the choreography needs it.
- The content edge lines up with the nav logo (x=32), as on My things.

### 1024–1439
- The header card grid becomes `112px 1fr`. The calendar moves under the headline and spans the full card width.
- The aside is no longer a column. It turns into a **pipeline strip**: a white card between the header and the main column, 1 row and 4 steps across, 76 tall. Each step is node, label and duration in one row, with 2 px connectors between nodes. Its status block drops to the left end of the strip at 220 wide. The actions move into the band header, where "Download claim letter (PDF)" is already present.
- Main column: 100 %. In the band grid the paper is `minmax(0,1fr)` and the certificate is 420.

### 768–1023
- Same as 1024–1439, except the band stacks with the certificate first and the paper below it. The paper's max width is 560, centred.

### 390 (anything under 768)
Measured at 390×844 (`case-390.png`, `case-full-390.png`):

| Region | x, y, w, h |
|---|---|
| Nav | 0, 0, 390, 56 (tabs hidden, household pill compact) |
| Crumbs | 16, 68, 358, 44 (back pill + status chip only) |
| Header card | 16, 122, 358, 596. Band wraps to 2 lines (99 tall). Tile 64×64 next to the category. h1 31/1.06 at full width. Foil 44 tall. Calendar 324 wide, cells 22×34 |
| Receipt / gate | 16, 734, 358 (order 1) |
| Case file (aside) | 16, 835, 358×639 (order 2, static) |
| Notice | order 3 · Batch vs list order 4 · Band order 5 · Show work after the grid (16 above, 24 below) |
| Band | Seal 132, certificate first, paper second (326 wide, padding 22 20) |
| Bottom tab bar | fixed, 68 tall. Body gets `padding-bottom: 80px` |

Gutter 16. The mobile grid is a flex column with `.main{display:contents}` so the aside can sit between the gate and the notice.

## 3. Components, in reading order

### C1 · CaseCrumbs
- **Purpose.** A way back, what this case is, and its status at a glance.
- **Placement.** First row under the nav, 16 px below it.
- **Size.** Height 44. The back pill is 40 tall (the hit area is padded to 44), with padding 0 16 0 12.
- **Tokens.** Pill: surface-1, 1 px `line`. Text: Onest 500 14 ink. Case id: IBM Plex Mono 13 `ink-muted`. Status chip `.chip.lg` (30 tall).
- **States / copy.**
  - verified: chip `clear`, text "Claim ready · verified" (check icon)
  - waiting: chip `info`, text "Waiting for you" (stamp icon)
  - approving through verifying: chip `info`, text "Sealing your claim…" (14 px spinner)
  - invalid: chip `alert`, text "Tamper test · invalid" (× icon)
  - after "Verify again": chip `clear`, text "Verified again · {HH:MM} IST"
  - rejected / expired: chip `hold`, text "Dismissed" / "Expired"
  - left side: "← My things", then "/ {item.name}", then the right side "{case_id} · opened {dd Mon yyyy}"
- **Transitions.** When the chip changes state it crossfades (opacity 0→1, 160 ms) and its width animates with a layout spring (stiffness 420, damping 36).
- **Responsive.** At 390, the item name, case id and opened date are hidden.
- **Keyboard + a11y.** The back pill is a link to `/mine`. The chip sits in a `role="status"` wrapper.
- **Data.** `case.case_id`, `case.created_at`, `item.name`, `case.status`.
- **Acceptance.** For each `?state=` value the chip shows exactly the copy above, and there is no horizontal scroll at 390.

### C2 · CaseHeader (the My things alert face, grown up)
- **Purpose.** One sentence that explains the harm, plus the two facts behind it: the batch, and the dates.
- **Placement.** Full width (1472) under the crumbs, 12 px gap.
- **Size.** 1472 × 309. Band 52. Body grid `132px 1fr 452px`, gap 28, padding 24 28 26.
- **Tokens.**
  - Card: 1 px `rgba(179,18,30,.28)` border, radius 14. Shadow `0 2px 4px rgba(11,27,51,.05), 0 22px 44px -22px rgba(179,18,30,.45)`.
  - Band: `danger` background. Badge: white with danger text, Onest 700 12 uppercase, tracking .05em. Source: Onest 600 16 white. Date: Onest 500 14 `#FFDCD8` (5.45:1).
  - Tile: `danger-soft` background with the `il-strip` illustration (from My things), the bottom-right pocket filled `#B3121E`.
  - h1: Funnel Display 800 46/1.04, tracking −.035em. "{n} days" is set in `danger` with `white-space: nowrap`.
  - Foil chip: `.foil.lg` (52 tall, Doto 900 36).
- **Sub-component · SoldAfterCalendar** (452 × 190):
  - Panel: `#FFF8F7` background, 1 px `#F3D3CF` border, radius 14, padding 14 18 16.
  - 12 day cells in a 12-column grid with gap 5, each 42 tall with radius 9:
    - days in between: `#FBE1DD` background, text `#8C1C24` (7.3:1)
    - publish day: white with a 2 px `danger` inner ring
    - purchase day: `danger` fill with white text and a 3 px `#FBE1DD` halo
  - Bracket: a 2 px `danger` border (no bottom edge) running from the centre of the first cell to the centre of the last. It carries the pill "{n} days" (`danger` background, white Onest 700 13).
  - Footer: two labels, "**01 Jul** CDSCO published row 12" and "**12 Jul** You bought batch FT5427" (at 390: "CDSCO published" and "You bought it").
- **States / copy.**
  - medicine, bought after the notice (FT5427): "You were sold this strip {n} days after CDSCO flagged it." Calendar chip: "Sold after the notice".
  - medicine, bought before the notice: "CDSCO flagged this strip {n} days after you bought it." Calendar: purchase day filled first, publish day ringed last. Chip `info` "Flagged after you bought it".
  - vehicle (Jeep 24V436000): "Your Jeep Compass 2022 is on an NHTSA recall published 13 Jun 2024." The calendar is replaced by the My things RangeBar (listed 2021–2023, yours 2022) with the note "NHTSA covers US vehicles, so confirm with your dealer using the VIN."
  - Gaps longer than 31 days: the calendar becomes the two-point gap line from My things (dot, line with the "{n} days" pill, dot).
  - The foil label is always "Your batch". For serials it reads "Your serial", and for vehicles the foil shows "2022" with the label "Your model year".
- **Transitions.** On arrival from My things the header does a shared-element morph from the alert card that was clicked. Its band, tile and foil chip carry `layoutId`s `alert-band-{item_id}`, `tile-{item_id}` and `foil-{item_id}`, animated with a spring (stiffness 320, damping 32, about 380 ms, bounce 0.06). Nothing else on the page moves during the morph. The rest fades in at 120 ms (opacity 0→1, 240 ms). That is the page's one load sequence.
- **Motion (calendar, first paint only).** Cells fill left to right with a 22 ms stagger (opacity .4→1, 160 ms ease-out). Then the bracket draws (clip-path inset from the right, 100 %→0, 320 ms, `cubic-bezier(.2,.8,.2,1)`), and the "11 days" pill pops (scale .85→1, spring 500/26). Total is about 700 ms. Reduced motion shows the final frame.
- **Responsive.** At 390 (`case-390.png`): the band wraps with the source on its own line; the tile is 64 next to the category; the h1 is 31/1.06 across both columns; the foil is 44 tall at 28 px; calendar cells are 34 tall with gap 3 and 12 px text.
- **Keyboard + a11y.**
  - The h1 is `id="case-title"`, and the article is `aria-labelledby` it.
  - The calendar has `aria-label="July 2026: CDSCO published the notice on 1 July; you bought the strip on 12 July, 11 days later"`, and its cells are `aria-hidden`.
  - The red band text is 16 px 600 white on #B3121E, which is 6.95:1.
- **Data.**
  - `notice.source`, `notice.month` (JUL-2026), `notice.row` (12), `notice.published_at` (2026-07-01)
  - `item.kind`, `item.name`, `item.brand`, `item.batch`, `item.purchase_date` (2026-07-12)
  - `case.sold_after_notice`; n = purchase_date − published_at in days
- **Acceptance.**
  - The headline for `case_demo_ft5427` reads exactly "You were sold this strip 11 days after CDSCO flagged it.", with "11 days" on one line.
  - Never "recalled" for CDSCO.

### C3 · ApprovalGate (waiting) and ApprovalReceipt (after)
- **Purpose.** The human-in-the-loop moment. Nothing is sealed or written until the owner says yes. It is **inline and never a modal**.
- **Placement.** First item in the main column, top at y=469.
- **Size.**
  - Gate: 1044 × 234. Grid `1fr 300px`, gap 28, padding 26 28, radius 22 (`r-lg`).
  - Receipt: 1044 × 56, radius 999.
- **Tokens (gate).**
  - Card: surface-1 with a 2 px `cobalt` border. Shadow `0 2px 4px rgba(10,88,194,.08), 0 26px 50px -22px rgba(10,88,194,.5)`.
  - Icon: 52 cobalt disc with the white stamp icon and a pulsing 2 px cobalt ring (1.8 s, `cubic-bezier(.2,.8,.2,1)`, scale .86→1.18, opacity .5→0). This is the only infinite pulse in the waiting viewport.
  - h2: Funnel Display 800 32. Body: Onest 400 16/1.55 `ink-muted`, with the key phrases in ink 600.
  - Flow chips: surface-2 pills with 32 white icon discs, labels Onest 600 14 and 12. Under 768 they are hidden, because the case file's pipeline sits directly under the gate and lists the same steps.
  - Primary button `.btn-primary.btn-lg`: 56 tall, 16.5 px, 20 px icon. Secondary button 48 tall.
- **Tokens (receipt).** Surface-1 with a 1 px `line` border. A 36 `success-soft` disc holds the success check. Text Onest 15, with the lead phrase in ink 600. The date on the right is Onest 500 13 with tabular numbers (Plex Mono is kept for hashes, ids and code).
- **States / copy.**
  - waiting:
    - h2 "Waiting for you"
    - body "If this is your strip, approve and RecallIndia **seals CDSCO's row 12 as evidence** and **writes a claim letter** to the pharmacy. Nothing is sent to anyone."
    - flow chips "Seal row 12 · S3 Object Lock, 30 days" → "Write your letter · To the pharmacy" → "Verify the signature · AWS KMS"
    - buttons "Approve and seal evidence" and "Dismiss, it's not my strip"
    - note "About 9 seconds from approval to a signed, locked claim."
  - readonly (demo): the primary button is "Make my own copy". The body adds "The demo household is read-only. Make your own copy to approve this case."
  - approving: the primary label becomes "Approving…" with a 16 px white spinner, and both buttons get `aria-disabled`.
  - dismiss confirm (inline; the gate swaps its content, it does not open a dialog):
    - text "Dismiss this match? The case closes and nothing is sealed."
    - buttons "Dismiss match" (secondary with danger text) and "Keep it" (ghost)
  - receipt, verified or invalid: "**Approved at 05:28 IST** for the demo household. Sealed, written and verified in 9.0 s." For your own household: "**You approved this at {HH:MM} IST.** Sealed, written and verified in {t} s."
  - receipt, mid-pipeline: "**You approved this at {HH:MM} IST.** Sealing your claim…"
  - rejected / expired: see §1.
- **Transitions.** Gate to receipt, on the approve response (`status: approving`):
  1. The content crossfades: the old content goes out over 120 ms, and the new content comes in over 180 ms after an 80 ms delay.
  2. Height 234→56, radius 22→999 and border 2 px cobalt → 1 px line all run on one layout spring (stiffness 380, damping 34, about 320 ms, bounce 0.05).
- **Keyboard + a11y.**
  - The gate is a `<section aria-labelledby="gate-h">`. On load in the waiting state, focus stays on the page; there is no auto-focus.
  - Enter or Space on the primary button approves.
  - Once approved, focus moves to the receipt (`tabindex="-1"`), and the live region says "Approved. Sealing your claim."
  - Both buttons are at least 48 tall.
  - With reduced motion, the receipt includes the link "Jump to your claim ↓", because auto-scroll is off.
- **Data.**
  - `POST /cases/{id}/approve` and `POST /cases/{id}/reject` (with the header `x-household` when not demo). The response carries `{case}`.
  - `case.approval.status`, `approved_at`, `approver`.
- **Acceptance.**
  - `?state=waiting` matches `case-waiting-1536.png`.
  - There is never a `role="dialog"` on this page.
  - The button names its result: "Approve and seal evidence".

### C4 · NoticeAsPublished
- **Purpose.** The regulator's own words, shown as readable fields with the untouched raw row under them. That raw row is the thing that gets sealed.
- **Placement / size.** Main column, 1044 × 543, padding 24 28 26.
- **Tokens.**
  - Source tile: 48 square, radius 12, background `#E4EDFB`, "CDSCO" in Funnel Display 800 10.5 cobalt.
  - h2: Funnel Display 700 24. Meta: Onest 14 `ink-muted`. Button: `.btn-secondary.btn-sm` (40 tall) "Open on cdscoonline.gov.in ↗".
  - Quote: `#FFF8F7` background, 1 px `#F3D3CF` border, radius 12. A 46 px red open-quote mark sits at the left. Text Onest 500 19/1.45 ink. `<mark>` is `#FAD9D5`.
  - Fields: a 3-column grid `1.25fr .8fr .95fr` with a 1 px `line` rule under each cell. Labels `.fl` (Onest 600 11, uppercase, .07em); values Onest 500 15. The batch value is `.foil.sm` (28 tall, Doto 17).
  - Raw row block: `#F8FAFD` background, 1 px `line`, radius 12. Header 46 tall. Body IBM Plex Mono 13.5/1.8. Pipe separators in `line-strong`. `FT5427` gets a `cobalt-soft` background with a 2 px cobalt underline. "Dissolution Test" is a `<mark>`.
- **States / copy.**
  - h2 "The notice, as CDSCO published it"
  - meta "Not of Standard Quality alert · July 2026 · row 12 · published 01 Jul 2026"
  - quote "The sample does not conforms to the I.P. with respect to Dissolution Test." (verbatim, including the regulator's grammar), cite "Result as listed · tested by DTL Bikaner (State Lab)"
  - fields: Drug "Paracetamol Tablets IP 650mg" · Batch FT5427 · Mfg · Exp "Oct-2025 · Sep-2027" · Manufacturer (spans 2 columns) "Forgo Pharmaceuticals, 27, DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103" · Alert "JUL-2026 · row 12"
  - raw header, left: "Row 12, raw text · exactly as published"
  - raw header, right, before sealing: grey lock chip "671 bytes · sealed when you approve"
  - raw header, right, after sealing: success lock chip "Sealed copy · 671 bytes"
  - For NHTSA/CPSC notices the same card shows their fields (campaign, component, summary, remedy). The raw block becomes "Notice JSON, exactly as published" and pretty-prints the snapshot.
- **Transitions.** At the seal moment the lock chip crossfades from grey to success (200 ms), 400 ms after the seal stamps (§4, B3).
- **Responsive.** At 390: the header wraps and the button goes full width; fields go to 2 columns (Drug, Manufacturer and Alert take full width); the quote is 16 px; the raw row is 12.5 px.
- **Keyboard + a11y.** The quote is a `<blockquote>` with `<cite>`. The external link has `rel="noopener"`, and its accessible name is "Open this notice on cdscoonline.gov.in (opens in a new tab)".
- **Data.**
  - `GET /v1/notices/{notice_id}` fields: product, batch, mfg, exp, manufacturer, reason, lab, lab_type, month, row, published_at, source_url.
  - Raw row: `case.quoted_sentence` (or `notice.raw_excerpt`).
  - Byte count: `case.evidence.snapshot_bytes` (671).
- **Acceptance.** The raw row string is character-for-character equal to `quoted_sentence`, and the highlights never change the text.

### C5 · BatchVsList
- **Purpose.** Draw the match onto the object: the batch printed on your strip, character by character, against the listed batch.
- **Placement / size.** Main column, 1044 × 381. Body grid `352px 1fr`, gap 36.
- **Tokens.**
  - Strip-back illustration: 352 × 184, radius 14, `--foil` background with the blister shadow from My things.
    - Print: Funnel Display 800 13 uppercase `#1B3563`; maker Onest 500 11.
    - Codes: Doto 900 17, with labels Onest 700 10.
    - A cobalt word box (2 px, radius 5) goes around the batch, with the tab "Your batch" (cobalt, white Onest 700 11). This is the same box language as the Textract scan on My things.
    - 2×2 pockets of 52 px; one pill is `#B3121E`.
  - Character tiles: 46 × 54, radius 9, `--foil`, Doto 900 28. Between the rows is a line of `=` marks in `danger` (Funnel Display 800 20).
  - Chip row (all widths), `.chip.alert.lg`: "6 of 6 characters match" first, then "Same batch", "Same medicine", "Same maker" with a check. The row starts at the row-label edge (x=449 at 1536) and is 598 wide on one line.
  - Near-miss footer: a 1 px `line` rule on top, Onest 14 `ink-muted`, `.foil.sm`, and `.chip.near` (`cobalt-soft`/`cobalt`).
- **States / copy.**
  - h2 "Your batch against the list", meta "Matched on batch, medicine and maker, character by character"
  - row labels "On your strip · printed batch" and "CDSCO, row 12 · listed batch"
  - if characters differ (near-miss cases viewed from here): the mismatched tile gets a 2 px `cobalt` ring. The `=` for that column becomes `≠` in cobalt, and the first chip reads "{k} of {n} characters match" in `.chip.near`.
  - footer: "Not on this list: your other strip, batch FT5428" + "Near-miss · dismissed". The footer is hidden when there is no near-miss for this notice.
- **Motion (in view, once).** The top row of tiles appears first. Then the bottom row flips in one tile at a time (rotateX 90°→0, 180 ms each, 60 ms stagger, `cubic-bezier(.2,.8,.2,1)`). Each `=` fades in 40 ms after its pair lands. Reduced motion shows everything at once.
- **Responsive.** At 390 the strip is full width and 168 tall. Tiles go to a 6-column grid of about 49 px. The chip row wraps to two lines.
- **Keyboard + a11y.** The comparison is `role="img"` with `aria-label="On your strip FT5427, CDSCO row 12 FT5427: 6 of 6 characters match"`. The tiles are hidden from assistive tech.
- **Data.** `case.range_check` `{yours:"FT5427", listed:"FT5427", inside:true}`, `case.reasoning`, `item.batch`, `item.exp_date`, `item.mfg_date` (the illustration prints only the fields that exist), and household items whose near-miss points at `case.notice_id`.
- **Acceptance.** Tiles come from the two strings, never hard-coded. With FT5428 vs FT5427, column 6 shows `≠`.

### C6 · OutcomeBand = ClaimLetterPaper + EvidenceCertificate
- **Purpose.** The reward. It is the single place where the letter and its proof live together. It turns cobalt when the evidence is sealed, and the round seal is stamped onto it.
- **Placement / size.**
  - Main column, 1044 × 808 when verified, 617 when waiting. Padding 28, radius 22. `id="evidence"`, `scroll-margin-top: 80px`.
  - Header: h2 plus a 560-wide paragraph on the left, actions on the right.
  - Body grid `500px 1fr`, gap 32.
- **Tokens.**
  - Band (sealed): `cobalt` background. h2 Funnel Display 800 34 white; paragraph Onest 15.5 `on-cobalt-muted` (#CFDEF6 on #0A58C2 = 4.84:1).
  - Band actions: `.btn-onblue` "Download claim letter (PDF)" and `.btn-outline-onblue` (55 % white border) "Copy letter text".
  - Band (waiting): `surface-2` with a 2 px inner ring `#C6D2E4`; text colours switch to ink / `ink-muted`.
  - Paper: white, radius 6. Shadow `0 2px 4px rgba(0,20,60,.18), 0 34px 60px -26px rgba(0,16,60,.7)`. Padding 30 34 0. Onest 14/1.62.
    - Letterhead: logo 24, "Claim letter" in Funnel Display 800 15, case id, and on the right "20 September 2026", with a 1 px `line` rule under it.
    - Footer ("more"): `surface-2`, with the text "The PDF goes on to ask for a refund or a replacement and a written reply within 15 days." and the attachment chip.
    - Attachment chip: a white card, 1 px `line`, radius 10, with a success lock icon and the text "Cites the sealed copy of row 12". Under it, in Plex Mono 12: "SHA-256 56237b4d…4b9c29a7 · locked until 19 Oct 2026".
    - No fade gradient: the preview ends on a paragraph boundary, and the footer states that the letter continues.
  - Certificate column (white on cobalt):
    - Label "Evidence certificate" (`.fl`, 80 % opacity), seal 176 (see C7), result h3 Funnel Display 800 30, text Onest 15 `on-cobalt-muted`, "Last checked {HH:MM} IST" in Onest 500 13 with tabular numbers.
    - Key-value list: 118 px label column; rows get a 1 px `rgba(255,255,255,.2)` rule on top and padding 12 0. The hash is in Plex Mono 13.5, broken into two groups of 32 characters.
- **States / copy.**

| State | Band | Paper | Certificate |
|---|---|---|---|
| waiting | surface-2. h2 "Your claim appears here". p "Approve above and RecallIndia seals row 12, writes the letter and checks the signature. It takes about 9 seconds." No actions. | Ghost paper: dashed 1.5 px `#C6D2E4` outline, letterhead "not written yet", skeleton bars (surface-2, 10 tall, radius 5), and a cobalt-soft note "Written the moment you approve, citing row 12 and the sealed copy's hash." | Slot: a 176 circle with a 2.5 px dashed `#9AA9BF` border, a stamp icon and "The seal lands here". h3 "Not sealed yet", p "Row 12 is locked and signed the moment you approve." Values: SHA-256 "Appears when sealed", Signed "Appears when sealed", Key "alias/recallindia-signing / RSASSA_PKCS1_V1_5_SHA_256", Locked until "30 days after you approve", Snapshot "Row 12 from CDSCO's portal · 671 bytes". |
| sealing | still surface-2 | ghost | The slot's dashed ring rotates (stroke-dashoffset loop, 1.6 s linear). Label "Sealing row 12…". The SHA-256 value reads "Writing to S3 Object Lock…" |
| writing | **cobalt** (the flood, §4 B3). h2 "Your claim, sealed" | ghost, with its bars on white | The seal in its SEALED variant (cobalt centre with a lock). h3 "Sealed". p "Row 12 is locked until {date}. Checking the signature next." All key-value values are real. |
| verifying | cobalt | written (B4) | SEALED seal. h3 "Sealed", p "Asking AWS KMS to verify the signature…" |
| verified | cobalt. p "The letter cites row 12. The copy of row 12 is locked for 30 days and signed, so the pharmacy can check it for itself." Actions shown. | written | VERIFIED seal. h3 "Verified". p "AWS KMS confirms the sealed copy still hashes to the signed digest." "Last checked 15:08 IST". Outline button "Run tamper test" plus the hint "Flips one byte of a downloaded copy. Nothing stored changes." |
| invalid | cobalt (unchanged) | written. The attachment chip turns to its bad variant: a red alert icon and "The copy under test no longer matches this hash". | INVALID seal (red). h3 "Does not match". p "One byte of the copy changed, so its hash no longer matches the signed digest." White button "Verify again", then "Tested 15:09 IST". The **TamperDiff** card appears (below). Key-value list: Signed, Key, Locked until. |

- **Sub-component · TamperDiff** (invalid only):
  - Card: white, radius 14, padding 16 18, shadow `0 16px 34px -18px rgba(0,16,60,.7)`.
  - Line 1: "Changed byte 335: `0x6e → 0x6f`", with the hex in Plex Mono 15 on `danger-soft`/`danger`.
  - Byte strip: an SVG as wide as the card and 34 tall, one tick per 4 px across the whole 671-byte snapshot, and a 7 px `danger` marker at 335/671. Labels "byte 0", "335" (danger), "671 bytes".
  - Hash comparison: "Signed 56237b4d612cf0bcd7e97aa1d6ddb88e / bdb31f3f23708a6028ac10ab4b9c29a7" in ink. "Recomputed 92d76ff5b3b22264d42e93382054e2a3 / db3031feef60693d52286c0fd3c90654" in `danger`, with the chip `.chip.alert` "× does not match".
  - Note: "**Demo control:** one byte of the downloaded copy was flipped in memory. The stored snapshot is untouched." The label is in `warning` 600.
- **Letter copy.** Rendered from `case.claim_text` with the paragraphs as they are. The preview shows everything up to and including the paragraph that begins "I bought it on". The rest ("I request a refund or a replacement…", the evidence reference and the sign-off) is in the PDF, and the footer says so.
- **Responsive.** At 390: padding 20 16; the header stacks and its buttons go full width; the certificate comes first with a 132 seal above the result; the key-value list becomes one column (label over value); the paper follows at 326 wide.
- **Keyboard + a11y.**
  - The section is `aria-labelledby="band-h"`. The seal is an `<svg role="img" aria-label="Seal: verified">` (or "Seal: invalid" / "Seal: sealed").
  - The TamperDiff is `role="status"`.
  - "Copy letter text" shows the sonner toast "Letter copied".
  - The Download link is `<a download>` to the presigned PDF URL.
  - Contrast: all white text on cobalt is 6.59:1 or better, and muted text is 4.84:1.
- **Data.**
  - `case.claim_text`, `case.claim_pdf_s3_key`, `case.claim_addressee` ("pharmacy")
  - `case.evidence.{sha256, signed_at, key_alias, signing_algorithm, object_lock_mode, object_lock_retain_until, snapshot_bytes, snapshot_kind, snapshot_s3_key, snapshot_version_id, source_url}`
  - `GET /cases/{id}/verify-evidence` returns `{valid, sha256, recomputed_sha256, checked_at}`
  - `GET /cases/{id}/verify-evidence?tamper=1` returns `{valid:false, tampered:true, flipped_byte_index:335, byte_before:110, byte_after:111, recomputed_sha256, demo_control}`
  - Bytes are rendered as `0x` + two lowercase hex digits.
- **Acceptance.**
  - `?state=verified`, `?state=waiting` and `?state=invalid` match their PNGs.
  - The byte-strip marker position = `flipped_byte_index / snapshot_bytes`.
  - The recomputed hash is always the API value, never computed or invented on the client.

### C7 · Seal (four variants)
The same 200×200 drawing as the landing page (`#seal` in `landing.html`): a white disc r96, an outer ring r92 (5 px), an inner ring r58 (2.5 px), and arc text on r74 set in Onest 700 14.5 with tracking 3.2 and `textLength=458`.

| Variant | Ring + arc text | Centre (r54) | Glyph | Word | Arc text |
|---|---|---|---|---|---|
| slot | none (dashed 2.5 px `#9AA9BF` circle) | none | stamp icon 28 | none | none |
| sealed | `#0A58C2` | `#0A58C2` | white lock (9 px stroke) | SEALED | "EVIDENCE SEALED · S3 OBJECT LOCK · RECALLINDIA · " |
| verified | `#127A55` | `#127A55` | white check `M78 94l14 14 28-30` | VERIFIED | "EVIDENCE SEALED · KMS SIGNED · RECALLINDIA · " |
| invalid | `#B3121E` | `#B3121E` | white × `M85 79l30 30M115 79l-30 30` | INVALID | "SIGNATURE MISMATCH · BYTE 335 CHANGED · " (built from `flipped_byte_index`) |

- Resting transform: `rotate(-8deg)`, with the drop-shadow `0 12px 20px rgba(0,18,64,.4)`.
- Two static impact rings sit around it: inset −12 px (1.5 px, white 28 %) and inset −26 px (1 px, white 12 %). They are the final frame of the stamp's shockwave.
- Sizes: 176 in the band (132 at 390), and 68 as the aside's mini seal (with the drop-shadow `0 6px 10px rgba(0,18,64,.35)`).
- In the aside and on the landing the seal sits on cobalt or white; the white disc makes every variant readable on both.

### C8 · CaseFile (the aside, sticky from 1440 up)
- **Purpose.** Always-visible progress while the page scrolls: what state the claim is in, the four pipeline steps with real timings, and the one next action.
- **Placement / size.** Right column, 400 wide, `position: sticky; top: 84px`, 639 tall when verified. Card padding 20.
- **Tokens.**
  - Status block: bleeds to the card edges with a top radius of 13.
    - verified: cobalt background, 68 mini seal, h3 Funnel Display 700 22 white, p Onest 14 `on-cobalt-muted`.
    - waiting: `cobalt-soft` background with a 56 cobalt disc holding a white pause glyph (two 2.6 px bars) and a static 2 px cobalt ring at 22 % opacity. It does not pulse: the gate icon is the one pulse.
    - invalid: white background, red mini seal, p in `danger`.
  - Pipeline label: Onest 600 12 uppercase `ink-muted`; the total sits right in Onest 600 13 ink with tabular numbers.
  - Steps: each is a grid `32px 1fr auto` with padding 11 0.
    - Nodes are 32 circles: done = cobalt with a white 16 check; now = white with a 2.5 px cobalt ring, a 12 cobalt dot and the pulse; pending = white with a 1.5 px `#B2BDCC` ring and the step number; failed = `danger` with a white ×.
    - Connectors: 2 px cobalt when done, 2 px dashed `#C3CDDB` when pending. The last step has none.
    - Label Onest 600 15; detail Onest 13 `ink-muted`; duration Onest 500 13 `ink-muted` with tabular numbers.
- **States / copy.**
  - verified: status "Claim letter ready" / "Sealed and verified at 05:28 IST". Pipeline "9.0 s end to end".
    - Steps: "Approve · Demo household · 05:28:31", "Seal evidence · S3 Object Lock · 30 days · 1.0 s", "Write letter · PDF · to the pharmacy · 6.9 s", "Verify signature · AWS KMS · valid · 1.1 s".
    - Actions: primary "Download claim letter (PDF)", secondary "See the certificate" (scrolls to `#evidence`).
    - Facts: Notice "CDSCO · JUL-2026 · row 12", Item "Paracetamol Tablets IP 650mg", Case `case_demo_ft5427`.
  - waiting: status "Paused at step 1" / "Nothing is sealed until you approve." Pipeline "0 of 4 done".
    - Step 1 "Approve · Needs you" (cobalt 600) with "paused" on the right; its now-node has no pulse ring in this state. Steps 2–4 pending.
    - Note (surface-2): "Your letter and the evidence certificate appear on this page as soon as the pipeline finishes."
  - approving → verifying: status "Sealing your claim" / "Step {k} of 4 · {step label}…"; the active step has a spinner node; the total reads "{elapsed} s" and ticks every 100 ms via NumberFlow.
  - invalid: status "Signature does not match" / "Tamper test · byte 335 changed". Step 4 "Verify signature · Does not match · tamper test · 0.9 s" with a red node. Actions: primary "Verify again", secondary "Download claim letter (PDF)". The invalid capture shows none, because the band is on screen (see "Actions yield to the band").
  - rejected / expired: steps 2–4 read "Skipped" in `ink-muted`, with no actions.
- **Transitions.** See §4. A node changes state with a crossfade (140 ms) plus a scale spring (500/28), and the check draws (stroke-dashoffset 24→0, 220 ms ease-out). A connector fills with `scaleY 0→1` from the top (280 ms, `cubic-bezier(.2,.8,.2,1)`).
- **Actions yield to the band.** An IntersectionObserver watches `#evidence`. While at least 30 % of the band is visible, the case file's action block collapses (height → 0 and opacity → 0, 200 ms `cubic-bezier(.2,.8,.2,1)`; opacity only under reduced motion), because the band carries the same actions next to the seal. It comes back when the band leaves. Only one "Download claim letter (PDF)" and one "Verify again" are ever on screen. Keyboard focus inside the block moves to the band's matching button before it collapses.
- **Responsive.** From 1024 to 1439 it becomes the horizontal pipeline strip (§2). Under 768 it is a static card placed after the gate or receipt (`case-full-390.png`).
- **Keyboard + a11y.**
  - The steps are an `<ol>`; each `li` carries `aria-current="step"` when active.
  - The status block is `role="status" aria-live="polite"`. It announces "Step 2 of 4, sealing evidence", "Evidence sealed", "Letter written" and "Signature verified. Your claim letter is ready".
- **Data.** `case.steps.{approve,seal_evidence,write_letter,verify}.{started_at,finished_at,error}`.
  - Duration = finished − started, shown to 1 decimal in seconds.
  - Total = `verify.finished_at − approve.finished_at`.
  - The approve step shows `approve.finished_at` in IST (HH:MM:SS) and not a duration.
- **Acceptance.** The durations come from the API, the timings are never faked, and the minimum dwell (§4) only delays when each change is shown.

### C9 · ShowWork
- **Purpose.** Radical transparency for judges and sceptics: why it matched, and every event with timestamps.
- **Placement / size.** Under the body grid at full width (1472 at 1536), 24 px below it. Collapsed it is 103 tall (the default); open it is 451 (shown open in `case-full-1536.png`).
- **Tokens.**
  - `<details>` card with padding 24 28. The summary has h2 Funnel Display 700 22, a subline in Onest 14 `ink-muted`, and a 40 circle chevron button that rotates 180° when open.
  - Body grid `.85fr 1.15fr`, gap 48. At 1472 wide every audit row fits on one line.
  - "Why it matched": a list with 22 `danger-soft` check discs, plus the chips `info` "Deterministic matcher" and "Confidence 0.95".
  - "Audit log · IST": a table with time in Plex Mono 12.5, event in Plex Mono 12.5 ink, detail in Onest 13.5.
  - API line: surface-2, radius 12, "GET /cases/case_demo_ft5427" (GET in cobalt), and a secondary button "Copy case JSON".
- **Copy.**
  - Why: "Maker: "Forgo Pharmaceuticals" matches" · "Medicine: "Paracetamol Tablets IP 650mg", fuzzy score 100" · "Batch: FT5427 is in the listed batches [FT5427]"
  - Log:
    - 05:28:24 case.created, decision: alert
    - 05:28:24 decision.alert, failed CDSCO quality test, JUL-2026 alert, row 12
    - 05:28:31 approval.approved, demo household
    - 05:28:32 evidence.signed, portal row · 671 bytes · locked until 2026-10-19
    - 05:28:39 claim.drafted, case_demo_ft5427.pdf · 3,082 bytes · to the pharmacy
    - 05:28:40 evidence.verified, valid · alias/recallindia-signing
  - Tamper runs are appended client-side as "15:09:12 evidence.tamper_test, byte 335 0x6e → 0x6f · does not match (demo control)".
- **Motion.** Opening animates the height with a spring (380/34). The chevron rotates over 250 ms.
- **Responsive.** At 390 the body is one column and the log's detail column is hidden.
- **Keyboard + a11y.** A native `<details>`/`<summary>`: Enter or Space toggles it.
- **Data.** `case.reasoning` (split on "; "), `case.verifier`, `case.confidence`, `case.audit[]` (ts → IST), and the raw `GET /cases/{id}` JSON.
- **Acceptance.** Every log row maps to one `audit[]` entry in API order.

### C10 · App nav and mobile tab bar (shared)
- These are the same as My things.
- The "My things" tab is active, because the case lives under My things.
- Household pill: "Demo household · read-only" for the demo, or an avatar initial with "My household · 15 things" for your own.
- At 390 the tab bar is fixed at 68 tall, and the full-page capture shows it at the bottom of the document.

---

## 4. Choreography: approve → seal → letter → verify

The backend runs a Step Functions execution that takes about 9 s. The UI polls `GET /cases/{id}` every **600 ms** from the approve response until `status ∈ {verified, rejected, expired}`, a step error appears, or 30 s pass (then the failed state shows "Still working. Check status again").

Each status change is queued and played in order. Every phase gets a **minimum dwell**, so a fast or seeded backend still reads as four beats:
- approving 400 ms
- sealing 1200 ms
- writing_letter 1400 ms
- verifying 900 ms

The durations *shown* are always the API's.

T = the moment the approve click is received.

| Beat | When | What moves | Timing / easing |
|---|---|---|---|
| B0 Press | T+0 | The Approve button presses to scale .97, and its label becomes "Approving…" with a spinner. `POST /cases/{id}/approve`. | 90 ms ease-out, back to 1 on release (spring 600/30) |
| B1 Resume | response (status `approving`) | Gate → receipt (C3). Aside step 1 fills (the check draws) and connector 1→2 fills. Step 2 becomes "now". The crumb chip changes to "Sealing your claim…". | layout spring 380/34 (~320 ms); check 220 ms ease-out; connector 280 ms `cubic-bezier(.2,.8,.2,1)` |
| B1b Scroll into view | T+450 ms | If `#evidence` is not ≥ 60 % visible, the page scrolls so the band's top sits at 80 px (nav 64 + 16). This is a custom rAF scroll. | 700 ms `cubic-bezier(.65,0,.35,1)`. Cancelled by any wheel, touch or key input. Skipped if the user scrolled in the last 1500 ms. Never scrolls again automatically in this run. |
| B2 Sealing | status `sealing` | The band slot's dashed ring rotates. The SHA-256 value reads "Writing to S3 Object Lock…". The aside status reads "Step 2 of 4 · sealing evidence…". | ring dashoffset loop 1.6 s linear |
| **B3 The stamp** | status `writing_letter` with `evidence` present | See the next table. | about 900 ms |
| B4 Letter | status `verifying` with `claim_pdf_s3_key` present | The ghost paper becomes the written paper. The paper lifts (translateY 12→0, shadow ghost→full). Blocks replace the skeleton bars one at a time (letterhead, To, Subject, Dear, p1, p2, p3, footer): each goes opacity 0→1 and y 6→0. The band actions fade in. Aside step 3 is done and step 4 is now. | lift spring 400/32; blocks 220 ms ease-out with a 70 ms stagger; actions 200 ms |
| B5 Verified | status `verified` + verify `valid:true` | **The seal centre flips** from SEALED (cobalt + lock) to VERIFIED (success + check): the centre disc goes rotateY 0→90° (140 ms ease-in), the drawing swaps, then 90→0° (spring 520/30), and the check draws (dashoffset 60→0, 240 ms ease-out). The ring and arc text crossfade from cobalt to success over 200 ms. The result text crossfades to "Verified". The aside turns step 4 into a check, and its status block goes cobalt with the mini VERIFIED seal, "Claim letter ready". The total counts up to "9.0 s end to end" (NumberFlow, 400 ms). The crumb chip becomes "Claim ready · verified". | about 600 ms in total |
| B6 Toast | B5 + 300 ms | sonner toast: "Claim letter ready · evidence sealed and verified", action "Download PDF". The live region says "Signature verified. Your claim letter is ready." | shown for 4 s, sonner default motion |

**B3, the stamp moment (the reward).** t = when `writing_letter` arrives:

| t (ms) | What happens |
|---|---|
| 0 | **Cobalt flood.** A cobalt overlay inside the band grows as `clip-path: circle(0 at seal-centre)` → `circle(150% at seal-centre)` over 560 ms, `cubic-bezier(.2,.8,.2,1)`. The band's own background switches to cobalt when it ends, and the overlay is removed. |
| 120 | **Stamp descends.** The SEALED seal starts at scale 1.8, rotate −24°, opacity 0, drop-shadow `0 40px 40px rgba(0,18,64,.25)`. |
| 120→340 | It accelerates in like a hand pressing, to scale .94, rotate −8°, opacity 1, shadow `0 12px 20px rgba(0,18,64,.4)`. Easing `cubic-bezier(.55,0,.9,.4)`, 220 ms. |
| 200→440 | Text colours in the band crossfade from ink to white / `on-cobalt-muted` (240 ms). |
| **340** | **Impact.** The band nudges translateY 0→2 px (40 ms) and back (80 ms, ease-out). Ring 1 (2 px white) grows from the seal edge to 1.45× with opacity .55→0 (460 ms, `cubic-bezier(.2,.8,.2,1)`). Ring 2 (1 px) does the same 80 ms later, to 1.8× with opacity .3→0. Touch devices get `navigator.vibrate?.(12)`. |
| 340→520 | The seal settles from .94 to 1 (spring stiffness 600, damping 30; bounce ≤ .1). The static impact rings fade in to 28 % / 12 % (200 ms). |
| 380 | The key-value values reveal top to bottom (SHA-256, Signed, Key, Locked until, Snapshot): opacity 0→1 and y 8→0, 200 ms each, 50 ms stagger. The SHA-256 appears as its two 32-character groups. |
| 400 | The raw-row lock chip in C4 turns to success "Sealed copy · 671 bytes" (200 ms crossfade). Aside step 2 checks, step 3 becomes now, and the status block goes cobalt with the mini SEALED seal, "Evidence sealed · writing your letter…". The live region says "Evidence sealed." |

**Reduced motion.** There is no flood, stamp, shake, rotateY, lift, translate or auto-scroll. Each change is an opacity crossfade of 150 ms. The band switches colour with a 150 ms crossfade of its background, and the seal fades in at its resting transform. The receipt shows "Jump to your claim ↓".

**Focus.** Focus is never moved into the band automatically. After B1, focus is on the receipt.

## 5. Tamper test transitions

Available when `status = verified`. The button is "Run tamper test" in the band.

| Step | When | What moves | Timing |
|---|---|---|---|
| X0 | click | Label "Testing…" with a spinner. `GET /cases/{id}/verify-evidence?tamper=1`. Minimum dwell 500 ms. | none |
| X1 Denial | response `tampered:true, valid:false` | The VERIFIED seal lifts (scale 1→1.06, rotate −8→−4°, 120 ms ease-out), then the INVALID seal stamps in its place (scale 1.25→.96 over 200 ms `cubic-bezier(.55,0,.9,.4)`, then a spring to 1, 600/30). At impact there is a horizontal shake: x 0,−6,6,−4,4,0 over 360 ms ease-in-out. There are no impact rings, which are kept for the reward. | about 700 ms |
| X2 Diff | X1 + 120 ms | The TamperDiff card opens (height 0→auto with a 380/34 spring, opacity 0→1 over 200 ms). The byte-strip marker grows scaleY 0→1 from the bottom (220 ms, at +260). "0x6e" shows first, then crossfades to "0x6e → 0x6f" at +420 (160 ms). | about 600 ms |
| X3 Mismatch | X1 + 300 ms | The recomputed hash fades in (200 ms), and the chip "does not match" pops (scale .9→1, spring 500/26). The result text becomes "Does not match". The letter's attachment chip turns to its bad variant. | none |
| X4 Chrome | X1 + 300 ms | Aside step 4 → red ×, detail "Does not match · tamper test". Status block → white with the red mini seal, "Signature does not match". Crumb chip → "Tamper test · invalid". Primary actions → "Verify again" (the case file's action block stays collapsed while the band is on screen). The live region says "Tamper test: byte 335 changed from 0x6e to 0x6f. The signature does not match." | crossfades 160 ms |
| X5 Keep in view | after X2 | If the diff card's bottom is below the viewport, scroll by the minimum needed (`block: nearest`, 400 ms `cubic-bezier(.65,0,.35,1)`). Skipped under reduced motion. | none |
| V0 Verify again | click | `GET /cases/{id}/verify-evidence`, minimum dwell 500 ms, label "Verifying…". | none |
| V1 Restore | response `valid:true` | The diff card closes (opacity out 160 ms, height →0 260 ms ease-in). The VERIFIED seal re-stamps using B3's stamp at 0.8× distance (scale 1.5→.95→1, rotate −18→−8°, 300 ms in total, impact rings on). Aside step 4 → check, and the status block returns to cobalt "Claim letter ready". The crumb chip becomes "Verified again · {HH:MM} IST". The live region says "Verified again. The sealed copy matches the signed digest." | about 520 ms |

Under reduced motion every tamper step is a 150 ms opacity crossfade.

## 6. Copy deck (exact)
- "You were sold this strip {n} days after CDSCO flagged it."
- "Failed CDSCO quality test · {MON-YYYY} alert, row {row}" · "Published {dd Mon yyyy}" · "On a notice"
- "Your batch" · "Sold after the notice" · "{n} days" · "{dd Mon} · CDSCO published row {row}" · "{dd Mon} · You bought batch {batch}"
- "Waiting for you" · "Approve and seal evidence" · "Dismiss, it's not my strip" · "About 9 seconds from approval to a signed, locked claim."
- "Approved at {HH:MM} IST for the demo household. Sealed, written and verified in {t} s."
- "The notice, as CDSCO published it" · "Row {row}, raw text · exactly as published" · "Sealed copy · {bytes} bytes"
- "Your batch against the list" · "{k} of {n} characters match" · "Same batch" · "Same medicine" · "Same maker" · "Not on this list: your other strip, batch {batch}" · "Near-miss · dismissed"
- "Your claim, sealed" · "Your claim appears here" · "Download claim letter (PDF)" · "Copy letter text"
- "Evidence certificate" · "Verified" · "Sealed" · "Not sealed yet" · "Does not match"
- "Run tamper test" · "Verify again" · "Changed byte {i}: 0x{before} → 0x{after}" · "does not match" · "Demo control: one byte of the downloaded copy was flipped in memory. The stored snapshot is untouched."
- "Claim letter ready" · "Sealed and verified at {HH:MM} IST" · "Signature does not match" · "{t} s end to end"
- "Paused at step 1" · "Nothing is sealed until you approve." · "Needs you" · "paused" · "{k} of 4 done"
- "Last checked {HH:MM} IST" · "Tested {HH:MM} IST"
- "Show work" · "How the match was made, and every step the pipeline took" · "Copy case JSON"
- Never write "recalled" for CDSCO, and never "safe".

## 7. Data (endpoints, all on `https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com`, with `x-household: {id}` unless the household is demo)
- `GET /cases/{id}` returns: `status`, `approval`, `steps`, `evidence`, `claim_text`, `claim_pdf_s3_key`, `claim_addressee`, `quoted_sentence`, `range_check`, `reasoning`, `verifier`, `confidence`, `sold_after_notice`, `audit[]`, `item_id`, `notice_id`, `household_id`
- `GET /items/{item_id}` · `GET /v1/notices/{notice_id}` · `GET /items/{item_id}/check-status`
- `POST /cases/{id}/approve` · `POST /cases/{id}/reject`
- `GET /cases/{id}/verify-evidence[?tamper=1]`
- On page load in the verified state, the page calls `verify-evidence` once (without tamper) and prints `checked_at` as "Last checked {HH:MM} IST". The seal shows VERIFIED only if `valid:true`.

## 8. Acceptance
1. At 1536×790, `/case/?id=case_demo_ft5427` matches `case-1536.png`: headline, calendar, foil chip, receipt, cobalt aside status and four checked steps all above the fold.
2. `?state=waiting` matches `case-waiting-1536.png`: the gate is fully visible, the aside is paused on step 1, and the band is an empty slot.
3. `?state=invalid` scrolled to `#evidence` matches `case-invalid-1536.png`: red seal, "Changed byte 335: 0x6e → 0x6f", recomputed hash with "does not match", and a red node on aside step 4.
4. There is no horizontal scroll at 390 (`scrollWidth === 390`), and every touch target is at least 44 px.
5. Approve → verified plays B0–B6 in order with the minimum dwells. With reduced motion there are opacity changes only.
6. There are no modals, no gradients except `--foil`, no violet/indigo, and red is used only for the alert band, the alert chips, the INVALID seal and the red pill.

## 9. Notes
- **Live data drift.** The live demo case was re-seeded at 2026-09-20 09:55 UTC. It now returns SHA-256 `5f4b34c5…4c683283`, signed at 09:55:05Z and locked until 2026-10-20, with step durations of 0–1 s. The mockups use the brief's example values (`56237b4d…4b9c29a7`, signed 2026-09-19 23:58 UTC, 1.0 / 6.9 / 1.1 s). The recomputed hash in the INVALID mockup (`92d76ff5…fd3c90654`) is the live API's real tamper result for the current snapshot. The build must render everything from the API.
- The claim letter wording is the live `claim_text` ("To: The Pharmacist-in-charge / The pharmacy that sold this medicine"), which is fuller than the brief's shorthand "To: The pharmacy".

## 10. Jury critique

A Best UI jury pass over the six case PNGs, checked against `mine-1536.png`, `mine-390.png` and `feed-1536.png` for consistency. The fixes are surgical edits to `v3/work-case/case.tpl.html`, rebuilt with `build.py` and re-shot at the same sizes. `scrollWidth` equals the width in every capture: 1536 for the four desktop shots and 390 for both mobile shots.

**Grade before: 7.5 / 10.** The first viewport is the strongest in the app. It has a one-sentence harm headline, the 11-day calendar and the foil batch chip, plus a cobalt case file with four real timings. The state views let it down, and one of them was visibly broken.

**Grade after: 8.5 / 10.**

### The 8 most damaging problems

| # | Problem a juror would notice | Where | What changed |
|---|---|---|---|
| 1 | **Broken certificate list in the invalid state.** SHA-256 had no value in that state, so the label/value grid slipped by one cell. "SHA-256" and "Signed" sat side by side as labels, the date wrapped into the 118 px label column, and "alias/recallindia-signing" overlapped "Locked until". | `case-invalid` (band, below the TamperDiff) | The SHA-256 row now shows only in the verified and waiting states, because the diff card already shows both hashes. The two duplicate "Signed" labels are merged into one. The invalid list reads Signed · Key · Locked until, as C6 specifies. |
| 2 | **Duplicate actions in one view.** In the invalid capture "Verify again" and "Download claim letter (PDF)" each appeared twice, once in the case file and once in the band. Scrolled to the band, the verified state showed Download twice. | `case-invalid-1536.png`, verified scrolled | Added the C8 rule "Actions yield to the band": while 30 % of `#evidence` is visible, the case file's action block collapses. The invalid capture is that frame, so its case file shows status, steps and facts with no buttons. |
| 3 | **"Waiting for you" appeared four times** in the waiting first viewport (crumb chip, gate h2, aside status, step 1 detail), and three rings pulsed at once. | `case-waiting-1536.png` | The aside status is now "Paused at step 1" / "Nothing is sealed until you approve." with a static pause disc. Step 1 reads "Needs you", the word My things uses. Only the gate icon pulses, and the step-1 halo is off in this state. |
| 4 | **Show work was squeezed and wrapped badly.** The audit log in ~520 px broke a date across two lines ("locked until 2026-10-" / "19"), and "row 12", "to the pharmacy" and "fuzzy score 100" wrapped. Below the aside, the right column was 1,800 px of empty canvas. | `case-full-1536.png` | Show work moved out of the main column to full width under the grid (1472; body `.85fr 1.15fr`, gap 48). Every log row is now one line, and the page ends on a full-width block that mirrors the full-width header. The sticky case file still runs beside the notice, the batch and the band, which is where the B1b–B5 choreography needs it. |
| 5 | **Two unexplained verification times.** The case file said "verified at 05:28 IST" and the certificate said "checked 15:08 IST". | first viewport vs band | The case file now says "Sealed and verified at 05:28 IST", the pipeline run. The certificate says "Last checked 15:08 IST", the re-verify on page load. The tamper line is "Tested 15:09 IST". At 390 the aside subline now fits on one line. |
| 6 | **Plex Mono on plain dates and durations** (receipt date, "9.0 s end to end", step durations, "05:28:31", "checked 15:08 IST"). This breaks the type rule that mono is for hashes, ids and code only, and made the case file read like a terminal next to My things. | receipt, case file, certificate | These are now Onest 500/600 13 with tabular numbers. Mono stays on hashes, the case id, the key alias, byte offsets and the audit log. |
| 7 | **The match result chip floated alone.** At 1536 "6 of 6 match" hung to the right of the `=` row, detached from the other chips, and its copy differed from the 390 version ("6 of 6 characters match"). | `case-full-1536.png`, batch card | There is now one chip row at every width: "6 of 6 characters match" · "Same batch" · "Same medicine" · "Same maker". It is 598 wide on one line at 1536 and starts at the row-label edge. |
| 8 | **The 390 gate repeated itself.** The flow chips wrapped with dangling "→" arrows, and the same three steps appeared again in the case file's pipeline 20 px below. There was also a glitchy snapshot key, "56237b4d….bin" (an ellipsis followed by a dot). | 390 waiting; band | Flow chips are hidden under 768. The snapshot key now reads `evidence/case_demo_ft5427/56237b4d…29a7.bin`. |

**Also fixed while re-shooting.**
- The mobile column had `align-items:start` inherited from the desktop grid. Once the aside's subline got shorter, the case file shrank to 332 wide. It is now `align-items:stretch`, so every card is 358 wide.
- `case-full-390.png` is shot with `?full`, the template's full-capture flag, so the fixed tab bar sits at the bottom of the document and not across the header card.

**Not changed (and why).**
- In the full-page 1536 capture the right column is empty beside the batch card and the band. Live, the case file is `position: sticky` and travels with the band, showing the pipeline ticking while the seal lands (§4 B1b–B5). A static full-page capture cannot show that.
- The notice card repeats CDSCO's sentence twice: once as the quote and once inside the raw row. The raw row is the exact bytes that get sealed, so both stay.

**Measured after the fixes (1536×790).** Receipt/gate top at 469 · notice 549 · batch 1116 · band 1521 (verified 808 tall, waiting 617, invalid 951) · Show work 32, 2352, 1472 wide (open 451) · case file 1104, 469, 400×639 (waiting 604). At 390: case file 16, 835, 358×639 · band 16, 3228, 358 · Show work 16, 5127, 358.
