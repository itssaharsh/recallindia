"use client";
import * as React from "react";
import { Button, Card, cn } from "../ui";
import { groupSubline } from "./derive";
import { fmtDate, fmtDayMonth, fmtDayMonthTime, fmtInt, fmtTime, fmtWeekdayDate } from "./format";
import { isTyping } from "./hooks";
import { NoticeRow, NoticeRowSkeleton } from "./NoticeRow";
import { ObjectTile } from "./primitives";
import { SOURCES } from "./sources";
import type { FeedFilters, NoticeGroup, PinnedAlert } from "./types";

export type NoticeListState = "loading" | "ready" | "empty" | "error";

export interface LoadMoreState {
  /** Rows on the page now */
  shown: number;
  /** /v1/stats total (or the filtered total when the API gives one) */
  total: number;
  /** idle: next_cursor present · loading: fetching · end: next_cursor null */
  state: "idle" | "loading" | "end";
}

export interface NoticeListProps {
  state: NoticeListState;
  /** Latest CDSCO alert, pinned first (hidden when another source is selected). */
  pinned: PinnedAlert | null;
  groups: NoticeGroup[];
  filters: FeedFilters;
  footer: LoadMoreState;
  selectedPk?: string | null;
  /** Rows that arrived by a poll after load */
  newPks?: ReadonlySet<string>;
  /** Notices that match a household thing */
  householdPks?: ReadonlySet<string>;
  /** For the error copy: /v1/stats last_poll_at */
  lastPollAt?: string | null;
  intro?: boolean;
  onOpen?: (pk: string) => void;
  /** "Show all 239 rows": ?source=cdsco_nsq&month=JUL-2026 */
  onShowAlert?: (month: string) => void;
  onShowMoreInGroup?: (date: string) => void;
  onLoadMore?: () => void;
  onClearSearch?: () => void;
  onAnyTime?: () => void;
  onRetry?: () => void;
}

/**
 * The notices card: pinned CDSCO alert → date groups → load more (spec 1.6).
 * `j`/`k` move between rows, Enter opens the sheet.
 */
export function NoticeList(p: NoticeListProps) {
  const showPinned = !!p.pinned && (p.filters.source == null || p.filters.source === "cdsco_nsq") && p.state === "ready";
  let introIndex = 0;
  const nextIntro = () => (p.intro ? introIndex++ : null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key !== "j" && e.key !== "k") || isTyping(e) || e.metaKey || e.ctrlKey) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-notice-row]")];
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "j" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    e.preventDefault();
    rows[next]?.focus();
  };

  return (
    <Card className="mt-3.5 mb-10 overflow-hidden lg:mt-4" onKeyDown={onKeyDown}>
      {p.state === "loading" && (
        <ul aria-label="Loading notices" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <NoticeRowSkeleton key={i} />
          ))}
        </ul>
      )}

      {p.state === "error" && (
        <EmptyPanel
          text={`The feed didn't load.${p.lastPollAt ? ` The last poll finished at ${fmtTime(p.lastPollAt)} IST.` : ""}`}
          action={<Button onClick={p.onRetry}>Try again</Button>}
        />
      )}

      {p.state === "empty" &&
        (p.filters.q ? (
          <EmptyPanel
            text={`No notices match “${p.filters.q}” in ${p.filters.source ? SOURCES[p.filters.source].label : "the feed"}.`}
            action={<Button variant="secondary" onClick={p.onClearSearch}>Clear the search</Button>}
          />
        ) : (
          <EmptyPanel
            text={p.filters.since ? `Nothing published since ${fmtDayMonth(p.filters.since)}.` : "No notices yet."}
            action={p.filters.since ? <Button variant="secondary" onClick={p.onAnyTime}>Show any time</Button> : undefined}
          />
        ))}

      {p.state === "ready" && (
        <>
          {showPinned && p.pinned && (
            <section aria-label={`Latest CDSCO alert: ${p.pinned.month}`} data-source="cdsco_nsq">
              <header className="flex items-start gap-3.5 bg-src-bg px-4 py-3 lg:items-center lg:px-5">
                <ObjectTile name="doc" source="cdsco_nsq" size={44} surface="white" sizeClass="size-10 lg:size-11" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 className="font-display text-[16px] leading-[1.1] font-bold tracking-[-.01em] text-ink lg:text-[17px]">Latest CDSCO alert: {p.pinned.month}</h2>
                  <p className="text-[13px] leading-[1.3] text-ink-on-tint lg:text-[13.5px]">
                    Published {fmtDate(p.pinned.published_at)} · in the feed since {fmtDayMonthTime(p.pinned.first_seen_at)} IST
                  </p>
                </div>
                <Button variant="secondary" size="sm" className="max-lg:hidden" onClick={() => p.onShowAlert?.(p.pinned!.month)}>
                  Show all {fmtInt(p.pinned.count)} rows
                </Button>
              </header>
              <ul>
                {p.pinned.notices.map((n) => (
                  <NoticeRow
                    key={n.pk}
                    notice={n}
                    selected={p.selectedPk === n.pk}
                    isNew={p.newPks?.has(n.pk)}
                    inHousehold={p.householdPks?.has(n.pk)}
                    onOpen={p.onOpen}
                    introIndex={nextIntro()}
                  />
                ))}
              </ul>
            </section>
          )}

          {p.groups.map((g, gi) => (
            <DateGroup key={g.date} group={g} first={gi === 0 && !showPinned} {...p} nextIntro={nextIntro} />
          ))}

          <LoadMore footer={p.footer} onLoadMore={p.onLoadMore} />
        </>
      )}
    </Card>
  );
}

function DateGroup({ group: g, first, nextIntro, ...p }: NoticeListProps & { group: NoticeGroup; first: boolean; nextIntro: () => number | null }) {
  const title = fmtWeekdayDate(g.date);
  const hidden = g.loaded - g.notices.length;
  return (
    <section aria-label={title}>
      <header className={cn("flex h-[42px] items-center gap-3 border-b border-line bg-wash px-4 text-[13px] leading-none text-ink-muted lg:h-[46px] lg:px-5 lg:text-[14px]", !first && "border-t")}>
        <h2 className="font-sans text-[13px] leading-none font-semibold tracking-normal text-ink lg:text-[14px]">{title}</h2>
        <span className="truncate">{groupSubline(g)}</span>
        <span className="flex-1" />
        <span className="text-[13px] max-lg:hidden">
          Showing {g.notices.length} of {g.loaded}
        </span>
      </header>
      <ul>
        {g.notices.map((n) => (
          <NoticeRow
            key={n.pk}
            notice={n}
            selected={p.selectedPk === n.pk}
            isNew={p.newPks?.has(n.pk)}
            inHousehold={p.householdPks?.has(n.pk)}
            onOpen={p.onOpen}
            introIndex={nextIntro()}
          />
        ))}
        {hidden > 0 && p.onShowMoreInGroup && (
          <li className="border-b border-line">
            <button
              type="button"
              onClick={() => p.onShowMoreInGroup?.(g.date)}
              className="h-11 w-full px-4 text-left text-[14px] font-semibold text-cobalt hover:bg-wash focus-visible:outline-[3px] focus-visible:-outline-offset-2 focus-visible:outline-cobalt lg:px-5"
            >
              Show {hidden} more from {fmtDayMonth(g.date)}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** 68 px footer on the wash: "Load 50 older notices" · "Showing {k} of {total} · newest first" (spec 1.6.5). */
function LoadMore({ footer, onLoadMore }: { footer: LoadMoreState; onLoadMore?: () => void }) {
  return (
    <footer className="flex flex-col items-stretch gap-3 border-t border-line bg-wash px-4 py-4 text-center lg:flex-row lg:items-center lg:gap-4 lg:px-5 lg:text-left">
      {footer.state === "end" ? (
        <span className="text-[14px] leading-none text-ink-muted">That's every notice. {fmtInt(footer.total)} in all.</span>
      ) : (
        <>
          <Button variant="secondary" loading={footer.state === "loading"} disabled={footer.state === "loading"} onClick={onLoadMore}>
            {footer.state === "loading" ? "Loading…" : "Load 50 older notices"}
          </Button>
          <span className="text-[14px] leading-none text-ink-muted">
            Showing {fmtInt(footer.shown)} of {fmtInt(footer.total)} · newest first
          </span>
        </>
      )}
    </footer>
  );
}

function EmptyPanel({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <ObjectTile name="doc" source="cdsco_nsq" size={64} />
      <p className="max-w-[440px] text-[16px] leading-[1.5] text-ink">{text}</p>
      {action}
    </div>
  );
}
