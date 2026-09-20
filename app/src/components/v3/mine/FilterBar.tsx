"use client";
/**
 * FilterBar (spec/mine.md §2.4): narrow the wall by outcome and by kind, without hiding that alerts exist.
 * Matches the pill row at y 310 in mockups/mine-1536.png, and the edge-to-edge scrolling row in mine-390.png.
 *
 * Two role="group"s of toggle buttons (aria-pressed). ← / → move within a group; Tab moves between groups.
 * The active pill's ink background slides between pills (shared layout, 380/34).
 */
import * as React from "react";
import { LayoutGroup, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button, cn } from "../ui";
import { KIND_PLURAL, KINDS } from "./derive";
import { springPill } from "./motion";
import { CategoryMark } from "./illustrations";
import type { ItemKind, MineFilter, StatusFilter } from "./types";

export interface FilterBarProps {
  filter: MineFilter;
  /** Counts per pill; each group's counts reflect the other group's selection (`filterCounts()`). */
  counts: { status: Record<StatusFilter, number>; kind: Record<ItemKind, number> };
  onChange: (next: MineFilter) => void;
  onAdd?: () => void;
  className?: string;
}

const STATUS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "alert", label: "On a notice" },
  { value: "needs-you", label: "Needs you" },
  { value: "near-miss", label: "Near-misses" },
  { value: "clear", label: "No match" },
];

function Pill({
  active,
  count,
  label,
  marker,
  layoutId,
  onClick,
  onKeyDown,
}: {
  active: boolean;
  count: number;
  label: string;
  marker?: React.ReactNode;
  layoutId: string;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label}, ${count}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "relative inline-flex h-11 flex-none items-center gap-2 rounded-pill border px-3.5 font-sans text-[14px]/none font-medium whitespace-nowrap md:px-4 md:text-[15px]/none",
        "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt",
        active ? "border-ink text-white" : "border-line bg-surface-1 text-ink hover:bg-surface-2",
      )}
    >
      {active ? <motion.span layoutId={layoutId} transition={springPill} className="absolute -inset-px rounded-pill bg-ink" /> : null}
      <span className="relative inline-flex items-center gap-2">
        {marker}
        {label}
        <span className={cn("text-[13px]/none font-semibold tabular-nums", active ? "text-filter-on-count" : "text-ink-muted")}>{count}</span>
      </span>
    </button>
  );
}

/** Arrow keys move focus within a group (roving by DOM order). */
function arrowNav(e: React.KeyboardEvent<HTMLButtonElement>) {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const group = e.currentTarget.closest('[role="group"]');
  if (!group) return;
  const btns = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
  const i = btns.indexOf(e.currentTarget);
  const next = btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
  e.preventDefault();
  next?.focus();
}

export function FilterBar({ filter, counts, onChange, onAdd, className }: FilterBarProps) {
  const statuses = STATUS.filter((s) => s.value !== "needs-you" || counts.status["needs-you"] > 0);
  return (
    <LayoutGroup id="mine-filters">
      <div
        className={cn(
          "-mx-4 mt-[18px] flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "md:mx-0 md:mt-[22px] md:flex-wrap md:overflow-visible md:px-0 md:pb-0",
          className,
        )}
      >
        <div role="group" aria-label="Filter by outcome" className="flex flex-none items-center gap-2">
          {statuses.map((s) => (
            <Pill
              key={s.value}
              layoutId="filter-active-status"
              active={filter.show === s.value}
              count={counts.status[s.value]}
              label={s.label}
              marker={s.value === "alert" ? <i aria-hidden className="size-2 rounded-full bg-danger" /> : undefined}
              onClick={() => onChange({ ...filter, show: s.value })}
              onKeyDown={arrowNav}
            />
          ))}
        </div>
        <span aria-hidden className="mx-2 hidden h-7 w-px flex-none bg-line md:block" />
        <div role="group" aria-label="Filter by kind" className="flex flex-none items-center gap-2">
          {KINDS.map((k) => (
            <Pill
              key={k}
              layoutId="filter-active-kind"
              active={filter.kind === k}
              count={counts.kind[k]}
              label={KIND_PLURAL[k]}
              marker={<CategoryMark kind={k} size={10} />}
              onClick={() => onChange({ ...filter, kind: filter.kind === k ? null : k })}
              onKeyDown={arrowNav}
            />
          ))}
        </div>
        <span className="hidden flex-1 md:block" />
        <span className="mr-2 hidden text-[14px]/none font-medium whitespace-nowrap text-ink-muted md:inline">
          Sorted by <b className="font-semibold text-ink">needs you first</b>
        </span>
        <div className="hidden flex-none md:block">
          <Button onClick={onAdd} icon={<Plus className="size-[18px]" strokeWidth={2.2} />}>
            Add a thing
          </Button>
        </div>
      </div>
    </LayoutGroup>
  );
}
