/**
 * /case motion constants. Global twins live in lib/motion.ts (spring, springFast, fade); the values
 * below are the case-specific ones from spec/case.md §3–§5. Nothing here loops except where the spec says.
 */
import type { Transition } from "framer-motion";

export type Bezier = [number, number, number, number];

export const EASE_OUT: Bezier = [0.22, 1, 0.36, 1];
export const EASE_IN: Bezier = [0.55, 0, 0.75, 0.2];
export const EASE_IN_OUT: Bezier = [0.65, 0, 0.35, 1];
/** connectors, bracket draw, impact rings, gate pulse */
export const EASE_DRAW: Bezier = [0.2, 0.8, 0.2, 1];
/** the stamp accelerating "like a hand pressing" */
export const EASE_PRESS: Bezier = [0.55, 0, 0.9, 0.4];

export const spring: Transition = { type: "spring", bounce: 0.1, duration: 0.4 };
export const springFast: Transition = { type: "spring", bounce: 0.1, duration: 0.25 };
export const fade: Transition = { duration: 0.18, ease: EASE_OUT };
/** reduced motion: every change is a 150 ms opacity crossfade */
export const rmFade: Transition = { duration: 0.15, ease: "linear" };

export const S = {
  /** crumb chip width (C1) */
  chip: { type: "spring", stiffness: 420, damping: 36 } as Transition,
  /** header morph from My things (C2) */
  morph: { type: "spring", stiffness: 320, damping: 32 } as Transition,
  /** gate → receipt, Show work height, TamperDiff height */
  layout: { type: "spring", stiffness: 380, damping: 34 } as Transition,
  /** "11 days" pill pop, "does not match" chip pop */
  pop: { type: "spring", stiffness: 500, damping: 26 } as Transition,
  /** aside node scale */
  node: { type: "spring", stiffness: 500, damping: 28 } as Transition,
  /** seal settle after impact */
  settle: { type: "spring", stiffness: 600, damping: 30 } as Transition,
  /** seal centre flip back */
  flip: { type: "spring", stiffness: 520, damping: 30 } as Transition,
  /** paper lift (B4) */
  lift: { type: "spring", stiffness: 400, damping: 32 } as Transition,
};

/** Plain spring options for imperative `animate()` (its options type is not `Transition`). */
export const SPRING_SETTLE = { type: "spring", stiffness: 600, damping: 30 } as const;
export const SPRING_FLIP = { type: "spring", stiffness: 520, damping: 30 } as const;

/** Minimum dwell per phase (spec §4), so a fast or seeded backend still reads as four beats. */
export const DWELL_MS = { approving: 400, sealing: 1200, writing: 1400, verifying: 900 } as const;
/** Polling cadence and budget (spec §4) — used by the page, listed here so the numbers live in one place. */
export const POLL_MS = 600;
export const POLL_BUDGET_MS = 30_000;
