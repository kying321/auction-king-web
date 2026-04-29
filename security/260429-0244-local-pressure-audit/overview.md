# Auction King Local Security Pressure Audit

- scope: local static app, manual confirmation import chain, solver CPU budget, OCR subprocess, generated review HTML
- mode: architecture_review
- change class: SIM_ONLY
- external probing: none
- live/order/funds path touched: no
- verification: `node --test`, `npm run check:js`, `npm audit --json`, local static capacity audit on `127.0.0.1`

## Summary

Confirmed and fixed four defensible weak points: missing static security headers, unbounded imported solver budgets, worker-timeout fallback to main-thread solve, and missing OCR subprocess timeout. The manual confirmation importer already blocks non-manual or inconsistent count labels.

Residual risk remains around browser-local JSON and image imports: inputs are user-selected local files, but they still lack explicit pre-parse byte limits.
