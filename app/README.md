# app/

The RecallIndia web app: Next.js 15 (App Router) + TypeScript + Tailwind 4, exported as static
files (`output: "export"`) and hosted on Amplify Hosting. Every piece of data is fetched in the
browser from the HTTP API. There is no SSR and there are no API routes.

Live: https://recallindia.d2jn22qjgettr5.amplifyapp.com (the first deployment,
https://main.d2jn22qjgettr5.amplifyapp.com, serves the same build). The read-only `demo` household
is what a visitor lands on; `?demo=1` is retired.

## Routes

| Route | What it is |
|---|---|
| `/` | The landing: the hero strip in three.js over a poster, the live counters from `/v1/stats`, how it works, and the proof band. Outside the `(app)` route group, so it carries its own nav. `?state=` switches the QA states. |
| `/feed/` | The feed: the counter hero, the CDSCO month chart, the source cards, filters that live in the URL (`?source=&since=&q=`), cursor pages and a 15 s re-poll of page 1. A row opens the notice sheet; `?notice=<pk>` deep-links it; `?replay=poll` replays rows landing. |
| `/mine/` | The item wall: the outcome line, the household strip, filters and item cards. A card's face is alert, needs-you, near-miss, checking, clear or unchecked. `?add=1` opens the add sheet, `?item=<id>` focuses a card. The demo household is read-only. |
| `/ingest/` | The PDF-to-feed dissolve (below). `?run=<id>` follows a live run, `?replay=<id>[&speed=2]` replays a stored one. |
| `/case/` | One finding, start to finish: `/case/?id=<case>`, and on Amplify `/case/<case>` is rewritten to the same page. The approval gate, the pipeline, the claim letter, the evidence certificate and the tamper test. |
| `/api/` | The public API: the try-it console against `/v1/*`, the curl line and the source table. |
| `/kit/` | Every primitive and state in one page (`?state=` switches them). Not linked from the app. |
| anything else | The designed 404 page, served with a real 404 status. |

## Run it

```bash
make app-dev        # next dev on :3000 against the deployed API (NEXT_PUBLIC_API_URL = stack ApiUrl)
make app-build      # static export into app/out (the heap is capped: one build at a time on WSL)
make app-fixtures   # re-record public/fixtures from the live API (demo mode data)
make app-origin     # first time only: create the Amplify app + branch, print its origin
make app-deploy     # app-build, then a manual zip deployment to Amplify; prints the URL
```

The API only accepts browser calls from the origins in the template's `AppOrigins` parameter:
the Amplify origin and `http://localhost:3000`, persisted in `samconfig.toml`. A dev server on
any other port gets CORS errors. `?demo=1` works on any port, because it only reads same-origin
JSON.

## Demo mode

With `?demo=1` (kept for the tab's session; `?demo=0` turns it off), every GET is answered from
`public/fixtures/`. `scripts/gen_ui_fixtures.py` recorded those files from the live API. The
manifest is keyed exactly as the client asks (`"GET /v1/notices?limit=50"`, in the query order
of `lib/api.ts`), so the shapes cannot drift from the real API. Writes are refused in demo mode,
and the UI says so.

## Where things are

```
src/lib/api.ts             the one door to the API (+ demo manifest lookup, canonical query order)
src/lib/types.ts           response shapes, loose where the API is loose
src/lib/format.ts          times (viewer's local, 24h), counts (en-IN), notice citations
src/components/shell/      app state (demo flag, stats poll), rail, top bar
src/components/feed/       feed view, rows, source filters, notice sheet
src/components/mine/       wall, item card (flip), checklist, add sheet
src/components/ingest/     /ingest: view, PDF stage, dissolve engine + column, checklist, recent runs
src/components/case/       /case: view, approval panel, evidence certificate (stamp), show work
src/lib/case.ts            case wording, approval steps from the case, the demo replay
src/components/common/     empty state, status tag, source chip, source excerpt, range bar, stubs
src/components/ui/         shadcn (radix-nova) with the DESIGN.md radius scale and surfaces
```

## Design rules this code keeps (DESIGN.md)

- Tokens are OKLCH custom properties in `globals.css`: a surface ladder 0–3, one desaturated red
  for alerts, amber for hold, green for clear, and `--paper` for the source's own words. Radius is
  0 / 4 / 10 / 18 (rows / inputs / cards / sheets). Dark only. Headings are Bricolage Grotesque,
  body text IBM Plex Sans, and identifiers IBM Plex Mono. Body numerals are tabular.
- Four animations and no more: feed rows snapping in (only rows that arrived by poll), the card
  flip (only when a check starts or ends), the range bar drawing, and the evidence stamp pressing down (scale 1.15 → 1 at a 6° tilt, 300 ms).
  `prefers-reduced-motion` swaps each one for a 150 ms crossfade.
- Wording follows CLAUDE.md. A CDSCO hit reads "failed CDSCO quality test, JUL-2026 alert, row 12",
  never "recalled". A clean item reads "no match in N sources as of <time>".
- Loading states use skeletons in the row and card geometry, never spinners. Every empty state
  says what would be here, why it isn't, and the one action that changes that.

## /ingest: the dissolve

The actual CDSCO alert PDF is on the left, rendered by react-pdf. The pdf.js worker is copied from
`node_modules` into `public/pdf.worker.min.js` on every build by `scripts/copy-pdf-worker.mjs`, so it
is served from this origin as `.js`. On the right is a counter and a feed column. Above them, the
IngestStateMachine's five steps: ○ ◐ ● with the real microcopy ("Textract reading 6 pages ·
poll 3 · 12.4 s") and a `textract` / `pdfplumber` chip.

- **Run ingest** sends `POST /ingest/run {"force": true, "month": "JUN-2025"}`, which starts live
  Textract. The page then polls `GET /ingest/status/{id}` every 1.5 s. Once Extract has written its
  rows, it reads `GET /ingest/runs/{id}` once: every row with its bbox and the notice it became.
- **The dissolve.** Faint outlines appear at each row's bbox. Row by row, 45 ms apart, the row
  lifts off the page (-8px, ×1.02, 120 ms) and springs into the next slot on the right (stiffness
  380, damping 32, 300 ms). The flying row is a crop of the page's own pixels, and it fades into
  the structured row. The counter ticks with each landing. Pages turn by themselves. A
  continuation line that Normalise merged flies into the row above and does not count. Reduced
  motion: the rows crossfade in, with no flight.
- **Replay** (`?replay=<id>`) plays a stored run with its real step timings from the execution
  history and its real Textract poll times. Runs from before the poll history existed get poll
  times rebuilt from the backoff schedule, and the API marks them `estimated`. `?demo=1` replays the
  recorded June 2025 run (`ingest-20260919084944-ab53`) with the PDF served from `/fixtures`, so
  no API is involved.

**Why it is built the way it is.** The rule is 50+ fps with Chrome's CPU throttled 4×. The first
version averaged 30 fps; tracing found the causes and these fixed them:
- Each flight carries a crop of a pre-decoded page image, not its own `<canvas>`. Canvases became
  texture layers that were uploaded at every commit.
- Lift and flight are one animation on one element, eased at the effect level. A `linear()` easing
  on an individual keyframe did not run on the compositor.
- The checklist, stage, column and flight layer each get their own compositor layer (`.ingest-layer`).
- Rows land by direct DOM writes while the dissolve runs; React renders the full list once, at the end.
- Turning the page is a style write; the react-pdf page tree is memoized.
- Outlines have no CSS transitions. Their `transition*` events were going through React's root
  listener about 1,200 times per dissolve.
- Geometry is measured once per dissolve.

Measured on the production build (the same `app/out` that was deployed), 30 s recording at 4× CPU:
the dissolve averages 54–55 fps, and its worst second is 50–51 fps.

## The live checklist

The brief says to drive the card's checklist from `GET /items/{id}` + `GET /cases/{id}`. Those
two only know when a run starts and when it ends. The API adds `GET /items/{id}/check-status`,
which reads the Step Functions execution history and returns each of the five steps as `pending`,
`running`, `done`, `failed` or `skipped`, with a summary. The card polls it every 2 s while a
check runs, then re-reads the item.

## /case: approval, claim letter, evidence

- **Top.** The outcome in display type: "You were sold this 11 days after the notice" when the
  item was sold after the notice, else "Your batch FT5427 is listed on CDSCO's July 2026 alert"
  (a recall: "Your 2022 Jeep Compass is on NHTSA recall 24V436000"). Under it, the dates line
  ("Purchased 12 Jul 2026 · CDSCO alert 01 Jul 2026 → **sold after notice**"), the source chip
  and the decision tag.
- **The notice.** The citation, the source's own words on paper with the matched sentence
  highlighted, the failed test or hazard, the lab, the remedy, and the range bar.
- **Your answer.** While the task token is open: "Waiting for you" in hold amber, when the 24 h
  window closes, **Approve** (the only primary button in the app) and **Reject** (a text button,
  confirmed inline). After Approve, a checklist advances Claim → Evidence from real state:
  `GET /items/{id}/check-status` every 1.5 s, merged with the case as it fills. Once the letter is
  drafted: "Open claim letter" (a fresh presigned link, opened in a tab created inside the click
  so it is not a blocked pop-up) and the letter's text on paper. Rejected and expired cases say
  what happened and that nothing was drafted.
- **Evidence certificate.** Radius 0, mono: SHA-256, KMS key, algorithm, retain-until with the
  Object Lock mode, signed-at, snapshot key and version. On load it calls
  `GET /cases/{id}/verify-evidence`, and the stamp presses VERIFIED in clear green. "Tamper test"
  asks again with `?tamper=1`, and the stamp turns to SIGNATURE INVALID in alert red, with the two
  hashes and the demo-control note. Clicking again re-verifies the original.
- **Show work** (closed by default). The verification chain from the execution's own step
  results (candidates → verified against the row → batch inside the list → decision → recorded),
  the verifier's reasoning string, the execution ARN, and the audit trail (`ts · step · detail`,
  UTC, mono).

Every card on `/mine/` that has a case links to it, including dismissed and hold cards.

**Demo replay.** `?demo=1` holds a recording of a live case after it was approved and sealed
(`make app-fixtures` records each case, its check-status, both verify answers and the claim PDF).
The page opens it as it stood while it waited. Approve replays Claim → Evidence with the recorded
gaps (each step shown for at least 0.9 s), then shows the recorded case. The stamp and the tamper
test use the recorded verify answers, and the letter opens the recorded PDF. Reject is disabled
in demo mode, because demo data is read-only.
