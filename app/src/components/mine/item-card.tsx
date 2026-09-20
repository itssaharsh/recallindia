"use client";

import { ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { FoilChip, diffIndexes } from "@/components/common/foil-chip";
import { RangeBar } from "@/components/common/range-bar";
import { SourceExcerpt } from "@/components/common/source-excerpt";
import { useAppState } from "@/components/shell/app-state";
import { DEMO_HOUSEHOLD, apiGet } from "@/lib/api";
import { fmtDay, fmtWhen, noticeRef, riskSentence, sourceLabel } from "@/lib/format";
import { CROSSFADE, FLIP } from "@/lib/motion";
import type { CheckStatus, CheckStep, Item, Notice } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

import { Checklist, PLANNED_STEPS } from "./checklist";

export type Face = "alert" | "hold" | "dismissed" | "clear" | "unchecked";

export function faceOf(item: Item): Face {
  if (item.status === "alert") return "alert";
  if (item.status === "hold") return "hold";
  if (item.case?.decision === "dismiss") return "dismissed";
  return item.last_checked_at ? "clear" : "unchecked";
}

// the status word each face carries (the table at the top of UI-SPEC §5)
const TAG: Record<Face, { label: string; tone: string }> = {
  alert: { label: "On a notice", tone: "text-accent-ink" },
  hold: { label: "Needs you", tone: "text-warning" },
  dismissed: { label: "Not on the notice", tone: "text-success" },
  clear: { label: "Clear", tone: "text-success" },
  unchecked: { label: "Not checked", tone: "text-muted" },
};

function FaceLabel({ face }: { face: Face }) {
  const tag = TAG[face];
  return <span className={`shrink-0 text-[12px] font-bold tracking-[0.08em] uppercase ${tag.tone}`}>{tag.label}</span>;
}

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "11 days" between the notice and the purchase, for the alert face's last line. */
function daysAfter(published: string | null | undefined, purchased: string | null | undefined): string {
  const from = Date.parse(`${String(published).slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${String(purchased).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "after";
  const days = Math.round((to - from) / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** The listed code closest to yours, which is the one worth showing under it (C-10 near miss). */
function closest(check: { listed: string; yours: string }): string {
  const listed = check.listed.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  if (listed.length <= 1) return listed[0] ?? check.listed;
  const distance = (a: string, b: string) => [...a].filter((ch, i) => ch !== b[i]).length + Math.abs(a.length - b.length);
  return listed.reduce((best, one) => (distance(one, check.yours) < distance(best, check.yours) ? one : best), listed[0]);
}
const unitWord = (item: Item) => (item.batch ? "batch" : item.serial ? "serial" : item.year ? "model year" : "unit");

/** The alert headline. CDSCO: the decision's own first clause ("Failed CDSCO quality test,
 *  JUL-2026 alert, row 12"). Recalls: which recall, read off the case's notice key
 *  (``nhtsa#24V436000``), so it is right before the notice itself has loaded. */
function alertHeadline(noticeKey: string, reasonHead: string): string {
  const [source, id] = noticeKey.split("#", 2);
  if (!id || source === "cdsco_nsq") return sentence(reasonHead);
  return `On ${sourceLabel(source)} recall ${id}`;
}
/**
 * One thing the person owns. Front: the answer (alert / hold / dismissed near-miss / clear).
 * Back: the Dynamic Checklist while a check runs. The card flips (rotateY, 400ms spring) only
 * when a check starts and when it finishes -- never on hover, never on load.
 */
export function ItemCard({
  item,
  checking,
  onCheck,
  onChecked,
}: {
  item: Item;
  checking: boolean;
  onCheck: (item: Item) => void;
  onChecked: (item: Item) => void;
}) {
  const { demo, stats } = useAppState();
  const reduce = useReducedMotion();
  const [steps, setSteps] = useState<CheckStep[]>(PLANNED_STEPS);
  // the back face stays mounted until the flip home has finished, so the card never changes
  // height while it is turned towards the viewer
  const [backMounted, setBackMounted] = useState(checking);
  const sources = stats?.sources_count ?? 4;
  const face = faceOf(item);

  useEffect(() => {
    if (!checking) return;
    setSteps(PLANNED_STEPS);
    setBackMounted(true);
  }, [checking]);

  // while a check runs: the real step states every 2s, then the finished item (with its case)
  usePoll(
    async (signal) => {
      const status = await apiGet<CheckStatus>(`/items/${encodeURIComponent(item.item_id)}/check-status`, demo, signal);
      if (status.steps?.length) setSteps(status.steps);
      if (status.status !== "RUNNING") {
        onChecked(await apiGet<Item>(`/items/${encodeURIComponent(item.item_id)}`, demo, signal));
      }
    },
    2_000,
    checking,
  );

  const wide = face === "alert" || face === "dismissed";
  // No coloured side stripes (DESIGN.md): the hold face is tinted, the alert face is fully red.
  const frame = `rounded-md border ${
    face === "alert"
      ? "border-danger bg-danger text-accent-ink"
      : face === "hold"
        ? "border-transparent bg-warning-soft"
        : face === "dismissed"
          ? "border-line-strong bg-surface-1"
          : "border-line bg-surface-1"
  }`;

  const front = <Front item={item} face={face} sources={sources} demo={demo} onCheck={() => onCheck(item)} busy={checking} />;
  const back = (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-[13px] text-muted">
          Checking <span className="text-ink">{item.name}</span>
        </p>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-bold tracking-[0.08em] text-muted uppercase">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />
          Checking
        </span>
      </div>
      <Checklist steps={steps} item={item} sources={sources} />
    </div>
  );

  return (
    <li className={`min-w-0 list-none ${wide ? "sm:col-span-2" : ""}`} style={{ perspective: 1200 }}>
      {reduce ? (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={checking ? "back" : face}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={CROSSFADE}
            className={`min-h-44 ${checking ? "rounded-md border border-line bg-surface-1" : frame}`}
          >
            {checking ? back : front}
          </motion.div>
        </AnimatePresence>
      ) : (
        // both faces share one grid cell: the card is as tall as the taller face, so the
        // five-step checklist is never clipped on a one-column card
        <motion.div
          className="grid min-h-44 grid-cols-1 [transform-style:preserve-3d]"
          initial={false}
          animate={{ rotateY: checking ? 180 : 0 }}
          transition={FLIP}
          onAnimationComplete={() => !checking && setBackMounted(false)}
        >
          <div className={`[grid-area:1/1] [backface-visibility:hidden] ${frame}`} aria-hidden={checking}>
            {front}
          </div>
          <div
            className="[grid-area:1/1] rounded-md border border-line bg-surface-1 [backface-visibility:hidden] [transform:rotateY(180deg)]"
            aria-hidden={!checking}
          >
            {(checking || backMounted) && back}
          </div>
        </motion.div>
      )}
    </li>
  );
}

function Front({
  item,
  face,
  sources,
  demo,
  onCheck,
  busy,
}: {
  item: Item;
  face: Face;
  sources: number;
  demo: boolean;
  onCheck: () => void;
  busy: boolean;
}) {
  const { href, household } = useAppState();
  const onRed = face === "alert";
  const readOnly = demo || household === DEMO_HOUSEHOLD;
  const c = item.case;
  const [notice, setNotice] = useState<Notice | null>(null);
  const needsNotice = (face === "alert" || face === "dismissed") && c?.notice_id;

  useEffect(() => {
    if (!needsNotice || !c) return;
    const controller = new AbortController();
    apiGet<Notice>(`/v1/notices/${encodeURIComponent(c.notice_id)}`, demo, controller.signal)
      .then(setNotice)
      .catch(() => setNotice(null));
    return () => controller.abort();
  }, [needsNotice, c, demo]);

  const [headline, detail] = (c?.reason ?? "").split(/;\s*/, 2);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`truncate font-display text-[20px] leading-tight font-bold ${onRed ? "text-accent-ink" : "text-ink"}`}>
            {item.name}
          </h3>
          <p className={`truncate text-[13px] ${onRed ? "text-accent-ink/85" : "text-muted"}`}>
            {[item.brand, item.purchase_date ? `bought ${fmtDay(item.purchase_date)}` : null].filter(Boolean).join(" · ") ||
              item.kind}
          </p>
        </div>
        <FaceLabel face={face} />
      </div>

      {face === "alert" && c && (
        <>
          <p className="font-display text-[17px] leading-snug font-bold text-accent-ink">
            {alertHeadline(c.notice_id, headline)}
          </p>
          {item.batch && <FoilChip code={item.batch} />}
          {c.range_check && <RangeBar check={c.range_check} onDanger />}
          {(notice?.raw_excerpt || c.quoted_sentence) && (
            <SourceExcerpt
              compact
              onDanger
              excerpt={notice?.raw_excerpt || c.quoted_sentence || ""}
              quote={c.quoted_sentence}
              caption={notice ? `${noticeRef(notice)} · published ${fmtDay(notice.published_at)}` : undefined}
            />
          )}
          {notice && notice.source !== "cdsco_nsq" && riskSentence(notice) && (
            <p className="text-[13px] leading-snug text-accent-ink">{riskSentence(notice)}</p>
          )}
          {c.sold_after_notice && item.purchase_date && notice && (
            <p className="text-[13px] text-accent-ink">
              Bought {fmtDay(item.purchase_date)}, {daysAfter(notice.published_at, item.purchase_date)} after the notice.
            </p>
          )}
        </>
      )}

      {face === "dismissed" && c && (
        <>
          {c.range_check?.yours && c.range_check.listed ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-12 text-[12px] text-muted">Yours</span>
                <FoilChip code={c.range_check.yours} diff={diffIndexes(c.range_check.yours, closest(c.range_check))} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-[12px] text-muted">Listed</span>
                <FoilChip code={closest(c.range_check)} diff={diffIndexes(c.range_check.yours, closest(c.range_check))} />
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink">{sentence(c.reason)}</p>
          )}
          {notice && (
            <p className="text-[13px] text-muted">
              Same {item.kind === "medicine" ? "medicine and maker" : "product"} as {noticeRef(notice)}, different{" "}
              {unitWord(item)}. Dismissed.
            </p>
          )}
        </>
      )}

      {face === "hold" && c && (
        <p className="text-[13px] text-ink">
          {sentence(headline)}
          {detail ? `; ${detail}` : ""}
        </p>
      )}

      {face === "clear" && (
        <p className="text-[13px] text-muted">
          No match in {sources} sources as of {fmtWhen(item.last_checked_at)}.
        </p>
      )}

      {face === "unchecked" && <p className="text-[13px] text-muted">Not checked against the notices yet.</p>}

      <div className="mt-auto flex items-center justify-end gap-2 pt-1">
        {c?.case_id && (
          <Link
            href={href(`/case/?id=${encodeURIComponent(c.case_id)}`)}
            className={`inline-flex h-9 items-center gap-1 rounded-md px-3 text-[13px] font-medium whitespace-nowrap ${
              onRed ? "bg-surface-1 text-ink hover:bg-surface-2" : "text-primary hover:bg-surface-2"
            }`}
          >
            Open case <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        )}
        {/* the demo wall is read-only: the button that would change it is not shown at all */}
        {!readOnly && (
          <button
            type="button"
            onClick={onCheck}
            disabled={busy}
            className={`inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium disabled:opacity-50 ${
              onRed
                ? "border border-accent-ink/60 text-accent-ink hover:bg-accent-ink/10"
                : "text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {face === "unchecked" ? "Check" : "Check again"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ItemCardSkeleton() {
  return (
    <li aria-hidden className="flex min-h-44 list-none flex-col gap-3 rounded-md border border-line bg-surface-1 p-4">
      <span className="h-4 w-2/3 bg-surface-2" />
      <span className="h-3 w-1/2 bg-surface-2" />
      <span className="mt-auto h-3 w-3/4 bg-surface-2" />
    </li>
  );
}
