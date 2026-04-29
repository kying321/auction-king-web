const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    main,
    resolveBaselineConfig,
    resolveArgs
} = require("../scripts/build_purple_weight_fit_report.js");

test("package exposes purple weight fit builder", () => {
    assert.equal(
        packageJson.scripts["build:purple-weight-fit"],
        "node scripts/build_purple_weight_fit_report.js"
    );
});

test("resolveArgs accepts samples, optional atlas, optional baseline overrides, and output path", () => {
    const result = resolveArgs(["samples.json", "atlas.json", "report.json"]);
    const explicitBaseline = resolveArgs(["samples.json", "atlas.json", "baseline.json", "report.json"]);

    assert.equal(result.samplesPath, path.resolve("samples.json"));
    assert.equal(result.atlasSnapshotPath, path.resolve("atlas.json"));
    assert.equal(result.baselineOverridesPath, null);
    assert.equal(result.outputPath, path.resolve("report.json"));
    assert.equal(explicitBaseline.baselineOverridesPath, path.resolve("baseline.json"));
    assert.equal(explicitBaseline.outputPath, path.resolve("report.json"));
});

test("resolveBaselineConfig applies frozen pre-implementation purple alpha counts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-purple-baseline-"));
    const baselinePath = path.join(tempDir, "baseline.json");

    fs.writeFileSync(baselinePath, JSON.stringify({
        maps: {
            sunken_ship: { alpha_counts: { p: 3.84 } },
            villa: { alpha_counts: { p: 4.2 } },
            shipping: { alpha_counts: { p: 2.9 } }
        }
    }, null, 2));

    const baselineConfig = resolveBaselineConfig(baselinePath);

    assert.equal(baselineConfig.maps.sunken_ship.alpha_counts.p, 3.84);
    assert.equal(baselineConfig.maps.villa.alpha_counts.p, 4.2);
    assert.equal(baselineConfig.maps.shipping.alpha_counts.p, 2.9);
});

test("main writes purple weight fit JSON and markdown reports", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-purple-fit-"));
    const samplesPath = path.join(tempDir, "samples.json");
    const atlasPath = path.join(tempDir, "atlas.json");
    const outputPath = path.join(tempDir, "purple-fit.json");

    fs.writeFileSync(samplesPath, JSON.stringify({
        samples: [
            {
                id: "sunken_red_case",
                map_id: "sunken_ship",
                field_values: {
                    total_items: 43,
                    blue_count: 11,
                    orange_avg_cells: 1,
                    purple_avg_cells: 2.66,
                    white_green_total_cells: 38,
                    white_green_avg_cells: 2.23
                },
                actual_counts: {
                    o: 2,
                    r: 4
                }
            }
        ]
    }, null, 2));
    fs.writeFileSync(atlasPath, JSON.stringify({
        quality_summaries: [
            {
                quality: "p",
                observed_average_value: 9492.84,
                observed_value_sd: 5520.12,
                suggested_value_model: { sample_count: 103 }
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
        main([samplesPath, atlasPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");

    assert.equal(report.schema_version, "ak_purple_weight_fit_report_v1");
    assert.equal(report.recommendation.selected_shadow_multiplier, 1);
    assert.equal(report.recommendation.selected_default_multiplier, null);
    assert.equal(report.recommendation.default_weight_change_class, "RESEARCH_ONLY");
    assert.equal(report.baseline_config_source.kind, "default_config_plus_overrides");
    assert.match(markdown, /purple weight fit/i);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
