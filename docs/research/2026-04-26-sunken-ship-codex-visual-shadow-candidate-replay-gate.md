# Codex Visual Shadow Candidate Replay Gate

- JSON: `docs/research/2026-04-26-sunken-ship-codex-visual-shadow-candidate-replay-gate.json`
- Change class: `RESEARCH_ONLY`
- Accepted samples: `1`
- Promotion allowed: `false`
- Promotion status: `blocked_visual_shadow_source`
- Next action: `rebuild_manual_sample_backed_count_prior_candidate`

| quality | mean abs error baseline->candidate | improved |
| --- | --- | --- |
| `w` | 3.4754->0.9815 (-2.4939) | `true` |
| `g` | 3.9499->1.3531 (-2.5968) | `true` |
| `b` | 4.8994->2.4035 (-2.4959) | `true` |
| `p` | 1.88->4.9198 (3.0398) | `false` |
| `o` | 4.5868->2.9858 (-1.601) | `true` |
| `r` | 5.8579->4.7091 (-1.1488) | `true` |

## Blockers
- `visual_shadow_candidate_not_deployable`
- `codex_visual_review_shadow_only`
- `missing_human_confirmed_count_fit_sample`
- `single_visual_candidate_overfit_risk`

## Warnings
- `none`
