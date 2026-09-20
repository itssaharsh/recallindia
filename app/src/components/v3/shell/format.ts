/** Formatting helpers. Every number on screen comes from data; these only format it. */

const countFmt = new Intl.NumberFormat("en-IN");
/** 4868 → "4,868" (Indian grouping above 99,999: 1,00,000). */
export function formatCount(n: number): string {
  return countFmt.format(n);
}

const istTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
/** ISO → "14:52" in IST (source health, "as of HH:MM"). */
export function formatIstTime(iso: string): string {
  return istTime.format(new Date(iso));
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
/** ISO → "17 Sep 2026". */
export function formatDate(iso: string): string {
  return dayFmt.format(new Date(iso));
}

/** Whole days from `fromIso` to `toIso` ("sold 11 days after the notice"). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/** Source ids → display labels (the API also returns `label`; this is the fallback). */
export const SOURCE_LABEL = { cdsco_nsq: "CDSCO", cpsc: "CPSC", nhtsa: "NHTSA", openfda: "openFDA" } as const;

/**
 * CDSCO's raw reason → the failed test, e.g.
 * "The sample does not conforms to the I.P. with respect to Dissolution Test." → "Dissolution Test".
 */
export function cdscoFailedTest(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const m = /with respect to (.+?)\.?\s*$/i.exec(raw);
  return (m ? m[1] : raw).trim();
}
