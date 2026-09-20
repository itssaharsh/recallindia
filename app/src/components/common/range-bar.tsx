"use client";

import { motion, useReducedMotion } from "motion/react";

import { CROSSFADE, DRAW } from "@/lib/motion";
import type { RangeCheck } from "@/lib/types";

/**
 * C-12: where the user's unit falls against what the notice lists.
 *  - discrete (batches, serials): the listed codes as paper chips; yours is outlined in the
 *    accent when it is listed, and appended as "yours: <code>" when it is not;
 *  - range (model years, serial spans): a track with the listed span drawn in and your value as
 *    a marker ("2022 · within 2022–2023").
 *
 * `onDanger` is the variant that sits on the red alert face: the chips stay paper, and the
 * labels and the track turn to that face's own ink.
 */
export function RangeBar({ check, onDanger = false }: { check: RangeCheck; onDanger?: boolean }) {
  const reduce = useReducedMotion();
  const years = parseYears(check);
  const hit = check.inside === true;
  const textTone = onDanger ? "text-accent-ink" : "text-ink";
  const trackTone = onDanger ? "bg-accent-ink/30" : "bg-surface-2";
  const spanTone = onDanger ? "bg-accent-ink" : "bg-line-strong";
  const markTone = onDanger
    ? "bg-ink outline-2 outline-surface-1"
    : check.inside === false
      ? "bg-warning"
      : "bg-primary";
  const draw = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: CROSSFADE }
    : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: DRAW };

  if (years) {
    const { from, to, yours, min, max } = years;
    const pos = (y: number) => `${((y - min) / (max - min)) * 100}%`;
    const label = `${yours} · ${check.inside === true ? "within" : "outside"} ${spanLabel(from, to)}`;
    return (
      <div className="space-y-1.5" role="img" aria-label={`Model year ${label}`}>
        <div className={`relative h-2 ${trackTone}`}>
          <motion.div
            className={`absolute inset-y-0 origin-left ${spanTone}`}
            style={{ left: pos(from - 0.5), width: `calc(${pos(to + 0.5)} - ${pos(from - 0.5)})` }}
            {...draw}
          />
          <span className={`absolute -top-1 h-4 w-0.5 ${markTone}`} style={{ left: pos(yours) }} aria-hidden />
        </div>
        <p className={`font-mono text-xs ${textTone}`}>{label}</p>
      </div>
    );
  }

  const listed = check.listed
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const yours = check.yours || "—";
  const label = hit ? `${yours} · listed` : check.inside === false ? `${yours} · not listed` : `${yours} · not comparable`;
  const outline = onDanger ? "outline-ink" : "outline-primary";
  return (
    <div
      className="space-y-1.5"
      role="img"
      aria-label={`${check.kind === "serial" ? "Serial" : "Batch"} ${label}; listed: ${listed.join(", ") || "none"}`}
    >
      <motion.div className="flex min-w-0 flex-wrap items-center gap-1.5" {...draw}>
        {listed.slice(0, 8).map((b) => (
          <span
            key={b}
            className={`truncate rounded-sm bg-surface-1 px-1.5 py-0.5 font-mono text-[13px] ${
              hit && eq(b, yours) ? `text-ink outline-2 ${outline}` : "text-muted"
            }`}
          >
            {b}
          </span>
        ))}
        {!hit && <span className={`shrink-0 font-mono text-[13px] ${textTone}`}>yours: {yours}</span>}
      </motion.div>
      <p className={`font-mono text-xs ${textTone}`}>{label}</p>
    </div>
  );
}

const eq = (a: string, b: string) => a.replace(/\s+/g, "").toUpperCase() === b.replace(/\s+/g, "").toUpperCase();

function spanLabel(from: number, to: number) {
  return from === to ? String(from) : `${from}–${to}`;
}

function parseYears(check: RangeCheck) {
  if (check.kind && check.kind !== "vehicle_year") return null;
  const span = check.listed.match(/^(\d{4})(?:\s*[–-]\s*(\d{4}))?$/);
  const yours = Number.parseInt(check.yours, 10);
  if (!span || Number.isNaN(yours)) return null;
  const from = Number(span[1]);
  const to = Number(span[2] ?? span[1]);
  const min = Math.min(from, yours) - 2;
  const max = Math.max(to, yours) + 2;
  return { from, to, yours, min, max };
}
