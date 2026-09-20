/**
 * A number whose digits align but whose separators do not widen.
 *
 * Schibsted Grotesk's tabular set also widens "," and ".", so `font-variant-numeric: tabular-nums`
 * on a whole string renders "4 ,868". Only the digit runs get the feature; the separators stay
 * proportional, which is what makes a ticking counter hold its width without the gaps.
 */
export function Num({ value, className }: { value: string | number; className?: string }) {
  const parts = String(value).split(/(\d+)/).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        /^\d+$/.test(part) ? (
          <span key={i} className="tnum">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
