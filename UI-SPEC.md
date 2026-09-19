---
name: RecallIndia
design: ./DESIGN.md
direction: "derived: Gazette & Foil (a printed public notice + the foil back of a medicine strip). Light only."
personality: precise            # one exception: the evidence seal stamps mechanically (T-13)
dials: { variance: 4, motion: 4, density: 7 }
stack: { next: "15 app router, output: export (existing)", react: 19, tailwind: 4, ui: "shadcn (existing, re-tokened)", motion: "framer-motion (existing)", extras: [sonner, cmdk, "@number-flow/react"] }
archetype: "(b) dashboard for / and /ingest · (c) consumer wall for /mine · inline approval gate on /case"
viewports: [390x844, 1024x768, 1440x900, 1536x790]   # 1536x790 = the recording (1080p at 125% zoom)
signature: "On /ingest a real CDSCO PDF page is read by Textract and each table row lifts off the page and lands in the feed as a notice (exists; keep)"
signature_visual: "Foil chip: batch and lot codes in Doto dot-matrix on brushed foil, the way they are printed on a strip"
artifact: "Claim letter PDF + evidence certificate whose seal stamps VERIFIED, then INVALID (signature does not match) after a one-byte tamper"
demo: { fixtures: "?demo=1 keeps its existing meaning (static fixtures) and is not used for recording", state_param: "?state= works on /kit and on every route, no flag needed", replay: ["/ingest?replay=<run_id>&speed=2&autoplay=1", "/?replay=poll"], reset: "palette or household menu only (no shortcut)", guest: true, household: "X-Household header on household endpoints only; id kept in localStorage" }
deviations:
  - "Next 15 + framer-motion stay (no Next 16, no <ViewTransition>): the app is live and static-exported; route change is an enter fade only (T-10)."
  - "Light only, no theme toggle: the source world is paper and light UI survives YouTube compression. v1 dark ledger retired."
  - "Retoken by migration, not aliases: v1 and v2 reuse names with different meanings, so the agent renames v1 variables first and then maps them (procedure in the agent prompt)."
  - "The hidden kit route is /kit: the App Router treats _folders as private and would 404 /_kit."
  - "Soft tints are fixed hex values mixed in OKLab. color-mix(in oklch) against the near-neutral canvas drifts hue toward yellow."
  - "Three families: Schibsted Grotesk (voice), Doto (foil chip only), IBM Plex Mono (hashes, ids, logs, identifiers in dense tables). Doto is the signature visual, so it earns the third slot."
  - "No texture beyond ruled table lines, no 3D. A manufacturer-state map is the first post-event addition, not this build."
  - "No auth. Household scoping (X-Household) replaces it so judges cannot change the demo wall."
  - "Case route is /case/?id=<case_id> (static export cannot pre-render unknown ids)."
  - "DESIGN.md `accent` is CSS `--primary` in code: shadcn already uses `--accent` for hover surfaces."
---

# UI-SPEC — RecallIndia

Supersedes `prompts/P06b-best-ui-pass.md`. Tokens and component styling live in `DESIGN.md`; this file says where everything sits, every state, and what moves.

## 0. Idea brief

- **User and moment:** the person in an Indian household who buys medicines for everyone (often for parents), at home or at the pharmacy counter, phone in one hand and a strip in the other. Second viewer: a judge watching a 3-minute YouTube video on a laptop, sometimes a phone.
- **Core loop verb:** check. Register a thing once; it is checked against every regulator notice, now and every time a new notice lands.
- **Hero objects:** the regulator's own table row (CDSCO NSQ row 12, NHTSA 24V436000) and the batch code on the strip.
- **World inventory:** CDSCO's monthly NSQ table (PDF and portal), the foil back of a blister strip with a dot-printed batch code, a red "Not of Standard Quality" rubber stamp, a pharmacy bill with the purchase date, a printed gazette on newsprint, a complaint letter sent by registered post.
- **Moving data without a click:** header counter and last-poll clock (pollers every 15 min, CDSCO daily), feed rows landing, rows lifting off the PDF on `/ingest`, item cards in "checking" state, the case pipeline advancing after approval.
- **Wow moment:** a government PDF page turns into feed rows, and a few seconds later one of those rows flips a card in your house red.
- **Artifact:** a claim letter PDF and an evidence certificate (S3 Object Lock + KMS signature) that stamps VERIFIED, then INVALID (signature does not match) when one byte is changed.
- **Judging:** video only, ≤3:00, 1080p on YouTube. Tracks: Ship It (live AWS URL) + Best UI. Idea & Impact · Built on AWS · Learning · Execution (completeness over polish) · Demo video.
- **Budget:** one working day including P08/P09, recording and submission. Everything below is ordered so it can be cut from the bottom (see the agent prompt).

## 1. Demo script (≤3:00; VIDEO.md owns the exact timings and narration)

| t | Route | On screen | Must work |
|---|---|---|---|
| 0:00 | slide | Problem line with the CDSCO count from `/v1/stats` | — |
| 0:10 | `/ingest?replay=<run>&speed=2&autoplay=1` | a recorded run at 2×: PDF page left; rows get a box drawn on, lift off, land right; counter ticks; 5-step checklist ticks | C-07, T-03, T-18 |
| 0:35 | `/?replay=poll` | Counter hero, source pills with health, the last poll's rows landing (T-17), one row opened in the sheet | C-02, C-04, C-05, C-06 |
| 0:48 | `/mine` (own household) | Add a real strip: photo, word boxes draw on, batch morphs into a foil chip, check → CLEAR | C-14, C-11, C-10, T-06 |
| 1:03 | `/mine` | The FT5427 card: Check again → checking → flips red in place | C-10 alert, T-07/08 |
| 1:20 | `/case/?id=` | Outcome line, notice record with our highlight, Approve claim letter, pipeline advances, seal fills, letter rises, VERIFIED, tamper → INVALID, verify again | C-15…C-19, T-09, T-11…T-14 |
| 1:52 | `/mine` | Near-miss card: Yours over Listed, one character underlined, dismissed with the reason | C-10 near-miss, C-11 |
| 2:04 | `/mine` | Vehicle card matching NHTSA 24V436000 by make, model and year | C-10 alert, C-12 |
| 2:14 | `/api` | Try-it console runs a real query; curl line; JSON | C-21 |
| 2:27 | slide | Architecture | — |
| 2:39 | slide | Live URL + repo | — |

## 2. Screen inventory

| id | route | purpose | entered from | primary action | states |
|---|---|---|---|---|---|
| S0 | `/kit` (+ `/kit/og`) | every component in every state; brand at 16/32/128; type scale; OG canvas | typed URL only (noindex) | — | — |
| S1 | `/` | the feed of every notice | rail, ⌘K, logo | open a notice (row click) | loading, ready, new-rows, filtered-empty, error |
| S2 | `/ingest` | watch a CDSCO PDF become notices | rail, ⌘K, feed callout | Run ingest (or Replay) | idle, running(step n), done, failed(step), replay, pdf-fallback |
| S3 | `/mine` | the household's things and their status | rail, ⌘K, feed callout | Add a thing | demo-readonly, own, first-run-empty, filtered-empty, error, checking |
| S4 | `/case/?id=` | one match: proof, approval, evidence, letter | alert card "Open case", ⌘K | Approve claim letter | no-id, loading, waiting, approving, sealing, writing, verifying, verified, invalid, rejected, expired, error, demo-readonly |
| S5 | `/api` | public API reference with a live console | rail, ⌘K | Run request | idle, running, ok, error |
| S6 | `/404` | wrong address | anywhere | Go to the feed | — |

Global: C-01 AppShell, C-03 HouseholdPill, C-22 CommandPalette, C-25 Toaster, C-26 SoundToggle.

## 3. Flow map

```
S1 --row click--> NoticeSheet --"Check my things against this"--> S3(checking)
S1 --callout "Check what you own"--> S3
S2 --Replay/Run--> S2(running) --done--> S2(done) --"See them in the feed"--> S1(filtered: CDSCO, month)
S3(demo-readonly) --"Make my own copy"--> S3(own, checking ×15) --results--> S3(own)
S3 --"Add a thing"--> AddThingSheet --photo--> ScanConfirm --"Check this batch"--> S3(card checking) --alert--> card flips --"Open case"--> S4(waiting)
S4(waiting) --Approve--> S4(approving→sealing→writing→verifying) --ok--> S4(verified) --Tamper test--> S4(invalid) --Verify again--> S4(verified)
S4(waiting) --Reject--> S4(rejected) ; S4(waiting) --24 h--> S4(expired)
any --⌘K--> CommandPalette --item--> target route
```

## 4. Screens

### Shell (every route)
```
≥1024                                                     1440 × 900
┌ Rail 216 ─────────┬ Header 56: counter (hidden on /) · · · HouseholdPill · ⌘K ┐
│ lockup h24 @20,20 │                                                            │
│ Feed        (rss) │  content: padding 32, max-width 1200, left-aligned         │
│ Ingest (g-notice) │                                                            │
│ My things (g-strip│                                                            │
│ API      (braces) │                                                            │
│ …                 │                                                            │
│ ⌘K Search or jump │                                                            │
│ sound on/off      │                                                            │
└───────────────────┴────────────────────────────────────────────────────────────┘
```
- Rail: canvas, 1px line on the right, nav items 36px (C-01). Active item: surface-1 face, ink label, 2px accent indicator on the left edge of the item that slides between items (`layoutId="nav-ind"`, T-16). This is a moving selection indicator, not a coloured stripe on a card.
- 640–1023: rail becomes a 56px top bar: lockup h20 left; nav as four icon+label tabs centre; ⌘K right. Header counter moves under it (40px strip).
- <640 (390): top bar 52px (mark 24 + wordmark 18px + ⌘K icon button 44×44). Bottom tab bar 56px + `env(safe-area-inset-bottom)`, four tabs, icon 20 + label 12. Header counter becomes the first line of each page.
- `<meta name="theme-color" content="#ECEEEA">`. Skip link kept.

### S1 Feed `/`   (blueprint b)
Regions in reading order at 1440 (content x 248–1408, width 1160):
1. **Hero** (y 88): C-02 LiveCounter in display-xl: `{total} notices` + body-lg ink-muted `from CDSCO, CPSC, NHTSA and openFDA · last poll {n} min ago`. Height 112.
2. **Callout** (y 216, 48 high, surface-1, 1px line, radius md, padding 12/16): g-notice 20 + `{count} drug samples failed CDSCO quality tests in {MON-YYYY}.` + link `Check what you own →` (accent, to `/mine`). Numbers from `/v1/stats` (`cdsco_latest: {month, count}`; add it if missing). Hidden if the field is missing, never a placeholder.
3. **Source pills** (y 288): C-04 row, gap 8: All · CDSCO · CPSC · NHTSA · openFDA, each with count and health dot.
4. **Feed table** (y 336): C-05, full width. Columns: source 96 · product (flex, min 320, 2 lines max) · batch/model 168 (mono-md; `+2` if more) · failed test / hazard (flex, 1 line, ellipsis) · published 112 (right, tabular). Header row 36, surface-1, label-caps ink-muted, sticky top 0 inside the page scroll. Rows 44 (dense 36 at ≥1440 when > 30 rows visible). Footer: `Load 50 more` secondary button (cursor pagination; no infinite scroll so recordings are deterministic).
- First 10 s: counter already populated (build-time snapshot + live refetch), newest rows visible, relative poll time current.
- Data: live `/v1/stats` every 20 s, `/v1/notices?limit=50` + `?seen_since=<newest first_seen_at>` every 20 s (add the parameter if missing; `published_at` misses newly ingested old notices). `?replay=poll` (no flag needed) re-inserts the last poll's newest 3 rows with T-17, labelled `Replaying the {hh:mm} poll` in the header.
- 390: hero numeral 44px; callout wraps to 2 lines; table becomes a list: row = source chip + date line (12px), product (16px, 2 lines), batch mono line; 72px per row.

### S2 Ingest `/ingest`   (existing; retoken + harden)
Keep the current structure (it works): title + subtitle + `Run ingest` (primary) top-right; 5-step checklist strip (5 equal cells, 72 high, surface-1, 1px line rules between cells); PDF pane (flex 7, 480 high) | Notices pane (flex 5, 480 high); Recent runs table below.
- Title copy stays: `A CDSCO alert PDF, becoming the feed`.
- PDF pane: surface-1 paper, 1px line border, radius none. The page renders with pdf.js **legacy build** (see agent prompt, Phase 0). If pdf.js throws, show the poster PNG of the same page (`/ingest/<pdf>-p<n>.png`, pre-rendered and committed) and keep running the dissolve over it; caption changes to `Showing a pre-rendered copy of page n`. Never show a raw exception string.
- Row lift: the source row first gets a box drawn on (T-03a, accent 2px, 200 ms), then the existing clone flight to the notices pane (T-03). Landed rows are C-05 record rows (radius 0), newest on top.
- Notices pane header: `Notices · CDSCO NSQ {Month YYYY}` + counter `{n} notices` (NumberFlow, headline-lg) + `{rows} rows read`.
- Done state: a single line under the panes: `{rows} rows → {n} notices · {new} new · {s} s` + link `See them in the feed →` (to `/?source=cdsco_nsq&month={MON-YYYY}`; add `month` to `/v1/notices` if missing).
- First 10 s in the video: `?replay=<run_id>&speed=2&autoplay=1` starts on load after 600 ms.
- 390: panes stack (PDF 360 high, then notices); checklist becomes a horizontal scroller of 5 steps with the current step snapped into view.

### S3 My things `/mine`   (blueprint c on desktop grid)
1. **Outcome line** (y 88): C-08. `{n} things you own are on a notice` in display-xl (one line at 1440; wraps at 1024). Sub: `{items} things · checked against {n} sources · {hh:mm}` body-lg ink-muted. Right-aligned on the same row at ≥1024: `Add a thing` (primary; the only primary on this view).
2. **Household bar** (y 208, 40): C-03 inline variant: in demo `You're looking at the demo household. It's read-only.` + secondary `Make my own copy`; in own household nothing (the header pill is enough).
3. **Filter pills** (y 264): C-09: All · On a notice · Needs you (hidden at 0) · Near misses · Clear, each with its count.
4. **Item wall** (y 312): CSS grid `repeat(auto-fill, minmax(360px, 1fr))`, gap 16. Order: alert, needs-you, near miss, clear; newest first inside each. Alert cards span 2 columns at ≥1024. Card min-height 200. A card that changes face flips in place first; the wall re-sorts 600 ms later.
- First 10 s: demo household shows 2 red cards (Paracetamol FT5427, Jeep Compass 2022) at the top.
- Data: `GET /items` (X-Household), `GET /cases?household=` for status; poll every 2 s while any card is checking, else 30 s.
- 390: one column, alert cards full width; `Add a thing` becomes a sticky bottom CTA (inset 16, above the tab bar).

### S4 Case `/case/?id=`
```
≥1440: main 760 (x 248)                          aside 360 (x 1048), sticky top 88
┌ crumb: My things / Paracetamol Tablets IP 650mg ┐ ┌ Case file ───────────────┐
│ C-15 CaseHeader: status chip · outcome line     │ │ status chip              │
│      foil chip (lg) · dates line                │ │ C-17 PipelineSteps (vert)│
│ C-13 NoticeRecord (the regulator's row)         │ │ item · notice id · source│
│ C-12 RangeBar                                   │ │ Show work ↓              │
│ C-16 ApprovalGate (inline)                      │ └──────────────────────────┘
│ C-18 ClaimLetterPreview (after approval)        │
│ C-19 EvidenceCertificate + seal + tamper test   │
│ C-20 ShowWork (collapsed)                       │
```
- <1440: one column; the aside becomes a horizontal PipelineSteps row under the header (C-17 horizontal), details move into ShowWork. After Approve, the active step scrolls into view (not under reduced motion).
- First 10 s: outcome line, the notice row with our highlight, and the gate saying `Waiting for you`.
- Data: `GET /cases/{id}` every 1 s while status ∈ {approving, sealing, writing_letter, verifying}; otherwise once. `POST /cases/{id}/approve|reject`; `GET /cases/{id}/claim` (presigned); `GET /cases/{id}/verify-evidence[?tamper=1]`.
- No `id`: empty state (exists) `No case chosen` / `A case opens from an item that is on a notice.` / `Back to my things`.
- Demo household case: a fixed id, already approved and sealed by the seed, readable from any household, so a judge sees the finished letter and certificate; the tamper test works (read-only, never stored); Approve is replaced by the demo notice (C-16 demo-readonly).

### S5 API `/api`
Two columns at ≥1024: **Endpoints** 440 | **Console** flex (gap 32). Replace the current "reference goes here" placeholder entirely.
- Endpoints: `GET /v1/notices` (params: source, since, q, limit, cursor), `GET /v1/notices/{id}`, `GET /v1/stats`, `GET /v1/sources` (the provenance registry). Each: one-line purpose, params table (name · type · example), response fields list. No auth, CORS open, rate limit line.
- Console (C-21): source select + since date + q input + `Run request` (primary). Shows the curl line (mono, copy button), status + ms + count, and the JSON (mono-md, keys ink-muted, strings ink, numbers accent; max-height 480, scroll).
- Below both: **Sources** table from `/v1/sources` (id · name · kind · confidence · cadence · last success).
- 390: console first, endpoints below.

### S6 404
Keep current copy; add the g-notice glyph (32) above; `There is no page at this address` (headline-md), `The link is wrong or the page moved. The feed, your things and the API are one click away.`, secondary `Go to the feed`.

### S0 `/kit`
One long page, sections in this order: brand (mark candidates 16/32/128, lockup, favicon preview on light and dark tab), colours with contrast numbers, type scale, every component block from §5 rendered in every state side by side (each state also reachable via `?state=`), choreography buttons that replay each T-row, and `/kit/og` (a bare 1200×630 page used to screenshot `public/og.png`; layout in §9). `robots: noindex`, not in nav or palette.

## 5. Components

Every block: states are reachable at `/kit?state=<state>` and on the real route with `?state=`. "Tokens" name DESIGN.md roles. **In code, "accent" in this file means `--primary`** (`bg-primary`, `text-primary`, `ring-ring`); never use Tailwind `accent` utilities for it, because shadcn uses `--accent` for hover surfaces.

Status and face map (one source of truth for names):

| case decision / status | item face | `?state=` | card label | case chip |
|---|---|---|---|---|
| clear | clear | clear | CLEAR | — |
| matching | checking | checking | CHECKING | — |
| hold → `needs_you` | needs-you | needs-you | NEEDS YOU | — |
| dismiss → `near_miss` | near-miss | near-miss | NOT ON THE NOTICE | — |
| alert + `waiting_approval` | alert | alert | ON A NOTICE | WAITING FOR YOU (warning, pulsing) |
| `approving` / `sealing` / `writing_letter` / `verifying` | alert | alert | ON A NOTICE | APPROVING / SEALING EVIDENCE / WRITING LETTER / VERIFYING |
| `verified` | alert | alert | ON A NOTICE | VERIFIED (success) |
| `rejected` / `expired` | alert | alert | ON A NOTICE | REJECTED / EXPIRED (ink-muted) |
| `error` | error | error | — | ERROR (warning) |
| INVALID after a tamper test | — | — | — | seal only, client-side (danger) |

### C-01 AppShell   (base: existing layout, retokened)
Purpose: find any screen in one move and always see that the data is live.
Placement: rail left 216 / top bar / bottom tabs per §4 Shell.
Tokens: rail bg canvas, 1px line right; nav item nav-item/nav-item-active; icons Lucide 20 (rss, braces, command, volume-2/volume-x) + custom g-notice, g-strip.
States: nav idle ink-muted · hover surface-2 + ink (150 ms) · active surface-1 + ink + accent indicator · focus-visible 2px accent ring inset.
Motion: T-16 indicator slide; T-10 route enter.
Keyboard: `g f` feed, `g i` ingest, `g m` my things, `g a` api (no animation, instant), ⌘K / Ctrl+K palette.
Acceptance: 390 shows bottom tabs, no horizontal scroll; 1024 and up show the rail; 768 shows top tabs.

### C-02 LiveCounter   (base: @number-flow/react)
Purpose: prove the feed is live without saying "live".
Placement: S1 hero (display-xl) and header on other routes (numeral Schibsted 800 20px tabular + body-sm).
Content: `{total} notices · {n} sources · last poll {n} min ago`, computed from the newest `last_success_at` and refreshed every 30 s; tooltip shows the exact time in IST.
States: loading (skeleton 240×64) · ready · updating (number ticks, NumberFlow default spring) · stale (last poll older than 2× cadence: clock turns warning, tooltip `Pollers late: last success {time}`) · error (`Counts unavailable` ink-muted + retry icon button).
Motion: T-02. Tabular numerals.
A11y: `aria-live="polite"` only for the total, throttled to one announcement per minute.

### C-03 HouseholdPill   (custom)
Purpose: show whose things these are and keep the demo wall safe.
Placement: header right, before ⌘K; inline banner variant on S3 (§4 S3 region 2).
Tokens: chip 28px, radius sm, surface-1, 1px line; label-md.
States: demo-readonly `Demo household · read-only` (g-strip 16) + menu item `Make my own copy` · creating `Copying {n} things…` (spinner leads, width locked) · own `Your household · {id4}` + menu: `Reset to the demo items`, `View the demo household` · error `Couldn't copy the demo household. Try again.`
Transitions: demo -COPY-> creating -OK-> own (toast `Your household is ready. {n} things are being checked.`) ; creating -FAIL-> error -RETRY-> creating ; own -RESET-> creating.
Data: `POST /households` → `{household_id}`; stored in localStorage `ri.household`; every API call sends `X-Household`. Missing header = demo.

### C-04 SourcePill   (base: shadcn Toggle)
Purpose: filter the feed by regulator and see if its poller is healthy.
Size: h32 (44 on touch), px12, gap 8, radius md; dot 6px leading; count body-sm ink-muted, tabular.
States: idle filter-pill · hover surface-2 · selected filter-pill-selected (accent-soft + accent) · focus ring · health dot success/warning/danger with tooltip `Healthy · last success {time}` / `Late · last success {date time}` / `Down since {time} · {short reason: timeout | HTTP 5xx | parse error}`.
Transitions: click toggles the `source` query param (history.replace); the table crossfades (T-04 variant, 150 ms).

### C-05 FeedTable + RecordRow   (base: table)
Purpose: read many notices fast; every row is one notice exactly as the regulator listed it.
Tokens: record-row; header surface-1 label-caps ink-muted; rules line; ids mono-md; source chip chip-source.
Build: a div grid with `role="table"/"row"/"cell"` (animating `<tr>` height is unreliable). States: loading (8 skeleton rows at real geometry) · ready · new rows (T-17) · hover surface-2 · focus-visible inset ring · selected (sheet open) surface-2 + 2px accent underline on the product cell · filtered-empty (C-23 no-results) · error (C-23 error, keeps the last good rows above it).
Keyboard: rows are buttons; ↑/↓ move, Enter opens the sheet, Esc closes.
Acceptance: `?state=loading|new|empty|error`.

### C-06 NoticeSheet   (base: shadcn Sheet)
Purpose: everything about one notice without leaving the feed.
Placement: right, 560 wide (full width <640), shadow-2, radius lg on the left corners.
Content order: title (headline-md) · metadata row under it: source chip + confidence label (map in C-13) + published date · C-13 NoticeRecord · fields (dl, 2 columns: published, batches, model, failed test/hazard, lab, remedy) · `Open the regulator's page` (link, external icon) · curl for `/v1/notices/{id}` (mono, copy) · `Check my things against this` (secondary; own household only, else disabled with tooltip `Make your own copy of the demo household first`).
Motion: T-05 (450 ms ease-drawer in, 300 ms out); focus trapped; focus returns to the row.

### C-07 IngestStage   (existing; retoken + harden)
Purpose: watch one PDF become structured notices.
Parts: Checklist (5 steps: Fetch PDF · Extract tables · Normalise · Diff vs last run · Publish; each done/running/pending/failed with a one-line detail, running step shows `Extracting tables… page {n}/{total}`), PdfPane, NoticesPane, RunsTable (run id mono · month · engine chip `textract`/`pdfplumber` · `{rows} rows → {n} notices · {new} new · {s} s · {hh:mm}` · `Replay`).
States: idle · running(step n) · done · failed(step) (the failing step turns warning with the reason and `Retry from this step`) · replay (header chip `Replay of {run_id} · {speed}×`) · pdf-fallback (poster PNG).
Motion: T-03, T-03a, T-18, T-02 on the counter.
Perf: only transform/opacity/clip-path; ≤40 rows animate at once, the rest land without flight; 60 fps at 4× CPU throttle.

### C-08 OutcomeLine   (custom)
Purpose: answer "is anything I own affected?" before anything else.
Tokens: display-xl ink (numerals tabular); sub body-lg ink-muted.
Copy: n≥1 `{n} thing(s) you own {is|are} on a notice` · n=0 `Nothing you own is on a notice` + sub `{items} things · checked against {sources} sources · {hh:mm}` · checking `Checking {items} things against {sources} sources… {done}/{items}` (counts from real results).
Motion: the numeral uses NumberFlow; the sentence crossfades (150 ms) when its form changes.

### C-09 FilterPills   (base: shadcn ToggleGroup)
Same styling as C-04 without the dot. Counts in body-sm, tabular. A pill with 0 items is hidden (except All). Selection writes `?filter=`.

### C-10 ItemCard   (custom; the core of S3)
Purpose: one thing you own, and whether any regulator has flagged it.
Placement: S3 wall; alert spans 2 columns at ≥1024.
Size: min-h 200, padding 20, radius md, gap 12 between blocks; icon 20 (g-strip medicine, Lucide car vehicle, Lucide plug appliance, Lucide package other).
Anatomy (top→bottom): status label (label-caps) + kind icon right · title (title) · meta line (body-sm ink-muted: `{brand} · bought {purchase_date}`) · C-11 FoilChip (batch/lot/serial/model year) · face body · actions row (right-aligned).
Faces (decision → face → `?state=` → label: see the table at the top of §5):
- **clear**: item-card. Label `CLEAR` success. Body `No match in {n} sources as of {hh:mm}`. Action ghost `Check again`.
- **checking**: surface-1. Label `CHECKING` ink-muted with a 6px pulsing accent dot. Body = mini checklist driven by `case.steps` / `audit` from the API, never by timers: `Finding candidates` · `Checking the batch against the listed batches` · `Deciding`. g-strip draws on (pathLength loop, 1.2 s) while running.
- **needs-you** (hold): item-card-hold (warning-soft face, no border). Label `NEEDS YOU` warning. Body = the case's `reason` in plain words. Only when the reason is an unreadable batch is the FoilChip editable (C-11), with secondary `Confirm batch` (`PATCH /items/{id}`, then re-check).
- **near-miss** (dismissed): item-card with 1px line-strong border. Label `NOT ON THE NOTICE` success. Body: two md FoilChips stacked, `Yours` above `Listed` (the listed batch closest to yours by edit distance), left-aligned so the differing column lines up; the differing characters are underlined (C-11 diff). Then `Same medicine and maker as {source} {month} row {n}, different batch. Dismissed.`
- **alert**: item-card-alert (danger face, accent-ink text). Label `ON A NOTICE`. Body: outcome sentence (title size) `Failed CDSCO quality test, {month} alert, row {n}` / `Matches NHTSA recall {campaign} by make, model and year`; FoilChip on the red; C-12 RangeBar in its on-danger variant; a surface-1 inset panel (radius sm, padding 12) with the source text (C-13 prose excerpt, or the row's `raw_excerpt` verbatim) and the mark highlight; source line body-sm `{source} {month} alert · row {n} · published {date}`. Actions: `Open case` (surface-1 fill, ink label, radius md, h40) + ghost `Check again` (transparent, accent-ink label, 1px accent-ink border at 60%).
Demo household: `Check again` and `Confirm batch` are hidden (read-only); `Open case` stays.
States on any face: hover (fine pointer) border line-strong (alert: danger-hover face), 150 ms · focus-visible 2px ring (on alert: surface-1 ring) · loading skeleton at card geometry · error `Couldn't check this item ({reason}). Check again.` with the retry.
Transitions: clear|needs-you|near-miss -CHECK-> checking -RESULT-> flip in place to the result face; 600 ms after the flip the wall re-sorts and re-spans (alert to the top, 2 columns) with a layout animation; checking -TIMEOUT 30 s-> error; alert -OPEN-> S4.
Motion: T-01 when a card is created (from C-14 or a household copy), T-07 flip, T-08 alert arrival.
A11y: `article` with `aria-labelledby` = title; status change announced politely: `{item} is on a {source} notice.`
Data: item + its latest case (`GET /items`, `GET /cases`, both scoped by `X-Household`).
Acceptance: `?state=clear|checking|needs-you|near-miss|alert|error` at 390 and 1440.

### C-11 FoilChip   (custom; the signature visual)
Purpose: show the batch code the way it is printed on the strip, so matching reads as matching the physical thing.
Tokens: foil-chip / foil-chip-lg; gradient and inset edges per DESIGN.md; Doto 900 (`--ff-foil`); letter-spacing .06em; radius sm. Doto is monospaced (≈0.6em per character): 10 characters fit in ≈150 px at md and ≈245 px at lg.
Sizes: md h32 (22px code) in cards, rows and the near-miss stack; lg h48 (36px) in the case header. Never smaller than md.
States: static · editable (needs-you face, ScanConfirm): on fine pointers each character is a button that opens a 1-character input in place; on touch, tapping the chip opens one text input for the whole code (IBM Plex Mono 18px, ≥44 high) so characters can also be inserted or deleted; Enter confirms · diff: the differing characters get `box-shadow: 0 3px 0 var(--primary)` under the glyph on both chips, plus visually hidden text `Character {i} differs: {yours} versus {listed}` · on-danger: identical chip (foil reads well on red; do not recolour).
Motion: T-06 belongs to C-14: the Textract word morphs into the chip via `layoutId="batch-<item>"`.
A11y: `aria-label` = `Batch ` + the characters separated by spaces.

### C-12 RangeBar   (custom)
Purpose: show where your unit falls against what the notice lists.
Variants:
- **discrete** (batch lists): up to 8 listed batches as text chips (IBM Plex Mono 13px, surface-1, radius sm, h24); yours is outlined 2px `--primary` if listed, else appended as `yours: {batch}` in ink-muted. **On danger:** chips stay surface-1 with ink text, yours outlined 2px ink, the `yours:` line in accent-ink.
- **range** (model years, serials, VIN ranges): 8px track surface-2, listed span ink, your marker 2×16 px ink, label under it `{value} · inside {from}–{to}` (or `outside`). **On danger:** track accent-ink at 30%, span accent-ink 100%, marker ink with a 2px surface-1 halo, label accent-ink.
Motion: T-09 (span reveals by clip-path, 300 ms ease-out; marker drops y −6→0, 150 ms, after).
Acceptance: `?state=discrete-in|discrete-out|range-in|range-out`, each also on a danger face.

### C-13 NoticeRecord / SourceExcerpt   (custom)
Purpose: show the evidence as the regulator published it, with our highlight on it.
Variants:
- **Row** (CDSCO rows): a mini table built from the structured fields, headers Drug · Batch · Mfg · Exp · Manufacturer · Failed test · Lab · Month (`product`, `batches`, `mfg_date`, `exp_date`, `brand`, `hazard_or_failed_test`, `lab`, `row_ref.month`); one record-row-matched row (mark) with a 2px `--primary` underline on the matched cells (drug, batch). Under it `As published:` + `raw_excerpt` verbatim (body-sm ink-muted). Never split `raw_excerpt` into columns.
- **Prose** (CPSC, NHTSA, openFDA): surface-1 panel, body-md, the sentence that matched wrapped in `<mark>` (mark background, 2px radius).
- PDF crop only if a notice carries `row_ref.bbox` (normalised page coordinates); not required for this build.
Always under it: source line `{source} {month} alert · row {n} · published {date} · {confidence label}` + `Open the regulator's page`. Confidence labels: primary-official → `Official source`, primary-scraped → `Official page, scraped`, fixture → `Sample data`.
Motion: T-09a (mark background scales x 0→1 from the left, 300 ms, first view only).

### C-14 AddThingSheet + ScanConfirm   (base: shadcn Sheet + custom)
Purpose: register something in under 20 seconds.
Placement: right sheet 560 (full-screen <640).
Steps: kind (4 large choices: Medicine strip · Vehicle · Appliance · Something else) → details. Medicine: `Take or upload a photo of the strip's back` (file input with `capture="environment"`) or `Type the batch instead`. Vehicle: make, model, model year (+ optional VIN). Appliance: brand, model, serial (optional). Every kind: optional `Bought from` (shop or dealer name) and `Bought on` (date); the letter uses them.
ScanConfirm states: empty · uploading (`Uploading photo… {pct}%` from real upload progress) · reading (`Reading the strip with Textract…`; photo shown with a shimmer line) · candidates (Textract WORD boxes draw onto the photo (T-06), the most likely batch box is accent 2px, others line 1px; the batch text flies into a FoilChip-lg under the photo) · confirmed · edited · failed (`Couldn't find a batch number. Retake the photo closer, or type it.` + both actions).
Primary: `Check this batch` (the sheet's one primary). On submit: the sheet closes, the new card appears in checking state at the top of the wall (T-01), and the flip follows.
Data: presigned upload → `POST /scan` → `{words:[{text, bbox, confidence}], batch_candidates:[…]}`; `POST /items`.

### C-15 CaseHeader   (custom)
Purpose: state the outcome of the case in one sentence.
Layout: crumb row `My things / {item}` with the status chip right-aligned on the same row (not above the headline); outcome line (headline-lg, max 2 lines); FoilChip-lg with the batch (vehicles: a model-year chip); dates line body-md `Bought {purchase_date} · {source} notice published {published_at} · {n} days after the notice` (last part only when positive).
Status chips: the status table at the top of §5.
Outcome copy: medicine sold after the notice → `You were sold this strip {n} days after CDSCO flagged it.`; medicine otherwise → `Your strip's batch is on CDSCO's {month} list of drug samples that failed quality tests.`; vehicle → `Your {year} {make} {model} matches NHTSA recall {campaign} by make, model and year.` with sub-line `NHTSA covers US vehicles. Confirm with your dealer using the VIN.`

### C-16 ApprovalGate   (base: shadcn Card + Button; inline, never a modal)
Purpose: the human decides; nothing is sealed or written without this click.
Placement: S4 main column after C-12. surface-1, 1px line-strong, radius md, padding 24.
Content: title `Approve the claim letter` · body `RecallIndia will seal a copy of this notice as evidence, then write a letter to the {seller kind: pharmacy | dealer | seller} asking for {remedy: a refund or a replacement | a free repair} that cites it. Nothing is sent; you download the letter.` · actions: primary `Approve claim letter` + ghost `Reject`.
States: waiting (chip pulsing) · approving (label morph `Approving…`, spinner leads, width locked, `aria-busy`) · approved (T-11: the card collapses to a 48px receipt line `Approved at {time} · the pipeline resumed` with a check that draws on) · rejected (receipt `Rejected at {time} · no letter was written`) · expired (`This approval expired after 24 hours. Check the item again to start a new case.`) · error (`Couldn't reach the approval step ({reason}). Try again.`, buttons kept) · demo-readonly (buttons replaced by `This is the demo household's case, already approved. Make your own copy to approve one yourself.` + secondary `Make my own copy`).
409 from the API: render the returned case status (approved → approved receipt, rejected → rejected receipt, expired → expired), never an error.
Keyboard: Enter/Space; no global shortcut (deliberate act).
A11y: live region `Approved. Sealing the evidence.`

### C-17 PipelineSteps   (custom; dynamic checklist)
Purpose: show what the system is doing after approval, step by step.
Steps: Approve · Seal evidence · Write letter · Verify signature (the letter cites the sealed evidence). Each: dot 8 (pending line-strong, running accent pulsing, done success with check draw-on, failed warning) + label + duration (`{s} s`).
Variants: vertical in the aside (≥1440), horizontal row (<1440).
Motion: T-18. Updates within 100 ms of the status poll.

### C-18 ClaimLetterPreview   (custom)
Purpose: the artifact you walk away with.
Placement: after the gate. Writing skeleton while status = writing_letter; the page once the letter exists (verifying or later). A paper page: surface-1, radius none, 1px line, no shadow, width 640 (100% on mobile), padding 40/48, height capped at 360 px with an 80 px fade mask at the bottom (the full letter is the PDF).
Content (same fields as the PDF): To `{seller name}` if the user gave one, else `To the {seller kind}`; date; subject `Refund or replacement: {product}, batch {batch}` (vehicles: `Free repair under recall {campaign}: {year} {make} {model}`); the first two paragraphs. No bracketed blanks anywhere, in the preview or the PDF.
Actions: secondary `Open the letter (PDF)` (presigned GET, new tab) + ghost `Download` (presigned GET with `ResponseContentDisposition=attachment`).
States: writing (skeleton lines at paragraph geometry + `Writing the letter…`) · ready · error (`The letter couldn't be generated ({reason}). Try again.`).
Motion: T-12 (y 16→0, opacity 0→1, 280 ms ease-enter).

### C-19 EvidenceCertificate + Seal + TamperTest   (custom; the artifact moment)
Purpose: prove the notice we relied on can't be quietly changed.
Placement: after C-18. certificate component: surface-1, radius none, 1px line-strong, padding 24; seal 144 top-right, overlapping the border by 16 px.
Fields (dl; values mono-sm, labels body-sm): Snapshot `{snapshot_key}` (version `{version_id}`) · SHA-256 (64 hex in 4 groups of 16) · Signed with `{key_alias or key_id}` · `RSASSA_PKCS1_V1_5_SHA_256` · Signed at · Locked until `{retain_until}` (S3 Object Lock, governance mode) · Checked at.
Footnote body-sm ink-muted: `The snapshot is locked for 30 days (S3 Object Lock) and its SHA-256 is signed with an AWS KMS key. Change one byte and the signature no longer matches.`
Actions: secondary `Run tamper test` · after invalid: secondary `Verify again`.
Seal: SVG component (§9); ring text label-caps at ≥13.3 viewBox units: `S3 OBJECT LOCK · KMS SIGNED ·` / `SIGNATURE DOES NOT MATCH ·`; centre word `VERIFIED` (success) or `INVALID` (danger).
Seal states follow the server status: sealing (ring draws on, 600 ms loop) → sealed (fields filled, ring held while the letter is written) → verifying (`Checking the signature…`, seal at 40% opacity) → verified (T-13 stamp + thunk).
Tamper test and Verify again are client-only: `GET /cases/{id}/verify-evidence[?tamper=1]` never writes the case, so a judge's tamper test never changes what the next visitor sees.
Tamper result (T-14): a block slides in under SHA-256: `Changed byte {index}: 0x{before} → 0x{after}` and `Recomputed: {full hash}` with a `does not match` label in ink; only the seal turns red (INVALID via T-13).
Transitions: sealing -SIGNED-> sealed -LETTER_DONE-> verifying -OK-> verified -TAMPER-> verifying -FAIL-> invalid -VERIFY-> verifying -OK-> verified; any -ERROR-> error `Couldn't reach KMS to verify ({reason}). Try again.`
A11y: live region `Signature verified.` / `Signature does not match: the snapshot was changed.`
Data: case fields + `GET /cases/{id}/verify-evidence[?tamper=1]` → `{valid, sha256, recomputed_sha256, flipped_byte_index, byte_before, byte_after, signed_at, key_id, key_alias, checked_at}`.

### C-20 ShowWork   (base: shadcn Collapsible)
Purpose: full audit without cluttering the default view.
Closed: ghost `Show work` with chevron. Open: verification chain (candidates found → quote located in the source → batch/range check → decision with the rule that fired), audit trail table (time · step · detail, mono-sm), raw case JSON (collapsed code block). Remembered per session.

### C-21 ApiConsole   (custom)
Purpose: prove the feed is a real public API in one click.
Parts: form (source select, since date, q, limit 5) · primary `Run request` · curl line with copy · result meta `{status} · {ms} ms · {n} notices` · JSON viewer.
States: idle (shows the default curl, empty result) · running (button spinner, meta `Requesting…`) · ok · error (`The API returned {status}. Try again in a moment.`) · copied (copy icon → check 1.2 s).

### C-22 CommandPalette   (base: cmdk)
Rows: Go to feed · Go to ingest · Go to my things · Go to API · Filter feed: CDSCO/CPSC/NHTSA/openFDA · Add a thing · Open case: <each alert case> · Replay the last ingest · Make my own copy / Reset my household · Sound on/off. Each row shows its shortcut (kbd).
Opens instantly (no animation), fades out 150 ms. Active row accent-soft.

### C-23 EmptyState   (custom)
Three types, each = glyph 32 (ink-muted) + title (title) + one sentence + one action, centred in its region:
- first-run (own household, 0 items): g-strip · `Nothing registered yet` · `Add a medicine strip, a vehicle or an appliance and we'll check it against every notice.` · `Add a thing`.
- no-results (filters): g-notice · `No notices match these filters` · `Try all sources.` · `Clear filters`.
- error: Lucide cloud-off · `Couldn't load notices` · `The API didn't answer ({reason}). Your filters are kept.` · `Try again`.

### C-24 Skeletons
surface-2 blocks shaped exactly like the final layout (table rows, cards, certificate fields); 1.5 s linear shimmer; static under reduced motion. Shown only after 200 ms; once shown, kept ≥400 ms. No spinners except inside buttons.

### C-25 Toaster   (sonner)
Bottom-right (bottom-center above the tab bar on mobile), toast component tokens, 4 s. Used for: alert found (with `Open case`), household ready, copy done, errors that aren't tied to a region. One toast per task, updated in place (`toast.promise`).

### C-26 SoundToggle
Rail footer / palette. Lucide volume-2 / volume-x, 32×32 icon button, tooltip `Sound on` / `Sound off`. Default on; the AudioContext is created on the first user click. Stored in localStorage `ri.sound`. The only sound in the app is the stamp thunk (T-13): ~90 Hz sine with a 120 ms exponential decay + 30 ms band-passed noise click, gain 0.3, synthesized with Web Audio (no audio files).

## 6. Choreography

Tokens (add to `globals.css`):
```css
:root{
  --ease-out:cubic-bezier(.23,1,.32,1); --ease-in-out:cubic-bezier(.77,0,.175,1);
  --ease-drawer:cubic-bezier(.32,.72,0,1); --ease-enter:cubic-bezier(.05,.7,.1,1); --ease-exit:cubic-bezier(.3,0,.8,.15);
  --dur-press:120ms; --dur-hover:150ms; --dur-pop:200ms; --dur-modal:280ms; --dur-exit:150ms; --dur-drawer:450ms;
}
```
Framer: `const spring = { type: "spring", stiffness: 380, damping: 32 }` (the existing dissolve spring) for layout and flights; no bounce anywhere.

| id | trigger | from → to | what moves | pattern | timing / token |
|---|---|---|---|---|---|
| T-01 | card or row added by the user | absent → list | item enters y 8→0, blur 4→0, opacity 0→1; siblings shift by layout | list add | spring 380/32; stagger 40 ms, ≤300 ms total |
| T-02 | count changes | n → m | digits roll | number | NumberFlow default; tabular-nums |
| T-03 | ingest row extracted | PDF row → notices pane | row clone flies (existing); lands as a record row | shared flight | spring 380/32 (existing); ≤40 concurrent |
| T-03a | row about to lift | row → boxed row | 2px accent box draws around the source row | draw-on | pathLength 0→1, 200 ms, --ease-out |
| T-04 | PDF page change / filter change | content → content | crossfade with blur 3→0 | crossfade | 150 ms out, 210 ms in |
| T-05 | row click / sheet close | table → sheet | sheet slides from right; scrim ink 24% fades | drawer | 450 ms --ease-drawer in, 300 ms out |
| T-06 | Textract words returned (C-14 only) | photo → boxes → chip | word boxes draw on (≤12, 40 ms stagger); batch box turns accent; batch text morphs into FoilChip (`layoutId`) | draw-on + morph | 350 ms boxes; morph spring 380/32 |
| T-07 | match result | checking face → result face | card rotates Y 0→180 in place; faces swap at 90° (backface hidden); 600 ms later the wall re-sorts with layout | flip | 400 ms --ease-in-out, perspective 1000 px |
| T-08 | result = alert | alert face → alert face | one scale pulse 1→1.015→1; toast in | emphasis | 240 ms --ease-out; toast 400 ms |
| T-09 | range bar in view | empty → filled | listed span reveals left→right (clip-path); marker drops y −6→0 | reveal | 300 ms --ease-out, marker 150 ms after |
| T-09a | notice record first in view | plain → highlighted | mark background scales x 0→1 from the left | draw-on | 300 ms --ease-out, once |
| T-10 | route change | page → page | new page fades in with blur 3→0; no exit animation | enter fade | 210 ms --ease-out |
| T-11 | approve succeeds | gate → receipt | label morphs `Approve claim letter`→`Approving…`→`Approved`; gate height collapses to 48; check draws on | morphing label + layout | label 180 ms; layout spring 380/32; check 300 ms |
| T-12 | letter ready | skeleton → paper | paper rises y 16→0, opacity 0→1 | enter | 280 ms --ease-enter |
| T-13 | signature verified / invalid | nothing → seal | seal drops: scale 1.15→0.98→1, rotate −8°→−4°, opacity 0→1; thunk at impact (126 ms) | stamp (mechanical) | 180 ms, keyframes linear between stops |
| T-14 | tamper result | hash → mismatch | the changed-byte line and the recomputed hash slide down 8→0 with a `does not match` label; seal swaps to INVALID via T-13 | reveal + stamp | 200 ms --ease-out, then T-13 |
| T-15 | ⌘K | closed → open | none on open; 150 ms fade out on close | instant | — |
| T-16 | nav change | item → item | 2px indicator slides between rail items | layout | spring 380/32 |
| T-17 | poll lands new notices | — → top rows | rows below shift down by layout; new rows reveal with clip-path inset(0 0 100% 0)→inset(0) and y 8→0; mark background fades to surface-1 | list add + fade | layout spring 380/32; reveal 300 ms; background 2 s linear |
| T-18 | pipeline/checklist step done | running → done | dot becomes a check (pathLength 0→1); label ink-muted→ink | draw-on | 300 ms --ease-out |

Rules: animate only transform, opacity, clip-path and filter blur ≤4 px (plus background-color for T-17 and the hover colours). No `transition: all`. Hover effects only under `@media (hover:hover) and (pointer:fine)`. Keyboard-triggered actions change state without animation. `MotionConfig reducedMotion="user"`; under reduced motion every row above keeps opacity/colour changes only (flip → 150 ms crossfade; flight → rows fade in place; stamp → seal appears at rest, no sound).

## 7. State machines

**Case** (server `status`; the only states that are stored)
```
matching ─decided(alert)→ waiting_approval ─approve→ approving ─resumed→ sealing ─signed→ writing_letter ─letter_ok→ verifying ─ok→ verified
waiting_approval ─reject→ rejected
waiting_approval ─States.Timeout after 24 h (Catch → Lambda writes it)→ expired
any running step ─fail→ error(step) ─retry→ that step
matching ─decided(hold)→ needs_you ─confirm batch (PATCH /items/{id})→ matching
matching ─decided(dismiss)→ near_miss        matching ─decided(clear)→ clear
```
Guards for approve/reject: case exists → household comes only from the `X-Household` header and must own the case (else 404) → demo household → 403 `demo_read_only` → a DynamoDB conditional update `status = waiting_approval → approving` (`ConditionExpression`) before `SendTaskSuccess`; a failed condition → 409 with the current case. The UI renders any 409 from the returned status. Reads: demo cases (case, claim, verify-evidence) are readable from any household; own cases only with the matching header. Polling stops at verified, rejected, expired, error.

**Seal** (client only, never stored): `sealing → sealed → verifying → verified`; `verified ─tamper→ verifying ─fail→ invalid ─verify again→ verifying ─ok→ verified`.

**ItemCard**: `clear|needs-you|near-miss ─CHECK→ checking ─RESULT(x)→ flip in place → x → (600 ms) re-sort`; `checking ─30 s→ error ─retry→ checking`.

**ScanConfirm**: `empty ─file→ uploading ─uploaded→ reading ─words→ candidates ─confirm|edit→ confirmed ─submit→ (sheet closes; new card checking)`; `reading ─no batch→ failed ─retake|type→ empty|manual`.

**Household**: `demo ─copy→ creating ─ok→ own ─reset (POST /households/{id}/reset)→ creating`; `creating ─fail→ error ─retry→ creating`. Caps: 100 new households a day (`The demo is busy right now. Try again in a few minutes.`), 30 items and 5 approvals per household.

**Ingest run**: `idle ─run|replay→ fetching → extracting → normalising → diffing → publishing → done`; any step `─fail→ failed(step) ─retry→ that step`.

**Source health**: healthy (last success within 2× cadence) · late (2–3× cadence, or the last run errored) · down (no success in 3× cadence).

## 8. Copy deck

Rules: sentence case; buttons name the result; one name per action across the flow; numbers from data, never typed in; "failed CDSCO quality test", never "recalled", for NSQ rows; "no match in N sources as of HH:MM", never "safe".

| Where | String |
|---|---|
| Rail | Feed · Ingest · My things · API · `Search or jump` + ⌘K · Sound on / Sound off |
| Header | `{total} notices · {n} sources · last poll {n} min ago` · `Demo household · read-only` · `Your household · {id4}` · `Replaying the {hh:mm} poll` |
| S1 hero | `{total} notices` / `from CDSCO, CPSC, NHTSA and openFDA · last poll {time}` |
| S1 callout | `{count} drug samples failed CDSCO quality tests in {MON-YYYY}.` `Check what you own →` |
| S1 table | Source · Product · Batch or model · Failed test or hazard · Published · `Load 50 more` |
| S2 | `A CDSCO alert PDF, becoming the feed` · `Run ingest` · `Replay` · steps `Fetch PDF`, `Extract tables`, `Normalise`, `Diff vs last run`, `Publish` · `{rows} rows → {n} notices · {new} new · {s} s` · `See them in the feed →` · `Showing a pre-rendered copy of page {n}` |
| S3 | outcome lines per C-08 · `Add a thing` · `Make my own copy` · `You're looking at the demo household. It's read-only.` · filters `All`, `On a notice`, `Needs you`, `Near misses`, `Clear` |
| Card labels | `CLEAR` · `CHECKING` · `NEEDS YOU` · `NOT ON THE NOTICE` · `ON A NOTICE` |
| Card actions | `Check again` · `Open case` · `Confirm batch` (the first and last are hidden in the demo household) |
| Near miss | `Same medicine and maker as {source} {month} row {n}, different batch. Dismissed.` |
| Add sheet | `What do you want to check?` · `Medicine strip` · `Vehicle` · `Appliance` · `Something else` · `Take or upload a photo of the strip's back` · `Type the batch instead` · `Is this the batch?` · `Check this batch` |
| Scan errors | `Couldn't find a batch number. Retake the photo closer, or type it.` · `The photo is too large (max 8 MB).` |
| S4 | outcome lines per C-15 · `Approve the claim letter` · gate body per C-16 · `Approve claim letter` · `Reject` · `Approving…` · `Approved at {time} · the pipeline resumed` · `Rejected at {time} · no letter was written` · `Open the letter (PDF)` · `Download` · `Run tamper test` · `Verify again` · `Show work` |
| Pipeline | `Approve` · `Seal evidence` · `Write letter` · `Verify signature` |
| Certificate | labels `Snapshot`, `SHA-256`, `Signed with`, `Signed at`, `Locked until`, `Checked at`; footnote per C-19; seal words `VERIFIED` / `INVALID`; ring text `S3 OBJECT LOCK · KMS SIGNED ·` / `SIGNATURE DOES NOT MATCH ·`; tamper lines `Changed byte {index}: 0x{before} → 0x{after}`, `Recomputed: {hash}`, `does not match` |
| S5 | `Public API` · `Every notice on the feed, as JSON. No key needed.` · `Run request` · `{status} · {ms} ms · {n} notices` · `Copied` |
| Palette | per C-22; placeholder `Search pages, sources, cases…` |
| Toasts | `{item} is on a {source} notice.` + `Open case` · `Your household is ready. {n} things are being checked.` · `Letter ready.` |
| Errors | reasons come from the error kind (timeout, HTTP status, parse error), never a fixed string: `Couldn't load notices. The API didn't answer ({reason}).` + `Try again` · `Couldn't reach the approval step ({reason}). Try again.` · `Couldn't reach KMS to verify ({reason}). Try again.` |

## 9. Brand

Brand files are in `docs/brand/` once copied into the repo.

- **Mark (chosen: `brand/mark.svg`, candidate a-blister):** a blister card on the 48 grid (rounded rect 6→42, radius 8) with four pockets; three are punched through, one is filled NSQ red. It says "one of your things is on a notice". Reads at 16 px on light and dark tabs (checked in `brand/brand-sheet.png`). Rejected: a2-strip (too small at 16), b-monogram (strong but says nothing about the world), c-notice (busy at 16).
- **Wordmark (`brand/wordmark.svg`, outlined paths):** Schibsted Grotesk 800 at −0.03em; the lowercase i in "India" is dotless with a red circular tittle, the same red as the pocket. **Lockup (`brand/lockup.svg`):** card height 1.3× cap height, gap 0.5× card width, card centred on the x-height middle. Rail uses the lockup at 24 px high; the mobile top bar uses the lockup at 20 px (mark + wordmark).
- **Glyphs (`brand/glyphs/`):** g-strip (strip with two pockets) and g-notice (a row sliding out of a page), 24 grid, 2 px round strokes to match Lucide. Everything else is Lucide at 20 (16 inside buttons).
- **Favicon (`brand/favicon/`):** `icon.svg` (the only file with a prefers-color-scheme rule) → `<app dir>/icon.svg`; `favicon.ico` (16+32) → `<app dir>/favicon.ico`; `apple-icon.png` 180 → `<app dir>/apple-icon.png`, where `<app dir>` is the App Router folder that holds the root `layout.tsx`; `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` → the Next `public/` folder + manifest. `theme-color` goes in `export const viewport`, not `metadata`.
- **OG:** `brand/og-draft.png` shows the layout: lockup, `India publishes recalls as PDFs nobody reads.`, sub line, a red alert card with the FT5427 foil chip, footer `{total} notices · CDSCO · CPSC · NHTSA · openFDA` + `Live on AWS`. Build it as `/kit/og` from live data and screenshot to `public/og.png` (static export cannot run `opengraph-image.tsx` at request time); set `metadataBase` to the live URL so `og:image` is absolute.
- **Seal (`brand/seal.svg`, `brand/seal-invalid.svg`):** reference drawings for C-19.
- **Porting SVGs into the app:** rewrite each as a JSX component: fills and strokes use `currentColor` or CSS variables, text uses the next/font CSS variable (`font-family: var(--ff-display)`), ids come from `useId()`, and no `<style>` blocks or media queries (they leak to the whole page; in dark OS mode the mark's rule would turn it canvas-coloured on the canvas).

## 10. Don'ts (project-specific)

- No red outside the four uses in DESIGN.md. No "ALERT" in red text on a paper card; the whole face goes red instead. Failures (pipeline step, ingest step, form errors) use warning, not danger.
- No border-left stripes on cards, no eyebrow chips above headings, no glass, no glow, no grain.
- No placeholder copy anywhere a judge can reach ("goes here", "later build", "TODO", "coming soon"). Hide the element instead.
- No invented numbers; every count and date comes from the API.
- No "AI" sparkle or label: the pipeline is rules and AWS services; say what each step does.
- No modal for approval; no auto-advance past the gate.
- No Doto for words, no Plex Mono for labels, no fonts beyond the three.
- Don't animate anything that happens on a keyboard shortcut; don't add hover-scale to cards.

## 11. Acceptance (QA gate, run before calling the UI done)

- Screenshot loop (Playwright): routes `/`, `/ingest?replay=<run>&speed=4&autoplay=1`, `/mine`, `/case/?id=<demo case>`, `/api`, `/nothing`, `/kit` × viewports 390×844 / 1024×768 / 1440×900 / 1536×790 × states `''|loading|empty|error` → `qa/*.png`. Look at every PNG; fix; repeat until clean.
- `/ingest` renders the PDF page (or the poster) in Playwright's bundled Chromium with zero page errors, 3 reloads in a row.
- Every state in §5 renders at `/kit?state=…`.
- No horizontal scroll at 390; every control ≥44 px high under `(pointer: coarse)` (ghost buttons and pills included); inputs 16 px on mobile.
- Focus visible everywhere; the full demo path works by keyboard; ⌘K reaches every route.
- Reduced motion (emulated) keeps opacity/colour only; nothing breaks.
- 60 fps at 4× CPU throttle on `/ingest` replay and on the `/mine` flip (DevTools performance recording; note the numbers in the report).
- Contrast: every pair in DESIGN.md holds on the built pages (axe-core run on each route: 0 serious/critical).
- `npx @google/design.md lint DESIGN.md` → 0 errors.
- Anti-slop grep over `app/src`: `indigo|violet|purple|#6366f1|#7c3aed|bg-clip-text|backdrop-blur|shadow-\[0_0_|border-l-4|rounded-2xl|Sparkles|Bricolage|IBM_Plex_Sans|Inter\b|Geist|goes here|later build|TODO|lorem` → zero hits (or each explained in the report).
- Brand: favicon, apple icon, manifest icons, OG image and `theme-color` present in the deployed build.
- Watch the recorded 1080p cut on a phone: the foil chip, the red flip and the seal must be legible.
