const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { AuctionKingEstimator, resolveEstimatorConfig } = require("../src/core/estimator.js");
const {
    buildSettlementCountReplayReport,
    createSettlementCountReplaySample
} = require("../src/research/sample_count_replay.js");
const { createBattleSampleRecord } = require("../src/core/source_data_runtime.js");

function buildTopPosteriorStats(entries = [], actualCount) {
    const sorted = entries
        .map((entry) => ({ count: entry.count, prob: entry.prob }))
        .sort((left, right) => right.prob - left.prob || left.count - right.count);
    const matchIndex = sorted.findIndex((entry) => entry.count === actualCount);
    const meanCount = entries.reduce((sum, entry) => sum + (entry.count * entry.prob), 0);
    return {
        actual_prob: matchIndex >= 0 ? sorted[matchIndex].prob : 0,
        rank: matchIndex >= 0 ? matchIndex + 1 : null,
        mean_count: meanCount
    };
}

function posteriorMapToEntries(posteriorMap = {}) {
    return Object.entries(posteriorMap || {})
        .map(([count, prob]) => ({ count: parseInt(count, 10), prob }))
        .filter((entry) => Number.isInteger(entry.count) && Number.isFinite(entry.prob));
}

test("buildSettlementCountReplayReport scores actual orange and red counts against estimator posteriors", () => {
    const sample = {
        id: "villa_case",
        map_id: "sunken_ship",
        state: {
            r1_total_items: 36,
            r1_blue_count: 16,
            r2_orange_avg: 1.66,
            r2_orange_avg_text: "1.66",
            r3_green_count: 3,
            r3_purple_avg: 4.75,
            r3_purple_avg_text: "4.75",
            bid_price: 18800
        },
        actual_counts: {
            o: 6,
            r: 10
        }
    };

    const config = resolveEstimatorConfig(defaultConfig, sample.map_id);
    const result = new AuctionKingEstimator(config, sample.state).recompute();
    const expectedOrange = buildTopPosteriorStats(result.summary.orange_count_probs, 6);
    const expectedRed = buildTopPosteriorStats(result.summary.red_count_probs, 10);

    const report = buildSettlementCountReplayReport([sample], defaultConfig);

    assert.equal(report.sample_count, 1);
    assert.equal(report.samples.length, 1);
    assert.equal(report.samples[0].baseline.orange.actual_count, 6);
    assert.equal(report.samples[0].baseline.red.actual_count, 10);
    assert.equal(report.samples[0].baseline.orange.actual_prob, expectedOrange.actual_prob);
    assert.equal(report.samples[0].baseline.orange.rank, expectedOrange.rank);
    assert.equal(report.samples[0].baseline.red.actual_prob, expectedRed.actual_prob);
    assert.equal(report.samples[0].baseline.red.rank, expectedRed.rank);
    assert.equal(report.metrics.baseline.o.sample_count, 1);
    assert.equal(report.metrics.baseline.r.sample_count, 1);
    assert.equal(report.metrics.baseline.o.top3_hit_rate, expectedOrange.rank <= 3 ? 1 : 0);
    assert.equal(report.metrics.baseline.r.top3_hit_rate, expectedRed.rank <= 3 ? 1 : 0);
});

test("buildSettlementCountReplayReport scores every available actual quality count", () => {
    const sample = {
        id: "villa_full_quality_case",
        map_id: "villa",
        state: {
            r1_total_items: 45,
            r1_blue_count: 11,
            r2_orange_avg: 3.33,
            r2_orange_avg_text: "3.33"
        },
        actual_counts: {
            b: 11,
            p: 6,
            o: 3,
            r: 0
        }
    };

    const config = resolveEstimatorConfig(defaultConfig, sample.map_id);
    const result = new AuctionKingEstimator(config, sample.state).recompute();
    const expectedBlue = buildTopPosteriorStats(posteriorMapToEntries(result.summary.count_probs.b), 11);
    const expectedPurple = buildTopPosteriorStats(posteriorMapToEntries(result.summary.count_probs.p), 6);

    const report = buildSettlementCountReplayReport([sample], defaultConfig);

    assert.deepEqual(report.evaluated_qualities, ["w", "g", "b", "p", "o", "r"]);
    assert.equal(report.samples[0].actual_counts.b, 11);
    assert.equal(report.samples[0].baseline.quality_counts.b.actual_count, 11);
    assert.equal(report.samples[0].baseline.quality_counts.b.actual_prob, expectedBlue.actual_prob);
    assert.equal(report.samples[0].baseline.quality_counts.p.actual_count, 6);
    assert.equal(report.samples[0].baseline.quality_counts.p.rank, expectedPurple.rank);
    assert.equal(report.samples[0].baseline.orange, report.samples[0].baseline.quality_counts.o);
    assert.equal(report.samples[0].baseline.red, report.samples[0].baseline.quality_counts.r);
    assert.equal(report.metrics.baseline.b.sample_count, 1);
    assert.equal(report.metrics.baseline.p.sample_count, 1);
    assert.equal(report.metrics.baseline.w.sample_count, 0);
    assert.equal(report.metrics.baseline.g.sample_count, 0);
});

test("createSettlementCountReplaySample is deterministic when replay inputs omit ids and timestamps", () => {
    const payload = {
        map_id: "villa",
        field_values: {
            total_items: 45,
            blue_count: 11
        },
        actual_counts: {
            o: 3,
            r: 0
        }
    };

    const first = createSettlementCountReplaySample(payload);
    const second = createSettlementCountReplaySample(payload);

    assert.equal(first.id, second.id);
    assert.match(first.id, /^count_sample_[a-f0-9]{12}$/);
    assert.equal(first.created_at, null);
    assert.deepEqual(first.state, second.state);
    assert.deepEqual(first.actual_counts, second.actual_counts);
});

test("createSettlementCountReplaySample keeps explicit event timestamps and stabilizes battle sample ids", () => {
    const payload = {
        record_type: "battle_sample",
        map_id: "villa",
        created_at: "2026-04-24T12:00:00.000Z",
        observed_state: {
            r1_total_items: 45
        },
        actual_counts: {
            o: 1,
            r: 0
        }
    };

    const first = createSettlementCountReplaySample(payload);
    const second = createSettlementCountReplaySample(payload);

    assert.equal(first.id, second.id);
    assert.match(first.id, /^battle_sample_[a-f0-9]{12}$/);
    assert.equal(first.created_at, "2026-04-24T12:00:00.000Z");
});

test("buildSettlementCountReplayReport can compare a candidate config that improves the actual orange count probability", () => {
    const sample = {
        id: "orange_sparse_case",
        map_id: "sunken_ship",
        state: {
            r1_total_items: 12
        },
        actual_counts: {
            o: 0
        }
    };

    const candidateConfig = JSON.parse(JSON.stringify(defaultConfig));
    delete candidateConfig.calibration;
    candidateConfig.maps.sunken_ship.alpha_counts = {
        ...candidateConfig.maps.sunken_ship.alpha_counts,
        o: 0.15,
        r: 0.5,
        w: 1.4,
        g: 2.2
    };

    const report = buildSettlementCountReplayReport([sample], defaultConfig, candidateConfig);
    const baselineProb = report.samples[0].baseline.orange.actual_prob;
    const candidateProb = report.samples[0].candidate.orange.actual_prob;

    assert.ok(candidateProb > baselineProb, `expected candidate orange prob to improve, got baseline=${baselineProb}, candidate=${candidateProb}`);
    assert.ok(report.metrics.candidate.o.mean_log_loss < report.metrics.baseline.o.mean_log_loss);
});

test("buildSettlementCountReplayReport preserves candidate config guard context", () => {
    const sample = {
        id: "villa_guard_case",
        map_id: "villa",
        state: {
            r1_total_items: 40
        },
        actual_counts: {
            o: 1
        }
    };
    const candidateConfig = JSON.parse(JSON.stringify(defaultConfig));
    candidateConfig.producer_strategy_candidate = {
        schema_version: "ak_producer_strategy_candidate_config_v1",
        usage: "shadow_replay_only",
        applied_maps: [],
        skipped_maps: ["villa"],
        skipped_map_reasons: {
            villa: ["candidate_replay_regressed_baseline"]
        },
        replay_guard: "skip_candidate_replay_passed_false"
    };

    const report = buildSettlementCountReplayReport([sample], defaultConfig, candidateConfig);

    assert.deepEqual(report.candidate_config_context.skipped_maps, ["villa"]);
    assert.deepEqual(report.candidate_config_context.skipped_map_reasons.villa, ["candidate_replay_regressed_baseline"]);
    assert.equal(report.candidate_config_context.replay_guard, "skip_candidate_replay_passed_false");
});

test("buildSettlementCountReplayReport accepts unified battle_sample records directly", () => {
    const sample = createBattleSampleRecord({
        id: "villa_direct_record",
        map_id: "villa",
        observed_state: {
            r1_total_items: 45,
            r1_blue_count: 11,
            r2_orange_avg: 3.33,
            r2_orange_avg_text: "3.33"
        },
        actual_counts: {
            o: 3,
            r: 0
        },
        actual_value: 364320
    });

    const report = buildSettlementCountReplayReport([sample], defaultConfig);

    assert.equal(report.sample_count, 1);
    assert.equal(report.samples[0].map_id, "villa");
    assert.equal(report.samples[0].baseline.orange.actual_count, 3);
    assert.equal(report.samples[0].baseline.red.actual_count, 0);
});
