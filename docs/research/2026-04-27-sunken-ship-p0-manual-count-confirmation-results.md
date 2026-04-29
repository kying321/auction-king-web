# Codex Visual Manual Confirmation Results

- JSON: `docs/research/2026-04-27-sunken-ship-p0-manual-count-confirmation-results.json`
- Change class: `RESEARCH_ONLY`
- Draft samples: `0`
- Priority filter: `P0`
- Import-ready without human action: `false`

| map | event timestamp | prefilled counts | total | review image | status |
| --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | - |

## Human Action
- Open the review image and verify each quality count.
- Edit `actual_counts` if any prefilled count is wrong.
- Only after manual review, set sample `status` to `approved_count_fit_sample`.
- Then run `node scripts/build_count_fit_sample_review_import.js <this-json> <import-json>`.
