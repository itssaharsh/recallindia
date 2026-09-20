// One door to the HTTP API. With ?demo=1 every GET is answered from static JSON under
// /fixtures (recorded from the live API by scripts/gen_ui_fixtures.py through a manifest, so
// the shapes cannot drift); writes are refused in demo mode because there is nothing to write to.

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

// No accounts: one header scopes the wall, its cases and every approval. A missing header is
// the read-only demo household, which is what a first visit (and every demo-mode read) sees.
export const HOUSEHOLD_KEY = "ri.household";
export const DEMO_HOUSEHOLD = "demo";

export function householdId(): string {
  try {
    return localStorage.getItem(HOUSEHOLD_KEY) || DEMO_HOUSEHOLD;
  } catch {
    return DEMO_HOUSEHOLD; // storage blocked: the demo wall still reads
  }
}

export function setHouseholdId(id: string | null): void {
  try {
    if (id && id !== DEMO_HOUSEHOLD) localStorage.setItem(HOUSEHOLD_KEY, id);
    else localStorage.removeItem(HOUSEHOLD_KEY);
  } catch {
    // a browser that refuses storage keeps the demo household for this tab
  }
}

/** The header goes on household routes only, never on the public /v1 polls. */
const HOUSEHOLD_ROUTE = /^\/(items|cases|households|scan)(\/|$|\?)/;

function householdHeaders(path: string): Record<string, string> {
  const id = householdId();
  return HOUSEHOLD_ROUTE.test(path) && id !== DEMO_HOUSEHOLD ? { "x-household": id } : {};
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Canonical query string: fixed key order so the demo manifest key matches the request. */
const QUERY_ORDER = ["source", "since", "q", "limit", "cursor"] as const;
export function query(params: Partial<Record<(typeof QUERY_ORDER)[number], string | number | null | undefined>>): string {
  const parts: string[] = [];
  for (const key of QUERY_ORDER) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "") {
      parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

let manifestPromise: Promise<Record<string, string>> | null = null;
function manifest(): Promise<Record<string, string>> {
  manifestPromise ??= fetch("/fixtures/manifest.json").then((r) => {
    if (!r.ok) throw new ApiError(r.status, "demo data is missing (no /fixtures/manifest.json)");
    return r.json();
  });
  return manifestPromise;
}

async function readJson(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(resp.status, `unexpected response (${resp.status})`);
  }
}

export async function apiGet<T>(path: string, demo: boolean, signal?: AbortSignal): Promise<T> {
  if (demo) {
    const file = (await manifest())[`GET ${path}`];
    if (!file) throw new ApiError(404, `not in the demo data: ${path}`);
    const resp = await fetch(`/fixtures/${file}`, { signal });
    return (await readJson(resp)) as T;
  }
  if (!API_URL) throw new ApiError(0, "NEXT_PUBLIC_API_URL is not set for this build");
  const resp = await fetch(`${API_URL}${path}`, {
    signal,
    cache: "no-store",
    headers: householdHeaders(path),
  });
  const body = (await readJson(resp)) as { error?: string };
  if (!resp.ok) throw new ApiError(resp.status, body?.error ?? `HTTP ${resp.status}`);
  return body as T;
}

export async function apiPost<T>(path: string, body: unknown, demo: boolean): Promise<T> {
  return apiWrite<T>("POST", path, body, demo);
}

export async function apiPatch<T>(path: string, body: unknown, demo: boolean): Promise<T> {
  return apiWrite<T>("PATCH", path, body, demo);
}

async function apiWrite<T>(method: "POST" | "PATCH", path: string, body: unknown, demo: boolean): Promise<T> {
  if (demo) throw new ApiError(403, "Demo data is read-only: adding and checking run on the live API.");
  if (!API_URL) throw new ApiError(0, "NEXT_PUBLIC_API_URL is not set for this build");
  const resp = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...householdHeaders(path) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = (await readJson(resp)) as { error?: string };
  if (!resp.ok) throw new ApiError(resp.status, parsed?.error ?? `HTTP ${resp.status}`);
  return parsed as T;
}

/** The API host, for error copy ("Couldn't reach ilbmeuwrt7.execute-api..."). */
export function apiHost(): string {
  try {
    return new URL(API_URL).host;
  } catch {
    return "the API";
  }
}
