# Landing `/`: React components (v3 "Cobalt & Foil")

This folder is the production version of the landing mockups. It is presentational and typed: it fetches nothing, and `LandingView` builds the whole page from one props object. Spec: `spec/landing.md`. Tokens: `code/globals.tokens.css`.

**Status**
- `tsc` reports 0 errors under `tsconfig.landing.json` (strict, with the `ui/` primitives and `FoilStrip*.tsx`).
- The page was rendered with `react-dom/server`, hydrated in Chromium with Tailwind 4.1 compiling the real tokens file, and checked against the mockups:
  - Height at 1536: 4280 px (mockup: 4279).
  - Height at 390: 7439 px (mockup: 7438).
  - Every section starts at the same y as in the mockup.
  - No hydration mismatches and no runtime errors.
  - No horizontal scroll at 360, 390, 800, 900, 1024, 1200, 1280, 1440, 1536 or 1920.
- These behaviours were also exercised in that run: the intro, chip leaders, tracer, bar growth, the stale pill, the solid nav, and `?state=` values reduced, static, poster, highlight-batch, highlight-pill and traced.

## Files and components

| File | Exports | What it is |
|---|---|---|
| `LandingView.tsx` | `LandingView`, `LandingViewProps` | Composes the page and wraps it in `MotionConfig reducedMotion="user"` (`"always"` for `?state=reduced`). Landmarks: `<header>` (nav), `<main>` (hero and sheet), `<footer>` (footer CTA). |
| `LandingNav.tsx` | `LandingNav`, `scrollToHow` | Fixed nav. Transparent and 96 px tall over the hero, then solid cobalt and 64 px from scrollY ≥ 726. Phones keep only the logo and "Open the app". |
| `Hero.tsx` | `Hero`, `LivePill`, `HERO_H1_LINES`, `HERO_SUB` | Live pill (NumberFlow total), H1 (3 line spans at ≥ 1200), sub, CTAs, stats `<dl>`, and `<FoilStripHero/>`. Plays the page's one load sequence. |
| `HowItWorks.tsx` | `HowItWorks` | Two lanes numbered 1 → 2 → 3, plus the house lane. The desktop composition is 1344 × 760 and scaled by `k`. Also holds FlowConnectors (measured SVG), the one-time tracer, and the stacked layout's lane labels and dashed connectors. |
| `MiniUI.tsx` | `MiniPdf`, `MiniFeed`, `ScanHint`, `MiniItem`, `MiniAlert`, `SealSteps` | The mini UI. Each root is `role="img"` with the spec's `aria-label`. |
| `ProofBand.tsx` | `ProofBand`, `SourceBars`, `FailedGrid` | The live proof panel: source bars in the `/feed` source colours, the 239-mark unit chart, and the feed link. |
| `ArtifactShowcase.tsx` | `ArtifactShowcase` | FactList, the case CTA, and a desk holding the claim letter, the evidence certificate and the seal, with a hover tilt. |
| `FooterCta.tsx` | `FooterCta`, `HouseholdPreview`, `itemDetail`, `AWS_SERVICES` | Cobalt footer: H2, CTAs, API line, demo household preview, "Built on AWS" and the legal row with the footer nav. |
| `Seal.tsx` | `Seal` | The VERIFIED seal as SVG, with a `useId` arc id so two seals can share a page. |
| `glyphs.tsx` | `LogoMark`, `KindTile`, `HouseGlyph`, `AlertGlyph`, `TickDisc`, category glyphs | Brand and category glyphs, drawn with the same paths as the app. Generic icons come from lucide (`Lock`, `KeyRound`, `Activity`, `ArrowRight`). |
| `types.ts` | `LandingData`, `LandingStory`, `NoticeLite`, `HouseholdItem`, `DemoCase`, `LandingLinks`, `LandingState`, `LandingDataStatus` | View-model types. |
| `fixtures.ts` | `landingSnapshot`, `landingSnapshotSourceDown`, `landingStory`, `landingLinks`, notices and items | Real demo data from the brief. `/kit` and the video can render `<LandingView data={landingSnapshot} story={landingStory} />` with no API. |
| `api-map.ts` | `landingDataFromStats`, `StatsResponse` | A pure mapper from the live `GET /v1/stats` response to `LandingData`. It was tested against the live API. |
| `qa.ts` | `useLandingQaState`, `applyLandingQa` | Reads `?state=` after hydration, so the static HTML is always the default page. Also swaps the data for `source-down` and `stale`. |
| `format.ts` | Date, number, IST and copy helpers | Uses `en-IN` grouping and an explicit `Asia/Kolkata` time zone, so server and client HTML agree. |
| `motion.ts` | Timings and easings from the spec | |
| `styles.ts` | `H2`, `LEDE`, `CTA_XL` | Shared class lists, kept in a plain module so server and client components can both import them. |
| `landing.module.css` | Geometry that would be unreadable as utilities | Gutter and content width, sheet overlaps, stage sizing and the one glow, the How-it-works scaler, the PDF table, connectors, the tracer and the scan crop. It also holds illustration-only inks such as `--band-muted #FFD9D6` and the PDF greys. |
| `assets/scan-strip.webp` | 9 KB | The light strip render cropped to the part ScanHint shows. It replaces a 453 KB full PNG. |

## Which mockup each part matches

| Component | Mockup |
|---|---|
| `LandingNav`, `Hero` | `mockups/landing-1536.png`, `mockups/landing-390.png` (first viewport) |
| `HowItWorks`, `MiniUI` | `mockups/landing-full-1536.png` y 790–2033, `mockups/landing-full-390.png` y 1007–3496 |
| `ProofBand` | `landing-full-1536.png` y 2033–2716, `landing-full-390.png` y 3496–4749 |
| `ArtifactShowcase` | `landing-full-1536.png` y 2716–3519, `landing-full-390.png` y 4749–6024 |
| `FooterCta` | `landing-full-1536.png` y 3483–4279, `landing-full-390.png` y 6000–7438 |
| Strip, chips and leaders | Owned by `FoilStripHero` (`strip3d-hero-1536.png`) |

Tablet (701–1199) follows spec §9.2: the phone order in a 640 px column.

## Props → API fields

`LandingView` props:
- `data: LandingData`
- `status?: 'snapshot' | 'live' | 'stale'`
- `story: LandingStory`
- `links?: Partial<LandingLinks>`
- `state?: LandingState`
- `assets?: { poster?; scanPhoto? }`

| Prop | Source |
|---|---|
| `data.total` | `GET /v1/stats` → `total` |
| `data.bySource.{cdsco,cpsc,nhtsa,openfda}` | `/v1/stats` → `sources[].count`, keyed by `sources[].source` (`cdsco_nsq` → `cdsco`) |
| `data.sourceCount` | `/v1/stats` → `sources_count` |
| `data.cdscoLatest.{month,label,failed}` | `/v1/stats` → `cdsco_latest.month`, formatted month, `cdsco_latest.count` |
| `data.asOf`, `data.asOfDate` | `/v1/stats` → `generated_at` in IST (`asOfDate` is added to the spec's shape for the stale copy) |
| `data.sources[].{id,schedule,status,lastRunAt}` | `/v1/stats` → `sources[].source`, `polls_every` (`1 day` → `daily`), `health` (healthy or degraded → `ok`, otherwise `down`), `last_success_at` |
| `data.pipelineSeconds` | Not in any response. Bake 9 into the snapshot (see Backend). |
| `story.notice` (`NoticeLite`) | `GET /v1/notices/{id}` → `notice_id`, `source`, `product`, `brand`, `batches`, `hazard_or_failed_test`, `lab`, `row_ref.{month,row}`, `published_at`. Plus `maker_place` and `hazard_short` (see Backend). |
| `story.neighbours` | Two neighbouring notices: CPSC 10984 and CDSCO `JUL-2026-cdsco_portal-005f85bb4ee1` (row 129) |
| `story.item`, `story.household.items` (`HouseholdItem`) | The `/mine` item list → `item_id`, `kind`, `name`, `brand`, `batch`, `purchase_date`, `notice_id`, `case_id`. `face` is derived the way `/mine` derives it. |
| `story.case` (`DemoCase`) | `GET /cases/case_demo_ft5427` → `sold_after_notice` (as days), `claim_addressee`, claim subject and paragraphs from `claim_text`, and `evidence.{sha256, signed_at, object_lock_retain_until, object_lock_mode, key_alias, signing_algorithm}`. The tamper fields come from `verify-evidence?tamper=1` → `flipped_byte_index`, `byte_before`, `byte_after`. |

Every number and date on the page comes from these props. Copy strings are built from them: "Live · {total} notices from {sourceCount} regulators", "{failed} rows", "9.0 s end to end", "Locked until 19 Oct 2026", "2 on a notice · 1 near-miss · 12 with no match in 4 sources as of 15:08" and the rest.

## Wiring it into the routes

1. **Copy the folder.**
   - Copy it to `src/components/v3/landing/`, next to `ui/` and `FoilStripHero.tsx`. It imports `../ui` and `../FoilStripHero`.
   - Copy `assets/scan-strip.webp` to `public/strip/scan-strip.webp`.
   - Put the strip poster at `public/strip/strip-poster-hero.png`, or its WebP, as `strip3d.md` describes.
2. **Map the stats in `lib/api.ts`** (it does the fetching):
   ```ts
   import { landingDataFromStats, type StatsResponse } from '@/components/v3/landing'
   const BASE = 'https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com'
   export async function getLandingData() {
     const r = await fetch(`${BASE}/v1/stats`, { cache: 'no-store' })
     if (!r.ok) throw new Error(`stats ${r.status}`)
     return landingDataFromStats((await r.json()) as StatsResponse, 9)
   }
   ```
3. **`app/page.tsx`** is a server component. With `output: export` it runs at build time, so the snapshot is baked into the HTML, which covers the spec's `public/landing-snapshot.json`:
   ```tsx
   import { landingSnapshot } from '@/components/v3/landing'
   import { getLandingData } from '@/lib/api'
   import { LandingClient } from './landing-client'
   export default async function Page() {
     const snapshot = await getLandingData().catch(() => landingSnapshot)
     return <LandingClient snapshot={snapshot} />
   }
   ```
4. **`app/landing-client.tsx`** refreshes the numbers once on the client and applies `?state=`:
   ```tsx
   'use client'
   import { useEffect, useState } from 'react'
   import { applyLandingQa, LandingView, landingStory, useLandingQaState, type LandingData, type LandingDataStatus } from '@/components/v3/landing'
   import { getLandingData } from '@/lib/api'
   export function LandingClient({ snapshot }: { snapshot: LandingData }) {
     const state = useLandingQaState()
     const [data, setData] = useState(snapshot)
     const [status, setStatus] = useState<LandingDataStatus>('snapshot')
     useEffect(() => { getLandingData().then((d) => { setData(d); setStatus('live') }).catch(() => setStatus('stale')) }, [])
     const qa = applyLandingQa(state, data, status)
     return <LandingView data={qa.data} status={qa.status} story={landingStory} state={state} assets={{ poster: '/strip/strip-poster-hero.webp' }} />
   }
   ```
5. **Move the old feed.** The v2 feed moves from `/` to `app/feed/page.tsx` (IA change in the brief). Nav and footer link to `/feed`, `/ingest`, `/mine`, `/api` and `/case/?id=case_demo_ft5427`. Override any of these with `links`.
6. **Keep the shell off `/`.** The app shell's top nav must not render on `/`, because the landing has its own `LandingNav`. Put the other routes in a route group with the shell layout, or skip the shell when `pathname === '/'`.
7. **For `/kit` and the video:**
   ```tsx
   <LandingView data={landingSnapshot} story={landingStory} state="static" />
   ```
   Use `state="traced"` or `"highlight-pill"` for stills.

## Motion (as specified)

- **Hero load sequence.** This is the page's only orchestrated sequence, run with framer-motion springs.
  - Live pill: 0 ms, 240 ms, ease `(.2,.8,.2,1)`.
  - H1 lines: 60, 120 and 180 ms, spring 0.4 s with bounce 0.08, rising 18 px. Below 1200 px the H1 moves as one block.
  - Stage: 120 ms, rising 28 px from scale 0.96.
  - Sub, CTAs and stats: 320, 420 and 520 ms, spring 0.36 s with bounce 0.
  - `FoilStripHero` plays 700–1600 ms on the same clock (`introStart`).
  - t0 is the first frame after `document.fonts.ready`, or 300 ms after hydration, whichever comes first.
  - Reduced motion: everything fades together over 200 ms.
  - No JS: a `<noscript>` rule shows everything at rest.
- **Tracer.** Runs once, on desktop only, at ≥ 40 % visibility: 1400 ms, `cubic-bezier(.65,0,.35,1)`.
  - The "On a notice" badge pulses 1 → 1.06 → 1 over 200 ms on arrival.
  - The dot then fades over 200 ms. It travels behind the cards, like the wires.
- **Proof bars.** They grow once, from 0, when live data lands while the panel is off-screen and it then reaches 40 %: 400 ms each, 60 ms stagger, NumberFlow in step.
  - If the panel is already on screen when the data lands, the bars just move from the old widths to the new ones.
- **Desk tilt.** On hover, with a fine pointer and motion allowed: `--ease-spring` over 300 ms.
- **Nav.** Height and background change over 200 ms.
- Nothing else moves on scroll.

## Accessibility

- **Headings.** One `<h1>`. `h2`s: How it works, a visually hidden "The live feed right now", The artifact, and the footer. Each step has an `h3`, with a visually hidden "Step n." prefix.
- **Illustrations.** The mini UI, the desk and the unit chart are `role="img"` with the spec's labels. Bars are `aria-hidden`, and names and values stay in the text. The strip's text equivalent comes from `FoilStripHero`.
- **Focus.**
  - On cobalt (nav): a 2 px white outline at a 3 px offset, as the spec says. The token's box-shadow ring is suppressed there.
  - Elsewhere: the global `--focus-ring`. Cobalt regions carry `data-surface="cobalt"`.
- **Touch targets.** Nav links are 48 px. Buttons are 44–54 px. The proof link and footer nav links are 44 px. The logo and the API docs link get `pointer-coarse:min-h-11`.
- **Live regions.** The spec defines no `aria-live` regions for `/`, so there are none. The live total updates silently.

## Composed around the primitives (no new variants were added to `ui/`)

- **`Button` has no 54 px size.** `CTA_XL` in `styles.ts` composes one with `!` utilities: 54 px (50 on phones), 17 px text, padding 26, press scale 0.98, focus offset 3.
  - The hover on the outline-on-blue CTA is also added with `!`.
  - A future `size="xl"` in `ui/Button` would remove this.
- **`Button` press colour on blue.** The spec asks for `--cobalt-100` (#D9E5F8) on press, which is not a token, so the primitive's hover colour is kept.
- **Pictured buttons.** The mini alert's "Approve and seal evidence" and "Not mine" are pictures, so they are `<span>`s styled as the primary and secondary pills, not `Button`.
- **Overrides with `!`.**
  - `Chip` becomes the 24 px CDSCO source pill (11 px, 700, 0.05em).
  - `FoilChip` `sm` gets radius 7 and padding 9 (MiniFeed); `md` gets 21 px text (MiniItem).
  - `Card` gets the cobalt 1.5 px border (focus notice), the danger/28 border (mini alert) and `shadow-2`.
  - `Dot` gets a 7 px size for the feed's source dots.
- **`Seal`.** It lives here because `/case` owns the INVALID variant. When both land, merge them into one shared `Seal` with a `variant` prop.

## Deviations from the spec text, and why

- **Tracer positioning.** The tracer moves along the concatenated wire path with `getPointAtLength` in a rAF loop, instead of CSS `offset-path`. The path, the 1400 ms and the easing are unchanged. Engines disagree about where `path()` puts its origin.
- **Proof panel big figures.** "4,868" and "239" are plain text. NumberFlow's digit mask adds about 22 px of padding at 88 px, which moved the panel 50 px off the mockup. NumberFlow is still used for the hero pill total and the four bar values, where the spec asks for it.
- **Feed link.** "See all 239 in the feed" goes to `/feed?source=cdsco_nsq&month=JUL-2026`, the params the `/feed` spec defines, not the landing spec's `?source=cdsco&month=2026-07`.
- **"Watch a PDF become the feed".** It links to plain `/ingest`, because `/ingest` autostarts its replay 400 ms after the first page renders.
- **ScanHint on phones.** The word boxes now shift with the phone crop, so they sit on the printed "B.No." and "FT5427". In the mockup they were 16 px off at 390.
- **`?state=reduced`.** It forces reduced motion for framer-motion. `FoilStripHero` reads the OS setting itself, so its chips still draw normally in that QA state.
- **Tokens.** Category colours are never used as text. The feed's source inks are CPSC `#0B6E55` (a module variable), CDSCO cobalt, openFDA ink-muted and NHTSA `--warning`.

## Backend must add

1. **`GET /v1/sources` returns 404.** The page takes everything from `/v1/stats` → `sources[]`, which already has `polls_every`, `health` and `last_success_at`. Either add the route the brief lists, or drop it from the API docs.
2. **`pipelineSeconds`.** The approve → verified time is not in any response. Add `pipeline_ms` (or per-step `started_at` and `finished_at` with real spans) to `GET /cases/case_demo_ft5427`. The seeded case's steps all finish in the same second. Until then, the snapshot bakes `9`.
3. **`maker_place` on CDSCO notices.** For example "Baddi, HP", parsed from `raw_excerpt`'s address. MiniFeed shows it.
4. **`hazard_short` on NHTSA notices.** For example "rearview camera", shown in the household preview.
5. **Evidence values.** The live `case_demo_ft5427` was re-seeded. It now returns sha256 `5f4b34c5…` signed 2026-09-20 09:55 UTC and locked until 2026-10-20, while the brief, mockups and fixtures use `56237b4d…` signed 2026-09-19 23:58 UTC and locked until 2026-10-19. Pick one before the recording and update `fixtures.ts` (`landingStory.case.evidence`) to match what `/case` shows.
6. **Seeded `item_id`s.** Only `demo-alert` is a known live id. The other `item_id`s in `fixtures.ts` are slugs. Replace them with the seed's ids when `/mine` shares this fixture. They are never displayed.
