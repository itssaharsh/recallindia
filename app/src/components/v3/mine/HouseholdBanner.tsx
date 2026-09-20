"use client";
/**
 * HouseholdBanner (spec/mine.md §2.1): which household you are looking at, and the one way out of read-only.
 * Matches the cobalt-soft pill under the nav in mockups/mine-1536.png (52 px, full width) and mine-390.png (60 px, radius 14).
 * `role="status"` announces state changes. Reset asks inline, never in a modal.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { House } from "lucide-react";
import { Button, cn } from "../ui";
import { fade180, springPill } from "./motion";
import type { BannerState } from "./types";

export interface HouseholdBannerProps {
  /** demo → copying → own; `own-confirm-reset` can be forced for the kit (`?state=own-confirm-reset`). */
  state: BannerState;
  /** The error text from `POST /households` (state `error`). */
  errorMessage?: string | null;
  /** Number of demo things, for "Reset to the 15 demo things?". */
  demoCount?: number;
  /** `POST /households` */
  onMakeCopy?: () => void;
  /** `POST /households/{id}/reset` */
  onResetCopy?: () => void;
  /** Switch back to the demo household (clears the stored household id). */
  onViewDemo?: () => void;
  className?: string;
}

export function HouseholdBanner({ state, errorMessage, demoCount = 15, onMakeCopy, onResetCopy, onViewDemo, className }: HouseholdBannerProps) {
  const [confirming, setConfirming] = React.useState(state === "own-confirm-reset");
  React.useEffect(() => setConfirming(state === "own-confirm-reset"), [state]);
  const view: BannerState = state === "own" && confirming ? "own-confirm-reset" : state;

  let long: React.ReactNode;
  let short: React.ReactNode;
  switch (view) {
    case "demo":
    case "copying":
      long = (
        <>
          You&rsquo;re looking at the demo household. It&rsquo;s read-only. <span className="text-ink-muted">Copy it to add your own things.</span>
        </>
      );
      short = (
        <>
          <b className="text-[14px]/[1.3] font-semibold text-ink">Read-only demo</b>
          <span className="text-ink-muted">Copy it to add things</span>
        </>
      );
      break;
    case "own":
      long = short = <>This is your copy of the demo household. It lives in this browser.</>;
      break;
    case "own-confirm-reset":
      long = short = (
        <>
          Reset to the {demoCount} demo things? <span className="text-ink-muted">What you added goes.</span>
        </>
      );
      break;
    case "error":
      long = short = <>We couldn&rsquo;t make your copy: {errorMessage ?? "unknown error"}.</>;
      break;
  }

  const actions = (() => {
    switch (view) {
      case "demo":
        return (
          <Button variant="secondary" onClick={onMakeCopy} className="max-md:px-3.5 max-md:text-[14px]">
            Make my own copy
          </Button>
        );
      case "copying":
        return (
          <Button variant="secondary" loading disabled className="max-md:px-3.5 max-md:text-[14px]">
            Making your copy…
          </Button>
        );
      case "own":
        return (
          <>
            <button
              type="button"
              onClick={onViewDemo}
              className="hidden h-11 rounded-pill px-3 text-[14px] font-semibold text-cobalt underline-offset-4 hover:underline md:inline-flex md:items-center"
            >
              View the demo household
            </button>
            <Button variant="secondary" onClick={() => setConfirming(true)} className="max-md:px-3.5 max-md:text-[14px]">
              Reset my copy
            </Button>
          </>
        );
      case "own-confirm-reset":
        return (
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} className="max-md:px-3.5 max-md:text-[14px]">
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onResetCopy?.();
              }}
              className="max-md:px-3.5 max-md:text-[14px]"
            >
              Reset my copy
            </Button>
          </>
        );
      case "error":
        return (
          <Button variant="secondary" onClick={onMakeCopy} className="max-md:px-3.5 max-md:text-[14px]">
            Try again
          </Button>
        );
    }
  })();

  return (
    <div
      role="status"
      className={cn(
        "mt-3.5 flex min-h-[60px] items-center gap-2.5 rounded-md bg-cobalt-soft py-2 pr-2 pl-3",
        "md:mt-4 md:min-h-[52px] md:gap-3 md:rounded-pill md:py-1 md:pr-1 md:pl-1.5",
        className,
      )}
    >
      <span aria-hidden className="hidden size-11 flex-none place-items-center rounded-full bg-surface-1 text-cobalt md:grid">
        <House className="size-5" strokeWidth={1.9} />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={view === "copying" ? "demo" : view}
          className="m-0 min-w-0 flex-1 font-sans text-[13px]/[1.3] font-medium text-ink md:text-[15px]/[1.4]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade180}
        >
          <span className="hidden md:inline">{long}</span>
          <span className="flex flex-col gap-0.5 md:hidden">{short}</span>
        </motion.p>
      </AnimatePresence>
      <motion.div layout transition={springPill} className="flex flex-none items-center gap-1.5">
        {actions}
      </motion.div>
    </div>
  );
}
