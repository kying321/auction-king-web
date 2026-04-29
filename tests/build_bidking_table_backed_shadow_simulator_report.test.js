const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingTableBackedShadowSimulatorReport,
    buildDropRecordIndex,
    buildItemRecordIndex,
    buildSeededRng,
    formatBidKingTableBackedShadowSimulatorMarkdown,
    main,
    randomCount,
    randomProbabilityIndexes,
    randomWeightIndex,
    resolveArgs,
    simulateDropGroup
} = require("../scripts/build_bidking_table_backed_shadow_simulator_report.js");

function sequenceRng(values) {
    let index = 0;
    return () => {
        const value = values[Math.min(index, values.length - 1)];
        index += 1;
        return value;
    };
}

function buildFixtureInputs() {
    const schemaBackedTableReport = {
        named_tables: {
            Table_Drop: {
                records: [
                    { group_id: 10, weight_type: 1, items_list: [[9999, 20, 1, 1, 100], [101, 3001, 1, 1, 0]] },
                    { group_id: 20, weight_type: 2, items_list: [[101, 2001, 1, 3, 100], [101, 2002, 1, 1, 1]] },
                    { group_id: 30, weight_type: 2, items_list: [[101, 3001, 1, 1, 1], [101, 3002, 1, 1, 99]] }
                ]
            },
            Table_Item: {
                records: [
                    { id: 2001, item_quality: 2, base_value: 100, grid_count: 3, item_type_id: [101], __meta: { localized_name: "blue item" } },
                    { id: 2002, item_quality: 5, base_value: 900, grid_count: 6, item_type_id: [101], __meta: { localized_name: "red item" } },
                    { id: 3001, item_quality: 1, base_value: 50, grid_count: 1, item_type_id: [101], __meta: { localized_name: "green item" } },
                    { id: 3002, item_quality: 4, base_value: 500, grid_count: 4, item_type_id: [101], __meta: { localized_name: "orange item" } }
                ]
            }
        }
    };

    const projectRelevantParseReport = {
        schema_version: "ak_bidking_project_relevant_parse_v1",
        generated_at: "2026-04-29T00:00:00.000Z",
        summary: {
            parse_status: "project_relevant_parse_complete",
            default_config_update_allowed: false,
            dodrop_semantics_complete: true,
            helper_semantics_complete: true
        },
        gates: {
            manual_mechanics_review_approved: false,
            same_battle_replay_samples_attached: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        project_maps: {
            fixture_map: {
                current_map_id: "fixture_map",
                bidking_map_id: 999,
                bidking_root_bidmap_id: 10,
                evidence_confidence: "fixture",
                map_record: { entrust_num: [1, 2], entrust_value: 1000 },
                root_drop_group_id: 10,
                root_drop_graph: {
                    reachable_drop_group_count: 2,
                    reachable_tuple_count: 4,
                    terminal_item_count: 3,
                    missing_group_count: 0
                }
            }
        }
    };

    return { schemaBackedTableReport, projectRelevantParseReport };
}

test("package exposes BidKing table-backed shadow simulator builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-table-backed-shadow-simulator"],
        "node scripts/build_bidking_table_backed_shadow_simulator_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_table_backed_shadow_simulator_report\.js/);
});

test("resolveArgs accepts parse report, schema report, output path, seed, sample count, and generated time", () => {
    const result = resolveArgs([
        "parse.json",
        "schema.json",
        "shadow.json",
        "--seed=ak-test",
        "--sample-count=12",
        "--generated-at=2026-04-29T01:00:00.000Z"
    ]);

    assert.equal(result.projectRelevantParseReportPath, path.resolve("parse.json"));
    assert.equal(result.schemaBackedTableReportPath, path.resolve("schema.json"));
    assert.equal(result.outputPath, path.resolve("shadow.json"));
    assert.equal(result.seed, "ak-test");
    assert.equal(result.sampleCount, 12);
    assert.equal(result.generatedAt, "2026-04-29T01:00:00.000Z");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-table-backed-shadow-simulator-report.json"), true);
});

test("DoDrop helpers preserve probability, weighted, nested, and exclusive count semantics", () => {
    assert.deepEqual(randomProbabilityIndexes([100, 0], () => 0.99), [0]);
    assert.deepEqual(randomProbabilityIndexes([50, 50], sequenceRng([0.49, 0.51])), [0]);
    assert.equal(randomWeightIndex([1, 99], () => 0), 0);
    assert.equal(randomWeightIndex([1, 99], () => 0.5), 1);
    assert.equal(randomCount(1, 3, () => 0), 1);
    assert.equal(randomCount(1, 3, () => 0.999), 2);

    const { schemaBackedTableReport } = buildFixtureInputs();
    const drops = buildDropRecordIndex(schemaBackedTableReport.named_tables.Table_Drop.records);
    const items = buildItemRecordIndex(schemaBackedTableReport.named_tables.Table_Item.records);
    const result = simulateDropGroup({
        dropRecordsByGroup: drops,
        itemRecordsById: items,
        groupId: 10,
        repeatCount: 1,
        rng: sequenceRng([0, 0.99, 0, 0]),
        maxDepth: 8
    });

    assert.deepEqual(result.item_counts, { 2001: 1 });
    assert.equal(result.stats.nested_group_resolution_count, 1);
    assert.equal(result.stats.max_depth_reached, 1);
    assert.equal(result.stats.missing_drop_group_count, 0);
    assert.equal(result.stats.missing_item_count, 0);
});

test("table-backed shadow simulator is deterministic and keeps all promotion gates closed", () => {
    const inputs = buildFixtureInputs();
    const first = buildBidKingTableBackedShadowSimulatorReport({
        ...inputs,
        generatedAt: "2026-04-29T01:00:00.000Z",
        seed: "fixture-seed",
        sampleCount: 16
    });
    const second = buildBidKingTableBackedShadowSimulatorReport({
        ...inputs,
        generatedAt: "2026-04-29T01:00:00.000Z",
        seed: "fixture-seed",
        sampleCount: 16
    });

    assert.deepEqual(first.map_shadow_summaries, second.map_shadow_summaries);
    assert.equal(first.schema_version, "ak_bidking_table_backed_shadow_simulator_v1");
    assert.equal(first.change_class, "SIM_ONLY");
    assert.equal(first.live_path_touched, false);
    assert.equal(first.summary.project_map_count, 1);
    assert.equal(first.summary.simulated_sample_count, 16);
    assert.equal(first.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(first.gates.authority_handoff_allowed, false);
    assert.equal(first.gates.default_config_update_allowed, false);
    assert.equal(first.summary.promotion_allowed, false);
    assert.match(first.summary.blockers.join(","), /manual_mechanics_review_not_approved/);
    assert.match(first.summary.blockers.join(","), /same_battle_replay_samples_missing/);
    assert.match(formatBidKingTableBackedShadowSimulatorMarkdown(first), /Promotion allowed: `false`/);
});

test("table-backed shadow simulator records missing item reference context without opening gates", () => {
    const report = buildBidKingTableBackedShadowSimulatorReport({
        schemaBackedTableReport: {
            named_tables: {
                Table_Drop: {
                    records: [
                        { group_id: 41, weight_type: 1, items_list: [[9999, 40, 1, 1, 100]] },
                        { group_id: 40, weight_type: 2, items_list: [[101, 999001, 1, 1, 100]] }
                    ]
                },
                Table_Item: { records: [] }
            }
        },
        projectRelevantParseReport: {
            summary: { parse_status: "project_relevant_parse_complete" },
            gates: {},
            project_maps: {
                missing_item_map: {
                    current_map_id: "missing_item_map",
                    root_drop_group_id: 41,
                    map_record: { entrust_num: [1, 1] }
                }
            }
        },
        generatedAt: "2026-04-29T01:00:00.000Z",
        seed: "missing-item-fixture",
        sampleCount: 1
    });

    const mapSummary = report.map_shadow_summaries[0];
    assert.equal(mapSummary.drop_resolution_stats.missing_item_count, 1);
    assert.equal(mapSummary.drop_resolution_stats.max_depth_reached, 1);
    assert.equal(mapSummary.missing_item_reference_context[0].missing_item_id, 999001);
    assert.equal(mapSummary.missing_item_reference_context[0].drop_group_id, 40);
    assert.equal(mapSummary.missing_item_reference_context[0].parent_references[0].parent_drop_group_id, 41);
    assert.equal(report.summary.promotion_allowed, false);
    assert.match(report.summary.blockers.join(","), /simulator_missing_item_references/);
});

test("main writes JSON and Markdown table-backed simulator artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-table-shadow-"));
    const parsePath = path.join(tempDir, "parse.json");
    const schemaPath = path.join(tempDir, "schema.json");
    const outputPath = path.join(tempDir, "shadow.json");
    const inputs = buildFixtureInputs();
    fs.writeFileSync(parsePath, JSON.stringify(inputs.projectRelevantParseReport, null, 2));
    fs.writeFileSync(schemaPath, JSON.stringify(inputs.schemaBackedTableReport, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([parsePath, schemaPath, outputPath, "--seed=fixture-seed", "--sample-count=8", "--generated-at=2026-04-29T01:00:00.000Z"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.simulated_sample_count, 8);
    assert.match(markdown, /BidKing table-backed shadow simulator report/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
