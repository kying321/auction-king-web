const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCapturePackageIntakeReport,
    buildConstraintDiagnostics,
    main,
    resolveArgs
} = require("../scripts/build_capture_package_intake_report.js");

function writeCapture(filePath, overrides = {}) {
    const payload = {
        schema_version: "ak_battle_clipboard_capture_v1",
        export_kind: "battle_input_clipboard_screenshot",
        exported_at: "2026-04-26T12:00:00.000Z",
        map_id: "sunken_ship",
        template_id: "local_test",
        template_label: "Ahmed 默认模板",
        config_source_version: "test_config",
        field_values: {
            total_items: 36,
            blue_count: 8,
            purple_avg_cells: 4.33,
            orange_avg_cells: 1,
            white_green_total_cells: 22
        },
        observed_state: {
            r1_total_items: 36,
            r1_blue_count: 8,
            r2_orange_avg: 1,
            r3_purple_avg: 4.33,
            r2_white_green_cells: 22
        },
        analysis_snapshot: {
            status: "available",
            phase: "full",
            summary: {
                count_means: { w: 2, g: 8, b: 8, p: 3, o: 1, r: 12.5 },
                cell_means: { w: 3, g: 14, b: 16, p: 12, o: 2, r: 46 }
            },
            valuation: {
                mean_value: 2400000,
                q05: 1600000,
                q50: 2450000,
                q95: 3000000
            }
        },
        screenshot_attachment: {
            name: "clipboard-screenshot.png",
            type: "image/jpeg",
            size: 1000,
            stored_width: 1280,
            stored_height: 900,
            data_url: "data:image/jpeg;base64,AAAA"
        },
        settlement_sample: {
            record_type: "settlement_sample",
            map_id: "sunken_ship",
            field_values: {
                total_items: 36,
                blue_count: 8,
                purple_avg_cells: 4.33,
                orange_avg_cells: 1,
                white_green_total_cells: 22
            },
            observed_state: {
                r1_total_items: 36,
                r1_blue_count: 8,
                r2_orange_avg: 1,
                r3_purple_avg: 4.33,
                r2_white_green_cells: 22
            },
            actual_counts: {},
            actual_value: null
        },
        ...overrides
    };
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return filePath;
}

test("package exposes capture package intake report builder", () => {
    assert.equal(
        packageJson.scripts["build:capture-package-intake"],
        "node scripts/build_capture_package_intake_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_capture_package_intake_report\.js/);
});

test("resolveArgs accepts capture paths, output, generated-at, and group gap", () => {
    const args = resolveArgs([
        "a.json",
        "b.json",
        "--output=report.json",
        "--generated-at",
        "2026-04-27T00:00:00.000Z",
        "--group-max-gap-ms=90000"
    ]);

    assert.deepEqual(args.capturePackagePaths, [path.resolve("a.json"), path.resolve("b.json")]);
    assert.equal(args.outputPath, path.resolve("report.json"));
    assert.equal(args.generatedAt, "2026-04-27T00:00:00.000Z");
    assert.equal(args.groupMaxGapMs, 90000);
});

test("capture package intake gates missing manual counts as review-only", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-capture-intake-"));
    const captureA = writeCapture(path.join(tempDir, "capture-a.json"));
    const captureB = writeCapture(path.join(tempDir, "capture-b.json"), {
        exported_at: "2026-04-26T12:03:01.000Z",
        settlement_sample: {
            map_id: "sunken_ship",
            field_values: { total_items: 36 },
            observed_state: { r1_total_items: 36 },
            actual_counts: { w: 6, g: 8, b: 8, p: 9, o: 4, r: 1 },
            actual_value: 1234567
        }
    });

    try {
        const report = buildCapturePackageIntakeReport([captureA, captureB], {
            generatedAt: "2026-04-27T00:00:00.000Z",
            groupMaxGapMs: 120000
        });

        assert.equal(report.schema_version, "ak_capture_package_intake_report_v1");
        assert.equal(report.change_class, "RESEARCH_ONLY");
        assert.equal(report.summary.capture_package_count, 2);
        assert.equal(report.summary.capture_group_count, 2);
        assert.equal(report.summary.needs_manual_counts_count, 1);
        assert.equal(report.summary.count_fit_ready_count, 1);
        assert.equal(report.summary.training_label_allowed_count, 0);
        assert.equal(report.summary.max_embedded_red_count_mean, 12.5);
        assert.equal(report.summary.max_model_red_count_mean, 12.5);
        assert.equal(report.summary.current_input_risk_flagged_count, 1);
        assert.equal(report.summary.embedded_snapshot_risk_flagged_count, 2);
        assert.equal(report.entries[0].use_class, "needs_manual_counts");
        assert.equal(report.entries[0].training_label_allowed, false);
        assert.ok(report.entries[0].risk_flags.includes("missing_manual_actual_counts"));
        assert.equal(report.entries[0].risk_flags.includes("model_predicted_red_count_extreme"), false);
        assert.ok(report.entries[0].embedded_snapshot_risk_flags.includes("model_predicted_red_count_extreme"));
        assert.ok(report.entries[0].legacy_mixed_risk_flags.includes("model_predicted_red_count_extreme"));
        assert.equal(report.entries[1].use_class, "count_fit_ready");
        assert.deepEqual(report.entries[1].actual_counts, { w: 6, g: 8, b: 8, p: 9, o: 4, r: 1 });
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("constraint diagnostics identify missing orange count residual red risk", () => {
    const diagnostics = buildConstraintDiagnostics({
        field_values: {
            total_items: 48,
            blue_count: 17,
            purple_count: 9,
            orange_avg_cells: 12,
            orange_count: null,
            white_green_total_cells: 24,
            white_green_avg_cells: 2.4
        }
    });

    assert.deepEqual(diagnostics, {
        total_items: 48,
        blue_count: 17,
        blue_count_source: "direct_count",
        purple_count: 9,
        purple_count_source: "direct_count",
        orange_count: null,
        orange_count_source: null,
        white_green_total_cells: 24,
        white_green_avg_cells: 2.4,
        white_green_total_count: 10,
        white_green_total_count_source: "total_cells_div_avg_cells",
        inferred_white_green_count: 10,
        orange_avg_cells: 12,
        orange_red_unknown_pool: 12,
        known_count_balance_complete: true,
        orange_count_missing: true
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-capture-intake-residual-"));
    const capturePath = writeCapture(path.join(tempDir, "capture.json"), {
        field_values: {
            total_items: 48,
            blue_count: 17,
            purple_count: 9,
            orange_avg_cells: 12,
            white_green_total_cells: 24,
            white_green_avg_cells: 2.4
        },
        observed_state: {
            r1_total_items: 48,
            r1_blue_count: 17,
            r2_purple_count: 9,
            r2_orange_avg: 12,
            r2_white_green_cells: 24,
            r3_white_green_avg: 2.4
        },
        analysis_snapshot: {
            summary: {
                count_means: { r: 11 },
                cell_means: { r: 40 }
            }
        }
    });

    try {
        const report = buildCapturePackageIntakeReport([capturePath], {
            generatedAt: "2026-04-27T00:00:00.000Z"
        });
        assert.equal(report.entries[0].constraint_diagnostics.orange_red_unknown_pool, 12);
        assert.ok(report.entries[0].risk_flags.includes("extreme_orange_avg_needs_orange_count_confirmation"));
        assert.equal(report.entries[0].risk_flags.includes("red_residual_sensitive_to_missing_orange_count"), false);
        assert.ok(report.entries[0].embedded_snapshot_risk_flags.includes("red_residual_sensitive_to_missing_orange_count"));
        assert.ok(report.entries[0].legacy_mixed_risk_flags.includes("red_residual_sensitive_to_missing_orange_count"));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("constraint diagnostics treat exact quality total cells and average as a count anchor", () => {
    const diagnostics = buildConstraintDiagnostics({
        field_values: {
            total_items: 28,
            blue_count: 5,
            orange_avg_cells: 6,
            orange_total_cells: 6,
            white_green_total_cells: 17,
            white_green_avg_cells: 1
        }
    });

    assert.equal(diagnostics.orange_count, 1);
    assert.equal(diagnostics.orange_count_source, "total_cells_div_avg_cells");
    assert.equal(diagnostics.orange_count_missing, false);
    assert.equal(diagnostics.orange_red_unknown_pool, 5);
});

test("constraint diagnostics infer count anchors from displayed average text", () => {
    const diagnostics = buildConstraintDiagnostics({
        field_values: {
            total_items: 24,
            blue_count: 4,
            orange_avg_cells: "1",
            purple_avg_cells: "4.28",
            white_green_total_cells: 23,
            white_green_avg_cells: "2.09"
        },
        observed_state: {
            r1_total_items: 24,
            r1_blue_count: 4,
            r2_orange_avg: 1,
            r2_orange_avg_text: "1",
            r3_purple_avg: 4.28,
            r3_purple_avg_text: "4.28",
            r2_white_green_cells: 23,
            r3_white_green_avg: 2.09,
            r3_white_green_avg_text: "2.09",
            r3_white_green_avg_rounding_mode: "truncate"
        }
    });

    assert.equal(diagnostics.white_green_total_count, 11);
    assert.equal(diagnostics.white_green_total_count_source, "total_cells_div_avg_display");
    assert.equal(diagnostics.inferred_white_green_count, 11);
    assert.equal(diagnostics.orange_red_unknown_pool, 9);
});

test("capture package intake preserves embedded posterior risk and audits flag consistency", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-capture-intake-embedded-risk-"));
    const capturePath = writeCapture(path.join(tempDir, "capture.json"), {
        field_values: {
            total_items: 48,
            blue_count: 17,
            purple_count: 9,
            orange_avg_cells: 12,
            white_green_total_cells: 24,
            white_green_avg_cells: 2.4
        },
        observed_state: {
            r1_total_items: 48,
            r1_blue_count: 17,
            r2_purple_count: 9,
            r2_orange_avg: 12,
            r2_white_green_cells: 24,
            r3_white_green_avg: 2.4
        },
        analysis_snapshot: {
            status: "available",
            phase: "coarse",
            summary: {
                count_means: { r: 11 },
                cell_means: { r: 40 }
            },
            posterior_risk: {
                status: "warning",
                warnings: ["当前红色期望主要来自橙数缺失后的未知池残差。"],
                flags: [
                    "extreme_orange_avg_needs_orange_count_confirmation",
                    "red_residual_sensitive_to_missing_orange_count",
                    "model_predicted_red_count_extreme",
                    "model_predicted_red_cells_extreme"
                ],
                constraint_diagnostics: {
                    orange_red_unknown_pool: 12
                }
            }
        }
    });

    try {
        const report = buildCapturePackageIntakeReport([capturePath], {
            generatedAt: "2026-04-27T00:00:00.000Z"
        });
        const entry = report.entries[0];
        assert.equal(report.summary.embedded_posterior_risk_count, 1);
        assert.equal(report.summary.posterior_risk_mismatch_count, 0);
        assert.equal(entry.analysis_snapshot.posterior_risk.status, "warning");
        assert.deepEqual(entry.risk_flags, [
            "extreme_orange_avg_needs_orange_count_confirmation",
            "missing_manual_actual_counts"
        ]);
        assert.deepEqual(entry.embedded_snapshot_risk_flags, [
            "model_predicted_red_count_extreme",
            "model_predicted_red_cells_extreme",
            "red_residual_sensitive_to_missing_orange_count"
        ]);
        assert.deepEqual(entry.analysis_snapshot.posterior_risk.flags, [
            "extreme_orange_avg_needs_orange_count_confirmation",
            "red_residual_sensitive_to_missing_orange_count",
            "model_predicted_red_count_extreme",
            "model_predicted_red_cells_extreme"
        ]);
        assert.deepEqual(entry.posterior_risk_consistency, {
            embedded_present: true,
            status: "matching",
            missing_from_embedded: [],
            missing_from_recomputed: []
        });
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("main writes capture package intake JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-capture-intake-main-"));
    const capturePath = writeCapture(path.join(tempDir, "capture.json"));
    const outputPath = path.join(tempDir, "intake.json");
    const originalWrite = process.stdout.write;
    const printed = [];
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            capturePath,
            "--output",
            outputPath,
            "--generated-at",
            "2026-04-27T00:00:00.000Z"
        ]);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
        assert.equal(report.generated_at, "2026-04-27T00:00:00.000Z");
        assert.match(markdown, /Capture Package Intake Report/);
        assert.match(markdown, /embedded_r/);
        assert.match(markdown, /embedded_model_predicted_red_count_extreme/);
        assert.match(markdown, /current=missing_manual_actual_counts/);
        assert.match(markdown, /embedded_snapshot=embedded_model_predicted_red_count_extreme/);
        assert.doesNotMatch(markdown, /\| model_r \|/);
        assert.match(markdown, /not current default recomputations/);
        assert.match(printed.join(""), new RegExp(`${outputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`));
    } finally {
        process.stdout.write = originalWrite;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
