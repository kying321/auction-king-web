const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingMissingItemAuthorityIntakeAuditReport,
    formatBidKingMissingItemAuthorityIntakeAuditMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_bidking_missing_item_authority_intake_audit_report.js");

function buildTemplate(rowOverrides = {}) {
    return {
        schema_version: "ak_bidking_missing_item_authority_intake_template_v1",
        summary: {
            direct_authority_source_required_count: 1,
            default_config_update_allowed: false
        },
        items: [
            {
                item_id: 5003,
                priority: "P0",
                direct_authority_source_required: true,
                impacted_project_maps: ["sunken_ship", "villa"],
                reference_weights: [333],
                parent_reference_count: 2,
                intake_row_template: {
                    id: 5003,
                    localized_name: null,
                    item_type_id: null,
                    slot_type: null,
                    item_quality: null,
                    base_value: null,
                    max_per_listing: null,
                    collection: null,
                    collection_coin: null,
                    icon_path: null,
                    model_3D: null,
                    raw_item_txt_row: null,
                    authority_source_type: null,
                    source_path_or_capture_id: null,
                    client_build_or_version: null,
                    reviewer_notes: null,
                    ...rowOverrides
                }
            }
        ]
    };
}

test("package exposes BidKing missing item authority intake audit builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-missing-item-authority-intake-audit"],
        "node scripts/build_bidking_missing_item_authority_intake_audit_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_missing_item_authority_intake_audit_report\.js/);
});

test("resolveArgs accepts intake template, output path, and generated time", () => {
    const result = resolveArgs([
        "template.json",
        "audit.json",
        "--generated-at=2026-04-29T06:30:00.000+08:00"
    ]);

    assert.equal(result.authorityIntakeTemplatePath, path.resolve("template.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
    assert.equal(result.generatedAt, "2026-04-29T06:30:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-missing-item-authority-intake-audit-report.json"), true);
});

test("authority intake audit keeps the current empty template fail-closed", () => {
    const report = buildBidKingMissingItemAuthorityIntakeAuditReport({
        authorityIntakeTemplate: buildTemplate(),
        generatedAt: "2026-04-29T06:30:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_missing_item_authority_intake_audit_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.valid_authority_item_count, 0);
    assert.equal(report.summary.blocked_authority_item_count, 1);
    assert.equal(report.gates.direct_authority_source_available_for_all_items, false);
    assert.equal(report.gates.staging_item_ingest_allowed, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.equal(report.item_audits[0].raw_item_row_id, null);
    assert.match(report.item_audits[0].blockers.join(","), /missing_raw_item_txt_row/);
});

test("valid raw item rows can enter staging but cannot promote replay or defaults", () => {
    const report = buildBidKingMissingItemAuthorityIntakeAuditReport({
        authorityIntakeTemplate: buildTemplate({
            localized_name: "Recovered item",
            item_type_id: [110, 106],
            slot_type: 22,
            item_quality: 6,
            base_value: 123456,
            max_per_listing: 2,
            collection: 1234,
            collection_coin: 0.1,
            icon_path: "icon_5003",
            model_3D: "Cube",
            raw_item_txt_row: "5003\tRecovered item\t[110,106]\t22\t6\t123456\t2\t1234\t0.1\ticon_5003\tCube",
            authority_source_type: "raw_item_txt_row",
            source_path_or_capture_id: "/fixture/Tables/Item.txt",
            client_build_or_version: "fixture-build-1"
        }),
        generatedAt: "2026-04-29T06:30:00.000+08:00"
    });

    assert.equal(report.summary.valid_authority_item_count, 1);
    assert.equal(report.summary.blocked_authority_item_count, 0);
    assert.equal(report.gates.direct_authority_source_available_for_all_items, true);
    assert.equal(report.gates.staging_item_ingest_allowed, true);
    assert.equal(report.gates.table_reference_integrity_clean_after_recovery, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.equal(report.staging_item_rows[0].item_id, 5003);
    assert.match(report.summary.recommended_next_action, /staging/);
});

test("main writes JSON and Markdown intake audit artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-authority-intake-audit-"));
    const templatePath = path.join(tempDir, "template.json");
    const outputPath = path.join(tempDir, "audit.json");
    fs.writeFileSync(templatePath, JSON.stringify(buildTemplate(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([templatePath, outputPath, "--generated-at=2026-04-29T06:30:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.generated_at, "2026-04-29T06:30:00.000+08:00");
    assert.match(markdown, /missing item authority intake audit/);
    assert.match(formatBidKingMissingItemAuthorityIntakeAuditMarkdown(report, outputPath), /Staging ingest allowed/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
