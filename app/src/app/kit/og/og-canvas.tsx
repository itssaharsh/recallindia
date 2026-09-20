"use client";

import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { FoilChip } from "@/components/common/foil-chip";
import { API_URL } from "@/lib/api";
import { fmtCount } from "@/lib/format";
import type { Stats } from "@/lib/types";

/** The share card, built from live numbers (UI-SPEC §9 OG). `data-og-ready` tells the
 *  screenshot script the counts have landed, so the card never ships a placeholder. */
export function OgCanvas() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!API_URL) return setFailed(true);
    fetch(`${API_URL}/v1/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setFailed(true));
  }, []);

  const sources = (stats?.sources ?? []).map((s) => s.label).join(" · ");
  return (
    <div
      data-og-ready={stats || failed ? "1" : "0"}
      className="flex h-[630px] w-[1200px] flex-col justify-between bg-canvas px-16 py-14"
    >
      <div className="flex items-start justify-between">
        <Logo height={40} className="text-ink" />
        <span className="rounded-sm bg-surface-1 px-3 py-1.5 font-mono text-[15px] text-ink-muted">Live on AWS</span>
      </div>

      <div className="space-y-5">
        <h1 className="max-w-[760px] font-display text-[62px] leading-[1.04] font-extrabold tracking-[-0.03em] text-ink">
          India publishes recalls as PDFs nobody reads.
        </h1>
        <p className="max-w-[720px] text-[24px] leading-snug text-ink-muted">
          RecallIndia turns them into a feed, and tells you the day something you own is on it.
        </p>
      </div>

      <div className="flex items-end justify-between gap-8">
        <div className="w-[520px] rounded-md bg-danger p-6 text-accent-ink">
          <p className="font-mono text-[13px] font-bold tracking-[0.08em] uppercase">On a notice</p>
          <p className="mt-2 font-display text-[26px] leading-tight font-bold">Paracetamol Tablets IP 650mg</p>
          <div className="mt-4 flex items-center gap-3">
            <FoilChip code="FT5427" />
            <span className="text-[15px] opacity-90">failed CDSCO quality test, July 2026 alert, row 12</span>
          </div>
        </div>
        <p className="pb-2 text-right font-mono text-[17px] text-ink-muted">
          {stats ? `${fmtCount(stats.total)} notices` : "live notices"}
          {sources ? (
            <>
              <br />
              {sources}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
