const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingMissingItemResolutionCandidateReport,
    buildMissingItemResolutionCandidates,
    formatReportPath,
    formatBidKingMissingItemResolutionCandidateMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_bidking_missing_item_resolution_candidate_report.js");

function buildFixtureInputs() {
    const schemaBackedTableReport = {
        inputs: { tables_dir: "/fixture/Tables" },
        named_tables: {
            Table_Item: {
                records: [
                    { id: 5001, item_quality: 6, base_value: 120000, item_type_id: [50, 60], slot_type: 22, __meta: { localized_name: "known one" } },
                    { id: 5002, item_quality: 6, base_value: 140000, item_type_id: [50, 60], slot_type: 22, __meta: { localized_name: "known two" } },
                    { id: 9101, item_quality: 1, base_value: 10, item_type_id: [91], slot_type: 1, __meta: { localized_name: "other" } }
                ]
            },
            Table_Drop: {
                records: [
                    { group_id: 10, weight_type: 2, items_list: [[50, 5001, 1, 1, 800], [50, 5002, 1, 1, 400], [50, 5003, 1, 1, 333]], __meta: { localized_name: "project quality6" } },
                    { group_id: 20, weight_type: 2, items_list: [[91, 9999, 1, 1, 111]], __meta: { localized_name: "irrelevant" } }
                ]
            }
        }
    };
    const tableReferenceIntegrityReport = {
        schema_version: "ak_bidking_table_reference_integrity_v1",
        summary: {
            project_relevant_missing_terminal_item_ids: [5003],
            skipped_irrelevant_missing_terminal_item_ids: [9999],
            maps_blocked_by_missing_item_references: ["fixture_map"],
            default_config_update_allowed: false
        },
        global_missing_terminal_item_references: [
            {
                item_id: 5003,
                drop_group_id: 10,
                drop_localized_name: "project quality6",
                tuple_index: 0,
                tuple: [50, 5003, 1, 1, 333],
                parent_references: [
                    { parent_drop_group_id: 1001, parent_localized_name: "fixture parent" }
                ]
            },
            {
                item_id: 9999,
                drop_group_id: 20,
                drop_localized_name: "irrelevant",
                tuple_index: 0,
                tuple: [91, 9999, 1, 1, 111],
                parent_references: []
            }
        ],
        project_map_integrity: {
            fixture_map: {
                current_map_id: "fixture_map",
                missing_terminal_item_ids: [5003],
                missing_terminal_item_references: [
                    {
                        item_id: 5003,
                        drop_group_id: 10,
                        drop_localized_name: "project quality6",
                        tuple_index: 0,
                        tuple: [50, 5003, 1, 1, 333],
                        parent_references: [
                            { parent_drop_group_id: 1001, parent_localized_name: "fixture parent" }
                        ]
                    }
                ]
            }
        }
    };
    return { schemaBackedTableReport, tableReferenceIntegrityReport };
}

test("package exposes BidKing missing item resolution candidate builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-missing-item-resolution-candidate"],
        "node scripts/build_bidking_missing_item_resolution_candidate_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_missing_item_resolution_candidate_report\.js/);
});

test("resolveArgs accepts integrity report, schema report, output path, and generated time", () => {
    const result = resolveArgs([
        "integrity.json",
        "schema.json",
        "candidate.json",
        "--generated-at=2026-04-29T04:30:00.000+08:00"
    ]);

    assert.equal(result.tableReferenceIntegrityReportPath, path.resolve("integrity.json"));
    assert.equal(result.schemaBackedTableReportPath, path.resolve("schema.json"));
    assert.equal(result.outputPath, path.resolve("candidate.json"));
    assert.equal(result.generatedAt, "2026-04-29T04:30:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-missing-item-resolution-candidate-report.json"), true);
});

test("resolution candidate report sanitizes publishable input paths", () => {
    assert.equal(
        formatReportPath(path.join(__dirname, "..", "docs", "research", "integrity.json")),
        "<repo>/docs/research/integrity.json"
    );
    assert.equal(
        formatReportPath("/tmp/ak_bidking_depot_4128581_tables_owned/BidKing_Data/StreamingAssets/Tables"),
        "<authenticated-steam-depot>/BidKing_Data/StreamingAssets/Tables"
    );
});

test("candidate builder keeps inferred missing item context non-authoritative", () => {
    const { schemaBackedTableReport, tableReferenceIntegrityReport } = buildFixtureInputs();
    const candidates = buildMissingItemResolutionCandidates({
        schemaBackedTableReport,
        tableReferenceIntegrityReport
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].item_id, 5003);
    assert.equal(candidates[0].source_item_record_found, false);
    assert.deepEqual(candidates[0].neighboring_same_family_item_ids, [5001, 5002]);
    assert.equal(candidates[0].project_map_ids.join(","), "fixture_map");
    assert.equal(candidates[0].candidate_confidence, "low_source_gap");
    assert.equal(candidates[0].authority_action_allowed, false);
    assert.match(candidates[0].resolution_options[0], /recover_original_item_row/);
    assert.equal(candidates[0].drop_group_curve_contexts.length, 1);
    assert.equal(candidates[0].drop_group_curve_contexts[0].known_peer_count, 2);
    assert.equal(candidates[0].drop_group_curve_contexts[0].missing_weight, 333);
    assert.equal(candidates[0].drop_group_curve_contexts[0].curve_signal, "inverse_value_weight_context_only");
    assert.ok(candidates[0].drop_group_curve_contexts[0].predicted_base_value_from_missing_weight > 100);
    assert.deepEqual(
        candidates[0].drop_group_curve_contexts[0].nearest_weight_peers.map((entry) => entry.item_id),
        [5002, 5001]
    );
});

test("resolution report blocks synthetic item and tuple-exclusion promotion", () => {
    const report = buildBidKingMissingItemResolutionCandidateReport({
        ...buildFixtureInputs(),
        generatedAt: "2026-04-29T04:30:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_missing_item_resolution_candidate_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.project_relevant_missing_item_candidate_count, 1);
    assert.deepEqual(report.summary.project_relevant_missing_item_ids, [5003]);
    assert.equal(report.summary.curve_context_count, 1);
    assert.equal(report.summary.inverse_value_weight_context_count, 1);
    assert.equal(report.gates.synthetic_item_as_authority_allowed, false);
    assert.equal(report.gates.drop_tuple_exclusion_as_authority_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /missing_item_source_row_unresolved/);
    assert.match(formatBidKingMissingItemResolutionCandidateMarkdown(report), /missing item resolution candidate/);
});

test("main writes JSON and Markdown missing item resolution artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-missing-item-"));
    const integrityPath = path.join(tempDir, "integrity.json");
    const schemaPath = path.join(tempDir, "schema.json");
    const outputPath = path.join(tempDir, "candidate.json");
    const inputs = buildFixtureInputs();
    fs.writeFileSync(integrityPath, JSON.stringify(inputs.tableReferenceIntegrityReport, null, 2));
    fs.writeFileSync(schemaPath, JSON.stringify(inputs.schemaBackedTableReport, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([integrityPath, schemaPath, outputPath, "--generated-at=2026-04-29T04:30:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.project_relevant_missing_item_candidate_count, 1);
    assert.match(markdown, /Source gap remains unresolved/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
