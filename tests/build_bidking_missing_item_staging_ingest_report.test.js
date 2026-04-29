const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingMissingItemStagingIngestReport,
    formatBidKingMissingItemStagingIngestMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_bidking_missing_item_staging_ingest_report.js");

function buildAuditReport({ allowed = false } = {}) {
    const stagingRows = allowed
        ? [
            {
                item_id: 5003,
                authority_source_type: "raw_item_txt_row",
                source_path_or_capture_id: "/fixture/Tables/Item.txt",
                client_build_or_version: "fixture-build-1",
                raw_item_txt_row: "5003\tRecovered item\t[110,106]\t22\t6\t123456\t2\t1234\t0.1\ticon_5003\tCube",
                reviewed_row: {
                    id: 5003,
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
                    raw_item_txt_row: "5003\tRecovered item\t[110,106]\t22\t6\t123456\t2\t1234\t0.1\ticon_5003\tCube"
                },
                staging_only: true
            }
        ]
        : [];
    return {
        schema_version: "ak_bidking_missing_item_authority_intake_audit_v1",
        generated_at: "2026-04-29T06:30:00.000+08:00",
        summary: {
            valid_authority_item_count: allowed ? 1 : 0,
            blocked_authority_item_count: allowed ? 0 : 1,
            staging_item_row_count: stagingRows.length,
            impacted_project_maps: ["sunken_ship", "villa"],
            staging_item_ingest_allowed: allowed,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            blockers: allowed
                ? ["table_reference_integrity_not_rerun_after_staging"]
                : ["missing_raw_item_txt_row", "authority_intake_incomplete"]
        },
        gates: {
            staging_item_ingest_allowed: allowed,
            table_reference_integrity_clean_after_recovery: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        staging_item_rows: stagingRows
    };
}

test("package exposes BidKing missing item staging ingest builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-missing-item-staging-ingest"],
        "node scripts/build_bidking_missing_item_staging_ingest_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_missing_item_staging_ingest_report\.js/);
});

test("resolveArgs accepts audit report, output path, and generated time", () => {
    const result = resolveArgs([
        "audit.json",
        "staging.json",
        "--generated-at=2026-04-29T07:00:00.000+08:00"
    ]);

    assert.equal(result.authorityIntakeAuditReportPath, path.resolve("audit.json"));
    assert.equal(result.outputPath, path.resolve("staging.json"));
    assert.equal(result.generatedAt, "2026-04-29T07:00:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-missing-item-staging-ingest-report.json"), true);
});

test("staging ingest report keeps current blocked audit fail-closed", () => {
    const report = buildBidKingMissingItemStagingIngestReport({
        authorityIntakeAuditReport: buildAuditReport({ allowed: false }),
        generatedAt: "2026-04-29T07:00:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_missing_item_staging_ingest_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.staged_item_row_count, 0);
    assert.equal(report.summary.staging_materialized, false);
    assert.equal(report.gates.staging_item_ingest_allowed, false);
    assert.equal(report.gates.source_tables_mutated, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /staging_item_ingest_not_allowed/);
});

test("valid audited rows materialize only as staging evidence", () => {
    const report = buildBidKingMissingItemStagingIngestReport({
        authorityIntakeAuditReport: buildAuditReport({ allowed: true }),
        generatedAt: "2026-04-29T07:00:00.000+08:00"
    });

    assert.equal(report.summary.staged_item_row_count, 1);
    assert.equal(report.summary.staging_materialized, true);
    assert.equal(report.gates.staging_item_ingest_allowed, true);
    assert.equal(report.gates.source_tables_mutated, false);
    assert.equal(report.gates.table_reference_integrity_clean_after_recovery, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.equal(report.staging_artifact.rows[0].item_id, 5003);
    assert.equal(report.staging_artifact.rows[0].staging_only, true);
    assert.match(report.summary.recommended_next_action, /rerun_table_reference_integrity/);
});

test("stale authority intake audit schema cannot materialize staging rows", () => {
    const auditReport = buildAuditReport({ allowed: true });
    auditReport.schema_version = "stale_authority_intake_audit";
    const report = buildBidKingMissingItemStagingIngestReport({
        authorityIntakeAuditReport: auditReport,
        generatedAt: "2026-04-29T07:00:00.000+08:00"
    });

    assert.equal(report.summary.authority_intake_audit_schema_version, "stale_authority_intake_audit");
    assert.equal(report.summary.staged_item_row_count, 0);
    assert.equal(report.summary.staging_materialized, false);
    assert.equal(report.gates.staging_item_ingest_allowed, false);
    assert.equal(report.gates.staging_materialized, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.deepEqual(report.staging_artifact.rows, []);
    assert.match(report.summary.blockers.join(","), /invalid_authority_intake_audit_schema/);
    assert.match(report.summary.blockers.join(","), /no_valid_staging_item_rows/);
});

test("valid schema remains required even when stale audit claims ingest allowed", () => {
    const report = buildBidKingMissingItemStagingIngestReport({
        authorityIntakeAuditReport: {
            schema_version: "stale_or_wrong_authority_intake_schema",
            summary: {
                valid_authority_item_count: 1,
                blocked_authority_item_count: 0,
                impacted_project_maps: ["sunken_ship", "villa"],
                blockers: []
            },
            gates: {
                staging_item_ingest_allowed: true,
                table_backed_shadow_replay_allowed: false,
                authority_handoff_allowed: false,
                default_config_update_allowed: false
            },
            staging_item_rows: [
                {
                    item_id: 1106013,
                    authority_source_type: "raw_item_txt_row",
                    source_path_or_capture_id: "/fixture/Tables/Item.txt",
                    client_build_or_version: "fixture-build",
                    raw_item_txt_row: "1106013\tRecovered\t[110,106]\t22\t6\t1\t1\t1\t0\ticon\tCube",
                    staging_only: true
                }
            ]
        },
        generatedAt: "2026-04-29T07:00:00.000+08:00"
    });

    assert.equal(report.summary.staged_item_row_count, 0);
    assert.equal(report.gates.staging_item_ingest_allowed, false);
    assert.deepEqual(report.staging_artifact.rows, []);
    assert.match(report.summary.blockers.join(","), /invalid_authority_intake_audit_schema/);
});

test("main writes JSON and Markdown staging ingest artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-staging-ingest-"));
    const auditPath = path.join(tempDir, "audit.json");
    const outputPath = path.join(tempDir, "staging.json");
    fs.writeFileSync(auditPath, JSON.stringify(buildAuditReport({ allowed: false }), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([auditPath, outputPath, "--generated-at=2026-04-29T07:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.generated_at, "2026-04-29T07:00:00.000+08:00");
    assert.match(markdown, /missing item staging ingest/);
    assert.match(formatBidKingMissingItemStagingIngestMarkdown(report, outputPath), /Source tables mutated/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
