"use client";
import * as React from "react";
import { MotionConfig } from "framer-motion";
import { cn } from "../ui";
import { TopNav } from "./TopNav";
import { MobileTopBar } from "./MobileTopBar";
import { BottomTabBar } from "./BottomTabBar";
import { CommandPalette } from "./CommandPalette";
import { ShellToaster, shellToast } from "./Toast";
import { usePaletteHotkeys } from "./hooks";
import { API_BASE, type PaletteItem } from "./palette-items";
import type { HouseholdAction, HouseholdItem, HouseholdState, NoticeSummary, NoticesStatus, TabId } from "./types";

/** Everything the shell shows, as plain data (serialisable; fixtures.ts has the demo values). */
export interface AppShellData {
  /** From the route: `tabForPath(usePathname())`. `null` on /kit and 404. */
  activeTab: TabId | null;
  /** `GET /v1/stats` → `total` (4868). `null` while loading. */
  total: number | null;
  household: HouseholdState;
  /** Household store items with `face` derived. The red nav count = items whose face is `alert`. */
  things: HouseholdItem[];
  /** Palette notices: `GET /v1/notices?q={query}&limit=5` for the last `onSearch` query. */
  notices: NoticeSummary[];
  noticesStatus: NoticesStatus;
  /** The query `notices` answer (echo it back from the fetch) so stale rows never show under a new query. */
  noticesQuery?: string;
  recentSearches?: string[];
}

/** What the shell reports back. It never fetches or mutates anything itself. */
export interface AppShellHandlers {
  /** Household menu and palette "Make my own copy". */
  onHouseholdAction?: (action: HouseholdAction) => void;
  /** Palette query, debounced 150 ms: fetch notices and update `notices` / `noticesStatus`. */
  onSearch?: (query: string) => void;
  /** Client-side navigation (router.push). Defaults to a full page load. */
  onNavigate?: (href: string) => void;
  /** Palette actions other than "make-copy": "add-thing" | "copy-api-base". Return true if handled. */
  onPaletteAction?: (action: string, item: PaletteItem) => boolean | void;
}

export interface AppShellProps extends AppShellData, AppShellHandlers {
  children: React.ReactNode;
  /** Control the palette from outside (kit `?state=palette`). Uncontrolled by default. */
  paletteOpen?: boolean;
  onPaletteOpenChange?: (open: boolean) => void;
  paletteDefaultQuery?: string;
  /** Toast host. Defaults to the local <ShellToaster/>; pass <Toaster {...sonnerToasterProps}/> to use sonner, or null. */
  toaster?: React.ReactNode | null;
  mainClassName?: string;
}

/**
 * The app shell (spec §2, §3): desktop top nav ≥ 768, mobile top bar + bottom tab bar below,
 * the ⌘K palette (⌘K, Ctrl K, "/"), and the toast host. One MotionConfig with reducedMotion="user".
 * Mount it in the app route-group layout so the tab pill slides between routes.
 */
export function AppShell({
  activeTab, total, household, things, notices, noticesStatus, noticesQuery, recentSearches,
  onHouseholdAction, onSearch, onNavigate, onPaletteAction,
  paletteOpen, onPaletteOpenChange, paletteDefaultQuery,
  toaster, mainClassName, children,
}: AppShellProps) {
  const [openState, setOpenState] = React.useState(false);
  const open = paletteOpen ?? openState;
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (paletteOpen === undefined) setOpenState(o);
      onPaletteOpenChange?.(o);
    },
    [paletteOpen, onPaletteOpenChange],
  );
  const openPalette = React.useCallback(() => setOpen(true), [setOpen]);
  usePaletteHotkeys(openPalette, !open);

  const alertCount = React.useMemo(() => things.filter((t) => t.face === "alert").length, [things]);

  const navigate = React.useCallback(
    (href: string) => (onNavigate ? onNavigate(href) : window.location.assign(href)),
    [onNavigate],
  );

  const onSelect = (item: PaletteItem) => {
    if (item.action === "make-copy") {
      onHouseholdAction?.("make-copy");
      return;
    }
    if (item.action && onPaletteAction?.(item.action, item)) return;
    if (item.action === "copy-api-base") {
      void navigator.clipboard?.writeText(API_BASE);
      shellToast.show({ kind: "success", title: "API base URL copied", description: API_BASE });
      return;
    }
    if (item.href) navigate(item.href);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[80] focus:rounded-pill focus:bg-surface-1 focus:px-4 focus:py-2.5 focus:text-[15px] focus:font-semibold focus:text-ink focus:shadow-2"
        >
          Skip to content
        </a>
        <TopNav
          activeTab={activeTab}
          alertCount={alertCount}
          household={household}
          onHouseholdAction={onHouseholdAction}
          total={total}
          onOpenSearch={openPalette}
        />
        <MobileTopBar household={household} onHouseholdAction={onHouseholdAction} onOpenSearch={openPalette} />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            // content max 1472 + 32 px gutters (16 below 768); clears the fixed tab bar on phones
            "mx-auto w-full max-w-[calc(var(--content-app)+64px)] px-8 outline-none max-lg:px-6 max-md:px-4",
            "max-md:pb-[calc(64px+env(safe-area-inset-bottom))]",
            mainClassName,
          )}
        >
          {children}
        </main>
        <BottomTabBar activeTab={activeTab} alertCount={alertCount} />
        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          things={things}
          notices={notices}
          noticesStatus={noticesStatus}
          noticesQuery={noticesQuery}
          onSearch={onSearch}
          onSelect={onSelect}
          total={total}
          household={household}
          recentSearches={recentSearches}
          defaultQuery={paletteDefaultQuery}
        />
        {toaster === undefined ? <ShellToaster /> : toaster}
      </div>
    </MotionConfig>
  );
}
