"use client";
import * as React from "react";
import { FoilChip, Chip, cn } from "../../ui";
import { CategoryMark, CategoryTile } from "../illustrations";
import { KitSection, Note, Panel, PanelHead } from "./parts";
import type { Category } from "../types";

// ------------------------------------------------------------------ 02 Colour
const RAMP = [
  { name: "cobalt-hover", hex: "#0045AE", role: "Primary hover only", swatch: "bg-cobalt-hover" },
  { name: "cobalt-press", hex: "#00329A", role: "Primary pressed only", swatch: "bg-cobalt-press" },
  { name: "cobalt-soft", hex: "#DDE7F8", role: "Active tab, info chip, palette row", swatch: "bg-cobalt-soft" },
  { name: "on-cobalt-muted", hex: "#CFDEF6", role: "Secondary text on cobalt, 4.8:1", swatch: "bg-cobalt", aa: true },
];
const NEUTRALS = [
  { name: "canvas", hex: "#F4F7FC", role: "App page background", swatch: "bg-canvas" },
  { name: "surface-1", hex: "#FFFFFF", role: "Cards, nav, sheets, inputs", swatch: "bg-surface-1" },
  { name: "surface-2", hex: "#EAF0F8", role: "Hover fill, skeletons, search field", swatch: "bg-surface-2" },
  { name: "line", hex: "#DDE4EE", role: "Card borders and dividers", swatch: "bg-line", cr: "1.3:1" },
  { name: "line-strong", hex: "#838FA0", role: "Input and secondary-button borders", swatch: "bg-line-strong", cr: "3.3:1" },
  { name: "ink-muted", hex: "#4A5872", role: "Metadata, inactive tabs", swatch: "bg-ink-muted", cr: "6.7:1" },
  { name: "ink", hex: "#0B1B33", role: "Text, headings, the logo card", swatch: "bg-ink", cr: "16:1" },
];
const CATS: { category: Category; label: string; hexes: [string, string, string]; cls: [string, string, string] }[] = [
  { category: "medicine", label: "Medicine", hexes: ["0A58C2", "BCD2F3", "E4EDFB"], cls: ["bg-cat-medicine text-white", "bg-cat-medicine-tint", "bg-cat-medicine-soft"] },
  { category: "vehicle", label: "Vehicle", hexes: ["C25E00", "F4CDA8", "FCEBDB"], cls: ["bg-cat-vehicle text-white", "bg-cat-vehicle-tint", "bg-cat-vehicle-soft"] },
  { category: "appliance", label: "Appliance", hexes: ["0E8A6A", "B2E0D0", "DFF3EB"], cls: ["bg-cat-appliance text-white", "bg-cat-appliance-tint", "bg-cat-appliance-soft"] },
  { category: "other", label: "Other", hexes: ["6A5C8A", "D3CBE3", "EDE9F4"], cls: ["bg-cat-other text-white", "bg-cat-other-tint", "bg-cat-other-soft"] },
];

export function KitColour() {
  return (
    <KitSection id="colour" n="02" title="Colour" lede={<>Every pair here passes WCAG AA as text or as a 3:1 mark. Cobalt's OKLCH hue is <b>259</b>, medicine-box blue, so nothing in the app drifts toward indigo or violet.</>}>
      <div className="grid grid-cols-12 gap-4 max-lg:grid-cols-2 max-md:grid-cols-1">
        {/* cobalt */}
        <div className="col-span-5 flex flex-col overflow-hidden rounded-lg border border-line bg-surface-1 max-lg:col-span-2 max-md:col-span-1">
          <div data-surface="cobalt" className="flex min-h-[176px] flex-1 flex-col justify-between gap-4 bg-cobalt px-6 py-[22px] text-white">
            <p className="font-display text-[30px] font-extrabold leading-none tracking-[-0.02em]">cobalt · #0A58C2</p>
            <p className="text-[14px] font-medium leading-[1.4] text-on-cobalt-muted">
              Primary button, active tab, links, focus ring, landing hero. <b className="font-semibold text-white">6.6:1</b> with white. One filled cobalt button per view.
            </p>
          </div>
          <div className="grid grid-cols-4 max-md:grid-cols-2">
            {RAMP.map((r) => (
              <div key={r.name} className="border-r border-line px-4 pb-4 pt-3.5 last:border-r-0">
                <i className={cn("mb-2.5 block h-11 rounded-[10px] text-center font-sans text-[17px] font-semibold not-italic leading-[44px] text-on-cobalt-muted", r.swatch)}>{r.aa ? "Aa" : null}</i>
                <p className="text-[14px] font-semibold leading-[1.2] text-ink">{r.name}</p>
                <p className="mt-[3px] font-mono text-[12.5px] leading-[1.2] text-ink-muted">{r.hex}</p>
                <p className="mt-1.5 text-[13px] leading-[1.4] text-ink-muted">{r.role}</p>
              </div>
            ))}
          </div>
        </div>
        {/* neutrals */}
        <Panel className="col-span-4 max-lg:col-span-1">
          {NEUTRALS.map((n, i) => (
            <div key={n.name} className={cn("grid grid-cols-[44px_1fr_auto] items-center gap-3.5 py-2.5", i > 0 ? "border-t border-line" : "pt-0")}>
              <i className={cn("block size-11 rounded-[10px] shadow-[inset_0_0_0_1px_rgb(11_27_51/0.1)]", n.swatch)} />
              <div>
                <p className="text-[14px] font-semibold leading-[1.2] text-ink">{n.name} <span className="font-mono text-[12.5px] font-normal text-ink-muted">{n.hex}</span></p>
                <p className="mt-0.5 text-[13px] leading-[1.4] text-ink-muted">{n.role}</p>
              </div>
              <span className="text-right text-[12px] font-semibold text-ink-muted tabular-nums">{n.cr}</span>
            </div>
          ))}
        </Panel>
        {/* signals */}
        <div className="col-span-3 grid gap-3 max-lg:col-span-1">
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md bg-danger px-4 py-3.5 text-white">
            <span className="text-[15px] font-bold leading-[1.2]">danger</span><span className="font-mono text-[12px] opacity-90">#B3121E</span>
            <p className="col-span-2 mt-1 text-[13px] leading-[1.4] text-danger-soft">Alert faces and badges, INVALID seal, a source that's down, the logo pocket, the red pill. Nothing else.</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md bg-danger-soft px-4 py-3.5 text-danger">
            <span className="text-[15px] font-bold leading-[1.2]">danger-soft</span><span className="font-mono text-[12px] opacity-90">#FBEAE8</span>
            <p className="col-span-2 mt-1 text-[13px] leading-[1.4] text-ink">Alert chip face · text 6.0:1</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md bg-success-soft px-4 py-3.5 text-success">
            <span className="text-[15px] font-bold leading-[1.2]">success · soft</span><span className="font-mono text-[12px] opacity-90">#127A55 · #E9F1ED</span>
            <p className="col-span-2 mt-1 text-[13px] leading-[1.4] text-ink">No match, VERIFIED, healthy source · 4.6:1</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md bg-warning-soft px-4 py-3.5 text-warning">
            <span className="text-[15px] font-bold leading-[1.2]">warning · soft</span><span className="font-mono text-[12px] opacity-90">#8F5500 · #F2EAE2</span>
            <p className="col-span-2 mt-1 text-[13px] leading-[1.4] text-ink">Near miss, waiting for you, form errors · 5.1:1</p>
          </div>
        </div>
        {/* categories */}
        <Panel className="col-span-8 max-lg:col-span-2 max-md:col-span-1">
          <PanelHead title="Categories" note="Glyphs, dots and illustration fills only. Never text: vehicle and appliance are 4.3:1." />
          <div className="grid grid-cols-4 gap-3.5 max-md:grid-cols-2">
            {CATS.map((c) => (
              <div key={c.category} className="rounded-md border border-line p-3.5">
                <span className="block h-28">
                  <CategoryTile category={c.category} size="fill" illustrationClassName="size-[92px]" />
                </span>
                <p className="mt-3 flex items-center gap-2 text-[14px] font-semibold leading-none text-ink"><CategoryMark category={c.category} />{c.label}</p>
                <div className="mt-2.5 flex gap-1.5">
                  {c.hexes.map((h, i) => (
                    <span key={h} className={cn("h-[22px] flex-1 rounded-[6px] text-center font-mono text-[10.5px] leading-[22px]", c.cls[i], i > 0 && "text-ink")}>{h}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        {/* foil */}
        <Panel className="col-span-4 max-lg:col-span-2 max-md:col-span-1">
          <PanelHead title="Foil" note="The one gradient" />
          <div className="h-[120px] rounded-[12px] bg-[image:var(--foil)] shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_0_0_1px_rgb(11_27_51/0.12)]" />
          <div className="mt-3 grid grid-cols-4 gap-2 font-mono text-[12px] leading-[1.35] text-ink-muted">
            {[["foil-hi", "#F1F2F1", "0%", "bg-foil-hi"], ["foil-mid", "#DDE0DE", "46%", "bg-[var(--foil-mid)]"], ["foil-lo", "#C9CDCB", "54%", "bg-foil-lo"], ["foil-end", "#E6E8E7", "100%", "bg-[var(--foil-end)]"]].map(([n, h, p, cls]) => (
              <div key={n}>
                <i className={cn("mb-1.5 block h-[18px] rounded-[5px] shadow-[inset_0_0_0_1px_rgb(11_27_51/0.1)]", cls)} />
                {n}<br />{h} {p}
              </div>
            ))}
          </div>
          <Note className="mt-3">Plus one radial glow behind the landing's 3D strip. No other gradients, no glass, no glow blobs.</Note>
        </Panel>
      </div>
    </KitSection>
  );
}

// ------------------------------------------------------------------ 03 Type
function TypeRow({ name, meta, children }: { name: string; meta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[300px_1fr] items-center gap-8 border-t border-line py-[18px] first:border-t-0 first:pt-0 max-md:grid-cols-1 max-md:gap-2">
      <div>
        <p className="text-[14px] font-semibold leading-[1.2] text-ink">{name}</p>
        <p className="mt-1 font-mono text-[12.5px] leading-[1.45] text-ink-muted">{meta}</p>
      </div>
      <div className="min-w-0 text-ink max-md:overflow-hidden">{children}</div>
    </div>
  );
}

export interface KitTypeProps {
  sha256: string;
  keyAlias: string;
  algorithm: string;
  batch: string;
  total: number;
  cdscoFailed: number;
  asOf: string;
  sourcesCount: number;
}

export function KitType({ sha256, keyAlias, algorithm, batch, total, cdscoFailed, asOf, sourcesCount }: KitTypeProps) {
  return (
    <KitSection id="type" n="03" title="Type" lede={<><b>Funnel Display</b> speaks in headlines and big numbers, <b>Onest</b> does all the reading and every control, <b>Doto</b> only prints codes on foil, <b>IBM Plex Mono</b> only shows hashes and ids.</>}>
      <Panel>
        <TypeRow name="display-xl" meta="Funnel Display 800 · 68/68 · −0.037em"><p className="font-display text-display-xl max-md:text-[44px]">Nobody tells you.</p></TypeRow>
        <TypeRow name="display-lg" meta="Funnel Display 800 · 54/55 · −0.035em"><p className="font-display text-display-lg max-md:text-[34px]">2 things you own are on a notice</p></TypeRow>
        <TypeRow name="headline-lg" meta="Funnel Display 800 · 40/42 · −0.03em"><p className="font-display text-headline-lg max-md:text-[30px]">How one row in a PDF reaches you</p></TypeRow>
        <TypeRow name="headline-md" meta="Funnel Display 700 · 28/32 · −0.02em"><p className="font-display text-headline-md">Paracetamol Tablets IP 650mg</p></TypeRow>
        <TypeRow name="stat" meta="Funnel Display 800 · 32/32 · tabular">
          <p className="font-display text-stat tabular-nums">{total.toLocaleString("en-IN")} &nbsp;·&nbsp; {cdscoFailed} &nbsp;·&nbsp; 15 min &nbsp;·&nbsp; 9 s</p>
        </TypeRow>
        <TypeRow name="title" meta="Onest 700 · 20/25 · −0.01em"><p className="font-sans text-title">Failed CDSCO quality test · JUL-2026 alert, row 12</p></TypeRow>
        <TypeRow name="body-lg · body-md · body-sm" meta="Onest 400 · 18/28 · 16/25 · 14/20">
          <p className="text-body-lg">RecallIndia reads India's drug-quality alerts and recall notices the day they're published.</p>
          <p className="mt-1.5 text-body-md">Paracetamol Tablets IP 650mg, batch {batch}, failed the dissolution test at DTL Bikaner.</p>
          <p className="mt-1.5 text-body-sm text-ink-muted">No match in {sourcesCount} sources as of {asOf}</p>
        </TypeRow>
        <TypeRow name="label-md · chip · caps" meta="Onest 600 · 15 · 12 +0.02em · 700 12 +0.08em">
          <div className="flex items-center gap-[18px] whitespace-nowrap">
            <span className="text-label-md">Approve claim letter</span>
            <Chip tone="alert">On a notice</Chip>
            <span className="text-caps uppercase text-ink-muted">Medicine</span>
          </div>
        </TypeRow>
        <TypeRow name="foil-lg · md · sm" meta="Doto 900 · 36 · 22 · 17 · on foil only">
          <div className="flex items-center gap-3.5"><FoilChip code={batch} size="lg" /><FoilChip code={batch} /><FoilChip code={batch} size="sm" /></div>
        </TypeRow>
        <TypeRow name="mono-md · mono-sm" meta="IBM Plex Mono 400 · 14 · 12">
          <p className="break-all font-mono text-mono-md">sha256 {sha256}</p>
          <p className="mt-1 font-mono text-mono-sm text-ink-muted">{keyAlias} · {algorithm}</p>
        </TypeRow>
      </Panel>
    </KitSection>
  );
}
