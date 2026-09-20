"use client";
/**
 * Presentational hooks for /case. None of them fetch: they turn a stream of states into what is shown,
 * and handle scroll, media and clocks.
 */
import * as React from "react";
import { animate } from "framer-motion";
import { DWELL_MS, EASE_IN_OUT, type Bezier } from "./motion";
import type { CaseStatus, CaseUiState } from "./types";

/** true after the first commit: gate enter animations so a page that loads in a state shows its final frame. */
export function useLive(): boolean {
  const [live, setLive] = React.useState(false);
  React.useEffect(() => setLive(true), []);
  return live;
}

/** The previous render's value. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = React.useRef<{ cur: T; prev: T | undefined }>({ cur: value, prev: undefined });
  if (ref.current.cur !== value) {
    ref.current.prev = ref.current.cur;
    ref.current.cur = value;
  }
  return ref.current.prev;
}

export function useMedia(query: string, fallback = false): boolean {
  const subscribe = React.useCallback((cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  }, [query]);
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => fallback);
}

/** Maps `GET /cases/{id}` onto the page state (the verify result decides verified vs invalid). */
export function uiStateFrom(status: CaseStatus, opts: { demo: boolean; tampered?: boolean; failed?: boolean }): CaseUiState {
  if (opts.failed) return "failed";
  switch (status) {
    case "waiting_approval": return opts.demo ? "readonly" : "waiting";
    case "approving": return "approving";
    case "sealing": return "sealing";
    case "writing_letter": return "writing";
    case "verifying": return "verifying";
    case "verified": return opts.tampered ? "invalid" : "verified";
    case "rejected": return "rejected";
    case "expired": return "expired";
  }
}

const CHAIN: CaseUiState[] = ["approving", "sealing", "writing", "verifying", "verified"];

/**
 * Minimum-dwell queue (spec §4). Feed it the latest state from polling; it returns the state to show.
 * Each running phase stays up for at least its dwell, skipped phases are filled in, and the order is kept.
 * The durations printed on the page always come from the API: this only delays when a change is shown.
 */
export function useCasePhase(latest: CaseUiState, dwell: Partial<Record<CaseUiState, number>> = DWELL_MS): CaseUiState {
  const [shown, setShown] = React.useState<CaseUiState>(latest);
  const queue = React.useRef<CaseUiState[]>([]);
  const shownAt = React.useRef<number>(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownRef = React.useRef(shown);
  shownRef.current = shown;

  const pump = React.useCallback(() => {
    if (timer.current) return;
    const next = queue.current[0];
    if (!next) return;
    const cur = shownRef.current;
    const wait = Math.max(0, (dwell[cur] ?? 0) - (performance.now() - shownAt.current));
    timer.current = setTimeout(() => {
      timer.current = null;
      const n = queue.current.shift();
      if (n) { shownAt.current = performance.now(); setShown(n); shownRef.current = n; }
      pump();
    }, wait);
  }, [dwell]);

  React.useEffect(() => {
    const tail = queue.current[queue.current.length - 1] ?? shownRef.current;
    if (latest === tail) return;
    const a = CHAIN.indexOf(tail);
    const b = CHAIN.indexOf(latest);
    if (a >= 0 && b > a) queue.current.push(...CHAIN.slice(a + 1, b + 1));
    else if ((tail === "waiting" || tail === "readonly") && b >= 0) queue.current.push(...CHAIN.slice(0, b + 1));
    else queue.current.push(latest);
    pump();
  }, [latest, pump]);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return shown;
}

/** 100 ms clock while `running` (the aside's "{elapsed} s"). */
export function useElapsed(running: boolean, override?: number): number {
  const [ms, setMs] = React.useState(0);
  React.useEffect(() => {
    if (!running || override != null) return;
    const t0 = performance.now();
    setMs(0);
    const id = setInterval(() => setMs(performance.now() - t0), 100);
    return () => clearInterval(id);
  }, [running, override]);
  return override ?? ms;
}

/** Visible fraction of an element, via IntersectionObserver. */
export function useVisibleRatio(id: string, enabled = true): number {
  const [ratio, setRatio] = React.useState(0);
  React.useEffect(() => {
    if (!enabled) return;
    const el = document.getElementById(id);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setRatio(e.intersectionRatio), { threshold: [0, 0.3, 0.6, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [id, enabled]);
  return ratio;
}

/** Timestamp (performance.now) of the user's last scroll/wheel/touch/key input. */
export function useLastUserScroll(): React.RefObject<number> {
  const last = React.useRef(-Infinity);
  React.useEffect(() => {
    const mark = () => { last.current = performance.now(); };
    const opts = { passive: true } as const;
    window.addEventListener("wheel", mark, opts);
    window.addEventListener("touchmove", mark, opts);
    window.addEventListener("keydown", mark);
    return () => {
      window.removeEventListener("wheel", mark);
      window.removeEventListener("touchmove", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);
  return last;
}

/**
 * rAF page scroll to `top`, cancelled by any wheel, touch or key input (spec B1b, X5).
 * Returns a cancel function.
 */
export function scrollPageTo(top: number, durationMs: number, ease: Bezier = EASE_IN_OUT): () => void {
  const target = Math.max(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));
  const controls = animate(window.scrollY, target, {
    duration: durationMs / 1000,
    ease,
    onUpdate: (y) => window.scrollTo(0, y),
  });
  const cancel = () => {
    controls.stop();
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("touchstart", cancel);
    window.removeEventListener("keydown", cancel);
  };
  window.addEventListener("wheel", cancel, { passive: true });
  window.addEventListener("touchstart", cancel, { passive: true });
  window.addEventListener("keydown", cancel);
  controls.then(cancel);
  return cancel;
}
