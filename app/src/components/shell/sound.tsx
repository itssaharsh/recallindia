"use client";

import { Volume2, VolumeX } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * C-26: the only sound in the app is the stamp thunk (T-13) — about 90 Hz of sine with a 120 ms
 * exponential decay plus a short band-passed noise click, synthesised with Web Audio (no files).
 * The AudioContext is created on the first user gesture, because browsers refuse one before it.
 */
const SOUND_KEY = "ri.sound";
const Ctx = createContext<{ on: boolean; toggle: () => void; play: () => void } | null>(null);

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(true);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      setOn(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      // storage blocked: sound stays on for this tab
    }
  }, []);

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was;
      try {
        localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        // nothing to remember
      }
      return next;
    });
  }, []);

  const play = useCallback(() => {
    if (!on) return;
    try {
      audio.current ??= new AudioContext();
      const ctx = audio.current;
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;

      // the body of the thunk: a low sine that decays fast
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.12);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);

      // the click of the rubber hitting paper: 30 ms of band-passed noise
      const frames = Math.floor(ctx.sampleRate * 0.03);
      const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1400;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.18, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      noise.connect(band).connect(noiseGain).connect(ctx.destination);
      noise.start(now);
    } catch {
      // no Web Audio (or the gesture rule refused it): the stamp is silent, nothing breaks
    }
  }, [on]);

  const value = useMemo(() => ({ on, toggle, play }), [on, toggle, play]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The thunk itself, for the component that stamps. */
export function useSound(): () => void {
  return useContext(Ctx)?.play ?? (() => {});
}

/** C-26's toggle, in the rail footer. */
export function SoundToggle({ className }: { className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const Icon = ctx.on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      onClick={ctx.toggle}
      title={ctx.on ? "Sound on" : "Sound off"}
      aria-label={ctx.on ? "Sound on" : "Sound off"}
      aria-pressed={ctx.on}
      className={`inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink ${className ?? ""}`}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}
