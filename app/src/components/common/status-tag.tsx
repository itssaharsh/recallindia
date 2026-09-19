const TONE = {
  alert: "text-alert",
  hold: "text-hold",
  dismissed: "text-hold",
  clear: "text-clear",
  unchecked: "text-muted",
  checking: "text-primary-strong",
} as const;

export type Tone = keyof typeof TONE;

/** Mono caps status word, top-right of a card: the yes/no answer before any detail. */
export function StatusTag({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`font-mono text-[11px] font-medium tracking-[0.08em] uppercase ${TONE[tone]}`}>{label}</span>;
}
