"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "../ui";
import { springFast } from "./motion";

/**
 * A light local toast (sonner is not available in the type-check sandbox). Same look as the shell's
 * sonner toast: white, radius 14, shadow-2, bottom-right, 12 px above the phone tab bar, one action named
 * for its result, 4 s dwell. The message itself is announced by the page's live region, so this is not live.
 * In the repo you can swap `useCaseToast().show` for sonner's `toast()`; the call sites stay the same.
 */
export interface ToastModel { id: number; text: string; action?: { label: string; onClick: () => void } }

export function useCaseToast(dwellMs = 4000) {
  const [toast, setToast] = React.useState<ToastModel | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = React.useCallback((text: string, action?: ToastModel["action"]) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setToast(null), dwellMs);
  }, [dwellMs]);
  const dismiss = React.useCallback(() => setToast(null), []);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, show, dismiss };
}

export function CaseToast({ toast, onDismiss }: { toast: ToastModel | null; onDismiss: () => void }) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="pointer-events-none fixed right-6 bottom-6 z-50 flex w-[min(440px,calc(100vw-32px))] justify-end max-md:right-4 max-md:bottom-[calc(64px+12px+env(safe-area-inset-bottom))]"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            transition={springFast}
            className="pointer-events-auto flex w-full items-center gap-3 rounded-md border border-line bg-surface-1 py-3 pr-3 pl-4 shadow-2"
          >
            <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full bg-success-soft text-success">
              <Check className="size-4" strokeWidth={2.8} />
            </span>
            <span className="min-w-0 flex-1 text-[14px] leading-[1.4] font-medium text-ink">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => { toast.action?.onClick(); onDismiss(); }}
                className={cn(
                  "h-9 flex-none rounded-pill px-3.5 text-[14px] font-semibold text-cobalt transition-colors duration-150 hover:bg-cobalt-soft",
                  "pointer-coarse:h-11",
                )}
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
