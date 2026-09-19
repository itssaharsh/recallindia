# app/

The RecallIndia web app: Next.js 15 (App Router) + TypeScript + Tailwind 4, exported as static
files (`output: "export"`) and hosted on Amplify Hosting. Every piece of data is fetched in the
browser from the HTTP API. There is no SSR and there are no API routes.

Live: https://main.d2jn22qjgettr5.amplifyapp.com. Demo data: add `?demo=1`.

## Routes

| Route | What it is |
|---|---|
| `/` | Feed: header counter (`N notices · S sources · last poll hh:mm:ss`), source chips with poller health, 40px ledger rows, "Load 50 more" (cursor), page 1 re-polled every 15 s. Clicking a row opens the notice sheet with the full notice, the source's own words on paper, and links to the source and the PDF. `?source=cdsco_nsq` deep-links a filter. |
| `/mine/` | Item wall: an outcome line, filters, and item cards. The alert face shows the decision's first clause, a range bar and the quoted source row. The dismissed face (amber edge) shows the exact reason. The clear face shows "No match in N sources as of hh:mm". While a check runs, the card flips to a live checklist. The add sheet has three tabs: Scan strip, Paste lines, Vehicle. |
| `/ingest/`, `/case/`, `/api/` | Designed stubs for later prompts. `/case/?id=<case>`; on Amplify, `/case/<case>` is rewritten to the same page. |
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
src/components/common/     empty state, status tag, source chip, source excerpt, range bar, stubs
src/components/ui/         shadcn (radix-nova) with the DESIGN.md radius scale and surfaces
```

## Design rules this code keeps (DESIGN.md)

- Tokens are OKLCH custom properties in `globals.css`: a surface ladder 0–3, one desaturated red
  for alerts, amber for hold, green for clear, and `--paper` for the source's own words. Radius is
  0 / 4 / 10 / 18 (rows / inputs / cards / sheets). Dark only. Headings are Bricolage Grotesque,
  body text IBM Plex Sans, and identifiers IBM Plex Mono. Body numerals are tabular.
- Four animations and no more: feed rows snapping in (only rows that arrived by poll), the card
  flip (only when a check starts or ends), the range bar drawing, and the evidence stamp (later).
  `prefers-reduced-motion` swaps each one for a 150 ms crossfade.
- Wording follows CLAUDE.md. A CDSCO hit reads "failed CDSCO quality test, JUL-2026 alert, row 12",
  never "recalled". A clean item reads "no match in N sources as of <time>".
- Loading states use skeletons in the row and card geometry, never spinners. Every empty state
  says what would be here, why it isn't, and the one action that changes that.

## The live checklist

The brief says to drive the card's checklist from `GET /items/{id}` + `GET /cases/{id}`. Those
two only know when a run starts and when it ends. The API adds `GET /items/{id}/check-status`,
which reads the Step Functions execution history and returns each of the five steps as `pending`,
`running`, `done`, `failed` or `skipped`, with a summary. The card polls it every 2 s while a
check runs, then re-reads the item.
