# BidKing inverse-tail shadow replay gate

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-07-bidking-inverse-tail-authenticated-local-shadow-replay-gate-report.json`
- Diagnostic shadow analysis allowed: `true`
- Inverse-tail shadow replay allowed: `false`
- Promotion allowed: `false`
- Authority handoff allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Evidence

| field | value |
| --- | --- |
| `candidate_verdict` | `inverse_value_supported_shadow_only` |
| `red_quality_beta_median` | `0.932` |
| `missing_1106013_source_recovered` | `false` |
| `accepted_same_battle_sample_count` | `1` |
| `blocked_review_entry_count` | `3` |

## Same-Battle Sample Deficit

| map | accepted samples | deficit to minimum |
| --- | ---: | ---: |
| `sunken_ship` | `1` | `2` |
| `villa` | `0` | `3` |

## Blockers

- `missing_authoritative_item_row_1106013`
- `impacted_map_sample_count_below_minimum`
- `sunken_ship_same_battle_samples_missing`
- `villa_same_battle_samples_missing`
- `accepted_same_battle_sample_count_below_minimum`
- `shadow_replay_not_default_promotion`
- `authority_handoff_gate_closed`
- `default_config_update_gate_closed`

## Decision

The inverse-tail curve can remain a diagnostic shadow candidate. It cannot move into table-backed replay, authority handoff, or default config until the missing item source row and impacted-map same-battle samples are recovered.
