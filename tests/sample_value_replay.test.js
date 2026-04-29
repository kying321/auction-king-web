const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildSettlementValueReplayReport,
    resolveReplaySampleActualLootValue,
    predictSettlementItemValue
} = require("../src/research/sample_value_replay.js");
const { createBattleSampleRecord } = require("../src/core/source_data_runtime.js");
const { resolveEstimatorConfig } = require("../src/core/estimator.js");

test("resolveReplaySampleActualLootValue prefers loot_value and falls back to summed items", () => {
    assert.equal(
        resolveReplaySampleActualLootValue({
            loot_value: 12345,
            items: [{ value: 1 }, { value: 2 }]
        }),
        12345
    );
    assert.equal(
        resolveReplaySampleActualLootValue({
            loot_value: null,
            items: [{ value: 100 }, { value: 200 }]
        }),
        300
    );
});

test("predictSettlementItemValue uses base item and per-cell means for a quality item", () => {
    assert.equal(
        predictSettlementItemValue(
            { base_item_mean: 1000, per_cell_mean: 250 },
            { cells: 4 }
        ),
        2000
    );
});

test("buildSettlementValueReplayReport compares baseline and overlay against sample loot values", () => {
    const overlay = {
        model: {
            value_model: {
                ...defaultConfig.model.value_model,
                o: {
                    ...defaultConfig.model.value_model.o,
                    base_item_mean: 57315,
                    base_item_sd: 29002
                },
                r: {
                    ...defaultConfig.model.value_model.r,
                    base_item_mean: 889000,
                    base_item_sd: 2521829,
                    per_cell_mean: 30000,
                    per_cell_sd: 0
                }
            }
        },
        maps: {
            sunken_ship: {
                value_model: {
                    ...defaultConfig.maps.sunken_ship.value_model,
                    o: {
                        ...defaultConfig.maps.sunken_ship.value_model.o,
                        base_item_mean: 57315,
                        base_item_sd: 29002
                    },
                    r: {
                        ...defaultConfig.maps.sunken_ship.value_model.r,
                        base_item_mean: 889000,
                        base_item_sd: 2521829,
                        per_cell_mean: 30000,
                        per_cell_sd: 0
                    }
                }
            }
        }
    };

    const report = buildSettlementValueReplayReport([
        {
            id: "sample_orange",
            map_id: "sunken_ship",
            loot_value: 70000,
            items: [
                { quality: "o", category: "tech", cells: 2.95, value: 70000 }
            ]
        },
        {
            id: "sample_red",
            map_id: "sunken_ship",
            loot_value: 1000000,
            items: [
                { quality: "r", category: "relic", cells: 3.7, value: 1000000 }
            ]
        }
    ], defaultConfig, overlay);

    assert.equal(report.sample_count, 2);
    assert.equal(report.samples.length, 2);
    assert.ok(report.metrics.overlay.mae < report.metrics.baseline.mae);
    assert.ok(report.metrics.overlay.mean_abs_pct_error < report.metrics.baseline.mean_abs_pct_error);
    const baselineValueModel = resolveEstimatorConfig(defaultConfig, "sunken_ship").value_model;
    assert.equal(
        report.samples[0].baseline.predicted_loot_value,
        predictSettlementItemValue(baselineValueModel.o, { cells: 2.95 })
    );
    assert.equal(report.samples[0].overlay.predicted_loot_value, 70000);
    assert.equal(
        report.samples[1].baseline.predicted_loot_value,
        predictSettlementItemValue(baselineValueModel.r, { cells: 3.7 })
    );
    assert.equal(report.samples[1].overlay.predicted_loot_value, 1000000);
});

test("buildSettlementValueReplayReport accepts unified battle_sample records with shared item metadata", () => {
    const report = buildSettlementValueReplayReport([
        createBattleSampleRecord({
            id: "sample_purple",
            map_id: "villa",
            actual_value: 35293,
            items: [
                { name: "限定真人展示牌", quality: "p", category: "trendy", cells: 6, value: 35293 }
            ]
        })
    ], defaultConfig, defaultConfig);

    assert.equal(report.sample_count, 1);
    assert.equal(report.samples[0].map_id, "villa");
    assert.equal(report.samples[0].actual_loot_value, 35293);
    assert.equal(report.samples[0].item_reports[0].quality, "p");
});

test("buildSettlementValueReplayReport resolves bundled authority calibration before baseline valuation", () => {
    const report = buildSettlementValueReplayReport([
        createBattleSampleRecord({
            id: "authority_orange",
            map_id: "sunken_ship",
            actual_value: 59010,
            items: [
                { quality: "o", category: "tech", cells: 2.95, value: 59010 }
            ]
        })
    ], defaultConfig, defaultConfig);

    assert.equal(report.sample_count, 1);
    const bundledValueModel = resolveEstimatorConfig(defaultConfig, "sunken_ship").value_model;
    const expectedPrediction = predictSettlementItemValue(bundledValueModel.o, { cells: 2.95 });
    assert.equal(report.samples[0].baseline.predicted_loot_value, expectedPrediction);
    assert.equal(report.samples[0].overlay.predicted_loot_value, expectedPrediction);
});

test("buildSettlementValueReplayReport surfaces system average hints as replay diagnostics", () => {
    const report = buildSettlementValueReplayReport([
        createBattleSampleRecord({
            id: "system_hint_case",
            map_id: "sunken_ship",
            observed_state: {
                system_avg_value_type_count: 2,
                system_avg_value_per_cell: 123.45
            },
            actual_value: 1000,
            actual_cells: 10,
            items: [
                { quality: "p", category: "trendy", cells: 10, value: 1000 }
            ]
        })
    ], defaultConfig, defaultConfig);

    assert.equal(report.metrics.system_hint_actual_cell_anchor.hint_sample_count, 1);
    assert.equal(report.metrics.system_hint_actual_cell_anchor.scored_sample_count, 1);
    assert.equal(report.metrics.system_hint_actual_cell_anchor.mae, 234.5);
    assert.deepEqual(report.samples[0].system_hint, {
        system_avg_value_per_cell: 123.45,
        system_avg_value_type_count: 2,
        actual_cells: 10,
        actual_cells_source: "sample_actual_cells",
        predicted_loot_value: 1234.5,
        actual_loot_value: 1000,
        error: 234.5
    });
});
