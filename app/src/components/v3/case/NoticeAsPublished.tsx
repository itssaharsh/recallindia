"use client";
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Lock } from "lucide-react";
import { Button, Card, FoilChip, cn } from "../ui";
import { FIELD_LABEL, SEC_H2, SEC_META, SEC_PAD } from "./classes";
import { SOURCE_SHORT, alertMonthLabel, bytesLabel, cdscoColumns, dayMonYear, hostOf } from "./format";
import type { Notice } from "./types";

/**
 * C4 · NoticeAsPublished: the regulator's own words as readable fields, with the untouched raw row
 * under them (the bytes that get sealed). Matches the notice card in `case-full-1536.png`.
 */
export interface NoticeAsPublishedProps {
  notice: Notice;
  /** case.quoted_sentence (falls back to notice.raw_excerpt). Rendered character for character. */
  quoted: string;
  /** the batch to underline in the raw row (range_check.listed) */
  batch?: string | null;
  /** phrase to <mark> in the quote and the raw row, e.g. "Dissolution Test" */
  highlight?: string | null;
  /** evidence exists → success lock chip */
  sealed: boolean;
  /** case.evidence.snapshot_bytes, or case.pending_snapshot_bytes before sealing */
  snapshotBytes?: number | null;
  className?: string;
}

const MARK = "rounded-[3px] bg-[#FAD9D5] px-[3px] text-ink";

/** Wraps every occurrence of `phrase` in <mark> without changing the text. */
export function withMark(text: string, phrase?: string | null): React.ReactNode {
  if (!phrase) return text;
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const j = text.indexOf(phrase, i);
    if (j < 0) break;
    if (j > i) out.push(text.slice(i, j));
    out.push(<mark key={k++} className={MARK}>{phrase}</mark>);
    i = j + phrase.length;
  }
  out.push(text.slice(i));
  return out;
}

function RawRow({ text, batch, highlight }: { text: string; batch?: string | null; highlight?: string | null }) {
  const cells = text.split(" | ");
  return (
    <pre className="m-0 px-4 pt-3.5 pb-4 font-mono text-[13.5px] leading-[1.8] break-words whitespace-pre-wrap text-ink max-md:px-3.5 max-md:py-3 max-md:text-[12.5px]">
      {cells.map((cell, i) => (
        <React.Fragment key={i}>
          {i > 0 && <>{" "}<i className="text-line-strong not-italic">|</i>{" "}</>}
          {batch && cell === batch ? (
            <u className="rounded-[2px] bg-cobalt-soft px-0.5 no-underline shadow-[inset_0_-2px_0_var(--cobalt)]">{cell}</u>
          ) : (
            withMark(cell, highlight)
          )}
        </React.Fragment>
      ))}
    </pre>
  );
}

function prettyJson(text: string): string {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-[7px] border-b border-line py-3.5 pr-5 max-md:pr-3", className)}>
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </div>
  );
}
const VAL = "text-[15px] leading-[1.45] font-medium text-ink";

export function NoticeAsPublished({ notice, quoted, batch, highlight, sealed, snapshotBytes, className }: NoticeAsPublishedProps) {
  const src = SOURCE_SHORT[notice.source];
  const host = hostOf(notice.url);
  const cdsco = notice.source === "cdsco_nsq";
  const cols = cdsco ? cdscoColumns(notice.raw_excerpt || quoted) : null;
  const row = notice.row_ref?.row;
  const month = notice.row_ref?.month;
  const meta = cdsco
    ? `Not of Standard Quality alert · ${alertMonthLabel(month)} · row ${row} · published ${dayMonYear(notice.published_at)}`
    : `${notice.source === "nhtsa" ? `Safety recall ${notice.campaign ?? notice.notice_id}` : notice.source === "cpsc" ? `Recall ${notice.notice_id}` : `Enforcement report ${notice.notice_id}`} · published ${dayMonYear(notice.published_at)}`;
  const labType = notice.lab_type ?? cols?.labType;
  const cite = cdsco
    ? `Result as listed · tested by ${notice.lab ?? cols?.lab ?? "the lab"}${labType ? ` (${labType})` : ""}`
    : `${src} ${notice.campaign ?? notice.notice_id}, as published`;
  const listed = batch ?? notice.batches[0] ?? null;
  const bytes = snapshotBytes != null ? `${bytesLabel(snapshotBytes)} bytes` : null;
  const rawTitle = cdsco ? <>Row {row}, raw text <span className="font-medium text-ink-muted">· exactly as published</span></> : <>Notice JSON, <span className="font-medium text-ink-muted">exactly as published</span></>;

  return (
    <Card as="section" aria-labelledby="notice-h" className={cn(SEC_PAD, className)}>
      <div className="flex items-start gap-4 max-md:flex-wrap max-md:gap-3">
        <span aria-hidden className="grid size-12 flex-none place-items-center rounded-[12px] bg-cat-medicine-soft font-display text-[10.5px] leading-none font-extrabold tracking-[.02em] text-cobalt max-md:size-10 max-md:text-[9px]">
          {src}
        </span>
        <div className="min-w-0 max-md:flex-1">
          <h2 id="notice-h" className={SEC_H2}>The notice, as {src} published it</h2>
          <p className={SEC_META}>{meta}</p>
        </div>
        <span className="flex-1 max-md:hidden" />
        <Button
          href={notice.url}
          target="_blank"
          rel="noopener"
          variant="secondary"
          aria-label={`Open this notice on ${host} (opens in a new tab)`}
          className="h-10! pointer-coarse:h-11! flex-none px-3.5! text-[14px]! max-md:w-full"
        >
          Open on {host}
          <ExternalLink aria-hidden className="size-[18px]" strokeWidth={1.9} />
        </Button>
      </div>

      {notice.hazard_or_failed_test && (
        <blockquote
          className={cn(
            "relative mt-5 rounded-[12px] border border-[#F3D3CF] bg-[#FFF8F7] py-4 pr-[18px] pl-[50px] text-[19px] leading-[1.45] font-medium text-ink",
            "before:absolute before:top-1.5 before:left-3.5 before:font-display before:text-[46px] before:leading-none before:font-extrabold before:text-danger before:content-['“']",
            "max-md:py-3.5 max-md:pr-3.5 max-md:pl-[42px] max-md:text-[16px] max-md:before:left-[11px] max-md:before:text-[40px]",
          )}
        >
          {withMark(notice.hazard_or_failed_test, highlight)}
          <cite className="mt-1.5 block text-[13px] leading-[1.4] font-normal text-ink-muted not-italic">{cite}</cite>
        </blockquote>
      )}

      <div className="mt-[18px] grid grid-cols-[1.25fr_.8fr_.95fr] border-t border-line max-md:grid-cols-2">
        {cdsco ? (
          <>
            <Field label="Drug" className="max-md:col-span-full"><b className={VAL}>{notice.product}</b></Field>
            <Field label="Batch">{listed ? <FoilChip code={listed} size="sm" className="self-start rounded-[7px] px-[9px]!" /> : <b className={VAL}>—</b>}</Field>
            <Field label="Mfg · Exp"><b className={cn(VAL, "tabular-nums")}>{[notice.mfg_date, notice.exp_date].filter(Boolean).join(" · ") || "—"}</b></Field>
            <Field label="Manufacturer" className="col-span-2 max-md:col-span-full"><b className={VAL}>{notice.manufacturer ?? cols?.manufacturer ?? notice.brand ?? "—"}</b></Field>
            <Field label="Alert" className="max-md:col-span-full"><b className={VAL}>{month} · row {row}</b></Field>
          </>
        ) : (
          <>
            <Field label="Product" className="max-md:col-span-full"><b className={VAL}>{notice.product}</b></Field>
            <Field label={notice.source === "nhtsa" ? "Campaign" : "Recall"}><b className={cn(VAL, "tabular-nums")}>{notice.campaign ?? notice.notice_id}</b></Field>
            <Field label={notice.source === "nhtsa" ? "Component" : "Brand"}><b className={VAL}>{(notice.source === "nhtsa" ? notice.component : notice.brand) ?? "—"}</b></Field>
            <Field label="Remedy" className="col-span-2 max-md:col-span-full"><b className={VAL}>{notice.remedy ?? "—"}</b></Field>
            <Field label="Published" className="max-md:col-span-full"><b className={VAL}>{dayMonYear(notice.published_at)}</b></Field>
          </>
        )}
      </div>

      <div className="mt-[18px] overflow-hidden rounded-[12px] border border-line bg-[#F8FAFD]">
        <div className="flex h-[46px] items-center justify-between gap-3 border-b border-line pr-2.5 pl-4 text-[13px] leading-none font-semibold text-ink max-md:h-auto max-md:flex-wrap max-md:gap-2 max-md:px-3 max-md:py-2.5">
          <span>{rawTitle}</span>
          <span className="inline-grid">
            <AnimatePresence initial={false}>
              <motion.span
                key={sealed ? "sealed" : "pending"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.4 } }}
                exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.4 } }}
                className={cn(
                  "inline-flex h-7 items-center gap-[7px] rounded-pill pr-[11px] pl-[9px] text-[12px] leading-none font-semibold whitespace-nowrap [grid-area:1/1]",
                  sealed ? "bg-success-soft text-success" : "bg-surface-2 text-ink-muted",
                )}
              >
                <Lock aria-hidden className="size-3.5" strokeWidth={2} />
                {sealed ? `Sealed copy${bytes ? ` · ${bytes}` : ""}` : bytes ? `${bytes} · sealed when you approve` : "Sealed when you approve"}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
        {cdsco ? <RawRow text={quoted} batch={listed} highlight={highlight} /> : (
          <pre className="m-0 max-h-[360px] overflow-auto px-4 pt-3.5 pb-4 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap text-ink">{prettyJson(quoted)}</pre>
        )}
      </div>
    </Card>
  );
}
