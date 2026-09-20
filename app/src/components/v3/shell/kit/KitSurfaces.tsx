"use client";
import * as React from "react";
import NumberFlow from "@number-flow/react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button, Card, Chip, cn } from "../../ui";
import { TopNav } from "../TopNav";
import { CommandPalette } from "../CommandPalette";
import { ToastCard, shellToast, type ToastData } from "../Toast";
import { EmptyState } from "../EmptyState";
import { Loadable, SkeletonFeedRows, SkeletonItemCard, SkeletonStat } from "../Skeleton";
import { CategoryMark, CategoryTile } from "../illustrations";
import { IconCheck } from "../icons";
import { EASE_SPRING, numberFlowTiming } from "../motion";
import { SOURCE_LABEL, cdscoFailedTest, formatCount, formatDate } from "../format";
import { KitSection, Lab, Note, Panel } from "./parts";
import type { Category, HouseholdItem, HouseholdState, NoticeSummary, NoticesStatus, SourceId, SourceStat } from "../types";

const SOURCE_CATEGORY: Record<SourceId, Category> = { cdsco_nsq: "medicine", cpsc: "appliance", openfda: "other", nhtsa: "vehicle" };
const SOURCE_BAR: Record<SourceId, string> = { cdsco_nsq: "bg-cat-medicine", cpsc: "bg-cat-appliance", openfda: "bg-cat-other", nhtsa: "bg-cat-vehicle" };

// ------------------------------------------------------------------ 07 Cards & rows
/** Notice card specimen (spec §6.8; the real one lives in the /feed part). */
function NoticeCardSpecimen({ notice, category, hover, footer }: { notice: NoticeSummary; category: Category; hover?: boolean; footer: React.ReactNode }) {
  const cdsco = notice.source === "cdsco_nsq";
  const badge = cdsco ? `CDSCO ${notice.batches?.[0] ?? ""}` : `${SOURCE_LABEL[notice.source]} ${notice.notice_id}`;
  const date = cdsco && notice.row_ref ? `${notice.row_ref.month} · row ${notice.row_ref.row}` : notice.published_at ? formatDate(notice.published_at) : "";
  const summary = cdsco ? `${notice.brand} · failed CDSCO quality test: ${(cdscoFailedTest(notice.hazard_or_failed_test) ?? "").replace(/^Content/, "content")}.` : notice.hazard_or_failed_test;
  return (
    <Card
      as="article" interactive
      className="px-5 pb-4 pt-[18px] transition-[box-shadow,transform,border-color] duration-250 ease-out"
      style={hover ? { boxShadow: "var(--shadow-2)", transform: "translateY(-2px)", borderColor: "#CBD5E3" } : undefined}
    >
      <div className="flex items-center gap-2.5 text-[13px] font-medium leading-none text-ink-muted">
        <span className="inline-flex h-6 items-center rounded-pill bg-cobalt-soft px-[9px] text-[11px] font-bold tracking-[0.05em] text-cobalt">{badge}</span>
        <span className="flex items-center gap-[7px] text-[12px] font-semibold uppercase tracking-[0.04em]"><CategoryMark category={category} className="size-[9px]" />{category}</span>
        <span className="ml-auto tabular-nums">{date}</span>
      </div>
      <h3 className="mt-3 font-display text-[20px] font-bold leading-[1.25] tracking-[-0.015em] text-ink">{notice.product}</h3>
      <p className="mt-1.5 text-[15px] leading-[1.45] text-ink-muted">{summary}</p>
      <div className="mt-3.5 flex items-center gap-2.5 border-t border-line pt-3">
        {footer}
        <a href={`/feed/?notice=${encodeURIComponent(notice.pk)}`} className="ml-auto inline-flex items-center gap-1.5 rounded-pill text-[14px] font-semibold leading-none text-cobalt">
          See the notice<ArrowRight size={16} aria-hidden />
        </a>
      </div>
    </Card>
  );
}

export interface KitCardsProps {
  notices: NoticeSummary[];
  items: HouseholdItem[];
  total: number;
  sources: SourceStat[];
  asOf: string;
  sourcesCount: number;
}

export function KitCards({ notices, items, total, sources: rawSources, asOf, sourcesCount }: KitCardsProps) {
  // the bar and legend run largest first, coloured per source as on /feed
  const sources = [...rawSources].sort((a, b) => b.count - a.count);
  const sauna = notices.find((n) => n.pk === "cpsc#10984") ?? notices[0];
  const acec = notices.find((n) => n.source === "cdsco_nsq" && n.row_ref?.row === 129) ?? notices[1];
  const fan = items.find((i) => i.face === "clear" && /fan/i.test(i.name)) ?? items[0];
  const rowNotices = [
    { n: notices.find((x) => x.pk === "cpsc#10982"), state: "Rest", cls: "" },
    { n: notices.find((x) => x.pk === "cpsc#2510"), state: "Hover", cls: "bg-surface-2" },
    { n: notices.find((x) => x.source === "nhtsa"), state: "Focus", cls: "shadow-[inset_0_0_0_2px_var(--cobalt)]" },
    { n: notices.find((x) => x.row_ref?.row === 12), state: "Open", cls: "bg-cobalt-soft [&_b]:text-cobalt" },
  ].filter((r): r is { n: NoticeSummary; state: string; cls: string } => !!r.n);

  return (
    <KitSection id="cards" n="07" title="Cards & rows" lede="White, radius 14, a 1px line and a soft two-layer shadow. Hover lifts 2 px and deepens the shadow in 250 ms. Each card shape follows its content, so no two in a row look the same.">
      <div className="grid grid-cols-12 gap-4 max-md:grid-cols-1">
        <div className="col-span-5 grid content-start gap-4 max-lg:col-span-12 max-md:col-span-1">
          <NoticeCardSpecimen notice={sauna} category="appliance" footer={<Note>Nothing you own matches</Note>} />
          <NoticeCardSpecimen notice={acec} category="medicine" hover footer={<Lab>Hover</Lab>} />
        </div>
        <div className="col-span-4 grid content-start gap-4 max-lg:col-span-7 max-md:col-span-1">
          <Card as="article" className="flex gap-4 p-4">
            <CategoryTile category={fan.kind} size={88} />
            <div className="min-w-0">
              <span className="flex items-center gap-[7px] text-[12px] font-semibold uppercase leading-none tracking-[0.04em] text-ink-muted"><CategoryMark category={fan.kind} className="size-[9px]" />{fan.kind}</span>
              <h3 className="mt-2 font-display text-[19px] font-bold leading-[1.2] tracking-[-0.02em] text-ink">{fan.name}</h3>
              <div className="mt-2.5 flex items-center gap-2.5"><Chip tone="clear"><IconCheck size={14} />No match</Chip></div>
              <p className="mt-1 text-[14px] leading-[1.4] text-ink-muted">No match in {sourcesCount} sources as of {asOf}</p>
            </div>
          </Card>
          <Card className="px-5 py-[18px]">
            <p className="flex items-baseline font-display text-[44px] font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
              <NumberFlow value={total} locales="en-IN" {...numberFlowTiming} />
              <small className="ml-2 font-sans text-[15px] font-medium tracking-normal text-ink-muted">notices</small>
            </p>
            <div className="mb-3 mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]" role="img" aria-label={sources.map((s) => `${s.label} ${formatCount(s.count)}`).join(", ")}>
              {sources.map((s) => <i key={s.source} className={cn("block min-w-1", SOURCE_BAR[s.source])} style={{ flex: s.count }} />)}
            </div>
            <div className="grid grid-cols-4 gap-x-3.5 gap-y-1.5 text-[13px] leading-[1.3] text-ink-muted">
              {sources.map((s) => (
                <span key={s.source}>
                  <b className="block text-[15px] font-bold leading-[1.2] text-ink tabular-nums">{formatCount(s.count)}</b>
                  <CategoryMark category={SOURCE_CATEGORY[s.source]} className="mr-1.5 size-[9px]" />{s.label}
                </span>
              ))}
            </div>
          </Card>
        </div>
        <div className="col-span-3 grid content-start gap-4 max-lg:col-span-5 max-md:col-span-1">
          <div className="overflow-hidden rounded-md border border-line bg-surface-1">
            {rowNotices.map(({ n, state, cls }, i) => (
              <div key={n.pk} className={cn("grid min-h-14 grid-cols-[62px_minmax(0,1fr)_auto] items-center gap-3.5 px-4", i > 0 && "border-t border-line", cls)}>
                <span className="text-[11px] font-bold leading-none tracking-[0.05em] text-ink-muted">{SOURCE_LABEL[n.source].toUpperCase()}</span>
                <b className="truncate text-[15px] font-medium leading-[1.3] text-ink">{n.product}</b>
                <span className="text-[12px] font-medium leading-none text-ink-muted">{state}</span>
              </div>
            ))}
          </div>
          <Panel className="px-[18px]! pb-5! pt-[18px]!">
            <Lab className="mb-3 block">Radius</Lab>
            <div className="grid grid-cols-4 items-end gap-[18px]">
              {[["8", "h-11 rounded-sm"], ["14", "h-14 rounded-md"], ["22", "h-[68px] rounded-lg"], ["pill", "h-9 rounded-pill"]].map(([l, c]) => (
                <div key={l} className="grid justify-items-start gap-2.5"><i className={cn("block w-full border border-line bg-surface-1", c)} /><Note><b>{l}</b></Note></div>
              ))}
            </div>
          </Panel>
        </div>
        <Panel className="col-span-12 px-7! py-[22px]! max-md:col-span-1">
          <div className="grid grid-cols-3 gap-[18px] max-md:grid-cols-1">
            <div><i className="block h-[84px] rounded-md border border-line bg-surface-1 shadow-1" /><Note className="mt-2.5"><b>shadow-1</b> · cards at rest</Note></div>
            <div><i className="block h-[84px] rounded-md border border-line bg-surface-1 shadow-2" /><Note className="mt-2.5"><b>shadow-2</b> · hovered card, alert card, toast, annotation chips</Note></div>
            <div><i className="block h-[84px] rounded-md bg-surface-1 shadow-3" /><Note className="mt-2.5"><b>shadow-3</b> · ⌘K palette and sheets, over a 40% ink scrim</Note></div>
          </div>
        </Panel>
      </div>
    </KitSection>
  );
}

// ------------------------------------------------------------------ 08 Palette & toasts
export interface KitOverlaysProps {
  household: HouseholdState;
  items: HouseholdItem[];
  total: number;
  toasts: ToastData[];
  paletteNotices: NoticeSummary[];
  paletteNoticesStatus: NoticesStatus;
  onPaletteSearch: (q: string) => void;
}

export function KitOverlays({ household, items, total, toasts, paletteNotices, paletteNoticesStatus, onPaletteSearch }: KitOverlaysProps) {
  const [open, setOpen] = React.useState(true);
  const alertCount = items.filter((i) => i.face === "alert").length;
  return (
    <KitSection id="overlays" n="08" title="Palette & toasts" lede="⌘K (or /) finds anything: your things, notices, pages and actions. Toasts confirm what just finished and offer the next step; they never carry an alert.">
      <div className="grid grid-cols-12 gap-4 max-md:grid-cols-1">
        <div className="relative col-span-8 h-[600px] overflow-hidden rounded-lg border border-line bg-canvas max-lg:col-span-12 max-md:col-span-1 max-md:h-[640px]">
          <div inert className="max-md:w-[1008px]">
            <TopNav embedded layout="tablet" activeTab="mine" alertCount={alertCount} household={household} total={total} onOpenSearch={() => {}} />
          </div>
          <div aria-hidden className="absolute inset-x-0 bottom-0 top-16 px-8 py-7">
            <p className="max-w-[640px] font-display text-[44px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink">{alertCount} things you own are on a notice</p>
            <div className="mt-[18px] h-[88px] rounded-md border border-line bg-surface-1" />
            <div className="mt-[18px] h-[88px] rounded-md border border-line bg-surface-1" />
          </div>
          <CommandPalette
            presentation="inline" layout="dialog" open={open} onOpenChange={setOpen} defaultQuery="FT54"
            things={items} notices={paletteNotices} noticesStatus={paletteNoticesStatus} onSearch={onPaletteSearch}
            total={total} household={household}
          />
          {!open && (
            <div className="absolute inset-x-0 bottom-8 flex justify-center">
              <Button variant="secondary" onClick={() => setOpen(true)}>Show the palette</Button>
            </div>
          )}
        </div>
        <div className="col-span-4 grid content-start gap-3 max-lg:col-span-12 max-md:col-span-1">
          {toasts.map((t) => <ToastCard key={t.title} {...t} className="w-full!" />)}
          <Panel className="px-5! py-[18px]!">
            <Lab className="mb-2.5 block">Toast rules</Lab>
            <Note>Bottom-right on desktop, above the tab bar on phones. In with a spring from 12 px below in 250 ms, 5 s dwell, pause on hover, out in 180 ms. One action at most, named for its result. Only the source-down toast may show red, as a dot.</Note>
            <Button variant="ghost" size="sm" className="-ml-3 mt-2" icon={<RotateCcw size={16} aria-hidden />} onClick={() => toasts.forEach((t, i) => window.setTimeout(() => shellToast.show({ ...t, id: `kit-${i}` }), i * 400))}>
              Play them live
            </Button>
          </Panel>
        </div>
      </div>
    </KitSection>
  );
}

// ------------------------------------------------------------------ 09 Empty states
export function KitEmpty({ total, sourceLabels, onCopyDemo }: { total: number; sourceLabels: string[]; onCopyDemo?: () => void }) {
  const [query, setQuery] = React.useState("FT9999");
  return (
    <KitSection id="empty" n="09" title="Empty states" lede="An empty state says what would be here, why it's empty and the one thing to do next. It borrows the product's objects (a blister, a search, a batch code) rather than a stock illustration.">
      <div className="grid grid-cols-12 gap-4 max-md:grid-cols-1">
        <EmptyState type="household-empty" headingAs="h3" total={total} sourcesCount={sourceLabels.length} onCopyDemo={onCopyDemo} footnote="/mine · your household with 0 things" className="col-span-7 max-lg:col-span-12 max-md:col-span-1" />
        <EmptyState
          type="feed-none" headingAs="h3" query={query || "FT9999"} total={total} sourceLabels={sourceLabels}
          suggestions={["Paracetamol", "FT5427", "Jeep Compass"]} onSuggestion={setQuery} onClearQuery={() => setQuery("FT9999")}
          footnote="/feed · search with no results" className="col-span-5 max-lg:col-span-12 max-md:col-span-1"
        />
        <EmptyState type="not-found" headingAs="h3" className="col-span-12 max-md:col-span-1" />
      </div>
    </KitSection>
  );
}

// ------------------------------------------------------------------ 10 Loading & motion
const SPRING_STOPS = EASE_SPRING.slice(7, -1).split(",").map((v) => parseFloat(v));
const springPath = SPRING_STOPS.map((v, i) => `${i ? "L" : "M"}${((i / (SPRING_STOPS.length - 1)) * 200).toFixed(1)} ${(88 - v * 80).toFixed(1)}`).join("");

const DURATIONS = [
  ["--dur-press", 30, "120 ms · press to 0.97"],
  ["--dur-fast", 45, "180 ms · hover, exits, fades"],
  ["--dur-base", 62.5, "250 ms · chips, tabs, toasts"],
  ["--dur-flip", 80, "320 ms · card faces, household"],
  ["--dur-slow", 100, "400 ms · sheets, foil morph, seal"],
] as const;

export function KitMotion({ forceLoading = false, items, asOf, sourcesCount }: { forceLoading?: boolean; items: HouseholdItem[]; asOf: string; sourcesCount: number }) {
  // the item card rests on its skeleton (as in the PNG); "Load it" swaps in the content with the 180 ms fade
  const [loading, setLoading] = React.useState(true);
  const clear = items.filter((i) => i.face === "clear").slice(0, 1);
  return (
    <KitSection id="loading" n="10" title="Loading & motion" lede="Skeletons keep the exact shape of what's coming and pulse opacity only. Motion answers a state change and nothing else; there is one orchestrated load sequence per page.">
      <div className="grid grid-cols-12 gap-4 max-md:grid-cols-1">
        <div className="col-span-5 grid content-start gap-4 max-lg:col-span-12 max-md:col-span-1">
          <SkeletonFeedRows />
          <Loadable loading={loading} label="Item card" skeleton={<SkeletonItemCard />}>
            {clear.map((i) => (
              <Card key={i.item_id} as="article" className="flex gap-4 p-4">
                <CategoryTile category={i.kind} size={88} />
                <div className="min-w-0 pt-1.5">
                  <span className="text-caps uppercase text-ink-muted">{i.kind}</span>
                  <h3 className="mt-2 font-display text-[19px] font-bold leading-[1.2] tracking-[-0.02em] text-ink">{i.name}</h3>
                  <p className="mt-1.5 text-[14px] text-ink-muted">No match in {sourcesCount} sources as of {asOf}</p>
                </div>
              </Card>
            ))}
          </Loadable>
          <SkeletonStat />
          <div className="flex items-center gap-3">
            <Note className="flex-1">Feed rows, item card, stat card. Skeletons appear only after 300 ms, and swap to content with a 180 ms fade.</Note>
            {!forceLoading && (
              <Button variant="ghost" size="sm" icon={<RotateCcw size={16} aria-hidden />} onClick={() => setLoading((l) => !l)}>
                {loading ? "Load it" : "Replay"}
              </Button>
            )}
          </div>
        </div>
        <Panel className="col-span-7 max-lg:col-span-12 max-md:col-span-1">
          <div className="mb-[18px] grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
            {[
              ["--ease-spring", "bounce 0.1 · framer twin", springPath, "var(--cobalt)"],
              ["--ease-out", "cubic-bezier(.22,1,.36,1)", "M0 88C44 -8 72 8 200 8", "var(--cobalt)"],
              ["--ease-in", "exits only, 180 ms", "M0 88C110 88 150 72 200 8", "var(--line-strong)"],
            ].map(([name, sub, d, stroke]) => (
              <div key={name} className="rounded-md border border-line px-3.5 py-3">
                <svg viewBox="0 0 200 96" preserveAspectRatio="none" className="block h-24 w-full" aria-hidden>
                  <path d="M0 88H200M0 8H200" stroke="var(--line)" strokeWidth="1" />
                  <path d={d} fill="none" stroke={stroke} strokeWidth="2.5" />
                </svg>
                <p className="mt-2 text-[14px] font-semibold leading-[1.2] text-ink">{name}</p>
                <p className="mt-0.5 font-mono text-[12px] leading-[1.35] text-ink-muted">{sub}</p>
              </div>
            ))}
          </div>
          {DURATIONS.map(([name, w, use], i) => (
            <div key={name} className={cn("grid grid-cols-[130px_1fr_250px] items-center gap-4 py-3 max-md:grid-cols-[96px_minmax(0,1fr)]", i > 0 && "border-t border-line")}>
              <b className="text-[14px] font-semibold leading-[1.2] text-ink">{name}</b>
              <div className="h-2.5 rounded-[5px] bg-cobalt" style={{ width: `${w}%` }} />
              <span className="text-[13px] leading-[1.4] text-ink-muted max-md:col-span-2">{use}</span>
            </div>
          ))}
          <Note className="mt-3.5"><b>Reduced motion:</b> springs, lifts, spinners and pulses stop; opacity and colour changes stay, at 180 ms linear.</Note>
        </Panel>
      </div>
    </KitSection>
  );
}

