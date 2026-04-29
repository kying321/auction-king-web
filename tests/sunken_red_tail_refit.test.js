const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    AuctionKingEstimator,
    resolveEstimatorConfig
} = require("../src/core/estimator.js");
const {
    buildLegacyEstimatorStateFromFieldValues
} = require("../src/browser/workspace_runtime.js");

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function withSeededRandom(seed, fn) {
    const originalRandom = Math.random;
    let state = seed >>> 0;
    Math.random = () => {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 4294967296;
    };
    try {
        return fn();
    } finally {
        Math.random = originalRandom;
    }
}

function solveWithFastMc(fieldValues) {
    const config = cloneValue(defaultConfig);
    config.solver = {
        ...(config.solver || {}),
        mc_samples: 12000
    };
    const resolvedConfig = resolveEstimatorConfig(config, "sunken_ship");
    return withSeededRandom(20260428, () => {
        const estimator = new AuctionKingEstimator(
            resolvedConfig,
            buildLegacyEstimatorStateFromFieldValues(fieldValues, {})
        );
        return estimator.recompute();
    });
}

test("sunken red-tail refit v2 keeps compact red outcomes inside a conservative risk envelope", () => {
    const result = solveWithFastMc({
        total_items: 25,
        blue_count: 9,
        blue_avg_cells: "1.66",
        purple_avg_cells: "3.66",
        orange_avg_cells: "1",
        white_green_total_cells: 12,
        white_green_avg_cells: "1.5"
    });

    assert.equal(result.error, false);
    assert.ok(result.summary.count_means.r >= 0.7);
    assert.ok(result.valuation.mean_value >= 330000);
    assert.ok(result.valuation.mean_value <= 430000);
    assert.ok(result.valuation.q95 >= 950000);
});

test("sunken red-tail refit v2 keeps multi-red cold-chain upside without forcing the mean too high", () => {
    const result = solveWithFastMc({
        total_items: 48,
        blue_count: 11,
        blue_avg_cells: "1.90",
        purple_avg_cells: "2.63",
        orange_avg_cells: "1.87",
        white_green_total_cells: 23,
        white_green_avg_cells: "1.53"
    });

    assert.equal(result.error, false);
    assert.ok(result.summary.count_means.r >= 2.9);
    assert.ok(result.valuation.mean_value >= 1150000);
    assert.ok(result.valuation.mean_value <= 1350000);
    assert.ok(result.valuation.q95 >= 2300000);
});
