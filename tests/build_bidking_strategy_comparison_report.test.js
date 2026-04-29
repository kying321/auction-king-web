const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const defaultConfig = require("../default_config_bundle.js");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingStrategyComparisonReport,
    compareNumberToRange,
    formatBidKingStrategyComparisonMarkdown
} = require("../scripts/build_bidking_strategy_comparison_report.js");

function closedSummary(extra = {}) {
    return {
        authority_adoption_allowed: false,
        reverse_engineering_source_allowed: true,
        default_config_update_allowed: false,
        shadow_candidate_allowed: false,
        ...extra
    };
}

test("BidKing strategy comparison keeps reverse mechanics out of default authority", () => {
    const report = buildBidKingStrategyComparisonReport({
        config: defaultConfig,
        generatedAt: "2026-04-29T00:00:00.000Z",
        decompileAuditReport: { summary: closedSummary({ mechanics_recovery_status: "complete_package_table_and_hotupdate_evidence_ready" }) },
        schemaBackedTableReport: { summary: closedSummary({ parse_status: "schema_backed_named_records_built" }) },
        tableMechanicsReport: {
            summary: closedSummary({ mechanics_recovery_status: "table_mechanics_candidate_extracted" }),
            candidate_map_alignment: [{
                current_map_id: "sunken_ship",
                bidking_map_id_candidate: 105,
                bidking_bidmap_root_candidate: 2501,
                evidence_labels: ["unknown wreck"],
                confidence: "medium",
                blocker: "manual confirmation required before config mapping"
            }],
            mechanics: {
                maps: [{
                    map_id: 105,
                    bidmap_root_id: 2501,
                    item_count_range: [30, 35],
                    bidmap_count: 10,
                    rank_ai_rank_count: 6,
                    rank_map_count_distribution_samples: [{
                        bidmap_id: 2501,
                        label: "unknown wreck",
                        value_distribution_summary: {
                            min_low: 2001,
                            max_high: 300000
                        }
                    }]
                }]
            }
        },
        doDropSemanticsReport: {
            summary: closedSummary({
                parse_status: "dodrop_semantics_candidate_built",
                il_signal_complete: true
            })
        },
        dropHelperSemanticsReport: {
            summary: closedSummary({
                parse_status: "drop_helper_semantics_candidate_built",
                probability_mode_is_independent_bernoulli: true,
                weighted_mode_is_single_cumulative_choice: true,
                random_count_upper_bound_exclusive: true
            })
        },
        manualReviewTemplate: { summary: closedSummary({ review_status: "pending_manual_validation" }) },
        producerStrategyChainAuditReport: {
            summary: {
                default_weight_implementation_status: "mismatch",
                maps_ready_for_default_weight_update: 0
            }
        },
        methodCallgraphReport: {
            summary: {
                unresolved_edge_ratio: 0.4607
            }
        }
    });

    assert.equal(report.schema_version, "ak_bidking_strategy_comparison_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.authority_adoption_allowed, false);
    assert.equal(report.summary.shadow_candidate_allowed, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.algorithm_decision.keep_current_default_weights, true);
    assert.equal(report.maps.sunken_ship.current.alpha_total, 25.32);
    assert.equal(
        report.maps.sunken_ship.comparison.current_alpha_total_vs_bidking_item_count_range.relation,
        "below_range"
    );
    assert.equal(
        report.maps.sunken_ship.comparison.current_red_base_item_mean_vs_bidking_value_range.relation,
        "inside_range"
    );
    assert.ok(report.optimization_queue.some((entry) => entry.id === "table_backed_shadow_replay_before_next_weight_fit"));
    assert.match(formatBidKingStrategyComparisonMarkdown(report), /table-backed shadow replay/i);
});

test("BidKing strategy comparison exposes package entry and js check entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-strategy-comparison"], /build_bidking_strategy_comparison_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_strategy_comparison_report\.js/);
});

test("BidKing range comparison classifies low, inside, high, and unknown values", () => {
    assert.equal(compareNumberToRange(10, [20, 30]).relation, "below_range");
    assert.equal(compareNumberToRange(25, [20, 30]).relation, "inside_range");
    assert.equal(compareNumberToRange(35, [20, 30]).relation, "above_range");
    assert.equal(compareNumberToRange(35, []).relation, "unknown");
});

test("local BidKing strategy comparison builds from current artifacts when available", () => {
    if (!fs.existsSync(DEFAULT_OUTPUT_PATH.replace(/bidking-strategy-comparison-report\.json$/, "bidking-table-mechanics-report.json"))) {
        return;
    }
    const report = buildBidKingStrategyComparisonReport({ generatedAt: "2026-04-29T00:00:00.000Z" });
    assert.equal(report.summary.current_config_source_version, "ak_workspace_v2_20260428_sunken_red_tail_refit_v2");
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.helper_semantics_complete, true);
    assert.equal(report.summary.compared_map_count, 3);
    assert.equal(report.maps.sunken_ship.bidking_alignment_candidate.bidking_map_id_candidate, 105);
    assert.equal(report.maps.villa.bidking_alignment_candidate.bidking_map_id_candidate, 104);
});
