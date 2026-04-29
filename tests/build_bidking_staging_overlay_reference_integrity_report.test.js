const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingStagingOverlayReferenceIntegrityReport,
    formatBidKingStagingOverlayReferenceIntegrityMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_bidking_staging_overlay_reference_integrity_report.js");

function buildTableReferenceIntegrityReport() {
    return {
        schema_version: "ak_bidking_table_reference_integrity_v1",
        summary: {
            project_relevant_missing_terminal_item_ids: [5003],
            maps_blocked_by_missing_item_references: ["sunken_ship", "villa"],
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        gates: {
            table_reference_integrity_clean_for_project_scope: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        global_missing_terminal_item_references: [
            {
                item_id: 5003,
                drop_group_id: 10,
                drop_localized_name: "project quality6",
                tuple_index: 0,
                tuple: [50, 5003, 1, 1, 333]
            },
            {
                item_id: 9999,
                drop_group_id: 30,
                drop_localized_name: "irrelevant",
                tuple_index: 0,
                tuple: [91, 9999, 1, 1, 111]
            }
        ],
        project_map_integrity: {
            sunken_ship: {
                current_map_id: "sunken_ship",
                missing_terminal_item_reference_count: 1,
                missing_terminal_item_ids: [5003],
                missing_terminal_item_references: [
                    {
                        item_id: 5003,
                        drop_group_id: 10,
                        drop_localized_name: "project quality6",
                        tuple_index: 0,
                        tuple: [50, 5003, 1, 1, 333]
                    }
                ]
            },
            villa: {
                current_map_id: "villa",
                missing_terminal_item_reference_count: 1,
                missing_terminal_item_ids: [5003],
                missing_terminal_item_references: [
                    {
                        item_id: 5003,
                        drop_group_id: 10,
                        drop_localized_name: "project quality6",
                        tuple_index: 0,
                        tuple: [50, 5003, 1, 1, 333]
                    }
                ]
            }
        }
    };
}

function buildStagingIngestReport({
    staged = false,
    authoritySourceType = "raw_item_txt_row",
    sourcePathOrCaptureId = "/fixture/Tables/Item.txt",
    clientBuildOrVersion = "fixture-build-1",
    rawItemTxtRow = "5003\tRecovered item\t[110,106]\t22\t6\t123456\t2\t1234\t0.1\ticon_5003\tCube"
} = {}) {
    const rows = staged
        ? [
            {
                item_id: 5003,
                authority_source_type: authoritySourceType,
                source_path_or_capture_id: sourcePathOrCaptureId,
                client_build_or_version: clientBuildOrVersion,
                raw_item_txt_row: rawItemTxtRow,
                staging_only: true
            }
        ]
        : [];
    return {
        schema_version: "ak_bidking_missing_item_staging_ingest_v1",
        summary: {
            staged_item_row_count: rows.length,
            staging_materialized: rows.length > 0,
            source_tables_mutated: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        gates: {
            staging_materialized: rows.length > 0,
            source_tables_mutated: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        staging_artifact: {
            schema_version: "ak_bidking_staged_item_rows_v1",
            source_tables_mutated: false,
            rows
        }
    };
}

test("package exposes BidKing staging overlay reference integrity builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-staging-overlay-reference-integrity"],
        "node scripts/build_bidking_staging_overlay_reference_integrity_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_staging_overlay_reference_integrity_report\.js/);
});

test("resolveArgs accepts integrity report, staging ingest report, output path, and generated time", () => {
    const result = resolveArgs([
        "integrity.json",
        "staging.json",
        "overlay.json",
        "--generated-at=2026-04-29T07:30:00.000+08:00"
    ]);

    assert.equal(result.tableReferenceIntegrityReportPath, path.resolve("integrity.json"));
    assert.equal(result.stagingIngestReportPath, path.resolve("staging.json"));
    assert.equal(result.outputPath, path.resolve("overlay.json"));
    assert.equal(result.generatedAt, "2026-04-29T07:30:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-staging-overlay-reference-integrity-report.json"), true);
});

test("overlay reference integrity keeps current empty staging fail-closed", () => {
    const report = buildBidKingStagingOverlayReferenceIntegrityReport({
        tableReferenceIntegrityReport: buildTableReferenceIntegrityReport(),
        stagingIngestReport: buildStagingIngestReport({ staged: false }),
        generatedAt: "2026-04-29T07:30:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_staging_overlay_reference_integrity_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.deepEqual(report.summary.original_project_missing_item_ids, [5003]);
    assert.deepEqual(report.summary.staged_item_ids, []);
    assert.deepEqual(report.summary.unresolved_project_missing_item_ids_after_overlay, [5003]);
    assert.equal(report.gates.staging_overlay_reference_integrity_clean_for_project_scope, false);
    assert.equal(report.gates.source_tables_mutated, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /no_staged_item_rows/);
});

test("overlay coverage can clear project-scope missing references without opening promotion gates", () => {
    const report = buildBidKingStagingOverlayReferenceIntegrityReport({
        tableReferenceIntegrityReport: buildTableReferenceIntegrityReport(),
        stagingIngestReport: buildStagingIngestReport({ staged: true }),
        generatedAt: "2026-04-29T07:30:00.000+08:00"
    });

    assert.deepEqual(report.summary.covered_project_missing_item_ids, [5003]);
    assert.deepEqual(report.summary.unresolved_project_missing_item_ids_after_overlay, []);
    assert.deepEqual(report.summary.maps_still_blocked_after_overlay, []);
    assert.equal(report.gates.staging_overlay_reference_integrity_clean_for_project_scope, true);
    assert.equal(report.gates.staging_overlay_shadow_replay_candidate_allowed, true);
    assert.equal(report.gates.source_tables_mutated, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.equal(report.project_map_overlay_integrity.sunken_ship.missing_terminal_item_reference_count_after_overlay, 0);
    assert.match(report.summary.recommended_next_action, /overlay_shadow_simulator/);
});

test("synthetic staged rows do not clear project-scope reference integrity", () => {
    const report = buildBidKingStagingOverlayReferenceIntegrityReport({
        tableReferenceIntegrityReport: buildTableReferenceIntegrityReport(),
        stagingIngestReport: buildStagingIngestReport({
            staged: true,
            authoritySourceType: "synthetic_reconstruction",
            sourcePathOrCaptureId: "neighboring_family_rows",
            clientBuildOrVersion: "fixture-build-1",
            rawItemTxtRow: "5003\tSynthetic item\t[110,106]\t22\t6\t123456\t2\t1234\t0.1\ticon_5003\tCube"
        }),
        generatedAt: "2026-04-29T07:30:00.000+08:00"
    });

    assert.deepEqual(report.summary.staged_item_ids, [5003]);
    assert.deepEqual(report.summary.valid_staged_item_ids, []);
    assert.deepEqual(report.summary.invalid_staged_item_ids, [5003]);
    assert.deepEqual(report.summary.covered_project_missing_item_ids, []);
    assert.deepEqual(report.summary.unresolved_project_missing_item_ids_after_overlay, [5003]);
    assert.equal(report.gates.staging_overlay_reference_integrity_clean_for_project_scope, false);
    assert.equal(report.gates.staging_overlay_shadow_replay_candidate_allowed, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.equal(report.staged_row_audit.valid_row_count, 0);
    assert.match(report.summary.blockers.join(","), /unsupported_staged_authority_source_type/);
    assert.match(report.summary.blockers.join(","), /invalid_staged_item_rows/);
});

test("staged rows with missing provenance remain blocked even when item id matches", () => {
    const report = buildBidKingStagingOverlayReferenceIntegrityReport({
        tableReferenceIntegrityReport: buildTableReferenceIntegrityReport(),
        stagingIngestReport: buildStagingIngestReport({
            staged: true,
            sourcePathOrCaptureId: "",
            clientBuildOrVersion: "",
            rawItemTxtRow: ""
        }),
        generatedAt: "2026-04-29T07:30:00.000+08:00"
    });

    assert.deepEqual(report.summary.valid_staged_item_ids, []);
    assert.equal(report.gates.staging_overlay_reference_integrity_clean_for_project_scope, false);
    assert.equal(report.gates.staging_overlay_shadow_replay_candidate_allowed, false);
    assert.match(report.summary.blockers.join(","), /missing_staged_source_path_or_capture_id/);
    assert.match(report.summary.blockers.join(","), /missing_staged_client_build_or_version/);
    assert.match(report.summary.blockers.join(","), /missing_staged_raw_item_txt_row/);
});

test("stale upstream artifact schemas cannot clear staging overlay integrity", () => {
    const tableReferenceIntegrityReport = buildTableReferenceIntegrityReport();
    const stagingIngestReport = buildStagingIngestReport({ staged: true });
    tableReferenceIntegrityReport.schema_version = "stale_table_reference_integrity";
    stagingIngestReport.schema_version = "stale_staging_ingest";

    const report = buildBidKingStagingOverlayReferenceIntegrityReport({
        tableReferenceIntegrityReport,
        stagingIngestReport,
        generatedAt: "2026-04-29T07:30:00.000+08:00"
    });

    assert.deepEqual(report.summary.valid_staged_item_ids, [5003]);
    assert.deepEqual(report.summary.covered_project_missing_item_ids, [5003]);
    assert.equal(report.gates.staging_overlay_reference_integrity_clean_for_project_scope, false);
    assert.equal(report.gates.staging_overlay_shadow_replay_candidate_allowed, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /invalid_table_reference_integrity_schema/);
    assert.match(report.summary.blockers.join(","), /invalid_staging_ingest_schema/);
    assert.match(report.summary.blockers.join(","), /staging_overlay_reference_integrity_not_clean/);
});

test("main writes JSON and Markdown staging overlay reference integrity artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-overlay-integrity-"));
    const integrityPath = path.join(tempDir, "integrity.json");
    const stagingPath = path.join(tempDir, "staging.json");
    const outputPath = path.join(tempDir, "overlay.json");
    fs.writeFileSync(integrityPath, JSON.stringify(buildTableReferenceIntegrityReport(), null, 2));
    fs.writeFileSync(stagingPath, JSON.stringify(buildStagingIngestReport({ staged: false }), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([integrityPath, stagingPath, outputPath, "--generated-at=2026-04-29T07:30:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.generated_at, "2026-04-29T07:30:00.000+08:00");
    assert.match(markdown, /staging overlay reference integrity/);
    assert.match(formatBidKingStagingOverlayReferenceIntegrityMarkdown(report, outputPath), /Source tables mutated/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
