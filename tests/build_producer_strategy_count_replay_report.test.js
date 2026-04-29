const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_CANDIDATE_CONFIG_PATH,
    DEFAULT_OUTPUT_PATH,
    main,
    resolveArgs
} = require("../scripts/build_producer_strategy_count_replay_report.js");

test("package exposes producer strategy count replay report entry", () => {
    assert.match(
        packageJson.scripts["build:producer-strategy-count-replay"] || "",
        /node\s+scripts\/build_producer_strategy_count_replay_report\.js/
    );
});

test("default paths use the latest count-fit-readiness gated candidate and replay report", () => {
    assert.equal(DEFAULT_CANDIDATE_CONFIG_PATH.endsWith("2026-04-25-producer-strategy-candidate-config.json"), true);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-25-producer-strategy-count-replay-report.json"), true);
});

test("resolveArgs accepts samples, candidate config, and output paths", () => {
    const result = resolveArgs(["samples.json", "candidate.json", "report.json"]);

    assert.equal(result.samplesPath, path.resolve("samples.json"));
    assert.equal(result.candidateConfigPath, path.resolve("candidate.json"));
    assert.equal(result.outputPath, path.resolve("report.json"));
});

test("main writes producer strategy count replay with current candidate guard context", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-count-replay-"));
    const samplesPath = path.join(tempDir, "samples.json");
    const candidatePath = path.join(tempDir, "candidate.json");
    const outputPath = path.join(tempDir, "report.json");

    fs.writeFileSync(samplesPath, JSON.stringify({
        samples: [
            {
                id: "villa_case",
                map_id: "villa",
                field_values: {
                    total_items: 45,
                    blue_count: 11,
                    orange_avg_cells: 3.33
                },
                actual_counts: { o: 1 }
            }
        ]
    }, null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify({
        producer_strategy_candidate: {
            schema_version: "ak_producer_strategy_candidate_config_v1",
            source_report: "/tmp/2026-04-25-producer-strategy-architecture-report.json",
            applied_maps: [],
            skipped_maps: ["villa"],
            skipped_map_reasons: {
                villa: ["count_fit_readiness_failed"]
            },
            replay_guard: "skip_candidate_replay_passed_false",
            count_fit_readiness_guard: "skip_count_fit_readiness_passed_false",
            default_config_update_allowed: false
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
    assert.equal(report.candidate_config_context.count_fit_readiness_guard, "skip_count_fit_readiness_passed_false");
    assert.deepEqual(report.candidate_config_context.skipped_map_reasons.villa, ["count_fit_readiness_failed"]);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
