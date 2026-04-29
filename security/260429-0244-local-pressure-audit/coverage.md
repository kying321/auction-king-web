# Coverage

## Commands

- `npm audit --json`: 0 vulnerabilities
- `node --test tests/security_pressure.test.js`: 5/5 pass
- `node --test tests/full_solver_runtime.test.js tests/estimator.test.js tests/catalog_ocr_contour_runtime.test.js tests/build_codex_visual_manual_confirmation_results.test.js tests/build_count_fit_sample_review_import.test.js tests/security_pressure.test.js`: 87/87 pass
- `npm run check:js`: pass
- `node --test`: 757/757 pass

## Local Static Capacity

- server: `python3 -m http.server 18789 --directory dist`
- local-only origin: `http://127.0.0.1:18789`
- 5 VU / 5s: 5472 requests, 100% 200, p50 64ms, p95 163ms, p99 338ms
- 10 VU / 5s: 99.79% OK, 11 local server timeouts
- 25 VU / 5s: 95.16% OK, 176 local server timeouts

Interpretation: the simple local Python static server becomes the bottleneck above 5 VU. This is not a Cloudflare edge capacity result.
