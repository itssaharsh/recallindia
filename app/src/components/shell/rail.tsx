"use client";

import { Boxes, Braces, FileScan, Rss } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { SoundToggle } from "@/components/shell/sound";

import { useAppState } from "./app-state";

const NAV = [
  { path: "/", label: "Feed", icon: Rss },
  { path: "/ingest/", label: "Ingest", icon: FileScan },
  { path: "/mine/", label: "My things", icon: Boxes },
  { path: "/api/", label: "API", icon: Braces },
] as const;

/**
 * C-01: the rail at ≥768 (216 px, the lockup and the sound toggle at its foot), and on a phone a
 * 52 px top bar with the lockup plus a bottom tab bar of the same four routes. Every tab is a
 * 56 px target, above the home indicator (`env(safe-area-inset-bottom)`).
 */
export function Rail() {
  const pathname = usePathname();
  const { href } = useAppState();
  const active = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path.replace(/\/$/, "")));

  return (
    <>
      <nav
        aria-label="Primary"
        className="flex items-center gap-1 px-3 py-2 md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:gap-0.5 md:px-3 md:py-4"
      >
        <Link
          href={href("/")}
          aria-label="RecallIndia, the feed"
          className="mr-3 flex items-center text-ink md:mr-0 md:mb-6 md:px-1"
        >
          {/* the lockup at 20 px in the mobile bar, 24 px in the rail (UI-SPEC §9) */}
          <Logo height={20} className="md:hidden" />
          <Logo height={24} className="hidden md:block" />
        </Link>
        {NAV.map(({ path, label, icon: Icon }) => {
          const on = active(path);
          return (
            <Link
              key={path}
              href={href(path)}
              aria-current={on ? "page" : undefined}
              className={`hidden items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors md:flex ${
                on ? "bg-surface-1 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon aria-hidden className="size-5 shrink-0" strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
        <div className="ml-auto md:mt-auto md:ml-0 md:pt-4">
          <SoundToggle />
        </div>
      </nav>

      {/* the phone's nav: four tabs at the bottom, clear of the home indicator */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ path, label, icon: Icon }) => {
          const on = active(path);
          return (
            <Link
              key={path}
              href={href(path)}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[12px] ${
                on ? "text-ink" : "text-muted"
              }`}
            >
              <Icon aria-hidden className="size-5" strokeWidth={1.75} />
              {label}
              {on && <span aria-hidden className="mt-0.5 h-0.5 w-6 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
