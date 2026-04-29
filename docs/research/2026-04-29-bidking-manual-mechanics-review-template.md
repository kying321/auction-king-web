# BidKing manual mechanics review template

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-manual-mechanics-review-template.json`
- Review status: `pending_manual_validation`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- Live/order/funds path touched: `false`

## Review Coverage

| signal | value |
| --- | --- |
| map alignment reviews | `3` |
| table schema reviews | `12` |
| mechanics scope reviews | `5` |
| schema handoff candidate | `true` |
| table mechanics status | `table_mechanics_candidate_extracted` |

## Map Alignment Review

| current map | BidKing map | BidKing bidmap root | evidence labels | decision |
| --- | --- | --- | --- | --- |
| villa | 104 | 2401 | 未知别墅, 私人金库 | pending |
| sunken_ship | 105 | 2501 | 未知残骸, ​皇家御用货舱​ | pending |
| shipping | 103 | 2301 | 杂货集装箱 | pending |

## Table Schema Review

| type | table | schema members | leading non-schema columns | count match | decision |
| --- | --- | --- | --- | --- | --- |
| Table_Map | Map.txt | 15 | 2 | true | pending |
| Table_BidMap | BidMap.txt | 19 | 2 | true | pending |
| Table_RankMap | RankMap.txt | 5 | 2 | true | pending |
| Table_RankAi | RankAi.txt | 8 | 2 | true | pending |
| Table_Drop | Drop.txt | 3 | 2 | true | pending |
| Table_Item | Item.txt | 36 | 2 | true | pending |
| Table_Skill | Skill.txt | 25 | 2 | true | pending |
| Table_Hero | Hero.txt | 19 | 2 | true | pending |
| Table_BattleItem | BattleItem.txt | 4 | 2 | true | pending |
| Table_Condition | Condition.txt | 11 | 2 | true | pending |
| Table_Sim | Sim.txt | 6 | 2 | true | pending |
| Table_Constant | Constant.txt | 4 | 0 | true | pending |

## Gates

- all_map_alignments_approved: `false`
- all_table_schemas_approved: `false`
- all_mechanics_scopes_approved: `false`
- same_battle_replay_samples_attached: `false`
- authority_handoff_allowed: `false`

## Conclusion

This template is the manual review boundary before any shadow candidate or core refactor. It intentionally keeps all downstream gates closed while review decisions are pending.
