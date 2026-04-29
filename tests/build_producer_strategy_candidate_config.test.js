const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_STRATEGY_REPORT_PATH,
    buildProducerStrategyCandidateConfig,
    main,
    resolveArgs
} = require("../scripts/build_producer_strategy_candidate_config.js");

test("package exposes producer strategy candidate config entry", () => {
    assert.match(
        packageJson.scripts["build:producer-strategy-candidate-config"] || "",
        /node\s+scripts\/build_producer_strategy_candidate_config\.js/
    );
});

test("resolveArgs accepts strategy report and output path", () => {
    const result = resolveArgs(["strategy.json", "candidate.json"]);

    assert.equal(result.strategyReportPath, path.resolve("strategy.json"));
    assert.equal(result.outputPath, path.resolve("candidate.json"));
});

test("default paths consume the latest count-fit-readiness gated strategy report", () => {
    assert.equal(DEFAULT_STRATEGY_REPORT_PATH.endsWith("2026-04-25-producer-strategy-architecture-report.json"), true);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-25-producer-strategy-candidate-config.json"), true);
});

test("buildProducerStrategyCandidateConfig applies only sim replay candidate maps", () => {
    const candidate = buildProducerStrategyCandidateConfig({
        baselineConfig: defaultConfig,
        strategyReport: {
            maps: {
                villa: {
                    alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                    count_prior_strength_candidate: 16,
                    gates: { sim_replay_candidate: true }
                },
                shipping: {
                    alpha_counts_candidate: { w: 3, g: 4, b: 4, p: 3, o: 3, r: 1 },
                    count_prior_strength_candidate: 10,
                    gates: { sim_replay_candidate: false }
                }
            }
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.deepEqual(candidate.maps.villa.alpha_counts, { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 });
    assert.equal(candidate.maps.villa.solver.count_prior_strength, 16);
    assert.deepEqual(candidate.maps.shipping.alpha_counts, defaultConfig.maps.shipping.alpha_counts);
    assert.equal(candidate.producer_strategy_candidate.change_class, "RESEARCH_ONLY");
    assert.deepEqual(candidate.producer_strategy_candidate.applied_maps, ["villa"]);
    assert.deepEqual(candidate.producer_strategy_candidate.skipped_maps, ["shipping"]);
});

test("buildProducerStrategyCandidateConfig skips maps with replay-regressed candidates", () => {
    const candidate = buildProducerStrategyCandidateConfig({
        baselineConfig: defaultConfig,
        strategyReport: {
            maps: {
                villa: {
                    alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                    count_prior_strength_candidate: 16,
                    gates: {
                        sim_replay_candidate: true,
                        candidate_replay_evaluated: true,
                        candidate_replay_passed: false
                    }
                },
                sunken_ship: {
                    alpha_counts_candidate: { w: 2, g: 2, b: 4, p: 4, o: 2, r: 2 },
                    count_prior_strength_candidate: 10,
                    gates: {
                        sim_replay_candidate: true,
                        candidate_replay_evaluated: true,
                        candidate_replay_passed: true
                    }
                }
            }
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.deepEqual(candidate.maps.villa.alpha_counts, defaultConfig.maps.villa.alpha_counts);
    assert.deepEqual(candidate.maps.sunken_ship.alpha_counts, { w: 2, g: 2, b: 4, p: 4, o: 2, r: 2 });
    assert.deepEqual(candidate.producer_strategy_candidate.applied_maps, ["sunken_ship"]);
    assert.deepEqual(candidate.producer_strategy_candidate.skipped_maps, ["villa"]);
    assert.deepEqual(candidate.producer_strategy_candidate.skipped_map_reasons.villa, ["candidate_replay_regressed_baseline"]);
});

test("buildProducerStrategyCandidateConfig skips maps whose count-fit readiness gate failed", () => {
    const candidate = buildProducerStrategyCandidateConfig({
        baselineConfig: defaultConfig,
        strategyReport: {
            maps: {
                villa: {
                    alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                    count_prior_strength_candidate: 16,
                    gates: {
                        sim_replay_candidate: true,
                        candidate_replay_evaluated: true,
                        candidate_replay_passed: true,
                        count_fit_readiness_evaluated: true,
                        count_fit_readiness_passed: false
                    }
                }
            }
        },
        generatedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.deepEqual(candidate.maps.villa.alpha_counts, defaultConfig.maps.villa.alpha_counts);
    assert.deepEqual(candidate.producer_strategy_candidate.applied_maps, []);
    assert.deepEqual(candidate.producer_strategy_candidate.skipped_maps, ["villa"]);
    assert.deepEqual(candidate.producer_strategy_candidate.skipped_map_reasons.villa, ["count_fit_readiness_failed"]);
});

test("main writes a producer strategy candidate config", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-strategy-config-"));
    const strategyPath = path.join(tempDir, "strategy.json");
    const outputPath = path.join(tempDir, "candidate.json");

    fs.writeFileSync(strategyPath, JSON.stringify({
        maps: {
            villa: {
                alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                count_prior_strength_candidate: 16,
                gates: { sim_replay_candidate: true }
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
        main([strategyPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const candidate = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(candidate.producer_strategy_candidate.source_report, strategyPath);
    assert.deepEqual(candidate.producer_strategy_candidate.applied_maps, ["villa"]);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
