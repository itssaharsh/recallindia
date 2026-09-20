/** Request building for the /api try-it console (spec 3.3). The curl always mirrors the fields. */
import { daysBefore } from "./format";
import type { ApiExample, Endpoint, SourceId, TryItRequest } from "./types";

// /v1/sources is not on this API: the source table comes from /v1/stats, so it is not offered here
export const ENDPOINTS: Endpoint[] = ["/v1/notices", "/v1/notices/{id}", "/v1/stats"];

export interface QueryPart {
  key: string;
  value: string;
}

/** Query parameters in a fixed order (source, since, q, limit, cursor), empty ones dropped. */
export function queryParts(req: TryItRequest): QueryPart[] {
  if (req.endpoint !== "/v1/notices") return [];
  const parts: QueryPart[] = [];
  if (req.source) parts.push({ key: "source", value: req.source });
  if (req.since) parts.push({ key: "since", value: req.since });
  if (req.q.trim()) parts.push({ key: "q", value: req.q.trim() });
  if (req.limit) parts.push({ key: "limit", value: req.limit });
  if (req.cursor) parts.push({ key: "cursor", value: req.cursor });
  return parts;
}

/** Path + URL-encoded query, e.g. "/v1/notices?source=cpsc&since=2026-09-15&limit=5". */
export function requestPath(req: TryItRequest): string {
  if (req.endpoint === "/v1/notices/{id}") return `/v1/notices/${encodeURIComponent(req.id.trim())}`;
  const qs = queryParts(req)
    .map((p) => `${p.key}=${encodeURIComponent(p.value)}`)
    .join("&");
  return qs ? `${req.endpoint}?${qs}` : req.endpoint;
}

/** The exact command the Copy button copies. */
export const buildCurl = (baseUrl: string, req: TryItRequest): string => `curl "${baseUrl}${requestPath(req)}"`;

/** "1 to 100" when the limit is out of range, else null. */
export function limitError(limit: string): string | null {
  if (!limit) return null;
  const n = Number(limit);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? null : "1 to 100";
}

export const emptyRequest = (endpoint: Endpoint = "/v1/notices"): TryItRequest => ({ endpoint, source: "", since: "", q: "", limit: "5", id: "" });

/** The three example chips. "CPSC this week" runs on load. */
export function apiExamples(now: string): ApiExample[] {
  const r = (source: SourceId | "", patch: Partial<TryItRequest>): TryItRequest => ({ ...emptyRequest(), source, ...patch });
  return [
    { key: "cpsc-week", label: "CPSC this week", request: r("cpsc", { since: daysBefore(now, 5) }) },
    { key: "paracetamol", label: "paracetamol", request: r("cdsco_nsq", { q: "paracetamol" }) },
    { key: "tiguan", label: "Tiguan", request: r("nhtsa", { q: "tiguan" }) },
  ];
}

/** Notice keys first in the Pretty view, in reading order; the rest follow in response order. */
export const NOTICE_KEY_ORDER = [
  "notice_id", "source", "published_at", "product", "brand", "hazard_or_failed_test", "remedy",
  "batches", "model", "vehicles", "row_ref", "url", "first_seen_at",
];
