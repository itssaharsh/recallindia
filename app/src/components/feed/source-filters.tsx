"use client";

import { fmtCount, fmtWhen } from "@/lib/format";
import type { Health, SourceStat, Stats } from "@/lib/types";

const DOT: Record<Health, string> = { healthy: "bg-clear", degraded: "bg-hold", down: "bg-alert" };

function healthText(s: SourceStat): string {
  if (s.health === "healthy") return `healthy, last success ${fmtWhen(s.last_success_at)}`;
  if (s.health === "degraded") return `degraded, last success ${fmtWhen(s.last_success_at)}`;
  return s.last_run_at ? "down, no successful poll yet" : "down, never polled";
}

/**
 * Source filter chips that also carry each poller's health (DESIGN colour law: clear = healthy,
 * hold = degraded, alert = down). A degraded or down source says so in words, not only colour.
 */
export function SourceFilters({
  stats,
  value,
  onChange,
}: {
  stats: Stats | null;
  value: string | null;
  onChange: (source: string | null) => void;
}) {
  const chip = (on: boolean) =>
    `inline-flex h-8 items-center gap-2 rounded-sm border px-2.5 text-[13px] transition-colors ${
      on ? "border-primary-strong bg-surface-3 text-text" : "border-line text-muted hover:bg-surface-2 hover:text-text"
    }`;
  return (
    <div role="group" aria-label="Filter by source" className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chip(value === null)}>
        All
        {stats && <span className="font-mono text-xs text-muted">{fmtCount(stats.total)}</span>}
      </button>
      {stats?.sources.map((s) => (
        <button
          key={s.source}
          type="button"
          aria-pressed={value === s.source}
          onClick={() => onChange(value === s.source ? null : s.source)}
          className={chip(value === s.source)}
          title={healthText(s)}
        >
          <span aria-hidden className={`size-2 rounded-full ${DOT[s.health]}`} />
          <span>{s.label}</span>
          <span className="font-mono text-xs text-muted">{fmtCount(s.count)}</span>
          <span className={s.health === "healthy" ? "sr-only" : "text-xs text-hold"}>{healthText(s)}</span>
        </button>
      ))}
    </div>
  );
}
