# Shell, tokens and primitives · RecallIndia v3 "Cobalt & Foil"

Owner part: `shell-tokens`. This part covers the app shell (desktop and mobile), the route map, every shared primitive with its states, the token usage rules and the motion tokens. Screen parts (landing, feed, ingest, mine, case, api) build on it.

| Artifact | Path |
|---|---|
| Design system (lints 0 errors, 0 warnings) | `v3/DESIGN.md` |
| Tokens: `:root`, Tailwind 4 `@theme inline`, shadcn map, motion | `v3/code/globals.tokens.css` |
| Fonts (next/font/google) | `v3/code/fonts.ts` |
| Kit mockup, full page at 1536 | `v3/mockups/kit-full-1536.png` (source `/v3/mock/kit.html`) |
| Mobile shell at 390 | `v3/mockups/shell-390.png` (`/v3/mock/kit.html`; `/kit` has no active tab) |
| OG image 1200 × 630 | `v3/mockups/og.png` (source `/v3/mock/og.html`) |
| Brand | `v3/brand/mark.svg`, `mark-onblue.svg`, `icon.svg`, `lockup.svg`, `lockup-onblue.svg` |

---

## 1. Route map

| Route | Page `<title>` | Shell | Active tab | First 10 seconds | Data |
|---|---|---|---|---|---|
| `/` | `RecallIndia · Drug-quality alerts and recalls, checked against what you own` | Landing nav over cobalt, no app nav, no tab bar | none | Cobalt hero, 3D strip, "When your medicine fails a quality test, nobody tells you." | `GET /v1/stats` → `total`, `sources[].count` |
| `/feed` | `Feed · RecallIndia` | App shell | Feed | The live notices list with the newest CDSCO row first | `GET /v1/notices`, `GET /v1/stats` |
| `/ingest` | `Ingest · RecallIndia` | App shell | Ingest | A PDF page with Textract boxes flying into the list | replay JSON + `GET /v1/notices?source=cdsco_nsq` |
| `/mine` | `My things · RecallIndia` | App shell | My things | "2 things you own are on a notice" | household store + `GET /v1/notices` |
| `/case/?id=` | `Case · {thing name} · RecallIndia` | App shell | My things | The outcome sentence and the approval gate | case record |
| `/api` | `API · RecallIndia` | App shell | API | The try-it console with a live response | `GET /v1/notices`, `/v1/notices/{id}`, `/v1/stats`, `/v1/sources` |
| `/kit` | `Kit · RecallIndia` | App shell | none | "Cobalt & Foil" and the three material tiles | static |
| 404 (`app/not-found.tsx`) | `Not on any list · RecallIndia` | App shell | none | "This page isn't on any list" + "B.No. 404" foil chip | static |

- The lockup always links to `/`. "Open the app" on the landing links to `/mine` (the demo household), "Check what you own" links to `/mine`, "Watch a PDF become the feed" links to `/ingest`.
- `output: "export"`: every route is a folder with `index.html`; `/case/?id=` reads `id` on the client. `app/not-found.tsx` exports as `404.html`.

---

## 2. App shell · desktop (1024 px and up)

**Purpose.** Tell you where you are, whose things you are looking at, and give you a way to find anything, in one 64 px strip. It replaces the v2 left rail.

**Layout at 1536.** Sticky header, `top: 0`, height 64, full width, `surface-1`, 1px `line` bottom border, `z-index: 40`. Inner row: padding 0 32, `display: flex; align-items: center; gap: 4`.

| Region | x at 1536 | Size | Content |
|---|---|---|---|
| Lockup | 32 | mark 30 × 30 + gap 10 + wordmark 21 px Funnel Display 800, −0.03em; margin-right 26 | links to `/` |
| Tabs | ≈ 210 | four pills, 40 high, padding 0 16, gap 4 | Feed · Ingest · My things · API |
| Spacer | | flex 1 | |
| Household pill | ≈ 952 | 40 high, padding 0 14 0 12 | see §6.4 |
| Search trigger | 1236 | 268 × 40, margin-left 8 | "Search {total} notices" + ⌘K |

**Layout at 390.** Not shown; see §3.

**Reading order.** Lockup → tabs → household pill → search trigger (DOM order equals visual order; `<header>` > `<a>` lockup, `<nav aria-label="Main">`, household button, search button).

**First 10 seconds.** The active tab pill is the only tinted thing in the bar, and the red count on "My things" is the only red thing on screen when something you own is on a notice.

**Data.** `{total}` from `GET /v1/stats` → `total` (4868, rendered "4,868"), cached for the session and refreshed on focus. The alert count is the number of household items whose face is `alert`.

**Tablet 768–1023.** Same bar. Search trigger becomes a 44 × 44 round `surface-2` button with the search icon and `aria-label="Search, ⌘K"`. Household pill drops "· read-only" (shows "Demo household").

Mockups: `kit-full-1536.png` (section 01, the annotated anatomy drawing and the live nav at the top of the page).

## 3. App shell · mobile (below 768)

**Top bar.** Sticky, height 56, `surface-1`, 1px `line` bottom. Padding 0 6 0 16. Left: mark 26 + wordmark 19 px (gap 8), links to `/`. Right: household pill compact (36 high, padding 0 12 0 10, 16 px house icon + "Demo household" / spinner + "Copying 9 of 15" / cobalt disc + "Your household"; the compact pill drops "· read-only" and "· {count} things", `white-space: nowrap`), then a 44 × 44 ghost icon button (search, `aria-label="Search"`).

**Bottom tab bar.** Fixed to the bottom, height 64 + `env(safe-area-inset-bottom)` (20 in the mockup), `surface-1`, 1px `line` top, shadow `0 -8px 24px -12px rgb(11 27 51 / .18)`. Four equal columns; each tab is a 64-high column: a 56 × 32 pill holding a 22 px icon, gap 4, then a 12 px Onest 600 label. Inactive: `ink-muted`. Active: icon pill `primary-soft`, icon and label `primary`, `aria-current="page"`. "My things" icon carries the red count badge (18 × 18, 11 px 700 white, 2px white ring) at top −4, right 4.

| Tab | Icon | Route |
|---|---|---|
| Feed | three lines | `/feed` |
| Ingest | page with lines | `/ingest` |
| My things | 2 × 2 pockets, one filled (echoes the mark) | `/mine` |
| API | braces | `/api` |

**Page padding.** Gutters 16. `body` gets `padding-bottom: calc(64px + env(safe-area-inset-bottom))` so the last card clears the bar. Toasts sit 12 above the bar.

**Search.** The search button opens the palette as a full-screen sheet (§6.10).

**First 10 seconds.** The active tab is the only tinted icon; the "2" badge points you to My things.

Mockups: `shell-390.png` (the `/kit` page at 390: no tab is tinted because `/kit` is not a tab, matching the route map; the red count still shows on My things), and the two phone frames in `kit-full-1536.png` section 01 (`/mine` at 390, the search sheet).

## 4. Landing nav

Transparent over the cobalt hero, absolute at top 24, left and right 96 (16 below 768), height 48. Lockup on blue (white card mark 30 + white wordmark 22 px). Right: links "How it works" (`#how`), "Live feed" (`/feed`), "API" (`/api`) in 15 px Onest 500 `on-primary-muted`, padding 14 16, pill; hover: white text on `rgb(255 255 255 / .12)`. Then "Open the app" (`button-on-blue`, 44 high, padding 0 22, links to `/mine`). Below 768 the bar is 64 tall, the three links are hidden, the wordmark is 20 px, and "Open the app" stays at 44 high with padding 0 18 (as `landing.md` specifies). It does not stick; after the hero scrolls away, the app header does not appear on the landing.

---

## 5. Token usage rules

The values live in `DESIGN.md` and `globals.tokens.css`. The rules that matter most when building:

| Token | Use for | Never for |
|---|---|---|
| `cobalt` / `primary` | the one filled button per view, active tab label, links, focus ring, landing hero | decoration, two filled buttons in one view, category text |
| `cobalt-soft` | active tab pill, active mobile tab, info chip, palette active row, copying household pill, 404 panel | card faces |
| `on-cobalt-muted` | secondary text on cobalt ≥ 14 px | text on white |
| `canvas` | app page background | cards |
| `surface-1` | cards, nav, bars, inputs, palette, toasts | page background |
| `surface-2` | hover fills, skeletons, kbd, search trigger and fields | card faces |
| `line` | decorative 1px borders and dividers | the only edge of a control |
| `line-strong` | input, secondary-button and checkbox borders | dividers |
| `ink` / `ink-muted` | text; ink also for tooltips and the selected filter pill | |
| `ink-subtle` | input placeholders | anything that must be read |
| `danger` (+hover, press, soft) | alert faces and badges, "Open case", INVALID seal, source down, logo pocket, red pill | form errors, links, deletes, charts |
| `success` (+soft) | No match, VERIFIED, healthy source | buttons |
| `warning` (+soft) | near miss, "Waiting for you", degraded source, form errors, near-miss underline | alerts |
| `live` | the live dot on cobalt | anything on white |
| `cat-*` | 10 px category marks, illustration strokes, and the per-source segments of the notices bar (CDSCO `cat-medicine`, CPSC `cat-appliance`, openFDA `cat-other`, NHTSA `cat-vehicle`, as on `/feed`) | text (vehicle and appliance are 4.3:1) |
| `cat-*-soft` / `cat-*-tint` | illustration tile / second illustration tone | surfaces |
| `foil` | foil chips, the household blister, the empty-state blister | any other gradient |
| `r-sm 8` / `r-md 14` / `r-lg 22` / `r-pill` | inputs and foil chips / cards and toasts / palette, sheets, panels / anything pressable | |
| `shadow-1/2/3` | card rest / hover, alert card, toast / palette, sheet | |

shadcn re-tokening (the variables are already mapped in `globals.tokens.css`):
- `--primary` = cobalt, `--accent` = surface-2 (hover surface, not a brand colour), `--ring` = cobalt, `--radius` = 14px, `--input` = line-strong, `--destructive` = danger.
- Edit generated components: `Button` base gets `rounded-full h-11 px-5 text-label-md`; `size="sm"` → `h-9 px-3.5`; `size="lg"` → `h-[54px] px-[26px] text-label-lg`; `size="icon"` → `size-11`. `Card` → `rounded-md shadow-1 border-line`. `Input` → `h-12 rounded-sm border-line-strong`. `Dialog`/`Sheet` overlay → `bg-overlay` (not `bg-black/50`).
- The Tailwind default palette is reset (`--color-*: initial`), so `indigo-*`, `violet-*` and `purple-*` utilities do not exist. `bg-white` and `bg-black` remain.

---

## 6. Primitives

Every primitive accepts `?state=` in `/kit` for screenshots, e.g. `/kit?state=button-loading`. Values are listed under **Acceptance**.

### 6.1 Button

- **Purpose.** Do one thing, named by its result.
- **Placement.** One `primary` per view; `secondary` beside it; `ghost` for low-weight actions in cards ("Show work", "Check again", "Reject"); `danger` only for "Open case" on an alert card; `on-blue` and `outline-on-blue` only on cobalt.
- **Size.** md 44 high, padding 0 20 (ghost 0 16, on-blue 0 22), gap 8, icon 18. lg 54 / 0 26 / 17 px. sm 36 / 0 14 / 13 px with the hit area padded to 44. icon 44 × 44.
- **Tokens.** Onest 600 15 px (`label-md`), radius pill, 1px border (transparent except secondary `line-strong`, outline-on-blue `rgb(255 255 255 / .34)`).
- **States (primary / secondary / ghost / danger / on-blue / outline-on-blue).**
  - rest: `cobalt`/white · `surface-1`/ink · transparent/ink · `danger`/white · white/`cobalt` · transparent/white
  - hover: `cobalt-hover` · `surface-2` · `surface-2` · `danger-hover` · `cobalt-soft` · `rgb(255 255 255 / .12)`
  - press: `cobalt-press` · `surface-2` + border `ink-muted` · `#DCE5F1` · `danger-press` · `#D9E5F8` · `rgb(255 255 255 / .20)`, all `scale(.97)`
  - focus-visible: `box-shadow: 0 0 0 2px <surface>, 0 0 0 4px cobalt`; on cobalt `0 0 0 2px cobalt, 0 0 0 4px white`
  - disabled: `opacity: .4`, `cursor: not-allowed`, `aria-disabled="true"`; wrap in a tooltip that says why, e.g. "Read the notice first. Approve unlocks at the end of it."
  - loading: 18 px spinner replaces the leading icon, label unchanged, width locked (`min-width` = measured rest width), `aria-busy="true"`, clicks ignored.
- **Copy.** "Approve claim letter", "Make my own copy", "Show work", "Open case", "Check what you own", "Watch a PDF become the feed", "Open the app", "Add a thing", "Check again".
- **Transitions / Motion.** background and color 180 ms `--ease-out`; transform 120 ms `--ease-out` in, 250 ms `--ease-spring` back out; spinner 0.9 s linear.
- **Responsive.** Same sizes on phones; full-width only inside sheets.
- **Keyboard + a11y.** `<button>` or `<a>` for navigation; Enter and Space; visible focus ring; icon-only buttons have `aria-label`.
- **Acceptance.** `?state=button-rest|button-hover|button-press|button-focus|button-disabled|button-loading`. Matches the matrix in `kit-full-1536.png` section 04.

### 6.2 Status chip

- **Purpose.** Say what happened in two or three words.
- **Size.** sm 26 high, padding 0 10, 12 px Onest 600 +0.02em, icon 14, gap 6. md 32 high, padding 0 12, 13 px, icon 16, gap 7. Radius pill. `white-space: nowrap`.
- **Variants and copy.**
  - alert: `danger-soft`/`danger`, triangle icon: "On a notice", "Same batch"
  - clear: `success-soft`/`success`, check: "No match", "VERIFIED" (md, ring-check icon)
  - hold: `warning-soft`/`warning`, half-disc: "Near miss"; "Waiting for you" (md, 8 px pulsing dot)
  - info: `cobalt-soft`/`cobalt`, spinner or lock: "Checking", "Locked until 19 Oct 2026"
- **Transitions.** When a thing's result changes, the chip cross-fades (180 ms) and its width animates with `layout` (250 ms spring).
- **Motion.** Pulsing dot: `pulse-dot` 1.6 s, reduced motion static.
- **a11y.** Chips are text, not buttons; icons are `aria-hidden`.
- **Acceptance.** `?state=chips`.

### 6.3 Filter pill and source chip

- **Filter pill.** 44 high, padding 0 16, `surface-1`, 1px `line`, Onest 500 15 ink; count 13 px 600 `ink-muted` tabular. Hover `surface-2`. Selected: `ink` face, white label, count `#C9D3E3`, `aria-pressed="true"`. Leads: category 10 px square in `cat-*` (radius 3); "On a notice" 8 px red dot. Copy: "All 15", "On a notice 2", "Near-misses 1", "No match 11", "Medicines 4", "Vehicles 2", "Appliances 5", "Other 4". Arrow keys move between pills in a `role="toolbar"`.
- **Source chip.** 32 high, `surface-1`, 1px `line` (down: `rgb(179 18 30 / .35)`), padding 0 12 0 10, 8 px dot, name 12 px 700 +0.05em, detail 12 px 500 `ink-muted`. Data: `GET /v1/stats` → `sources[]`: `label`, `count`, `health` (`healthy` → success dot + count; `degraded` → warning dot + "slow · {count}"; any failure → danger dot + "down since {HH:MM of last_success_at, IST}").
- **Acceptance.** `?state=filters`, `?state=sources-down`.

### 6.4 Household pill

- **Purpose.** Say whose things you are looking at and whether you can change them.
- **Placement.** Desktop top nav, right, before search. Mobile top bar, compact.
- **Size.** 40 high (36 mobile), padding 0 14 0 12, gap 8, icon 18, Onest 14: name 600 ink, detail 500 `ink-muted`. Radius pill.
- **States (copy).**
  - `demo`: `surface-1`, 1px `line`, cobalt house icon, "**Demo household** · read-only". Hover `surface-2`. Click opens the household menu: "Make my own copy" (primary item), "What is the demo household?".
  - `copying`: `cobalt-soft` face and border, cobalt text, 18 px progress ring (track `rgb(10 88 194 / .22)`, arc cobalt), "**Copying {n} of 15**". Not clickable (`aria-disabled`), `aria-live="polite"` announces "Copying 15 things" once and "Done" at the end.
  - `yours`: `surface-1`, 1px `line`, 22 px cobalt disc with a white house, "**Your household** · {count} things", 16 px chevron. Menu: "Rename", "Reset to demo", "Delete my copy".
- **Transitions.** demo → copying on "Make my own copy" (pill or `/mine` banner); `n` ticks 1 → 15 over 1.2 s with NumberFlow; copying → yours when the last item is written, then the toast "Your household is ready · 15 things copied. The demo is unchanged." Each state cross-fades in 320 ms; the pill width animates with a 320 ms spring.
- **Keyboard + a11y.** `<button aria-haspopup="menu">`; the menu is a Radix `DropdownMenu`.
- **Data.** Household id and item count from the local household store (demo is id `demo`, 15 items).
- **Acceptance.** `?state=household-demo|household-copying|household-yours`. See section 06 of `kit-full-1536.png`.

### 6.5 Search trigger and ⌘K

- **Search trigger.** 268 × 40 `surface-2` pill, padding 0 6 0 14, 18 px search icon (ink), "Search 4,868 notices" (14 px 500 `ink-muted`), and a 28-high white kbd pill "⌘K" ("Ctrl K" on non-Apple platforms). Hover: background `#DCE5F1`. Opens the palette on click, ⌘K, Ctrl K, or `/` when focus is not in a text field.

### 6.6 Foil chip

- **Purpose.** Show a code exactly as it is printed on the thing.
- **Sizes.** sm 28 high, padding 0 9, Doto 900 17 px +0.08em, radius 6 · md 34, 0 12, 22 px +0.06em, radius 8 · lg 52, 0 16, 36 px +0.06em, radius 8.
- **Tokens.** Background `--foil`, `box-shadow: var(--foil-edge)`, text `ink`.
- **Near miss.** Both chips (yours, listed) at lg with caps labels "YOURS" / "LISTED" above and a "≠" in warning between; the differing characters get a 3 px (4 px at lg) warning underline, 6 px (8 px at lg) below the baseline.
- **On an alert face.** Keeps the foil; never red.
- **Motion.** On `/mine` Add a thing, the scanned batch morphs from the photo box into the chip: shared-layout 400 ms `--ease-spring`, then a 180 ms highlight sweep of opacity only.
- **a11y.** `aria-label="Batch F T 5 4 2 7"` so screen readers spell it.
- **Acceptance.** `?state=foil`.

### 6.7 Input and search field

- **Input.** Label above (14 px 600 ink, gap 8), field 48 high, padding 0 14, radius 8, 1px `line-strong`, `surface-1`, 16 px Onest 500. Placeholder `ink-subtle` #65718A 400 (4.9:1). Helper below, 13 px `ink-muted`.
  - focus: border `cobalt` + `inset 0 0 0 1px cobalt` + `0 0 0 4px cobalt-soft`
  - error: border `warning` + `inset 0 0 0 1px warning` + `0 0 0 4px warning-soft`; message replaces the helper in 13 px 500 `warning` with a 16 px triangle; `aria-invalid="true"`, `aria-describedby` → message id.
  - Copy (batch field): label "Batch number", placeholder "e.g. FT5427", helper "As printed after B.No. on the strip", error "Batch codes have no spaces. Type it as printed: {normalised}".
- **Search field.** Pill, 48 high, `surface-2`, no border, 18 px icon, trailing kbd "/" on desktop. Focus as input.
- **Acceptance.** `?state=input-rest|input-focus|input-error`.

### 6.8 Card, notice card, item card, row

- **Card.** `surface-1`, 1px `line`, radius 14, `shadow-1`, padding 20 (16 for item cards). Clickable cards: hover `translateY(-2px)` + `shadow-2` + border `#CBD5E3` in 250 ms `--ease-out`; focus-visible ring on the card; the whole card is one link with the title as its accessible name.
- **Notice card** (feed): top line source badge ("CPSC 10984", `cobalt-soft`/`cobalt` 11 px 700), category mark + caps label, date right (tabular); title 20 px Funnel 700; one-line summary 15 px `ink-muted`; divider; footer "Nothing you own matches" or the match chip, and "See the notice →" link. CDSCO titles never say "recalled": "failed CDSCO quality test: {reason}".
- **Item card** (`/mine`): 88 px category tile with illustration, caps category, title 19 px Funnel 700, status chip, "No match in 4 sources as of 15:08". Faces clear / checking / needs-you / near-miss / alert are owned by the `/mine` part.
- **Row** (feed table, palette): 56 high, 1px `line` top; hover `surface-2`; focus inset 2px cobalt; open/selected `cobalt-soft` with cobalt title.
- **Layout rule.** Cards in a row take different spans (7/5 or 5/4/3). No row of three identical cards.
- **Acceptance.** `?state=cards`.

### 6.9 Category tile and mark

88 px tile (72 on phones, 44 in rows, 36 in the palette), radius 14 (12 below 88), `cat-*-soft`, holding a 64-box two-tone illustration (`--c` mark colour, `--t` tint, white). Alert items swap the tile to `danger-soft` and colour the strip's last pocket `danger`. Marks: 10 px squares, radius 3. Squares mean category; circles mean status.

### 6.10 Command palette (cmdk)

- **Purpose.** Find anything: your things, notices, pages, actions.
- **Placement.** Desktop: centred dialog, top 88, width 640, radius 22, `shadow-3`, over the ink scrim `rgb(11 27 51 / .40)`. The scrim covers the whole viewport including the sticky top nav (scrim `z-index` above the header's 40, dialog above the scrim). Phone: full-screen sheet under the status area with a back button, the field, and "Cancel".
- **Anatomy.** Input row 60 high (18 px Onest 500, 20 px icon, "esc" kbd). Groups with caps headings in this order: **My things** (max 4), **Notices** (max 5, from `GET /v1/notices?q={query}&limit=5`), **Go to** (Feed, Ingest, My things, API, Kit), **Actions** ("Add a thing", "Make my own copy", "Copy API base URL"). Rows 52 high: 36 px icon tile (category soft colour), title 15 px 500, detail 13 px `ink-muted`, trailing status chip or kbd. Matched characters render 700 ink. Footer 44 high on `canvas`: "↑ ↓ move · ↵ open · esc close" and "Searching {total} notices and {count} things".
- **States.** empty query: recent searches + Go to; typing: debounced 150 ms, local results first, notices stream in; no results: "No notices match “{query}”" + "Batch codes match exactly, letter for letter."; offline: Notices group shows "Can't reach the API. Showing your things only."
- **Motion.** In: scrim opacity 0 → 1 in 180 ms; dialog opacity 0 → 1 and scale .98 → 1 in 250 ms `--ease-spring`. Out: 180 ms `--ease-in`, opacity only. Phone sheet slides from the top bar in 320 ms spring.
- **Keyboard + a11y.** ⌘K / Ctrl K / `/` open; Esc closes and returns focus to the trigger; ↑ ↓ move; Enter opens; `role="dialog"`, `aria-modal`, `aria-label="Search"`; focus trapped.
- **Acceptance.** `?state=palette`, `?state=palette-empty`, `?state=palette-none`. See section 08 of `kit-full-1536.png` and the right-hand phone in section 01.

### 6.11 Toast (sonner)

- **Placement.** Bottom-right, 24 from the edges (desktop); bottom-centre 12 above the tab bar (phone). Max 3 visible, newest on top.
- **Size.** 400 wide (phone: 100% − 32), padding 14 14 14 16, radius 14, `surface-1`, 1px `line`, `shadow-2`. Grid: 30 px icon · text · one action (sm secondary button) or a 32 px close.
- **Copy.**
  - success: ring-check in `success` · "Claim letter ready" / "Evidence sealed · VERIFIED" · action "Open case"
  - neutral: ring-plus in `cobalt` · "Your household is ready" / "15 things copied. The demo is unchanged."
  - source down: 30 px `danger-soft` disc with a 10 px `danger` dot · "{Source} didn't answer" / "Showing notices from {HH:MM}. Retrying at {HH:MM}."
- **Motion.** In from 12 px below with opacity, 250 ms spring; 5 s dwell, paused on hover and focus; out 180 ms `--ease-in`, opacity + 8 px.
- **a11y.** `role="status"` (source-down uses `role="alert"`); never the only place information appears.
- **Acceptance.** `?state=toasts`.

### 6.12 Tooltip

Radix tooltip, `ink` face, white 13 px Onest 500, padding 8 10, radius 6, 5 px arrow, max-width 260. 600 ms first delay, then instant for 300 ms. Required on disabled buttons and icon-only buttons.

### 6.13 Skeleton

`surface-2` blocks shaped like the incoming content (feed row: 56 × source 56 × title 64–82% × date 72; item card: 88 tile + three lines; stat: 40 × 160 + bar). Radius 8 (pills keep pill). Animation `skeleton` 1.4 s opacity 1 ↔ 0.55. Shown only if data takes longer than 300 ms; content replaces it with a 180 ms opacity fade. `aria-busy="true"` on the region. No gradient sweep. Reduced motion: static blocks. `?state=loading`.

### 6.14 Empty states

All three: say what would be here, why it's empty, and one next step. Panel `surface-1` radius 22 (404: `cobalt-soft`, no border).

1. **Your household, 0 things** (`/mine`): left 300 px empty foil blister (3 × 2 pockets, one dashed cobalt "+" pocket), right heading "Nothing in your household yet" (30 px Funnel 800), body "Add a medicine strip, a vehicle or an appliance. We check it against 4,868 notices from 4 regulators the moment you add it, and every 15 minutes after.", buttons "Add a thing" (primary, plus icon) and "Copy the demo household" (secondary). `?state=mine-empty`.
2. **Feed search, no results** (`/feed`): centred 84 px `surface-2` circle with a cobalt search icon, "No notices match", the query as a removable pill ("“FT9999”" ×), "Searched 4,868 notices from CDSCO, CPSC, NHTSA and openFDA. Batch codes match exactly, letter for letter.", suggestion pills "Paracetamol", "FT5427", "Jeep Compass". `?state=feed-none`.
3. **404**: full-width `cobalt-soft` panel: "This page isn't on any list" (40 px), "The link may be old or mistyped. Every notice is still in the feed, and the demo household is one click away.", buttons "Open the feed" (primary) and "Check what you own" (secondary); right: "B.No." in Doto 26 and a foil chip "404" at 96 high, 72 px Doto. `?state=404`.

### 6.15 Annotation chip and leader line

White (`surface-1`) or red (`danger`) chip, radius 14, padding 11 14 12, `shadow-onblue` on cobalt / `shadow-2` on light. Small line 12–13 px 500 (`ink-muted` / `#FBEAE8`), strong line 15–17 px 600 or a Doto code. Leader: 2px dashed (`4 5`) white on cobalt, cobalt on light, from a 4.5 px dot (or a ring around a round target) on the object to a point 27–78% along the chip's top edge. In the app the anchors come from the 3D scene every frame (`onAnchors`); in static pages they are fixed image coordinates (strip render 1400 × 1050: batch 411,613 with underline 358,596 → 463,630; pill 862,628 r 54; corner 1115,450).

---

## 7. Motion tokens

| Token | Value | Use |
|---|---|---|
| `--dur-press` | 120 ms | press in (`scale(.97)`) |
| `--dur-fast` | 180 ms | hover colour, tooltip, fades, every exit |
| `--dur-base` | 250 ms | chips, tabs, toasts in, palette in, card hover lift |
| `--dur-flip` | 320 ms | item-card face flip, household pill state, mobile palette sheet |
| `--dur-slow` | 400 ms | sheets, foil-chip morph, pipeline step, seal stamp |
| `--stagger` | 40 ms | children in the one load sequence per page |
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | enters, hovers |
| `--ease-in` | `cubic-bezier(.55, 0, .75, .2)` | exits only |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | progress bars, position swaps, skeleton pulse |
| `--ease-spring` | `linear(0, 0.0307, … , 1.0015, … , 1)` (33 stops) | spring with damping ratio 0.9 (bounce 0.1), for anything that moves |
| `--press-scale` | 0.97 | buttons, pills, cards on press |
| `--lift` | −2 px | hovered clickable card |

framer-motion twins (`lib/motion.ts`):

```ts
export const spring = { type: "spring", bounce: 0.1, duration: 0.4 } as const;
export const springFast = { type: "spring", bounce: 0.1, duration: 0.25 } as const;
export const fade = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
```

Rules:
- Motion answers a state change and nothing else. No looping decoration except the live dot, spinners, the waiting pulse and skeletons.
- One orchestrated load sequence per page (the landing hero, `/ingest` replay, the `/case` pipeline); everything else appears with a single 180 ms fade.
- Tabs: the active pill slides between tabs with `layoutId="tab-pill"` (250 ms spring); on phones the icon pill does the same.
- Numbers change with `@number-flow/react` (250 ms spring, tabular).
- `prefers-reduced-motion: reduce`: transforms, springs, lifts, spinners (replaced by a static "…" label), pulses and the skeleton pulse stop; opacity and colour transitions stay at 180 ms linear. framer: `useReducedMotion()` switches every transition to `fade`.

---

## 8. Brand

- **Mark** (`mark.svg`, 36 × 36): an ink `#0B1B33` rounded card (radius 8) with a 2 × 2 grid of pockets punched through (r 5 at 10.5 / 25.5), the bottom-right pocket filled `#B3121E`. On cobalt use `mark-onblue.svg` (white card; the pockets show the blue).
- **Lockup** (`lockup.svg`, `lockup-onblue.svg`): mark + "RecallIndia" in Funnel Display 800, −0.03em, outlined to paths with opentype.js. Proportions match the nav: mark = 1.43 × font size, gap = 0.48 em, mark centred on the cap height. Minimum height 24 px; clear space = half the mark on all sides.
- **Favicon** (`icon.svg`): ink card in light browser chrome, white card under `prefers-color-scheme: dark`, 2 px inset so the card is not clipped at 16 px. Only the favicon carries the colour-scheme rule. Also export `apple-icon.png` 180 × 180 (white card on cobalt) from `mark-onblue.svg`.
- **OG image** (`mockups/og.png`, 1200 × 630): cobalt with the radial glow, lockup on blue at 64,52 (34 high), live pill "Live · 4,868 notices from 4 regulators", headline "When your medicine fails a quality test, nobody tells you." (62 px Funnel 800), stats "239 drug samples failed CDSCO tests in July 2026 · 15 min between polls of CPSC, NHTSA and openFDA · 9 s from your approval to a signed, locked claim", the strip render at 0.5 scale with the batch chip "FT5427", the red chip "CDSCO · July 2026 · row 12 · Failed: dissolution test" and the white chip "Claim letter ready · Evidence sealed · VERIFIED". Ship as `app/opengraph-image.png` and `app/twitter-image.png` (`summary_large_image`), alt "RecallIndia: a medicine strip whose batch FT5427 failed a CDSCO dissolution test, with its claim letter ready".

---

## 9. Acceptance checklist

- `npx design.md lint DESIGN.md` → 0 errors, 0 warnings.
- `tailwindcss` 4 compiles `globals.tokens.css`; `bg-indigo-500` and `text-violet-600` generate nothing.
- `fonts.ts` type-checks against Next 15.5 (`Funnel_Display`, `Onest`, `Doto`, `IBM_Plex_Mono` all present in next/font's font data).
- At 1536 and 390, `document.documentElement.scrollWidth` equals the viewport width on every route.
- Every tappable element is at least 44 × 44; every control shows the focus ring; tab order matches §2.
- Red appears only in the places listed in §5.
- `/kit?state=…` renders each primitive state listed above.

---

## Jury critique

Reviewed as a Best UI jury: `kit-full-1536.png` and `shell-390.png`, checked against `mine-1536.png`, `mine-390.png`, `feed-1536.png`, `feed-390.png`, `case-390.png` and `og.png`. Source: `/v3/mock/kit.html` (`og.html` reviewed, no change needed).

**Grade before: 7 / 10.** A complete, well-organised kit with real data. The damage came from small contradictions that a jury reading closely would notice first.

### The 8 most damaging problems

1. **Wrong "you are here" at 390.** `shell-390.png` was shot with `?tab=mine`, so "My things" was tinted as the active tab while the page was `/kit`. That contradicts the route map (`/kit`: no active tab) and the desktop nav on the same page.
2. **Ambiguous mobile household pill.** The top bar said only "Demo". Every other phone screen (feed, mine, case) says "Demo household".
3. **Anatomy leaders pointed at the wrong notes (section 01).** The "Top nav" leader ran behind the "Household pill" note, so it looked like it belonged to that note. The first and second rows of notes also touched, with a 0 px gap.
4. **Palette layering bug (section 08).** The scrim dimmed the page, but the top nav stayed bright white above it. The nav in that tablet-width stage had also lost the household pill, which the section-01 tablet rule keeps.
5. **Source colours disagreed with the feed (section 07).** The stat card drew the four sources as a cobalt opacity ramp. `/feed` colours them per source: CDSCO blue, CPSC green, openFDA purple, NHTSA orange.
6. **Copy.**
   - "safe area" appeared twice in visible copy, on a product whose copy rule bans "safe".
   - The body-md specimen showed the raw CDSCO sentence "does not conforms…" with no quote marks, so it read as a typo in the kit.
   - The Motion fact had a double colon: "Springs, bounce 0.1: 250 ms…".
7. **Phone `/mine` frame.**
   - The clear row said "No match" twice (a chip and the meta line).
   - The meta line wrapped and left "15:08" alone on its own line.
   - The title used a hard-coded "…".
   - The feed-row demos used invented short names ("Paracetamol 650mg", "Jeep rearview camera").
8. **Crowding and dead space.**
   - In the hero, the Red tile's blister touched its "Red" heading.
   - In section 02, the cobalt panel left a 160 px empty white band under its ramp.

### What changed (surgical, same concept)

| # | Change |
|---|---|
| 1 | `shell-390.png` is now shot at plain `/v3/mock/kit.html`, so no tab is tinted and the red "2" stays on My things. The `?tab=` hook stays for other shots. |
| 2 | The compact pill reads "Demo household" (`white-space: nowrap; flex: none`), in the real top bar and in the section-01 phone frame. §3 and the DESIGN.md prose are updated: the compact pill drops "· read-only". |
| 3 | The top-nav anchor moved to the empty stretch of the bar between API and the household pill (x 830 at 1536), so its leader runs in the 76 px gap between the "Alert count" and "Household pill" notes. Row one now sits at nav + 36 and row two at nav + 128, which leaves a 16 px gap. Every leader except the alert-count one is vertical. |
| 4 | The scrim is at `z-index: 6` and the dialog at 7, so the whole stage, nav included, sits under the scrim. The stage nav shows the "Demo household" pill before the 44 px search button. §6.10 now states that the scrim covers the sticky header. |
| 5 | The bar segments and the legend marks use `cat-medicine` / `cat-appliance` / `cat-other` / `cat-vehicle` for CDSCO / CPSC / openFDA / NHTSA, and NHTSA has a 4 px minimum. §5 records this as an allowed `cat-*` use. |
| 6 | "plus the home-indicator inset" and "tab bar 64 + home-indicator inset" replace "safe area". The body-md sample is now "Paracetamol Tablets IP 650mg, batch FT5427, failed the dissolution test at DTL Bikaner." The Motion fact reads "Springs with bounce 0.1 · 250 ms chips · 320 ms flips · 400 ms sheets". |
| 7 | The phone's clear row now matches `/mine`: the full title with CSS ellipsis, then one success status line (a 14 px check, then "No match in 4 sources as of 15:08" on one line). The chip is gone. The feed rows use real titles, truncated by CSS: "Esjay Toddler Busy Board Montessori Toys", "Charbroil Bistro Pro Electric Grills", "Jeep Compass rearview camera", "Paracetamol Tablets IP 650mg". |
| 8 | The hero blister is 56 px pockets (still 40 px at 390) and the caption has 14 px top padding. The cobalt panel is a flex column whose swatch grows to fill the column. |

**Verification.**
- `kit-full-1536.png` (1536 × 9819) and `shell-390.png` (390 × 844) were re-shot. `scrollWidth` equals the width in every run (1536 and 390), with no page errors.
- In this environment the harness's full-page capture wrapped after about 8,100 px: the page top repeated below section 08. The untouched original HTML did the same. So `kit-full-1536.png` was captured in 1800 px viewport slices at 1536 wide, with the sticky nav made static so it appears once, as in a full-page shot, and then stitched. The seams were checked at 1800, 3600, 5400, 7200 and 9000.

### Not fixed here (other screens' files)

- **The mark.** The kit, `brand/mark.svg` and DESIGN.md use the ink card. The feed, mine, case, api and ingest mockups draw a cobalt card with white pockets. Those screens should switch to the ink mark on white, or the brand should change on purpose in one place.
- **Nav drift on other screens.**
  - Search is a bare "⌘K" pill instead of the 268 px "Search 4,868 notices" trigger (§2).
  - My things has no red count badge (§2, §3).
  - The phone top bars have no 44 px search button (§3).
- **The kit's cobalt hero tile** still has an open middle. It is left as is, because the tile is the material swatch.

**Grade after: 8 / 10.** The shell now tells you where you are at both widths. The anatomy drawing reads without guesswork, and the kit agrees with the feed on source colours. What keeps it from a 9 is the cross-screen drift in the mark and the nav listed above, which lives in other screens' files.
