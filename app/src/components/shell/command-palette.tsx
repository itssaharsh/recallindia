"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import { SOURCE_LABEL } from "@/lib/format";

type Row = { id: string; label: string; hint?: string; run: () => void };

/**
 * C-22: one key reaches every route, every source filter and the household actions. It opens
 * instantly (no animation) and closes on a 150 ms fade, and the rows are the same words the
 * screens use.
 */
export function CommandPalette() {
  const router = useRouter();
  const { household, makeCopy, resetCopy, useDemoHousehold: viewDemoHousehold } = useAppState();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const go = useCallback(
    (path: string) => () => {
      setOpen(false);
      router.push(path);
    },
    [router],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((was) => !was);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      // "g f" / "g i" / "g m" / "g a": go, then the route's letter (no animation, UI-SPEC C-01)
      if (event.key.toLowerCase() === "g") {
        setPending("g");
        window.setTimeout(() => setPending((p) => (p === "g" ? null : p)), 1200);
        return;
      }
      if (pending === "g") {
        const path = { f: "/", i: "/ingest/", m: "/mine/", a: "/api/" }[event.key.toLowerCase()];
        setPending(null);
        if (path) {
          event.preventDefault();
          router.push(path);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, router]);

  const rows: { group: string; items: Row[] }[] = [
    {
      group: "Go to",
      items: [
        { id: "feed", label: "Go to feed", hint: "g f", run: go("/") },
        { id: "ingest", label: "Go to ingest", hint: "g i", run: go("/ingest/") },
        { id: "mine", label: "Go to my things", hint: "g m", run: go("/mine/") },
        { id: "api", label: "Go to the API", hint: "g a", run: go("/api/") },
      ],
    },
    {
      group: "Filter the feed",
      items: Object.entries(SOURCE_LABEL)
        .filter(([id]) => id !== "siam")
        .map(([id, label]) => ({ id: `source-${id}`, label: `Filter feed: ${label}`, run: go(`/?source=${id}`) })),
    },
    {
      group: "This household",
      items: [
        { id: "add", label: "Add a thing", run: go("/mine/?add=1") },
        household === "demo"
          ? { id: "copy", label: "Make my own copy", run: () => void makeCopy().then(() => setOpen(false)) }
          : { id: "reset", label: "Reset my household to the demo items", run: () => void resetCopy().then(() => setOpen(false)) },
        ...(household === "demo"
          ? []
          : [{
              id: "demo",
              label: "View the demo household",
              run: () => {
                viewDemoHousehold();
                setOpen(false);
              },
            }]),
        { id: "replay", label: "Replay the last ingest run", run: go("/ingest/") },
      ],
    },
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Search pages, sources and household actions"
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 p-4 pt-[12vh] data-[state=closed]:opacity-0"
    >
      <div className="w-full max-w-[640px] overflow-hidden rounded-lg border border-line bg-surface-1 shadow-[var(--shadow-2)]">
        <Command.Input
          placeholder="Search pages, sources, cases…"
          className="h-12 w-full border-b border-line bg-surface-1 px-4 text-[15px] text-ink outline-none placeholder:text-muted"
        />
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-[14px] text-muted">Nothing matches that.</Command.Empty>
          {rows.map(({ group, items }) => (
            <Command.Group
              key={group}
              heading={group}
              className="px-1 py-1 text-[12px] font-bold tracking-[0.08em] text-muted uppercase [&_[cmdk-group-items]]:mt-1"
            >
              {items.map((row) => (
                <Command.Item
                  key={row.id}
                  value={row.label}
                  onSelect={row.run}
                  className="flex h-10 cursor-pointer items-center justify-between rounded-md px-3 text-[15px] text-ink normal-case data-[selected=true]:bg-accent-soft"
                >
                  {row.label}
                  {row.hint && (
                    <kbd className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-muted">{row.hint}</kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </div>
    </Command.Dialog>
  );
}

/** The hint that says the palette exists (rail footer, header on a phone). */
export function CommandHint({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
      className={`inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-surface-2 hover:text-ink ${className ?? ""}`}
    >
      Search or jump
      <kbd className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
    </button>
  );
}
