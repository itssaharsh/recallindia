"use client";
import * as React from "react";
import { Play } from "lucide-react";
import { cn } from "../ui";
import { fmtDayMonthTime, monthLabel } from "./format";
import { ReplayGlyph } from "./Illustration";
import type { IngestRun, IngestSpeed } from "./types";
import type { ReplayPhase } from "./useIngestReplay";

export interface IngestHeaderProps {
  run: IngestRun;
  phase: ReplayPhase;
  speed: IngestSpeed;
  /** Current row for the paused copy ("row {n} of {rows}") */
  row: number;
  onToggle: () => void;
  onSpeed: (s: IngestSpeed) => void;
}

const NEXT_SPEED: Record<IngestSpeed, IngestSpeed> = { 1: 2, 2: 4, 4: 1 };

/** Title, sub, ReplayChip and SpeedToggle (spec 2.2). */
export function IngestHeader({ run, phase, speed, row, onToggle, onSpeed }: IngestHeaderProps) {
  const month = monthLabel(run.month).long;
  return (
    <header className="mt-[18px] flex flex-col gap-3.5 lg:mt-[22px] lg:flex-row lg:items-end lg:gap-6">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-[1.05] font-extrabold tracking-[-.03em] text-ink lg:text-[34px]">Watch a PDF become the feed</h1>
        <p className="mt-1.5 max-w-[820px] text-[14.5px] leading-[1.45] text-ink-muted lg:mt-2 lg:text-[15.5px]">
          <span className="hidden lg:inline">
            CDSCO’s NSQ alert for {month} is a {run.pages}-page PDF. Textract reads its tables, and every row becomes a notice.
          </span>
          <span className="lg:hidden">CDSCO’s {month} alert, read row by row.</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
        <button
          type="button"
          aria-pressed={phase === "playing"}
          onClick={onToggle}
          className={cn(
            "inline-flex h-11 min-w-0 flex-1 items-center gap-2 rounded-pill bg-cobalt-soft pr-4 pl-3 text-[14px] leading-none font-medium text-cobalt lg:flex-none",
            "transition-colors duration-150 hover:bg-cobalt-edge focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
          )}
        >
          {phase === "paused" ? <Play aria-hidden className="size-5" fill="currentColor" /> : <ReplayGlyph className="size-5" />}
          {phase === "done" ? (
            <b className="font-bold">Replay again</b>
          ) : phase === "paused" ? (
            <span className="truncate">
              <b className="font-bold">Paused</b>
              <span className="text-ink-on-cobalt-soft">
                {" "}
                · row {row} of {run.rows_in}
              </span>
            </span>
          ) : (
            <span className="truncate">
              <b className="font-bold">Replay</b>
              <span className="text-ink-on-cobalt-soft">
                {" "}
                recorded run<span className="hidden lg:inline"> · {fmtDayMonthTime(run.started_at)} IST</span>
              </span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSpeed(NEXT_SPEED[speed])}
          aria-label={`Replay speed ${speed}×. Change speed`}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-line bg-surface-1 text-[14px] font-semibold text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
        >
          {speed}×
        </button>
      </div>
    </header>
  );
}
