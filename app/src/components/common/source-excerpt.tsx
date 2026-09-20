/**
 * The notice's own words on --paper: the regulator's record, printed. The quoted sentence the
 * verifier matched is highlighted in the evidence colour, verbatim (the backend guarantees it is
 * a substring of raw_excerpt; whitespace is compared collapsed, as the verifier does).
 */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function highlight(paragraph: string, quote: string): React.ReactNode {
  const text = squash(paragraph);
  const q = squash(quote);
  const at = q ? text.indexOf(q) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-mark px-0.5 text-ink [box-decoration-break:clone]">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

export function SourceExcerpt({
  excerpt,
  quote,
  caption,
  compact = false,
  onDanger = false,
}: {
  excerpt: string;
  quote?: string | null;
  caption?: React.ReactNode;
  /** the excerpt keeps its paper panel on the red alert face; only the caption changes */
  onDanger?: boolean;
  /** a card shows only the matched paragraph (in full: evidence is never clipped); the sheet
   *  shows every paragraph */
  compact?: boolean;
}) {
  let paragraphs = excerpt.split(/\n+/).filter((p) => p.trim());
  if (compact && quote) {
    const hit = paragraphs.find((p) => squash(p).includes(squash(quote)));
    paragraphs = hit ? [hit] : paragraphs.slice(0, 1);
  }
  return (
    <figure>
      <blockquote className="space-y-2 bg-surface-1 px-3.5 py-3 text-[13px] leading-relaxed text-ink">
        {paragraphs.map((p, i) => (
          <p key={i}>
            {quote ? highlight(p, quote) : squash(p)}
          </p>
        ))}
      </blockquote>
      {caption && (
        <figcaption className={`mt-1.5 text-xs ${onDanger ? "text-accent-ink/90" : "text-ink-muted"}`}>{caption}</figcaption>
      )}
    </figure>
  );
}
