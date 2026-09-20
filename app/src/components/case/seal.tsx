"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef } from "react";

import { useSound } from "@/components/shell/sound";

const RING = {
  verified: "S3 OBJECT LOCK · KMS SIGNED ·",
  invalid: "SIGNATURE DOES NOT MATCH ·",
} as const;

export type SealState = "verified" | "invalid" | "pending";

/**
 * C-19's seal, ported from docs/brand/seal.svg: a circular stamp, ring text on a path, the word
 * in the middle, rotated −4°. The colour comes from `currentColor`, the ids from `useId()`, and
 * there is no <style> block (it would leak to the page).
 *
 * T-13: it presses down — scale 1.15 → 0.98 → 1, rotate −8° → −4° — and a Web Audio thunk lands
 * with it. Under reduced motion it simply appears, with no sound.
 */
export function Seal({ state, size = 144 }: { state: SealState; size?: number }) {
  const reduce = useReducedMotion();
  const id = useId();
  const ringId = `seal-ring-${id.replace(/:/g, "")}`;
  const thunk = useSound();
  const played = useRef<SealState | null>(null);

  const word = state === "invalid" ? "INVALID" : "VERIFIED";
  const ring = state === "invalid" ? RING.invalid : RING.verified;
  const tone = state === "invalid" ? "text-danger" : state === "verified" ? "text-success" : "text-ink-muted";

  useEffect(() => {
    if (state === "pending" || reduce) return;
    if (played.current === state) return;
    played.current = state;
    // the sound lands with the impact, not with the first frame
    const timer = setTimeout(() => thunk(), 126);
    return () => clearTimeout(timer);
  }, [state, reduce, thunk]);

  const press = reduce
    ? { initial: { opacity: 0, rotate: -4 }, animate: { opacity: 1, rotate: -4 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, scale: 1.15, rotate: -8 },
        animate: { opacity: 1, scale: [1.15, 0.98, 1], rotate: [-8, -4, -4] },
        transition: { duration: 0.18, ease: "linear" as const, times: [0, 0.7, 1] },
      };

  return (
    <motion.svg
      key={`${state}-${word}`}
      viewBox="0 0 160 160"
      width={size}
      height={size}
      role="img"
      aria-label={state === "invalid" ? "Signature does not match" : state === "verified" ? "Signature verified" : "Checking the signature"}
      className={`${tone} ${state === "pending" ? "opacity-40" : ""}`}
      {...press}
    >
      <g transform="rotate(-4 80 80)">
        <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="80" cy="80" r="56" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path id={ringId} d="M80 80m-60 0a60 60 0 1 1 120 0a60 60 0 1 1-120 0" fill="none" />
        <text
          fill="currentColor"
          style={{ fontFamily: "var(--ff-display)", fontWeight: 800, letterSpacing: "0.1em", fontSize: 13.5 }}
        >
          <textPath href={`#${ringId}`} startOffset="0" textLength="370" lengthAdjust="spacing">
            {ring}
          </textPath>
        </text>
        <text
          x="80"
          y="87"
          textAnchor="middle"
          fill="currentColor"
          style={{ fontFamily: "var(--ff-display)", fontWeight: 800, letterSpacing: "0.02em", fontSize: 19 }}
        >
          {word}
        </text>
      </g>
    </motion.svg>
  );
}
