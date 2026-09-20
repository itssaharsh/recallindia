"use client";
import * as React from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { Button, cn } from "../ui";
import { sourceShares } from "./derive";
import { FilterBar } from "./FilterBar";
import { fmtTime } from "./format";
import { HeroStat, type FeedLiveState } from "./HeroStat";
import { HouseholdMatchBanner } from "./HouseholdMatchBanner";
import { NoticeList, type LoadMoreState, type NoticeListState } from "./NoticeList";
import { NoticeSheet, type NoticeSheetProps } from "./NoticeSheet";
import { SourceCards } from "./SourceCards";
import type { CdscoMonth, FeedFilters, HouseholdCheck, NoticeGroup, PinnedAlert, SourceId, Stats } from "./types";

export interface FeedViewProps {
  /** Page clock (ISO). Drives "yesterday", "n min late" and the time presets. */
  now: string;
  /** GET /v1/stats; null while loading. */
  stats: Stats | null;
  liveState: FeedLiveState;
  /** last_poll_at + polls_every */
  nextPollAt: string | null;
  /** public/data/cdsco-months.json */
  months: CdscoMonth[] | null;
  /** From the URL (?source=&since=&q=) */
  filters: FeedFilters;
  /** /mine household check; null while it runs. */
  household: HouseholdCheck | null;
  list: {
    state: NoticeListState;
    pinned: PinnedAlert | null;
    groups: NoticeGroup[];
    footer: LoadMoreState;
    /** pks that arrived by a poll after load */
    newPks?: ReadonlySet<string>;
    /** "{n} new notices since {HH:MM} · Show them" */
    newSince?: { count: number; since: string } | null;
  };
  /** The open notice (?notice=pk), or null. */
  sheet: Omit<NoticeSheetProps, "onClose" | "onPrev" | "onNext" | "onRetry" | "household" | "match"> | null;
  /** Play the page's one load sequence (first visit only). */
  intro?: boolean;
  /** Render as the page's `<main>` (default) or a `<div>` when the shell already provides `<main>`. */
  as?: "main" | "div";
  on: {
    filtersChange: (next: FeedFilters) => void;
    openNotice: (pk: string) => void;
    closeSheet: () => void;
    prevNotice?: () => void;
    nextNotice?: () => void;
    loadMore?: () => void;
    showMoreInGroup?: (date: string) => void;
    showAlert?: (month: string) => void;
    showNew?: () => void;
    retry?: () => void;
    retrySheet?: () => void;
  };
}

/**
 * /feed (spec §1). Presentational: the route reads the URL, fetches /v1/stats and
 * /v1/notices, runs the household check and passes the results here.
 * Mockups: feed-1536.png, feed-full-1536.png, feed-sheet-1536.png, feed-390.png.
 */
export function FeedView(p: FeedViewProps) {
  const { stats, filters } = p;
  const latest = stats?.cdsco_latest
    ? { month: stats.cdsco_latest.month, count: stats.cdsco_latest.count }
    : null;
  const counts = stats
    ? { total: stats.total, bySource: Object.fromEntries(stats.sources.map((s) => [s.source, s.count])) as Partial<Record<SourceId, number>> }
    : null;
  const householdPks = React.useMemo(() => new Set(p.household?.matches.map((m) => m.notice.pk) ?? []), [p.household]);
  const selectedPk = p.sheet?.notice?.pk ?? null;
  const setSource = (source: SourceId) => p.on.filtersChange({ ...filters, source: filters.source === source ? null : source });
  const Tag = p.as ?? "main";

  return (
    <MotionConfig reducedMotion="user">
      {/* as="div": the app shell already draws the page gutter and max width on its <main>. */}
      <Tag id={Tag === "main" ? "main" : undefined} className={cn("mx-auto w-full", Tag === "main" && "max-w-[1536px] px-4 lg:px-8")}>
        <section aria-label="Feed summary" className="mt-[18px] grid gap-[18px] lg:mt-[26px] lg:grid-cols-[minmax(0,560fr)_minmax(0,872fr)] lg:gap-10">
          <HeroStat
            state={p.liveState}
            total={stats?.total ?? null}
            sourcesCount={stats?.sources_count ?? 4}
            lastPollAt={stats?.last_poll_at ?? null}
            nextPollAt={p.nextPollAt}
            now={p.now}
            latest={latest}
            shares={stats ? sourceShares(stats) : null}
            onSourceClick={setSource}
            intro={p.intro}
          />
          <SourceCards stats={stats} months={p.months} latest={latest} now={p.now} activeSource={filters.source} onSourceClick={setSource} intro={p.intro} />
        </section>

        <FilterBar filters={filters} counts={counts} now={p.now} onChange={p.on.filtersChange} />

        {p.list.newSince && p.list.newSince.count > 0 && (
          <div className="sticky top-[76px] z-10 mt-3 flex justify-center">
            <Button size="sm" onClick={p.on.showNew} className="shadow-2">
              {p.list.newSince.count} new notices since {fmtTime(p.list.newSince.since)} · Show them
            </Button>
          </div>
        )}

        <HouseholdMatchBanner check={p.household} />

        <NoticeList
          state={p.list.state}
          pinned={p.list.pinned}
          groups={p.list.groups}
          filters={filters}
          footer={p.list.footer}
          selectedPk={selectedPk}
          newPks={p.list.newPks}
          householdPks={householdPks}
          lastPollAt={stats?.last_poll_at ?? null}
          intro={p.intro}
          onOpen={p.on.openNotice}
          onShowAlert={p.on.showAlert}
          onShowMoreInGroup={p.on.showMoreInGroup}
          onLoadMore={p.on.loadMore}
          onClearSearch={() => p.on.filtersChange({ ...filters, q: "" })}
          onAnyTime={() => p.on.filtersChange({ ...filters, since: null })}
          onRetry={p.on.retry}
        />
      </Tag>

      <AnimatePresence>
        {p.sheet && (
          <NoticeSheet
            key="notice-sheet"
            {...p.sheet}
            household={p.household}
            match={p.household?.matches.find((m) => m.notice.pk === selectedPk) ?? null}
            onClose={p.on.closeSheet}
            onPrev={p.on.prevNotice}
            onNext={p.on.nextNotice}
            onRetry={p.on.retrySheet}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
