"use client";

import { CloudOff, FilterX, Inbox } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import Link from "next/link";

import { useAppState } from "@/components/shell/app-state";
import { Button } from "@/components/ui/button";
import { apiGet, apiHost, query } from "@/lib/api";
import { fmtCount, fmtWhen, sourceLabel } from "@/lib/format";
import type { Notice, NoticesPage } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

import { FeedRow, FeedRowSkeleton } from "./feed-row";
import { NoticeSheet } from "./notice-sheet";
import { SourceFilters } from "./source-filters";

const PAGE = 50;
const POLL_MS = 15_000;

type Load = "loading" | "ready" | "error";

const newestFirst = (a: Notice, b: Notice) =>
  a.published_at === b.published_at ? (a.pk < b.pk ? 1 : -1) : a.published_at < b.published_at ? 1 : -1;

export function FeedView() {
  const { demo, ready, stats } = useAppState();
  const [source, setSource] = useState<string | null>(null);
  const [rows, setRows] = useState<Notice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>("loading");
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<Notice | null>(null);
  const fresh = useRef<Set<string>>(new Set());
  // ?replay=poll (no flag needed): hold the newest 3 rows back for a beat, then land them the
  // way a real poll does. It makes the feed's one live moment recordable on demand.
  const [replaying, setReplaying] = useState<string | null>(null);
  const replayed = useRef(false);
  const seen = useRef<Set<string>>(new Set());

  // ?source=cdsco_nsq deep link (static export: read on the client)
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("source");
    if (s) setSource(s);
  }, []);

  const firstPage = useCallback(
    async (signal?: AbortSignal) => {
      const page = await apiGet<NoticesPage>(`/v1/notices${query({ source, limit: PAGE })}`, demo, signal);
      return page;
    },
    [source, demo],
  );

  // (re)load page 1 when the filter or mode changes
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoad("loading");
    fresh.current = new Set();
    firstPage(controller.signal)
      .then((page) => {
        seen.current = new Set(page.notices.map((n) => n.pk));
        setRows(page.notices);
        setCursor(page.next_cursor);
        setLoad("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoad("error");
      });
    return () => controller.abort();
  }, [firstPage, ready]);

  // live poll: rows not seen before are placed in date order and snap in; nothing else moves
  usePoll(
    async (signal) => {
      const page = await firstPage(signal);
      const arrivals = page.notices.filter((n) => !seen.current.has(n.pk));
      if (!arrivals.length) return;
      arrivals.forEach((n) => {
        seen.current.add(n.pk);
        fresh.current.add(n.pk);
      });
      setRows((prev) => [...arrivals, ...prev].sort(newestFirst));
    },
    POLL_MS,
    ready && load === "ready",
  );

  // the replay runs once, after the first page is on screen
  useEffect(() => {
    if (load !== "ready" || replayed.current) return;
    if (new URLSearchParams(window.location.search).get("replay") !== "poll") return;
    replayed.current = true;
    setRows((prev) => {
      const held = prev.slice(0, 3);
      if (!held.length) return prev;
      setReplaying(held[0].first_seen_at ?? held[0].published_at ?? null);
      const rest = prev.slice(3);
      window.setTimeout(() => {
        held.forEach((n) => fresh.current.add(n.pk));
        setRows((now) => [...held, ...now].sort(newestFirst));
      }, 900);
      return rest;
    });
  }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await apiGet<NoticesPage>(`/v1/notices${query({ source, limit: PAGE, cursor })}`, demo);
      const next = page.notices.filter((n) => !seen.current.has(n.pk));
      next.forEach((n) => seen.current.add(n.pk));
      setRows((prev) => [...prev, ...next]);
      setCursor(page.next_cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMore(false);
    }
  };

  const reload = () => {
    setLoad("loading");
    firstPage()
      .then((page) => {
        seen.current = new Set(page.notices.map((n) => n.pk));
        setRows(page.notices);
        setCursor(page.next_cursor);
        setLoad("ready");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoad("error");
      });
  };

  const shown = source ? stats?.sources.find((s) => s.source === source) : null;

  const latest = stats?.cdsco_latest;

  return (
    <section aria-labelledby="feed-title" className="flex flex-col">
      <div className="flex flex-col gap-6 border-b border-line px-5 pt-8 pb-4 md:px-8">
        {/* C-02: the hero counter is the proof the feed is live, without the word "live" */}
        <div className="space-y-2">
          <h1 id="feed-title" className="tnum font-display text-[44px] leading-[1.04] font-extrabold tracking-[-0.03em] text-ink md:text-[64px]">
            {stats ? `${fmtCount(stats.total)} notices` : "Notices"}
          </h1>
          <p className="text-[16px] text-muted md:text-[18px]">
            from CDSCO, CPSC, NHTSA and openFDA
            {stats?.last_poll_at ? ` · last poll ${fmtWhen(stats.last_poll_at)} IST` : ""}
            {shown ? ` · showing ${shown.label} only` : ""}
          </p>
          {replaying && (
            <p role="status" className="text-[13px] text-primary">
              Replaying the {fmtWhen(replaying)} poll
            </p>
          )}
        </div>

        {/* the callout says what the newest CDSCO month holds; hidden when the field is missing */}
        {latest?.month && latest.count ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface-1 px-4 py-3">
            <p className="text-[15px] text-ink">
              <span className="tnum">{fmtCount(latest.count)}</span> drug samples failed CDSCO quality tests in{" "}
              {latest.month}.
            </p>
            <Link href="/mine/" className="text-[15px] font-medium text-primary hover:underline">
              Check what you own →
            </Link>
          </div>
        ) : null}

        <SourceFilters stats={stats} value={source} onChange={setSource} />
      </div>

      {load === "loading" && (
        <ul aria-label="Loading notices" className="m-0 list-none p-0">
          {Array.from({ length: 12 }, (_, i) => (
            <FeedRowSkeleton key={i} />
          ))}
        </ul>
      )}

      {load === "error" && (
        <EmptyState
          icon={CloudOff}
          tone="error"
          what="The feed could not load"
          why={`Couldn't reach ${apiHost()}: ${error}. Every notice is stored; the page just needs the API.`}
          action={<Button variant="outline" onClick={reload}>Retry</Button>}
        />
      )}

      {load === "ready" && rows.length === 0 && (source ? (
        <EmptyState
          icon={FilterX}
          what={`No ${sourceLabel(source)} notices yet`}
          why={`The ${sourceLabel(source)} poller has not stored a notice. Other sources may have some.`}
          action={<Button variant="outline" onClick={() => setSource(null)}>Show all sources</Button>}
        />
      ) : (
        <EmptyState
          icon={Inbox}
          what="Every recall and quality failure from 4 sources lands here"
          why="No poller has run against this stack yet, so there is nothing to list."
          action={<Button variant="outline" onClick={reload}>Check again</Button>}
        />
      ))}

      {load === "ready" && rows.length > 0 && (
        <>
          <ul className="m-0 list-none p-0" aria-label={`${fmtCount(rows.length)} notices`}>
            {rows.map((n) => (
              <FeedRow key={n.pk} notice={n} fresh={fresh.current.has(n.pk)} onOpen={setOpen} />
            ))}
          </ul>
          <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted">
            <span className="font-mono text-xs">
              {fmtCount(rows.length)} shown{shown ? ` of ${fmtCount(shown.count)}` : stats ? ` of ${fmtCount(stats.total)}` : ""}
            </span>
            {cursor && (
              <Button variant="outline" onClick={loadMore} disabled={more}>
                {more ? "Loading the next 50…" : "Load 50 more"}
              </Button>
            )}
            {!cursor && <span className="text-xs">End of the list.</span>}
          </div>
        </>
      )}

      <NoticeSheet notice={open} onClose={() => setOpen(null)} />
    </section>
  );
}
