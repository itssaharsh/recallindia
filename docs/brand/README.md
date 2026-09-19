# brand/

| File | Where it goes | Notes |
|---|---|---|
| `mark.svg` | port to a JSX `<Mark />` | blister card, three punched pockets, one NSQ-red pocket. Plain fills; no style block |
| `wordmark.svg`, `lockup.svg` | port to `<Logo />` | Schibsted Grotesk 800 outlined to paths; dotless ı with a red tittle. Rail 24 px high, mobile 20 px |
| `favicon/icon.svg` | App Router folder → `icon.svg` | the only file with a prefers-color-scheme rule (dark tabs get a paper card) |
| `favicon/favicon.ico` (16+32), `favicon/apple-icon.png` (180) | App Router folder | — |
| `favicon/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `public/` + manifest | maskable content sits inside the central circle |
| `glyphs/g-strip.svg`, `glyphs/g-notice.svg` | icon components | 24 grid, 2 px round strokes, `currentColor` (Lucide-compatible) |
| `seal.svg`, `seal-invalid.svg` | reference for the C-19 seal component | rebuild as JSX with `useId()` ids and the next/font variable |
| `og-draft.png` | reference for `/kit/og` → `public/og.png` | rebuild from live `/v1/stats` numbers |
| `brand-sheet.png` | look before styling | mark candidates at 16/32/128, lockup, glyphs, foil chip, card faces, notice row, seals, colours |
| `candidates/` | — | the three rejected marks, kept for the record |
