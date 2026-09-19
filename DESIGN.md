---
version: alpha
name: RecallIndia · Gazette & Foil
description: >-
  Light public-record UI. Cool newsprint canvas, petrol "record ink" for everything
  RecallIndia marks, NSQ-stamp red only for "something you own is affected", and
  batch codes set in dot-matrix on a foil chip, the way they are printed on a strip.
colors:
  primary: "#0B5D7A"
  canvas: "#ECEEEA"
  surface-1: "#F8F9F6"
  surface-2: "#E1E4DE"
  line: "#C3C8C0"
  line-strong: "#7F8B85"
  ink: "#0E1B23"
  ink-muted: "#4A5962"
  accent: "#0B5D7A"
  accent-hover: "#004C65"
  accent-press: "#003B4F"
  accent-ink: "#F8F9F6"
  accent-soft: "#D2DCDC"
  mark: "#CFDCDF"
  success: "#1B6B45"
  success-soft: "#D3DED5"
  warning: "#7A5200"
  warning-soft: "#DEDACF"
  danger: "#B3121E"
  danger-hover: "#990013"
  danger-soft: "#E9D7D1"
  foil-hi: "#F1F2F1"
  foil-lo: "#C9CDCB"
typography:
  display-xl:
    fontFamily: Schibsted Grotesk
    fontSize: 64px
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: -0.03em
    fontFeature: '"tnum" 1'
  headline-lg:
    fontFamily: Schibsted Grotesk
    fontSize: 40px
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Schibsted Grotesk
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.02em
  title:
    fontFamily: Schibsted Grotesk
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Schibsted Grotesk
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Schibsted Grotesk
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Schibsted Grotesk
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: Schibsted Grotesk
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.2
  label-caps:
    fontFamily: Schibsted Grotesk
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.08em
  mono-md:
    fontFamily: IBM Plex Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  mono-sm:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  foil-lg:
    fontFamily: Doto
    fontSize: 36px
    fontWeight: 900
    lineHeight: 1
    letterSpacing: 0.06em
  foil-md:
    fontFamily: Doto
    fontSize: 22px
    fontWeight: 900
    lineHeight: 1
    letterSpacing: 0.06em
rounded:
  none: 0px
  sm: 2px
  md: 6px
  lg: 10px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 64px
  rail: 216px
  header: 56px
  gutter: 24px
  content-max: 1200px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 40px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-press}"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 16px
    height: 40px
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 32px
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 40px
  nav-item:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: 36px
  nav-item-active:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
  filter-pill:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 32px
  filter-pill-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  rule:
    backgroundColor: "{colors.line}"
    height: 1px
  input-border:
    backgroundColor: "{colors.line-strong}"
    width: 1px
  chip-source:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.sm}"
    padding: 8px
    height: 22px
  chip-clear:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
  chip-hold:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
  chip-alert:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  foil-chip:
    backgroundColor: "{colors.foil-hi}"
    textColor: "{colors.ink}"
    typography: "{typography.foil-md}"
    rounded: "{rounded.sm}"
    padding: 10px
    height: 32px
  foil-chip-hover:
    backgroundColor: "{colors.foil-lo}"
  foil-chip-lg:
    typography: "{typography.foil-lg}"
    padding: 14px
    height: 48px
  item-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 20px
  item-card-hold:
    backgroundColor: "{colors.warning-soft}"
  item-card-alert:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.accent-ink}"
  item-card-alert-hover:
    backgroundColor: "{colors.danger-hover}"
  record-row:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    height: 44px
  record-row-hover:
    backgroundColor: "{colors.surface-2}"
  record-row-matched:
    backgroundColor: "{colors.mark}"
  notice-sheet:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
    width: 560px
  certificate:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.none}"
    padding: 24px
  seal-verified:
    textColor: "{colors.success}"
    size: 144px
  seal-invalid:
    textColor: "{colors.danger}"
    size: 144px
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface-1}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 14px
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface-1}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: 8px
  palette:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    width: 640px
  kbd:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.sm}"
    padding: 6px
    height: 20px
---

# RecallIndia · Gazette & Foil

## Overview

RecallIndia turns regulator notices (CDSCO NSQ tables, CPSC, NHTSA, openFDA) into one feed and tells a person when something they own is on one. The UI comes from two objects: the **gazette** (a printed public notice, ruled tables, newsprint) and the **foil** (the back of a medicine strip, where the batch code is dot-printed). It should read as a public record you can trust, not a startup dashboard: flat, dense where it holds data, quiet everywhere else, with one loud colour reserved for "this affects you".

Light only. The source world is paper, and light surfaces keep their detail after YouTube compression, where dark gradients band. The v1 dark petrol ledger is retired; petrol survives as the accent so the product still looks like the one in the build posts.

Signature visual: the **foil chip**, a batch or lot code in Doto dot-matrix on brushed foil. Signature interaction (spec in UI-SPEC.md): the PDF-to-feed dissolve on `/ingest`.

## Colors

Every text pair below is checked: WCAG 2 ratio and APCA Lc on its usual background.

- **canvas #ECEEEA** (cool newsprint): page background. Never pure white, never cream.
- **surface-1 #F8F9F6** (fresh paper): cards, records, sheets, inputs, the notice excerpt. Always sits on canvas.
- **surface-2 #E1E4DE** (pressed paper): row hover, skeleton blocks, kbd, selected filter background. Never a card background.
- **line #C3C8C0**: rules and dividers (decorative, 1px). Never the only boundary of an input.
- **line-strong #7F8B85** (3.35:1 on surface-1): input borders, checkbox outlines, focusable outlines, hovered card borders.
- **ink #0E1B23** (15.0:1 on canvas, Lc 94): all body text and headings. Blue-black record ink, hue 237.
- **ink-muted #4A5962** (6.2:1, Lc 75): secondary text, metadata, timestamps, table headers.
- **accent #0B5D7A** petrol "record ink" (6.3:1, Lc 75): the one primary button per view (Approve claim letter), focus ring, active nav indicator, links, the mark underline on matched cells, the live counter tick. Never decoration, never two filled accent buttons in one view. Budget: 2–5% of pixels. In code this token is `--primary` (shadcn already uses `--accent` for hover surfaces).
- **accent-hover #004C65 / accent-press #003B4F**: primary button hover and press only (OKLCH L −0.06 / −0.12).
- **accent-ink #F8F9F6** (6.95:1 on accent): text on accent and on danger.
- **accent-soft #D2DCDC**: selected filter chip, active palette row.
- **mark #CFDCDF** (ink 12.5:1): highlighter behind the matched text or row inside a notice. It is close to the hover surface, so a matched row always also carries the 2px accent underline on its matched cells. This is where the pipeline's work is drawn onto the record.
- **success #1B6B45 / success-soft #D3DED5**: clear items, healthy sources, the VERIFIED seal. Text on the soft tint is 4.7:1.
- **warning #7A5200 / warning-soft #DEDACF**: items that need you (hold), degraded sources, waiting-for-approval state. Text on the soft tint is 5.0:1.
- **danger #B3121E** NSQ-stamp red / **danger-hover #990013** / **danger-soft #E9D7D1**: only (a) the alert face of an item card, (b) the INVALID seal, (c) a source that is down, (d) the red pocket in the logo and the red tittle in the wordmark. Nothing else is red: not links, not delete icons, not charts.
- **foil-hi #F1F2F1 → foil-lo #C9CDCB**: the foil chip gradient, and nothing else. It is the one colour gradient in the product (the skeleton shimmer and the letter preview's fade mask are the only other gradients, and they are neutral).
- Soft tints are pre-computed 12% mixes in OKLab. Do not compute them at runtime with `color-mix(in oklch, …, var(--canvas))`: the canvas is almost neutral and its hue drags the result toward yellow.

## Typography

- **Schibsted Grotesk** (a newspaper publisher's grotesk) is the voice: display 800 at −0.03em, headings 700, body 400. One family keeps the gazette plain.
- **Doto** (dot-matrix, weight 900) appears only inside a foil chip: batch, lot, serial, model year and VIN fragments. Never for words, never below 22px.
- **IBM Plex Mono** in a supporting role only: hashes, KMS key ids, run ids, curl commands, log lines, JSON, and batch/model identifiers in dense tables and lists. Not for labels, counts or words.
- Scale 1.25: 64 / 40 / 28 / 20 / 18 / 16 / 14 / 12. Body 16px, table rows 14px, nothing below 12px.
- `font-variant-numeric: tabular-nums` on every count, date, time and row number. Real minus sign "−", curly quotes, "…".
- Caps (label-caps, +0.08em) are allowed only on status words (CLEAR, CHECKING, NEEDS YOU, NOT ON THE NOTICE, ON A NOTICE, WAITING FOR YOU, APPROVING, SEALING EVIDENCE, WRITING LETTER, VERIFYING, VERIFIED, INVALID, REJECTED, EXPIRED, ERROR), table header cells and source chips (the names are acronyms). At most one caps label per card.
- Sentence case everywhere else. Buttons name their result ("Approve claim letter", "Run ingest", "Check again").

## Layout

- 4px base. Tight inside groups (4–8), generous between groups (32–48). No uniform 24px padding.
- App shell ≥1024px: left rail 216px (logo lockup 24px high, nav, ⌘K hint at the bottom), header 56px (live counter, poll time, demo pill), content max 1200px with 32px side padding.
- 640–1023px: rail collapses to a 56px top bar with the nav as icon + label tabs; 390px: top bar with logo + ⌘K button, nav as a bottom tab bar of 4 items (56px + safe area).
- Tables are full content width with 44px rows (36px dense on the feed at ≥1440). Sheets open from the right at 560px (full width below 640).
- One oversized element per screen: the outcome line on `/mine` and `/case`, the notice counter on `/`, the live row count on `/ingest`.

## Elevation & Depth

Flat paper. Depth comes from the surface ladder (canvas → surface-1 → surface-2) and 1px rules, not shadows. Only floating layers get a shadow, two layers, tinted with ink:

- shadow-1 (popover, tooltip, toast): `0 1px 0 rgb(14 27 35 / .06), 0 1px 3px rgb(14 27 35 / .08)`
- shadow-2 (sheet, palette, flipped card while it rotates): `0 2px 4px rgb(14 27 35 / .06), 0 12px 32px -8px rgb(14 27 35 / .20)`

Cards resting on the canvas have no shadow. No glass, no glow, no blur behind panels. No grain texture: ruled lines on tables are the only texture.

## Shapes

- **none 0px**: anything that is a record: feed table, notice record, claim letter page, evidence certificate, log lines.
- **sm 2px**: chips, foil chips, kbd, tooltips.
- **md 6px**: buttons, inputs, item cards, filter pills, empty-state panels.
- **lg 10px**: notice sheet, command palette, toasts.
- full 9999px: only the status dot and the seal (a circle).
- A child's radius is its parent's minus the padding; never round a record.

## Components

- **Primary button**: accent fill, accent-ink label, 40px high (44px on touch), 16px side padding, radius md, label-md. Exactly one per view. Hover accent-hover in 150ms; press accent-press and scale .97 in 120ms; focus-visible 2px accent ring, offset 2px; disabled at 38% opacity with a tooltip that says why; loading keeps the label, a spinner leads, width locked, `aria-busy`.
- **Secondary button**: surface-1, 1px line-strong border, ink label. Hover surface-2.
- **Ghost button**: transparent, ink-muted label, 32px high (44px under `pointer: coarse`, as for pills). Hover surface-2 + ink. Used for "Check again", "Show work", "Reject". On the red alert face: accent-ink label with a 1px accent-ink border at 60%.
- **Input**: surface-1, 1px line-strong border, radius md, 40px, 16px text on mobile. Focus: accent border + 2px accent ring. Error: warning border, message below in warning body-sm, `aria-invalid`.
- **Filter pill**: 32px, radius md, surface-1 + 1px line, label-md ink; selected = accent-soft face + accent text, no border change.
- **Rule**: 1px line between records and groups. **Input border**: 1px line-strong.
- **Source chip**: 22px, radius sm, label-caps. Leading 6px status dot: success healthy, warning degraded, danger down (with the last success time in its tooltip).
- **Status chip**: clear / hold / alert use the soft tint + signal text pairs above. Pulsing dot only on "waiting for you".
- **Foil chip**: foil gradient `linear-gradient(180deg, #F1F2F1 0%, #DDE0DE 46%, #C9CDCB 54%, #E6E8E7 100%)`, inset `0 1px 0 rgb(255 255 255 / .7)` highlight and a 1px `rgb(14 27 35 / .14)` inset edge, Doto 900 ink, radius sm. Sizes: 32px (foil-md) in cards and rows, 48px (foil-lg) on the near-miss comparison and the case header. On a near-miss, the character that differs gets a 3px accent underline on both chips.
- **Item card**: surface-1, 1px line border, radius md, 20px padding, flat. Faces: clear (surface-1 + CLEAR in success), hold (warning-soft face, no border, kind glyph + NEEDS YOU in warning), alert (full danger face, accent-ink text, foil chip sits on the red). No coloured side stripes.
- **Record row**: surface-1, 44px, 1px line top rule, body-sm; ids in mono-md; hover surface-2; matched row mark background with a 2px accent underline on the matched cells.
- **Notice sheet**: surface-1, radius lg on the left corners only, 560px, shadow-2, slides in from the right.
- **Evidence certificate**: surface-1, radius none, 1px line-strong border, mono-sm fields in a two-column definition list, seal 144px top-right.
- **Seal**: a circular stamp (outer ring 3px, inner ring 1.5px, ring text in label-caps on a circular path, centre word in Schibsted 800), rotated −4°. VERIFIED in success, INVALID in danger.
- **Toast** (sonner): ink background, surface-1 text, radius lg, bottom-right, 4s dwell.
- **Tooltip**: ink, surface-1 text, body-sm, radius sm; first open after 600ms, then instant.
- **Command palette** (cmdk): surface-1, radius lg, 640px wide, rows 40px, active row accent-soft, kbd hints in kbd style. Opens instantly.

## Do's and Don'ts

- Do keep red for "you are affected": alert card face, INVALID seal, a source that is down, the logo pocket. Don't use red for links, delete buttons, errors in forms or charts.
- Do write the outcome first ("You were sold this 11 days after the notice"), with the raw fields under it.
- Do show the notice as its own row from the regulator's table, with our highlight on it. Don't paraphrase the source.
- Don't write "recalled" for a CDSCO NSQ hit; write "failed CDSCO quality test, JUL-2026 alert, row 12". Don't write "safe"; write "no match in 4 sources as of 02:10".
- Don't use colour gradients anywhere except the foil chip.
- Don't use colored side stripes (`border-l-4`) on cards or callouts; tint the face or lead with a glyph.
- Don't add grain, glass, glow, blur backgrounds, eyebrow chips over headings, or emoji.
- Don't set words in Doto, or labels and counts in Plex Mono.
- Don't round records (feed rows, notice record, letter, certificate).
- Don't compute tints with `color-mix(in oklch, …)` against the canvas; use the tokens.
- Don't load Bricolage Grotesque, IBM Plex Sans, Inter or Geist.
