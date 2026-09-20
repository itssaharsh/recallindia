import * as React from "react";
import { cn } from "./cn";
/** White card, radius md (14), 1px line, shadow-1. `as` lets it be an article/section/li. Clickable cards add `interactive`. */
export function Card({ as: Tag = "div", interactive = false, className, children, ...rest }: { as?: "div" | "article" | "section" | "li"; interactive?: boolean; className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        "rounded-md border border-line bg-surface-1 shadow-1",
        interactive && "transition-[border-color,transform] duration-150 hover:border-line-strong pointer-fine:hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-cobalt",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
