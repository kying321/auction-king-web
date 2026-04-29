const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    DEFAULT_SCHEMA_METADATA_REPORT_PATH,
    DEFAULT_TABLE_MECHANICS_REPORT_PATH,
    buildBidKingManualMechanicsReviewTemplate,
    formatBidKingManualMechanicsReviewMarkdown
} = require("../scripts/build_bidking_manual_mechanics_review_template.js");

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("BidKing manual mechanics review template keeps authority gates closed", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-review-"));
    try {
        const tableMechanicsPath = path.join(tmpRoot, "table.json");
        const schemaPath = path.join(tmpRoot, "schema.json");
        writeJson(tableMechanicsPath, {
            summary: {
                mechanics_recovery_status: "table_mechanics_candidate_extracted"
            },
            candidate_map_alignment: [{
                current_map_id: "villa",
                bidking_map_id_candidate: 104,
                bidking_bidmap_root_candidate: 2401,
                evidence_labels: ["未知别墅"],
                confidence: "medium",
                blocker: "manual confirmation required"
            }],
            mechanics: {
                maps: [{
                    map_id: 104,
                    bidmap_root_id: 2401,
                    item_count_range: [25, 30],
                    bidmap_count: 10,
                    rank_ai_rank_count: 6
                }]
            }
        });
        writeJson(schemaPath, {
            summary: {
                schema_handoff_candidate: true
            },
            table_type_schemas: [{
                type_name: "Table_Map",
                table_file: "Map.txt",
                table_row_count: 8,
                table_column_distribution: { 17: 8 },
                schema_member_count: 15,
                schema_member_source: "public_instance_field",
                likely_leading_non_schema_column_count: 2,
                schema_member_count_matches_table_columns: false,
                schema_member_count_plus_two_matches_table_columns: true,
                schema_members: [{ name: "id", type: "int" }]
            }]
        });

        const report = buildBidKingManualMechanicsReviewTemplate({
            tableMechanicsReportPath: tableMechanicsPath,
            schemaMetadataReportPath: schemaPath
        });
        assert.equal(report.schema_version, "ak_bidking_manual_mechanics_review_template_v1");
        assert.equal(report.change_class, "RESEARCH_ONLY");
        assert.equal(report.summary.review_status, "pending_manual_validation");
        assert.equal(report.summary.authority_adoption_allowed, false);
        assert.equal(report.gates.authority_handoff_allowed, false);
        assert.equal(report.review_items.map_alignment_reviews[0].review_decision, "pending");
        assert.equal(report.review_items.table_schema_reviews[0].schema_or_localized_count_match, true);
        assert.match(formatBidKingManualMechanicsReviewMarkdown(report), /authority_handoff_allowed: `false`/);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
});

test("package exposes BidKing manual mechanics review entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-manual-mechanics-review-template"], /build_bidking_manual_mechanics_review_template\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_manual_mechanics_review_template\.js/);
});

test("local BidKing manual review template builds from current artifacts when available", () => {
    if (!fs.existsSync(DEFAULT_TABLE_MECHANICS_REPORT_PATH) || !fs.existsSync(DEFAULT_SCHEMA_METADATA_REPORT_PATH)) return;
    const report = buildBidKingManualMechanicsReviewTemplate();
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.shadow_candidate_allowed, false);
    assert.equal(report.summary.schema_handoff_candidate, true);
    assert.ok(report.summary.map_alignment_review_count >= 3);
    assert.ok(report.summary.table_schema_review_count >= 10);
});
