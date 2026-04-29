# BidKing missing item source recovery scan

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-04-29-bidking-missing-item-source-recovery-scan-report.json`
- Missing item ids: [1106013]
- Source item row recovered: `false`
- Recovered item row count: `0`
- Reference hit count: `2`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Item Recovery

| item id | source row recovered | source row hits | reference hits | path hints | status |
| --- | --- | --- | --- | --- | --- |
| `1106013` | `false` | `0` | `2` | `0` | `not_found_in_local_source_candidates` |

## Sources

| source | type | exists | scanned files | skipped files |
| --- | --- | --- | --- | --- |
| <local-bidking-extract> | `directory` | `true` | `62` | `5` |
| <local-bidking.zip> | `zip` | `true` | `8240` | `4284` |
| <local-bidking> | `directory` | `true` | `28` | `27` |

## Blockers

- `source_item_rows_not_found_in_local_candidates`

## Decision

Local source recovery scan does not authorize table mutation, tuple exclusion, table-backed replay promotion, authority handoff, or default config updates. Source item rows must be recovered, ingested, and revalidated by table-reference integrity before any algorithm evidence can advance.
