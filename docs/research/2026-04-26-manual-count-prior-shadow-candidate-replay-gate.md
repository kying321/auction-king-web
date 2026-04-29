# Manual Count Prior Shadow Candidate Replay Gate

- JSON: `docs/research/2026-04-26-manual-count-prior-shadow-candidate-replay-gate.json`
- Change class: `RESEARCH_ONLY`
- Accepted samples: `1`
- Candidate replay passed: `false`
- Promotion allowed: `false`
- Promotion status: `blocked_manual_shadow_replay_gate`
- Next action: `collect_more_human_confirmed_count_fit_samples`

| quality | mean abs error baseline->candidate | improved |
| --- | --- | --- |
| `w` | 3.4754->2.491 (-0.9844) | `true` |
| `g` | 3.9499->2.9336 (-1.0163) | `true` |
| `b` | 4.8994->3.7357 (-1.1637) | `true` |
| `p` | 1.88->1.3413 (-0.5387) | `true` |
| `o` | 4.5868->3.39 (-1.1968) | `true` |
| `r` | 5.8579->4.4291 (-1.4288) | `true` |

## Blockers
- `manual_shadow_candidate_not_directly_deployable`
- `accepted_sample_count_below_minimum`
- `map_sample_count_below_minimum`

## Warnings
- `none`
