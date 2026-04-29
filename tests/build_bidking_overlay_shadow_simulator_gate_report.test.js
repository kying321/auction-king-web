const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");

function loadBuilder() {
    return require("../scripts/build_bidking_overlay_shadow_simulator_gate_report.js");
}

function buildOverlayIntegrityReport({ clean = false } = {}) {
    return {
        schema_version: "ak_bidking_staging_overlay_reference_integrity_v1",
        generated_at: "2026-04-29T07:30:00.000+08:00",
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        live_path_touched: false,
        summary: {
            original_project_missing_item_ids: [5003],
            staged_item_ids: clean ? [5003] : [],
            covered_project_missing_item_ids: clean ? [5003] : [],
            unresolved_project_missing_item_ids_after_overlay: clean ? [] : [5003],
            maps_still_blocked_after_overlay: clean ? [] : ["sunken_ship", "villa"],
            staging_overlay_reference_integrity_clean_for_project_scope: clean,
            staging_overlay_shadow_replay_candidate_allowed: clean,
            source_tables_mutated: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            blockers: clean
                ? ["overlay_shadow_simulator_not_rerun"]
                : [
                    "no_staged_item_rows",
                    "project_relevant_missing_terminal_item_references_after_overlay",
                    "staging_overlay_reference_integrity_not_clean"
                ]
        },
        gates: {
            staging_overlay_reference_integrity_clean_for_project_scope: clean,
            staging_overlay_shadow_replay_candidate_allowed: clean,
            source_tables_mutated: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false
        }
    };
}

test("package exposes BidKing overlay shadow simulator gate builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-overlay-shadow-simulator-gate"],
        "node scripts/build_bidking_overlay_shadow_simulator_gate_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_overlay_shadow_simulator_gate_report\.js/);
});

test("resolveArgs accepts overlay integrity path, output path, and generated time", () => {
    const { DEFAULT_OUTPUT_PATH, resolveArgs } = loadBuilder();
    const result = resolveArgs([
        "overlay-integrity.json",
        "gate.json",
        "--generated-at=2026-04-29T08:10:00.000+08:00"
    ]);

    assert.equal(result.overlayIntegrityReportPath, path.resolve("overlay-integrity.json"));
    assert.equal(result.outputPath, path.resolve("gate.json"));
    assert.equal(result.generatedAt, "2026-04-29T08:10:00.000+08:00");
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-29-bidking-overlay-shadow-simulator-gate-report.json"), true);
});

test("overlay shadow simulator gate stays closed when overlay integrity is not clean", () => {
    const {
        buildBidKingOverlayShadowSimulatorGateReport
    } = loadBuilder();
    const report = buildBidKingOverlayShadowSimulatorGateReport({
        overlayIntegrityReport: buildOverlayIntegrityReport({ clean: false }),
        generatedAt: "2026-04-29T08:10:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_overlay_shadow_simulator_gate_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.deepEqual(report.summary.unresolved_project_missing_item_ids_after_overlay, [5003]);
    assert.equal(report.summary.overlay_shadow_simulator_candidate_allowed, false);
    assert.equal(report.summary.overlay_shadow_simulator_status, "blocked_overlay_shadow_simulator_gate");
    assert.equal(report.gates.overlay_shadow_simulator_candidate_allowed, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /staging_overlay_reference_integrity_not_clean/);
});

test("clean overlay only opens an overlay-shadow simulator candidate and keeps promotion gates closed", () => {
    const {
        buildBidKingOverlayShadowSimulatorGateReport
    } = loadBuilder();
    const report = buildBidKingOverlayShadowSimulatorGateReport({
        overlayIntegrityReport: buildOverlayIntegrityReport({ clean: true }),
        generatedAt: "2026-04-29T08:10:00.000+08:00"
    });

    assert.deepEqual(report.summary.staged_item_ids, [5003]);
    assert.deepEqual(report.summary.unresolved_project_missing_item_ids_after_overlay, []);
    assert.equal(report.summary.overlay_shadow_simulator_candidate_allowed, true);
    assert.equal(report.summary.overlay_shadow_simulator_status, "overlay_shadow_simulator_candidate_ready");
    assert.equal(report.summary.table_backed_shadow_replay_allowed, false);
    assert.equal(report.summary.authority_handoff_allowed, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.gates.overlay_shadow_simulator_candidate_allowed, true);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /overlay_shadow_simulator_not_rerun/);
});

test("stale overlay integrity schema keeps shadow simulator gate closed", () => {
    const {
        buildBidKingOverlayShadowSimulatorGateReport
    } = loadBuilder();
    const overlayIntegrityReport = buildOverlayIntegrityReport({ clean: true });
    overlayIntegrityReport.schema_version = "stale_overlay_integrity";
    const report = buildBidKingOverlayShadowSimulatorGateReport({
        overlayIntegrityReport,
        generatedAt: "2026-04-29T08:10:00.000+08:00"
    });

    assert.equal(report.summary.overlay_integrity_schema_version, "stale_overlay_integrity");
    assert.equal(report.gates.staging_overlay_reference_integrity_schema_valid, false);
    assert.equal(report.summary.overlay_shadow_simulator_candidate_allowed, false);
    assert.equal(report.summary.overlay_shadow_simulator_status, "blocked_overlay_shadow_simulator_gate");
    assert.equal(report.gates.overlay_shadow_simulator_candidate_allowed, false);
    assert.equal(report.gates.table_backed_shadow_replay_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.match(report.summary.blockers.join(","), /invalid_staging_overlay_reference_integrity_schema/);
});

test("main writes JSON and Markdown overlay shadow simulator gate artifacts", () => {
    const {
        formatBidKingOverlayShadowSimulatorGateMarkdown,
        main
    } = loadBuilder();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-overlay-shadow-gate-"));
    const overlayPath = path.join(tempDir, "overlay-integrity.json");
    const outputPath = path.join(tempDir, "gate.json");
    fs.writeFileSync(overlayPath, JSON.stringify(buildOverlayIntegrityReport({ clean: false }), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([overlayPath, outputPath, "--generated-at=2026-04-29T08:10:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.generated_at, "2026-04-29T08:10:00.000+08:00");
    assert.match(markdown, /BidKing overlay shadow simulator gate/);
    assert.match(markdown, /staging_overlay_reference_integrity_not_clean/);
    assert.match(formatBidKingOverlayShadowSimulatorGateMarkdown(report, outputPath), /Candidate allowed/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
