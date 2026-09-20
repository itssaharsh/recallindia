"use client";

import { fmtCount, fmtTime } from "@/lib/format";

import { useAppState } from "./app-state";
import { HouseholdPill } from "./household-pill";

/** The live counter: "N notices · S sources · last poll hh:mm:ss", tabular numerals throughout. */
export function TopBar() {
  const { stats, statsError, demo } = useAppState();

  return (
    <header className="flex min-h-14 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line bg-surface-0 px-5 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1" aria-live="polite">
        {stats ? (
          <>
            {/* each figure stays on one line with its label; the groups wrap on a phone */}
            <span className="whitespace-nowrap">
              <span className="font-display text-2xl leading-none font-semibold text-text">{fmtCount(stats.total)}</span>{" "}
              <span className="text-sm text-muted">notices</span>
            </span>
            <span aria-hidden className="text-muted">
              ·
            </span>
            <span className="text-sm whitespace-nowrap">
              <span className="text-text">{stats.sources_count}</span> <span className="text-muted">sources</span>
            </span>
            <span aria-hidden className="text-muted">
              ·
            </span>
            <span className="text-sm whitespace-nowrap">
              <span className="text-muted">last poll</span> <span className="font-mono text-text">{fmtTime(stats.last_poll_at)}</span>
            </span>
          </>
        ) : statsError ? (
          <span className="text-sm text-muted">Counts unavailable: {statsError}</span>
        ) : (
          <span className="inline-block h-6 w-72 bg-surface-2" aria-label="Loading counts" />
        )}
      </p>
      <div className="ml-auto flex items-center gap-2">
        {demo && (
          <span className="rounded-sm border border-line px-2 py-0.5 font-mono text-[11px] tracking-wider text-muted uppercase">
            Demo data · read-only
          </span>
        )}
        <HouseholdPill />
      </div>
    </header>
  );
}
