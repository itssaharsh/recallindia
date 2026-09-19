"use client";

import { Boxes, Braces, FileScan, Rss } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAppState } from "./app-state";

const NAV = [
  { path: "/", label: "Feed", icon: Rss },
  { path: "/ingest/", label: "Ingest", icon: FileScan },
  { path: "/mine/", label: "My things", icon: Boxes },
  { path: "/api/", label: "API", icon: Braces },
] as const;

export function Rail() {
  const pathname = usePathname();
  const { href } = useAppState();
  const active = (path: string) => (path === "/" ? pathname === "/" : pathname.startsWith(path.replace(/\/$/, "")));

  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 px-3 py-2 md:sticky md:top-0 md:h-dvh md:flex-col md:items-stretch md:gap-0.5 md:px-3 md:py-4"
    >
      <Link
        href={href("/")}
        className="mr-3 font-display text-[17px] leading-none font-semibold tracking-tight text-text md:mr-0 md:mb-6 md:px-2 md:text-xl"
      >
        RecallIndia
      </Link>
      {NAV.map(({ path, label, icon: Icon }) => {
        const on = active(path);
        return (
          <Link
            key={path}
            href={href(path)}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors ${
              on ? "bg-surface-3 text-text" : "text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
