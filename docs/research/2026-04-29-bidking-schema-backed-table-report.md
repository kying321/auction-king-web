# BidKing schema-backed table report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-schema-backed-table-report.json`
- Tables: `<local-bidking-extract>/Tables`
- Schema metadata: `<repo>/docs/research/2026-04-29-bidking-table-schema-metadata-report.json`
- Parse status: `schema_backed_named_records_built`
- Evidence confidence: `medium_high`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| named tables | `12` |
| named records | `2746` |
| mapping modes | {"id_plus_localized_columns_after_id":11,"direct_schema_columns":1} |
| auction maps | `5` |
| collectible items | `587` |
| reveal/scan skills | `210` |
| schema field corrections | `4` |

## Named Tables

| type | table | rows | mapping mode |
| --- | --- | --- | --- |
| Table_Map | Map.txt | 8 | id_plus_localized_columns_after_id |
| Table_BidMap | BidMap.txt | 104 | id_plus_localized_columns_after_id |
| Table_RankMap | RankMap.txt | 62 | id_plus_localized_columns_after_id |
| Table_RankAi | RankAi.txt | 120 | id_plus_localized_columns_after_id |
| Table_Drop | Drop.txt | 594 | id_plus_localized_columns_after_id |
| Table_Item | Item.txt | 1128 | id_plus_localized_columns_after_id |
| Table_Skill | Skill.txt | 256 | id_plus_localized_columns_after_id |
| Table_Hero | Hero.txt | 20 | id_plus_localized_columns_after_id |
| Table_BattleItem | BattleItem.txt | 64 | id_plus_localized_columns_after_id |
| Table_Condition | Condition.txt | 206 | id_plus_localized_columns_after_id |
| Table_Sim | Sim.txt | 101 | id_plus_localized_columns_after_id |
| Table_Constant | Constant.txt | 83 | direct_schema_columns |

## Auction Map Mechanics

| map id | entrust bidmap | entrust num | bidmap count | rank AI rows |
| --- | --- | --- | --- | --- |
| 101 | 2101 | [15,20] | 7 | 6 |
| 102 | 2201 | [20,25] | 5 | 6 |
| 103 | 2301 | [20,25] | 10 | 6 |
| 104 | 2401 | [25,30] | 10 | 6 |
| 105 | 2501 | [30,35] | 10 | 6 |

## Field Corrections

| previous alias | schema-backed field | status |
| --- | --- | --- |
| RankMap.item_count_distribution | Table_RankMap.match_time | renamed_for_review |
| RankMap.item_type_weights | Table_RankMap.role_spawn | renamed_for_review |
| RankMap.value_distribution | Table_RankMap.min_bid_range | renamed_for_review |
| RankAi.bid_price_distribution | Table_RankAi.min_bid_ratio | renamed_for_review |

## Conclusion

The BidKing table records are now schema-backed and named. This is a stronger parse layer for manual review and later shadow-candidate generation, but it still does not authorize default config or estimator changes.
