"use client";
/**
 * RangeBar (spec/mine.md §2.8): the notice's range and your value on one line.
 * - `years`: listed model years with your year as a marker (Jeep Compass 2022, mockups/mine-1536.png right card).
 * - `dates`: notice published → you bought it, with the measured gap (Paracetamol, mine-1536.png left card footer).
 * Motion: none on load. With `animateIn` (a card that just flipped to alert) the fill grows from the left
 * in 320 ms, then the marker drops in on the strip spring.
 */
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../ui";
import { daysBetween, fmtDate } from "./derive";
import { springPill420 } from "./motion";

const grow = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

/* --------------------------------------------------------------- years */

export interface RangeBarYearsProps {
  variant: "years";
  /** NHTSA `model_years`: [from, to]. */
  listed: [number, number];
  /** The item's `year`. */
  yours: number;
  animateIn?: boolean;
  className?: string;
}

/** Listed range maps to 20%–80%; the outer years (range ±1) sit at 4% and 96% (spec: 2020–2024 at 4/20/50/80/96). */
function yearPos(y: number, [a, b]: [number, number]): number {
  if (a === b) return y === a ? 50 : y < a ? 12 : 88;
  if (y < a) return 12;
  if (y > b) return 88;
  return 20 + ((y - a) / (b - a)) * 60;
}

function Years({ listed, yours, animateIn = false, className }: Omit<RangeBarYearsProps, "variant">) {
  const reduce = useReducedMotion();
  const [a, b] = listed;
  const left = a === b ? 40 : 20;
  const right = a === b ? 40 : 20;
  const you = yearPos(yours, listed);
  type Label = { y: number; at: number; tone: "out" | "in" };
  const all: Label[] = [
    { y: a - 1, at: 4, tone: "out" },
    { y: a, at: a === b ? 50 : 20, tone: "in" },
    { y: b, at: 80, tone: "in" },
    { y: b + 1, at: 96, tone: "out" },
  ];
  const labels = all.filter((l, i) => l.y !== yours && !(i === 2 && a === b));
  const play = animateIn && !reduce;
  return (
    <div role="img" aria-label={`Listed model years ${a} to ${b}; yours is ${yours}.`} className={cn("mt-3.5", className)}>
      <div className="relative h-2.5 rounded-[5px] bg-surface-2">
        <motion.div
          className="absolute inset-y-0 origin-left rounded-[5px] bg-range-fill shadow-[inset_0_0_0_1.5px_var(--danger)]"
          style={{ left: `${left}%`, right: `${right}%` }}
          initial={play ? { scaleX: 0 } : false}
          animate={{ scaleX: 1 }}
          transition={grow}
        />
        <motion.div
          className="absolute top-1/2 -mt-[11px] -ml-[11px] size-[22px] rounded-full border-[3px] border-white bg-danger shadow-[0_1px_3px_rgb(11_27_51/.35)]"
          style={{ left: `${you}%` }}
          initial={play ? { opacity: 0, y: -10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springPill420, delay: play ? 0.32 : 0 }}
        />
      </div>
      <div className="relative mt-2 h-5 text-[12px]/none font-medium tabular-nums text-ink-muted">
        {labels.map((l) => (
          <span
            key={`${l.tone}-${l.y}`}
            className={cn(
              "absolute top-1 -translate-x-1/2 whitespace-nowrap",
              l.tone === "out" && "hidden md:inline",
              l.tone === "in" && "font-bold text-danger",
            )}
            style={{ left: `${l.at}%` }}
          >
            {l.y}
          </span>
        ))}
        <span className="absolute top-1 -translate-x-1/2 whitespace-nowrap font-bold text-ink" style={{ left: `${you}%` }}>
          Yours {yours}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- dates */

export interface RangeBarDatesProps {
  variant: "dates";
  /** Notice `published_at`. */
  published: string;
  /** Item `purchase_date`. */
  bought: string;
  animateIn?: boolean;
  className?: string;
}

function End({ you, caption, date }: { you: boolean; caption: string; date: string }) {
  return (
    <div className="flex flex-none items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "size-3.5 flex-none rounded-full border-[3px] border-danger",
          you ? "bg-danger shadow-[0_0_0_3px_var(--danger-soft)]" : "bg-surface-1",
        )}
      />
      <span className="flex flex-col gap-[3px] text-[12px]/none font-medium text-ink-muted">
        {caption}
        <b className="text-[14px]/none font-semibold tabular-nums text-ink">{date}</b>
      </span>
    </div>
  );
}

function Dates({ published, bought, animateIn = false, className }: Omit<RangeBarDatesProps, "variant">) {
  const reduce = useReducedMotion();
  const gap = daysBetween(published, bought);
  const after = gap >= 0;
  const n = Math.abs(gap);
  const days = `${n} ${n === 1 ? "day" : "days"}`;
  const label = after
    ? `Bought ${fmtDate(bought)}, ${days} after the notice was published on ${fmtDate(published)}.`
    : `Bought ${fmtDate(bought)}, ${days} before the notice was published on ${fmtDate(published)}.`;
  const notice = <End you={false} caption="Notice published" date={fmtDate(published)} />;
  const yours = <End you caption="You bought it" date={fmtDate(bought)} />;
  const play = animateIn && !reduce;
  return (
    <div role="img" aria-label={label} className={cn("flex min-w-0 flex-1 basis-full items-center gap-2.5 md:basis-auto", className)}>
      {after ? notice : yours}
      <motion.div
        className={cn("relative grid h-0.5 min-w-[30px] max-w-[220px] flex-1 origin-left place-items-center md:min-w-[60px]", after ? "bg-danger" : "bg-line-strong")}
        initial={play ? { scaleX: 0 } : false}
        animate={{ scaleX: 1 }}
        transition={grow}
      >
        <motion.span
          className={cn(
            "absolute whitespace-nowrap rounded-pill px-2.5 py-1.5 text-[13px]/none font-bold",
            after ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink-muted",
          )}
          initial={play ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, delay: play ? 0.32 : 0 }}
        >
          {after ? days : `${days} before`}
        </motion.span>
      </motion.div>
      {after ? yours : notice}
    </div>
  );
}

export type RangeBarProps = RangeBarYearsProps | RangeBarDatesProps;

export function RangeBar(props: RangeBarProps) {
  if (props.variant === "years") {
    const { variant: _v, ...rest } = props;
    return <Years {...rest} />;
  }
  const { variant: _v, ...rest } = props;
  return <Dates {...rest} />;
}
