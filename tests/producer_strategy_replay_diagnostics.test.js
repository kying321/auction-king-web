const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildProducerStrategyReplayDiagnosticsReport,
    compareReplayQuality
} = require("../producer_strategy_replay_diagnostics.js");

test("compareReplayQuality marks candidate regression and count direction", () => {
    const result = compareReplayQuality({
        quality: "r",
        baseline: {
            actual_count: 4,
            actual_prob: 0.45,
            rank: 1,
            mean_count: 3.94,
            abs_error: 0.06
        },
        candidate: {
            actual_count: 4,
            actual_prob: 0.12,
            rank: 4,
            mean_count: 2.54,
            abs_error: 1.46
        }
    });

    assert.equal(result.classification, "degraded");
    assert.equal(result.candidate_direction, "underpredicts_count");
    assert.equal(result.rank_delta, 3);
    assert.ok(result.log_loss_delta > 1);
});

test("buildProducerStrategyReplayDiagnosticsReport summarizes map regressions", () => {
    const report = buildProducerStrategyReplayDiagnosticsReport({
        replayReport: {
            sample_count: 2,
            samples: [
                {
                    id: "villa_case",
                    map_id: "villa",
                    baseline: {
                        orange: { actual_count: 1, actual_prob: 1, rank: 1, mean_count: 1, abs_error: 0 }
                    },
                    candidate: {
                        orange: { actual_count: 1, actual_prob: 0.82, rank: 1, mean_count: 1.86, abs_error: 0.86 }
                    }
                },
                {
                    id: "sunken_case",
                    map_id: "sunken_ship",
                    baseline: {
                        orange: { actual_count: 2, actual_prob: 0.5, rank: 1, mean_count: 2.08, abs_error: 0.08 },
                        red: { actual_count: 4, actual_prob: 0.45, rank: 1, mean_count: 3.94, abs_error: 0.06 }
                    },
                    candidate: {
                        orange: { actual_count: 2, actual_prob: 0.27, rank: 2, mean_count: 1.36, abs_error: 0.64 },
                        red: { actual_count: 4, actual_prob: 0.12, rank: 4, mean_count: 2.54, abs_error: 1.46 }
                    }
                }
            ]
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.equal(report.schema_version, "ak_producer_strategy_replay_diagnostics_v1");
    assert.equal(report.adoption_allowed, false);
    assert.equal(report.summary.evaluated_quality_count, 3);
    assert.equal(report.summary.degraded_count, 3);
    assert.deepEqual(report.summary.maps_with_degradation, ["sunken_ship", "villa"]);
    assert.equal(report.maps.sunken_ship.quality_summary.r.classification, "degraded");
    assert.equal(report.maps.sunken_ship.quality_summary.r.candidate_direction, "underpredicts_count");
    assert.ok(report.global_blockers.includes("candidate_loses_to_current_baseline"));
});

test("buildProducerStrategyReplayDiagnosticsReport expands diagnostics from quality_counts for every evaluated quality", () => {
    const report = buildProducerStrategyReplayDiagnosticsReport({
        replayReport: {
            sample_count: 1,
            evaluated_qualities: ["w", "g", "b", "p", "o", "r"],
            samples: [
                {
                    id: "villa_full_quality_case",
                    map_id: "villa",
                    baseline: {
                        quality_counts: {
                            b: { actual_count: 11, actual_prob: 0.5, rank: 1, mean_count: 11.05, abs_error: 0.05 },
                            p: { actual_count: 6, actual_prob: 0.4, rank: 1, mean_count: 6.1, abs_error: 0.1 }
                        }
                    },
                    candidate: {
                        quality_counts: {
                            b: { actual_count: 11, actual_prob: 0.12, rank: 4, mean_count: 9.2, abs_error: 1.8 },
                            p: { actual_count: 6, actual_prob: 0.44, rank: 1, mean_count: 6.05, abs_error: 0.05 }
                        }
                    }
                }
            ]
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.equal(report.summary.evaluated_quality_count, 2);
    assert.equal(report.summary.degraded_count, 1);
    assert.equal(report.summary.improved_count, 1);
    assert.equal(report.maps.villa.quality_summary.b.classification, "degraded");
    assert.equal(report.maps.villa.quality_summary.b.candidate_direction, "underpredicts_count");
    assert.equal(report.maps.villa.quality_summary.p.classification, "improved");
});

test("buildProducerStrategyReplayDiagnosticsReport preserves replay guard skipped maps as blockers", () => {
    const report = buildProducerStrategyReplayDiagnosticsReport({
        replayReport: {
            sample_count: 1,
            candidate_config_context: {
                applied_maps: [],
                skipped_maps: ["villa"],
                skipped_map_reasons: {
                    villa: ["candidate_replay_regressed_baseline"]
                },
                replay_guard: "skip_candidate_replay_passed_false"
            },
            samples: [
                {
                    id: "villa_case",
                    map_id: "villa",
                    baseline: {
                        orange: { actual_count: 1, actual_prob: 1, rank: 1, mean_count: 1, abs_error: 0 }
                    },
                    candidate: {
                        orange: { actual_count: 1, actual_prob: 1, rank: 1, mean_count: 1, abs_error: 0 }
                    }
                }
            ]
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.equal(report.maps.villa.candidate_config_status.status, "skipped");
    assert.deepEqual(report.maps.villa.candidate_config_status.reasons, ["candidate_replay_regressed_baseline"]);
    assert.deepEqual(report.summary.maps_skipped_by_replay_guard, ["villa"]);
    assert.ok(report.global_blockers.includes("candidate_config_skipped_regressed_baseline"));
});
