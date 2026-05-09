# BidKing missing item authority intake template

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-07-bidking-missing-item-authority-intake-template.json`
- Direct authority source required: `1`
- Impacted maps: ["sunken_ship","villa"]
- Table-backed shadow replay allowed: `false`
- Authority handoff allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Intake Items

| priority | item id | direct authority source required | maps | weights | parent refs | recovery status |
| --- | --- | --- | --- | --- | --- | --- |
| `P0` | `1106013` | `true` | ["sunken_ship","villa"] | [3333] | `20` | `not_found_in_local_source_candidates` |

## Required Fields

- `id`
- `localized_name`
- `item_type_id`
- `slot_type`
- `item_quality`
- `base_value`
- `max_per_listing`
- `collection`
- `collection_coin`
- `icon_path`
- `model_3D`
- `raw_item_txt_row`
- `authority_source_type`
- `source_path_or_capture_id`
- `client_build_or_version`
- `reviewer_notes`

## Blockers

- `missing_item_authority_source_required`
- `source_item_rows_not_found_in_local_candidates`

## Decision

Authority intake remains open only for evidence collection. Synthetic item rows, tuple exclusion, replay promotion, authority handoff, and default config updates stay blocked until raw source rows are collected, ingested into a staging artifact, and table-reference integrity is clean.
