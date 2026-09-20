"use client";
import * as React from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Button, FoilChip, cn } from "../../ui";
import { Lockup } from "../Brand";
import { TopNav } from "../TopNav";
import { MobileTopBar } from "../MobileTopBar";
import { BottomTabBar } from "../BottomTabBar";
import { CommandPalette } from "../CommandPalette";
import { CategoryTile } from "../illustrations";
import { FilterPill } from "../primitives";
import { IconAlert, IconCheck } from "../icons";
import { daysBetween, formatDate } from "../format";
import { AnnotationChip, KitSection, Note, PhoneFrame } from "./parts";
import type { HouseholdItem, HouseholdState, NoticeSummary, NoticesStatus } from "../types";

// ------------------------------------------------------------------ anatomy (kit PNG section 01)
/**
 * Notes and their offsets from the kit mockup: the chip's left edge sits `dx` from the anchor's
 * centre and its top `dy` below the nav. Row one at nav + 36, row two at nav + 128 (16 px gap).
 * "navline" anchors on the empty stretch between API and the household pill.
 */
const NOTES: { part: string; dx: number; dy: number; title: string; body: React.ReactNode }[] = [
  { part: "logo", dx: -60, dy: 36, title: "Lockup", body: <>Goes to <code>/</code>, the landing</> },
  { part: "tab-ingest", dx: -80, dy: 128, title: "Tab · hover", body: "surface-2 fill, 180 ms" },
  { part: "tab-mine", dx: -14, dy: 128, title: "Tab · active", body: <>cobalt-soft pill, cobalt label, <em>aria-current</em></> },
  { part: "badge", dx: 40, dy: 36, title: "Alert count", body: <>Red only while something you own<br />is on a notice</> },
  { part: "navline", dx: -30, dy: 128, title: "Top nav", body: "64 px, white, sticky, 1px line below" },
  { part: "household", dx: -200, dy: 36, title: "Household pill", body: <>Demo · copying · yours. Opens the<br />household menu</> },
  { part: "search", dx: -190, dy: 128, title: "Search", body: <>Opens the ⌘K palette. Placeholder<br />shows the live notice count</> },
];

type Pt = { ax: number; ay: number; x: number; y: number; ex: number };

function Anatomy({ household, total, alertCount }: { household: HouseholdState; total: number; alertCount: number }) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const chipRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const [pts, setPts] = React.useState<Pt[] | null>(null);

  React.useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const fr = frame.getBoundingClientRect();
      const q = (sel: string) => frame.querySelector(`[data-part="${sel}"]`)?.getBoundingClientRect();
      const nav = frame.querySelector("header")?.getBoundingClientRect();
      if (!nav) return;
      const navB = nav.bottom - fr.top;
      const next = NOTES.map((n, i) => {
        let ax = 0;
        let ay = navB + 3;
        if (n.part === "navline") {
          const api = q("tab-api");
          const hh = q("household");
          if (api && hh) ax = (api.right + hh.left) / 2 - fr.left;
        } else {
          const r = q(n.part);
          if (r) {
            ax = r.left + r.width / 2 - fr.left;
            ay = r.bottom - fr.top + 3;
          }
        }
        const x = ax + n.dx;
        const y = navB + n.dy;
        const cw = chipRefs.current[i]?.offsetWidth ?? 0;
        return { ax, ay, x, y, ex: Math.min(Math.max(ax, x + 18), x + cw - 18) };
      });
      setPts(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="overflow-x-auto rounded-lg max-md:[scrollbar-width:thin]">
      <div ref={frameRef} className="relative overflow-hidden rounded-lg border border-line bg-canvas shadow-1 max-md:w-[1440px]">
        <div aria-hidden className="flex h-10 items-center gap-2 border-b border-line bg-surface-2 px-4">
          <i className="size-[11px] rounded-full bg-line-strong/40" /><i className="size-[11px] rounded-full bg-line-strong/40" /><i className="size-[11px] rounded-full bg-line-strong/40" />
          <span className="mx-auto flex h-[26px] w-[420px] items-center justify-center gap-1.5 rounded-pill bg-surface-1 text-[13px] font-medium text-ink-muted">
            <Lock size={13} aria-hidden />recallindia.app/mine
          </span>
        </div>
        {/* the nav sits above the leader layer, so leaders emerge from under its bottom edge (as in the PNG) */}
        <div inert className="relative z-[5]">
          <TopNav embedded layout="full" activeTab="mine" forceHoverTab="ingest" alertCount={alertCount} household={household} total={total} onOpenSearch={() => {}} />
        </div>
        <div className="h-[228px]" />
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-[2] size-full overflow-visible">
          {pts?.map((p, i) => (
            <g key={i}>
              <path d={`M${p.ax} ${p.ay + 5}L${p.ex} ${p.y}`} fill="none" stroke="var(--cobalt)" strokeWidth={1.6} strokeDasharray="4 4" strokeLinecap="round" />
              <circle cx={p.ax} cy={p.ay} r={4} fill="var(--surface-1)" stroke="var(--cobalt)" strokeWidth={2} />
            </g>
          ))}
        </svg>
        {NOTES.map((n, i) => (
          <AnnotationChip
            key={n.part}
            title={n.title}
            innerRef={(el) => { chipRefs.current[i] = el; }}
            className="absolute z-[3]"
            style={pts ? { left: pts[i].x, top: pts[i].y } : { left: 0, top: 0, visibility: "hidden" }}
          >
            {n.body}
          </AnnotationChip>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ landing nav band
function LandingBand() {
  const link = "rounded-pill px-4 py-3.5 text-[15px] font-medium leading-none text-on-cobalt-muted max-md:hidden";
  return (
    <div data-surface="cobalt" aria-hidden className="relative mt-4 flex h-28 items-center gap-1.5 overflow-hidden rounded-lg bg-cobalt px-10 text-white max-md:px-4">
      <Lockup size="landing" tone="onBlue" className="mr-auto" />
      <span className={link}>How it works</span>
      <span className={cn(link, "bg-white/12 text-white")}>Live feed</span>
      <span className={link}>API</span>
      <Button variant="onBlue" className="ml-2.5" tabIndex={-1}>Open the app</Button>
      <span className="absolute bottom-3 left-10 text-[11px] font-semibold uppercase leading-none tracking-[0.04em] text-on-cobalt-muted opacity-90 max-md:left-4">
        Landing nav · transparent over cobalt · 48 px row at top 24
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ breakpoints + routes
const BREAKPOINTS: { bp: string; label: string; body: React.ReactNode }[] = [
  { bp: "1024+", label: "desktop", body: <><strong>Top nav 64 px</strong>, white, 1px line under it, sticky. Content max 1472 px with 32 px gutters. Search shows its full field from 1180 px.</> },
  { bp: "768", label: "tablet", body: <>Same top nav. Search shrinks to a 44 px round button, the household pill drops "· read-only" and tabs keep their text.</> },
  { bp: "<768", label: "phone", body: <><strong>Top bar 56 px</strong> (mark, wordmark, household pill, search) and a <strong>bottom tab bar 64 px</strong> plus the home-indicator inset. Gutters 16 px. The palette becomes a full-screen sheet.</> },
  { bp: "Landing", label: "all sizes", body: <>Transparent nav over cobalt with white text. Below 768 px only the lockup and "Open the app" stay.</> },
];
const ROUTES: [string, string][] = [
  ["/", "Landing, cobalt hero"],
  ["/feed", "Notices feed (moved from /)"],
  ["/ingest", "PDF becomes rows, replayable"],
  ["/mine", "My things, demo or yours"],
  ["/case/?id=", "One case: gate, letter, seal"],
  ["/api", "Try-it console and docs"],
  ["/kit", "This page"],
  ["404", "\"This page isn't on any list\""],
];

function Rules() {
  return (
    <div>
      <h3 className="mb-3.5 font-sans text-[20px] font-bold leading-[1.25] tracking-[-0.01em] text-ink">Breakpoints</h3>
      {BREAKPOINTS.map((b) => (
        <div key={b.bp} className="grid grid-cols-[96px_1fr] gap-3.5 border-t border-line py-4">
          <p className="font-display text-[20px] font-extrabold leading-none tracking-[-0.02em] text-ink tabular-nums">
            {b.bp}
            <small className="mt-1.5 block font-sans text-[12px] font-semibold tracking-[0.02em] text-ink-muted">{b.label}</small>
          </p>
          <p className="text-[15px] leading-[1.5] text-ink-muted [&_strong]:font-semibold [&_strong]:text-ink">{b.body}</p>
        </div>
      ))}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 border-t border-line pt-4 text-[14px] leading-[1.35] text-ink-muted">
        {ROUTES.map(([r, d]) => (
          <React.Fragment key={r}>
            <dt><code className="font-mono text-[13px] text-ink">{r}</code></dt>
            <dd>{d}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

// ------------------------------------------------------------------ phone specimens
/** The /mine alert card at 390, as a specimen (the real ItemCard lives in the /mine part). */
function AlertItemSpecimen({ item, notice }: { item: HouseholdItem; notice: NoticeSummary }) {
  const days = item.purchase_date ? daysBetween(notice.published_at ?? item.purchase_date, item.purchase_date) : 0;
  return (
    <article className="mt-3.5 overflow-hidden rounded-md border border-[rgb(179_18_30/0.28)] bg-surface-1 shadow-[0_2px_4px_rgb(11_27_51/0.05),0_22px_44px_-20px_rgb(179_18_30/0.45)]">
      <div className="flex h-[42px] items-center gap-2.5 bg-danger px-3.5 text-[13px] font-semibold leading-[1.2] text-white">
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill bg-white pl-[7px] pr-[9px] text-[11px] font-bold uppercase leading-none tracking-[0.04em] text-danger">
          <IconAlert size={13} />On a notice
        </span>
        CDSCO · {notice.row_ref?.month}, row {notice.row_ref?.row}
      </div>
      <div className="flex gap-3.5 p-3.5">
        <CategoryTile category="medicine" size={72} alert />
        <div className="min-w-0">
          <p className="font-display text-[18px] font-bold leading-[1.2] tracking-[-0.02em] text-ink">{item.name}</p>
          <p className="mt-[3px] text-[13px] leading-[1.4] text-ink-muted">
            {item.brand}{item.purchase_date && ` · bought ${formatDate(item.purchase_date)}`}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <FoilChip code={item.batch ?? ""} size="sm" />
            <span aria-label="equals" className="font-display text-[18px] font-bold leading-none text-danger">=</span>
            <FoilChip code={notice.batches?.[0] ?? ""} size="sm" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 px-3.5 pb-3.5">
        <p className="flex-1 text-[13px] leading-[1.45] text-ink-muted">Sold <b className="font-semibold text-danger">{days} days</b> after the notice</p>
        <Button variant="danger" size="sm" tabIndex={-1}>Open case<ArrowRight size={18} aria-hidden /></Button>
      </div>
    </article>
  );
}

function ClearRowSpecimen({ item, asOf, sourcesCount }: { item: HouseholdItem; asOf: string; sourcesCount: number }) {
  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-md border border-line bg-surface-1 px-3.5 py-3">
      <CategoryTile category={item.kind} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-[1.25] text-ink">{item.name}</p>
        <p className="mt-[3px] flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium leading-[1.2] text-success">
          <IconCheck size={14} className="shrink-0" />No match in {sourcesCount} sources as of {asOf}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ section
export interface KitShellSectionProps {
  household: HouseholdState;
  total: number;
  sourcesCount: number;
  items: HouseholdItem[];
  alertNotice: NoticeSummary;
  asOf: string;
  paletteNotices: NoticeSummary[];
  paletteNoticesStatus: NoticesStatus;
  onPaletteSearch: (q: string) => void;
}

export function KitShellSection({ household, total, sourcesCount, items, alertNotice, asOf, paletteNotices, paletteNoticesStatus, onPaletteSearch }: KitShellSectionProps) {
  const alerts = items.filter((i) => i.face === "alert");
  const alertMed = items.find((i) => i.face === "alert" && i.kind === "medicine");
  const clearFan = items.find((i) => i.face === "clear" && i.kind === "appliance" && /fan/i.test(i.name)) ?? items.find((i) => i.face === "clear");
  const count = (pred: (i: HouseholdItem) => boolean) => items.filter(pred).length;
  const [sheetOpen, setSheetOpen] = React.useState(true);

  return (
    <KitSection
      id="shell" n="01" title="Shell"
      lede={<>One white top nav replaces the old left rail. It holds <b>where you are</b> (tabs), <b>whose things you're looking at</b> (household pill) and <b>a way to find anything</b> (search, ⌘K).</>}
    >
      <Anatomy household={household} total={total} alertCount={alerts.length} />
      <LandingBand />

      <div className="mt-10 grid grid-cols-[1fr_410px_410px] items-start gap-8 max-xl:grid-cols-[410px_410px] max-xl:[&>*:first-child]:col-span-2 max-md:grid-cols-1 max-md:[&>*:first-child]:col-span-1">
        <Rules />

        <PhoneFrame caption={<><b>Phone · /mine.</b> Top bar 56, tab bar 64 + home-indicator inset, active tab in a cobalt-soft pill.</>}>
          <div inert className="flex min-h-0 flex-1 flex-col">
            <MobileTopBar embedded household={household} onOpenSearch={() => {}} />
            <div className="min-h-0 flex-1 overflow-hidden px-4 pt-3.5">
              <div className="flex items-center gap-2.5 rounded-pill bg-cobalt-soft py-1 pl-3.5 pr-1 text-[13px] font-medium leading-[1.3] text-ink">
                Demo household · read-only
                <Button variant="onBlue" size="sm" className="ml-auto shadow-1">Make my own copy</Button>
              </div>
              <p className="mb-2 mt-[18px] font-display text-[32px] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink">
                <span className="text-danger">{alerts.length}</span> things you own are on a notice
              </p>
              <p className="text-[14px] leading-[1.45] text-ink-muted">
                <b className="font-semibold text-ink">{items.length} things</b> checked against {sourcesCount} sources at {asOf} IST.
              </p>
              <div className="-mx-4 mt-3.5 flex gap-2 overflow-hidden px-4">
                <FilterPill label="All" count={items.length} selected />
                <FilterPill label="On a notice" count={alerts.length} lead={{ type: "alert" }} />
                <FilterPill label="Medicines" count={count((i) => i.kind === "medicine")} lead={{ type: "category", category: "medicine" }} />
              </div>
              {alertMed && <AlertItemSpecimen item={alertMed} notice={alertNotice} />}
              {clearFan && <ClearRowSpecimen item={clearFan} asOf={asOf} sourcesCount={sourcesCount} />}
            </div>
            <BottomTabBar embedded activeTab="mine" alertCount={alerts.length} />
          </div>
        </PhoneFrame>

        <PhoneFrame screenClassName="bg-surface-1" caption={<><b>Phone · search.</b> ⌘K becomes a full-screen sheet from the top bar's search button.</>}>
          <div className="relative min-h-0 flex-1">
            <CommandPalette
              presentation="inline" layout="sheet"
              open={sheetOpen} onOpenChange={setSheetOpen}
              defaultQuery="FT54"
              things={items} notices={paletteNotices} noticesStatus={paletteNoticesStatus} onSearch={onPaletteSearch}
              total={total} household={household}
            />
            {!sheetOpen && (
              <div className="grid h-full place-items-center">
                <Button variant="secondary" onClick={() => setSheetOpen(true)}>Open the search sheet</Button>
              </div>
            )}
          </div>
        </PhoneFrame>
      </div>
      <Note className="sr-only">The two phones are specimens at 390 px; the live shell switches to them below 768 px.</Note>
    </KitSection>
  );
}
