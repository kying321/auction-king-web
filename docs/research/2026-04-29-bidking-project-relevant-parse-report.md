# BidKing project-relevant parse report

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-04-29-bidking-project-relevant-parse-report.json`
- Parse status: `project_relevant_parse_complete`
- Evidence confidence: `medium_high`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Shadow candidate allowed: `false`
- Live/order/funds path touched: `false`

## Completion

| signal | value |
| --- | --- |
| included tables | `12` |
| included records | `2746` |
| missing required tables | `0` |
| project maps aligned | `3/3` |
| collectible items | `587` |
| drop groups | `594` |
| drop tuples | `8782` |
| strategy-visible skills | `221` |
| method scope complete | `true` |
| DoDrop semantics complete | `true` |
| helper semantics complete | `true` |

## Project Map Parse

| current map | BidKing map | root bidmap | confidence | item range | bidmaps | reachable drop groups | default update |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `shipping` | `103` | `2301` | low_medium | [20,25] | `10` | `68` | `false` |
| `sunken_ship` | `105` | `2501` | medium | [30,35] | `10` | `68` | `false` |
| `villa` | `104` | `2401` | medium | [25,30] | `10` | `68` | `false` |

## Table Scope

| table type | file | rows | mapping | fields |
| --- | --- | --- | --- | --- |
| Table_Map | Map.txt | `8` | id_plus_localized_columns_after_id | `15` |
| Table_BidMap | BidMap.txt | `104` | id_plus_localized_columns_after_id | `19` |
| Table_RankMap | RankMap.txt | `62` | id_plus_localized_columns_after_id | `5` |
| Table_RankAi | RankAi.txt | `120` | id_plus_localized_columns_after_id | `8` |
| Table_Drop | Drop.txt | `594` | id_plus_localized_columns_after_id | `3` |
| Table_Item | Item.txt | `1128` | id_plus_localized_columns_after_id | `36` |
| Table_Skill | Skill.txt | `256` | id_plus_localized_columns_after_id | `25` |
| Table_Hero | Hero.txt | `20` | id_plus_localized_columns_after_id | `19` |
| Table_BattleItem | BattleItem.txt | `64` | id_plus_localized_columns_after_id | `4` |
| Table_Condition | Condition.txt | `206` | id_plus_localized_columns_after_id | `11` |
| Table_Sim | Sim.txt | `101` | id_plus_localized_columns_after_id | `6` |
| Table_Constant | Constant.txt | `83` | direct_schema_columns | `4` |

## Skipped Scope

- login, account, payment, analytics, ads, mail, and social flows
- full Unity scene, shader, sprite, audio, and localization asset graph
- protocol payload implementation after request-wrapper identification
- generic async/task plumbing not tied to estimator or table-backed mechanics
- non-auction/non-collectible inventory systems outside current app strategy

## Decision

Project-relevant parsing is complete for the current strategy workbench scope. The next safe step is table-backed shadow simulation after manual mechanics review and same-battle replay samples; default configuration remains blocked.
