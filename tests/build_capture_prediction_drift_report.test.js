const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCapturePredictionDriftReport,
    resolveArgs
} = require("../scripts/build_capture_prediction_drift_report.js");

test("package exposes capture prediction drift builder", () => {
    assert.equal(
        packageJson.scripts["build:capture-prediction-drift"],
        "node scripts/build_capture_prediction_drift_report.js"
    );
});

test("buildCapturePredictionDriftReport does not request orange count when total cells and average already anchor it", () => {
    const report = buildCapturePredictionDriftReport({
        generatedAt: "2026-04-28T00:00:00.000Z",
        intakeReport: {
            entries: [{
                basename: "capture-anchored.json",
                exported_at: "2026-04-28T00:00:00.000Z",
                map_id: "sunken_ship",
                analysis_snapshot: {
                    count_means: { r: 1 },
                    cell_means: { r: 3 }
                },
                constraint_diagnostics: {
                    orange_count_missing: false,
                    orange_count: 1,
                    orange_count_source: "total_cells_div_avg_cells",
                    white_green_total_count: 17,
                    purple_count: null
                },
                observed_state: {},
                actual_counts: {}
            }]
        },
        scanReport: {
            scenarios: [{
                id: "current_default",
                entries: [{
                    capture: "capture-anchored.json",
                    exported_at: "2026-04-28T00:00:00.000Z",
                    red_count_mean: 1,
                    red_cell_mean: 3,
                    orange_count_mean: 1,
                    purple_count_mean: 5,
                    mean_value_w: 20,
                    risk_flags: []
                }]
            }]
        }
    });

    assert.deepEqual(report.rows[0].decisive_missing_fields, [
        "purple_count",
        "total_storage_cells",
        "actual_counts.w/g/b/p/o/r"
    ]);
});

test("resolveArgs accepts intake, scan, output, and generated time", () => {
    const args = resolveArgs(["intake.json", "scan.json", "out.json", "--generated-at=2026-04-27T00:00:00.000Z"]);
    assert.equal(args.intakePath, path.resolve("intake.json"));
    assert.equal(args.scanPath, path.resolve("scan.json"));
    assert.equal(args.outputPath, path.resolve("out.json"));
    assert.equal(args.generatedAt, "2026-04-27T00:00:00.000Z");
});

test("buildCapturePredictionDriftReport separates stale embedded predictions from current scan", () => {
    const report = buildCapturePredictionDriftReport({
        generatedAt: "2026-04-27T00:00:00.000Z",
        intakeReport: {
            entries: [{
                basename: "capture-a.json",
                exported_at: "2026-04-27T00:00:00.000Z",
                map_id: "sunken_ship",
                config_source_version: "old",
                analysis_snapshot: {
                    count_means: { r: 12, o: 1 },
                    cell_means: { r: 44 }
                },
                constraint_diagnostics: {
                    orange_count_missing: true,
                    inferred_white_green_count: null,
                    purple_count: null
                },
                observed_state: {},
                actual_counts: {}
            }]
        },
        scanReport: {
            scenarios: [{
                id: "current_default",
                count_prior_strength: 12,
                alpha_counts: { r: 0.03 },
                risk_score: 10,
                entries: [{
                    capture: "capture-a.json",
                    exported_at: "2026-04-27T00:00:00.000Z",
                    red_count_mean: 2,
                    red_cell_mean: 6,
                    orange_count_mean: 4,
                    purple_count_mean: 9,
                    mean_value_w: 50,
                    risk_flags: []
                }]
            }]
        }
    });

    assert.equal(report.schema_version, "ak_capture_prediction_drift_report_v1");
    assert.equal(report.summary.capture_package_count, 1);
    assert.equal(report.summary.embedded_red_count.max, 12);
    assert.equal(report.summary.current_red_count.max, 2);
    assert.equal(report.summary.stale_extreme_cleared_count, 1);
    assert.equal(report.summary.current_extreme_red_count, 0);
    assert.equal(report.conclusion.current_default_red_explosion_cleared, true);
    assert.deepEqual(report.rows[0].decisive_missing_fields, [
        "orange_count",
        "white_green_total_count",
        "purple_count",
        "total_storage_cells",
        "actual_counts.w/g/b/p/o/r"
    ]);
});
