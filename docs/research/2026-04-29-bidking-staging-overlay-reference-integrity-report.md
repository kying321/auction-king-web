# BidKing staging overlay reference integrity

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-04-29-bidking-staging-overlay-reference-integrity-report.json`
- Original project missing item ids: [1106013]
- Staged item ids: []
- Unresolved after overlay: [1106013]
- Overlay clean for project scope: `false`
- Overlay shadow replay candidate allowed: `false`
- Source tables mutated: `false`
- Table-backed shadow replay allowed: `false`
- Authority handoff allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Map Overlay Integrity

| map | original missing refs | covered item ids | missing refs after overlay | missing item ids after overlay |
| --- | --- | --- | --- | --- |
| `shipping` | `0` | [] | `0` | [] |
| `sunken_ship` | `1` | [] | `1` | [1106013] |
| `villa` | `1` | [] | `1` | [1106013] |

## Blockers

- `no_staged_item_rows`
- `project_relevant_missing_terminal_item_references_after_overlay`
- `staging_overlay_reference_integrity_not_clean`

## Decision

Staging overlay integrity does not mutate source tables or open default config, authority handoff, or table-backed replay promotion. A clean overlay only permits a future overlay-shadow simulator candidate.
