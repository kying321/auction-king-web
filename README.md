# Auction King Web

Auction King Web is a local-first research and decision-support workbench for Auction King style auction/count/quality estimation. The repository contains the browser UI, offline calculators, source-owned research builders, and tests used to keep manual confirmation, calibration, and BidKing comparison gates fail-closed.

This public release intentionally excludes proprietary game binaries, local browser state, raw capture images, temporary review folders, deployment backups, and user-specific absolute paths. Reverse-engineering helpers expect explicit local inputs through CLI arguments or environment variables such as `BIDKING_PATH`, `BIDKING_ZIP_PATH`, `BIDKING_TABLES_DIR`, and `BIDKING_ASSEMBLY_PATH`.

## Quick Start

```bash
npm install
npm test
npm run check:js
npm run build:repo-index
npm run audit:public-release
npm run build:static
```

Open `index.html` directly for the local static workbench, or run `npm run build:static` to build `dist/` for Cloudflare Workers Static Assets.

## Research Scope

- `scripts/` owns report builders, replay gates, manual confirmation ingest, and BidKing comparison analysis.
- `src/browser/`, `src/core/`, and `src/research/` own browser runtime, estimator/catalog core, and research runtime modules.
- `legacy/python/` retains the older local Python estimator and family-calibration helpers.
- `tests/` owns deterministic regression coverage for source-owned gates and UI/static behavior.
- `docs/research/` contains selected generated reports and public release handoff notes.
- `data/source_packages/` and `data/battle_samples/` contain repo-owned source package snapshots used by builders.

Start from `docs/INDEX.md` for the repository map, `docs/SCRIPTS_INDEX.md` for grouped command entrypoints, `docs/RESEARCH_INDEX.md` for generated evidence, and `docs/DEPRECATIONS.md` for removed or retained-legacy files.

Generated folders such as `dist/`, `output/`, `tmp_capture_review/`, `backups/`, and `external/` are ignored by design.

## Safety Model

Research outputs are not treated as authority until their source-owned gates allow adoption. Draft or manually reconstructed evidence stays blocked until human confirmation and consistency checks pass. This release does not contain live order routing, fund scheduling, or capital execution paths.
