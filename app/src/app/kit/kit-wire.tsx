"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { KitView, ShellLinkProvider, isKitState, type ShellLinkComponent } from "@/components/v3/shell";
import { KIT_FIXTURE } from "@/components/v3/shell/fixtures";

function Kit() {
  const router = useRouter();
  const state = useSearchParams().get("state");
  return (
    <ShellLinkProvider component={Link as unknown as ShellLinkComponent}>
      <KitView {...KIT_FIXTURE} state={isKitState(state) ? state : null} handlers={{ onNavigate: (href) => router.push(href) }} />
    </ShellLinkProvider>
  );
}

/** /kit brings its own AppShell, so it sits outside the (app) group. */
export function KitWire() {
  return (
    <Suspense fallback={null}>
      <Kit />
    </Suspense>
  );
}
