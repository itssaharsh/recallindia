"use client";
import * as React from "react";
import { cn } from "../ui";
import { Lockup } from "./Brand";
import { HouseholdPill } from "./HouseholdPill";
import { IconButton } from "./primitives";
import { IconSearch } from "./icons";
import { ShellLink } from "./links";
import type { HouseholdAction, HouseholdState } from "./types";

export interface MobileTopBarProps {
  household: HouseholdState;
  onHouseholdAction?: (a: HouseholdAction) => void;
  onOpenSearch: () => void;
  /** Kit phone frames: not sticky, always shown. */
  embedded?: boolean;
  className?: string;
}

/**
 * Mobile top bar (spec §3), below 768 px: sticky 56 px. Lockup (mark 26, wordmark 19) → compact
 * household pill ("Demo household", nowrap) → 44 px search button that opens the palette sheet.
 */
export function MobileTopBar({ household, onHouseholdAction, onOpenSearch, embedded = false, className }: MobileTopBarProps) {
  return (
    <header
      className={cn(
        "flex h-14 items-center gap-1.5 border-b border-line bg-surface-1 pl-4 pr-1.5",
        embedded ? "relative shrink-0" : "sticky top-0 z-40 md:hidden",
        className,
      )}
    >
      <ShellLink href="/" aria-label="RecallIndia home" className="mr-auto flex min-h-11 min-w-0 items-center rounded-sm">
        <Lockup size="bar" />
      </ShellLink>
      <HouseholdPill state={household} size="compact" onAction={onHouseholdAction} />
      <IconButton label="Search" onClick={onOpenSearch}>
        <IconSearch size={22} />
      </IconButton>
    </header>
  );
}
