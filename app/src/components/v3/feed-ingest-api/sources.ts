import type { IllustrationName } from "./Illustration";
import type { SourceId } from "./types";

export interface SourceMeta {
  /** Always this casing (spec §0.1). */
  label: string;
  /** Feed card / tile line */
  coverage: string;
  /** /api SourcesTable line */
  tableCoverage: string;
  /** Default ObjectTile when the product words pick nothing better */
  illustration: IllustrationName;
  /** Source-card illustration (US card uses a stove for CPSC, as mocked) */
  cardIllustration: IllustrationName;
  /** Sheet footer secondary */
  openLabel: string;
}

export const SOURCES: Record<SourceId, SourceMeta> = {
  cdsco_nsq: {
    label: "CDSCO",
    coverage: "India · drug quality alerts (NSQ)",
    tableCoverage: "India · drug quality alerts (NSQ)",
    illustration: "strip",
    cardIllustration: "strip",
    openLabel: "Open on CDSCO",
  },
  cpsc: {
    label: "CPSC",
    coverage: "Consumer products",
    tableCoverage: "US · consumer products",
    illustration: "stove",
    cardIllustration: "stove",
    openLabel: "Open on CPSC",
  },
  openfda: {
    label: "openFDA",
    coverage: "Drugs and medical devices",
    tableCoverage: "US · drugs and medical devices",
    illustration: "bottle",
    cardIllustration: "bottle",
    openLabel: "Open on openFDA",
  },
  nhtsa: {
    label: "NHTSA",
    coverage: "Vehicles",
    tableCoverage: "US · vehicles",
    illustration: "suv",
    cardIllustration: "suv",
    openLabel: "Open on NHTSA",
  },
};

/** Filter pills, mix bar, 390 tiles and the sources table: by count, fixed. */
export const SOURCE_ORDER: SourceId[] = ["cdsco_nsq", "cpsc", "openfda", "nhtsa"];
/** US regulators card rows (spec 1.3.3: fixed order by count). */
export const US_SOURCES: SourceId[] = ["cpsc", "openfda", "nhtsa"];

export const sourceLabel = (id: SourceId): string => SOURCES[id].label;
