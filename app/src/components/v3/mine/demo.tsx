"use client";
/**
 * useMineDemo: MineViewProps for every `?state=` in spec/mine.md, driven by fixtures and timers only
 * (no network). For /kit and the video recording. The real /mine route builds the same props from the API.
 *
 *   const props = useMineDemo(searchParams.get("state") ?? "demo");
 *   return <MineView {...props} />;
 */
import * as React from "react";
import type { MineViewProps } from "./MineView";
import {
  AS_OF,
  candidatesOcr,
  clearItems,
  demoChecks,
  demoItems,
  demoNotices,
  demoOcr,
  demoPhoto,
  demoStats,
  demoWords,
  failedOcr,
  itemFT5427,
  itemFT5428,
  itemJeep,
  itemSwift,
  manyItems,
  newChecking,
  newFT5427Alert,
  newFT5427Checking,
  newSwiftClear,
  swiftChecking,
  vehicleOptions,
} from "./fixtures";
import type { AddThingSheetProps } from "./AddThingSheet";
import type { AddKind, BannerState, CheckStatus, HouseholdItem, HouseholdMode, NewItem, ScanPhase } from "./types";

export const MINE_STATES = [
  "demo",
  "one-alert",
  "all-clear",
  "first-check",
  "empty",
  "many",
  "needs-you",
  "bought-before",
  "no-purchase-date",
  "copying",
  "own",
  "own-confirm-reset",
  "copy-error",
  "flip",
  "flip-alert",
  "add-idle",
  "add-uploading",
  "add-reading",
  "add-candidates",
  "add-confirmed",
  "add-failed",
  "add-upload-error",
  "add-checking",
  "add-added-clear",
  "add-added-alert",
  "add-vehicle",
  "add-appliance",
] as const;
export type MineState = (typeof MINE_STATES)[number];

type Sheet = Omit<AddThingSheetProps, "household" | "sourcesCount">;

const closedSheet = (): Sheet => ({ open: false, kind: "medicine", step: "scan", scan: { scan: { phase: "idle" } }, onClose: () => {} });

function initialItems(state: MineState): { items: HouseholdItem[]; checks: Record<string, CheckStatus> } {
  switch (state) {
    case "one-alert":
      return { items: demoItems.filter((i) => i !== itemJeep), checks: demoChecks };
    case "all-clear":
      return { items: [itemFT5428, { ...itemSwift, last_checked_at: AS_OF }, ...clearItems], checks: {} };
    case "first-check": {
      const items = demoItems.map((i) => ({ ...i, status: null, case: null, last_checked_at: null }));
      return { items, checks: Object.fromEntries(items.map((i) => [i.item_id, { ...newChecking }])) };
    }
    case "empty":
      return { items: [], checks: {} };
    case "many":
      return { items: manyItems, checks: demoChecks };
    case "needs-you":
      return { items: demoItems.map((i) => (i === itemFT5428 ? { ...i, status: "hold" as const, case: null } : i)), checks: demoChecks };
    case "bought-before":
      return { items: demoItems.map((i) => (i === itemFT5427 ? { ...i, purchase_date: "2026-06-20" } : i)), checks: demoChecks };
    case "no-purchase-date":
      return { items: demoItems.map((i) => (i === itemFT5427 ? { ...i, purchase_date: null } : i)), checks: demoChecks };
    case "flip-alert":
      return {
        items: demoItems.map((i) => (i === itemFT5427 ? { ...i, status: null, last_checked_at: null } : i)),
        checks: { ...demoChecks, [itemFT5427.item_id]: { status: "RUNNING", sources: [{ source: "cdsco_nsq", state: "running" }, { source: "cpsc", state: "waiting" }, { source: "nhtsa", state: "waiting" }, { source: "openfda", state: "waiting" }] } },
      };
    default:
      return { items: demoItems, checks: demoChecks };
  }
}

function initialSheet(state: MineState): Sheet {
  const base = closedSheet();
  const open = (patch: Partial<Sheet>): Sheet => ({ ...base, open: true, ...patch });
  switch (state) {
    case "add-idle":
      return open({});
    case "add-uploading":
      return open({ scan: { scan: { phase: "uploading", progress: 0.62 }, photo: demoPhoto } });
    case "add-reading":
      return open({ scan: { scan: { phase: "reading", words: demoWords.slice(0, 5) }, photo: demoPhoto } });
    case "add-candidates":
      return open({ scan: { scan: { phase: "result", ocr: candidatesOcr }, photo: demoPhoto, photoKey: "uploads/demo-strip.jpg" } });
    case "add-confirmed":
      return open({ scan: { scan: { phase: "result", ocr: demoOcr }, photo: demoPhoto, photoKey: "uploads/demo-strip.jpg" } });
    case "add-failed":
      return open({ scan: { scan: { phase: "result", ocr: failedOcr }, photo: demoPhoto, photoKey: "uploads/demo-strip.jpg" } });
    case "add-upload-error":
      return open({ scan: { scan: { phase: "upload-error", status: 403 }, photo: demoPhoto } });
    case "add-checking":
      return open({ step: "checking", item: newFT5427Checking, face: "checking", check: newChecking, notice: null });
    case "add-added-alert":
      return open({ step: "added", item: newFT5427Alert, face: "alert", notice: demoNotices[newFT5427Alert.notice_id!] });
    case "add-added-clear":
      return open({ kind: "vehicle", step: "added", item: newSwiftClear, face: "clear" });
    case "add-vehicle":
      return open({ kind: "vehicle" });
    case "add-appliance":
      return open({ kind: "appliance" });
    default:
      return base;
  }
}

function bannerFor(state: MineState): { mode: HouseholdMode; banner: BannerState } {
  switch (state) {
    case "copying":
      return { mode: "demo", banner: "copying" };
    case "own":
      return { mode: "own", banner: "own" };
    case "own-confirm-reset":
      return { mode: "own", banner: "own-confirm-reset" };
    case "copy-error":
      return { mode: "demo", banner: "error" };
    default:
      return { mode: "demo", banner: "demo" };
  }
}

export function useMineDemo(stateParam: string, opts: { intro?: boolean } = {}): MineViewProps {
  const state = (MINE_STATES as readonly string[]).includes(stateParam) ? (stateParam as MineState) : "demo";
  const [{ items, checks }, setData] = React.useState(() => initialItems(state));
  const [sheet, setSheet] = React.useState<Sheet>(() => initialSheet(state));
  const [house, setHouse] = React.useState(() => bannerFor(state));
  const [submitting, setSubmitting] = React.useState(false);
  const timers = React.useRef<number[]>([]);
  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /* reset when the state changes (kit switcher) */
  React.useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setData(initialItems(state));
    setSheet(initialSheet(state));
    setHouse(bannerFor(state));
  }, [state]);

  /* timelines: ?state=flip and ?state=flip-alert finish their check 1.5 s after load */
  React.useEffect(() => {
    if (state === "flip") {
      later(1500, () =>
        setData((d) => ({
          items: d.items.map((i) => (i.item_id === itemSwift.item_id ? { ...i, last_checked_at: AS_OF } : i)),
          checks: { ...d.checks, [itemSwift.item_id]: { status: "SUCCEEDED", sources: swiftChecking.sources!.map((s) => ({ ...s, state: "done" as const, result: "no_match" as const })) } },
        })),
      );
    }
    if (state === "flip-alert") {
      later(1500, () =>
        setData((d) => ({
          items: d.items.map((i) => (i.item_id === itemFT5427.item_id ? itemFT5427 : i)),
          checks: { ...d.checks, [itemFT5427.item_id]: { status: "SUCCEEDED", sources: [{ source: "cdsco_nsq", state: "done", result: "match" }] } },
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /* the scan flow, simulated: upload 0 → 1 (800 ms), words arrive (90 ms each), then the result */
  const setScan = (scan: ScanPhase) => setSheet((s) => ({ ...s, scan: { ...s.scan, scan, photo: scan.phase === "idle" ? null : demoPhoto, photoKey: "uploads/demo-strip.jpg" } }));
  const onPhoto = () => {
    setScan({ phase: "uploading", progress: 0 });
    [0.25, 0.5, 0.75, 1].forEach((p, i) => later(200 * (i + 1), () => setScan({ phase: "uploading", progress: p })));
    demoWords.forEach((_, i) => later(900 + 90 * i, () => setScan({ phase: "reading", words: demoWords.slice(0, i + 1) })));
    later(900 + 90 * demoWords.length + 250, () => setScan({ phase: "result", ocr: demoOcr }));
  };

  const onSubmit = (n: NewItem) => {
    setSubmitting(true);
    const needsCopy = house.mode === "demo";
    if (needsCopy) setHouse({ mode: "demo", banner: "copying" });
    later(needsCopy ? 1200 : 300, () => {
      if (needsCopy) setHouse({ mode: "own", banner: "own" });
      setSubmitting(false);
      if (n.kind === "medicine") {
        const checking = { ...newFT5427Checking, batch: n.batch, name: n.name || newFT5427Checking.name };
        setSheet((s) => ({ ...s, step: "checking", item: checking, face: "checking", check: newChecking, notice: null }));
        const steps: CheckStatus[] = [
          { status: "RUNNING", sources: [{ source: "cdsco_nsq", state: "done", result: "match" }, { source: "cpsc", state: "waiting" }, { source: "nhtsa", state: "waiting" }, { source: "openfda", state: "waiting" }] },
        ];
        later(1400, () => setSheet((s) => ({ ...s, check: steps[0] })));
        later(2200, () => setSheet((s) => ({ ...s, step: "added", item: { ...newFT5427Alert, purchase_date: n.purchase_date }, face: "alert", check: null, notice: demoNotices[newFT5427Alert.notice_id!] })));
      } else {
        const item = n.kind === "vehicle" ? { ...newSwiftClear, name: n.name, year: n.year, last_checked_at: null } : { item_id: "new-model", kind: n.kind, name: n.name, brand: n.brand, last_checked_at: null };
        setSheet((s) => ({ ...s, step: "checking", item, face: "checking", check: newChecking }));
        later(900, () => setSheet((s) => ({ ...s, check: { status: "RUNNING", sources: [{ source: "cdsco_nsq", state: "done", result: "no_match" }, { source: "cpsc", state: "done", result: "no_match" }, { source: "nhtsa", state: "running" }, { source: "openfda", state: "waiting" }] } })));
        later(2200, () => setSheet((s) => ({ ...s, step: "added", item: { ...s.item!, last_checked_at: AS_OF }, face: "clear", check: null })));
      }
    });
  };

  const close = () => setSheet((s) => ({ ...s, open: false }));
  const openSheet = (kind: AddKind) => setSheet({ ...closedSheet(), open: true, kind });

  const sheetProps: Sheet = {
    ...sheet,
    submitting,
    vehicleOptions,
    scan: {
      ...sheet.scan,
      onPhoto,
      onRetake: () => setScan({ phase: "idle" }),
      onRetry: onPhoto,
      onTypeInstead: () => setSheet((s) => ({ ...s, scan: { scan: { phase: "manual" } } })),
    },
    onClose: close,
    onKindChange: (kind) => setSheet((s) => ({ ...s, kind, step: "scan", scan: { scan: { phase: "idle" } } })),
    onSubmit,
    onShowInMyThings: () => {
      const added = sheet.item;
      close();
      if (added) setData((d) => ({ ...d, items: [...d.items.filter((i) => i.item_id !== added.item_id), added] }));
    },
  };

  return {
    household: { ...house, demoCount: 15 },
    stats: demoStats,
    items,
    notices: demoNotices,
    checks,
    sheet: sheetProps,
    intro: opts.intro ?? true,
    onMakeCopy: () => {
      setHouse({ mode: "demo", banner: "copying" });
      later(1200, () => setHouse({ mode: "own", banner: "own" }));
    },
    onResetCopy: () => setHouse({ mode: "own", banner: "own" }),
    onViewDemo: () => setHouse({ mode: "demo", banner: "demo" }),
    onAdd: openSheet,
  };
}
