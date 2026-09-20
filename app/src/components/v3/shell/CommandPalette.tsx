"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Copy, Plus, SwatchBook } from "lucide-react";
import { Chip, FoilChip, Kbd, cn } from "../ui";
import { IconApi, IconFeed, IconHouse, IconIngest, IconSearch, IconThings } from "./icons";
import { CategoryTile } from "./illustrations";
import { IconButton } from "./primitives";
import { Skeleton } from "./Skeleton";
import { fade, fadeOut, springFast, springFlip } from "./motion";
import { useDebouncedCallback, useDelayedFlag, useIsPhone } from "./hooks";
import { formatCount } from "./format";
import {
  actionItems, goToItems, highlight, matches, noticeToPaletteItem, recentItems, thingToPaletteItem,
  type PaletteGlyph, type PaletteGroup, type PaletteIcon, type PaletteItem,
} from "./palette-items";
import type { HouseholdItem, HouseholdState, NoticeSummary, NoticesStatus } from "./types";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Household store items (face already derived). Searched locally. */
  things: HouseholdItem[];
  /** Results of `GET /v1/notices?q={query}&limit=5` for the latest `onSearch` query. */
  notices: NoticeSummary[];
  noticesStatus: NoticesStatus;
  /** The query `notices` answer. When it differs from the field, the rows are stale and the group shows as loading. */
  noticesQuery?: string;
  /** Called 150 ms after typing stops with the trimmed query; fetch notices and pass them back. */
  onSearch?: (query: string) => void;
  /** Enter or click on a row. Navigate to `item.href` or run `item.action`. The palette closes itself. */
  onSelect?: (item: PaletteItem) => void;
  /** `GET /v1/stats` → `total` (footer: "Searching {total} notices and {count} things"). */
  total: number | null;
  household: HouseholdState;
  recentSearches?: string[];
  defaultQuery?: string;
  /** auto: dialog from 768 px, full-screen sheet below. */
  layout?: "auto" | "dialog" | "sheet";
  /** modal: portal + fixed + scroll lock + focus trap. inline: fills the positioned parent (kit frames). */
  presentation?: "modal" | "inline";
  /** Inline only: focus the field on mount (modal always does). */
  autoFocus?: boolean;
}

const GROUP_TITLE: Record<PaletteGroup, string> = {
  recent: "Recent",
  things: "My things",
  notices: "Notices",
  goto: "Go to",
  actions: "Actions",
};
const MAX_THINGS = 4;
const MAX_NOTICES = 5;

/**
 * ⌘K command palette (spec §6.10), a light cmdk without the dependency: dialog + listbox + keyboard.
 * Groups in order: My things (max 4) · Notices (max 5, from the API) · Go to · Actions.
 * Desktop: centred 640 px dialog at top 88 over the ink scrim (the scrim covers the sticky nav).
 * Phone: full-screen sheet with a back button, the field and "Cancel".
 */
export function CommandPalette({ presentation = "modal", layout = "auto", ...props }: CommandPaletteProps) {
  const isPhone = useIsPhone();
  const sheet = layout === "sheet" || (layout === "auto" && isPhone);
  const modal = presentation === "modal";
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const tree = (
    <AnimatePresence>
      {props.open && <PaletteSurface key="palette" {...props} sheet={sheet} modal={modal} />}
    </AnimatePresence>
  );
  if (!modal) return tree;
  if (!mounted) return null;
  return createPortal(tree, document.body);
}

type Section = { group: PaletteGroup; items: PaletteItem[]; note?: React.ReactNode; loading?: boolean };

function PaletteSurface({
  onOpenChange, things, notices, noticesStatus, noticesQuery, onSearch, onSelect, total, household,
  recentSearches = [], defaultQuery = "", autoFocus = false, sheet, modal,
}: Omit<CommandPaletteProps, "open" | "layout" | "presentation"> & { sheet: boolean; modal: boolean }) {
  const [query, setQuery] = React.useState(defaultQuery);
  const q = query.trim();
  const listId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  // notices fetch is the parent's job; we tell it what to look for, debounced 150 ms
  const search = useDebouncedCallback(onSearch, 150);
  React.useEffect(() => { if (q) search(q); }, [q, search]);

  const thingItems = React.useMemo(() => things.map(thingToPaletteItem), [things]);
  const noticeItems = React.useMemo(() => notices.map(noticeToPaletteItem), [notices]);
  const stale = noticesQuery !== undefined && noticesQuery.trim().toLowerCase() !== q.toLowerCase();
  const loadingNotices = !!q && noticesStatus !== "offline" && (noticesStatus === "loading" || noticesStatus === "idle" || stale);
  const showNoticeSkeleton = useDelayedFlag(loadingNotices, 300);

  const sections: Section[] = React.useMemo(() => {
    const goTo = goToItems({ total, household });
    if (!q) {
      return [{ group: "recent", items: recentItems(recentSearches) }, { group: "goto", items: goTo }].filter((s) => s.items.length > 0) as Section[];
    }
    const out: Section[] = [];
    const t = thingItems.filter((i) => matches(i, q)).slice(0, MAX_THINGS);
    if (t.length) out.push({ group: "things", items: t });
    if (noticesStatus === "offline") {
      out.push({ group: "notices", items: [], note: "Can't reach the API. Showing your things only." });
    } else if (loadingNotices) {
      out.push({ group: "notices", items: [], loading: true });
    } else if (noticeItems.length) {
      out.push({ group: "notices", items: noticeItems.slice(0, MAX_NOTICES) });
    }
    const g = goTo.filter((i) => matches(i, q));
    if (g.length) out.push({ group: "goto", items: g });
    const a = actionItems({ household }).filter((i) => i.always || matches(i, q));
    if (a.length) out.push({ group: "actions", items: a });
    return out;
  }, [q, thingItems, noticeItems, noticesStatus, loadingNotices, total, household, recentSearches]);

  const flat = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const noResults =
    !!q && noticesStatus !== "offline" && !loadingNotices &&
    !sections.some((s) => (s.group === "things" || s.group === "notices") && s.items.length > 0);

  const [active, setActive] = React.useState(0);
  React.useEffect(() => setActive(0), [q]);
  const activeIndex = flat.length ? Math.min(active, flat.length - 1) : -1;
  const optionId = (i: number) => `${listId}-o${i}`;

  // focus the field; give focus back to whatever opened us
  React.useEffect(() => {
    if (!modal && !autoFocus) return;
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus({ preventScroll: true });
    return () => { if (modal) opener?.focus?.({ preventScroll: true }); };
  }, [modal, autoFocus]);

  // scroll lock while modal
  React.useEffect(() => {
    if (!modal) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, [modal]);

  // keep the active row visible inside the list (never scroll the page)
  React.useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!list || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 32;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }, [activeIndex]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    if (item.action?.startsWith("recent:")) {
      setQuery(item.title);
      inputRef.current?.focus();
      return;
    }
    onSelect?.(item);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!flat.length) return;
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + d + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      choose(flat[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab" && modal) {
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("input, button, a[href], [tabindex]:not([tabindex='-1'])");
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  let index = -1;
  return (
    <div className={cn(modal ? "fixed inset-0 z-50" : "absolute inset-0 z-[6]")}>
      {!sheet && (
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: fade }}
          exit={{ opacity: 0, transition: fadeOut }}
          onClick={close}
        />
      )}
      <div className={cn("pointer-events-none absolute inset-0 flex justify-center", !sheet && "px-4 pt-[88px]")}>
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal={modal || undefined}
          aria-label="Search"
          onKeyDown={onKeyDown}
          initial={sheet ? { opacity: 0, y: -24 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: sheet ? springFlip : springFast }}
          exit={{ opacity: 0, transition: fadeOut }}
          className={cn(
            "pointer-events-auto flex flex-col overflow-hidden bg-surface-1",
            sheet ? "size-full" : "max-h-[calc(100%-32px)] w-full max-w-palette self-start rounded-lg shadow-3",
          )}
        >
          {/* field row */}
          <div className={cn("flex shrink-0 items-center border-b border-line", sheet ? "gap-1.5 py-2 pl-1.5 pr-2.5" : "h-[60px] gap-3 pl-5 pr-4")}>
            {sheet && (
              <IconButton label="Close search" onClick={close}>
                <ArrowLeft size={22} />
              </IconButton>
            )}
            <div className={cn("flex min-w-0 flex-1 items-center", sheet ? "h-11 gap-2 rounded-pill bg-surface-2 px-3.5" : "h-full gap-3")}>
              <IconSearch size={sheet ? 18 : 20} className="shrink-0 text-ink-muted" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                aria-autocomplete="list"
                aria-label="Search things, notices and pages"
                placeholder="Search things, notices and pages"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
                className={cn(
                  "h-full min-w-0 flex-1 bg-transparent font-medium text-ink caret-cobalt outline-none",
                  "placeholder:font-normal placeholder:text-ink-subtle focus-visible:shadow-none",
                  sheet ? "text-[16px]" : "text-[18px]",
                )}
              />
            </div>
            {sheet ? (
              <button type="button" onClick={close} className="h-11 shrink-0 rounded-pill px-2 text-[15px] font-semibold text-cobalt">
                Cancel
              </button>
            ) : (
              <button type="button" onClick={close} aria-label="Close search" className="relative shrink-0 rounded-xs after:absolute after:-inset-3 after:content-['']">
                <Kbd>esc</Kbd>
              </button>
            )}
          </div>

          {/* results */}
          <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1.5">
            {noResults && (
              <div className="px-5 pb-4 pt-8 text-center">
                <p className="text-[15px] font-semibold leading-[1.3] text-ink">No notices match “{q}”</p>
                <p className="mt-1 text-[13px] leading-[1.4] text-ink-muted">Batch codes match exactly, letter for letter.</p>
              </div>
            )}
            {sections.map((s) => {
              const headingId = `${listId}-${s.group}`;
              return (
                <div key={s.group} role="group" aria-labelledby={headingId}>
                  <div id={headingId} role="presentation" className={cn("pb-1.5 pt-3.5 text-caps uppercase text-ink-muted", sheet ? "px-4 pb-1" : "px-5")}>
                    {GROUP_TITLE[s.group]}
                  </div>
                  {s.note && <div className={cn("py-2.5 text-[13px] leading-[1.4] text-ink-muted", sheet ? "px-4" : "px-5")}>{s.note}</div>}
                  {s.loading && showNoticeSkeleton && (
                    <div aria-busy="true">
                      {[64, 48].map((w) => (
                        <div key={w} className={cn("flex min-h-[52px] items-center gap-3", sheet ? "px-4" : "px-5")}>
                          <Skeleton className="size-9 rounded-[10px]" />
                          <div className="grid flex-1 gap-1.5">
                            <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
                            <Skeleton className="h-3 w-[38%]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {s.items.map((item) => {
                    index += 1;
                    const i = index;
                    return (
                      <PaletteRow
                        key={item.id}
                        id={optionId(i)}
                        index={i}
                        item={item}
                        query={q}
                        active={i === activeIndex}
                        sheet={sheet}
                        onHover={setActive}
                        onChoose={choose}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
          <p className="sr-only" aria-live="polite">{q ? `${flat.length} results` : ""}</p>

          {!sheet && (
            <div className="flex h-11 shrink-0 items-center gap-4 border-t border-line bg-canvas px-5 text-[12.5px] font-medium leading-none text-ink-muted [&_kbd]:bg-surface-1 [&_kbd]:shadow-[0_0_0_1px_var(--line)]">
              <span className="inline-flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>move</span>
              <span className="inline-flex items-center gap-1.5"><Kbd>↵</Kbd>open</span>
              <span className="inline-flex items-center gap-1.5"><Kbd>esc</Kbd>close</span>
              <span className="ml-auto truncate">
                Searching {total === null ? "all" : formatCount(total)} notices and {things.length} things
              </span>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

const GLYPHS: Record<PaletteGlyph, React.ReactNode> = {
  feed: <IconFeed size={20} />,
  notice: <IconFeed size={20} />,
  ingest: <IconIngest size={20} />,
  things: <IconThings size={20} />,
  api: <IconApi size={20} />,
  kit: <SwatchBook size={20} aria-hidden />,
  plus: <Plus size={20} aria-hidden />,
  copy: <Copy size={18} aria-hidden />,
  search: <IconSearch size={20} />,
  house: <IconHouse size={20} />,
};

function PaletteIconTile({ icon }: { icon: PaletteIcon }) {
  if (icon.type === "category") return <CategoryTile category={icon.category} size={36} alert={icon.alert} />;
  return (
    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", icon.tone === "cobalt" ? "bg-cobalt-soft text-cobalt" : "bg-surface-2 text-ink")}>
      {GLYPHS[icon.glyph]}
    </span>
  );
}

function PaletteRow({
  id, index, item, query, active, sheet, onHover, onChoose,
}: { id: string; index: number; item: PaletteItem; query: string; active: boolean; sheet: boolean; onHover: (i: number) => void; onChoose: (item: PaletteItem) => void }) {
  const detail = sheet ? (item.detailCompact ?? item.detail) : item.detail;
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-index={index}
      onMouseMove={() => { if (!active) onHover(index); }}
      onClick={() => onChoose(item)}
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 transition-colors duration-180 ease-out",
        sheet ? "min-h-14 px-4 py-1.5" : "min-h-[52px] px-5 py-1.5",
        active && "bg-cobalt-soft",
      )}
    >
      <PaletteIconTile icon={item.icon} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium leading-[1.3] text-ink">
          <span className="truncate">{highlight(item.title, query)}</span>
          {item.code && !sheet && (
            <>
              <span aria-hidden className="shrink-0">·</span>
              <span className="inline-flex shrink-0 [&>span]:h-6 [&>span]:px-2 [&>span]:text-[15px]">
                <FoilChip code={item.code} size="sm" />
              </span>
            </>
          )}
        </span>
        {detail && <span className="block truncate text-[13px] leading-[1.3] text-ink-muted">{highlight(detail, query)}</span>}
      </span>
      {item.trailing?.type === "chip" && <span className="shrink-0 whitespace-nowrap"><Chip tone={item.trailing.tone}>{item.trailing.label}</Chip></span>}
      {item.trailing?.type === "kbd" && <span className="shrink-0"><Kbd>{item.trailing.label}</Kbd></span>}
      {item.trailing?.type === "arrow" && <ArrowRight size={18} aria-hidden className="shrink-0 text-cobalt" />}
      {active && !sheet && item.trailing?.type !== "arrow" && (
        <span className="shrink-0 [&>kbd]:bg-surface-1"><Kbd>↵</Kbd></span>
      )}
    </div>
  );
}
