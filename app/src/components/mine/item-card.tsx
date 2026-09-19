"use client";

import { ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { RangeBar } from "@/components/common/range-bar";
import { SourceExcerpt } from "@/components/common/source-excerpt";
import { StatusTag, type Tone } from "@/components/common/status-tag";
import { useAppState } from "@/components/shell/app-state";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
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

const TAG: Record<Face, { tone: Tone; label: string }> = {
  alert: { tone: "alert", label: "Alert" },
  hold: { tone: "hold", label: "Hold" },
  dismissed: { tone: "dismissed", label: "Dismissed" },
  clear: { tone: "clear", label: "Clear" },
  unchecked: { tone: "unchecked", label: "Not checked" },
};

const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const unitWord = (item: Item) => (item.batch ? "batch" : item.serial ? "serial" : item.year ? "model year" : "unit");

/** The alert headline. CDSCO: the decision's own first clause ("Failed CDSCO quality test,
 *  JUL-2026 alert, row 12"). Recalls: which recall, read off the case's notice key
 *  (``nhtsa#24V436000``), so it is right before the notice itself has loaded. */
function alertHeadline(noticeKey: string, reasonHead: string): string {
  const [source, id] = noticeKey.split("#", 2);
  if (!id || source === "cdsco_nsq") return sentence(reasonHead);
  return `On ${sourceLabel(source)} recall ${id}`;
}
const identifier = (item: Item) =>
  [item.batch && `batch ${item.batch}`, item.serial && `serial ${item.serial}`, item.model && item.kind !== "vehicle" && item.model, item.year && String(item.year)]
    .filter(Boolean)
    .join(" · ");

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
  const frame = `rounded-md border ${
    face === "alert"
      ? "border-alert bg-alert-face shadow-[0_18px_40px_-20px_oklch(0%_0_0_/_0.75)]"
      : face === "hold" || face === "dismissed"
        ? "border-line border-l-4 border-l-hold bg-surface-2"
        : "border-line bg-surface-2"
  }`;

  const front = <Front item={item} face={face} sources={sources} demo={demo} onCheck={() => onCheck(item)} busy={checking} />;
  const back = (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 text-[13px] text-muted">
          Checking <span className="text-text">{item.name}</span>
        </p>
        <StatusTag tone="checking" label="Checking" />
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
            className={`min-h-44 ${checking ? "rounded-md border border-line bg-surface-2" : frame}`}
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
            className="[grid-area:1/1] rounded-md border border-line bg-surface-2 [backface-visibility:hidden] [transform:rotateY(180deg)]"
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
  const { href } = useAppState();
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
  const tag = TAG[face];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 truncate font-display text-base font-semibold text-text">{item.name}</h3>
          <p className="m-0 truncate text-xs text-muted">
            {[item.brand, identifier(item)].filter(Boolean).join(" · ") || item.kind}
          </p>
        </div>
        <StatusTag tone={tag.tone} label={tag.label} />
      </div>

      {face === "alert" && c && (
        <>
          <p className="m-0 font-display text-[17px] leading-snug font-semibold text-text">{alertHeadline(c.notice_id, headline)}</p>
          {c.range_check && <RangeBar check={c.range_check} />}
          {(notice?.raw_excerpt || c.quoted_sentence) && (
            <SourceExcerpt
              compact
              excerpt={notice?.raw_excerpt || c.quoted_sentence || ""}
              quote={c.quoted_sentence}
              caption={notice ? `${noticeRef(notice)} · published ${fmtDay(notice.published_at)}` : undefined}
            />
          )}
          {notice && notice.source !== "cdsco_nsq" && riskSentence(notice) && (
            <p className="m-0 text-[13px] leading-snug text-text">
              <span className="text-muted">Risk: </span>
              {riskSentence(notice)}
            </p>
          )}
          {c.sold_after_notice && item.purchase_date && notice && (
            <p className="m-0 text-[13px] text-text">
              Bought {fmtDay(item.purchase_date)}, after the notice of {fmtDay(notice.published_at)}.
            </p>
          )}
        </>
      )}

      {face === "dismissed" && c && (
        <>
          <p className="m-0 text-[13px] text-text">Dismissed: {c.reason}</p>
          {c.range_check && <RangeBar check={c.range_check} />}
          {notice && (
            <p className="m-0 text-xs text-muted">
              Same product as the {noticeRef(notice)}; your {unitWord(item)} is not the listed one.
            </p>
          )}
        </>
      )}

      {face === "hold" && c && (
        <p className="m-0 text-[13px] text-text">
          {sentence(headline)}
          {detail ? `; ${detail}` : ""}
        </p>
      )}

      {face === "clear" && (
        <p className="m-0 text-[13px] text-muted">
          No match in {sources} sources as of {fmtWhen(item.last_checked_at)}.
        </p>
      )}

      {face === "unchecked" && <p className="m-0 text-[13px] text-muted">Not checked against the notices yet.</p>}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="min-w-0 truncate font-mono text-[11px] text-muted">
          {c?.verifier ? `verifier ${c.verifier}${c.confidence ? ` · ${c.confidence}` : ""}` : ""}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {c?.case_id && (
            <Link
              href={href(`/case/?id=${encodeURIComponent(c.case_id)}`)}
              className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-[13px] whitespace-nowrap text-primary-strong hover:bg-surface-3"
            >
              Open case <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onCheck}
            disabled={busy || demo}
            title={demo ? "Demo data is read-only: checks run on the live API" : undefined}
          >
            {face === "unchecked" ? "Check" : "Check again"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ItemCardSkeleton() {
  return (
    <li aria-hidden className="flex min-h-44 list-none flex-col gap-3 rounded-md border border-line bg-surface-2 p-4">
      <span className="h-4 w-2/3 bg-surface-3" />
      <span className="h-3 w-1/2 bg-surface-3" />
      <span className="mt-auto h-3 w-3/4 bg-surface-3" />
    </li>
  );
}
