import * as React from "react";
import { cn } from "./cn";

export type ChipTone = "alert" | "clear" | "hold" | "info" | "neutral" | "onBlue";
const tones: Record<ChipTone, string> = {
  alert: "bg-danger-soft text-danger",
  clear: "bg-success-soft text-success",
  hold: "bg-warning-soft text-warning",
  info: "bg-cobalt-soft text-cobalt",
  neutral: "bg-surface-2 text-ink-muted",
  onBlue: "bg-white/15 text-on-cobalt",
};
/** Status chip, 26px pill. Red (`alert`) only when something the user owns is affected, or a source is down. */
export function Chip({ tone = "neutral", dot = false, pulse = false, className, children }: { tone?: ChipTone; dot?: boolean; pulse?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-[26px] items-center gap-1.5 rounded-pill px-2.5 text-chip font-sans", tones[tone], className)}>
      {dot && <Dot pulse={pulse} className="bg-current" />}
      {children}
    </span>
  );
}

/** 8px status dot. `pulse` only for live or waiting states; static under reduced motion. */
export function Dot({ pulse = false, className }: { pulse?: boolean; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", pulse && "motion-safe:animate-pulse", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-[6px] bg-surface-2 px-1.5 py-1 font-mono text-[12px] leading-none text-ink-muted">{children}</kbd>;
}
