# BidKing schema-backed table report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-05-09-bidking-authenticated-schema-backed-table-report.json`
- Tables: `<authenticated-steam-depot>/BidKing_Data/StreamingAssets/Tables`
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
| named records | `1740` |
| mapping modes | {"id_plus_localized_columns_after_id":11,"direct_schema_columns":1} |
| auction maps | `0` |
| collectible items | `587` |
| reveal/scan skills | `0` |
| schema field corrections | `4` |

## Named Tables

| type | table | rows | mapping mode |
| --- | --- | --- | --- |
| Table_Map | Map.txt | 0 | id_plus_localized_columns_after_id |
| Table_BidMap | BidMap.txt | 0 | id_plus_localized_columns_after_id |
| Table_RankMap | RankMap.txt | 0 | id_plus_localized_columns_after_id |
| Table_RankAi | RankAi.txt | 0 | id_plus_localized_columns_after_id |
| Table_Drop | Drop.txt | 608 | id_plus_localized_columns_after_id |
| Table_Item | Item.txt | 1132 | id_plus_localized_columns_after_id |
| Table_Skill | Skill.txt | 0 | id_plus_localized_columns_after_id |
| Table_Hero | Hero.txt | 0 | id_plus_localized_columns_after_id |
| Table_BattleItem | BattleItem.txt | 0 | id_plus_localized_columns_after_id |
| Table_Condition | Condition.txt | 0 | id_plus_localized_columns_after_id |
| Table_Sim | Sim.txt | 0 | id_plus_localized_columns_after_id |
| Table_Constant | Constant.txt | 0 | direct_schema_columns |

## Auction Map Mechanics

| map id | entrust bidmap | entrust num | bidmap count | rank AI rows |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |

## Field Corrections

| previous alias | schema-backed field | status |
| --- | --- | --- |
| RankMap.item_count_distribution | Table_RankMap.match_time | renamed_for_review |
| RankMap.item_type_weights | Table_RankMap.role_spawn | renamed_for_review |
| RankMap.value_distribution | Table_RankMap.min_bid_range | renamed_for_review |
| RankAi.bid_price_distribution | Table_RankAi.min_bid_ratio | renamed_for_review |

## Conclusion

The BidKing table records are now schema-backed and named. This is a stronger parse layer for manual review and later shadow-candidate generation, but it still does not authorize default config or estimator changes.
