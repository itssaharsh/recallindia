# v3 components: integration guide ("Cobalt & Foil")

> The components this guide describes live in `app/src/components/v3/`. They arrived as a design
> pack whose own copy of them is not tracked here, so the paths below name the pack's layout; read
> `docs/v3/code/<folder>` as `app/src/components/v3/<folder>`. Each folder keeps its own README.

133 files. Strict `tsc` across **all** folders together: **0 errors** (snapshot 18:50 IST). Each view is presentational: it takes typed props and ships fixtures. You wire the data from the v2 hooks and API calls that already work. Nothing here calls a new endpoint.

## 1. Where each piece goes

Keep this layout. Imports between folders are relative (`../ui`), so the folders must stay siblings.

| Folder | Where it lives | Notes |
|---|---|---|
| `ui/` | `components/v3/ui/` | Button, Chip/Dot/Kbd, FoilChip, Card, `cn` |
| `shell/` | `components/v3/shell/` | AppShell, TopNav, MobileTopBar, BottomTabBar, HouseholdPill, CommandPalette, Toast, EmptyState, Skeleton, Tooltip, Brand, KitView, NotFoundView |
| `landing/` | `components/v3/landing/` | LandingView (+ its own LandingNav; no AppShell on `/`) |
| `mine/` | `components/v3/mine/` | MineView, AddThingSheet, ScanConfirm |
| `case/` | `components/v3/case/` | CaseView, ApprovalGate, PipelineAside, EvidenceBand, TamperDiff, Seal |
| `feed-ingest-api/` | `components/v3/feed-ingest-api/` | FeedView, IngestView, ApiView |
| `FoilStrip3D.tsx`, `FoilStripHero.tsx` | `components/v3/` | three.js; only the landing imports them (lazy, `ssr:false`) |
| `fonts.ts` | `lib/fonts.ts` | `next/font/google`; put `fontVariables` on `<html>` |
| `globals.tokens.css` | top of `app/globals.css` | replaces the v2 token block; drops the default Tailwind palette |
| `mine/mine.tokens.css`, `feed-ingest-api/feed-ingest-api.css` | import once from `globals.css` | small route-specific keyframes and classes |

## 2. Dependencies

```bash
npm i three@0.186.0
npm i -D @types/three@0.180.0 @fontsource/doto
```
Already in the repo (check, don't upgrade): `framer-motion`, `@number-flow/react`, `lucide-react`, `clsx`, `next@15`, `react@19`. UI fonts come from `next/font/google`. `@fontsource/doto` exists only to supply the woff2 that FoilStrip3D paints onto its canvas texture.

## 3. Routes

`app/(app)/layout.tsx` wraps every app route in one `AppShell`. `/` sits outside the group.

| Route | Renders | Wiring guide | Mockups (`docs/v3/mockups/`) |
|---|---|---|---|
| `/` | `LandingView` | `landing/README.md` §Wiring (build-time snapshot + one client refresh) | landing-1536, landing-390, -full |
| `/feed` | `FeedView` (the v2 feed moves here) | `feed-ingest-api/README.md` | feed-1536, feed-sheet-1536, feed-390 |
| `/ingest` | `IngestView` + `useIngestReplay` | same | ingest-1536, ingest-390 |
| `/api` | `ApiView` | same | api-1536, api-390 |
| `/mine` | `MineView` | `mine/README.md` | mine-*, mine-add-* |
| `/case/?id=` | `CaseView` (reads `?id=` on the client; static export) | `case/README.md` §Wiring | case-1536, -waiting, -invalid, -390 |
| `/kit` | `KitView` (`?state=` via `useSearchParams` inside Suspense) | `shell/README.md` §4 | kit-full-1536 |
| 404 | `NotFoundView` in `app/not-found.tsx` | `shell/README.md` §4 | — |

Links used everywhere: `/feed`, `/ingest`, `/mine`, `/api`, `/case/?id=case_demo_ft5427`. The Jeep case (`case-20260920095511-5cea83`) is the vehicle example.

## 4. Assets to copy into `public/`

- `node_modules/@fontsource/doto/files/doto-latin-900-normal.woff2` → `public/fonts/doto-900.woff2` (FoilStrip3D loads `/fonts/doto-900.woff2`)
- `landing/assets/scan-strip.webp` → `public/strip/scan-strip.webp`
- `mine/assets/demo-strip-photo.png` → `public/strip/demo-strip-photo.png`
- `docs/v3/mockups/strip-poster-hero.png` → `public/strip/strip-poster-hero.png` (the 3D fallback poster and LCP image)
- `docs/v3/mockups/og.png` → `public/og.png`
- `docs/v3/brand/{mark,mark-onblue,icon,lockup,lockup-onblue}.svg` → `public/brand/`, and `icon.svg` becomes the favicon

## 5. Cross-screen rules (these override any single folder)

1. **Logo:** the ink card with four pockets, bottom-right pocket red (`shell/Brand.tsx` → `Mark`). `mine/illustrations.tsx` still draws a cobalt tile; swap it for `Mark`. The same goes for any cobalt tile left in a mockup.
2. **Red** is only for: something you own being affected, an INVALID seal, a source that is down, the logo pocket, and the red count pill. A failed pipeline step uses **warning** (`text-warning`); `case/PipelineAside.tsx` is already fixed.
3. **Source colours:** CDSCO = `cat-medicine` (cobalt), CPSC = `cat-appliance` (teal), openFDA = `cat-other` (purple), NHTSA = `cat-vehicle` (orange). `landing/ProofBand.tsx` already follows this. Any per-source dot or bar elsewhere must match it.
4. **Shell sizes:** top bar 56 px, phone tab bar 64 px. The search trigger reads "Search 4,868 notices" with ⌘K. "My things" shows the red count badge only when an owned item is affected.
5. **Doto** is only for printed codes on a FoilChip. Hashes, aliases and ids use IBM Plex Mono.
6. Numbers render with `tabular-nums` on digits only, never on body.

## 6. Known duplicates (fine to ship)

- `Seal` exists in `landing/` (display only) and `case/` (owns VERIFIED and INVALID). Keep both.
- Local toasts: `case/CaseToast`, `mine/LocalToast`, `shell/Toast`. Use `shell/Toast` if time allows; otherwise leave them.
- `FilterBar` exists in `mine/` and `feed-ingest-api/`; they are different components.

## 7. Backend: optional, all with fallbacks

Don't change the backend before the video. Everything below falls back cleanly.
- `GET /v1/sources` returns 404, so the landing maps everything from `/v1/stats` (`landing/api-map.ts`, tested against live).
- The fields `notice.maker_place`, `notice.hazard_short`, `notice.manufacturer`, `lab_type`, `pending_snapshot_bytes`, NHTSA campaign/component/model years, `verify.duration_ms` and the word polygons from `/items/ocr` are all optional. The components derive them from `raw_excerpt` or hide the row.
- The demo case hash: the live `case_demo_ft5427` now returns sha `5f4b34c5…` signed 20 Sep 09:55 UTC, but the mockups show `56237b4d…`. The views render whatever the API returns, which is correct. Don't hard-code the mockup hash.
- The pipeline time (9 s) is baked into the landing snapshot because no API returns it.

## 8. State switches for QA and the video

- `/?state=` takes `reduced`, `static`, `poster`, `highlight-batch`, `highlight-pill`, `traced`.
- `/case/?id=…&state=` takes `loading`, `waiting`, `readonly`, `approving`, `sealing`, `writing`, `verifying`, `verified`, `invalid`, `rejected`, `expired`, `failed`.
- `/ingest?replay=<run>&speed=4&autoplay=1`
- `/kit?state=…`
- Each folder README lists the rest.
