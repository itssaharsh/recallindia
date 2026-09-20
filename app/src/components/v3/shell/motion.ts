import type { Transition } from "framer-motion";

/**
 * framer-motion twins of the CSS motion tokens (globals.tokens.css §1, spec §7).
 * "Fluid": springs with bounce 0.1. Under <MotionConfig reducedMotion="user"> framer drops
 * transforms and layout animation and keeps opacity, which is what the spec asks for.
 */
export const spring: Transition = { type: "spring", bounce: 0.1, duration: 0.4 }; // --dur-slow
export const springFlip: Transition = { type: "spring", bounce: 0.1, duration: 0.32 }; // --dur-flip
export const springFast: Transition = { type: "spring", bounce: 0.1, duration: 0.25 }; // --dur-base
export const fade: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] }; // --dur-fast, --ease-out
export const fadeOut: Transition = { duration: 0.18, ease: [0.55, 0, 0.75, 0.2] }; // exits: --ease-in

/** Seconds. --stagger for the one orchestrated load sequence per page. */
export const STAGGER = 0.04;

/** --ease-spring as a CSS/WAAPI easing string (for NumberFlow and plain CSS transitions). */
export const EASE_SPRING =
  "linear(0, 0.0307, 0.1048, 0.2015, 0.3065, 0.4107, 0.5084, 0.5967, 0.674, 0.7403, 0.7959, 0.8418, 0.8791, 0.909, 0.9326, 0.951, 0.9651, 0.9758, 0.9838, 0.9896, 0.9938, 0.9967, 0.9987, 1, 1.0008, 1.0013, 1.0015, 1.0015, 1.0015, 1.0013, 1.0012, 1.001, 1)";

/** NumberFlow timing: numbers change with a 250 ms spring (spec §7). */
export const numberFlowTiming = {
  transformTiming: { duration: 250, easing: EASE_SPRING },
  spinTiming: { duration: 250, easing: EASE_SPRING },
  opacityTiming: { duration: 180, easing: "ease-out" },
} as const;
