"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { GLYPH, STATE_WORD, TONE } from "@/components/mine/checklist";
import { alertMonth } from "@/lib/case";
import { sourceLabel } from "@/lib/format";
import type { AuditEvent, Case, CheckStep, Item, Notice, StepName, StepState } from "@/lib/types";

const CHAIN: StepName[] = ["Candidates", "Verify", "RangeCheck", "Decide", "Notify"];

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "CDSCO July 2026 alert, row 12" / "NHTSA recall 24V436000" */
function shortRef(notice: Notice | null, c: Case): string {
  if (!notice) return c.notice_id.replace("#", " ");
  if (notice.source === "cdsco_nsq") return `CDSCO ${alertMonth(notice)} alert${notice.row_ref?.row ? `, row ${notice.row_ref.row}` : ""}`;
  return `${sourceLabel(notice.source)} recall ${notice.notice_id}`;
}

/** One line per step of the check that opened this case (Candidates 3 -> verified against the
 *  row -> batch inside the list -> decision), from the execution's own step results when the
 *  item's last check is this case's, else from the case record. */
function chainCopy(name: StepName, c: Case, item: Item | null, notice: Notice | null, step?: CheckStep): string {
  const s = (step?.summary ?? {}) as Record<string, unknown>;
  const who = item?.brand || item?.make || notice?.brand || item?.name || "the item";
  const rc = c.range_check;
  switch (name) {
    case "Candidates": {
      const count = typeof s.count === "number" ? s.count : null;
      const sources = typeof s.sources === "number" && s.sources > 0 ? s.sources : null;
      return count !== null
        ? `Found ${count} candidate notice${count === 1 ? "" : "s"} naming ${who}${sources ? ` in ${sources} sources` : ""}`
        : `Found the notice naming ${who}`;
    }
    case "Verify":
      return `${c.covers_item === false ? "Read" : "Verified against"} ${shortRef(notice, c)}${
        c.covers_item === false ? ": it does not cover this item" : ": its text names this product"
      }${c.verifier ? ` (${c.verifier} verifier)` : ""}`;
    case "RangeCheck": {
      if (!rc) return "No batch, serial or year listed to compare";
      const listed = clip(rc.listed, 60);
      if (rc.kind === "vehicle_year" || item?.kind === "vehicle")
        return `Model year ${rc.yours} is ${rc.inside ? "within" : "outside"} ${listed}`;
      const serial = rc.kind === "serial" || Boolean(item?.serial && !item.batch);
      const what = serial ? "Serial" : "Batch";
      if (rc.inside === null) return `${what} ${rc.yours || "—"}: nothing listed to compare with`;
      return `${what} ${rc.yours} is ${rc.inside ? "inside" : "not in"} the listed ${serial ? "serials" : "batches"} (${listed})`;
    }
    case "Decide":
      return `Decision: ${c.decision} (alert only when the notice names it and lists your unit)`;
    case "Notify": {
      const email = c.audit?.find((a) => a.event.startsWith("email."));
      const mail = email ? (email.event === "email.sent" ? " and emailed the alert" : "; alert email not sent (SES identity unverified)") : "";
      return `Recorded case ${c.case_id} on the item${mail}`;
    }
  }
}

function detailText(detail: AuditEvent["detail"]): string {
  if (!detail) return "";
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

/** "Show work" (default closed, R25 thinking toggle): the verification chain, the verifier's
 *  reasoning string, the Step Functions execution and the audit trail (ts · step · detail). */
export function ShowWork({
  c,
  item,
  notice,
  steps,
}: {
  c: Case;
  item: Item | null;
  notice: Notice | null;
  /** the check's own steps, when the item's last check is this case's execution */
  steps: CheckStep[] | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Show work" className="border-t border-line pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="case-work"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-sm px-1 py-1 text-sm text-primary hover:bg-surface-2"
      >
        <ChevronRight aria-hidden className={`size-4 transition-transform ${open ? "rotate-90" : ""}`} />
        {open ? "Hide work" : "Show work"}
      </button>
      {open && (
        <div id="case-work" className="grid gap-8 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="min-w-0 space-y-5">
            <div className="space-y-2">
              <h3 className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Verification chain</h3>
              <ol className="list-none space-y-1.5 p-0">
                {CHAIN.map((name) => {
                  const step = steps?.find((s) => s.name === name);
                  const state: StepState = step?.state ?? "done";
                  return (
                    <li key={name} className="flex items-start gap-2.5 text-[13px] leading-snug">
                      <span aria-hidden className={`w-3 shrink-0 font-mono ${TONE[state]}`}>
                        {GLYPH[state]}
                      </span>
                      <span className={state === "failed" ? "text-danger" : state === "done" ? "text-ink" : "text-muted"}>
                        {chainCopy(name, c, item, notice, step)}
                        <span className="sr-only"> ({STATE_WORD[state]})</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="space-y-2">
              <h3 className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
                Verifier reasoning{c.verifier ? ` · ${c.verifier}` : ""}
                {typeof c.confidence === "number" ? ` · confidence ${c.confidence}` : ""}
              </h3>
              <p className="border-l-2 border-line py-0.5 pl-3 font-mono text-[12px] leading-relaxed break-words text-ink">
                {c.reasoning || c.reason}
              </p>
              {c.verifier !== "bedrock" && (
                <p className="text-xs text-muted">Rules decide: no language model is in the decision path.</p>
              )}
            </div>
            {c.execution_arn && (
              <div className="space-y-1">
                <h3 className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Step Functions execution</h3>
                <p className="font-mono text-[12px] break-all text-ink">{c.execution_arn}</p>
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            <h3 className="font-mono text-[11px] font-medium tracking-[0.12em] text-muted uppercase">Audit trail</h3>
            <ol className="list-none border-t border-line p-0 font-mono text-[12px]">
              {(c.audit ?? []).map((a, i) => {
                const detail = detailText(a.detail);
                return (
                  <li key={`${a.ts}-${a.event}-${i}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-1.5 sm:grid-cols-[4.5rem_11rem_minmax(0,1fr)]">
                    <span className="text-muted" title={a.ts}>
                      {a.ts.slice(11, 19)}
                    </span>
                    <span className="text-ink">{a.event}</span>
                    <span className="col-span-2 break-words text-muted sm:col-span-1" title={detail.length > 160 ? detail : undefined}>
                      {clip(detail)}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted">Times in UTC. Every entry is appended by the step that did the work.</p>
          </div>
        </div>
      )}
    </section>
  );
}
