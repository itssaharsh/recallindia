# Feed, Ingest and API (v3 "Cobalt & Foil")

This part covers the three public, data-first screens in the new app shell: `/feed` (moved from `/`), `/ingest` and `/api`. The shell (64 px top nav, 56 px mobile top bar and 68 px bottom tab bar) is owned by the shell part. Here it only changes which tab is active.

Mockups (static HTML in `/v3/mock/`, shot with `v3/shoot.mjs`):

| File | State |
|---|---|
| `mockups/feed-1536.png` | `/feed`, first viewport, default state |
| `mockups/feed-full-1536.png` | `/feed`, full page |
| `mockups/feed-sheet-1536.png` | `/feed?notice=cdsco_nsq%23JUL-2026-cdsco_portal-005f85bb4ee1`, with the notice sheet open on the CDSCO Aceclofenac row |
| `mockups/feed-390.png` | `/feed` at 390 × 844 |
| `mockups/ingest-1536.png` | `/ingest?state=dissolving`: row 9 is in flight, 8 notices have landed |
| `mockups/ingest-390.png` | the same state at 390 × 844 |
| `mockups/api-1536.png` | `/api` after the first request (`200 · 48 ms · 5 notices`) |
| `mockups/api-390.png` | the same state at 390 × 844 |

Sources: `v3/mock/feed.html`, `feed-sheet.html`, `ingest.html` and `api.html`. The generators live in `v3/work-fia/`.

---

## 0. Shared rules for these three screens

### 0.1 Source identity (derived tokens)
Each source uses one category ramp from `/mine`, so a colour always means the same kind of thing. CDSCO is medicine, CPSC is appliance (consumer products), NHTSA is vehicle and openFDA is other (US drugs and devices). Add these tokens to `globals.css` next to the category ramps. The `-ink` values are new: they are the text colour used on the `-bg` tint, and every pair reaches AA.

| Token | CDSCO | CPSC | NHTSA | openFDA |
|---|---|---|---|---|
| `--src-*-c` (mark: bars, dots, illustration strokes) | `#0A58C2` | `#0E8A6A` | `#C25E00` | `#6A5C8A` |
| `--src-*-ink` (text on `-bg`, big numbers) | `#0A58C2` (5.6:1) | `#0B6E55` (5.4:1) | `#9A4A00` (5.4:1) | `#5B4E7A` (6.2:1) |
| `--src-*-t` (tint inside illustrations) | `#BCD2F3` | `#B2E0D0` | `#F4CDA8` | `#D3CBE3` |
| `--src-*-bg` (tile and chip paper) | `#E4EDFB` | `#DFF3EB` | `#FCEBDB` | `#EDE9F4` |

API ids map to labels as follows: `cdsco_nsq` → **CDSCO**, `cpsc` → **CPSC**, `nhtsa` → **NHTSA** and `openfda` → **openFDA**. The labels always use exactly this casing.

### 0.2 Shared components
- **SourceChip**: 24 px tall pill. Padding is 0 9 0 8, with an 8 × 8 px swatch (radius 3) in `--src-*-c`. Text is Onest 700 12/1, letter-spacing .04em, `--src-*-ink` on `--src-*-bg`. The copy is the source label only.
- **IdChip**: 26 px tall (22 px inside dense rows). Padding is 0 8, radius 6, background `--surface-2`, text IBM Plex Mono 400 13.5 px in `--ink`. It is used for batch, lot, model, date codes, notice ids and API ids. Doto on foil is used only for the batch in the notice sheet and never in rows.
- **ObjectTile**: radius 12 (radius 10 at 44 px or smaller) on `--src-*-bg`, holding a 64-box two-tone illustration at 76 %. The set comes from `/mine`: `il-strip`, `il-suv` and `il-stove`. This part adds `il-sauna`, `il-board`, `il-grill`, `il-mattress`, `il-helmet`, `il-bottle`, `il-tube`, `il-vial` and `il-doc`, all in `v3/mock/*.html` `<defs>`. The tile is picked from the notice's product words: `tablet|capsule` → strip, `injection|vial` → vial, `sauna` → sauna, `toy|board` → board, `grill` → grill, `range|stove|cooktop` → stove, `mattress` → mattress, `helmet` → helmet, `sunscreen|gel|cream` → tube, `openFDA drug` → bottle, `NHTSA` → suv, and anything else → the source default (`il-strip`, `il-stove`, `il-suv` or `il-bottle`).
- **FilterPill**: the same component as `/mine`. It is 44 px tall (40 px at 390) with padding 0 16, and has a 1 px `--line` border on `--surface-1`. Selected is `--ink` background with white text. The count is Onest 600 13 in `--ink-muted` (`#C9D3E3` when selected). A source pill carries a 10 × 10 px swatch.
- **HealthDot**: an 8 px dot with a 3 px soft ring. Healthy is `--success` on `--success-soft`, slow is `--warning` on `--warning-soft`, and down is `--danger` on `--danger-soft`. Red is used here only because "a source that is down" is on the brief's allowed list.
- **Field**: 44 px tall, radius 8 (`--r-sm`), 1 px `--line-strong` border (3.3:1) and padding 0 14. The label sits above it in Onest 600 13, with an optional hint in Onest 400 13 `--ink-muted`.

### 0.3 Copy rules applied here
- A CDSCO row is never "recalled". It reads "Failed CDSCO quality test" and its id reads `{MONTH-YYYY} · row {n}`.
- Nothing is ever called "safe". The household check reads "No match in the demo household as of {HH:MM}".
- Every number comes from the API or from the recorded run (see "Data" under each component). The mockups use live values read on 20 Sep 2026.

### 0.4 Motion tokens (Fluid personality)
| Token | Value |
|---|---|
| `spring-snappy` | stiffness 420, damping 36, mass 1 (≈ 250 ms, bounce 0.04) |
| `spring-soft` | stiffness 320, damping 34 (≈ 320 ms, bounce 0.05) |
| `spring-flight` | stiffness 380, damping 34 (≈ 420 ms, bounce 0.06) |
| `ease-draw` | `cubic-bezier(.2,.8,.2,1)` |
| `ease-page` | `cubic-bezier(.65,0,.35,1)` |
| `fade` | 160 ms linear |

With `prefers-reduced-motion: reduce`, only opacity changes remain: no translation, scale, rotation, path drawing or number rolling. Each screen names its one orchestrated load sequence. Everything else is a reaction to a state change.

---

## 1. `/feed`: the notices feed

**Purpose**: show in 10 seconds that one live feed holds 4,868 notices from 4 regulators, that the Indian drug-quality alert is the headline, and that the feed is already checked against your things. Every row opens the full notice, as published.

### 1.1 Layout
| Region | 1536 × 790 | 390 × 844 |
|---|---|---|
| Top nav / top bar | 64 px, Feed tab on | 56 px top bar and 68 px bottom tab bar, Feed on |
| Page gutter | 32 px, content 1472 px | 16 px, content 358 px |
| Hero | y 90, height 241. Left `HeroStat` 560 px, gap 40, right `SourceCards` 872 px (two cards, 429 + 14 + 429) | `HeroStat` 119 px (no mix bar), then a 2 × 2 `SourceCards` grid of 174 × 84 cards (gap 10) |
| Filter bar | y 357, 44 px | y 407, 44 px, scrolls sideways, no search field (search opens from the top bar) |
| Household match banner | y 417, 56 px (+1 px border each side) | y 467, 150 px: lead, one row of two pills, full-width button |
| Notice list card | from y 491. Group header 69 px (CDSCO) or 46 px (date), rows 101 px, so the third CDSCO row peeks at 790 | from y 631. CDSCO header 80 px (tile 40, title Funnel 700 16, sub Onest 13, height auto), date headers 42 px, rows as stacked cards of 200–230 px; the first row starts at y 712, above the tab bar |
| Load more | 68 px footer inside the list card | full-width button |

Reading order: live line → 4,868 → headline → sub → source mix bar → CDSCO card → US regulators card → filters → household match banner → latest CDSCO alert group → dated groups → load more.

**First 10 seconds**: the only orchestrated load sequence. The 4,868 rolls up from 4,800 with NumberFlow (600 ms). The source mix bar segments grow left to right (each 320 ms `ease-draw`, 60 ms stagger). The 11 CDSCO month bars rise (each 280 ms `spring-soft`, 30 ms stagger, JUL-2026 last with its label fading in). The first 6 rows fade up 8 px (`fade` + `spring-soft`, 40 ms stagger). The whole sequence ends by 1.1 s.

**Data**: `GET /v1/stats` gives `total`, `sources[].count`, `health`, `last_success_at`, `polls_every` and `pollers[].last_counts.fetched` (239). `GET /v1/notices?limit=50` (plus `source`, `since`, `q` and `cursor`) gives the rows. `public/data/cdsco-months.json` is written at build time (see 1.3.3). The household match banner uses the same household-check data as `/mine`.

### 1.2 HeroStat
- **Purpose**: the product in one number.
- **Placement**: top left of the hero.
- **Size / tokens**:
  - Live line: Onest 500 13, `--ink-muted`, 8 px success dot with a 4 px soft ring.
  - Number: Funnel Display 800 108/0.8, letter-spacing −.05em, `--cobalt`, tabular.
  - Headline: Funnel Display 800 30/1.02, `--ink`, max width 250, bottom-aligned to the number, 18 px gap.
  - Sub: Onest 400 16/1.5, `--ink-muted`, max width 560, one sentence (the monthly CDSCO figure lives in the CDSCO card, not here).
  - At 390: number 66 px, headline 19 px. The sub is replaced by the key sentence in Onest 600 14.5 `--ink`, letter-spacing −.01em, on one line, because the CDSCO chart is hidden at that width. The source mix bar is hidden too: the 2 × 2 source tiles carry the same four counts.
- **Copy**:
  - Live line: "Live · last poll {HH:MM} IST · next at {HH:MM}"
  - Number: "{total}"
  - Headline: "notices from {sources_count} regulators, in one feed"
  - Sub (1536): "Drug-quality failures from CDSCO and recalls from CPSC, NHTSA and openFDA, each one checked against the things in your house."
  - Sub (390): "**{latest_month_count} drug samples failed CDSCO tests in {Month YYYY}.**"
- **States**:
  - loading: the number shows "–,–––" in `--line` and the other lines are skeleton bars.
  - live: as mocked.
  - stale: "Last poll {HH:MM} IST · {n} min late" with a warning dot. This appears once 2 polls are missed (30 min).
  - error: the live line reads "Can't reach the feed right now · showing the last copy from {HH:MM}". The number stays.
- **Transitions / motion**: when a poll adds notices, the number ticks with NumberFlow (240 ms). This is the only motion here after load.
- **Keyboard / a11y**: `<h1>` is "4,868 notices from 4 regulators, in one feed". The live line is `role=status` and announces only when the count changes.
- **Acceptance**: `?state=feed-loading`, `?state=feed-stale`, `?state=feed-error`.

### 1.3 SourceCards
Two different cards (no row of identical cards): the CDSCO feature card and the US regulators list card.

#### 1.3.1 Source mix bar (under the sub, left column)
- A 10 px bar, radius 999, with 3 px gaps. Segments use `--src-*-c` and flex equal to each count (NHTSA gets a 6 px minimum).
- The legend below is Onest 500 12.5 `--ink-muted` with an 8 px swatch: "CDSCO 55%", "CPSC 38%", "openFDA 6%", "NHTSA 1%" (rounded shares of `count/total`).
- Clicking a legend item applies the same filter as the source pill.
- It has `aria-label="Share of notices by source"`, and a visually hidden list carries the numbers.

#### 1.3.2 CDSCO feature card (429 × 241)
- **Anatomy**:
  - Header row: 60 px ObjectTile (`il-strip`), then "CDSCO" in Funnel 800 20 with "India · drug quality alerts (NSQ)" in Onest 13 `--ink-muted`, then the count in Funnel 800 44 `--src-cdsco-ink`.
  - MonthlyBars panel on `--src-cdsco-bg`, radius 10.
  - HealthLine.
- **MonthlyBars**:
  - The left caption reads "FAILED IN THE / JUL-2026 ALERT" (Onest 600 11, uppercase, `#3A5A8C`) above "239" (Funnel 800 34 `--cobalt`).
  - The right side has 11 bars, 64 px tall, 5 px gap, radius 4 4 2 2. Past months are `#AFC8EE` and the latest month is `--cobalt`. The latest bar has no value label: the "239" on the left already names it.
  - Axis labels "SEP 2025" and "JUL 2026" sit at the ends.
  - Values (real, 20 Sep 2026): SEP-2025 112, OCT 211, NOV 216, DEC 175, JAN-2026 218, FEB 217, MAR 190, APR 121, MAY 162, JUN 193, JUL 239.
- **HealthLine**: "**Healthy** · polled {HH:MM} yesterday · daily". Slow reads "**Slow** · last success {HH:MM} · daily" (warning). Down reads "**Down** since {HH:MM} · retrying daily" (danger).
- **States**: loading (skeleton bars at 30 % height), healthy, slow, down, and "no months" (the chart panel is hidden and the card shrinks to its header and health line).
- **Motion**: bars rise on load (see first 10 s). When a new month arrives, the new bar grows from 0 and the old latest bar recolours to `#AFC8EE` over 240 ms.
- **At 390**: this card becomes a 174 × 84 tile (30 px tile, name, count in Funnel 800 24, health dot + "Yesterday", because a bare "23:54" next to the US tiles' "15:08" reads as later in the day). The chart and the long health text are hidden.
- **a11y**: the chart is `role=img` with `aria-label="Drug samples failed per CDSCO monthly alert, Sep 2025 to Jul 2026"`, and a visually hidden table holds the 11 values.
- **Data**: the count is `/v1/stats sources[cdsco_nsq].count`. The latest month and 239 come from `pollers[cdsco_portal].last_counts.fetched` and the latest `row_ref.month`. The months come from `public/data/cdsco-months.json`, written by a prebuild script (`scripts/cdsco-months.mjs`) that pages `/v1/notices?source=cdsco_nsq&limit=100` and counts by `row_ref.month`. It falls back to "no months" if the file is missing.
- **Acceptance**: `?state=src-slow`, `?state=src-down`, `?state=src-nomonths`.

#### 1.3.3 US regulators list card (429 × 241)
- A header "US REGULATORS · POLLED EVERY 15 MIN" in Onest 600 12, uppercase, `--ink-muted`.
- Three rows, 65 px each, with 1 px `--line` dividers. Each row is: 44 px ObjectTile (`il-stove` CPSC, `il-bottle` openFDA, `il-suv` NHTSA) · name in Funnel 800 17 with coverage in Onest 13 ("Consumer products" / "Drugs and medical devices" / "Vehicles") · HealthDot + "{HH:MM}" · count in Funnel 800 26 `--src-*-ink`, right-aligned and 76 px wide.
- Row order is fixed: CPSC, openFDA, NHTSA (by count).
- A whole row is a button that applies that source filter: 44 px minimum, focus ring 3 px `--cobalt` with 2 px offset, `aria-pressed` when active.
- **At 390**: each row becomes its own 174 × 84 tile in the 2 × 2 grid, in the order CDSCO, CPSC, openFDA, NHTSA.

### 1.4 FilterBar
- **Anatomy**:
  - Pills: "All {4,868}", "CDSCO {2,696}", "CPSC {1,852}", "openFDA {282}", "NHTSA {38}".
  - A 1 × 28 px divider.
  - A time menu pill with a calendar icon: "Any time" ▾. The options are "Any time", "Last 7 days", "Last 30 days", "Since…" (date field), mapped to `since`.
  - A flexible spacer.
  - A search field, 340 × 44, pill radius, with the placeholder "Search product, batch or model" and a `/` kbd hint.
- **States**: the pill states are default, hover (`--surface-2` background), focus ring and selected (ink). The search field has empty, typing (debounced 250 ms, then `q`), and clear (an × button appears, 44 × 44 hit area).
- **Behaviour**: filters write to the URL (`?source=cdsco_nsq&since=2026-09-13&q=paracetamol`), so a view can be shared. Changing a filter replaces the list: the old rows fade to .4 for 120 ms, then new rows fade up 8 px (`spring-soft`, 30 ms stagger for the first 8 only).
- **Keyboard**:
  - `/` focuses search and `Esc` clears it.
  - The pills form a `role=toolbar` with arrow-key movement.
  - The time menu is a Radix/shadcn DropdownMenu.
- **At 390**: the bar scrolls sideways, flush to the screen edges with 16 px inner padding. Search moves to the top bar's search icon, which opens ⌘K prefilled with feed scope.
- **Acceptance**: `?source=cdsco_nsq`, `?q=paracetamol`, `?state=feed-empty` (no results).

### 1.5 HouseholdMatchBanner
- **Purpose**: link the public feed to your own things. It shows only when at least one feed notice matches the active household. Red is used because this is the "you're affected" case.
- **Size / tokens**:
  - 56 px pill (radius 999) on `--danger-soft` with a 1 px `#F3CFCB` border and padding 6 6 6 8.
  - A 40 px white circle holds the `u-alert` icon in `--danger`.
  - The lead line is Onest 600 15 `--danger`.
  - Each match is a white mini pill: 30 px round ObjectTile + product + IdChip on `--danger-soft` (`--danger` text) + source and row.
  - The button is `btn-danger`, 44 px: "See my things →".
- **Copy**:
  - Lead: "{n} notices match things in the demo household." With 1 match: "1 notice matches something in the demo household."
  - Pills: "Paracetamol `FT5427` · CDSCO JUL-2026, row 12" and "Jeep Compass 2022 · NHTSA `24V436000`".
- **States**: hidden (0 matches), matches 1–2 (pills shown), matches ≥ 3 (the first two pills + "+{n−2} more"), and loading (hidden until the household check resolves, so there is no flash).
- **Motion**: none on load (it is part of the first paint). When a new match arrives, the banner height grows with `spring-soft` and the new pill fades in.
- **At 390**: radius `--r-md`, padding 12 12 12 14, 150 px tall. The lead is Onest 600 14.5 on one line. The two pills sit on one row: 32 px, padding 0 8 0 10, Onest 13.5, no ObjectTile, the source and row text hidden (only product + batch, or product alone), IdChip 22 px. The button is full width, 44 px.
- **a11y**: `role=status`. The button is a link to `/mine?filter=alert`.
- **Data**: the `/mine` household check (`alerts[]` with `item.name`, `item.batch`, `notice.source`, `row_ref`).
- **Acceptance**: `?state=feed-nomatch` (hidden), `?state=feed-match3`.

### 1.6 NoticeList
One white card (radius 14, `--shadow-1`) holding groups. Rows are sorted newest first by `published_at` and grouped by date. One pinned group comes first.

#### 1.6.1 Pinned group: latest CDSCO alert
- **Header**: 69 px, `--src-cdsco-bg`, padding 12 20.
  - A 44 px white tile with `il-doc`.
  - Title (Funnel 700 17): "Latest CDSCO alert: {MONTH-YYYY}"
  - Sub-line (Onest 13.5 `#34496B`): "Published {DD Mon YYYY} · in the feed since {DD Mon}, {HH:MM} IST" (the count is already on the button)
  - A secondary button, 36 px, white: "Show all {n} rows". It applies `?source=cdsco_nsq&month=JUL-2026`, which filters on the client by `row_ref.month`.
- **Rows**: the first 3 rows of that alert, in row order of the published list.
- **Why pinned**: India's drug alert is the product's reason to exist. Otherwise it would sit pages below the US poll results, because CDSCO publishes monthly.
- The group is hidden when a source other than CDSCO is selected.

#### 1.6.2 Date group header
- 46 px tall, `#F7F9FD`, bottom border `--line`, padding 0 20.
- Left: "**{Weekday}, {DD Mon YYYY}**" followed by "{n} notices · {Source a} {n_a}, {Source b} {n_b}" (a single source drops its count: "14 notices · CPSC").
- Right: "Showing {k} of {n}".
- A group with more than 6 loaded rows shows 5 and ends with a text button "Show {n−5} more from {DD Mon}".
- Counts are the rows loaded for that date. Group counts never claim totals the API didn't return.

#### 1.6.3 NoticeRow
- **Grid at 1536**: `56px | minmax(0,1.2fr) | 220px | minmax(0,1.3fr) | 120px | 20px`, gap 20, padding 14 20, height 101, bottom border `--line`.
- **Anatomy, in reading order**:
  1. ObjectTile, 56 px.
  2. Main:
     - SourceChip + id in IBM Plex Mono 12.5 `--ink-muted`. The id is `{row_ref.month} · row {row_ref.row}` for the CDSCO portal, `{Month YYYY} · page {page}, row {row}` for CDSCO PDFs, and `notice_id` otherwise.
     - Title: `product`, Onest 600 16.5, one line with ellipsis.
     - Maker: `brand`, Onest 13.5 `--ink-muted`, one line.
  3. Identifiers: a label (Onest 600 11, uppercase, `--ink-muted`) above IdChips.
     - CDSCO batches → "BATCH". openFDA batches → "LOT". CPSC batches → "DATE CODES". `model` → "MODEL". NHTSA `vehicles[]` → "MODEL YEARS" (`year_from`–`year_to`, one chip per year when they differ).
     - With nothing to show: the label "MODEL OR BATCH" and the text "None listed" in Onest 13 `--ink-muted`.
     - At most 3 chips, then "+{n}".
  4. Hazard: a label in Onest 600 14 `--ink` above the description in Onest 14 `--ink-muted`, clamped to 2 lines.
     - CDSCO label: "Failed CDSCO quality test". The description is `hazard_or_failed_test` (e.g. "Content of Aceclofenac (82.94%)").
     - openFDA: the text before the first ":" if there is one (e.g. "Subpotent product"), else "Failed dissolution" when the text matches /dissolution/i, else "Quality problem". The description is the rest.
     - CPSC keyword map on `hazard_or_failed_test`: fire+burn → "Fire and burn hazard", explosion → "Fire and explosion hazard", fire → "Fire hazard", shock|electrocution → "Electric shock hazard", choking|small parts → "Choking hazard", magnet → "Magnet ingestion hazard", head injury → "Head injury hazard", lead → "Lead poisoning hazard", tip-over → "Tip-over hazard", else "Safety hazard". The description is the first sentence without the leading "The recalled …" clause.
     - NHTSA: "Crash risk" if the text contains "crash", else "Injury risk". The description is the text after the last ":".
  5. End column:
     - Date `published_at` as "DD Mon YYYY", Onest 500 14 `--ink`.
     - A remedy chip below it (22 px, `--success-soft`/`--success`, Onest 600 12) from the `remedy` suffix after the last ";": Repair → "Free repair", Refund → "Refund", Replace → "Replacement", none → no chip.
  6. A chevron, 20 px, `--line-strong`.
- **States**:
  - default.
  - hover: `#F7F9FD` background, `--cobalt` chevron.
  - focus-visible: a 3 px `--cobalt` ring inset 2 px.
  - selected (sheet open): `#F0F5FD` background with a 2 px inset `--cobalt` ring (`aria-current=true`).
  - new: arrived by a poll after page load. It gets a `--cobalt-soft` background that fades to white over 2 s, with a "New" chip (22 px, `--cobalt` background, white 11.5 700) before the date.
  - household match: the row gets a 22 px `--danger-soft` chip "In your things" beside the date. The row keeps its normal colours, and red appears only on that chip.
  - loading skeleton: tile, 3 bars, 2 bars and a date bar in `--surface-2`, pulsing opacity .6 ↔ 1 over 1.2 s (static with reduced motion).
- **Interaction**: the whole row is one `<a href="/feed?notice={pk}">` that opens the NoticeSheet. Middle-click opens the same URL in a tab.
- **At 390**: a card with grid `48px 1fr`. Tile and main sit side by side, identifiers go under the title (label hidden), and hazard and the date/remedy row span the full width. The title clamps to 2 lines. There is no chevron.
- **Keyboard / a11y**:
  - The list is `<section aria-label="{group title}">` → `<ul>` → `<li>`.
  - `j`/`k` move focus between rows and `Enter` opens the sheet.
  - The accessible name is "{product}, {Source label}, {hazard label}, {date}".
- **Data**: `/v1/notices` fields `pk`, `source`, `notice_id`, `row_ref`, `product`, `brand`, `batches`, `model`, `vehicles`, `hazard_or_failed_test`, `remedy`, `published_at`, `first_seen_at`.
- **Acceptance**: `?state=feed-loading`, `?state=feed-new` (3 new rows on top), `?state=feed-error`.

#### 1.6.4 List states
- **Empty (filters)**: a centred 64 px `il-doc` tile, then "No notices match "{q}" in {Source}." and a secondary button "Clear the search".
- **Empty (since)**: "Nothing published since {DD Mon}." and a button "Show any time".
- **Error**: "The feed didn't load. The last poll finished at {HH:MM} IST." and a primary button "Try again".
- **New since load**: a sticky pill appears 12 px under the filter bar: "{n} new notices since {HH:MM} · Show them" (cobalt, 36 px). Clicking inserts the rows (layout animation 280 ms) and scrolls to the top of the list.

#### 1.6.5 LoadMore
A 68 px footer on `#F7F9FD`, holding a secondary button "Load 50 older notices" and the text "Showing {k} of {total} · newest first". It uses `cursor=next_cursor`. While loading, the label reads "Loading…" with a 16 px spinner. When `next_cursor` is null, the footer text is "That's every notice. {total} in all."

### 1.7 NoticeSheet (`feed-sheet-1536.png`)
- **Purpose**: the full notice as published, the household answer and the next action, without leaving the feed.
- **Placement**:
  - At 1536: fixed right, full height (it overlays the nav), 580 px wide, radius 22 0 0 22. Shadow `0 2px 6px rgba(11,27,51,.1), -24px 0 60px -20px rgba(11,27,51,.45)`. Scrim `rgba(11,27,51,.34)`.
  - At 390: a bottom sheet 24 px from the top, radius 22 22 0 0, with a 36 × 4 grab handle.
- **Anatomy, in reading order**:
  1. **Top bar**, 64 px:
     - SourceChip + "{MONTH-YYYY} alert · row {n}" (Onest 500 14 `--ink-muted`).
     - A "Copy link" icon button (44 px, `u-link`; its tooltip reads "Copied" for 1.6 s).
     - A close button (44 px, `--surface-2` circle).
  2. **Hero**:
     - 60 px ObjectTile (radius 12).
     - `<h2>` product in Funnel 800 25/1.08.
     - Maker line: "{brand} · {town}, {district} ({state})", taken from the manufacturer cell.
  3. **Outcome sentence** (Onest 15.5/1.45, 12 px above): "Batch `{batch}` **failed a CDSCO quality test**: its content of {substance} was {pct}% of what the label claims." When the failed test is not a content percentage: "Batch `{batch}` **failed a CDSCO quality test** for {failed_test}." CPSC: "**{hazard label}.** {remedy sentence}". NHTSA: "**NHTSA recall {id}** for {years} {make} {model}."
  4. **Household check**, 61 px (padding 10 14, 12 px above):
     - Clear: `--success-soft`, radius 14, a 32 px white circle with `u-check` in `--success`. "**No match in the demo household** as of {HH:MM} · {n} medicines checked by batch, none is {batch}."
     - Match: `--danger-soft` with `u-alert`. "**This is on your strip.** {item} · batch {batch} · bought {DD Mon YYYY}", plus a button "Open case →" (`btn-danger`).
  5. **Facts**, 75 px (padding 10 4, 12 px above), a bordered box in three cells:
     - BATCH: foil chip in Doto 22, e.g. MT250239.
     - MANUFACTURED: Funnel 700 20.
     - EXPIRES: Funnel 700 20.
     - NHTSA uses Make / Model / Years. CPSC uses Model / Date codes / Units when present, and the cell is omitted otherwise.
  6. **ContentBar** (only when the failed test matches `/\(([\d.]+)%\)/`):
     - Panel `#F7F9FD`, radius 14, 84 px (padding 10 16 6, 12 px above).
     - Label "Content of {substance}" with the value "82.94%" in Funnel 800 26.
     - A 12 px track on `--surface-2` with a `--cobalt` fill. The scale is 0–110 %, so the fill is 75.4 %. A 2 px `--ink` tick at 100 % (90.9 %) is labelled "Label claim 100%", and "0%" sits at the left.
     - No acceptance range is drawn, because the notice doesn't give one.
  7. **As published by {Source}**:
     - The raw row, drawn as a table snippet: 1 px `#C9D3E1`, radius 8, Onest 12.5, cell padding 6 10, columns `44px minmax(0,1fr) 92px 150px` so the drug name and "Jun-2025 · May-2028" each stay on one line.
     - The row number sits in a 44 px column spanning 4 rows.
     - Fit rule: at 1536 × 790 everything from the top bar down to the provenance line fits above the sticky footer (the provenance line ends 9 px above it). The timeline is the first thing below the fold. A 4 px scroll thumb (`rgba(11,27,51,.16)`, radius 4, 5 px from the right edge) shows that the body scrolls. No fade gradient is used.
     - The cells are Drug / Batch (mono) / Mfg · Exp / Manufactured by (full address, spans 3) / Result (spans 3, `#F0F5FD` with a 2 px `--cobalt` underline on the text) / Drawn by / Tested by.
     - Provenance line: "cdscoonline.gov.in · NSQ drugs · {MONTH-YYYY} · id `{notice_id}`".
     - For CPSC, NHTSA and openFDA this is `raw_excerpt` in a quote block instead.
  8. **Timeline**: three 34 px steps with a 2 px `--line` spine: "Published by {Source} — {DD Mon YYYY}", "Read by RecallIndia — {DD Mon YYYY}, {HH:MM} IST" (`first_seen_at`) and "Checked against your things — Today, {HH:MM}" (the current dot is filled `--cobalt`).
  9. **Footer**, sticky, 77 px, top border:
     - Primary (flex 1): "Scan a strip for this batch" with `u-scan`. It opens `/mine`'s Add-a-thing sheet with the batch prefilled.
     - Secondary: "Open on CDSCO ↗" (`url`, new tab).
     - Other sources use "Open on CPSC ↗", "Open on NHTSA ↗" or "Open on openFDA ↗", and their primary is "Add this to my things".
- **States**:
  - loading: the header and product come from the row that was clicked, and the body shows skeletons.
  - ready: as mocked.
  - match: variant 4.
  - not found: "This notice is no longer in the feed." with a button "Back to the feed".
  - error: "Couldn't load this notice." with a button "Try again".
- **Motion** (the sheet's only sequence):
  - At 1536 the sheet enters from x = 100 % to 0 with `spring-soft` (≈ 320 ms, bounce ≤ .05) and the scrim fades 0 → .34 over 200 ms. It exits to x = 100 % over 220 ms `ease-page` with the scrim 180 ms.
  - At 390 the sheet slides on y, and dragging the handle down by more than 120 px or faster than 600 px/s closes it.
  - The ContentBar fill grows 0 → 75.4 % over 360 ms `ease-draw`, starting 120 ms after the sheet settles.
  - Nothing else moves.
- **Keyboard / a11y**:
  - `role=dialog`, `aria-modal=true`, `aria-labelledby` pointing at the product `<h2>`.
  - Focus moves to the close button, and focus is trapped inside the sheet.
  - `Esc` or a scrim click closes the sheet and returns focus to the row.
  - `←`/`→` open the previous or next row without closing.
  - Body scroll is locked while the sheet is open.
- **Data**:
  - The row object comes from the list.
  - On a deep link, `GET /v1/notices/{pk}` with the pk URL-encoded, e.g. `cdsco_nsq%23JUL-2026-cdsco_portal-005f85bb4ee1`.
  - The manufacturer cell and the Drawn by / Tested by cells are split from `raw_excerpt` on " | ", in the order drug, batch, mfg, exp, manufacturer, result, drawn by, tested by, month.
  - The household check uses the `/mine` data.
- **Acceptance**: `?notice={pk}`, `?state=sheet-loading`, `?state=sheet-match` (open FT5427 against the JUL-2026 row 12), `?state=sheet-notfound`.

---

## 2. `/ingest`: watch a PDF become the feed

**Purpose**: the "Ship It" proof. A real CDSCO NSQ PDF is read by Textract, and every table row visibly leaves the page and lands as a notice. Keep v2's behaviour (pdf.js page, a box drawn per row, the row flies into the list, the counter ticks, 5-step checklist, replay) and restyle it.

### 2.1 Layout
| Region | 1536 × 790 | 390 × 844 |
|---|---|---|
| Header | y 86, 66 px: title + sub on the left, ReplayChip + SpeedToggle on the right | title 2 lines (28 px), 1-line sub, ReplayChip full width + SpeedToggle, 144 px in all |
| StepChecklist | y 168, 58 px card, 5 steps with connectors | 56 px (icons and connectors only) + a caption line 18 px |
| Workspace | y 242, 528 px tall. Grid `1fr 430px`, gap 32 | one column. PdfViewer 300 px, gap 48, NoticesPane (auto) |
| PdfViewer | 1010 × 528: toolbar 44 + desk 482 | 358 × 300, desk zoom .70 (pannable) |
| NoticesPane | 430 × 528: header 83, progress 6, list, footer 36 | 358 wide. Header 72, slot, rows 57 |
| Ghost layer | absolute over the workspace, z 4 | same, flying downwards |

Reading order: title → sub → replay → checklist → PDF (page, current row) → flying ghost → counter → landed rows.

**First 10 seconds**: this is the page's single orchestrated sequence, the replay (§2.6). It autostarts 400 ms after the PDF's first page renders. Within 10 s the viewer sees Fetch ✓, the Extract sweep, the first 3 rows box-and-fly at full choreography and the counter reach 3.

**Data**: the recorded run of the CDSCO NSQ June 2025 PDF (6 pages, 57 table rows, 55 notices, Textract TABLES, 27.1 s end to end), from the same replay bundle v2 uses. The fields this UI needs:
- `run.started_at`
- `steps[5].{key, ms}`: Fetch PDF 1,400, Extract tables 22,300, Normalise 2,100, Diff vs last run 800, Publish 500
- `pages`
- `rows[].{page, index, bbox:{left,top,width,height} (0–1 of page), cells[8]}`
- `notices[].{row_index, product, batches[0], hazard_or_failed_test}`
- `diff.{created, updated, unchanged}`

The live counters (`rows_in 57`, `notices_out 55`) match `/v1/stats pollers[cdsco_pdf].last_counts`.

### 2.2 Header, ReplayChip and SpeedToggle
- **Title**: `<h1>` in Funnel 800 34, "Watch a PDF become the feed".
- **Sub**: Onest 15.5 `--ink-muted`, "CDSCO's NSQ alert for {Month YYYY} is a {pages}-page PDF. Textract reads its tables, and every row becomes a notice." At 390: "CDSCO's {Month YYYY} alert, read row by row."
- **ReplayChip**:
  - A 44 px pill, `--cobalt-soft`, `--cobalt` text, `u-replay` icon.
  - Playing: "**Replay** recorded run · {DD Mon}, {HH:MM} IST"
  - Paused: "**Paused** · row {n} of {rows}", with a play icon.
  - Done: "**Replay again**"
  - Clicking toggles pause and play. When done, it restarts.
- **SpeedToggle**: a 44 px circle labelled "1×", "2×" or "4×". It cycles, and changes all durations in §2.6 (divide by the speed). The step labels always show the recorded real durations.
- **Keyboard**: `Space` plays or pauses (unless focus is in a field), `R` restarts and `1`/`2`/`4` set the speed. `aria-pressed` reflects playing.
- **Acceptance**: `?state=paused`, `?state=done`, `?speed=2`.

### 2.3 StepChecklist
- **Anatomy**: a card with padding 12 18. Five steps, each a 32 px status disc + label (Onest 600 14.5) + sub-line (Onest 13). The 2 px connectors between them flex.
- **Steps, copy and states**:

| # | Label | pending | running | done |
|---|---|---|---|---|
| 1 | Fetch PDF | "Waiting" | "Downloading · {kb} KB" | "{1.4} s · {6} pages" |
| 2 | Extract tables | "Waiting" | "Textract TABLES · page {p} of {pages}" | "{22.3} s · Textract TABLES · {57} rows" |
| 3 | Normalise | "Waiting" | "{elapsed} s · row {n} of {57}" | "{2.1} s · {55} notices from {57} rows" |
| 4 | Diff vs last run | "Waiting" | "Comparing {55} notices" | "{0} new · {0} changed · {55} unchanged" |
| 5 | Publish | "Waiting" | "Writing to the feed" | "{0.5} s · {n} new in the feed" or "Nothing new to publish" |

- **Disc styles**:
  - pending: a 2 px `--line` ring holding the step number (Onest 700 13 `--ink-muted`), with the label in 500 `--ink-muted`.
  - running: a `--cobalt-soft` disc with a 3 px `--cobalt` arc spinning (1.1 s linear infinite), label and sub-line in `--cobalt`.
  - done: a `--success` disc with a white check (16 px).
  - failed: a `--danger` disc with a white "!", and the sub-line reads "Stopped: {reason}", followed by a text button "Retry step".
- **Connectors**: `--line`, which fills `--success` left to right over 300 ms `ease-draw` when the step on their left completes.
- **Motion**: a done disc pops in (scale .6 → 1, `spring-snappy`) and its sub-line cross-fades 160 ms. With reduced motion the spinner is replaced by a static ¾ ring.
- **At 390**: discs and connectors only (30 px discs, 6 px connector margins), plus the caption "**Step {k} of 5 · {label}** · {running sub-line}".
- **a11y**: `<ol aria-label="Ingest progress: step {k} of 5">`, and the running step has `aria-current=step`. A polite live region announces each step change: "Extract tables done, 57 rows".
- **Acceptance**: `?state=step1` … `?state=step5`, `?state=failed-extract`.

### 2.4 PdfViewer and RowOverlay
- **Toolbar** (44 px, white, bottom border):
  - `u-ingest` icon in `--cobalt`.
  - The file name in IBM Plex Mono 13, "cdsco-nsq-june-2025.pdf".
  - Page pips: 6 pips of 14 × 18, radius 3. Done pages are `--cobalt-soft` with a 1.5 px `--cobalt` ring, the current page has a 2 px `--cobalt` ring, and the others are white with a 1.5 px `--line-strong` ring.
  - "Page {p} of {pages}" in Onest 600.
  - Right: the chip "Textract · TABLES".
- **Desk**: `#E4EBF4`, padding 0 26, with 14 px between pages. Pages are rendered by react-pdf (pdfjs-dist 5.4.296 pinned) at the desk width. Page shadow: `0 1px 2px rgba(11,27,51,.12), 0 8px 24px -10px rgba(11,27,51,.25)`. The mockup draws the page in HTML (Arial 10.5, 1 px `#3a3a3a` rules, `#DADADA` header row) only as a stand-in.
- **RowOverlay** is an absolutely positioned layer per page, sized from `bbox`, and never touches the canvas. Row states:
  - **pending**: nothing drawn.
  - **reading** (box drawing): a 2.5 px `--cobalt` rect with 1 px outset, drawn on with SVG `stroke-dashoffset`. The row fill is `#EEF4FD` (opacity .9, multiply). Each Textract cell gets a 1 px dashed box in `rgba(10,88,194,.55)`, inset 3 px. The **RowTag** "Row {n}" is a 23 px `--cobalt` flag (Onest 600 11.5 white, radius 6 0 0 6, padding 6 6 6 7) in the page's left margin: its right edge touches the box's left edge and it is centred on the row, so it never covers the table header or the row above.
  - **flying**: the box stays, and the row's text dissolves under a white veil (see §2.6).
  - **dissolved**: the row text is covered by a white veil at .8 opacity, so the ink reads at about 20 %. The rules stay at 35 %. The S. No. cell shows an 18 px `--cobalt-soft` disc with an 11 px `--cobalt` check. This is the "the ink has lifted off" state.
- **Auto-scroll**: when the next row is below 65 % of the desk height or on the next page, the desk scrolls so that row sits at 35 % from the top (360 ms `ease-page`). The page pip updates when the page's top crosses 50 %.
- **User control**: while the replay plays, wheel or drag on the desk pauses auto-scroll for 4 s, and a "Follow the reader" chip appears at the bottom centre (36 px pill, white, `--shadow-2`). `+`/`−` zoom 75–150 %.
- **At 390**: the desk is zoomed to .70, and the viewer pans horizontally to keep columns 1–5 (S. No. to Exp) of the current row in view. Pinch zooms.
- **a11y**: the canvas is `aria-hidden`. A visually hidden live table lists each row as it is read: "Row 9: Calcium Gluconate Injection I.P. 10 ml., batch MV24B36".
- **Acceptance**: `?state=reading` (row 9 boxed, not yet flying), `?state=dissolving` (mockup), `?page=3`.

### 2.5 NoticesPane
- **Header** (83 px, padding 16 18 12):
  - **Counter**: "{n}" in Funnel 800 64/.85 `--cobalt`, then "notices" in Funnel 800 26 `--ink`. It uses `@number-flow/react` and says "notice" when n = 1.
  - **Rows read** (right-aligned): "**{57}** rows read" (Funnel 800 22 + Onest 500 14), with "from {6} pages" below it. During step 2 this counts up as each page's tables arrive, and it is fixed from step 3 on.
- **Progress**: 6 px, radius 999, `--surface-2` track with a `--cobalt` fill = normalised / rows_in. It tweens 240 ms per tick.
- **List** (12 px side padding, 5 px gap), newest first:
  - **LandingSlot**: 50 px, 1.5 px dashed `--cobalt`, background `rgba(221,231,248,.45)`. Row badge: a 30 px `--cobalt` square (radius 8) holding the row number in white. Copy: "Landing: {product}…". It appears at the start of each flight and becomes the landed row on arrival.
  - **LandedRow**: 50 px, 1 px `--line`, radius 10, white.
    - A 30 px `--surface-2` row badge.
    - Product in Onest 600 14 with one-line ellipsis.
    - IdChip (22 px) with the batch, then the failed test in Onest 12.5 `--ink-muted`, one line with a real `text-overflow: ellipsis` on its own span (never clipped mid-letter).
    - Right: "{0.4} s ago" in Onest 12 `--ink-muted`.
    - The newest row is `#F0F5FD` with a `#B9CFF0` border and a "New" chip (22 px, `--cobalt`, white 700 11.5), which moves to the next arrival.
- **Footer** (36 px, top border): "+ {k} more · rows {a} and {b}" (or "rows {a}–{b}"). It is a button that scrolls the list.
- **Done state**:
  - The counter shows "55 notices".
  - A summary strip replaces the progress bar: "57 rows read · 55 notices · 27.1 s end to end".
  - The footer becomes two buttons: primary "See them in the feed →" (`/feed?source=cdsco_nsq&since=2025-06-01`) and secondary "Replay again".
- **Empty (before step 3)**: "Rows land here as Textract reads them." beside a 44 px `il-doc` tile in `--src-cdsco-bg`.
- **a11y**: the counter is `aria-live=polite` and throttled to one announcement per 2 s: "{n} notices". The list is `<ol reversed>`.
- **At 390**: the pane follows the viewer. Rows are 57 px and the counter is 56 px.
- **Acceptance**: `?state=dissolving`, `?state=done`, `?state=empty`.

### 2.6 Motion: the dissolve choreography (keep it exactly)
Times are for 1× speed, with t = 0 at the start of each row. All times divide by the speed.

| t (ms) | What happens | How |
|---|---|---|
| 0–240 | **The box draws on** around the row's bbox | SVG rect stroke 2.5 px `--cobalt`, `stroke-dashoffset` from its perimeter to 0 with `ease-draw`. The row fill fades in over 0–160 ms. |
| 120–240 | Cell boxes appear | Each dashed cell box fades 0 → 1 (120 ms), staggered 15 ms left to right. |
| 140–300 | RowTag drops in | "Row {n}", opacity 0 → 1 and y −6 → 0 (`spring-snappy`) |
| 240–320 | Hold | Nothing moves (the viewer reads the row) |
| 320–440 | **Lift** | A ghost is created at the row's exact rect: a DOM snapshot of the 8 cell texts on white with a 1.5 px `--cobalt` border. It scales 1 → 1.02, and its shadow goes from `--shadow-1` to `0 4px 8px rgba(10,88,194,.12), 0 24px 44px -14px rgba(11,27,51,.45)`. The LandingSlot opens at the top of the list: height 0 → 50 with `spring-snappy`, pushing the rows down (layout animation). |
| 440–860 | **Flight** | The ghost moves from the row centre to the slot centre on a cubic curve that bows upward (control points at 15 % and 70 % of dx, and at 25 % above the start). The move uses `spring-flight` on progress (bounce ≤ .06). Its size morphs from the row rect to the slot rect with framer `layout`. Rotation goes 0 → −2.5° at 50 % and back to 0 at 100 %. The ghost's content cross-fades from the table-cell snapshot to the notice-card layout (SourceChip · "{Month YYYY} · row {n}", product, IdChip + failed test) between 35 % and 60 % of progress over 160 ms. |
| 440–860 | **Trail and echoes** | A 2 px `--cobalt` dashed path (5 6) draws along the curve, following the ghost's progress. Two outline echoes (1.5 px dashed `--cobalt`, no fill) follow the ghost with 60 ms and 120 ms lag at .38 and .18 opacity. Each echo is a little wider and shorter, since it is closer to the row shape. The echoes fade to 0 by 860 ms and the trail fades out 200 ms after landing. |
| 440–740 | **The source row dissolves** | A white veil over the row text fades 0 → .8 over 300 ms, so the ink reads at about 20 %. The rules stay at 35 %. |
| 600–850 | Gutter check | An 18 px disc with a check appears in the S. No. cell, scale .6 → 1 (`spring-snappy`). |
| 860 | **Land** | The ghost replaces the slot: the slot border morphs to solid `--line` and the fill to `#F0F5FD`. The card settles with scale 1.02 → 1 (`spring-snappy`, bounce .08). The "New" chip moves to it. |
| 860–1100 | **The counter ticks** | NumberFlow n → n + 1 (240 ms). The progress bar tweens 240 ms. The Normalise sub-line updates "row {n+1} of 57". |
| 900 | The box and the tag fade out | Opacity 1 → 0 over 160 ms. The dissolved state remains. |

- **Cadence**:
  - Rows 1–3 run the full choreography back to back, 900 ms apart.
  - From row 4, a new row starts every 180 ms. Up to 3 ghosts can fly at once, and the echoes are dropped whenever 2 or more are in flight.
  - From row 20, only every 3rd ghost flies. The rows in between dissolve in place, and their notices appear in the list with a 160 ms fade. The counter still ticks once per notice.
- **Timing budget**: at 1× the whole replay takes about 16.7 s:
  - Fetch: 600 ms, with the disc spinner and then done.
  - Extract: 2.4 s, a light cobalt scan line (2 px, `--cobalt` at .35) sweeping each page top to bottom in 400 ms while "rows read" counts up.
  - Normalise: about 12.4 s.
  - Diff: 800 ms. Then all landed rows briefly flash their "New/Changed/Unchanged" state: a chip fades in on each, 30 ms stagger, max 20 visible.
  - Publish: 500 ms. The counter settles, the done state shows, and the feed's hero count elsewhere updates on its next poll.
  - The step labels still show the recorded real durations (1.4 s, 22.3 s, 2.1 s, 0.8 s, 0.5 s = 27.1 s).
- **Page turns**: when the next row is on a new page, the desk scrolls (360 ms `ease-page`), then the next box draws. There is no other page effect.
- **Pause**: everything freezes in place, including the springs (framer `animate` controls). Resume continues from the frozen progress.
- **Reduced motion**:
  - The box appears with a 150 ms fade (no draw) and the cell boxes appear together.
  - There is no ghost, trail, echo or tag drop.
  - The source row veils with a 200 ms opacity change, and the landed row fades in at the top of the list (200 ms).
  - The counter changes without rolling.
  - The rows keep the same cadence, so the replay still reads as progress.
- **Mobile (390)**: the same timeline, flying downward from the viewer to the list below. The ghost is 290 px wide. The trail and the second echo are hidden.

---

## 3. `/api`: try it, read it, trust it

**Purpose**: show that the feed is a real, public API with the same data. You can run a request, copy the curl, and see which sources are healthy.

### 3.1 Layout
| Region | 1536 × 790 | 390 × 844 |
|---|---|---|
| Header | y 86, 66 px: title + sub on the left, BaseUrl pill 644 px on the right | stacked, 178 px. BaseUrl becomes a card (label + Copy on one line, URL below at 12 px) |
| Main grid | y 170: `1fr 392px`, gap 20 | one column |
| TryItConsole | 1060 × 520, radius 22, `--shadow-2`. Form 334 px + response 724 px | form 467 px, then the response: curl card 134, status 46, JSON 496 |
| EndpointDocs | 392 × 520 card, radius 22, stretched to the console's height | full width card after the console |
| SourcesTable | y 710, full width, 336 px (peeks at 790) | full width. Id, polled-every and last-success columns hidden |

Reading order: title → sub → base URL → Try it (examples → fields → Run request) → curl → status → JSON → endpoints → sources.

**First 10 seconds** (the one orchestrated sequence): on load the first example ("CPSC this week") is selected and runs once automatically, so the console is never empty. The curl line types its query part in over 300 ms (a mask reveal, not per-character typing). The status chip pops in (`spring-snappy`). The JSON lines fade up with a 12 ms stagger for the first 18 lines only.

**Data**: `GET /v1/notices`, `/v1/notices/{id}` and `/v1/stats`. `/v1/sources` is listed, but see the open issues. The base URL is `https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com`.

### 3.2 Header and BaseUrl
- **Title**: `<h1>` in Funnel 800 34, "The same notices, as an API".
- **Sub**: "Every notice in the feed, with the row or page it was read from. Public, no key, JSON."
- **BaseUrl pill** (48 px, white, 1 px `--line`, padding 5 5 5 16):
  - The label "BASE URL" in Onest 600 12, uppercase, `--ink-muted`.
  - The URL in IBM Plex Mono 13.5 with ellipsis.
  - A secondary button, 36 px, "Copy" with `u-copy`. After copying, the label reads "Copied" with `u-check` for 1.6 s, and sonner shows nothing (the change is inline).

### 3.3 TryItConsole
**Form column** (334 px, padding 18 20 16, gap 14, right border `--line`; the Run button is pinned to the bottom with `margin-top:auto`, gap 12 and no pinning at 390):
- "Try it", Funnel 800 20.
- **Examples**: 30 px chips, radius 999, padding 0 9, 1 px `--line`, all three on one line at 1536 and 390. The active chip is `--cobalt-soft` with `--cobalt` text. The examples are:
  - "CPSC this week" (`source=cpsc&since={today−5d}&limit=5`)
  - "paracetamol" (`source=cdsco_nsq&q=paracetamol&limit=5`)
  - "Tiguan" (`source=nhtsa&q=tiguan&limit=5`)
  - Picking a chip fills the fields and runs.
- **Endpoint**: a Select with a method badge "GET" (22 px, `--success-soft`/`--success`, Plex Mono 700 11.5) and the path in mono. The options are `/v1/notices`, `/v1/notices/{id}`, `/v1/stats` and `/v1/sources`. The fields below change per endpoint: `{id}` shows one "id" field, and stats and sources show none.
- **Source**: a Select with the swatch and "CPSC · `cpsc`". It lists all 4 plus "Any source".
- **Since**: a date field with the hint "published on or after". The value is ISO `YYYY-MM-DD` in mono.
- **q** (hint "search", placeholder "e.g. FT5427") and **limit** (76 px, 1–100, default shown "5"). An invalid limit gets a 1 px `--danger` border and "1 to 100" under the field.
- **Run request**: primary, 48 px, full width, with a `u-play` icon and Onest 600 16. Loading: "Running…" with a 16 px spinner and disabled, 44 px minimum.
- The hint under it reads "⌘ ↵ runs it from any field" (Ctrl on non-Mac).

**Response column** (`#F7F9FD`):
- **CurlLine**:
  - A white box, radius 10, padding 6 6 6 14, holding a `$` prompt in mono `--ink-muted`.
  - The command in IBM Plex Mono 12.5/20, wrapping with `overflow-wrap:anywhere` and a `<wbr>` before `?`.
  - The query values are highlighted `--cobalt` on `--cobalt-soft` (radius 4).
  - A secondary button, 36 px, "Copy" (it copies the exact command, with the URL-encoded query).
  - When a field changes, the matching value flashes `--cobalt-soft` → transparent over 600 ms. The curl always mirrors the fields, even before Run.
- **StatusBar** (55 px):
  - A status chip: 26 px, `--success` with white Plex Mono 700 13 "200". 4xx uses `--warning`, and 5xx or network errors use `--danger`.
  - "**48 ms**" · "**5 notices**" · "next_cursor for page 2" (a link that runs the same request with `cursor`).
  - On the right, a segmented control "Pretty | Raw".
- **JsonViewer**:
  - White, 1 px top border, IBM Plex Mono 13/21, and a 44 px line-number gutter (`#76839A`, 3.8:1 on white).
  - Whole lines only: the viewer never shows a half-clipped line. At 1536 × 790 it shows lines 1–18 and the rest scrolls.
  - A caret column (▾ open / ▸ closed) and an 18 px indent per level.
  - Token colours: keys `--ink`, strings `--success` (#127A55), numbers `--cobalt`, null `--warning` (#8F5500), and collapsed summaries in `--ink-muted` italic ("… 20 more").
  - The first notice starts expanded and the others collapsed as one-line summaries `{ "notice_id": "10982", "product": "…", … 20 more }`.
  - Hovering a line tints it `#EEF4FD`.
  - Long strings get an ellipsis at the viewport edge. Clicking one wraps it.
  - Raw mode shows the pretty-printed text in a `<pre>` with a copy button.
- **States**:
  - idle-prefilled: first load, before the auto-run returns. It shows the curl, a status "…" and a skeleton of 12 lines.
  - loading: the JSON dims to .5 and the status reads "Running…".
  - success: "200 · {ms} ms · {count} notices".
  - empty: "200 · {ms} ms · 0 notices" plus the helper line "No notices match. Try an earlier date or fewer words." above the JSON (`{ "notices": [], "count": 0, … }`).
  - client error: e.g. `404`, with the JSON body shown as returned.
  - network or CORS error: a `--danger` chip "Failed" and "Couldn't reach the API from this page. The curl above works from any terminal."
  - copied: the button reads "Copied" for 1.6 s.
- **Keyboard / a11y**:
  - `⌘/Ctrl + Enter` runs the request.
  - The JSON is `role=tree`: arrows move, `→`/`←` expand and collapse, and `Enter` toggles.
  - The status is `role=status`.
  - Every field has a visible label.
- **Data**:
  - The request runs from the browser with `fetch`. The ms is `performance.now()` around the fetch.
  - "{count} notices" uses `response.count`.
  - Changing fields never auto-runs, except when an example chip is picked.
- **At 390**: the form stacks. The hint, the "next_cursor" text and the Pretty/Raw toggle are hidden. The curl wraps across up to 6 lines and the Copy button stays top-right. The JSON gutter is 30 px, the indent 12 px and the font 12/19.
- **Acceptance**: `?state=api-loading`, `?state=api-empty`, `?state=api-error`, `?state=api-network`, `?example=paracetamol`.

### 3.4 EndpointDocs
- **Container**: a card with radius 22 and padding 18 18 10, headed "Endpoints" in Funnel 800 20. It is an accordion (one open at a time, `/v1/notices` open by default). Its state syncs with the console: opening an endpoint selects it in the console, and vice versa.
- **Item**:
  - Closed: a 1 px top `--line` border, padding 12 4, the method badge and the path in mono 14, and a description in Onest 13.5 `--ink-muted`.
  - Open: `--cobalt-soft` background, radius 12, padding 12, description in `#2A4570`, plus a params list: a two-column grid (62 px | 1fr), names in mono 12.5 `--cobalt`, descriptions in Onest 13 `--ink`.
- **Copy**:

| Endpoint | Description | Params |
|---|---|---|
| `GET /v1/notices` | "Notices, newest first. Filter, search and page through them." | `source` "cdsco_nsq, cpsc, nhtsa or openfda" · `since` "YYYY-MM-DD, published on or after" · `q` "Words in product, brand, batch or model" · `limit` "1 to 100 · default 50" · `cursor` "`next_cursor` from the page before" |
| `GET /v1/notices/{id}` | "One notice with its raw row, e.g. `cpsc%2310984`" | `id` = the notice `pk`, URL-encoded |
| `GET /v1/stats` | "Totals and poller health for each source" | none |
| `GET /v1/sources` | "Sources, what they cover and how often they're polled" | none |

- **Motion**: the accordion height uses `spring-snappy` and the content fades 160 ms.
- **a11y**: shadcn Accordion (buttons with `aria-expanded`).

### 3.5 SourcesTable
- **Container**: a card with radius 22 and padding 18 20 8. The header is "Sources" (Funnel 800 20) with "From `/v1/stats` · {total} notices · checked {HH:MM} IST".
- **Columns**:
  - **Source**: 40 px ObjectTile + label (Onest 700 15) + coverage (13 muted).
  - **id**: IdChip.
  - **Notices**: right-aligned, Funnel 800 20 in `--src-*-ink`.
  - **Polled every**: "Daily" or "15 min", from `polls_every`.
  - **Health**: HealthDot + "Healthy" / "Slow" / "Down".
  - **Last success**: "{HH:MM}" today or "{HH:MM} yesterday", from `last_success_at` in IST.
- **Rows** are 61 px with 1 px `--line` dividers. The header row is Onest 600 12, uppercase, `--ink-muted`.
- **States**: loading (4 skeleton rows), a down source (the row's health shows `--danger` "Down since {HH:MM}" and its last-success cell turns `--danger`), and error ("Couldn't read /v1/stats." with a button "Try again").
- **At 390**: the Source, Notices and Health columns remain, and coverage is hidden.
- **Data**: `/v1/stats` `sources[].{source,label,count,health,polls_every,last_success_at,last_error}`. The coverage strings are static: "India · drug quality alerts (NSQ)", "US · consumer products", "US · drugs and medical devices", "US · vehicles".
- **Acceptance**: `?state=src-down`.

---

## 4. Acceptance matrix (`?state=` values)
| Screen | Values |
|---|---|
| `/feed` | `feed-loading`, `feed-empty`, `feed-error`, `feed-stale`, `feed-new`, `feed-nomatch`, `feed-match3`, `src-slow`, `src-down`, `src-nomonths` |
| `/feed?notice=…` | `sheet-loading`, `sheet-match`, `sheet-notfound` |
| `/ingest` | `empty`, `step1`–`step5`, `reading`, `dissolving`, `paused`, `done`, `failed-extract`, plus `speed=2`, `page=3` |
| `/api` | `api-loading`, `api-empty`, `api-error`, `api-network`, `src-down`, plus `example=paracetamol` |

Every state must render with no horizontal scroll at 390 and 1536. Each is checked by the Playwright harness shooting 1536 × 790 and 390 × 844.

---

## 5. Open issues found against the live API (20 Sep 2026)

1. **`GET /v1/sources` returns 404.** The brief lists it, so the docs and the console still include it. Either ship it (the same `sources[]` as `/v1/stats`, plus coverage strings), or remove it from EndpointDocs and the Endpoint select.
2. **CORS is not open to every origin.** Preflight and GET return `access-control-allow-origin` only for `https://main.d2jn22qjgettr5.amplifyapp.com`. A request from `Origin: https://example.com` gets no header. The console works on the app's own origin, so the page copy says "Public, no key, JSON" and not "CORS open". If the API really should be open, add `*` for GET.
3. **No endpoint gives CDSCO counts per month.** The monthly chart reads `public/data/cdsco-months.json`, written at build time. Alternatively, add `sources[].months` to `/v1/stats`.
4. **The brief's "CPSC 2510 Charbroil" is notice `10986`.** 2510, 2511 and 2512 are its date codes, and the mockups show it that way.
5. **The `q` filter is applied per page.** `?source=cdsco_nsq&q=paracetamol&limit=5` returned `count: 1` with a `next_cursor`, so a search can return a short page while more results exist. The console's empty and short states say "next_cursor for page 2" whenever `next_cursor` is present. The feed keeps loading pages until it has 25 matches or the cursor is null.

---

## 6. Jury critique (Best UI pass, 20 Sep 2026)

A jury pass over all eight PNGs of this part, read next to `mine-1536.png`, `mine-390.png` and `case-1536.png` for consistency. The concept is unchanged: every fix below is a surgical edit in `v3/work-fia/` (`gen_feed.py`, `gen_ingest.py`, `gen_api.py`, `feed.css`, `sheet.css`, `ingest.css`, `api.css`), rebuilt with `build.py` and reshot. All eight shots report a scrollWidth equal to their width (1536 or 390).

**Grade before: 7/10.** The screens were clean, on-token and clearly one product with `/mine` and `/case`. What held the grade down was a handful of details that look broken on a paused video frame: an overlay covering the thing it annotates, text clipped mid-letter, and the notice sheet's proof cut in half.

### 6.1 The 8 most damaging problems
1. **Ingest: the flying card hid the newest notices' row numbers.** The ghost's right edge (1128 px) ran 54 px into the NoticesPane (1074 px) and covered the badges of rows 8 and 7, so the two newest notices looked as if they had lost their numbers.
2. **Ingest: the "Row 9" tag covered the PDF header.** It sat on the header row and hid "S. No." and the "N" of "Name of the Drug", so the overlay damaged the document it was annotating. This happened at 1536 and at 390.
3. **Ingest: the failed-test text was clipped mid-letter** in the NoticesPane ("Magnesiu", "Assay of Tı", "Particulat") because it had `overflow:hidden` and no ellipsis.
4. **Feed sheet: the "As published by CDSCO" row was cut in half by the sticky footer.** This row is the sheet's proof, and its Result cell ("Content of Aceclofenac (82.94%)") was half hidden.
5. **Feed: "239" appeared five times in the first viewport, and the copy contradicted itself.** It was in the sub, the chart's big number, the bar label, the alert header and the "Show all 239 rows" button. The sub also said notices are "read the day they're published", while the alert header showed a 01 Jul alert "read 19 Sep".
6. **Feed 390: no notice was visible in the first viewport,** and the CDSCO alert header overflowed into the first row. The mix bar repeated the 2 × 2 source tiles, and the match banner stacked to about 200 px. The CDSCO tile's "23:54" sat next to "15:08" and read as a later time.
7. **API: the console looked unfinished.**
   - The example chips wrapped, leaving "Tiguan" alone on a second line.
   - The JSON viewer showed half of line 19 at the console's bottom edge.
   - The Endpoints card ended 6 px above the console.
   - The line numbers (`#9AA5B6`) were 2.5:1.
8. **Data and copy consistency across screens.** The feed said "last poll 15:05 · next at 15:20" while `/mine`, the landing page and the sheet all say 15:08 and "next poll 15:23". CPSC rows with no identifiers also read "Identify by · No model or batch listed", which contradicts itself.

### 6.2 What changed
| # | Fix | Where |
|---|---|---|
| 1 | The ghost moved 66 px left (`left:676px`), so its right edge is 1062 px, 12 px short of the pane. The echoes moved with it. The trail now runs from row 9's right end, under the ghost, to the LandingSlot, which reads as a flight path. | `ingest.css`, `gen_ingest.py` |
| 2 | RowTag became a flag in the page's left margin (radius 6 0 0 6), centred on the row and touching the box. At 390, page 1 lifts by 96 px so row 9 sits high in the viewer, and the ghost flies below it instead of over it. | `ingest.css` (2.4 updated) |
| 3 | The failed test got its own `.rs` span with `text-overflow: ellipsis`. The generator passes the full text instead of a Python-truncated string. | `gen_ingest.py`, `ingest.css` (2.5 updated) |
| 4 | The sheet was tightened: tile 72 → 60, h2 27 → 25 (the name now fits on one line), outcome 15.5/1.45, and 10–12 px paddings. The raw-row columns became `44px 1fr 92px 150px`. The raw row and the provenance line now end 9 px above the footer. A 4 px scroll thumb shows the body scrolls. There is no fade gradient, which keeps the brief's gradient rule. | `sheet.css` (1.7 updated) |
| 5 | The desktop sub is one sentence: "…each one checked against the things in your house." The 239 sentence moved to the 390 sub only, where the chart is hidden. The bar's value label was removed. The alert header reads "Published 01 Jul 2026 · in the feed since 19 Sep, 00:10 IST". "239" now appears twice (the chart and the button). The hero is 15 px shorter, so the third CDSCO row now peeks at 790. | `gen_feed.py`, `feed.css` (1.1–1.3, 1.6.1 updated) |
| 6 | 390 changes: the mix bar is hidden, and the CDSCO tile reads "Yesterday". The match banner has a one-line lead and one row of two pills without tiles (150 px). The alert header uses `height:auto`, which fixes the overflow. The first notice now starts at y 712, above the tab bar. | `feed.css`, `gen_feed.py` (1.5 updated) |
| 7 | API changes: the form column is 318 → 334 and the chips have 9 px padding (one line). The Run button is pinned to the bottom of the form. The JSON viewer shows whole lines 1–18 only. The docs card stretches to 520. The gutter is `#76839A` (3.8:1). | `api.css` (3.1, 3.3 updated) |
| 8 | The times now match every other screen: last poll 15:08, next at 15:23, and CPSC 15:08, openFDA 15:07, NHTSA 15:08 in the feed and the API sources table ("checked 15:08 IST"). Rows without identifiers read "MODEL OR BATCH · None listed". | `gen_feed.py`, `gen_api.py` (1.6.3 updated) |

### 6.3 Left as is (deliberate)
- The two dashed echoes behind the ghost stay. They are part of the choreography in 2.6, and they now trail between the source row and the ghost instead of reaching the notices pane.
- `/ingest` and `/api` keep 34 px titles against `/mine`'s 52 px hero. These are tool screens, and the brief spends boldness on the landing page and `/mine`.
- At 390, the PDF viewer shows only the left five columns of the page. The spec already pans it to the current row's columns 1–5.

**Grade after: 8.5/10.** Nothing now looks broken on a paused frame. Each screen's proof (the PDF row, the published CDSCO row and the JSON) is fully readable. The feed's first viewport shows three notices at 1536 and one at 390. The numbers match the rest of the app to the minute.

Reshot: `feed-1536.png`, `feed-full-1536.png`, `feed-sheet-1536.png`, `ingest-1536.png`, `api-1536.png`, `feed-390.png`, `ingest-390.png` and `api-390.png`.

