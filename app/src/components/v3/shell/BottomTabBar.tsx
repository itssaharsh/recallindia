"use client";
import * as React from "react";
import { LayoutGroup, motion } from "framer-motion";
import { cn } from "../ui";
import { IconApi, IconFeed, IconIngest, IconThings } from "./icons";
import { AlertBadge } from "./primitives";
import { ShellLink } from "./links";
import { springFast } from "./motion";
import { TABS } from "./tabs";
import type { TabId } from "./types";

const ICONS: Record<TabId, (p: { size?: number }) => React.ReactElement> = {
  feed: IconFeed,
  ingest: IconIngest,
  mine: IconThings,
  api: IconApi,
};

export interface BottomTabBarProps {
  activeTab: TabId | null;
  alertCount: number;
  /** Kit phone frames: static, with a 20 px home-indicator inset. */
  embedded?: boolean;
  className?: string;
}

/**
 * Bottom tab bar (spec §3), below 768 px: fixed, 64 px + env(safe-area-inset-bottom). Four equal
 * columns: a 56 × 32 icon pill (22 px icon) over a 12 px label. The active icon sits in a
 * cobalt-soft pill that slides between tabs (250 ms spring). "My things" carries the red count.
 */
export function BottomTabBar({ activeTab, alertCount, embedded = false, className }: BottomTabBarProps) {
  const group = React.useId();
  return (
    <nav
      aria-label="Main"
      className={cn(
        "grid grid-cols-4 border-t border-line bg-surface-1",
        embedded
          ? "relative shrink-0 pb-5"
          : "fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(11_27_51/0.18)] md:hidden",
        className,
      )}
    >
      <LayoutGroup id={group}>
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          const Icon = ICONS[tab.id];
          return (
            <ShellLink
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-[12px] font-semibold leading-none transition-colors duration-180 ease-out",
                active ? "text-cobalt" : "text-ink-muted",
              )}
            >
              <span className="relative isolate grid h-8 w-14 place-items-center rounded-pill">
                {active && (
                  <motion.span layoutId="tabbar-pill" aria-hidden className="absolute inset-0 -z-10 rounded-pill bg-cobalt-soft" transition={springFast} />
                )}
                <Icon size={22} />
                {tab.id === "mine" && alertCount > 0 && (
                  <span className="absolute -top-1 right-1">
                    <AlertBadge count={alertCount} size="tabbar" announce={false} />
                  </span>
                )}
              </span>
              {tab.label}
              {tab.id === "mine" && alertCount > 0 && <span className="sr-only">, {alertCount} on a notice</span>}
            </ShellLink>
          );
        })}
      </LayoutGroup>
    </nav>
  );
}
