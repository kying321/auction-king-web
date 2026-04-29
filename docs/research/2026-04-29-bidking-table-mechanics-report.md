# BidKing table mechanics report

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-table-mechanics-report.json`
- Tables: `<local-bidking-extract>/Tables`
- Hot update DLL: `<local-bidking-extract>/dll/Scripts.dll.bytes`
- Mechanics recovery: `table_mechanics_candidate_extracted`
- Evidence confidence: `medium`
- Authority adoption allowed: `false`
- Default config update allowed: `false`
- Core refactor recommended now: `false`
- Core refactor candidate identified: `true`
- Live/order/funds path touched: `false`

## Coverage

| signal | value |
| --- | --- |
| key tables present | `12` |
| maps | `8` |
| auction maps with count ranges | `5` |
| bidmaps | `104` |
| rank maps | `62` |
| drop groups | `594` |
| items | `1128` |
| skills | `256` |
| heroes | `20` |
| hot-update method markers | `15` |
| bid protocol markers | `8` |

## Map Priors

| map id | bidmap root | item count range | bidmap count | rank AI rows |
| --- | --- | --- | --- | --- |
| 101 | 2101 | [15,20] | 7 | 6 |
| 102 | 2201 | [20,25] | 5 | 6 |
| 103 | 2301 | [20,25] | 10 | 6 |
| 104 | 2401 | [25,30] | 10 | 6 |
| 105 | 2501 | [30,35] | 10 | 6 |

## Candidate Map Alignment

| current map | BidKing map candidate | BidKing bidmap root | labels | confidence | blocker |
| --- | --- | --- | --- | --- | --- |
| villa | 104 | 2401 | 未知别墅, 私人金库 | medium | manual confirmation required before config mapping |
| sunken_ship | 105 | 2501 | 未知残骸, ​皇家御用货舱​ | medium | manual confirmation required before config mapping |
| shipping | 103 | 2301 | 杂货集装箱 | low_medium | label overlap is weaker than villa/sunken_ship; requires screenshot or manual label alignment |

## Refactor Position

official tables expose map count priors, item type weights, value ranges, drop groups, item quality/price fields, skill/hero reveal semantics, and bid protocol markers; refactor should consume reviewed artifacts rather than hard-coded heuristic priors

Proposed source lane: `bidking_zip_inventory` -> `bidking_table_mechanics` -> `manual_mechanics_review` -> `shadow_replay_candidate` -> `authority_handoff_gate`

Blocked before model change: `confirm table column names against decompiled Table_*.cs or runtime behavior`, `confirm current map ids map to BidKing map/bidmap ids`, `turn table distributions into a reviewed candidate config without replacing current defaults`, `pass replay gates on same-battle human-labeled samples`, `explicit human approval before authority merge`

## Conclusion

The extracted tables are useful enough to drive a complete mechanics candidate lane, especially for count priors, value distributions, item quality/type priors, and skill/hero observation semantics. They are not authority yet: keep them as reviewed research artifacts until schema confirmation, current-map alignment, shadow replay, and authority handoff pass.
