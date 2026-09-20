---
version: alpha
name: RecallIndia · Cobalt & Foil
description: >-
  A friendly consumer app for drug-quality alerts and product recalls in India. One bold cobalt
  moment (the landing hero with a 3D foil blister strip), then calm, warm app screens: a cool canvas,
  white cards, cobalt for what you can do, category colours for kinds of things, batch codes printed
  in dot-matrix on foil chips, and red only when something you own is affected.
colors:
  primary: "#0A58C2"
  primary-hover: "#0045AE"
  primary-press: "#00329A"
  primary-soft: "#DDE7F8"
  on-primary: "#FFFFFF"
  on-primary-muted: "#CFDEF6"
  canvas: "#F4F7FC"
  surface-1: "#FFFFFF"
  surface-2: "#EAF0F8"
  line: "#DDE4EE"
  line-strong: "#838FA0"
  ink: "#0B1B33"
  ink-muted: "#4A5872"
  ink-subtle: "#65718A"
  danger: "#B3121E"
  danger-hover: "#990013"
  danger-press: "#7E000C"
  danger-soft: "#FBEAE8"
  success: "#127A55"
  success-soft: "#E9F1ED"
  warning: "#8F5500"
  warning-soft: "#F2EAE2"
  live: "#3DDC84"
  cat-medicine: "#0A58C2"
  cat-medicine-soft: "#E4EDFB"
  cat-medicine-tint: "#BCD2F3"
  cat-vehicle: "#C25E00"
  cat-vehicle-soft: "#FCEBDB"
  cat-vehicle-tint: "#F4CDA8"
  cat-appliance: "#0E8A6A"
  cat-appliance-soft: "#DFF3EB"
  cat-appliance-tint: "#B2E0D0"
  cat-other: "#6A5C8A"
  cat-other-soft: "#EDE9F4"
  cat-other-tint: "#D3CBE3"
  foil-hi: "#F1F2F1"
  foil-lo: "#C9CDCB"
typography:
  display-xl:
    fontFamily: Funnel Display
    fontSize: 68px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: -0.037em
  display-lg:
    fontFamily: Funnel Display
    fontSize: 54px
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: -0.035em
  headline-lg:
    fontFamily: Funnel Display
    fontSize: 40px
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Funnel Display
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.14
    letterSpacing: -0.02em
  stat:
    fontFamily: Funnel Display
    fontSize: 32px
    fontWeight: 800
    lineHeight: 1
    letterSpacing: -0.02em
    fontFeature: '"tnum" 1'
  title:
    fontFamily: Onest
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Onest
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.55
  body-md:
    fontFamily: Onest
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Onest
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  label-lg:
    fontFamily: Onest
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1
  label-md:
    fontFamily: Onest
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1
  label-sm:
    fontFamily: Onest
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1
  chip:
    fontFamily: Onest
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.02em
  caps:
    fontFamily: Onest
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.08em
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
  foil-sm:
    fontFamily: Doto
    fontSize: 17px
    fontWeight: 900
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
rounded:
  mark: 3px
  xs: 6px
  sm: 8px
  md: 14px
  lg: 22px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 64px
  5xl: 96px
  touch: 44px
  gutter: 32px
  gutter-mobile: 16px
  nav: 64px
  topbar: 56px
  tabbar: 64px
  content-app: 1472px
  content-landing: 1344px
components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
  landing-hero:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.display-xl}"
    height: 790px
  landing-hero-subcopy:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary-muted}"
    typography: "{typography.body-lg}"
  live-dot:
    backgroundColor: "{colors.live}"
    size: 8px
    rounded: "{rounded.pill}"
  nav-bar:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    height: 64px
    padding: 32px
  nav-tab:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 40px
    padding: 16px
  nav-tab-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  nav-tab-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
  nav-badge:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    size: 20px
  household-pill:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.pill}"
    height: 40px
    padding: 14px
  household-pill-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  household-pill-copying:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
  household-pill-yours:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
  search-trigger:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    height: 40px
    width: 268px
  kbd:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.mono-sm}"
    rounded: "{rounded.xs}"
    padding: 6px
    height: 22px
  topbar-mobile:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    height: 56px
    padding: 16px
  tabbar-mobile:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.chip}"
    height: 64px
  tabbar-item-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
    width: 56px
    height: 32px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 44px
    padding: 20px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  button-primary-active:
    backgroundColor: "{colors.primary-press}"
    textColor: "{colors.on-primary}"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 44px
    padding: 20px
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  button-ghost:
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 44px
    padding: 16px
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 44px
    padding: 20px
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
    textColor: "{colors.on-primary}"
  button-danger-active:
    backgroundColor: "{colors.danger-press}"
    textColor: "{colors.on-primary}"
  button-on-blue:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 44px
    padding: 22px
  button-on-blue-hover:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
  button-outline-on-blue:
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 44px
    padding: 22px
  button-lg:
    typography: "{typography.label-lg}"
    height: 54px
    padding: 26px
  button-sm:
    typography: "{typography.label-sm}"
    height: 36px
    padding: 14px
  button-icon:
    rounded: "{rounded.pill}"
    size: 44px
  focus-ring:
    backgroundColor: "{colors.primary}"
    width: 2px
  chip-alert:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    height: 26px
    padding: 10px
  chip-clear:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    height: 26px
    padding: 10px
  chip-hold:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    height: 26px
    padding: 10px
  chip-info:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    height: 26px
    padding: 10px
  chip-md:
    typography: "{typography.label-sm}"
    height: 32px
    padding: 12px
  filter-pill:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: 44px
    padding: 16px
  filter-pill-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  filter-pill-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface-1}"
  source-chip:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.caps}"
    rounded: "{rounded.pill}"
    height: 32px
    padding: 12px
  foil-chip-sm:
    backgroundColor: "{colors.foil-hi}"
    textColor: "{colors.ink}"
    typography: "{typography.foil-sm}"
    rounded: "{rounded.xs}"
    height: 28px
    padding: 9px
  foil-chip-md:
    backgroundColor: "{colors.foil-hi}"
    textColor: "{colors.ink}"
    typography: "{typography.foil-md}"
    rounded: "{rounded.sm}"
    height: 34px
    padding: 12px
  foil-chip-lg:
    backgroundColor: "{colors.foil-hi}"
    textColor: "{colors.ink}"
    typography: "{typography.foil-lg}"
    rounded: "{rounded.sm}"
    height: 52px
    padding: 16px
  blister-pocket:
    backgroundColor: "{colors.foil-lo}"
    rounded: "{rounded.pill}"
    size: 38px
  input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 48px
    padding: 14px
  input-placeholder:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.body-md}"
  input-border:
    backgroundColor: "{colors.line-strong}"
    width: 1px
  input-focus:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
  input-error:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.warning}"
    typography: "{typography.body-sm}"
  search-field:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.pill}"
    height: 48px
    padding: 16px
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 20px
  card-meta:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
  divider:
    backgroundColor: "{colors.line}"
    height: 1px
  alert-band:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    height: 48px
    padding: 20px
  category-tile-medicine:
    backgroundColor: "{colors.cat-medicine-soft}"
    rounded: "{rounded.md}"
    size: 88px
  category-mark-medicine:
    backgroundColor: "{colors.cat-medicine}"
    rounded: "{rounded.mark}"
    size: 10px
  illustration-tint-medicine:
    backgroundColor: "{colors.cat-medicine-tint}"
  category-tile-vehicle:
    backgroundColor: "{colors.cat-vehicle-soft}"
    rounded: "{rounded.md}"
    size: 88px
  category-mark-vehicle:
    backgroundColor: "{colors.cat-vehicle}"
    rounded: "{rounded.mark}"
    size: 10px
  illustration-tint-vehicle:
    backgroundColor: "{colors.cat-vehicle-tint}"
  category-tile-appliance:
    backgroundColor: "{colors.cat-appliance-soft}"
    rounded: "{rounded.md}"
    size: 88px
  category-mark-appliance:
    backgroundColor: "{colors.cat-appliance}"
    rounded: "{rounded.mark}"
    size: 10px
  illustration-tint-appliance:
    backgroundColor: "{colors.cat-appliance-tint}"
  category-tile-other:
    backgroundColor: "{colors.cat-other-soft}"
    rounded: "{rounded.md}"
    size: 88px
  category-mark-other:
    backgroundColor: "{colors.cat-other}"
    rounded: "{rounded.mark}"
    size: 10px
  illustration-tint-other:
    backgroundColor: "{colors.cat-other-tint}"
  annotation-chip:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
  annotation-chip-alert:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: 12px
  palette:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.lg}"
    width: 640px
  palette-row:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    height: 52px
    padding: 20px
  palette-row-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
  toast:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: 16px
    width: 400px
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface-1}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    padding: 10px
  skeleton:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.sm}"
  empty-state:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  empty-state-404:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.headline-lg}"
    rounded: "{rounded.lg}"
    padding: 40px
  seal-verified:
    textColor: "{colors.success}"
    size: 144px
  seal-invalid:
    textColor: "{colors.danger}"
    size: 144px
---

# RecallIndia · Cobalt & Foil

## Overview

RecallIndia turns India's drug-quality alerts (CDSCO "Not of Standard Quality" lists) and product recalls (CPSC, NHTSA, openFDA) into one live feed, checks them against the things in your house, and, once you approve, seals the notice and writes a claim letter that cites it. The UI has to explain that in ten seconds and then feel good to use every day.

The system is built from three materials:

- **Cobalt** (medicine-box blue, OKLCH hue 259) is for what you can do: the one primary action per view, the active tab, links, focus, and the landing hero. The landing's first viewport is solid cobalt with white type and a 3D silver blister strip with one red pill. That hero is where the design spends its boldness, once.
- **Foil** is for what's printed on the thing: batch, lot and serial codes appear in Doto dot-matrix on a brushed-foil chip, exactly as they are printed on a strip.
- **Red** is only for what affects you: an alert face or badge, the INVALID seal, a source that is down, the logo's pocket, the red pill.

Everything else is white cards on a cool canvas, warm through category colours and small flat illustrations of the actual objects (a strip, an SUV, a fan). Personality is **Fluid**: springs with bounce 0.1, 250 to 400 ms, and motion that only ever answers a state change. Dials: variance 6, motion 6, density 5 on the landing and 6 on app screens.

Light only. The mockups for this file: `mockups/kit-full-1536.png`, `mockups/shell-390.png`, `mockups/og.png`. Tokens ship as `code/globals.tokens.css`; fonts as `code/fonts.ts`.

## Colors

Contrast values are WCAG 2 ratios on the colour's usual background.

- **primary #0A58C2** (cobalt): primary buttons, active tab label, links, focus ring, the landing hero and OG background, the medicine category. 6.6:1 with white. At most one filled cobalt button per view.
- **primary-hover #0045AE**: primary button hover only.
- **primary-press #00329A**: primary button pressed only.
- **primary-soft #DDE7F8**: active tab pill, active mobile tab pill, info chip, active palette row, copying household pill, the 404 panel. Cobalt text on it is 5.3:1.
- **on-primary #FFFFFF**: text and icons on cobalt, on danger and on the alert band.
- **on-primary-muted #CFDEF6**: secondary text on cobalt (landing sub-copy, stat captions, landing nav links). 4.8:1, never below 14px.
- **canvas #F4F7FC**: the app page background. Never used for cards.
- **surface-1 #FFFFFF**: cards, top nav, mobile bars, inputs, palette, toasts, the on-blue button.
- **surface-2 #EAF0F8**: hover fill (tabs, ghost and secondary buttons, filters, household pill), skeleton blocks, kbd, the search trigger and search fields. Never a card face.
- **line #DDE4EE**: 1px card borders, dividers, the rule under the top nav. Decorative only (1.3:1), never the only edge of a control.
- **line-strong #838FA0**: input borders, secondary button border, checkbox outlines (3.3:1 on white).
- **ink #0B1B33**: all body text and headings (16:1 on canvas), the logo card, tooltips, the selected filter pill.
- **ink-muted #4A5872**: metadata, captions, helper text, inactive tabs (6.7:1 on canvas).
- **ink-subtle #65718A**: input placeholders only (4.9:1 on white). Never for content that has to be read.
- **danger #B3121E**: alert chip text, alert band, nav alert badge, "Open case" button, INVALID seal, source-down dot, logo pocket, red pill. Nothing else is red: not links, not delete icons, not form errors, not charts.
- **danger-hover #990013 / danger-press #7E000C**: danger button hover and pressed only.
- **danger-soft #FBEAE8**: alert chip face, the quoted-notice panel on an alert card (danger text 6.0:1).
- **success #127A55 / success-soft #E9F1ED**: "No match" chip, VERIFIED seal and chip, healthy source dot (4.6:1 on the soft face).
- **warning #8F5500 / warning-soft #F2EAE2**: near miss, "Waiting for you", degraded source, **form errors** and the differing character underline on a near-miss foil chip (5.1:1 on the soft face).
- **live #3DDC84**: the pulsing live dot, on cobalt only (landing pill, OG image). Never on white.
- **cat-medicine #0A58C2, cat-vehicle #C25E00, cat-appliance #0E8A6A, cat-other #6A5C8A**: category marks (10px rounded squares), illustration strokes and fills. Marks only: vehicle and appliance are 4.3:1 on white, so they never carry text.
- **cat-medicine-soft #E4EDFB, cat-vehicle-soft #FCEBDB, cat-appliance-soft #DFF3EB, cat-other-soft #EDE9F4**: the tile behind a thing's illustration and behind palette result icons.
- **cat-medicine-tint #BCD2F3, cat-vehicle-tint #F4CDA8, cat-appliance-tint #B2E0D0, cat-other-tint #D3CBE3**: the second tone inside the flat two-tone illustrations. Never a surface.
- **foil-hi #F1F2F1 / foil-lo #C9CDCB**: the foil gradient `linear-gradient(180deg, #F1F2F1 0%, #DDE0DE 46%, #C9CDCB 54%, #E6E8E7 100%)` with an inset 1px white highlight and a 1px `rgb(11 27 51 / 0.14)` inset edge. foil-hi is the chip's flat fallback; foil-lo is the empty blister pocket. The foil and one soft radial glow behind the landing's 3D strip are the only gradients in the product.
- The scrim behind the palette and sheets is ink at 40% (`rgb(11 27 51 / 0.40)`), not black.

## Typography

- **Funnel Display** speaks: display 800 for hero lines and outcome sentences, headline 700 and 800 for section and card titles, and every big number (stat). Tight tracking, −0.02em to −0.037em by size.
- **Onest** reads: body, labels, buttons, chips, tabs, inputs. 400 for reading, 500 for nav and filters, 600 for buttons and labels, 700 for titles and caps.
- **Doto 900** prints: batch, lot, serial and model-year codes, only on a foil chip. Never words, never below 17px.
- **IBM Plex Mono 400** shows machine strings only: SHA-256 hashes, KMS key aliases, notice ids in the API console, curl commands. Never labels.

Token rules:

- **display-xl 68/68**: the landing hero headline, the kit title. One per page.
- **display-lg 54/55**: the outcome line on `/mine` and `/case` ("2 things you own are on a notice").
- **headline-lg 40/42**: section headings on the landing and `/kit`, the 404 heading.
- **headline-md 28/32**: card and sheet titles for a single thing ("Paracetamol Tablets IP 650mg").
- **stat 32/32**, tabular: hero and dashboard numbers (4,868 · 239 · 15 min · 9 s). 38px in the OG image.
- **title 20/25**: notice titles in lists, panel headings ("Failed CDSCO quality test · JUL-2026 alert, row 12").
- **body-lg 18/28**: landing sub-copy and ledes. **body-md 16/25**: default reading and input text (16px stops iOS zoom). **body-sm 14/20**: metadata, helper text, toasts, "No match in 4 sources as of 15:08".
- **label-lg 17**: lg buttons on the landing. **label-md 15**: buttons, tabs, filter pills. **label-sm 13**: sm buttons, md chips, household pill text.
- **chip 12 +0.02em**: status chip text, mobile tab labels, nav badge count. **caps 12 +0.08em**: category labels and palette group headings, at most one caps label per card.
- **foil-lg 36 / foil-md 22 / foil-sm 17**: lg, md and sm foil chips.
- **mono-md 14 / mono-sm 12**: hashes and ids; kbd hints use mono-sm.
- `font-variant-numeric: tabular-nums` on every count, date, time and row number. Sentence case everywhere; buttons name their result ("Approve claim letter", "Make my own copy", "Open case").

## Layout

- 4px base. Spacing tokens: **xs 4** (icon to label), **sm 8** (inside chips, between pills), **md 12** (card inner groups), **lg 16** (card grid gap, mobile gutter), **xl 24** (between groups in a card), **2xl 32** (desktop gutter, empty-state padding), **3xl 48** (between blocks), **4xl 64** (above a page's first section), **5xl 96** (between landing and kit sections).
- **touch 44**: every tappable thing is at least 44 × 44, including sm buttons (padded hit area) and chips that act as filters.
- **App shell at 1024px and up**: top nav **nav 64px**, white, 1px line below, sticky. Left to right: lockup (mark 30px, wordmark 21px, links to `/`), tabs Feed · Ingest · My things · API (40px pills), spacer, household pill (40px), search trigger (268 × 40, "Search 4,868 notices", ⌘K). Content max **content-app 1472px** with **gutter 32px**.
- **768 to 1023px**: same nav; the search trigger becomes a 44px round button and the household pill drops "· read-only".
- **Below 768px**: **topbar 56px** (mark 26, wordmark 19, household pill "Demo household" 36px, search button 44) and **tabbar 64px** plus `env(safe-area-inset-bottom)`: four tabs, 24px icon in a 56 × 32 pill, 12px label. **gutter-mobile 16px**. The palette becomes a full-screen sheet.
- **Landing**: content max **content-landing 1344px**, 96px side gutters at 1536; transparent nav over cobalt (48px row at top 24), white text links and an "Open the app" white pill. Below 768px only the lockup and "Open the app" stay.
- One oversized element per screen: the hero headline on `/`, the outcome line on `/mine` and `/case`, the live row counter on `/ingest`.
- Grids follow content: cards in a row get different spans (7/5, 5/4/3), never three identical cards.

## Elevation & Depth

Depth comes from the surface ladder (canvas, then white cards, then surface-2 for hover) plus two-layer shadows tinted with ink:

- **shadow-1** `0 1px 2px rgb(11 27 51 / .06), 0 1px 3px rgb(11 27 51 / .08)`: cards at rest.
- **shadow-2** `0 2px 4px rgb(11 27 51 / .06), 0 18px 40px -12px rgb(11 27 51 / .22)`: hovered card (with a −2px lift), alert card, toast, annotation chips.
- **shadow-3** `0 4px 8px rgb(11 27 51 / .08), 0 32px 64px -16px rgb(11 27 51 / .32)`: palette and sheets, over the 40% ink scrim.
- On cobalt, chips use a blue-tinted shadow `0 2px 4px rgb(0 26 70 / .10), 0 18px 40px -12px rgb(0 26 70 / .45)`.
- The only real 3D is the landing's three.js blister strip, with a soft radial glow behind it. No glass, no blur panels, no glow blobs, no grain.

## Shapes

- **mark 3px**: category marks (the 10px squares). Squares are categories; circles are status.
- **xs 6px**: kbd, tooltips, the sm foil chip.
- **sm 8px**: inputs, md and lg foil chips, skeleton lines.
- **md 14px**: cards, toasts, annotation chips, category tiles, quote panels.
- **lg 22px**: palette, sheets, feature panels, empty-state panels, phone frames.
- **pill 999px**: anything you press or filter by: buttons, chips, tabs, filter pills, household pill, search trigger and fields.
- The logo is a rounded card (radius 8 of 36) with a 2 × 2 grid of pockets, the bottom-right one red. Ink card on light, white card on cobalt.

## Components

- **Top nav** (`nav-bar`, `nav-tab`, `nav-badge`): white, 64px. Tabs are 40px pills in ink-muted; hover fills surface-2 in 180 ms; active is primary-soft with a cobalt label and `aria-current="page"`. "My things" shows a red count badge only while something you own is on a notice.
- **Household pill** (`household-pill`): three states. Demo: house icon in cobalt, "Demo household · read-only". Copying: primary-soft face, a progress ring, "Copying 9 of 15" ticking 1 to 15 over 1.2 s. Yours: a cobalt disc with the house, "Your household · 15 things" and a chevron that opens the household menu. States cross-fade in 320 ms.
- **Search trigger** (`search-trigger`, `kbd`): surface-2 pill with "Search 4,868 notices" (live count) and a ⌘K key. Opens the palette on click, ⌘K, Ctrl K or /.
- **Mobile bars** (`topbar-mobile`, `tabbar-mobile`, `tabbar-item-active`): 56px top bar, 64px tab bar plus safe area; the active tab's icon sits in a primary-soft pill.
- **Buttons**: pills. `button-primary` (one per view), `button-secondary` (white with a line-strong border), `button-ghost` (no fill at rest; surface-2 on hover), `button-danger` (only "Open case" on an alert), `button-on-blue` (white pill, cobalt label, landing), `button-outline-on-blue` (34% white border, landing). Sizes: `button-lg` 54, default 44, `button-sm` 36 (44 hit area), `button-icon` 44. States: hover changes colour in 180 ms; press uses the -active colour and scale 0.97 in 120 ms; focus-visible draws `focus-ring`, 2px cobalt outside a 2px surface gap (white outside a cobalt gap on blue); disabled is 40% opacity with a tooltip that says why; loading keeps label and width, puts a spinner first and sets `aria-busy`.
- **Status chips** (`chip-alert`, `chip-clear`, `chip-hold`, `chip-info`, `chip-md`): 26px (sm) or 32px (md) with a leading 14 or 16px icon. Copy: "On a notice", "Same batch", "No match", "VERIFIED", "Near miss", "Waiting for you" (pulsing dot), "Checking" (spinner), "Locked until 19 Oct 2026".
- **Filter pill** (`filter-pill`): 44px, white with a 1px line; hover surface-2; selected is an ink pill with white text. A category filter leads with its 10px mark; "On a notice" leads with an 8px red dot; counts follow in 13px 600 ink-muted.
- **Source chip** (`source-chip`): caps source name, count, and a status dot: success healthy, warning slow, danger down (with "down since 14:52").
- **Foil chip** (`foil-chip-sm`, `foil-chip-md`, `foil-chip-lg`): 28, 34 and 52px. On a near miss the differing character gets a 3px warning underline on both chips. On an alert face the chip keeps its foil.
- **Blister pocket** (`blister-pocket`): the empty pocket in the household blister and the empty state, foil-lo with an inset shadow.
- **Inputs** (`input`, `input-placeholder`, `input-border`, `input-focus`, `input-error`, `search-field`): 48px, radius 8, 1px line-strong. Focus: cobalt border doubled to 2px plus a 4px primary-soft halo. Error: warning border doubled plus a warning-soft halo, message below in warning body-sm with a triangle icon, `aria-invalid` and `aria-describedby`. Search fields are pills on surface-2 without a border.
- **Cards** (`card`, `card-meta`, `divider`, `alert-band`): white, radius 14, 1px line, shadow-1, 20px padding; hover lifts 2px to shadow-2 in 250 ms. An alert item card leads with a 48px red band ("ON A NOTICE" badge + source line) and its illustration tile turns danger-soft.
- **Category tiles and marks** (`category-tile-*`, `category-mark-*`, `illustration-tint-*`): 88px tile in the category's soft colour holding a two-tone illustration (mark colour + tint + white).
- **Annotation chips** (`annotation-chip`, `annotation-chip-alert`): white or red chips joined to the object by a 2px dashed leader line ending in a dot or ring. Used on the landing strip, the OG image, and the kit's anatomy drawing.
- **Palette** (`palette`, `palette-row`, `palette-row-active`): cmdk, 640px, radius 22, shadow-3 over the ink scrim. 60px input, groups My things · Notices · Go to · Actions, 52px rows with a 36px icon tile, active row primary-soft, matched characters in 700 ink, footer with ↑ ↓ ↵ esc hints and "Searching 4,868 notices and 15 things".
- **Toast** (`toast`): sonner, white, radius 14, shadow-2, bottom-right (above the tab bar on phones), 5 s dwell, at most one action named for its result. Only the source-down toast shows red, as a dot.
- **Tooltip** (`tooltip`): ink with white body-sm, radius 6, 600 ms first delay then instant.
- **Skeleton** (`skeleton`): surface-2 blocks shaped like the content, opacity pulse 1 to 0.55 over 1.4 s, shown only after 300 ms.
- **Empty states** (`empty-state`, `empty-state-404`): say what would be here, why it's empty and one next step, using the product's own objects (an empty blister, a search, a "B.No. 404" foil chip).
- **Seal** (`seal-verified`, `seal-invalid`): round 144px stamp, VERIFIED in success, INVALID in danger.

## Do's and Don'ts

- Do keep red for "you are affected": alert faces and badges, INVALID seal, a source that is down, the logo pocket, the red pill. Don't use red for form errors (use warning), links, delete icons or charts.
- Do use one filled cobalt button per view, and name buttons by their result. Don't write "Submit", "OK" or "Learn more".
- Do write "failed CDSCO quality test, JUL-2026 alert, row 12" for a CDSCO NSQ hit. Don't write "recalled" for a CDSCO row. Don't write "safe"; write "No match in 4 sources as of 15:08".
- Do show every number from data (4,868 notices; CDSCO 2,696 · CPSC 1,852 · openFDA 282 · NHTSA 38). Don't invent or round them.
- Do put codes on foil chips in Doto. Don't set words in Doto or labels in Plex Mono.
- Do make squares categories and circles status. Don't put text in a category colour.
- Do vary card spans by content. Don't lay out a row of three identical cards.
- Don't use indigo or violet anywhere: cobalt's hue is 259, and the Tailwind default palette is removed.
- Don't use gradients except the foil and the one radial glow behind the landing strip: no gradient text, no glass, no glow blobs, no grain, no `border-l-4` side stripes, no eyebrow chip over every heading, no emoji.
- Do animate only state changes, with springs (bounce 0.1) at 250, 320 or 400 ms and one orchestrated load sequence per page. With reduced motion, keep opacity and colour changes only.
- Do keep 44px touch targets, a visible focus ring on every control and WCAG AA text.
