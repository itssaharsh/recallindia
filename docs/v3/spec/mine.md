# /mine: My things (v3 spec part)

Mockups (static HTML in `v3/mock/`, shots in `v3/mockups/`):

| File | What it shows |
|---|---|
| `mine-1536.png` | First viewport at 1536×790: banner, outcome line, household strip, filters, both alert cards |
| `mine-full-1536.png` | The whole wall at 1536: alert ×2, near-miss, checking, 11 clear cards, Add tile |
| `mine-390.png` | First viewport at 390×844 |
| `mine-add-1536.png` | Add a thing sheet, scan step, `confirmed` state, over the dimmed wall |
| `mine-add-390.png` | Same sheet at 390 as a full-height bottom sheet |

Sources: `v3/mock/mine.html`, `v3/mock/mine-add.html` (loads `mine.html` in an iframe behind the scrim). Tokens come from `v3/mock/base.css`. This part adds only the category tint and paper tokens listed in §4.

What changes from v2: the left rail becomes the 64 px top nav with "My things" active. The paper-and-petrol palette becomes canvas `#F4F7FC` with white cards. Every item gets a category colour and a drawn illustration. The outcome headline is now 54 px Funnel Display. A foil "household strip" summarises all 15 things at a glance. Alert faces get a full red band and a quote of the notice. The Add sheet draws Textract word boxes on the photo, and the batch morphs into a foil chip. Behaviour is unchanged: household copy, filters, all five faces, the flip on result, and the real Textract scan.

---

## 1. Screen: `/mine`

### Purpose
This screen answers "is anything I own on a notice?" in one sentence. It shows why for each match (your batch next to the listed batch, the notice's own words, the dates) and gives one button into the case.

### First 10 seconds (what a judge sees in the video)
1. 0–1 s: the headline "2 things you own are on a notice" arrives, with the count rolling 0 → 2 (NumberFlow). The household strip's pockets fill left to right and two red pills drop in.
2. 1–3 s: the two alert cards rise in. The red bands say *what* ("Failed CDSCO quality test · JUL-2026 alert, row 12", "NHTSA recall 24V436000"), and the foil chips say *why*: FT5427 = FT5427.
3. 3–6 s: the eye reads the quote "The sample does not conforms to the I.P. with respect to **Dissolution Test**" and the date line "Notice published 01 Jul 2026 — 11 days — You bought it 12 Jul 2026".
4. 6–10 s: below the alerts, the near-miss (FT542**8** vs FT542**7**, underlined in cobalt) shows the matcher is exact. The Swift card is visibly mid-check, and eleven calm clear cards read "No match in 4 sources as of 15:08".

### Layout

| Region | 1536 × 790 | 390 × 844 |
|---|---|---|
| App nav | 64 px, white, bottom border `--line`; "My things" tab active (`--cobalt` on `--cobalt-soft`) | 56 px top bar (logo 28 px + household pill) + 68 px bottom tab bar, 4 tabs, "My things" active |
| Page gutter | content 1472 px (32 px each side), max 1536 | 16 px each side, content 358 px |
| HouseholdBanner | y 80, height 52, full content width | y 70, height 60, radius 14 |
| OutcomeLine + HouseholdStrip | y 154–290; grid `1fr auto`, gap 40; strip 428 px + legend 120 px on the right | stacked: headline 2 lines at 34 px, sub, strip full width 358 px, legend 2 × 2 |
| FilterBar | y 310, height 44, one row; "Sorted by needs you first" and "Add a thing" pinned right | one horizontally scrolling row of 44 px pills, bleeding to the screen edges; sort label and button hidden (Add lives in the wall's Add tile and the bottom of the sheet) |
| ItemWall | y 372; 12-column grid, gap 20; bottom padding 48 | 1 column, gap 14; bottom padding 80 (clears the tab bar) |
| Row 1 | alert medicine (7 col, 850 px) + alert vehicle (5 col, 602 px), both about 390 px tall and height-matched | full-width stack |
| Row 2 | near-miss (7 col) + checking (5 col) | stack |
| Clear section | section line, then clear cards 4 per row (3 col, 353 px, min height 96) + Add tile last | section line wraps its count under the title; cards full width, min height 84 |

Page height at 1536 with the demo household: 1576 px.

### Components in reading order
Nav (shell part) → HouseholdBanner → OutcomeLine → HouseholdStrip (+ legend) → FilterBar → ItemWall: ItemCard `alert` ×2 → ItemCard `near-miss` → ItemCard `checking` → ClearSectionLine → ItemCard `clear` ×11 → AddTile. AddThingSheet opens over everything.

### Data
- `GET /v1/stats` → `total` (4,868, used in empty-state copy), `sources_count` (4), `sources[].label` (CDSCO, CPSC, NHTSA, openFDA), `sources[].last_run_at` + `polls_every` (next poll time in the sub line).
- Household (the app's private API, same base and paths as v2):
  - `POST /households` makes a copy and returns `household_id`, which is stored in this browser.
  - `POST /households/{id}/reset` resets the copy.
  - The item list is fetched by the same call v2 `/mine` uses; its path is unchanged.
- Item fields used: `item_id`, `kind` (`medicine` | `vehicle` | `appliance` | `other`), `name`, `brand`, `batch`, `make`, `model`, `year`, `exp_date`, `purchase_date`, `status` (`alert` | `hold`), `case.decision` (`dismiss`), `notice_id`, `case_id`, `reason`, `last_checked_at`.
- Face derivation (unchanged from v2):
  - `alert` when `status == "alert"`
  - `needs-you` when `status == "hold"`
  - `near-miss` when `case.decision == "dismiss"`
  - `clear` when `last_checked_at` is set
  - `unchecked` otherwise
  - `checking` overrides all of these while `GET /items/{id}/check-status` returns `status: "RUNNING"`. The app polls it every 2 s, and `steps[]` feeds the checklist.
- Notice fields for alert faces come from `GET /v1/notices/{notice_id}`:
  - `source`, `title`, `batch`, `month` (JUL-2026), `row` (12), `reason` (raw text), `lab` (DTL Bikaner), `lab_type` (State Lab), `published_at`, `maker`
  - for NHTSA: `campaign` (24V436000), `summary`, `model_years` (2021–2023)

---

## 2. Components

### 2.1 HouseholdBanner
- **Purpose**: say which household you are looking at, and give the one way out of read-only.
- **Placement**: first element under the nav, 16 px below it (14 px at 390).
- **Size**:
  - 1536: full content width, height 52, radius pill. House icon in a 44 px white circle; button 44 px.
  - 390: height 60, radius 14 (a pill would clip two lines); icon hidden.
- **Tokens**: background `--cobalt-soft`; icon `--cobalt` on `#FFFFFF`; lead text `--ink` 500 15 px; tail text `--ink-muted` (5.75:1 on cobalt-soft); button `.btn-secondary` (white, `--line` border, `--ink` text).
- **States (copy)**:
  - `demo`: "You're looking at the demo household. It's read-only." followed by muted "Copy it to add your own things." Button: "Make my own copy". At 390 the text is two lines: **"Read-only demo"** / "Copy it to add things" (the nav pill right above already says "Demo household").
  - `copying`: the button shows a 14 px spinner, reads "Making your copy…" and is disabled; the text is unchanged.
  - `own`: "This is your copy of the demo household. It lives in this browser." Buttons: "Reset my copy" (secondary) and the text link "View the demo household".
  - `own-confirm-reset` (inline, never a modal): "Reset to the 15 demo things? What you added goes." Buttons: "Reset my copy" (danger) and "Keep it".
  - `error`: "We couldn't make your copy: {message}." Button: "Try again".
- **Transitions**: `demo → copying` on click. `copying → own` when `POST /households` succeeds; the nav pill changes to "My household" at the same moment. `copying → error` on failure.
- **Motion**: text swaps crossfade 180 ms ease-out. The button width animates with a 250 ms spring (stiffness 380, damping 34).
- **Responsive**: see Size. The button keeps its full label at 390 (14 px type, 14 px side padding).
- **Keyboard + a11y**: `role="status"` so state changes are announced. The button is the only tab stop, with a visible 2 px `--cobalt` focus ring at 2 px offset.
- **Data**: household id in local storage; `POST /households`, `POST /households/{id}/reset`.
- **Acceptance**: `?state=demo` (mock), `?state=copying`, `?state=own`, `?state=own-confirm-reset`, `?state=copy-error`.

### 2.2 OutcomeLine
- **Purpose**: one sentence that is the answer, with the evidence of freshness under it.
- **Placement**: left cell of the header grid, 22 px under the banner.
- **Size**: headline 54 px / 1.02, letter-spacing −0.035em, Funnel Display 800 (34 px at 390). Sub line 17 px / 1.5 Onest, max width 660 (15 px at 390).
- **Tokens**: headline `--ink`; sub `--ink-muted` with the count in `--ink` 600. No red in the headline: the red lives on the cards.
- **States (copy)**:
  - 2 or more alerts: "{n} things you own are on a notice" (mock: "2 things you own are on a notice")
  - 1 alert: "1 thing you own is on a notice"
  - 0 alerts, 1 or more needs-you: "{n} things need you" / "1 thing needs you"
  - first check still running: "Checking {n} things against 4 sources"
  - all clear: "No match in 4 sources as of {HH:MM}"
  - empty household: "Add the things in your house"
  - Sub line: "**{total} things** checked against CDSCO, CPSC, NHTSA and openFDA at {HH:MM} IST. Each new notice is matched the moment it lands; the next poll is at {HH:MM}." Mock: 15 things, 15:08, 15:20 (the Feed shows "last poll 15:05 IST · next at 15:20"; both screens read the same `/v1/stats`). At 1536 the second sentence starts its own line (`display:block`), so no sentence starts at a line end. At 390 the second sentence is dropped.
  - Empty sub line: "Scan a medicine strip or type a model number. We check it against {total_notices} notices from CDSCO, CPSC, NHTSA and openFDA." (4,868)
- **Transitions**: recomputed whenever an item's face changes (after a flip).
- **Motion**: the number is a NumberFlow that rolls 0 → n on load (600 ms) and n → n±1 on change (400 ms). The rest of the sentence crossfades 180 ms only when the sentence pattern changes.
- **Keyboard + a11y**: an `h1`; a hidden `aria-live="polite"` sibling repeats the headline after each change.
- **Data**: derived from item faces; times from `last_checked_at` (latest) and `/v1/stats`.
- **Acceptance**: `?state=demo`, `?state=one-alert`, `?state=all-clear`, `?state=first-check`, `?state=empty`.

### 2.3 HouseholdStrip (foil blister summary + legend)
- **Purpose**: the household as one blister strip. Each pocket is one thing, so "2 red pills" reads before any text, and it echoes the landing hero's strip.
- **Placement**: right cell of the header grid, vertically centred with the headline; the legend sits 22 px to its right. At 390 it is full width under the sub line, with the legend 2 × 2 under it.
- **Size**:
  - 1536: pockets 38 px in 2 rows of 4 + perforation (12 px) + 4. Gaps 8 (rows) and 10 (columns). Padding 12/16/14. Radius 16. Outer 428 × 132.
  - 390: pockets 32 px, gaps 7, width 358.
  - Pills are 27 px (22 px at 390).
- **Tokens**:
  - Strip: background `--foil`; inset highlight `rgba(255,255,255,.8)`; inset edge `rgba(11,27,51,.12)`; drop shadow `0 18px 34px -16px rgba(11,27,51,.35)`.
  - Print line: 11 px Onest 700, uppercase, +0.08em, `#1B3563` (9.1:1 on foil). Time: Onest 700 12 px, +0.04em, tabular, `#1B3563`. Not Doto: Doto is reserved for printed codes on FoilChips, and its colon renders as a dotted bar ("15↕08").
  - Legend swatches: 14 px circles, all the same size. Red fill for `alert`; 2 px inset `--cobalt` ring for `near-miss`; the `checking` 3/4 arc is drawn inside the 14 px swatch (never outside it); 1 px inset ring for `no match`. The count column is 20 px, right-aligned, so "2" and "11" line their labels up.
  - Pockets: recessed white at 35% with inset shadow.
  - Pills by state: red `#B3121E` for `alert`; white with a 2.5 px `--cobalt` ring for `near-miss`; white with a 2.5 px `--warning` ring for `needs-you`; white with a spinning 2.5 px `--cobalt` arc for `checking`; plain white for `clear` and `unchecked`. The last pocket is a dashed "+".
- **States (copy)**:
  - Print: "DEMO HOUSEHOLD · 15 THINGS" / "MY HOUSEHOLD · {n} THINGS" + "{HH:MM}".
  - Legend rows, in this order: "{n} on a notice", "{n} needs you" (only when above 0), "{n} near-miss" / "{n} near-misses", "{n} checking", "{n} no match". Mock: 2, 1, 1, 11.
  - Pockets follow wall sort order. With 15 things or fewer, empty pockets have no pill and the 16th pocket is "+". With more than 15, pocket 16 reads "+{n−15}" in Onest 700 12 px.
- **Transitions**: a pocket changes with its item's face, in the same frame the card flips.
- **Motion**: on load, pockets fill left to right with a 30 ms stagger (opacity plus scale 0.6 → 1). Red pills land last on a spring (stiffness 420, damping 30, bounce ≤ 0.1). On a face change the pill scales 0.6 → 1 with the same spring. The checking arc turns once per 1.1 s, linear.
- **Responsive**: see Size.
- **Keyboard + a11y**:
  - The strip is `role="img"` with `aria-label="Household strip: 15 things. 2 on a notice, 1 near-miss, 1 checking, 11 no match."`. Pockets are `aria-hidden`.
  - Mouse only: a pocket shows a tooltip "{name} · {face label}" and on click scrolls to the card and gives it a 1.2 s focus ring.
  - The "+" pocket is a real button, "Add a thing" (44 px hit area); it opens the sheet.
- **Data**: item faces.
- **Acceptance**: `?state=demo`, `?state=many` (22 things → "+7"), `?state=empty` (16 empty pockets + "+").

### 2.4 FilterBar
- **Purpose**: narrow the wall by outcome and by kind of thing, without hiding that alerts exist.
- **Placement**: 22 px under the header; one row.
- **Size**: pills 44 px tall, 16 px side padding (14 at 390), gap 8. A 1 × 28 px `--line` divider sits between the groups. The primary button "Add a thing" is 44 px.
- **Tokens**:
  - Pill: `--surface-1`, 1 px `--line`, text `--ink` 500 15 px; count 600 13 px `--ink-muted`, tabular.
  - Active pill: background `--ink`, text white, count `#C9D3E3` (11.4:1).
  - Markers: "On a notice" has an 8 px `--danger` dot; category pills have a 10 px rounded square in `--cat-*`.
  - Sort label: `--ink-muted` with `--ink` 600 emphasis.
- **States (copy)**:
  - Status group, single select (default All): "All {15}", "On a notice {2}", "Needs you {n}" (only when above 0), "Near-misses {1}", "No match {11}".
  - Kind group, single select that toggles off on a second click: "Medicines {4}", "Vehicles {2}", "Appliances {5}", "Other {4}".
  - Right side: "Sorted by **needs you first**", then the "Add a thing" button.
  - No results: the wall shows "Nothing here with these filters." with the ghost button "Clear filters".
- **Transitions**: the counts in each group reflect the other group's selection. The URL mirrors the selection (`?show=alert&kind=medicine`).
- **Motion**: the active pill background slides between pills (shared layout, spring stiffness 380, damping 34, about 300 ms). Filtered-out cards fade and scale to 0.98 in 160 ms, then the rest re-flow with the wall's layout spring.
- **Responsive**: at 390 the bar scrolls horizontally with a 16 px inset and no scrollbar. The sort label, divider and Add button are hidden.
- **Keyboard + a11y**: two `role="group"`s ("Filter by outcome", "Filter by kind"); pills are toggle buttons with `aria-pressed`, and the accessible name includes the count ("On a notice, 2"). Left and right arrows move within a group; Tab moves between groups.
- **Data**: counts from item faces and `kind`.
- **Acceptance**: `?state=demo`, `?show=alert`, `?show=clear&kind=appliance`, `?show=needs-you` (hidden pill case → falls back to All), `?show=alert&kind=appliance` (no results).

### 2.5 ItemWall (layout, sort, re-sort)
- **Purpose**: every thing you own, most urgent first, in a varied rhythm rather than a uniform grid.
- **Placement**: 18 px under the FilterBar.
- **Size**:
  - 12 columns, gap 20. "Big" faces (`alert`, `needs-you`, `near-miss`, `checking`) sit in rows of two: 7 + 5 columns (850 + 602 px at 1536). Cards in a row match height (`align-self: stretch`) in every row: the alert row, the near-miss + checking row (the near-miss card centres its FoilChip block in the extra height), and every clear row (a two-line name must not make one card taller than its neighbours). The AddTile stretches too.
  - A lone big card at the end spans 12 columns, with its body capped at 850 px.
  - Clear and unchecked cards: 3 columns each (353 px), 4 per row. The AddTile is always last.
  - 390: one column, gap 14.
- **Sort ("needs you first")**:
  1. `alert`, newest notice `published_at` first
  2. `needs-you`
  3. `near-miss`
  4. `checking` and `unchecked`
  5. `clear`, A–Z by name

  Big faces come before the ClearSectionLine; clear cards come after it.
- **Re-sort after a flip**:
  - The card stays in place for 700 ms after its flip lands, so the result is read where the eye already is.
  - It then moves to its sorted slot with a layout animation (spring stiffness 300, damping 32, about 400 ms, bounce ≤ 0.1); other cards shift with the same spring.
  - If the pointer is over the card or focus is inside the wall, the move waits until both leave, for at most 4 s.
  - The page never scroll-jumps. If the new slot is outside the viewport, a sonner toast says "{name} moved to the top · on a notice" (alert) or "{name} moved to No match" (clear), with the action "Show it" (scrolls and focuses the card).
- **Motion (load)**: the one orchestrated sequence for this page. Cards rise 8 px and fade in over 280 ms, ease-out `cubic-bezier(.2,.8,.2,1)`, with a 40 ms stagger in sort order. The stagger stops after 8 cards; the rest appear together. It starts 200 ms after the headline.
- **Keyboard + a11y**: a `section` labelled "Your things". Each card is an `article` labelled by its `h3`. Tab order follows sort order. An `aria-live="polite"` region announces results: "{name}: on a notice", "{name}: no match in 4 sources as of {HH:MM}".
- **Acceptance**: `?state=demo`, `?state=flip` (the Swift finishes its check 1.5 s after load, flips to clear, and re-sorts into the clear grid between "Havells…" and "Milton…"), `?state=flip-alert` (a fixture item flips to alert and moves to the top with the toast).

### 2.6 ItemCard v3
One component with six faces. Shared anatomy:
- category label: 9 px rounded square in `--cat-*` + uppercase 12 px 600 `--ink-muted`, e.g. "MEDICINE"
- title `h3`: Funnel Display 700, 22 px (26 px on alert faces, 20 px at 390)
- meta line: 14 px `--ink-muted`
- illustration tile: see §2.13
- card base: `.card` (white, 1 px `--line`, radius 14, `--shadow-1`)

#### Face `alert` (mock: Paracetamol FT5427, Jeep Compass 2022)
- **Anatomy, top to bottom**:
  1. Red band, 48 px, `--danger`, 20 px side padding. It holds:
     - a white badge pill (26 px): alert triangle + "ON A NOTICE" in 700 12 px +0.04em, `--danger` on white, 6.95:1
     - the source line in white 600 15 px
     - "Published {DD Mon YYYY}" pushed right, 500 13 px `#FFD9D6` (5.34:1)
  2. Body, padding 18 px 20 px 0:
     - illustration tile 112 px on `--danger-soft`
     - category label, title, meta
     - the match row: foil chips for medicines, or a RangeBar `years` for vehicles
  3. NoticeQuote (§2.9).
  4. Footer, padding 16/20/18:
     - left: RangeBar `dates` for medicines with a purchase date, or a note
     - right: "Open case" button, `.btn` 44 px, `--danger` background, white text, arrow icon
- **Border and shadow**: border `rgba(179,18,30,.28)`; shadow `0 2px 4px rgba(11,27,51,.05), 0 22px 44px -20px rgba(179,18,30,.45)`, a red-tinted lift that is the only coloured shadow in the app.
- **Copy**:
  - Source line by source:
    - CDSCO: "Failed CDSCO quality test · {MON-YYYY} alert, row {n}"
    - NHTSA: "NHTSA recall {campaign}"
    - CPSC: "CPSC recall {number}"
    - openFDA: "openFDA recall {recall_number}"
    - Never "recalled" for CDSCO.
  - Meta:
    - medicine: "{maker} · bought {DD Mon YYYY}", or "{maker}" without a purchase date
    - vehicle: "Matched by make, model and year"
    - appliance or other: "Matched by brand and model"
  - Match row (medicine): "YOURS" over the FoilChip "FT5427", "=" in `--danger` Funnel 700 22 px, "LISTED" over the FoilChip "FT5427", then the tag "Same batch" (check icon, `--danger` on `--danger-soft`, 34 px pill; hidden at 390).
  - Footer note (vehicle, NHTSA only): "NHTSA covers US vehicles, so confirm with your dealer using the VIN."
  - Footer note (medicine without a purchase date): "Add the date you bought it to see if it was sold after the notice." Plus the ghost button "Add date".
  - Button: "Open case" → `/case/?id={case_id}`.
- **390**: the band wraps. The badge and date sit on line 1, and the source line takes line 2 at full width ("Failed CDSCO quality test" / "JUL-2026 alert, row 12", with the second part in `#FFE3E0`, 5.73:1). Tile 76 px. The button spans the full width.

#### Face `needs-you` (status `hold`; no demo item, fixture is FT5428 before it was dismissed)
- **Anatomy**:
  - a 40 px `--warning-soft` band with the chip "Needs you" (`--warning` on white, 26 px) and the source line in `--warning` 600 14 px
  - body as in near-miss: tile 88 + title + FoilChip stack "Yours FT5428 / Listed FT5427" with the cobalt underline
  - question copy
  - two buttons
- **Copy**:
  - Source line: "Close to CDSCO JUL-2026 alert, row 12".
  - Question: "Same medicine and maker, one character apart. Is **FT5428** the batch printed on your strip?"
  - Buttons: "Not on the notice" (secondary; result: dismiss → face `near-miss`) and "Fix the batch" (ghost; opens the sheet in edit mode with the Batch field focused).
- **Tokens**: `--warning` `#8F5500` on `--warning-soft` `#F2EAE2` (5.09:1). No red.

#### Face `near-miss` (mock: Paracetamol FT5428)
- **Anatomy**:
  - top row: tile 88 on the category paper, category label + title + maker, and on the right the chip "Near-miss · dismissed" (`--cobalt` on `--cobalt-soft`, 26 px, 5.29:1)
  - below, a two-column block: a `--surface-2` panel (radius 12, padding 14/16) with a 2 × 2 grid of "YOURS" + FoilChip "FT542**8**" over "LISTED" + FoilChip "FT542**7**"; beside it the explanation and the link
- **Underline**: the characters that differ are underlined with a 3 px `--cobalt` bar, radius 2, 5 px below the Doto baseline, 1 px overhang each side. Differences are computed per character position after uppercasing and stripping spaces, dots and hyphens.
- **Copy**:
  - "**One character apart.** Same medicine and maker as CDSCO JUL-2026 alert, row 12, different batch. Dismissed." (For k > 1: "**{k} characters apart.**")
  - Link: "See the notice" (44 px, `--cobalt` 600 14 px, arrow) → `/feed?id={notice_id}`.
- **390**: the chip moves under the title; the panel and text stack. "JUL-2026" is a no-break span, so it never splits at its hyphen.

#### Face `checking` (mock: Maruti Suzuki Swift)
- **Anatomy**:
  - top: tile 72, category label + title, and on the right the state chip (28 px, `--cobalt` on `--cobalt-soft`, 14 px spinner) "Checking · {done} of 4". At 390 the chip wraps under the tile, left-aligned, like the near-miss chip
  - checklist: one 38 px row per source (24 px icon column | source | result), with 1 px `--line` dividers
  - progress bar: 6 px, `--surface-2` track, `--cobalt` fill, radius 3
- **Row states**:
  - done: 20 px `--success-soft` circle with a check, result "No match" in `--ink-muted`
  - running: 14 px spinner; the row text and result are in `--cobalt`
  - waiting: 20 px dashed `--line-strong` circle; text in `--ink-muted`; result "Waiting"
  - an alert result stops the list: 20 px `--danger` circle with "!" and result "On a notice"
- **Running result copy by kind**:
  - vehicle: "Matching make, model and year"
  - medicine: "Matching batch"
  - appliance or other: "Matching brand and model"
- **Progress**: (done + 0.5 × running) ÷ 4. The mock shows 62%.
- **Data**: `GET /items/{id}/check-status` every 2 s; `steps[]` maps to rows in source order CDSCO, CPSC, NHTSA, openFDA.

#### Face `clear` (mock: the other 11)
- **Anatomy**: horizontal, padding 14, min height 96, gap 14; the card stretches to its row's height and centres its content:
  - tile 64 on the category paper
  - name: 600 15 px, 2-line clamp
  - maker: 13 px `--ink-muted`
  - status: 14 px `--success` check + "No match in 4 sources as of {HH:MM}" (500 13 px, 5.33:1)
- **Copy**: exactly "No match in 4 sources as of 15:08". Never "safe", never "clear" in body copy.
- **Actions**: none in the demo household. In your own household, a 44 px overflow button appears on hover or focus-within, "More for {name}", with the menu items "Check again" and "Remove from household".

#### Face `unchecked`
- Same compact anatomy as `clear`. The status reads "Not checked yet" in `--ink-muted`, with the ghost button "Check now" (44 px), which starts `checking`.

#### The flip (checking → result)
- **Trigger**: `check-status` returns a non-`RUNNING` status. The app then fetches `GET /items/{id}` and derives the new face.
- **Motion**:
  - The card rotates on Y with `perspective: 1200px`: 0° → 90° in 160 ms `cubic-bezier(.4,0,1,1)`.
  - At 90° the content swaps to the new face, which changes size in the same frame via layout. Then −90° → 0° on a spring (stiffness 380, damping 32, about 300 ms, bounce ≤ 0.1).
  - The household strip pocket and the legend count update when the card passes 90°.
  - An alert result adds nothing extra: the band's colour is the news.
- **Reduced motion**: no rotation. The old face fades out and the new one fades in, 150 ms each; the size change happens instantly.
- **Re-sort**: see §2.5 (a 700 ms hold, then the layout move).
- **Acceptance**: `?state=flip`, `?state=flip-alert`, `?state=flip&motion=reduced`.

### 2.7 FoilChip
- **Purpose**: the one visual for a printed code (batch, lot, serial): it looks like the foil it was read from.
- **Placement**: alert match row, near-miss stack, needs-you stack, ScanConfirm (morph callout + Batch field), and the case page.
- **Size**:
  - `md`: 34 px tall, 12 px side padding, Doto 900 22 px, letter-spacing +0.06em
  - `lg`: 52 px tall, 16 px padding, 36 px type
  - radius `--r-sm` 8
- **Tokens**: background `--foil` (the only gradient on app screens); `inset 0 1px 0 rgba(255,255,255,.7), inset 0 0 0 1px rgba(11,27,51,.14)`; text `--ink` (10.7:1 on the darkest foil stop).
- **States**:
  - `plain`
  - `diff`: the differing characters are wrapped in `<u>`, with a 3 px `--cobalt` bar under them
  - `selected`: extra rings `0 0 0 3px --cobalt-soft, 0 0 0 4.5px --cobalt` (ScanConfirm Batch field)
  - `candidate`: 1.5 px dashed `--cobalt` outline, offset 2 px
  - `editing`: turns into a 52 px input with a `--line-strong` border, Doto text and caret, uppercase on input
- **Motion**: in ScanConfirm it is the morph target (layoutId `scan-batch`, §2.12). Otherwise it is static.
- **Keyboard + a11y**:
  - The chip is text, not a control. Its `aria-label` spells the code character by character: "Batch F T 5 4 2 7".
  - In the `diff` state it adds ", differs at character 6".
- **Acceptance**: `/kit?state=foil` shows md, lg, diff, selected, candidate and editing.

### 2.8 RangeBar (on alert faces)
Two variants of one component. Both put the notice's range and your value on one line.

#### `years` (vehicles; mock: Jeep Compass 2022)
- **Size**:
  - track 10 px tall, radius 5, `--surface-2`
  - listed range: fill `#F4C9C4` with a 1.5 px inset `--danger` edge
  - your marker: 22 px `--danger` circle with a 3 px white border and `--shadow-1`
  - axis labels 12 px, 8 px under the track
- **Scale**: listed range ±1 year. Mock: 2020–2024 at 4% / 20% / 50% / 80% / 96%.
- **Axis labels**:
  - outer years in `--ink-muted`
  - listed endpoints in `--danger` 700
  - yours: "Yours 2022" in `--ink` 700
- **Placement**: inside the alert body under the meta line (the body column is about 430 px at 1536).
- **390**: the outer years are hidden (`.out`) so the three remaining labels never collide.
- **Accessible name**: "Listed model years 2021 to 2023; yours is 2022."

#### `dates` (medicines with a purchase date; mock: Paracetamol)
- **Anatomy**: [14 px ring dot, 3 px `--danger` border] "Notice published" / **01 Jul 2026** — a 2 px `--danger` line, 60–220 px wide, with a centred pill "11 days" (`--danger` on `--danger-soft`, 700 13 px) — [14 px filled `--danger` dot with a 3 px `--danger-soft` halo] "You bought it" / **12 Jul 2026**.
- **Labels**: captions 500 12 px `--ink-muted`; dates 600 14 px `--ink`, tabular.
- **Rule**:
  - When the purchase is on or after the notice, the line and pill are red, as above.
  - When the purchase is before the notice, the line is `--line-strong`, the pill is `--surface-2` / `--ink-muted` reading "{n} days before", and the order flips: "You bought it" first.
- **Placement**: left side of the alert footer, beside "Open case". At 390 it takes the full width above the button.
- **Accessible name**: "Bought 12 Jul 2026, 11 days after the notice was published on 01 Jul 2026."
- **Bug fixed in v3**: an earlier draft drew the dates as ticks on a long axis ("01 Jul · Aug · Today 20 Sep"), and the "01 J" axis label overlapped "Notice 01 Jul". The `dates` variant has no axis at all: two labelled endpoints and a measured gap, so labels cannot collide at any width.

**Motion (both variants)**: none on load beyond the card's rise. When a card flips to alert, the range fill grows from the left over 320 ms ease-out, then the marker drops in on the strip spring.

**Acceptance**: `?state=demo` (both variants), `?state=bought-before` (dates reversed), `?state=no-purchase-date` (footer note + "Add date").

### 2.9 NoticeQuote
- **Purpose**: the notice's own words, as published, so the claim never paraphrases.
- **Size**: margin 16 px 20 px 0; padding 14/16/14/44; radius 10; text 500 16 px / 1.45 `--ink` (15 px at 390).
- **Tokens**: background `#FFF8F7`; border 1 px `#F3D3CF`; opening quote mark Funnel Display 800 40 px `--danger`; cite 13 px `--ink-muted` (6.83:1); highlight `mark` `#FAD9D5` behind `--ink` (13.1:1), radius 3.
- **Highlight rule**:
  - CDSCO: the phrase after "with respect to", minus the trailing full stop ("Dissolution Test").
  - Other sources: the first hazard term found from a fixed list: rearview image, fire, burn, choking, small parts, short circuit, crash, shock, contamination.
- **Copy**:
  - CDSCO: "{reason verbatim}" + cite "{lab} ({lab_type}) · CDSCO {MON-YYYY} alert, row {n}, as published".
  - NHTSA: "{summary}" + cite "NHTSA recall {campaign}, as published · listed model years {from}–{to}".
- **Rule**: text is shown exactly as published, grammar included ("does not conforms").

### 2.10 ClearSectionLine and AddTile
- **ClearSectionLine**:
  - Copy: 24 px `--success-soft` circle with a check + `h2` "No match in 4 sources as of {HH:MM}" (Funnel 700 22 px; 19 px at 390) + "{n} things" (14 px `--ink-muted`).
  - At 390 the count wraps under the title, indented 36 px.
- **AddTile**:
  - Last cell of the clear grid, same size as a clear card.
  - 1.5 px dashed `--line-strong` (3.28:1), no shadow; a 64 px `--cobalt-soft` tile with a `--cobalt` plus.
  - Copy: **"Add a thing"** (`--cobalt` 600 15 px) / "Scan a medicine strip, or type a model number".
  - It is a button that opens the AddThingSheet on the Medicine strip kind.

### 2.11 AddThingSheet
- **Purpose**: add one thing in under 20 seconds. For medicines that means one photo, confirming the batch and checking.
- **Placement**:
  - 1536: bottom-anchored sheet over a scrim `rgba(11,27,51,.5)` (no blur); 1180 px wide (max `100% − 64px`), centred. Its top edge sits at y 155, so the nav, the banner and the start of the headline stay visible behind it.
  - 390: full-height bottom sheet from y 28 with a 40 × 5 px `--line` grab handle.
- **Size (1536)**:
  - radius 22 top corners; header 72 px with a 1 px `--line` bottom border
  - body padding 20 28 24; grid 600 px (photo) + 40 gap + 484 px (read-back); total height 635
- **Header**:
  - `h2` "Add a thing" (Funnel 800 26 px, no wrap)
  - kind switch: `--surface-2` track 44 px with 4 px padding; segments 36 px; the active segment is white with `--shadow-1`; each has a 9 px category square: "Medicine strip", "Vehicle", "Appliance or other" (390: "Medicine", "Vehicle", "Appliance")
  - step indicator (non-interactive): 24 px number circles, the current one `--cobalt` with a 4 px `--cobalt-soft` halo, 20 px connectors: "1 Scan the strip — 2 Check 4 sources — 3 Added"
  - close: 44 px circle, 1 px `--line`, "Close"
- **Header by kind**:
  - Vehicle: step 1 reads "Enter the vehicle"; the body is a form with Make, Model and Year selects (44 px) and the button "Check this vehicle".
  - Appliance or other: step 1 reads "Enter the model"; the body has Brand and Model inputs plus a Category select (Appliance / Other), and the button "Check this model".
- **States**:
  - `scan` (the ScanConfirm states, §2.12)
  - `checking` (step 2): the body shows the new ItemCard in its `checking` face at full sheet width, with the title "Checking {batch} against 4 sources"
  - `added` (step 3): the same card flipped to its result
    - if clear: title "No match in 4 sources as of {HH:MM}", primary button "Show it in My things"
    - if alert: title "This batch is on a notice", buttons "Open case" (danger) and "Show it in My things" (secondary)
  - `discard-confirm` (inline, under the header, on Close after edits): "Discard this thing? Nothing has been saved." with the buttons "Discard" and "Keep editing"
- **Demo household**: the first "Check this …" runs `POST /households` first (the copy), then `POST /items`. The note under the CTA says so (§2.12 copy).
- **Transitions**: `scan → checking` on the CTA (`POST /items`); `checking → added` on the flip; `added → closed` on "Show it in My things". The card then animates from the sheet into its sorted slot on the wall (shared layoutId `item-{id}`), and its strip pocket fills.
- **Motion**:
  - open: scrim 0 → 1 in 200 ms; sheet `translateY(100%) → 0` on a spring (stiffness 320, damping 34, about 360 ms)
  - close: 240 ms `cubic-bezier(.4,0,1,1)`
  - 390: dragging the handle down by more than 30% of the height, or flinging faster than 500 px/s, closes the sheet
  - kind switch: the active segment slides (shared layout, 300 ms spring)
- **Responsive**: at 390 the kind switch drops under the title and close button; the step indicator is hidden; the body is one column; the CTA is a fixed footer (white, 1 px `--line` top, 12/16/14 padding) and the body scrolls under it. In the `confirmed` state the whole form (Medicine, Batch, Expiry + Bought on) must sit above that footer at 390 × 844 with nothing clipped behind it: the body grid is `align-content: start`, the lede and the date hint are hidden, field rows have 8 px vertical padding, and the Batch FoilChip is 44 px / 30 px.
- **Keyboard + a11y**:
  - `role="dialog"`, `aria-modal="true"`, labelled by the `h2`, with a focus trap.
  - Initial focus goes to "Take or choose a photo". After reading, focus moves to the read-back `h3` (`tabindex=-1`).
  - Esc closes (or shows `discard-confirm` when there are edits). The kind switch is a `tablist` with arrow keys.
  - Focus returns to the opener on close.
- **Acceptance**: `?state=add-idle`, `add-uploading`, `add-reading`, `add-candidates`, `add-confirmed` (mock), `add-failed`, `add-upload-error`, `add-checking`, `add-added-clear`, `add-added-alert`, `add-vehicle`, `add-appliance`.

### 2.12 ScanConfirm (the scan step)
- **Purpose**: turn a photo of the strip into a confirmed batch, drawing the system's work on the photo itself: every word Textract read gets a box, the batch box is cobalt, and it becomes a foil chip.
- **Placement**:
  - left: photo figure 600 × 450 (4:3), radius 14; under it a caption row (12 px gap)
  - right: the read-back column
  - 390: photo 358 × 269 at full width, read-back below it (the `h3` 16 px under the photo; no lede)
- **Photo layer**:
  - Background `#E7E2D9` (table) shows only if the photo is letterboxed. The photo is `object-fit: cover`.
  - The mock crops to `viewBox="102 108 1100 825"` of the 1400 × 1050 render, standing in for a user who framed closer. The app does no automatic zoom in v3.
  - Viewfinder corners: 26 px L-shapes, 3 px white at 90% (18 px / 2.5 px at 390). Top-left, bottom-left and bottom-right only; the top-right is taken by "Retake". At 390 only the bottom-right corner shows (the pill covers top-left and the morph callout covers bottom-left).
  - "Retake": 44 px white pill, camera icon in `--cobalt`, "Retake".
- **Word boxes (one SVG overlay in image space)**:
  - Other words: polygon, fill `rgba(255,255,255,.22)`, stroke `rgba(11,27,51,.55)` 1.5 px (`vector-effect: non-scaling-stroke`).
  - Batch word: the polygon padded 7 image px along its own axes; a 7 px white halo under a 3 px `--cobalt` stroke; fill `rgba(10,88,194,.07)` so the printed code stays readable.
  - Numbered field tags (HTML, px-sized, anchored at each group's first word, 5 px above): "1 Medicine" and "3 Expiry" in `--ink` (each tag reads exactly like the field label it numbers); "2 Batch" in `--cobalt`. Tags are 24 px pills with a 17 px white number disc. At 390 only "2 Batch" shows (20 px).
  - Leader: a 2 px `--cobalt` dashed path (5/5) from the batch box's bottom-edge midpoint to the callout. It ends in a 6 px `--cobalt` dot with a 2.5 px white edge.
  - Morph callout: white card, radius 12, `--shadow-2`, padding 10/12/12, placed in the empty table area at left 4.5% / top 70.5%. It reads "● Batch on your strip" (12 px `--ink-muted`, 7 px cobalt dot) above a FoilChip `lg` "FT5427". This matches the landing hero's "Batch on your strip" chip.
  - Caption row: a `--success-soft` check + "Amazon Textract read 9 words", with the legend pushed right: "▭ Batch" (cobalt) and "▭ Other words" (ink). At 390 the caption becomes an in-photo pill at top-left, "Textract read 9 words".
- **Read-back column (the `confirmed` state, as mocked)**:
  - Chip "Found a batch number" (`--success` on `--success-soft`, 28 px).
  - `h3` "Is this the batch on your strip?" (Funnel 800 30 px; 24 px at 390).
  - Lede: "The code next to **B.No.** is the batch. CDSCO lists failed samples by batch, so that's what we match."
  - Fields. Numbered rows match the photo tags; 24 px number discs; 1 px `--line` separators; labels 600 13 px with a muted source hint on the right:
    1. "Medicine" / "5 words on the strip" → input (44 px, 1 px `--line-strong`, radius 8) "Paracetamol Tablets IP 650mg"
    2. "Batch" / "Next to B.No." → FoilChip `lg` `selected` "FT5427" + "Edit" (pen icon, `--cobalt`, 44 px)
    3. "Expiry" / "Next to EXP" → input "09/2027", side by side with "Bought on" / "Optional" → input with placeholder "dd mmm yyyy" (no number: it isn't read from the photo)
    - Hint under the pair: "Add the date to see if it was sold after a notice was out."
  - CTA: "Check this batch" (primary, 52 px, full column width, arrow).
  - Note: "Checks CDSCO, CPSC, NHTSA and openFDA · saves to your own copy" (one line at 1536; in your own household, and at 390: "Checks CDSCO, CPSC, NHTSA and openFDA").
  - The Expiry and Bought on labels share one baseline: the 4 px first-row padding applies only to the first field row (`.fields > .f:first-child`), never to the first cell of the pair.

**States:**

| State | Photo side | Read-back side | Live region |
|---|---|---|---|
| `idle` | Dashed 1.5 px `--line-strong` drop area, 4:3, the strip line illustration `il-strip` at 96 px, "Drop a photo here" | `h3` "Photograph the back of the strip". Lede "We read the batch, name and expiry with Amazon Textract. You confirm before anything is saved." Primary "Take or choose a photo" (opens the camera on phones, a file picker on desktop). Link "Type it in instead" (shows the fields empty, with the CTA "Check this batch") | none |
| `uploading` | Local preview at 60% opacity; a 4 px `--cobalt` progress bar pinned to the photo bottom, tracking PUT progress | The status list: "Uploading the photo" (running), "Reading the print with Amazon Textract" (waiting) | "Uploading the photo" |
| `reading` | Full-opacity preview. A 2 px `--cobalt` scan line with a 24 px `--cobalt-soft` trailing band (opacity .5) sweeps top to bottom every 1.2 s. Word boxes appear as they arrive, 40 ms stagger, each 200 ms opacity 0 → 1 and scale .96 → 1 | Status list: upload done, reading running. If the edge stamp was read in a second pass: "Read the edge stamp separately ({passes})" (done) | "Reading the print with Amazon Textract" |
| `candidates` | All words boxed; every batch candidate gets a dashed 2 px `--cobalt` box and a numbered cobalt tag "A", "B"… No morph yet | Chip (warning) "{n} codes could be the batch". `h3` "Which one is the batch?" Lede "Pick the code printed next to B.No. or Batch." One radio row per candidate (56 px): FoilChip `md` `candidate` + "next to {neighbour word}" (e.g. "next to EXP · looks like an expiry"). CTA disabled: "Pick the batch", which becomes "Check this batch" once one is picked. Picking runs the morph | "{n} codes could be the batch" |
| `confirmed` (mock) | As described above | As described above | "Found batch F T 5 4 2 7" |
| `failed` (no batch) | All words boxed in ink; no cobalt | Chip (warning) "No batch found". `h3` "We couldn't read a batch on this photo". Lede "Textract read {n} words, but none looks like a batch. Tilt the strip so the light doesn't wash out the print, or type the batch." Buttons "Retake photo" (primary) and "Type the batch" (secondary; shows the Batch field as a FoilChip `editing`) | "No batch found" |
| `failed` (upload or Textract error) | Preview dimmed to 60% | Inline error in `--danger` 13 px: "The upload was refused (HTTP {status})." or "Textract couldn't read this photo: {message}". Buttons "Try again" (primary) and "Type it in instead" (link) | the error text |

- **Candidate rule**: a word is a candidate when `is_batch` is true. With no `is_batch` word, the frontend also takes words of 4–12 characters mixing letters and digits that are not dates (`^\d{2}/\d{4}$`, `^\d{2}-\d{2}$`) and not the name. Exactly one candidate → `confirmed`; two or more → `candidates`; none → `failed`.
- **The morph (candidates or reading → confirmed)**:
  1. When the last box has appeared, the batch box stroke goes from 1.5 px ink to 3 px `--cobalt` with the white halo (200 ms ease-out).
  2. After 120 ms, a FoilChip with layoutId `scan-batch` starts at the batch box's screen rect: rotated to the box angle (17.2° in the mock), sized to the box, text at 30% opacity.
  3. It springs to the callout's rect (stiffness 300, damping 30, about 380 ms, bounce ≤ 0.1), rotating to 0° and taking on the foil fill.
  4. The leader draws over 240 ms (`stroke-dashoffset`) as the chip lands.
  5. 100 ms after landing, the Batch field's chip fades in (180 ms) with its cobalt ring, and the "2 Batch" tag and field number pulse once (scale 1 → 1.08 → 1, 240 ms).
  - Reduced motion: no travel. The box turns cobalt and the callout and field chip fade in (150 ms).
- **Keyboard + a11y**:
  - The figure's `aria-label` is "Your photo of the strip. Textract read {n} words; the batch {code} is outlined."
  - Boxes and tags are `aria-hidden`; the read-back fields are the accessible truth.
  - Candidate rows are a `radiogroup`.
  - "Edit" turns the chip into an input and focuses it; Enter confirms, Esc cancels.
  - Every button is at least 44 px.
- **Data**:
  - `POST /uploads {content_type:"image/jpeg"}` returns `{url, headers, key}`; then `PUT` the photo.
  - `POST /items/ocr {key}` returns:
    - `fields{name, brand, batch, mfg_date, exp_date}`
    - `words[{text, box{left,top,width,height}, is_batch}]`
    - `passes[]`
  - Requirement for v3: `words` must be WORD-level Textract blocks, and should carry `poly` (the four `Geometry.Polygon` points as fractions) so the boxes follow the rotated print as in the mock. Without `poly`, draw `box`.
  - `POST /items {kind:"medicine", name, brand, batch, mfg_date, exp_date, purchase_date, photo_key}` saves the item.
  - Word count in the caption: `words.length` (mock: 9, meaning PARACETAMOL, TABLETS, IP, 650, mg, B.No., FT5427, EXP, 09/2027).

### 2.13 Illustration set (ItemIllustration)
- **Style**: flat 2-tone on a 64 × 64 viewBox. `--c` is the mark colour and `--t` the tint; white is used only for pills, lenses and highlights. Strokes are 1.6–2.6 at 64 px; rounded joins and caps; no outlines around filled shapes except where the object is a container (strip, geyser, parcel). No emoji and no icon font.
- **Tile**:
  - the paper colour sits behind the drawing, which fills 78% of the tile; radius 12
  - sizes: alert 112 (76 at 390), near-miss and needs-you 88 (64), checking 72, clear 64 (56)
  - background: `--cat-*-paper`, or `--danger-soft` on alert faces (graphic contrast is at least 3.68:1 in every pairing)
- **Red pocket**: `il-strip` exposes `--px` / `--pxs` for the bottom-right pocket's fill and stroke. On a medicine alert both are `#B3121E`, echoing the landing's red pill.

| Symbol | Drawing | Used for (demo household) |
|---|---|---|
| `il-strip` | Blister strip tilted −14°, 8 round tablets, perforation line | Paracetamol Tablets IP 650mg (alert, with the red pocket), Paracetamol Tablets IP 650mg (near-miss), Dolo 650; fallback for any medicine; the `idle` drop area in ScanConfirm |
| `il-strip-cap` | The same strip with 8 caplets | Crocin Advance 500mg Tablets |
| `il-suv` | SUV with roof rails and square glasshouse | Jeep Compass 2022 (alert) |
| `il-hatch` | Hatchback with a short rear | Maruti Suzuki Swift (checking); fallback for any vehicle |
| `il-iron` | Dry iron with dial and cord | Bajaj Majesty DX-6 Dry Iron |
| `il-stove` | Glass-top stove, 3 burners, 3 knobs | Butterfly Smart Glass 3 Burner Gas Stove |
| `il-fan` | Ceiling fan: canopy, rod, 3 blades | Havells Efficiencia Neo Ceiling Fan |
| `il-geyser` | Storage geyser: rounded tank, band, dial, pipes | Crompton Arno Neo Storage Geyser |
| `il-induction` | Induction cooktop: coil rings, touch strip | Pigeon Cruise Induction Cooktop |
| `il-plug` | Plug and cord | Fallback for any appliance without its own drawing |
| `il-buds` | Two earbuds over an open case | boAt Airdopes 141 Earbuds |
| `il-cooker` | Pressure cooker: lid, whistle, long handle | Hawkins Contura Hard Anodised Cooker, Prestige Deluxe Plus Pressure Cooker |
| `il-flask` | Flip-lid flask with a highlight | Milton Thermosteel Flip Lid Flask |
| `il-parcel` | Parcel box | Fallback for any other thing without its own drawing |
| `logo` | 32 px cobalt tile, 4 pockets, the red one bottom right | Nav logo lockup |

- **UI line icons** (24 viewBox, `currentColor`, 1.9–2.8 stroke):
  - `u-house`: banner, household pill
  - `u-plus`: Add buttons, strip "+"
  - `u-arrow`: Open case, See the notice, CTA
  - `u-check`: status lines, "Same batch"
  - `u-alert`: alert badge
  - `u-search`: ⌘K
  - `u-feed`, `u-ingest`, `u-things`, `u-api`: 390 tab bar
  - `u-x`: close
  - `u-camera`: Retake
  - `u-pen`: Edit
- **Mapping rule** (by `kind`, then the first matching regex on `name`, case-insensitive):
  - medicine: `/caplet|advance|capsule/` → `il-strip-cap`, else `il-strip`
  - vehicle: `/compass|scorpio|xuv|creta|seltos|fortuner|thar|innova|suv/` → `il-suv`, else `il-hatch`
  - appliance:
    - `/iron/` → `il-iron`
    - `/stove|burner|hob/` → `il-stove`
    - `/fan/` → `il-fan`
    - `/geyser|water heater/` → `il-geyser`
    - `/induction|cooktop/` → `il-induction`
    - else `il-plug`
  - other:
    - `/earbud|airdopes|earphone|headphone/` → `il-buds`
    - `/cooker/` → `il-cooker`
    - `/flask|bottle/` → `il-flask`
    - else `il-parcel`
- **Implementation**: one `<svg>` sprite (`public/illustrations.svg`) with `<symbol>`s, rendered as `<svg class="il"><use href="/illustrations.svg#il-strip"/></svg>` with `--c`/`--t` set by the card's category class. All illustrations are `aria-hidden`; the card title names the thing.

---

## 3. Motion summary

| Moment | Spec |
|---|---|
| Page load (the one orchestrated sequence) | Headline NumberFlow 600 ms. Strip pockets 30 ms stagger; red pills spring (420/30). Cards rise 8 px + fade 280 ms, 40 ms stagger, first 8 only; starts 200 ms after the headline |
| Filter change | Active pill slides (380/34); hidden cards fade out 160 ms; the rest re-flow (300/32) |
| Flip | 0 → 90° 160 ms ease-in; swap; −90 → 0° spring (380/32). The strip pocket updates at 90° |
| Re-sort | 700 ms hold, then a layout move (300/32, about 400 ms); toast if off-screen |
| Sheet | Scrim 200 ms; sheet spring (320/34) up; 240 ms ease-in down |
| Scan | Scan line 1.2 s loop; boxes 40 ms stagger × 200 ms; batch box turns cobalt 200 ms; morph spring (300/30) about 380 ms; leader draws 240 ms; field chip fades in 180 ms |
| Reduced motion | Opacity only, 150 ms. No rotation, travel, scan-line sweep or spinners (spinners become a static 3/4 arc) |

Every spring keeps bounce at or below 0.1.

## 4. Tokens added by this part
Add these to the theme next to `--cat-*`:

| Token | Value | Use |
|---|---|---|
| `--cat-medicine-tint` / `-paper` | `#BCD2F3` / `#E4EDFB` | illustration tint / tile paper |
| `--cat-vehicle-tint` / `-paper` | `#F4CDA8` / `#FCEBDB` | illustration tint / tile paper |
| `--cat-appliance-tint` / `-paper` | `#B2E0D0` / `#DFF3EB` | illustration tint / tile paper |
| `--cat-other-tint` / `-paper` | `#D3CBE3` / `#EDE9F4` | illustration tint / tile paper |
| `--quote-bg` / `--quote-line` / `--quote-mark` | `#FFF8F7` / `#F3D3CF` / `#FAD9D5` | NoticeQuote |
| `--range-fill` | `#F4C9C4` | RangeBar listed range |
| `--band-muted` | `#FFD9D6` | secondary text on the red band (5.34:1) |
| `--photo-table` | `#E7E2D9` | ScanConfirm letterbox |

Contrast checked (WCAG 2.x):
- text: white on `--danger` 6.95; `--band-muted` on `--danger` 5.34; `--danger` on `--danger-soft` 5.97; `--cobalt` on `--cobalt-soft` 5.29; `--success` on white 5.33; `--warning` on `--warning-soft` 5.09; `--ink-muted` on `--cobalt-soft` 5.75 and on `--surface-2` 6.25
- graphics: category marks on their paper 3.69–5.59; `--line-strong` on white 3.28

## 5. Acceptance checklist
- [ ] `/mine` at 1536×790 matches `mine-1536.png`: both alert cards fully above the fold, "Open case" visible on both.
- [ ] `/mine` full page matches `mine-full-1536.png`; `scrollWidth` is 1536 at 1536 and 390 at 390 (no horizontal scroll).
- [ ] At 390 the Paracetamol footer reads "Notice published 01 Jul 2026 — 11 days — You bought it 12 Jul 2026" with no overlapping labels, and the Jeep RangeBar shows only "2021 · Yours 2022 · 2023".
- [ ] The near-miss underlines only the 6th character of both chips, in `--cobalt`.
- [ ] `?state=flip`: the Swift card flips at 1.5 s, holds 700 ms, moves into the clear grid in A–Z order, the legend changes to "1 checking → 0" and "11 → 12 no match", and the headline is unchanged.
- [ ] `/mine?state=add-confirmed` matches `mine-add-1536.png` and `mine-add-390.png`: 9 word boxes, one cobalt, the leader ends at the callout's FT5427, the Batch field chip has the cobalt ring, and "Check this batch" is enabled.
- [ ] Each of `add-uploading`, `add-reading`, `add-candidates` and `add-failed` renders its copy from §2.12 exactly.
- [ ] No "recalled" next to a CDSCO row, no "safe" anywhere, no emoji, no gradient except `--foil`.
- [ ] Tab order: nav → banner button → filters → cards in sort order → Add tile. The sheet traps focus and returns it to the opener.

---

## 6. Jury critique (Best UI pass)

Reviewed `mine-1536.png`, `mine-full-1536.png`, `mine-390.png`, `mine-add-1536.png` and `mine-add-390.png` against `feed-1536.png`, `feed-390.png` and `case-1536.png` for shell and pattern consistency.

**Grade before: 7.5 / 10.** The concept is strong. The outcome sentence, the foil household strip with two red pills, and the FT5427 = FT5427 chips explain the screen in about 3 seconds. The Textract boxes drawn on the photo are the kind of detail a jury remembers. What cost points was polish: one glyph that looked broken, ragged card edges, copy and data that disagreed with themselves or with the Feed, and a 390 sheet that clipped its own form.

### The 8 most damaging problems
1. **A glyph that looks broken in the hero area.** The household strip's time "15:08" was set in Doto. Doto draws the colon as a dotted vertical bar, so it read "15↕08". It also broke the type rule: Doto is only for printed codes on FoilChips.
2. **The 390 add sheet clipped its own form.** The Expiry row sat behind the fixed "Check this batch" footer, so only the top of its "3" disc showed above the footer's border. A stray bottom-left viewfinder corner also showed as an "L" beside the batch callout.
3. **Ragged clear grid.** Cards with two-line names (Butterfly, Crompton, Havells, Hawkins, Prestige) were 14–16 px taller than the others in their row. That left all three rows uneven at the bottom.
4. **Ragged second row.** The near-miss card ended 45 px above the checking card beside it, in the row directly under the alerts.
5. **The photo tag and its field disagreed.** The tag on the photo read "1 Name", but the field it numbers reads "1 Medicine".
6. **Data disagreed with the Feed.** This screen said "the next poll is at 15:23", while the Feed said "last poll 15:05 IST · next at 15:20". Pollers run every 15 minutes, so a judge who switches tabs sees two schedules.
7. **Misaligned legend.** The "checking" swatch's arc sat 4 px outside its 12 px swatch, so that row was wider and off-centre. The swatches came in three visual sizes (12, 14 and 16 px). The two-digit "11" pushed "no match" out of line with the other labels.
8. **Sheet form rhythm at 1536.** "Bought on" sat 7 px below "Expiry" on the same row, because the first-row padding leaked into the pair's first cell. The note under the CTA also wrapped to leave "demo household" alone on its own line.

Also fixed (smaller):
- The banner's muted tail repeated the sub line ("15 real products, checked against the live notices"). It now says what the copy is for.
- At 390, "Demo household" appeared twice within 60 px: in the nav pill and again in the banner.
- At 390, "JUL-2026" split at its hyphen in the quote's citation, and "Jul 2026" was left alone on its own line in the meta.
- At 390, the "Checking · 2 of 4" chip floated alone at the right edge, while the near-miss chip sits at the left.
- The sub line's second sentence began at the end of line 1 ("…at 15:08 IST. Each").

### What changed (surgical, the concept is untouched)
| # | Fix | Files |
|---|---|---|
| 1 | The strip time is now Onest 700 12 px, tabular, `#1B3563` | `mine.html` |
| 2 | 390 sheet: starts at y 28; body `align-content:start`; lede and date hint hidden; field rows 8 px padding; Batch chip 44 px / 30 px; bottom-left viewfinder hidden. The whole form now ends at y 727, above the footer at y 740 | `mine-add.html` |
| 3 | Clear cards and the AddTile use `align-self:stretch`. Every clear row is now even | `mine.html` |
| 4 | Near-miss and checking cards stretch; the near-miss centres its chip block in the extra height. Both are 300 px | `mine.html` |
| 5 | The photo tag reads "1 Medicine" | `mine-add.html` |
| 6 | The sub line reads "…the next poll is at 15:20", matching the Feed | `mine.html` |
| 7 | Legend swatches are all 14 px, with the checking arc inside the swatch; the count column is 20 px | `mine.html` |
| 8 | The Expiry and Bought on labels share a baseline (`.fields > .f:first-child`). The note reads "Checks CDSCO, CPSC, NHTSA and openFDA · saves to your own copy" on one line | `mine-add.html` |
| + | Banner tail: "Copy it to add your own things." At 390: **"Read-only demo"** / "Copy it to add things". Sub sentence 2 on its own line. No-break spans for "JUL-2026" and "bought 12 Jul 2026". At 390 the checking chip is left-aligned | `mine.html` |

The exact strings above are also updated in §2.1, §2.2, §2.3, §2.5, §2.6, §2.11 and §2.12. The sheet now sits at y 155 with a height of 635 at 1536, and at y 28 at 390. `scrollWidth` was checked on every shot: 1536 / 1536 / 390 / 1536 / 390.

**Grade after: 8.5 / 10.** Nothing on the screen looks broken now, every row is even, and the numbers agree with the Feed. The sheet reads the same in the photo and in the form, and the whole 390 scan form is visible in one view. The headroom left is conceptual rather than polish. The filter row is still dense, with 10 controls on one line. The status filters (2 + 1 + 11) don't add up to "All 15" while the Swift is checking. The 390 wall is still a long single column of 11 clear cards.
