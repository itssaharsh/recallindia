"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { useAppState } from "@/components/shell/app-state";

import { EmptyState } from "./empty-state";

/** A route that a later build fills in: says what will be here, why it isn't yet, and the one
 *  place that already shows the same data. */
export function StubPage({
  icon,
  title,
  what,
  why,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  what: string;
  why: React.ReactNode;
  action: { label: string; path: string };
  children?: React.ReactNode;
}) {
  const { href } = useAppState();
  return (
    <section aria-label={title} className="px-5 py-6">
      <h1 className="m-0 font-display text-3xl font-semibold text-ink md:text-4xl">{title}</h1>
      <EmptyState
        icon={icon}
        what={what}
        why={why}
        action={
          <Link
            href={href(action.path)}
            className="inline-flex h-8 items-center rounded-sm border border-line px-2.5 text-sm font-medium text-ink hover:bg-surface-2"
          >
            {action.label}
          </Link>
        }
      />
      {children}
    </section>
  );
}
