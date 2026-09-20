"use client";
/**
 * A light stand-in for sonner (shell-tokens.md §6.11), used only when the page passes no `onToast`.
 * In the repo, pass `onToast={(t) => toast(t.title, { action: { label: t.actionLabel, onClick: t.onAction } })}`.
 * Bottom-right 24 px (bottom-centre above the tab bar on phones), 400 wide, radius 14, shadow-2,
 * in from 12 px below on a spring, 5 s dwell paused on hover and focus, out in 180 ms.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, X } from "lucide-react";
import { Button } from "../ui";
import type { MineToast } from "./types";

export function LocalToast({ toast, onDismiss }: { toast: MineToast | null; onDismiss: () => void }) {
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    if (!toast || paused) return;
    const t = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(t);
  }, [toast, paused, onDismiss]);
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(64px+12px+env(safe-area-inset-bottom))] z-30 flex justify-center md:inset-x-auto md:right-6 md:bottom-6">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            role="status"
            className="pointer-events-auto grid w-full grid-cols-[30px_1fr_auto] items-center gap-3 rounded-md border border-line bg-surface-1 py-3.5 pr-3.5 pl-4 shadow-2 md:w-[400px]"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { type: "spring", bounce: 0.1, duration: 0.25 } }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.18, ease: [0.55, 0, 0.75, 0.2] } }}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <span aria-hidden className="grid size-[30px] place-items-center rounded-full bg-cobalt-soft text-cobalt">
              <ArrowDownRight className="size-4" strokeWidth={2.2} />
            </span>
            <p className="m-0 font-sans text-[14px]/[1.45] text-ink">{toast.title}</p>
            {toast.actionLabel ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  toast.onAction?.();
                  onDismiss();
                }}
              >
                {toast.actionLabel}
              </Button>
            ) : (
              <button type="button" aria-label="Dismiss" onClick={onDismiss} className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-surface-2">
                <X className="size-4" />
              </button>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
