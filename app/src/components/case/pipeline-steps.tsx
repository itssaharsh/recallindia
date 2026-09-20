"use client";

import type { PipelineStep } from "@/lib/case";

const DOT: Record<PipelineStep["state"], string> = {
  pending: "border-line-strong",
  running: "animate-pulse border-primary bg-primary",
  done: "border-success bg-success",
  failed: "border-warning bg-warning",
};

const LABEL: Record<PipelineStep["state"], string> = {
  pending: "text-muted",
  running: "text-ink",
  done: "text-ink",
  failed: "text-warning",
};

const WORD: Record<PipelineStep["state"], string> = {
  pending: "to do",
  running: "in progress",
  done: "done",
  failed: "failed",
};

/**
 * C-17: what the system is doing after the gate, step by step, from the case's own step records
 * (never a timer). Approve · Seal evidence · Write letter · Verify signature — the letter cites
 * the sealed evidence, which is why the seal comes first.
 */
export function PipelineSteps({ steps, orientation = "vertical" }: { steps: PipelineStep[]; orientation?: "vertical" | "horizontal" }) {
  return (
    <ol
      aria-label="What happens after you approve"
      className={
        orientation === "vertical"
          ? "m-0 list-none space-y-2.5 p-0"
          : "m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0"
      }
    >
      {steps.map((step) => (
        <li key={step.name} className="flex items-center gap-2 text-[13px]">
          <span aria-hidden className={`size-2 shrink-0 rounded-full border ${DOT[step.state]}`} />
          <span className={LABEL[step.state]}>
            {step.label}
            <span className="sr-only"> ({WORD[step.state]})</span>
          </span>
          {step.state === "done" && (
            <span className="font-mono text-[11px] text-muted">
              {step.seconds !== null && step.seconds >= 0.1 ? `${step.seconds.toFixed(1)} s` : "—"}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
