const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");

function loadBuilder() {
    return require("../scripts/build_bidking_algorithm_weight_optimization_decision_tree_report.js");
}

test("package exposes BidKing algorithm and weight optimization decision tree builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-algorithm-weight-optimization-decision-tree"],
        "node scripts/build_bidking_algorithm_weight_optimization_decision_tree_report.js"
    );
    assert.match(
        packageJson.scripts["check:js"],
        /build_bidking_algorithm_weight_optimization_decision_tree_report\.js/
    );
});

test("decision tree remains fail-closed when 1106013 authority is missing", () => {
    const { buildBidKingAlgorithmWeightOptimizationDecisionTreeReport } = loadBuilder();
    const report = buildBidKingAlgorithmWeightOptimizationDecisionTreeReport({
        generatedAt: "2026-04-29T12:30:00.000+08:00",
        publicAuthoritySourceSearchReport: {
            summary: {
                target_item_id: 1106013,
                direct_public_authority_item_row_found: false,
                visible_manifest_count: 25,
                visible_manifest_item_txt_change_count: 0,
                authority_intake_allowed: false,
                staging_item_ingest_allowed: false,
                table_backed_shadow_replay_allowed: false,
                authority_handoff_allowed: false,
                default_config_update_allowed: false,
                blockers: [
                    "no_direct_public_item_row_found",
                    "developer_or_server_side_table_export_required"
                ]
            },
            gates: {
                synthetic_item_as_authority_allowed: false,
                drop_tuple_exclusion_as_authority_allowed: false
            }
        },
        overlayShadowSimulatorGateReport: {
            summary: {
                unresolved_project_missing_item_ids_after_overlay: [1106013],
                maps_still_blocked_after_overlay: ["sunken_ship", "villa"],
                overlay_shadow_simulator_candidate_allowed: false,
                blockers: [
                    "no_staged_item_rows",
                    "staging_overlay_reference_integrity_not_clean"
                ]
            },
            gates: {
                overlay_shadow_simulator_candidate_allowed: false,
                default_config_update_allowed: false
            }
        }
    });

    assert.equal(report.schema_version, "ak_bidking_algorithm_weight_optimization_decision_tree_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.target_item_id, 1106013);
    assert.equal(report.summary.root_authority_source_acquired, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.deepEqual(report.summary.blocked_maps, ["sunken_ship", "villa"]);
    assert.match(report.blockers.join(","), /developer_or_server_side_table_export_required/);
    assert.match(report.forbidden_actions.join(","), /synthesize_1106013_as_authority/);
    assert.match(report.forbidden_actions.join(","), /drop_tuple_to_unblock_map/);
    assert.ok(Object.values(report.source_artifacts).every((artifactPath) => !path.isAbsolute(artifactPath)));
});

test("decision tree defines authority mainline and non-authority shadow fallback lanes", () => {
    const { buildBidKingAlgorithmWeightOptimizationDecisionTreeReport } = loadBuilder();
    const report = buildBidKingAlgorithmWeightOptimizationDecisionTreeReport({
        generatedAt: "2026-04-29T12:30:00.000+08:00"
    });
    const nodeIds = new Set(report.decision_nodes.map((node) => node.id));
    const laneIds = new Set(report.optimization_lanes.map((lane) => lane.id));

    assert.ok(nodeIds.has("root_authority_source_for_1106013"));
    assert.ok(nodeIds.has("authority_intake_audit"));
    assert.ok(nodeIds.has("staging_overlay_reference_integrity"));
    assert.ok(nodeIds.has("table_backed_shadow_replay"));
    assert.ok(nodeIds.has("default_weight_update_review"));
    assert.ok(laneIds.has("manual_confirmed_battle_samples"));
    assert.ok(laneIds.has("existing_default_estimator_weight_tuning"));
    assert.ok(laneIds.has("shipping_clean_table_mechanics_diagnostics"));
    assert.ok(laneIds.has("visual_catalog_priors_shadow_only"));
    assert.ok(laneIds.has("stress_security_gate_validation"));
    assert.ok(report.backtracking_rules.some((rule) => rule.blocked_on === "authority_gap"));
});

test("nodes describe evidence, actions, pass/fail routing, rollback, and verification", () => {
    const { buildBidKingAlgorithmWeightOptimizationDecisionTreeReport } = loadBuilder();
    const report = buildBidKingAlgorithmWeightOptimizationDecisionTreeReport();

    for (const node of report.decision_nodes) {
        assert.equal(typeof node.id, "string");
        assert.ok(node.entry_criteria.length > 0, `${node.id} missing entry criteria`);
        assert.ok(node.required_evidence.length > 0, `${node.id} missing required evidence`);
        assert.ok(node.allowed_actions.length > 0, `${node.id} missing allowed actions`);
        assert.ok(node.forbidden_actions.length > 0, `${node.id} missing forbidden actions`);
        assert.equal(typeof node.pass_next, "string", `${node.id} missing pass_next`);
        assert.equal(typeof node.fail_next, "string", `${node.id} missing fail_next`);
        assert.ok(node.verification.length > 0, `${node.id} missing verification`);
        assert.equal(typeof node.rollback_point, "string", `${node.id} missing rollback point`);
    }
}
);

test("main writes JSON and Markdown decision tree artifacts", () => {
    const {
        formatBidKingAlgorithmWeightOptimizationDecisionTreeMarkdown,
        main
    } = loadBuilder();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-decision-tree-"));
    const outputPath = path.join(tempDir, "decision-tree.json");

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([outputPath, "--generated-at=2026-04-29T12:30:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.generated_at, "2026-04-29T12:30:00.000+08:00");
    assert.match(markdown, /BidKing algorithm and weight optimization decision tree/);
    assert.match(markdown, /root_authority_source_for_1106013/);
    assert.match(markdown, /Backtracking Rules/);
    assert.match(
        formatBidKingAlgorithmWeightOptimizationDecisionTreeMarkdown(report, outputPath),
        /Default config update allowed/
    );
    assert.equal(printed.join(""), `${outputPath}\n`);
});
