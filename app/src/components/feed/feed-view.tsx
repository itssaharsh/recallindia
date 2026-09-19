"use client";

import { CloudOff, FilterX, Inbox } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { useAppState } from "@/components/shell/app-state";
import { Button } from "@/components/ui/button";
import { apiGet, apiHost, query } from "@/lib/api";
import { fmtCount, sourceLabel } from "@/lib/format";
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

  return (
    <section aria-labelledby="feed-title" className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4">
        <h1 id="feed-title" className="font-display text-lg font-semibold text-text">
          Feed <span className="font-sans text-sm font-normal text-muted">· newest first{shown ? ` · ${shown.label} only` : ""}</span>
        </h1>
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
          action={<Button onClick={reload}>Retry</Button>}
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
          action={<Button onClick={reload}>Check again</Button>}
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
