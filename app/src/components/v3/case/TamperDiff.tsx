"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Chip, cn } from "../ui";
import { hashGroups, hex } from "./format";
import { S } from "./motion";

/**
 * C6 sub-component · TamperDiff (invalid only). White inset on the cobalt band: which byte changed,
 * where it sits in the snapshot, and the signed vs recomputed hash. Matches `case-invalid-1536.png`.
 * The recomputed hash is always the API's value, never computed on the client.
 */
export interface TamperDiffProps {
  /** verify-evidence?tamper=1 → flipped_byte_index */
  flippedByteIndex: number;
  byteBefore: number;
  byteAfter: number;
  /** case.evidence.snapshot_bytes */
  snapshotBytes: number;
  /** case.evidence.sha256 (the signed digest) */
  signedSha256: string;
  /** tamper.recomputed_sha256 */
  recomputedSha256: string;
  demoControl: boolean;
  /** play X2/X3 (false = final frame) */
  animate?: boolean;
  className?: string;
}

export function TamperDiff({
  flippedByteIndex, byteBefore, byteAfter, snapshotBytes, signedSha256, recomputedSha256, demoControl, animate = true, className,
}: TamperDiffProps) {
  const pid = "ticks-" + React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const pct = Math.min(100, Math.max(0, (flippedByteIndex / Math.max(1, snapshotBytes)) * 100));
  const [s1, s2] = hashGroups(signedSha256);
  const [r1, r2] = hashGroups(recomputedSha256);
  const a = animate;

  return (
    <div role="status" className={cn("rounded-md bg-white px-[18px] py-4 text-ink shadow-[0_16px_34px_-18px_rgb(0_16_60/.7)]", className)}>
      <div className="flex flex-wrap items-center gap-2.5 text-[15px] leading-[1.2] font-semibold">
        Changed byte {flippedByteIndex}:
        <code className="inline-grid rounded-[7px] bg-danger-soft px-[9px] py-1.5 font-mono text-[15px] leading-none font-normal text-danger">
          {a ? (
            <>
              <motion.span className="[grid-area:1/1]" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.16, delay: 0.42 }}>
                {hex(byteBefore)}
              </motion.span>
              <motion.span className="[grid-area:1/1]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16, delay: 0.42 }}>
                {hex(byteBefore)} → {hex(byteAfter)}
              </motion.span>
            </>
          ) : (
            <span>{hex(byteBefore)} → {hex(byteAfter)}</span>
          )}
        </code>
      </div>

      <div aria-hidden className="mt-3.5">
        <div className="relative h-[34px]">
          <svg className="absolute inset-0 block size-full">
            <defs>
              <pattern id={pid} width="4" height="34" patternUnits="userSpaceOnUse">
                <rect x="0" y="8" width="1.6" height="18" fill="#B7C3D4" />
              </pattern>
            </defs>
            <rect width="100%" height="34" fill={`url(#${pid})`} />
          </svg>
          <motion.span
            className="absolute inset-y-0 w-[7px] -translate-x-1/2 origin-bottom rounded-[2px] bg-danger"
            style={{ left: `${pct}%` }}
            initial={a ? { scaleY: 0 } : false}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.22, delay: 0.26 }}
          />
        </div>
        <div className="relative mt-1.5 flex h-3 justify-between font-mono text-[12px] leading-none text-ink-muted">
          <span>byte 0</span>
          <span className="absolute -translate-x-1/2 text-danger" style={{ left: `${Math.min(88, Math.max(12, pct))}%` }}>{flippedByteIndex}</span>
          <span>{snapshotBytes} bytes</span>
        </div>
      </div>

      <dl className="mt-3.5 grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-t border-line pt-3.5">
        <dt className="text-[12.5px] leading-[1.5] font-semibold text-ink-muted">Signed</dt>
        <dd className="m-0 font-mono text-[13px] leading-[1.5] break-all">{s1}<br />{s2}</dd>
        <dt className="text-[12.5px] leading-[1.5] font-semibold text-ink-muted">Recomputed</dt>
        <dd className="m-0 font-mono text-[13px] leading-[1.5] break-all text-danger">
          <motion.span className="block" initial={a ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: 0.18 }}>
            {r1}<br />{r2}
          </motion.span>
          <motion.span className="mt-1.5 inline-flex" initial={a ? { scale: 0.9, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ ...S.pop, delay: 0.18 }}>
            <Chip tone="alert" className="font-sans"><X aria-hidden className="size-3.5" strokeWidth={2.8} />does not match</Chip>
          </motion.span>
        </dd>
      </dl>

      {demoControl && (
        <p className="mt-3 text-[12.5px] leading-[1.45] text-ink-muted">
          <b className="font-semibold text-warning">Demo control:</b> one byte of the downloaded copy was flipped in memory. The stored snapshot is untouched.
        </p>
      )}
    </div>
  );
}
