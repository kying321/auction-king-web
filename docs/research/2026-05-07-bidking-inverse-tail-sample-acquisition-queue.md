# BidKing inverse-tail sample acquisition queue

- Change class: `RESEARCH_ONLY`
- Recommended change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-07-bidking-inverse-tail-sample-acquisition-queue.json`
- Queue status: `blocked_pending_authority_or_same_battle_samples`
- Authority task required: `true`
- Map sample tasks: `2`
- Total target new same-battle samples: `5`
- Promotion allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Tasks

| priority | type | target | same-battle target | action |
| --- | --- | --- | ---: | --- |
| `P0` | `recover_missing_item_authority_row` | `1106013` | `0` | recover_raw_item_txt_row_with_provenance |
| `P0` | `capture_fresh_same_battle_samples` | `sunken_ship` | `2` | capture_and_review_fresh_same_battle_count_fit_samples |
| `P0` | `capture_fresh_same_battle_samples` | `villa` | `3` | capture_and_review_fresh_same_battle_count_fit_samples |

## Required Same-Battle Fields

- `map_id`
- `event_timestamp`
- `observed_state`
- `actual_counts.w`
- `actual_counts.g`
- `actual_counts.b`
- `actual_counts.p`
- `actual_counts.o`
- `actual_counts.r`
- `actual_counts.total_items`
- `actual_counts_source`
- `reviewer_notes`

## Decision

Collect only authority-grade `1106013` source evidence and reviewed same-battle samples. Do not use this queue to update default config or promote the inverse-tail candidate.
