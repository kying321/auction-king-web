# P1 Manual Count Candidate Shortlist

- JSON: `docs/research/2026-04-27-sunken-ship-p1-manual-count-candidate-shortlist.json`
- Change class: `RESEARCH_ONLY`
- Authority: `human_confirmation_required`
- Samples: `1`
- Candidates: `143`
- Blockers: `-`

## Top Candidates

| sample | rank | counts | score | score basis |
| --- | ---: | --- | ---: | --- |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 1 | w:5 g:5 b:17 p:9 o:8 r:4 | 0.77409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 2 | w:4 g:6 b:17 p:9 o:8 r:4 | 0.80409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 3 | w:6 g:4 b:17 p:9 o:8 r:4 | 0.80409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 4 | w:3 g:7 b:17 p:9 o:8 r:4 | 0.83409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 5 | w:7 g:3 b:17 p:9 o:8 r:4 | 0.83409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 6 | w:2 g:8 b:17 p:9 o:8 r:4 | 0.86409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 7 | w:8 g:2 b:17 p:9 o:8 r:4 | 0.86409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |
| capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z | 8 | w:1 g:9 b:17 p:9 o:8 r:4 | 0.89409 | model_mean_distance_plus_weak_wg_balance_heuristic_non_authority |

## Guardrails

- 这些候选只用于人工看图复核，不是 OCR 结果，也不是训练标签。
- 必须在 manual confirmation 页面人工选择/校验并勾选批准后，才允许进入 ingest。
