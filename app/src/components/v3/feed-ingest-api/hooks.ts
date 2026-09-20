"use client";
import * as React from "react";

/** `matchMedia` as state. Server snapshot is `fallback`, so SSR and the first client render agree. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/** Desktop layout switch used by all three screens (the mockups are 1536 and 390). */
export const DESKTOP = "(min-width: 1024px)";

/** Copy text; `copied` stays true for 1.6 s (spec: inline "Copied", no toast). */
export function useCopy(ms = 1600): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const copy = React.useCallback(
    (text: string) => {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), ms);
    },
    [ms],
  );
  return { copied, copy };
}

/** Border-box height of an element, kept current with ResizeObserver. */
export function useElementHeight<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [h, setH] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setH(e.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height));
    ro.observe(el);
    setH(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}

/** Locks body scroll while `active` (the notice sheet). */
export function useBodyScrollLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/**
 * Dialog focus: moves focus to `initial` on mount, traps Tab inside `container`, and returns
 * focus to whatever had it before (the notice row) on unmount.
 */
export function useFocusTrap(container: React.RefObject<HTMLElement | null>, initial: React.RefObject<HTMLElement | null>): void {
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    initial.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !container.current) return;
      const items = [...container.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [container, initial]);
}

/** True when the key event comes from a text field (so single-key shortcuts stay out of the way). */
export function isTyping(e: KeyboardEvent | React.KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

/** Calls `fn` `ms` after the last change of `value` (search: 250 ms). */
export function useDebounced<T>(value: T, ms: number, fn: (v: T) => void): void {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => fnRef.current(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
}

/** Roving focus for a toolbar / list: arrow keys move between `[data-rove]` children. */
export function onRoveKeyDown(e: React.KeyboardEvent<HTMLElement>, keys: { next: string[]; prev: string[] } = { next: ["ArrowRight"], prev: ["ArrowLeft"] }): void {
  const dir = keys.next.includes(e.key) ? 1 : keys.prev.includes(e.key) ? -1 : 0;
  if (!dir) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-rove]")];
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  items[(i + dir + items.length) % items.length]?.focus();
}
