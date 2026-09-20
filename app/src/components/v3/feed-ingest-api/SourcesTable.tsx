"use client";
import * as React from "react";
import { Button, cn } from "../ui";
import { fmtInt, fmtTime, fmtWhen } from "./format";
import { HealthDot, healthText, healthWord, IdChip, ObjectTile, Skeleton } from "./primitives";
import { SOURCE_ORDER, SOURCES } from "./sources";
import type { Stats } from "./types";

export interface SourcesTableProps {
  /** GET /v1/stats */
  stats: Stats | null;
  state: "loading" | "ready" | "error";
  now: string;
  onRetry?: () => void;
}

const everyLabel = (s: string) => (/^1 ?day|daily/i.test(s) ? "Daily" : s);

/** Sources with counts and poller health from /v1/stats (spec 3.5). 336 px card at 1536, peeking at 790. */
export function SourcesTable({ stats, state, now, onRetry }: SourcesTableProps) {
  const th = "border-b border-line px-1.5 py-2.5 text-left text-[12px] leading-none font-semibold tracking-[.05em] text-ink-muted uppercase lg:px-3";
  const td = "border-b border-line px-1.5 py-2.5 group-last:border-b-0 lg:px-3";
  return (
    <section aria-labelledby="api-sources" className="mt-5 mb-10 rounded-md border border-line bg-surface-1 px-3 pt-3.5 pb-1 shadow-1 lg:rounded-lg lg:px-5 lg:pt-[18px] lg:pb-2">
      <header className="flex flex-col gap-1.5 lg:flex-row lg:items-baseline lg:gap-3.5">
        <h2 id="api-sources" className="font-display text-[20px] leading-none font-extrabold tracking-[-.02em] text-ink">
          Sources
        </h2>
        {stats && (
          <span className="text-[14px] leading-none text-ink-muted">
            From <span className="font-mono">/v1/stats</span> · {fmtInt(stats.total)} notices · checked {fmtTime(stats.generated_at)} IST
          </span>
        )}
      </header>
      {state === "error" ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[15px] text-ink">
            Couldn't read <span className="font-mono">/v1/stats</span>.
          </p>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : (
        <table className="mt-3 w-full border-collapse text-[14.5px] leading-[1.3]">
          <thead>
            <tr>
              <th scope="col" className={th}>Source</th>
              <th scope="col" className={cn(th, "max-lg:hidden")}>id</th>
              <th scope="col" className={cn(th, "text-right")}>Notices</th>
              <th scope="col" className={cn(th, "max-lg:hidden")}>Polled every</th>
              <th scope="col" className={th}>Health</th>
              <th scope="col" className={cn(th, "max-lg:hidden")}>Last success</th>
            </tr>
          </thead>
          <tbody>
            {state === "loading" || !stats
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="group">
                    <td className={td} colSpan={6}>
                      <Skeleton className="h-10" />
                    </td>
                  </tr>
                ))
              : SOURCE_ORDER.map((id) => {
                  const s = stats.sources.find((x) => x.source === id);
                  if (!s) return null;
                  const down = s.health === "down";
                  return (
                    <tr key={id} data-source={id} className="group">
                      <td className={td}>
                        <div className="flex items-center gap-3">
                          <ObjectTile name={SOURCES[id].cardIllustration} source={id} size={40} />
                          <div className="min-w-0">
                            <b className="block text-[15px] leading-[1.2] font-bold text-ink">{SOURCES[id].label}</b>
                            <span className="text-[13px] text-ink-muted max-lg:hidden">{SOURCES[id].tableCoverage}</span>
                          </div>
                        </div>
                      </td>
                      <td className={cn(td, "max-lg:hidden")}>
                        <IdChip>{id}</IdChip>
                      </td>
                      <td className={cn(td, "text-right font-display text-[20px] leading-none font-extrabold text-src-ink tabular-nums")}>{fmtInt(s.count)}</td>
                      <td className={cn(td, "max-lg:hidden")}>{everyLabel(s.polls_every)}</td>
                      <td className={td}>
                        <span className={cn("inline-flex items-center gap-[7px] text-[13px] font-medium", down ? "text-danger" : "text-ink-muted")}>
                          <HealthDot health={s.health} />
                          <b className={cn("font-semibold", healthText(s.health))}>{healthWord(s.health)}</b>
                          {down && s.last_run_at && <span>since {fmtTime(s.last_run_at)}</span>}
                        </span>
                      </td>
                      <td className={cn(td, "max-lg:hidden", down && "text-danger")}>{s.last_success_at ? fmtWhen(s.last_success_at, now) : "—"}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      )}
    </section>
  );
}
