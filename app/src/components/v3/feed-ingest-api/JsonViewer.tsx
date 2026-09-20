"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../ui";
import { DESKTOP, useElementHeight, useMediaQuery } from "./hooks";

type Tok = { t: "key" | "str" | "num" | "null" | "bool" | "punc" | "summary"; v: string };
interface Line {
  id: string;
  depth: number;
  toks: Tok[];
  /** Expandable node: path key and state */
  node: { path: string; open: boolean } | null;
  /** Closing bracket line (hidden from the tree) */
  close: boolean;
}

export interface JsonViewerProps {
  value: unknown;
  /** Preferred key order for objects (notice fields in reading order). */
  keyOrder?: string[];
  /** Dim while a new request runs */
  dim?: boolean;
  /** Load sequence: first 18 lines fade up, 12 ms stagger */
  intro?: boolean;
  className?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const scalar = (v: unknown): Tok =>
  v === null ? { t: "null", v: "null" } : typeof v === "string" ? { t: "str", v: JSON.stringify(v) } : typeof v === "number" ? { t: "num", v: String(v) } : typeof v === "boolean" ? { t: "bool", v: String(v) } : { t: "punc", v: "…" };

/** Root and its direct children open; the first element of the first array open; the rest collapsed. */
const defaultOpen = (path: string) => path === "$" || /^\$\.[^.[]+$/.test(path) || /^\$\.[^.[]+\[0\]$/.test(path);

/** Preferred order applies to notice objects only; every other object keeps the order it came in. */
function orderKeys(o: Record<string, unknown>, keyOrder: string[]): string[] {
  const keys = Object.keys(o);
  if (!("notice_id" in o || "pk" in o)) return keys;
  const rank = (k: string) => (keyOrder.includes(k) ? keyOrder.indexOf(k) : keyOrder.length + keys.indexOf(k));
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

function flatten(value: unknown, keyOrder: string[], toggled: ReadonlySet<string>): Line[] {
  const lines: Line[] = [];
  const walk = (v: unknown, key: string | null, depth: number, path: string, last: boolean) => {
    const keyToks: Tok[] = key != null ? [{ t: "key", v: JSON.stringify(key) }, { t: "punc", v: ": " }] : [];
    const comma: Tok[] = last ? [] : [{ t: "punc", v: "," }];
    const container = Array.isArray(v) || isObj(v);
    const size = Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 0;
    if (!container || size === 0) {
      const tok = container ? { t: "punc" as const, v: Array.isArray(v) ? "[]" : "{}" } : scalar(v);
      lines.push({ id: path, depth, toks: [...keyToks, tok, ...comma], node: null, close: false });
      return;
    }
    const open = defaultOpen(path) !== toggled.has(path);
    const [o, c] = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
    if (!open) {
      let summary: Tok[];
      if (Array.isArray(v)) summary = [{ t: "summary", v: `${size} ${size === 1 ? "item" : "items"}` }];
      else {
        const keys = orderKeys(v as Record<string, unknown>, keyOrder);
        summary = keys.slice(0, 2).flatMap((k, i) => {
          const val = (v as Record<string, unknown>)[k];
          const valTok = Array.isArray(val) || isObj(val) ? { t: "punc" as const, v: Array.isArray(val) ? "[…]" : "{…}" } : scalar(val);
          return [...(i ? [{ t: "punc" as const, v: ", " }] : []), { t: "key" as const, v: JSON.stringify(k) }, { t: "punc" as const, v: ": " }, valTok];
        });
        if (keys.length > 2) summary.push({ t: "punc", v: ", " }, { t: "summary", v: `… ${keys.length - 2} more` });
      }
      lines.push({ id: path, depth, toks: [...keyToks, { t: "punc", v: `${o} ` }, ...summary, { t: "punc", v: ` ${c}` }, ...comma], node: { path, open: false }, close: false });
      return;
    }
    lines.push({ id: path, depth, toks: [...keyToks, { t: "punc", v: o }], node: { path, open: true }, close: false });
    if (Array.isArray(v)) v.forEach((item, i) => walk(item, null, depth + 1, `${path}[${i}]`, i === v.length - 1));
    else {
      const keys = orderKeys(v as Record<string, unknown>, keyOrder);
      keys.forEach((k, i) => walk((v as Record<string, unknown>)[k], k, depth + 1, `${path}.${k}`, i === keys.length - 1));
    }
    lines.push({ id: `${path}#close`, depth, toks: [{ t: "punc", v: c }, ...comma], node: null, close: true });
  };
  walk(value, null, 0, "$", true);
  return lines;
}

const TOK: Record<Tok["t"], string> = {
  key: "text-ink",
  str: "text-success",
  num: "text-cobalt",
  null: "text-warning",
  bool: "text-cobalt",
  punc: "text-ink",
  summary: "text-ink-muted italic",
};

/**
 * Pretty JSON as a tree (spec 3.3): line numbers (3.8:1), ▾/▸ carets, 18 px indent, token colours,
 * collapsed summaries. It only ever shows whole lines: the viewport is snapped to the line height.
 * role=tree: ↑/↓ move, → expands, ← collapses, Enter toggles; a long string wraps on click.
 */
export function JsonViewer({ value, keyOrder = [], dim = false, intro = false, className }: JsonViewerProps) {
  const [toggled, setToggled] = React.useState<ReadonlySet<string>>(new Set());
  const [wrapped, setWrapped] = React.useState<ReadonlySet<string>>(new Set());
  const [focus, setFocus] = React.useState(0);
  React.useEffect(() => {
    setToggled(new Set());
    setWrapped(new Set());
    setFocus(0);
  }, [value]);
  const lines = React.useMemo(() => flatten(value, keyOrder, toggled), [value, keyOrder, toggled]);
  const desktop = useMediaQuery(DESKTOP, true);
  const lh = desktop ? 21 : 19;
  const [boxRef, boxH] = useElementHeight<HTMLDivElement>();
  // Whole lines only: the scroll viewport is a multiple of the line height, and the 10 px
  // padding sits outside it (padding inside a scroller would show part of the next line).
  const fit = boxH ? Math.max(lh, Math.floor((boxH - 20) / lh) * lh) : undefined;
  const items = lines.map((l, i) => (l.close ? -1 : i)).filter((i) => i >= 0);
  const scroller = React.useRef<HTMLDivElement>(null);

  const toggle = (path: string) =>
    setToggled((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = items.indexOf(focus);
    const line = lines[focus];
    let next = focus;
    if (e.key === "ArrowDown") next = items[Math.min(items.length - 1, at + 1)];
    else if (e.key === "ArrowUp") next = items[Math.max(0, at - 1)];
    else if (e.key === "ArrowRight" && line?.node && !line.node.open) toggle(line.node.path);
    else if (e.key === "ArrowLeft" && line?.node?.open) toggle(line.node.path);
    else if (e.key === "Enter" && line?.node) toggle(line.node.path);
    else return;
    e.preventDefault();
    setFocus(next);
    scroller.current?.querySelector<HTMLElement>(`[data-line="${next}"]`)?.focus();
  };

  return (
    <div ref={boxRef} className={cn("min-h-0 bg-surface-1 py-2.5", className)}>
      <div
        ref={scroller}
        role="tree"
        aria-label="Response body"
        onKeyDown={onKeyDown}
        style={{ maxHeight: fit }}
        className={cn(
          "overflow-auto font-mono text-[12px] leading-[19px] transition-opacity duration-150 lg:text-[13px] lg:leading-[21px]",
          dim && "opacity-50",
        )}
      >
        {lines.map((l, i) => {
          const Row = intro && i < 18 ? motion.div : "div";
          const introProps = intro && i < 18 ? { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.16, delay: i * 0.012 } } : {};
          const isWrapped = wrapped.has(l.id);
          return (
            <Row
              key={l.id}
              data-line={i}
              role={l.close ? undefined : "treeitem"}
              aria-hidden={l.close || undefined}
              aria-level={l.close ? undefined : l.depth + 1}
              aria-expanded={l.node ? l.node.open : undefined}
              tabIndex={l.close ? undefined : i === focus ? 0 : -1}
              onFocus={() => !l.close && setFocus(i)}
              className="grid grid-cols-[30px_12px_minmax(0,1fr)] items-start hover:bg-cobalt-tint focus-visible:bg-cobalt-tint focus-visible:shadow-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cobalt lg:grid-cols-[44px_16px_minmax(0,1fr)]"
              {...introProps}
            >
              <span aria-hidden className="pr-2.5 text-right text-gutter-ink select-none">
                {i + 1}
              </span>
              {l.node ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={l.node.open ? "Collapse" : "Expand"}
                  onClick={() => toggle(l.node!.path)}
                  className="text-center text-[10px] text-ink-muted hover:text-ink"
                >
                  {l.node.open ? "▾" : "▸"}
                </button>
              ) : (
                <span />
              )}
              <span
                onClick={() => l.toks.some((t) => t.t === "str") && setWrapped((s) => new Set(s).add(l.id))}
                className={cn("pl-[calc(var(--d)*12px)] lg:pl-[calc(var(--d)*18px)]", isWrapped ? "break-all whitespace-normal" : "overflow-hidden text-ellipsis whitespace-nowrap", !l.node?.open && l.node && "text-ink-muted")}
                style={{ ["--d" as string]: l.depth }}
              >
                {l.toks.map((t, k) => (
                  <span key={k} className={TOK[t.t]}>
                    {t.v}
                  </span>
                ))}
              </span>
            </Row>
          );
        })}
      </div>
    </div>
  );
}
