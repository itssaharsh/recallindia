"use client";
/**
 * AddThingSheet (spec/mine.md §2.11): add one thing in under 20 seconds.
 * Matches mockups/mine-add-1536.png (1180 px bottom sheet, top edge at y 155 over a 50% ink scrim) and
 * mine-add-390.png (full-height bottom sheet from y 28 with a grab handle and a sticky CTA footer).
 *
 * Steps: scan (ScanConfirm for medicine; a form for vehicles and appliances) → checking (the new card in its
 * checking face) → added (the same card flipped to its result). The card carries layoutId `item-{id}`, so on
 * "Show it in My things" it flies from the sheet into its slot on the wall.
 *
 * a11y: role="dialog", aria-modal, labelled by the h2, focus trapped; initial focus on [data-autofocus]
 * ("Take or choose a photo"); Esc closes, or asks "Discard this thing?" inline when there are edits;
 * focus returns to the opener. The kind switch is a tablist with arrow keys.
 * Motion: scrim 0 → 1 in 200 ms; sheet rises on a 320/34 spring; closes in 240 ms. At 390 dragging the
 * handle down more than 30% of the height, or flinging faster than 500 px/s, closes it.
 */
import * as React from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useDragControls, type PanInfo } from "framer-motion";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { Button, cn } from "../ui";
import { displayName, fmtTime } from "./derive";
import { ItemCard, type ItemCardActions } from "./ItemCard";
import { CategoryMark } from "./illustrations";
import { sheetOut, springPill, springSheet } from "./motion";
import { ScanConfirm, type ScanConfirmProps } from "./ScanConfirm";
import type { AddKind, CheckStatus, Face, HouseholdItem, HouseholdMode, NewItem, NoticeView, SheetStep, VehicleOptions } from "./types";

export interface AddThingSheetProps {
  open: boolean;
  kind: AddKind;
  step: SheetStep;
  household: HouseholdMode;
  /** Scan step (medicine): everything ScanConfirm needs except household and onSubmit. */
  scan: Omit<ScanConfirmProps, "household" | "onSubmit" | "onDirtyChange">;
  /** Checking and added steps: the new item (from `POST /items`), its face and its check status. */
  item?: HouseholdItem | null;
  face?: Face;
  check?: CheckStatus | null;
  notice?: NoticeView | null;
  sourcesCount?: number;
  /** `POST /households` then `POST /items` is running. */
  submitting?: boolean;
  vehicleOptions?: VehicleOptions;
  onKindChange?: (kind: AddKind) => void;
  onClose: () => void;
  /** "Check this batch" / "Check this vehicle" / "Check this model". */
  onSubmit?: (item: NewItem) => void;
  onShowInMyThings?: (itemId: string) => void;
  cardActions?: ItemCardActions;
}

const KINDS: { value: AddKind; long: string; short: string; mark: "medicine" | "vehicle" | "appliance" }[] = [
  { value: "medicine", long: "Medicine strip", short: "Medicine", mark: "medicine" },
  { value: "vehicle", long: "Vehicle", short: "Vehicle", mark: "vehicle" },
  { value: "appliance", long: "Appliance or other", short: "Appliance", mark: "appliance" },
];

const STEP1: Record<AddKind, string> = { medicine: "Scan the strip", vehicle: "Enter the vehicle", appliance: "Enter the model" };

/* ------------------------------------------------------------ focus trap */

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const sel = 'a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';
    const t = window.setTimeout(() => {
      const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(sel);
      first?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const list = Array.from(el.querySelectorAll<HTMLElement>(sel)).filter((n) => n.offsetParent !== null);
      if (!list.length) return;
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [active, ref]);
}

/* ------------------------------------------------------------- the forms */

const selectCls =
  "h-11 w-full min-w-0 appearance-none rounded-sm border border-line-strong bg-surface-1 pr-9 pl-3 font-sans text-[16px] font-medium text-ink " +
  "focus:border-cobalt focus:shadow-[0_0_0_1px_var(--cobalt),0_0_0_4px_var(--cobalt-soft)] focus:outline-none";
const inputCls =
  "h-11 w-full min-w-0 rounded-sm border border-line-strong bg-surface-1 px-3 font-sans text-[16px] font-medium text-ink placeholder:font-normal placeholder:text-ink-muted " +
  "focus:border-cobalt focus:shadow-[0_0_0_1px_var(--cobalt),0_0_0_4px_var(--cobalt-soft)] focus:outline-none";

function Labeled({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-[13px]/[1.3] font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({ id, value, onChange, children, placeholder }: { id: string; value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder: string }) {
  return (
    <div className="relative">
      <select id={id} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          {placeholder}
        </option>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted" />
    </div>
  );
}

function FormCta({ label, enabled, submitting, household, onClick }: { label: string; enabled: boolean; submitting: boolean; household: HouseholdMode; onClick: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto border-t border-line bg-surface-1 px-4 pt-3 pb-3.5 md:static md:mx-0 md:mt-6 md:max-w-[484px] md:border-t-0 md:px-0 md:pt-0 md:pb-0">
      <Button className="h-[52px]! w-full text-[16px]!" disabled={!enabled || submitting} loading={submitting} onClick={onClick}>
        {label}
        <ArrowRight className="size-[18px]" strokeWidth={2.2} aria-hidden />
      </Button>
      <p className="m-0 mt-2 text-center font-sans text-[12px]/[1.4] text-ink-muted md:mt-2.5 md:text-[13px]/[1.4]">
        Checks CDSCO, CPSC, NHTSA and openFDA
        {household === "demo" ? <span className="hidden md:inline"> · saves to your own copy</span> : null}
      </p>
    </div>
  );
}

function VehicleForm({ options, household, submitting, onSubmit, onDirty }: { options?: VehicleOptions; household: HouseholdMode; submitting: boolean; onSubmit?: (i: NewItem) => void; onDirty: () => void }) {
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  const [year, setYear] = React.useState("");
  const id = React.useId();
  const models = (make && options?.models[make]) || [];
  const ok = make && model && year;
  return (
    <div className="flex min-h-full flex-col">
      <h3 className="m-0 mt-1 font-display text-[24px]/[1.08] font-extrabold tracking-[-0.03em] text-ink md:mt-0 md:text-[30px]/[1.08]">Which vehicle is it?</h3>
      <p className="m-0 mt-2 max-w-[560px] font-sans text-[15px]/[1.5] text-ink-muted">We match vehicles by make, model and year.</p>
      <div className="mt-5 grid max-w-[720px] grid-cols-1 gap-4 md:grid-cols-3">
        <Labeled label="Make" id={`${id}-make`}>
          <Select id={`${id}-make`} value={make} placeholder="Choose a make" onChange={(v) => (setMake(v), setModel(""), onDirty())}>
            {(options?.makes ?? []).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Labeled>
        <Labeled label="Model" id={`${id}-model`}>
          <Select id={`${id}-model`} value={model} placeholder="Choose a model" onChange={(v) => (setModel(v), onDirty())}>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Labeled>
        <Labeled label="Year" id={`${id}-year`}>
          <Select id={`${id}-year`} value={year} placeholder="Choose a year" onChange={(v) => (setYear(v), onDirty())}>
            {(options?.years ?? []).map((y) => (
              <option key={y}>{y}</option>
            ))}
          </Select>
        </Labeled>
      </div>
      <FormCta
        label="Check this vehicle"
        enabled={Boolean(ok)}
        submitting={submitting}
        household={household}
        onClick={() =>
          onSubmit?.({
            kind: "vehicle",
            name: `${make} ${model}`,
            brand: make,
            make: make.toLowerCase().replace(/^maruti suzuki$/, "maruti"),
            model: model.toLowerCase(),
            year: Number(year),
            reg_no: null,
          })
        }
      />
    </div>
  );
}

function ModelForm({ household, submitting, onSubmit, onDirty }: { household: HouseholdMode; submitting: boolean; onSubmit?: (i: NewItem) => void; onDirty: () => void }) {
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [cat, setCat] = React.useState<"appliance" | "other">("appliance");
  const id = React.useId();
  const ok = brand.trim() && model.trim();
  return (
    <div className="flex min-h-full flex-col">
      <h3 className="m-0 mt-1 font-display text-[24px]/[1.08] font-extrabold tracking-[-0.03em] text-ink md:mt-0 md:text-[30px]/[1.08]">What is it?</h3>
      <p className="m-0 mt-2 max-w-[560px] font-sans text-[15px]/[1.5] text-ink-muted">Type the brand and the model number from the label.</p>
      <div className="mt-5 grid max-w-[720px] grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_200px]">
        <Labeled label="Brand" id={`${id}-brand`}>
          <input id={`${id}-brand`} className={inputCls} value={brand} placeholder="Havells" autoComplete="off" onChange={(e) => (setBrand(e.target.value), onDirty())} />
        </Labeled>
        <Labeled label="Model" id={`${id}-model`}>
          <input id={`${id}-model`} className={inputCls} value={model} placeholder="Efficiencia Neo" autoComplete="off" onChange={(e) => (setModel(e.target.value), onDirty())} />
        </Labeled>
        <Labeled label="Category" id={`${id}-cat`}>
          <Select id={`${id}-cat`} value={cat} placeholder="Category" onChange={(v) => (setCat(v as "appliance" | "other"), onDirty())}>
            <option value="appliance">Appliance</option>
            <option value="other">Other</option>
          </Select>
        </Labeled>
      </div>
      <FormCta
        label="Check this model"
        enabled={Boolean(ok)}
        submitting={submitting}
        household={household}
        onClick={() => onSubmit?.({ kind: cat, name: `${brand.trim()} ${model.trim()}`, brand: brand.trim(), model: model.trim() })}
      />
    </div>
  );
}

/* ------------------------------------------------------------- the sheet */

export function AddThingSheet(props: AddThingSheetProps) {
  const { open, onClose } = props;
  return (
    <MotionConfig reducedMotion="user">
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="scrim"
            aria-hidden
            className="fixed inset-0 z-40 bg-scrim-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, transition: sheetOut }}
            onClick={onClose}
          />
          <SheetPanel key="sheet" {...props} />
        </>
      ) : null}
    </AnimatePresence>
    </MotionConfig>
  );
}

function SheetPanel({
  kind,
  step,
  household,
  scan,
  item,
  face = "checking",
  check,
  notice,
  sourcesCount = 4,
  submitting = false,
  vehicleOptions,
  onKindChange,
  onClose,
  onSubmit,
  onShowInMyThings,
  cardActions,
}: AddThingSheetProps) {
  const panelRef = React.useRef<HTMLElement>(null);
  const titleId = React.useId();
  const drag = useDragControls();
  const [dirty, setDirty] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  useFocusTrap(panelRef, true);

  const requestClose = React.useCallback(() => {
    if (dirty && step === "scan") setConfirmDiscard(true);
    else onClose();
  }, [dirty, step, onClose]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (confirmDiscard) setConfirmDiscard(false);
      else requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmDiscard, requestClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const h = panelRef.current?.offsetHeight ?? 800;
    if (info.offset.y > h * 0.3 || info.velocity.y > 500) requestClose();
  };

  const stepNo = step === "scan" ? 1 : step === "checking" ? 2 : 3;
  const tabKeys = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = KINDS[(i + (e.key === "ArrowRight" ? 1 : -1) + KINDS.length) % KINDS.length]!;
    onKindChange?.(next.value);
    const list = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    list?.[KINDS.indexOf(next)]?.focus();
  };

  const subject = item ? (item.batch ?? displayName(item)) : "";
  const caseHref = (id: string) => cardActions?.caseHref?.(id) ?? `/case/?id=${encodeURIComponent(id)}`;
  const settled = step === "added" && face !== "checking";

  return (
    <motion.section
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-lg bg-surface-1 shadow-sheet",
        "max-md:top-7",
        // 635 px tall at 1536 × 790 (top edge at y 155); the same height on every step so the sheet never jumps
        "md:mx-auto md:h-[min(635px,calc(100dvh-155px))] md:w-[min(1180px,calc(100%-64px))]",
      )}
      initial={{ y: "100%" }}
      animate={{ y: 0, transition: springSheet }}
      exit={{ y: "100%", transition: sheetOut }}
      drag="y"
      dragListener={false}
      dragControls={drag}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 1 }}
      onDragEnd={onDragEnd}
    >
      {/* grab handle (390): the whole strip above the header starts the drag */}
      <div aria-hidden className="flex flex-none touch-none justify-center pt-2 md:hidden" onPointerDown={(e) => drag.start(e)}>
        <span className="h-[5px] w-10 rounded-[3px] bg-line" />
      </div>

      <header className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pt-1 pr-3 pb-2.5 pl-4 md:h-[72px] md:flex-nowrap md:gap-6 md:py-0 md:pr-5 md:pl-7">
        <h2 id={titleId} className="m-0 flex-none font-display text-[22px]/none font-extrabold tracking-[-0.03em] whitespace-nowrap text-ink md:text-[26px]/none">
          Add a thing
        </h2>
        <div className="order-3 basis-full md:order-none md:basis-auto">
          <LayoutGroup id="add-kind">
            <div role="tablist" aria-label="What are you adding" className="flex gap-1 rounded-pill bg-surface-2 p-1">
              {KINDS.map((k, i) => {
                const on = k.value === kind;
                return (
                  <button
                    key={k.value}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => onKindChange?.(k.value)}
                    onKeyDown={(e) => tabKeys(e, i)}
                    className={cn(
                      "relative inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-pill px-2.5 font-sans text-[14px]/none whitespace-nowrap md:flex-none md:px-3.5",
                      on ? "font-semibold text-ink" : "font-medium text-ink-muted hover:text-ink",
                    )}
                  >
                    {on ? <motion.span layoutId="kind-active" transition={springPill} className="absolute inset-0 rounded-pill bg-surface-1 shadow-1" /> : null}
                    <span className="relative inline-flex items-center gap-2">
                      <CategoryMark kind={k.mark} />
                      <span className="md:hidden">{k.short}</span>
                      <span className="hidden md:inline">{k.long}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </div>
        <ol aria-label="Progress" className="m-0 ml-auto hidden list-none items-center gap-2.5 p-0 font-sans text-[14px]/none font-medium text-ink-muted md:flex">
          {[STEP1[kind], "Check 4 sources", "Added"].map((label, i) => {
            const now = i + 1 === stepNo;
            return (
              <React.Fragment key={label}>
                {i > 0 ? <span aria-hidden className="h-[1.5px] w-5 bg-line" /> : null}
                <li aria-current={now ? "step" : undefined} className={cn("inline-flex items-center gap-2 whitespace-nowrap", now && "font-semibold text-ink")}>
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full border-[1.5px] text-[12px]/none font-bold",
                      now ? "border-cobalt bg-cobalt text-white shadow-[0_0_0_4px_var(--cobalt-soft)]" : "border-line-strong text-ink-muted",
                    )}
                  >
                    {i + 1}
                  </span>
                  {label}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
        <button
          type="button"
          aria-label="Close"
          onClick={requestClose}
          className="order-2 ml-auto grid size-11 flex-none place-items-center rounded-full border border-line text-ink-muted hover:bg-surface-2 hover:text-ink md:order-none md:ml-1"
        >
          <X className="size-[18px]" strokeWidth={2.2} />
        </button>
      </header>

      {confirmDiscard ? (
        <div role="alert" className="flex flex-none flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-4 py-3 md:px-7">
          <p className="m-0 flex-1 font-sans text-[15px] font-medium text-ink">Discard this thing? Nothing has been saved.</p>
          <Button variant="secondary" onClick={onClose}>
            Discard
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
            Keep editing
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 md:px-7 md:pt-5 md:pb-6">
        {step === "scan" ? (
          kind === "medicine" ? (
            <ScanConfirm {...scan} household={household} submitting={submitting} onSubmit={onSubmit} onDirtyChange={setDirty} />
          ) : kind === "vehicle" ? (
            <VehicleForm options={vehicleOptions} household={household} submitting={submitting} onSubmit={onSubmit} onDirty={() => setDirty(true)} />
          ) : (
            <ModelForm household={household} submitting={submitting} onSubmit={onSubmit} onDirty={() => setDirty(true)} />
          )
        ) : item ? (
          <div className="flex min-h-full flex-col pb-4 md:pb-0">
            <h3 className="m-0 font-display text-[24px]/[1.08] font-extrabold tracking-[-0.03em] text-ink md:text-[30px]/[1.08]" aria-live="polite">
              {!settled
                ? `Checking ${subject} against ${sourcesCount} sources`
                : face === "alert"
                  ? `This ${item.kind === "medicine" ? "batch" : item.kind === "vehicle" ? "vehicle" : "model"} is on a notice`
                  : `No match in ${sourcesCount} sources as of ${fmtTime(item.last_checked_at)}`}
            </h3>
            <div className="mt-4 md:mt-5">
              <ItemCard
                key={item.item_id}
                item={item}
                face={face}
                check={check}
                notice={notice}
                sourcesCount={sourcesCount}
                household={household}
                layoutId={`item-${item.item_id}`}
                hideCaseButton
                {...cardActions}
              />
            </div>
            {settled ? (
              <div className="mt-5 flex flex-wrap gap-3">
                {face === "alert" && item.case_id ? (
                  <Button variant="danger" href={caseHref(item.case_id)}>
                    Open case
                    <ArrowRight className="size-[18px]" strokeWidth={2.2} aria-hidden />
                  </Button>
                ) : null}
                <Button variant={face === "alert" ? "secondary" : "primary"} onClick={() => onShowInMyThings?.(item.item_id)}>
                  Show it in My things
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}
