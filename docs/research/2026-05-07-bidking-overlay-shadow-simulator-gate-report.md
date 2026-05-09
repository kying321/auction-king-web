# BidKing overlay shadow simulator gate

- Change class: `SIM_ONLY`
- JSON: `docs/research/2026-05-07-bidking-overlay-shadow-simulator-gate-report.json`
- Candidate allowed: `false`
- Status: `blocked_overlay_shadow_simulator_gate`
- Staged item ids: []
- Unresolved after overlay: [1106013]
- Maps still blocked: ["sunken_ship","villa"]
- Source tables mutated: `false`
- Table-backed shadow replay allowed: `false`
- Authority handoff allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Gates

| gate | value |
| --- | --- |
| `staging_overlay_reference_integrity_clean_for_project_scope` | `false` |
| `overlay_shadow_simulator_candidate_allowed` | `false` |
| `table_backed_shadow_replay_allowed` | `false` |
| `authority_handoff_allowed` | `false` |
| `default_config_update_allowed` | `false` |

## Blockers

- `no_staged_item_rows`
- `project_relevant_missing_terminal_item_references_after_overlay`
- `staging_overlay_reference_integrity_not_clean`
- `staging_overlay_shadow_replay_candidate_not_allowed`
- `maps_still_blocked_after_overlay`

## Decision

The overlay gate is SIM_ONLY. It can authorize only a staging-overlay shadow simulator candidate after reference integrity is clean; it never opens authority handoff, table-backed replay promotion, or default config updates.
