# EVAL — decisions that must not regress

Every false positive or false negative we find becomes a case here, with the evidence that
proved it. The list is the seed for an automated eval (`scripts/eval.py`, not built yet): run
each item through the real chain and compare the decision. Until then, the cases below are
enforced by the tests named in the last column.

Rules decide (no LLM in the decision path), so every case has one correct answer.

## Must-hold cases

| id | item (kind · name · brand · identifier) | expected | notice | why it is here | enforced by |
|---|---|---|---|---|---|
| demo-alert | medicine · Paracetamol Tablets IP 650mg · Forgo Pharmaceuticals · FT5427 | alert, sold after notice | `cdsco_nsq#JUL-2026-cdsco_portal-b75cfffe3713` | the demo's real alert (P05) | `scripts/validate.py` |
| demo-nearmiss | same · FT5428 | dismiss `batch FT5428 not in listed batches [FT5427]` | same | near-miss shot (P05) | `scripts/validate.py` |
| demo-vehicle | vehicle · Jeep Compass · 2022 | alert or hold | an NHTSA Jeep Compass 2022 campaign | vehicle shot (P05) | `scripts/validate.py` |
| finecure-no-suffix | medicine · Pantoprazole Tablets IP · **Finecure Pharmaceuticals** · PEP5001 | alert | `cdsco_nsq#JUL-2026-cdsco_portal-a6aad1d3d405` (JUL-2026, row 1) | P05 false negative: the notice spells the brand "Finecure Pharmaceuticals Ltd."; typed without the suffix it said "no match in 4 sources" | `test_brand_key_matching.py` |
| finecure-with-suffix | same · **Finecure Pharmaceuticals Ltd.** · PEP5001 | alert | same | the pair's other half: exact spelling must keep working | `test_brand_key_matching.py` |
| finecure-wrong-batch | same · Finecure Pharmaceuticals · PEP5002 | dismiss `batch PEP5002 not in listed batches [PEP5001]` | same | control: the brand fix must not loosen the batch rule | `test_brand_key_matching.py` |

Live evidence for the Finecure pair (2026-09-19, after the P05b migration, `verifier: deterministic`, confidence 0.95, same notice):

- no suffix: `arn:aws:states:ap-south-1:277025716889:execution:recallindia-match-277025716889:check-3b24e5c85531-20260919161603-148f` → alert
- with suffix: `arn:aws:states:ap-south-1:277025716889:execution:recallindia-match-277025716889:check-3ed174765995-20260919161603-d448` → alert

The notice pk is content-derived, so it is identical in the saved fixture (`fixtures/cdsco/nsq_jul2026_all.json`) and on the live table.

```json
[
  {"id": "finecure-no-suffix", "item": {"kind": "medicine", "name": "Pantoprazole Tablets IP", "brand": "Finecure Pharmaceuticals", "batch": "PEP5001"}, "expect": {"decision": "alert", "notice_pk": "cdsco_nsq#JUL-2026-cdsco_portal-a6aad1d3d405"}},
  {"id": "finecure-with-suffix", "item": {"kind": "medicine", "name": "Pantoprazole Tablets IP", "brand": "Finecure Pharmaceuticals Ltd.", "batch": "PEP5001"}, "expect": {"decision": "alert", "notice_pk": "cdsco_nsq#JUL-2026-cdsco_portal-a6aad1d3d405"}},
  {"id": "finecure-wrong-batch", "item": {"kind": "medicine", "name": "Pantoprazole Tablets IP", "brand": "Finecure Pharmaceuticals", "batch": "PEP5002"}, "expect": {"decision": "dismiss", "reason": "batch PEP5002 not in listed batches [PEP5001]"}}
]
```

## Open cases — known false negatives, not fixed

Counted on the live notices table on 2026-09-19, after the migration. `brand_key` cannot fix these:
the display brand itself was extracted wrongly upstream, or the right key is a product decision.

| gap | notices | example (display brand → key) | where the fix belongs |
|---|---|---|---|
| trade name after "d/b/a" | 334 CPSC | `Whele LLC d/b/a Perch` → `whele dba perch`: a person typing "Perch" (the name on the product) gets no match | CPSC brand extraction: key on the trade name, or index both names (product decision) |
| address words left in the brand | 24 CDSCO | `Cian Healthcare Kh. NO.` → `cian healthcare kh no` | `common.cdsco.brand_from_manufacturer` address cut |
| blank manufacturer | 14 CDSCO | stored as `unknown`; a branded item can never reach it | nothing to key on; only product/batch search could |
| "Supplied by M/s. …" prefix | 3 CDSCO (archive PDFs) | `Supplied by M/s. Kerala Medical services Corporation Limited` → `supplied by kerala medical services` | PDF manufacturer cell cleanup |
| spacing variants | seen in fixtures | `Danish Health Care (P) Ltd.` and `Danish Healthcare (P) Ltd.` get different keys | would need a space-insensitive key; not measured live |
