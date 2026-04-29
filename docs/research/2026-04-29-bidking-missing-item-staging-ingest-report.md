# BidKing missing item staging ingest

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-04-29-bidking-missing-item-staging-ingest-report.json`
- Staged item rows: `0`
- Staging materialized: `false`
- Source tables mutated: `false`
- Table-backed shadow replay allowed: `false`
- Authority handoff allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Staging Rows

| item id | source type | build/version | source path or capture id | staging only |
| --- | --- | --- | --- | --- |
| `-` | `-` | `-` | - | `true` |

## Blockers

- `missing_raw_item_txt_row`
- `missing_authority_source_type`
- `missing_source_path_or_capture_id`
- `missing_client_build_or_version`
- `authority_intake_incomplete`
- `staging_item_ingest_not_allowed`
- `no_valid_staging_item_rows`

## Decision

Staging ingest does not mutate source tables, authority handoff, replay gates, or default configuration. It only carries audited row evidence forward for a future staging-overlay integrity check.
