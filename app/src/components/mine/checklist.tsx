import type { CheckStep, Item, StepName, StepState } from "@/lib/types";

// ○ pending · ◐ running · ● done (R25: every planned step visible, with its real state).
export const GLYPH: Record<StepState, string> = { pending: "○", running: "◐", done: "●", failed: "●", skipped: "○" };
export const TONE: Record<StepState, string> = {
  pending: "text-muted",
  running: "text-primary-strong",
  done: "text-text",
  failed: "text-alert",
  skipped: "text-muted line-through decoration-line",
};
export const STATE_WORD: Record<StepState, string> = {
  pending: "to do",
  running: "in progress",
  done: "done",
  failed: "failed",
  skipped: "skipped",
};

const identifierOf = (item: Item) =>
  item.batch ? `batch ${item.batch}` : item.serial ? `serial ${item.serial}` : item.year ? `model year ${item.year}` : null;

const clip = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "Batch PEP5001 is on the notice's list (PEP5001)" / "Model year 2022 is within 2022–2023". */
function rangeCopy(s: Record<string, unknown>, item: Item, ident: string | null): string {
  const yours = String(s.yours || "");
  const listed = clip(String(s.listed || ""));
  const inside = s.inside === true ? true : s.inside === false ? false : null;
  if (item.kind === "vehicle" || s.kind === "vehicle_year") {
    return inside === null ? `No model years listed to compare ${yours || "yours"} with` : `Model year ${yours} is ${inside ? "within" : "outside"} ${listed}`;
  }
  const what = item.batch ? "Batch" : item.serial ? "Serial" : "Your unit";
  if (inside === null) return `${ident || "Your unit"}: the notice lists nothing to compare with`;
  return `${what} ${yours} is ${inside ? "on" : "not on"} the notice's list (${listed})`;
}

/** Microcopy = action + the specific thing + the rule (R25), filled in from real step results. */
function copy(step: CheckStep, item: Item, sources: number): string {
  const s = (step.summary ?? {}) as Record<string, unknown>;
  const who = item.brand || item.make || item.name;
  const ident = identifierOf(item);
  const done = step.state === "done";
  switch (step.name as StepName) {
    case "Candidates":
      return done
        ? `Found ${Number(s.count ?? 0)} notice${Number(s.count) === 1 ? "" : "s"} naming ${who} in ${Number(s.sources ?? sources)} sources`
        : `Searching ${sources} sources for notices naming ${who}`;
    case "Verify":
      if (step.state === "skipped") return "No notice to read: nothing names this item";
      return done
        ? `Read each notice's own text${s.verifier ? ` · ${s.verifier}` : ""}`
        : `Reading each notice's text for ${item.name}`;
    case "RangeCheck":
      if (step.state === "skipped") return "No listed identifier to compare";
      if (done && s.listed !== undefined) return rangeCopy(s, item, ident);
      return ident ? `Comparing ${ident} with what each notice lists` : "Looking for a batch, serial or year to compare";
    case "Decide":
      return done && s.decision
        ? `Decision: ${String(s.decision)} (alert only when named and listed)`
        : "Deciding: alert only when the notice names it and lists your unit";
    case "Notify":
      return done ? "Recorded the result on this card" : "Recording the result";
  }
}

export function Checklist({ steps, item, sources }: { steps: CheckStep[]; item: Item; sources: number }) {
  return (
    <ol className="m-0 list-none space-y-1.5 p-0" aria-label={`Checking ${item.name}`}>
      {steps.map((step) => (
        <li key={step.name} className="flex items-start gap-2.5 text-[13px] leading-snug">
          <span aria-hidden className={`w-3 shrink-0 font-mono ${TONE[step.state]}`}>
            {GLYPH[step.state]}
          </span>
          <span className={step.state === "done" ? "text-text" : step.state === "failed" ? "text-alert" : "text-muted"}>
            {copy(step, item, sources)}
            <span className="sr-only"> ({STATE_WORD[step.state]})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export const PLANNED_STEPS: CheckStep[] = (["Candidates", "Verify", "RangeCheck", "Decide", "Notify"] as StepName[]).map(
  (name, i) => ({ name, state: i === 0 ? "running" : "pending" }),
);
