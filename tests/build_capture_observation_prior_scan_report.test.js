const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    applyAlphaMultipliers,
    buildCaptureObservationPriorScanReport,
    buildScenarioDefinitionsForMap,
    createSeededRandom,
    inferResidualFlags,
    main,
    resolveArgs
} = require("../scripts/build_capture_observation_prior_scan_report.js");

function buildIntakeFixture() {
    return {
        schema_version: "ak_capture_package_intake_report_v1",
        generated_at: "2026-04-27T01:30:00.000+08:00",
        summary: {
            capture_package_count: 1,
            training_label_allowed_count: 0
        },
        entries: [
            {
                basename: "capture.json",
                exported_at: "2026-04-26T12:00:00.000Z",
                map_id: "sunken_ship",
                field_values_compact: {
                    total_items: 20,
                    blue_count: 5
                },
                observed_state: {
                    r1_total_items: 20,
                    r1_blue_count: 5
                },
                constraint_diagnostics: {
                    total_items: 20,
                    blue_count: 5,
                    purple_count: null,
                    orange_count: null,
                    white_green_total_cells: null,
                    white_green_avg_cells: null,
                    inferred_white_green_count: null,
                    orange_avg_cells: null,
                    orange_red_unknown_pool: null,
                    known_count_balance_complete: false,
                    orange_count_missing: true
                },
                use_class: "needs_manual_counts",
                training_label_allowed: false
            }
        ]
    };
}

test("package exposes capture observation prior scan builder", () => {
    assert.equal(
        packageJson.scripts["build:capture-observation-prior-scan"],
        "node scripts/build_capture_observation_prior_scan_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_capture_observation_prior_scan_report\.js/);
});

test("resolveArgs accepts intake path, output path, and generated-at", () => {
    const args = resolveArgs([
        "intake.json",
        "scan.json",
        "--generated-at=2026-04-27T02:00:00.000+08:00"
    ]);

    assert.equal(args.inputPath, path.resolve("intake.json"));
    assert.equal(args.outputPath, path.resolve("scan.json"));
    assert.equal(args.generatedAt, "2026-04-27T02:00:00.000+08:00");
});

test("applyAlphaMultipliers preserves total while lowering red share", () => {
    const alpha = { w: 5, g: 6, b: 8, p: 3, o: 1, r: 1 };
    const next = applyAlphaMultipliers(alpha, { r: 0.25, o: 1.5 });
    const total = Object.values(next).reduce((sum, value) => sum + value, 0);

    assert.equal(Math.abs(total - 24) < 0.00001, true);
    assert.equal(next.r < alpha.r, true);
    assert.equal(next.o > alpha.o, true);
});

test("seeded random is deterministic", () => {
    const left = createSeededRandom("case");
    const right = createSeededRandom("case");
    assert.deepEqual([left(), left(), left()], [right(), right(), right()]);
});

test("scenario definitions include current default and red-tail shadow candidates", () => {
    const scenarios = buildScenarioDefinitionsForMap("sunken_ship");
    const ids = scenarios.map((scenario) => scenario.id);

    assert.ok(ids.includes("current_default"));
    assert.ok(ids.includes("red_quarter_high_prior_strength_10"));
    assert.ok(scenarios.some((scenario) => scenario.source_classification === "red_tail_rarity_shadow"));
});

test("inferResidualFlags marks missing-orange residual red risk", () => {
    const flags = inferResidualFlags({
        field_values_compact: { total_items: 48 },
        constraint_diagnostics: {
            total_items: 48,
            orange_count_missing: true,
            orange_avg_cells: 12,
            orange_red_unknown_pool: 12
        }
    }, {
        red_count_mean: 11,
        red_cell_mean: 40
    });

    assert.ok(flags.includes("extreme_orange_avg_needs_orange_count_confirmation"));
    assert.ok(flags.includes("red_residual_sensitive_to_missing_orange_count"));
    assert.ok(flags.includes("model_predicted_red_count_extreme"));
});

test("buildCaptureObservationPriorScanReport evaluates shadow scenarios without enabling adoption", () => {
    const report = buildCaptureObservationPriorScanReport({
        intakeReport: buildIntakeFixture(),
        generatedAt: "2026-04-27T02:00:00.000+08:00",
        paths: { inputPath: "/tmp/intake.json" }
    });

    assert.equal(report.schema_version, "ak_capture_observation_prior_scan_v1");
    assert.equal(report.generated_at, "2026-04-27T02:00:00.000+08:00");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.capture_package_count, 1);
    assert.equal(report.summary.training_label_allowed_count, 0);
    assert.ok(report.summary.scenario_count >= 8);
    assert.ok(report.scenario_summaries.every((scenario) => scenario.adoption_allowed === false));
    assert.ok(report.guardrails.includes("capture_observations_are_not_training_labels"));
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-prior-scan-"));
    const inputPath = path.join(tempDir, "intake.json");
    const outputPath = path.join(tempDir, "scan.json");
    fs.writeFileSync(inputPath, JSON.stringify(buildIntakeFixture(), null, 2));
    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([inputPath, outputPath, "--generated-at=2026-04-27T02:00:00.000+08:00"]);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
        assert.equal(report.summary.capture_package_count, 1);
        assert.match(markdown, /Capture Observation Prior Scan/);
        assert.equal(printed.join(""), `${outputPath}\n${outputPath.replace(/\.json$/i, ".md")}\n`);
    } finally {
        process.stdout.write = originalWrite;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
