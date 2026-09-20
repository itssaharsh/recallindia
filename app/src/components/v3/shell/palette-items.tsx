import * as React from "react";
import type { ChipTone } from "../ui";
import { SOURCE_LABEL, cdscoFailedTest, formatCount, formatDate } from "./format";
import type { Category, HouseholdItem, HouseholdState, NoticeSummary } from "./types";

/** Palette groups, in display order (spec §6.10). */
export type PaletteGroup = "recent" | "things" | "notices" | "goto" | "actions";

export type PaletteGlyph = "feed" | "ingest" | "things" | "api" | "kit" | "plus" | "copy" | "search" | "notice" | "house";

export type PaletteIcon =
  | { type: "category"; category: Category; alert?: boolean }
  | { type: "glyph"; glyph: PaletteGlyph; tone?: "neutral" | "cobalt" };

export type PaletteTrailing =
  | { type: "chip"; tone: ChipTone; label: string }
  | { type: "kbd"; label: string }
  | { type: "arrow" };

export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  title: string;
  /** Second line in the dialog. */
  detail?: string;
  /** Second line in the phone sheet, where there is no room for the foil chip. Falls back to `detail`. */
  detailCompact?: string;
  /** A code printed after the title on a small foil chip (a notice's batch). */
  code?: string;
  icon: PaletteIcon;
  trailing?: PaletteTrailing;
  /** Where Enter goes. */
  href?: string;
  /** Or what Enter does: "add-thing" | "make-copy" | "copy-api-base" | "recent:{query}". */
  action?: string;
  /** Extra text matched by the filter (not shown). */
  keywords?: string;
  /** Shown whenever the query is non-empty, matching or not ("Add a thing"). */
  always?: boolean;
}

export const API_BASE = "https://ilbmeuwrt7.execute-api.ap-south-1.amazonaws.com";

/** Household item → "My things" row. Detail copy per spec §6.10 and the kit PNG. */
export function thingToPaletteItem(item: HouseholdItem): PaletteItem {
  let detail: string | undefined;
  let detailCompact: string | undefined;
  if (item.kind === "medicine" && item.batch) {
    if (item.face === "near-miss" && item.listed_batch) {
      detail = `Batch ${item.batch} · listed batch is ${item.listed_batch}`;
    } else {
      detailCompact = `Batch ${item.batch}${item.brand ? ` · ${item.brand}` : ""}`;
      detail = item.face === "alert" && item.purchase_date ? `${detailCompact} · bought ${formatDate(item.purchase_date)}` : detailCompact;
    }
  } else if (item.kind === "vehicle") {
    detail = item.year ? `Model year ${item.year}${item.face === "alert" ? " · matched by make, model and year" : ""}` : item.make;
  } else {
    detail = item.brand;
  }

  const chip: Partial<Record<HouseholdItem["face"], { tone: ChipTone; label: string }>> = {
    alert: { tone: "alert", label: "On a notice" },
    "needs-you": { tone: "hold", label: "Waiting for you" },
    "near-miss": { tone: "hold", label: "Near miss" },
    checking: { tone: "info", label: "Checking" },
  };
  const c = chip[item.face];

  return {
    id: `thing:${item.item_id}`,
    group: "things",
    title: item.name,
    detail,
    detailCompact,
    icon: { type: "category", category: item.kind },
    trailing: c ? { type: "chip", ...c } : undefined,
    href: item.case_id && (item.face === "alert" || item.face === "needs-you") ? `/case/?id=${encodeURIComponent(item.case_id)}` : `/mine?item=${encodeURIComponent(item.item_id)}`,
    keywords: [item.brand, item.batch, item.make, item.model, item.year].filter(Boolean).join(" "),
  };
}

/** `/v1/notices` item → "Notices" row. CDSCO rows never say "recalled". */
export function noticeToPaletteItem(n: NoticeSummary): PaletteItem {
  const label = SOURCE_LABEL[n.source] ?? n.source;
  const batch = n.batches?.[0];
  let detail: string;
  let detailCompact: string;
  if (n.source === "cdsco_nsq" && n.row_ref) {
    const where = `${label} · ${n.row_ref.month} alert, row ${n.row_ref.row}`;
    const test = cdscoFailedTest(n.hazard_or_failed_test);
    detail = test ? `${where} · ${test}` : where;
    detailCompact = batch ? `${where} · ${batch}` : detail;
  } else {
    detail = n.published_at ? `${label} ${n.notice_id} · ${formatDate(n.published_at)}` : `${label} ${n.notice_id}`;
    detailCompact = detail;
  }
  return {
    id: `notice:${n.pk}`,
    group: "notices",
    title: n.product,
    code: batch,
    detail,
    detailCompact,
    icon: { type: "glyph", glyph: "notice", tone: "cobalt" },
    href: `/feed?notice=${encodeURIComponent(n.pk)}`,
    keywords: [n.notice_id, n.brand, n.model, ...(n.batches ?? [])].filter(Boolean).join(" "),
  };
}

/** "Go to" rows (spec §6.10: Feed, Ingest, My things, API, Kit). */
export function goToItems({ total, household }: { total: number | null; household: HouseholdState }): PaletteItem[] {
  const count = household.kind === "copying" ? household.total : household.count;
  const whose = household.kind === "yours" ? "Your household" : "Demo household";
  return [
    { id: "go:feed", group: "goto", title: "Feed", detail: total === null ? "Every notice, newest first" : `${formatCount(total)} notices from 4 regulators`, icon: { type: "glyph", glyph: "feed" }, trailing: { type: "arrow" }, href: "/feed" },
    { id: "go:ingest", group: "goto", title: "Ingest", detail: "Watch a PDF become the feed", icon: { type: "glyph", glyph: "ingest" }, trailing: { type: "arrow" }, href: "/ingest" },
    { id: "go:mine", group: "goto", title: "My things", detail: `${whose} · ${count} things`, icon: { type: "glyph", glyph: "things" }, trailing: { type: "arrow" }, href: "/mine" },
    { id: "go:api", group: "goto", title: "API", detail: "GET /v1/notices, no key", icon: { type: "glyph", glyph: "api" }, trailing: { type: "arrow" }, href: "/api" },
    { id: "go:kit", group: "goto", title: "Kit", detail: "The tokens and primitives behind every screen", icon: { type: "glyph", glyph: "kit" }, trailing: { type: "arrow" }, href: "/kit" },
  ];
}

/** "Actions" rows. "Make my own copy" only while the demo household is showing. */
export function actionItems({ household }: { household: HouseholdState }): PaletteItem[] {
  const items: PaletteItem[] = [
    { id: "act:add", group: "actions", title: "Add a thing", detail: "Scan a strip or type a model", icon: { type: "glyph", glyph: "plus" }, trailing: { type: "kbd", label: "A" }, action: "add-thing", href: "/mine?add=1", always: true },
  ];
  if (household.kind === "demo") {
    items.push({ id: "act:copy", group: "actions", title: "Make my own copy", detail: `Copy the ${household.count} demo things to this device`, icon: { type: "glyph", glyph: "house" }, action: "make-copy" });
  }
  items.push({ id: "act:api", group: "actions", title: "Copy API base URL", detail: API_BASE, icon: { type: "glyph", glyph: "copy" }, action: "copy-api-base" });
  return items;
}

/** Recent searches (empty query). Enter puts the query back in the field. */
export function recentItems(queries: string[]): PaletteItem[] {
  return queries.map((q) => ({ id: `recent:${q}`, group: "recent" as const, title: q, detail: "Recent search", icon: { type: "glyph" as const, glyph: "search" as const }, action: `recent:${q}` }));
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Case-insensitive substring match on title, detail, code and keywords (spaces ignored, so "FT54 27" finds FT5427). */
export function matches(item: PaletteItem, query: string): boolean {
  const q = squash(query);
  if (!q) return true;
  return [item.title, item.detail, item.detailCompact, item.code, item.keywords].some((f) => f && squash(f).includes(q));
}

/** Bold the matched characters (700 ink), spec §6.10. */
export function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const at = lower.indexOf(needle, i);
    if (at < 0) break;
    if (at > i) out.push(text.slice(i, at));
    out.push(<strong key={k++} className="font-bold text-ink">{text.slice(at, at + needle.length)}</strong>);
    i = at + needle.length;
  }
  if (out.length === 0) return text;
  if (i < text.length) out.push(text.slice(i));
  return out;
}
