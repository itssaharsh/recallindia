/**
 * Motion values from spec/mine.md §3, named so each component reads like the spec.
 * Every spring keeps bounce ≤ 0.1. Wrap the page in <MotionConfig reducedMotion="user"> (MineView does).
 */
import type { Transition } from "framer-motion";

/** Wall re-flow and re-sort (300/32, ≈400 ms). */
export const springLayout: Transition = { type: "spring", stiffness: 300, damping: 32 };
/** Filter pill slide, banner button width, kind switch (380/34, ≈300 ms). */
export const springPill: Transition = { type: "spring", stiffness: 380, damping: 34 };
/** Flip, second half (380/32, ≈300 ms). */
export const springFlip: Transition = { type: "spring", stiffness: 380, damping: 32 };
/** Red pills landing in the household strip, range markers (420/30). */
export const springPill420: Transition = { type: "spring", stiffness: 420, damping: 30 };
/** Add sheet rising (320/34, ≈360 ms). */
export const springSheet: Transition = { type: "spring", stiffness: 320, damping: 34 };
/** Batch morph from the word box to the callout (300/30, ≈380 ms). */
export const springMorph: Transition = { type: "spring", stiffness: 300, damping: 30 };

/** Flip, first half: 0 → 90° in 160 ms. */
export const flipOut: Transition = { duration: 0.16, ease: [0.4, 0, 1, 1] };
/** Sheet close: 240 ms. */
export const sheetOut: Transition = { duration: 0.24, ease: [0.4, 0, 1, 1] };
/** Card rise in the load sequence: 280 ms. */
export const rise: Transition = { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] };
/** Crossfades (text swaps, reduced-motion fallbacks). */
export const fade180: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };
export const fade150: Transition = { duration: 0.15, ease: "linear" };

/** Load sequence clock (ms). */
export const LOAD = {
  /** Headline NumberFlow 0 → n. */
  headline: 600,
  /** Strip pockets: stagger per pocket. */
  pocketStagger: 30,
  /** Cards start this long after the headline starts. */
  cardsDelay: 200,
  cardStagger: 40,
  /** The stagger stops after this many cards; the rest appear together. */
  staggerCap: 8,
} as const;

/** Flip and re-sort clock (ms). */
export const FLIP = {
  out: 160,
  /** ≈ settle time of springFlip. */
  in: 300,
  /** The card stays in place this long after its flip lands. */
  hold: 700,
  /** Longest wait for pointer/focus to leave the wall before moving anyway. */
  maxDefer: 4000,
  reducedFade: 150,
} as const;
