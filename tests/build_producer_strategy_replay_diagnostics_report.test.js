const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_REPLAY_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    formatProducerStrategyReplayDiagnosticsMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_producer_strategy_replay_diagnostics_report.js");

test("package exposes producer strategy replay diagnostics report entry", () => {
    assert.match(
        packageJson.scripts["build:producer-strategy-replay-diagnostics"] || "",
        /node\s+scripts\/build_producer_strategy_replay_diagnostics_report\.js/
    );
});

test("resolveArgs accepts replay report and output path", () => {
    const result = resolveArgs(["replay.json", "diagnostics.json"]);

    assert.equal(result.replayReportPath, path.resolve("replay.json"));
    assert.equal(result.outputPath, path.resolve("diagnostics.json"));
});

test("default output path uses the latest count-fit-readiness gated diagnostics report", () => {
    assert.equal(DEFAULT_REPLAY_REPORT_PATH.endsWith("2026-04-25-producer-strategy-count-replay-report.json"), true);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-25-producer-strategy-replay-diagnostics-report.json"), true);
});

test("main writes producer strategy replay diagnostics JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-replay-diag-"));
    const replayPath = path.join(tempDir, "replay.json");
    const outputPath = path.join(tempDir, "diagnostics.json");

    fs.writeFileSync(replayPath, JSON.stringify({
        sample_count: 1,
        samples: [
            {
                id: "sunken_case",
                map_id: "sunken_ship",
                baseline: {
                    red: { actual_count: 4, actual_prob: 0.45, rank: 1, mean_count: 3.94, abs_error: 0.06 }
                },
                candidate: {
                    red: { actual_count: 4, actual_prob: 0.12, rank: 4, mean_count: 2.54, abs_error: 1.46 }
                }
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
        main([replayPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.schema_version, "ak_producer_strategy_replay_diagnostics_v1");
    assert.match(markdown, /producer strategy replay diagnostics/);
    assert.doesNotMatch(markdown, /2026-04-24 producer strategy replay diagnostics/);
    assert.match(formatProducerStrategyReplayDiagnosticsMarkdown(report, outputPath), /candidate loses/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});

test("formatProducerStrategyReplayDiagnosticsMarkdown explains replay-guarded baseline fallback", () => {
    const markdown = formatProducerStrategyReplayDiagnosticsMarkdown({
        decision: "candidate_guarded_by_baseline",
        adoption_allowed: false,
        global_blockers: ["candidate_config_skipped_regressed_baseline"],
        maps: {
            villa: {
                map_id: "villa",
                sample_count: 1,
                candidate_config_status: {
                    status: "skipped",
                    reasons: ["candidate_replay_regressed_baseline"]
                },
                quality_summary: {
                    o: {
                        classification: "neutral",
                        degraded_count: 0,
                        improved_count: 0,
                        mean_log_loss_delta: 0,
                        mean_abs_error_delta: 0,
                        dominant_candidate_direction: "near_actual"
                    }
                },
                samples: [{ id: "villa_case" }]
            }
        }
    }, "diagnostics.json");

    assert.match(markdown, /replay guard/);
    assert.match(markdown, /candidate_replay_regressed_baseline/);
    assert.doesNotMatch(markdown, /当前 shadow candidate 在现有 clean replay 上弱于 baseline/);
});

test("formatProducerStrategyReplayDiagnosticsMarkdown preserves improved quality classification", () => {
    const markdown = formatProducerStrategyReplayDiagnosticsMarkdown({
        decision: "candidate_requires_more_replay",
        adoption_allowed: false,
        global_blockers: ["research_only_shadow_candidate"],
        maps: {
            villa: {
                map_id: "villa",
                sample_count: 1,
                candidate_config_status: {
                    status: "applied",
                    reasons: []
                },
                quality_summary: {
                    b: {
                        classification: "improved",
                        degraded_count: 0,
                        improved_count: 1,
                        mean_log_loss_delta: -0.12,
                        mean_abs_error_delta: -0.2,
                        dominant_candidate_direction: "near_actual"
                    }
                },
                samples: [{ id: "villa_case" }]
            }
        }
    }, "diagnostics.json");

    assert.match(markdown, /b:class=improved/);
    assert.doesNotMatch(markdown, /弱于 baseline/);
});
