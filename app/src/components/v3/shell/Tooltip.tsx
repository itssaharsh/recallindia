"use client";
import * as React from "react";
import { cn } from "../ui";

/**
 * Light tooltip (spec §6.12) without Radix: ink face, white 13 px Onest 500, padding 8 10,
 * radius 6, 5 px arrow, max-width 260. 600 ms first delay, then instant for 300 ms after one closes.
 * Required on disabled buttons and icon-only buttons. The bubble stays mounted (hidden) so
 * `aria-describedby` always resolves.
 */
let lastClosedAt = 0;

export type TooltipSide = "top" | "bottom";

export function Tooltip({
  content, side = "top", align = "center", children, className,
}: { content: React.ReactNode; side?: TooltipSide; align?: "start" | "center" | "end"; children: React.ReactElement<{ "aria-describedby"?: string }>; className?: string }) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  const show = () => {
    window.clearTimeout(timer.current);
    const warm = Date.now() - lastClosedAt < 300;
    timer.current = window.setTimeout(() => setOpen(true), warm ? 0 : 600);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen((was) => {
      if (was) lastClosedAt = Date.now();
      return false;
    });
  };
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}
      onKeyDown={(e) => { if (e.key === "Escape") hide(); }}
    >
      {React.cloneElement(children, { "aria-describedby": id })}
      <TooltipBubble
        id={id} side={side} align={align}
        className={cn(
          "pointer-events-none absolute z-50 w-max transition-opacity duration-180 ease-out",
          side === "top" ? "bottom-[calc(100%+9px)]" : "top-[calc(100%+9px)]",
          align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        {content}
      </TooltipBubble>
    </span>
  );
}

/** The bubble on its own (the kit shows it statically). */
export function TooltipBubble({
  children, side = "top", align = "start", id, className,
}: { children: React.ReactNode; side?: TooltipSide; align?: "start" | "center" | "end"; id?: string; className?: string }) {
  const arrowX = align === "start" ? "left-6" : align === "end" ? "right-6" : "left-1/2 -translate-x-1/2";
  return (
    <span role="tooltip" id={id} className={cn("inline-block max-w-[260px] rounded-xs bg-ink px-2.5 py-2 text-[13px] font-medium leading-[1.35] text-white", className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute size-0 border-x-[5px] border-x-transparent",
          side === "top" ? "-bottom-[5px] border-t-[5px] border-t-ink" : "-top-[5px] border-b-[5px] border-b-ink",
          arrowX,
        )}
      />
    </span>
  );
}
