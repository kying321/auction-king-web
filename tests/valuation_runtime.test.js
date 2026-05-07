const assert = require("node:assert/strict");
const test = require("node:test");

const {
    getQualityValueOverrideTarget,
    scaleValueModelToTargetItemValue,
    clampProbability,
    runValuationMonteCarlo
} = require("../src/core/valuation_runtime.js");

test("value override target reads w-unit quality overrides as absolute value", () => {
    assert.equal(getQualityValueOverrideTarget({ custom_p_value_w: 0.3 }, "p"), 3000);
    assert.equal(getQualityValueOverrideTarget({ custom_o_value_w: 1.25 }, "o"), 12500);
    assert.equal(getQualityValueOverrideTarget({ custom_r_value_w: -1 }, "r"), 0);
    assert.equal(getQualityValueOverrideTarget({ custom_b_value_w: 1 }, "b"), null);
});

test("value override scaling preserves the requested per-item target", () => {
    const scaled = scaleValueModelToTargetItemValue(
        { base_item_mean: 1000, base_item_sd: 10, per_cell_mean: 250, per_cell_sd: 5 },
        3000,
        2,
        1
    );

    assert.deepEqual(scaled, {
        base_item_mean: 2000,
        base_item_sd: 20,
        per_cell_mean: 500,
        per_cell_sd: 10
    });
});

test("value override scaling falls back to target base value when reference value is zero", () => {
    assert.deepEqual(
        scaleValueModelToTargetItemValue(
            { base_item_mean: 0, base_item_sd: 10, per_cell_mean: 0, per_cell_sd: 5 },
            4000,
            8,
            2
        ),
        {
            base_item_mean: 4000,
            base_item_sd: 0,
            per_cell_mean: 0,
            per_cell_sd: 0
        }
    );
});

test("probability clamp rejects invalid values and bounds finite values", () => {
    assert.equal(clampProbability(-0.25), 0);
    assert.equal(clampProbability(0.25), 0.25);
    assert.equal(clampProbability(1.25), 1);
    assert.equal(clampProbability("not numeric"), 0);
});

test("valuation runtime supports deterministic valuation with override and bid metrics", () => {
    const zeroPosterior = {
        mean_cells: 0,
        p10_cells: 0,
        p90_cells: 0,
        mass: [{ count: 0, prob: 1 }]
    };
    const purplePosterior = {
        mean_cells: 2,
        p10_cells: 2,
        p90_cells: 2,
        mass: [{ count: 2, prob: 1 }]
    };
    const weighted = [{
        p: 1,
        cand: {
            counts: { w: 0, g: 0, b: 0, p: 1, o: 0, r: 0 },
            color_grids: {
                w: zeroPosterior,
                g: zeroPosterior,
                b: zeroPosterior,
                p: purplePosterior,
                o: zeroPosterior,
                r: zeroPosterior
            }
        }
    }];
    const config = {
        solver: { mc_samples: 1 },
        value_model: {
            w: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
            g: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
            b: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
            p: { base_item_mean: 1000, base_item_sd: 0, per_cell_mean: 250, per_cell_sd: 0 },
            o: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
            r: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 }
        }
    };

    const valuation = runValuationMonteCarlo({
        config,
        state: { custom_p_value_w: 0.3, bid_price: 2500 },
        weighted,
        inferRedFamilyJointPosterior: () => [],
        quantileFromSorted: (values) => values[0],
        random: () => 0.5
    });

    assert.equal(valuation.mean_value, 3000);
    assert.equal(valuation.q50, 3000);
    assert.equal(valuation.bid_price, 2500);
    assert.equal(valuation.expected_profit, 500);
    assert.equal(valuation.profit_prob, 1);
    assert.equal(valuation.loss_prob, 0);
});
