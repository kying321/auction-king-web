# BidKing strategy comparison

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-04-29-bidking-strategy-comparison-report.json`
- Current config source: `ak_workspace_v2_20260428_sunken_red_tail_refit_v2`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- Live/order/funds path touched: `false`

## Evidence Gates

| gate | value |
| --- | --- |
| reverse engineering source allowed | `true` |
| helper semantics complete | `true` |
| DoDrop IL signal complete | `true` |
| manual mechanics review approved | `false` |
| table-backed shadow replay allowed | `false` |
| authority handoff allowed | `false` |

## Map Comparison

| map | current alpha | alpha total | BidKing item range | alpha relation | current red mean | BidKing value range | red relation | default update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shipping` | w:4.5, g:4.4, b:3.6, p:2.9, o:2.2, r:0.9 | `18.5` | `20-25` | `below_range` | `128777` | `2001-100000` | `above_range` | `false` |
| `sunken_ship` | w:5.2, g:6.62, b:8.5, p:2.95, o:1.25, r:0.8 | `25.32` | `30-35` | `below_range` | `149381` | `2001-300000` | `inside_range` | `false` |
| `villa` | w:8.5, g:7.6, b:3.9, p:3.2, o:4, r:0.12 | `27.32` | `25-30` | `inside_range` | `128777` | `2001-200000` | `inside_range` | `false` |

## Optimization Queue

| priority | id | status | action |
| --- | --- | --- | --- |
| `P0` | `keep_default_config_as_authority` | `applied_guard` | Keep default_config_bundle.js unchanged until manual review and replay gates pass. |
| `P0` | `table_backed_shadow_replay_before_next_weight_fit` | `blocked_by_manual_review` | Build the next candidate from schema-backed table/drop mechanics as shadow replay, then compare against current estimator outputs. |
| `P1` | `item_count_range_shadow_sanity_check` | `ready_for_shadow_report` | Use recovered item_count_range only as a sanity diagnostic beside user-entered total_items. |
| `P1` | `red_tail_value_band_alignment` | `needs_manual_alignment_review` | Compare red-tail settlement fit against recovered RankMap value ranges before changing value_model. |
| `P1` | `drop_helper_runtime_contract` | `semantics_recovered_not_adopted` | Any future shadow simulator must preserve these four semantics exactly and remain blocked from default config adoption. |

## Decision

Keep the current default estimator as runtime authority. The safe next algorithm step is a table-backed shadow replay only after manual mechanics review and same-battle replay evidence.
