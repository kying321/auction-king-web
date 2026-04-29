# BidKing table schema metadata report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-table-schema-metadata-report.json`
- Assembly: `<local-bidking-extract>/dll/Scripts.dll.bytes`
- Tables: `<local-bidking-extract>/Tables`
- Metadata parse: `parsed`
- Evidence confidence: `medium_high`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Core refactor recommended now: `false`
- Schema handoff candidate: `true`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| metadata types | `2625` |
| target table types | `12` |
| column-count matches | `1` |
| schema-or-localized-column matches | `12` |
| missing target table types | - |

## Table Type Schemas

| type | rows | table column distribution | schema members | source | leading non-schema columns | schema/localized count match |
| --- | --- | --- | --- | --- | --- | --- |
| Table_Map | 8 | {"17":8} | 15 | public_instance_field | 2 | true |
| Table_BidMap | 104 | {"21":104} | 19 | public_instance_field | 2 | true |
| Table_RankMap | 62 | {"7":62} | 5 | public_instance_field | 2 | true |
| Table_RankAi | 120 | {"10":120} | 8 | public_instance_field | 2 | true |
| Table_Drop | 594 | {"5":594} | 3 | public_instance_field | 2 | true |
| Table_Item | 1128 | {"38":1128} | 36 | public_instance_field | 2 | true |
| Table_Skill | 256 | {"27":256} | 25 | public_instance_field | 2 | true |
| Table_Hero | 20 | {"21":20} | 19 | public_instance_field | 2 | true |
| Table_BattleItem | 64 | {"6":64} | 4 | public_instance_field | 2 | true |
| Table_Condition | 206 | {"13":206} | 11 | public_instance_field | 2 | true |
| Table_Sim | 101 | {"8":101} | 6 | public_instance_field | 2 | true |
| Table_Constant | 83 | {"4":83} | 4 | public_instance_field | 0 | true |

## Conclusion

Managed metadata now provides named `Table_*` schema candidates. This reduces the largest blocker in the previous table-mechanics artifact, but it remains research-only until loader ordering, map alignment, shadow replay, and authority handoff are validated.
