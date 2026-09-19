"use client";

import { FileText } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import type { IngestRow } from "@/lib/ingest";

// Set in the module that renders <Document> (react-pdf's rule). The worker is copied from the
// exact pdfjs-dist react-pdf resolves into public/ at build time (scripts/copy-pdf-worker.mjs):
// served from this origin, never a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

export interface StageHandle {
  /** the outline element of a row (for its on-screen rect and the lift animation) */
  outline: (row: number) => HTMLElement | null;
  /** every outline, for switching their state together */
  outlines: () => HTMLElement[];
  /** the rendered canvas of a page (the dissolve copies a row's pixels from it) */
  canvas: (page: number) => HTMLCanvasElement | null;
  pageCount: () => number;
}

/**
 * The actual CDSCO PDF, every page rendered once up front and stacked so that turning the page
 * during the dissolve is a visibility change, never a re-render. Each extracted row gets a faint
 * outline at its Textract bbox (page fractions, so it follows any rendered size).
 */
// a plain `handle` prop (not `ref`): this component is loaded with next/dynamic (pdf.js is
// browser-only), and a ref through the dynamic wrapper is not guaranteed to arrive
export function PdfStage({
  handle,
  url,
  rows,
  page,
  onPage,
  locked,
  onReady,
  caption,
}: {
  handle: React.Ref<StageHandle>;
  url: string | null;
  rows: IngestRow[] | null;
  page: number;
  onPage: (page: number) => void;
  locked: boolean;
  onReady?: (pages: number) => void;
  caption?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const outlines = useRef(new Map<number, HTMLElement>());
  const pageBoxes = useRef(new Map<number, HTMLElement>());
  const [width, setWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const rendered = useRef(new Set<number>());

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    rendered.current = new Set();
    setNumPages(0);
    setFailed(null);
  }, [url]);

  useImperativeHandle(
    handle,
    () => ({
      outline: (row) => outlines.current.get(row) ?? null,
      outlines: () => [...outlines.current.values()],
      canvas: (n) => (pageBoxes.current.get(n)?.querySelector("canvas") as HTMLCanvasElement | null) ?? null,
      pageCount: () => numPages,
    }),
    [numPages],
  );

  const setPageBox = useCallback(
    (n: number) => (el: HTMLElement | null) => {
      if (el) pageBoxes.current.set(n, el);
      else pageBoxes.current.delete(n);
    },
    [],
  );

  const byPage = useMemo(() => {
    const map = new Map<number, IngestRow[]>();
    for (const r of rows ?? []) {
      if (!r.bbox) continue;
      map.set(r.page, [...(map.get(r.page) ?? []), r]);
    }
    return map;
  }, [rows]);

  const setOutline = useCallback(
    (row: number) => (el: HTMLElement | null) => {
      if (el) outlines.current.set(row, el);
      else outlines.current.delete(row);
    },
    [],
  );

  const pageDone = (n: number) => {
    rendered.current.add(n);
    if (rendered.current.size === numPages && numPages > 0) onReady?.(numPages);
  };

  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <div ref={box} className="relative min-h-40 overflow-hidden bg-paper">
        {!url && !failed && <PagePlaceholder text="The alert PDF appears here when a run fetches it" />}
        {failed && <PagePlaceholder text={`The PDF could not be shown: ${failed}`} />}
        {url && !failed && width > 0 && (
          <Document
            file={url}
            suspense={false}
            loading={<PagePlaceholder text="Opening the PDF" />}
            error={<PagePlaceholder text="The PDF could not be opened" />}
            onLoadSuccess={(doc) => setNumPages(doc.numPages)}
            onLoadError={(err) => setFailed(err.message)}
          >
            {Array.from({ length: numPages }, (_, i) => {
              const n = i + 1;
              return (
                <div
                  key={n}
                  ref={setPageBox(n)}
                  className={n === 1 ? "relative" : "absolute inset-0"}
                  style={{ visibility: n === page ? "visible" : "hidden" }}
                  aria-hidden={n !== page}
                >
                  <Page
                    pageNumber={n}
                    width={width}
                    devicePixelRatio={dpr}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={null}
                    onRenderSuccess={() => pageDone(n)}
                  />
                  <div className="pointer-events-none absolute inset-0">
                    {(byPage.get(n) ?? []).map((r) => (
                      <div
                        key={r.row}
                        ref={setOutline(r.row)}
                        data-row={r.row}
                        className="ingest-outline absolute"
                        style={{
                          left: `${r.bbox!.left * 100}%`,
                          top: `${r.bbox!.top * 100}%`,
                          width: `${r.bbox!.width * 100}%`,
                          height: `${r.bbox!.height * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </Document>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Page" className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted">Page</span>
          {Array.from({ length: Math.max(numPages, 0) }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={page === i + 1}
              disabled={locked}
              onClick={() => onPage(i + 1)}
              className={`h-7 min-w-7 rounded-sm border px-1.5 font-mono text-xs disabled:cursor-default ${
                page === i + 1
                  ? "border-primary-strong bg-surface-3 text-text"
                  : "border-line text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              {i + 1}
            </button>
          ))}
          {numPages > 0 && <span className="ml-1 font-mono text-xs text-muted">/ {numPages}</span>}
        </div>
        {caption && <figcaption className="text-xs text-muted">{caption}</figcaption>}
      </div>
    </figure>
  );
}

function PagePlaceholder({ text }: { text: string }) {
  return (
    <div className="flex aspect-[1.414] w-full flex-col items-center justify-center gap-2 text-ink/60">
      <FileText aria-hidden className="size-6" strokeWidth={1.5} />
      <span className="text-[13px]">{text}</span>
    </div>
  );
}
