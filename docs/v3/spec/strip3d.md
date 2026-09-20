# strip3d: the 3D foil strip (hero object)

The landing hero's one bold object: a silver blister strip of Paracetamol Tablets IP 650 mg with one red tablet. Chips with dashed leader lines are pinned to its printed batch code and to the red tablet. It is a real three.js object, not a picture. It tilts toward your pointer, can turn to show its batch, and hands its screen coordinates to the DOM every frame, so the explanation stays attached to the object.

| Deliverable | Path |
|---|---|
| Component (engine + React wrapper) | `v3/code/FoilStrip3D.tsx` |
| Hero wrapper (poster, lazy chunk, chips, leaders) | `v3/code/FoilStripHero.tsx` |
| Poster, hero framing, 1400 × 1050, transparent | `v3/mockups/strip-poster-hero.png` |
| Card thumbnail, 256 × 192, transparent | `v3/mockups/strip-thumb.png` |
| Proof: 3 tilt angles, card variant, measured perf | `v3/mockups/strip3d-angles.png` |
| Proof: landing hero with live anchors, 1536 × 790 | `v3/mockups/strip3d-hero-1536.png` |
| Harness (engine code from the .tsx with the types stripped) | scratchpad `v3/mock/strip3d.html?view=angles\|hero\|poster\|thumb\|bench` |

Verified in this session:
- `tsc --strict` is clean against `three@0.186.0`, `@types/three@0.186.0` and React 19.
- `next build` (15.5.25, `output: 'export'`) passes. three.js ends up in 2 lazy chunks that only `/` requests.
- A React StrictMode runtime test and the exported app were run in Chromium: poster → live crossfade, highlight, context-loss fallback, and unmount cleanup all worked.

---

## 1. Setup (once, in the app repo)

```bash
npm i three@0.186.0 && npm i -D @types/three@0.186.0 @fontsource/doto
mkdir -p public/fonts public/strip
cp node_modules/@fontsource/doto/files/doto-latin-900-normal.woff2 public/fonts/doto-900.woff2
cp <pack>/v3/mockups/strip-poster-hero.png public/strip/strip-poster-hero.png
cp <pack>/v3/mockups/strip-thumb.png       public/strip/strip-thumb.png
cp <pack>/v3/code/FoilStrip3D.tsx <pack>/v3/code/FoilStripHero.tsx components/strip/
```

- **Doto on the foil.** The batch code is drawn into a `CanvasTexture`. A canvas can only use a font registered under a family name it knows, and next/font renames its families with a hash. So the engine loads `/fonts/doto-900.woff2` itself with `FontFace` under the private family `"RI Doto"`, with a 3 s timeout, then falls back to `ui-monospace`. With a `basePath`, pass `fontUrl={`${basePath}/fonts/doto-900.woff2`}`. If this file is missing, the live strip prints in monospace and no longer matches the poster.
- **Product name and small print.** The engine reads the CSS variables `--font-display` (Funnel Display 800) and `--font-body` (Onest 600/700). Declare them with next/font `variable: '--font-display'` and `variable: '--font-body'` on `<html>`. The DOM chip reads `--font-foil` (next/font Doto 900).
- **Import rule.** Import `FoilStripHero` from `app/page.tsx` only. Never import `FoilStrip3D` directly. That keeps three.js out of every other route.

---

## 2. Component API

### 2.1 `<FoilStrip3D>` (default export of `FoilStrip3D.tsx`, `'use client'`)

| Prop | Type | Default | Notes |
|---|---|---|---|
| `batch` | `string` | `'FT5427'` | Printed as `B.No. {batch}  EXP {exp}` (two spaces) in Doto 900. |
| `product` | `string` | `'PARACETAMOL TABLETS IP 650 mg'` | Funnel Display 800. Shrinks to fit 2.9 scene units. |
| `exp` | `string` | `'09/2027'` | |
| `maker` | `string` | `'Mfd. by Forgo Pharmaceuticals, Baddi (HP)'` | Small print, top right. Pass `''` to omit it. |
| `redIndex` | `number` | `8` | 0–9, row-major (0–4 top row, 5–9 bottom row). `-1` means no red tablet (a clear strip). |
| `variant` | `'hero' \| 'card'` | `'hero'` | Set at mount (changing it remounts). See 2.4. |
| `surface` | `'cobalt' \| 'light'` | `'cobalt'` | Set at mount. Tints reflections, bounce light and shadow for the page behind. |
| `interactive` | `boolean` | `true` | Pointer tilt ±8° (spring) and idle float. |
| `highlight` | `null \| 'batch' \| 'pill'` | `null` | `'batch'` draws the cobalt ring decal around the printed batch code. `'pill'` makes the red tablet's emissive breathe. |
| `pose` | `'rest' \| 'batch' \| 'pill'` | follows `highlight` | Overrides the pose that `highlight` picks. |
| `tilt` | `[x, y] \| null` | `null` | Scripted tilt in [-1, 1]: x = look right, y = look down. Overrides the pointer (use it for scroll-driven tilt). |
| `paused` | `boolean` | `false` | External pause. The loop also pauses offscreen, in hidden tabs and under reduced motion. |
| `fontUrl` | `string` | `'/fonts/doto-900.woff2'` | |
| `fonts` | `{ display?, body? }` | CSS vars | Explicit canvas families (the harness uses this). |
| `onAnchors` | `(a: StripAnchors) => void` | | Called after every rendered frame whose points moved by more than 0.1 px. |
| `onReady` | `() => void` | | Called once, after fonts, print, shader warm-up (`compileAsync`) and the first frame. |
| `onContextLost` | `(reason: 'lost' \| 'unavailable') => void` | | `'unavailable'` = the WebGL context could not be created. |
| `label` | `string` | | Visually hidden description. Omit it inside FoilStripHero, which has its own. |
| `className`, `style` | | | Applied to the outer box (fills its parent: 100% × 100%). |

```ts
interface StripAnchors {           // CSS px, relative to the component's own box
  batch: { x; y; a: {x; y}; b: {x; y} }  // midpoint under the printed code; a, b = underline ends
  pill:  { x; y; r }                      // red tablet centre; r = projected dome radius
  corner:{ x; y }                         // strip's top-right corner (seal chip, no leader)
  width; height                           // box size the coordinates refer to
}
```

**Callback contract.** `onAnchors` runs inside the render loop. Write the values to refs or straight to the DOM (`style.transform`, `setAttribute`). Never call `setState` from it.

**Framework-free engine.** `mountFoilStrip(host, options, hooks) → { update(partial), dispose(), debug }` is exported from the same file. The React component is a thin wrapper over it, and the harness runs this exact function. `debug` (renderer, scene, `step`, `settle`, `anchors`, `info`) is for tests only.

### 2.2 `<FoilStripHero>` (default export of `FoilStripHero.tsx`, `'use client'`)

| Prop | Default | Notes |
|---|---|---|
| `poster` | `'/strip/strip-poster-hero.png'` | Server-rendered `<img>` (1400 × 1050, `fetchPriority="high"`). |
| `batch`, `product`, `exp`, `redIndex` | as above | |
| `batchLabel` | `'Batch on your strip'` | |
| `alertSource` | `'CDSCO · July 2026 · row 12'` | |
| `alertText` | `'Failed: dissolution test'` | |
| `sealTop` | `'Claim letter ready'` | |
| `sealText` / `sealWord` | `'Evidence sealed'` / `'VERIFIED'` | `sealWord` in success #127A55. |
| `highlight` | `null` | Set by the landing's scroll choreography (section 4). A hovered chip overrides it while hovered. |
| `paused` | `false` | |
| `introStart` | mount time | `performance.now()` at which the page's load sequence started, so the strip rows stay in step with the headline rows. |
| `skipIntro` | `false` | Everything at rest immediately (also forced by `?state=static`). |
| `gutter` | `96` (`16` under 700 px) | Chips never get closer than this to the viewport edge. |

The stage box is `aspect-ratio: 4 / 3`: 896 × 672 at 1536, 420 × 315 at 390 (the landing mock's `.stage`). It carries `data-strip-mode` (`poster | loading | live | fallback`), `data-highlight` (`none | batch | pill`) and `data-intro` (`playing | done`). Chips are server-rendered at their resting positions (as percentages of the stage) with opacity 0. A `<noscript>` style shows them.

### 2.3 The object

- **Scale.** 1 unit ≈ 11 mm. The strip is 5.8 × 3.1 × 0.05 units (≈ 64 × 34 mm). It is built as one extruded rounded rectangle (r 0.14) with V tear-notches (0.11 wide, 0.07 deep) at the perforation, x = 0.575, exactly between columns 3 and 4.
- **Materials.** The printed caps and the plain metal sides are 2 materials (2 draw calls).
- **Layout.** Tablet centres are at columns −2.3, −1.15, 0, 1.15, 2.3 and rows 0.52 / −0.5.
- **Blisters.** Lathe-turned pockets (base r 0.47, height 0.27, small flange, rounded shoulder) in one `InstancedMesh`.
- **Tablets.** Lathe-turned with domed faces, a straight band and a rounded edge (r 0.31, 0.2 thick). The 9 white ones are one `InstancedMesh` with seeded ±2° jitter. The red one is its own mesh because its emissive pulses.
- **Print (CanvasTexture)**, 2048 × 1095 for the hero and 1024 × 548 for the card:
  - brushed grain and a faint heat-seal lattice, both seeded so the poster and the live frame are identical;
  - a pressed ring around each pocket and a pressed dashed perforation;
  - product name at top left, #081B40;
  - small print at top right, and `10 TABLETS` at bottom right;
  - the batch line at bottom left in Doto 900, #0A1016. Doto's 900 full stop is a 3 × 3 cluster that reads as "+", so full stops are printed as single round dots.
  - A half-size roughness/metalness map makes the ink matte (rough 0.70, metal 0.04) on bright foil (rough 0.34, metal 0.82).
- **Lighting.** `RoomEnvironment` PMREM. On `cobalt`, a #0A58C2 wall behind the viewer puts a thin blue line on the bevels, so the object sits in the page. Key light #FFFFFF 1.9 at (−4, 6, 8) with a VSM shadow (1024², radius 18). Hemisphere #FFFFFF / #4F7BC4 at 0.7. The ground `ShadowMaterial` is #001B52 at 0.5 opacity. `NeutralToneMapping` (keeps #B3121E red, where ACES turned it pink), exposure 1.05.
- **Camera (hero).** FOV 28° at (0.6, −0.9, 13.5), looking at (0, −0.1, 0). In boxes narrower than 4:3 it pulls back by (4/3)/aspect so the strip always fits.
- **Rest pose (hero).** Rotation (−24.1°, 21.8°, −9.2°). This matches the reference hero.

### 2.4 Variants

| | `hero` | `card` |
|---|---|---|
| Use | Landing hero, live | Landing "How it works" alert step, live. Everywhere in the app shell, use `strip-thumb.png`, not WebGL. |
| Framing | 4:3, strip ≈ 66% of width | 4:3, strip ≈ 88% of width. FOV 24° at (0.1, −0.35, 12.4). Rest (−17.2°, 14.9°, −5.7°). |
| Shadow | VSM shadow map on a ground plane | One baked soft-shadow plane (no shadow pass) |
| Domes | Transmission | Transmission (small box, so it is cheap) |
| Print | 2048 px | 1024 px |
| Idle float | Yes (when `interactive`) | No. Renders on demand and sleeps. |

---

## 3. Pointer choreography

| Input | Response |
|---|---|
| Mouse or pen moves anywhere on the page (after the intro) | Tilt target = clamp((pointer − stage centre) / (0.7 × stage size), −1, 1) × 8°. The strip turns to look at the pointer, so it faces the headline while you read it. Spring k 170, ζ 0.82: about 1% overshoot (bounce ≤ 0.1), settles in about 380 ms. |
| Pointer leaves the window, or the window loses focus | Tilt springs back to 0°. |
| Touch | No tilt. The canvas has `pointer-events: none`, so scrolling is never captured. Idle float only. |
| No input | Idle float: y ±0.05 units (±5 px at 1536) over 6 s, rotX ±0.7° over 7 s, rotZ ±0.34° over 9 s. It starts at 0 at t = 0, which is the poster frame. |
| Hover the batch chip (after the intro; the chip gets `box-shadow: 0 0 0 2px #FFFFFF, <chip shadow>`) | `highlight = 'batch'`. Pose `batch`: +9.2° / −6.9° / +2.3°, and the strip comes 0.9 units forward and up-right so the bottom-left print faces you. The cobalt ring draws itself around `FT5427` in 380 ms, starting under the code where the leader lands. The white DOM underline fades out (200 ms) because the ring replaces it. |
| Hover the pill chip | `highlight = 'pill'`. Pose `pill`: +5.7° / +5.7°, and the right half comes forward. The red tablet breathes: emissive 0.42 → 1.37 and scale +5% on a 1.4 s cycle, fading in and out over 250 ms. |
| Leave a chip | Back to the scroll-driven `highlight` (or `null`). The ring fades in 200 ms. |
| Anchors move | Chips move by 35% of their anchor's motion (landing.md section 4.3), clamped to the gutter. Leader lines and dots track the anchors exactly, so the lines stretch. |

**Intro (the strip's rows of landing.md section 3, played by FoilStripHero on the poster).** Times are ms from `introStart`. "Draw" uses `cubic-bezier(.4,0,.2,1)`; "pop" uses `cubic-bezier(.3,1.25,.6,1)` (≈ spring 0.3 s, bounce 0.1).

| Start | Duration | Element | Motion |
|---|---|---|---|
| 700 | 160 | Batch underline a → b | draw |
| 760 | 80 | Batch dot | r 0 → 4.5 |
| 840 | 140 | Batch leader, from the anchor out to the chip | draw |
| 880 | 300 | Batch chip | scale 0.92 → 1 from its leader exit (78% 0), opacity 0 → 1, pop |
| 960 | 240 | Pill ring, drawn from its bottom; its dot grows in the first third | draw |
| 1100 | 200 | Pill leader | draw |
| 1200 | 300 | Red chip | scale 0.92 → 1 from 27% 0 (34% on phones), pop |
| 1240 | 300 | Corner chip | y −10 → 0, opacity 0 → 1, pop |
| 1300 | 240 | Check mark in the corner chip | draw |
| 1600 | | Intro done: tilt and chip hover enabled, and the canvas may crossfade in | |

- Under reduced motion, every strip element fades in together (opacity 0 → 1, 200 ms from 0) with no draws or scales.
- The canvas crossfade (250 ms, `cubic-bezier(.2,.8,.2,1)`) waits for **both** `onReady` and the end of the intro, so anchors never jump mid-draw. It is invisible because the poster and the first frame are the same image.
- During the intro the engine gets `interactive={false}` and `highlight={null}`, so it holds the poster pose.

## 4. Scroll choreography (`/`)

The landing page owns an `IntersectionObserver` and passes `highlight` to `<FoilStripHero>`.

| Moment | Trigger | What the strip does |
|---|---|---|
| Hero in view | Load | `highlight = null`, pose rest, float and pointer tilt run. |
| Scroll into "How it works" | The section heading `#how-h` crosses 85% of the viewport height (at 1536 × 790 this is about scrollY 120 px) **and** at least 30% of the hero stage is still visible | `highlight = 'batch'`. The strip turns to show its batch and the ring draws around FT5427, just as the section's first line says "batch FT5427 … failed". |
| Scroll back up | The heading drops below 85% | `highlight = null`. |
| Hero fully out of view | IO ratio 0 | The engine pauses itself. The canvas keeps its last frame and no rAF runs. |
| Alert step (How it works, step 4) | The alert card enters the viewport (rootMargin 200 px) | Its 120 × 90 thumbnail slot (right end of the alert card's face row) mounts `<FoilStrip3D variant="card" surface="light" highlight="pill" interactive={false}>`, and the red tablet breathes while it is visible. This happens only when the hero reached `live` (the chunk is already loaded and WebGL works). Otherwise the slot shows `strip-thumb.png`. |
| Mobile (390) | Same thresholds, measured on the same elements | Same behaviour. Chips use compact sizes (11/13/17 px text, 8 × 11 px padding). |

Budget for WebGL contexts on `/`: at most 2 created, and at most 1 animating at any moment. By the time the alert step is visible the hero is paused.

## 5. Performance budget

| Item | Budget | Measured |
|---|---|---|
| Draw calls per frame | ≤ 40 | **17**: 6 main + 7 shadow (depth + VSM blur) + 4 transmission |
| Triangles per frame (all passes) | ≤ 150k | **74.7k** |
| GPU resources | | 5 geometries, 8 textures, 15 programs. About 60 MB of GPU memory at DPR 1.5 (MSAA back buffer, transmission target, 2048 px print, shadow maps). |
| Pixel ratio | cap 1.5 | Enforced. The governor can drop it to 1. |
| Frame rate | 60 fps on a mid laptop GPU | Estimated 2–4 ms per frame on Iris Xe / Apple M1 class at DPR 1.5. **Not measured on real hardware yet.** |
| Headless (this machine) | none | SwiftShader (software WebGL, 2 vCPU cloud container, no GPU), 60 frames: **1,234 ms** average at 1x (p95 1,276), **1,909 ms** at 1.5x (p95 2,003). Breakdown over 12 frames: base 405 ms, shadow +410 ms, transmission +405 ms. |
| Time to first frame | ≤ 400 ms after the chunk loads (GPU) | 7.8 s on SwiftShader (fonts, PMREM, `compileAsync`, first frame) |
| JS | Lazy chunk only on `/` | three.js in 2 lazy chunks: 224 KB + 357 KB minified (**143 KB gzip**). In a minimal Next 15 app, `/` first-load JS was 107 KB (FoilStripHero is 4.9 KB of that) and `/feed` was 102 KB. `/feed` never requested the three.js chunks. Verified with `next build` and network logs. |

**Where the estimate comes from.** The frame is 17 draws and 75k triangles, plus roughly three screen-sized passes at 1344 × 1008 (the MSAA main pass, the transmission target and a 1024² VSM blur). That is a small load for a 2020+ integrated GPU. To measure it on a real laptop, open `v3/mock/strip3d.html?view=bench` in Chrome and read `window.__bench`: average, p50 and p95 over 60 synchronous frames, plus the free-running rAF fps.

**Render loop.** It runs only while something moves: float, tilt springs, ring draw-on or the pill breath. Otherwise the engine renders on demand. It also stops when the stage is offscreen, when the tab is hidden, when `paused` is set and under reduced motion.

**Quality governor.** If frames run slower than 40 fps for about 45 frames (after a 30-frame warm-up), the engine steps down one tier each time:
1. freeze the shadow map;
2. set the pixel ratio to 1;
3. stop the idle loop, so it only moves on events.

## 6. Fallback order

1. **Server HTML.** Poster `<img>`, chips at `POSTER_ANCHORS` and the visually hidden description. The hero is complete with no JS.
2. **After hydration, `want3D()`.** It requires all of:
   - WebGL2 with `failIfMajorPerformanceCaveat`;
   - a renderer that is not SwiftShader, llvmpipe or another software renderer;
   - no `Save-Data`.

   If any check fails, the stage stays in `poster`.
3. **`requestIdleCallback`** (timeout 800 ms; `setTimeout` 300 ms on Safari) → `loading`. The chunk loads and the engine mounts hidden. Doto loads (FontFace from `/fonts/doto-900.woff2`, 3 s timeout, then next/font's `--font-doto`, then monospace), then `compileAsync` and the first frame. `onReady` → `live`. The 250 ms crossfade runs once the intro is done.
4. **`webglcontextlost`** → `fallback`. The engine is disposed, the poster comes back and the chips return to poster anchors. There is no retry in that session.
5. **Reduced motion** (`prefers-reduced-motion: reduce`). One static frame: no float, no tilt, no pose change. The ring and the pill glow appear or disappear instantly (the pill as a static glow). Chips fade with opacity only.

Disposal on unmount:
- cancels the rAF and disconnects the Resize and Intersection observers;
- removes all listeners;
- disposes every geometry, material, texture, the PMREM target and the renderer;
- calls `forceContextLoss()` (skipped if the context was already lost) and removes the canvas.

The StrictMode double-mount leaves exactly 1 canvas.

## 7. Accessibility

- The whole stage (poster, canvas, SVG and chips) sits inside `aria-hidden="true"`. The chips are not links and not focusable; hover only adds to what is already there. The CTAs next to the stage carry the actions.
- Visually hidden description, rendered by FoilStripHero (exact copy, with defaults filled in):
  > Illustration: a silver blister strip of PARACETAMOL TABLETS IP 650 mg, batch FT5427, expiry 09/2027, with one red tablet. A label points at the printed batch number: Batch on your strip, FT5427. A red label points at the red tablet: CDSCO · July 2026 · row 12. Failed: dissolution test. A third label reads: Claim letter ready. Evidence sealed, VERIFIED.
- Contrast:

  | Pair | Ratio |
  |---|---|
  | Ink #0B1B33 on white | 17.2:1 |
  | Muted #4A5872 on white | 7.2:1 |
  | White on danger #B3121E | 6.95:1 |
  | #FBEAE8 on #B3121E | 5.97:1 |
  | VERIFIED #127A55 on white | 5.33:1 |
  | Cobalt ring #0A58C2 on foil (#C9CDCB) | 4.1:1 (non-text graphic, ≥ 3:1) |
- Motion: the pill breath is 0.71 Hz with no flashes, and every motion stops under reduced motion.

## 8. Acceptance

| URL / action | Expect |
|---|---|
| `/` on a laptop with a GPU | `data-strip-mode` goes `poster` → `loading` → `live` within 1.5 s of `load`. Exactly 1 `<canvas>`. The poster's computed opacity is 0. |
| `/?strip=poster` | No canvas. No request for the three.js chunks. Chips at poster anchors. |
| `/?strip=live` | Forces 3D even on software GL (QA only). |
| `/?strip=lost` | `live`, then `fallback` 1.5 s after the canvas shows. Poster opacity 1, 0 canvases, no page errors. |
| `/?state=static` | No intro (`data-intro="done"` at once) and no 3D. Matches `landing-1536.png` in layout. |
| `/?state=poster` | Intro plays on the poster, and no 3D loads. |
| `/?highlight=batch` | `data-highlight="batch"`. The ring is drawn around FT5427 and the white underline has opacity 0. |
| `/?highlight=pill` | `data-highlight="pill"`. The red tablet breathes on a 1.4 s cycle. |
| `/feed` | Neither three.js chunk is requested. |
| Navigate away from `/` | 0 canvases remain. |
| Reduced motion on | After `onReady`, no further rAF callbacks from the engine (Performance panel). |
| Tab hidden, or hero scrolled off | No rAF from the engine. |
| Harness `?view=poster` | Prints `window.__posterAnchors`. It must equal `POSTER_ANCHORS` in FoilStripHero.tsx (currently batch 0.2992, 0.5918; pill 0.6147, 0.5933, r 0.0479; corner 0.7986, 0.4281). |

**Regenerating the poster after changing the strip:**
1. Rebuild the harness: `node v3/work-strip3d/tools/build-harness.mjs` injects the current .tsx engine.
2. Shoot the poster: `node v3/work-strip3d/tools/shot3d.mjs view=poster out.png 1400 1050 '#poster' 1 1`. Run it from the tools folder; it prints `posterAnchors`.
3. Paste the printed `posterAnchors` into `POSTER_ANCHORS`.
4. Shoot the thumbnail with `view=thumb` at 512 × 384 and downsample it to 256 × 192 (Lanczos).
5. For the web, convert the poster to WebP (`cwebp -q 82 -alpha_q 90`): measured at 645 KB PNG → 59 KB WebP. Then set `poster="/strip/strip-poster-hero.webp"`.

## 9. Deviations from the v2 render (`/mock/strip.html`)

- The product name uses Funnel Display 800 (the v3 display face) instead of Schibsted Grotesk.
- The perforation sits exactly between columns 3 and 4 (x 0.575, was 0.66) and now has real tear-notches.
- Added real-data small print (maker, `10 TABLETS`).
- Doto full stops are printed as round dots, so `B.No.` no longer reads as `B+No+`.
- Print inks are darker than the tokens (#081B40, #0A1016), because the foil's bright, blue-tinted light lifts matte ink by about 2×. On screen they land near ink #0B1B33.
- Tone mapping changed from ACES to Neutral, so the red tablet stays #B3121E instead of shifting pink.

## 10. Reconciling with landing.md section 4 (written in parallel)

FoilStripHero now follows landing.md on these points:
- the intro timeline (the strip rows of section 3);
- chips positioned with `translate3d` only, 35% parallax, and leaders tracking 1:1;
- the white hover ring on chips;
- no tilt or hover until 1600 ms;
- the canvas waits for the intro;
- `requestIdleCallback` timeout 800 ms;
- `?state=static | poster`;
- `source: 'poster' | '3d'` on anchors.

Where the two still differ, this part's brief wins for the component. **Landing owner: update section 4 to match.**

| Topic | landing.md section 4 | This component (use this) | Why |
|---|---|---|---|
| Who owns poster and anchors | Inside `<FoilStrip3D poster=…>` | `<FoilStripHero>` owns the poster, chips and leaders. `<FoilStrip3D>` is the canvas only. | Keeps three.js out of the server HTML, and lets chips run on the poster when 3D never loads. |
| Variant names | `variant="dark" \| "light"` | `variant="hero" \| "card"` plus `surface="cobalt" \| "light"` | Framing and surface are independent (the card can sit on either). |
| Poster file and anchors | `/landing/strip-dark.webp`; batch (411, 613), pill (862, 628) r 54, corner (1115, 450) | `/strip/strip-poster-hero.png` (or .webp) and `POSTER_ANCHORS` (section 8). Anchors in 1400-px units: batch (419, 621), pill (861, 623) r 67, corner (1118, 450). | The old `strip-dark.png` came from the v2 scene. The new poster is rendered by this engine, so it matches the live frame exactly. |
| Tilt | ±3.4° yaw / ±2.3° pitch, critically damped, no float | ±8° on both axes (ζ 0.82, about 1% overshoot) plus idle float | The strip brief asks for ±8° with spring damping and an idle float. For the calmer landing.md feel, pass `tilt` from the page, or set `interactive={false}`. |
| `highlight='batch'` | Emissive underline band on the foil; the code darkens | Cobalt ring decal drawn around the code | The strip brief asks for a cobalt ring decal around the batch text. |
| `highlight='pill'` | One-shot: emissive 0.2 → 0.5, scale 1.06 | Breathing emissive (1.4 s) while held; static glow under reduced motion | The strip brief asks for a pulse. |
| Emission threshold | 0.5 px | 0.1 px | Smoother leaders. The cost is only DOM attribute writes. |

