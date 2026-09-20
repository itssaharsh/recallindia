"use client";
import * as React from "react";
import { Calendar, ChevronDown, Search, X } from "lucide-react";
import { cn, Kbd } from "../ui";
import { daysBefore, fmtDayMonth, fmtInt } from "./format";
import { isTyping, onRoveKeyDown, useDebounced } from "./hooks";
import { FilterPill } from "./primitives";
import { SOURCE_ORDER, SOURCES } from "./sources";
import type { FeedFilters, SourceId } from "./types";

export interface FilterBarProps {
  filters: FeedFilters;
  /** /v1/stats total and sources[].count */
  counts: { total: number; bySource: Partial<Record<SourceId, number>> } | null;
  now: string;
  /** Called with the next filters; the page writes them to the URL (?source=&since=&q=). */
  onChange: (next: FeedFilters) => void;
}

const daysAgo = daysBefore;

/**
 * Source pills (role=toolbar, arrow keys) · time menu · search (spec 1.4).
 * At 390 the bar scrolls sideways edge to edge and search moves to the top bar.
 */
export function FilterBar({ filters, counts, now, onChange }: FilterBarProps) {
  const set = (patch: Partial<FeedFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="-mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:mt-[26px] lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
      <div role="toolbar" aria-label="Filter notices by source" className="flex shrink-0 gap-2" onKeyDown={(e) => onRoveKeyDown(e)}>
        <FilterPill selected={filters.source == null} label="All" count={counts ? fmtInt(counts.total) : undefined} onClick={() => set({ source: null })} />
        {SOURCE_ORDER.map((id) => (
          <FilterPill
            key={id}
            source={id}
            selected={filters.source === id}
            label={SOURCES[id].label}
            count={counts?.bySource[id] != null ? fmtInt(counts.bySource[id]!) : undefined}
            onClick={() => set({ source: filters.source === id ? null : id })}
          />
        ))}
      </div>
      <span aria-hidden className="mx-1.5 hidden h-7 w-px shrink-0 bg-line lg:block" />
      <TimeMenu since={filters.since} now={now} onChange={(since) => set({ since })} />
      <span className="hidden flex-1 lg:block" />
      <SearchField value={filters.q} onChange={(q) => set({ q })} />
    </div>
  );
}

/* ------------------------------------------------------------ time menu */

function TimeMenu({ since, now, onChange }: { since: string | null; now: string; onChange: (since: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [custom, setCustom] = React.useState(since ?? daysAgo(now, 7));
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null);
  const d7 = daysAgo(now, 7), d30 = daysAgo(now, 30);
  const label = since == null ? "Any time" : since === d7 ? "Last 7 days" : since === d30 ? "Last 30 days" : `Since ${fmtDayMonth(since)}`;
  const options: { label: string; value: string | null }[] = [
    { label: "Any time", value: null },
    { label: "Last 7 days", value: d7 },
    { label: "Last 30 days", value: d30 },
  ];

  const openMenu = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 240), top: r.bottom + 8 });
    setOpen(true);
  };
  React.useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[aria-checked="true"], [role="menuitemradio"]')?.focus();
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
    btn.current?.focus();
  };

  return (
    <>
      <FilterPill
        ref={btn}
        rove={false}
        selected={false}
        aria-haspopup="menu"
        aria-expanded={open}
        label={label}
        icon={<Calendar aria-hidden className="size-4 text-ink-muted" />}
        trailing={<ChevronDown aria-hidden className="size-4 text-ink-muted" />}
        onClick={() => (open ? setOpen(false) : openMenu())}
      />
      {open && pos && (
        <div
          ref={menu}
          role="menu"
          aria-label="Published"
          style={{ left: pos.left, top: pos.top }}
          className="fixed z-30 w-[232px] rounded-md border border-line bg-surface-1 p-1.5 shadow-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              btn.current?.focus();
            } else onRoveKeyDown(e, { next: ["ArrowDown"], prev: ["ArrowUp"] });
          }}
        >
          {options.map((o) => (
            <button
              key={o.label}
              type="button"
              role="menuitemradio"
              data-rove
              aria-checked={since === o.value}
              onClick={() => pick(o.value)}
              className={cn(
                "flex h-10 w-full items-center rounded-sm px-3 text-left text-[14.5px] font-medium pointer-coarse:h-11",
                since === o.value ? "bg-cobalt-soft text-cobalt" : "text-ink hover:bg-surface-2",
              )}
            >
              {o.label}
            </button>
          ))}
          <div className="mt-1 border-t border-line px-1.5 pt-2 pb-1">
            <label htmlFor="feed-since" className="mb-1.5 block text-[13px] font-semibold text-ink">
              Since…
            </label>
            <div className="flex gap-1.5">
              <input
                id="feed-since"
                type="date"
                data-rove
                value={custom}
                max={daysAgo(now, 0)}
                onChange={(e) => setCustom(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-sm border border-line-strong px-2 font-mono text-[13px] text-ink"
              />
              <button type="button" data-rove onClick={() => pick(custom || null)} className="h-10 rounded-pill bg-cobalt px-3 text-[13px] font-semibold text-on-cobalt hover:bg-cobalt-hover">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- search */

function SearchField({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => setDraft(value), [value]);
  useDebounced(draft, 250, (q) => q !== value && onChange(q));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !isTyping(e) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      role="search"
      className="hidden h-11 w-[340px] shrink-0 items-center gap-2 rounded-pill border border-line-strong bg-surface-1 pr-2 pl-4 focus-within:border-cobalt focus-within:shadow-[0_0_0_3px_var(--color-cobalt-soft)] lg:flex"
    >
      <Search aria-hidden className="size-[18px] shrink-0 text-ink-muted" />
      <label htmlFor="feed-q" className="sr-only">
        Search product, batch or model
      </label>
      <input
        ref={input}
        id="feed-q"
        type="search"
        value={draft}
        placeholder="Search product, batch or model"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft("");
            onChange("");
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear the search"
          onClick={() => {
            setDraft("");
            onChange("");
            input.current?.focus();
          }}
          className="-my-1 grid size-11 place-items-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : (
        <Kbd>/</Kbd>
      )}
    </div>
  );
}
