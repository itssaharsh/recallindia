import type { Transition } from "motion/react";

// The only animations in the app (DESIGN.md): feed row snap-in, card flip, range-bar draw,
// evidence stamp (P09). Spring easing, no bounce. Reduced motion swaps each for a crossfade.
export const SNAP_IN: Transition = { type: "spring", duration: 0.22, bounce: 0 };
export const FLIP: Transition = { type: "spring", duration: 0.4, bounce: 0 };
export const DRAW: Transition = { type: "spring", duration: 0.32, bounce: 0 };
/** The evidence stamp presses down: scale 1.15 -> 1 at a 6° tilt, 300 ms. */
export const STAMP: Transition = { type: "spring", duration: 0.3, bounce: 0 };
export const CROSSFADE: Transition = { duration: 0.15, ease: "linear" };
