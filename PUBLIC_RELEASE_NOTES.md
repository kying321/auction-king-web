# Public Release Handoff

Thread reference: `019dbe5a-6d6d-7302-88d6-b1f0bb63fc47`

## Integrated Work

- P0/P1 manual confirmation workflow: priority-filtered review pages, ingest entry points, and authority-handoff gates.
- BidKing comparison chain: decompile audit, schema/table mechanics reports, strategy comparison, public authority source search, and algorithm/weight optimization decision tree.
- Gate hardening: missing-item authority intake, staging ingest, overlay reference integrity, and overlay shadow-simulator gate now fail closed on stale schema, synthetic rows, or unresolved staging evidence.
- Public release hygiene: local absolute BidKing defaults were replaced by explicit environment variables or repo-relative `external/` placeholders, and a repeatable `npm run audit:public-release` check was added.

## Verification Snapshot

- Latest full local regression before public packaging: `npm test` passed `830/830`.
- Required pre-publish checks for the release copy:
  - `npm test`
  - `npm run check:js`
  - `npm run audit:public-release`

## Release Boundary

Included:
- Browser UI source, runtime modules, Python helpers, default configs, tests, scripts, selected source packages, selected research reports, and release notes.

Excluded:
- Proprietary game binaries, decompiled raw binaries, `node_modules/`, `dist/`, browser/cache state, raw capture images, temporary review folders, local output screenshots, backups, deployment backups, and `external/` inputs.

## Current Gate State

- Live/order/funds path touched: no.
- Recommended change class: `SIM_ONLY + RESEARCH_ONLY`.
- Actual change class: `SIM_ONLY + RESEARCH_ONLY + DOC_ONLY`.
- Known residual blocker: missing item `1106013` still requires source-backed resolution before authority adoption.
- P1 manual confirmation remains review-gated until human confirmation and consistency checks pass.
