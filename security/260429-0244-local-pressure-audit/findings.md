# Findings

## Fixed

### F-001 Missing Static Browser Hardening Headers

- severity: medium
- STRIDE: information disclosure, elevation of privilege
- OWASP: A05 Security Misconfiguration
- evidence: `_headers` and `dist/_headers` had only cache directives.
- mitigation: added CSP, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

### F-002 Imported Solver Config Could Inflate CPU Budget

- severity: medium
- STRIDE: denial of service
- OWASP: A04 Insecure Design
- evidence: `deriveAdaptiveSolverBudget` trusted `solver.max_states` and `solver.mc_samples` from config.
- mitigation: capped local solver budget at shipped defaults: `4000000` states and `180000` MC samples.

### F-003 Worker Timeout Fell Back To Main-Thread Recompute

- severity: medium
- STRIDE: denial of service
- OWASP: A04 Insecure Design
- evidence: worker `onError` always scheduled main-thread full solve.
- mitigation: timeout errors now render a bounded error result instead of freezing the UI with main-thread recompute.

### F-004 OCR Subprocess Had No Timeout

- severity: low
- STRIDE: denial of service
- OWASP: A04 Insecure Design
- evidence: `execFileAsync(..., { maxBuffer })` did not specify `timeout`.
- mitigation: added bounded Tesseract timeout with default/max `5000ms`.

## Residual

### R-001 Browser-Local JSON And Image Import Size Caps

- severity: low-medium
- STRIDE: denial of service
- OWASP: A04 Insecure Design
- evidence: `app.js` reads local screenshots and parses imported JSON without explicit byte limits before parse/read.
- mitigation recommendation: add file size gates before `FileReader.readAsDataURL()` and `file.text()`, plus array-count caps for settlement sample imports.
