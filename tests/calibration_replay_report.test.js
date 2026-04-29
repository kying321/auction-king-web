const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { resolveEstimatorConfig } = require("../src/core/estimator.js");
const { buildCalibrationReplayReport } = require("../src/research/calibration_replay_report.js");

test("buildCalibrationReplayReport combines authority artifact meta with count/value replay comparisons", () => {
    const candidateConfig = JSON.parse(JSON.stringify(defaultConfig));
    delete candidateConfig.calibration;
    candidateConfig.maps.sunken_ship.alpha_counts = {
        ...candidateConfig.maps.sunken_ship.alpha_counts,
        o: 0.15,
        r: 0.5,
        w: 1.4,
        g: 2.2
    };
    candidateConfig.maps.sunken_ship.value_model = {
        ...candidateConfig.maps.sunken_ship.value_model,
        o: {
            ...candidateConfig.maps.sunken_ship.value_model.o,
            base_item_mean: 57315,
            base_item_sd: 29002
        },
        r: {
            ...candidateConfig.maps.sunken_ship.value_model.r,
            base_item_mean: 889000,
            base_item_sd: 2521829,
            per_cell_mean: 30000,
            per_cell_sd: 0
        }
    };

    const report = buildCalibrationReplayReport({
        baselineConfig: defaultConfig,
        candidateConfig,
        samples: [
            {
                id: "orange_sparse_case",
                map_id: "sunken_ship",
                observed_state: {
                    r1_total_items: 12
                },
                actual_counts: {
                    o: 0,
                    r: 0
                },
                actual_value: 70000,
                items: [
                    { quality: "o", category: "tech", cells: 2.95, value: 70000 }
                ]
            },
            {
                id: "red_value_case",
                map_id: "sunken_ship",
                actual_counts: {
                    o: 0,
                    r: 1
                },
                actual_value: 1000000,
                items: [
                    { quality: "r", category: "relic", cells: 3.7, value: 1000000 }
                ]
            }
        ]
    });

    assert.equal(report.artifact_version, defaultConfig.calibration.artifact_version);
    assert.equal(report.sample_count, 2);
    assert.equal(report.maps.sunken_ship.sample_count, 2);
    assert.equal(report.maps.sunken_ship.alpha_counts.baseline.o, defaultConfig.maps.sunken_ship.alpha_counts.o);
    assert.equal(report.maps.sunken_ship.alpha_counts.candidate.o, 0.15);
    assert.equal(
        report.maps.sunken_ship.value_model.baseline.o.base_item_mean,
        resolveEstimatorConfig(defaultConfig, "sunken_ship").value_model.o.base_item_mean
    );
    assert.equal(report.maps.sunken_ship.value_model.candidate.o.base_item_mean, 57315);
    assert.ok(report.count_report.metrics.candidate.o.mean_log_loss < report.count_report.metrics.baseline.o.mean_log_loss);
    assert.ok(report.value_report.metrics.overlay.mae < report.value_report.metrics.baseline.mae);
    assert.equal(report.count_report.samples[0].baseline.orange.actual_count, 0);
    assert.equal(report.count_report.samples[0].candidate.orange.actual_count, 0);
});
