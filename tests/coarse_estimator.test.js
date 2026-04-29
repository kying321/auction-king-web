const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveEstimatorConfig } = require("../src/core/estimator.js");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { buildCoarseEngineResult } = require("../src/core/coarse_estimator.js");

test("buildCoarseEngineResult produces map-prior rough posterior before full solve", () => {
    const resolvedConfig = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    const stateVars = {
        r1_total_items: 34,
        r1_blue_count: 10,
        r2_orange_avg: null,
        r2_purple_count: null,
        r3_green_count: 7,
        r3_purple_avg: null,
        r4_blue_avg: null,
        r5_white_green_total: 11,
        r5_white_count: null,
        bid_price: 18800
    };

    const result = buildCoarseEngineResult(resolvedConfig, stateVars);

    assert.equal(result.error, false, JSON.stringify(result));
    assert.equal(result.mode, "coarse");
    assert.equal(result.summary.count_means.b, 10);
    assert.equal(result.summary.count_means.g, 7);
    assert.equal(result.summary.count_means.w, 4);
    assert.ok(result.summary.orange_count_probs.length > 0);
    assert.ok(result.summary.red_count_probs.length > 0);
    assert.deepEqual(result.summary.family_probs, []);
    assert.ok(result.valuation.mean_value > 0);
});

test("buildCoarseEngineResult keeps unbounded catalog cell max from collapsing coarse grid ranges", () => {
    const resolvedConfig = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    assert.equal(resolvedConfig.cells_per_item.o.max, null);

    const result = buildCoarseEngineResult(resolvedConfig, {
        r1_total_items: 18,
        r1_blue_count: null,
        r2_orange_avg: null,
        r2_purple_count: null,
        r3_green_count: null,
        r3_purple_avg: null,
        r4_blue_avg: null,
        r5_white_green_total: null,
        r5_white_count: null,
        bid_price: null
    });

    assert.equal(result.error, false, JSON.stringify(result));
    assert.ok(result.summary.cell_high.o > result.summary.cell_low.o, JSON.stringify(result.summary.cell_high));
    assert.ok(result.summary.cell_high.o >= 13, JSON.stringify(result.summary.cell_high));
    assert.ok(result.summary.cell_high.r >= 13, JSON.stringify(result.summary.cell_high));
});

test("buildCoarseEngineResult reports contradiction when fixed counts exceed total", () => {
    const resolvedConfig = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    const stateVars = {
        r1_total_items: 10,
        r1_blue_count: 8,
        r2_orange_avg: null,
        r2_purple_count: 4,
        r3_green_count: null,
        r3_purple_avg: null,
        r4_blue_avg: null,
        r5_white_green_total: null,
        r5_white_count: null,
        bid_price: null
    };

    const result = buildCoarseEngineResult(resolvedConfig, stateVars);

    assert.equal(result.error, true);
    assert.match(result.messages.join(" "), /超过总件数|不可行/);
});

test("buildCoarseEngineResult respects custom orange/red count bounds", () => {
    const resolvedConfig = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    const stateVars = {
        r1_total_items: 30,
        r1_blue_count: 10,
        r2_orange_avg: null,
        r2_purple_count: null,
        r3_green_count: 6,
        r3_purple_avg: null,
        r4_blue_avg: null,
        r5_white_green_total: 11,
        r5_white_count: null,
        custom_o_min: 2,
        custom_o_max: 5,
        custom_r_min: 3,
        custom_r_max: 7,
        bid_price: null
    };

    const result = buildCoarseEngineResult(resolvedConfig, stateVars);

    assert.equal(result.error, false, JSON.stringify(result));
    assert.ok(result.summary.orange_count_probs.length > 0);
    assert.ok(result.summary.red_count_probs.length > 0);
    assert.ok(result.summary.orange_count_probs.every((entry) => entry.count >= 2 && entry.count <= 5));
    assert.ok(result.summary.red_count_probs.every((entry) => entry.count >= 3 && entry.count <= 7));
});
