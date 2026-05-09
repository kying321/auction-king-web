# BidKing missing item resolution candidate report

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-09-bidking-authenticated-missing-item-resolution-candidate-report.json`
- missing item resolution candidate count: `1`
- unresolved source gaps: `1`
- project-relevant missing item ids: [1106013]
- curve contexts: `1`
- inverse value/weight contexts: `1`
- strongest inverse log(value)/log(weight) correlation: `-0.954545`
- Synthetic item as authority allowed: `false`
- Drop tuple exclusion as authority allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Candidates

| item id | source row found | confidence | maps | parent refs | weights | neighboring family ids |
| --- | --- | --- | --- | --- | --- | --- |
| `1106013` | `false` | `low_source_gap` | ["sunken_ship","villa"] | `20` | [3333] | [1106001,1106002,1106003,1106004,1106005,1106006,1106007,1106008,1106009,1106010,1106011,1106012] |

## Curve Context

| item id | drop group | signal | known peers | missing weight | log correlation | predicted base | nearest peers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `1106013` | `1066` | inverse_value_weight_context_only | `34` | `3333` | `-0.954545` | `296050.09` | [1106006,1066003,1026003,1106001] |

## Blockers

- `missing_item_resolution_not_authoritative`
- `missing_item_source_row_unresolved`
- `synthetic_item_or_tuple_exclusion_not_allowed`

## Decision

Source gap remains unresolved. Keep table-backed shadow replay, synthetic item reconstruction, tuple exclusion, authority handoff, and default config updates closed until the original Item source row is recovered or manually confirmed from an authoritative source.
