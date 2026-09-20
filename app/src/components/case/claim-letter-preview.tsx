"use client";

import { Download, FileText } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { fmtDay } from "@/lib/format";
import type { Case, ClaimLink, Item } from "@/lib/types";

/** Open a presigned link in a tab created inside the click (a tab opened after an await is a
 *  blocked pop-up), then point it at the fresh URL. */
async function openLink(get: () => Promise<string>, tab: Window | null) {
  try {
    const url = await get();
    const absolute = new URL(url, window.location.href).toString();
    if (tab) {
      tab.opener = null;
      tab.location.replace(absolute);
    } else {
      window.location.assign(absolute);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/**
 * C-18: the artifact you walk away with. A paper page with the letter's opening, and the PDF
 * itself behind two short-lived links (view and download).
 */
export function ClaimLetterPreview({
  c,
  item,
  demo,
  writing,
}: {
  c: Case;
  item: Item | null;
  demo: boolean;
  /** the letter is being written right now */
  writing: boolean;
}) {
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const link = useCallback(
    async (which: "view" | "download") => {
      const answer = await apiGet<ClaimLink>(`/cases/${encodeURIComponent(c.case_id)}/claim`, demo);
      return (which === "download" ? answer.download : answer.view) || answer.url || "";
    },
    [c.case_id, demo],
  );

  const open = (which: "view" | "download") => async () => {
    setError(null);
    const tab = window.open("", "_blank");
    setBusy(which);
    try {
      await openLink(() => link(which), tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (writing) {
    return (
      <section aria-label="Claim letter" className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink">Writing the letter…</h2>
        <div aria-hidden className="space-y-2 border border-line bg-surface-1 px-8 py-8">
          {[90, 96, 72, 88, 40].map((w, i) => (
            <span key={i} className="block h-3 animate-pulse bg-surface-1" style={{ width: `${w}%` }} />
          ))}
        </div>
      </section>
    );
  }
  if (!c.claim_pdf_s3_key) return null;

  const paragraphs = (c.claim_text ?? "")
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("To:") && !p.startsWith("Subject:") && !p.startsWith("Dear ") && p.length > 60)
    .slice(0, 2);
  const subject = (c.claim_text ?? "").split("\n").find((line) => line.startsWith("Subject:"));

  return (
    <section aria-labelledby="letter-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="letter-title" className="font-display text-lg font-semibold text-ink">
          The claim letter
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={open("view")} disabled={busy !== null}>
            <FileText aria-hidden />
            {busy === "view" ? "Opening…" : "Open the letter (PDF)"}
          </Button>
          <Button variant="ghost" size="sm" onClick={open("download")} disabled={busy !== null}>
            <Download aria-hidden />
            Download
          </Button>
        </div>
      </div>
      <article className="max-w-[640px] border border-line bg-surface-1 px-8 py-8 text-[13px] leading-relaxed text-ink md:px-10">
        <p className="text-ink-muted">{fmtDay(c.claim_created_at)}</p>
        <p className="mt-4">To: {item?.bought_from || `The ${c.claim_addressee ?? "seller"}`}</p>
        {subject && <p className="mt-4 font-semibold">{subject}</p>}
        {paragraphs.map((p, i) => (
          <p key={i} className="mt-4">
            {p}
          </p>
        ))}
        <p className="mt-4 text-ink-muted">The rest of the letter is in the PDF.</p>
      </article>
      {error && <p className="text-[13px] text-warning">The letter couldn&apos;t be opened ({error}). Try again.</p>}
    </section>
  );
}
