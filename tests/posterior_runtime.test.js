const assert = require("node:assert/strict");
const test = require("node:test");

const {
    normalizePosteriorMass,
    summarizePosteriorMass,
    accumulatePosteriorMass,
    summarizePosteriorMassMap,
    normalizeLabeledWeights,
    getAllowedTotalMassProbability
} = require("../src/core/posterior_runtime.js");

test("posterior mass normalizes weighted counts and keeps array shape", () => {
    assert.deepEqual(normalizePosteriorMass([1, 2], [1, 3]), [
        { count: 1, prob: 0.25 },
        { count: 2, prob: 0.75 }
    ]);
});

test("posterior summary exposes mean and p10/p90 cells", () => {
    assert.deepEqual(
        summarizePosteriorMass([
            { count: 1, prob: 0.25 },
            { count: 2, prob: 0.75 }
        ]),
        { mean_cells: 1.75, p10_cells: 1, p90_cells: 2 }
    );
});

test("posterior map accumulation preserves state-weighted cell mass", () => {
    const targetMap = {};
    accumulatePosteriorMass(targetMap, [
        { count: 3, prob: 0.2 },
        { count: 4, prob: 0.8 }
    ], 0.5);

    assert.deepEqual(targetMap, { 3: 0.1, 4: 0.4 });
    const summary = summarizePosteriorMassMap(targetMap);
    assert.equal(Math.round(summary.mean_cells * 10) / 10, 3.8);
    assert.equal(summary.p10_cells, 3);
    assert.equal(summary.p90_cells, 4);
});

test("labeled weights normalize and total-cell probability convolves independent masses", () => {
    assert.deepEqual(normalizeLabeledWeights([
        { id: "a", weight: 2 },
        { id: "b", weight: 6 }
    ]), [
        { id: "a", weight: 2, prob: 0.25 },
        { id: "b", weight: 6, prob: 0.75 }
    ]);

    assert.equal(getAllowedTotalMassProbability([
        [{ count: 1, prob: 0.5 }, { count: 2, prob: 0.5 }],
        [{ count: 3, prob: 0.25 }, { count: 4, prob: 0.75 }]
    ], [5]), 0.5);
});
