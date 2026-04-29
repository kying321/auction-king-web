const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    DEFAULT_FOCUSED_IL_REPORT_PATH,
    DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
    buildBidKingDoDropSemanticsReport,
    formatBidKingDoDropSemanticsMarkdown,
    summarizeDropTable
} = require("../scripts/build_bidking_dodrop_semantics_report.js");

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("drop table summarizer counts weight types and nested tuples", () => {
    const summary = summarizeDropTable({
        records: [
            { weight_type: 1, items_list: [[1, 100, 1, 2, 5000], [9999, 200, 1, 1, 10000]] },
            { weight_type: 2, items_list: [[1, 101, 1, 1, 10]] }
        ]
    });
    assert.deepEqual(summary.weight_type_counts, { "1": 1, "2": 1 });
    assert.equal(summary.tuple_count, 3);
    assert.equal(summary.nested_group_tuple_count, 1);
    assert.deepEqual(summary.tuple_width_counts, { "5": 3 });
});

test("DoDrop semantics report builds from schema and focused IL artifacts", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-dodrop-"));
    const schemaPath = path.join(tmpRoot, "schema.json");
    const ilPath = path.join(tmpRoot, "focused-il.json");
    try {
        writeJson(schemaPath, {
            named_tables: {
                Table_Drop: {
                    schema_members: [
                        { name: "group_id", type: "int" },
                        { name: "weight_type", type: "int" },
                        { name: "items_list", type: "int[][]" }
                    ],
                    records: [
                        { group_id: 1, weight_type: 1, items_list: [[9999, 2, 1, 3, 10000]], __meta: { localized_description: "nested" } }
                    ]
                }
            }
        });
        writeJson(ilPath, {
            focused_methods: [
                {
                    declaring_type: "GameServerDemo.Utils",
                    method_name: "DoDrop",
                    signature: { return_type: "Dictionary<int,int>", parameters: ["int", "int"] },
                    body: { parse_status: "parsed" },
                    signal_instructions: [
                        { il_offset: 14, resolved_full_name: "Table_Drop.getBygroup_id" },
                        { il_offset: 27, resolved_full_name: "Table_Drop.weight_type" },
                        { il_offset: 53, resolved_full_name: "GameServerDemo.Utils.RandomProbabilityIndex" },
                        { il_offset: 83, resolved_full_name: "GameServerDemo.Utils.RandomWeightIndex" },
                        { il_offset: 161, resolved_full_name: "GameServerDemo.Utils.DoDrop" },
                        { il_offset: 166, resolved_full_name: "GameServerDemo.Utils.AddRange" },
                        { il_offset: 189, resolved_full_name: "GameServerDemo.Utils.AddItem" }
                    ]
                }
            ]
        });
        const report = buildBidKingDoDropSemanticsReport({
            schemaBackedTableReportPath: schemaPath,
            focusedIlReportPath: ilPath
        });
        assert.equal(report.schema_version, "ak_bidking_dodrop_semantics_v1");
        assert.equal(report.summary.parse_status, "dodrop_semantics_candidate_built");
        assert.equal(report.summary.authority_adoption_allowed, false);
        assert.equal(report.table_schema_binding.tuple_semantics_candidate[0].inferred_name, "kind_or_nested_group_marker");
        assert.ok(report.pseudocode_candidate.some((line) => /RandomProbabilityIndex/.test(line)));
        assert.match(formatBidKingDoDropSemanticsMarkdown(report), /Tuple Semantics Candidate/);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
});

test("package exposes BidKing DoDrop semantics entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-dodrop-semantics"], /build_bidking_dodrop_semantics_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_dodrop_semantics_report\.js/);
});

test("local BidKing DoDrop semantics report builds from current artifacts when available", () => {
    if (!fs.existsSync(DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH) || !fs.existsSync(DEFAULT_FOCUSED_IL_REPORT_PATH)) return;
    const report = buildBidKingDoDropSemanticsReport();
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.il_signal_complete, true);
    assert.ok(report.summary.drop_group_count > 500);
    assert.ok(report.summary.tuple_count > 1000);
    assert.ok(report.summary.nested_group_tuple_count > 0);
    assert.ok(report.pseudocode_candidate.some((line) => /AddRange/.test(line)));
});
