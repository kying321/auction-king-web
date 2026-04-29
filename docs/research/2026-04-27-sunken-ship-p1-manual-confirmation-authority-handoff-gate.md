# Manual Confirmation Authority Handoff Gate

- JSON: `docs/research/2026-04-27-sunken-ship-p1-manual-confirmation-authority-handoff-gate.json`
- Change class: `RESEARCH_ONLY`
- Ingest status: `no_accepted_samples`
- Accepted samples: `0`
- Blocked entries: `1`
- Authority sample merge allowed: `false`
- Replay candidate ready: `false`
- Default weight update allowed: `false`
- Next action: `approve_manual_confirmation_counts_then_download_json`

## Commands
- authority sample merge: `blocked`
- default weight update: `blocked`

## Blockers
- `missing_accepted_manual_count_fit_samples`
- `manual_confirmation_import_contains_blocked_entries`
- `missing_accepted_count_fit_samples`
- `count_fit_import_contains_blocked_entries`
- `status_not_approved_for_import`
- `manual_candidate_replay_gate_not_passed`

## Default Weight Blockers
- `default_weight_update_requires_separate_promotion_gate`
- `authority_sample_merge_not_allowed`
- `manual_candidate_replay_gate_not_passed`

## Warnings
- `none`
