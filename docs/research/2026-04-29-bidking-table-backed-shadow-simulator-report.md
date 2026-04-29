# BidKing table-backed shadow simulator report

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-04-29-bidking-table-backed-shadow-simulator-report.json`
- Seed: `ak-bidking-table-shadow-v1`
- Sample count per map: `256`
- Simulated samples: `768`
- Promotion allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Map Shadow Summary

| map | root drop group | samples | current item range | mean simulated items | range hit rate | quality means | missing groups | missing items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `shipping` | `2301` | `256` | [20,25] | `26.429688` | `0.277344` | {"1":2.710938,"2":5.335938,"3":6.816406,"4":8.347656,"5":2.371094,"6":0.847656} | `0` | `0` |
| `sunken_ship` | `2501` | `256` | [30,35] | `32.425781` | `0.316406` | {"1":2.695313,"2":7.019531,"3":8.375,"4":8.089844,"5":3.902344,"6":2.339844,"unknown":0.003906} | `0` | `1` |
| `villa` | `2401` | `256` | [25,30] | `29.628906` | `0.230469` | {"1":2.375,"2":5.226563,"3":10.398438,"4":7.203125,"5":3.109375,"6":1.3125,"unknown":0.003906} | `0` | `1` |

## Blockers

- `table_backed_shadow_simulator_not_authoritative`
- `manual_mechanics_review_not_approved`
- `same_battle_replay_samples_missing`
- `simulator_missing_item_references`

## Warnings

- `none`

## Decision

This simulator is sufficient for shadow-only mechanics inspection. It does not authorize estimator/default weight changes; manual mechanics review and same-battle replay evidence remain required.
