import { memo } from "react";

import { STEP_LABEL, fmtSeconds, stepCopy, type PlayState } from "@/lib/ingest";
import type { StepState } from "@/lib/types";

// ○ pending · ◐ running · ● done (R25: every planned step on screen with its real state; never a
// bare spinner). Failed is a red ●, skipped a struck-through ○.
const GLYPH: Record<StepState, string> = { pending: "○", running: "◐", done: "●", failed: "●", skipped: "○" };
const GLYPH_TONE: Record<StepState, string> = {
  pending: "text-muted",
  running: "text-primary-strong",
  done: "text-text",
  failed: "text-alert",
  skipped: "text-muted",
};
const WORD: Record<StepState, string> = {
  pending: "to do",
  running: "in progress",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

export function MethodChip({ method }: { method: string }) {
  return (
    <span
      className="inline-flex h-5 items-center rounded-sm border border-line px-1.5 font-mono text-[10.5px] text-muted"
      title="How the tables were read"
    >
      {method}
    </span>
  );
}

/** The IngestStateMachine's five steps, left to right, with what each one is doing right now. */
export const IngestChecklist = memo(function IngestChecklist({ play }: { play: PlayState }) {
  return (
    <ol className="m-0 grid list-none gap-px border border-line bg-line p-0 md:grid-cols-5" aria-label="Ingest steps">
      {play.steps.map((step) => (
        <li key={step.name} className="flex min-w-0 flex-col gap-1 bg-surface-1 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={`w-3 shrink-0 font-mono text-sm ${GLYPH_TONE[step.state]}`}>
              {GLYPH[step.state]}
            </span>
            <span className={`truncate text-[13px] font-medium ${step.state === "pending" ? "text-muted" : "text-text"}`}>
              {STEP_LABEL[step.name]}
            </span>
            {step.name === "Extract" && play.method && <MethodChip method={play.method} />}
            <span className="ml-auto shrink-0 font-mono text-[11px] text-muted tabular-nums">{fmtSeconds(step.ms)}</span>
          </div>
          <p className={`m-0 text-xs leading-snug ${step.state === "failed" ? "text-alert" : "text-muted"}`}>
            {stepCopy(step, play)}
            <span className="sr-only"> ({WORD[step.state]})</span>
          </p>
        </li>
      ))}
    </ol>
  );
});
