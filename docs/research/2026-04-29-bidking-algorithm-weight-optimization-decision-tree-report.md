# BidKing algorithm and weight optimization decision tree

- Change class: `RESEARCH_ONLY`
- JSON: `docs/research/2026-04-29-bidking-algorithm-weight-optimization-decision-tree-report.json`
- Target item id: `1106013`
- Root authority source acquired: `false`
- Blocked maps: `sunken_ship, villa`
- Authority intake allowed: `false`
- Overlay shadow simulator allowed: `false`
- Table-backed shadow replay allowed: `false`
- Default config update allowed: `false`
- Live/order/funds path touched: `false`

## Source Gates

| gate | value |
| --- | --- |
| `authority_intake_allowed` | `false` |
| `staging_item_ingest_allowed` | `false` |
| `staging_overlay_reference_integrity_clean_for_project_scope` | `false` |
| `overlay_shadow_simulator_candidate_allowed` | `false` |
| `table_backed_shadow_replay_allowed` | `false` |
| `authority_handoff_allowed` | `false` |
| `default_config_update_allowed` | `false` |
| `synthetic_item_as_authority_allowed` | `false` |
| `drop_tuple_exclusion_as_authority_allowed` | `false` |

## Blockers

- no_direct_public_item_row_found
- steam_visible_manifest_history_has_no_item_txt_change
- current_public_manifest_has_authority_gap
- developer_or_server_side_table_export_required
- no_staged_item_rows
- project_relevant_missing_terminal_item_references_after_overlay
- staging_overlay_reference_integrity_not_clean
- staging_overlay_shadow_replay_candidate_not_allowed
- maps_still_blocked_after_overlay

## Forbidden Actions

- synthesize_1106013_as_authority
- infer_1106013_from_neighbor_items
- drop_tuple_to_unblock_map
- update_default_config_while_any_gate_is_closed
- treat_visual_or_manual_shadow_prior_as_source_authority

## Decision Node Index

| node | parent | status | pass next | fail next |
| --- | --- | --- | --- | --- |
| `root_authority_source_for_1106013` | `root` | `blocked_authority_gap` | `authority_intake_audit` | `jump_to_parallel_shadow_lanes_then_return_to_root` |
| `authority_intake_audit` | `root_authority_source_for_1106013` | `blocked_until_authority_row_exists` | `staging_item_ingest` | `return_to_root_authority_source_for_1106013` |
| `staging_item_ingest` | `authority_intake_audit` | `blocked_until_intake_passes` | `staging_overlay_reference_integrity` | `return_to_authority_intake_audit` |
| `staging_overlay_reference_integrity` | `staging_item_ingest` | `blocked_reference_integrity` | `overlay_shadow_simulator_candidate_gate` | `return_to_staging_item_ingest_or_root_authority_source` |
| `overlay_shadow_simulator_candidate_gate` | `staging_overlay_reference_integrity` | `blocked_overlay_shadow_gate` | `manual_mechanics_review_same_battle` | `return_to_staging_overlay_reference_integrity` |
| `manual_mechanics_review_same_battle` | `overlay_shadow_simulator_candidate_gate` | `pending_after_shadow_candidate` | `table_backed_shadow_replay` | `return_to_manual_sample_acquisition_or_shadow_candidate` |
| `table_backed_shadow_replay` | `manual_mechanics_review_same_battle` | `blocked_until_shadow_and_review_pass` | `default_weight_update_review` | `return_to_candidate_weight_tuning_or_manual_review` |
| `default_weight_update_review` | `table_backed_shadow_replay` | `blocked_by_current_gates` | `separate_source_first_implementation_task` | `return_to_table_backed_shadow_replay` |

## Optimization Lanes

| priority | lane | current status | adoption ceiling |
| --- | --- | --- | --- |
| `P0` | `authority_mainline` | `blocked_on_1106013_authority` | `research_or_shadow_only` |
| `P0` | `manual_confirmed_battle_samples` | `available_as_non_authority_shadow_path` | `shadow_prior_candidate_until_authority_handoff_opens` |
| `P1` | `existing_default_estimator_weight_tuning` | `allowed_for_shadow_replay_only` | `shadow_only_unless_default_update_gate_opens` |
| `P1` | `shipping_clean_table_mechanics_diagnostics` | `diagnostics_only` | `diagnostic_or_shadow_only` |
| `P2` | `visual_catalog_priors_shadow_only` | `weak_prior_only` | `shadow_ranker_never_authority` |
| `P0_guardrail` | `stress_security_gate_validation` | `should_run_before_any_promotion` | `guardrail_required_for_all_lanes` |

### authority_mainline

- Priority: `P0`
- Current status: `blocked_on_1106013_authority`
- Objective: Unlock table-backed BidKing mechanics for sunken_ship and villa without synthetic data.
- Adoption ceiling: `research_or_shadow_only`
- Route:
- root_authority_source_for_1106013
- authority_intake_audit
- staging_item_ingest
- staging_overlay_reference_integrity
- overlay_shadow_simulator_candidate_gate
- manual_mechanics_review_same_battle
- table_backed_shadow_replay
- default_weight_update_review
- Evidence to deepen when blocked:
- developer_or_server_side_table_export
- complete old StreamingAssets/Tables package with provenance
- raw 1106013 row plus matching Drop.txt context
- Rollback point: Remove generated authority/staging/shadow artifacts; no runtime defaults are changed.

### manual_confirmed_battle_samples

- Priority: `P0`
- Current status: `available_as_non_authority_shadow_path`
- Objective: Improve priors from human-confirmed count/value outcomes while the missing item authority gap remains closed.
- Adoption ceiling: `shadow_prior_candidate_until_authority_handoff_opens`
- Route:
- Build P0 confirmation page.
- Ingest reviewed download.
- Build manual confirmation authority handoff gate.
- If accepted_sample_count is zero, return to sample acquisition.
- If accepted samples pass consistency, feed only shadow candidate priors.
- Evidence to deepen when blocked:
- More P0 samples for the same map and battle context.
- Then P1/P2 only after P0 no longer has enough unresolved high-risk rows.
- Reviewer notes explaining rejection, count ambiguity, or OCR/capture issue.
- Rollback point: Discard import JSON and shadow candidate outputs for the failed review batch.

### existing_default_estimator_weight_tuning

- Priority: `P1`
- Current status: `allowed_for_shadow_replay_only`
- Objective: Tune current alpha/count/value weights using existing accepted settlement/replay evidence without relying on missing BidKing tables.
- Adoption ceiling: `shadow_only_unless_default_update_gate_opens`
- Route:
- Run settlement count replay for current defaults.
- Identify stable residuals by map and quality.
- Fit minimal per-map deltas in a candidate config.
- Run count and value non-regression.
- If regression appears, revert to parent residual bucket and split count/value changes.
- Evidence to deepen when blocked:
- Accepted settlement samples with explicit timestamps.
- Residual buckets that repeat across multiple rounds.
- Map-specific comparison before any global prior change.
- Rollback point: Delete candidate config/replay reports; keep default_config_bundle unchanged.

### shipping_clean_table_mechanics_diagnostics

- Priority: `P1`
- Current status: `diagnostics_only`
- Objective: Use maps not blocked by 1106013 as a mechanics sanity check, without promoting blocked maps.
- Adoption ceiling: `diagnostic_or_shadow_only`
- Route:
- Run table reference integrity.
- Select maps with clean references only.
- Compare recovered mechanics with current estimator priors.
- If clean-map behavior diverges, inspect decompile semantics before fitting weights.
- Never use clean-map pass to promote sunken_ship or villa while they remain blocked.
- Evidence to deepen when blocked:
- Clean map item/count/value distributions.
- DoDrop/helper semantics for the selected map.
- Same-battle samples for the clean map.
- Rollback point: Remove diagnostics reports generated after the blocked branch.

### visual_catalog_priors_shadow_only

- Priority: `P2`
- Current status: `weak_prior_only`
- Objective: Use catalog, OCR, and visual priors only to rank candidate hypotheses, not to own authority.
- Adoption ceiling: `shadow_ranker_never_authority`
- Route:
- Build visual/catalog prior report.
- Cross-check with manual review samples.
- Generate conservative shadow candidate only when it reduces uncertainty.
- If it conflicts with source tables or manual samples, return to manual confirmation.
- Evidence to deepen when blocked:
- Human-confirmed item identity.
- Catalog structural match confidence.
- Replay showing visual prior reduces error without tail regression.
- Rollback point: Discard visual prior candidate artifacts.

### stress_security_gate_validation

- Priority: `P0_guardrail`
- Current status: `should_run_before_any_promotion`
- Objective: Find weak gates and pressure-test optimizer behavior before any weight promotion.
- Adoption ceiling: `guardrail_required_for_all_lanes`
- Route:
- Inject adversarial missing item/reference cases into tests.
- Assert fail-closed gates for synthetic rows, dropped tuples, stale artifacts, and replay regressions.
- Check solver budget caps and stale source drift.
- If any gate opens incorrectly, return to the parent gate and patch guard tests first.
- Evidence to deepen when blocked:
- Targeted tests for every promotion gate.
- Static checks for stale summary-owned state.
- Replay budget and timeout evidence.
- Rollback point: Revert the candidate that opened a gate incorrectly; keep failing test as blocker.


## Decision Node Details

### root_authority_source_for_1106013

- Status: `blocked_authority_gap`
- Objective: Decide whether BidKing table-backed algorithm work can use the missing item as authority.
- Entry criteria:
- Any optimizer path wants to include sunken_ship or villa table mechanics.
- Drop/group references still terminate at item 1106013.
- Required evidence:
- Raw Tables/Item.txt row beginning with 1106013 followed by tab-delimited fields.
- Provenance for client build, server export, or complete StreamingAssets/Tables package.
- Matching Drop.txt and map context showing how the row participates in group 1066 or its successor.
- Allowed actions:
- Acquire developer or server-side table export.
- Acquire an independent complete old StreamingAssets/Tables package.
- Re-run public authority source search only if new source inventory appears.
- Forbidden actions:
- synthesize_1106013_as_authority
- infer_row_from_neighbor_items
- drop_tuple_to_unblock_map
- update_default_weights_from_incomplete_tables
- Pass next: `authority_intake_audit`
- Fail next: `jump_to_parallel_shadow_lanes_then_return_to_root`
- Blocked deepen:
- Ask for developer/server table export first.
- Search only for complete table packages with provenance, not isolated copied rows.
- Keep public Steam older-manifest path low priority because visible Item.txt change count is zero.
- Verification:
- npm run build:bidking-public-authority-source-search
- Inspect docs/research/2026-04-29-bidking-public-authority-source-search-report.json summary and gates.
- Rollback point: Delete any new staged authority input files and regenerated docs/research authority reports.

### authority_intake_audit

- Status: `blocked_until_authority_row_exists`
- Objective: Convert a raw external row into a reviewed project intake candidate without giving it runtime authority.
- Entry criteria:
- Root authority source has a raw 1106013 Item.txt row with provenance.
- The row is complete enough to parse under current table schema metadata.
- Required evidence:
- Authority intake template filled with raw row, source path, source timestamp, and reviewer notes.
- Audit confirms schema fields parse and item id is exactly 1106013.
- Audit confirms no synthetic field is used.
- Allowed actions:
- Run missing item authority intake audit.
- Create staging candidate only after audit passes.
- Record provenance and reviewer status as source-owned research metadata.
- Forbidden actions:
- merge_raw_row_directly_into_default_tables
- mark_unreviewed_row_as_authority
- skip_schema_audit
- update_default_config
- Pass next: `staging_item_ingest`
- Fail next: `return_to_root_authority_source_for_1106013`
- Blocked deepen:
- If fields do not parse, inspect schema metadata and source package completeness.
- If provenance is weak, return to source acquisition instead of relaxing the audit.
- Verification:
- npm run build:bidking-missing-item-authority-intake-audit
- node --test tests/build_bidking_missing_item_authority_intake_audit_report.test.js
- Rollback point: Remove the intake JSON/template outputs and keep original source tables unchanged.

### staging_item_ingest

- Status: `blocked_until_intake_passes`
- Objective: Ingest the audited row into a staging overlay that can be checked independently from default tables.
- Entry criteria:
- Authority intake audit passed.
- Reviewer status allows staging but not default authority.
- Required evidence:
- Staging output includes item 1106013 exactly once.
- Staging output is separate from runtime/default source tables.
- Every staged field is copied from audited source evidence.
- Allowed actions:
- Run missing item staging ingest report.
- Preserve original table files.
- Use staging overlay only for shadow analysis.
- Forbidden actions:
- edit_runtime_Item_txt
- promote_staging_overlay_to_default_config
- fill_missing_fields_with_estimator_priors
- delete_drop_reference
- Pass next: `staging_overlay_reference_integrity`
- Fail next: `return_to_authority_intake_audit`
- Blocked deepen:
- If duplicate or missing staged row appears, inspect ingest mapping and raw input.
- If fields are incomplete, return to authority intake rather than allowing partial overlay.
- Verification:
- npm run build:bidking-missing-item-staging-ingest
- node --test tests/build_bidking_missing_item_staging_ingest_report.test.js
- Rollback point: Delete staging ingest output and regenerated overlay diagnostics.

### staging_overlay_reference_integrity

- Status: `blocked_reference_integrity`
- Objective: Prove that staging resolves project-relevant terminal references before running any table-backed replay.
- Entry criteria:
- Staging overlay includes item 1106013.
- Project scope maps are shipping, sunken_ship, and villa.
- Required evidence:
- No unresolved project-relevant missing item ids after overlay.
- sunken_ship and villa are no longer blocked by missing terminal item references.
- Reference integrity report is clean for the project scope.
- Allowed actions:
- Run staging overlay reference integrity builder.
- Keep maps with unresolved terminal references blocked.
- Allow only clean maps to proceed to shadow simulator.
- Forbidden actions:
- ignore_unresolved_project_missing_item_ids
- declare_map_clean_from_summary_layer
- update_weights_for_blocked_maps
- drop_tuple_to_unblock_map
- Pass next: `overlay_shadow_simulator_candidate_gate`
- Fail next: `return_to_staging_item_ingest_or_root_authority_source`
- Blocked deepen:
- If 1106013 remains unresolved, return to staging ingest and audit raw row coverage.
- If only some maps clear, split clean-map diagnostics from blocked-map promotion.
- Verification:
- npm run build:bidking-staging-overlay-reference-integrity
- node --test tests/build_bidking_staging_overlay_reference_integrity_report.test.js
- Rollback point: Remove staging overlay outputs; do not touch default config or source tables.

### overlay_shadow_simulator_candidate_gate

- Status: `blocked_overlay_shadow_gate`
- Objective: Open a shadow-only simulator candidate after reference integrity is clean.
- Entry criteria:
- Staging overlay reference integrity is clean for project scope.
- No runtime/default table mutation occurred.
- Required evidence:
- Overlay shadow simulator candidate gate allowed.
- Candidate records its exact overlay source artifact versions.
- Candidate excludes any blocked map from promotion.
- Allowed actions:
- Run overlay shadow simulator gate.
- Generate SIM_ONLY candidate artifacts.
- Keep candidate out of default runtime until replay and manual review pass.
- Forbidden actions:
- use_shadow_candidate_as_runtime_authority
- skip_same_battle_review
- update_default_weights_before_replay
- merge_candidate_without_gate
- Pass next: `manual_mechanics_review_same_battle`
- Fail next: `return_to_staging_overlay_reference_integrity`
- Blocked deepen:
- If gate remains closed, inspect unresolved overlay blockers before touching strategy weights.
- If only shipping is clean, continue shipping diagnostics but keep sunken_ship/villa blocked.
- Verification:
- npm run build:bidking-overlay-shadow-simulator-gate
- node --test tests/build_bidking_overlay_shadow_simulator_gate_report.test.js
- Rollback point: Delete overlay shadow candidate outputs; no runtime file changes are required.

### manual_mechanics_review_same_battle

- Status: `pending_after_shadow_candidate`
- Objective: Validate that recovered BidKing mechanics match human-confirmed same-battle behavior.
- Entry criteria:
- Overlay shadow simulator candidate is allowed.
- Manual mechanics review template exists for project maps.
- Required evidence:
- Human-confirmed battle/count samples with map id, visible counts, and settlement outcome.
- Same-battle comparison between current estimator and BidKing mechanics candidate.
- Reviewer notes for any map-specific divergence.
- Allowed actions:
- Build P0/P1/P2 manual confirmation pages.
- Ingest reviewed downloads only through dedicated ingest entry points.
- Use accepted samples to calibrate shadow priors.
- Forbidden actions:
- treat_unconfirmed_samples_as_authority
- reuse_rejected_review_rows
- collapse_P0_P1_P2_priorities
- promote_from_single_noisy_round
- Pass next: `table_backed_shadow_replay`
- Fail next: `return_to_manual_sample_acquisition_or_shadow_candidate`
- Blocked deepen:
- If P0 has zero accepted samples, keep building review coverage before replay.
- If sample evidence conflicts with table mechanics, inspect replay inputs before fitting weights.
- Verification:
- npm run build:p0-manual-count-confirmation-results
- npm run ingest:p0-manual-confirmation
- npm run build:p0-manual-confirmation-authority-handoff-gate
- Rollback point: Discard the latest manual confirmation import and shadow candidate artifacts.

### table_backed_shadow_replay

- Status: `blocked_until_shadow_and_review_pass`
- Objective: Run table-backed algorithm/weight candidates against replay evidence before considering defaults.
- Entry criteria:
- Reference integrity is clean.
- Shadow candidate gate is allowed.
- Manual same-battle review has accepted samples.
- Required evidence:
- Count replay shows non-regression versus current default estimator.
- Value replay does not increase red/orange tail error.
- Solver budget and runtime remain under configured caps.
- Allowed actions:
- Fit alpha/count priors in shadow config.
- Run settlement count replay and value replay.
- Keep candidate behind replay gate.
- Forbidden actions:
- change_default_config_on_replay_failure
- overfit_to_single_map_without_OOS_check
- remove_budget_caps_to_pass_replay
- ignore_red_tail_regression
- Pass next: `default_weight_update_review`
- Fail next: `return_to_candidate_weight_tuning_or_manual_review`
- Blocked deepen:
- If count improves but value regresses, split count prior from value model changes.
- If one map regresses, isolate map-specific priors instead of changing global defaults.
- Verification:
- npm run build:bidking-table-backed-shadow-simulator
- npm run build:settlement-count-replay
- npm run build:settlement-replay
- Rollback point: Delete shadow candidate config/replay artifacts; leave default_config_bundle unchanged.

### default_weight_update_review

- Status: `blocked_by_current_gates`
- Objective: Promote only replay-clean, source-backed deltas into a default-weight implementation review.
- Entry criteria:
- Table-backed shadow replay passed non-regression gates.
- Authority handoff is explicitly allowed.
- Default config update gate is open.
- Required evidence:
- Accepted sample counts and blocked entry counts are source-owned.
- Replay report identifies exact changed weights and unchanged maps.
- Rollback target is the previous default config source version.
- Allowed actions:
- Create a narrow default weight implementation candidate.
- Run package-level JS checks and targeted algorithm tests.
- Publish only after separate release authorization.
- Forbidden actions:
- edit_default_config_without_gate
- mix_authority_and_visual_priors_without_label
- drop_failed_maps_from_evaluation
- deploy_from_research_artifact
- Pass next: `separate_source_first_implementation_task`
- Fail next: `return_to_table_backed_shadow_replay`
- Blocked deepen:
- If default update gate is closed, report blocker and keep candidate shadow-only.
- If authority handoff is closed, fix source-owned handoff evidence before code changes.
- Verification:
- node --test tests/bidking_algorithm_weight_integration.test.js
- npm run check:js
- npm test
- Rollback point: Revert only the default config candidate files; keep research artifacts for audit.


## Backtracking Rules

| blocked on | jump back to | deepen next | do not do |
| --- | --- | --- | --- |
| `authority_gap` | `root_authority_source_for_1106013` | developer/server table export; complete old table package with provenance; manual samples only as shadow evidence | synthesize item row; drop the unresolved tuple; update default config |
| `manual_sample_gap` | `manual_confirmed_battle_samples` | more P0 samples; capture/visual ambiguity review; then P1/P2 only after P0 no longer dominates risk | use draft sample as accepted; collapse priorities; fit from one noisy round |
| `shadow_replay_regression` | `table_backed_shadow_replay` | split count priors from value model; isolate map-specific deltas; restore previous candidate and rerun replay | remove budget caps; promote partial pass; hide regressing map |
| `source_consumer_drift` | `source_artifact_builder` | rebuild source artifact; repair builder input contract; make summary/UI read-only consumer again | patch summary output manually; treat chat/memory as source; derive gate state in UI |

## Decision

The current safe route is to keep all BidKing table-backed algorithm and weight changes in research or shadow-only artifacts until the `1106013` authority gap is resolved and replay gates pass. If any path blocks, jump to its parent evidence gap, deepen that evidence, and only then re-enter the child path.
