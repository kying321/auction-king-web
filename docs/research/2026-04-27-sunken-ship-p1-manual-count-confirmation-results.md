# Codex Visual Manual Confirmation Results

- JSON: `docs/research/2026-04-27-sunken-ship-p1-manual-count-confirmation-results.json`
- Change class: `RESEARCH_ONLY`
- Draft samples: `1`
- Priority filter: `P1`
- Import-ready without human action: `false`

| map | event timestamp | prefilled counts | total | review image | status |
| --- | --- | --- | --- | --- | --- |
| `sunken_ship` | `2026-04-26T12:39:48.135Z` | `w:0 g:0 b:0 p:0 o:0 r:0` | `48` | `<repo>/tmp_capture_review/sunken_ship_2026-04-26T123948135Z_2026-04-26T123954089Z_review.png` | `needs_human_confirmation` |

## Human Action
- Open the review image and verify each quality count.
- Edit `actual_counts` if any prefilled count is wrong.
- Only after manual review, set sample `status` to `approved_count_fit_sample`.
- Then run `node scripts/build_count_fit_sample_review_import.js <this-json> <import-json>`.
