const assert = require("node:assert/strict");
const test = require("node:test");

const defaultConfig = require("../src/core/default_config_bundle.js");
const { AuctionKingEstimator, resolveEstimatorConfig } = require("../src/core/estimator.js");
const { enumerateCountStates } = require("../src/core/count_constraint_runtime.js");

test("count constraint runtime matches estimator count enumeration", () => {
    const config = resolveEstimatorConfig(defaultConfig, defaultConfig.app.default_map_id);
    const state = {
        r1_total_items: 20,
        r1_blue_count: 3,
        r2_purple_count: 2,
        r2_orange_count: 1,
        r3_green_count: null,
        r5_white_green_total: null,
        r5_white_count: null,
        r2_orange_avg: null,
        r3_purple_avg: null,
        r4_blue_avg: null,
        custom_o_min: null,
        custom_o_max: null,
        custom_r_min: null,
        custom_r_max: null
    };
    const estimator = new AuctionKingEstimator(config, state);
    const solverBudget = { max_states: 100000 };

    assert.deepEqual(
        enumerateCountStates(estimator.config, estimator.state, solverBudget),
        estimator.enumerateCountStates(solverBudget)
    );
});

test("count constraint runtime preserves average text and custom orange red bounds", () => {
    const config = resolveEstimatorConfig(defaultConfig, defaultConfig.app.default_map_id);
    const state = {
        r1_total_items: 18,
        r1_blue_count: 3,
        r2_purple_count: null,
        r2_orange_count: null,
        r3_green_count: 4,
        r5_white_green_total: null,
        r5_white_count: null,
        r2_orange_avg: 1.3,
        r2_orange_avg_text: "1.30",
        r3_purple_avg: null,
        r4_blue_avg: null,
        custom_o_min: 2,
        custom_o_max: 5,
        custom_r_min: 1,
        custom_r_max: 4
    };
    const estimator = new AuctionKingEstimator(config, state);
    const solverBudget = { max_states: 100000 };

    assert.deepEqual(
        enumerateCountStates(estimator.config, estimator.state, solverBudget),
        estimator.enumerateCountStates(solverBudget)
    );
});
