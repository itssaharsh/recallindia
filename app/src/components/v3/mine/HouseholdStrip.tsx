"use client";
/**
 * HouseholdStrip (spec/mine.md §2.3): the household as one foil blister strip, one pocket per thing, plus the legend.
 * Matches the strip at the top right of mockups/mine-1536.png (428 × 132) and the full-width strip in mine-390.png.
 *
 * - Pockets follow wall sort order; with 15 things or fewer the 16th pocket is the "+" button (Add a thing),
 *   with more it reads "+{n−15}".
 * - Load: pockets fill left to right (30 ms stagger, opacity + scale .6 → 1); red pills land last on a 420/30 spring.
 * - A pocket's pill changes with its card's face (pass faces as shown, i.e. updated when the card passes 90°).
 * - Mouse only: hovering a pocket shows "{name} · {face}"; clicking it asks the page to scroll to the card.
 */
import * as React from "react";
import NumberFlow from "@number-flow/react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "../ui";
import { FACE_LABEL, fmtTime, type FaceCounts } from "./derive";
import { LOAD, springPill420 } from "./motion";
import type { Face, HouseholdMode } from "./types";

export interface StripPocket {
  item_id: string;
  /** Card title, for the tooltip. */
  name: string;
  face: Face;
}

export interface HouseholdStripProps {
  /** Items in wall sort order, with the face each card currently shows. */
  pockets: StripPocket[];
  counts: FaceCounts;
  mode: HouseholdMode;
  /** Latest `last_checked_at` (ISO), printed at the top right. */
  checkedAt: string | null;
  /** Play the load sequence. */
  intro?: boolean;
  onAdd?: () => void;
  /** Mouse only: scroll to the card and flash its focus ring. */
  onPocketSelect?: (itemId: string) => void;
  className?: string;
}

const SLOTS = 16;

function Pill({ face, delay, intro, mounted }: { face: Face; delay: number; intro: boolean; mounted: boolean }) {
  const red = face === "alert";
  // first render: the load sequence (or nothing); later renders: a face change pops the pill in (.6 → 1)
  const initial = !mounted ? (intro ? { opacity: 0, scale: 0.6 } : false) : { scale: 0.6 };
  return (
    <motion.i
      key={face}
      aria-hidden
      className={cn(
        "relative block size-[22px] rounded-full md:size-[27px]",
        red ? "bg-[var(--pill-red)] shadow-pill-red" : "bg-surface-1 shadow-pill",
        face === "near-miss" && "shadow-[0_0_0_2.5px_var(--cobalt),0_1px_2px_rgb(11_27_51/.28)]",
        face === "needs-you" && "shadow-[0_0_0_2.5px_var(--warning),0_1px_2px_rgb(11_27_51/.28)]",
      )}
      initial={initial}
      animate={{ opacity: 1, scale: 1 }}
      transition={red || mounted ? { ...springPill420, delay: mounted ? 0 : delay } : { duration: 0.2, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {/* highlight */}
      <span className="absolute top-1 left-[5px] h-1 w-1.5 -rotate-30 rounded-full bg-white/75 md:top-1.5 md:left-[7px] md:h-[5px] md:w-[7px]" />
    </motion.i>
  );
}

export function HouseholdStrip({ pockets, counts, mode, checkedAt, intro = true, onAdd, onPocketSelect, className }: HouseholdStripProps) {
  const reduce = useReducedMotion();
  const [tip, setTip] = React.useState<number | null>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const overflow = pockets.length > SLOTS - 1 ? pockets.length - (SLOTS - 1) : 0;
  const shown = pockets.slice(0, SLOTS - 1);
  const play = intro && !reduce;
  const redBase = (SLOTS * LOAD.pocketStagger) / 1000;

  const summary =
    `Household strip: ${counts.total} ${counts.total === 1 ? "thing" : "things"}. ${counts.alert} on a notice, ` +
    (counts["needs-you"] ? `${counts["needs-you"]} needs you, ` : "") +
    `${counts["near-miss"]} ${counts["near-miss"] === 1 ? "near-miss" : "near-misses"}, ${counts.checking} checking, ${counts.clear} no match.`;

  const cell = (i: number) => {
    const p = shown[i];
    const delay = play ? (p?.face === "alert" ? redBase + i * 0.05 : (i * LOAD.pocketStagger) / 1000) : 0;
    return (
      <motion.span
        key={p ? p.item_id : `empty-${i}`}
        aria-hidden
        className="relative grid size-8 place-items-center rounded-full bg-white/35 shadow-pocket md:size-[38px]"
        initial={play && !mounted ? { opacity: 0, scale: 0.6 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1], delay: play && !mounted ? (i * LOAD.pocketStagger) / 1000 : 0 }}
        onPointerEnter={(e) => e.pointerType === "mouse" && p && setTip(i)}
        onPointerLeave={() => setTip((t) => (t === i ? null : t))}
        onClick={() => p && onPocketSelect?.(p.item_id)}
        style={{ cursor: p && onPocketSelect ? "pointer" : undefined }}
      >
        {p ? <Pill face={p.face} delay={delay} intro={play} mounted={mounted} /> : null}
        {p?.face === "checking" ? (
          <i className="absolute inset-[3px] animate-[spin_1.1s_linear_infinite] rounded-full border-[2.5px] border-cobalt border-r-transparent border-b-transparent" />
        ) : null}
        {tip === i && p ? (
          <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-xs bg-ink px-2.5 py-2 text-[13px]/none font-medium text-white">
            {p.name} · {FACE_LABEL[p.face]}
          </span>
        ) : null}
      </motion.span>
    );
  };

  const last =
    overflow > 0 ? (
      <span aria-hidden className="grid size-8 place-items-center rounded-full text-[12px] font-bold text-ink-muted shadow-[inset_0_0_0_1.5px_rgb(11_27_51/.3)] md:size-[38px]">
        +{overflow}
      </span>
    ) : (
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add a thing"
        className={cn(
          "relative grid size-8 place-items-center rounded-full text-ink-muted shadow-[inset_0_0_0_1.5px_rgb(11_27_51/.3)] md:size-[38px]",
          "transition-colors duration-150 hover:bg-white/60 hover:text-ink",
          "before:absolute before:-inset-1.5 before:content-['']",
        )}
      >
        <Plus className="size-4 md:size-[18px]" strokeWidth={2.2} />
      </button>
    );

  const row = (start: number) => (
    <>
      {[0, 1, 2, 3].map((k) => cell(start + k))}
      <span aria-hidden className="w-0 justify-self-center border-l-[1.5px] border-dashed border-ink/30" />
      {[4, 5, 6, 7].map((k) => (start + k === SLOTS - 1 ? <React.Fragment key="last">{last}</React.Fragment> : cell(start + k)))}
    </>
  );

  const printLabel = `${mode === "demo" ? "Demo household" : "My household"} · ${counts.total} ${counts.total === 1 ? "thing" : "things"}`;

  return (
    <div className={cn("flex flex-col items-stretch gap-3 md:flex-row md:items-center md:gap-[22px]", className)}>
      <div className="relative rounded-[14px] px-3 pt-3 pb-[13px] [background:var(--foil)] shadow-strip md:rounded-[16px] md:px-4 md:pt-3 md:pb-3.5">
        <span role="img" aria-label={summary} className="sr-only" />
        <div aria-hidden className="mx-0.5 mb-[9px] flex justify-between font-sans text-[9.5px]/none font-bold tracking-[0.08em] text-print-ink uppercase md:mb-[11px] md:text-[11px]/none">
          <span>{printLabel}</span>
          <span className="text-[11px]/none tracking-[0.04em] tabular-nums md:text-[12px]/none">{fmtTime(checkedAt)}</span>
        </div>
        <div className="grid grid-cols-[repeat(4,32px)_10px_repeat(4,32px)] grid-rows-[32px_32px] justify-center gap-[7px] md:grid-cols-[repeat(4,38px)_12px_repeat(4,38px)] md:grid-rows-[38px_38px] md:gap-x-2.5 md:gap-y-2">
          {row(0)}
          {row(8)}
        </div>
      </div>
      <Legend counts={counts} />
    </div>
  );
}

/* ----------------------------------------------------------------- legend */

function Swatch({ kind }: { kind: "alert" | "near" | "needs" | "checking" | "clear" | "unchecked" }) {
  return (
    <i
      aria-hidden
      className={cn(
        "relative size-3.5 flex-none rounded-full",
        kind === "alert" && "bg-[var(--pill-red)]",
        kind === "near" && "bg-surface-1 shadow-[inset_0_0_0_2px_var(--cobalt)]",
        kind === "needs" && "bg-surface-1 shadow-[inset_0_0_0_2px_var(--warning)]",
        kind === "checking" && "bg-surface-1 shadow-[inset_0_0_0_1px_rgb(11_27_51/.18)]",
        kind === "clear" && "bg-surface-1 shadow-[inset_0_0_0_1px_rgb(11_27_51/.3)]",
        kind === "unchecked" && "border border-dashed border-line-strong bg-surface-1",
      )}
    >
      {kind === "checking" ? <span className="absolute inset-0 rounded-full border-2 border-cobalt border-r-transparent border-b-transparent" /> : null}
    </i>
  );
}

function LegendRow({ n, label, swatch }: { n: number; label: string; swatch: React.ComponentProps<typeof Swatch>["kind"] }) {
  return (
    <span className="inline-flex h-3.5 items-center gap-[7px]">
      <Swatch kind={swatch} />
      <b className="min-w-5 text-right font-bold tabular-nums text-ink">
        <NumberFlow value={n} transformTiming={{ duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }} style={{ ["--number-flow-mask-height" as string]: "0px" }} />
      </b>
      {label}
    </span>
  );
}

export function Legend({ counts }: { counts: FaceCounts }) {
  return (
    <div aria-hidden className="grid grid-cols-2 gap-x-3 gap-y-2.5 font-sans text-[13px]/none font-medium text-ink-muted md:grid-cols-1 md:gap-3 md:text-[14px]/none">
      <LegendRow n={counts.alert} label="on a notice" swatch="alert" />
      {counts["needs-you"] > 0 ? <LegendRow n={counts["needs-you"]} label="needs you" swatch="needs" /> : null}
      <LegendRow n={counts["near-miss"]} label={counts["near-miss"] === 1 ? "near-miss" : "near-misses"} swatch="near" />
      <LegendRow n={counts.checking} label="checking" swatch="checking" />
      <LegendRow n={counts.clear} label="no match" swatch="clear" />
      {counts.unchecked > 0 ? <LegendRow n={counts.unchecked} label="not checked yet" swatch="unchecked" /> : null}
    </div>
  );
}
