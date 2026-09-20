"use client";
import * as React from "react";

/** SSR-safe media query. Returns `fallback` on the server and on the first client render. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/** Phone layout: below 768 px (spec §3). */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere. Renders "⌘K" until mounted (no hydration mismatch). */
export function useModKeyLabel(): string {
  const [label, setLabel] = React.useState("⌘K");
  React.useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? nav.platform ?? "";
    if (!/mac|iphone|ipad|ipod/i.test(platform)) setLabel("Ctrl K");
  }, []);
  return label;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Opens the palette on ⌘K, Ctrl K, or "/" when focus is not in a text field (spec §6.5). */
export function usePaletteHotkeys(onOpen: () => void, enabled = true): void {
  const ref = React.useRef(onOpen);
  ref.current = onOpen;
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        ref.current();
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** True once `active` has stayed true for `delayMs` (skeletons appear only after 300 ms). */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const t = window.setTimeout(() => setOn(true), delayMs);
    return () => window.clearTimeout(t);
  }, [active, delayMs]);
  return on;
}

/** Calls `fn(value)` after `delayMs` of quiet (palette typing: 150 ms). */
export function useDebouncedCallback<T>(fn: ((v: T) => void) | undefined, delayMs: number): (v: T) => void {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  return React.useCallback(
    (v: T) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => fnRef.current?.(v), delayMs);
    },
    [delayMs],
  );
}

/**
 * Ticks an integer from 1 to `to` over `durationMs` while `running` (household copy: 1 → 15 in 1.2 s),
 * then calls `onDone` once. For demos and the kit; the real copy reports progress as items are written.
 */
export function useTicker(running: boolean, to: number, durationMs = 1200, onDone?: () => void): number {
  const [n, setN] = React.useState(running ? 1 : 0);
  const done = React.useRef(onDone);
  done.current = onDone;
  React.useEffect(() => {
    if (!running) return;
    setN(1);
    const step = durationMs / Math.max(1, to - 1);
    let i = 1;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= to) {
        window.clearInterval(id);
        done.current?.();
      }
    }, step);
    return () => window.clearInterval(id);
  }, [running, to, durationMs]);
  return n;
}

/** Width of an element, kept current with a ResizeObserver (used to spring the household pill's width). */
export function useElementWidth<T extends HTMLElement>(): [React.RefCallback<T>, number | undefined] {
  const [width, setWidth] = React.useState<number | undefined>(undefined);
  const observer = React.useRef<ResizeObserver | null>(null);
  const ref = React.useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(node);
  }, []);
  React.useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}
