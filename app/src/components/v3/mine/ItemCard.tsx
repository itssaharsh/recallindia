"use client";
/**
 * ItemCard v3 (spec/mine.md §2.6): one component, six faces, and the flip between them.
 *
 * Faces and the mockup each one matches:
 * - alert      → mine-1536.png row 1 (Paracetamol FT5427 with RangeBar `dates`; Jeep Compass 2022 with RangeBar `years`)
 * - near-miss  → mine-full-1536.png row 2 left (FT5428 vs FT5427, 6th character underlined)
 * - checking   → mine-full-1536.png row 2 right (Maruti Suzuki Swift, "Checking · 2 of 4", 62%)
 * - clear      → mine-full-1536.png clear grid (11 compact cards)
 * - needs-you  → not mocked; built from the spec (warning band, same chip stack as near-miss)
 * - unchecked  → not mocked; the clear anatomy with "Not checked yet" and "Check now"
 *
 * The flip: when `face` changes, the card turns 0 → 90° on Y (160 ms, ease-in), swaps to the new face at 90°
 * (calling `onFaceShown` so the strip, legend and headline update in the same frame), then −90 → 0° on a
 * 380/32 spring. Reduced motion: the old face fades out and the new one fades in, 150 ms each.
 */
import * as React from "react";
import { motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Ellipsis } from "lucide-react";
import { Button, Card, Chip, FoilChip, cn } from "../ui";
import {
  alertMeta,
  checkProgress,
  diffIndices,
  displayName,
  fmtDate,
  fmtTime,
  KIND_LABEL,
  runningCopy,
  SOURCE_LABEL,
  sourceLine,
  sourceRows,
} from "./derive";
import { AlertGlyph, CategoryMark, ItemIllustration, Spinner } from "./illustrations";
import { flipOut, springFlip, FLIP } from "./motion";
import { NoticeQuote } from "./NoticeQuote";
import { RangeBar } from "./RangeBar";
import type { CheckStatus, Face, HouseholdItem, HouseholdMode, NoticeView } from "./types";

export interface ItemCardActions {
  /** Default: `/case/?id={case_id}` */
  caseHref?: (caseId: string) => string;
  /** Default: `/feed?id={notice_id}` */
  noticeHref?: (noticeId: string) => string;
  onOpenCase?: (caseId: string) => void;
  /** Medicine alert without a purchase date: "Add date". */
  onAddDate?: (itemId: string) => void;
  /** needs-you: "Not on the notice" (dismiss → near-miss). */
  onDismiss?: (itemId: string) => void;
  /** needs-you: "Fix the batch" (opens the sheet in edit mode with Batch focused). */
  onFixBatch?: (itemId: string) => void;
  /** unchecked: "Check now" (`POST /items/{id}/check`). */
  onCheckNow?: (itemId: string) => void;
  /** clear, own household: overflow menu. */
  onCheckAgain?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
}

export interface ItemCardProps extends ItemCardActions {
  item: HouseholdItem;
  /** The face the data says. A change triggers the flip. */
  face: Face;
  /** `GET /v1/notices/{item.notice_id}` for alert, needs-you and near-miss faces. */
  notice?: NoticeView | null;
  /** `GET /items/{id}/check-status` while checking. */
  check?: CheckStatus | null;
  /** `/v1/stats` → `sources_count` (4). */
  sourcesCount?: number;
  household?: HouseholdMode;
  /** A lone big card spans 12 columns; its body is capped at 850 px. */
  lone?: boolean;
  /** Draw a 1.2 s focus ring (after "Show it" or a strip pocket click). */
  flash?: boolean;
  /** Called at 90° of a flip (or on the fade swap) with the face now showing. */
  onFaceShown?: (itemId: string, face: Face) => void;
  /** Called when a flip has fully landed. */
  onFlipEnd?: (itemId: string, face: Face) => void;
  /** Shared layout id: pass `item-{id}` so a card added in the sheet flies to its slot on the wall. */
  layoutId?: string;
  /** The Add sheet shows its own "Open case" under the card, so the card's footer button is hidden there. */
  hideCaseButton?: boolean;
  className?: string;
}

export const cardDomId = (itemId: string) => `item-${itemId}`;

/* ------------------------------------------------------------- shared bits */

function CatLabel({ item }: { item: HouseholdItem }) {
  return (
    <div className="flex items-center gap-[7px] font-sans text-[12px]/none font-semibold tracking-[0.04em] text-ink-muted uppercase">
      <CategoryMark kind={item.kind} />
      {KIND_LABEL[item.kind]}
    </div>
  );
}

const titleBig = "m-0 mt-1.5 font-display text-[20px]/[1.2] font-bold tracking-[-0.02em] text-ink md:mt-2 md:text-[22px]/[1.2]";
const metaCls = "m-0 mt-1 font-sans text-[14px]/[1.45] text-ink-muted";
const capsCls = "font-sans text-[11px]/none font-semibold tracking-[0.06em] text-ink-muted uppercase";

function ChipStack({ yours, listed }: { yours: string; listed: string }) {
  const d = diffIndices(yours, listed);
  return (
    <div className="grid grid-cols-[auto_auto] items-center justify-start gap-x-3 gap-y-2 rounded-[12px] bg-surface-2 px-4 py-3.5">
      <span className={capsCls}>Yours</span>
      <FoilChip code={yours} diff={d.a} className="justify-self-start" />
      <span className={capsCls}>Listed</span>
      <FoilChip code={listed} diff={d.b} className="justify-self-start" />
    </div>
  );
}

function apart(k: number) {
  return k === 1 ? "One character apart." : `${k} characters apart.`;
}

function noticeRefText(n: NoticeView | null | undefined): React.ReactNode {
  if (!n) return "the notice";
  if (n.source === "cdsco_nsq")
    return (
      <>
        CDSCO <span className="whitespace-nowrap">{n.month}</span> alert, row {n.row}
      </>
    );
  return sourceLine(n).main;
}

/* ------------------------------------------------------------------ alert */

interface FaceProps extends ItemCardActions {
  item: HouseholdItem;
  notice?: NoticeView | null;
  check?: CheckStatus | null;
  sourcesCount: number;
  household: HouseholdMode;
  lone: boolean;
  domId: string;
  titleId: string;
  flash: boolean;
  justFlipped: boolean;
  hideCaseButton?: boolean;
}

const flashCls = (on: boolean) => on && "outline-2 outline-offset-2 outline-cobalt";

function AlertFace(p: FaceProps) {
  const { item, notice } = p;
  const line = notice ? sourceLine(notice) : { main: "On a notice", detail: null };
  const isMed = item.kind === "medicine";
  const caseHref = item.case_id ? (p.caseHref ?? ((id: string) => `/case/?id=${encodeURIComponent(id)}`))(item.case_id) : undefined;
  const cap = p.lone ? "md:max-w-[850px]" : undefined;

  let footLeft: React.ReactNode = null;
  if (isMed && item.purchase_date && notice?.published_at) {
    footLeft = <RangeBar variant="dates" published={notice.published_at} bought={item.purchase_date} animateIn={p.justFlipped} />;
  } else if (isMed) {
    footLeft = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px]/[1.4] text-ink-muted">Add the date you bought it to see if it was sold after the notice.</span>
        <Button variant="ghost" size="sm" onClick={() => p.onAddDate?.(item.item_id)}>
          Add date
        </Button>
      </div>
    );
  } else if (item.kind === "vehicle" && notice?.source === "nhtsa") {
    footLeft = <span className="text-[14px]/[1.4] text-ink-muted">NHTSA covers US vehicles, so confirm with your dealer using the VIN.</span>;
  }

  return (
    <Card
      as="article"
      id={p.domId}
      tabIndex={-1}
      aria-labelledby={p.titleId}
      className={cn(
        "flex h-full flex-col overflow-hidden border-[rgb(179_18_30/0.28)]! shadow-alert!",
        flashCls(p.flash),
      )}
    >
      <header className="flex min-h-12 flex-wrap items-center gap-x-2.5 gap-y-1.5 bg-danger px-4 py-2.5 text-white md:h-12 md:flex-nowrap md:gap-3 md:px-5 md:py-0">
        <span className="inline-flex h-[26px] flex-none items-center gap-[7px] rounded-pill bg-white pr-2.5 pl-2 font-sans text-[12px]/none font-bold tracking-[0.04em] text-danger uppercase">
          <AlertGlyph className="size-3.5" />
          On a notice
        </span>
        <span className="order-3 basis-full font-sans text-[15px]/[1.35] font-semibold md:order-none md:basis-auto md:leading-[1.2]">
          {line.main}
          {line.detail ? (
            <>
              <span className="hidden md:inline"> · </span>
              <span className="block font-medium text-band-muted-2 md:inline md:font-semibold md:text-white">{line.detail}</span>
            </>
          ) : null}
        </span>
        {notice?.published_at ? (
          <span className="ml-auto font-sans text-[12px]/none font-medium whitespace-nowrap text-band-muted md:text-[13px]/none">
            Published <time dateTime={notice.published_at}>{fmtDate(notice.published_at)}</time>
          </span>
        ) : null}
      </header>

      <div className={cn("flex gap-3.5 px-4 pt-4 md:gap-5 md:px-5 md:pt-[18px]", cap)}>
        <ItemIllustration kind={item.kind} name={item.name} danger redPocket={isMed} className="size-[76px] md:size-28" />
        <div className="min-w-0 flex-1">
          <CatLabel item={item} />
          <h3 id={p.titleId} className="m-0 mt-1.5 font-display text-[20px]/[1.2] font-bold tracking-[-0.02em] text-ink md:mt-2 md:text-[26px]/[1.2]">
            {displayName(item)}
          </h3>
          <p className={metaCls}>
            {isMed ? (
              <>
                {item.brand}
                {item.purchase_date ? (
                  <>
                    {" "}· <span className="whitespace-nowrap">bought {fmtDate(item.purchase_date)}</span>
                  </>
                ) : null}
              </>
            ) : (
              alertMeta(item)
            )}
          </p>
          {isMed && item.batch ? (
            <div className="mt-3.5 flex flex-wrap items-end gap-2 md:gap-3">
              <div className="flex flex-col gap-[5px]">
                <span className={capsCls}>Yours</span>
                <FoilChip code={item.batch} />
              </div>
              <span aria-hidden className="w-3.5 text-center font-display text-[22px]/[34px] font-bold text-danger">
                =
              </span>
              <div className="flex flex-col gap-[5px]">
                <span className={capsCls}>Listed</span>
                <FoilChip code={notice?.batch ?? item.batch} />
              </div>
              <span className="hidden h-[34px] items-center gap-1.5 rounded-pill bg-danger-soft px-3 font-sans text-[13px]/none font-semibold text-danger md:inline-flex">
                <Check className="size-4" strokeWidth={2.8} aria-hidden />
                Same batch
              </span>
            </div>
          ) : null}
          {item.kind === "vehicle" && item.year && notice?.model_years ? (
            <RangeBar variant="years" listed={notice.model_years} yours={item.year} animateIn={p.justFlipped} />
          ) : null}
        </div>
      </div>

      {notice ? <NoticeQuote notice={notice} className={cn("mx-4 mt-3.5 md:mx-5 md:mt-4", cap)} /> : null}

      <footer className={cn("mt-auto flex flex-wrap items-center gap-4 px-4 pt-3.5 pb-4 md:flex-nowrap md:px-5 md:pt-4 md:pb-[18px]", cap)}>
        {footLeft}
        {item.case_id && !p.hideCaseButton ? (
          <Button
            variant="danger"
            href={caseHref!}
            onClick={p.onOpenCase ? (e: React.MouseEvent) => (e.preventDefault(), p.onOpenCase!(item.case_id!)) : undefined}
            className="w-full md:ml-auto md:w-auto"
          >
            Open case
            <ArrowRight className="size-[18px]" strokeWidth={2.2} aria-hidden />
          </Button>
        ) : null}
      </footer>
    </Card>
  );
}

/* -------------------------------------------------------------- near-miss */

function NearMissFace(p: FaceProps) {
  const { item, notice } = p;
  const yours = item.batch ?? "";
  const listed = notice?.batch ?? "";
  const k = diffIndices(yours, listed).k;
  const noticeHref = item.notice_id ? (p.noticeHref ?? ((id: string) => `/feed/?id=${encodeURIComponent(id)}`))(item.notice_id) : undefined;
  return (
    <Card as="article" id={p.domId} tabIndex={-1} aria-labelledby={p.titleId} className={cn("flex h-full flex-col", flashCls(p.flash))}>
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-[18px] gap-y-3 p-4 md:grid-cols-[auto_1fr_auto] md:p-5">
        <ItemIllustration kind={item.kind} name={item.name} className="size-16 md:size-[88px]" />
        <div className="min-w-0">
          <CatLabel item={item} />
          <h3 id={p.titleId} className={titleBig}>
            {displayName(item)}
          </h3>
          <p className={metaCls}>{item.brand}</p>
        </div>
        <Chip tone="info" className="col-span-full justify-self-start md:col-span-1">
          Near-miss · dismissed
        </Chip>
      </div>
      <div className="grid flex-1 content-center items-center gap-x-7 gap-y-[18px] px-4 pb-4 md:grid-cols-[auto_1fr] md:px-5 md:pb-5">
        {yours && listed ? <ChipStack yours={yours} listed={listed} /> : null}
        <div>
          <p className="m-0 font-sans text-[15px]/[1.5] text-ink-muted">
            <b className="font-semibold text-ink">{apart(k)}</b> Same medicine and maker as {noticeRefText(notice)}, different batch. Dismissed.
          </p>
          {noticeHref ? (
            <a
              href={noticeHref}
              className="mt-2.5 inline-flex h-11 items-center gap-1.5 rounded-pill font-sans text-[14px]/none font-semibold text-cobalt hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt"
            >
              See the notice
              <ArrowRight className="size-4" strokeWidth={2.2} aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- needs-you */

function NeedsYouFace(p: FaceProps) {
  const { item, notice } = p;
  const yours = item.batch ?? "";
  const listed = notice?.batch ?? "";
  const k = diffIndices(yours, listed).k;
  return (
    <Card as="article" id={p.domId} tabIndex={-1} aria-labelledby={p.titleId} className={cn("flex h-full flex-col overflow-hidden", flashCls(p.flash))}>
      <div className="flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1 bg-warning-soft px-4 py-2 md:px-5">
        <Chip tone="hold" className="bg-surface-1!">
          Needs you
        </Chip>
        <span className="font-sans text-[14px]/[1.3] font-semibold text-warning">Close to {noticeRefText(notice)}</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-[18px] p-4 md:p-5">
        <ItemIllustration kind={item.kind} name={item.name} className="size-16 md:size-[88px]" />
        <div className="min-w-0">
          <CatLabel item={item} />
          <h3 id={p.titleId} className={titleBig}>
            {displayName(item)}
          </h3>
          <p className={metaCls}>{item.brand}</p>
        </div>
      </div>
      <div className="grid flex-1 content-center items-center gap-x-7 gap-y-4 px-4 pb-4 md:grid-cols-[auto_1fr] md:px-5 md:pb-5">
        {yours && listed ? <ChipStack yours={yours} listed={listed} /> : null}
        <div>
          <p className="m-0 font-sans text-[15px]/[1.5] text-ink-muted">
            Same medicine and maker, {k === 1 ? "one character" : `${k} characters`} apart. Is <b className="font-semibold text-ink">{yours}</b> the batch printed on your strip?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => p.onDismiss?.(item.item_id)}>
              Not on the notice
            </Button>
            <Button variant="ghost" onClick={() => p.onFixBatch?.(item.item_id)}>
              Fix the batch
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- checking */

function CheckingFace(p: FaceProps) {
  const { item, check } = p;
  const rows = sourceRows(check);
  const alertAt = rows.findIndex((r) => r.state === "done" && r.result === "match");
  const { done, fraction } = checkProgress(rows);
  return (
    <Card as="article" id={p.domId} tabIndex={-1} aria-labelledby={p.titleId} aria-busy className={cn("flex h-full flex-col", flashCls(p.flash))}>
      <div className="flex flex-wrap items-start gap-4 px-4 pt-4 md:flex-nowrap md:px-5 md:pt-5">
        <ItemIllustration kind={item.kind} name={item.name} className="size-[72px]" />
        <div className="min-w-0">
          <CatLabel item={item} />
          <h3 id={p.titleId} className={titleBig}>
            {displayName(item)}
          </h3>
        </div>
        <span className="inline-flex h-7 flex-none items-center gap-2 rounded-pill bg-cobalt-soft pr-3 pl-2 font-sans text-[13px]/none font-semibold whitespace-nowrap text-cobalt md:ml-auto">
          <Spinner />
          Checking · {done} of {p.sourcesCount}
        </span>
      </div>
      <ul className="mx-4 mt-3 mb-0 list-none p-0 md:mx-5 md:mt-4" aria-label={`Checking ${displayName(item)}`}>
        {rows.map((r, i) => {
          const stopped = alertAt >= 0 && i > alertAt;
          const state = stopped ? "waiting" : r.state;
          const matched = r.state === "done" && r.result === "match";
          return (
            <li
              key={r.source}
              className={cn(
                "grid h-[38px] grid-cols-[24px_1fr_auto] items-center gap-2.5 border-t border-line font-sans text-[14px]/none font-medium first:border-t-0",
                state === "running" && "text-cobalt",
                state === "waiting" && "text-ink-muted",
              )}
            >
              {matched ? (
                <span aria-hidden className="grid size-5 place-items-center rounded-full bg-danger text-[12px] font-bold text-white">
                  !
                </span>
              ) : state === "done" ? (
                <span aria-hidden className="grid size-5 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-[13px]" strokeWidth={2.8} />
                </span>
              ) : state === "running" ? (
                <Spinner className="ml-[3px]" />
              ) : (
                <span aria-hidden className="size-5 rounded-full border-[1.5px] border-dashed border-line-strong" />
              )}
              {SOURCE_LABEL[r.source]}
              <span
                className={cn(
                  "text-[13px]/none",
                  matched ? "font-semibold text-danger" : state === "running" ? "font-medium text-cobalt" : "font-normal text-ink-muted",
                )}
              >
                {matched ? "On a notice" : state === "done" ? "No match" : state === "running" ? runningCopy(item.kind) : "Waiting"}
              </span>
            </li>
          );
        })}
      </ul>
      <div
        role="progressbar"
        aria-label="Sources checked"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        className="mx-4 mt-2.5 mb-4 h-1.5 overflow-hidden rounded-[3px] bg-surface-2 md:mx-5 md:mt-3 md:mb-5"
      >
        <motion.i className="block h-full rounded-[3px] bg-cobalt" initial={false} animate={{ width: `${fraction * 100}%` }} transition={{ duration: 0.4, ease: [0.65, 0, 0.35, 1] }} />
      </div>
    </Card>
  );
}

/* ---------------------------------------------------- clear and unchecked */

function OverflowMenu({ name, onCheckAgain, onRemove }: { name: string; onCheckAgain?: () => void; onRemove?: () => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const item = "flex h-11 w-full items-center rounded-xs px-3 text-left font-sans text-[14px] font-medium text-ink hover:bg-surface-2 focus-visible:bg-surface-2";
  return (
    <div
      ref={ref}
      className="absolute top-1.5 right-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      <button
        type="button"
        aria-label={`More for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-11 place-items-center rounded-pill text-ink-muted hover:bg-surface-2 hover:text-ink"
      >
        <Ellipsis className="size-5" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute top-12 right-0 z-10 w-56 rounded-md border border-line bg-surface-1 p-1 shadow-2">
          <button role="menuitem" type="button" className={item} onClick={() => (setOpen(false), onCheckAgain?.())}>
            Check again
          </button>
          <button role="menuitem" type="button" className={item} onClick={() => (setOpen(false), onRemove?.())}>
            Remove from household
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CompactFace(p: FaceProps & { face: "clear" | "unchecked" }) {
  const { item } = p;
  return (
    <Card
      as="article"
      id={p.domId}
      tabIndex={-1}
      aria-labelledby={p.titleId}
      className={cn("group relative flex h-full min-h-[84px] items-center gap-3.5 p-3 md:min-h-24 md:p-3.5", flashCls(p.flash))}
    >
      <ItemIllustration kind={item.kind} name={item.name} className="size-14 md:size-16" />
      <div className="min-w-0 flex-1">
        <h3 id={p.titleId} className="m-0 line-clamp-2 font-sans text-[15px]/[1.3] font-semibold tracking-normal text-wrap text-ink">
          {displayName(item)}
        </h3>
        {item.brand ? <div className="mt-0.5 font-sans text-[13px]/[1.3] text-ink-muted">{item.brand}</div> : null}
        {p.face === "clear" ? (
          <div className="mt-1.5 flex items-center gap-1.5 font-sans text-[13px]/[1.2] font-medium text-success">
            <Check className="size-3.5 flex-none" strokeWidth={2.8} aria-hidden />
            <span>
              No match in {p.sourcesCount} sources as of <time dateTime={item.last_checked_at ?? undefined}>{fmtTime(item.last_checked_at)}</time>
            </span>
          </div>
        ) : (
          <div className="mt-1.5 font-sans text-[13px]/[1.2] font-medium text-ink-muted">Not checked yet</div>
        )}
      </div>
      {p.face === "unchecked" ? (
        <Button variant="ghost" className="flex-none" onClick={() => p.onCheckNow?.(item.item_id)}>
          Check now
        </Button>
      ) : p.household === "own" ? (
        <OverflowMenu name={displayName(item)} onCheckAgain={() => p.onCheckAgain?.(item.item_id)} onRemove={() => p.onRemove?.(item.item_id)} />
      ) : null}
    </Card>
  );
}

/* --------------------------------------------------------------- the card */

function FaceView({ face, ...p }: FaceProps & { face: Face }) {
  switch (face) {
    case "alert":
      return <AlertFace {...p} />;
    case "near-miss":
      return <NearMissFace {...p} />;
    case "needs-you":
      return <NeedsYouFace {...p} />;
    case "checking":
      return <CheckingFace {...p} />;
    case "clear":
    case "unchecked":
      return <CompactFace {...p} face={face} />;
  }
}

export function ItemCard({
  item,
  face,
  notice,
  check,
  sourcesCount = 4,
  household = "demo",
  lone = false,
  flash = false,
  onFaceShown,
  onFlipEnd,
  layoutId,
  hideCaseButton = false,
  className,
  ...actions
}: ItemCardProps) {
  const reduce = useReducedMotion();
  const controls = useAnimationControls();
  const [shown, setShown] = React.useState<Face>(face);
  const [justFlipped, setJustFlipped] = React.useState(false);
  const titleId = React.useId();

  React.useEffect(() => {
    if (face === shown) return;
    let cancelled = false;
    (async () => {
      if (reduce) {
        await controls.start({ opacity: 0, transition: { duration: FLIP.reducedFade / 1000 } });
        if (cancelled) return;
        setShown(face);
        setJustFlipped(true);
        onFaceShown?.(item.item_id, face);
        await controls.start({ opacity: 1, transition: { duration: FLIP.reducedFade / 1000 } });
      } else {
        await controls.start({ rotateY: 90, transition: flipOut });
        if (cancelled) return;
        setShown(face);
        setJustFlipped(true);
        onFaceShown?.(item.item_id, face);
        controls.set({ rotateY: -90 });
        await controls.start({ rotateY: 0, transition: springFlip });
      }
      if (!cancelled) onFlipEnd?.(item.item_id, face);
    })();
    return () => {
      cancelled = true;
    };
    // `shown` is intentionally not a dependency: the effect answers data changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face]);

  // Outer: layout + layoutId (size change at the swap, the fly from the sheet to the wall).
  // Inner: the rotation only, so the layout projection never mixes its scale correction with rotateY.
  return (
    <motion.div layout layoutId={layoutId} className={cn("h-full", className)}>
      <motion.div animate={controls} style={{ transformPerspective: 1200 }} className="h-full">
        <FaceView
          face={shown}
          item={item}
          notice={notice}
          check={check}
          sourcesCount={sourcesCount}
          household={household}
          lone={lone}
          domId={cardDomId(item.item_id)}
          titleId={titleId}
          flash={flash}
          justFlipped={justFlipped}
          hideCaseButton={hideCaseButton}
          {...actions}
        />
      </motion.div>
    </motion.div>
  );
}
