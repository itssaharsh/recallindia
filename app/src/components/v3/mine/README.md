# /mine: My things (v3 code)

Production React for the "My things" screen and its Add sheet, built from `spec/mine.md` and the final mockups
(`mockups/mine-1536.png`, `mine-full-1536.png`, `mine-390.png`, `mine-add-1536.png`, `mine-add-390.png`).

Stack: Next.js 15 App Router (`output: "export"`), React 19, Tailwind 4 with `code/globals.tokens.css`,
framer-motion 11, @number-flow/react, lucide-react. The shared primitives come from `../ui` (Button, Chip, FoilChip, Card, cn).

Everything here is presentational and typed. Nothing fetches: the route fetches, polls and passes responses in.
`MineView` composes the whole screen from one props object.

**Verified**
- `tsc -p tsconfig.mine.json`: 0 errors. It also type-checks under a real `next build` (Next 15.5, static export).
- All 24 `?state=` fixtures render with `react-dom/server`.
- Tailwind 4.3 builds the CSS. Screenshots of the demo, add-confirmed, candidates, failed, checking, added-alert and needs-you states match the mockups at 1536 and 390. The demo page is 1576 px tall, the same as the spec, and `scrollWidth` equals the viewport width in every shot.
- A hydrated static-export build was driven with Playwright:
  - The flip reaches 90° and the legend changes in the same frame.
  - The card holds its slot, then moves to the clear grid.
  - Focus lands on "Take or choose a photo", then moves to the read-back `h3`.
  - The batch chip leaves the word box at 17.2° and lands in the callout.
  - The sheet closes, and the new card appears in the wall.

---

## 1. Files and components

| File | What it is | Matches mockup |
|---|---|---|
| `MineView.tsx` | The screen: banner → OutcomeLine + HouseholdStrip → FilterBar → ItemWall, plus AddThingSheet and the fallback toast. Owns only UI state: faces as shown (updated at 90° of each flip), the held sort order, the uncontrolled filter, the focus flash and the toast. Wraps everything in `<MotionConfig reducedMotion="user">`. | `mine-1536.png`, `mine-full-1536.png`, `mine-390.png` |
| `HouseholdBanner.tsx` | States `demo`, `copying`, `own`, `own-confirm-reset` (inline, never a modal) and `error`. Has `role="status"`. | banner row in `mine-1536.png` / `mine-390.png` |
| `OutcomeLine.tsx` | h1 with a NumberFlow count (0 → n in 600 ms on load, 400 ms on change), the sub line with "next poll", and a hidden `aria-live` repeat. | headline in `mine-1536.png` |
| `HouseholdStrip.tsx` | The foil blister (16 pockets, perforation, "+" button or "+{n−15}") and the `Legend`. The strip is `role="img"` with the summary label. Pocket tooltips and click-to-card are mouse only. | strip + legend top right in `mine-1536.png`; full-width strip in `mine-390.png` |
| `FilterBar.tsx` | Two `role="group"`s of `aria-pressed` pills, arrow-key roving, the active ink background sliding (layoutId), sort label and "Add a thing". At 390 it becomes an edge-to-edge scrolling row. | pill row in `mine-1536.png` / `mine-390.png` |
| `ItemWall.tsx` | 12-column wall: 7 + 5 big rows, then the ClearSectionLine, 3-column clear cards and the `AddTile`. Also has the load stagger, the filter exit (fade, scale .98), the layout re-flow, `useHeldOrder` (700 ms hold + defer while hovered or focused, max 4 s) and an `aria-live` region for results. | `mine-full-1536.png` |
| `ItemCard.tsx` | One card, six faces (`alert`, `needs-you`, `near-miss`, `checking`, `clear`, `unchecked`) and the flip: 0 → 90° in 160 ms `cubic-bezier(.4,0,1,1)`, swap, then −90 → 0° on a 380/32 spring. Under reduced motion it fades 150 ms + 150 ms instead. The overflow menu shows on clear cards in your own household. | alert: `mine-1536.png` row 1 · near-miss and checking: `mine-full-1536.png` row 2 · clear: its grid · needs-you and unchecked: not mocked, built from spec §2.6 |
| `RangeBar.tsx` | `years` (listed range at 20–80%, outer years at 4% and 96%) and `dates` (notice → gap pill → bought, reversed and grey when bought before). On a flip to alert, `animateIn` grows the fill over 320 ms, then the marker drops. | Jeep and Paracetamol cards in `mine-1536.png` |
| `NoticeQuote.tsx` | The notice's own words, with the highlight rule (CDSCO: after "with respect to"; others: the first hazard term) and the cite line. | quote panels in `mine-1536.png` |
| `AddThingSheet.tsx` | Bottom sheet: scrim (200 ms), a 320/34 spring up and a 240 ms exit. Kind switch (`tablist` with a sliding segment), step indicator, focus trap, Esc handling and inline "Discard this thing?". Drag-to-close at 390 (>30% of the height or >500 px/s). Also the vehicle and appliance forms, and the checking and added steps. | `mine-add-1536.png`, `mine-add-390.png` |
| `ScanConfirm.tsx` | The scan step: SVG word boxes drawn in image space over the photo (`preserveAspectRatio="xMidYMid slice"`), the padded cobalt batch box with a white halo, the numbered field tags, the measured dashed leader, and the **layoutId `scan-batch` morph** from the word box to the callout. It also holds the read-back fields, the candidate `radiogroup`, and the failed and error states. | photo + read-back in `mine-add-1536.png` / `mine-add-390.png` |
| `illustrations.tsx` | The 14 two-tone SVG illustrations as components (`IlStrip` … `IlParcel`), `illustrationFor(kind, name)` (the spec §2.13 regex rules) and `ItemIllustration` (the tile, with the red-pocket option). Plus `CategoryMark`, `AlertGlyph` (the filled triangle), `ThingsGlyph`, `LogoMark` and `Spinner`. | tiles everywhere |
| `LocalToast.tsx` | A light stand-in for sonner, used only when no `onToast` is passed. | spec §2.5 re-sort toast |
| `derive.ts` | Pure helpers: face derivation, the "needs you first" sort, counts, filter counts, headline copy, next poll, source line, quote highlight, character diff, the batch candidate rule, IST formatting ("15:08", "01 Jul 2026"). | |
| `motion.ts` | Every timing and spring from spec §3, by name. | |
| `types.ts` | API-shaped types (items, notices, stats, check-status, OCR). | |
| `adapters.ts` | `noticeFromApi()` maps the live `/v1/notices` shape onto the card fields (see §3). | |
| `fixtures.ts` | The real demo household, notices, stats, Textract words for the demo photo, and the sheet items. | |
| `demo.tsx` | `useMineDemo(state)`: full `MineViewProps` for every `?state=`, with timers standing in for the API (for `/kit` and the video). | |
| `mine.tokens.css` | The tokens this part adds (spec §4): quote, range, band and print colours, the photo table, the alert, strip and sheet shadows, and `shadow-foil-selected`. | |
| `assets/demo-strip-photo.png` | The 1400 × 1050 strip render the mockups use as the "photo". | |

The main export is `index.ts`, and it also re-exports the fixtures (as `mineFixtures`) and the helpers.

---

## 2. Wiring it in

1. **Copy** this folder to `src/components/v3/mine/`. The `ui/` primitives go next to it at `src/components/v3/ui/`.
2. **Tokens**: in `app/globals.css`, after the shared tokens:
   ```css
   @import "tailwindcss";
   @import "./globals.tokens.css";
   @import "../components/v3/mine/mine.tokens.css";
   ```
   Tailwind 4 scans `src/**` automatically. If your `@source` is narrower, add `@source "../components/v3/mine";`.
3. **Asset**: copy `assets/demo-strip-photo.png` to `public/demo/strip-photo.png`. The fixtures reference `/demo/strip-photo.png`.
4. **Route `/mine`** (`app/mine/page.tsx`, a client page). Keep the v2 data layer and hand its results to MineView. This is a sketch; the names of your API helpers will differ:
   ```tsx
   "use client";
   import { MineView, noticeFromApi, type MineFilter } from "@/components/v3/mine";
   import { toast } from "sonner";

   export default function MinePage() {
     const { items, household, makeCopy, resetCopy, viewDemo } = useHousehold();   // v2 /mine hooks, unchanged
     const stats = useStats();                                                      // GET /v1/stats
     const notices = useNotices(items, noticeFromApi);                              // GET /v1/notices/{id} per notice_id
     const checks = useCheckStatus(items);                                          // poll GET /items/{id}/check-status every 2 s while RUNNING
     const [filter, setFilter] = useUrlFilter();                                    // mirrors ?show=&kind=
     const sheet = useAddSheet();                                                    // see "Add sheet" below
     if (!items || !stats) return <MineSkeleton />;                                  // render MineView once data is in (the headline rolls 0 → n)
     return (
       <MineView
         as="div"                                // the shell already renders <main>
         household={{ mode: household.id === "demo" ? "demo" : "own", banner: household.bannerState, errorMessage: household.error, demoCount: 15 }}
         stats={stats} items={items} notices={notices} checks={checks}
         filter={filter} onFilterChange={setFilter}
         sheet={sheet.props} onAdd={sheet.open}
         onMakeCopy={makeCopy} onResetCopy={resetCopy} onViewDemo={viewDemo}
         onToast={(t) => toast(t.title, t.actionLabel ? { action: { label: t.actionLabel, onClick: t.onAction! } } : undefined)}
         onCheckNow={(id) => post(`/items/${id}/check`)} onCheckAgain={(id) => post(`/items/${id}/check`)}
         onDismiss={dismissNearMiss} onFixBatch={sheet.editBatch} onRemove={removeItem}
       />
     );
   }
   ```
   - **Links**: "Open case" goes to `/case/?id={case_id}` and "See the notice" to `/feed?id={notice_id}`, both plain `<a>`, which work with static export. To keep client navigation, pass `onOpenCase={(id) => router.push(...)}` (it calls `preventDefault`). You can also override `caseHref` and `noticeHref`.
   - **Add sheet**: the page owns `{ open, kind, step, scan, item, face, check, notice, submitting }`. For the scan:
     1. `onPhoto(file)`: `POST /uploads`, then PUT with progress. Set `scan = { phase: "uploading", progress }`.
     2. `POST /items/ocr {key}`: set `{ phase: "result", ocr }`. You can also stream `{ phase: "reading", words }` first.
     3. On errors, use `{ phase: "upload-error", status }` or `{ phase: "textract-error", message }`.

     `onSubmit(item)` goes to `POST /households` (demo only) and then `POST /items`. Then set `step: "checking"`, poll check-status, and set `step: "added"` with the derived face. On "Show it in My things", close the sheet and include the item in `items`: MineView flies the card to its slot (shared layoutId `item-{id}`, lifted above the exiting sheet). Pass a **stable** `ocr` object (keep it in state), because ScanConfirm refills the form when its identity changes.
5. **`/kit` and the video**:
   ```tsx
   "use client";
   import { MineView, useMineDemo } from "@/components/v3/mine";
   export function MineKit({ state }: { state: string }) {
     const props = useMineDemo(state);        // "demo" | "flip" | "flip-alert" | "add-confirmed" | … (MINE_STATES)
     return <MineView {...props} as="div" />;
   }
   ```
   - `?state=flip`: the Swift finishes its check 1.5 s after load, flips to "No match", holds for 700 ms, then moves between Hawkins and Milton. The legend goes 1 → 0 checking and 11 → 12 no match, and the headline doesn't change.
   - `?state=flip-alert`: Paracetamol FT5427 starts mid-check, flips to the alert face and moves to the top (with the toast if its new slot is off-screen).
   - `?state=add-idle`: "Take or choose a photo" runs the whole simulated upload → reading (words arrive 90 ms apart) → morph → check → added flow on the demo photo.
6. **Fonts**: `lib/fonts.ts` must be applied on `<html>`, because the token stacks start with `var(--font-*)`. Doto is used only inside FoilChip.

---

## 3. Props → API fields

| Prop / field | Source | Notes |
|---|---|---|
| `items: HouseholdItem[]` | the v2 `/mine` items call (path unchanged) | `item_id, kind, name, brand, batch, make, model, year, exp_date, purchase_date, status, case.decision, notice_id, case_id, reason, last_checked_at` |
| face | `deriveFace(item, check)` | `alert` ← `status=="alert"`; `needs-you` ← `"hold"`; `near-miss` ← `case.decision=="dismiss"`; `clear` ← `last_checked_at`; else `unchecked`; `checking` overrides while check-status is `RUNNING` |
| `checks[item_id]: CheckStatus` | `GET /items/{id}/check-status` | `status`, and (v3) `sources[] {source, state, result}` for the checklist rows and the progress fraction `(done + .5·running)/4` |
| `notices[notice_id]: NoticeView` | `GET /v1/notices/{id}` → `noticeFromApi(json, item)` | `batch` ← the matching entry of `batches[]` (closest by character diff for near-miss/needs-you). `month`, `row` ← `row_ref`. `reason` ← `hazard_or_failed_test` (or `raw_excerpt` column 6). `lab`, `lab_type`, `maker` ← `raw_excerpt` columns 8, 7 and 5. NHTSA: `campaign` ← `notice_id`, `summary` ← `hazard_or_failed_test` with the component prefix stripped, `model_years` ← `vehicles[]` filtered by make and model. CPSC: `number` ← `notice_id`. openFDA: `recall_number` ← `notice_id`. |
| `stats: MineStats` | `GET /v1/stats` | `total` (4,868, used in the empty copy), `sources_count` (4), `sources[].label` (joined "CDSCO, CPSC, NHTSA and openFDA"), `sources[].last_run_at` + `polls_every` → next poll (15:05 + 15 min = 15:20; the daily CDSCO poll never wins). `next_poll_at` is used when present. |
| "as of 15:08" | latest `items[].last_checked_at` | shown in IST, 24 h |
| `household.mode` / `banner` | the stored household id (`demo` or yours), plus `POST /households` and `POST /households/{id}/reset` progress | |
| `sheet.scan.scan` | `POST /uploads` → PUT, then `POST /items/ocr {key}` → `{fields, words[], passes[]}` | `words[].box` (fractions), `poly` (v3), `is_batch`, `field` (optional) |
| `onSubmit(NewItem)` | `POST /items` body | medicine: `{kind, name, brand, batch, mfg_date, exp_date, purchase_date, photo_s3_key}` (v2 names); vehicle: `{kind, name, brand, make, model, year, reg_no}` with make and model lower-cased as v2 does (`maruti suzuki` → `maruti`); appliance or other: `{kind, name, brand, model}` |

---

## 4. What the backend must add

1. **Per-source check rows.** v2 `check-status` returns pipeline `steps[]` (Candidates, Verify, RangeCheck, Decide). The checking face needs `sources: [{ source: "cdsco_nsq"|"cpsc"|"nhtsa"|"openfda", state: "waiting"|"running"|"done", result: "no_match"|"match"|null }]`. Without it, every row reads "running" until the check ends; the UI never invents progress.
2. **Textract polygons.** In `POST /items/ocr`, `words[]` should be WORD-level blocks with `poly` (the four `Geometry.Polygon` points as fractions), so the boxes follow rotated print as in the mock. Without `poly` the boxes fall back to `box` rectangles. Optional: `words[].field: "name"|"batch"|"exp_date"` anchors the numbered tags ("1 Medicine", "2 Batch", "3 Expiry") and the "5 words on the strip" hint. Without it, a heuristic matches the words against `fields`.
3. **Notice fields** (nice to have; `adapters.ts` parses them today):
   - `lab_type` for CDSCO ("State Lab"; currently raw column 7).
   - `summary` for NHTSA: the plain sentence ("The radio software may prevent the rearview image from displaying."). v2 only has the `COMPONENT: …` string.
   - `row_ref` is already present.
4. **`next_poll_at`** on `/v1/stats` (optional). The UI computes it otherwise.
5. **Demo seed**: fixtures use the real seeded ids: Jeep `case-20260920095511-5cea83`, FT5427 `case_demo_ft5427`.

---

## 5. Gaps in the shared primitives (composed around, not re-implemented)

- **FoilChip** has no `selected`, `candidate` or `editing` state.
  - selected = `className="shadow-foil-selected!"` (token in `mine.tokens.css`).
  - candidate = a wrapper with a 1.5 px dashed cobalt outline, offset 2.
  - editing = a local 52 px Doto `<input>` in ScanConfirm.
  - Its `diff` underline is a `0 3px 0` shadow under each character, not the spec's 3 px bar 5 px below the baseline with 1 px overhang. It's close at `md`; if you want exact, add the bar to FoilChip.
  - It has no `ref`/motion support, so the morph wraps it in a `motion.span` with the layoutId.
- **Chip** has one size (26 px) and fixed tones.
  - The 28 px chips ("Checking · 2 of 4", "Found a batch number", "{n} codes could be the batch") are local spans.
  - "Needs you" uses `<Chip tone="hold" className="bg-surface-1!">` (warning on white).
  - The alert badge ("ON A NOTICE", 700 12 px on white) is a local span.
- **Card** has no alert tone. The alert face uses `border-[rgb(179_18_30/0.28)]! shadow-alert!`.
- **Button** has no 52 px size and no trailing-icon slot. The CTA uses `h-[52px]! text-[16px]!`, and trailing arrows go in `children`.
- `cn` has no tailwind-merge, so every override above uses Tailwind 4's `!` suffix, and responsive-only buttons are wrapped rather than given `hidden`.

---

## 6. Decisions and small deviations to review

- **Upload and Textract errors** are shown in `--warning`, not `--danger` as spec §2.12 writes. DESIGN.md reserves red for "you're affected" and says form errors use warning.
- **Headings the spec leaves open**:
  - uploading and reading: "Reading your photo"
  - manual entry: "Type what's printed on the strip"
  - vehicle form: "Which vehicle is it?" / "We match vehicles by make, model and year."
  - appliance form: "What is it?" / "Type the brand and the model number from the label."
  - checking title for a vehicle: "Checking {name} against 4 sources"
  - added-alert for a vehicle or model: "This vehicle is on a notice" / "This model is on a notice"
- **Legend**: a "{n} not checked yet" row (dashed swatch) appears only when above 0. The spec lists no row for unchecked items.
- **QA fixtures**:
  - `add-candidates`: FT5427 unflagged, plus Textract misreading the expiry as "O9/2O27". That produces exactly the spec's "next to EXP · looks like an expiry" row.
  - `add-failed`: the batch lost to glare, so 8 words are read.
  - `many` adds 7 labelled duplicates to reach 22 things ("+7").
  - `bought-before` sets the purchase to 20 Jun 2026.
- **Sheet height**: at ≥768 px the sheet is `min(635px, 100dvh − 155px)` tall on every step, so it doesn't jump between scan, checking and added. The body scrolls if needed. At 390 the CTA is a sticky footer inside the scrolling body, not `position: fixed`, and it lands at the same y (740).
- **The batch morph** uses layoutId `scan-batch`, namespaced per ScanConfirm with a `LayoutGroup`. Step by step:
  1. The ghost chip leaves the padded word box at its angle (17.2° in the demo), with the text at 30%.
  2. It lands in the callout at full opacity. The callout's card face and label fade in separately, so the chip is never under a fading ancestor.
  3. The leader is measured from the callout after layout, so it only draws once the page is hydrated (a static render shows the box and callout without it).
- **`NumberFlow`** runs with `--number-flow-mask-height: 0px` in the headline and legend. The default mask padding adds 14 px above and below the digits and pushed the sub line 20 px down.
- **Clear-card titles** are `h3` (each card is an `article` labelled by it) with `text-wrap: wrap`, overriding the base `balance` so two-line names break as in the mock.
- **Times and dates** use `tabular-nums` because of the token base rule on `<time>`. That is slightly wider than the mock's proportional "15:08".

---

## 7. Accessibility checklist

- **Landmarks**: `MineView` renders `<main>` (or a `div` when `as="div"`) with `section`s labelled "Outcome" and "Your things". The heading order is h1 (outcome) → h2 (clear section) → h3 (each card). The sheet is `role="dialog"` + `aria-modal`, labelled by its h2.
- **Live regions**:
  - OutcomeLine repeats the sentence after a change.
  - ItemWall announces "{name}: on a notice" / "{name}: no match in 4 sources as of 15:08".
  - The banner is `role="status"`.
  - ScanConfirm announces each state's text from spec §2.12.
  - The toast is `role="status"`.
- **Focus**:
  - Every control has a visible cobalt focus style.
  - Cards are focusable (`tabindex=-1`) targets for "Show it" and pocket clicks, and get a 1.2 s cobalt outline.
  - The sheet traps focus, starts on "Take or choose a photo", moves to the read-back h3 after reading, and returns focus to the opener on close.
- **Keyboard**: arrow keys in the filter groups and the kind tabs. In the batch editor, Enter confirms and Esc cancels without closing the sheet.
- **Touch targets**: 44 px under `pointer: coarse`: pills, buttons, Edit, "See the notice", the strip "+" (a padded hit area), the overflow menu, Retake and Close. Small buttons use the primitive's `pointer-coarse:h-11`.
- **Reduced motion**: `MotionConfig reducedMotion="user"` plus explicit branches. The flip becomes two 150 ms fades, the morph and the scan-line sweep are skipped, and the global token rule stops the spinners, leaving a static ¾ arc.
