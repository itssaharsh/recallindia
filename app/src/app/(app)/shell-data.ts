"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import type {
  HouseholdAction,
  HouseholdItem,
  HouseholdState,
  NoticeSummary,
  NoticesStatus,
} from "@/components/v3/shell";
import { DEMO_HOUSEHOLD, apiGet, query } from "@/lib/api";
import type { Item, NoticesPage } from "@/lib/types";

/**
 * The shell's data, from the calls /mine and the feed already make. Nothing new: `/items` for the
 * things (the red count and the palette's first group), `/v1/stats` for the total, and
 * `/v1/notices?q=` for the palette's search, debounced.
 */

/** mine.md "Face derivation", in the v3 words. */
function faceOf(item: Item): HouseholdItem["face"] {
  if (item.status === "alert") return "alert";
  if (item.status === "hold") return "needs-you";
  if (item.case?.decision === "dismiss") return "near-miss";
  return item.last_checked_at ? "clear" : "unchecked";
}

export function toHouseholdItem(item: Item): HouseholdItem {
  return {
    item_id: item.item_id,
    kind: item.kind,
    name: item.name,
    brand: item.brand ?? undefined,
    batch: item.batch ?? undefined,
    make: item.make ?? undefined,
    model: item.model ?? undefined,
    year: item.year ?? undefined,
    purchase_date: item.purchase_date ?? undefined,
    status: item.status === "alert" || item.status === "hold" ? item.status : null,
    notice_id: item.case?.notice_id ?? null,
    case_id: item.case_id ?? null,
    listed_batch: item.case?.range_check?.listed ?? null,
    last_checked_at: item.last_checked_at ?? null,
    face: faceOf(item),
  };
}

export interface ShellData {
  total: number | null;
  household: HouseholdState;
  things: HouseholdItem[];
  notices: NoticeSummary[];
  noticesStatus: NoticesStatus;
  noticesQuery: string;
  onSearch: (q: string) => void;
  onHouseholdAction: (action: HouseholdAction) => void;
}

export function useShellData(): ShellData {
  const { demo, ready, stats, household, householdState, makeCopy, resetCopy, useDemoHousehold: viewDemo } = useAppState();
  const [things, setThings] = useState<HouseholdItem[]>([]);
  const [notices, setNotices] = useState<NoticeSummary[]>([]);
  const [noticesStatus, setNoticesStatus] = useState<NoticesStatus>("idle");
  const [noticesQuery, setNoticesQuery] = useState("");
  const timer = useRef<number | undefined>(undefined);

  // the wall's own copy of the items: the count on "My things" and the palette's first group
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    apiGet<{ items: Item[] }>("/items", demo, controller.signal)
      .then(({ items }) => setThings(items.map(toHouseholdItem)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [ready, demo, household]);

  const onSearch = useCallback(
    (q: string) => {
      window.clearTimeout(timer.current);
      const trimmed = q.trim();
      if (!trimmed) {
        setNotices([]);
        setNoticesStatus("idle");
        setNoticesQuery("");
        return;
      }
      setNoticesStatus("loading");
      timer.current = window.setTimeout(() => {
        apiGet<NoticesPage>(`/v1/notices${query({ q: trimmed, limit: 5 })}`, demo)
          .then(({ notices: found }) => {
            setNotices(found as unknown as NoticeSummary[]);
            setNoticesQuery(trimmed);
            setNoticesStatus("ready");
          })
          .catch(() => {
            setNoticesQuery(trimmed);
            setNoticesStatus("offline");
          });
      }, 150);
    },
    [demo],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onHouseholdAction = useCallback(
    (action: HouseholdAction) => {
      if (action === "make-copy") void makeCopy();
      else if (action === "reset") void resetCopy();
      else if (action === "delete") viewDemo();
    },
    [makeCopy, resetCopy, viewDemo],
  );

  const state: HouseholdState = useMemo(() => {
    if (householdState === "creating") return { kind: "copying", copied: things.length, total: 15 };
    if (household === DEMO_HOUSEHOLD) return { kind: "demo", household_id: "demo", count: things.length || 15 };
    return { kind: "yours", household_id: household, count: things.length };
  }, [household, householdState, things.length]);

  return {
    total: stats?.total ?? null,
    household: state,
    things,
    notices,
    noticesStatus,
    noticesQuery,
    onSearch,
    onHouseholdAction,
  };
}
