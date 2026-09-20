/**
 * Real demo data from the brief, typed as the API and household store return it.
 * Used by the /kit page, the 404 page and the video. Every displayed value is real; the only
 * placeholders are internal ids (item_id, some notice pk suffixes), marked "id:" below. Replace
 * them with the store's and the API's ids when wiring.
 */
import type { AppShellData } from "./AppShell";
import type { KitViewProps } from "./KitView";
import type { NotFoundViewProps } from "./NotFoundView";
import type { ToastData } from "./Toast";
import type { HouseholdItem, HouseholdState, NoticeSummary, StatsSummary } from "./types";

/** "No match in 4 sources as of 15:08" (IST). 15:08 IST = 09:38 UTC. */
export const AS_OF_ISO = "2026-09-20T09:38:00Z";
export const AS_OF = "15:08";

/** `GET /v1/stats`: 4,868 notices. CDSCO 2,696 · CPSC 1,852 · NHTSA 38 · openFDA 282. Pollers every 15 min; CDSCO daily. */
export const STATS: StatsSummary = {
  total: 4868,
  sources: [
    { source: "cdsco_nsq", label: "CDSCO", count: 2696, health: "healthy", polls_every: "daily", last_success_at: "2026-09-19T18:24:00Z" },
    { source: "cpsc", label: "CPSC", count: 1852, health: "healthy", polls_every: "15 min", last_success_at: AS_OF_ISO },
    { source: "nhtsa", label: "NHTSA", count: 38, health: "healthy", polls_every: "15 min", last_success_at: AS_OF_ISO },
    { source: "openfda", label: "openFDA", count: 282, health: "healthy", polls_every: "15 min", last_success_at: AS_OF_ISO },
  ],
};

/** CDSCO latest month: JUL-2026, 239 drug samples failed (`pollers[cdsco_portal].last_counts.fetched`). */
export const CDSCO_LATEST = { month: "JUL-2026", failed: 239 } as const;

/**
 * Kit `?state=sources-down`: openFDA slow, NHTSA down since 14:52 IST (09:22 UTC), next retry 15:23.
 * The health values are a demo of the states; the counts are the real ones.
 */
export const SOURCES_DEGRADED_DEMO: StatsSummary["sources"] = [
  STATS.sources[0],
  STATS.sources[1],
  { ...STATS.sources[3], health: "degraded" },
  { ...STATS.sources[2], health: "down", last_success_at: "2026-09-20T09:22:00Z", last_error: "timeout" },
];

// ------------------------------------------------------------------ notices (`/v1/notices`)
/** CDSCO JUL-2026 alert, row 12: the FT5427 strip. pk from the feed spec's deep-link example. */
export const NOTICE_FT5427: NoticeSummary = {
  pk: "cdsco_nsq#JUL-2026-cdsco_portal-005f85bb4ee1",
  source: "cdsco_nsq",
  notice_id: "JUL-2026 · row 12",
  row_ref: { month: "JUL-2026", row: 12 },
  product: "Paracetamol Tablets IP 650mg",
  brand: "Forgo Pharmaceuticals, 27, DIC Ind Area, Barotiwala, Teh: Baddi, Distt. Solan (HP) 174103",
  batches: ["FT5427"],
  hazard_or_failed_test: "The sample does not conforms to the I.P. with respect to Dissolution Test.",
  published_at: "2026-07-01",
};

export const NOTICES: NoticeSummary[] = [
  NOTICE_FT5427,
  {
    pk: "cdsco_nsq#JUL-2026-row-129", // id: pk
    source: "cdsco_nsq",
    notice_id: "JUL-2026 · row 129",
    row_ref: { month: "JUL-2026", row: 129 },
    product: "Aceclofenac & Paracetamol Tablets IP",
    brand: "Oxford Pharma",
    batches: ["MT250239"],
    hazard_or_failed_test: "Content of Aceclofenac (82.94%)",
    published_at: "2026-07-01",
  },
  {
    pk: "cpsc#10984",
    source: "cpsc",
    notice_id: "10984",
    product: "Infrared Saunas, Hybrid Infrared Saunas and Infrared Kits",
    hazard_or_failed_test: "Panels can short circuit, posing fire and burn hazards.",
    published_at: "2026-09-17",
  },
  {
    pk: "cpsc#10982",
    source: "cpsc",
    notice_id: "10982",
    product: "Esjay Toddler Busy Board Montessori Toys",
    hazard_or_failed_test: "Small parts ban.",
    // published_at: not in the brief; comes from /v1/notices
  },
  {
    pk: "cpsc#2510",
    source: "cpsc",
    notice_id: "2510",
    product: "Charbroil Bistro Pro Electric Grills",
    hazard_or_failed_test: "Grounding wire can disconnect.",
    // published_at: not in the brief; comes from /v1/notices
  },
  {
    pk: "nhtsa#24V436000",
    source: "nhtsa",
    notice_id: "24V436000",
    product: "Jeep Compass rearview camera",
    brand: "Jeep / Chrysler",
    model: "Compass",
    hazard_or_failed_test: "The radio software may prevent the rearview image from displaying.",
    published_at: "2024-06-13",
  },
];

// ------------------------------------------------------------------ demo household (15 things)
const checked = { last_checked_at: AS_OF_ISO } as const;

/** The demo household: 2 on a notice, 1 near miss, 1 checking (the Swift), 11 no match. */
export const HOUSEHOLD_ITEMS: HouseholdItem[] = [
  {
    item_id: "demo_paracetamol_ft5427", // id:
    kind: "medicine",
    name: "Paracetamol Tablets IP 650mg",
    brand: "Forgo Pharmaceuticals",
    batch: "FT5427",
    purchase_date: "2026-07-12",
    status: "alert",
    notice_id: NOTICE_FT5427.pk,
    case_id: "case_demo_ft5427",
    ...checked,
    face: "alert",
  },
  {
    item_id: "demo_jeep_compass", // id:
    kind: "vehicle",
    name: "Jeep Compass",
    make: "Jeep",
    model: "Compass",
    year: 2022,
    status: "alert",
    notice_id: "nhtsa#24V436000",
    ...checked,
    face: "alert",
  },
  {
    item_id: "demo_paracetamol_ft5428", // id:
    kind: "medicine",
    name: "Paracetamol Tablets IP 650mg",
    brand: "Forgo Pharmaceuticals",
    batch: "FT5428",
    listed_batch: "FT5427",
    ...checked,
    face: "near-miss",
  },
  { item_id: "demo_swift", kind: "vehicle", name: "Maruti Suzuki Swift", make: "Maruti Suzuki", model: "Swift", last_checked_at: null, face: "checking" },
  { item_id: "demo_crocin", kind: "medicine", name: "Crocin Advance 500mg Tablets", brand: "GSK", ...checked, face: "clear" },
  { item_id: "demo_dolo", kind: "medicine", name: "Dolo 650", brand: "Micro Labs", ...checked, face: "clear" },
  { item_id: "demo_bajaj_iron", kind: "appliance", name: "Bajaj Majesty DX-6 Dry Iron", brand: "Bajaj", ...checked, face: "clear" },
  { item_id: "demo_butterfly_stove", kind: "appliance", name: "Butterfly Smart Glass 3 Burner Gas Stove", brand: "Butterfly", ...checked, face: "clear" },
  { item_id: "demo_crompton_geyser", kind: "appliance", name: "Crompton Arno Neo Storage Geyser", brand: "Crompton", ...checked, face: "clear" },
  { item_id: "demo_havells_fan", kind: "appliance", name: "Havells Efficiencia Neo Ceiling Fan", brand: "Havells", ...checked, face: "clear" },
  { item_id: "demo_pigeon_induction", kind: "appliance", name: "Pigeon Cruise Induction Cooktop", brand: "Pigeon", ...checked, face: "clear" },
  { item_id: "demo_boat_airdopes", kind: "other", name: "boAt Airdopes 141 Earbuds", brand: "boAt", ...checked, face: "clear" },
  { item_id: "demo_hawkins_cooker", kind: "other", name: "Hawkins Contura Hard Anodised Cooker", brand: "Hawkins", ...checked, face: "clear" },
  { item_id: "demo_milton_flask", kind: "other", name: "Milton Thermosteel Flip Lid Flask", brand: "Milton", ...checked, face: "clear" },
  { item_id: "demo_prestige_cooker", kind: "other", name: "Prestige Deluxe Plus Pressure Cooker", brand: "Prestige", ...checked, face: "clear" },
];

export const DEMO_HOUSEHOLD: HouseholdState = { kind: "demo", household_id: "demo", count: HOUSEHOLD_ITEMS.length };

/** Recent palette searches (the feed's no-results suggestions double as these). */
export const RECENT_SEARCHES = ["FT5427", "Jeep Compass", "Paracetamol"];

// ------------------------------------------------------------------ case facts (kit specimens)
export const EVIDENCE = {
  sha256: "56237b4d612cf0bcd7e97aa1d6ddb88ebdb31f3f23708a6028ac10ab4b9c29a7",
  keyAlias: "alias/recallindia-signing",
  algorithm: "RSASSA_PKCS1_V1_5_SHA_256",
  lockedUntil: "2026-10-19",
} as const;

// ------------------------------------------------------------------ toasts
export const TOASTS: ToastData[] = [
  { kind: "success", title: "Claim letter ready", description: "Evidence sealed · ", emphasis: "VERIFIED", action: { label: "Open case", href: "/case/?id=case_demo_ft5427" } },
  { kind: "neutral", title: "Your household is ready", description: "15 things copied. The demo is unchanged.", dismissible: true },
  { kind: "sourceDown", title: "NHTSA didn't answer", description: "Showing notices from 14:52. Retrying at 15:23." },
];

// ------------------------------------------------------------------ shell
/** AppShell data for /kit and 404 (no active tab). The palette notices come from `searchNotices`. */
export const SHELL_FIXTURE: AppShellData = {
  activeTab: null,
  total: STATS.total,
  household: DEMO_HOUSEHOLD,
  things: HOUSEHOLD_ITEMS,
  notices: [],
  noticesStatus: "idle",
  recentSearches: RECENT_SEARCHES,
};

/** Local stand-in for `GET /v1/notices?q={q}&limit=5` over the fixtures (kit and video only). */
export function searchNotices(q: string, notices: NoticeSummary[] = NOTICES): NoticeSummary[] {
  const needle = q.toLowerCase().replace(/\s+/g, "");
  if (!needle) return [];
  return notices
    .filter((n) => [n.product, n.notice_id, n.brand, n.model, ...(n.batches ?? [])].some((f) => f && f.toLowerCase().replace(/\s+/g, "").includes(needle)))
    .slice(0, 5);
}

// ------------------------------------------------------------------ views

/** Everything /kit renders, minus `state` (read from the URL). */
export const KIT_FIXTURE: Omit<KitViewProps, "state"> = {
  shell: SHELL_FIXTURE,
  stats: STATS,
  sourcesDemo: SOURCES_DEGRADED_DEMO,
  items: HOUSEHOLD_ITEMS,
  notices: NOTICES,
  alertNotice: NOTICE_FT5427,
  toasts: TOASTS,
  evidence: EVIDENCE,
  asOf: AS_OF,
  cdscoLatest: CDSCO_LATEST,
  strip: { batch: "FT5427", expiry: "09/2027", nearBatch: "FT5428" },
  searchNotices: (q: string) => searchNotices(q),
};

export const NOT_FOUND_FIXTURE: NotFoundViewProps = { shell: SHELL_FIXTURE };
