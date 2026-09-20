"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Card, cn } from "../ui";
import type { StepFrame } from "./ingestTimeline";
import type { IngestStepKey } from "./types";

export interface StepChecklistProps {
  steps: StepFrame[];
  onRetry?: (step: IngestStepKey) => void;
}

/**
 * Fetch PDF · Extract tables · Normalise · Diff vs last run · Publish (spec 2.3).
 * 58 px card at 1536; discs and connectors only at 390, plus a caption line.
 */
export function StepChecklist({ steps, onRetry }: StepChecklistProps) {
  const currentIndex = Math.max(0, steps.findIndex((s) => s.status === "running" || s.status === "failed"));
  const current = steps.find((s) => s.status === "running" || s.status === "failed") ?? steps[steps.length - 1];
  const k = steps.every((s) => s.status === "done") ? steps.length : currentIndex + 1;

  const [announcement, setAnnouncement] = React.useState("");
  const doneKey = steps.map((s) => s.status).join();
  React.useEffect(() => {
    const last = [...steps].reverse().find((s) => s.announce);
    if (last) setAnnouncement(last.announce);
    // announce once per status change, not per frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  return (
    <>
      <Card className="mt-3.5 px-3.5 py-3 lg:mt-4 lg:px-[18px]">
        <ol aria-label={`Ingest progress: step ${k} of ${steps.length}`} className="flex items-center">
          {steps.map((s, i) => (
            <React.Fragment key={s.key}>
              <li aria-current={s.status === "running" ? "step" : undefined} className="flex shrink-0 items-center gap-[11px]">
                <Disc step={s} n={i + 1} />
                <span className="hidden flex-col gap-1 lg:flex">
                  <b className={cn("text-[14.5px] leading-none", s.status === "pending" ? "font-medium text-ink-muted" : s.status === "running" ? "font-semibold text-cobalt" : "font-semibold text-ink")}>
                    {s.label}
                  </b>
                  <motion.span
                    key={s.status}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.16 }}
                    className={cn("text-[13px] leading-none whitespace-nowrap", s.status === "running" ? "text-cobalt" : s.status === "failed" ? "text-danger" : "text-ink-muted")}
                  >
                    {s.sub}
                    {s.status === "failed" && onRetry && (
                      <button type="button" onClick={() => onRetry(s.key)} className="ml-2 font-semibold text-cobalt underline-offset-2 hover:underline">
                        Retry step
                      </button>
                    )}
                  </motion.span>
                </span>
              </li>
              {i < steps.length - 1 && (
                <li aria-hidden className="relative mx-1.5 h-0.5 min-w-2 flex-1 overflow-hidden rounded-[2px] bg-line lg:mx-3.5 lg:min-w-5">
                  <span className="absolute inset-0 block origin-left bg-success" style={{ transform: `scaleX(${s.connector})` }} />
                </li>
              )}
            </React.Fragment>
          ))}
        </ol>
      </Card>
      <p className="mt-2 px-0.5 text-[13.5px] leading-[1.3] text-ink-muted lg:hidden">
        <b className="font-semibold text-cobalt">
          Step {Math.min(k, steps.length)} of {steps.length} · {current.label}
        </b>{" "}
        · {current.sub}
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

function Disc({ step, n }: { step: StepFrame; n: number }) {
  const base = "relative grid size-[30px] shrink-0 place-items-center rounded-full text-[13px] leading-none font-bold lg:size-8";
  if (step.status === "done")
    return (
      <span className={cn(base, "bg-success text-white")} style={{ transform: `scale(${0.6 + 0.4 * step.pop})` }}>
        <Check aria-hidden className="size-4" strokeWidth={3} />
        <span className="sr-only">done</span>
      </span>
    );
  if (step.status === "running")
    return (
      <span className={cn(base, "bg-cobalt-soft")}>
        <i aria-hidden className="absolute inset-1 animate-ring rounded-full border-[3px] border-cobalt border-r-transparent motion-safe:border-b-transparent" />
        <span className="sr-only">running</span>
      </span>
    );
  if (step.status === "failed")
    return (
      <span className={cn(base, "bg-danger text-white")}>
        !<span className="sr-only">stopped</span>
      </span>
    );
  return <span className={cn(base, "text-ink-muted shadow-[inset_0_0_0_2px_var(--color-line)]")}>{n}</span>;
}
