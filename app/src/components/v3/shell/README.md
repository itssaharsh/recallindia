# Shell · RecallIndia v3 "Cobalt & Foil"

Production React for the app shell, the shell-owned primitives, the `/kit` page and the 404 page.
Spec: `v3/spec/shell-tokens.md`. Tokens: `v3/code/globals.tokens.css`. Stack: Next.js 15 (App Router, `output: "export"`),
React 19, Tailwind 4, framer-motion 11, @number-flow/react, lucide-react, clsx.

Everything here is presentational and typed. Nothing fetches and nothing calls an API: the shell reports what the
user asked for (a search query, a household action, a navigation) and the app answers through props.
Shared primitives come from `../ui` (Button, Chip, Dot, Kbd, FoilChip, Card, cn) and are not re-implemented.

Type-check: `tsc -p tsconfig.shell.json` → **0 errors** (strict, TypeScript 5.9, @types/react 19).

---

## 1. Components

| File | Exports | What it is |
|---|---|---|
| `AppShell.tsx` | `AppShell`, `AppShellData`, `AppShellHandlers` | Top nav (≥ 768) or top bar + bottom tab bar (< 768), ⌘K palette with its hotkeys, toast host, skip link. One `MotionConfig reducedMotion="user"`. |
| `TopNav.tsx` | `TopNav` | Sticky 64 px white bar: lockup → tabs (sliding `layoutId` pill, red count on My things) → household pill → search trigger. |
| `MobileTopBar.tsx` | `MobileTopBar` | Sticky 56 px bar: lockup (26/19) → compact household pill ("Demo household", nowrap) → 44 px search button. |
| `BottomTabBar.tsx` | `BottomTabBar` | Fixed 64 px + `env(safe-area-inset-bottom)`; 56 × 32 icon pill that slides between tabs; badge 18 px with a 2 px white ring. |
| `HouseholdPill.tsx` | `HouseholdPill` | Three states (demo · copying · yours), md 40 / compact 36, 320 ms cross-fade + width spring, NumberFlow count, `aria-live`, light dropdown menu. |
| `SearchTrigger.tsx` | `SearchTrigger` | 268 × 40 "Search 4,868 notices" + ⌘K (Ctrl K off Apple); a 44 px round button below 1180 px. |
| `CommandPalette.tsx` | `CommandPalette` | Light cmdk: dialog (640, top 88, scrim over the nav) or full-screen sheet on phones. Combobox + listbox, ↑ ↓ ↵ esc, focus trap and return, scroll lock. |
| `palette-items.tsx` | `thingToPaletteItem`, `noticeToPaletteItem`, `goToItems`, `actionItems`, `recentItems`, `matches`, `highlight`, `API_BASE` | Data → palette rows, local filtering and the bold match highlight. |
| `Toast.tsx` | `ToastCard`, `sonnerToastOptions`, `sonnerToasterProps`, `sonnerIcons`, `ShellToaster`, `shellToast` | The three toast kinds, a sonner className map, and a light local toaster with the spec motion. |
| `EmptyState.tsx` | `EmptyState` | `household-empty` (foil blister), `feed-none` (search glass + query pill), `not-found` (cobalt-soft panel, "B.No. 404"). |
| `Skeleton.tsx` | `Skeleton`, `SkeletonFeedRows`, `SkeletonItemCard`, `SkeletonStat`, `Loadable` | Opacity-only pulse; `Loadable` shows the skeleton only after 300 ms and fades content in over 180 ms. |
| `Tooltip.tsx` | `Tooltip`, `TooltipBubble` | Ink tooltip, 600 ms first delay, instant for 300 ms after one closes. |
| `primitives.tsx` | `IconButton`, `TextField`, `SearchField`, `FilterPill`, `FilterBar`, `SourceChip`, `AlertBadge` | Spec §6 primitives that `ui/` does not have yet (see §7). |
| `Brand.tsx` | `Mark`, `Lockup`, `LockupOutlined` | From `v3/brand/*.svg` (paths copied verbatim, c2pa metadata dropped). `Lockup` uses live text sized per bar; `LockupOutlined` is the outlined `lockup.svg`. |
| `illustrations.tsx` | `CategoryTile`, `CategoryIllustration`, `CategoryMark` | One two-tone illustration per category (strip, SUV, fan, flask) for palette tiles and the kit. |
| `icons.tsx` | `IconHouse`, `IconFeed`, `IconIngest`, `IconThings`, `IconApi`, `IconSearch`, `IconAlert`, `IconCheck`, `IconNear`, `IconSpinner`, `IconRingCheck`, `IconRingPlus`, `ProgressRing`, `IconSignal` | The product glyphs from the kit mockup's `<symbol>`s. Generic icons come from lucide-react. |
| `KitView.tsx` | `KitView`, `KIT_STATES`, `isKitState` | `/kit`: every primitive and state, from one props object. |
| `kit/*.tsx` | section components | Intro + sections 01–10 of the kit, plus kit-only parts (section header, panel, phone frame, annotation chip). |
| `NotFoundView.tsx` | `NotFoundView` | The 404 page in the shell (h1 "This page isn't on any list"). |
| `fixtures.ts` | `STATS`, `HOUSEHOLD_ITEMS`, `NOTICES`, `NOTICE_FT5427`, `TOASTS`, `EVIDENCE`, `SHELL_FIXTURE`, `KIT_FIXTURE`, `NOT_FOUND_FIXTURE`, `searchNotices`… | Real demo data from the brief, typed as the API returns it. |
| `types.ts`, `tabs.ts`, `motion.ts`, `hooks.ts`, `format.ts`, `links.tsx`, `index.ts` | | Types; tab list + `tabForPath`; framer twins of the motion tokens; hooks; formatters; link injection; barrel. |

---

## 2. Props → API fields

| Prop | Source | Notes |
|---|---|---|
| `total` (AppShell, TopNav, SearchTrigger, palette footer, empty states) | `GET /v1/stats` → `total` | `null` while loading ("Search notices"). Formatted `en-IN` (4,868). Refresh on window focus. |
| `SourceChip.source` / `KitViewProps.stats.sources` | `GET /v1/stats` → `sources[].{source,label,count,health,last_success_at,last_error}` | `healthy` → success dot + count; `degraded` → "slow · {count}"; anything else → danger dot + "down since {HH:MM IST of last_success_at}". |
| `EmptyState household-empty.sourcesCount`, `feed-none.sourceLabels` | `sources.length`, `sources[].label` | Copy: "from 4 regulators", "from CDSCO, CPSC, NHTSA and openFDA". |
| `things: HouseholdItem[]` | household store (same item call as v2 `/mine`) | Fields: `item_id`, `kind`, `name`, `brand`, `batch`, `make`, `model`, `year`, `purchase_date`, `status`, `notice_id`, `case_id`, `last_checked_at`, plus `listed_batch` and a derived `face` (mine.md "Face derivation"). |
| Red count on My things | `things.filter(face === "alert").length` | Derived inside AppShell; the badge only renders while > 0. |
| `household: HouseholdState` | household store | `demo` = id `demo`, `count` 15; `copying` = `copied`/`total` as items are written; `yours` = `household_id`, `count`, optional `name`. |
| `notices`, `noticesStatus`, `noticesQuery` | `GET /v1/notices?q={query}&limit=5` | Fields: `pk`, `source`, `notice_id`, `row_ref.{month,row}`, `product`, `brand`, `batches`, `model`, `hazard_or_failed_test`, `published_at`. `offline` → "Can't reach the API. Showing your things only." Echo the fetched `q` as `noticesQuery` so a slower response for an older query never shows under the new one. |
| Palette row links | | Things → `/case/?id={case_id}` (alert / needs-you with a case) else `/mine?item={item_id}`. Notices → `/feed?notice={pk}` (URL-encoded, as the feed spec). |
| `KitViewProps` | `KIT_FIXTURE` | `shell`, `stats`, `sourcesDemo`, `items`, `notices`, `alertNotice`, `toasts`, `evidence`, `asOf`, `cdscoLatest`, `strip`, `searchNotices`, `state`. |

---

## 3. Which mockup each component matches

| Component | Mockup (in `v3/mockups/`) |
|---|---|
| `TopNav` (live and the anatomy frame), `Lockup`, `HouseholdPill` demo, `SearchTrigger` full | `kit-full-1536.png` top bar and section 01 |
| `TopNav layout="tablet"` (pill without "· read-only", 44 px search), scrim over the nav, `CommandPalette` dialog | `kit-full-1536.png` section 08 |
| `MobileTopBar`, `BottomTabBar` (no active tab on /kit, red "2" on My things) | `shell-390.png`; phone frames in section 01 |
| `CommandPalette` sheet | `kit-full-1536.png` section 01, right phone |
| `HouseholdPill` three states | section 06 |
| `TextField`, `SearchField`, `FilterPill`/`FilterBar`, `SourceChip` | sections 05 and 06 |
| `ToastCard` × 3 | section 08 |
| `EmptyState` × 3 | section 09 |
| `Skeleton*`, motion curves | section 10 |
| `KitView` as a whole | `kit-full-1536.png` (1536 × 9819) and `shell-390.png` |

Checked by rendering the real components (esbuild + Tailwind 4 over `globals.tokens.css`, fonts from @fontsource) and
comparing slice by slice with the PNGs. At 1536 the page measures 1536 × 9823 against the mockup's 9819. `scrollWidth` equals the
viewport at 1536 and 390. It also renders with `react-dom/server` (`renderToString`) for every view, which the static export needs.

---

## 4. Wiring it into the routes

```tsx
// app/(app)/layout.tsx: every app route (/feed, /ingest, /mine, /case, /api, /kit) shares one shell instance,
// so the tab pill slides between routes. The landing (/) is outside this group and uses its own nav.
import { AppProviders } from "./providers";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
```

```tsx
// app/(app)/providers.tsx
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppShell, ShellLinkProvider, tabForPath, type ShellLinkComponent } from "@/components/v3/shell";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const stats = useStats();            // GET /v1/stats, cached for the session, refreshed on focus
  const household = useHousehold();    // the existing household store: { state, items, act(action) }
  const search = useNoticeSearch();    // GET /v1/notices?q=&limit=5 → { notices, status, query, run(q) }
  return (
    <ShellLinkProvider component={Link as unknown as ShellLinkComponent}>
      <AppShell
        activeTab={tabForPath(pathname)}
        total={stats.data?.total ?? null}
        household={household.state}
        things={household.items}
        notices={search.notices}
        noticesStatus={search.status}
        noticesQuery={search.query}
        recentSearches={search.recent}
        onSearch={search.run}
        onHouseholdAction={household.act}
        onNavigate={(href) => router.push(href)}
      >
        {children}
      </AppShell>
    </ShellLinkProvider>
  );
}
```

- **Kit page.** `app/(app)/kit/page.tsx` renders a client component that reads `?state=` with `useSearchParams()` inside
  `<Suspense>` (required with `output: "export"`), then `<KitView {...KIT_FIXTURE} state={isKitState(s) ? s : null} />`.
  `KitView` includes its own `AppShell`, so exclude `/kit` from the group layout (put it in its own route group) or add a
  `bare` flag to the layout. Title: "Kit · RecallIndia".
- **404.** `app/not-found.tsx` → `<NotFoundView shell={…live shell data…} />` (or `NOT_FOUND_FIXTURE`). Title: "Not on any list · RecallIndia".
  It exports as `404.html`.
- **Fonts.** `fonts.ts` puts `--font-funnel-display`, `--font-onest`, `--font-doto` and `--font-plex-mono` on `<html>`. The tokens
  read those variables, so without `fontVariables` on `<html>` every family falls back.
- **Toasts, with sonner.** Pass `toaster={<Toaster {...sonnerToasterProps} />}` to `AppShell`, then either
  `toast.success(title, { description })` (styled by `sonnerToastOptions.classNames` and `sonnerIcons`) or, for the exact
  look with the green "VERIFIED" emphasis, `toast.custom((id) => <ToastCard {...data} onDismiss={() => toast.dismiss(id)} />)`.
- **Toasts, without sonner.** The default is `<ShellToaster/>` and `shellToast.show({ kind, title, description, action })`: newest on top,
  max 3, in from 12 px below with a 250 ms spring, 5 s dwell paused on hover and focus, out in 180 ms.
- **Palette actions.** "Make my own copy" calls `onHouseholdAction("make-copy")`. "Copy API base URL" copies and toasts unless
  `onPaletteAction` handles it. "Add a thing" navigates to `/mine?add=1` (see §6).
- **Other screens** can import `HouseholdPill`, `FilterBar`, `SourceChip`, `TextField`, `Skeleton*`, `EmptyState`, `ToastCard` and
  `CategoryTile` from `@/components/v3/shell` instead of rebuilding them.

---

## 5. Motion and accessibility

- **Motion** is exactly as spec §7. Tabs and the tab-bar pill use a 250 ms spring (bounce 0.1). The household pill cross-fades
  and springs its width in 320 ms. The palette scrim fades in 180 ms; the dialog runs opacity 0 → 1 and scale .98 → 1 in a 250 ms
  spring; the phone sheet slides from −24 px in a 320 ms spring. Exits are opacity only, 180 ms `--ease-in`. Numbers use NumberFlow
  with a 250 ms `--ease-spring`. The kit has one orchestrated load sequence (heading, lede, facts and the three tiles, 40 ms apart)
  and nothing else animates on load. `MotionConfig reducedMotion="user"` plus the tokens' reduced-motion CSS keep opacity only.
- **Landmarks:** a skip link, `<header>`, `<nav aria-label="Main">` and `<main id="main">`. The desktop and phone bars are both in the
  DOM, but `display: none` removes one of them from the accessibility tree.
- **Current page:** tabs carry `aria-current="page"`. The badge reads as ", 2 on a notice" after "My things".
- **Palette:** `role="dialog"`, `aria-modal`, `aria-label="Search"`; the input is a `combobox` with `aria-activedescendant`
  over a `listbox` of grouped `option`s. A polite live region announces "{n} results". Esc closes and returns focus.
- **Household pill:** `aria-haspopup="menu"` and `aria-expanded`; while copying it is `aria-disabled`. A polite live region says
  "Copying 15 things", then "Done". The menu has `role="menu"`, arrow keys, Home/End, Esc and outside click.
- **Toasts:** `role="status"`; source-down uses `role="alert"`. Filter pills sit in a `role="toolbar"` with roving focus.
- **Focus:** focus is visible everywhere through the tokens' `:focus-visible` ring; menu items and palette rows use an inset 2 px cobalt ring.
- **Touch:** 44 px targets under `pointer: coarse`. Nav tabs and the search field grow to 44. The 36/40 px household pill gets an
  invisible 44 px hit area. Close buttons, query chips and suggestion pills grow to 44.
- **Kit specimens** (the phone frames, the anatomy nav and the stage nav) sit in `inert` wrappers, so they stay out of the tab order.

---

## 6. What the backend and the other parts must provide

1. **`GET /v1/notices?q=` must match batch codes and notice ids**, not only product names. The palette's Notices group and the feed's
   "Batch codes match exactly" copy both depend on it.
2. **`/v1/stats` → `sources[].health` and `last_success_at`** for every source. The source chip and the source-down toast read them.
3. **The household store must expose `face` or the fields to derive it** (`status`, `case.decision`, `last_checked_at`, the check-status
   poll), plus `listed_batch` on near misses. The palette uses it for "Batch FT5428 · listed batch is FT5427".
4. **The household copy must report progress** (`copied` of `total`) so the pill can tick 1 → 15. If the API writes all 15 at once,
   drive the count with `useTicker(true, 15, 1200)` and switch to `yours` when the POST resolves.
5. **Query parameters the shell links to:** `/mine?add=1` opens the Add a thing sheet; `/mine?item={item_id}` scrolls to and focuses that
   card; `/feed?notice={pk}` opens the notice sheet (already in the feed spec).
6. **The "A" shortcut** shown on "Add a thing" is the /mine part's to bind; the shell only displays it.
7. **Fixture placeholders to replace:** `item_id`s (`demo_*`), the pk `cdsco_nsq#JUL-2026-row-129`, and a `case_id` for the Jeep alert
   (none is known, so the palette sends it to `/mine?item=`). The FT5427 pk comes from the feed spec's deep-link example. Dates the
   brief doesn't give (CPSC 10982 and 2510) are left out rather than invented.

---

## 7. Gaps and deviations (to fix upstream)

**`ui/` primitives.** Each is composed around here, not re-implemented.
- **`Button`**
  - It has no `lg` (54 / 0 26 / 17) or `icon` size. The kit passes `style={{ height: 54, paddingInline: 26, fontSize: 17 }}`;
    `IconButton` covers icon buttons.
  - At rest `secondary` has a `line` border; spec §6.1 and the PNG want `line-strong`. On the cobalt-soft 404 panel the border disappears.
  - `ghost` rests in `ink-muted`; the PNG has `ink`.
  - Focus uses `outline`, not the tokens' two-ring `box-shadow`.
  - There is no forced-state prop, so the kit's matrix draws hover and press with inline styles.
- **`Chip`**
  - It has no `md` size (32 / 13 px). The kit's `ChipMd` wraps it with `[&>span]:` overrides.
  - It lacks `white-space: nowrap` (spec §6.2). The shell adds it on the parents.
- **`FoilChip`**
  - The near-miss `diff` underline is **cobalt**; spec §6.6 and the PNG say **warning**, 3 px (4 px at lg), 6/8 px below the baseline.
  - `sm` should use radius 6.
  - The gradient is hard-coded hex instead of `var(--foil)`.
- **`Card interactive`** lifts 1 px and changes only the border. Spec §6.8 wants −2 px, `shadow-2` and a `#CBD5E3` border in 250 ms.
- **`Kbd`** takes no `className`; the shell recolours it with `[&>kbd]:` from the parent.

**Colours with no token.** These are used as arbitrary values, and each should become a token:
- `#DCE5F1`: hover on surface-2 controls and ghost press (`SURFACE_2_HOVER`)
- `#C9D3E3`: count on the ink filter pill
- `#CBD5E3`: hovered card border
- `#D9E5F8`: on-blue press
- the red pill's radial shading (kit tile only, echoing the 3D render)

**Spec conflicts, resolved as noted.**
- **mine.md §1 vs this spec.** mine.md gives a 68 px tab bar and a 28 px logo. This part owns the shell, so both follow
  shell-tokens §3: 64 px and mark 26.
- **case.md vs spec §6.4.** case.md shows "My household · 15 things" with an avatar initial. The pill follows spec §6.4:
  "Your household · 15 things" with a cobalt house disc.
- **Search breakpoint.**
  - Spec §2 says the tablet search collapses at 768–1023. The kit PNG and the breakpoint copy collapse it below **1180**, because
    the full nav needs about 1,120 px. The code follows 1180.
  - Below 1024 the gutter is 24 and tab padding 12, so the whole bar fits at 768.
- **Palette under a query.** The phone-sheet PNG shows "Go to" rows under "FT54"; the dialog PNG shows "Actions: Add a thing".
  The code applies one rule everywhere:
  - Go to lists only pages whose name matches.
  - "Add a thing" always shows under a query.
- **⌘K label.** It shows "Ctrl K" on non-Apple platforms (spec §6.5). The PNGs, shot on a Mac layout, show ⌘K.
