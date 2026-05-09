const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-algorithm-weight-optimization-decision-tree-report.json"
);
const DEFAULT_PUBLIC_AUTHORITY_SOURCE_SEARCH_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-public-authority-source-search-report.json"
);
const DEFAULT_OVERLAY_SHADOW_SIMULATOR_GATE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-overlay-shadow-simulator-gate-report.json"
);
const DEFAULT_STAGING_OVERLAY_REFERENCE_INTEGRITY_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-staging-overlay-reference-integrity-report.json"
);
const DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-reference-integrity-report.json"
);
const DEFAULT_TABLE_BACKED_SHADOW_SIMULATOR_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-backed-shadow-simulator-report.json"
);
const DEFAULT_STRATEGY_COMPARISON_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-strategy-comparison-report.json"
);

const TARGET_ITEM_ID = 1106013;
const PROJECT_SCOPE_MAPS = ["shipping", "sunken_ship", "villa"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at requires an ISO timestamp");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        outputPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_OUTPUT_PATH,
        generatedAt
    };
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function repoRelativePath(filePath) {
    return path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getSummary(report = {}) {
    return isPlainObject(report.summary) ? report.summary : {};
}

function getGates(report = {}) {
    return isPlainObject(report.gates) ? report.gates : {};
}

function getBoolean(report = {}, key) {
    const summary = getSummary(report);
    const gates = getGates(report);
    return summary[key] === true || gates[key] === true;
}

function getArray(value) {
    return Array.isArray(value) ? value : [];
}

function unique(values) {
    return [...new Set(getArray(values).filter((value) => value !== null && value !== undefined && value !== ""))];
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function loadDefaultReports() {
    return {
        publicAuthoritySourceSearchReport: readJsonIfExists(DEFAULT_PUBLIC_AUTHORITY_SOURCE_SEARCH_REPORT_PATH),
        overlayShadowSimulatorGateReport: readJsonIfExists(DEFAULT_OVERLAY_SHADOW_SIMULATOR_GATE_REPORT_PATH),
        stagingOverlayReferenceIntegrityReport: readJsonIfExists(DEFAULT_STAGING_OVERLAY_REFERENCE_INTEGRITY_REPORT_PATH),
        tableReferenceIntegrityReport: readJsonIfExists(DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH),
        tableBackedShadowSimulatorReport: readJsonIfExists(DEFAULT_TABLE_BACKED_SHADOW_SIMULATOR_REPORT_PATH),
        strategyComparisonReport: readJsonIfExists(DEFAULT_STRATEGY_COMPARISON_REPORT_PATH)
    };
}

function buildCurrentSignals(reports = {}) {
    const publicSummary = getSummary(reports.publicAuthoritySourceSearchReport);
    const overlaySummary = getSummary(reports.overlayShadowSimulatorGateReport);
    const strategySummary = getSummary(reports.strategyComparisonReport);
    const targetItemId = Number(publicSummary.target_item_id || TARGET_ITEM_ID);
    const blockedMaps = unique(
        overlaySummary.maps_still_blocked_after_overlay
        || overlaySummary.blocked_maps
        || []
    );
    const blockers = unique([
        ...getArray(publicSummary.blockers),
        ...getArray(overlaySummary.blockers),
        ...getArray(strategySummary.blockers)
    ]);

    return {
        target_item_id: targetItemId,
        project_scope_maps: PROJECT_SCOPE_MAPS,
        root_authority_source_acquired: publicSummary.direct_public_authority_item_row_found === true,
        visible_manifest_count: Number.isFinite(Number(publicSummary.visible_manifest_count))
            ? Number(publicSummary.visible_manifest_count)
            : null,
        visible_manifest_item_txt_change_count: Number.isFinite(Number(publicSummary.visible_manifest_item_txt_change_count))
            ? Number(publicSummary.visible_manifest_item_txt_change_count)
            : null,
        unresolved_project_missing_item_ids_after_overlay: unique(
            overlaySummary.unresolved_project_missing_item_ids_after_overlay
            || (publicSummary.direct_public_authority_item_row_found === true ? [] : [targetItemId])
        ),
        blocked_maps: blockedMaps,
        blockers,
        gates: {
            authority_intake_allowed: getBoolean(reports.publicAuthoritySourceSearchReport, "authority_intake_allowed"),
            staging_item_ingest_allowed: getBoolean(reports.publicAuthoritySourceSearchReport, "staging_item_ingest_allowed"),
            staging_overlay_reference_integrity_clean_for_project_scope: getBoolean(
                reports.overlayShadowSimulatorGateReport,
                "staging_overlay_reference_integrity_clean_for_project_scope"
            ),
            overlay_shadow_simulator_candidate_allowed: getBoolean(
                reports.overlayShadowSimulatorGateReport,
                "overlay_shadow_simulator_candidate_allowed"
            ),
            table_backed_shadow_replay_allowed: getBoolean(
                reports.publicAuthoritySourceSearchReport,
                "table_backed_shadow_replay_allowed"
            ) || getBoolean(reports.overlayShadowSimulatorGateReport, "table_backed_shadow_replay_allowed"),
            authority_handoff_allowed: getBoolean(reports.publicAuthoritySourceSearchReport, "authority_handoff_allowed")
                || getBoolean(reports.overlayShadowSimulatorGateReport, "authority_handoff_allowed"),
            default_config_update_allowed: getBoolean(reports.publicAuthoritySourceSearchReport, "default_config_update_allowed")
                || getBoolean(reports.overlayShadowSimulatorGateReport, "default_config_update_allowed")
                || getBoolean(reports.strategyComparisonReport, "default_config_update_allowed"),
            synthetic_item_as_authority_allowed: getBoolean(
                reports.publicAuthoritySourceSearchReport,
                "synthetic_item_as_authority_allowed"
            ),
            drop_tuple_exclusion_as_authority_allowed: getBoolean(
                reports.publicAuthoritySourceSearchReport,
                "drop_tuple_exclusion_as_authority_allowed"
            )
        }
    };
}

function node({
    id,
    parent_id = null,
    branch = "mainline",
    status = "pending",
    objective,
    entry_criteria,
    required_evidence,
    allowed_actions,
    forbidden_actions,
    pass_next,
    fail_next,
    blocked_deepen,
    verification,
    rollback_point
}) {
    return {
        id,
        parent_id,
        branch,
        status,
        objective,
        entry_criteria,
        required_evidence,
        allowed_actions,
        forbidden_actions,
        pass_next,
        fail_next,
        blocked_deepen,
        verification,
        rollback_point
    };
}

function buildDecisionNodes(signals) {
    const authorityStatus = signals.root_authority_source_acquired ? "passable" : "blocked_authority_gap";
    const overlayStatus = signals.gates.staging_overlay_reference_integrity_clean_for_project_scope
        ? "passable"
        : "blocked_reference_integrity";
    const shadowStatus = signals.gates.overlay_shadow_simulator_candidate_allowed
        ? "passable"
        : "blocked_overlay_shadow_gate";

    return [
        node({
            id: "root_authority_source_for_1106013",
            status: authorityStatus,
            objective: "Decide whether BidKing table-backed algorithm work can use the missing item as authority.",
            entry_criteria: [
                "Any optimizer path wants to include sunken_ship or villa table mechanics.",
                "Drop/group references still terminate at item 1106013."
            ],
            required_evidence: [
                "Raw Tables/Item.txt row beginning with 1106013 followed by tab-delimited fields.",
                "Provenance for client build, server export, or complete StreamingAssets/Tables package.",
                "Matching Drop.txt and map context showing how the row participates in group 1066 or its successor."
            ],
            allowed_actions: [
                "Acquire developer or server-side table export.",
                "Acquire an independent complete old StreamingAssets/Tables package.",
                "Re-run public authority source search only if new source inventory appears."
            ],
            forbidden_actions: [
                "synthesize_1106013_as_authority",
                "infer_row_from_neighbor_items",
                "drop_tuple_to_unblock_map",
                "update_default_weights_from_incomplete_tables"
            ],
            pass_next: "authority_intake_audit",
            fail_next: "jump_to_parallel_shadow_lanes_then_return_to_root",
            blocked_deepen: [
                "Ask for developer/server table export first.",
                "Search only for complete table packages with provenance, not isolated copied rows.",
                "Keep public Steam older-manifest path low priority because visible Item.txt change count is zero."
            ],
            verification: [
                "npm run build:bidking-public-authority-source-search",
                "Inspect docs/research/2026-04-29-bidking-public-authority-source-search-report.json summary and gates."
            ],
            rollback_point: "Delete any new staged authority input files and regenerated docs/research authority reports."
        }),
        node({
            id: "authority_intake_audit",
            parent_id: "root_authority_source_for_1106013",
            status: signals.gates.authority_intake_allowed ? "passable" : "blocked_until_authority_row_exists",
            objective: "Convert a raw external row into a reviewed project intake candidate without giving it runtime authority.",
            entry_criteria: [
                "Root authority source has a raw 1106013 Item.txt row with provenance.",
                "The row is complete enough to parse under current table schema metadata."
            ],
            required_evidence: [
                "Authority intake template filled with raw row, source path, source timestamp, and reviewer notes.",
                "Audit confirms schema fields parse and item id is exactly 1106013.",
                "Audit confirms no synthetic field is used."
            ],
            allowed_actions: [
                "Run missing item authority intake audit.",
                "Create staging candidate only after audit passes.",
                "Record provenance and reviewer status as source-owned research metadata."
            ],
            forbidden_actions: [
                "merge_raw_row_directly_into_default_tables",
                "mark_unreviewed_row_as_authority",
                "skip_schema_audit",
                "update_default_config"
            ],
            pass_next: "staging_item_ingest",
            fail_next: "return_to_root_authority_source_for_1106013",
            blocked_deepen: [
                "If fields do not parse, inspect schema metadata and source package completeness.",
                "If provenance is weak, return to source acquisition instead of relaxing the audit."
            ],
            verification: [
                "npm run build:bidking-missing-item-authority-intake-audit",
                "node --test tests/build_bidking_missing_item_authority_intake_audit_report.test.js"
            ],
            rollback_point: "Remove the intake JSON/template outputs and keep original source tables unchanged."
        }),
        node({
            id: "staging_item_ingest",
            parent_id: "authority_intake_audit",
            status: signals.gates.staging_item_ingest_allowed ? "passable" : "blocked_until_intake_passes",
            objective: "Ingest the audited row into a staging overlay that can be checked independently from default tables.",
            entry_criteria: [
                "Authority intake audit passed.",
                "Reviewer status allows staging but not default authority."
            ],
            required_evidence: [
                "Staging output includes item 1106013 exactly once.",
                "Staging output is separate from runtime/default source tables.",
                "Every staged field is copied from audited source evidence."
            ],
            allowed_actions: [
                "Run missing item staging ingest report.",
                "Preserve original table files.",
                "Use staging overlay only for shadow analysis."
            ],
            forbidden_actions: [
                "edit_runtime_Item_txt",
                "promote_staging_overlay_to_default_config",
                "fill_missing_fields_with_estimator_priors",
                "delete_drop_reference"
            ],
            pass_next: "staging_overlay_reference_integrity",
            fail_next: "return_to_authority_intake_audit",
            blocked_deepen: [
                "If duplicate or missing staged row appears, inspect ingest mapping and raw input.",
                "If fields are incomplete, return to authority intake rather than allowing partial overlay."
            ],
            verification: [
                "npm run build:bidking-missing-item-staging-ingest",
                "node --test tests/build_bidking_missing_item_staging_ingest_report.test.js"
            ],
            rollback_point: "Delete staging ingest output and regenerated overlay diagnostics."
        }),
        node({
            id: "staging_overlay_reference_integrity",
            parent_id: "staging_item_ingest",
            status: overlayStatus,
            objective: "Prove that staging resolves project-relevant terminal references before running any table-backed replay.",
            entry_criteria: [
                "Staging overlay includes item 1106013.",
                "Project scope maps are shipping, sunken_ship, and villa."
            ],
            required_evidence: [
                "No unresolved project-relevant missing item ids after overlay.",
                "sunken_ship and villa are no longer blocked by missing terminal item references.",
                "Reference integrity report is clean for the project scope."
            ],
            allowed_actions: [
                "Run staging overlay reference integrity builder.",
                "Keep maps with unresolved terminal references blocked.",
                "Allow only clean maps to proceed to shadow simulator."
            ],
            forbidden_actions: [
                "ignore_unresolved_project_missing_item_ids",
                "declare_map_clean_from_summary_layer",
                "update_weights_for_blocked_maps",
                "drop_tuple_to_unblock_map"
            ],
            pass_next: "overlay_shadow_simulator_candidate_gate",
            fail_next: "return_to_staging_item_ingest_or_root_authority_source",
            blocked_deepen: [
                "If 1106013 remains unresolved, return to staging ingest and audit raw row coverage.",
                "If only some maps clear, split clean-map diagnostics from blocked-map promotion."
            ],
            verification: [
                "npm run build:bidking-staging-overlay-reference-integrity",
                "node --test tests/build_bidking_staging_overlay_reference_integrity_report.test.js"
            ],
            rollback_point: "Remove staging overlay outputs; do not touch default config or source tables."
        }),
        node({
            id: "overlay_shadow_simulator_candidate_gate",
            parent_id: "staging_overlay_reference_integrity",
            status: shadowStatus,
            objective: "Open a shadow-only simulator candidate after reference integrity is clean.",
            entry_criteria: [
                "Staging overlay reference integrity is clean for project scope.",
                "No runtime/default table mutation occurred."
            ],
            required_evidence: [
                "Overlay shadow simulator candidate gate allowed.",
                "Candidate records its exact overlay source artifact versions.",
                "Candidate excludes any blocked map from promotion."
            ],
            allowed_actions: [
                "Run overlay shadow simulator gate.",
                "Generate SIM_ONLY candidate artifacts.",
                "Keep candidate out of default runtime until replay and manual review pass."
            ],
            forbidden_actions: [
                "use_shadow_candidate_as_runtime_authority",
                "skip_same_battle_review",
                "update_default_weights_before_replay",
                "merge_candidate_without_gate"
            ],
            pass_next: "manual_mechanics_review_same_battle",
            fail_next: "return_to_staging_overlay_reference_integrity",
            blocked_deepen: [
                "If gate remains closed, inspect unresolved overlay blockers before touching strategy weights.",
                "If only shipping is clean, continue shipping diagnostics but keep sunken_ship/villa blocked."
            ],
            verification: [
                "npm run build:bidking-overlay-shadow-simulator-gate",
                "node --test tests/build_bidking_overlay_shadow_simulator_gate_report.test.js"
            ],
            rollback_point: "Delete overlay shadow candidate outputs; no runtime file changes are required."
        }),
        node({
            id: "manual_mechanics_review_same_battle",
            parent_id: "overlay_shadow_simulator_candidate_gate",
            status: "pending_after_shadow_candidate",
            objective: "Validate that recovered BidKing mechanics match human-confirmed same-battle behavior.",
            entry_criteria: [
                "Overlay shadow simulator candidate is allowed.",
                "Manual mechanics review template exists for project maps."
            ],
            required_evidence: [
                "Human-confirmed battle/count samples with map id, visible counts, and settlement outcome.",
                "Same-battle comparison between current estimator and BidKing mechanics candidate.",
                "Reviewer notes for any map-specific divergence."
            ],
            allowed_actions: [
                "Build P0/P1/P2 manual confirmation pages.",
                "Ingest reviewed downloads only through dedicated ingest entry points.",
                "Use accepted samples to calibrate shadow priors."
            ],
            forbidden_actions: [
                "treat_unconfirmed_samples_as_authority",
                "reuse_rejected_review_rows",
                "collapse_P0_P1_P2_priorities",
                "promote_from_single_noisy_round"
            ],
            pass_next: "table_backed_shadow_replay",
            fail_next: "return_to_manual_sample_acquisition_or_shadow_candidate",
            blocked_deepen: [
                "If P0 has zero accepted samples, keep building review coverage before replay.",
                "If sample evidence conflicts with table mechanics, inspect replay inputs before fitting weights."
            ],
            verification: [
                "npm run build:p0-manual-count-confirmation-results",
                "npm run ingest:p0-manual-confirmation",
                "npm run build:p0-manual-confirmation-authority-handoff-gate"
            ],
            rollback_point: "Discard the latest manual confirmation import and shadow candidate artifacts."
        }),
        node({
            id: "table_backed_shadow_replay",
            parent_id: "manual_mechanics_review_same_battle",
            status: signals.gates.table_backed_shadow_replay_allowed ? "passable" : "blocked_until_shadow_and_review_pass",
            objective: "Run table-backed algorithm/weight candidates against replay evidence before considering defaults.",
            entry_criteria: [
                "Reference integrity is clean.",
                "Shadow candidate gate is allowed.",
                "Manual same-battle review has accepted samples."
            ],
            required_evidence: [
                "Count replay shows non-regression versus current default estimator.",
                "Value replay does not increase red/orange tail error.",
                "Solver budget and runtime remain under configured caps."
            ],
            allowed_actions: [
                "Fit alpha/count priors in shadow config.",
                "Run settlement count replay and value replay.",
                "Keep candidate behind replay gate."
            ],
            forbidden_actions: [
                "change_default_config_on_replay_failure",
                "overfit_to_single_map_without_OOS_check",
                "remove_budget_caps_to_pass_replay",
                "ignore_red_tail_regression"
            ],
            pass_next: "default_weight_update_review",
            fail_next: "return_to_candidate_weight_tuning_or_manual_review",
            blocked_deepen: [
                "If count improves but value regresses, split count prior from value model changes.",
                "If one map regresses, isolate map-specific priors instead of changing global defaults."
            ],
            verification: [
                "npm run build:bidking-table-backed-shadow-simulator",
                "npm run build:settlement-count-replay",
                "npm run build:settlement-replay"
            ],
            rollback_point: "Delete shadow candidate config/replay artifacts; leave default_config_bundle unchanged."
        }),
        node({
            id: "default_weight_update_review",
            parent_id: "table_backed_shadow_replay",
            status: signals.gates.default_config_update_allowed ? "passable" : "blocked_by_current_gates",
            objective: "Promote only replay-clean, source-backed deltas into a default-weight implementation review.",
            entry_criteria: [
                "Table-backed shadow replay passed non-regression gates.",
                "Authority handoff is explicitly allowed.",
                "Default config update gate is open."
            ],
            required_evidence: [
                "Accepted sample counts and blocked entry counts are source-owned.",
                "Replay report identifies exact changed weights and unchanged maps.",
                "Rollback target is the previous default config source version."
            ],
            allowed_actions: [
                "Create a narrow default weight implementation candidate.",
                "Run package-level JS checks and targeted algorithm tests.",
                "Publish only after separate release authorization."
            ],
            forbidden_actions: [
                "edit_default_config_without_gate",
                "mix_authority_and_visual_priors_without_label",
                "drop_failed_maps_from_evaluation",
                "deploy_from_research_artifact"
            ],
            pass_next: "separate_source_first_implementation_task",
            fail_next: "return_to_table_backed_shadow_replay",
            blocked_deepen: [
                "If default update gate is closed, report blocker and keep candidate shadow-only.",
                "If authority handoff is closed, fix source-owned handoff evidence before code changes."
            ],
            verification: [
                "node --test tests/bidking_algorithm_weight_integration.test.js",
                "npm run check:js",
                "npm test"
            ],
            rollback_point: "Revert only the default config candidate files; keep research artifacts for audit."
        })
    ];
}

function buildOptimizationLanes(signals) {
    return [
        {
            id: "authority_mainline",
            priority: "P0",
            current_status: signals.root_authority_source_acquired ? "ready_for_intake" : "blocked_on_1106013_authority",
            objective: "Unlock table-backed BidKing mechanics for sunken_ship and villa without synthetic data.",
            route: [
                "root_authority_source_for_1106013",
                "authority_intake_audit",
                "staging_item_ingest",
                "staging_overlay_reference_integrity",
                "overlay_shadow_simulator_candidate_gate",
                "manual_mechanics_review_same_battle",
                "table_backed_shadow_replay",
                "default_weight_update_review"
            ],
            evidence_to_deepen_when_blocked: [
                "developer_or_server_side_table_export",
                "complete old StreamingAssets/Tables package with provenance",
                "raw 1106013 row plus matching Drop.txt context"
            ],
            adoption_ceiling: signals.gates.default_config_update_allowed ? "default_update_review" : "research_or_shadow_only",
            rollback_point: "Remove generated authority/staging/shadow artifacts; no runtime defaults are changed."
        },
        {
            id: "manual_confirmed_battle_samples",
            priority: "P0",
            current_status: "available_as_non_authority_shadow_path",
            objective: "Improve priors from human-confirmed count/value outcomes while the missing item authority gap remains closed.",
            route: [
                "Build P0 confirmation page.",
                "Ingest reviewed download.",
                "Build manual confirmation authority handoff gate.",
                "If accepted_sample_count is zero, return to sample acquisition.",
                "If accepted samples pass consistency, feed only shadow candidate priors."
            ],
            evidence_to_deepen_when_blocked: [
                "More P0 samples for the same map and battle context.",
                "Then P1/P2 only after P0 no longer has enough unresolved high-risk rows.",
                "Reviewer notes explaining rejection, count ambiguity, or OCR/capture issue."
            ],
            adoption_ceiling: "shadow_prior_candidate_until_authority_handoff_opens",
            rollback_point: "Discard import JSON and shadow candidate outputs for the failed review batch."
        },
        {
            id: "existing_default_estimator_weight_tuning",
            priority: "P1",
            current_status: "allowed_for_shadow_replay_only",
            objective: "Tune current alpha/count/value weights using existing accepted settlement/replay evidence without relying on missing BidKing tables.",
            route: [
                "Run settlement count replay for current defaults.",
                "Identify stable residuals by map and quality.",
                "Fit minimal per-map deltas in a candidate config.",
                "Run count and value non-regression.",
                "If regression appears, revert to parent residual bucket and split count/value changes."
            ],
            evidence_to_deepen_when_blocked: [
                "Accepted settlement samples with explicit timestamps.",
                "Residual buckets that repeat across multiple rounds.",
                "Map-specific comparison before any global prior change."
            ],
            adoption_ceiling: "shadow_only_unless_default_update_gate_opens",
            rollback_point: "Delete candidate config/replay reports; keep default_config_bundle unchanged."
        },
        {
            id: "shipping_clean_table_mechanics_diagnostics",
            priority: "P1",
            current_status: "diagnostics_only",
            objective: "Use maps not blocked by 1106013 as a mechanics sanity check, without promoting blocked maps.",
            route: [
                "Run table reference integrity.",
                "Select maps with clean references only.",
                "Compare recovered mechanics with current estimator priors.",
                "If clean-map behavior diverges, inspect decompile semantics before fitting weights.",
                "Never use clean-map pass to promote sunken_ship or villa while they remain blocked."
            ],
            evidence_to_deepen_when_blocked: [
                "Clean map item/count/value distributions.",
                "DoDrop/helper semantics for the selected map.",
                "Same-battle samples for the clean map."
            ],
            adoption_ceiling: "diagnostic_or_shadow_only",
            rollback_point: "Remove diagnostics reports generated after the blocked branch."
        },
        {
            id: "visual_catalog_priors_shadow_only",
            priority: "P2",
            current_status: "weak_prior_only",
            objective: "Use catalog, OCR, and visual priors only to rank candidate hypotheses, not to own authority.",
            route: [
                "Build visual/catalog prior report.",
                "Cross-check with manual review samples.",
                "Generate conservative shadow candidate only when it reduces uncertainty.",
                "If it conflicts with source tables or manual samples, return to manual confirmation."
            ],
            evidence_to_deepen_when_blocked: [
                "Human-confirmed item identity.",
                "Catalog structural match confidence.",
                "Replay showing visual prior reduces error without tail regression."
            ],
            adoption_ceiling: "shadow_ranker_never_authority",
            rollback_point: "Discard visual prior candidate artifacts."
        },
        {
            id: "stress_security_gate_validation",
            priority: "P0_guardrail",
            current_status: "should_run_before_any_promotion",
            objective: "Find weak gates and pressure-test optimizer behavior before any weight promotion.",
            route: [
                "Inject adversarial missing item/reference cases into tests.",
                "Assert fail-closed gates for synthetic rows, dropped tuples, stale artifacts, and replay regressions.",
                "Check solver budget caps and stale source drift.",
                "If any gate opens incorrectly, return to the parent gate and patch guard tests first."
            ],
            evidence_to_deepen_when_blocked: [
                "Targeted tests for every promotion gate.",
                "Static checks for stale summary-owned state.",
                "Replay budget and timeout evidence."
            ],
            adoption_ceiling: "guardrail_required_for_all_lanes",
            rollback_point: "Revert the candidate that opened a gate incorrectly; keep failing test as blocker."
        }
    ];
}

function buildBacktrackingRules(signals) {
    return [
        {
            blocked_on: "authority_gap",
            symptoms: [
                "direct_public_authority_item_row_found is false",
                "unresolved item ids include 1106013",
                "sunken_ship or villa remains blocked"
            ],
            jump_back_to: "root_authority_source_for_1106013",
            deepen_next: [
                "developer/server table export",
                "complete old table package with provenance",
                "manual samples only as shadow evidence"
            ],
            do_not_do: [
                "synthesize item row",
                "drop the unresolved tuple",
                "update default config"
            ],
            current_relevance: signals.root_authority_source_acquired ? "not_currently_blocking" : "currently_blocking"
        },
        {
            blocked_on: "manual_sample_gap",
            symptoms: [
                "accepted_sample_count remains zero",
                "count consistency fails",
                "review rows are rejected or ambiguous"
            ],
            jump_back_to: "manual_confirmed_battle_samples",
            deepen_next: [
                "more P0 samples",
                "capture/visual ambiguity review",
                "then P1/P2 only after P0 no longer dominates risk"
            ],
            do_not_do: [
                "use draft sample as accepted",
                "collapse priorities",
                "fit from one noisy round"
            ],
            current_relevance: "available_parallel_path"
        },
        {
            blocked_on: "shadow_replay_regression",
            symptoms: [
                "count replay improves but value replay regresses",
                "red/orange tail error increases",
                "solver budget exceeds cap"
            ],
            jump_back_to: "table_backed_shadow_replay",
            deepen_next: [
                "split count priors from value model",
                "isolate map-specific deltas",
                "restore previous candidate and rerun replay"
            ],
            do_not_do: [
                "remove budget caps",
                "promote partial pass",
                "hide regressing map"
            ],
            current_relevance: "pre_promotion_guard"
        },
        {
            blocked_on: "source_consumer_drift",
            symptoms: [
                "summary layer conflicts with source artifact",
                "stale artifact feeds a builder",
                "UI/operator state recomputes authority"
            ],
            jump_back_to: "source_artifact_builder",
            deepen_next: [
                "rebuild source artifact",
                "repair builder input contract",
                "make summary/UI read-only consumer again"
            ],
            do_not_do: [
                "patch summary output manually",
                "treat chat/memory as source",
                "derive gate state in UI"
            ],
            current_relevance: "always_active"
        }
    ];
}

function buildBidKingAlgorithmWeightOptimizationDecisionTreeReport({
    generatedAt = new Date().toISOString(),
    publicAuthoritySourceSearchReport,
    overlayShadowSimulatorGateReport,
    stagingOverlayReferenceIntegrityReport,
    tableReferenceIntegrityReport,
    tableBackedShadowSimulatorReport,
    strategyComparisonReport
} = {}) {
    const defaultReports = loadDefaultReports();
    const reports = {
        publicAuthoritySourceSearchReport: publicAuthoritySourceSearchReport || defaultReports.publicAuthoritySourceSearchReport,
        overlayShadowSimulatorGateReport: overlayShadowSimulatorGateReport || defaultReports.overlayShadowSimulatorGateReport,
        stagingOverlayReferenceIntegrityReport: stagingOverlayReferenceIntegrityReport || defaultReports.stagingOverlayReferenceIntegrityReport,
        tableReferenceIntegrityReport: tableReferenceIntegrityReport || defaultReports.tableReferenceIntegrityReport,
        tableBackedShadowSimulatorReport: tableBackedShadowSimulatorReport || defaultReports.tableBackedShadowSimulatorReport,
        strategyComparisonReport: strategyComparisonReport || defaultReports.strategyComparisonReport
    };
    const signals = buildCurrentSignals(reports);
    const blockers = unique(signals.blockers);
    const forbiddenActions = [
        "synthesize_1106013_as_authority",
        "infer_1106013_from_neighbor_items",
        "drop_tuple_to_unblock_map",
        "update_default_config_while_any_gate_is_closed",
        "treat_visual_or_manual_shadow_prior_as_source_authority"
    ];

    return {
        schema_version: "ak_bidking_algorithm_weight_optimization_decision_tree_v1",
        generated_at: generatedAt,
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        live_path_touched: false,
        summary: {
            target_item_id: signals.target_item_id,
            project_scope_maps: signals.project_scope_maps,
            root_authority_source_acquired: signals.root_authority_source_acquired,
            unresolved_project_missing_item_ids_after_overlay: signals.unresolved_project_missing_item_ids_after_overlay,
            blocked_maps: signals.blocked_maps,
            visible_manifest_count: signals.visible_manifest_count,
            visible_manifest_item_txt_change_count: signals.visible_manifest_item_txt_change_count,
            authority_intake_allowed: signals.gates.authority_intake_allowed,
            staging_item_ingest_allowed: signals.gates.staging_item_ingest_allowed,
            overlay_shadow_simulator_candidate_allowed: signals.gates.overlay_shadow_simulator_candidate_allowed,
            table_backed_shadow_replay_allowed: signals.gates.table_backed_shadow_replay_allowed,
            authority_handoff_allowed: signals.gates.authority_handoff_allowed,
            default_config_update_allowed: signals.gates.default_config_update_allowed,
            recommended_next_action: signals.root_authority_source_acquired
                ? "run_authority_intake_audit"
                : "acquire_developer_or_server_side_table_export_for_1106013"
        },
        gates: signals.gates,
        blockers,
        forbidden_actions: forbiddenActions,
        decision_nodes: buildDecisionNodes(signals),
        optimization_lanes: buildOptimizationLanes(signals),
        backtracking_rules: buildBacktrackingRules(signals),
        source_artifacts: {
            public_authority_source_search_report: repoRelativePath(DEFAULT_PUBLIC_AUTHORITY_SOURCE_SEARCH_REPORT_PATH),
            overlay_shadow_simulator_gate_report: repoRelativePath(DEFAULT_OVERLAY_SHADOW_SIMULATOR_GATE_REPORT_PATH),
            staging_overlay_reference_integrity_report: repoRelativePath(DEFAULT_STAGING_OVERLAY_REFERENCE_INTEGRITY_REPORT_PATH),
            table_reference_integrity_report: repoRelativePath(DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH),
            table_backed_shadow_simulator_report: repoRelativePath(DEFAULT_TABLE_BACKED_SHADOW_SIMULATOR_REPORT_PATH),
            strategy_comparison_report: repoRelativePath(DEFAULT_STRATEGY_COMPARISON_REPORT_PATH)
        },
        notes: [
            "The decision tree is intentionally fail-closed: blocked paths jump to their parent evidence gap instead of relaxing gates.",
            "Manual, visual, and current-estimator paths can improve shadow candidates but cannot replace authority for 1106013.",
            "Default weight updates require authority handoff and replay gates to open in source artifacts."
        ]
    };
}

function formatList(values = []) {
    return getArray(values).map((value) => `- ${markdownCell(value)}`).join("\n") || "- -";
}

function formatBidKingAlgorithmWeightOptimizationDecisionTreeMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const gateRows = Object.entries(report.gates || {}).map(([key, value]) => (
        `| ${markdownCode(key)} | ${markdownCode(value === true)} |`
    )).join("\n");
    const nodeRows = (report.decision_nodes || []).map((entry) => (
        `| ${markdownCode(entry.id)} | ${markdownCode(entry.parent_id || "root")} | ${markdownCode(entry.status)} | ${markdownCode(entry.pass_next)} | ${markdownCode(entry.fail_next)} |`
    )).join("\n");
    const laneRows = (report.optimization_lanes || []).map((entry) => (
        `| ${markdownCode(entry.priority)} | ${markdownCode(entry.id)} | ${markdownCode(entry.current_status)} | ${markdownCode(entry.adoption_ceiling)} |`
    )).join("\n");
    const backtrackRows = (report.backtracking_rules || []).map((entry) => (
        `| ${markdownCode(entry.blocked_on)} | ${markdownCode(entry.jump_back_to)} | ${markdownCell((entry.deepen_next || []).join("; "))} | ${markdownCell((entry.do_not_do || []).join("; "))} |`
    )).join("\n");
    const nodeDetails = (report.decision_nodes || []).map((entry) => (
        `### ${entry.id}

- Status: ${markdownCode(entry.status)}
- Objective: ${markdownCell(entry.objective)}
- Entry criteria:
${formatList(entry.entry_criteria)}
- Required evidence:
${formatList(entry.required_evidence)}
- Allowed actions:
${formatList(entry.allowed_actions)}
- Forbidden actions:
${formatList(entry.forbidden_actions)}
- Pass next: ${markdownCode(entry.pass_next)}
- Fail next: ${markdownCode(entry.fail_next)}
- Blocked deepen:
${formatList(entry.blocked_deepen)}
- Verification:
${formatList(entry.verification)}
- Rollback point: ${markdownCell(entry.rollback_point)}
`
    )).join("\n");
    const laneDetails = (report.optimization_lanes || []).map((entry) => (
        `### ${entry.id}

- Priority: ${markdownCode(entry.priority)}
- Current status: ${markdownCode(entry.current_status)}
- Objective: ${markdownCell(entry.objective)}
- Adoption ceiling: ${markdownCode(entry.adoption_ceiling)}
- Route:
${formatList(entry.route)}
- Evidence to deepen when blocked:
${formatList(entry.evidence_to_deepen_when_blocked)}
- Rollback point: ${markdownCell(entry.rollback_point)}
`
    )).join("\n");

    return `# BidKing algorithm and weight optimization decision tree

- Change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Target item id: \`${summary.target_item_id || TARGET_ITEM_ID}\`
- Root authority source acquired: \`${summary.root_authority_source_acquired === true}\`
- Blocked maps: \`${getArray(summary.blocked_maps).join(", ") || "-"}\`
- Authority intake allowed: \`${summary.authority_intake_allowed === true}\`
- Overlay shadow simulator allowed: \`${summary.overlay_shadow_simulator_candidate_allowed === true}\`
- Table-backed shadow replay allowed: \`${summary.table_backed_shadow_replay_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Source Gates

| gate | value |
| --- | --- |
${gateRows}

## Blockers

${formatList(report.blockers)}

## Forbidden Actions

${formatList(report.forbidden_actions)}

## Decision Node Index

| node | parent | status | pass next | fail next |
| --- | --- | --- | --- | --- |
${nodeRows}

## Optimization Lanes

| priority | lane | current status | adoption ceiling |
| --- | --- | --- | --- |
${laneRows}

${laneDetails}

## Decision Node Details

${nodeDetails}

## Backtracking Rules

| blocked on | jump back to | deepen next | do not do |
| --- | --- | --- | --- |
${backtrackRows}

## Decision

The current safe route is to keep all BidKing table-backed algorithm and weight changes in research or shadow-only artifacts until the \`1106013\` authority gap is resolved and replay gates pass. If any path blocks, jump to its parent evidence gap, deepen that evidence, and only then re-enter the child path.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingAlgorithmWeightOptimizationDecisionTreeReport({
        generatedAt: args.generatedAt || new Date().toISOString()
    });
    writeJson(args.outputPath, report);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatBidKingAlgorithmWeightOptimizationDecisionTreeMarkdown(report, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    buildBacktrackingRules,
    buildBidKingAlgorithmWeightOptimizationDecisionTreeReport,
    buildCurrentSignals,
    buildDecisionNodes,
    buildOptimizationLanes,
    formatBidKingAlgorithmWeightOptimizationDecisionTreeMarkdown,
    main,
    resolveArgs
};
