"use client";
import * as React from "react";
import { LayoutGroup, motion } from "framer-motion";
import { cn } from "../ui";
import { Lockup } from "./Brand";
import { HouseholdPill } from "./HouseholdPill";
import { SearchTrigger } from "./SearchTrigger";
import { AlertBadge } from "./primitives";
import { ShellLink } from "./links";
import { springFast } from "./motion";
import { TABS } from "./tabs";
import type { HouseholdAction, HouseholdState, TabId } from "./types";

export interface TopNavProps {
  /** `null` on `/kit`, `/` and 404: no tab is tinted. */
  activeTab: TabId | null;
  /** Household items whose face is `alert`. The red badge shows only while > 0. */
  alertCount: number;
  household: HouseholdState;
  onHouseholdAction?: (a: HouseholdAction) => void;
  /** `GET /v1/stats` → `total` */
  total: number | null;
  onOpenSearch: () => void;
  /**
   * responsive (default): full ≥ 1180, compact search below, pill drops "· read-only" below 1024.
   * full / tablet: force one rendering (kit frames).
   */
  layout?: "responsive" | "full" | "tablet";
  /** Kit frames: not sticky, never hidden on phones. */
  embedded?: boolean;
  /** Kit anatomy: draw one tab in its hover state. */
  forceHoverTab?: TabId;
  className?: string;
}

/**
 * Desktop app nav (spec §2): sticky 64 px white bar. Lockup → tabs → household pill → search.
 * The active pill slides between tabs with a shared layout id (250 ms spring).
 * Hidden below 768 px, where MobileTopBar + BottomTabBar take over.
 */
export function TopNav({
  activeTab, alertCount, household, onHouseholdAction, total, onOpenSearch,
  layout = "responsive", embedded = false, forceHoverTab, className,
}: TopNavProps) {
  const group = React.useId();
  return (
    <header
      className={cn(
        "h-16 border-b border-line bg-surface-1",
        embedded ? "relative" : "sticky top-0 z-40 max-md:hidden",
        className,
      )}
    >
      <div className={cn("flex h-full items-center gap-1 px-8", layout === "responsive" && "max-lg:px-6")}>
        <ShellLink
          href="/"
          aria-label="RecallIndia home"
          data-part="logo"
          className={cn("mr-[26px] flex min-h-11 shrink-0 items-center rounded-sm", layout === "responsive" && "max-lg:mr-4")}
        >
          <Lockup size="nav" />
        </ShellLink>
        <LayoutGroup id={group}>
          <nav aria-label="Main" className="flex shrink-0 gap-1">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <ShellLink
                  key={tab.id}
                  href={tab.href}
                  data-part={`tab-${tab.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative isolate inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-pill px-4 text-[15px] font-medium leading-none pointer-coarse:h-11",
                    "transition-colors duration-180 ease-out",
                    layout === "responsive" && "max-lg:px-3",
                    active ? "text-cobalt" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    !active && forceHoverTab === tab.id && "bg-surface-2 text-ink",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      aria-hidden
                      className="absolute inset-0 -z-10 rounded-pill bg-cobalt-soft"
                      transition={springFast}
                    />
                  )}
                  {tab.label}
                  {tab.id === "mine" && alertCount > 0 && (
                    <span data-part="badge" className="inline-flex">
                      <AlertBadge count={alertCount} />
                    </span>
                  )}
                </ShellLink>
              );
            })}
          </nav>
        </LayoutGroup>
        <span className="min-w-0 flex-1" data-part="spacer" />
        <HouseholdPill
          state={household}
          onAction={onHouseholdAction}
          detail={layout === "tablet" ? "hide" : layout === "full" ? "show" : "responsive"}
        />
        <SearchTrigger total={total} onOpen={onOpenSearch} layout={layout === "tablet" ? "compact" : layout === "full" ? "full" : "responsive"} />
      </div>
    </header>
  );
}
