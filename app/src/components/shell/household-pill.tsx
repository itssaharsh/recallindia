"use client";

import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useAppState } from "./app-state";

/**
 * C-03: whose things these are. Everybody lands on the demo household, which is read-only, and
 * "Make my own copy" copies its 15 things into a household of your own (the id lives in
 * localStorage and rides on X-Household). The demo wall is what the video and the README link
 * show, so nobody can change it.
 */
export function HouseholdPill({ inline = false }: { inline?: boolean }) {
  const { demo, household, householdState, householdError, makeCopy, resetCopy, useDemoHousehold } = useAppState();
  const busy = householdState === "creating";
  const own = householdState === "own";
  const short = own ? household.replace(/^hh_/, "").slice(0, 4) : "";

  if (inline) {
    // S3's banner variant: only shown on the demo wall, where it says why nothing can be changed
    if (own || demo) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface-1 px-3 py-2">
        <p className="text-[13px] text-ink">You&apos;re looking at the demo household. It&apos;s read-only.</p>
        <Button size="sm" variant="outline" onClick={() => makeCopy()} disabled={busy}>
          {busy ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : null}
          {busy ? "Copying 15 things…" : "Make my own copy"}
        </Button>
        {householdError && <span className="text-xs text-danger">Couldn&apos;t copy the demo household. Try again.</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        title={own ? `Your household ${household}` : "The demo household is read-only"}
        className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line px-2 text-[12px] text-muted"
      >
        {busy ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : own ? (
          <Check aria-hidden className="size-3.5 text-success" />
        ) : null}
        {busy ? "Copying 15 things…" : own ? `Your household · ${short}` : "Demo household · read-only"}
      </span>
      {!demo &&
        (own ? (
          <button
            type="button"
            onClick={() => resetCopy()}
            disabled={busy}
            className="rounded-sm px-1.5 py-1 text-[12px] text-muted hover:text-ink disabled:opacity-50"
          >
            Reset
          </button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => makeCopy()} disabled={busy}>
            Make my own copy
          </Button>
        ))}
      {own && !demo && (
        <button
          type="button"
          onClick={useDemoHousehold}
          className="rounded-sm px-1.5 py-1 text-[12px] text-muted hover:text-ink"
        >
          View the demo
        </button>
      )}
    </div>
  );
}
