'use client'

/**
 * FoilStrip3D: RecallIndia's hero object. A procedural silver blister strip (2 × 5 tablets,
 * one red) with the product name and "B.No. {batch}  EXP {exp}" printed on the foil.
 * Plain three@0.186.0, no React Three Fiber.
 *
 * Load it only through FoilStripHero (next/dynamic, ssr:false) so three.js stays in a lazy
 * chunk that only "/" requests.
 *
 * SETUP (once, in the app repo)
 *   npm i three@0.186.0 && npm i -D @types/three@0.186.0 @fontsource/doto
 *   mkdir -p public/fonts public/strip
 *   cp node_modules/@fontsource/doto/files/doto-latin-900-normal.woff2 public/fonts/doto-900.woff2
 *   cp <pack>/v3/mockups/strip-poster-hero.png public/strip/strip-poster-hero.png
 *   cp <pack>/v3/mockups/strip-thumb.png       public/strip/strip-thumb.png
 * The printed batch code is drawn into a CanvasTexture, and a canvas can only use a font that
 * is registered under a family name it knows. next/font renames families with a hash, so Doto is
 * loaded here with FontFace from /fonts/doto-900.woff2 (output: 'export' serves public/ as-is;
 * if you set basePath, pass fontUrl={`${basePath}/fonts/doto-900.woff2`}).
 * The product name and small print use the next/font families from lib/fonts.ts, read from the
 * CSS variables --font-funnel-display / --font-onest (then --font-display / --font-sans). If the
 * Doto file is missing, the print falls back to next/font's Doto (--font-doto), then monospace.
 *
 * CALLBACK CONTRACT
 *   onAnchors fires after every rendered frame whose projected points moved by > 0.1 px.
 *   Coordinates are CSS px relative to the component's own box (top-left = 0,0).
 *   Write them to refs or DOM (style.transform, setAttribute). Never call setState from it.
 */

import { useEffect, useRef, type CSSProperties } from 'react'
import {
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShadowMaterial,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
  type Material,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/* ------------------------------------------------------------------------------------------ */
/* Public types                                                                               */
/* ------------------------------------------------------------------------------------------ */

export type StripVariant = 'hero' | 'card'
export type StripHighlight = null | 'batch' | 'pill'
export type StripPose = 'rest' | 'batch' | 'pill'
export type StripSurface = 'cobalt' | 'light'

export interface AnchorPoint {
  x: number
  y: number
}

export interface StripAnchors {
  /** Midpoint under the printed batch code, where a leader line lands. */
  batch: AnchorPoint & {
    /** Left and right ends of an underline under the batch code. */
    a: AnchorPoint
    b: AnchorPoint
  }
  /** Centre of the red pill; r = projected radius of its blister dome in px. */
  pill: AnchorPoint & { r: number }
  /** Top-right corner of the strip (for the "Claim letter ready" chip; no leader). */
  corner: AnchorPoint
  /** Size of the box these coordinates refer to (CSS px). */
  width: number
  height: number
  /** '3d' from the live scene; FoilStripHero uses 'poster' for its baked rest-pose anchors. */
  source: 'poster' | '3d'
}

export interface FoilStripOptions {
  batch?: string
  product?: string
  exp?: string
  /** Small print on the top-right of the foil. */
  maker?: string
  /** 0–9, row-major (0–4 top row, 5–9 bottom row). -1 = no red pill. */
  redIndex?: number
  /** Mount-time: framing, texture size, shadow and dome material quality. */
  variant?: StripVariant
  /** Mount-time: tints reflections, bounce light and the shadow for the page behind it. */
  surface?: StripSurface
  /** Pointer tilt (±8°, spring damped) and idle float. */
  interactive?: boolean
  highlight?: StripHighlight
  /** Defaults to the highlight ('batch' | 'pill'), else 'rest'. */
  pose?: StripPose
  /** Scripted tilt in [-1, 1] per axis (x = look right, y = look down). Overrides the pointer. */
  tilt?: readonly [number, number] | null
  /** External pause (the loop also pauses offscreen and in hidden tabs). */
  paused?: boolean
  /** Doto 900 woff2 used for the batch print. */
  fontUrl?: string
  /** Explicit font families for the print (default: next/font CSS variables, see header). */
  fonts?: { display?: string; body?: string }
}

export interface FoilStripHooks {
  onAnchors?: (anchors: StripAnchors) => void
  onReady?: () => void
  onContextLost?: (reason: 'lost' | 'unavailable') => void
}

export interface FoilStripDebug {
  renderer: WebGLRenderer
  scene: Scene
  /** Advance springs and effects by dt seconds and render one frame now (at = absolute time first). */
  step: (dt: number, at?: number) => void
  /** Jump every spring and effect to its target. */
  settle: () => void
  anchors: () => StripAnchors | null
  info: () => { calls: number; triangles: number; geometries: number; textures: number; programs: number; tier: number }
}

export interface FoilStripHandle {
  update: (next: Partial<FoilStripOptions>) => void
  dispose: () => void
  /** Test hooks for the harness. null when WebGL was unavailable. */
  debug: FoilStripDebug | null
}

export interface FoilStrip3DProps extends FoilStripOptions, FoilStripHooks {
  className?: string
  style?: CSSProperties
  /** Visually hidden description. Omit when the parent provides one (FoilStripHero does). */
  label?: string
}

/* ------------------------------------------------------------------------------------------ */
/* Constants                                                                                  */
/* ------------------------------------------------------------------------------------------ */

const DEFAULTS = {
  batch: 'FT5427',
  product: 'PARACETAMOL TABLETS IP 650 mg',
  exp: '09/2027',
  maker: 'Mfd. by Forgo Pharmaceuticals, Baddi (HP)',
  redIndex: 8,
  variant: 'hero' as StripVariant,
  surface: 'cobalt' as StripSurface,
  interactive: true,
  highlight: null as StripHighlight,
  pose: undefined as StripPose | undefined,
  tilt: null as readonly [number, number] | null,
  paused: false,
  fontUrl: '/fonts/doto-900.woff2',
  fonts: undefined as { display?: string; body?: string } | undefined,
}
type Opts = typeof DEFAULTS

// Strip geometry in scene units (1 unit ≈ 11 mm).
const SW = 5.8
const SH = 3.1
const T = 0.05
const Z_TOP = T / 2
const COLS = [-2.3, -1.15, 0, 1.15, 2.3]
const ROWS = [0.52, -0.5]
const PERF_X = 0.575 // perforation between columns 3 and 4
const DOME_R = 0.47
const PILL_R = 0.31
const PILL_H = 0.2
const TILT_MAX = (8 * Math.PI) / 180

// Palette (brief tokens). Print inks are darker than they read: the foil's bright, blue-tinted
// light lifts matte ink by about 2×, so #081B40 lands near the brief's ink #0B1B33 on screen.
const COBALT = '#0A58C2'
const RED = '#B3121E'
const INK_PRINT = '#081B40'
const INK_CODE = '#0A1016'

interface VariantSpec {
  fov: number
  dist: number
  aspect: number
  camXY: [number, number]
  look: [number, number, number]
  rest: [number, number, number]
  texW: number
  shadowMap: boolean
  transmission: boolean
  float: boolean
}
const VARIANTS: Record<StripVariant, VariantSpec> = {
  hero: {
    fov: 28, dist: 13.5, aspect: 4 / 3, camXY: [0.6, -0.9], look: [0, -0.1, 0],
    rest: [-0.42, 0.38, -0.16], texW: 2048, shadowMap: true, transmission: true, float: true,
  },
  card: {
    fov: 24, dist: 12.4, aspect: 4 / 3, camXY: [0.1, -0.35], look: [0, -0.08, 0],
    rest: [-0.3, 0.26, -0.1], texW: 1024, shadowMap: false, transmission: true, float: false,
  },
}

// Pose offsets on top of the variant's rest rotation: [rx, ry, rz, px, py, pz].
const POSES: Record<StripPose, [number, number, number, number, number, number]> = {
  rest: [0, 0, 0, 0, 0, 0],
  batch: [0.16, -0.12, 0.04, 0.35, 0.3, 0.9], // bottom-left print turns toward the viewer
  pill: [0.1, 0.1, 0, -0.35, 0.25, 0.9], // right half comes forward
}

/* ------------------------------------------------------------------------------------------ */
/* Small utilities                                                                            */
/* ------------------------------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))])
}

const codeFontCache = new Map<string, Promise<string>>()
/** Registers Doto 900 under a private family name once per URL. Resolves to a CSS family list. */
function loadCodeFont(url: string): Promise<string> {
  let p = codeFontCache.get(url)
  if (!p) {
    p = (async () => {
      const family = 'RI Doto'
      try {
        const face = new FontFace(family, `url("${url}") format("woff2")`, { weight: '900', display: 'block' })
        const loaded = await withTimeout(face.load(), 3000)
        if (!loaded) throw new Error('timeout')
        document.fonts.add(face)
        return `"${family}", ui-monospace, monospace`
      } catch {
        codeFontCache.delete(url)
        return ''
      }
    })()
    codeFontCache.set(url, p)
  }
  return p
}

/** First non-empty CSS custom property (computed values have var() already substituted). */
function cssFontVar(el: Element, names: string[], fallback: string): string {
  const cs = getComputedStyle(el)
  for (const n of names) {
    const v = cs.getPropertyValue(n).trim()
    if (v) return v
  }
  return fallback
}

/** Critically-damped-ish spring (ζ ≈ 0.82, ~1% overshoot, settles in ≈ 380 ms). */
class Spring {
  x: number
  v = 0
  target: number
  constructor(x: number) {
    this.x = x
    this.target = x
  }
  step(dt: number, k = 170, zeta = 0.82): void {
    const c = 2 * zeta * Math.sqrt(k)
    let left = dt
    while (left > 0) {
      const h = Math.min(left, 1 / 120)
      this.v += (k * (this.target - this.x) - c * this.v) * h
      this.x += this.v * h
      left -= h
    }
  }
  snap(): void {
    this.x = this.target
    this.v = 0
  }
  get settled(): boolean {
    return Math.abs(this.target - this.x) < 1e-4 && Math.abs(this.v) < 1e-3
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Geometry                                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** Rounded rectangle with a V tear-notch top and bottom at the perforation. */
function stripGeometry(): ExtrudeGeometry {
  const x0 = -SW / 2, x1 = SW / 2, y0 = -SH / 2, y1 = SH / 2, r = 0.14, n = 0.055, nd = 0.07
  const s = new Shape()
  s.moveTo(x0 + r, y0)
  s.lineTo(PERF_X - n, y0)
  s.lineTo(PERF_X, y0 + nd)
  s.lineTo(PERF_X + n, y0)
  s.lineTo(x1 - r, y0)
  s.quadraticCurveTo(x1, y0, x1, y0 + r)
  s.lineTo(x1, y1 - r)
  s.quadraticCurveTo(x1, y1, x1 - r, y1)
  s.lineTo(PERF_X + n, y1)
  s.lineTo(PERF_X, y1 - nd)
  s.lineTo(PERF_X - n, y1)
  s.lineTo(x0 + r, y1)
  s.quadraticCurveTo(x0, y1, x0, y1 - r)
  s.lineTo(x0, y0 + r)
  s.quadraticCurveTo(x0, y0, x0 + r, y0)
  const bevel = 0.009
  const depth = T - 2 * bevel
  const g = new ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8,
  })
  g.translate(0, 0, -depth / 2)
  // Planar UVs across the whole strip so the print lines up with scene units.
  const pos = g.getAttribute('position')
  const uv = g.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / SW + 0.5, pos.getY(i) / SH + 0.5)
  uv.needsUpdate = true
  return g
}

/** Tablet: domed faces, a short straight band, rounded edge. Axis along +Z. */
function tabletGeometry(): LatheGeometry {
  const r = PILL_R, crown = PILL_H / 2, band = 0.045, e = 0.024
  const r0 = r - e
  const ch = crown - band
  const rs = (r0 * r0 + ch * ch) / (2 * ch)
  const tmax = Math.asin(r0 / rs)
  const top: Vector2[] = []
  for (let i = 0; i <= 8; i++) {
    const t = (tmax * i) / 8
    top.push(new Vector2(rs * Math.sin(t), crown - rs + rs * Math.cos(t)))
  }
  for (let i = 1; i <= 4; i++) {
    const f = (Math.PI / 2) * (1 - i / 4)
    top.push(new Vector2(r - e + e * Math.cos(f), band - e + e * Math.sin(f)))
  }
  const profile = [...top.map((p) => new Vector2(p.x, -p.y)), ...top.slice().reverse()]
  const g = new LatheGeometry(profile, 36)
  g.rotateX(Math.PI / 2)
  return g
}

/** Thermoformed blister pocket: small flange, steep wall, rounded shoulder. Axis along +Z. */
function domeGeometry(): LatheGeometry {
  const pts: Vector2[] = [new Vector2(DOME_R + 0.035, 0.0), new Vector2(DOME_R + 0.008, 0.006)]
  const hd = 0.27, n = 2.7
  for (let i = 0; i <= 18; i++) {
    const f = (Math.PI / 2) * (i / 18)
    const c = Math.cos(f), s = Math.sin(f)
    pts.push(new Vector2(DOME_R * Math.pow(c, 2 / n), 0.008 + hd * Math.pow(s, 2 / n)))
  }
  pts[pts.length - 1].x = 0
  const g = new LatheGeometry(pts, 48)
  g.rotateX(Math.PI / 2)
  return g
}

/* ------------------------------------------------------------------------------------------ */
/* Print (CanvasTexture)                                                                      */
/* ------------------------------------------------------------------------------------------ */

interface PrintLayout {
  batchX0: number
  batchX1: number
  batchBase: number
  batchTop: number
}
interface PrintFonts {
  display: string
  body: string
  code: string
}

/**
 * Paints the foil. mode 'color' = albedo; mode 'mr' = roughness (G) + metalness (B), so ink
 * reads as matte print on bright metal. Returns the batch code's box in scene units.
 */
function paintFoil(
  ctx: CanvasRenderingContext2D, W: number, H: number, mode: 'color' | 'mr',
  o: Pick<Opts, 'product' | 'batch' | 'exp' | 'maker'>, f: PrintFonts,
): PrintLayout {
  const K = W / SW
  const U = (x: number) => (x / SW + 0.5) * W
  const V = (y: number) => (0.5 - y / SH) * H
  const color = mode === 'color'
  const rand = mulberry32(5427)
  const mr = (rough: number, metal: number, a = 1) => `rgba(0,${Math.round(rough * 255)},${Math.round(metal * 255)},${a})`
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.setLineDash([])

  // Base foil and brushed grain.
  ctx.fillStyle = color ? '#D9DDE0' : mr(0.34, 0.82)
  ctx.fillRect(0, 0, W, H)
  const lines = Math.round(H * 1.6)
  for (let i = 0; i < lines; i++) {
    const y = rand() * H, light = rand() < 0.5, h = (0.8 + rand() * 1.2) * (W / 2048), a = 0.4 + rand() * 0.6
    ctx.fillStyle = color
      ? light ? `rgba(255,255,255,${0.07 * a})` : `rgba(40,50,60,${0.04 * a})`
      : light ? mr(0.29, 0.82, 0.4 * a) : mr(0.4, 0.82, 0.4 * a)
    ctx.fillRect(0, y, W, h)
  }

  // Heat-seal knurl: a faint diamond lattice.
  const step = Math.max(6, Math.round(K * 0.028))
  ctx.lineWidth = Math.max(1, W / 2048)
  ctx.strokeStyle = color ? 'rgba(30,40,50,.035)' : mr(0.4, 0.8, 0.5)
  ctx.beginPath()
  for (let x = -H; x < W + H; x += step) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x + H, H)
    ctx.moveTo(x, H)
    ctx.lineTo(x + H, 0)
  }
  ctx.stroke()

  // Pocket seats: a pressed ring around every blister.
  for (const y of ROWS) for (const x of COLS) {
    const cx = U(x), cy = V(y)
    ctx.beginPath()
    ctx.arc(cx, cy, (DOME_R + 0.02) * K, 0, Math.PI * 2)
    ctx.fillStyle = color ? 'rgba(110,122,134,.10)' : mr(0.3, 0.85, 0.6)
    ctx.fill()
    ctx.lineWidth = 0.014 * K
    ctx.strokeStyle = color ? 'rgba(20,32,44,.16)' : mr(0.5, 0.75)
    ctx.beginPath()
    ctx.arc(cx, cy, (DOME_R + 0.045) * K, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 0.01 * K
    ctx.strokeStyle = color ? 'rgba(255,255,255,.38)' : mr(0.22, 0.9)
    ctx.beginPath()
    ctx.arc(cx, cy + 0.012 * K, (DOME_R + 0.064) * K, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Perforation (pressed: a dark dash with a light dash under it).
  ctx.setLineDash([0.05 * K, 0.035 * K])
  ctx.lineWidth = 0.012 * K
  for (const [dx, col] of [[0, color ? 'rgba(18,56,110,.5)' : mr(0.6, 0.4)], [0.012 * K, color ? 'rgba(255,255,255,.4)' : mr(0.25, 0.9)]] as const) {
    ctx.strokeStyle = col
    ctx.beginPath()
    ctx.moveTo(U(PERF_X) + dx, V(SH / 2 - 0.09))
    ctx.lineTo(U(PERF_X) + dx, V(-SH / 2 + 0.09))
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Ink is matte and non-metallic; in the half-size mr map every glyph is dilated so thin
  // strokes do not blend back into bright metal.
  const ink = (c: string) => (color ? c : mr(0.7, 0.04))
  const text = (s: string, x: number, y: number) => {
    ctx.fillText(s, x, y)
    if (!color) {
      ctx.lineWidth = Math.max(1.5, W / 900)
      ctx.lineJoin = 'round'
      ctx.strokeStyle = mr(0.7, 0.04)
      ctx.strokeText(s, x, y)
    }
  }
  const fit = (text: string, font: (px: number) => string, emUnits: number, maxUnits: number) => {
    let px = emUnits * K
    ctx.font = font(px)
    const w = ctx.measureText(text).width
    if (w > maxUnits * K) {
      px *= (maxUnits * K) / w
      ctx.font = font(px)
    }
    return px
  }

  // Product name, top left.
  const left = -SW / 2 + 0.26
  ctx.fillStyle = ink(INK_PRINT)
  ctx.textBaseline = 'alphabetic'
  fit(o.product, (px) => `800 ${px}px ${f.display}`, 0.17, PERF_X - 0.14 - left)
  text(o.product, U(left), V(1.2))

  // Maker, top right, and pack count, bottom right (small print).
  if (o.maker) {
    const mLeft = PERF_X + 0.14, mMax = SW / 2 - 0.2 - mLeft
    ctx.fillStyle = ink('rgba(8,27,64,.9)')
    fit(o.maker, (px) => `600 ${px}px ${f.body}`, 0.074, mMax)
    text(o.maker, U(mLeft), V(1.215))
  }
  ctx.fillStyle = ink('rgba(8,27,64,.9)')
  ctx.font = `700 ${0.074 * K}px ${f.body}`
  ctx.textAlign = 'right'
  text('10 TABLETS', U(SW / 2 - 0.22), V(-1.3))
  ctx.textAlign = 'left'

  // Batch line in Doto, drawn in three runs so the batch box is exact.
  const baseY = -1.3
  const pre = 'B.No. ', mid = `  EXP ${o.exp}`
  const codeFont = (px: number) => `900 ${px}px ${f.code}`
  const px = fit(pre + o.batch + mid, codeFont, 0.2, PERF_X - 0.12 - left)
  ctx.font = codeFont(px)
  const wPre = ctx.measureText(pre).width
  const mB = ctx.measureText(o.batch)
  ctx.fillStyle = ink(INK_CODE)
  const x0 = U(left)
  // Doto's 900 full stop is a 3 × 3 cluster that reads as "+" at this size; print a single
  // round inkjet dot instead so "B.No." reads as it does on a real strip.
  const codeRun = (run: string, x: number) => {
    let cx = x
    for (const ch of run) {
      const adv = ctx.measureText(ch).width
      if (ch === '.') {
        ctx.beginPath()
        ctx.arc(cx + adv * 0.42, V(baseY) - px * 0.06, px * (color ? 0.065 : 0.085), 0, Math.PI * 2)
        ctx.fill()
      } else {
        text(ch, cx, V(baseY))
      }
      cx += adv
    }
  }
  codeRun(pre, x0)
  text(o.batch, x0 + wPre, V(baseY))
  text(mid, x0 + wPre + mB.width, V(baseY))
  const asc = mB.actualBoundingBoxAscent || px * 0.72
  return {
    batchX0: left + wPre / K,
    batchX1: left + (wPre + mB.width) / K,
    batchBase: baseY,
    batchTop: baseY + asc / K,
  }
}

/** Cobalt ring decal around the batch code; p = 0..1 draw-on progress (starts under the code). */
function paintRing(ctx: CanvasRenderingContext2D, W: number, H: number, p: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (p <= 0) return
  const lw = H * 0.085
  const r = (H - lw * 2.4) / 2
  const cx0 = lw * 1.2 + r, cx1 = W - lw * 1.2 - r, cy = H / 2
  const len = 2 * (cx1 - cx0) + 2 * Math.PI * r
  const path = () => {
    ctx.beginPath()
    ctx.moveTo((cx0 + cx1) / 2, cy + r)
    ctx.lineTo(cx1, cy + r)
    ctx.arc(cx1, cy, r, Math.PI / 2, -Math.PI / 2, true)
    ctx.lineTo(cx0, cy - r)
    ctx.arc(cx0, cy, r, -Math.PI / 2, Math.PI / 2, true)
    ctx.closePath()
  }
  ctx.lineCap = 'round'
  ctx.setLineDash(p >= 1 ? [] : [len * p, len])
  path()
  ctx.strokeStyle = 'rgba(255,255,255,.9)'
  ctx.lineWidth = lw * 1.9
  ctx.stroke()
  path()
  ctx.strokeStyle = COBALT
  ctx.lineWidth = lw
  ctx.stroke()
  ctx.setLineDash([])
}

/* ------------------------------------------------------------------------------------------ */
/* Engine (framework-free; the React component below is a thin wrapper)                      */
/* ------------------------------------------------------------------------------------------ */

export function mountFoilStrip(host: HTMLElement, initial: Partial<FoilStripOptions>, hooks: FoilStripHooks = {}): FoilStripHandle {
  let o: Opts = { ...DEFAULTS, ...stripUndefined(initial) }
  const spec = VARIANTS[o.variant]
  const cobalt = o.surface === 'cobalt'

  const canvas = document.createElement('canvas')
  // The canvas never takes input (pointer tilt listens on window), so it cannot block scrolling or chips.
  canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none'
  canvas.setAttribute('aria-hidden', 'true')
  host.appendChild(canvas)

  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' })
  } catch {
    canvas.remove()
    queueMicrotask(() => hooks.onContextLost?.('unavailable'))
    return { update: () => {}, dispose: () => {}, debug: null }
  }
  let dprCap = 1.5
  const dpr = () => Math.min(window.devicePixelRatio || 1, dprCap)
  renderer.setPixelRatio(dpr())
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = NeutralToneMapping
  renderer.toneMappingExposure = cobalt ? 1.05 : 0.94
  renderer.transmissionResolutionScale = 1
  renderer.shadowMap.enabled = spec.shadowMap
  renderer.shadowMap.type = VSMShadowMap

  const disposables: { dispose: () => void }[] = []
  const own = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x)
    return x
  }

  const scene = new Scene()
  const camera = new PerspectiveCamera(spec.fov, 1, 0.1, 100)

  // Environment: neutral room; on cobalt pages a blue wall behind the viewer tints grazing reflections.
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  if (cobalt) {
    const wallGeo = new PlaneGeometry(34, 12)
    const wallMat = new MeshBasicMaterial({ color: new Color(COBALT).multiplyScalar(1.6) })
    const wall = new Mesh(wallGeo, wallMat)
    wall.position.set(0, 1.5, 14)
    wall.rotation.y = Math.PI
    room.add(wall)
  }
  const envRT = own(pmrem.fromScene(room, 0.04))
  room.dispose()
  pmrem.dispose()
  scene.environment = envRT.texture

  // Lights.
  const key = new DirectionalLight('#ffffff', cobalt ? 1.9 : 1.6)
  key.position.set(-4, 6, 8)
  if (spec.shadowMap) {
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.radius = 18
    key.shadow.blurSamples = 16
    key.shadow.bias = -0.0004
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 })
  }
  scene.add(key, key.target)
  scene.add(new HemisphereLight('#ffffff', cobalt ? '#4F7BC4' : '#AEB8C4', cobalt ? 0.7 : 0.55))

  // Shadow receiver (hero) or a baked soft blob (card).
  if (spec.shadowMap) {
    const ground = new Mesh(
      own(new PlaneGeometry(40, 40)),
      own(new ShadowMaterial({ color: cobalt ? '#001B52' : '#0B1B33', opacity: cobalt ? 0.5 : 0.2 })),
    )
    ground.position.z = -0.9
    ground.receiveShadow = true
    scene.add(ground)
  } else {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 160
    const g = c.getContext('2d')
    if (g) {
      g.shadowColor = cobalt ? 'rgba(0,27,82,.55)' : 'rgba(11,27,51,.28)'
      g.shadowBlur = 26
      g.shadowOffsetX = 1000
      g.fillRect(-1000 + 40, 36, 176, 88)
    }
    const tex = own(new CanvasTexture(c))
    const blob = new Mesh(own(new PlaneGeometry(SW * 1.4, SH * 1.5)), own(new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })))
    blob.position.set(0.35, -0.45, -0.7)
    scene.add(blob)
  }

  // Scene graph: root (world) → tiltGroup (pointer + float, world axes) → strip (pose).
  const tiltGroup = new Group()
  const strip = new Group()
  tiltGroup.add(strip)
  scene.add(tiltGroup)

  // Foil body: caps carry the print, sides are plain metal. 2 draw calls.
  const texW = spec.texW
  const texH = Math.round((texW * SH) / SW)
  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = texW
  colorCanvas.height = texH
  const mrCanvas = document.createElement('canvas')
  mrCanvas.width = texW / 2
  mrCanvas.height = Math.round(texH / 2)
  const colorTex = own(new CanvasTexture(colorCanvas))
  colorTex.colorSpace = SRGBColorSpace
  colorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const mrTex = own(new CanvasTexture(mrCanvas))
  mrTex.anisotropy = colorTex.anisotropy
  // On light pages the foil reflects slightly less of the (bright) room so it still reads as silver.
  const foilMat = own(new MeshStandardMaterial({ map: colorTex, roughnessMap: mrTex, metalnessMap: mrTex, metalness: 1, roughness: 1, envMapIntensity: cobalt ? 1 : 0.72 }))
  const edgeMat = own(new MeshStandardMaterial({ color: '#C3C9CE', metalness: 0.9, roughness: 0.28 }))
  const body = new Mesh(own(stripGeometry()), [foilMat, edgeMat])
  body.castShadow = spec.shadowMap
  strip.add(body)

  // Blister domes: one instanced draw.
  const domeMat = own(
    spec.transmission
      ? new MeshPhysicalMaterial({
          color: '#FFFFFF', metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.06, ior: 1.42,
          clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1, envMapIntensity: 1.25,
        })
      : new MeshPhysicalMaterial({
          color: '#E6EDF5', roughness: 0.06, transparent: true, opacity: 0.24, clearcoat: 1,
          clearcoatRoughness: 0.05, envMapIntensity: 1.6, depthWrite: false,
        }),
  )
  const domes = new InstancedMesh(own(domeGeometry()), domeMat, 10)
  const m4 = new Matrix4()
  const q = new Quaternion()
  const one = new Vector3(1, 1, 1)
  const slots: Vector3[] = []
  ROWS.forEach((y) => COLS.forEach((x) => slots.push(new Vector3(x, y, Z_TOP))))
  slots.forEach((p, i) => domes.setMatrixAt(i, m4.compose(p, q.identity(), one)))
  domes.renderOrder = 2
  strip.add(domes)

  // Tablets: white ones instanced, the red one on its own mesh (its emissive pulses).
  const tabGeo = own(tabletGeometry())
  const whiteMat = own(new MeshStandardMaterial({ color: '#F6F4EE', roughness: 0.58, metalness: 0 }))
  const redBase = cobalt ? 0.42 : 0.14
  const redMat = own(
    new MeshPhysicalMaterial({
      color: RED, roughness: 0.36, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: '#8A0012', emissiveIntensity: redBase,
    }),
  )
  const whites = new InstancedMesh(tabGeo, whiteMat, 10)
  whites.castShadow = spec.shadowMap
  const red = new Mesh(tabGeo, redMat)
  red.castShadow = spec.shadowMap
  strip.add(whites, red)
  const jitter = mulberry32(650)
  const tabRot = slots.map(() => new Quaternion().setFromAxisAngle(new Vector3(jitter() - 0.5, jitter() - 0.5, 0).normalize(), 0.035 * jitter()))
  const tabPos = (i: number) => new Vector3(slots[i].x, slots[i].y, Z_TOP + PILL_H / 2 + 0.002)
  function placeTablets(): void {
    const ri = Number.isInteger(o.redIndex) && o.redIndex >= 0 && o.redIndex < 10 ? o.redIndex : -1
    let n = 0
    for (let i = 0; i < 10; i++) {
      if (i === ri) continue
      whites.setMatrixAt(n++, m4.compose(tabPos(i), tabRot[i], one))
    }
    whites.count = n
    whites.instanceMatrix.needsUpdate = true
    whites.computeBoundingSphere()
    red.visible = ri >= 0
    if (ri >= 0) {
      red.position.copy(tabPos(ri))
      red.quaternion.copy(tabRot[ri])
    }
  }
  placeTablets()

  // Batch ring decal (hidden until highlight = 'batch').
  const ringCanvas = document.createElement('canvas')
  const ringTex = own(new CanvasTexture(ringCanvas))
  ringTex.colorSpace = SRGBColorSpace
  const ringMat = own(
    new MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }),
  )
  const ringGeo = own(new PlaneGeometry(1, 1))
  const ring = new Mesh(ringGeo, ringMat)
  ring.visible = false
  ring.renderOrder = 1
  strip.add(ring)

  // Print layout (filled by repaint) and local anchor points.
  let layout: PrintLayout = { batchX0: -1.9, batchX1: -1.1, batchBase: -1.3, batchTop: -1.15 }
  const L = { batch: new Vector3(), a: new Vector3(), b: new Vector3(), pill: new Vector3(), pillEdge: new Vector3(), pillEdgeY: new Vector3(), corner: new Vector3(SW / 2, SH / 2, Z_TOP) }
  function layoutAnchors(): void {
    const uy = layout.batchBase - 0.07
    L.a.set(layout.batchX0 - 0.02, uy, Z_TOP)
    L.b.set(layout.batchX1 + 0.02, uy, Z_TOP)
    L.batch.set((layout.batchX0 + layout.batchX1) / 2, uy, Z_TOP)
    const ri = o.redIndex >= 0 && o.redIndex < 10 ? o.redIndex : 8
    const s = slots[ri]
    L.pill.set(s.x, s.y, Z_TOP + PILL_H / 2)
    L.pillEdge.set(s.x + DOME_R, s.y, Z_TOP + PILL_H / 2)
    L.pillEdgeY.set(s.x, s.y + DOME_R, Z_TOP + PILL_H / 2)
    // Ring decal box around the batch code.
    const padX = 0.13, padY = 0.1
    const w = layout.batchX1 - layout.batchX0 + padX * 2
    const h = layout.batchTop - layout.batchBase + padY * 2
    ring.scale.set(w, h, 1)
    ring.position.set((layout.batchX0 + layout.batchX1) / 2, (layout.batchTop + layout.batchBase) / 2, Z_TOP + 0.002)
    ringCanvas.width = Math.max(64, Math.round(w * 420))
    ringCanvas.height = Math.max(24, Math.round(h * 420))
    ringDrawn = -1
  }

  let fonts: PrintFonts | null = null
  function repaint(): void {
    if (!fonts) return
    const c = colorCanvas.getContext('2d')
    const m = mrCanvas.getContext('2d')
    if (!c || !m) return
    layout = paintFoil(c, colorCanvas.width, colorCanvas.height, 'color', o, fonts)
    paintFoil(m, mrCanvas.width, mrCanvas.height, 'mr', o, fonts)
    colorTex.needsUpdate = true
    mrTex.needsUpdate = true
    layoutAnchors()
  }

  // Animation state.
  const rest = spec.rest
  const S = {
    rx: new Spring(rest[0]), ry: new Spring(rest[1]), rz: new Spring(rest[2]),
    px: new Spring(0), py: new Spring(0), pz: new Spring(0),
    tx: new Spring(0), ty: new Spring(0),
  }
  const springs = Object.values(S)
  let ringVis = 0 // 0..1 opacity
  let ringDraw = 0 // 0..1 draw-on
  let ringDrawn = -1
  let pulseAmp = 0
  let t = 0
  let pointer: [number, number] = [0, 0]

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)')
  let reduced = mqReduce.matches
  let onscreen = true
  let docVisible = !document.hidden
  let ready = false
  let lost = false
  let disposed = false
  let raf = 0
  let last = 0
  let cssW = 1
  let cssH = 1

  function effectivePose(): StripPose {
    if (reduced) return 'rest'
    return o.pose ?? (o.highlight === 'batch' ? 'batch' : o.highlight === 'pill' ? 'pill' : 'rest')
  }
  function applyTargets(): void {
    const p = POSES[effectivePose()]
    S.rx.target = rest[0] + p[0]
    S.ry.target = rest[1] + p[1]
    S.rz.target = rest[2] + p[2]
    S.px.target = p[3]
    S.py.target = p[4]
    S.pz.target = p[5]
    const input = o.tilt ?? (o.interactive && mqFine.matches && !reduced ? pointer : [0, 0])
    S.ty.target = Math.max(-1, Math.min(1, input[0])) * TILT_MAX
    S.tx.target = Math.max(-1, Math.min(1, input[1])) * TILT_MAX
  }

  const animating = () =>
    springs.some((s) => !s.settled) ||
    (o.highlight === 'batch' ? ringDraw < 1 || ringVis < 1 : ringVis > 0) ||
    (o.highlight === 'pill' ? pulseAmp < 1 : pulseAmp > 0)
  const wantsLoop = () =>
    ready && !lost && !disposed && onscreen && docVisible && !o.paused && !reduced &&
    ((o.interactive && spec.float && tier < 3) || (o.highlight === 'pill' && tier < 3) || animating())

  // Quality governor: if frames run slower than 40 fps for ~45 frames, step down once per trigger:
  // 1 freeze the shadow map, 2 drop the pixel ratio to 1, 3 stop the idle loop (event-driven only).
  let tier = 0
  let seen = 0
  let slow = 0
  function govern(rawDt: number): void {
    if (++seen < 30 || tier >= 3) return
    slow = rawDt > 1 / 40 ? slow + 1 : Math.max(0, slow - 2)
    if (slow < 45) return
    slow = 0
    tier++
    if (tier === 1 && !spec.shadowMap) tier = 2
    if (tier === 1) {
      renderer.shadowMap.autoUpdate = false
      renderer.shadowMap.needsUpdate = true
    } else if (tier === 2) {
      dprCap = 1
      fit()
    }
  }

  function advance(dt: number): void {
    applyTargets()
    if (reduced) {
      springs.forEach((s) => s.snap())
    } else {
      springs.forEach((s) => s.step(dt))
    }
    // Ring: opacity fades, stroke draws on (opacity only under reduced motion).
    const wantRing = o.highlight === 'batch'
    if (reduced) {
      ringVis = wantRing ? 1 : 0
      ringDraw = wantRing ? 1 : 0
    } else {
      ringVis = Math.max(0, Math.min(1, ringVis + (wantRing ? dt / 0.12 : -dt / 0.2)))
      ringDraw = wantRing ? Math.min(1, ringDraw + dt / 0.38) : ringVis > 0 ? ringDraw : 0
    }
    // Pulse envelope.
    const wantPulse = o.highlight === 'pill'
    pulseAmp = Math.max(0, Math.min(1, pulseAmp + (wantPulse ? dt / 0.25 : -dt / 0.25)))
    if (reduced) pulseAmp = wantPulse ? 1 : 0
  }

  function compose(): void {
    const floatOn = spec.float && o.interactive && !reduced && tier < 3
    const fy = floatOn ? 0.05 * Math.sin((2 * Math.PI * t) / 6) : 0
    const frx = floatOn ? 0.012 * Math.sin((2 * Math.PI * t) / 7) : 0
    const frz = floatOn ? 0.006 * Math.sin((2 * Math.PI * t) / 9) : 0
    tiltGroup.rotation.set(S.tx.x + frx, S.ty.x, frz)
    tiltGroup.position.set(0, fy, 0)
    strip.rotation.set(S.rx.x, S.ry.x, S.rz.x)
    strip.position.set(S.px.x, S.py.x, S.pz.x)

    // Red pill pulse: 1.4 s breathing emissive (+ 5% scale); static glow under reduced motion.
    const wave = reduced ? 0.7 : 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 1.4)
    redMat.emissiveIntensity = redBase + 0.95 * pulseAmp * wave
    red.scale.setScalar(1 + (reduced ? 0 : 0.05 * pulseAmp * wave))

    ring.visible = ringVis > 0.001
    ringMat.opacity = ringVis
    const qd = Math.round(ringDraw * 60) / 60
    if (ring.visible && qd !== ringDrawn) {
      const g = ringCanvas.getContext('2d')
      if (g) paintRing(g, ringCanvas.width, ringCanvas.height, 1 - Math.pow(1 - qd, 3))
      ringTex.needsUpdate = true
      ringDrawn = qd
    }
  }

  // Anchors.
  const v = new Vector3()
  let lastAnchors: StripAnchors | null = null
  function project(p: Vector3): AnchorPoint {
    v.copy(p).applyMatrix4(strip.matrixWorld).project(camera)
    return { x: Math.round(((v.x + 1) / 2) * cssW * 10) / 10, y: Math.round(((1 - v.y) / 2) * cssH * 10) / 10 }
  }
  function computeAnchors(): StripAnchors {
    strip.updateWorldMatrix(true, false)
    const pill = project(L.pill)
    const ex = project(L.pillEdge)
    const ey = project(L.pillEdgeY)
    const r = Math.round(((Math.hypot(ex.x - pill.x, ex.y - pill.y) + Math.hypot(ey.x - pill.x, ey.y - pill.y)) / 2) * 10) / 10
    return {
      batch: { ...project(L.batch), a: project(L.a), b: project(L.b) },
      pill: { ...pill, r },
      corner: project(L.corner),
      width: cssW,
      height: cssH,
      source: '3d',
    }
  }
  function emitAnchors(): void {
    const a = computeAnchors()
    const moved = (p: AnchorPoint | undefined, q: AnchorPoint) => !p || Math.abs(p.x - q.x) > 0.1 || Math.abs(p.y - q.y) > 0.1
    if (
      !lastAnchors || lastAnchors.width !== a.width || lastAnchors.height !== a.height ||
      moved(lastAnchors.batch, a.batch) || moved(lastAnchors.pill, a.pill) || moved(lastAnchors.corner, a.corner) ||
      moved(lastAnchors.batch.a, a.batch.a) || moved(lastAnchors.batch.b, a.batch.b)
    ) {
      lastAnchors = a
      hooks.onAnchors?.(a)
    }
  }

  function draw(): void {
    compose()
    renderer.render(scene, camera)
    emitAnchors()
  }

  // Loop: runs only while something moves; otherwise renders on demand.
  function tick(now: number): void {
    raf = 0
    if (!wantsLoop()) {
      advance(0)
      draw()
      return
    }
    const raw = last ? (now - last) / 1000 : 0
    const dt = last ? Math.min(raw, 1 / 20) : 1 / 60
    if (last) govern(raw)
    last = now
    t += dt
    advance(dt)
    draw()
    raf = requestAnimationFrame(tick)
  }
  function invalidate(): void {
    if (!ready || lost || disposed || raf) return
    if (!onscreen || !docVisible) return
    last = 0
    raf = requestAnimationFrame(tick)
  }

  // Sizing.
  function fit(): void {
    const w = Math.max(1, host.clientWidth)
    const h = Math.max(1, host.clientHeight)
    cssW = w
    cssH = h
    renderer.setPixelRatio(dpr())
    renderer.setSize(w, h, false)
    const aspect = w / h
    camera.aspect = aspect
    const d = spec.dist * Math.max(1, spec.aspect / aspect)
    camera.position.set(spec.camXY[0], spec.camXY[1], d)
    camera.lookAt(spec.look[0], spec.look[1], spec.look[2])
    camera.updateProjectionMatrix()
  }
  fit()

  // Observers and listeners.
  const ro = new ResizeObserver(() => {
    fit()
    if (ready) {
      if (raf) return
      advance(0)
      if (onscreen && docVisible) draw()
    }
  })
  ro.observe(host)
  const io = new IntersectionObserver(
    (entries) => {
      onscreen = entries[entries.length - 1]?.isIntersecting ?? true
      if (onscreen) invalidate()
    },
    { rootMargin: '64px' },
  )
  io.observe(host)
  const onVisibility = () => {
    docVisible = !document.hidden
    if (docVisible) invalidate()
  }
  document.addEventListener('visibilitychange', onVisibility)
  const onReduce = () => {
    reduced = mqReduce.matches
    invalidate()
  }
  mqReduce.addEventListener('change', onReduce)
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !o.interactive || o.tilt) return
    const r = host.getBoundingClientRect()
    if (!r.width) return
    pointer = [
      (e.clientX - (r.left + r.width / 2)) / (r.width * 0.7),
      (e.clientY - (r.top + r.height / 2)) / (r.height * 0.7),
    ]
    invalidate()
  }
  const onLeave = () => {
    pointer = [0, 0]
    invalidate()
  }
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  window.addEventListener('blur', onLeave)
  const onLost = () => {
    lost = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    hooks.onContextLost?.('lost')
  }
  canvas.addEventListener('webglcontextlost', onLost)

  // Async init: fonts, print, shader warm-up, first frame.
  void (async () => {
    const display = o.fonts?.display ?? cssFontVar(host, ['--font-funnel-display', '--font-display'], "'Funnel Display', system-ui, sans-serif")
    const bodyFamily = o.fonts?.body ?? cssFontVar(host, ['--font-onest', '--font-sans', '--font-body'], "'Onest', system-ui, sans-serif")
    const [loadedCode] = await Promise.all([
      loadCodeFont(o.fontUrl),
      withTimeout(document.fonts.load(`800 60px ${display}`), 2500).catch(() => undefined),
      withTimeout(document.fonts.load(`600 26px ${bodyFamily}`), 2500).catch(() => undefined),
    ])
    let code = loadedCode
    if (!code) {
      // Fallback: next/font's self-hosted Doto (hashed family), then monospace.
      const nf = cssFontVar(host, ['--font-doto', '--font-foil'], '')
      if (nf) await withTimeout(document.fonts.load(`900 70px ${nf}`), 2000).catch(() => undefined)
      code = nf ? `${nf}, ui-monospace, monospace` : 'ui-monospace, monospace'
    }
    if (disposed) return
    fonts = { display, body: bodyFamily, code }
    repaint()
    try {
      await renderer.compileAsync(scene, camera)
    } catch {
      /* compile on first render instead */
    }
    if (disposed || lost) return
    ready = true
    advance(0)
    springs.forEach((s) => s.snap())
    if (o.highlight === 'batch') {
      ringVis = 1
      ringDraw = 1
    }
    if (o.highlight === 'pill') pulseAmp = 1
    draw()
    hooks.onReady?.()
    invalidate()
  })()

  function update(next: Partial<FoilStripOptions>): void {
    if (disposed) return
    const prev = o
    o = { ...o, ...stripUndefined(next) }
    if (prev.product !== o.product || prev.batch !== o.batch || prev.exp !== o.exp || prev.maker !== o.maker) repaint()
    if (prev.redIndex !== o.redIndex) {
      placeTablets()
      layoutAnchors()
    }
    invalidate()
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    mqReduce.removeEventListener('change', onReduce)
    window.removeEventListener('pointermove', onPointer)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('blur', onLeave)
    canvas.removeEventListener('webglcontextlost', onLost)
    scene.traverse((obj: Object3D) => {
      const m = obj as Mesh
      if (m.isMesh) {
        m.geometry?.dispose()
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach((mat: Material) => mat.dispose())
      }
      if ((obj as InstancedMesh).isInstancedMesh) (obj as InstancedMesh).dispose()
    })
    disposables.forEach((d) => d.dispose())
    scene.environment = null
    renderer.dispose()
    // Free the GPU context now instead of at GC (matters under StrictMode and route changes).
    if (!lost) renderer.forceContextLoss()
    canvas.remove()
  }

  const debug: FoilStripDebug = {
    renderer,
    scene,
    step: (dt: number, at?: number) => {
      if (at !== undefined) t = at
      t += dt
      advance(dt)
      draw()
    },
    settle: () => {
      applyTargets()
      springs.forEach((s) => s.snap())
      ringVis = o.highlight === 'batch' ? 1 : 0
      ringDraw = ringVis
      pulseAmp = o.highlight === 'pill' ? 1 : 0
    },
    anchors: () => (ready ? computeAnchors() : null),
    info: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      tier,
    }),
  }

  return { update, dispose, debug }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) out[k] = o[k]
  return out
}

/* ------------------------------------------------------------------------------------------ */
/* React component                                                                            */
/* ------------------------------------------------------------------------------------------ */

const srOnly: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}

export default function FoilStrip3D(props: FoilStrip3DProps) {
  const {
    batch, product, exp, maker, redIndex, variant = 'hero', surface = 'cobalt', interactive, highlight, pose, tilt,
    paused, fontUrl, fonts, onAnchors, onReady, onContextLost, className, style, label,
  } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<FoilStripHandle | null>(null)
  const latest = useRef({ props, hooks: { onAnchors, onReady, onContextLost } })

  // Keep the latest props and callbacks without re-mounting the scene.
  useEffect(() => {
    latest.current = { props, hooks: { onAnchors, onReady, onContextLost } }
  })

  // Mount once per variant/surface (both change the scene setup); dispose everything on unmount.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const h = mountFoilStrip(host, { ...latest.current.props, variant, surface }, {
      onAnchors: (a) => latest.current.hooks.onAnchors?.(a),
      onReady: () => latest.current.hooks.onReady?.(),
      onContextLost: (r) => latest.current.hooks.onContextLost?.(r),
    })
    handleRef.current = h
    return () => {
      h.dispose()
      handleRef.current = null
    }
  }, [variant, surface])

  // Live prop updates.
  const tx = tilt?.[0]
  const ty = tilt?.[1]
  const fontDisplay = fonts?.display
  const fontBody = fonts?.body
  useEffect(() => {
    handleRef.current?.update({
      batch, product, exp, maker, redIndex, interactive, highlight, pose, paused, fontUrl,
      tilt: tx === undefined || ty === undefined ? null : [tx, ty],
      fonts: fontDisplay || fontBody ? { display: fontDisplay, body: fontBody } : undefined,
    })
  }, [batch, product, exp, maker, redIndex, interactive, highlight, pose, paused, fontUrl, tx, ty, fontDisplay, fontBody])

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <div ref={hostRef} aria-hidden="true" style={{ position: 'absolute', inset: 0 }} />
      {label ? <span style={srOnly}>{label}</span> : null}
    </div>
  )
}
