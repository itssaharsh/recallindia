"use client";
import * as React from "react";
import { cn } from "../ui";
import { IconSearch } from "./icons";
import { SURFACE_2_HOVER } from "./primitives";
import { Tooltip } from "./Tooltip";
import { useModKeyLabel } from "./hooks";
import { formatCount } from "./format";

export interface SearchTriggerProps {
  /** `GET /v1/stats` → `total`. `null` while loading ("Search notices"). */
  total: number | null;
  onOpen: () => void;
  /** full: 268 × 40 field. compact: 44 px round button (below 1180 px). responsive: switches at 1180 px. */
  layout?: "responsive" | "full" | "compact";
  className?: string;
}

/**
 * Search trigger (spec §6.5): a surface-2 pill "Search 4,868 notices" with a white ⌘K key.
 * Opens the palette on click; ⌘K, Ctrl K and "/" are wired by AppShell (usePaletteHotkeys).
 */
export function SearchTrigger({ total, onOpen, layout = "responsive", className }: SearchTriggerProps) {
  const mod = useModKeyLabel();
  const label = total === null ? "Search notices" : `Search ${formatCount(total)} notices`;

  const full = (
    <button
      type="button"
      data-part="search"
      onClick={onOpen}
      aria-keyshortcuts="Meta+K Control+K /"
      className={cn(
        "ml-2 flex h-10 w-[268px] shrink-0 items-center pointer-coarse:h-11 gap-2.5 rounded-pill bg-surface-2 pl-3.5 pr-1.5 text-[14px] font-medium leading-none text-ink-muted",
        "transition-colors duration-180 ease-out", SURFACE_2_HOVER,
        layout === "responsive" && "max-[1179px]:hidden",
        className,
      )}
    >
      <IconSearch size={18} className="shrink-0 text-ink" />
      <span className="truncate">{label}</span>
      <kbd className="ml-auto grid h-7 min-w-10 place-items-center rounded-pill bg-surface-1 px-2.5 font-sans text-[12px] font-semibold leading-none text-ink">{mod}</kbd>
    </button>
  );

  const compact = (
    <Tooltip content={`Search · ${mod}`} side="bottom" align="end" className={cn("ml-2", layout === "responsive" && "min-[1180px]:hidden")}>
      <button
        type="button"
        data-part={layout === "compact" ? "search" : undefined}
        onClick={onOpen}
        aria-label={`Search, ${mod}`}
        aria-keyshortcuts="Meta+K Control+K /"
        className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-ink transition-colors duration-180 ease-out", SURFACE_2_HOVER, className)}
      >
        <IconSearch size={18} />
      </button>
    </Tooltip>
  );

  if (layout === "full") return full;
  if (layout === "compact") return compact;
  return (
    <>
      {full}
      {compact}
    </>
  );
}
