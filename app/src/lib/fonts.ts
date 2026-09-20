// lib/fonts.ts · RecallIndia v3 "Cobalt & Foil"
// next/font/google self-hosts these at build time (works with `output: "export"`).
// Apply `fontVariables` on <html>; globals.tokens.css maps the variables to
// --font-display / --font-sans / --font-foil / --font-mono for Tailwind 4.
import { Doto, Funnel_Display, IBM_Plex_Mono, Onest } from "next/font/google";

/** Display: hero lines, outcome sentences, card titles, big numbers. */
export const funnelDisplay = Funnel_Display({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-funnel-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

/** Body and UI: reading text, buttons, chips, tabs, inputs. */
export const onest = Onest({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-onest",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

/** Foil only: batch, lot and serial codes on a foil chip. Never words. */
export const doto = Doto({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-doto",
  display: "swap",
  // preloaded: the landing hero's "Batch on your strip · FT5427" chip is Doto, and a monospace flash would show in the video
  fallback: ["ui-monospace", "monospace"],
});

/** Machine strings only: SHA-256 hashes, KMS aliases, notice ids, curl. */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false, // first used below the fold (/case certificate, /api console)
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

/** `<html lang="en" className={fontVariables}>` in app/layout.tsx */
export const fontVariables = [funnelDisplay, onest, doto, plexMono].map((f) => f.variable).join(" ");
