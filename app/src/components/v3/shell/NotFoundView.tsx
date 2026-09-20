"use client";
import * as React from "react";
import { AppShell, type AppShellData, type AppShellHandlers } from "./AppShell";
import { EmptyState } from "./EmptyState";

export interface NotFoundViewProps {
  /** Shell data with `activeTab: null` (404 has no active tab). */
  shell: AppShellData;
  handlers?: AppShellHandlers;
}

/**
 * 404 (`app/not-found.tsx`, exported as 404.html). Title: "Not on any list · RecallIndia".
 * The cobalt-soft panel with "This page isn't on any list" and the "B.No. 404" foil chip (spec §6.14.3).
 */
export function NotFoundView({ shell, handlers }: NotFoundViewProps) {
  return (
    <AppShell {...shell} {...handlers} activeTab={null}>
      <div className="pb-24 pt-16 max-md:pb-10 max-md:pt-6">
        <EmptyState type="not-found" headingAs="h1" />
      </div>
    </AppShell>
  );
}
