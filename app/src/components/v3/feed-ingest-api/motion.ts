/**
 * Motion tokens for /feed, /ingest and /api (spec §0.4, "Fluid").
 * Every view wraps itself in <MotionConfig reducedMotion="user">, so framer drops transforms
 * and keeps opacity when the OS asks for reduced motion.
 */
import type { Transition } from "framer-motion";

export interface SpringSpec {
  stiffness: number;
  damping: number;
  mass?: number;
}

export const SPRING_SNAPPY: SpringSpec = { stiffness: 420, damping: 36, mass: 1 }; // ≈ 250 ms, bounce .04
export const SPRING_SOFT: SpringSpec = { stiffness: 320, damping: 34, mass: 1 }; // ≈ 320 ms, bounce .05
export const SPRING_FLIGHT: SpringSpec = { stiffness: 380, damping: 34, mass: 1 }; // ≈ 420 ms, bounce .06
/** Landing settle, bounce ≈ .08 */
export const SPRING_SETTLE: SpringSpec = { stiffness: 420, damping: 30, mass: 1 };

export const springSnappy: Transition = { type: "spring", ...SPRING_SNAPPY };
export const springSoft: Transition = { type: "spring", ...SPRING_SOFT };
export const springFlight: Transition = { type: "spring", ...SPRING_FLIGHT };

export const EASE_DRAW: [number, number, number, number] = [0.2, 0.8, 0.2, 1];
export const EASE_PAGE: [number, number, number, number] = [0.65, 0, 0.35, 1];

export const fade: Transition = { duration: 0.16, ease: "linear" };

/**
 * Closed-form damped spring from 0 to 1 at `t` seconds: the same physics framer uses for
 * stiffness/damping springs. The ingest replay evaluates it against its own clock, so every
 * frame is a pure function of time and pause/resume/2×/4× are exact.
 */
export function springAt(t: number, { stiffness, damping, mass = 1 }: SpringSpec): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const e = Math.exp(-zeta * w0 * t);
    return 1 - e * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  const e = Math.exp(-w0 * t);
  return 1 - e * (1 + w0 * t);
}

/** cubic-bezier(x1,y1,x2,y2) as a function of x in [0,1]. */
export function cubicBezier([x1, y1, x2, y2]: [number, number, number, number]): (x: number) => number {
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2;
      if (bx(t) < x) lo = t;
      else hi = t;
    }
    return by(t);
  };
}

export const easeDraw = cubicBezier(EASE_DRAW);
export const easePage = cubicBezier(EASE_PAGE);

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
