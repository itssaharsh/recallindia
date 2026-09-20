/**
 * NoticeQuote (spec/mine.md §2.9): the notice's own words, exactly as published, with one phrase marked.
 * Matches the quote panel in mockups/mine-1536.png and mine-390.png.
 */
import * as React from "react";
import { cn } from "../ui";
import { splitHighlight, SOURCE_LABEL } from "./derive";
import type { NoticeView } from "./types";

export interface NoticeQuoteProps {
  notice: NoticeView;
  className?: string;
}

/** The text a card quotes: CDSCO `reason`, otherwise `summary`. */
export function quoteText(n: NoticeView): string {
  return (n.source === "cdsco_nsq" ? n.reason : n.summary) ?? n.reason ?? n.summary ?? n.title;
}

function Cite({ n }: { n: NoticeView }) {
  switch (n.source) {
    case "cdsco_nsq":
      return (
        <>
          {n.lab}
          {n.lab_type ? ` (${n.lab_type})` : ""} · CDSCO <span className="whitespace-nowrap">{n.month}</span> alert, row {n.row}, as published
        </>
      );
    case "nhtsa":
      return (
        <>
          NHTSA recall {n.campaign ?? n.notice_id}, as published
          {n.model_years ? (
            <>
              {" "}· listed model years {n.model_years[0]}–{n.model_years[1]}
            </>
          ) : null}
        </>
      );
    default:
      return (
        <>
          {SOURCE_LABEL[n.source]} recall {n.source === "cpsc" ? (n.number ?? n.notice_id) : (n.recall_number ?? n.notice_id)}, as published
        </>
      );
  }
}

export function NoticeQuote({ notice, className }: NoticeQuoteProps) {
  const [before, mark, after] = splitHighlight(quoteText(notice), notice.source);
  return (
    <blockquote
      className={cn(
        "relative m-0 rounded-[10px] border border-quote-line bg-quote-bg py-3.5 pr-4 pl-11",
        "font-sans text-[15px]/[1.45] font-medium text-ink md:text-[16px]/[1.45]",
        className,
      )}
    >
      <span aria-hidden className="absolute top-1 left-3 font-display text-[40px]/none font-extrabold text-danger">
        {"“"}
      </span>
      {before}
      {mark ? <mark className="rounded-[3px] bg-quote-mark px-0.5 text-ink">{mark}</mark> : null}
      {after}
      <cite className="mt-1.5 block text-[13px]/[1.4] font-normal not-italic text-ink-muted">
        <Cite n={notice} />
      </cite>
    </blockquote>
  );
}
