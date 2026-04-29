const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildMapCountPriorCandidateConfig,
    buildMapCountPriorTuningReport
} = require("../src/core/count_prior_tuner.js");

function createVillaBaselineConfig() {
    const config = JSON.parse(JSON.stringify(defaultConfig));
    delete config.calibration;
    config.maps.villa.alpha_counts = {
        w: 6.2,
        g: 5.4,
        b: 3.9,
        p: 2.4,
        o: 1.8,
        r: 1.2
    };
    config.maps.villa.solver = {
        ...(config.maps.villa.solver || {}),
        count_prior_strength: 1
    };
    return config;
}

test("buildMapCountPriorCandidateConfig only overrides the requested map", () => {
    const baselineConfig = createVillaBaselineConfig();
    const next = buildMapCountPriorCandidateConfig(baselineConfig, "villa", {
        alpha_counts: {
            r: 0.12,
            p: 4.2
        },
        solver: {
            count_prior_strength: 8
        }
    });

    assert.equal(next.maps.villa.alpha_counts.r, 0.12);
    assert.equal(next.maps.villa.alpha_counts.p, 4.2);
    assert.equal(next.maps.villa.solver.count_prior_strength, 8);
    assert.deepEqual(next.maps.sunken_ship.alpha_counts, baselineConfig.maps.sunken_ship.alpha_counts);
    assert.deepEqual(next.maps.sunken_ship.solver, baselineConfig.maps.sunken_ship.solver);
    assert.equal(baselineConfig.maps.villa.alpha_counts.r, 1.2);
    assert.equal(baselineConfig.maps.villa.solver.count_prior_strength, 1);
});

test("buildMapCountPriorTuningReport finds a stronger villa sparse-count prior than baseline", () => {
    const baselineConfig = createVillaBaselineConfig();
    const report = buildMapCountPriorTuningReport({
        baselineConfig,
        mapId: "villa",
        samples: [
            {
                id: "villa_sparse_case",
                map_id: "villa",
                observed_state: {
                    r1_total_items: 45,
                    r1_blue_count: 11,
                    r2_orange_avg: 3.33,
                    r2_orange_avg_text: "3.33",
                    r3_purple_avg: 1.8,
                    r3_purple_avg_text: "1.8"
                },
                actual_counts: {
                    o: 3,
                    r: 0
                }
            }
        ],
        searchSpace: {
            alpha_counts: {
                w: [6.2, 8.5],
                g: [5.4, 7.6],
                p: [2.4, 4.2],
                r: [1.2, 0.12]
            },
            solver: {
                count_prior_strength: [1, 8]
            }
        },
        maxRounds: 6
    });

    assert.equal(report.sample_count, 1);
    assert.equal(report.map_id, "villa");
    assert.ok(report.best_candidate.score < report.baseline.score);
    assert.equal(report.best_candidate.config.maps.villa.alpha_counts.r, 0.12);
    assert.equal(report.best_candidate.config.maps.villa.solver.count_prior_strength, 8);
    assert.ok(report.best_candidate.metrics.r.mean_log_loss < report.baseline.metrics.r.mean_log_loss);
    assert.ok(report.best_candidate.metrics.o.mean_log_loss <= report.baseline.metrics.o.mean_log_loss);
    assert.ok(report.steps.length >= 1);
    assert.deepEqual(
        report.best_candidate.config.maps.sunken_ship.alpha_counts,
        baselineConfig.maps.sunken_ship.alpha_counts
    );
});

test("buildMapCountPriorTuningReport marks one-sample tuning as review-only evidence", () => {
    const baselineConfig = createVillaBaselineConfig();
    const report = buildMapCountPriorTuningReport({
        baselineConfig,
        mapId: "villa",
        samples: [
            {
                id: "villa_single_case",
                map_id: "villa",
                observed_state: {
                    r1_total_items: 45,
                    r1_blue_count: 11,
                    r2_orange_avg: 3.33,
                    r2_orange_avg_text: "3.33",
                    r3_purple_avg: 1.8,
                    r3_purple_avg_text: "1.8"
                },
                actual_counts: {
                    o: 3,
                    r: 0
                }
            }
        ],
        searchSpace: {
            alpha_counts: {
                r: [1.2, 0.12]
            },
            solver: {
                count_prior_strength: [1, 8]
            }
        },
        maxRounds: 2
    });

    assert.equal(report.evidence_assessment.status, "insufficient_sample_size");
    assert.equal(report.evidence_assessment.can_adopt_default_weight, false);
    assert.equal(report.evidence_assessment.recommended_change_class, "RESEARCH_ONLY");
    assert.deepEqual(report.evidence_assessment.quality_sample_counts, { o: 1, r: 1 });
    assert.ok(report.evidence_assessment.risk_flags.includes("map_sample_count_below_minimum"));
    assert.ok(report.evidence_assessment.risk_flags.includes("single_sample_coordinate_search_overfit"));
});
