# producer strategy chain audit

- 变更类: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-25-producer-strategy-chain-audit-report.json`
- status: `blocked`
- failed checks: `1`
- default weight authority adoption allowed: `false`
- default weight authority blockers: `red_label_sample_count_below_default_update_gate, fit_uses_partial_overlay_replay_samples, purple_multiplier_scan_is_shadow_only`
- count-fit acquisition blocked maps: `3`
- count-fit acquisition target samples: `90`
- count-fit acquisition existing candidate tasks: `12`
- count-fit acquisition fresh map tasks: `3`
- count-fit review template existing drafts: `12`
- count-fit review template fresh drafts: `3`
- count-fit review import accepted samples: `0`
- count-fit review import blocked entries: `12`

## Checks

| check | passed | blocker |
| --- | --- | --- |
| `candidate_source_report_points_to_architecture` | `true` | `-` |
| `count_replay_candidate_context_matches_candidate_config` | `true` | `-` |
| `diagnostics_candidate_context_matches_count_replay` | `true` | `-` |
| `count_fit_readiness_guard_present_in_replay_context` | `true` | `-` |
| `no_legacy_strategy_source_report_in_replay_context` | `true` | `-` |
| `architecture_report_schema_present` | `true` | `-` |
| `default_weight_implementation_report_applied` | `false` | `default_weight_implementation_mismatch` |
| `default_weight_authority_adoption_status_reported` | `true` | `-` |
| `count_fit_sample_acquisition_queue_schema_present` | `true` | `-` |
| `count_fit_sample_acquisition_queue_covers_count_fit_blockers` | `true` | `-` |
| `count_fit_sample_acquisition_pack_schema_present` | `true` | `-` |
| `count_fit_sample_acquisition_pack_covers_queue_blockers` | `true` | `-` |
| `count_fit_sample_review_template_schema_present` | `true` | `-` |
| `count_fit_sample_review_template_covers_acquisition_pack` | `true` | `-` |
| `count_fit_sample_review_import_schema_present` | `true` | `-` |
| `count_fit_readiness_consumes_review_import` | `true` | `-` |
