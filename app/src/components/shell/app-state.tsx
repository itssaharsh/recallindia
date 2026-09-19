"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { API_URL, apiGet } from "@/lib/api";
import type { Stats } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

interface AppState {
  /** true with ?demo=1 (kept for the tab's session): every read comes from /fixtures. */
  demo: boolean;
  /** false until the client has read the URL; data hooks wait for it. */
  ready: boolean;
  stats: Stats | null;
  statsError: string | null;
  refreshStats: () => void;
  /** An in-app link that keeps demo mode on. */
  href: (path: string) => string;
}

const Ctx = createContext<AppState | null>(null);
const DEMO_KEY = "recallindia-demo";

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("demo");
    let on = false;
    try {
      if (flag === "1") sessionStorage.setItem(DEMO_KEY, "1");
      if (flag === "0") sessionStorage.removeItem(DEMO_KEY);
      on = sessionStorage.getItem(DEMO_KEY) === "1";
    } catch {
      on = flag === "1"; // storage blocked: the URL alone decides
    }
    setDemo(on);
    setReady(true);
    if (!on && API_URL) fetch(`${API_URL}/health`).catch(() => undefined); // warm the Lambda
  }, []);

  usePoll(
    async (signal) => {
      try {
        setStats(await apiGet<Stats>("/v1/stats", demo, signal));
        setStatsError(null);
      } catch (err) {
        if (!signal.aborted) setStatsError(err instanceof Error ? err.message : String(err));
      }
    },
    15_000,
    ready,
  );

  // a manual refresh (after a check) re-runs the poll by remounting its effect key
  useEffect(() => {
    if (!ready || nonce === 0) return;
    const controller = new AbortController();
    apiGet<Stats>("/v1/stats", demo, controller.signal).then(setStats).catch(() => undefined);
    return () => controller.abort();
  }, [nonce, ready, demo]);

  const refreshStats = useCallback(() => setNonce((n) => n + 1), []);
  const href = useCallback((path: string) => (demo ? `${path}${path.includes("?") ? "&" : "?"}demo=1` : path), [demo]);

  const value = useMemo(
    () => ({ demo, ready, stats, statsError, refreshStats, href }),
    [demo, ready, stats, statsError, refreshStats, href],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState outside AppStateProvider");
  return ctx;
}
