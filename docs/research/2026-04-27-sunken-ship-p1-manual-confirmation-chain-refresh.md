# Codex Visual Manual Confirmation Chain Refresh

- JSON: `docs/research/2026-04-27-sunken-ship-p1-manual-confirmation-chain-refresh.json`
- Change class: `RESEARCH_ONLY`
- Accepted samples: `0`
- Blocked entries: `1`
- Gate evaluated samples: `0`
- Gate promotion allowed: `false`
- Gate next action: `collect_human_confirmed_count_fit_samples`
- Ready for manual-sample-backed candidate: `false`
- Manual candidate applied maps: `none`
- Manual candidate replay passed: `false`
- Manual candidate gate next action: `collect_human_confirmed_count_fit_samples`

## Import Blockers

| reason | count |
| --- | ---: |
| `status_not_approved_for_import` | `1` |

## Gate Blockers
- `visual_shadow_candidate_not_deployable`
- `codex_visual_review_shadow_only`
- `missing_human_confirmed_count_fit_sample`
- `single_visual_candidate_overfit_risk`
- `missing_accepted_count_fit_samples`

## Gate Warnings
- `review_import_contains_blocked_entries`

## Manual Candidate Blockers
- `manual_count_prior_shadow_candidate_not_default`
- `replay_gate_required_before_default_update`
- `missing_accepted_manual_count_fit_samples`

## Manual Candidate Gate Blockers
- `manual_shadow_candidate_not_directly_deployable`
- `missing_accepted_count_fit_samples`
