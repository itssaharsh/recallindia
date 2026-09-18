# app/

Next.js 15 app (App Router, TypeScript, Tailwind) arrives in P06; until then CI skips the app step
(`ci.yml` guards `npm ci && npm run build` on `app/package.json` existing).

Routes it will serve, per SPEC.md: `/` feed, `/ingest` hero, `/mine` item wall, `/case/[id]`,
`/api` docs, 404. Visual language is in `DESIGN.md`.
