"use client";
import * as React from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "onBlue" | "outlineOnBlue" | "danger";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-sans font-semibold " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[.97] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt " +
  "disabled:opacity-40 disabled:pointer-events-none select-none";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-cobalt text-on-cobalt hover:bg-cobalt-hover active:bg-cobalt-press",
  secondary: "bg-surface-1 text-ink border border-line hover:border-line-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
  onBlue: "bg-white text-cobalt hover:bg-cobalt-soft focus-visible:outline-white",
  outlineOnBlue: "bg-transparent text-on-cobalt border border-on-cobalt-line hover:bg-white/10 focus-visible:outline-white",
  danger: "bg-danger text-white hover:bg-danger-hover active:bg-danger-press",
};
const sizes: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-[15px]",
  sm: "h-9 px-4 text-[14px] pointer-coarse:h-11",
};

type Common = { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: React.ReactNode; className?: string; children?: React.ReactNode };
export type ButtonProps = Common & React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
export type LinkButtonProps = Common & React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

function Spinner() {
  return <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

/** Pill button. One `primary` per view. `loading` keeps the label, locks width, sets aria-busy. */
export function Button(props: ButtonProps | LinkButtonProps) {
  const { variant = "primary", size = "md", loading = false, icon, className, children, ...rest } = props;
  const cls = cn(base, variants[variant], sizes[size], className);
  const inner = (<>{loading ? <Spinner /> : icon}{children}</>);
  if ("href" in rest && typeof rest.href === "string") {
    return <a className={cls} aria-busy={loading || undefined} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
  }
  const b = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type={b.type ?? "button"} className={cls} aria-busy={loading || undefined} {...b}>{inner}</button>;
}
