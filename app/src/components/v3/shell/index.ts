// RecallIndia v3 "Cobalt & Foil" · app shell, shell-owned primitives, kit and 404 views.
export { AppShell, type AppShellProps, type AppShellData, type AppShellHandlers } from "./AppShell";
export { TopNav, type TopNavProps } from "./TopNav";
export { MobileTopBar, type MobileTopBarProps } from "./MobileTopBar";
export { BottomTabBar, type BottomTabBarProps } from "./BottomTabBar";
export { HouseholdPill, type HouseholdPillProps } from "./HouseholdPill";
export { SearchTrigger, type SearchTriggerProps } from "./SearchTrigger";
export { CommandPalette, type CommandPaletteProps } from "./CommandPalette";
export {
  thingToPaletteItem, noticeToPaletteItem, goToItems, actionItems, recentItems, matches, highlight, API_BASE,
  type PaletteItem, type PaletteGroup, type PaletteIcon, type PaletteTrailing,
} from "./palette-items";
export { ToastCard, ShellToaster, shellToast, sonnerToastOptions, sonnerToasterProps, sonnerIcons, type ToastData, type ToastKind } from "./Toast";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Skeleton, SkeletonFeedRows, SkeletonItemCard, SkeletonStat, Loadable } from "./Skeleton";
export { Tooltip, TooltipBubble } from "./Tooltip";
export { IconButton, TextField, SearchField, FilterPill, FilterBar, SourceChip, AlertBadge, type FilterOption, type FilterLead } from "./primitives";
export { Mark, Lockup, LockupOutlined, type LockupSize, type BrandTone } from "./Brand";
export { CategoryTile, CategoryIllustration, CategoryMark } from "./illustrations";
export * from "./icons";
export { ShellLinkProvider, ShellLink, type ShellLinkComponent } from "./links";
export { TABS, tabForPath } from "./tabs";
export { spring, springFast, springFlip, fade, fadeOut, STAGGER, EASE_SPRING, numberFlowTiming } from "./motion";
export { useMediaQuery, useIsPhone, useModKeyLabel, usePaletteHotkeys, useDelayedFlag, useDebouncedCallback, useTicker } from "./hooks";
export { formatCount, formatIstTime, formatDate, daysBetween, cdscoFailedTest, SOURCE_LABEL } from "./format";
export { KitView, KIT_STATES, isKitState, type KitViewProps, type KitState } from "./KitView";
export { NotFoundView, type NotFoundViewProps } from "./NotFoundView";
export type * from "./types";
