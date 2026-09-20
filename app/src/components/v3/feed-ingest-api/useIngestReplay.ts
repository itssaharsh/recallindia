"use client";
import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { isTyping } from "./hooks";
import { ingestFrame, replaySchedule, type IngestFrame } from "./ingestTimeline";
import type { IngestRun, IngestSpeed } from "./types";

export type ReplayPhase = "idle" | "playing" | "paused" | "done";

export interface IngestReplay {
  frame: IngestFrame;
  phase: ReplayPhase;
  speed: IngestSpeed;
  toggle: () => void;
  restart: () => void;
  setSpeed: (s: IngestSpeed) => void;
}

/**
 * Drives the recorded run (no network): a rAF clock at `speed`, paused by Space, restarted by R,
 * 1/2/4 set the speed. Autostarts 400 ms after `ready` (the PDF's first page has rendered).
 */
export function useIngestReplay(run: IngestRun, { ready = true, autoStart = true, initialSpeed = 1 as IngestSpeed, keyboard = true } = {}): IngestReplay {
  const reduced = useReducedMotion() ?? false;
  const schedule = React.useMemo(() => replaySchedule(run), [run]);
  const [t, setT] = React.useState(0);
  const [phase, setPhase] = React.useState<ReplayPhase>("idle");
  const [speed, setSpeed] = React.useState<IngestSpeed>(initialSpeed);
  const speedRef = React.useRef(speed);
  speedRef.current = speed;

  React.useEffect(() => {
    if (!ready || !autoStart || phase !== "idle") return;
    const id = setTimeout(() => setPhase("playing"), 400);
    return () => clearTimeout(id);
  }, [ready, autoStart, phase]);

  React.useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setT((prev) => {
        const next = prev + dt * speedRef.current;
        if (next >= schedule.end) {
          setPhase("done");
          return schedule.end + 1;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, schedule.end]);

  const toggle = React.useCallback(() => {
    setPhase((p) => {
      if (p === "done") {
        setT(0);
        return "playing";
      }
      return p === "playing" ? "paused" : "playing";
    });
  }, []);
  const restart = React.useCallback(() => {
    setT(0);
    setPhase("playing");
  }, []);

  React.useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (e.key === " " && !(el && /^(BUTTON|A)$/.test(el.tagName))) {
        e.preventDefault();
        toggle();
      } else if (e.key === "r" || e.key === "R") restart();
      else if (e.key === "1" || e.key === "2" || e.key === "4") setSpeed(Number(e.key) as IngestSpeed);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [keyboard, toggle, restart]);

  const frame = React.useMemo(() => ingestFrame(run, schedule, t, { reduced }), [run, schedule, t, reduced]);
  return { frame, phase, speed, toggle, restart, setSpeed };
}
