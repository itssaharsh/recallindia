"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAppState } from "@/components/shell/app-state";
import { groupByDate } from "@/components/v3/feed-ingest-api/derive";
import { FeedView } from "@/components/v3/feed-ingest-api/FeedView";
import { minutesBetween } from "@/components/v3/feed-ingest-api/format";
import type { FeedLiveState } from "@/components/v3/feed-ingest-api/HeroStat";
import type { LoadMoreState, NoticeListState } from "@/components/v3/feed-ingest-api/NoticeList";
import type { NoticeSheetState } from "@/components/v3/feed-ingest-api/NoticeSheet";
import type {
  CdscoMonth,
  FeedFilters,
  HouseholdCheck,
  HouseholdMatch,
  Notice as V3Notice,
  PinnedAlert,
  SourceId as V3SourceId,
} from "@/components/v3/feed-ingest-api/types";
import { ApiError, DEMO_HOUSEHOLD, apiGet, query } from "@/lib/api";
import type { Item, Notice, NoticesPage } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

import { isV3Source, nextPollAt, toV3Item, toV3Notice, toV3Notices, toV3Stats } from "./api-map";

const PAGE = 50;
const POLL_MS = 15_000;
/** Two missed 15-minute polls: the hero's live line turns "stale" (spec 1.2). */
const STALE_MIN = 30;
/** `q` is applied per page (spec §5.5), so keep paging until 25 matches or the cursor runs out. */
const SEARCH_TARGET = 25;
const SEARCH_MAX_PAGES = 5;

const newestFirst = (a: V3Notice, b: V3Notice) =>
  a.published_at === b.published_at ? (a.pk < b.pk ? 1 : -1) : a.published_at < b.published_at ? 1 : -1;

/** A page clock. Epoch until the client mounts, so the prerendered HTML and hydration agree. */
function useNow(ms = 30_000): string {
  const [now, setNow] = useState(() => new Date(0).toISOString());
  useEffect(() => {
    setNow(new Date().toISOString());
    const id = setInterval(() => setNow(new Date().toISOString()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * /feed (v3). The data is the v2 feed's: `/v1/stats` from the app state poll, `/v1/notices`
 * with cursor pages, `/items` for the household check, and `/v1/notices/{pk}` for a deep link.
 * Everything else is presentation, which `FeedView` owns.
 */
export function FeedWire() {
  const { demo, ready, stats: rawStats, statsError, household: householdKey } = useAppState();
  const router = useRouter();
  const search = useSearchParams();
  const now = useNow();

  /* ------------------------------------------------------------- the URL */
  const sourceParam = search.get("source");
  const source: V3SourceId | null = isV3Source(sourceParam) ? sourceParam : null;
  const since = search.get("since");
  const q = search.get("q") ?? "";
  const month = search.get("month");
  const noticeParam = search.get("notice");
  const replayParam = search.get("replay");
  const filters: FeedFilters = useMemo(() => ({ source, since, q }), [source, since, q]);

  const setParams = useCallback(
    (patch: Record<string, string | null>, mode: "replace" | "push" = "replace") => {
      const next = new URLSearchParams(search.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      const href = qs ? `/feed/?${qs}` : "/feed/";
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, search],
  );

  /* ------------------------------------------------------------ the list */
  const [rows, setRows] = useState<V3Notice[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<NoticeListState>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const fresh = useRef<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());

  const firstPagePath = `/v1/notices${query({ source, since, q, limit: PAGE })}`;

  const fetchFirst = useCallback(
    async (signal?: AbortSignal) => {
      const page = await apiGet<NoticesPage>(firstPagePath, demo, signal);
      let all = toV3Notices(page.notices);
      let next = page.next_cursor;
      if (q.trim()) {
        for (let i = 1; i < SEARCH_MAX_PAGES && next && all.length < SEARCH_TARGET; i++) {
          const more = await apiGet<NoticesPage>(
            `/v1/notices${query({ source, since, q, limit: PAGE, cursor: next })}`,
            demo,
            signal,
          );
          all = [...all, ...toV3Notices(more.notices)];
          next = more.next_cursor;
        }
      }
      return { rows: all, cursor: next };
    },
    [firstPagePath, source, since, q, demo],
  );

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setListState("loading");
    fresh.current = new Set();
    fetchFirst(controller.signal)
      .then(({ rows: page, cursor: next }) => {
        seen.current = new Set(page.map((n) => n.pk));
        setRows(page);
        setCursor(next);
        setListState(page.length ? "ready" : "empty");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setListState("error");
      });
    return () => controller.abort();
  }, [ready, fetchFirst, reloadNonce]);

  // the live poll: page 1 only, so a search view never fans out. New pks land in date order.
  usePoll(
    async (signal) => {
      const page = await apiGet<NoticesPage>(firstPagePath, demo, signal);
      const arrivals = toV3Notices(page.notices).filter((n) => !seen.current.has(n.pk));
      if (!arrivals.length) return;
      arrivals.forEach((n) => {
        seen.current.add(n.pk);
        fresh.current.add(n.pk);
      });
      setRows((prev) => [...arrivals, ...prev].sort(newestFirst));
    },
    POLL_MS,
    ready && listState === "ready",
  );

  // ?replay=poll: hold the newest 3 back for a beat, then land them the way a real poll does.
  const replayed = useRef(false);
  useEffect(() => {
    if (listState !== "ready" || replayed.current || replayParam !== "poll") return;
    replayed.current = true;
    setRows((prev) => {
      const held = prev.slice(0, 3);
      if (!held.length) return prev;
      window.setTimeout(() => {
        held.forEach((n) => fresh.current.add(n.pk));
        setRows((current) => [...held, ...current].sort(newestFirst));
      }, 900);
      return prev.slice(3);
    });
  }, [listState, replayParam]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiGet<NoticesPage>(
        `/v1/notices${query({ source, since, q, limit: PAGE, cursor })}`,
        demo,
      );
      const older = toV3Notices(page.notices).filter((n) => !seen.current.has(n.pk));
      older.forEach((n) => seen.current.add(n.pk));
      setRows((prev) => [...prev, ...older]);
      setCursor(page.next_cursor);
    } catch {
      // the footer stays on "Load 50 older notices"; the next click tries again
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, source, since, q, demo]);

  const byPk = useMemo(() => new Map(rows.map((n) => [n.pk, n])), [rows]);

  /* ------------------------------------------------------ household check */
  const [household, setHousehold] = useState<HouseholdCheck | null>(null);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    apiGet<{ items: Item[] }>("/items", demo, controller.signal)
      .then(({ items }) => {
        const matches: HouseholdMatch[] = items
          .filter((it) => it.status === "alert" && it.case?.notice_id && isV3Source(it.case.notice_id.split("#")[0]))
          .map((it) => {
            const pk = it.case!.notice_id;
            const hash = pk.indexOf("#");
            return {
              item: toV3Item(it),
              notice: {
                pk,
                source: pk.slice(0, hash) as V3SourceId,
                notice_id: hash >= 0 ? pk.slice(hash + 1) : pk,
                row_ref: null,
              },
            };
          });
        const checked = items
          .map((it) => it.last_checked_at)
          .filter((t): t is string => !!t)
          .sort();
        setHousehold({
          name: householdKey === DEMO_HOUSEHOLD ? "the demo household" : "your household",
          as_of: checked[checked.length - 1] ?? new Date().toISOString(),
          matches,
          medicines_checked: items.filter((it) => it.kind === "medicine" && it.batch).length,
        });
      })
      .catch(() => setHousehold(null));
    return () => controller.abort();
  }, [ready, demo, householdKey]);

  // a matched notice that is not on the loaded page still needs its month and row for the pill
  const [matched, setMatched] = useState<Record<string, V3Notice>>({});
  const asked = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!ready || !household) return;
    const missing = household.matches
      .map((m) => m.notice.pk)
      .filter((pk) => !byPk.has(pk) && !asked.current.has(pk))
      .slice(0, 4);
    if (!missing.length) return;
    missing.forEach((pk) => asked.current.add(pk));
    const controller = new AbortController();
    void Promise.all(
      missing.map((pk) =>
        apiGet<Notice>(`/v1/notices/${encodeURIComponent(pk)}`, demo, controller.signal)
          .then(toV3Notice)
          .catch(() => null),
      ),
    ).then((found) => {
      const next: Record<string, V3Notice> = {};
      for (const n of found) if (n) next[n.pk] = n;
      if (Object.keys(next).length) setMatched((prev) => ({ ...prev, ...next }));
    });
    return () => controller.abort();
  }, [ready, demo, household, byPk]);

  const householdCheck = useMemo<HouseholdCheck | null>(() => {
    if (!household) return null;
    return {
      ...household,
      matches: household.matches.map((m) => {
        const n = byPk.get(m.notice.pk) ?? matched[m.notice.pk];
        return n ? { ...m, notice: { pk: n.pk, source: n.source, notice_id: n.notice_id, row_ref: n.row_ref } } : m;
      }),
    };
  }, [household, byPk, matched]);

  /* ---------------------------------------------------------- the months */
  // public/data/cdsco-months.json (spec 1.3.2). Missing → the card's "no months" state.
  const [months, setMonths] = useState<CdscoMonth[] | null>(null);
  useEffect(() => {
    let stale = false;
    fetch("/data/cdsco-months.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!stale && Array.isArray(data) && data.length) setMonths(data as CdscoMonth[]);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, []);

  /* ----------------------------------------------------------- the sheet */
  const known = noticeParam ? (byPk.get(noticeParam) ?? matched[noticeParam] ?? null) : null;
  const [sheetNotice, setSheetNotice] = useState<V3Notice | null>(null);
  const [sheetState, setSheetState] = useState<NoticeSheetState>("loading");
  const [sheetNonce, setSheetNonce] = useState(0);

  useEffect(() => {
    if (!noticeParam) {
      setSheetNotice(null);
      setSheetState("loading");
      return;
    }
    if (known) {
      setSheetNotice(known);
      setSheetState("ready");
      return;
    }
    if (!ready) return;
    const controller = new AbortController();
    setSheetState("loading");
    apiGet<Notice>(`/v1/notices/${encodeURIComponent(noticeParam)}`, demo, controller.signal)
      .then((n) => {
        const v3 = toV3Notice(n);
        if (!v3) {
          setSheetState("notfound");
          return;
        }
        setSheetNotice(v3);
        setSheetState("ready");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSheetState(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
      });
    return () => controller.abort();
  }, [noticeParam, known, ready, demo, sheetNonce]);

  /* --------------------------------------------------------- the derived */
  const stats = useMemo(() => toV3Stats(rawStats), [rawStats]);

  const liveState: FeedLiveState = !stats
    ? statsError
      ? "error"
      : "loading"
    : statsError
      ? "error"
      : stats.last_poll_at && minutesBetween(stats.last_poll_at, now) >= STALE_MIN
        ? "stale"
        : "live";

  const pinned = useMemo<PinnedAlert | null>(() => {
    const latest = stats?.cdsco_latest;
    if (!latest?.month || q.trim() || month || since) return null;
    const alert = rows.filter((n) => n.source === "cdsco_nsq" && n.row_ref?.month === latest.month);
    if (!alert.length) return null;
    const first = [...alert].sort((a, b) => (a.row_ref?.row ?? 0) - (b.row_ref?.row ?? 0)).slice(0, 3);
    const seenAt = alert.map((n) => n.first_seen_at).filter(Boolean).sort();
    return {
      month: latest.month,
      published_at: latest.published_at || first[0].published_at,
      first_seen_at: seenAt[0] ?? first[0].first_seen_at,
      count: latest.count,
      notices: first,
    };
  }, [stats, rows, q, month, since]);

  const groups = useMemo(() => {
    let visible = rows;
    if (month) visible = visible.filter((n) => n.row_ref?.month === month);
    if (pinned) {
      const pinnedPks = new Set(pinned.notices.map((n) => n.pk));
      visible = visible.filter((n) => !pinnedPks.has(n.pk));
    }
    return groupByDate(visible, expanded);
  }, [rows, month, pinned, expanded]);

  // a client-side ?month= filter can empty a page the API filled: say so rather than show nothing
  const shownState: NoticeListState =
    listState === "ready" && !pinned && groups.length === 0 ? "empty" : listState;

  const filtered = !!q.trim() || !!since || !!month;
  const sourceTotal = source ? (stats?.sources.find((s) => s.source === source)?.count ?? null) : (stats?.total ?? null);
  const footer: LoadMoreState = {
    shown: rows.length,
    total: filtered || sourceTotal == null ? rows.length : sourceTotal,
    state: loadingMore ? "loading" : cursor ? "idle" : "end",
  };

  const match = householdCheck?.matches.find((m) => m.notice.pk === noticeParam) ?? null;

  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setIntro(false), 2000);
    return () => clearTimeout(id);
  }, []);

  return (
    <FeedView
      as="div"
      now={now}
      stats={stats}
      liveState={liveState}
      nextPollAt={nextPollAt(rawStats)}
      months={months}
      filters={filters}
      household={householdCheck}
      intro={intro}
      list={{
        state: shownState,
        pinned,
        groups,
        footer,
        newPks: fresh.current,
      }}
      sheet={
        noticeParam
          ? {
              state: sheetState,
              notice: sheetNotice,
              caseHref: match?.item.case_id ? `/case/?id=${encodeURIComponent(match.item.case_id)}` : undefined,
            }
          : null
      }
      on={{
        filtersChange: (next) =>
          setParams({
            source: next.source,
            since: next.since,
            q: next.q.trim() || null,
            // changing a filter by hand leaves the pinned alert's "show all rows" view
            month: null,
          }),
        openNotice: (pk) => setParams({ notice: pk }, "push"),
        closeSheet: () => setParams({ notice: null }, "push"),
        prevNotice: () => {
          const all = [...(pinned?.notices ?? []), ...groups.flatMap((g) => g.notices)];
          const i = all.findIndex((n) => n.pk === noticeParam);
          if (i > 0) setParams({ notice: all[i - 1].pk });
        },
        nextNotice: () => {
          const all = [...(pinned?.notices ?? []), ...groups.flatMap((g) => g.notices)];
          const i = all.findIndex((n) => n.pk === noticeParam);
          if (i >= 0 && i < all.length - 1) setParams({ notice: all[i + 1].pk });
        },
        loadMore: () => void loadMore(),
        showMoreInGroup: (date) => setExpanded((prev) => new Set([...prev, date])),
        showAlert: (m) => setParams({ source: "cdsco_nsq", month: m, q: null, since: null }),
        retry: () => setReloadNonce((n) => n + 1),
        retrySheet: () => setSheetNonce((n) => n + 1),
      }}
    />
  );
}
