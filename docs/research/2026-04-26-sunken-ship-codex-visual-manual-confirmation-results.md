# Codex Visual Manual Confirmation Results

- JSON: `docs/research/2026-04-26-sunken-ship-codex-visual-manual-confirmation-results.json`
- Change class: `RESEARCH_ONLY`
- Draft samples: `1`
- Import-ready without human action: `false`

| map | event timestamp | prefilled counts | total | review image | status |
| --- | --- | --- | --- | --- | --- |
| `sunken_ship` | `2026-04-25T18:24:45.635Z` | `w:0 g:13 b:15 p:24 o:3 r:3` | `58` | `<repo>/tmp_capture_review/sunken_ship_20260425T182445_182455_stitched_inventory.png` | `needs_human_confirmation` |

## Human Action
- Open the review image and verify each quality count.
- Edit `actual_counts` if any prefilled count is wrong.
- Only after manual review, set sample `status` to `approved_count_fit_sample`.
- Then run `node scripts/build_count_fit_sample_review_import.js <this-json> <import-json>`.
