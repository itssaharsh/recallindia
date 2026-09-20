"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { KIT_FIXTURE, KitView, ShellLinkProvider, isKitState, type ShellLinkComponent } from "@/components/v3/shell";

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
