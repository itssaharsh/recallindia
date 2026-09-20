"use client";

import { CloudOff, PackageSearch, Plus, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Num } from "@/components/common/num";
import { useAppState } from "@/components/shell/app-state";
import { HouseholdPill } from "@/components/shell/household-pill";
import { Button } from "@/components/ui/button";
import { DEMO_HOUSEHOLD, apiGet, apiHost, apiPost } from "@/lib/api";
import { fmtWhen } from "@/lib/format";
import { usePoll } from "@/lib/use-poll";
import type { Item } from "@/lib/types";

import { AddItemSheet } from "./add-item-sheet";
import { ItemCard, ItemCardSkeleton, faceOf, type Face } from "./item-card";

const ORDER: Record<Face, number> = { alert: 0, hold: 1, dismissed: 2, unchecked: 3, clear: 4 };
const FILTERS = [
  { id: "all", label: "All" },
  { id: "notice", label: "On a notice" },
  { id: "near", label: "Near-misses" },
  { id: "clear", label: "Clear" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

export function MineView() {
  const { demo, ready, stats, refreshStats, household } = useAppState();
  // the demo wall is read-only: adding and checking belong to your own copy
  const readOnly = demo || household === DEMO_HOUSEHOLD;
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  // "Make my own copy" starts the checks server-side (one Map, three at a time), so the wall
  // fills without this browser doing anything: watch it until every card has an answer.
  const [settleBy, setSettleBy] = useState(0);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [checkError, setCheckError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { items: list } = await apiGet<{ items: Item[] }>("/items", demo);
      // the wall shows each finding's case: fetch the item detail only for items that have one
      const withCase = await Promise.all(
        list.map((it) => (it.case_id ? apiGet<Item>(`/items/${encodeURIComponent(it.item_id)}`, demo).catch(() => it) : it)),
      );
      setItems(withCase);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [demo]);

  useEffect(() => {
    if (!ready) return;
    setItems(null); // the previous household's things are not this one's
    setSettleBy(Date.now() + 120_000);
    load();
    // `household` is not read inside `load` (lib/api adds the header), but changing it changes
    // whose wall this is, so the list must be fetched again
  }, [ready, load, household]);

  const unchecked = (items ?? []).filter((it) => !it.last_checked_at).length;
  usePoll(
    async () => {
      if (Date.now() > settleBy) return;
      await load();
    },
    3_000,
    ready && unchecked > 0 && settleBy > 0,
  );

  const check = useCallback(
    async (item: Item) => {
      setCheckError(null);
      try {
        await apiPost(`/items/${encodeURIComponent(item.item_id)}/check`, undefined, demo);
        setChecking((prev) => new Set(prev).add(item.item_id));
      } catch (err) {
        setCheckError(`${item.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [demo],
  );

  const checked = useCallback(
    (updated: Item) => {
      setItems((prev) => prev && prev.map((it) => (it.item_id === updated.item_id ? updated : it)));
      setChecking((prev) => {
        const next = new Set(prev);
        next.delete(updated.item_id);
        return next;
      });
      refreshStats();
    },
    [refreshStats],
  );

  const added = async (created: Item[]) => {
    setItems((prev) => [...created, ...(prev ?? [])]);
    for (const item of created) await check(item); // auto-run the check, one at a time
  };

  const sorted = useMemo(
    () => (items ? [...items].sort((a, b) => ORDER[faceOf(a)] - ORDER[faceOf(b)] || a.name.localeCompare(b.name)) : []),
    [items],
  );
  const shown = sorted.filter((it) => {
    const face = faceOf(it);
    if (filter === "notice") return face === "alert" || face === "hold";
    if (filter === "near") return face === "dismissed";
    if (filter === "clear") return face === "clear";
    return true;
  });

  const onNotice = sorted.filter((it) => faceOf(it) === "alert").length;
  const onHold = sorted.filter((it) => faceOf(it) === "hold").length;
  const lastChecked = sorted.map((it) => it.last_checked_at).filter(Boolean).sort().at(-1) ?? null;
  const sources = stats?.sources_count ?? 4;

  return (
    <section aria-labelledby="mine-title" className="px-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            id="mine-title"
            className="font-display text-[34px] leading-[1.06] font-extrabold tracking-[-0.03em] text-ink md:text-[44px]"
          >
            {items === null ? (
              "Your things"
            ) : onNotice > 0 ? (
              <>
                <Num value={onNotice} /> {onNotice === 1 ? "thing you own is" : "things you own are"} on a notice
              </>
            ) : (
              "Nothing you own is on a notice"
            )}
          </h1>
          {items !== null && (
            <p className="mt-2 text-[16px] text-ink-muted">
              {items.length} {items.length === 1 ? "thing" : "things"} · checked against {sources} sources ·{" "}
              {fmtWhen(lastChecked)} IST
              {onHold > 0 ? ` · ${onHold} need${onHold === 1 ? "s" : ""} a detail to confirm` : ""}
            </p>
          )}
        </div>
        <Button className="hidden md:inline-flex" onClick={() => setAdding(true)} disabled={readOnly} title={readOnly ? "The demo household is read-only: make your own copy first" : undefined}>
          <Plus aria-hidden /> Add a thing
        </Button>
      </div>

      <div className="mt-5">
        <HouseholdPill inline />
      </div>

      {items && items.length > 0 && (
        <div role="group" aria-label="Show" className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-8 rounded-sm border px-2.5 text-[13px] ${filter === f.id ? "border-primary bg-surface-2 text-ink" : "border-line text-ink-muted hover:bg-surface-2 hover:text-ink"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {checkError && (
        <p role="alert" className="mt-4 mb-0 text-[13px] text-danger">
          Could not start the check for {checkError}
        </p>
      )}

      {error && (
        <EmptyState
          icon={CloudOff}
          tone="error"
          what="Your things could not load"
          why={`Couldn't reach ${apiHost()}: ${error}. Nothing is lost; the page needs the API to show them.`}
          action={<Button variant="outline" onClick={load}>Retry</Button>}
        />
      )}

      {!error && items === null && (
        <ul className="mt-6 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <ItemCardSkeleton key={i} />
          ))}
        </ul>
      )}

      {!error && items?.length === 0 && (
        <EmptyState
          icon={PackageSearch}
          what="The medicines, vehicle and appliances you own go here"
          why="Nothing is added yet, so there is nothing to check against the notices."
          action={
            <Button variant="outline" onClick={() => setAdding(true)} disabled={demo}>
              <Plus aria-hidden /> Add your first thing
            </Button>
          }
        />
      )}

      {!error && items && items.length > 0 && shown.length === 0 && (
        <EmptyState
          icon={SearchX}
          what={filter === "notice" ? "Nothing you own is on a notice" : filter === "near" ? "No near-misses" : "No clear items"}
          why={`None of your ${items.length} items falls under "${FILTERS.find((f) => f.id === filter)?.label}" as of ${fmtWhen(lastChecked)}.`}
          action={
            <Button variant="outline" onClick={() => setFilter("all")}>
              Show all {items.length}
            </Button>
          }
        />
      )}

      {!error && shown.length > 0 && (
        // dense: a one-column card fills the gap beside each two-column alert / near-miss card
        <ul className="mt-6 grid grid-flow-row-dense list-none items-start gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <ItemCard key={item.item_id} item={item} checking={checking.has(item.item_id)} onCheck={check} onChecked={checked} />
          ))}
        </ul>
      )}

      {/* the one primary action of this view, kept in reach on a phone (above the tab bar) */}
      {!readOnly && (
        <div className="fixed inset-x-0 bottom-14 z-30 border-t border-line bg-canvas/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
          <Button className="w-full" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Add a thing
          </Button>
        </div>
      )}

      <AddItemSheet open={adding} onOpenChange={setAdding} onAdded={added} />
    </section>
  );
}
