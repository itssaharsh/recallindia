"use client";
import * as React from "react";
import { ArrowRight, Lock, X } from "lucide-react";
import { Button, Chip, FoilChip, cn, type ButtonVariant } from "../../ui";
import { HouseholdPill } from "../HouseholdPill";
import { FilterBar, IconButton, SearchField, SourceChip, TextField, type FilterOption } from "../primitives";
import { TooltipBubble } from "../Tooltip";
import { IconAlert, IconCheck, IconNear, IconRingCheck, IconSpinner } from "../icons";
import { KitSection, Lab, Note, Panel, PanelHead } from "./parts";
import type { HouseholdAction, HouseholdItem, HouseholdState, SourceStat } from "../types";

// ------------------------------------------------------------------ 04 Buttons
type Col = "rest" | "hover" | "press" | "focus" | "disabled" | "loading";
const COLS: Col[] = ["rest", "hover", "press", "focus", "disabled", "loading"];

/**
 * Forced hover/press/focus looks for the matrix. ui/Button has no forced-state prop, so the kit
 * draws them with inline styles taken from spec §6.1 (inline style wins over the classes).
 */
const FORCED: Record<ButtonVariant, Partial<Record<Col, React.CSSProperties>>> = {
  primary: { hover: { background: "var(--cobalt-hover)" }, press: { background: "var(--cobalt-press)", transform: "scale(.97)" } },
  secondary: { hover: { background: "var(--surface-2)" }, press: { background: "var(--surface-2)", borderColor: "var(--ink-muted)", transform: "scale(.97)" } },
  ghost: { hover: { background: "var(--surface-2)", color: "var(--ink)" }, press: { background: "#DCE5F1", color: "var(--ink)", transform: "scale(.97)" } },
  danger: { hover: { background: "var(--danger-hover)" }, press: { background: "var(--danger-press)", transform: "scale(.97)" } },
  onBlue: { hover: { background: "var(--cobalt-soft)" }, press: { background: "#D9E5F8", transform: "scale(.97)" } },
  outlineOnBlue: { hover: { background: "rgb(255 255 255 / .12)" }, press: { background: "rgb(255 255 255 / .20)", transform: "scale(.97)" } },
};

const ROWS: { variant: ButtonVariant; name: string; note: string; label: string; arrow?: boolean }[] = [
  { variant: "primary", name: "Primary", note: "One per view", label: "Approve claim letter" },
  { variant: "secondary", name: "Secondary", note: "White, line-strong border", label: "Make my own copy" },
  { variant: "ghost", name: "Ghost", note: "No fill at rest", label: "Show work" },
  { variant: "danger", name: "Danger", note: "Only \"Open case\" on an alert", label: "Open case", arrow: true },
];
const BLUE_ROWS: typeof ROWS = [
  { variant: "onBlue", name: "On blue", note: "White pill, cobalt label", label: "Check what you own" },
  { variant: "outlineOnBlue", name: "Outline on blue", note: "34% white border", label: "Open the live feed" },
];

function MatrixButton({ variant, col, label, arrow, onBlue }: { variant: ButtonVariant; col: Col; label: string; arrow?: boolean; onBlue?: boolean }) {
  const style: React.CSSProperties = { ...(FORCED[variant][col] ?? {}) };
  if (col === "focus") style.boxShadow = onBlue ? "var(--focus-ring-onblue)" : "var(--focus-ring)";
  return (
    <Button variant={variant} disabled={col === "disabled"} loading={col === "loading"} style={style} tabIndex={col === "rest" ? 0 : -1}>
      {label}
      {arrow && col !== "loading" && <ArrowRight size={18} aria-hidden />}
    </Button>
  );
}

function MatrixRows({ rows, onBlue }: { rows: typeof ROWS; onBlue?: boolean }) {
  return (
    <>
      {rows.map((r, ri) => (
        <React.Fragment key={r.variant}>
          <div className={cn("py-[18px] text-[14px] font-semibold leading-[1.3]", onBlue ? "text-white" : "text-ink", (ri > 0 || !onBlue) && (onBlue ? "border-t border-white/18" : "border-t border-line"))}>
            {r.name}
            <span className={cn("mt-[3px] block text-[12.5px] font-normal leading-[1.35]", onBlue ? "text-on-cobalt-muted" : "text-ink-muted")}>{r.note}</span>
          </div>
          {COLS.map((c) => (
            <div key={c} className={cn("py-[18px]", (ri > 0 || !onBlue) && (onBlue ? "border-t border-white/18" : "border-t border-line"))}>
              <MatrixButton variant={r.variant} col={c} label={r.label} arrow={r.arrow} onBlue={onBlue} />
            </div>
          ))}
        </React.Fragment>
      ))}
    </>
  );
}

export function KitButtons() {
  return (
    <KitSection id="buttons" n="04" title="Buttons" lede="Pills, 44 px tall, labels that name the result. Hover changes colour in 180 ms, press scales to 0.97 in 120 ms, focus draws a 2 px cobalt ring with a 2 px gap. Loading keeps the label and the width.">
      <Panel className="overflow-x-auto">
        <div className="min-w-[1180px]">
          <div className="grid grid-cols-[150px_repeat(6,1fr)] items-center">
            <div />
            {COLS.map((c) => <div key={c} className="pb-3.5 text-[12px] font-semibold capitalize tracking-[0.02em] text-ink-muted">{c}</div>)}
            <MatrixRows rows={ROWS} />
          </div>
          <div data-surface="cobalt" className="-mx-6 mt-2.5 grid grid-cols-[150px_repeat(6,1fr)] items-center rounded-lg bg-cobalt px-6 pb-2 pt-1.5">
            <MatrixRows rows={BLUE_ROWS} onBlue />
          </div>
          <div className="mt-[22px] flex flex-wrap items-center gap-3.5 border-t border-line pt-[22px]">
            <Lab className="mr-1.5">Sizes</Lab>
            {/* ui/Button has no lg size yet: 54 / 0 26 / 17 px via style (see README) */}
            <Button style={{ height: 54, paddingInline: 26, fontSize: 17 }}>Check what you own</Button><Note>lg 54 · landing</Note>
            <Button>Add a thing</Button><Note>md 44 · default</Note>
            <Button variant="secondary" size="sm">Check again</Button><Note>sm 36 · dense rows, 44 px hit area</Note>
            <IconButton label="Close" variant="outline"><X size={20} aria-hidden /></IconButton><Note>icon 44</Note>
            <span className="relative ml-auto"><TooltipBubble side="top">Read the notice first. Approve unlocks at the end of it.</TooltipBubble></span>
          </div>
        </div>
      </Panel>
    </KitSection>
  );
}

// ------------------------------------------------------------------ 05 Chips & foil
/** Chip md (32 px, 13 px, padding 12, gap 7) composed around ui/Chip, which only has sm (see README). */
function ChipMd({ children, ...p }: React.ComponentProps<typeof Chip>) {
  return <span className="inline-flex [&>span]:h-8 [&>span]:gap-[7px] [&>span]:px-3 [&>span]:text-[13px]"><Chip {...p}>{children}</Chip></span>;
}

export interface KitChipsProps {
  sources: SourceStat[];
  items: HouseholdItem[];
  asOf: string;
  sourcesCount: number;
  batch: string;
  nearBatch: string;
  lockedUntil: string;
}

export function filterOptions(items: HouseholdItem[]): FilterOption[] {
  const n = (p: (i: HouseholdItem) => boolean) => items.filter(p).length;
  return [
    { id: "all", label: "All", count: items.length },
    { id: "alert", label: "On a notice", count: n((i) => i.face === "alert"), lead: { type: "alert" } },
    { id: "medicine", label: "Medicines", count: n((i) => i.kind === "medicine"), lead: { type: "category", category: "medicine" } },
    { id: "vehicle", label: "Vehicles", count: n((i) => i.kind === "vehicle"), lead: { type: "category", category: "vehicle" } },
    { id: "appliance", label: "Appliances", count: n((i) => i.kind === "appliance"), lead: { type: "category", category: "appliance" } },
    { id: "other", label: "Other", count: n((i) => i.kind === "other"), lead: { type: "category", category: "other" } },
  ];
}

/** Index of the first character where two codes differ ("FT5428" vs "FT5427" → [5]). */
function diffIndexes(a: string, b: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

export function KitChips({ sources, items, asOf, sourcesCount, batch, nearBatch, lockedUntil }: KitChipsProps) {
  const [filter, setFilter] = React.useState("all");
  const diff = diffIndexes(nearBatch, batch);
  // ui/Chip has no white-space: nowrap yet (spec §6.2); the cell supplies it and clips at 390
  const cell = "flex min-h-[58px] min-w-0 items-center overflow-hidden whitespace-nowrap border-t border-line py-[13px] pr-3 [&_p]:whitespace-normal";
  return (
    <KitSection id="chips" n="05" title="Chips & foil" lede={<>Status chips say what happened in two or three words. <b>Squares are categories, circles are status.</b> Foil chips carry codes exactly as printed on the strip.</>}>
      <div className="grid grid-cols-12 gap-4 max-md:grid-cols-1">
        <Panel className="col-span-7 max-lg:col-span-12 max-md:col-span-1">
          <div className="grid grid-cols-[100px_.8fr_1.15fr_1.5fr] max-md:grid-cols-[70px_minmax(0,1fr)_minmax(0,1fr)] max-md:[&>*:nth-child(4n)]:hidden">
            <Lab className="pb-3">Status</Lab><Lab className="pb-3">sm · 26</Lab><Lab className="pb-3">md · 32</Lab><Lab className="pb-3">Used for</Lab>
            <div className={cn(cell, "text-[14px] font-semibold")}>Alert</div>
            <div className={cell}><Chip tone="alert"><IconAlert size={14} />On a notice</Chip></div>
            <div className={cell}><ChipMd tone="alert"><IconAlert size={16} />Same batch</ChipMd></div>
            <div className={cell}><Note>Something you own matches a notice</Note></div>
            <div className={cn(cell, "text-[14px] font-semibold")}>Clear</div>
            <div className={cell}><Chip tone="clear"><IconCheck size={14} />No match</Chip></div>
            <div className={cell}><ChipMd tone="clear"><IconRingCheck size={16} />VERIFIED</ChipMd></div>
            <div className={cell}><Note>No match in {sourcesCount} sources as of {asOf}; seal verified</Note></div>
            <div className={cn(cell, "text-[14px] font-semibold")}>Hold</div>
            <div className={cell}><Chip tone="hold"><IconNear size={14} />Near miss</Chip></div>
            <div className={cell}><ChipMd tone="hold" dot pulse>Waiting for you</ChipMd></div>
            <div className={cell}><Note>Same medicine, other batch; approval gate open</Note></div>
            <div className={cn(cell, "text-[14px] font-semibold")}>Info</div>
            <div className={cell}><Chip tone="info"><IconSpinner size={14} />Checking</Chip></div>
            <div className={cell}><ChipMd tone="info"><Lock size={16} aria-hidden />Locked until {lockedUntil}</ChipMd></div>
            <div className={cell}><Note>Work in progress; neutral facts</Note></div>
          </div>
          <div className="mt-[22px] border-t border-line pt-5">
            <Lab className="mb-3 block">Sources</Lab>
            <div className="flex flex-wrap gap-2.5">{sources.map((s) => <SourceChip key={s.source} source={s} />)}</div>
            <Lab className="mb-3 mt-5 block">Filters</Lab>
            <FilterBar label="Filter your things" options={filterOptions(items)} value={filter} onChange={setFilter} forceHoverId={filter === "all" ? "alert" : undefined} />
          </div>
        </Panel>
        <Panel className="col-span-5 max-lg:col-span-12 max-md:col-span-1">
          <PanelHead title="Foil chips" note="Doto 900 on the foil gradient" />
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-[22px] gap-y-[18px]">
            <FoilChip code={batch} size="lg" /><Note><b>lg · 52 px, 36 px type.</b> Case header, the near-miss comparison, the scan result.</Note>
            <FoilChip code={batch} /><Note><b>md · 34 px, 22 px type.</b> Item cards and the notice as published.</Note>
            <FoilChip code={batch} size="sm" /><Note><b>sm · 28 px, 17 px type.</b> Feed rows, palette results, phone cards.</Note>
          </div>
          <div className="mt-[22px] border-t border-line pt-5">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="flex flex-col gap-1.5"><span className="text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-ink-muted">Yours</span><FoilChip code={nearBatch} size="lg" diff={diff} /></div>
              <span aria-label="does not equal" className="font-display text-[24px] font-bold leading-none text-warning">≠</span>
              <div className="flex flex-col gap-1.5"><span className="text-[11px] font-semibold uppercase leading-none tracking-[0.06em] text-ink-muted">Listed</span><FoilChip code={batch} size="lg" diff={diff} /></div>
            </div>
            <Note className="mt-3.5">Near miss: the character that differs gets a 3 px warning underline on both chips. Same medicine and maker, different batch.</Note>
          </div>
          <div className="mt-[18px] flex items-center gap-3 rounded-md bg-danger px-4 py-3.5 text-[14px] font-semibold leading-[1.3] text-white">
            <FoilChip code={batch} />On an alert face the chip keeps its foil. It never turns red.
          </div>
        </Panel>
      </div>
    </KitSection>
  );
}

// ------------------------------------------------------------------ 06 Inputs & household
export interface KitInputsProps {
  batch: string;
  /** Household size (15): the copying count ticks up to it. */
  thingsCount: number;
  onHouseholdAction?: (a: HouseholdAction) => void;
}

export function KitInputs({ batch, thingsCount, onHouseholdAction }: KitInputsProps) {
  const states: { state: HouseholdState; title: string; body: string }[] = [
    { state: { kind: "demo", household_id: "demo", count: thingsCount }, title: "Demo · read-only", body: "Anyone can look. Nothing can change." },
    { state: { kind: "copying", copied: 9, total: thingsCount }, title: "Copying", body: `Count ticks 1 → ${thingsCount}, about 1.2 s` },
    { state: { kind: "yours", household_id: "yours", count: thingsCount }, title: "Your household", body: "Saved to your device. Menu: rename, reset." },
  ];
  const typo = `${batch.slice(0, 4)} ${batch.slice(4)}`;
  return (
    <KitSection id="inputs" n="06" title="Inputs & household" lede={<>Inputs are 48 px, radius 8, with a 3.3:1 border. Errors use <b>warning</b>, not red: red means something you own is affected, not that you mistyped.</>}>
      <div className="grid grid-cols-12 items-start gap-4 max-md:grid-cols-1">
        <Panel className="col-span-7 max-lg:col-span-12 max-md:col-span-1">
          <div className="grid grid-cols-3 gap-[22px] max-md:grid-cols-1">
            <div className="grid gap-1.5"><TextField label="Batch number" placeholder={`e.g. ${batch}`} helper="As printed after B.No. on the strip" /><Lab className="mt-1.5">Rest</Lab></div>
            <div className="grid gap-1.5"><TextField label="Batch number" defaultValue={batch.slice(0, 4)} forceFocus helper="As printed after B.No. on the strip" /><Lab className="mt-1.5">Focus</Lab></div>
            <div className="grid gap-1.5"><TextField label="Batch number" defaultValue={typo} error={`Batch codes have no spaces. Type it as printed: ${batch}`} /><Lab className="mt-1.5">Error</Lab></div>
          </div>
          <div className="mt-[26px] grid grid-cols-[1.4fr_1fr] gap-[22px] max-md:grid-cols-1">
            <div className="grid gap-2">
              <SearchField label="Search the feed" placeholder="Medicine, batch, product or maker" />
              <Note>Search fields are pills on surface-2, no border</Note>
            </div>
            <div className="grid content-start gap-2">
              <span className="text-[14px] font-semibold leading-none text-ink">Scan result</span>
              <div className="flex items-center gap-3 rounded-sm border border-line-strong bg-surface-1 px-3.5 py-2.5">
                <FoilChip code={batch} />
                <span className="text-[14px] font-medium leading-[1.3] text-ink-muted">Read by Textract<br />from your photo</span>
              </div>
              <Note>The batch morphs from the photo into this chip</Note>
            </div>
          </div>
        </Panel>
        <Panel className="col-span-5 max-lg:col-span-12 max-md:col-span-1">
          <PanelHead title="Household pill" note="Top nav, right side" />
          <div className="grid gap-3.5">
            {states.map((s) => (
              <div key={s.title} className="grid grid-cols-[1fr_auto] items-center gap-3.5 rounded-md border border-line bg-canvas px-4 py-3.5 max-md:grid-cols-1">
                <div>
                  <p className="text-[14px] font-semibold leading-[1.2] text-ink">{s.title}</p>
                  <p className="mt-[3px] text-[13px] leading-[1.4] text-ink-muted">{s.body}</p>
                </div>
                <HouseholdPill state={s.state} onAction={onHouseholdAction} className="max-md:justify-self-start" />
              </div>
            ))}
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] font-medium leading-[1.4] text-ink-muted">
            <b className="font-semibold text-ink">Make my own copy</b><ArrowRight size={16} aria-hidden className="text-cobalt" />
            copying, 320 ms cross-fade per state<ArrowRight size={16} aria-hidden className="text-cobalt" />
            toast "Your household is ready"
          </p>
        </Panel>
      </div>
    </KitSection>
  );
}

