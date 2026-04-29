const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingProjectRelevantParseReport,
    buildDropGraphIndex,
    formatBidKingProjectRelevantParseMarkdown,
    getBidMapRootDropGroupId
} = require("../scripts/build_bidking_project_relevant_parse_report.js");

test("BidKing project-relevant parse report closes defaults while marking strategy scope complete", () => {
    const report = buildBidKingProjectRelevantParseReport({
        generatedAt: "2026-04-29T00:00:00.000Z",
        schemaBackedTableReport: {
            named_tables: {
                Table_Map: {
                    table_file: "Map.txt",
                    row_count: 1,
                    mapping_mode: "id_plus_localized_columns_after_id",
                    schema_members: [{ name: "id" }],
                    records: [{
                        id: 105,
                        entrust_bidmap: 2501,
                        entrust_num: [30, 35],
                        entrust_value: 20000,
                        entrust_prob: 500,
                        mapgroup: 105,
                        __meta: { localized_name: "unknown wreck" }
                    }]
                },
                Table_BidMap: {
                    table_file: "BidMap.txt",
                    row_count: 1,
                    mapping_mode: "id_plus_localized_columns_after_id",
                    schema_members: [{ name: "id" }],
                    records: [{
                        id: 2501,
                        parent_map_id: 105,
                        map_cell: 10,
                        bidder_number: 2,
                        auction_rounds_rate: [2000, 1600],
                        drop_group_id: [9999, 2501, 30, 35],
                        __meta: { localized_name: "unknown wreck" }
                    }]
                },
                Table_RankMap: {
                    table_file: "RankMap.txt",
                    row_count: 1,
                    mapping_mode: "id_plus_localized_columns_after_id",
                    schema_members: [{ name: "id" }],
                    records: [{
                        id: 2501,
                        match_time: [[30, 35, 100]],
                        role_spawn: [[101, 100]],
                        min_bid_range: [[2001, 300000, 100]],
                        bid_type: [1],
                        __meta: { localized_name: "unknown wreck" }
                    }]
                },
                Table_RankAi: { table_file: "RankAi.txt", row_count: 0, mapping_mode: "id_plus_localized_columns_after_id", schema_members: [], records: [] },
                Table_Drop: {
                    table_file: "Drop.txt",
                    row_count: 2,
                    mapping_mode: "id_plus_localized_columns_after_id",
                    schema_members: [{ name: "group_id" }],
                    records: [
                        { group_id: 2501, weight_type: 2, items_list: [[9999, 250101, 1, 1, 100]] },
                        { group_id: 250101, weight_type: 2, items_list: [[101, 1101001, 1, 1, 100]] }
                    ]
                },
                Table_Item: {
                    table_file: "Item.txt",
                    row_count: 1,
                    mapping_mode: "id_plus_localized_columns_after_id",
                    schema_members: [{ name: "id" }],
                    records: [{
                        id: 1101001,
                        item_type_id: [101],
                        item_quality: 1,
                        base_value: 1000,
                        grid_count: 1,
                        is_auction: true,
                        __meta: { localized_name: "item" }
                    }]
                },
                Table_Skill: { table_file: "Skill.txt", row_count: 0, mapping_mode: "id_plus_localized_columns_after_id", schema_members: [], records: [] },
                Table_Hero: { table_file: "Hero.txt", row_count: 0, mapping_mode: "id_plus_localized_columns_after_id", schema_members: [], records: [] },
                Table_BattleItem: { table_file: "BattleItem.txt", row_count: 0, mapping_mode: "id_plus_localized_columns_after_id", schema_members: [], records: [] },
                Table_Condition: { table_file: "Condition.txt", row_count: 0, mapping_mode: "id_plus_localized_columns_after_id", schema_members: [], records: [] },
                Table_Sim: { table_file: "Sim.txt", row_count: 0, mapping_mode: "id_plus_localized_columns_after_id", schema_members: [], records: [] },
                Table_Constant: { table_file: "Constant.txt", row_count: 0, mapping_mode: "direct_schema_columns", schema_members: [], records: [] }
            }
        },
        doDropSemanticsReport: { summary: { il_signal_complete: true, parse_status: "dodrop_semantics_candidate_built" } },
        dropHelperSemanticsReport: {
            summary: {
                parse_status: "drop_helper_semantics_candidate_built",
                probability_mode_is_independent_bernoulli: true,
                weighted_mode_is_single_cumulative_choice: true,
                random_count_upper_bound_exclusive: true,
                missing_helper_keys: []
            }
        },
        methodMetadataReport: { summary: { target_method_marker_count: 15, primary_method_markers_missing: [] } },
        methodCallgraphReport: { summary: { method_node_count: 56, edge_count: 521, unresolved_edge_count: 240, unresolved_edge_ratio: 0.4607 } },
        focusedIlReport: { summary: { focused_method_count: 14, unresolved_token_reference_ratio: 0.3113 } },
        strategyComparisonReport: {
            maps: {
                sunken_ship: {
                    bidking_alignment_candidate: {
                        bidking_map_id_candidate: 105,
                        bidking_bidmap_root_candidate: 2501,
                        confidence: "medium",
                        blocker: "manual confirmation required"
                    }
                }
            }
        }
    });

    assert.equal(report.schema_version, "ak_bidking_project_relevant_parse_v1");
    assert.equal(report.summary.parse_status, "project_relevant_parse_complete");
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.helper_semantics_complete, true);
    assert.equal(report.summary.dodrop_semantics_complete, true);
    assert.equal(report.summary.project_relevant_method_scope_complete, true);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.project_maps.sunken_ship.root_drop_graph.reachable_drop_group_count, 2);
    assert.equal(report.indexes.item_index.collectible_item_count, 1);
    assert.match(formatBidKingProjectRelevantParseMarkdown(report), /Project-relevant parsing is complete/);
});

test("BidKing root drop group helper reads nested bidmap drop contracts", () => {
    assert.equal(getBidMapRootDropGroupId({ drop_group_id: [9999, 2501, 30, 35] }), 2501);
    assert.equal(getBidMapRootDropGroupId({ drop_group_id: [2501] }), 2501);
    assert.equal(getBidMapRootDropGroupId({ drop_group_id: [] }), null);
});

test("BidKing drop graph identifies nested groups and missing terminal item references", () => {
    const graph = buildDropGraphIndex([
        { group_id: 1, weight_type: 2, items_list: [[9999, 2, 1, 1, 100]] },
        { group_id: 2, weight_type: 1, items_list: [[101, 1001, 1, 1, 100], [101, 9999, 1, 1, 100]] }
    ], [{ id: 1001 }]);
    assert.equal(graph.drop_group_count, 2);
    assert.equal(graph.nested_group_id_count, 1);
    assert.equal(graph.missing_terminal_item_count, 1);
    assert.equal(graph.root_walk(1).reachable_drop_group_count, 2);
});

test("package exposes BidKing project-relevant parse entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-project-relevant-parse"], /build_bidking_project_relevant_parse_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_project_relevant_parse_report\.js/);
});

test("local BidKing project-relevant parse report builds from current artifacts when available", () => {
    if (!fs.existsSync(DEFAULT_OUTPUT_PATH.replace(/project-relevant-parse-report\.json$/, "schema-backed-table-report.json"))) {
        return;
    }
    const report = buildBidKingProjectRelevantParseReport({ generatedAt: "2026-04-29T00:00:00.000Z" });
    assert.equal(report.summary.parse_status, "project_relevant_parse_complete");
    assert.equal(report.summary.included_table_count, 12);
    assert.equal(report.summary.missing_required_table_count, 0);
    assert.equal(report.summary.project_aligned_map_count, 3);
    assert.ok(report.summary.drop_tuple_count > 8000);
    assert.ok(report.project_maps.sunken_ship.root_drop_graph.reachable_drop_group_count > 0);
    assert.equal(report.gates.default_config_update_allowed, false);
});
