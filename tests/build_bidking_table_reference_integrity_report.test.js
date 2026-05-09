const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingTableReferenceIntegrityReport,
    collectMissingTerminalItemReferences,
    formatReportPath,
    formatBidKingTableReferenceIntegrityMarkdown,
    main,
    resolveArgs,
    walkReachableDropGroups
} = require("../scripts/build_bidking_table_reference_integrity_report.js");

function buildFixtureInputs() {
    const schemaBackedTableReport = {
        inputs: { tables_dir: "/fixture/Tables" },
        named_tables: {
            Table_Drop: {
                row_count: 4,
                records: [
                    { group_id: 10, weight_type: 1, items_list: [[9999, 20, 1, 1, 100]], __meta: { localized_name: "project root" } },
                    { group_id: 20, weight_type: 2, items_list: [[101, 2001, 1, 1, 100], [101, 999001, 1, 1, 10]], __meta: { localized_name: "project child" } },
                    { group_id: 30, weight_type: 2, items_list: [[101, 999002, 1, 1, 100]], __meta: { localized_name: "irrelevant child" } },
                    { group_id: 40, weight_type: 2, items_list: [[]], __meta: { localized_name: "empty tuple child" } }
                ]
            },
            Table_Item: {
                row_count: 1,
                records: [
                    { id: 2001, item_quality: 2, base_value: 100, item_type_id: [101] }
                ]
            }
        }
    };
    const projectRelevantParseReport = {
        schema_version: "ak_bidking_project_relevant_parse_v1",
        summary: { parse_status: "project_relevant_parse_complete" },
        project_maps: {
            fixture_map: {
                current_map_id: "fixture_map",
                root_drop_group_id: 10
            }
        }
    };
    return { schemaBackedTableReport, projectRelevantParseReport };
}

test("package exposes BidKing table reference integrity builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-table-reference-integrity"],
        "node scripts/build_bidking_table_reference_integrity_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_table_reference_integrity_report\.js/);
});

test("resolveArgs accepts parse report, schema report, output path, and generated time", () => {
    const result = resolveArgs([
        "parse.json",
        "schema.json",
        "integrity.json",
        "--generated-at=2026-04-29T04:00:00.000+08:00"
    ]);

    assert.equal(result.projectRelevantParseReportPath, path.resolve("parse.json"));
    assert.equal(result.schemaBackedTableReportPath, path.resolve("schema.json"));
    assert.equal(result.outputPath, path.resolve("integrity.json"));
    assert.equal(result.generatedAt, "2026-04-29T04:00:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-table-reference-integrity-report.json"), true);
});

test("table reference integrity report sanitizes publishable input paths", () => {
    assert.equal(
        formatReportPath(path.join(__dirname, "..", "docs", "research", "schema.json")),
        "<repo>/docs/research/schema.json"
    );
    assert.equal(
        formatReportPath("/tmp/ak_bidking_depot_4128581_tables_owned/BidKing_Data/StreamingAssets/Tables"),
        "<authenticated-steam-depot>/BidKing_Data/StreamingAssets/Tables"
    );
});

test("reference helpers separate missing terminal items from nested groups and empty tuples", () => {
    const { schemaBackedTableReport } = buildFixtureInputs();
    const drops = schemaBackedTableReport.named_tables.Table_Drop.records;
    const itemIds = new Set(schemaBackedTableReport.named_tables.Table_Item.records.map((entry) => entry.id));

    const missingRefs = collectMissingTerminalItemReferences(drops, itemIds);
    assert.deepEqual(missingRefs.map((entry) => entry.item_id), [999001, 999002]);

    const reachable = walkReachableDropGroups(10, new Map(drops.map((entry) => [entry.group_id, entry])));
    assert.deepEqual(reachable.reachable_group_ids.sort((left, right) => left - right), [10, 20]);
    assert.equal(reachable.missing_group_ids.length, 0);
});

test("table reference integrity report blocks project-relevant missing references only", () => {
    const report = buildBidKingTableReferenceIntegrityReport({
        ...buildFixtureInputs(),
        generatedAt: "2026-04-29T04:00:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_table_reference_integrity_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.global_missing_terminal_item_id_count, 2);
    assert.equal(report.summary.project_relevant_missing_terminal_item_id_count, 1);
    assert.deepEqual(report.summary.project_relevant_missing_terminal_item_ids, [999001]);
    assert.deepEqual(report.summary.skipped_irrelevant_missing_terminal_item_ids, [999002]);
    assert.equal(report.project_map_integrity.fixture_map.missing_terminal_item_reference_count, 1);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.match(report.summary.blockers.join(","), /project_relevant_missing_terminal_item_references/);
    assert.match(formatBidKingTableReferenceIntegrityMarkdown(report), /project-relevant missing item ids/);
});

test("main writes JSON and Markdown table reference integrity artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-ref-integrity-"));
    const parsePath = path.join(tempDir, "parse.json");
    const schemaPath = path.join(tempDir, "schema.json");
    const outputPath = path.join(tempDir, "integrity.json");
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
        main([parsePath, schemaPath, outputPath, "--generated-at=2026-04-29T04:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.project_relevant_missing_terminal_item_id_count, 1);
    assert.match(markdown, /BidKing table reference integrity report/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
