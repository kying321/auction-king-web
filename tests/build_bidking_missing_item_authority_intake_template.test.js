const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingMissingItemAuthorityIntakeTemplate,
    formatBidKingMissingItemAuthorityIntakeMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_bidking_missing_item_authority_intake_template.js");

function buildCandidateReport() {
    return {
        schema_version: "ak_bidking_missing_item_resolution_candidate_v1",
        summary: {
            project_relevant_missing_item_ids: [5003],
            impacted_project_maps: ["sunken_ship", "villa"],
            default_config_update_allowed: false
        },
        missing_item_candidates: [
            {
                item_id: 5003,
                candidate_status: "unresolved_source_gap",
                candidate_confidence: "low_source_gap",
                source_item_record_found: false,
                project_map_ids: ["sunken_ship", "villa"],
                parent_reference_count: 2,
                reference_weights: [333],
                missing_drop_references: [
                    {
                        item_id: 5003,
                        drop_group_id: 10,
                        drop_localized_name: "fixture quality6",
                        tuple_index: 0,
                        tuple: [50, 5003, 1, 1, 333],
                        parent_reference_count: 2
                    }
                ],
                neighboring_same_family_item_ids: [5001, 5002],
                blockers: ["missing_item_source_row_unresolved"]
            }
        ]
    };
}

function buildRecoveryScanReport() {
    return {
        schema_version: "ak_bidking_missing_item_source_recovery_scan_v1",
        summary: {
            project_relevant_missing_item_ids: [5003],
            source_item_row_recovered_count: 0,
            source_item_row_recovered_for_project_scope: false,
            reference_hit_count: 1,
            default_config_update_allowed: false
        },
        item_recovery: [
            {
                item_id: 5003,
                source_item_row_recovered: false,
                source_recovery_status: "not_found_in_local_source_candidates",
                source_item_row_hit_count: 0,
                reference_hit_count: 1,
                reference_hits: [
                    {
                        source_path: "/fixture/BidKing",
                        relative_path: "Tables/Drop.txt",
                        line_number: 56,
                        hit_type: "drop_reference"
                    }
                ]
            }
        ]
    };
}

test("package exposes BidKing missing item authority intake template builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-missing-item-authority-intake-template"],
        "node scripts/build_bidking_missing_item_authority_intake_template.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_missing_item_authority_intake_template\.js/);
});

test("resolveArgs accepts candidate report, recovery scan report, output path, and generated time", () => {
    const result = resolveArgs([
        "candidate.json",
        "scan.json",
        "template.json",
        "--generated-at=2026-04-29T06:00:00.000+08:00"
    ]);

    assert.equal(result.missingItemCandidateReportPath, path.resolve("candidate.json"));
    assert.equal(result.sourceRecoveryScanReportPath, path.resolve("scan.json"));
    assert.equal(result.outputPath, path.resolve("template.json"));
    assert.equal(result.generatedAt, "2026-04-29T06:00:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-missing-item-authority-intake-template.json"), true);
});

test("authority intake template converts unresolved source gaps into explicit collection requirements", () => {
    const report = buildBidKingMissingItemAuthorityIntakeTemplate({
        missingItemCandidateReport: buildCandidateReport(),
        sourceRecoveryScanReport: buildRecoveryScanReport(),
        generatedAt: "2026-04-29T06:00:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_missing_item_authority_intake_template_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.unresolved_authority_intake_item_count, 1);
    assert.equal(report.summary.direct_authority_source_required_count, 1);
    assert.deepEqual(report.summary.impacted_project_maps, ["sunken_ship", "villa"]);
    assert.equal(report.gates.synthetic_item_as_authority_allowed, false);
    assert.equal(report.gates.drop_tuple_exclusion_as_authority_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);

    const item = report.items[0];
    assert.equal(item.item_id, 5003);
    assert.equal(item.priority, "P0");
    assert.equal(item.direct_authority_source_required, true);
    assert.match(item.acceptable_direct_authority_sources[0], /Tables\/Item\.txt/);
    assert.deepEqual(item.required_item_row_fields.slice(0, 4), ["id", "localized_name", "item_type_id", "slot_type"]);
    assert.match(item.blocked_actions.join(","), /synthetic_item_as_authority/);
    assert.match(item.allowed_next_actions.join(","), /collect_raw_item_row/);
    assert.equal(item.intake_row_template.id, 5003);
    assert.equal(item.intake_row_template.raw_item_txt_row, null);
});

test("main writes JSON and Markdown authority intake artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-authority-intake-"));
    const candidatePath = path.join(tempDir, "candidate.json");
    const scanPath = path.join(tempDir, "scan.json");
    const outputPath = path.join(tempDir, "template.json");
    fs.writeFileSync(candidatePath, JSON.stringify(buildCandidateReport(), null, 2));
    fs.writeFileSync(scanPath, JSON.stringify(buildRecoveryScanReport(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([candidatePath, scanPath, outputPath, "--generated-at=2026-04-29T06:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.generated_at, "2026-04-29T06:00:00.000+08:00");
    assert.match(markdown, /missing item authority intake template/);
    assert.match(formatBidKingMissingItemAuthorityIntakeMarkdown(report, outputPath), /Direct authority source required/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
