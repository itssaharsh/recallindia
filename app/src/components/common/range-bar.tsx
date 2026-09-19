"use client";

import { motion, useReducedMotion } from "motion/react";

import { CROSSFADE, DRAW } from "@/lib/motion";
import type { RangeCheck } from "@/lib/types";

/**
 * Where the user's unit falls against what the notice lists.
 *  - batches / serials: the listed values as marks on a track; your value sits on its mark when
 *    it is listed, or past the end of the track when it is not ("FT5428 · not listed");
 *  - model years: a numeric track, the listed span drawn in, your year as a marker
 *    ("2022 · within 2022–2023").
 * The listed span draws in once, on the state change that revealed it (DESIGN.md).
 */
export function RangeBar({ check }: { check: RangeCheck }) {
  const reduce = useReducedMotion();
  const years = parseYears(check);
  const hit = check.inside === true;
  const tone = check.inside === true ? "bg-alert" : check.inside === false ? "bg-hold" : "bg-muted";
  const draw = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: CROSSFADE }
    : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: DRAW };

  if (years) {
    const { from, to, yours, min, max } = years;
    const pos = (y: number) => `${((y - min) / (max - min)) * 100}%`;
    const label =
      check.inside === true
        ? `${yours} · within ${spanLabel(from, to)}`
        : `${yours} · outside ${spanLabel(from, to)}`;
    return (
      <div className="space-y-1.5" role="img" aria-label={`Model year ${label}`}>
        <div className="relative h-2 bg-surface-3">
          <motion.div
            className="absolute inset-y-0 origin-left bg-line"
            style={{ left: pos(from - 0.5), width: `calc(${pos(to + 0.5)} - ${pos(from - 0.5)})` }}
            {...draw}
          />
          <span
            className={`absolute -top-1 h-4 w-0.5 ${tone}`}
            style={{ left: pos(yours) }}
            aria-hidden
          />
        </div>
        <p className="font-mono text-xs text-text">{label}</p>
      </div>
    );
  }

  const listed = check.listed
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const yours = check.yours || "—";
  const label = hit ? `${yours} · listed` : check.inside === false ? `${yours} · not listed` : `${yours} · not comparable`;
  return (
    <div className="space-y-1.5" role="img" aria-label={`${check.kind === "serial" ? "Serial" : "Batch"} ${label}; listed: ${listed.join(", ") || "none"}`}>
      <div className="flex items-center gap-2">
        <motion.div className="flex min-w-0 flex-1 origin-left items-center gap-1 bg-surface-3 px-1 py-1" {...draw}>
          {listed.map((b) => (
            <span
              key={b}
              className={`truncate px-1.5 py-0.5 font-mono text-[11px] ${hit && eq(b, yours) ? "bg-alert text-surface-0" : "bg-surface-1 text-muted"}`}
            >
              {b}
            </span>
          ))}
        </motion.div>
        {!hit && (
          <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[11px] text-surface-0 ${tone}`}>{yours}</span>
        )}
      </div>
      <p className="font-mono text-xs text-text">{label}</p>
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
