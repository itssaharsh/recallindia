"use client";
/**
 * MineView (spec/mine.md §1): the /mine screen, composed from one typed props object.
 * Matches mockups/mine-1536.png (first viewport), mine-full-1536.png (the whole wall), mine-390.png, and, with
 * `sheet.open`, mine-add-1536.png / mine-add-390.png.
 *
 * Presentational: the route fetches (household items, `/v1/stats`, `/v1/notices/{id}`, check-status polling)
 * and passes responses in. MineView owns only UI state: the faces as currently shown (so the strip, legend and
 * headline change at 90° of each flip), the held sort order, the filter when uncontrolled, the focus flash and
 * the fallback toast.
 *
 * The one orchestrated load sequence: headline number 0 → n (600 ms) · strip pockets 30 ms stagger, red pills last ·
 * cards rise from 200 ms, 40 ms stagger, first 8 only. Pass `intro={false}` for static renders.
 */
import * as React from "react";
import { MotionConfig } from "framer-motion";
import { cn } from "../ui";
import { AddThingSheet, type AddThingSheetProps } from "./AddThingSheet";
import {
  countFaces,
  deriveFace,
  displayName,
  effectiveFilter,
  filterCounts,
  latestCheck,
  matchesStatus,
  nextPoll,
  SOURCE_ORDER,
} from "./derive";
import { FilterBar } from "./FilterBar";
import { HouseholdBanner } from "./HouseholdBanner";
import { HouseholdStrip } from "./HouseholdStrip";
import { cardDomId, type ItemCardActions } from "./ItemCard";
import { ItemWall, useHeldOrder } from "./ItemWall";
import { LocalToast } from "./LocalToast";
import { OutcomeLine } from "./OutcomeLine";
import type { AddKind, BannerState, CheckStatus, Face, HouseholdItem, HouseholdMode, MineFilter, MineStats, MineToast, NoticeView } from "./types";

export interface MineHousehold {
  mode: HouseholdMode;
  /** Banner state; `copying` while `POST /households` runs. */
  banner: BannerState;
  errorMessage?: string | null;
  /** Things in the demo household (15), for the reset question. */
  demoCount?: number;
}

export interface MineViewProps extends ItemCardActions {
  household: MineHousehold;
  /** `GET /v1/stats`. */
  stats: MineStats;
  /** The household items (v2 `/mine` items call). */
  items: HouseholdItem[];
  /** `GET /v1/notices/{notice_id}` for every item with a `notice_id`, keyed by notice_id. */
  notices: Record<string, NoticeView | undefined>;
  /** `GET /items/{id}/check-status` for items being checked, keyed by item_id. */
  checks?: Record<string, CheckStatus | undefined>;
  /** Controlled filter (mirror it to `?show=&kind=`). Omit for an uncontrolled filter starting at `defaultFilter`. */
  filter?: MineFilter;
  defaultFilter?: MineFilter;
  onFilterChange?: (f: MineFilter) => void;
  /** The Add sheet. Household mode and sources count are filled in by MineView. */
  sheet?: Omit<AddThingSheetProps, "household" | "sourcesCount"> | null;
  /** Play the page's load sequence (default true). */
  intro?: boolean;
  /** Render as the page's `<main>` (default) or a `<div>` when the shell already provides `<main>`. */
  as?: "main" | "div";
  onMakeCopy?: () => void;
  onResetCopy?: () => void;
  onViewDemo?: () => void;
  /** Every "Add a thing" entry point (filter bar, strip "+", Add tile) opens the sheet on this kind. */
  onAdd?: (kind: AddKind) => void;
  /** Show a toast (sonner in the repo). Without it a local toast renders. */
  onToast?: (t: MineToast) => void;
  className?: string;
}

const ALL: MineFilter = { show: "all", kind: null };

export function MineView(props: MineViewProps) {
  const {
    household,
    stats,
    items,
    notices,
    checks = {},
    filter: filterProp,
    defaultFilter = ALL,
    onFilterChange,
    sheet,
    intro = true,
    as: Tag = "main",
    onMakeCopy,
    onResetCopy,
    onViewDemo,
    onAdd,
    onToast,
    className,
    ...cardActions
  } = props;

  /* faces: data vs shown (a flipping card updates `shown` at 90°) */
  const dataFaces = React.useMemo(() => {
    const m: Record<string, Face> = {};
    for (const it of items) m[it.item_id] = deriveFace(it, checks[it.item_id]);
    return m;
  }, [items, checks]);
  const [override, setOverride] = React.useState<Record<string, Face>>(() => ({ ...dataFaces }));
  const shown = React.useMemo(() => {
    const m: Record<string, Face> = {};
    for (const it of items) m[it.item_id] = override[it.item_id] ?? dataFaces[it.item_id]!;
    return m;
  }, [items, override, dataFaces]);
  const onFaceShown = React.useCallback((id: string, f: Face) => setOverride((s) => ({ ...s, [id]: f })), []);

  /* filter */
  const [filterState, setFilterState] = React.useState<MineFilter>(defaultFilter);
  const rawFilter = filterProp ?? filterState;
  const counts = countFaces(Object.values(shown));
  const filter = effectiveFilter(rawFilter, counts);
  const setFilter = (f: MineFilter) => {
    if (!filterProp) setFilterState(f);
    onFilterChange?.(f);
  };
  const sheetItemId = sheet?.open ? sheet.item?.item_id : undefined;
  const visible = React.useMemo(() => {
    const v = new Set<string>();
    for (const it of items) {
      if (it.item_id === sheetItemId) continue; // the sheet shows it; it flies to the wall on close
      if ((filter.kind === null || it.kind === filter.kind) && matchesStatus(shown[it.item_id]!, filter.show)) v.add(it.item_id);
    }
    return v;
  }, [items, shown, filter.kind, filter.show, sheetItemId]);

  // Hidden cards cannot flip, so their shown face follows the data at once.
  const sig = items.map((it) => `${it.item_id}:${dataFaces[it.item_id]}:${visible.has(it.item_id) ? 1 : 0}`).join("|");
  React.useEffect(() => {
    const patch: Record<string, Face> = {};
    for (const it of items) {
      const id = it.item_id;
      if (override[id] === undefined) patch[id] = dataFaces[id]!; // new item: remember the face it arrived with
      else if (!visible.has(id) && shown[id] !== dataFaces[id]) patch[id] = dataFaces[id]!;
    }
    if (Object.keys(patch).length) setOverride((s) => ({ ...s, ...patch }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  /* focus flash + toast */
  const [flashId, setFlashId] = React.useState<string | null>(null);
  const focusCard = React.useCallback((id: string) => {
    const el = document.getElementById(cardDomId(id));
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
    setFlashId(id);
    window.setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1200);
  }, []);
  const [localToast, setLocalToast] = React.useState<MineToast | null>(null);
  const dismissToast = React.useCallback(() => setLocalToast(null), []);
  const toast = React.useCallback((t: MineToast) => (onToast ? onToast(t) : setLocalToast(t)), [onToast]);

  /* a card leaving the sheet flies to its wall slot above the exiting sheet */
  const [arrivingId, setArrivingId] = React.useState<string | null>(null);
  const prevSheet = React.useRef<{ open: boolean; id?: string }>({ open: false });
  React.useEffect(() => {
    const was = prevSheet.current;
    const now = { open: Boolean(sheet?.open), id: sheet?.item?.item_id };
    prevSheet.current = now;
    if (was.open && !now.open && was.id) {
      setArrivingId(was.id);
      const t = window.setTimeout(() => setArrivingId(null), 700);
      return () => window.clearTimeout(t);
    }
  }, [sheet?.open, sheet?.item?.item_id]);

  /* order: held after flips, shared by the strip and the wall */
  const wallRef = React.useRef<HTMLElement>(null);
  const shownRef = React.useRef(shown);
  shownRef.current = shown;
  const onMoved = React.useCallback(
    (ids: string[]) => {
      window.setTimeout(() => {
        for (const id of ids) {
          const el = document.getElementById(cardDomId(id));
          const it = items.find((x) => x.item_id === id);
          if (!el || !it) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom > 0 && r.top < window.innerHeight) continue;
          const f = shownRef.current[id];
          const title = f === "alert" ? `${displayName(it)} moved to the top · on a notice` : f === "clear" ? `${displayName(it)} moved to No match` : `${displayName(it)} moved`;
          toast({ id: `moved-${id}-${Date.now()}`, title, actionLabel: "Show it", onAction: () => focusCard(id) });
        }
      }, 450);
    },
    [items, toast, focusCard],
  );
  const { order, faces: orderFaces } = useHeldOrder(items, shown, notices, wallRef, onMoved);

  /* header data */
  const checkedAt = latestCheck(items);
  const labels = [...stats.sources].sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source)).map((s) => s.label);
  const add = () => onAdd?.("medicine");

  return (
    <MotionConfig reducedMotion="user">
      <Tag className={cn("mx-auto w-full max-w-[1536px] px-4 md:px-8", className)}>
        <HouseholdBanner
          state={household.banner}
          errorMessage={household.errorMessage}
          demoCount={household.demoCount}
          onMakeCopy={onMakeCopy}
          onResetCopy={onResetCopy}
          onViewDemo={onViewDemo}
        />

        <section aria-label="Outcome" className="mt-5 grid grid-cols-1 gap-[18px] md:mt-[22px] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
          <OutcomeLine counts={counts} checkedAt={checkedAt} nextPollAt={nextPoll(stats)} sourceLabels={labels} totalNotices={stats.total} intro={intro} />
          <HouseholdStrip
            pockets={order.map((it) => ({ item_id: it.item_id, name: displayName(it), face: shown[it.item_id]! }))}
            counts={counts}
            mode={household.mode}
            checkedAt={checkedAt}
            intro={intro}
            onAdd={add}
            onPocketSelect={focusCard}
          />
        </section>

        <FilterBar filter={filter} counts={filterCounts(items, shown, filter)} onChange={setFilter} onAdd={add} />

        <ItemWall
          order={order}
          orderFaces={orderFaces}
          sectionRef={wallRef}
          faces={dataFaces}
          shownFaces={shown}
          notices={notices}
          checks={checks}
          visible={visible}
          household={household.mode}
          sourcesCount={stats.sources_count}
          checkedAt={checkedAt}
          intro={intro}
          flashId={flashId}
          arrivingId={arrivingId}
          onFaceShown={onFaceShown}
          onAdd={add}
          onClearFilters={() => setFilter(ALL)}
          {...cardActions}
        />
      </Tag>

      {sheet ? <AddThingSheet {...sheet} household={household.mode} sourcesCount={stats.sources_count} cardActions={sheet.cardActions ?? cardActions} /> : null}
      {onToast ? null : <LocalToast toast={localToast} onDismiss={dismissToast} />}
    </MotionConfig>
  );
}
