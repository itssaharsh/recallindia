---
version: alpha
name: RecallIndia
colors:
  # Petrol-blue primary (hue 215). Not indigo. Reads as "public-safety infrastructure".
  primary: "oklch(58% 0.14 215)"
  primary-strong: "oklch(70% 0.16 215)"
  # Dark navy surface ladder — elevation by lightness, not shadows.
  surface-0: "oklch(15% 0.02 240)"   # page
  surface-1: "oklch(19% 0.02 240)"   # panels
  surface-2: "oklch(23% 0.02 240)"   # cards
  surface-3: "oklch(28% 0.02 240)"   # hovered / raised
  line: "oklch(32% 0.02 240)"
  text: "oklch(94% 0.01 240)"
  text-muted: "oklch(68% 0.02 240)"
  # ONE accent: the alert. Desaturated red so it doesn't glow in dark mode.
  alert: "oklch(62% 0.19 25)"
  # Semantic only — never decorative.
  hold: "oklch(74% 0.14 80)"          # amber: needs human confirm / near-miss
  clear: "oklch(72% 0.13 160)"        # green: verified / dismissed-safe
  evidence: "oklch(80% 0.06 215)"     # pale petrol for signed-proof chrome
typography:
  display: { fontFamily: "Bricolage Grotesque", fontWeight: 600 }
  body:    { fontFamily: "IBM Plex Sans", fontWeight: 400 }
  mono:    { fontFamily: "IBM Plex Mono", fontWeight: 400 }   # batch numbers, VINs, hashes, log lines
rounded:
  none: 0px      # evidence certificate, log lines, feed rows
  sm: 4px        # inputs, chips
  md: 10px       # item cards
  lg: 18px       # sheets / modals
spacing:
  unit: 8px
---
## Overview
RecallIndia turns India's recall PDFs and web forms into a live feed and tells you the day something you own is on it. One aesthetic word: **ledger** — a public-safety record that looks official, dense and trustworthy, not a consumer app.

## Signature Interaction
**The PDF-to-feed dissolve.** A real CDSCO NSQ PDF page is shown; as Textract runs, each table row lifts off the page, snaps into a structured feed row (drug · batch · manufacturer · failed test), and the row count ticks up in tabular numerals. A judge has not seen a government PDF become an API in front of them. Everything else in the product is the consequence of this one moment.

Secondary (used once, on match): **the card flip with the quoted sentence.** An item card flips to its alert face; the matched sentence from the notice is highlighted inside a rendered excerpt of the source document, and the batch/serial/VIN check draws a range bar showing where the user's unit falls.

## Do's and Don'ts
- Petrol blue + navy ladder + one desaturated red. No indigo, no gradients, no glow.
- Bricolage Grotesque for headings because it has the slightly bureaucratic, stamped feel of a notice; IBM Plex because it is the font of documentation and ledgers; Plex Mono for every identifier (batch, VIN, hash, timestamp).
- Radius scale is real: 0 on anything that is "a record" (feed rows, log lines, certificates), 10px on item cards, 18px on sheets. Never uniform rounding.
- Elevation by surface lightness; no drop shadows except the one on the flipped alert card.
- Motion only on state change: row snap-in (feed), card flip (match), range bar draw (verification), stamp press (signed evidence). Spring easing. `prefers-reduced-motion` → crossfades.
- Tabular numerals everywhere numbers appear (`font-variant-numeric: tabular-nums`).
- Real icons (Lucide). No emoji. No "Transform / Supercharge / Unleash" copy — every line names the source, the batch, the date.
- Never say "recalled" for a CDSCO NSQ hit; say "failed CDSCO quality test (March 2026 alert, row 41)". Never say "safe"; say "no match in 5 sources".
- Dark theme because this is an ops/records console; the public API docs page is the one light route.
