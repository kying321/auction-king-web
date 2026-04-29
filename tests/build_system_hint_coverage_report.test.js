const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    formatSystemHintCoverageMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_system_hint_coverage_report.js");

test("package exposes system hint coverage report entry", () => {
    assert.match(
        packageJson.scripts["build:system-hint-coverage"] || "",
        /node\s+scripts\/build_system_hint_coverage_report\.js/
    );
});

test("resolveArgs accepts multiple inputs, output path, and readiness threshold", () => {
    const result = resolveArgs([
        "package-a.json",
        "package-b.json",
        "--output",
        "report.json",
        "--min-value-scored-per-map",
        "12"
    ]);

    assert.deepEqual(result.inputPaths, [
        path.resolve("package-a.json"),
        path.resolve("package-b.json")
    ]);
    assert.equal(result.outputPath, path.resolve("report.json"));
    assert.equal(result.thresholds.min_value_scored_samples_per_map, 12);
});

test("main writes system hint coverage JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-system-hint-coverage-"));
    const inputPath = path.join(tempDir, "replay-package.json");
    const outputPath = path.join(tempDir, "coverage.json");

    fs.writeFileSync(inputPath, JSON.stringify({
        schema_version: "ak_settlement_calibration_replay_package_v1",
        export_context: {
            map_id: "villa",
            filter_value: "pending_export"
        },
        samples: [
            {
                id: "villa_ready",
                map_id: "villa",
                observed_state: {
                    system_avg_value_type_count: 2,
                    system_avg_value_per_cell: 8735.34
                },
                actual_cells: 8,
                actual_value: 70000
            }
        ]
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([inputPath, "--output", outputPath, "--min-value-scored-per-map", "1"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.maps.villa.can_fit_system_hint_anchor, true);
    assert.match(markdown, /system hint coverage/);
    assert.match(formatSystemHintCoverageMarkdown(report, outputPath), /villa/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
