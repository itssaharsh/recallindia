"use client";
import * as React from "react";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import { cn, Dot } from "../ui";
import { fmtInt, fmtTime, minutesBetween, monthLabel } from "./format";
import { EASE_DRAW } from "./motion";
import { SrOnly } from "./primitives";
import { SOURCES } from "./sources";
import type { SourceId } from "./types";

export type FeedLiveState = "loading" | "live" | "stale" | "error";

export interface HeroStatProps {
  state: FeedLiveState;
  /** /v1/stats total */
  total: number | null;
  /** /v1/stats sources_count */
  sourcesCount: number;
  /** /v1/stats last_poll_at */
  lastPollAt: string | null;
  /** last_poll_at + polls_every (15 min) */
  nextPollAt: string | null;
  now: string;
  /** /v1/stats cdsco_latest (390 sub only) */
  latest: { month: string; count: number } | null;
  /** Rounded shares for the mix bar (derive.sourceShares) */
  shares: { source: SourceId; count: number; pct: number }[] | null;
  onSourceClick?: (s: SourceId) => void;
  /** Play the page's load sequence (the number rolls up, the mix bar grows). */
  intro?: boolean;
}

/** Hero number + headline + live line + source mix bar (spec 1.2, 1.3.1). Matches feed-1536.png / feed-390.png. */
export function HeroStat({ state, total, sourcesCount, lastPollAt, nextPollAt, now, latest, shares, onSourceClick, intro = false }: HeroStatProps) {
  const target = total ?? 0;
  const [shown, setShown] = React.useState(intro ? Math.floor(target / 100) * 100 : target);
  React.useEffect(() => setShown(target), [target]);
  const headline = `notices from ${sourcesCount} regulators, in one feed`;

  return (
    <div className="flex min-w-0 flex-col justify-center">
      <LiveLine state={state} lastPollAt={lastPollAt} nextPollAt={nextPollAt} now={now} />
      <h1 className="flex items-end gap-3 lg:gap-[18px]">
        <SrOnly>{total != null ? `${fmtInt(total)} ${headline}` : headline}</SrOnly>
        <span aria-hidden className="font-display text-[66px] leading-[.8] font-extrabold tracking-[-.05em] text-cobalt tabular-nums lg:text-[108px]">
          {state === "loading" || total == null ? (
            <span className="text-line">–,–––</span>
          ) : (
            // NumberFlow pads its box by 0.25em above and below for the roll mask; a 0.8em
            // wrapper with the digits centred gives the same box as line-height .8 in the mockup.
            <span className="inline-flex h-[.8em] items-center">
              <NumberFlow
                value={shown}
                locales="en-IN"
                transformTiming={{ duration: intro ? 600 : 240, easing: "cubic-bezier(.2,.8,.2,1)" }}
                spinTiming={{ duration: intro ? 600 : 240, easing: "cubic-bezier(.2,.8,.2,1)" }}
              />
            </span>
          )}
        </span>
        <span aria-hidden className="max-w-[250px] pb-0 font-display text-[19px] leading-[1.08] font-extrabold tracking-[-.03em] text-ink lg:pb-0.5 lg:text-[30px] lg:leading-[1.02]">
          {headline}
        </span>
      </h1>

      {state === "loading" ? (
        <div className="mt-4 space-y-2" aria-hidden>
          <span className="block h-4 w-[92%] max-w-[520px] rounded-sm bg-surface-2" />
          <span className="block h-4 w-[60%] max-w-[340px] rounded-sm bg-surface-2" />
        </div>
      ) : (
        <>
          <p className="mt-4 hidden max-w-[560px] text-[16px] leading-[1.5] text-ink-muted lg:block">
            Drug-quality failures from CDSCO and recalls from CPSC, NHTSA and openFDA, each one checked against the things in your house.
          </p>
          {latest && (
            <p className="mt-3 text-[14.5px] leading-[1.35] font-semibold tracking-[-.01em] text-ink lg:hidden">
              {fmtInt(latest.count)} drug samples failed CDSCO tests in {monthLabel(latest.month).long}.
            </p>
          )}
        </>
      )}

      {shares && <MixBar shares={shares} onSourceClick={onSourceClick} intro={intro} />}
    </div>
  );
}

function LiveLine({ state, lastPollAt, nextPollAt, now }: Pick<HeroStatProps, "state" | "lastPollAt" | "nextPollAt" | "now">) {
  let dot = "bg-success ring-success-soft";
  let text: React.ReactNode = null;
  if (state === "loading" || !lastPollAt) {
    return <span aria-hidden className="mb-3 block h-[13px] w-56 rounded-sm bg-surface-2" />;
  }
  if (state === "live") text = `Live · last poll ${fmtTime(lastPollAt)} IST${nextPollAt ? ` · next at ${fmtTime(nextPollAt)}` : ""}`;
  if (state === "stale") {
    dot = "bg-warning ring-warning-soft";
    text = `Last poll ${fmtTime(lastPollAt)} IST · ${Math.max(1, minutesBetween(nextPollAt ?? lastPollAt, now))} min late`;
  }
  if (state === "error") {
    dot = "bg-warning ring-warning-soft";
    text = `Can't reach the feed right now · showing the last copy from ${fmtTime(lastPollAt)}`;
  }
  return (
    <p role="status" className="mb-2.5 inline-flex items-center gap-2 text-[13px] leading-none font-medium text-ink-muted lg:mb-3">
      <Dot className={cn("ring-4", dot)} />
      {text}
    </p>
  );
}

/** 10 px bar, segments flex by count (NHTSA ≥ 6 px), legend buttons filter. Hidden at 390 (the tiles carry the counts). */
function MixBar({ shares, onSourceClick, intro }: { shares: NonNullable<HeroStatProps["shares"]>; onSourceClick?: (s: SourceId) => void; intro: boolean }) {
  return (
    <div className="mt-[18px] hidden max-w-[560px] lg:block">
      <div role="img" aria-label="Share of notices by source" className="flex h-2.5 gap-[3px] overflow-hidden rounded-pill">
        {shares.map((s, i) => (
          <motion.i
            key={s.source}
            data-source={s.source}
            className="block bg-src"
            style={{ flexGrow: s.count, flexBasis: 0, minWidth: s.source === "nhtsa" ? 6 : 0, originX: 0 }}
            initial={intro ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.32, ease: EASE_DRAW, delay: 0.1 + i * 0.06 }}
          />
        ))}
      </div>
      <ul className="sr-only">
        {shares.map((s) => (
          <li key={s.source}>{`${SOURCES[s.source].label}: ${fmtInt(s.count)} notices, ${s.pct}%`}</li>
        ))}
      </ul>
      <div className="mt-[9px] flex flex-wrap gap-4" aria-label="Filter by source">
        {shares.map((s) => (
          <button
            key={s.source}
            type="button"
            data-source={s.source}
            onClick={() => onSourceClick?.(s.source)}
            className="inline-flex items-center gap-1.5 rounded-xs text-[12.5px] leading-none font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt pointer-coarse:min-h-11"
          >
            <span aria-hidden className="size-2 rounded-[3px] bg-src" />
            {SOURCES[s.source].label} {s.pct}%
          </button>
        ))}
      </div>
    </div>
  );
}
