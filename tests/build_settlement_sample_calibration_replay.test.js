const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    deriveDefaultReplayReportOutputPath,
    resolveArgs,
    main
} = require("../scripts/build_settlement_sample_calibration_replay.js");

test("package exposes a dedicated calibration replay builder entry", () => {
    assert.match(
        packageJson.scripts["build:settlement-calibration-replay"] || "",
        /node\s+scripts\/build_settlement_sample_calibration_replay\.js/
    );
});

test("resolveArgs accepts samples, optional candidate config, and optional output path", () => {
    const result = resolveArgs(["samples.json", "candidate.json", "report.json"]);

    assert.equal(result.inputPath, path.resolve("samples.json"));
    assert.equal(result.candidateConfigPath, path.resolve("candidate.json"));
    assert.equal(result.outputPath, path.resolve("report.json"));
});

test("deriveDefaultReplayReportOutputPath uses replay package export context when no explicit output is provided", () => {
    const fallbackOutputPath = path.join(process.cwd(), "docs", "research", "settlement_sample_calibration_replay_report.json");
    const next = deriveDefaultReplayReportOutputPath("/tmp/replay-package.json", {
        schema_version: "ak_settlement_calibration_replay_package_v1",
        export_context: {
            map_id: "villa",
            filter_value: "batch:batch_b"
        }
    }, fallbackOutputPath);

    assert.equal(
        next,
        path.join(process.cwd(), "docs", "research", "auction-king-replay-report-villa-batch-b.json")
    );
});

test("main writes a combined calibration replay report from unified battle samples and sparse candidate overrides", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-calibration-replay-"));
    const samplesPath = path.join(tempDir, "samples.json");
    const candidatePath = path.join(tempDir, "candidate.json");
    const outputPath = path.join(tempDir, "report.json");

    fs.writeFileSync(samplesPath, JSON.stringify([
        {
            id: "orange_case",
            map_id: "sunken_ship",
            record_type: "battle_sample",
            observed_state: {
                r1_total_items: 12
            },
            actual_counts: {
                o: 0,
                r: 0
            },
            actual_value: 70000,
            items: [
                { quality: "o", category: "tech", cells: 2.95, value: 70000 }
            ]
        }
    ], null, 2));

    fs.writeFileSync(candidatePath, JSON.stringify({
        maps: {
            sunken_ship: {
                alpha_counts: {
                    w: 1.4,
                    g: 2.2,
                    o: 0.15,
                    r: 0.5
                },
                value_model: {
                    o: {
                        base_item_mean: 57315,
                        base_item_sd: 29002
                    }
                }
            }
        }
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([samplesPath, candidatePath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.sample_count, 1);
    assert.equal(report.maps.sunken_ship.sample_count, 1);
    assert.equal(report.maps.sunken_ship.alpha_counts.candidate.o, 0.15);
    assert.equal(report.maps.sunken_ship.value_model.candidate.o.base_item_mean, 57315);
    assert.ok(report.count_report.metrics.candidate.o.mean_log_loss < report.count_report.metrics.baseline.o.mean_log_loss);
    assert.ok(report.value_report.metrics.overlay.mae < report.value_report.metrics.baseline.mae);
    assert.equal(printed.join(""), `${outputPath}\n`);
});

test("main also accepts a wrapped replay package that contains a samples array", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-calibration-replay-package-"));
    const samplesPath = path.join(tempDir, "replay-package.json");
    const outputPath = path.join(tempDir, "report.json");

    fs.writeFileSync(samplesPath, JSON.stringify({
        schema_version: "ak_settlement_calibration_replay_package_v1",
        export_context: {
            map_id: "sunken_ship",
            filter_value: "pending_export",
            candidate_mode: "draft"
        },
        sample_quality_summary: {
            sample_count: 1,
            system_hint: {
                sample_count: 1,
                scored_sample_count: 1,
                missing_system_hint_count: 0,
                missing_actual_cells_count: 0
            }
        },
        candidate_config: {
            maps: {
                sunken_ship: {
                    alpha_counts: {
                        o: 0.15,
                        r: 0.5
                    },
                    value_model: {
                        o: {
                            base_item_mean: 57315,
                            base_item_sd: 29002
                        }
                    }
                }
            }
        },
        samples: [
            {
                id: "orange_case",
                map_id: "sunken_ship",
                record_type: "battle_sample",
                observed_state: {
                    r1_total_items: 12,
                    system_avg_value_type_count: 2,
                    system_avg_value_per_cell: 8735.34
                },
                actual_counts: {
                    o: 0,
                    r: 0
                },
                actual_value: 70000,
                actual_cells: 8,
                items: [
                    { quality: "o", category: "tech", cells: 2.95, value: 70000 }
                ]
            }
        ]
    }, null, 2));

    main([samplesPath, outputPath]);

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.sample_count, 1);
    assert.equal(report.export_context.filter_value, "pending_export");
    assert.equal(report.export_context.candidate_mode, "draft");
    assert.deepEqual(report.sample_quality_summary.system_hint, {
        sample_count: 1,
        scored_sample_count: 1,
        missing_system_hint_count: 0,
        missing_actual_cells_count: 0
    });
    assert.equal(report.maps.sunken_ship.alpha_counts.candidate.o, 0.15);
    assert.equal(report.maps.sunken_ship.value_model.candidate.o.base_item_mean, 57315);
    assert.equal(report.maps.sunken_ship.sample_count, 1);
});
