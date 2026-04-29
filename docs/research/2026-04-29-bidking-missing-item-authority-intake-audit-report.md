# BidKing missing item authority intake audit

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-04-29-bidking-missing-item-authority-intake-audit-report.json`
- Valid authority items: `0`
- Blocked authority items: `1`
- Staging ingest allowed: `false`
- Table-backed shadow replay allowed: `false`
- Authority handoff allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Item Audits

| item id | valid direct authority | staging ingest allowed | blockers | source type | build/version |
| --- | --- | --- | --- | --- | --- |
| `1106013` | `false` | `false` | ["missing_raw_item_txt_row","missing_authority_source_type","missing_source_path_or_capture_id","missing_client_build_or_version"] | `-` | `-` |

## Blockers

- `missing_raw_item_txt_row`
- `missing_authority_source_type`
- `missing_source_path_or_capture_id`
- `missing_client_build_or_version`
- `authority_intake_incomplete`

## Decision

Authority intake audit can only create staging-only rows. It cannot authorize table mutation, replay promotion, authority handoff, or default config updates until table-reference integrity is rerun and clean.
