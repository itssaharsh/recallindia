"use client";
/**
 * ItemWall (spec/mine.md §2.5 + §2.10): every thing you own, most urgent first, in a varied rhythm.
 * Matches the wall in mockups/mine-full-1536.png (12 columns, 7 + 5 big rows, 4 clear cards per row, Add tile last)
 * and the single column in mine-390.png.
 *
 * - Order is "needs you first". After a card flips, it holds its slot for 700 ms, then moves to its sorted slot
 *   (layout spring 300/32). While the pointer is over the wall or focus is inside it, the move waits (at most 4 s).
 * - The order comes from `useHeldOrder()` (exported here), which the page shares with the HouseholdStrip.
 *   Its `onMoved` callback lets the page toast "{name} moved to …" with "Show it" when the new slot is off-screen.
 * - Load (the page's one orchestrated sequence): cards rise 8 px and fade in over 280 ms, 40 ms stagger in sort
 *   order, capped after 8 cards, starting 200 ms after the headline.
 * - Filtered-out cards fade and scale to .98 in 160 ms; the rest re-flow with the layout spring.
 */
import * as React from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { Button, cn } from "../ui";
import { BIG_FACES, displayName, fmtTime, sortItems } from "./derive";
import { ItemCard, type ItemCardActions } from "./ItemCard";
import { FLIP, LOAD, rise, springLayout } from "./motion";
import type { CheckStatus, Face, HouseholdItem, HouseholdMode, NoticeView } from "./types";

export interface ItemWallProps extends ItemCardActions {
  /** All items in wall order (`useHeldOrder().order`, or `sortItems()` for a static render); filtered with `visible`. */
  order: HouseholdItem[];
  /** The faces the order was sorted by (`useHeldOrder().faces`). A card that just flipped keeps its old group
   * (big faces before the section line, clear after it) until the hold ends. Defaults to `shownFaces`. */
  orderFaces?: Record<string, Face>;
  /** The wall element, for `useHeldOrder`'s hover and focus tracking. */
  sectionRef?: React.RefObject<HTMLElement | null>;
  /** The face each card should show (data faces). */
  faces: Record<string, Face>;
  /** Faces as currently shown (updated at 90° of each flip); drives spans and the held sort. */
  shownFaces: Record<string, Face>;
  notices: Record<string, NoticeView | undefined>;
  checks: Record<string, CheckStatus | undefined>;
  /** item_ids that pass the filters. */
  visible: ReadonlySet<string>;
  household: HouseholdMode;
  sourcesCount: number;
  /** Time for the ClearSectionLine ("No match in 4 sources as of 15:08"). */
  checkedAt: string | null;
  intro?: boolean;
  /** item_id to draw a 1.2 s focus ring on. */
  flashId?: string | null;
  /** item_id flying in from the Add sheet: lifted above the exiting sheet (z 60) for the flight. */
  arrivingId?: string | null;
  onFaceShown?: (itemId: string, face: Face) => void;
  onAdd?: () => void;
  onClearFilters?: () => void;
  className?: string;
}

/**
 * Holds the sort order steady after flips (spec §2.5 "Re-sort after a flip"): a face change re-sorts only after
 * the flip lands + 700 ms, and waits (max 4 s) while the pointer is over `wallRef` or focus is inside it.
 * The page calls it once and passes the result to both the HouseholdStrip (pocket order) and the ItemWall.
 */
export function useHeldOrder(items: HouseholdItem[], shownFaces: Record<string, Face>, notices: ItemWallProps["notices"], wallRef: React.RefObject<HTMLElement | null>, onMoved?: (ids: string[]) => void) {
  const [orderFaces, setOrderFaces] = React.useState(shownFaces);
  const latest = React.useRef(shownFaces);
  latest.current = shownFaces;
  const busy = React.useRef({ hover: false, focus: false });

  const changed = React.useMemo(() => Object.keys(shownFaces).filter((id) => orderFaces[id] !== undefined && orderFaces[id] !== shownFaces[id]), [shownFaces, orderFaces]);
  const added = React.useMemo(() => Object.keys(shownFaces).some((id) => orderFaces[id] === undefined) || Object.keys(orderFaces).some((id) => shownFaces[id] === undefined), [shownFaces, orderFaces]);

  // New or removed items re-sort at once; face changes wait for the hold.
  React.useEffect(() => {
    if (added && changed.length === 0) setOrderFaces(shownFaces);
  }, [added, changed.length, shownFaces]);

  React.useEffect(() => {
    if (changed.length === 0) return;
    let waited = 0;
    let t = window.setTimeout(function tick() {
      const b = busy.current;
      if ((b.hover || b.focus) && waited < FLIP.maxDefer) {
        waited += 200;
        t = window.setTimeout(tick, 200);
        return;
      }
      const ids = changed.slice();
      setOrderFaces(latest.current);
      onMoved?.(ids);
    }, FLIP.in + FLIP.hold);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed.join("|")]);

  React.useEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    const on = (k: "hover" | "focus", v: boolean) => () => (busy.current[k] = v);
    const enter = on("hover", true);
    const leave = on("hover", false);
    const fin = on("focus", true);
    const fout = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) busy.current.focus = false;
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focusin", fin);
    el.addEventListener("focusout", fout);
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusin", fin);
      el.removeEventListener("focusout", fout);
    };
  }, [wallRef]);

  const faces = { ...shownFaces, ...orderFaces };
  return { order: sortItems(items, faces, notices), faces };
}

function ClearSectionLine({ n, checkedAt, sourcesCount }: { n: number; checkedAt: string | null; sourcesCount: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-3 md:flex-nowrap">
      <span aria-hidden className="grid size-6 flex-none place-items-center self-center rounded-full bg-success-soft text-success">
        <Check className="size-3.5" strokeWidth={2.8} />
      </span>
      <h2 className="m-0 font-display text-[19px]/[1.2] font-bold tracking-[-0.02em] text-ink md:text-[22px]/[1.2]">
        No match in {sourcesCount} sources as of {fmtTime(checkedAt)}
      </h2>
      <span className="basis-full pl-9 font-sans text-[14px]/none font-medium text-ink-muted md:basis-auto md:pl-0">
        {n} {n === 1 ? "thing" : "things"}
      </span>
    </div>
  );
}

/** Last cell of the clear grid: opens the Add sheet on "Medicine strip" (spec §2.10). */
export function AddTile({ onAdd, className }: { onAdd?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        "flex h-full min-h-[84px] w-full items-center gap-3.5 rounded-md border-[1.5px] border-dashed border-line-strong bg-transparent p-3 text-left md:min-h-24 md:p-3.5",
        "transition-colors duration-150 hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
        className,
      )}
    >
      <span aria-hidden className="grid size-14 flex-none place-items-center rounded-[12px] bg-cobalt-soft text-cobalt md:size-16">
        <Plus className="size-[26px]" strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <b className="block font-sans text-[15px]/[1.3] font-semibold text-cobalt">Add a thing</b>
        <span className="block font-sans text-[13px]/[1.35] text-ink-muted">Scan a medicine strip, or type a model number</span>
      </span>
    </button>
  );
}

export function ItemWall(props: ItemWallProps) {
  const { order, orderFaces, sectionRef, faces, shownFaces, notices, checks, visible, household, sourcesCount, checkedAt, intro = true, flashId, arrivingId, onFaceShown, onAdd, onClearFilters, className, ...actions } = props;
  const items = order;
  const reduce = useReducedMotion();
  const ownRef = React.useRef<HTMLElement>(null);
  const wallRef = sectionRef ?? ownRef;
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Announce results as cards land on them: "{name}: on a notice", "{name}: no match in 4 sources as of 15:08".
  const [live, setLive] = React.useState("");
  const prevShown = React.useRef(shownFaces);
  React.useEffect(() => {
    const msgs: string[] = [];
    for (const it of items) {
      const was = prevShown.current[it.item_id];
      const now = shownFaces[it.item_id];
      if (!was || was === now) continue;
      if (now === "alert") msgs.push(`${displayName(it)}: on a notice`);
      else if (now === "clear") msgs.push(`${displayName(it)}: no match in ${sourcesCount} sources as of ${fmtTime(it.last_checked_at ?? checkedAt)}`);
      else if (now === "needs-you") msgs.push(`${displayName(it)}: needs you`);
    }
    prevShown.current = shownFaces;
    if (msgs.length) setLive(msgs.join(". "));
  }, [shownFaces, items, sourcesCount, checkedAt]);

  const ordered = order.filter((it) => visible.has(it.item_id));
  // grouping follows the held faces; size follows the face on screen (a card changes size at 90° in its old slot)
  const slotFace = (id: string): Face => orderFaces?.[id] ?? shownFaces[id] ?? faces[id] ?? "unchecked";
  const faceOf = (id: string): Face => shownFaces[id] ?? faces[id] ?? "unchecked";
  const big = ordered.filter((it) => BIG_FACES.has(slotFace(it.item_id)));
  const small = ordered.filter((it) => !BIG_FACES.has(slotFace(it.item_id)) && slotFace(it.item_id) !== "clear");
  const clear = ordered.filter((it) => slotFace(it.item_id) === "clear");

  const span = (it: HouseholdItem): string => {
    const i = big.indexOf(it);
    if (i < 0 || !BIG_FACES.has(faceOf(it.item_id))) return "md:col-span-6 lg:col-span-3";
    if (i % 2 === 0 && i === big.length - 1) return "md:col-span-12";
    return i % 2 === 0 ? "md:col-span-12 lg:col-span-7" : "md:col-span-12 lg:col-span-5";
  };

  const cell = (it: HouseholdItem, index: number) => {
    const play = intro && !reduce && !mounted;
    const delay = (LOAD.cardsDelay + Math.min(index, LOAD.staggerCap) * LOAD.cardStagger) / 1000;
    const bigIndex = big.indexOf(it);
    return (
      <motion.div
        key={it.item_id}
        layout
        transition={{ layout: springLayout }}
        initial={play ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { ...rise, delay: play ? delay : 0 } }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.16 } }}
        className={cn("col-span-12 min-w-0", span(it), it.item_id === arrivingId && "relative z-[60]")}
      >
        <ItemCard
          item={it}
          face={faces[it.item_id] ?? "unchecked"}
          notice={it.notice_id ? notices[it.notice_id] : null}
          check={checks[it.item_id]}
          sourcesCount={sourcesCount}
          household={household}
          lone={bigIndex >= 0 && bigIndex % 2 === 0 && bigIndex === big.length - 1}
          flash={flashId === it.item_id}
          onFaceShown={onFaceShown}
          layoutId={`item-${it.item_id}`}
          {...actions}
        />
      </motion.div>
    );
  };

  const empty = ordered.length === 0 && items.length > 0;
  let index = 0;

  return (
    <section ref={wallRef} aria-label="Your things" className={cn("mt-3.5 grid grid-cols-12 gap-3.5 pb-20 md:mt-[18px] md:gap-5 md:pb-12", className)}>
      <LayoutGroup id="mine-wall">
        <AnimatePresence mode="popLayout" initial={false}>
          {big.map((it) => cell(it, index++))}
          {small.map((it) => cell(it, index++))}
          {clear.length > 0 ? (
            <motion.div key="clear-line" layout transition={{ layout: springLayout }} className="col-span-12" initial={false} exit={{ opacity: 0 }}>
              <ClearSectionLine n={clear.length} checkedAt={checkedAt} sourcesCount={sourcesCount} />
            </motion.div>
          ) : null}
          {clear.map((it) => cell(it, index++))}
          {empty ? (
            <motion.div key="empty" layout className="col-span-12 flex flex-wrap items-center gap-3 rounded-lg bg-surface-1 px-6 py-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="m-0 font-sans text-[16px] text-ink">Nothing here with these filters.</p>
              <Button variant="ghost" onClick={onClearFilters}>
                Clear filters
              </Button>
            </motion.div>
          ) : null}
          <motion.div key="add-tile" layout transition={{ layout: springLayout }} className="col-span-12 md:col-span-6 lg:col-span-3" initial={false}>
            <AddTile onAdd={onAdd} />
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
      <span aria-live="polite" className="sr-only">
        {live}
      </span>
    </section>
  );
}
