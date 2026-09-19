"use client";

import { History, Play } from "lucide-react";
import Link from "next/link";
import { memo } from "react";

import { useAppState } from "@/components/shell/app-state";
import { fmtWhen } from "@/lib/format";
import { fmtSeconds, monthLabel, type RunSummary } from "@/lib/ingest";

import { MethodChip } from "./ingest-checklist";

/** The last runs of the IngestStateMachine, each replayable with its real step timings. */
export const RecentRuns = memo(function RecentRuns({
  runs,
  error,
  active,
}: {
  runs: RunSummary[] | null;
  error: string | null;
  active: string | null;
}) {
  const { href } = useAppState();
  return (
    <section aria-labelledby="runs-title" className="flex flex-col gap-2">
      <h2 id="runs-title" className="m-0 flex items-center gap-2 text-sm font-medium text-text">
        <History aria-hidden className="size-4 text-muted" /> Recent runs
      </h2>
      {error && <p className="m-0 text-xs text-alert">Could not list runs: {error}</p>}
      {!error && runs === null && (
        <ul aria-hidden className="m-0 list-none p-0">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="h-9 border-b border-line bg-surface-1" />
          ))}
        </ul>
      )}
      {runs && runs.length === 0 && (
        <p className="m-0 text-xs text-muted">No runs yet: &ldquo;Run ingest&rdquo; starts the first one.</p>
      )}
      {runs && runs.length > 0 && (
        <ul className="m-0 list-none border-t border-line p-0">
          {runs.map((r) => (
            <li
              key={r.run_id}
              className={`grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-2 text-xs sm:grid-cols-[13rem_7rem_6rem_minmax(0,1fr)_auto] ${
                r.run_id === active ? "bg-surface-2" : ""
              }`}
            >
              <span className="truncate font-mono text-muted">{r.run_id}</span>
              <span className="hidden text-text sm:block">{monthLabel(r.month) || "—"}</span>
              <span className="hidden sm:block">
                {r.method ? <MethodChip method={r.method} /> : <span className="text-muted">—</span>}
              </span>
              <span className="hidden truncate text-muted sm:block">
                {r.rows_in ?? "—"} rows → {r.notices_out ?? "—"} notices · {r.new ?? "—"} new · {fmtSeconds(r.duration_ms) || "—"}{" "}
                · {fmtWhen(r.started_at)}
                {r.status !== "SUCCEEDED" ? ` · ${r.status.toLowerCase()}` : ""}
              </span>
              {r.status === "SUCCEEDED" || r.status === "FAILED" ? (
                <Link
                  prefetch={false}
                  href={href(`/ingest/?replay=${encodeURIComponent(r.run_id)}`)}
                  className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-primary-strong hover:bg-surface-2"
                >
                  <Play aria-hidden className="size-3.5" /> Replay
                </Link>
              ) : (
                <span className="px-2 text-muted">{r.status.toLowerCase()}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});
