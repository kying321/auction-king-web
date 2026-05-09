# BidKing table reference integrity report

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-09-bidking-authenticated-table-reference-integrity-report.json`
- Drop groups: `608`
- Item records: `1132`
- Global missing item ids: `17`
- project-relevant missing item ids: `1`
- project-relevant missing item ids list: [1106013]
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Project Map Integrity

| map | root group | reachable groups | missing terminal refs | missing item ids |
| --- | --- | --- | --- | --- |
| `shipping` | `2301` | `68` | `0` | [] |
| `sunken_ship` | `2501` | `68` | `1` | [1106013] |
| `villa` | `2401` | `68` | `1` | [1106013] |

## Missing Terminal References

| item id | drop group | drop name | tuple | parent refs |
| --- | --- | --- | --- | --- |
| `120006` | `1001` | - | [12,120006,1,1,10000] | `0` |
| `120007` | `1001` | - | [12,120007,1,1,10000] | `0` |
| `120008` | `1001` | - | [12,120008,1,1,10000] | `0` |
| `120009` | `1001` | - | [12,120009,1,1,10000] | `0` |
| `120010` | `1001` | - | [12,120010,1,1,10000] | `0` |
| `120011` | `1001` | - | [12,120011,1,1,10000] | `0` |
| `120012` | `1001` | - | [12,120012,1,1,10000] | `0` |
| `120013` | `1001` | - | [12,120013,1,1,10000] | `0` |
| `120014` | `1001` | - | [12,120014,1,1,10000] | `0` |
| `120015` | `1001` | - | [12,120015,1,1,10000] | `0` |
| `120016` | `1001` | - | [12,120016,1,1,10000] | `0` |
| `120017` | `1001` | - | [12,120017,1,1,10000] | `0` |
| `120018` | `1001` | - | [12,120018,1,1,10000] | `0` |
| `120019` | `1001` | - | [12,120019,1,1,10000] | `0` |
| `120020` | `1001` | - | [12,120020,1,1,10000] | `0` |
| `120021` | `1001` | - | [12,120021,1,1,10000] | `0` |
| `1106013` | `1066` | 文物古董品质6 | [106,1106013,1,1,3333] | `20` |

## Blockers

- `table_reference_integrity_not_authoritative`
- `project_relevant_missing_terminal_item_references`
- `project_maps_blocked_by_missing_item_references`

## Decision

Project-relevant missing terminal item references must be resolved or explicitly reviewed before using table-backed shadow replay as algorithm-change evidence.
