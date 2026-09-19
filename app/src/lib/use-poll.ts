"use client";

import { useEffect, useRef } from "react";

/**
 * Run `tick` now and every `ms` while the tab is visible; stop when `enabled` is false or the
 * component unmounts. Ticks never overlap: the next one waits for the previous to settle.
 */
export function usePoll(tick: (signal: AbortSignal) => Promise<unknown> | void, ms: number, enabled = true) {
  const saved = useRef(tick);
  saved.current = tick;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const run = async () => {
      if (stopped) return;
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        controller = new AbortController();
        try {
          await saved.current(controller.signal);
        } catch {
          // the caller renders its own error state; polling carries on
        }
      }
      if (!stopped) timer = setTimeout(run, ms);
    };
    run();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [ms, enabled]);
}
