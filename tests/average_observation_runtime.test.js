const assert = require("node:assert/strict");
const test = require("node:test");

const {
    normalizeObservedAverageText,
    formatAverageDisplayFromTotalCells,
    getAverageInterval,
    getMatchingAverageTotals,
    hasFeasibleAverageForCount
} = require("../src/core/average_observation_runtime.js");

test("average display preserves compact and fixed width semantics", () => {
    assert.equal(normalizeObservedAverageText(".30"), "0.30");
    assert.equal(formatAverageDisplayFromTotalCells(3, 10, 2), "0.3");
    assert.equal(formatAverageDisplayFromTotalCells(4, 13, 2), "0.30");
});

test("truncate interval keeps 0.3 and 0.30 on different support branches", () => {
    assert.deepEqual(getAverageInterval(0.3, 10, { precision: 1, roundingMode: "truncate" }), [3, 3]);
    assert.deepEqual(getAverageInterval(0.3, 13, { precision: 2, roundingMode: "truncate" }), [4, 4]);
});

test("raw average text filters matching totals by display width", () => {
    const model = { min: 0, max: null };

    assert.deepEqual(
        getMatchingAverageTotals(model, 10, 0.3, { rawText: "0.3", precision: 2 }),
        [3]
    );
    assert.deepEqual(
        getMatchingAverageTotals(model, 13, 0.3, { rawText: "0.3", precision: 2 }),
        []
    );
    assert.deepEqual(
        getMatchingAverageTotals(model, 13, 0.3, { rawText: "0.30", precision: 2 }),
        [4]
    );
});

test("feasible average guard preserves zero-count and impossible-average handling", () => {
    const model = { min: 0, max: 10 };

    assert.equal(hasFeasibleAverageForCount(model, 0, 0), true);
    assert.equal(hasFeasibleAverageForCount(model, 0, 2.66), false);
    assert.equal(hasFeasibleAverageForCount(model, 3, 2.66), true);
    assert.equal(hasFeasibleAverageForCount(model, 3, 99), false);
});
