const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH,
    formatProducerStrategyArchitectureMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_producer_strategy_architecture_report.js");

test("package exposes producer strategy architecture report entry", () => {
    assert.match(
        packageJson.scripts["build:producer-strategy-architecture"] || "",
        /node\s+scripts\/build_producer_strategy_architecture_report\.js/
    );
});

test("resolveArgs accepts count report, value report, and output path", () => {
    const result = resolveArgs(["count.json", "value.json", "strategy.json"]);

    assert.equal(result.countPriorReportPath, path.resolve("count.json"));
    assert.equal(result.valueModelReportPath, path.resolve("value.json"));
    assert.equal(result.outputPath, path.resolve("strategy.json"));
});

test("resolveArgs accepts replay diagnostics and count-fit readiness paths", () => {
    const result = resolveArgs(["count.json", "value.json", "strategy.json", "replay.json", "readiness.json"]);

    assert.equal(result.replayDiagnosticsReportPath, path.resolve("replay.json"));
    assert.equal(result.countFitReadinessReportPath, path.resolve("readiness.json"));
});

test("default output path uses the latest count-fit-readiness gated strategy report", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-25-producer-strategy-architecture-report.json"), true);
});

test("default replay diagnostics path uses the latest count-fit-readiness gated diagnostics report", () => {
    assert.equal(DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH.endsWith("2026-04-25-producer-strategy-replay-diagnostics-report.json"), true);
});

test("main writes producer strategy architecture JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-strategy-"));
    const countPath = path.join(tempDir, "count.json");
    const valuePath = path.join(tempDir, "value.json");
    const outputPath = path.join(tempDir, "strategy.json");

    fs.writeFileSync(countPath, JSON.stringify({
        maps: {
            villa: {
                map_id: "villa",
                alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                count_prior_strength_candidate: 16,
                clean_replay_sample_count: 1,
                clean_replay_full_distribution_sample_count: 0,
                clean_replay_two_sigma_fit: {
                    villa_partial: { all_within_2sigma: true, max_abs_z: 1.1 }
                },
                blockers: ["insufficient_clean_replay_sample_size", "pixel_shadow_review_only"]
            }
        }
    }, null, 2));
    fs.writeFileSync(valuePath, JSON.stringify({
        runtime_family_status: "phase1_disabled",
        maps: {
            villa: {
                map_id: "villa",
                runtime_family_status: "phase1_disabled",
                all_target_fits_within_2sigma: true,
                quality_fits: {
                    p: { z: 0.5, within_2sigma: true },
                    o: { z: -0.9, within_2sigma: true },
                    r: { z: -0.2, within_2sigma: true }
                },
                red_type_value_envelope: { mean_unit_value: 215284, low_2sigma: 0, high_2sigma: 455910 },
                blockers: ["collection_family_runtime_disabled"]
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
        main([countPath, valuePath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.schema_version, "ak_producer_strategy_architecture_v1");
    assert.match(markdown, /producer strategy architecture/);
    assert.doesNotMatch(markdown, /2026-04-24 producer strategy architecture/);
    assert.match(formatProducerStrategyArchitectureMarkdown(report, outputPath), /adoption allowed: `false`/);
    assert.match(markdown, /count fit readiness/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
