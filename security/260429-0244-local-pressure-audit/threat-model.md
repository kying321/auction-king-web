# Threat Model

## Assets

- source artifacts under `docs/research/`
- local browser state in `localStorage`
- manual confirmation JSON downloads
- default estimator config and solver budget
- local OCR/image-processing process resources

## Trust Boundaries

- user-provided local JSON -> browser runtime
- generated review JSON/HTML -> human reviewer -> importer
- imported config -> estimator worker/main thread
- image/OCR inputs -> `sharp` and `tesseract` subprocess
- `_headers`/`dist/_headers` -> deployed static browser protections

## STRIDE Coverage

- spoofing: manual label source spoofing checked through importer guardrails
- tampering: manual confirmation JSON tampering checked through importer consistency gates
- repudiation: artifacts retain generated paths and import summaries, but no cryptographic signature
- information disclosure: hardened with referrer and CSP headers
- denial of service: fixed solver and OCR resource caps; residual browser import size caps remain
- elevation of privilege: no backend auth/admin surface found in scope
