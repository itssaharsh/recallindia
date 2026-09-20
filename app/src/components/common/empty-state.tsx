import type { LucideIcon } from "lucide-react";

/** Lucide, or one of the two brand glyphs (same 24 grid, same stroke). */
type Glyph = LucideIcon | ((props: { size?: number; className?: string }) => React.ReactElement);

/**
 * Every empty state says three things (R31): what would be here, why it isn't, and the one
 * action that changes that. Nothing else.
 */
export function EmptyState({
  icon: Icon,
  what,
  why,
  action,
  tone = "neutral",
}: {
  icon: Glyph;
  what: string;
  why: React.ReactNode;
  action?: React.ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className="mx-auto flex max-w-lg flex-col items-start gap-3 px-5 py-16">
      <Icon aria-hidden className={`size-8 ${tone === "error" ? "text-danger" : "text-muted"}`} />
      <h2 className="font-display text-xl font-semibold text-ink">{what}</h2>
      <p className="text-sm leading-relaxed text-muted">{why}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
