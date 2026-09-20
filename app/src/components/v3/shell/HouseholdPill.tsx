"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { ChevronDown, CopyPlus, Info, PencilLine, RotateCcw, Trash2 } from "lucide-react";
import { cn } from "../ui";
import { IconHouse, ProgressRing } from "./icons";
import { fadeOut, numberFlowTiming, springFast, springFlip } from "./motion";
import { useElementWidth } from "./hooks";
import type { HouseholdAction, HouseholdState } from "./types";

export interface HouseholdPillProps {
  state: HouseholdState;
  /** md: 40 px desktop nav. compact: 36 px mobile top bar, drops "· read-only" / "· {count} things". */
  size?: "md" | "compact";
  /** Detail text ("· read-only", "· 15 things"): shown, hidden, or hidden below 1024 px (tablet rule). */
  detail?: "show" | "hide" | "responsive";
  /** Menu actions. The shell only reports them; the page performs them. */
  onAction?: (action: HouseholdAction) => void;
  /** Kit only: draw the hover state. */
  forceHover?: boolean;
  /** Kit only: render with the menu open. */
  defaultMenuOpen?: boolean;
  className?: string;
}

type MenuItem = { id: HouseholdAction; label: string; icon: React.ReactNode; primary?: boolean };

const DEMO_MENU: MenuItem[] = [
  { id: "make-copy", label: "Make my own copy", icon: <CopyPlus size={18} />, primary: true },
  { id: "explain-demo", label: "What is the demo household?", icon: <Info size={18} /> },
];
const YOURS_MENU: MenuItem[] = [
  { id: "rename", label: "Rename", icon: <PencilLine size={18} /> },
  { id: "reset", label: "Reset to demo", icon: <RotateCcw size={18} /> },
  { id: "delete", label: "Delete my copy", icon: <Trash2 size={18} /> },
];

/**
 * Household pill (spec §6.4). Says whose things you are looking at and whether you can change them.
 * demo → copying → yours: each state cross-fades in 320 ms and the pill width springs (320 ms, bounce 0.1).
 * `aria-live` announces "Copying {total} things" once and "Done" at the end.
 */
export function HouseholdPill({ state, size = "md", detail = "show", onAction, forceHover, defaultMenuOpen = false, className }: HouseholdPillProps) {
  const compact = size === "compact";
  const copying = state.kind === "copying";
  const interactive = !copying;
  const menuId = React.useId();
  const [menuOpen, setMenuOpen] = React.useState(defaultMenuOpen);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [measureRef, width] = useElementWidth<HTMLSpanElement>();

  // live announcements
  const [live, setLive] = React.useState("");
  const prevKind = React.useRef(state.kind);
  React.useEffect(() => {
    const prev = prevKind.current;
    prevKind.current = state.kind;
    if (state.kind === "copying" && prev !== "copying") setLive(`Copying ${state.total} things`);
    else if (prev === "copying" && state.kind !== "copying") setLive("Done");
  }, [state]);

  React.useEffect(() => { if (copying) setMenuOpen(false); }, [copying]);

  const detailCls = detail === "hide" || compact ? "hidden" : detail === "responsive" ? "max-lg:hidden" : "";
  const iconSize = compact ? 16 : 18;

  let content: React.ReactNode;
  if (state.kind === "demo") {
    content = (
      <>
        <IconHouse size={iconSize} className="shrink-0 text-cobalt" />
        <b className="font-semibold text-ink">Demo household</b>
        <span className={detailCls}>· read-only</span>
      </>
    );
  } else if (state.kind === "copying") {
    content = (
      <>
        <ProgressRing value={state.copied / state.total} size={compact ? 16 : 18} />
        <b className="font-semibold text-cobalt">
          Copying <NumberFlow value={state.copied} {...numberFlowTiming} className="tabular-nums" /> of {state.total}
        </b>
      </>
    );
  } else {
    content = (
      <>
        <span className={cn("-ml-1 grid shrink-0 place-items-center rounded-full bg-cobalt", compact ? "size-5" : "size-[22px]")}>
          <IconHouse size={compact ? 12 : 14} className="text-white" />
        </span>
        <b className="font-semibold text-ink">{state.name ?? "Your household"}</b>
        <span className={detailCls}>· {state.count} things</span>
        {!compact && <ChevronDown size={16} aria-hidden className="-mr-1 shrink-0 text-ink-muted" />}
      </>
    );
  }

  const items = state.kind === "yours" ? YOURS_MENU : DEMO_MENU;

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        data-part="household"
        aria-haspopup={interactive ? "menu" : undefined}
        aria-expanded={interactive ? menuOpen : undefined}
        aria-controls={interactive && menuOpen ? menuId : undefined}
        aria-disabled={copying || undefined}
        onClick={() => interactive && setMenuOpen((o) => !o)}
        onKeyDown={(e) => {
          if (interactive && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setMenuOpen(true);
          }
        }}
        initial={false}
        animate={{ width: width === undefined ? "auto" : width + 2 }}
        transition={springFlip}
        className={cn(
          "relative inline-flex items-center whitespace-nowrap rounded-pill border font-medium leading-none",
          "transition-[background-color,border-color,color] duration-320 ease-out",
          // 44 px hit area on touch without changing the drawn 36/40 px pill
          "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1 pointer-coarse:after:content-['']",
          compact ? "h-9 text-[13px]" : "h-10 text-[14px]",
          copying
            ? "cursor-default border-cobalt-soft bg-cobalt-soft text-cobalt"
            : cn("border-line bg-surface-1 text-ink-muted hover:bg-surface-2", (forceHover || menuOpen) && "bg-surface-2"),
        )}
      >
        <span className="flex h-full w-full items-center overflow-hidden rounded-pill">
        <span ref={measureRef} className={cn("relative inline-flex shrink-0 items-center", compact ? "gap-1.5 pl-2.5 pr-3" : "gap-2 pl-3 pr-3.5")}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={state.kind}
              className={cn("inline-flex items-center", compact ? "gap-1.5" : "gap-2")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {content}
            </motion.span>
          </AnimatePresence>
        </span>
        </span>
      </motion.button>
      <span className="sr-only" aria-live="polite">{live}</span>
      <AnimatePresence>
        {menuOpen && interactive && (
          <HouseholdMenu
            id={menuId}
            items={items}
            anchorRef={buttonRef}
            onClose={(refocus) => {
              setMenuOpen(false);
              if (refocus) buttonRef.current?.focus();
            }}
            onSelect={(a) => {
              setMenuOpen(false);
              buttonRef.current?.focus();
              onAction?.(a);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Light dropdown menu (no Radix): role="menu", arrow keys, Home/End, Esc and outside click close. */
function HouseholdMenu({
  id, items, anchorRef, onClose, onSelect,
}: { id: string; items: MenuItem[]; anchorRef: React.RefObject<HTMLButtonElement | null>; onClose: (refocus: boolean) => void; onSelect: (a: HouseholdAction) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;

  React.useEffect(() => {
    itemRefs.current[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchorRef.current?.contains(t)) closeRef.current(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [anchorRef]);

  const move = (delta: number | "first" | "last") => {
    const list = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = delta === "first" ? 0 : delta === "last" ? list.length - 1 : (i + delta + list.length) % list.length;
    list[next]?.focus();
  };

  return (
    <motion.div
      ref={ref}
      id={id}
      role="menu"
      aria-label="Household"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0, transition: springFast }}
      exit={{ opacity: 0, transition: fadeOut }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
        else if (e.key === "Home") { e.preventDefault(); move("first"); }
        else if (e.key === "End") { e.preventDefault(); move("last"); }
        else if (e.key === "Escape") { e.preventDefault(); onClose(true); }
        else if (e.key === "Tab") onClose(false);
      }}
      className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[248px] rounded-md border border-line bg-surface-1 p-1.5 shadow-2"
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => { itemRefs.current[i] = el; }}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => onSelect(item.id)}
          className={cn(
            "flex h-11 w-full items-center gap-2.5 whitespace-nowrap rounded-sm px-3 text-left text-[14px] leading-none outline-none",
            "transition-colors duration-180 ease-out hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:shadow-[inset_0_0_0_2px_var(--cobalt)]",
            item.primary ? "font-semibold text-cobalt" : "font-medium text-ink [&>svg]:text-ink-muted",
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </motion.div>
  );
}
