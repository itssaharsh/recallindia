import type { TabId } from "./types";

/** The four app tabs, in nav order (spec §2, §3). */
export const TABS: { id: TabId; label: string; href: string }[] = [
  { id: "feed", label: "Feed", href: "/feed" },
  { id: "ingest", label: "Ingest", href: "/ingest" },
  { id: "mine", label: "My things", href: "/mine" },
  { id: "api", label: "API", href: "/api" },
];

/**
 * Route → active tab (spec §1). `/case` belongs to My things; `/`, `/kit` and 404 have none.
 * Use with `usePathname()` in the app layout.
 */
export function tabForPath(pathname: string): TabId | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/feed" || p.startsWith("/feed/")) return "feed";
  if (p === "/ingest" || p.startsWith("/ingest/")) return "ingest";
  if (p === "/mine" || p.startsWith("/mine/") || p === "/case" || p.startsWith("/case/")) return "mine";
  if (p === "/api" || p.startsWith("/api/")) return "api";
  return null;
}
