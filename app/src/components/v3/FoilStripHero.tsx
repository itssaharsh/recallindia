'use client'

/**
 * FoilStripHero: the landing hero's 3D stage (landing.md §2.6–2.7, the strip rows of §3, §4).
 * Poster first, live strip when it is ready, and the three annotation chips with leader lines
 * pinned to points on the strip.
 *
 * - three.js loads only from here, through next/dynamic with ssr:false, so it is a lazy chunk
 *   that only "/" requests. Do not import FoilStrip3D anywhere else.
 * - Fallback order: poster <img> (server HTML, always) → live canvas once onReady has fired AND
 *   the intro is done (1600 ms), 250 ms crossfade → poster again on context loss. The poster was
 *   rendered by the same engine at the same pose, so the swap is invisible and chips do not jump.
 * - Intro: this component plays the strip's rows of the landing's one load sequence (underline at
 *   700 ms … corner check at 1300 ms, done at 1600 ms). Pass introStart to share the page clock.
 * - QA: ?strip=poster | live | lost (lost = drop the WebGL context 1.5 s after the canvas shows),
 *   ?highlight=batch | pill, and the landing's ?state=static (no intro, no 3D) | poster (no 3D).
 * - Poster file: public/strip/strip-poster-hero.png (1400 × 1050, transparent) or its WebP.
 */

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { StripAnchors, StripHighlight } from './FoilStrip3D'

const FoilStrip3D = dynamic(() => import('./FoilStrip3D'), { ssr: false })

type Mode = 'poster' | 'loading' | 'live' | 'fallback'
type ChipKey = 'batch' | 'pill' | 'corner'
const CHIPS: ChipKey[] = ['batch', 'pill', 'corner']

/**
 * Anchors at the rest pose as fractions of the stage box (r as a fraction of its width).
 * Printed by v3/mock/strip3d.html?view=poster from the same engine that rendered the poster.
 */
const POSTER_ANCHORS = {
  batch: { x: 0.2992, y: 0.5918, a: { x: 0.2553, y: 0.5735 }, b: { x: 0.3426, y: 0.6099 } },
  pill: { x: 0.6147, y: 0.5933, r: 0.0479 },
  corner: { x: 0.7986, y: 0.4281 },
}

/** Chip offset from its anchor as fractions of the stage width; ax = where the leader leaves the chip's top edge. */
const PLACE: Record<'wide' | 'compact', Record<ChipKey, { dx: number; dy: number; ax: number }>> = {
  wide: {
    batch: { dx: -0.1786, dy: 0.0781, ax: 0.78 },
    pill: { dx: -0.0647, dy: 0.1228, ax: 0.27 },
    corner: { dx: -0.2924, dy: -0.2232, ax: 0 },
  },
  compact: {
    batch: { dx: -0.2476, dy: 0.1048, ax: 0.78 },
    pill: { dx: -0.1381, dy: 0.1143, ax: 0.34 },
    corner: { dx: -0.4429, dy: -0.3286, ax: 0 },
  },
}
/** Chips move this fraction of their anchor's motion (landing.md §4.3); leaders track 1:1. */
const PARALLAX = 0.35

/** The strip's rows of the load sequence: [start ms, duration ms] from introStart (landing.md §3). */
const INTRO = {
  underline: [700, 160],
  batchDot: [760, 80],
  batchLeader: [840, 140],
  batchChip: [880, 300],
  ring: [960, 240],
  pillLeader: [1100, 200],
  pillChip: [1200, 300],
  cornerChip: [1240, 300],
  check: [1300, 240],
} as const
const INTRO_DONE = 1600
type IntroKey = keyof typeof INTRO
type IntroP = Record<IntroKey, number>
const INTRO_KEYS = Object.keys(INTRO) as IntroKey[]
const introAt = (v: number) => Object.fromEntries(INTRO_KEYS.map((k) => [k, v])) as IntroP

export interface FoilStripHeroProps {
  poster?: string
  batch?: string
  product?: string
  exp?: string
  redIndex?: number
  batchLabel?: string
  alertSource?: string
  alertText?: string
  sealTop?: string
  sealText?: string
  sealWord?: string
  /** Driven by the landing's scroll choreography. Chip hover overrides it while hovered. */
  highlight?: StripHighlight
  paused?: boolean
  /** performance.now() at which the page's load sequence started (default: this mount). */
  introStart?: number
  /** Skip the intro (everything at rest immediately). */
  skipIntro?: boolean
  /** Minimum distance from the viewport edge for chips (default 96, or 16 under 700 px). */
  gutter?: number
  className?: string
  style?: CSSProperties
}

const srOnly: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
}
const chipShadow = '0 2px 4px rgba(0,26,70,.10), 0 18px 40px -12px rgba(0,26,70,.45)'
// next/font variables from lib/fonts.ts (always on <html>), with plain family names as fallback.
const bodyFont = "var(--font-onest, 'Onest'), ui-sans-serif, system-ui, sans-serif"
const foilFont = "var(--font-doto, 'Doto'), ui-monospace, monospace"

/** CSS cubic-bezier as a function of x (Newton iterations). */
function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx
      if (Math.abs(d) < 1e-6) break
      t = Math.min(1, Math.max(0, t - (sx(t) - x) / d))
    }
    return sy(t)
  }
}
const drawEase = bezier(0.4, 0, 0.2, 1) // landing "draw"
const popEase = bezier(0.3, 1.25, 0.6, 1) // ≈ spring 0.3 s, bounce 0.1

function want3D(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return false
  try {
    const c = document.createElement('canvas')
    // No 3D on software rendering (SwiftShader, llvmpipe, blocklisted GPUs): the poster is better there.
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
  } catch {
    return false
  }
}

function posterAnchors(w: number, h: number): StripAnchors {
  const P = POSTER_ANCHORS
  const pt = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h })
  return {
    batch: { ...pt(P.batch), a: pt(P.batch.a), b: pt(P.batch.b) },
    pill: { ...pt(P.pill), r: P.pill.r * w },
    corner: pt(P.corner),
    width: w,
    height: h,
    source: 'poster',
  }
}

/** Server-rendered resting position (percent of the stage), so chips sit right before JS runs. */
function ssrPos(k: ChipKey): CSSProperties {
  const A = POSTER_ANCHORS[k]
  const p = PLACE.wide[k]
  return { left: `${((A.x + p.dx) * 100).toFixed(2)}%`, top: `${((A.y + p.dy / 0.75) * 100).toFixed(2)}%` }
}

export default function FoilStripHero({
  poster = '/strip/strip-poster-hero.png',
  batch = 'FT5427',
  product = 'PARACETAMOL TABLETS IP 650 mg',
  exp = '09/2027',
  redIndex = 8,
  batchLabel = 'Batch on your strip',
  alertSource = 'CDSCO · July 2026 · row 12',
  alertText = 'Failed: dissolution test',
  sealTop = 'Claim letter ready',
  sealText = 'Evidence sealed',
  sealWord = 'VERIFIED',
  highlight = null,
  paused = false,
  introStart,
  skipIntro = false,
  gutter,
  className,
  style,
}: FoilStripHeroProps) {
  const [mode, setMode] = useState<Mode>('poster')
  const [hover, setHover] = useState<StripHighlight>(null)
  const [qa, setQa] = useState<StripHighlight>(null)
  const [introDone, setIntroDone] = useState(false)
  const [compact, setCompact] = useState(false)
  const active: StripHighlight = hover ?? qa ?? highlight

  const stageRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Record<ChipKey, HTMLDivElement | null>>({ batch: null, pill: null, corner: null })
  const svg = useRef<Record<'ul' | 'bl' | 'bd' | 'pr' | 'pl' | 'pd' | 'check', SVGElement | null>>({
    ul: null, bl: null, bd: null, pr: null, pl: null, pd: null, check: null,
  })
  const geom = useRef({ w: 0, h: 0, left: 0, vw: 0, chips: { batch: [0, 0], pill: [0, 0], corner: [0, 0] } as Record<ChipKey, [number, number]> })
  const lastAnchors = useRef<StripAnchors | null>(null)
  const activeRef = useRef<StripHighlight>(active)
  const intro = useRef<{ p: IntroP; fade: number }>({ p: introAt(0), fade: 1 })

  /** Positions chips and leaders. Called every rendered 3D frame, every intro frame and on resize. */
  const layout = useCallback(
    (live: StripAnchors | null) => {
      const g = geom.current
      if (!g.w) return
      const rest = posterAnchors(g.w, g.h)
      const a = live ?? rest
      const place = PLACE[g.w < 600 ? 'compact' : 'wide']
      const gut = gutter ?? (g.vw < 700 ? 16 : 96)
      const minX = gut - g.left
      const { p: P, fade } = intro.current
      const tops: Record<ChipKey, [number, number]> = { batch: [0, 0], pill: [0, 0], corner: [0, 0] }
      CHIPS.forEach((k) => {
        const el = chipRefs.current[k]
        if (!el) return
        const [cw] = g.chips[k]
        const ax = rest[k].x + PARALLAX * (a[k].x - rest[k].x)
        const ay = rest[k].y + PARALLAX * (a[k].y - rest[k].y)
        const maxX = g.vw - gut - g.left - cw
        const x = Math.max(minX, Math.min(maxX, ax + place[k].dx * g.w))
        const y = Math.max(4, ay + place[k].dy * g.w)
        el.style.left = '0'
        el.style.top = '0'
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        tops[k] = [x + cw * place[k].ax, y]
        // Entrance: batch and pill pop from their leader exit, the corner chip drops 10 px.
        const t = P[k === 'batch' ? 'batchChip' : k === 'pill' ? 'pillChip' : 'cornerChip']
        el.style.opacity = String(Math.min(fade, Math.min(1, t * 1.6)))
        if (k === 'corner') {
          el.style.translate = `0 ${(-10 * (1 - popEase(t))).toFixed(2)}px`
        } else {
          el.style.scale = String(0.92 + 0.08 * popEase(t))
          el.style.transformOrigin = `${place[k].ax * 100}% 0`
        }
      })
      const s = svg.current
      const set = (el: SVGElement | null, attrs: Record<string, string | number>) => {
        if (el) for (const [n, v] of Object.entries(attrs)) el.setAttribute(n, String(typeof v === 'number' ? Math.round(v * 100) / 100 : v))
      }
      const toward = (p: { x: number; y: number }, q: [number, number] | { x: number; y: number }, t: number) => {
        const qx = Array.isArray(q) ? q[0] : q.x
        const qy = Array.isArray(q) ? q[1] : q.y
        return `${(p.x + (qx - p.x) * t).toFixed(1)} ${(p.y + (qy - p.y) * t).toFixed(1)}`
      }
      // Batch: underline under the printed code (hidden while the 3D ring circles it), dot, leader.
      set(s.ul, { d: `M${a.batch.a.x} ${a.batch.a.y} L${toward(a.batch.a, a.batch.b, drawEase(P.underline))}`, opacity: activeRef.current === 'batch' && live ? 0 : fade })
      set(s.bd, { cx: a.batch.x, cy: a.batch.y, r: 4.5 * drawEase(P.batchDot), opacity: fade })
      const bFrom = { x: a.batch.x, y: a.batch.y + 4 }
      set(s.bl, { d: `M${bFrom.x} ${bFrom.y} L${toward(bFrom, tops.batch, drawEase(P.batchLeader))}`, opacity: P.batchLeader > 0 ? fade : 0 })
      // Pill: ring drawn from its bottom (where the leader lands), dot, leader.
      set(s.pr, { cx: a.pill.x, cy: a.pill.y, r: a.pill.r, 'stroke-dasharray': `${drawEase(P.ring)} 1`, transform: `rotate(90 ${a.pill.x} ${a.pill.y})`, opacity: fade })
      set(s.pd, { cx: a.pill.x, cy: a.pill.y + a.pill.r, r: 4.5 * Math.min(1, P.ring * 3), opacity: fade })
      const pFrom = { x: a.pill.x, y: a.pill.y + a.pill.r + 3 }
      set(s.pl, { d: `M${pFrom.x} ${pFrom.y} L${toward(pFrom, tops.pill, drawEase(P.pillLeader))}`, opacity: P.pillLeader > 0 ? fade : 0 })
      set(s.check, { 'stroke-dasharray': `${drawEase(P.check)} 1` })
    },
    [gutter],
  )

  const onAnchors = useCallback(
    (a: StripAnchors) => {
      lastAnchors.current = a
      layout(a)
    },
    [layout],
  )

  // Measure the stage and chips; re-layout on resize and once fonts settle.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      const r = stage.getBoundingClientRect()
      const g = geom.current
      g.w = stage.clientWidth
      g.h = stage.clientHeight
      g.left = r.left + window.scrollX
      g.vw = document.documentElement.clientWidth
      CHIPS.forEach((k) => {
        const el = chipRefs.current[k]
        if (el) g.chips[k] = [el.offsetWidth, el.offsetHeight]
      })
      setCompact(g.w < 600)
      layout(lastAnchors.current)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    CHIPS.forEach((k) => {
      const el = chipRefs.current[k]
      if (el) ro.observe(el)
    })
    window.addEventListener('resize', measure)
    void document.fonts?.ready.then(measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [layout])

  // Re-draw leaders when the highlight changes (the underline hides under the 3D ring).
  useEffect(() => {
    activeRef.current = active
    layout(lastAnchors.current)
  }, [active, layout])

  // Intro: the strip's rows of the landing's one load sequence. Reduced motion: one 200 ms fade.
  useEffect(() => {
    const skip = skipIntro || new URLSearchParams(window.location.search).get('state') === 'static'
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = introStart ?? performance.now()
    let raf = 0
    const finish = () => {
      intro.current = { p: introAt(1), fade: 1 }
      layout(lastAnchors.current)
      setIntroDone(true)
    }
    if (skip) {
      finish()
      return
    }
    const tick = () => {
      const e = performance.now() - t0
      if (reduce) {
        intro.current = { p: introAt(1), fade: Math.min(1, Math.max(0, e / 200)) }
      } else {
        const p = introAt(0)
        INTRO_KEYS.forEach((k) => {
          const [start, dur] = INTRO[k]
          p[k] = Math.min(1, Math.max(0, (e - start) / dur))
        })
        intro.current = { p, fade: 1 }
      }
      layout(lastAnchors.current)
      if (e >= (reduce ? 200 : INTRO_DONE)) finish()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [introStart, skipIntro, layout])

  // Decide on 3D after first paint, when the main thread is idle.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const force = params.get('strip')
    const state = params.get('state')
    const qh = params.get('highlight')
    if (qh === 'batch' || qh === 'pill') setQa(qh)
    if (force === 'poster' || state === 'static' || state === 'poster') return
    if (force !== 'live' && force !== 'lost' && !want3D()) return
    const start = () => setMode((m) => (m === 'poster' ? 'loading' : m))
    const w = window as Window & { requestIdleCallback?: Window['requestIdleCallback'] }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 800 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(start, 300) // Safari has no requestIdleCallback
    return () => window.clearTimeout(id)
  }, [])

  const onReady = useCallback(() => setMode('live'), [])
  const onContextLost = useCallback(() => {
    lastAnchors.current = null
    setMode('fallback')
    layout(null)
  }, [layout])

  // The canvas shows only after the intro, so anchors never jump mid-draw.
  const show3D = mode === 'live' && introDone

  // QA: ?strip=lost drops the context 1.5 s after the canvas shows.
  useEffect(() => {
    if (!show3D || new URLSearchParams(window.location.search).get('strip') !== 'lost') return
    const id = window.setTimeout(() => {
      stageRef.current?.querySelector('canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
    }, 1500)
    return () => window.clearTimeout(id)
  }, [show3D])

  const fadeCss = 'opacity 250ms cubic-bezier(.2,.8,.2,1)'
  const chipBase = (k: ChipKey): CSSProperties => ({
    position: 'absolute', ...ssrPos(k), zIndex: 3, whiteSpace: 'nowrap', borderRadius: compact ? 12 : 14,
    boxShadow: hover === k ? `0 0 0 2px #FFFFFF, ${chipShadow}` : chipShadow,
    padding: compact ? '8px 11px 9px' : '11px 14px 12px',
    opacity: 0,
    willChange: 'transform, opacity',
    transition: 'box-shadow 160ms ease-out',
  })
  const small: CSSProperties = { display: 'block', font: `500 ${compact ? 11 : 12}px/1.2 ${bodyFont}`, marginBottom: compact ? 3 : 5 }
  const strong: CSSProperties = { font: `600 ${compact ? 13 : 15}px/1.2 ${bodyFont}` }
  const dash = { fill: 'none', stroke: '#fff', strokeWidth: 2, strokeDasharray: '4 5', strokeLinecap: 'round' as const }
  const hoverable = (k: 'batch' | 'pill') => ({
    onPointerEnter: (e: ReactPointerEvent) => {
      if (introDone && e.pointerType !== 'touch') setHover(k)
    },
    onPointerLeave: () => setHover(null),
  })

  const description =
    `Illustration: a silver blister strip of ${product}, batch ${batch}, expiry ${exp}, with one red tablet. ` +
    `A label points at the printed batch number: ${batchLabel}, ${batch}. ` +
    `A red label points at the red tablet: ${alertSource}. ${alertText}. ` +
    `A third label reads: ${sealTop}. ${sealText}, ${sealWord}.`

  return (
    <div
      ref={stageRef}
      className={className}
      data-strip-mode={mode}
      data-highlight={active ?? 'none'}
      data-intro={introDone ? 'done' : 'playing'}
      style={{ position: 'relative', aspectRatio: '4 / 3', ...style }}
    >
      <p style={srOnly}>{description}</p>
      <noscript>
        <style>{'[data-strip-chip]{opacity:1!important}'}</style>
      </noscript>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static export; the poster must be byte-identical to the render */}
        <img
          src={poster}
          alt=""
          width={1400}
          height={1050}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: show3D ? 0 : 1, transition: fadeCss, userSelect: 'none' }}
        />
        {mode === 'loading' || mode === 'live' ? (
          <FoilStrip3D
            variant="hero"
            surface="cobalt"
            batch={batch}
            product={product}
            exp={exp}
            redIndex={redIndex}
            interactive={introDone}
            highlight={introDone ? active : null}
            paused={paused}
            onAnchors={onAnchors}
            onReady={onReady}
            onContextLost={onContextLost}
            style={{ position: 'absolute', inset: 0, opacity: show3D ? 1 : 0, transition: fadeCss }}
          />
        ) : null}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 2 }}>
          <path ref={(el) => { svg.current.ul = el }} stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" style={{ transition: 'opacity 200ms' }} />
          <path ref={(el) => { svg.current.bl = el }} {...dash} />
          <circle ref={(el) => { svg.current.bd = el }} r={0} fill="#fff" />
          <circle ref={(el) => { svg.current.pr = el }} fill="none" stroke="#fff" strokeWidth={2} pathLength={1} strokeDasharray="0 1" />
          <path ref={(el) => { svg.current.pl = el }} {...dash} />
          <circle ref={(el) => { svg.current.pd = el }} r={0} fill="#fff" />
        </svg>
        <div data-strip-chip="batch" ref={(el) => { chipRefs.current.batch = el }} {...hoverable('batch')} style={{ ...chipBase('batch'), background: '#fff', color: 'var(--ink, #0B1B33)' }}>
          <small style={{ ...small, color: 'var(--ink-muted, #4A5872)' }}>{batchLabel}</small>
          <span style={{ font: `900 ${compact ? 17 : 21}px/1 ${foilFont}`, letterSpacing: '.07em' }}>{batch}</span>
        </div>
        <div data-strip-chip="pill" ref={(el) => { chipRefs.current.pill = el }} {...hoverable('pill')} style={{ ...chipBase('pill'), background: 'var(--danger, #B3121E)', color: '#fff' }}>
          <small style={{ ...small, color: '#FBEAE8' }}>{alertSource}</small>
          <strong style={strong}>{alertText}</strong>
        </div>
        <div
          data-strip-chip="corner"
          ref={(el) => { chipRefs.current.corner = el }}
          style={{ ...chipBase('corner'), background: '#fff', color: 'var(--ink, #0B1B33)', display: 'flex', alignItems: 'center', gap: compact ? 8 : 11, padding: compact ? '8px 12px 8px 9px' : '11px 16px 11px 12px' }}
        >
          <svg width={compact ? 24 : 30} height={compact ? 24 : 30} viewBox="0 0 30 30" aria-hidden="true">
            <circle cx="15" cy="15" r="13" fill="none" stroke="#127A55" strokeWidth="2.4" />
            <path ref={(el) => { svg.current.check = el }} d="M9.5 15.3l3.8 3.8 7.4-8" fill="none" stroke="#127A55" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="0 1" />
          </svg>
          <span>
            <small style={{ ...small, color: 'var(--ink-muted, #4A5872)', marginBottom: 3 }}>{sealTop}</small>
            <strong style={strong}>
              {sealText} · <em style={{ fontStyle: 'normal', color: 'var(--success, #127A55)', letterSpacing: '.02em' }}>{sealWord}</em>
            </strong>
          </span>
        </div>
      </div>
    </div>
  )
}
