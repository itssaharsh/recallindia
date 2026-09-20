"use client";
import * as React from "react";
import { AppShell, type AppShellData, type AppShellHandlers } from "./AppShell";
import { Lockup } from "./Brand";
import { shellToast, type ToastData } from "./Toast";
import { useTicker } from "./hooks";
import { KitIntro } from "./kit/KitIntro";
import { KitShellSection } from "./kit/KitShellSection";
import { KitColour, KitType } from "./kit/KitFoundations";
import { KitButtons, KitChips, KitInputs } from "./kit/KitControls";
import { KitCards, KitEmpty, KitMotion, KitOverlays } from "./kit/KitSurfaces";
import type { HouseholdAction, HouseholdItem, HouseholdState, NoticeSummary, NoticesStatus, SourceStat, StatsSummary } from "./types";

/** `/kit?state=…` acceptance values (spec §6, "Acceptance"). */
export const KIT_STATES = [
  "button-rest", "button-hover", "button-press", "button-focus", "button-disabled", "button-loading",
  "chips", "filters", "sources-down", "foil",
  "household-demo", "household-copying", "household-yours",
  "input-rest", "input-focus", "input-error",
  "cards", "palette", "palette-empty", "palette-none", "toasts", "loading",
  "mine-empty", "feed-none", "404",
] as const;
export type KitState = (typeof KIT_STATES)[number];

export function isKitState(v: string | null | undefined): v is KitState {
  return !!v && (KIT_STATES as readonly string[]).includes(v);
}

/** Which kit section each state scrolls to. */
const STATE_SECTION: Record<KitState, string> = {
  "button-rest": "buttons", "button-hover": "buttons", "button-press": "buttons", "button-focus": "buttons", "button-disabled": "buttons", "button-loading": "buttons",
  chips: "chips", filters: "chips", "sources-down": "chips", foil: "chips",
  "household-demo": "inputs", "household-copying": "inputs", "household-yours": "inputs",
  "input-rest": "inputs", "input-focus": "inputs", "input-error": "inputs",
  cards: "cards", palette: "overlays", "palette-empty": "overlays", "palette-none": "overlays", toasts: "overlays", loading: "loading",
  "mine-empty": "empty", "feed-none": "empty", "404": "empty",
};

export interface KitViewProps {
  /** Live shell data (activeTab null: /kit is not a tab). */
  shell: AppShellData;
  /** `GET /v1/stats` */
  stats: StatsSummary;
  /** Source chips as shown in section 05 (the real stats, or the degraded demo for `?state=sources-down`). */
  sourcesDemo: SourceStat[];
  /** Household store items (the demo household, 15). */
  items: HouseholdItem[];
  /** `/v1/notices` examples: feed cards, rows, palette results. */
  notices: NoticeSummary[];
  /** The CDSCO row the alert strip matches (JUL-2026, row 12). */
  alertNotice: NoticeSummary;
  toasts: ToastData[];
  evidence: { sha256: string; keyAlias: string; algorithm: string; lockedUntil: string };
  /** "15:08": the time of the last check, IST. */
  asOf: string;
  /** CDSCO latest month and failed samples (JUL-2026, 239). */
  cdscoLatest: { month: string; failed: number };
  /** Printed on the demo strip. */
  strip: { batch: string; expiry: string; nearBatch: string };
  /** `/kit?state=` (read with useSearchParams in the page). */
  state?: KitState | null;
  /** Local stand-in for `GET /v1/notices?q=&limit=5` (fixtures.searchNotices). The kit never fetches. */
  searchNotices: (q: string) => NoticeSummary[];
  handlers?: AppShellHandlers;
}

/** Palette notices for one palette instance, answered locally (no network). */
function useLocalNoticeSearch(search: (q: string) => NoticeSummary[], initial = "") {
  const [notices, setNotices] = React.useState<NoticeSummary[]>(() => search(initial));
  const [status, setStatus] = React.useState<NoticesStatus>(initial ? "ready" : "idle");
  const [query, setQuery] = React.useState(initial);
  const onSearch = React.useCallback((q: string) => {
    setNotices(search(q));
    setQuery(q);
    setStatus("ready");
  }, [search]);
  return { notices, status, query, onSearch };
}

const fmtLocked = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

/**
 * /kit (spec §1: "Cobalt & Foil" and the three material tiles, no active tab). Every primitive and
 * state, composed from one props object. Matches v3/mockups/kit-full-1536.png and shell-390.png.
 * The household pill in the nav is live: "Make my own copy" runs demo → copying (1 → 15 in 1.2 s)
 * → yours, then the "Your household is ready" toast.
 */
export function KitView(props: KitViewProps) {
  const { shell, stats, items, notices, alertNotice, toasts, evidence, asOf, cdscoLatest, strip, state, handlers } = props;
  const count = items.length;
  const alertCount = items.filter((i) => i.face === "alert").length;
  const sourceLabels = stats.sources.map((s) => s.label);

  // live household pill
  const initialHousehold: HouseholdState =
    state === "household-copying" ? { kind: "copying", copied: 9, total: count }
      : state === "household-yours" ? { kind: "yours", household_id: "yours", count }
        : shell.household;
  const [household, setHousehold] = React.useState<HouseholdState>(initialHousehold);
  const [copyRun, setCopyRun] = React.useState(false);
  const copied = useTicker(copyRun, count, 1200, () => {
    setCopyRun(false);
    setHousehold({ kind: "yours", household_id: "yours", count });
    shellToast.show({ kind: "neutral", title: "Your household is ready", description: `${count} things copied. The demo is unchanged.`, dismissible: true });
  });
  React.useEffect(() => {
    if (copyRun) setHousehold({ kind: "copying", copied: Math.max(1, copied), total: count });
  }, [copyRun, copied, count]);

  const onHouseholdAction = (a: HouseholdAction) => {
    handlers?.onHouseholdAction?.(a);
    if (a === "make-copy" && household.kind === "demo") setCopyRun(true);
    if (a === "reset" || a === "delete") setHousehold(shell.household);
  };

  // live palette (nav): opened by ?state=palette*
  const paletteQuery = state === "palette" ? "FT54" : state === "palette-none" ? "FT9999" : "";
  const [paletteOpen, setPaletteOpen] = React.useState(state === "palette" || state === "palette-empty" || state === "palette-none");
  const live = useLocalNoticeSearch(props.searchNotices, paletteQuery);
  const stage = useLocalNoticeSearch(props.searchNotices, "FT54");
  const phone = useLocalNoticeSearch(props.searchNotices, "FT54");

  // scroll to the state's section; fire the toasts for ?state=toasts
  React.useEffect(() => {
    if (!state) return;
    document.getElementById(STATE_SECTION[state])?.scrollIntoView({ block: "start" });
    if (state === "toasts") toasts.forEach((t, i) => shellToast.show({ ...t, id: `kit-state-${i}`, duration: Infinity }));
  }, [state, toasts]);

  return (
    <AppShell
      {...shell}
      {...handlers}
      activeTab={null}
      household={household}
      onHouseholdAction={onHouseholdAction}
      notices={live.notices}
      noticesStatus={live.status}
      noticesQuery={live.query}
      onSearch={live.onSearch}
      paletteOpen={paletteOpen}
      onPaletteOpenChange={setPaletteOpen}
      paletteDefaultQuery={paletteQuery}
    >
      <KitIntro total={stats.total} sourcesCount={stats.sources.length} alertCount={alertCount} thingsCount={count} batch={strip.batch} expiry={strip.expiry} />
      <KitShellSection
        household={household} total={stats.total} sourcesCount={stats.sources.length} items={items} alertNotice={alertNotice} asOf={asOf}
        paletteNotices={phone.notices} paletteNoticesStatus={phone.status} onPaletteSearch={phone.onSearch}
      />
      <KitColour />
      <KitType sha256={evidence.sha256} keyAlias={evidence.keyAlias} algorithm={evidence.algorithm} batch={strip.batch} total={stats.total} cdscoFailed={cdscoLatest.failed} asOf={asOf} sourcesCount={stats.sources.length} />
      <KitButtons />
      <KitChips sources={props.sourcesDemo} items={items} asOf={asOf} sourcesCount={stats.sources.length} batch={strip.batch} nearBatch={strip.nearBatch} lockedUntil={fmtLocked(evidence.lockedUntil)} />
      <KitInputs batch={strip.batch} thingsCount={count} onHouseholdAction={onHouseholdAction} />
      <KitCards notices={notices} items={items} total={stats.total} sources={stats.sources} asOf={asOf} sourcesCount={stats.sources.length} />
      <KitOverlays household={household} items={items} total={stats.total} toasts={toasts} paletteNotices={stage.notices} paletteNoticesStatus={stage.status} onPaletteSearch={stage.onSearch} />
      <KitEmpty total={stats.total} sourceLabels={sourceLabels} onCopyDemo={() => onHouseholdAction("make-copy")} />
      <KitMotion forceLoading={state === "loading"} items={items} asOf={asOf} sourcesCount={stats.sources.length} />

      <footer className="mt-24 flex flex-wrap items-center gap-[18px] border-t border-line pb-10 pt-7 text-[14px] leading-[1.4] text-ink-muted">
        <Lockup size="footer" labelled />
        <span>/kit · the tokens and primitives behind every screen</span>
        <span className="ml-auto max-md:ml-0">Built for WeMakeDevs × AWS First Commit</span>
      </footer>
    </AppShell>
  );
}
