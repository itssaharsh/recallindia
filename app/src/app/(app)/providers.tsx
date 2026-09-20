"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell, ShellLinkProvider, shellToast, tabForPath, type ShellLinkComponent } from "@/components/v3/shell";

import { useShellData } from "./shell-data";

/**
 * One AppShell for every app route, so the tab pill slides between them (shell/README §4). The
 * landing sits outside this group and carries its own nav.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const shell = useShellData();

  // a toast belongs to the screen that raised it: leaving /mine must not carry "moved to No match"
  // over the case's seal
  useEffect(() => shellToast.clear(), [pathname]);

  return (
    <ShellLinkProvider component={Link as unknown as ShellLinkComponent}>
      <AppShell
        activeTab={tabForPath(pathname)}
        total={shell.total}
        household={shell.household}
        things={shell.things}
        notices={shell.notices}
        noticesStatus={shell.noticesStatus}
        noticesQuery={shell.noticesQuery}
        onSearch={shell.onSearch}
        onHouseholdAction={shell.onHouseholdAction}
        onNavigate={(href) => router.push(href)}
      >
        {children}
      </AppShell>
    </ShellLinkProvider>
  );
}
