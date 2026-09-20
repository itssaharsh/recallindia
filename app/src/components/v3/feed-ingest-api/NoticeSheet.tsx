"use client";
import * as React from "react";
import { motion, useDragControls } from "framer-motion";
import { ArrowRight, ExternalLink, Link as LinkIcon, Plus, ScanLine, X } from "lucide-react";
import { Button, cn, FoilChip } from "../ui";
import { cdscoMonth, contentPercent, displayProduct, identifiers, illustrationFor, makerLine, outcome, splitRawRow, type RawRow } from "./derive";
import { fmtDate, fmtDateTime, fmtTime, monthLabel, titleWord } from "./format";
import { DESKTOP, isTyping, useBodyScrollLock, useCopy, useFocusTrap, useMediaQuery } from "./hooks";
import { AlertGlyph } from "./Illustration";
import { EASE_DRAW, EASE_PAGE, springSoft } from "./motion";
import { noticeHref } from "./NoticeRow";
import { CapsLabel, CheckDisc, IconButton, IdChip, ObjectTile, Skeleton, SourceChip } from "./primitives";
import { SOURCES } from "./sources";
import type { HouseholdCheck, HouseholdMatch, Notice } from "./types";

export type NoticeSheetState = "loading" | "ready" | "notfound" | "error";

export interface NoticeSheetProps {
  state: NoticeSheetState;
  /** The clicked row (loading uses it for the header), or GET /v1/notices/{pk} on a deep link. */
  notice: Notice | null;
  /** /mine household check. null → the check row shows a skeleton. */
  household: HouseholdCheck | null;
  /** Set when this notice matches a household thing (variant "match"). */
  match?: HouseholdMatch | null;
  onClose: () => void;
  /** ← / → open the previous / next row without closing. */
  onPrev?: () => void;
  onNext?: () => void;
  onRetry?: () => void;
  /** CDSCO primary: /mine's Add-a-thing sheet with the batch prefilled. */
  scanHref?: string;
  /** Other sources' primary: "Add this to my things". */
  addHref?: string;
  /** Match variant: "Open case →" */
  caseHref?: string;
}

/**
 * The full notice as published, the household answer and the next action (spec 1.7).
 * 580 px right sheet at ≥ lg, bottom sheet at 390. Matches feed-sheet-1536.png.
 * Render inside <AnimatePresence> so the exit (220 ms ease-page) plays.
 */
export function NoticeSheet(p: NoticeSheetProps) {
  const desktop = useMediaQuery(DESKTOP, true);
  const aside = React.useRef<HTMLElement>(null);
  const closeBtn = React.useRef<HTMLButtonElement>(null);
  const drag = useDragControls();
  useFocusTrap(aside, closeBtn);
  useBodyScrollLock(true);
  const n = p.notice;
  const titleId = "notice-sheet-title";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      p.onClose();
    } else if (!isTyping(e) && e.key === "ArrowLeft" && p.onPrev) {
      e.preventDefault();
      p.onPrev();
    } else if (!isTyping(e) && e.key === "ArrowRight" && p.onNext) {
      e.preventDefault();
      p.onNext();
    }
  };

  const hidden = desktop ? { x: "100%" } : { y: "100%" };
  const shown = desktop ? { x: 0 } : { y: 0 };

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-0 z-40 bg-scrim-sheet"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.2 } }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        onClick={p.onClose}
      />
      <motion.aside
        ref={aside}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-surface-1 shadow-sheet",
          "inset-x-0 top-6 bottom-0 rounded-t-lg lg:inset-x-auto lg:top-0 lg:right-0 lg:w-[580px] lg:rounded-t-none lg:rounded-l-lg",
        )}
        initial={{ ...hidden, opacity: 0 }}
        animate={{ ...shown, opacity: 1, transition: { ...springSoft, opacity: { duration: 0.16 } } }}
        exit={{ ...hidden, opacity: 0, transition: { duration: 0.22, ease: EASE_PAGE, opacity: { duration: 0.18, delay: 0.04 } } }}
        drag={desktop ? false : "y"}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.9 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 120 || info.velocity.y > 600) p.onClose();
        }}
      >
        <div className="flex justify-center pt-2 lg:hidden" onPointerDown={(e) => drag.start(e)} style={{ touchAction: "none" }}>
          <span aria-hidden className="h-1 w-9 rounded-pill bg-line-strong/50" />
        </div>
        <TopBar notice={n} onClose={p.onClose} closeRef={closeBtn} />

        <div className="relative flex-1 overflow-y-auto px-4 pt-4 pb-2 [scrollbar-color:var(--color-scroll-thumb)_transparent] [scrollbar-width:thin] lg:px-6">
          {p.state === "notfound" && (
            <Status text="This notice is no longer in the feed." action={<Button variant="secondary" onClick={p.onClose}>Back to the feed</Button>} />
          )}
          {p.state === "error" && <Status text="Couldn't load this notice." action={<Button onClick={p.onRetry}>Try again</Button>} />}
          {(p.state === "ready" || p.state === "loading") && n && (
            <>
              <div className="flex items-center gap-4">
                <ObjectTile name={illustrationFor(n)} source={n.source} size={60} />
                <div className="min-w-0">
                  <h2 id={titleId} className="font-display text-[22px] leading-[1.08] font-extrabold tracking-[-.025em] text-ink lg:text-[25px]">
                    {displayProduct(n)}
                  </h2>
                  <p className="mt-1 text-[14px] leading-[1.35] text-ink-muted">{makerLine(n)}</p>
                </div>
              </div>
              {p.state === "loading" ? <BodySkeleton /> : <Body {...p} notice={n} />}
            </>
          )}
        </div>

        {p.state === "ready" && n && <Footer {...p} notice={n} />}
      </motion.aside>
    </>
  );
}

function TopBar({ notice: n, onClose, closeRef }: { notice: Notice | null; onClose: () => void; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const { copied, copy } = useCopy();
  let where = n?.notice_id ?? "";
  if (n?.source === "cdsco_nsq" && n.row_ref?.row != null) {
    where = n.row_ref.page != null ? `${monthLabel(cdscoMonth(n)).long} alert · page ${n.row_ref.page}, row ${n.row_ref.row}` : `${cdscoMonth(n)} alert · row ${n.row_ref.row}`;
  }
  return (
    <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-line pr-3 pl-4 lg:pl-6">
      {n && <SourceChip source={n.source} />}
      <span className="truncate text-[14px] leading-none font-medium text-ink-muted">{where}</span>
      <span className="flex-1" />
      <span className="relative">
        <IconButton label="Copy link to this notice" onClick={() => n && copy(`${window.location.origin}${noticeHref(n.pk)}`)}>
          <LinkIcon aria-hidden className="size-5" strokeWidth={1.9} />
        </IconButton>
        <span
          role="status"
          className={cn(
            "pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-xs bg-ink px-2 py-1 text-[12px] font-semibold whitespace-nowrap text-white transition-opacity duration-150",
            copied ? "opacity-100" : "opacity-0",
          )}
        >
          {copied ? "Copied" : ""}
        </span>
      </span>
      <IconButton ref={closeRef} label="Close" filled onClick={onClose}>
        <X aria-hidden className="size-5" strokeWidth={2.2} />
      </IconButton>
    </header>
  );
}

function Body(p: NoticeSheetProps & { notice: Notice }) {
  const n = p.notice;
  const o = outcome(n);
  const content = n.source === "cdsco_nsq" ? contentPercent(n.hazard_or_failed_test) : null;
  const raw = splitRawRow(n);
  return (
    <>
      <p className="mt-3 text-[15.5px] leading-[1.45] text-ink">
        {o.kind === "content" && (
          <>
            Batch <IdChip size="inline">{o.batch}</IdChip> <b className="font-semibold">failed a CDSCO quality test</b>: its content of {o.substance} was {o.pct}% of what the
            label claims.
          </>
        )}
        {o.kind === "failed" && (
          <>
            Batch <IdChip size="inline">{o.batch}</IdChip> <b className="font-semibold">failed a CDSCO quality test</b> for {o.failed.replace(/\.$/, "")}.
          </>
        )}
        {o.kind === "hazard" && (
          <>
            <b className="font-semibold">{o.lead}.</b> {o.rest}
          </>
        )}
        {o.kind === "vehicle" && (
          <>
            <b className="font-semibold">NHTSA recall {o.id}</b> for {o.years} {o.make} {o.model}.
          </>
        )}
      </p>

      <HouseholdRow notice={n} household={p.household} match={p.match ?? null} caseHref={p.caseHref} />
      <Facts notice={n} raw={raw} />
      {content && <ContentBar substance={content.substance} pct={content.pct} />}

      <section className="mt-3.5">
        <h3 className="mb-2 font-sans text-[13px] leading-none font-semibold tracking-normal text-ink">As published by {SOURCES[n.source].label}</h3>
        {raw ? <RawRowSnippet notice={n} raw={raw} /> : <RawQuote notice={n} />}
      </section>

      <ol className="mt-[18px] mb-2" aria-label="Timeline">
        <TimelineStep label={`Published by ${SOURCES[n.source].label}`} value={fmtDate(n.published_at)} />
        <TimelineStep label="Read by RecallIndia" value={`${fmtDateTime(n.first_seen_at)} IST`} />
        {p.household && <TimelineStep label="Checked against your things" value={`Today, ${fmtTime(p.household.as_of)}`} now last />}
      </ol>
    </>
  );
}

function HouseholdRow({ notice: n, household, match, caseHref }: { notice: Notice; household: HouseholdCheck | null; match: HouseholdMatch | null; caseHref?: string }) {
  if (!household) return <Skeleton className="mt-3 h-[61px] rounded-md" />;
  if (match) {
    const it = match.item;
    const lead = it.kind === "medicine" ? "This is on your strip." : it.kind === "vehicle" ? "This matches your vehicle." : "This matches something you own.";
    const detail =
      it.kind === "medicine"
        ? [it.name, it.batch && `batch ${it.batch}`, it.purchase_date && `bought ${fmtDate(it.purchase_date)}`]
        : it.kind === "vehicle"
          ? [[it.make, it.model, it.year].filter(Boolean).join(" ") || it.name, "confirm with your dealer using the VIN"]
          : [it.name];
    return (
      <section aria-label="Household check" className="mt-3 flex items-center gap-3 rounded-md bg-danger-soft px-3.5 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-1 text-danger">
          <AlertGlyph className="size-4" />
        </span>
        <p className="min-w-0 flex-1 text-[14px] leading-[1.45] text-ink">
          <b className="font-semibold text-danger">{lead}</b> {detail.filter(Boolean).join(" · ")}
        </p>
        {caseHref && (
          <Button variant="danger" size="sm" href={caseHref}>
            Open case
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        )}
      </section>
    );
  }
  const batch = n.batches[0];
  const byBatch = (n.source === "cdsco_nsq" || n.source === "openfda") && batch;
  return (
    <section aria-label="Household check" className="mt-3 flex items-center gap-3 rounded-md bg-success-soft px-3.5 py-2.5">
      <CheckDisc size={32} className="bg-surface-1 text-success" />
      <p className="text-[14px] leading-[1.45] text-ink">
        <b className="font-semibold text-success">No match in {household.name}</b> as of {fmtTime(household.as_of)}
        {byBatch ? ` · ${household.medicines_checked} medicines checked by batch, none is ${batch}.` : "."}
      </p>
    </section>
  );
}

function Facts({ notice: n, raw }: { notice: Notice; raw: RawRow | null }) {
  type Cell = { label: string; value: React.ReactNode; foil?: boolean };
  const cells: Cell[] = [];
  const big = (v: string) => <b className="font-display text-[20px] leading-[30px] font-bold tracking-[-.01em] text-ink">{v}</b>;
  if (n.source === "cdsco_nsq") {
    if (n.batches[0]) cells.push({ label: "Batch", value: <FoilChip code={n.batches[0]} size="md" />, foil: true });
    cells.push({ label: "Manufactured", value: big(n.mfg_date ?? raw?.mfg ?? "—") });
    cells.push({ label: "Expires", value: big(n.exp_date ?? raw?.exp ?? "—") });
  } else if (n.source === "nhtsa") {
    const v = n.vehicles[0];
    const years = identifiers(n).chips;
    cells.push({ label: "Make", value: big(titleWord(v?.make ?? n.brand ?? "—")) });
    cells.push({ label: "Model", value: big(titleWord(v?.model ?? n.model ?? "—")) });
    cells.push({ label: "Years", value: big(years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : years[0] ?? "—") });
  } else if (n.source === "cpsc") {
    if (n.model) cells.push({ label: "Model", value: big(n.model) });
    if (n.batches.length) cells.push({ label: "Date codes", value: big(n.batches.join(", ")) });
    if (n.units != null) cells.push({ label: "Units", value: big(String(n.units)) });
  } else if (n.batches[0]) {
    cells.push({ label: "Lot", value: <FoilChip code={n.batches[0]} size="md" />, foil: true });
  }
  if (!cells.length) return null;
  return (
    <div
      className="mt-3 grid rounded-md border border-line px-1 py-2.5"
      style={{ gridTemplateColumns: cells.map((c) => (c.foil ? "auto" : "minmax(0,1fr)")).join(" ") }}
    >
      {cells.map((c, i) => (
        <div key={c.label} className={cn("flex min-w-0 flex-col gap-2 px-3 lg:px-4", i > 0 && "border-l border-line")}>
          <CapsLabel>{c.label}</CapsLabel>
          {c.value}
        </div>
      ))}
    </div>
  );
}

/** 0–110 % scale, 2 px ink tick at the label claim (100 %). No acceptance range: the notice gives none. */
function ContentBar({ substance, pct }: { substance: string; pct: number }) {
  const fill = Math.min(pct, 110) / 110;
  const claim = 100 / 110;
  return (
    <div className="mt-3 rounded-md bg-wash px-4 pt-2.5 pb-1.5" role="img" aria-label={`Content of ${substance}: ${pct}% of the label claim`}>
      <div className="flex items-baseline justify-between gap-3 text-[14px] leading-none font-medium text-ink-muted">
        <span>Content of {substance}</span>
        <b className="font-display text-[26px] leading-none font-extrabold tracking-[-.02em] text-ink tabular-nums">{pct}%</b>
      </div>
      <div className="relative mt-2.5 h-3 rounded-pill bg-surface-2">
        <motion.i
          className="absolute inset-y-0 left-0 block rounded-pill bg-cobalt"
          style={{ width: `${fill * 100}%`, originX: 0 }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.36, ease: EASE_DRAW, delay: 0.44 }}
        />
        <span className="absolute -top-[5px] -bottom-[5px] w-0.5 rounded-[2px] bg-ink" style={{ left: `${claim * 100}%` }} />
      </div>
      <div className="relative mt-1.5 h-3.5 text-[12px] leading-none font-medium text-ink-muted">
        <span>0%</span>
        {/* centred on the tick at ≥ lg; right-aligned on phones so it never overflows */}
        <span className="absolute top-0 right-0 font-semibold whitespace-nowrap text-ink lg:hidden">Label claim 100%</span>
        <span className="absolute top-0 hidden -translate-x-1/2 font-semibold whitespace-nowrap text-ink lg:block" style={{ left: `${claim * 100}%` }}>
          Label claim 100%
        </span>
      </div>
    </div>
  );
}

/** The published CDSCO row as a table snippet: columns 44 | 1fr | 92 | 150 so drug and dates stay on one line. */
function RawRowSnippet({ notice: n, raw }: { notice: Notice; raw: RawRow }) {
  const cell = "min-w-0 bg-surface-1 px-2.5 py-1.5";
  const key = "mb-[3px] text-[10px] leading-none font-semibold tracking-[.05em] text-ink-muted uppercase";
  const rowNo = n.row_ref?.row ?? raw.sno?.replace(/\.$/, "");
  let host = "";
  try {
    host = n.url ? new URL(n.url).host.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  const isPdf = n.row_ref?.page != null;
  return (
    <>
      <dl
        aria-label={`Row ${rowNo} as published`}
        className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] gap-px overflow-hidden rounded-sm border border-raw-edge bg-raw-rule text-[12.5px] leading-[1.35] text-raw-ink lg:grid-cols-[44px_minmax(0,1fr)_92px_150px]"
      >
        <div className="row-span-5 grid place-items-center bg-raw-num text-[14px] font-bold text-ink lg:row-span-4">
          <dt className="sr-only">Row</dt>
          <dd>{rowNo}</dd>
        </div>
        <div className={cn(cell, "col-span-2 lg:col-span-1")}>
          <dt className={key}>Drug</dt>
          <dd>{raw.drug}</dd>
        </div>
        <div className={cell}>
          <dt className={key}>Batch</dt>
          <dd className="font-mono">{raw.batch}</dd>
        </div>
        <div className={cell}>
          <dt className={key}>Mfg · Exp</dt>
          <dd>
            {raw.mfg} · {raw.exp}
          </dd>
        </div>
        <div className={cn(cell, "col-span-2 lg:col-span-3")}>
          <dt className={key}>Manufactured by</dt>
          <dd>{raw.manufacturer}</dd>
        </div>
        <div className={cn(cell, "col-span-2 bg-cobalt-wash lg:col-span-3")}>
          <dt className={key}>Result</dt>
          <dd>
            <mark className="bg-transparent font-semibold text-ink shadow-[inset_0_-2px_0_var(--color-cobalt)]">{raw.result}</mark>
          </dd>
        </div>
        {raw.drawnBy != null && (
          <div className={cn(cell, "lg:col-start-2")}>
            <dt className={key}>Drawn by</dt>
            <dd>{raw.drawnBy}</dd>
          </div>
        )}
        <div className={cn(cell, raw.drawnBy != null ? "lg:col-span-2" : "col-span-2 lg:col-span-3")}>
          <dt className={key}>Tested by</dt>
          <dd>{raw.testedBy}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[12.5px] leading-[1.4] text-ink-muted">
        {host || "cdsco.gov.in"} · {isPdf ? `NSQ alert PDF · ${monthLabel(cdscoMonth(n)).long}, page ${n.row_ref?.page}` : `NSQ drugs · ${cdscoMonth(n)}`} · id{" "}
        <span className="font-mono text-[12px] break-all text-ink">{n.notice_id}</span>
      </p>
    </>
  );
}

function RawQuote({ notice: n }: { notice: Notice }) {
  if (!n.raw_excerpt) return <p className="text-[13.5px] text-ink-muted">The source gave no text for this notice.</p>;
  return (
    <blockquote cite={n.url ?? undefined} className="rounded-md bg-wash px-4 py-3 text-[13.5px] leading-[1.5] whitespace-pre-line text-raw-ink">
      {n.raw_excerpt}
    </blockquote>
  );
}

function TimelineStep({ label, value, now = false, last = false }: { label: string; value: string; now?: boolean; last?: boolean }) {
  return (
    <li
      aria-current={now ? "step" : undefined}
      className={cn(
        "relative grid h-[34px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 text-[14px] leading-none text-ink-muted",
        !last && "after:absolute after:top-[22px] after:left-2 after:h-6 after:w-0.5 after:bg-line",
      )}
    >
      <i aria-hidden className={cn("z-[1] size-2.5 justify-self-center rounded-full border-2", now ? "border-cobalt bg-cobalt" : "border-line-strong bg-surface-1")} />
      <span className="truncate">{label}</span>
      <b className="font-semibold text-ink">{value}</b>
    </li>
  );
}

function Footer(p: NoticeSheetProps & { notice: Notice }) {
  const n = p.notice;
  const cdsco = n.source === "cdsco_nsq";
  return (
    <footer className="flex shrink-0 gap-2.5 border-t border-line bg-surface-1 px-4 pt-3.5 pb-[18px] lg:px-6">
      {cdsco ? (
        <Button href={p.scanHref ?? `/mine/?add=scan&batch=${encodeURIComponent(n.batches[0] ?? "")}`} icon={<ScanLine aria-hidden className="size-[18px]" />} className="flex-1">
          Scan a strip for this batch
        </Button>
      ) : (
        <Button href={p.addHref ?? "/mine/?add=1"} icon={<Plus aria-hidden className="size-[18px]" />} className="flex-1">
          Add this to my things
        </Button>
      )}
      {n.url && (
        <Button variant="secondary" href={n.url} target="_blank" rel="noopener noreferrer">
          {SOURCES[n.source].openLabel}
          <ExternalLink aria-hidden className="size-[18px]" />
          <span className="sr-only">(opens in a new tab)</span>
        </Button>
      )}
    </footer>
  );
}

function BodySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the notice" className="mt-3 space-y-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-[61px] w-full rounded-md" />
      <Skeleton className="h-[75px] w-full rounded-md" />
      <Skeleton className="h-[84px] w-full rounded-md" />
      <Skeleton className="h-[180px] w-full rounded-md" />
    </div>
  );
}

function Status({ text, action }: { text: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-[16px] text-ink">{text}</p>
      {action}
    </div>
  );
}
