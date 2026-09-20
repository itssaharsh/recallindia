/**
 * /mine fixtures: the real demo household and notices from the brief, for /kit, the video and QA states.
 * Times are UTC; the UI shows IST ("as of 15:08" = 09:38Z on 20 Sep 2026; last poll 15:05, next 15:20).
 *
 * The photo is the same render the mockups use: copy `assets/demo-strip-photo.png` to
 * `public/demo/strip-photo.png`. Its Textract words are the WORD polygons measured on that render.
 */
import type {
  CheckStatus,
  HouseholdItem,
  MineStats,
  NoticeView,
  OcrResult,
  OcrWord,
  ScanPhoto,
  VehicleOptions,
} from "./types";

export const AS_OF = "2026-09-20T09:38:00Z"; // 15:08 IST
const LAST_POLL = "2026-09-20T09:35:00Z"; // 15:05 IST → next poll 15:20 IST

/* ------------------------------------------------------------------ stats */

export const demoStats: MineStats = {
  total: 4868,
  sources_count: 4,
  sources: [
    { source: "cdsco_nsq", label: "CDSCO", count: 2696, health: "healthy", last_run_at: "2026-09-19T18:24:32Z", polls_every: "1 day" },
    { source: "cpsc", label: "CPSC", count: 1852, health: "healthy", last_run_at: LAST_POLL, polls_every: "15 min" },
    { source: "nhtsa", label: "NHTSA", count: 38, health: "healthy", last_run_at: LAST_POLL, polls_every: "15 min" },
    { source: "openfda", label: "openFDA", count: 282, health: "healthy", last_run_at: LAST_POLL, polls_every: "15 min" },
  ],
};

/* ---------------------------------------------------------------- notices */

export const NOTICE_FT5427 = "JUL-2026-cdsco_portal-b75cfffe3713";
export const NOTICE_24V436000 = "24V436000";

export const demoNotices: Record<string, NoticeView> = {
  [NOTICE_FT5427]: {
    notice_id: NOTICE_FT5427,
    source: "cdsco_nsq",
    title: "Paracetamol Tablets IP 650mg — failed CDSCO quality test, JUL-2026 alert, row 12",
    published_at: "2026-07-01",
    batch: "FT5427",
    month: "JUL-2026",
    row: 12,
    reason: "The sample does not conforms to the I.P. with respect to Dissolution Test.",
    lab: "DTL Bikaner",
    lab_type: "State Lab",
    maker: "Forgo Pharmaceuticals",
  },
  [NOTICE_24V436000]: {
    notice_id: NOTICE_24V436000,
    source: "nhtsa",
    title: "Jeep/Chrysler rearview camera",
    published_at: "2024-06-13",
    campaign: "24V436000",
    summary: "The radio software may prevent the rearview image from displaying.",
    model_years: [2021, 2023],
    maker: "Jeep",
  },
};

/* ------------------------------------------------------------------ items */

const clear = (item_id: string, kind: HouseholdItem["kind"], name: string, brand: string): HouseholdItem => ({
  item_id,
  kind,
  name,
  brand,
  last_checked_at: AS_OF,
});

/** Paracetamol FT5427: on the CDSCO JUL-2026 alert, row 12; bought 11 days after the notice. */
export const itemFT5427: HouseholdItem = {
  item_id: "demo-alert",
  kind: "medicine",
  name: "Paracetamol Tablets IP 650mg",
  brand: "Forgo Pharmaceuticals",
  batch: "FT5427",
  mfg_date: "Oct-2025",
  exp_date: "Sep-2027",
  purchase_date: "2026-07-12",
  status: "alert",
  notice_id: NOTICE_FT5427,
  case_id: "case_demo_ft5427",
  reason: "failed CDSCO quality test, JUL-2026 alert, row 12; batch FT5427 in listed batches [FT5427]",
  last_checked_at: AS_OF,
};

/** Jeep Compass 2022: NHTSA recall 24V436000, matched by make, model and year (listed 2021–2023). */
export const itemJeep: HouseholdItem = {
  item_id: "demo-jeep-compass",
  kind: "vehicle",
  name: "Jeep Compass",
  brand: "Jeep",
  make: "jeep",
  model: "compass",
  year: 2022,
  status: "alert",
  notice_id: NOTICE_24V436000,
  case_id: "case-20260920095511-5cea83",
  reason: "NHTSA recall 24V436000; model year 2022 within 2021–2023",
  last_checked_at: AS_OF,
};

/** Paracetamol FT5428: same medicine and maker, one character from the listed FT5427; dismissed. */
export const itemFT5428: HouseholdItem = {
  item_id: "demo-near-miss",
  kind: "medicine",
  name: "Paracetamol Tablets IP 650mg",
  brand: "Forgo Pharmaceuticals",
  batch: "FT5428",
  notice_id: NOTICE_FT5427,
  case: { decision: "dismiss" },
  last_checked_at: AS_OF,
};

/** Maruti Suzuki Swift: mid-check in the demo (no year stored). */
export const itemSwift: HouseholdItem = {
  item_id: "demo-swift",
  kind: "vehicle",
  name: "Maruti Suzuki Swift",
  brand: "Maruti Suzuki",
  make: "maruti",
  model: "swift",
  last_checked_at: null,
};

export const clearItems: HouseholdItem[] = [
  clear("demo-bajaj-iron", "appliance", "Bajaj Majesty DX-6 Dry Iron", "Bajaj"),
  clear("demo-boat-airdopes", "other", "boAt Airdopes 141 Earbuds", "boAt"),
  clear("demo-butterfly-stove", "appliance", "Butterfly Smart Glass 3 Burner Gas Stove", "Butterfly"),
  clear("demo-crocin", "medicine", "Crocin Advance 500mg Tablets", "GSK"),
  clear("demo-crompton-geyser", "appliance", "Crompton Arno Neo Storage Geyser", "Crompton"),
  clear("demo-dolo", "medicine", "Dolo 650", "Micro Labs"),
  clear("demo-havells-fan", "appliance", "Havells Efficiencia Neo Ceiling Fan", "Havells"),
  clear("demo-hawkins-cooker", "other", "Hawkins Contura Hard Anodised Cooker", "Hawkins"),
  clear("demo-milton-flask", "other", "Milton Thermosteel Flip Lid Flask", "Milton"),
  clear("demo-pigeon-induction", "appliance", "Pigeon Cruise Induction Cooktop", "Pigeon"),
  clear("demo-prestige-cooker", "other", "Prestige Deluxe Plus Pressure Cooker", "Prestige"),
];

/** The 15 things of the demo household (mockups/mine-full-1536.png). */
export const demoItems: HouseholdItem[] = [itemFT5427, itemJeep, itemFT5428, itemSwift, ...clearItems];

/* ----------------------------------------------------------------- checks */

/** The Swift mid-check: CDSCO and CPSC done, NHTSA running, openFDA waiting ("Checking · 2 of 4", 62%). */
export const swiftChecking: CheckStatus = {
  status: "RUNNING",
  sources: [
    { source: "cdsco_nsq", state: "done", result: "no_match" },
    { source: "cpsc", state: "done", result: "no_match" },
    { source: "nhtsa", state: "running" },
    { source: "openfda", state: "waiting" },
  ],
};

export const demoChecks: Record<string, CheckStatus> = { [itemSwift.item_id]: swiftChecking };

/* -------------------------------------------------------------------- scan */

export const demoPhoto: ScanPhoto = {
  src: "/demo/strip-photo.png",
  width: 1400,
  height: 1050,
  // stands in for a user who framed closer (spec §2.12); real photos leave crop unset
  crop: { x: 102, y: 108, w: 1100, h: 825 },
};

/** Textract WORD blocks on the demo photo: 9 words, FT5427 flagged as the batch. */
export const demoWords: OcrWord[] = [
  { text: "PARACETAMOL", box: { left: 0.2539, top: 0.2021, width: 0.1386, height: 0.0785 }, poly: [[0.2586, 0.2021], [0.3926, 0.2618], [0.3878, 0.2806], [0.2539, 0.2209]], field: "name" },
  { text: "TABLETS", box: { left: 0.3879, top: 0.2644, width: 0.0825, height: 0.0527 }, poly: [[0.3924, 0.2644], [0.4704, 0.2991], [0.4659, 0.317], [0.3879, 0.2823]], field: "name" },
  { text: "IP", box: { left: 0.4665, top: 0.3011, width: 0.0246, height: 0.0261 }, poly: [[0.4708, 0.3011], [0.4911, 0.3102], [0.4869, 0.3272], [0.4665, 0.3181]], field: "name" },
  { text: "650", box: { left: 0.488, top: 0.3115, width: 0.0368, height: 0.0314 }, poly: [[0.4923, 0.3115], [0.5248, 0.326], [0.5206, 0.343], [0.488, 0.3285]], field: "name" },
  { text: "mg", box: { left: 0.5209, top: 0.3294, width: 0.0311, height: 0.0299 }, poly: [[0.5254, 0.3294], [0.5519, 0.3413], [0.5474, 0.3593], [0.5209, 0.3475]], field: "name" },
  { text: "B.No.", box: { left: 0.1787, top: 0.5061, width: 0.0694, height: 0.0511 }, poly: [[0.1844, 0.5061], [0.2481, 0.5324], [0.2424, 0.5572], [0.1787, 0.531]] },
  { text: "FT5427", box: { left: 0.257, top: 0.5388, width: 0.0819, height: 0.0543 }, poly: [[0.2622, 0.5388], [0.3389, 0.5704], [0.3336, 0.593], [0.257, 0.5613]], is_batch: true, field: "batch" },
  { text: "EXP", box: { left: 0.37, top: 0.5862, width: 0.0435, height: 0.038 }, poly: [[0.3751, 0.5862], [0.4135, 0.6021], [0.4084, 0.6242], [0.37, 0.6084]], field: "exp_date" },
  { text: "09/2027", box: { left: 0.4196, top: 0.6073, width: 0.0903, height: 0.0572 }, poly: [[0.4247, 0.6073], [0.5099, 0.6425], [0.5047, 0.6646], [0.4196, 0.6294]], field: "exp_date" },
];

/** `add-confirmed` (the mock): one batch found. */
export const demoOcr: OcrResult = {
  fields: { name: "Paracetamol Tablets IP 650mg", brand: null, batch: "FT5427", mfg_date: null, exp_date: "09/2027" },
  words: demoWords,
  passes: ["main"],
};

/**
 * `add-candidates`: nothing flagged as the batch, and Textract misread the expiry as "O9/2O27" (letter O for zero),
 * so two codes pass the candidate rule: FT5427 (next to B.No.) and O9/2O27 (next to EXP · looks like an expiry).
 */
export const candidatesOcr: OcrResult = {
  fields: { name: "Paracetamol Tablets IP 650mg", brand: null, batch: null, mfg_date: null, exp_date: null },
  words: demoWords.map((w) => (w.text === "09/2027" ? { ...w, text: "O9/2O27", field: null } : { ...w, is_batch: false, field: w.field === "batch" ? null : w.field })),
  passes: ["main"],
};

/** `add-failed`: glare washed out the batch, so Textract read 8 words and none looks like a batch. */
export const failedOcr: OcrResult = {
  fields: { name: "Paracetamol Tablets IP 650mg", brand: null, batch: null, mfg_date: null, exp_date: "09/2027" },
  words: demoWords.filter((w) => w.text !== "FT5427"),
  passes: ["main"],
};

/** Vehicle form choices (the route can load its own list). */
export const vehicleOptions: VehicleOptions = {
  makes: ["Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Kia", "Toyota", "Honda", "Jeep"],
  models: {
    "Maruti Suzuki": ["Swift", "Baleno", "Brezza", "Dzire", "Ertiga", "Wagon R"],
    Hyundai: ["Creta", "Venue", "i20", "Verna"],
    Tata: ["Nexon", "Punch", "Tiago", "Harrier"],
    Mahindra: ["Scorpio", "XUV700", "Thar", "Bolero"],
    Kia: ["Seltos", "Sonet", "Carens"],
    Toyota: ["Innova", "Fortuner", "Glanza"],
    Honda: ["City", "Amaze", "Elevate"],
    Jeep: ["Compass", "Meridian", "Wrangler"],
  },
  years: Array.from({ length: 17 }, (_, i) => 2026 - i),
};

/* ------------------------------------------------------- sheet: new items */

/** The strip scanned in the sheet, once saved (`add-checking`, then `add-added-alert`). */
export const newFT5427Checking: HouseholdItem = { ...itemFT5427, item_id: "new-ft5427", status: null, case_id: null, last_checked_at: null };
export const newFT5427Alert: HouseholdItem = { ...itemFT5427, item_id: "new-ft5427", purchase_date: null, case_id: "case_demo_ft5427" };
export const newChecking: CheckStatus = {
  status: "RUNNING",
  sources: [
    { source: "cdsco_nsq", state: "running" },
    { source: "cpsc", state: "waiting" },
    { source: "nhtsa", state: "waiting" },
    { source: "openfda", state: "waiting" },
  ],
};
/** A vehicle added in the sheet that has no match (`add-added-clear`). */
export const newSwiftClear: HouseholdItem = { ...itemSwift, item_id: "new-swift", year: 2021, last_checked_at: AS_OF };

/* --------------------------------------------------------- other scenarios */

/** `?state=many`: 22 things (the demo 15 plus 7 more clear ones) → the strip's last pocket reads "+7". */
export const manyItems: HouseholdItem[] = [
  ...demoItems,
  clear("more-1", "appliance", "Bajaj Majesty DX-6 Dry Iron (bedroom)", "Bajaj"),
  clear("more-2", "medicine", "Dolo 650 (travel kit)", "Micro Labs"),
  clear("more-3", "other", "Milton Thermosteel Flip Lid Flask (office)", "Milton"),
  clear("more-4", "appliance", "Havells Efficiencia Neo Ceiling Fan (hall)", "Havells"),
  clear("more-5", "appliance", "Havells Efficiencia Neo Ceiling Fan (bedroom)", "Havells"),
  clear("more-6", "other", "Prestige Deluxe Plus Pressure Cooker (3 L)", "Prestige"),
  clear("more-7", "medicine", "Crocin Advance 500mg Tablets (travel kit)", "GSK"),
];
