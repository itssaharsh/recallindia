"use client";
/**
 * OutcomeLine (spec/mine.md §2.2): one sentence that is the answer, with the freshness evidence under it.
 * Matches the 54 px headline + sub line in mockups/mine-1536.png (34 px, two lines, in mine-390.png).
 * The number rolls with NumberFlow: 0 → n on load (600 ms), n → n±1 on change (400 ms). The rest of the
 * sentence crossfades (180 ms) only when its pattern changes. A hidden live region repeats it after changes.
 */
import * as React from "react";
import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../ui";
import { fmtCount, fmtTime, headline, joinSources, type FaceCounts } from "./derive";
import { fade180, LOAD } from "./motion";

export interface OutcomeLineProps {
  /** Counts of the faces as currently shown (they update when a flipping card passes 90°). */
  counts: FaceCounts;
  /** Latest item `last_checked_at` (ISO). */
  checkedAt: string | null;
  /** Next poll (ISO): `/v1/stats` → `next_poll_at`, or the soonest `last_run_at + polls_every`. */
  nextPollAt: string | null;
  /** `/v1/stats` → `sources[].label`, in order ("CDSCO", "CPSC", "NHTSA", "openFDA"). */
  sourceLabels: string[];
  /** `/v1/stats` → `total` (4868), used in the empty household copy. */
  totalNotices: number;
  /** Roll the number from 0 on first render (the page's load sequence). */
  intro?: boolean;
  className?: string;
}

export function OutcomeLine({ counts, checkedAt, nextPollAt, sourceLabels, totalNotices, intro = true, className }: OutcomeLineProps) {
  const h = headline(counts, checkedAt);
  const [shown, setShown] = React.useState<number | null>(intro && h.n !== null ? 0 : h.n);
  const first = React.useRef(true);
  React.useEffect(() => {
    setShown(h.n);
    const id = window.setTimeout(() => (first.current = false), LOAD.headline);
    return () => window.clearTimeout(id);
  }, [h.n]);

  const [live, setLive] = React.useState("");
  const prevText = React.useRef(h.text);
  React.useEffect(() => {
    if (prevText.current !== h.text) setLive(h.text);
    prevText.current = h.text;
  }, [h.text]);

  const timing = { duration: first.current ? LOAD.headline : 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
  const list = joinSources(sourceLabels);

  return (
    <div className={cn("min-w-0", className)}>
      <h1 className="m-0 font-display text-[34px]/[1.02] font-extrabold tracking-[-0.035em] text-ink text-balance md:text-display-lg">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={h.pattern} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade180}>
            {h.before}
            {shown !== null ? (
              <NumberFlow
                value={shown}
                transformTiming={timing}
                spinTiming={timing}
                opacityTiming={{ duration: 180, easing: "ease-out" }}
                willChange
                // no mask padding: it would add 14 px above and below the digits and push the sub line down
                style={{ ["--number-flow-mask-height" as string]: "0px" }}
                className="[font-variant-numeric:tabular-nums]"
              />
            ) : null}
            {h.after}
          </motion.span>
        </AnimatePresence>
      </h1>
      <p className="mt-2.5 mb-0 max-w-[660px] text-[15px]/[1.5] text-pretty text-ink-muted md:mt-3 md:text-[17px]/[1.5]">
        {h.pattern === "empty" ? (
          <>
            Scan a medicine strip or type a model number. We check it against {fmtCount(totalNotices)} notices from {list}.
          </>
        ) : (
          <>
            <b className="font-semibold text-ink">{counts.total} {counts.total === 1 ? "thing" : "things"}</b> checked against {list} at{" "}
            <time dateTime={checkedAt ?? undefined}>{fmtTime(checkedAt)}</time> IST.
            {nextPollAt ? (
              <span className="hidden md:block">
                Each new notice is matched the moment it lands; the next poll is at <time dateTime={nextPollAt}>{fmtTime(nextPollAt)}</time>.
              </span>
            ) : null}
          </>
        )}
      </p>
      <span aria-live="polite" className="sr-only">
        {live}
      </span>
    </div>
  );
}
