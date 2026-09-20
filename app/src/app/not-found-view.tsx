"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { NotFoundView, ShellLinkProvider, type ShellLinkComponent } from "@/components/v3/shell";

import { useShellData } from "./(app)/shell-data";

/** 404 inside the app shell: the nav, the household pill and the palette all still work. */
export function NotFoundWire() {
  const router = useRouter();
  const shell = useShellData();
  return (
    <ShellLinkProvider component={Link as unknown as ShellLinkComponent}>
      <NotFoundView
        shell={{
          activeTab: null,
          total: shell.total,
          household: shell.household,
          things: shell.things,
          notices: shell.notices,
          noticesStatus: shell.noticesStatus,
          noticesQuery: shell.noticesQuery,
        }}
        handlers={{
          onSearch: shell.onSearch,
          onHouseholdAction: shell.onHouseholdAction,
          onNavigate: (href) => router.push(href),
        }}
      />
    </ShellLinkProvider>
  );
}
