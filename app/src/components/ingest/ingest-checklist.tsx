import { Check } from "lucide-react";
import { memo, useSyncExternalStore } from "react";

import { STEP_LABEL, fmtSeconds, stepCopy, type PlayStore } from "@/lib/ingest";
import type { StepState } from "@/lib/types";

// Every planned step on screen with its real state (R25), never a bare spinner: a numbered ring
// while it waits, a cobalt spinner while it runs, a green tick when done. A failed step is amber
// (red is reserved for something you own being affected).
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
      className="inline-flex h-5 items-center rounded-xs bg-surface-2 px-1.5 font-mono text-[11px] text-ink-muted"
      title="How the tables were read"
    >
      {method}
    </span>
  );
}

function StepDisc({ state, n }: { state: StepState; n: number }) {
  const base = "grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold";
  if (state === "done")
    return (
      <span aria-hidden className={`${base} bg-success text-white`}>
        <Check className="size-4" strokeWidth={3} />
      </span>
    );
  if (state === "running")
    return (
      <span aria-hidden className={`${base} relative text-cobalt`}>
        <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-cobalt-soft border-t-cobalt" />
      </span>
    );
  if (state === "failed")
    return (
      <span aria-hidden className={`${base} bg-warning-soft text-warning`}>
        !
      </span>
    );
  return (
    <span aria-hidden className={`${base} border border-line-strong text-ink-muted ${state === "skipped" ? "line-through" : ""}`}>
      {n}
    </span>
  );
}

/** The IngestStateMachine's five steps, left to right, with what each one is doing right now. */
export const IngestChecklist = memo(function IngestChecklist({ store }: { store: PlayStore }) {
  // the only subscriber to the running clocks (10 updates a second while a step runs)
  const play = useSyncExternalStore(store.subscribe, store.get, store.get);
  return (
    <ol
      className="ingest-layer m-0 grid list-none gap-x-3 gap-y-4 rounded-md border border-line bg-surface-1 px-5 py-4 shadow-1 md:grid-cols-5"
      aria-label="Ingest steps"
    >
      {play.steps.map((step, i) => (
        <li key={step.name} className="flex min-w-0 items-start gap-3">
          <StepDisc state={step.state} n={i + 1} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`truncate font-display text-[16px] leading-tight font-bold ${
                  step.state === "running" ? "text-cobalt" : step.state === "pending" ? "text-ink-muted" : "text-ink"
                }`}
              >
                {STEP_LABEL[step.name]}
              </span>
              {i < play.steps.length - 1 && (
                <span aria-hidden className={`hidden h-0.5 min-w-4 flex-1 rounded-full md:block ${step.state === "done" ? "bg-success" : "bg-line"}`} />
              )}
            </div>
            <p className={`m-0 mt-1 text-[13px] leading-snug ${step.state === "failed" ? "text-warning" : "text-ink-muted"}`}>
              {fmtSeconds(step.ms) && <span className="font-mono tabular-nums text-ink">{fmtSeconds(step.ms)} · </span>}
              {step.name === "Extract" && play.method && (
                <>
                  <MethodChip method={play.method} />{" "}
                </>
              )}
              {stepCopy(step, play)}
              <span className="sr-only"> ({WORD[step.state]})</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
});
