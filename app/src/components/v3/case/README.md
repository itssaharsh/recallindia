# /case components (v3 "Cobalt & Foil")

This folder holds production React for `/case/?id=`: the claim, sealed. It is built from `spec/case.md`, and each component matches one of the six case mockups. Every component is presentational and typed. Nothing in this folder fetches. `CaseView` composes the whole page from one `CaseViewProps` object, and `fixtures.ts` renders every `?state=` value with the brief's real demo data.

Drop the folder in at `src/components/v3/case/`, next to `src/components/v3/ui/` (it imports `../ui`). Stack: React 19, framer-motion 11, `@number-flow/react`, `lucide-react`, `clsx`. Tailwind 4 reads the theme from `globals.tokens.css`.

## Components

| File | Component(s) | Spec | Matches mockup |
|---|---|---|---|
| `CaseView.tsx` | `CaseView`: page composition, layout per breakpoint, beat side effects (focus, B1b scroll, B6 toast, live region) | §1, §2, §4 | all six |
| `CaseCrumbs.tsx` | `CaseCrumbs`, `crumbChip()` | C1 | top row of `case-1536.png`, `case-390.png` |
| `CaseHeader.tsx` | `CaseHeader`, `SoldAfterCalendar`, `GapPanel` (gaps over 31 days), `YearsPanel` (vehicles), `CaseHeaderSkeleton` | C2 | header card of `case-1536.png`, `case-390.png` |
| `ApprovalGate.tsx` | `ApprovalGate` (waiting / readonly / approving / inline dismiss confirm) | C3 | gate in `case-waiting-1536.png` |
| `ReceiptPill.tsx` | `ReceiptPill` (done / running / approved / rejected / expired), `PipelineErrorCard` | C3, §1 failed | receipt in `case-1536.png` |
| `NoticeAsPublished.tsx` | `NoticeAsPublished`, `withMark()` | C4 | notice card in `case-full-1536.png` |
| `BatchVsList.tsx` | `BatchVsList` (strip-back illustration + character tiles + chip row + near-miss footer) | C5 | batch card in `case-full-1536.png`, `case-full-390.png` |
| `EvidenceBand.tsx` | `EvidenceBand` (band + certificate + seal choreography), `ClaimLetterPaper`, `GhostPaper`, `DownloadButton`, `bandSealFor()` | C6, C7, §4 B3–B5, §5 | band in `case-full-1536.png`, `case-waiting-1536.png`, `case-invalid-1536.png` |
| `TamperDiff.tsx` | `TamperDiff` | C6 sub-component | diff card in `case-invalid-1536.png` |
| `PipelineAside.tsx` | `PipelineAside` (`layout="column"` case file, `layout="strip"` for 768–1439), `pipelineModel()` | C8 | right column of `case-1536.png`, `case-waiting-1536.png`, `case-invalid-1536.png` |
| `ShowWork.tsx` | `ShowWork` | C9 | bottom card of `case-full-1536.png` |
| `Seal.tsx` | `Seal`, `SealBase`, `SealCentre`, `sealArcText()` | C7 | seals in all captures (176 band, 132 at 390, 68 mini) |
| `illustrations.tsx` | `StripIllustration`, `SuvIllustration`, `ThingIllustration`, `LogoMark` | C2 tile, paper letterhead | tile in `case-1536.png` |
| `CaseToast.tsx` | `CaseToast`, `useCaseToast()`: a light local toast (sonner is not installed in the sandbox) | §4 B6, C6 copy | none |
| `hooks.ts` | `useCasePhase()` (minimum-dwell queue), `uiStateFrom()`, `useLive`, `useElapsed`, `useVisibleRatio`, `scrollPageTo()` | §4 | none |
| `format.ts` | IST/UTC formatting, hashes, bytes, CDSCO row parsing, reasoning and audit phrasing, letter parsing | none | none |
| `motion.ts` | eases, springs and dwells from the spec | §3 to §5 | none |
| `classes.ts` | recurring class lists (`FIELD_LABEL`, `SEC_PAD`, `CHIP_LG`, `SR_ONLY` …) | none | none |
| `fixtures.ts` | `caseFixture(state)`, `DEMO_CASE`, `DEMO_NOTICE`, `DEMO_ITEM`, `VERIFY_OK`, `TAMPER`, `JEEP_ITEM`/`JEEP_NOTICE` … | brief | none |
| `types.ts` | API types (snake_case, 1:1 with the API) and view props | §7 | none |

## Props → API fields

`CaseViewProps` (one object; everything below it is derived):

| Prop | Source |
|---|---|
| `state` | `useCasePhase(uiStateFrom(case.status, {demo, tampered, failed}))`. You can override it with `?state=`. |
| `caseRecord` | `GET /cases/{id}`, passed through unchanged |
| `notice` | `GET /v1/notices/{case.notice_id}` |
| `item` | `GET /items/{case.item_id}` |
| `household` | `{id, demo, name, thing_count}` from the household pill / session |
| `nearMiss` | the household item whose near-miss points at `case.notice_id` (`{item_id, batch, status}`) |
| `verify` | `GET /cases/{id}/verify-evidence`, once on load in the verified state and again after "Verify again" |
| `tamper` | `GET /cases/{id}/verify-evidence?tamper=1` |
| `verifiedAgainAt` | `verify.checked_at` of the "Verify again" call |
| `claimPdfUrl` | the presigned URL for `case.claim_pdf_s3_key` (see Backend) |
| `clientAudit` | tamper runs appended client-side (`{ts, event:"evidence.tamper_test", detail:{flipped_byte_index, byte_before, byte_after}}`) |
| `pending` | in-flight flags: `approve`, `dismiss`, `tamper`, `verify` |
| `timedOut` | the 30 s polling budget ran out |
| `on.*` | `onApprove` → `POST /cases/{id}/approve`; `onDismiss` → `POST /cases/{id}/reject`; `onRunTamperTest` / `onVerifyAgain` → verify-evidence; `onMakeCopy` → copy the demo household; `onCheckAgain` → re-run the item check; `onCheckStatus` → one more poll. Copy handlers default to the clipboard. |

Per component (what each field feeds):

| Component | Fields |
|---|---|
| CaseCrumbs | `case.case_id`, `case.created_at` (opened date), `item.name`, page state, `verifiedAgainAt` |
| CaseHeader | `notice.source`, `notice.row_ref.{month,row}`, `notice.published_at`; `item.kind`, `name`, `brand`, `batch` / `serial` / `year`, `purchase_date`; `case.sold_after_notice`. n = `purchase_date − published_at` in days. Vehicles use `notice.model_years` + `item.year`. |
| ApprovalGate | `case.claim_addressee`, `notice.source`/`row_ref.row` ("row 12"), `item.kind` ("strip") |
| ReceiptPill | `case.approval.approved_at` (or `steps.approve.finished_at`), `rejected_at`, `expired_at`; the total = `steps.verify.finished_at − steps.approve.finished_at` |
| NoticeAsPublished | `notice.product`, `batches`, `mfg_date`, `exp_date`, `manufacturer`\*, `hazard_or_failed_test`, `lab`, `lab_type`\*, `row_ref`, `published_at`, `url`; raw row = `case.quoted_sentence` (else `notice.raw_excerpt`), rendered character for character; bytes = `evidence.snapshot_bytes` or `case.pending_snapshot_bytes`\* |
| BatchVsList | `case.range_check.{yours,listed}` (the tiles come from these strings), `case.reasoning` (same maker / same medicine), `item.mfg_date` / `exp_date` (the strip prints only what exists), `nearMiss.batch` |
| EvidenceBand / certificate | `case.evidence.{sha256, signed_at, key_alias, signing_algorithm, object_lock_mode, object_lock_retain_until, snapshot_bytes, snapshot_kind, snapshot_s3_key}`, `case.claim_text` (paragraphs as written; the preview stops after the paragraph that begins "I bought it on"), `case.claim_addressee`, `verify.checked_at` ("Last checked"), `tamper.checked_at` ("Tested") |
| TamperDiff | `tamper.{flipped_byte_index, byte_before, byte_after, recomputed_sha256, demo_control}`, `evidence.{sha256, snapshot_bytes}`. Marker = `flipped_byte_index / snapshot_bytes`. The recomputed hash is always the API's value. |
| PipelineAside | `case.steps.{approve,seal_evidence,write_letter,verify}.{started_at,finished_at,error}` (durations to 1 decimal; approve shows `finished_at` in IST HH:MM:SS), `evidence.object_lock_retain_until − signed_at` (days), `tamper.duration_ms`\* |
| ShowWork | `case.reasoning` (split on "; "), `case.verifier`, `case.confidence`, `case.audit[]` in API order (+ `clientAudit`), `evidence.key_alias` |

\* = the backend must add this (see below). Each one has a fallback.

## Wiring into the existing route

`app/case/page.tsx` stays a static-export page and reads `?id=` on the client:

```tsx
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CaseView, useCasePhase, uiStateFrom, CASE_UI_STATES, POLL_MS, POLL_BUDGET_MS, type CaseUiState } from "@/components/v3/case";

function CaseRoute() {
  const q = useSearchParams();
  const id = q.get("id") ?? "case_demo_ft5427";
  const forced = q.get("state") as CaseUiState | null;           // ?state= for /kit, QA and the video
  const data = useCaseData(id);                                   // your existing fetch/poll hook (below)
  const latest = data.caseRecord
    ? uiStateFrom(data.caseRecord.status, { demo: data.household.demo, tampered: data.tamper?.tampered, failed: data.failed })
    : "loading";
  const shown = useCasePhase(latest);                             // minimum dwells 400 / 1200 / 1400 / 900 ms
  return <CaseView {...data} state={forced && CASE_UI_STATES.includes(forced) ? forced : shown} />;
}
export default function Page() { return <main><Suspense><CaseRoute /></Suspense></main>; }
```

What `useCaseData` (page code, not in this folder) does:
1. Load `GET /cases/{id}`, then `GET /v1/notices/{notice_id}` and `GET /items/{item_id}`. Send `x-household` unless the household is the demo.
2. In the verified state, call `verify-evidence` once and pass the result as `verify`.
3. `onApprove`: set `pending.approve`, then `POST /approve`. Put the returned `{case}` into state. Then poll `GET /cases/{id}` every `POLL_MS` (600) until `status ∈ {verified, rejected, expired}`, a `steps.*.error` appears (→ `failed`), or `POLL_BUDGET_MS` (30 s) passes (→ `timedOut`). Every response goes straight into `caseRecord`: `useCasePhase` queues the beats and fills any skipped ones.
4. `onRunTamperTest`: `?tamper=1` with a 500 ms minimum dwell. Set `tamper`, and append the client audit row. `onVerifyAgain`: plain verify-evidence with a 500 ms dwell, then clear `tamper` and set `verifiedAgainAt = checked_at`.
5. `claimPdfUrl`: the presigned URL for `claim_pdf_s3_key`.

Other wiring notes:
- **Shell.** `CaseView` renders no nav and no `<main>`. The app shell (64 px nav, mobile tab bar with "My things" active) and the page's `<main>` wrap it. `CaseView` draws its own page gutter (32 / 24 / 16) and max width 1536.
- **Toasts.** `CaseToast` is a light stand-in for sonner. In the repo you can keep it, or replace the `showToast(...)` calls in `CaseView.tsx` with sonner's `toast(text, { action })`. The copy stays the same: "Claim letter ready · evidence sealed and verified" with the action "Download PDF", "Letter copied" and "Case JSON copied". The live region already announces each message, so the toast is not live.
- **Shared-element morph from My things** (C2): pass `sharedLayout`. The band, tile and foil chip get `layoutId`s `alert-band-{item_id}`, `tile-{item_id}` and `foil-{item_id}`. The My things alert card has to use the same ids, and both routes need to sit under one persistent `LayoutGroup` in the app layout. If they don't, the page falls back to its load sequence: the calendar fill plus the body fading in at 120 ms for 240 ms.
- **/kit and the video.** `<CaseView {...caseFixture("invalid")} animateOnMount={false} />` renders any state statically. The invalid fixture sets `bandInView: true` so the case-file actions are collapsed, as in `case-invalid-1536.png`.

## Motion (where each beat lives)

| Spec beat | Where |
|---|---|
| Header morph / calendar fill (cells 22 ms stagger → bracket clip 320 ms → pill spring 500/26) | `CaseHeader`, `SoldAfterCalendar` |
| Crumb chip crossfade 160 ms + width spring 420/36 | `CaseCrumbs` |
| Gate → receipt: shared `layoutId="approval"`, spring 380/34, radius 22 → 999 (14 under 768), receipt content fades in after 80 ms for 180 ms | `ApprovalGate`, `ReceiptPill` |
| B1 focus to the receipt; B1b rAF scroll to band top 80 px (700 ms, `cubic-bezier(.65,0,.35,1)`, cancelled by wheel/touch/key, skipped if the user scrolled within 1.5 s, once per run) | `CaseView` |
| B2 slot ring dashoffset loop 1.6 s | `EvidenceBand` → `SealSlot` |
| B3 flood (`clip-path: circle()` from the seal centre, 560 ms), stamp (1.8 → .94, −24 → −8°, 220 ms `cubic-bezier(.55,0,.9,.4)`), impact (2 px nudge, two rings, `navigator.vibrate(12)` on coarse pointers), settle spring 600/30, key-value reveal at 380 ms with 50 ms stagger, lock chip at 400 ms | `EvidenceBand`, `NoticeAsPublished` |
| B3 t = 400 ms case-file update, X4 +300 ms | `CaseView` (`useChromeState`) |
| B4 ghost → paper: lift spring 400/32, blocks 220 ms with 70 ms stagger, actions 200 ms | `ClaimLetterPaper`, `EvidenceBand` |
| B5 centre flip rotateY 0 → 90° (140 ms ease-in) → swap → spring 520/30, check draws 240 ms, ring and arc crossfade 200 ms, NumberFlow total 400 ms | `EvidenceBand`, `PipelineAside` |
| B6 toast at +300 ms | `CaseView` |
| X1 lift → INVALID stamp → shake; X2 diff open (spring 380/34), marker scaleY at +260, hex swap at +420; X3 hash fade and chip pop; X5 minimum scroll | `EvidenceBand`, `TamperDiff` |
| V1 diff close (160 / 260 ms) and re-stamp at 0.8× with rings | `EvidenceBand` |
| Case file: node crossfade 140 ms + spring 500/28, check draw 220 ms, connector scaleY 280 ms, actions collapse at ≥ 30 % band visibility (200 ms; opacity only under reduced motion) with focus handed to the band's matching button | `PipelineAside` |
| Show work: height spring 380/34, chevron 250 ms | `ShowWork` |

`MotionConfig reducedMotion="user"` wraps the page. Under reduced motion there is no flood, stamp, shake, flip, lift or auto-scroll: each change is a 150 ms opacity crossfade, the receipt shows "Jump to your claim ↓", the pulses are static, and the spinners stop through the global rule in `globals.tokens.css`.

## Accessibility
- The page's headings run h1 `#case-title` (the header article is `aria-labelledby` it), then h2 for the gate, notice, batch, band (`#band-h`), case file (visually hidden) and Show work, then h3 inside the certificate and case file. The breadcrumb is a `<nav>` and the case file is an `<aside>`. There is no `role="dialog"` anywhere: dismissing uses an inline confirm.
- One `role="status" aria-live="polite"` region at page level announces "Approved. Sealing your claim.", "Step 2 of 4, sealing evidence", "Evidence sealed.", "Letter written.", "Signature verified. Your claim letter is ready.", the tamper and "Verified again" lines, and "Letter copied". Spec C8 puts this region in the case file's status block. It lives at page level here so that it survives the 768–1439 strip layout, where the column case file is `display:none`.
- The crumb chip sits in its own `role="status"`, and the TamperDiff is `role="status"`. The seal is `role="img"` with the name "Seal: verified", "Seal: invalid" or "Seal: sealed". The calendar and the batch comparison are `role="img"` with the spec's labels, and their tiles are hidden from assistive tech.
- Focus moves to the receipt after approval (`tabIndex=-1`, no scroll). "Run tamper test" and "Verify again" hand focus to each other when one replaces the other. The case-file action block hands focus to the band's matching button (`data-action`) before it collapses, and it is `inert` while collapsed.
- The minimum 44 px targets under `pointer: coarse`: the gate buttons are 56 and 48; `sm` buttons get `pointer-coarse:h-11` (the `h-10!` overrides also carry `pointer-coarse:h-11!`); the back pill's hit area is padded to 44; the summary is `min-h-11`.

## Backend additions

1. **`case.pending_snapshot_bytes`**: the size of the snapshot that will be sealed, known before approval. It drives "671 bytes · sealed when you approve" and the waiting certificate's Snapshot row. Without it the copy drops the number ("Sealed when you approve").
2. **`notice.manufacturer` and `notice.lab_type`** for CDSCO rows (portal columns 5 and 7). Without them the component parses them out of `raw_excerpt`.
3. **A presigned PDF URL** for `claim_pdf_s3_key` (for example `GET /cases/{id}/claim.pdf` → 302, or a `claim_pdf_url` field). `claimPdfUrl` feeds a plain `<a download>`.
4. **`duration_ms` on `verify-evidence`**, both plain and `?tamper=1`. Aside step 4 shows "0.9 s" after a tamper run. Without it the step keeps its own duration.
5. **NHTSA notices**: `campaign`, `component` and `model_years: [from, to]`, for the vehicle header (YearsPanel) and the notice fields.
6. **`approval.approved_at` in the approve response**, so the receipt can print "You approved this at {HH:MM} IST" straight away. Until it arrives, the view falls back to the client time.
7. The live demo case was re-seeded, so its step durations are now 0–1 s (spec §9). Re-seed it with the brief's timings (1.0 / 6.9 / 1.1 s, 9.0 s end to end) if the video should match the mockups. The UI prints whatever the API returns.

## Deviations from the mockups (and why)

- **Claim letter text.** The paper renders the live `claim_text` template, as spec §9 requires. It is longer than the mockup's condensed copy, because it includes "its list of drugs that failed a quality test", the notice URL and the Consumer Protection Act sentence. So the verified band is about 105 px taller than in `case-full-1536.png`. Long URLs wrap (`overflow-wrap:anywhere`).
- **Brand mark.** The letterhead uses the brand's ink mark (`brand/mark.svg`) instead of the cobalt card drawn in the mockups. The shell-tokens jury flagged this drift.
- **Case id in the letterhead** is set in Plex Mono (ids are mono, spec jury fix 6).
- **Copy the spec leaves open**, in the spec's voice:
  - crumb chip for `failed`: "Paused · a step failed"
  - band for rejected / expired: h2 "Nothing was sealed", with "This case was dismissed, so no letter was written." / "This approval expired, so no letter was written."
  - case-file status for rejected / expired / failed: "Case dismissed" / "Approval expired" / "Paused at step {k}"
  - mid-pipeline case-file status: "Sealing your claim" (steps 1–2), then "Evidence sealed" with "Step {k} of 4 · …" once the seal lands (B3)
- **The running node** is a white ring with a cobalt dot and a spinning arc. Spec C8 describes both a "now" pulse and a "spinner node" for this state. The waiting state's node does not pulse, as the jury fix requires.
- **Locked-until dates** print the UTC calendar date of `object_lock_retain_until` ("19 Oct 2026"), the date S3 and the audit log show.

## Primitive gaps (composed around, not re-implemented)

- `Chip` has no 30 px `lg` size. `CHIP_LG` overrides it with `h-[30px]! px-3! text-[13px]!`.
- `Button` has no 56 px `lg` or 40 px `sm` size (it offers `md` 44 and `sm` 36). The gate primary uses `h-14! text-[16.5px]!`, the section buttons use `h-10! pointer-coarse:h-11!`, and the band's outline button uses `border-white/55!` for the spec's 55 % border. `Button` also does not forward `ref`, so focus moves use `querySelector` on a wrapper.
- `FoilChip` always announces "Batch …". For a model year or serial, it is wrapped in a `role="img"` span with its own label.
- `Card` has no `details` or `aside` option. `ShowWork` repeats the card classes on `<details>`, and `PipelineAside` wraps a `Card` in an `<aside>`.
- **Case-only tints** are written as arbitrary values. They are candidates for tokens:

  | Value | Use |
  |---|---|
  | `#FFF8F7` / `#F3D3CF` | calendar and quote panel face / border |
  | `#FBE1DD` / `#8C1C24` | calendar days between |
  | `#FFDCD8` | band date |
  | `#FAD9D5` | `<mark>` |
  | `#F8FAFD` | raw block |
  | `#C6D2E4` / `#CFD9E8` / `#9AA9BF` / `#8C9AB0` | waiting band ring / lines / slot / slot icon |
  | `#C3CDDB` / `#B2BDCC` | pending connector / pending node |
  | `#B7C3D4` | byte ticks |
  | `#1B3563` / `#3C4F6E` / `#26344A` / `#4D5E78` | strip print |

## Verification done

- **Type-check.** `tsc -p tsconfig.case.json` reports 0 errors (strict; the include list covers case, ui, `FoilStrip*.tsx` and `next-env.d.ts`).
- **Static render.** Every `?state=` value renders with `react-dom/server` from the fixtures.
- **Screenshots.** Screenshots of those renders (Tailwind 4 plus these tokens) were compared with the mockups. At 1536×790 the verified first viewport is effectively pixel-identical to `case-1536.png` (mean difference 0.23/255 below the nav). The waiting, invalid (scrolled to the band), 390 first viewport and 390 full-page captures match their PNGs, apart from the longer live letter. `scrollWidth` equals the viewport at 1536, 1280, 900 and 390.
- **Runtime run.** A client run went approve → verified → tamper → verify again, with and without reduced motion. It had no console errors and no `role="dialog"`. The live region announced every beat, B1b scrolled the band into view, focus moved to the receipt and then between the tamper buttons, and the stamp, flip and denial frames were checked visually.
