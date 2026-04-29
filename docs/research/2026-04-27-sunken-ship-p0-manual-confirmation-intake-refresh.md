# P0 Manual Confirmation Intake Refresh

- JSON: `docs/research/2026-04-27-sunken-ship-p0-manual-confirmation-intake-refresh.json`
- Change class: `RESEARCH_ONLY`
- Ingest status: `no_accepted_samples`
- Accepted samples: `0`
- Blocked entries: `2`
- Authority sample merge allowed: `false`
- Replay candidate ready: `false`
- Default weight update allowed: `false`
- Next action: `approve_manual_confirmation_counts_then_download_json`

## Blockers
- `missing_accepted_manual_count_fit_samples`
- `manual_confirmation_import_contains_blocked_entries`
- `manual_candidate_replay_gate_not_passed`
- `manual_shadow_candidate_not_directly_deployable`
- `missing_accepted_count_fit_samples`
- `count_fit_import_contains_blocked_entries`
- `status_not_approved_for_import`
- `actual_counts_total_mismatch`

## Commands
- rerun intake: `npm run intake:p0-manual-confirmation`
- authority sample merge: `blocked`
