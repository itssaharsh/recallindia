"use client";

import { FileText } from "lucide-react";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import type { IngestRow } from "@/lib/ingest";

import { PdfErrorBoundary, isBenignPdfError } from "./pdf-boundary";

// Set in the module that renders <Document> (react-pdf's rule). The worker is copied from the
// exact pdfjs-dist react-pdf resolves into public/ at build time (scripts/copy-pdf-worker.mjs):
// served from this origin, never a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** `?pdf=poster` forces the fallback, so the QA gate can check the path a broken pdf.js takes. */
function initialMode(): "pdf" | "poster" {
  if (typeof window === "undefined") return "pdf";
  return new URLSearchParams(window.location.search).get("pdf") === "poster" ? "poster" : "pdf";
}

/** The committed pre-render of the same page: /ingest/<pdf name>-p<n>.png. */
function posterBaseOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const name = new URL(url, "https://x.invalid").pathname.split("/").pop() ?? "";
    const base = decodeURIComponent(name).replace(/\.pdf$/i, "");
    return base ? `/ingest/${base}` : null;
  } catch {
    return null;
  }
}

export interface StageHandle {
  /** the outline element of a row (for its on-screen rect and the lift animation) */
  outline: (row: number) => HTMLElement | null;
  /** every outline, for switching their state together */
  outlines: () => HTMLElement[];
  /** the rendered page as a decoded image (a flight shows its row as a crop of it) */
  pageImage: (page: number) => string | null;
  /** the page's box on screen (every page sits in the same box) */
  pageRect: () => DOMRect | null;
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
  pages: pagesHint,
}: {
  handle: React.Ref<StageHandle>;
  url: string | null;
  rows: IngestRow[] | null;
  page: number;
  onPage: (page: number) => void;
  locked: boolean;
  onReady?: (pages: number) => void;
  caption?: React.ReactNode;
  /** the run's page count, used when the poster stands in for pdf.js */
  pages?: number | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const outlines = useRef(new Map<number, HTMLElement>());
  const pageBoxes = useRef(new Map<number, HTMLElement>());
  const [width, setWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  // "poster": pdf.js could not render here (an old Chrome, a worker that would not start, a throw
  // caught by the boundary). The committed page images stand in and the dissolve runs over them.
  const [mode, setMode] = useState<"pdf" | "poster">(initialMode);
  const rendered = useRef(new Set<number>());
  // Each rendered page, encoded once to an object URL and decoded ahead of time. A flight shows
  // its row as a background crop of this image: a per-flight <canvas> becomes a texture layer
  // that is uploaded at commit, which measured as the largest cost of the dissolve at 4x CPU.
  const images = useRef(new Map<number, { url: string; img: HTMLImageElement }>());
  const [imagesReady, setImagesReady] = useState(0);

  const dropImages = useCallback(() => {
    images.current.forEach(({ url }) => URL.revokeObjectURL(url));
    images.current.clear();
    setImagesReady(0);
  }, []);
  useEffect(() => dropImages, [dropImages]);

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
    setMode(initialMode());
  }, [url]);

  useEffect(() => {
    dropImages(); // pdf pages and posters are different bitmaps: never mix them in one run
  }, [url, mode, dropImages]);

  // pdf.js rejects its loading task when a page turn or an unmount cancels it. Unhandled, that
  // rejection reaches the window and Next renders its error page over a working route.
  useEffect(() => {
    const swallow = (event: PromiseRejectionEvent) => {
      if (isBenignPdfError(event.reason)) event.preventDefault();
    };
    window.addEventListener("unhandledrejection", swallow);
    return () => window.removeEventListener("unhandledrejection", swallow);
  }, []);

  const posterBase = useMemo(() => posterBaseOf(url), [url]);
  const rowPages = useMemo(() => (rows ?? []).reduce((n, r) => Math.max(n, r.page), 0), [rows]);
  const posterPages = Math.max(pagesHint ?? 0, rowPages, 1);
  const shownPages = mode === "pdf" ? numPages : posterPages;

  // a poster page is already an image: register it the way a rendered canvas registers itself
  const posterDone = useCallback((n: number, img: HTMLImageElement) => {
    if (images.current.has(n)) return;
    images.current.set(n, { url: img.currentSrc || img.src, img });
    setImagesReady(images.current.size);
  }, []);

  useEffect(() => {
    if (shownPages > 0 && imagesReady === shownPages) onReady?.(shownPages);
  }, [imagesReady, shownPages, onReady]);

  useImperativeHandle(
    handle,
    () => ({
      outline: (row) => outlines.current.get(row) ?? null,
      outlines: () => [...outlines.current.values()],
      pageImage: (n) => images.current.get(n)?.url ?? null,
      pageRect: () => pageBoxes.current.get(1)?.getBoundingClientRect() ?? null,
      pageCount: () => shownPages,
    }),
    [shownPages],
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

  const pageDone = useCallback((n: number) => {
    rendered.current.add(n);
    const canvas = pageBoxes.current.get(n)?.querySelector("canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      const previous = images.current.get(n);
      if (previous) URL.revokeObjectURL(previous.url);
      images.current.set(n, { url, img });
      img
        .decode()
        .catch(() => undefined)
        .then(() => setImagesReady(images.current.size));
    }, "image/png");
  }, []);

  // Turning the page is a style write, not a render: the page tree below is memoized without
  // `page`, so react-pdf's six pages and every outline are not reconciled on each turn.
  const pageNow = useRef(page);
  pageNow.current = page;
  const onLoad = useCallback((doc: { numPages: number }) => setNumPages(doc.numPages), []);
  const fallBack = useCallback((err: unknown) => {
    if (!isBenignPdfError(err)) setMode("poster");
  }, []);

  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);

  const doc = useMemo(
    () =>
      url && mode === "pdf" && width > 0 ? (
        <Document
          file={url}
          loading={<PagePlaceholder text="Opening the PDF" />}
          error={<PagePlaceholder text="Opening the PDF" />}
          onLoadSuccess={onLoad}
          onLoadError={fallBack}
        >
          {Array.from({ length: numPages }, (_, i) => {
            const n = i + 1;
            const shown = n === pageNow.current;
            return (
              <div
                key={n}
                ref={setPageBox(n)}
                className={n === 1 ? "relative" : "absolute inset-0"}
                style={{ visibility: shown ? "visible" : "hidden" }}
              >
                <Page
                  pageNumber={n}
                  width={width}
                  devicePixelRatio={dpr}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={null}
                  onRenderSuccess={() => pageDone(n)}
                  onRenderError={fallBack}
                />
                <RowOutlines rows={byPage.get(n)} setOutline={setOutline} />
              </div>
            );
          })}
        </Document>
      ) : null,
    [url, mode, width, numPages, byPage, dpr, onLoad, fallBack, pageDone, setPageBox, setOutline],
  );

  useLayoutEffect(() => {
    pageBoxes.current.forEach((el, n) => {
      const shown = n === page;
      el.style.visibility = shown ? "visible" : "hidden";
      if (shown) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", "true");
    });
  }, [page, doc]);

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <div ref={box} className="ingest-layer relative min-h-40 overflow-hidden bg-surface-1">
        {!url && <PagePlaceholder text="The alert PDF appears here when a run fetches it" />}
        {url && mode === "pdf" && <PdfErrorBoundary onError={fallBack}>{doc}</PdfErrorBoundary>}
        {url && mode === "poster" && posterBase && (
          <div className="relative">
            {Array.from({ length: posterPages }, (_, i) => {
              const n = i + 1;
              return (
                <div
                  key={n}
                  ref={setPageBox(n)}
                  className={n === 1 ? "relative" : "absolute inset-0"}
                  style={{ visibility: n === page ? "visible" : "hidden" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a committed page image, already sized; next/image adds nothing to a static export */}
                  <img
                    src={`${posterBase}-p${n}.png`}
                    alt={`Page ${n} of the alert PDF`}
                    className="block w-full"
                    onLoad={(e) => posterDone(n, e.currentTarget)}
                  />
                  <RowOutlines rows={byPage.get(n)} setOutline={setOutline} />
                </div>
              );
            })}
          </div>
        )}
        {url && mode === "poster" && !posterBase && <PagePlaceholder text="This page has no pre-rendered copy" />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Page" className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted">Page</span>
          {Array.from({ length: Math.max(shownPages, 0) }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={page === i + 1}
              disabled={locked}
              onClick={() => onPage(i + 1)}
              className={`h-7 min-w-7 rounded-sm border px-1.5 font-mono text-xs disabled:cursor-default ${
                page === i + 1
                  ? "border-primary bg-surface-2 text-ink"
                  : "border-line text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {i + 1}
            </button>
          ))}
          {shownPages > 0 && <span className="ml-1 font-mono text-xs text-muted">/ {shownPages}</span>}
        </div>
        <figcaption className="text-xs text-muted">
          {mode === "poster" ? `Showing a pre-rendered copy of page ${page}` : caption}
        </figcaption>
      </div>
    </figure>
  );
}

/** The faint box over each extracted row, at its Textract bbox (page fractions). */
function RowOutlines({ rows, setOutline }: { rows: IngestRow[] | undefined; setOutline: (row: number) => (el: HTMLElement | null) => void }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {(rows ?? []).map((r) => (
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
