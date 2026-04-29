# Manual Count Prior Shadow Candidate Config

- JSON: `docs/research/2026-04-26-manual-count-prior-shadow-candidate-config.json`
- Change class: `RESEARCH_ONLY`
- Usage: `shadow_replay_only`
- Accepted samples: `1`
- Default config update allowed: `false`
- Policy: `blend_manual_quality_ratios_preserve_baseline_alpha_total`

| map | samples | blend weight | strength | candidate alpha counts | aggregated actual counts |
| --- | ---: | ---: | ---: | --- | --- |
| `sunken_ship` | `1` | `0.25` | `2.4` | `w:4.2014 g:5.5679 b:7.2793 p:3.4182 o:2.4446 r:2.4086` | `w:1 g:2 b:3 p:4 o:5 r:6` |

## Adoption Blockers
- `manual_count_prior_shadow_candidate_not_default`
- `replay_gate_required_before_default_update`
- `map_sample_count_below_minimum`
