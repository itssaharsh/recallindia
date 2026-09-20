/** Landing motion constants (landing.md §3, §5.4, §6.1, §7.2). Framer springs use { duration, bounce }. */
import type { Transition } from 'framer-motion'

/** cubic-bezier(.2,.8,.2,1): nav, live pill, 3D crossfade */
export const EASE_LANDING = [0.2, 0.8, 0.2, 1] as const
/** cubic-bezier(.4,0,.2,1): "draw" (stroke-dashoffset) */
export const EASE_DRAW = [0.4, 0, 0.2, 1] as const
/** cubic-bezier(.65,0,.35,1): the How-it-works tracer */
export const EASE_TRACER = [0.65, 0, 0.35, 1] as const

export const spring = (duration: number, bounce: number, delayMs = 0): Transition => ({
  type: 'spring', duration, bounce, delay: delayMs / 1000,
})

/** The hero's load sequence (ms from t0). The strip's rows (700–1600) are played by FoilStripHero. */
export const HERO_INTRO = {
  livePill: { at: 0, dur: 240 },
  h1Lines: [60, 120, 180],
  stage: 120,
  sub: 320,
  ctas: 420,
  stats: 520,
  done: 1600,
  /** start without waiting any longer for the display font */
  fontTimeout: 300,
  /** reduced motion: everything fades together */
  reducedFade: 200,
} as const

/** Nav switches to solid at scrollY ≥ hero bottom − 64. */
export const NAV_SOLID_AT = 726
export const NAV_TRANSITION = 'height 200ms cubic-bezier(.2,.8,.2,1), background-color 200ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms cubic-bezier(.2,.8,.2,1), border-color 200ms cubic-bezier(.2,.8,.2,1)'

export const TRACER_MS = 1400
export const BAR_MS = 400
export const BAR_STAGGER_MS = 60

/** CSS cubic-bezier(x1,y1,x2,y2) as a function of x in [0,1] (Newton + bisection). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0, hi = 1, t = x
    for (let i = 0; i < 20; i++) {
      const v = sx(t) - x
      if (Math.abs(v) < 1e-5) break
      if (v > 0) hi = t
      else lo = t
      t = (lo + hi) / 2
    }
    return sy(t)
  }
}
