"use client";

import { ExternalLink, FileText } from "lucide-react";
import { useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import { SourceChip } from "@/components/common/source-chip";
import { SourceExcerpt } from "@/components/common/source-excerpt";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiGet } from "@/lib/api";
import { confidenceLabel, fmtDay, rowRefLabel, sourceLabel } from "@/lib/format";
import type { Notice } from "@/lib/types";

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-b border-line py-2 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className={`m-0 text-text ${mono ? "font-mono text-[12.5px]" : ""}`}>{children}</dd>
    </div>
  );
}

/** The whole notice, one click from its row: fields, the source's own words, and where to find it. */
export function NoticeSheet({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const { demo } = useAppState();
  const [pdfError, setPdfError] = useState<string | null>(null);

  const openPdf = async (n: Notice) => {
    setPdfError(null);
    try {
      const { url } = await apiGet<{ url: string }>(`/ingest/pdf?key=${encodeURIComponent(n.pdf_s3_key ?? "")}`, demo);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Sheet
      open={notice !== null}
      onOpenChange={(open) => {
        if (open) return;
        setPdfError(null);
        onClose();
      }}
    >
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto rounded-l-lg border-line bg-surface-1 sm:max-w-xl">
        {notice && (
          <>
            <SheetHeader className="gap-2 border-b border-line p-5 pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <SourceChip notice={notice} tooltip={false} />
                <span className="font-mono text-xs text-muted">{notice.notice_id}</span>
                <span className="text-xs text-muted">· {fmtDay(notice.published_at)}</span>
              </div>
              <SheetTitle className="font-display text-xl leading-snug font-semibold text-text">{notice.product || notice.title}</SheetTitle>
              <SheetDescription className="text-[13px] text-muted">{notice.title}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 p-5">
              <dl className="m-0">
                <Field label="Brand">{notice.brand}</Field>
                {(notice.batches?.length ?? 0) > 0 && (
                  <Field label={notice.batches!.length > 1 ? "Batches" : "Batch"} mono>
                    {notice.batches!.join(", ")}
                  </Field>
                )}
                {(notice.serial_ranges?.length ?? 0) > 0 && (
                  <Field label="Serials" mono>
                    {notice.serial_ranges!.join("; ")}
                  </Field>
                )}
                {notice.model && (
                  <Field label="Model" mono>
                    {notice.model}
                  </Field>
                )}
                {(notice.vehicles?.length ?? 0) > 0 && (
                  <Field label="Vehicles" mono>
                    {notice.vehicles!
                      .map((v) => `${v.make} ${v.model} ${v.year_from === v.year_to ? v.year_from : `${v.year_from}–${v.year_to}`}`)
                      .join(", ")}
                  </Field>
                )}
                {notice.hazard_or_failed_test && (
                  <Field label={notice.source === "cdsco_nsq" ? "Failed test" : "Hazard"}>{notice.hazard_or_failed_test}</Field>
                )}
                {notice.remedy && <Field label="Remedy">{notice.remedy}</Field>}
                {(notice.mfg_date || notice.exp_date) && (
                  <Field label="Mfg · Exp" mono>
                    {notice.mfg_date ?? "—"} · {notice.exp_date ?? "—"}
                  </Field>
                )}
                {notice.lab && <Field label="Tested by">{notice.lab}</Field>}
                <Field label="Source">{confidenceLabel(notice)}</Field>
                {rowRefLabel(notice) && (
                  <Field label="Row" mono>
                    {rowRefLabel(notice)}
                  </Field>
                )}
              </dl>
              {notice.raw_excerpt && (
                <SourceExcerpt excerpt={notice.raw_excerpt} caption={`${sourceLabel(notice.source)}'s own words, as published`} />
              )}
              <div className="flex flex-wrap gap-2">
                {notice.url && (
                  <a
                    href={notice.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-2 rounded-sm border border-line px-3 text-[13px] text-primary-strong hover:bg-surface-2"
                  >
                    <ExternalLink aria-hidden className="size-3.5" />
                    Open at {sourceLabel(notice.source)}
                  </a>
                )}
                {/* a presigned link expires, so demo data (static JSON) carries none: the source link stays */}
                {notice.pdf_s3_key && !demo && (
                  <button
                    type="button"
                    onClick={() => openPdf(notice)}
                    className="inline-flex h-8 items-center gap-2 rounded-sm border border-line px-3 text-[13px] text-primary-strong hover:bg-surface-2"
                  >
                    <FileText aria-hidden className="size-3.5" />
                    Open the PDF{notice.row_ref?.page ? ` · page ${notice.row_ref.page}` : ""}
                  </button>
                )}
              </div>
              {pdfError && <p className="text-xs text-alert">Could not open the PDF: {pdfError}</p>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
