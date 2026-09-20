"use client";
import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Button, Chip, cn } from "../ui";
import { auditDetail, istTimeSec, parseReasoning } from "./format";
import { S } from "./motion";
import type { AuditEntry, CaseEvidence, ItemKind } from "./types";

/**
 * C9 · ShowWork: why it matched, and every event with timestamps. Full width under the body grid
 * (1472 at 1536). Native <details>/<summary> (Enter/Space toggle); the height springs 380/34 and the
 * chevron turns 180° in 250 ms. Matches the bottom card of `case-full-1536.png`.
 */
export interface ShowWorkProps {
  /** case.reasoning (split on "; ") */
  reasoning: string;
  /** case.verifier */
  verifier: string;
  /** case.confidence */
  confidence: number;
  /** case.audit[] in API order, plus client-side tamper rows */
  audit: AuditEntry[];
  evidence: CaseEvidence | null;
  caseId: string;
  kind: ItemKind;
  defaultOpen?: boolean;
  onCopyCaseJson?: () => void;
  className?: string;
}

export function ShowWork({ reasoning, verifier, confidence, audit, evidence, caseId, kind, defaultOpen = false, onCopyCaseJson, className }: ShowWorkProps) {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(defaultOpen);
  const [rendered, setRendered] = React.useState(defaultOpen);
  const why = parseReasoning(reasoning, kind);
  const matcher = verifier === "deterministic" ? "Deterministic matcher" : `${verifier.charAt(0).toUpperCase()}${verifier.slice(1)} matcher`;

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault(); // we animate the close before the browser hides the content
    if (open) setOpen(false);
    else { setRendered(true); setOpen(true); }
  };

  return (
    <details
      open={rendered}
      className={cn("mt-6 mb-[72px] rounded-md border border-line bg-surface-1 px-7 py-6 shadow-1 max-md:mt-4 max-md:mb-6 max-md:px-4 max-md:py-[18px]", className)}
    >
      <summary
        onClick={toggle}
        className="flex min-h-11 cursor-pointer list-none items-center gap-3.5 rounded-sm [&::-webkit-details-marker]:hidden"
      >
        <div className="min-w-0">
          <h2 className="font-display text-[22px] leading-[1.2] font-bold tracking-[-.02em] text-ink">Show work</h2>
          <span className="text-[14px] leading-[1.4] text-ink-muted">How the match was made, and every step the pipeline took</span>
        </div>
        <span aria-hidden className="ml-auto grid size-10 flex-none place-items-center rounded-full border border-line text-ink-muted">
          <ChevronDown className={cn("size-[18px] transition-transform duration-[250ms]", open && "rotate-180")} strokeWidth={2.1} />
        </span>
      </summary>

      <motion.div
        initial={false}
        animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
        transition={reduce ? { duration: 0.15 } : { height: S.layout, opacity: { duration: 0.18 } }}
        onAnimationComplete={() => { if (!open) setRendered(false); }}
        className="overflow-hidden"
      >
        <div className="mt-5 grid grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] gap-12 max-md:grid-cols-1 max-md:gap-8">
          <div>
            <h3 className="mb-2.5 font-sans text-[13px] leading-none font-semibold tracking-[.05em] text-ink-muted uppercase">Why it matched</h3>
            <ul className="m-0 list-none p-0">
              {why.map((w, i) => (
                <li key={i} className={cn("grid grid-cols-[24px_1fr] gap-2.5 py-2.5 text-[14.5px] leading-[1.45] text-ink-muted", i > 0 && "border-t border-line")}>
                  <span aria-hidden className="mt-px grid size-[22px] place-items-center rounded-full bg-danger-soft text-danger">
                    <Check className="size-[13px]" strokeWidth={3} />
                  </span>
                  <span>{w.label && <b className="font-semibold text-ink">{w.label}:</b>} {w.text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone="info">{matcher}</Chip>
              <Chip tone="info">Confidence {confidence.toFixed(2)}</Chip>
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="mb-2.5 font-sans text-[13px] leading-none font-semibold tracking-[.05em] text-ink-muted uppercase">Audit log · IST</h3>
            <table className="w-full border-collapse text-[13.5px] leading-[1.4]">
              <tbody>
                {audit.map((e, i) => (
                  <tr key={`${e.ts}-${e.event}-${i}`} className={cn("[&>td]:py-[9px] [&>td]:pr-2.5 [&>td]:align-top", i > 0 && "[&>td]:border-t [&>td]:border-line")}>
                    <td className="w-[74px] font-mono text-[12.5px] leading-[1.5] whitespace-nowrap text-ink-muted tabular-nums">{istTimeSec(e.ts)}</td>
                    <td className="w-[150px] font-mono text-[12.5px] leading-[1.5] whitespace-nowrap text-ink max-md:w-auto max-md:whitespace-normal">{e.event}</td>
                    <td className="text-ink-muted max-md:hidden">{auditDetail(e, evidence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-[18px] flex items-center gap-3 rounded-[12px] bg-surface-2 py-2.5 pr-2.5 pl-4 font-mono text-[13px] leading-none max-md:flex-wrap">
          <span className="min-w-0 break-all"><b className="font-normal text-cobalt">GET</b> /cases/{caseId}</span>
          <span className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onCopyCaseJson} icon={<Copy aria-hidden className="size-4" strokeWidth={1.9} />} className="font-sans">
            Copy case JSON
          </Button>
        </div>
      </motion.div>
    </details>
  );
}
