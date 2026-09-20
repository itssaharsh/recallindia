"use client";

/**
 * /mine, wired to the live API.
 *
 * The v3 `MineView` is presentational (see components/v3/mine/README.md §2): this file owns every
 * call and every poll, and hands the responses in. The calls are the ones the v2 wall already made,
 * unchanged:
 *   GET  /items                      the wall, then GET /items/{id} for each item that has a case
 *   GET  /v1/notices/{notice_id}     the notice an alert / needs-you / near-miss card quotes
 *   GET  /v1/stats                   totals, source labels and the next poll (through useAppState)
 *   POST /items/{id}/check           "Check now" / "Check again", then GET /items/{id}/check-status
 *   POST /uploads → PUT → POST /items/ocr → POST /items      the Add sheet
 *   PATCH /items/{id}                "Fix the batch" / "Add date" (the API re-runs the check)
 *   POST /households                 "Make my own copy" (through useAppState)
 *
 * The demo household is read-only: the API answers 403 `demo_read_only`, so "Check again" and
 * "Remove" are hidden there by MineView (`household="demo"`) and the write paths say why instead.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import { SkeletonItemCard, Skeleton, shellToast } from "@/components/v3/shell";
import {
  KINDS,
  MineView,
  cardDomId,
  deriveFace,
  displayName,
  noticeFromApi,
  type AddKind,
  type ApiNotice,
  type CheckStatus as MineCheckStatus,
  type Face,
  type HouseholdItem as MineItem,
  type ItemKind,
  type MineFilter,
  type MineStats,
  type MineViewProps,
  type NewItem,
  type NoticeView,
  type OcrResult as MineOcr,
  type ScanDraft,
  type ScanPhase,
  type ScanPhoto,
  type SheetStep,
  type SourceKey,
  type StatusFilter,
  type VehicleOptions,
} from "@/components/v3/mine";
import { Button } from "@/components/v3/ui";
import { ApiError, DEMO_HOUSEHOLD, apiGet, apiHost, apiPatch, apiPost } from "@/lib/api";
import { PhotoError, photoToJpeg } from "@/lib/image";
import type { CheckStatus, Item, Notice, OcrResult, Stats, UploadTicket } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

import { toHouseholdItem } from "../shell-data";

const enc = encodeURIComponent;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ------------------------------------------------------------------ shapes */

/**
 * v2 `Item` → the card item. The shell's map (shell-data.ts) does the shared fields and the face
 * derivation; /mine adds the three fields only the cards read: the case decision (near-miss), the
 * printed dates, and the case's reason.
 */
function toMineItem(item: Item): MineItem {
  const base: MineItem = toHouseholdItem(item);
  return {
    ...base,
    case: item.case?.decision === "dismiss" ? { decision: "dismiss" } : null,
    mfg_date: item.mfg_date ?? null,
    exp_date: item.exp_date ?? null,
    reason: item.case?.reason ?? null,
  };
}

const SOURCE_KEYS: SourceKey[] = ["cdsco_nsq", "cpsc", "nhtsa", "openfda"];
const isSourceKey = (s: string): s is SourceKey => (SOURCE_KEYS as string[]).includes(s);

/** `GET /v1/stats` → the fields the headline, the sub line and the checking face read. */
function toMineStats(stats: Stats): MineStats {
  const sources = stats.sources
    .filter((s) => isSourceKey(s.source))
    .map((s) => ({
      source: s.source as SourceKey,
      label: s.label,
      count: s.count,
      health: s.health,
      // nextPoll() skips a source without a run time rather than inventing one
      last_run_at: s.last_run_at ?? s.last_success_at ?? "",
      polls_every: s.polls_every,
    }));
  return { total: stats.total, sources_count: stats.sources_count || sources.length, sources };
}

/**
 * `GET /items/{id}/check-status` → the v3 shape. v2 answers with pipeline `steps[]`, not per-source
 * rows, so every source on the checking face reads "running" until the check ends (mine/README §4);
 * the UI never invents progress.
 */
function toMineCheck(status: CheckStatus): MineCheckStatus {
  return {
    status: status.status === "RUNNING" ? "RUNNING" : status.status === "FAILED" ? "FAILED" : "SUCCEEDED",
    steps: status.steps,
  };
}

/** `POST /items/ocr` → the scan step's result. No `poly` from this API yet: ScanConfirm falls back
 *  to the `box` rectangles (mine/README §4). */
function toMineOcr(read: OcrResult): MineOcr {
  return {
    fields: {
      name: read.fields?.name ?? null,
      brand: read.fields?.brand ?? null,
      batch: read.fields?.batch ?? null,
      mfg_date: read.fields?.mfg_date ?? null,
      exp_date: read.fields?.exp_date ?? null,
    },
    words: (read.words ?? []).map((w) => ({ text: w.text, box: w.box, is_batch: w.is_batch })),
    passes: read.passes,
    uncertain: read.uncertain,
  };
}

/** The Make / Model / Year pickers. Not API data: v2 carried the same list in the add form. */
const VEHICLE_OPTIONS: VehicleOptions = {
  makes: ["Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Kia", "Toyota", "Honda", "Jeep", "Volkswagen", "Skoda", "Renault", "MG"],
  models: {
    "Maruti Suzuki": ["Swift", "Baleno", "Brezza", "Dzire", "Ertiga", "Wagon R"],
    Hyundai: ["Creta", "Venue", "i20", "Verna"],
    Tata: ["Nexon", "Punch", "Tiago", "Harrier"],
    Mahindra: ["Scorpio", "XUV700", "Thar", "Bolero"],
    Kia: ["Seltos", "Sonet", "Carens"],
    Toyota: ["Innova", "Fortuner", "Glanza"],
    Honda: ["City", "Amaze", "Elevate"],
    Jeep: ["Compass", "Meridian", "Wrangler"],
    Volkswagen: ["Virtus", "Taigun", "Polo"],
    Skoda: ["Slavia", "Kushaq", "Rapid"],
    Renault: ["Kwid", "Triber", "Kiger"],
    MG: ["Hector", "Astor", "Comet"],
  },
  years: Array.from({ length: 17 }, (_, i) => 2026 - i),
};

/* ------------------------------------------------------------- the upload */

class UploadRefused extends Error {
  constructor(readonly status: number) {
    super(`the upload was refused (HTTP ${status})`);
  }
}

/** The same PUT the v2 sheet made, through XHR so the progress bar tracks the real upload. */
function putPhoto(ticket: UploadTicket, blob: Blob, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.url);
    for (const [key, value] of Object.entries(ticket.headers ?? {})) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadRefused(xhr.status)));
    xhr.onerror = () => reject(new UploadRefused(0));
    xhr.send(blob);
  });
}

/** The local preview and its natural size (ScanConfirm draws the word boxes in image space). */
async function toScanPhoto(blob: Blob): Promise<ScanPhoto> {
  const src = URL.createObjectURL(blob);
  try {
    const bitmap = await createImageBitmap(blob);
    const photo: ScanPhoto = { src, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return photo;
  } catch {
    return new Promise<ScanPhoto>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ src, width: img.naturalWidth || 4, height: img.naturalHeight || 3 });
      img.onerror = () => resolve({ src, width: 4, height: 3 });
      img.src = src;
    });
  }
}

/* ------------------------------------------------------------- the filter */

const ALL: MineFilter = { show: "all", kind: null };
const SHOWS: StatusFilter[] = ["all", "alert", "needs-you", "near-miss", "clear"];

function filterFrom(params: { get: (key: string) => string | null }): MineFilter {
  const raw = params.get("show") ?? params.get("filter") ?? "all";
  const show = (SHOWS as string[]).includes(raw) ? (raw as StatusFilter) : "all";
  const rawKind = params.get("kind");
  const kind = rawKind && (KINDS as string[]).includes(rawKind) ? (rawKind as ItemKind) : null;
  return { show, kind };
}

/* -------------------------------------------------------------- the sheet */

interface SheetState {
  open: boolean;
  kind: AddKind;
  step: SheetStep;
  scan: ScanPhase;
  photo: ScanPhoto | null;
  photoKey: string | null;
  /** The item the checking and added steps show (already in `items`). */
  itemId: string | null;
  /** Set by "Fix the batch" / "Add date": the submit PATCHes this item instead of creating one. */
  editingId: string | null;
  editInitial: Partial<ScanDraft> | null;
  submitting: boolean;
}

const closedSheet = (kind: AddKind = "medicine"): SheetState => ({
  open: false,
  kind,
  step: "scan",
  scan: { phase: "idle" },
  photo: null,
  photoKey: null,
  itemId: null,
  editingId: null,
  editInitial: null,
  submitting: false,
});

const revoke = (photo: ScanPhoto | null) => {
  if (photo?.src.startsWith("blob:")) URL.revokeObjectURL(photo.src);
};

/* ------------------------------------------------------------- the screen */

export function MineWire() {
  const router = useRouter();
  const params = useSearchParams();
  const { demo, ready, stats, statsError, refreshStats, household, householdState, householdError, makeCopy, resetCopy, useDemoHousehold: viewDemo } =
    useAppState();
  const isDemoHousehold = demo || household === DEMO_HOUSEHOLD;

  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, NoticeView | undefined>>({});
  const [checks, setChecks] = useState<Record<string, MineCheckStatus>>({});
  const [checking, setChecking] = useState<string[]>([]);
  // "Make my own copy" starts the checks server-side, so the wall fills without this browser doing
  // anything: watch it until every card has an answer (the v2 settle window).
  const [settleBy, setSettleBy] = useState(0);
  const [filter, setFilter] = useState<MineFilter>(ALL);
  const [sheet, setSheet] = useState<SheetState>(() => closedSheet());
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const itemsRef = useRef<Item[] | null>(null);
  itemsRef.current = items;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const askedNotices = useRef(new Set<string>());
  const lastFile = useRef<File | null>(null);

  const toast = useCallback((title: string, action?: { label: string; onClick: () => void }, id?: string) => {
    shellToast.show({ id, kind: "neutral", title, action, dismissible: !action });
  }, []);

  /* ------------------------------------------------------------- the wall */

  const load = useCallback(async () => {
    try {
      const { items: list } = await apiGet<{ items: Item[] }>("/items", demo);
      // the wall shows each finding's case: fetch the item detail only for items that have one
      const withCase = await Promise.all(
        list.map((it) => (it.case_id ? apiGet<Item>(`/items/${enc(it.item_id)}`, demo).catch(() => it) : it)),
      );
      setItems(withCase);
      setError(null);
    } catch (err) {
      if (itemsRef.current) toast(`Your things could not be refreshed: ${message(err)}`, undefined, "mine-load");
      else setError(message(err));
    }
  }, [demo, toast]);

  useEffect(() => {
    if (!ready) return;
    setItems(null); // the previous household's things are not this one's (a stale id 404s)
    setError(null);
    setNotices({});
    askedNotices.current = new Set();
    // a check started from the sheet survives the copy the sheet just made
    const keep = sheetRef.current.itemId;
    setChecks((prev) => (keep && prev[keep] ? { [keep]: prev[keep] } : {}));
    setChecking((prev) => prev.filter((id) => id === keep));
    setSettleBy(Date.now() + 120_000);
    void load();
    // `household` is not read inside `load` (lib/api adds the header), but changing it changes
    // whose wall this is, so the list must be fetched again
  }, [ready, load, household]);

  const unchecked = (items ?? []).filter((it) => !it.last_checked_at).length;
  usePoll(
    async () => {
      if (Date.now() > settleBy) return;
      await load();
    },
    3_000,
    ready && unchecked > 0 && settleBy > 0,
  );

  const upsert = useCallback((item: Item) => {
    setItems((prev) => {
      if (!prev) return [item];
      const at = prev.findIndex((x) => x.item_id === item.item_id);
      if (at < 0) return [item, ...prev];
      const next = [...prev];
      next[at] = item;
      return next;
    });
  }, []);

  /* ---------------------------------------------------------- the notices */

  const mineItems = useMemo(() => (items ?? []).map(toMineItem), [items]);
  const noticeIds = useMemo(() => {
    const ids: string[] = [];
    for (const it of mineItems) if (it.notice_id && !ids.includes(it.notice_id)) ids.push(it.notice_id);
    return ids.join("|");
  }, [mineItems]);

  useEffect(() => {
    const wanted = noticeIds ? noticeIds.split("|") : [];
    const missing = wanted.filter((id) => !askedNotices.current.has(id));
    if (!missing.length) return;
    const controller = new AbortController();
    for (const id of missing) {
      askedNotices.current.add(id);
      const item = (itemsRef.current ?? []).find((it) => it.case?.notice_id === id);
      apiGet<Notice>(`/v1/notices/${enc(id)}`, demo, controller.signal)
        .then((notice) => setNotices((prev) => ({ ...prev, [id]: noticeFromApi(notice as ApiNotice, item ? toMineItem(item) : null) })))
        .catch(() => askedNotices.current.delete(id));
    }
    return () => controller.abort();
  }, [noticeIds, demo]);

  /* ----------------------------------------------------------- the checks */

  const checked = useCallback(
    (updated: Item) => {
      upsert(updated);
      setChecking((prev) => prev.filter((id) => id !== updated.item_id));
      refreshStats();
      // the sheet's card flips to its result in place, then step 3 offers "Show it in My things"
      setSheet((s) => (s.itemId === updated.item_id && s.step === "checking" ? { ...s, step: "added" } : s));
    },
    [refreshStats, upsert],
  );

  // one timer for every running check: the real step states every 2 s, then the finished item
  usePoll(
    async (signal) => {
      for (const id of checking) {
        let status: CheckStatus;
        try {
          status = await apiGet<CheckStatus>(`/items/${enc(id)}/check-status`, demo, signal);
        } catch (err) {
          // a thing that is gone (another household, a reset) never answers: stop watching it
          if (err instanceof ApiError && err.status === 404) setChecking((prev) => prev.filter((x) => x !== id));
          continue;
        }
        setChecks((prev) => ({ ...prev, [id]: toMineCheck(status) }));
        if (status.status === "RUNNING") continue;
        checked(await apiGet<Item>(`/items/${enc(id)}`, demo, signal));
      }
    },
    2_000,
    ready && checking.length > 0,
  );

  const startCheck = useCallback(
    async (itemId: string) => {
      try {
        await apiPost(`/items/${enc(itemId)}/check`, undefined, demo);
        setChecks((prev) => ({ ...prev, [itemId]: { status: "RUNNING" } }));
        setChecking((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
        return true;
      } catch (err) {
        const name = (itemsRef.current ?? []).find((it) => it.item_id === itemId)?.name ?? "that thing";
        toast(`Could not check ${name}: ${message(err)}`, undefined, "mine-check");
        return false;
      }
    },
    [demo, toast],
  );

  const readOnlyToast = useCallback(
    () => toast("The demo household is read-only.", { label: "Make my own copy", onClick: () => void makeCopy() }, "mine-read-only"),
    [makeCopy, toast],
  );

  /* ------------------------------------------------------------ the sheet */

  const openSheet = useCallback((kind: AddKind, batch?: string | null) => {
    setSheet((s) => {
      revoke(s.photo);
      return batch
        ? { ...closedSheet(kind), open: true, scan: { phase: "manual" }, editInitial: { batch } }
        : { ...closedSheet(kind), open: true };
    });
  }, []);

  /** "Fix the batch" (needs-you) and "Add date" (a medicine alert with no purchase date): the same
   *  sheet, prefilled, whose submit PATCHes the item instead of creating one. */
  const openEdit = useCallback((itemId: string) => {
    const item = (itemsRef.current ?? []).find((it) => it.item_id === itemId);
    if (!item) return;
    setSheet((s) => {
      revoke(s.photo);
      return {
        ...closedSheet("medicine"),
        open: true,
        editingId: itemId,
        editInitial: { name: item.name, batch: item.batch ?? "", exp: item.exp_date ?? "", bought: item.purchase_date ?? "" },
        scan: { phase: "manual" },
      };
    });
  }, []);

  const closeSheet = useCallback(() => {
    setSheet((s) => {
      revoke(s.photo);
      return { ...closedSheet(s.kind), open: false };
    });
    lastFile.current = null;
  }, []);

  const setScan = useCallback((scan: ScanPhase, patch: Partial<SheetState> = {}) => {
    setSheet((s) => ({ ...s, scan, ...patch }));
  }, []);

  const uploadPhoto = useCallback(
    async (file: File) => {
      lastFile.current = file;
      setScan({ phase: "uploading", progress: 0 }, { photoKey: null });
      try {
        const jpeg = await photoToJpeg(file);
        const photo = await toScanPhoto(jpeg);
        setSheet((s) => {
          revoke(s.photo);
          return { ...s, photo, scan: { phase: "uploading", progress: 0.05 } };
        });
        const ticket = await apiPost<UploadTicket>("/uploads", { content_type: "image/jpeg" }, demo);
        await putPhoto(ticket, jpeg, (fraction) =>
          setSheet((s) => (s.scan.phase === "uploading" ? { ...s, scan: { phase: "uploading", progress: fraction } } : s)),
        );
        setScan({ phase: "reading", words: [] }, { photoKey: ticket.key });
        const read = await apiPost<OcrResult>("/items/ocr", { key: ticket.key }, demo);
        setScan({ phase: "result", ocr: toMineOcr(read) }, { photoKey: read.key ?? ticket.key });
      } catch (err) {
        if (err instanceof PhotoError) {
          setScan({ phase: "idle" });
          toast(err.message, undefined, "mine-photo");
        } else if (err instanceof UploadRefused) {
          setScan({ phase: "upload-error", status: err.status });
        } else {
          setScan({ phase: "textract-error", message: message(err) });
        }
      }
    },
    [demo, setScan, toast],
  );

  const submitSheet = useCallback(
    async (draft: NewItem) => {
      setSheet((s) => ({ ...s, submitting: true }));
      try {
        const editing = sheetRef.current.editingId;
        if (editing) {
          // PATCH /items/{id} takes the fields the scan can get wrong and re-runs the check itself
          const body: Record<string, string | number | null> = {};
          if (draft.name.trim()) body.name = draft.name.trim();
          if (draft.kind === "medicine") {
            body.batch = draft.batch;
            body.purchase_date = draft.purchase_date;
          } else if (draft.kind === "vehicle") {
            body.make = draft.make;
            body.model = draft.model;
            body.year = draft.year;
            body.reg_no = draft.reg_no;
          } else {
            body.brand = draft.brand;
            body.model = draft.model;
          }
          const { item } = await apiPatch<{ item: Item }>(`/items/${enc(editing)}`, body, demo);
          upsert(item);
          setChecks((prev) => ({ ...prev, [editing]: { status: "RUNNING" } }));
          setChecking((prev) => (prev.includes(editing) ? prev : [...prev, editing]));
          setSheet((s) => ({ ...s, submitting: false, step: "checking", itemId: editing, editingId: null }));
          return;
        }
        if (isDemoHousehold) {
          // the demo wall is read-only: the first "Check this …" makes your copy first (spec §2.11)
          const id = await makeCopy();
          if (!id) throw new Error("your copy could not be made");
        }
        const { items: created } = await apiPost<{ items: Item[] }>("/items", draft, demo);
        const item = created?.[0];
        if (!item) throw new Error("the API saved nothing");
        upsert(item);
        setSheet((s) => ({ ...s, submitting: false, step: "checking", itemId: item.item_id }));
        // it is saved either way: if the check cannot start, the toast says why and the card
        // waits on the wall with "Check now" rather than spinning in the sheet
        if (!(await startCheck(item.item_id))) closeSheet();
        void load(); // a copy brought the demo household's things with it
      } catch (err) {
        setSheet((s) => ({ ...s, submitting: false }));
        toast(`Could not add it: ${message(err)}`, undefined, "mine-add");
      }
    },
    [closeSheet, demo, isDemoHousehold, load, makeCopy, startCheck, toast, upsert],
  );

  /* -------------------------------------------------------- the deep links */

  // `/mine/?add=1`, `/mine/?add=scan&batch=…`, `/mine/?item={id}`, `?show=&kind=` (`?filter=` from
  // the feed). Applied once per link, so the shell can send the same link again later.
  const appliedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = params.toString();
    if (appliedFor.current === key) return;
    appliedFor.current = key;
    setFilter(filterFrom(params));
    const add = params.get("add");
    const item = params.get("item");
    if (add) openSheet("medicine", params.get("batch"));
    if (item) setPendingFocus(item);
    if (add || item || params.get("batch") || params.get("filter")) {
      // one-shot links: drop them so a reload does not open the sheet again
      const url = new URL(window.location.href);
      for (const name of ["add", "item", "batch", "filter"]) url.searchParams.delete(name);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      appliedFor.current = url.searchParams.toString();
    }
  }, [params, openSheet]);

  useEffect(() => {
    if (!pendingFocus || !items) return;
    const el = document.getElementById(cardDomId(pendingFocus));
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
    setPendingFocus(null);
  }, [pendingFocus, items]);

  const onFilterChange = useCallback((next: MineFilter) => {
    setFilter(next);
    const url = new URL(window.location.href); // the URL mirrors the selection (spec §2.4)
    if (next.show === "all") url.searchParams.delete("show");
    else url.searchParams.set("show", next.show);
    if (next.kind) url.searchParams.set("kind", next.kind);
    else url.searchParams.delete("kind");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  /* ----------------------------------------------------------- the render */

  // the wall needs both `/items` and `/v1/stats`: whichever is missing is why the page is empty
  const blocking = items === null ? error : stats ? null : statsError;
  if (blocking) {
    return (
      <div className="py-16">
        <h1 className="m-0 font-display text-[34px]/[1.06] font-extrabold tracking-[-0.03em] text-ink md:text-[44px]">
          Your things could not load
        </h1>
        <p className="mt-3 max-w-[560px] font-sans text-[16px]/[1.5] text-ink-muted">
          Couldn&rsquo;t reach {apiHost()}: {blocking}. Nothing is lost; this page needs the API to show them.
        </p>
        <Button className="mt-5" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!stats || items === null) return <MineSkeleton />;

  const sheetItem = sheet.itemId ? (mineItems.find((it) => it.item_id === sheet.itemId) ?? null) : null;
  const sheetFace: Face = sheetItem ? deriveFace(sheetItem, checks[sheetItem.item_id]) : "checking";
  const sheetProps: NonNullable<MineViewProps["sheet"]> = {
    open: sheet.open,
    kind: sheet.kind,
    step: sheet.step,
    submitting: sheet.submitting,
    vehicleOptions: VEHICLE_OPTIONS,
    item: sheetItem,
    face: sheetFace,
    check: sheetItem ? (checks[sheetItem.item_id] ?? null) : null,
    notice: sheetItem?.notice_id ? (notices[sheetItem.notice_id] ?? null) : null,
    scan: {
      scan: sheet.scan,
      photo: sheet.photo,
      photoKey: sheet.photoKey,
      editBatch: sheet.editingId !== null,
      initial: sheet.editInitial ?? undefined,
      onPhoto: (file) => void uploadPhoto(file),
      onRetake: () => setScan({ phase: "idle" }),
      onRetry: () => (lastFile.current ? void uploadPhoto(lastFile.current) : setScan({ phase: "idle" })),
      onTypeInstead: () => setScan({ phase: "manual" }),
    },
    onKindChange: (kind) =>
      setSheet((s) => {
        revoke(s.photo);
        // an edit ("Fix the batch") only exists for a medicine; switching kind starts a new thing
        const editing = kind === "medicine" ? s.editingId : null;
        return { ...closedSheet(kind), open: true, editingId: editing, editInitial: editing ? s.editInitial : null };
      }),
    onClose: closeSheet,
    onSubmit: (draft) => void submitSheet(draft),
    onShowInMyThings: (itemId) => {
      closeSheet();
      setPendingFocus(itemId);
    },
  };

  // The shell's <main> already carries the page gutter, so the view's own padding is turned off.
  // "Fix the batch" and "Add date" both PATCH /items/{id}, which the demo household refuses, so
  // they explain instead of failing there.
  return (
    <MineView
      as="div"
      className="px-0!"
      household={{
        mode: isDemoHousehold ? "demo" : "own",
        banner:
          householdState === "creating" ? "copying" : householdState === "error" ? "error" : isDemoHousehold ? "demo" : "own",
        errorMessage: householdError,
        demoCount: isDemoHousehold ? mineItems.length || undefined : undefined,
      }}
      stats={toMineStats(stats)}
      items={mineItems}
      notices={notices}
      checks={checks}
      filter={filter}
      onFilterChange={onFilterChange}
      sheet={sheetProps}
      onAdd={(kind) => openSheet(kind)}
      onMakeCopy={() => void makeCopy()}
      onResetCopy={() => void resetCopy()}
      onViewDemo={viewDemo}
      onToast={(t) =>
        shellToast.show({
          id: t.id,
          kind: "neutral",
          title: t.title,
          action: t.actionLabel ? { label: t.actionLabel, onClick: () => t.onAction?.() } : undefined,
          dismissible: !t.actionLabel,
        })
      }
      onOpenCase={(caseId) => router.push(`/case/?id=${enc(caseId)}`)}
      onCheckNow={(itemId) => (isDemoHousehold ? readOnlyToast() : void startCheck(itemId))}
      onCheckAgain={(itemId) => void startCheck(itemId)}
      onFixBatch={(itemId) => (isDemoHousehold ? readOnlyToast() : openEdit(itemId))}
      onAddDate={(itemId) => (isDemoHousehold ? readOnlyToast() : openEdit(itemId))}
      onDismiss={(itemId) => {
        const thing = mineItems.find((it) => it.item_id === itemId);
        toast(
          `${thing ? displayName(thing) : "That thing"}: only the matcher records a dismissal. If the code is wrong, fix the batch.`,
          { label: "Fix the batch", onClick: () => (isDemoHousehold ? readOnlyToast() : openEdit(itemId)) },
          "mine-dismiss",
        );
      }}
      onRemove={(itemId) => {
        const thing = mineItems.find((it) => it.item_id === itemId);
        toast(
          `${thing ? displayName(thing) : "That thing"} stays: the API has no way to remove one thing. Resetting your copy puts the demo things back.`,
          { label: "Reset my copy", onClick: () => void resetCopy() },
          "mine-remove",
        );
      }}
    />
  );
}

/** The wall before the first `/items` and `/v1/stats` answer. */
export function MineSkeleton() {
  return (
    <div aria-busy className="pb-10">
      <Skeleton pill className="mt-4 h-[52px] w-full" />
      <Skeleton className="mt-6 h-[54px] w-[540px] max-w-full" />
      <Skeleton className="mt-3 h-4 w-[420px] max-w-full" />
      <Skeleton className="mt-7 h-11 w-[560px] max-w-full" pill />
      <div className="mt-5 grid gap-5 lg:grid-cols-[7fr_5fr]">
        <SkeletonItemCard className="min-h-[220px]" />
        <SkeletonItemCard className="min-h-[220px]" />
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonItemCard key={i} />
        ))}
      </div>
    </div>
  );
}
