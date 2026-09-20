"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { Card, cn } from "../ui";
import { dayRelation, fmtInt, fmtTime, fmtWhen, monthLabel } from "./format";
import { springSoft } from "./motion";
import { CapsLabel, HealthDot, healthText, healthWord, ObjectTile, Skeleton } from "./primitives";
import { SOURCE_ORDER, SOURCES, US_SOURCES } from "./sources";
import type { CdscoMonth, SourceHealth, SourceId, SourceStats, Stats } from "./types";

export interface SourceCardsProps {
  /** /v1/stats (null while loading) */
  stats: Stats | null;
  /** public/data/cdsco-months.json, oldest first. null or [] → the "no months" card. */
  months: CdscoMonth[] | null;
  /** /v1/stats cdsco_latest (or pollers[cdsco_portal].last_counts.fetched + latest month) */
  latest: { month: string; count: number } | null;
  now: string;
  activeSource: SourceId | null;
  onSourceClick?: (s: SourceId) => void;
  intro?: boolean;
}

const pollsWord = (every: string) => (/^1 ?day|daily/i.test(every) ? "daily" : `every ${every}`);

/**
 * Two different cards at 1536 (CDSCO feature card with monthly bars + US regulators list),
 * a 2 × 2 grid of tiles at 390 (spec 1.3). Matches feed-1536.png and feed-390.png.
 */
export function SourceCards(props: SourceCardsProps) {
  return (
    <>
      <div className="hidden grid-cols-2 gap-3.5 lg:grid">
        <CdscoCard {...props} />
        <UsCard {...props} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:hidden">
        {SOURCE_ORDER.map((id) => (
          <SourceTile key={id} id={id} s={props.stats?.sources.find((x) => x.source === id) ?? null} {...props} />
        ))}
      </div>
    </>
  );
}

function HealthLine({ s, now }: { s: SourceStats; now: string }) {
  const every = pollsWord(s.polls_every);
  const word = healthWord(s.health);
  const detail =
    s.health === "down"
      ? `since ${fmtTime(s.last_run_at ?? now)} · retrying ${every}`
      : s.health === "healthy"
        ? `· polled ${s.last_success_at ? fmtWhen(s.last_success_at, now) : "—"} · ${every}`
        : `· last success ${s.last_success_at ? fmtTime(s.last_success_at) : "—"} · ${every}`;
  return (
    <p className="inline-flex items-center gap-[7px] text-[13px] leading-[1.3] font-medium text-ink-muted">
      <HealthDot health={s.health} />
      <b className={cn("font-semibold", healthText(s.health))}>{word}</b>
      <span>{detail}</span>
    </p>
  );
}

function CdscoCard({ stats, months, latest, now, intro }: SourceCardsProps) {
  const s = stats?.sources.find((x) => x.source === "cdsco_nsq") ?? null;
  const hasMonths = !!months && months.length > 0;
  return (
    <Card as="article" data-source="cdsco_nsq" className="flex flex-col gap-3.5 overflow-hidden px-[18px] py-4" aria-label="CDSCO">
      <div className="flex items-center gap-3.5">
        <ObjectTile name="strip" source="cdsco_nsq" size={60} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <b className="font-display text-[20px] leading-[1.1] font-extrabold tracking-[-.02em] text-ink">CDSCO</b>
          <span className="text-[13px] leading-[1.3] text-ink-muted">{SOURCES.cdsco_nsq.coverage}</span>
        </div>
        {s ? (
          <span className="font-display text-[44px] leading-none font-extrabold tracking-[-.04em] text-src-ink tabular-nums">{fmtInt(s.count)}</span>
        ) : (
          <Skeleton className="h-10 w-28" />
        )}
      </div>
      {stats == null ? (
        <MonthlyBarsSkeleton />
      ) : hasMonths && latest ? (
        <MonthlyBars months={months!} latest={latest} intro={!!intro} />
      ) : null}
      {s && <HealthLine s={s} now={now} />}
    </Card>
  );
}

function MonthlyBarsSkeleton() {
  return (
    <div aria-hidden className="flex h-[98px] items-end gap-[5px] rounded-[10px] bg-src-bg px-3.5 pt-3 pb-2.5">
      {Array.from({ length: 11 }, (_, i) => (
        <span key={i} className="h-[30%] flex-1 animate-row-pulse rounded-[4px_4px_2px_2px] bg-bar-past" />
      ))}
    </div>
  );
}

/** 11 monthly bars, latest in cobalt; the big number on the left names it (no value label on the bar). */
function MonthlyBars({ months, latest, intro }: { months: CdscoMonth[]; latest: { month: string; count: number }; intro: boolean }) {
  const max = Math.max(...months.map((m) => m.count), 1);
  const first = monthLabel(months[0].month);
  const last = monthLabel(months[months.length - 1].month);
  const lastIndex = months.length - 1;
  return (
    <>
      <div
        role="img"
        aria-label={`Drug samples failed per CDSCO monthly alert, ${first.long.replace(/^(\w{3})\w*/, "$1")} to ${last.long.replace(/^(\w{3})\w*/, "$1")}`}
        className="grid grid-cols-[auto_1fr] items-end gap-[18px] rounded-[10px] bg-src-bg px-3.5 pt-3 pb-2.5"
      >
        <div className="flex flex-col gap-1.5 pb-[18px]">
          <CapsLabel className="leading-[1.1] text-cobalt-caption">
            Failed in the
            <br />
            {latest.month} alert
          </CapsLabel>
          <motion.span
            className="font-display text-[34px] leading-none font-extrabold tracking-[-.03em] text-cobalt tabular-nums"
            initial={intro ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16, delay: 0.2 + lastIndex * 0.03 + 0.12 }}
          >
            {fmtInt(latest.count)}
          </motion.span>
        </div>
        <div>
          <div className="flex h-16 items-end gap-[5px]">
            {months.map((m, i) => (
              <motion.span
                key={m.month}
                className={cn("block min-h-1 flex-1 rounded-[4px_4px_2px_2px]", i === lastIndex ? "bg-cobalt" : "bg-bar-past")}
                style={{ height: `${(m.count / max) * 100}%`, originY: 1 }}
                initial={intro ? { scaleY: 0 } : false}
                animate={{ scaleY: 1 }}
                transition={{ ...springSoft, delay: 0.2 + i * 0.03 }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10.5px] leading-none font-semibold tracking-[.05em] text-cobalt-caption">
            <span>{first.short}</span>
            <span>{last.short}</span>
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>Drug samples failed per CDSCO monthly alert</caption>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month).long}</th>
              <td>{m.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const rowButton =
  "rounded-sm text-left transition-colors duration-150 hover:bg-wash focus-visible:shadow-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-cobalt";

function UsCard({ stats, now, activeSource, onSourceClick }: SourceCardsProps) {
  const every = stats?.sources.find((x) => x.source === "cpsc")?.polls_every ?? "15 min";
  return (
    <Card as="article" className="flex flex-col justify-between px-4 pt-3 pb-1.5" aria-label="US regulators">
      <CapsLabel className="mb-1 pt-1 pb-1.5 text-[12px] tracking-[.05em]">US regulators · polled {pollsWord(every)}</CapsLabel>
      {US_SOURCES.map((id, i) => {
        const s = stats?.sources.find((x) => x.source === id) ?? null;
        return (
          <button
            key={id}
            type="button"
            data-source={id}
            aria-pressed={activeSource === id}
            onClick={() => onSourceClick?.(id)}
            className={cn("grid min-h-11 flex-1 grid-cols-[44px_1fr_auto_76px] items-center gap-3 py-2", i > 0 && "border-t border-line", rowButton, activeSource === id && "bg-cobalt-wash")}
          >
            <ObjectTile name={SOURCES[id].cardIllustration} source={id} size={44} />
            <span className="flex min-w-0 flex-col gap-[3px]">
              <b className="font-display text-[17px] leading-[1.1] font-extrabold tracking-[-.02em] text-ink">{SOURCES[id].label}</b>
              <span className="truncate text-[13px] leading-[1.3] text-ink-muted">{SOURCES[id].coverage}</span>
            </span>
            {s ? (
              <span className="inline-flex items-center gap-[7px] text-[13px] font-medium text-ink-muted">
                <HealthDot health={s.health} />
                {s.last_success_at ? fmtWhen(s.last_success_at, now) : "—"}
                <span className="sr-only">{healthWord(s.health)}</span>
              </span>
            ) : (
              <Skeleton className="h-3 w-12" />
            )}
            <span className="text-right font-display text-[26px] leading-none font-extrabold tracking-[-.03em] text-src-ink tabular-nums">
              {s ? fmtInt(s.count) : ""}
            </span>
          </button>
        );
      })}
    </Card>
  );
}

/** 390: one 174 × 84 tile per source (name, count, health dot + time). CDSCO says "Yesterday", not a bare 23:54. */
function SourceTile({ id, s, now, activeSource, onSourceClick }: SourceCardsProps & { id: SourceId; s: SourceStats | null }) {
  const when = s?.last_success_at
    ? dayRelation(s.last_success_at, now) === "today"
      ? fmtTime(s.last_success_at)
      : dayRelation(s.last_success_at, now) === "yesterday"
        ? "Yesterday"
        : fmtWhen(s.last_success_at, now)
    : "—";
  return (
    <button
      type="button"
      data-source={id}
      aria-pressed={activeSource === id}
      onClick={() => onSourceClick?.(id)}
      className={cn(
        "grid min-h-[84px] grid-cols-[30px_1fr] items-center gap-x-2.5 gap-y-2 rounded-md border border-line bg-surface-1 px-3 py-2.5 shadow-1",
        rowButton,
        activeSource === id && "border-cobalt",
      )}
    >
      <ObjectTile name={SOURCES[id].cardIllustration} source={id} size={30} />
      <b className="font-display text-[15px] leading-[1.1] font-extrabold tracking-[-.02em] text-ink">{SOURCES[id].label}</b>
      <span className="col-span-2 flex items-center justify-between gap-2">
        <span className="font-display text-[24px] leading-none font-extrabold tracking-[-.03em] text-src-ink tabular-nums">{s ? fmtInt(s.count) : "–"}</span>
        {s && (
          <span className="inline-flex items-center gap-[7px] text-[12px] font-medium text-ink-muted">
            <HealthDot health={s.health as SourceHealth} />
            {when}
          </span>
        )}
      </span>
    </button>
  );
}
