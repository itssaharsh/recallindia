"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button, cn } from "../ui";
import { IconRingCheck, IconRingPlus } from "./icons";
import { fadeOut, springFast } from "./motion";

/**
 * Toasts (spec §6.11). Three kinds:
 * - success: ring-check in success · "Claim letter ready" / "Evidence sealed · VERIFIED" · action "Open case"
 * - neutral: ring-plus in cobalt · "Your household is ready" / "15 things copied. The demo is unchanged."
 * - sourceDown: danger-soft disc with a danger dot · "{Source} didn't answer" / "Showing notices from {HH:MM}. Retrying at {HH:MM}."
 * Toasts confirm what finished; they never carry an alert and are never the only place information appears.
 *
 * Two ways to use them:
 * 1. sonner (in the repo's stack): <Toaster {...sonnerToasterProps} /> and
 *    toast.custom((id) => <ToastCard {...data} onDismiss={() => toast.dismiss(id)} />).
 *    `sonnerToastOptions.classNames` also styles plain toast()/toast.success() calls.
 * 2. No sonner: <ShellToaster /> + shellToast.show(data). Same look, spec motion exactly.
 */
export type ToastKind = "success" | "neutral" | "sourceDown";

export interface ToastData {
  id?: string;
  kind: ToastKind;
  title: string;
  description?: string;
  /** Appended to the description in success 600 +0.02em ("VERIFIED"). */
  emphasis?: string;
  /** One action at most, named for its result. */
  action?: { label: string; href?: string; onClick?: () => void };
  /** Show the 32 px close button (when there is no action). */
  dismissible?: boolean;
  /** ms; default 5000. `Infinity` keeps it (kit screenshots). */
  duration?: number;
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "success") return <IconRingCheck size={30} className="shrink-0 text-success" />;
  if (kind === "neutral") return <IconRingPlus size={30} className="shrink-0 text-cobalt" />;
  return (
    <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-full bg-danger-soft">
      <span className="size-2.5 rounded-full bg-danger" />
    </span>
  );
}

/** The toast face. 400 wide (phone: 100 % − 32), padding 14 14 14 16, radius 14, shadow-2. */
export function ToastCard({ kind, title, description, emphasis, action, dismissible, onDismiss, className }: ToastData & { onDismiss?: () => void; className?: string }) {
  return (
    <div
      role={kind === "sourceDown" ? "alert" : "status"}
      className={cn(
        "grid w-[400px] max-w-full items-center gap-3 rounded-md border border-line bg-surface-1 py-3.5 pl-4 pr-3.5 font-sans shadow-2 max-md:w-full",
        action || dismissible ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[auto_1fr]",
        className,
      )}
    >
      <ToastIcon kind={kind} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-[1.3] text-ink">{title}</p>
        {(description || emphasis) && (
          <p className="text-[13.5px] leading-[1.35] text-ink-muted">
            {description}
            {emphasis && <span className="font-semibold tracking-[0.02em] text-success">{emphasis}</span>}
          </p>
        )}
      </div>
      {action ? (
        action.href ? (
          <Button variant="secondary" size="sm" href={action.href} onClick={action.onClick}>{action.label}</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={action.onClick}>{action.label}</Button>
        )
      ) : dismissible ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="grid size-8 place-items-center rounded-full text-ink-muted transition-colors duration-180 ease-out hover:bg-surface-2 hover:text-ink pointer-coarse:size-11"
        >
          <X size={16} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ sonner
/**
 * sonner `toastOptions` for <Toaster>: unstyled, with the classes of ToastCard mapped onto
 * sonner's slots (keys match sonner 2's `ToastClassnames`). Plain `toast.success(title, { description })`
 * then looks right; for the exact icons and the emphasis span use `toast.custom` + ToastCard.
 */
export const sonnerToastOptions = {
  unstyled: true,
  classNames: {
    toast:
      "group grid w-[400px] max-md:w-[calc(100vw-32px)] grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-md border border-line bg-surface-1 py-3.5 pl-4 pr-3.5 font-sans shadow-2",
    content: "min-w-0",
    title: "text-[15px] font-semibold leading-[1.3] text-ink",
    description: "text-[13.5px] leading-[1.35] text-ink-muted",
    icon: "grid size-[30px] place-items-center [&>svg]:size-[30px]",
    actionButton:
      "inline-flex h-9 items-center rounded-pill border border-line-strong bg-surface-1 px-3.5 text-[14px] font-semibold text-ink transition-colors duration-180 hover:bg-surface-2 pointer-coarse:h-11",
    cancelButton: "inline-flex h-9 items-center rounded-pill px-3.5 text-[14px] font-semibold text-ink-muted hover:bg-surface-2",
    closeButton: "grid size-8 place-items-center rounded-full text-ink-muted hover:bg-surface-2 pointer-coarse:size-11",
    success: "[&_[data-icon]]:text-success",
    info: "[&_[data-icon]]:text-cobalt",
    error: "[&_[data-icon]]:text-danger",
    warning: "[&_[data-icon]]:text-warning",
    loading: "[&_[data-icon]]:text-cobalt",
    default: "",
  },
} as const;

/** sonner icons that match the kit (pass as `icons` on <Toaster>). */
export const sonnerIcons = {
  success: <IconRingCheck size={30} />,
  info: <IconRingPlus size={30} />,
  error: (
    <span className="grid size-[30px] place-items-center rounded-full bg-danger-soft">
      <span className="size-2.5 rounded-full bg-danger" />
    </span>
  ),
};

/**
 * <Toaster {...sonnerToasterProps} />: bottom-right 24 px from the edges on desktop; on phones
 * bottom-centre, 12 px above the 64 px tab bar. Max 3 visible, 5 s dwell (sonner pauses on hover).
 */
export const sonnerToasterProps = {
  position: "bottom-right",
  offset: 24,
  mobileOffset: { bottom: "calc(76px + env(safe-area-inset-bottom))", left: "16px", right: "16px" },
  visibleToasts: 3,
  duration: 5000,
  gap: 12,
  icons: sonnerIcons,
  toastOptions: sonnerToastOptions,
} as const;

// ------------------------------------------------------------------ light local toaster
type Entry = ToastData & { id: string };
let entries: Entry[] = [];
const listeners = new Set<() => void>();
const EMPTY: Entry[] = [];
let seq = 0;
function emit() { listeners.forEach((l) => l()); }

/** Imperative API for <ShellToaster>. */
export const shellToast = {
  show(data: ToastData): string {
    const id = data.id ?? `t${++seq}`;
    entries = [...entries.filter((e) => e.id !== id), { ...data, id }];
    emit();
    return id;
  },
  dismiss(id: string) {
    entries = entries.filter((e) => e.id !== id);
    emit();
  },
  clear() {
    entries = [];
    emit();
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/**
 * Local toaster (no sonner): newest on top, max 3. In from 12 px below with opacity (250 ms spring),
 * 5 s dwell paused on hover and focus, out in 180 ms (--ease-in, opacity + 8 px).
 */
export function ShellToaster({ max = 3 }: { max?: number }) {
  const list = React.useSyncExternalStore(subscribe, () => entries, () => EMPTY);
  const visible = list.slice(-max).reverse();
  return (
    <section
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-6 right-6 z-[70] flex w-[400px] flex-col gap-3 max-md:inset-x-4 max-md:bottom-[calc(76px+env(safe-area-inset-bottom))] max-md:w-auto"
    >
      <AnimatePresence initial={false}>
        {visible.map((t) => <ToastItem key={t.id} toast={t} />)}
      </AnimatePresence>
    </section>
  );
}

function ToastItem({ toast }: { toast: Entry }) {
  const [paused, setPaused] = React.useState(false);
  const duration = toast.duration ?? 5000;
  React.useEffect(() => {
    if (paused || !Number.isFinite(duration)) return;
    const t = window.setTimeout(() => shellToast.dismiss(toast.id), duration);
    return () => window.clearTimeout(t);
  }, [paused, duration, toast.id]);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: springFast }}
      exit={{ opacity: 0, y: 8, transition: fadeOut }}
      className="pointer-events-auto"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ToastCard {...toast} onDismiss={() => shellToast.dismiss(toast.id)} />
    </motion.div>
  );
}
