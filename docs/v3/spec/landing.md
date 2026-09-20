# Landing page `/` (v3 "Cobalt & Foil")

The mockups for this spec are `mockups/landing-1536.png` (first viewport, 1536×790), `mockups/landing-full-1536.png` (full page, 4279 px tall), `mockups/landing-390.png` (first viewport, 390×844) and `mockups/landing-full-390.png` (full page, 7381 px tall).
The HTML source is `v3/mock/landing.html`, served by the harness at `/v3/mock/landing.html`. It has been checked with no horizontal scroll at 360, 390, 800, 900, 1024, 1200, 1280, 1440, 1536 and 1920 px.
Tokens come from `code/globals.tokens.css` (the same values as `v3/mock/base.css`). This page adds only the landing tokens listed in section 11.

---

## 1. Screen

**Purpose.** In 10 seconds a first-time visitor should understand three things: India publishes drug-quality failures that nobody reads, RecallIndia checks them against what you own, and you come away with a claim letter backed by sealed evidence. The page then proves the claim with live numbers and sends the visitor into `/mine`.

**First 10 seconds, as recorded at 1536×790:**
- 0 to 1.6 s: the hero intro sequence runs (section 3).
- The headline states the problem.
- The strip shows the object.
- The white chip names the batch printed on the foil.
- The red chip gives the regulator's verdict on the red pill.
- The top chip shows the outcome (claim letter ready, evidence sealed, VERIFIED).
- The three stats prove the claim with data.
- Both CTAs sit above the fold: "Check what you own" is the core loop and "Watch a PDF become the feed" is the signature demo.

**Reading order (DOM order equals visual order on desktop):**
1. Nav
2. Live pill
3. H1
4. Sub
5. CTAs
6. Stats
7. Strip (decorative, with a hidden text equivalent)
8. How it works
9. Live proof
10. The artifact
11. Footer CTA

On phones the strip moves to just after the H1; section 9 covers this.

### 1.1 Layout at 1536 (reference) and 390

| Region | 1536: x, y, w × h | 390: x, y, w × h |
|---|---|---|
| Hero (cobalt, `overflow:hidden`) | 0, 0, 1536 × **790** | 0, 0, 390 × 1007 (min 844) |
| Hero content box `.hero-in` | 96, 0, 1344 × 790 | 16, 0, 358 × auto |
| Nav bar | 96, 24, 1344 × 48 | 16, 0, 358 × 64 |
| Live pill | 96, 134, 294 × 34 | 16, 74, 276 × 30 |
| H1 | 96, 192, 680 × 204 (3 lines) | 16, 120, 358 × 114 (3 lines) |
| Sub | 96, 416, 590 × 87 | 16, 545, 358 × 96 |
| CTAs | 96, 533, row, 54 tall, gap 12 | 16, 661, stacked, 50 tall, gap 8 |
| Stats row | 96, 625, 720 × 100 | 16, 797, 358 × 182 (three rows) |
| 3D stage (poster or canvas) | 726, 104, 896 × 672 (runs 86 px past the right edge and is clipped by the hero) | −2, 240, 420 × 315 |
| Canvas sheet (radius 36 top, 24 on phones) starts at | y 790 | y 1007 |
| How it works | 0, 790, 1536 × 1243 | 0, 1007, 390 × 2489 |
| Live proof | 0, 2033, 1536 × 683 (panel 96, 2033, 1344 × 555) | 0, 3496, 390 × 1253 |
| The artifact | 0, 2716, 1536 × 803 (desk 668, 2748, 772 × 600) | 0, 4749, 390 × 1275 (desk full-bleed 390 × 548) |
| Footer CTA (cobalt, radius 36 top, overlaps the artifact by 36) | 0, 3483, 1536 × 796 | 0, 6000, 390 × 1438 |

The first viewport is exactly the 790 px hero. `.top` (the cobalt wrapper) has `padding-bottom:36px`, and the sheet has `margin-top:-36px`. This way the rounded top of the canvas sheet begins at y = 790 with cobalt behind its corners, so the first pixel below the fold is the curve.

### 1.2 Grid and breakpoints

- **Content width.** `--wrap: 1344px`, `--gut: max(40px, (100vw − 1344px) / 2)`. That gives a 96 px gutter at 1536, 48 at 1440, 40 at 1280 and 288 at 1920. Every section, including the hero content box, uses `width: min(1344px, 100% − 2 × gut)`, so all left edges line up.
- **Desktop, 1200 px and wider.** This is the layout in the 1536 mockups.
  - From 1200 to 1439 px, the hero type and stage scale with the viewport (section 2).
  - The How-it-works composition is one 1344 × 760 piece, scaled by `k = contentWidth / 1344` (0.833 at 1200, 0.893 at 1280, 1 from 1440).
- **Tablet, 701–1199 px.** The phone sequence runs in a 640 px column (section 9.2).
- **Phone, 700 px and narrower.** This is the layout in the 390 mockups (section 9.1).

### 1.3 Data

The page is statically exported, so every number is baked at build time from the API into `public/landing-snapshot.json`. The page then refreshes these numbers on the client. The page reads one view model:

```ts
type LandingData = {
  total: number                     // 4868  ← GET /v1/stats (all notices)
  bySource: { cdsco: number; cpsc: number; openfda: number; nhtsa: number } // 2696, 1852, 282, 38 ← GET /v1/stats
  sourceCount: number               // 4     ← GET /v1/sources (array length)
  cdscoLatest: { month: string; label: string; failed: number } // 'JUL-2026', 'July 2026', 239 ← GET /v1/stats (latest CDSCO month)
  asOf: string                      // '15:08' (IST, HH:MM) ← stats generation time
  sources: { id: 'cdsco'|'cpsc'|'nhtsa'|'openfda'; schedule: '15 min'|'daily'; status: 'ok'|'down'; lastRunAt: string }[] // ← GET /v1/sources
  pipelineSeconds: number           // 9     ← demo case case_demo_ft5427 timing (approve → verified), baked in the snapshot
}
```

The API base is `https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com`. Public, no key.
Map the response keys into this shape in `lib/api.ts`. The UI reads only `LandingData`.
How it works, The artifact and the footer's household preview use the demo fixtures: the demo household used by `/mine` and the case `case_demo_ft5427`. They are real records, not mock copy.

### 1.4 Page states (`?state=`)

| Value | What renders |
|---|---|
| `default` | Snapshot numbers, replaced by live numbers when they arrive. The intro plays. 3D loads if allowed. |
| `static` | No intro and no 3D: everything at rest with the poster. This state must match `landing-1536.png` and `landing-390.png` pixel-for-pixel in layout. |
| `poster` | 3D disabled, poster and chips only, with the intro. |
| `reduced` | Behaves as if `prefers-reduced-motion: reduce` were set. |
| `stale` | The stats fetch failed, so the page shows snapshot values with the stale copy (section 4.2, section 6.2). |
| `source-down` | `/v1/sources` reports CPSC `down`. The proof band shows the source-down row. |
| `highlight-batch` / `highlight-pill` | The intro ends in that highlight and keeps it. |
| `scrolled` | Loads scrolled to y = 900, with the nav in its solid state. |
| `traced` | How it works with the tracer already at the seal. |

---

## 2. Section 1: Hero

### 2.1 LandingNav
- **Purpose.** Brand, the three places to go, and the way into the app.
- **Placement.**
  - At rest, the content sits at y = 24 in a 48 px bar across the hero content box.
  - The logo is on the left: a 30 px mark, a 10 px gap, then "RecallIndia" in Funnel Display 800, 22 px, −0.03em.
  - The links and the pill are on the right.
- **Links.**
  - "How it works" (`#how`), "Live feed" (`/feed`), "API" (`/api`).
  - Onest 500, 15 px, `--on-cobalt-muted` (4.84:1 on cobalt).
  - Padding 15 × 16 px, so each is 48 px tall.
  - Hover: `#FFFFFF`.
- **Pill.** "Open the app" (`/mine`) is `.btn-onblue`: white, text `--cobalt`, 44 px tall, padding 0 22 px, 12 px left margin. Hover `--cobalt-soft`, press `--cobalt-100`.
- **States.**
  - `overHero`: transparent, full height 96 (the bar centred on y = 48).
  - `scrolled`: triggered at scrollY ≥ 726, which is the hero bottom minus 64. The bar is 64 tall with a `--cobalt` background, a `1px solid rgba(255,255,255,.14)` bottom border and a `0 8px 24px -12px rgba(0,26,70,.35)` shadow.
- **Transitions.** Height and background change over 200 ms, `cubic-bezier(.2,.8,.2,1)`.
- **Responsive.**
  - On phones the bar is 64 tall, the three text links are hidden, and the logo is 20 px. The "Open the app" pill stays: 44 tall, padding 0 18.
  - Tablet shows all links.
  - The nav is `position: fixed`. The hero content is offset by the rest height, which the mockup already encodes.
- **Keyboard and a11y.**
  - `<nav aria-label="Main">`.
  - Focus ring on cobalt: `outline: 2px solid #FFFFFF; outline-offset: 3px`.
  - "How it works" smooth-scrolls to `#how` (`scroll-margin-top: 88px`). Under reduced motion it jumps.
- **Acceptance.** `?state=scrolled` shows the solid bar. There is no layout shift of the hero when the state flips.

### 2.2 LivePill
- **Purpose.** Show that the page is live before the headline is read.
- **Size and tokens.**
  - 34 tall, padding 0 14 0 12, gap 10.
  - Border `1px solid rgba(255,255,255,.34)` (`--on-line`), pill radius.
  - Onest 500, 14 px, `--on-cobalt-muted`. "Live" is Onest 600, white.
  - Dot: 8 px `--live` (#3DDC84) with a `0 0 0 4px rgba(61,220,132,.22)` halo.
- **States (copy).**
  - `live`: "**Live** · {total} notices from {sourceCount} regulators" → "Live · 4,868 notices from 4 regulators".
  - `stale`: the dot turns `--on-cobalt-muted` with no halo, and the copy reads "Updated {DD Mon YYYY}, {HH:MM} IST · {total} notices from {sourceCount} regulators".
- **Motion.** When the live total differs from the snapshot, `@number-flow/react` ticks the number: 400 ms, `trend` +1. This is a state change, not a loop.
- **Responsive.** On phones: 30 tall, 13 px.
- **Data.** `total`, `sourceCount`, `asOf`.

### 2.3 HeroCopy (H1 and sub)
- **H1.** "When your medicine fails a quality test, nobody tells you."
  - Funnel Display 800, `font-size: clamp(52px, 4.43vw, 68px)`, which is 68 at 1536. Line height 1, letter-spacing −0.037em, white, `text-wrap: balance`, max width 680.
  - At 1536 it breaks as "When your medicine / fails a quality test, / nobody tells you."
  - Margin 24 above, 20 below.
- **Sub.** "RecallIndia reads India's drug-quality alerts and recall notices the day they're published, checks them against the things in your house, and hands you a claim letter with sealed evidence."
  - Onest 400, `clamp(17px, 1.24vw, 19px)`, line height 1.52, `--on-cobalt-muted`, max width 590, margin-bottom 30.
- **Responsive.**
  - Phone: H1 38 px, line height 1, 3 lines at 390, margin 16 above and 6 below. Sub 16 px, line height 1.5.
  - Tablet: H1 56 px, sub 18 px.
- **Keyboard and a11y.** The page's only `<h1>`.

### 2.4 HeroCTAs
- **Primary.** "Check what you own" → `/mine`.
  - `.btn-onblue` with `.btn-xl`: 54 tall, padding 0 26, Onest 600, 17 px, white fill, cobalt text (6.59:1).
- **Secondary.** "Watch a PDF become the feed" → `/ingest`, arriving with its replay started. Pass the route's existing replay flag; the `/ingest` spec owns its name.
  - `.btn-outline-onblue`: 54 tall, border `--on-line`, white text.
  - A 22 px play disc sits at the start: `rgba(255,255,255,.18)` fill with a 10 px white triangle.
- **States.** Hover:
  - Primary: `--cobalt-soft` fill.
  - Secondary: border becomes `rgba(255,255,255,.7)` and the fill `rgba(255,255,255,.08)`.
- **States.** Press: scale 0.98, 120 ms. Focus: white ring, 3 px offset.
- **Responsive.** Phone: stacked, full width, 50 tall, 16 px, gap 8. Tablet: side by side.

### 2.5 HeroStats
- **Purpose.** Three facts from data that back up the headline.
- **Markup.** A `<dl>` grid with columns `196fr 222fr 200fr`, gap 24, `margin-top:38px`. It has a `1px solid rgba(255,255,255,.22)` top border and `padding-top:20px`.
- **Copy.**
  - `<dt>` in Funnel Display 800, 32 px, white. `<dd>` in Onest 400, 14 px, line height 1.4, `--on-cobalt-muted`, `text-wrap: pretty`.
  - "{cdscoLatest.failed}" / "drug samples failed CDSCO tests in {cdscoLatest.label}" → "239 / drug samples failed CDSCO tests in July 2026".
  - "15 min" / "between polls of CPSC, NHTSA and openFDA; CDSCO daily". Built from `sources[].schedule`.
  - "{pipelineSeconds} s" / "from your approval to a signed, locked claim" → "9 s".
- **Responsive.** Phone: one row per stat, each a grid of `92px 1fr`, gap 12, baseline-aligned, rows 12 apart, `padding-top:18px`; 24 px numbers, 14 px labels, line height 1.4. Tablet: 3 equal columns, gap 24, 30 px numbers and 14 px labels.

### 2.6 FoilStrip3D, the stage
See section 4 for the component contract and how the chips follow the strip.

- **Placement.** `--sw: clamp(620px, 58.33vw, 896px)`, width `--sw`, height `0.75 × --sw`.
  - `left: calc(100% − --sw × 0.797)` inside `.hero-in`. The strip's right tip (poster x 1116 of 1400) therefore lands on the content box's right edge.
  - `top: calc(104px + (672px − 0.75 × --sw) / 2)`.
  - At 1536 this gives 726, 104, 896 × 672.
- **Glow.** The one allowed soft glow sits behind the object as `.stage::before`: left −12%, top −9.5%, 116% × 122%, `radial-gradient(closest-side, rgba(255,255,255,.17), rgba(255,255,255,.07) 55%, rgba(255,255,255,0))`. On phones it moves to `.hero::before`: left −240, top 470, 870 × 520.
- **Text equivalent.** The stage is `aria-hidden="true"`. A visually hidden paragraph comes before it: "Illustration: a strip of Paracetamol Tablets IP 650mg, batch FT5427, with one red tablet. The batch is listed in the CDSCO July 2026 alert, row 12: failed dissolution test. Claim letter ready, evidence sealed, verified."

### 2.7 StripAnnotations: three chips and one leader SVG
There are three chips: two drawn onto the object and one outcome chip.

| Chip | Face | Copy (small / strong) | 1536 box | 390 box |
|---|---|---|---|---|
| `batch` | White, ink text; code in Doto 900, 21 px, 0.07em | "Batch on your strip" / "FT5427" | 829, 566, 136 × 68 | 17, 468, 121 × 58 |
| `pill` | `--danger` fill, white text, small line `#FBEAE8` (5.97:1) | "CDSCO · {month label} · row {n}" / "Failed: {reason, sentence case}" → "CDSCO · July 2026 · row 12" / "Failed: dissolution test" | 1220, 616, 187 × 67 | 199, 476, 164 × 58 |
| `corner` | White; 30 px check disc in `--success` stroke | "Claim letter ready" / "Evidence sealed · **VERIFIED**" (VERIFIED in `--success`, Onest 600) | 1173, 192, 267 × 64 | 147, 244, 225 × 57 |

- **Chip tokens.** Radius 14. Padding 11 14 12 (the corner chip uses 11 16 11 12). Small line in Onest 500, 12 px. Strong line in Onest 600, 15 px. Shadow `0 2px 4px rgba(0,26,70,.10), 0 18px 40px -12px rgba(0,26,70,.45)`.
- **Chip tokens on phones.** Padding 8 11 9, radius 12, small line 11 px, strong line 13 px, code 17 px, check disc 24 px.
- **Leaders.** One SVG covers the stage, with `overflow: visible` and `pointer-events: none`. It sits above the canvas and below the chips.
  - Batch:
    - A solid white 3 px underline with round caps runs from anchor `a` to anchor `b` under the printed "FT5427".
    - A white dot of r 4.5 marks the anchor.
    - A white dashed leader (2 px, `stroke-dasharray: 4 5`, round caps) runs from the anchor (+4 y) straight to the chip's top edge, at 78% of the chip's width.
  - Pill:
    - A 2 px white ring of radius `r` circles the red pill.
    - A dot of r 4.5 sits at the ring bottom (y + r).
    - The dashed leader runs from the ring bottom (+3) to the chip top, at 27% of its width (34% on phones).
  - The corner chip has no leader.
- **States.** `rest` · `highlight-batch` · `highlight-pill` · `intro` (section 3).
  - On hover over a chip (pointer only), set `highlight` on FoilStrip3D to that chip's anchor. The chip gets `box-shadow: 0 0 0 2px #FFFFFF, <chip shadow>`.
  - On pointerleave, set `null`.
  - The chips are not links and not focusable.

---

## 3. Hero load choreography (one sequence, 1600 ms)

- **Start.** t = 0 is the first paint after `next/font` has the display font ready. If the font is not ready 300 ms after hydration, start anyway.
- **Hidden start.** Everything in the table starts hidden (`opacity: 0`) from server-rendered CSS. A `<noscript>` style and `?state=static` show it at rest.
- **Springs** are framer-motion `{ type: 'spring', duration, bounce }`.
- **Draw** means animating `stroke-dashoffset` from the path length to 0 with `cubic-bezier(.4,0,.2,1)`. Leaders draw from the object out to the chip.

| Start (ms) | Duration | Element | From → to | Easing |
|---|---|---|---|---|
| 0 | 240 | Live pill | opacity 0 → 1 | `cubic-bezier(.2,.8,.2,1)` |
| 60 · 120 · 180 | 400 each | H1 lines 1 · 2 · 3 (split into 3 line spans at ≥ 1200 px; one block below that) | y 18 → 0, opacity 0 → 1 | spring 0.4 s, bounce 0.08 |
| 120 | 400 | Stage wrapper (poster or canvas, same transform) | y 28 → 0, scale 0.96 → 1, opacity 0 → 1 | spring 0.4 s, bounce 0.08 |
| 320 | 360 | Sub | y 12 → 0, opacity 0 → 1 | spring 0.36 s, bounce 0 |
| 420 | 360 | Both CTAs together | y 12 → 0, opacity 0 → 1 | spring 0.36 s, bounce 0 |
| 520 | 360 | Stats row (rule and 3 stats) | y 8 → 0, opacity 0 → 1 | spring 0.36 s, bounce 0 |
| 700 | 160 | Batch underline a → b | draw | draw |
| 700 | 200 | `highlight='batch'` (underline glow on the foil, section 4.4) | intensity 0 → 0.9 | ease-out |
| 760 | 220 | Batch leader and dot | dot scale 0 → 1, then line draws anchor → chip | draw |
| 880 | 300 | Batch chip | scale 0.92 → 1 (origin at the leader's exit point), opacity 0 → 1 | spring 0.3 s, bounce 0.1 |
| 960 | 240 | Pill ring, and `highlight='pill'` (emissive 0.2 → 0.5, scale 1 → 1.06) | draw / spring | draw / spring 0.3 s, bounce 0.1 |
| 1100 | 200 | Pill leader | draw | draw |
| 1200 | 300 | Red chip | scale 0.92 → 1, opacity 0 → 1 | spring 0.3 s, bounce 0.1 |
| 1240 | 300 | Corner chip | y −10 → 0, opacity 0 → 1 | spring 0.3 s, bounce 0.1 |
| 1300 | 240 | Check mark in the corner chip | draw | draw |
| 1300 | 300 | `highlight=null` (emissive 0.5 → 0.2, scale 1.06 → 1) | | ease-out |
| **1600** | | Intro complete: `hero='rest'`, tilt enabled | | |

- **Rules:**
  - Nothing loops afterwards.
  - Input during the intro does not cancel it.
  - Tilt and chip hover are ignored until 1600 ms.
  - If the 3D canvas becomes ready during the sequence, it waits for the sequence to finish and then crossfades in (section 4.5), so the anchors never jump mid-draw.
- **Reduced motion:**
  - Every element above fades in together, opacity 0 → 1 over 200 ms, starting at 0 ms.
  - There is no y or scale motion and no line drawing: lines appear with the fade.
  - There is no highlight pulse.
  - `interactive` is false.

---

## 4. How the DOM chips and leader lines follow the 3D strip

### 4.1 Component contract

```tsx
type Pt = { x: number; y: number }                 // CSS px relative to the FoilStrip3D root's top-left
type StripAnchors = {
  batch: Pt & { a: Pt; b: Pt }                     // centre and ends of the underline under the printed "FT5427"
  pill: Pt & { r: number }                         // red pill centre and its projected radius
  corner: Pt                                       // strip's top-right corner (placement only, no leader)
  source: 'poster' | '3d'
}

<FoilStrip3D
  variant="dark"                                   // 'dark' = cobalt page (poster /strip-dark), 'light' = app screens (/strip-light)
  highlight={null | 'batch' | 'pill'}
  interactive={boolean}                            // pointer tilt; false on touch, reduced motion, during intro
  onAnchors={(a: StripAnchors) => void}
  onReady={() => void}                             // first WebGL frame rendered with the Doto texture
  poster="/landing/strip-dark.webp"                // 1400×1050, transparent; PNG fallback /strip-dark.png
/>
```

- `three@0.186.0` in a client component, loaded with `next/dynamic({ ssr: false })`. The import starts on `requestIdleCallback` after hydration (timeout 800 ms), so it never blocks LCP.
- The poster `<img>` is server-rendered in the same box: `width=1400 height=1050`, `fetchpriority="high"`, `alt=""`. It is the LCP candidate on desktop.

### 4.2 Anchor sources

**Poster anchors, used from the first paint.** On mount, FoilStrip3D calls `onAnchors` once with these points multiplied by `s = rootWidth / 1400`. It calls again on every `ResizeObserver` change. The chips therefore never wait for WebGL.

| Anchor | Poster px (1400 × 1050) |
|---|---|
| batch | centre (411, 613), a (358, 596), b (463, 630) |
| pill | centre (862, 628), r 54 |
| corner | (1115, 450) |

**3D anchors, after `onReady`.** These are points in the strip group's local space (units), projected every rendered frame:

| Anchor | Local point |
|---|---|
| batch a / b | x from the texture itself: `x0 = U(-2.6) + ctx.measureText('B.No. ').width`, `x1 = x0 + ctx.measureText('FT5427').width` (canvas px → strip units: `(px / 2320 − 0.5) × 5.8`), y −1.31, z 0.036 |
| batch centre | midpoint of a and b |
| pill centre | (1.15, −0.50, 0.13); `r` = distance between the projections of the centre and (1.46, −0.50, 0.13) |
| corner | (2.90, 1.55, 0.035) |

- **Projection:** `v.copy(p).applyMatrix4(strip.matrixWorld).project(camera)`, then `x = (v.x + 1) / 2 × cssWidth` and `y = (1 − v.y) / 2 × cssHeight`.
- **Emission:** `onAnchors` fires only when some anchor moved more than 0.5 px since the last call.
- **Poster match:** the poster is rendered from this exact scene and camera (`mock/strip.html`: camera FOV 28 at (0.6, −0.9, 13.5) looking at (0, −0.1, 0); strip rotation (−0.42, 0.38, −0.16)). At rest, the 3D anchors must match the poster anchors within 2 px. **Re-render the poster whenever the scene changes.**

### 4.3 Chip placement and leader drawing (StripAnnotations)

- **Placement.** Chip position = anchor + offset × `k`, where `k = max(0.8, s / sRef)`. `sRef` is 0.64 on desktop (the 1536 stage) and 0.30 on the stacked layouts (the 390 stage).

| Chip | Desktop dx, dy | Leader exit | Stacked dx, dy | Leader exit |
|---|---|---|---|---|
| batch | −160, +70 | 78% of chip width, top edge | −104, +44 | 78% |
| pill | −58, +110 | 27% | −58, +48 | 34% |
| corner | −262, −200 | none | −186, −138 | none |

- **Clamp.** Keep each chip inside the hero content box: x ∈ [contentLeft, contentRight − chipWidth] and y ≥ 4 inside the stage. At 1280 this keeps the batch chip 48 px clear of the text column.
- **One writer per frame.** `onAnchors` stores the points in a ref and schedules one `requestAnimationFrame` write, in the same frame the WebGL render happened. That write:
  - sets each chip's `transform: translate3d(x, y, 0)`. Chips are never positioned with `top` or `left` after mount.
  - rewrites the SVG `d`, `cx`, `cy` and `r` attributes directly.
  - does **not** set React state per frame. React state holds only `highlight` and the intro phase.
- **Following during tilt.**
  - Leader endpoints on the strip track their anchors 1:1.
  - Each chip translates by **35%** of its anchor's displacement from rest. The chips feel pinned to the object while staying calm, and the leader's angle visibly changes, which shows it is attached.
- **Resize.** A `ResizeObserver` on the stage re-runs placement. Font loading also triggers a re-placement (`document.fonts.ready`).

### 4.4 `highlight`
- `'batch'`: an emissive underline band 0.03 units tall appears under "FT5427" on the foil texture. Its intensity goes 0 → 0.9 in 200 ms, and the printed code darkens to `#0B1B33`.
- `'pill'`: the red pill's `emissiveIntensity` goes 0.2 → 0.5 over 240 ms and its scale 1 → 1.06 (spring 0.3 s, bounce 0.1).
- `null`: everything returns to rest over 300 ms.
- On the poster there is no 3D highlight, so only the DOM ring on the chip shows.

### 4.5 `interactive`, rendering, fallback
- **Tilt.**
  - Enabled when all of these hold: `(pointer: fine)`, not reduced motion, intro complete, canvas ready.
  - The pointer position over the whole hero (0–1 in x and y) sets target offsets: Δyaw = (px − 0.5) × 0.12 rad and Δpitch = (py − 0.5) × 0.08 rad.
  - Spring: stiffness 170, damping 26, mass 1, which gives no visible overshoot.
  - `pointerleave` returns the strip to rest.
  - There is no idle motion, auto-rotation or float.
- **Render on demand.**
  - Frames are drawn only while a spring is unsettled (|v| > 1e-4) or a highlight is animating.
  - Rendering stops completely while the hero is off-screen (IntersectionObserver, threshold 0).
  - `setPixelRatio(min(devicePixelRatio, 2))`.
- **Swap.**
  - After `onReady` (and after the intro if it is still running), the canvas fades in over the poster: opacity 0 → 1 in 200 ms, ease-out.
  - Then `visibility: hidden` goes on the poster. Because the framing is identical, the swap is invisible.
  - `onAnchors` switches to `source: '3d'`.
- **Poster only.** The poster stays when any of these hold:
  - phones (≤ 700 px) or touch-only pointers
  - `navigator.connection.saveData`
  - `navigator.deviceMemory ≤ 2`
  - no WebGL2
  - no first frame within 2500 ms of mount
  - `webglcontextlost`
  - `?state=poster` or `?state=static`

  Nothing else changes in this case: the chips, leaders and intro run on the poster anchors.

---

## 5. Section 2: How it works (`#how`)

- **Purpose.** Show the whole system as one batch's journey, drawn with real mini UI in HTML.
- **Header.** A grid of `1fr 440px`, gap 64, aligned to the end, margin-bottom 64. Section padding: 120 top, 128 bottom.
- **H2.** "Follow one batch from a government PDF to your claim letter."
  - Funnel Display 800, 56 px, line height 1.02, −0.035em, max width 780.
- **Lede.** "In July 2026, **batch FT5427** of Paracetamol Tablets IP 650mg failed a dissolution test. Here is how that one line in a PDF reaches the people holding the strip."
  - Onest 400, 18 px, line height 1.55, `--ink-muted`. Bold runs are Onest 600 in `--ink`.

### 5.1 Composition (desktop, 1344 × 760, coordinates relative to the flow box)
There are two lanes. The top lane is labelled "Notices" and the bottom lane "Your house". Both labels are vertical: Onest 700, 12 px, 0.12em, uppercase, `--cobalt`, at x −44. The lanes merge into step 3 on the right. Only the notices lane is numbered (1 → 2 → 3, left to right on the top row); the house lane runs in parallel and carries a house badge instead of a number, so the top row never reads "1, 2, 4".

| Step | Box | Mini UI |
|---|---|---|
| 1 | 0, 0, w 460 | Caption; MiniPdf at 0, 112, 460 × 278, rotated −1.2° |
| 2 | 540, 0, w 360 | Caption; MiniFeed stack at 540, 112 |
| House | 0, 452, w 460 | Caption; ScanHint at 0, 564, 460 × 178 |
| House b | 540, 452 | MiniItem card at 540, 576, 360 wide |
| 3 | 1000, 0, w 344 | Caption; MiniAlert at 1000, 112, 344 wide; SealSteps at 1000, 508, 344 wide |

- **Step caption.** A 34 px cobalt disc with the number (Funnel Display 700, 17 px, white). The house step uses a 34 px `--cobalt-soft` disc with a 1.5 px inset `--cobalt` ring and an 18 px house icon in `--cobalt` (the same glyph as the app nav's household pill), `aria-hidden`. The title is Onest 700, 20 px, line height 1.25. The text is Onest 400, 15 px, line height 1.5, `--ink-muted`, max width 380.

| Step | Title | Text |
|---|---|---|
| 1 | CDSCO publishes a PDF | Every month, a list of drug samples that failed quality tests. {cdscoLatest.label} had **{cdscoLatest.failed} rows**. |
| 2 | Every row becomes a notice | Textract reads the table. Each row is cleaned up and published to the feed and the public API. |
| House | Meanwhile, you add what you own | Photograph the strip. Textract finds the batch and it becomes a chip on your list. |
| 3 | A match waits for you | Nothing happens until you approve. Then the notice is sealed as evidence and your claim letter is written. |

### 5.2 Mini UI components (illustrations, built in HTML)
Each mini UI root has `role="img"` and an `aria-label` (below). Its inner "buttons" are `<span>`s, not controls.

- **MiniPdf** (`aria-label="CDSCO July 2026 alert PDF, row 12 highlighted: Paracetamol Tablets IP 650mg, batch FT5427, Forgo Pharmaceuticals, failed Dissolution Test, tested by DTL Bikaner"`).
  - White paper, radius 6, shadow `0 1px 0 rgba(11,27,51,.05), 0 2px 6px rgba(11,27,51,.08), 0 24px 48px -20px rgba(11,27,51,.30)`, padding 16.
  - Header:
    - A 22 px round emblem with a `#8A94A3` stroke, reading "CDSCO".
    - Title "Drugs declared Not of Standard Quality": Onest 700, 8.5 px, uppercase.
    - Sub "Alert for the month of July 2026 · state and central labs".
    - File name "NSQ-JUL-2026.pdf" in Plex Mono, 9 px, on the right.
  - Table: `table-layout: fixed`, columns # 16 · Name of drug 132 · Batch 38 · Manufacturer 101 · Reason (auto, 83) · Tested by 58.
    - Header row in Onest 700, 7.5 px, uppercase, `#F3F5F8` fill.
    - Rows 9–15 are 24 tall. Every row except 12 shows grey 5 px bars (`#DCE1E8`) at 60–94% width.
    - Row 12 is real text in Onest 600, 8.5 px, `--ink`: "12 · Paracetamol Tablets IP 650mg · FT5427 · Forgo Pharmaceuticals · Dissolution Test · DTL Bikaner". No cell may clip; this is an acceptance check.
  - The box around row 12:
    - `2px solid --cobalt`, radius 5, fill `rgba(10,88,194,.07)`, inset 10 px left and right.
    - A tab label "Row 12" on its top-right edge: 19 tall, `--cobalt` fill, white, Onest 700, 10.5 px.
  - The bottom 34 px fades to white to suggest more rows.
- **MiniFeed** (`aria-label="Feed notice: CDSCO JUL-2026 row 12, Paracetamol Tablets IP 650mg, batch FT5427, failed Dissolution Test, published 01 Jul 2026"`).
  - A context row sits above and another below: real neighbouring notices, not placeholders. Each is 50 tall, radius 12, white, `1px solid --line`, padding 0 14. Source code in Onest 700, 11 px, 0.04em, in its source ink (CPSC `#0B6E55`, CDSCO `--cobalt`) after a 7 px dot of the same colour; title Onest 500, 13 px, `--ink`, ellipsized; date on the right, 12.5 px, `--ink-muted`.
    - Above: "CPSC  Infrared Saunas, Hybrid Infrared Saunas and Infrared Kits  17 Sep".
    - Below: "CDSCO  Aceclofenac & Paracetamol Tablets IP · row 129  01 Jul".
  - The focus card: white, `1.5px solid --cobalt`, radius 14, `--shadow-2`, padding 16 18.
    - Top line: source pill "CDSCO" (24 tall, `--cobalt-soft` / `--cobalt`, Onest 700, 11 px, with a 12 px medicine icon), then "JUL-2026 · row 12", then "01 Jul 2026" on the right. Onest 500, 13 px, `--ink-muted`.
    - Title "Paracetamol Tablets IP 650mg": Onest 700, 18 px.
    - Meta "Forgo Pharmaceuticals · Baddi, HP": 14 px, `--ink-muted`.
    - Bottom line: foil chip "FT5427" (28 tall, Doto 17 px, radius 7) and tag "Failed: Dissolution Test" (28 tall, `--surface-2`, Onest 500, 13 px).
- **ScanHint** (`aria-label="Phone camera view of the strip; Textract found batch FT5427"`).
  - 460 × 178, radius 14.
  - Background: `/strip-light.png` sized 1260 × 945 at position −160, −405, over `#E9EDF2`. A bottom shade runs from `rgba(11,27,51,0)` at 55% to `rgba(11,27,51,.30)`.
  - Four 26 px white viewfinder corners (3 px, radius 6) sit 14 px in from the edges.
  - Word boxes are rotated 17.7° to follow the print:
    - "B.No." and "EXP" boxes: 1.5 px `rgba(10,88,194,.55)`.
    - "FT5427" box: 2 px `--cobalt` with a `rgba(10,88,194,.12)` fill.
  - A result pill at bottom-left (18, 16): "Batch found: FT5427". White, 30 tall, Onest 600, 13 px, with an 8 px cobalt dot.
- **MiniItem** (`aria-label="Your list: Paracetamol Tablets IP 650mg, batch FT5427, checking 4 sources"`).
  - White card, radius 14, `--shadow-2`, padding 16 18.
  - A 44 px medicine icon tile (`--cobalt-soft` / `--cat-medicine`).
  - Title "Paracetamol Tablets IP 650mg": Onest 700, 17 px.
  - Meta "Forgo Pharmaceuticals · bought 12 Jul 2026": 13.5 px. Non-breaking spaces inside "Forgo Pharmaceuticals" and "bought 12 Jul 2026" so it wraps only after the "·" and never leaves "2026" alone.
  - Footer row, above a 1 px `--line` rule: label "BATCH" (Onest 500, 12 px, 0.06em), foil chip "FT5427" (34 tall, Doto 21 px), then "Checking 4 sources" in `--cobalt` with a static 14 px ring. The ring is `--cobalt-soft` with a `--cobalt` top arc and does not spin: it is a picture.
- **MiniAlert** (`aria-label="On a notice: your batch FT5427 failed a dissolution test, CDSCO July 2026 row 12"`). It is a miniature of the `/mine` alert face, so the words and the red band match the app.
  - White card, `1px solid rgba(179,18,30,.28)`, radius 14, shadow `0 2px 4px rgba(11,27,51,.05), 0 22px 44px -20px rgba(179,18,30,.45)`.
  - Face band: `--danger` fill, 48 tall, padding 0 18. It holds the badge "On a notice" (26 tall, white fill, `--danger` text, Onest 700, 12 px, 0.04em, uppercase, 14 px alert-triangle icon) and "CDSCO · July 2026 · row 12" on the right (12.5 px, `#FFD9D6`, 5.3:1).
  - Body, padding 14 18 18:
    - "Your batch FT5427 failed a dissolution test": Onest 700, 17 px, `text-wrap: balance` (breaks as "Your batch FT5427 / failed a dissolution test").
    - "You bought it on **12 Jul 2026**, 11 days after the alert was published.": 14 px.
    - Two pictured buttons, 40 tall: "Approve and seal evidence" (primary) and "Not mine" (secondary).
- **SealSteps** (`aria-label="After approval: evidence sealed, claim letter written, signature verified, in 9 seconds"`).
  - A grid of `132px 1fr`, gap 18.
  - The round VERIFIED seal (section 7.3) at 132 px, rotated −8°.
  - A list of three items, each with a 20 px `--success` tick:
    - "Evidence sealed" / "S3 Object Lock, 30 days"
    - "Claim letter written" / "Cites row 12 as published"
    - "Signature verified" / "AWS KMS"
  - A full-width footer above a `1px dashed --line` rule: "**{pipelineSeconds.toFixed(1)} s** end to end in the demo case" → "**9.0 s** end to end in the demo case" (the same figure and one decimal as `/case`). The number is Funnel Display 800, 20 px. It deliberately does not repeat the hero stat's wording.

### 5.3 FlowConnectors (desktop)
One SVG, 1344 × 760, sits behind the cards.

- **Line style.** `--cobalt`, 2 px, `stroke-dasharray: 5 6`, round caps.
- **Start marker.** A white circle of r 4.5 with a 2 px cobalt stroke.
- **End marker.** A cobalt arrowhead, 9 × 10.
- **Curves.** Cubic Béziers with horizontal tangents: `C x1+m y1, x2−m y2, x2 y2` where m = half the horizontal distance.
- **Paths.** All endpoints are measured from the DOM on layout, font load and resize, then divided by `k`:
  1. From the right edge of the row-12 box to the left edge of the feed card, at mid-height.
  2. From the right edge of the scan, at the height of the FT5427 word box, to the left edge of the item card.
  3. From the right edge of the feed card and from the right edge of the item card, to a junction dot (r 5, cobalt). The junction is at x = midway between the feed card and the alert card, y = alert top + 70. From the junction, a straight line runs to the alert card's left edge.
  4. A vertical line from the alert card's bottom to the seal's top, with a downward arrowhead.
- **Labels.** These are pills on the wires:
  - "Same batch FT5427": cobalt fill, white, 32 tall, Onest 600, 13 px, with the code in Doto 14 px. It rides the rising wire from "Your house".
  - "After you approve": white, `1px --line`, 26 tall, Onest 600, 12 px, `--ink-muted`. It sits 78 px right of the vertical wire.

### 5.4 Motion
- **Tracer.** It runs once per page view, when `#flow` first becomes ≥ 40% visible on desktop.
  - A 10 px `--cobalt` dot with a 3 px white ring travels the path row 12 → feed card → junction → alert card → seal.
  - Duration 1400 ms, `cubic-bezier(.65,0,.35,1)`, using `offset-path` on the concatenated path.
  - When it reaches the alert card, the "On a notice" badge scales 1 → 1.06 → 1 over 200 ms.
  - After arrival the dot fades out over 200 ms.
- **Other motion.** None: cards and wires are visible from the start, and nothing fades in on scroll.
- **Where the tracer does not run.** Phones, tablets and reduced motion.

### 5.5 Responsive
- **1200–1439 px.** The whole 1344 × 760 composition gets `transform: scale(k)` with origin 0 0. A wrapper reserves `760 × k` of height. `k` is set from a `ResizeObserver` as `contentWidth / 1344`.
- **1199 px and narrower.** Section 9.

---

## 6. Section 3: Live proof band

- **Purpose.** Prove the feed is real and big, and name the four regulators, before asking for anything.
- **Layout.**
  - Section padding: 0 top, 128 bottom.
  - Panel: white, `1px --line`, radius 22, `--shadow-1`, grid `1fr 452px`.
  - Left column padding 52 56 48. Right column padding 52 52 48, with a `1px --line` left rule and `display:flex; flex-direction:column`.
- **Heading.** A visually hidden `<h2>` reads "The live feed right now".

### 6.1 SourceBars (left)
- **Top line.** "Live feed · as of {asOf} IST" → "Live feed · as of 15:08 IST". The dot is 8 px `--success` with a 4 px `--success-soft` halo.
- **No legend.** Every bar is labelled with its source, and bars use the source identity colours from `/feed` (CDSCO cobalt, CPSC green, openFDA purple, NHTSA orange), so a category legend would only contradict them.
- **Big figure.** "{total}" (Funnel Display 800, 88 px, line height 0.9, −0.045em) next to "notices in one feed, from {sourceCount} regulators" (Onest 600, 22 px, max width 250, `text-wrap: balance`, so it sets as "notices in one feed, / from 4 regulators"). The pair is `align-items: flex-end`, gap 20, with 4 px bottom padding on the label so its last line sits on the numeral's baseline.
- **Bars.** Four rows in this order, gap 18. Each row is a grid of `230px 1fr`, gap 20.
  - Name: Onest 700, 16 px. Description: 13.5 px, `--ink-muted`.
  - Track: 30 tall, with a 1 px `--line-strong` baseline at x 0.
  - Fill width = `(trackWidth − 70px) × value / max`, minimum 4 px. Radius `0 8px 8px 0`.
  - Value: Funnel Display 700, 20 px, tabular, 12 px after the fill.

| Name | Description | Value | Colour |
|---|---|---|---|
| CDSCO | Drug samples that failed quality tests · India | {bySource.cdsco} → 2,696 | `--cat-medicine` (#0A58C2, the `/feed` CDSCO colour) |
| CPSC | Consumer product recalls · US | 1,852 | `--cat-appliance` |
| openFDA | Drug, device and food recalls · US | 282 | `--cat-other` (#6A5C8A, the `/feed` openFDA colour) |
| NHTSA | Vehicle safety recalls · US | 38 | `--cat-vehicle` |

- **Footer.** Above a `1px --line` rule: "CPSC, NHTSA and openFDA polled every 15 min" · "CDSCO daily" · the code chip `GET /v1/stats` (Plex Mono, 13 px, `--surface-2`).
- **States.**
  - `snapshot`: bars at their final widths from the build-time snapshot.
  - `growing`: when live data has arrived **and** the panel is ≥ 40% visible, the bars grow once from 0 to width. Each bar takes 400 ms (spring, bounce 0), staggered 60 ms in the order above. NumberFlow counts the values in step.
  - `settled`: later live changes animate from the old width to the new one over 400 ms.
  - `stale`: the top line reads "Snapshot · {DD Mon YYYY}, {HH:MM} IST" with a `--line-strong` dot.
  - `source-down`: that source's description line is replaced by "{Name} is not responding · last update {HH:MM} IST" with an 8 px `--danger` dot. This is red's permitted "source that is down" use.
- **A11y.** Bars are `aria-hidden`. The names and values stay as text in the DOM.

### 6.2 FailedGrid (right)
- **Figure.** "{cdscoLatest.failed}" (Funnel Display 800, 88 px) with "failed samples in the {cdscoLatest.label} CDSCO alert, one mark each" → "failed samples in the July 2026 CDSCO alert, one mark each" (Onest 600, 20 px, max width 330) below it. This captions the unit chart rather than repeating the hero stat.
- **Unit chart.**
  - 239 marks, 13 × 8, radius 4, `#A9C0E6`, in 20 columns with a gap of 7 × 4.
  - Mark 12 is `--danger` with a `0 0 0 3px #fff, 0 0 0 5px --danger` ring.
  - `role="img"`, `aria-label="{n} marks, one per failed sample; row 12 is highlighted"`.
- **Note.** A 14 × 8 red key, then "Row 12 is batch FT5427 · the strip in the demo household".
- **Link.** "See all {n} in the feed" with a 16 px arrow → `/feed?source=cdsco&month=2026-07`. Onest 600, 15 px, `--cobalt`, 44 px tall, pinned to the column bottom with `margin-top:auto`.

---

## 7. Section 4: The artifact

- **Layout.** Grid `500px 1fr`, gap 72, centred vertically. Section padding: 0 top, 140 bottom.

### 7.1 Left column
- **H2.** "You walk away with a letter and sealed proof." (56 px).
- **Lede.** "The letter cites the notice exactly as CDSCO published it. RecallIndia locks that copy and signs it, so your pharmacy can check it for itself."
- **FactList.** Three rows, each a grid of `40px 1fr`, gap 14, padding 16 0, with `1px --line` rules. Each icon tile is 40 px, `--cobalt-soft` / `--cobalt`, radius 12.
  - Lock icon: "Locked until 19 Oct 2026" / "S3 Object Lock, governance mode, 30 days".
  - Key icon: "Signed with AWS KMS" / `alias/recallindia-signing` (Plex Mono, 12.5 px) · "RSASSA_PKCS1_V1_5_SHA_256".
  - Pulse icon: "Tamper test built in" / "Change byte 335 from 0x6e to 0x6f and the seal turns INVALID. Verify again: VERIFIED."
- **CTA.** "Open the FT5427 case" → `/case/?id=case_demo_ft5427`. `.btn-primary` `.btn-xl`, 54 tall.

### 7.2 Desk (right)
- **Desk.** 772 × 600, `--cobalt-soft`, radius 22, `overflow:hidden`, `role="img"`, `aria-label="Claim letter and evidence certificate for batch FT5427, sealed and verified"`.
- **Paper tokens.** White, radius 6, shadow `0 1px 0 rgba(11,27,51,.04), 0 3px 8px rgba(11,27,51,.08), 0 36px 60px -24px rgba(0,40,110,.38)`.
- **LetterPaper.** At 44, 46, 372 × 500, rotated −4°, padding 34.
  - Header: "Claim letter" · "20 Sep 2026".
  - "To: The pharmacy".
  - Subject, Onest 700, 13 px: "Subject: Refund or replacement: Paracetamol Tablets IP 650mg, batch FT5427, failed CDSCO quality test (July 2026 alert, row 12)".
  - Body, 11.5 px, line height 1.6, `#2F3C52`:
    - "I bought Paracetamol Tablets IP 650mg made by Forgo Pharmaceuticals, batch FT5427, on 12 Jul 2026."
    - "This batch is listed in the CDSCO July 2026 alert, row 12, published on 01 Jul 2026. The sample failed the Dissolution Test at DTL Bikaner."
    - "Please refund or replace it."
  - "Yours sincerely," with a 120 px signature rule.
  - Attachment bar at the bottom (`--surface-2`, radius 8): a lock in `--success`, "Attached: sealed notice" / `sha256 56237b4d…4b9c29a7`.
- **EvidenceCertPaper.** At 398, 92, 352 × 440, rotated 3.5°, padding 26 28, with a 6 px `--success` top band.
  - Header: logo mark, "Evidence certificate" (Funnel Display 800, 19 px) / "CDSCO · JUL-2026 · row 12".
  - Key-value list, gap 12:
    - "SHA-256" / `56237b4d612cf0bcd7e97aa1d6ddb88ebdb31f3f23708a6028ac10ab4b9c29a7` (Plex Mono, 11 px, breaks anywhere)
    - "Signed" / "2026-09-19 23:58 UTC (05:28 IST 20 Sep)"
    - "Key" / "alias/recallindia-signing"
    - "Locked until" / "2026-10-19 · governance mode"
- **Seal.** 176 px at 586, 352, rotated −10°, `drop-shadow(0 10px 18px rgba(18,122,85,.25))`.
- **Motion.** On pointer hover over the desk (desktop only), the letter rotates −4° → −2.5°, the certificate 3.5° → 2° and the seal −10° → −6° (spring 0.3 s, bounce 0.1). Pointerleave returns them. Nothing moves on scroll.

### 7.3 Seal (shared with /case, drawn as SVG)
- **Construction.** viewBox 200.
  - White disc r 96.
  - `--success` outer ring r 92, 5 px.
  - Inner ring r 58, 2.5 px.
  - Ring text on an r 74 path: "EVIDENCE SEALED · KMS SIGNED · RECALLINDIA ·". Onest 700, 14.5 px, 3.2 letter-spacing, `--success`, `textLength` 458.
  - `--success` core r 54 with a white 9 px check.
  - "VERIFIED" in Onest 700, 13 px, 1.6 letter-spacing, white, at y 134.
- **The INVALID variant** belongs to `/case` and does not appear here.

---

## 8. Section 5: Footer CTA

- **Layout.**
  - Cobalt, radius 36 on top, `margin-top:-36px`, so it overlaps the artifact section's bottom padding.
  - Inner padding: 112 top.
  - Grid `1fr 520px`, gap 80.
- **H2.** "Check what you own." Funnel Display 800, 80 px, line height 0.98, −0.04em, white.
- **Sub.** "Open the demo household: 15 things checked against {sourceCount} sources, with 2 on a notice. Or make your own copy and add your strips, your car and your appliances." 19 px, `--on-cobalt-muted`, max width 540.
- **CTAs.** "Open the demo household" → `/mine` (white pill) and "Browse the live feed" → `/feed` (outline). Both 54 tall. The primary names its result and does not repeat the H2.
- **ApiLine.** "Build on it:", then the link "Read the API docs" → `/api` (white, Onest 600, underline offset 3 at `rgba(255,255,255,.5)`), then the code chip `GET /v1/notices?source=cdsco` (Plex Mono, 13 px, `rgba(0,30,90,.28)` fill, radius 8).
- **HouseholdPreview.** White card, radius 22, rotated 1.5°, shadow `0 30px 60px -24px rgba(0,20,70,.55)`, padding 22 22 12. `aria-label="Preview of the demo household"`.
  - Header "Demo household" with a pill "Read-only · 15 things".
  - Outcome line: "**2 on a notice** · 1 near-miss · 12 with no match in 4 sources as of 15:08". "2 on a notice" is in `--danger`. The words are the ones `/mine` uses.
  - Four rows, each with a 38 px category icon tile, title, subline and status chip:
    - "Paracetamol Tablets IP 650mg" / "Batch FT5427 · CDSCO July 2026, row 12" / chip `alert` "On a notice".
    - "Jeep Compass 2022" / "NHTSA 24V436000 · rearview camera" / chip `alert` "On a notice".
    - "Paracetamol Tablets IP 650mg" / "Batch FT5428 · listed batch is FT5427" / chip `hold` "Near-miss".
    - "Havells Efficiencia Neo Ceiling Fan" / "No match in 4 sources as of 15:08" / chip `clear` "No match".
  - Data comes from the demo household fixture, the same one `/mine` uses.
- **AwsRow.** 96 above, padding 28 0 30, `1px rgba(255,255,255,.2)` top rule.
  - "Built on AWS" in Onest 600, 14 px, white.
  - Nine plain text chips, **not links**: 32 tall, `1px --on-line`, Onest 500, 13.5 px, white. They read: EventBridge · Lambda · Step Functions · Textract · DynamoDB · S3 Object Lock · KMS · API Gateway · Amplify.
- **LegalRow.**
  - 22 0 30 padding, top rule at 0.14 opacity.
  - Logo lockup (17 px), then "Built for WeMakeDevs × AWS First Commit" in `--on-cobalt-muted`.
  - Footer nav on the right (`aria-label="Footer"`): Feed `/feed` · Ingest `/ingest` · My things `/mine` · API `/api`. Each link is 44 tall.

---

## 9. Mobile and tablet

### 9.1 Phone, 700 px and narrower (mockups `landing-390.png`, `landing-full-390.png`)
- **Hero order:** nav, live pill, H1, **strip**, sub, CTAs, stats. The strip goes right after the headline so the object and its chips stay above the fold.
  - The H1 is 38 px on 3 lines.
  - The stage is 420 × 315 at x −2 and y 240, bleeding off the right edge and clipped by the hero, with `margin-bottom:-10px`.
  - At 390 × 844 the first viewport shows the live pill, headline, strip with all three chips, sub, both CTAs and the top of the stats.
  - The chips must not overlap the H1 or the sub. This is a checked acceptance item.
- **3D on phones.** The poster only, with no WebGL. The intro runs the same on the poster: 1600 ms, or 200 ms opacity only under reduced motion.
- **How it works** is one vertical sequence in a 358 px column.
  - Lane labels are horizontal: "NOTICES" before step 1 and "YOUR HOUSE" before the house step (Onest 600, 12 px, 0.12em, `--ink-muted`, followed by a 1 px `--line` rule). There is 56 px above "YOUR HOUSE".
  - The mini UIs are full width with no rotation.
  - MiniPdf drops the Manufacturer and Tested-by columns. What remains: # 16 · Name 132 · Batch 44 · Reason (auto).
  - Vertical connectors are 2 px dashed `--cobalt`, 64 px tall (88 with a label), with a 12 × 8 arrowhead:
    - "Textract reads every row" between 1 and 2
    - a plain connector between the scan and the item card
    - "Same batch FT5427" between the item card and step 3
  - SealSteps use a 112 px seal.
- **Live proof.**
  - The panel stacks in one column (`minmax(0,1fr)`).
  - The big numbers are 64 px.
  - Each bar has its label above it.
  - The footer lines stack without separator dots.
  - The unit grid is 20 fluid columns, max width 316, with 7 px tall marks.
- **Artifact.** Text first, then the desk full-bleed at 390 × 548:
  - letter at 14, 34, scale 0.72
  - certificate at 132, 214, scale 0.66
  - seal 124 px at right 10, bottom 22
- **Footer.**
  - Single column, H2 48 px.
  - CTAs full width.
  - The API code chip wraps under the link.
  - The household card is not rotated. Row titles wrap to 2 lines and chips stay top-right.
  - AWS chips wrap.
  - The legal row stacks.
- **Touch.** No tilt, no hover highlight, no tracer. All targets are ≥ 44 px.
- **Sizes:** the full page is 7438 px tall at 390. There is no horizontal scroll at 360 or 390.

### 9.2 Tablet, 701–1199 px
- The phone order runs in a 640 px column (`min(640px, 100% − 64px)`), and the nav shows all links.
- H1 56 px, sub 18 px.
- Stage 688 × 516 at x −24.
- CTAs side by side, 54 tall.
- The full six-column MiniPdf.
- H2 46 px.
- Desk 640 tall, radius 22: letter scale 0.92, certificate 0.88, seal 156.
- Footer H2 64 px, household card rotated 1.5°.
- 3D loads when `(pointer: fine)`.

---

## 10. Scroll behaviour (all widths)

1. **Nav.** Fixed. It switches from transparent to solid cobalt at scrollY ≥ 726 (section 2.1).
2. **Anchors.** `#how` uses `scroll-margin-top: 88px` and smooth scroll. Reduced motion jumps.
3. **3D.** Rendering pauses whenever the hero is out of view and resumes on re-entry, with no re-intro. Nothing about the strip is linked to scroll.
4. **How it works.** The single tracer runs once at ≥ 40% visibility (desktop).
5. **Proof bars.** They grow once when data is present and the panel is ≥ 40% visible.
6. **Nothing else moves on scroll.**
   - no parallax
   - no pinned or sticky sections apart from the nav
   - no scroll-jacking
   - no fade-in-on-scroll for text or cards

   All content is present at first paint, so screen recordings, no-JS visitors and search crawlers see the complete page.
7. **Sheet overlaps.** These are static geometry: the canvas sheet over the hero at y 790 and the footer over the artifact at −36.

---

## 11. Tokens added by this page (landing only)

| Token | Value | Use |
|---|---|---|
| `--live` | `#3DDC84` | Live dot on cobalt only (3.69:1 against cobalt, non-text) |
| `--on-line` | `rgba(255,255,255,.34)` | Outline button and live pill borders on cobalt |
| `--gut` | `max(40px, (100vw − 1344px)/2)` | Page gutter (16 on phones) |
| `--sheet-radius` | 36 px (24 on phones) | Canvas sheet and footer top corners |
| Glow | `radial-gradient(closest-side, rgba(255,255,255,.17), rgba(255,255,255,.07) 55%, rgba(255,255,255,0))` | The single allowed soft glow, behind the strip |
| Chip shadow on cobalt | `0 2px 4px rgba(0,26,70,.10), 0 18px 40px -12px rgba(0,26,70,.45)` | Hero annotation chips |
| Paper shadow | `0 1px 0 rgba(11,27,51,.04), 0 3px 8px rgba(11,27,51,.08), 0 36px 60px -24px rgba(0,40,110,.38)` | Letter and certificate |
| Display sizes | H1 68/1 −0.037em · section H2 56/1.02 −0.035em · footer H2 80/0.98 −0.04em · proof figures 88/0.9 −0.045em | |

Checked contrast pairs:
- white / cobalt 6.59
- `#CFDEF6` / cobalt 4.84
- white / danger 6.95
- `#FBEAE8` / danger 5.97
- ink-muted / white 7.17
- ink-muted / canvas 6.67
- cobalt / cobalt-soft 5.29
- success / success-soft 4.64
- warning / warning-soft 5.09

On light surfaces the focus ring is `2px solid --cobalt` with a 2 px offset. On cobalt it is `2px solid #FFFFFF` with a 3 px offset.

Anti-slop check for this page:
- The live pill is the only chip above a heading, and it carries data.
- There is no eyebrow on any section heading.
- There is no gradient text, glass or glow blob other than the one strip glow.
- The certificate's top band is a document header, not a side stripe.
- None of the How-it-works steps share a card shape: a paper page, a feed stack, a photo, an item card, an alert card and a seal list.

---

## 12. Acceptance
1. At 1536 × 790 the first viewport shows only the hero, and the curve of the canvas sheet starts at y = 790. Compare with `landing-1536.png`.
2. `document.documentElement.scrollWidth` equals the viewport width at 360, 390, 800, 900, 1024, 1200, 1280, 1440, 1536 and 1920.
3. At every width, no annotation chip's box intersects the H1, the sub, the CTAs, the stats or the nav.
4. At rest with the 3D ready, each anchor is within 2 px of its poster anchor × scale. Tilting moves the leader endpoints exactly with the strip (same frame) and the chips by 35%.
5. The intro finishes by 1600 ms. With reduced motion the page only fades in, over 200 ms.
6. Every MiniPdf cell passes `scrollWidth ≤ clientWidth` (no clipped words), including row 12 at every breakpoint.
7. Every number on the page comes from `LandingData`, which is populated from `/v1/stats`, `/v1/sources` and the demo fixtures. No literal counts appear in components.
8. `?state=` values from section 1.4 render as described. `?state=static` matches the four mockups.
9. Lighthouse on desktop: LCP is the poster or the H1, and the three.js chunk is not part of the initial JS.

---

## 13. Jury critique (Best UI pass, 20 Sep 2026)

This pass was a jury review followed by surgical fixes. The concept, the hero and the section order are unchanged. The four mockups were re-shot after the fixes: `landing-1536.png`, `landing-full-1536.png` (now 4279 px tall), `landing-390.png` and `landing-full-390.png` (now 7438 px tall). `scrollWidth` equals the width at 360, 390, 800, 1024, 1280, 1440, 1536 and 1920. Consistency was checked against `feed-1536.png`, `case-1536.png` and `mine-390.png`.

**Grade: 7.5 / 10 before, 8.5 / 10 after.**

The hero was already jury-grade: cobalt, the real 3D strip, leader lines onto the printed batch and the red pill, and a one-line problem statement. Points were lost below the fold, where the page stopped reading like the app it sells.

### Problems found (most damaging first)
1. **How it works read "1, 2, 4" across the top row, with "3" stranded bottom-left.** The first thing a scanning juror asks is "where is 3?". The lanes that explain the order were 11 px grey vertical text in the gutter, so nobody saw them.
2. **Context rows looked like empty placeholders.** The two feed rows around the focus card had dashed borders on a canvas fill, which reads as a loading skeleton or a drop zone, as if the section were unfinished.
3. **Source colours contradicted `/feed`.** The openFDA bar was medicine-blue, but `/feed` paints openFDA purple. A category legend ("Medicine / Products / Vehicles") sat over bars that are really sources, so the proof panel and the feed header disagreed.
4. **The 4,868 label broke badly.** "notices in one feed, from 4 / regulators" left a widow that hung below the numeral's baseline.
5. **Words and alert style differed from the app.** The landing said "Needs you", "2 need you" and "Near miss", while `/mine` and `/case` say "On a notice" and "Near-miss". The mini alert card used a soft pink face, while the app's alert face is a solid red band with a white badge.
6. **The footer CTA repeated its heading.** The H2 "Check what you own." sat over a "Check what you own" button, so the button didn't name its result.
7. **Orphans in the mini UI.** The item card broke as "bought 12 Jul / 2026" and the alert title as "failed a dissolution / test".
8. **The same facts appeared twice word for word.** "9 s from your approval to a signed, locked claim" was in both the hero and the flow. "239 drug samples failed CDSCO (quality) tests in July 2026" was in both the hero and the proof panel. It read as padding.
9. **At 390 the hero stats were cramped.** Three 110 px columns forced 12.5 px captions onto four lines ("between polls / of CPSC, NHTSA / and openFDA; / CDSCO daily").

### What changed
1. **Flow numbering.** Only the notices lane is numbered: 1 CDSCO publishes a PDF → 2 Every row becomes a notice → 3 A match waits for you. The house lane now has a house badge (the soft cobalt disc with a ring, using the app nav's household glyph) and the title "Meanwhile, you add what you own". The lane labels are now Onest 700, 12 px, `--cobalt`. On phones the order is 1, 2, house, 3.
2. **Context rows.** They are now real neighbouring notices: white, `1px --line`, a coloured source dot and code (CPSC green ink, CDSCO cobalt), an `--ink` title and a date ("17 Sep", "01 Jul").
3. **Proof bars.** Bars use the `/feed` source identity: CDSCO `#0A58C2`, CPSC `#0E8A6A`, openFDA `#6A5C8A`, NHTSA `#C25E00`. The legend is removed, since every bar is labelled.
4. **The 4,868 label.** It is balanced to two lines (max width 250) and bottom-aligned to the numeral with `align-items:flex-end`.
5. **Vocabulary and alert face.** The mini alert is now a miniature of the `/mine` alert face: a 48 px `--danger` band, a white uppercase "On a notice" badge with the alert triangle, and `#FFD9D6` source text. In the footer the outcome line reads "2 on a notice · 1 near-miss · 12 with no match…", the chips read "On a notice" and "Near-miss", and the sub reads "with 2 on a notice".
6. **Footer CTA.** The primary button is now "Open the demo household" → `/mine`.
7. **Orphans.** The alert title uses `text-wrap: balance`. The item meta uses non-breaking spaces so it breaks as "Forgo Pharmaceuticals · / bought 12 Jul 2026".
8. **Repeated stats.** The flow footer is now "9.0 s end to end in the demo case", which matches `/case`. The proof panel's 239 captions its own chart: "failed samples in the July 2026 CDSCO alert, one mark each".
9. **390 stats.** Each stat is now a row (`92px 1fr`, 24 px number, 14 px caption on at most 2 lines). Tablet keeps 3 columns.

### Not fixed (outside this screen's files)
- **The strip's shadow.** Its hard, dark rectangular contact shadow is baked into the shared `strip-dark.png` poster. It belongs to the strip3d part and should become a softer, lower-opacity shadow there.
- **The 390 desk.** At 390 the certificate still covers the letter's "Attached: sealed notice" row, and the scaled paper text is about 8 px. It is acceptable as an illustration, but a later pass could swap the overlap for a vertical stack.
