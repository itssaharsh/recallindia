"use client";

import { Logo, Mark } from "@/components/brand/logo";
import { FoilChip, diffIndexes } from "@/components/common/foil-chip";
import { RangeBar } from "@/components/common/range-bar";
import { SourceExcerpt } from "@/components/common/source-excerpt";
import { PipelineSteps } from "@/components/case/pipeline-steps";
import { Button } from "@/components/ui/button";
import type { PipelineStep } from "@/lib/case";

/** S0 `/kit`: every token and component in one place, so a change can be seen before it ships.
 *  Not in the nav, not in the palette, noindex. */
const SWATCHES: { name: string; token: string; on: string; note: string }[] = [
  { name: "canvas", token: "bg-canvas", on: "text-ink", note: "page · never white" },
  { name: "surface-1", token: "bg-surface-1", on: "text-ink", note: "cards, records, sheets" },
  { name: "surface-2", token: "bg-surface-2", on: "text-ink", note: "hover, skeletons, kbd" },
  { name: "primary", token: "bg-primary", on: "text-accent-ink", note: "one filled button per view · 6.3:1" },
  { name: "accent-soft", token: "bg-accent-soft", on: "text-primary", note: "selected filter" },
  { name: "mark", token: "bg-mark", on: "text-ink", note: "our highlight on the record · 12.5:1" },
  { name: "success", token: "bg-success", on: "text-accent-ink", note: "clear, healthy, VERIFIED" },
  { name: "success-soft", token: "bg-success-soft", on: "text-success", note: "4.7:1" },
  { name: "warning", token: "bg-warning", on: "text-accent-ink", note: "needs you, degraded, failures" },
  { name: "warning-soft", token: "bg-warning-soft", on: "text-warning", note: "5.0:1" },
  { name: "danger", token: "bg-danger", on: "text-accent-ink", note: "you are affected · nothing else" },
  { name: "danger-soft", token: "bg-danger-soft", on: "text-danger", note: "alert chip" },
];

const TYPE = [
  { name: "display-xl", className: "font-display text-[64px] leading-[1.04] font-extrabold tracking-[-0.03em]", sample: "4,868 notices" },
  { name: "headline-lg", className: "font-display text-[40px] leading-[1.1] font-extrabold tracking-[-0.03em]", sample: "You were sold this strip" },
  { name: "headline-md", className: "font-display text-[28px] leading-[1.15] font-bold tracking-[-0.02em]", sample: "Approve the claim letter" },
  { name: "title", className: "font-display text-[20px] leading-[1.25] font-bold tracking-[-0.01em]", sample: "Paracetamol Tablets IP 650mg" },
  { name: "body-md", className: "text-[16px] leading-[1.55]", sample: "Failed CDSCO quality test, July 2026 alert, row 12." },
  { name: "body-sm", className: "text-[14px] leading-[1.45]", sample: "No match in 4 sources as of 02:10." },
  { name: "label-caps", className: "text-[12px] font-bold tracking-[0.08em] uppercase", sample: "Waiting for you" },
  { name: "mono-md", className: "font-mono text-[14px] leading-[1.45]", sample: "7860c169e932f79b · JUL-2026" },
  { name: "foil-md", className: "font-[family-name:var(--font-foil)] text-[22px] tracking-[0.06em]", sample: "FT5427" },
];

const STEPS: PipelineStep[] = [
  { name: "approve", label: "Approve", state: "done", seconds: 3 },
  { name: "seal_evidence", label: "Seal evidence", state: "done", seconds: 1.2 },
  { name: "write_letter", label: "Write letter", state: "running", seconds: null },
  { name: "verify", label: "Verify signature", state: "pending", seconds: null },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-4 border-t border-line pt-8">
      <h2 id={id} className="text-[12px] font-bold tracking-[0.08em] text-ink-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function KitView() {
  const yours = "FT5428";
  const listed = "FT5427";
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <header className="space-y-2">
        <h1 className="font-display text-[40px] leading-[1.1] font-extrabold tracking-[-0.03em] text-ink">Kit</h1>
        <p className="text-[15px] text-ink-muted">
          Gazette &amp; Foil: every token and component, in every state. Not in the nav, not indexed.
        </p>
      </header>

      <Section id="brand" title="Brand">
        <div className="flex flex-wrap items-end gap-8">
          {[16, 32, 128].map((size) => (
            <div key={size} className="space-y-2 text-center">
              <div className="flex items-center justify-center rounded-md border border-line bg-surface-1 p-4 text-ink">
                <Mark size={size} />
              </div>
              <div className="flex items-center justify-center rounded-md border border-line bg-ink p-4 text-canvas">
                <Mark size={size} />
              </div>
              <p className="font-mono text-[11px] text-ink-muted">{size}px</p>
            </div>
          ))}
          <div className="space-y-3">
            <Logo height={24} className="text-ink" />
            <Logo height={20} className="text-ink" />
            <p className="font-mono text-[11px] text-ink-muted">lockup 24 (rail) · 20 (mobile bar)</p>
          </div>
        </div>
      </Section>

      <Section id="colour" title="Colour">
        <ul className="grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3">
          {SWATCHES.map((s) => (
            <li key={s.name} className={`rounded-md border border-line p-3 ${s.token}`}>
              <p className={`font-mono text-[12px] ${s.on}`}>{s.name}</p>
              <p className={`text-[12px] ${s.on}`}>{s.note}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Type scale">
        <ul className="list-none space-y-4 p-0">
          {TYPE.map((t) => (
            <li key={t.name} className="grid gap-1 border-b border-line pb-3 md:grid-cols-[8rem_minmax(0,1fr)] md:items-baseline">
              <span className="font-mono text-[11px] text-ink-muted">{t.name}</span>
              <span className={`${t.className} text-ink`}>{t.sample}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="foil" title="Foil chip (C-11)">
        <div className="flex flex-wrap items-center gap-6">
          <FoilChip code={listed} />
          <FoilChip code={listed} size="lg" />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-12 text-[12px] text-ink-muted">Yours</span>
              <FoilChip code={yours} diff={diffIndexes(yours, listed)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 text-[12px] text-ink-muted">Listed</span>
              <FoilChip code={listed} diff={diffIndexes(yours, listed)} />
            </div>
          </div>
          <div className="rounded-md bg-danger p-3">
            <FoilChip code={listed} />
          </div>
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg">Approve claim letter</Button>
          <Button variant="outline">Make my own copy</Button>
          <Button variant="ghost">Check again</Button>
          <Button size="lg" disabled>
            Approve claim letter
          </Button>
        </div>
      </Section>

      <Section id="status" title="Status chips">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["CLEAR", "bg-success-soft text-success"],
            ["CHECKING", "bg-surface-2 text-ink-muted"],
            ["NEEDS YOU", "bg-warning-soft text-warning"],
            ["NOT ON THE NOTICE", "bg-success-soft text-success"],
            ["ON A NOTICE", "bg-danger-soft text-danger"],
            ["WAITING FOR YOU", "bg-warning-soft text-warning"],
            ["VERIFIED", "bg-success-soft text-success"],
            ["INVALID", "bg-danger-soft text-danger"],
          ].map(([label, tone]) => (
            <span key={label} className={`inline-flex h-[22px] items-center rounded-sm px-2 text-[12px] font-bold tracking-[0.08em] uppercase ${tone}`}>
              {label}
            </span>
          ))}
        </div>
      </Section>

      <Section id="pipeline" title="Pipeline steps (C-17)">
        <div className="max-w-sm rounded-md border border-line bg-surface-1 p-4">
          <PipelineSteps steps={STEPS} />
        </div>
      </Section>

      <Section id="record" title="Notice record (C-13) and range bar (C-12)">
        <div className="max-w-2xl space-y-4">
          <SourceExcerpt
            excerpt="Paracetamol Tablets IP 650mg | FT5427 | Oct-2025 | Sep-2027 | Forgo Pharmaceuticals | The sample does not conforms to the I.P. with respect to Dissolution Test."
            quote="The sample does not conforms to the I.P. with respect to Dissolution Test."
            caption="CDSCO's own words, published 01 Jul 2026"
          />
          <RangeBar check={{ listed: "FT5427", yours: "FT5427", inside: true, kind: "batch" }} />
          <RangeBar check={{ listed: "2022–2023", yours: "2022", inside: true, kind: "vehicle_year" }} />
        </div>
      </Section>
    </div>
  );
}
