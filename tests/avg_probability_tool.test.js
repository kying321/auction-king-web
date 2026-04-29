const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAverageProbabilityToolResult } = require("../src/core/avg_probability_tool.js");

test("buildAverageProbabilityToolResult returns count and total-cell distributions", () => {
    const result = buildAverageProbabilityToolResult({
        avg: 2.66,
        maxCount: 8,
        minCellsPerItem: 1,
        maxCellsPerItem: 5
    });

    assert.equal(result.error, false, JSON.stringify(result));
    assert.ok(result.countDistribution.length > 0);
    assert.ok(result.totalCellDistribution.length > 0);
    assert.equal(result.summary.topCount, 3);
    assert.ok(result.confidence.top1 > 0);
});

test("buildAverageProbabilityToolResult keeps 0.3 and 0.30 on different feasible count branches", () => {
    const compact = buildAverageProbabilityToolResult({
        avg: 1.3,
        avgText: "1.3",
        maxCount: 30,
        minCellsPerItem: 1,
        maxCellsPerItem: 30
    });
    const fixed = buildAverageProbabilityToolResult({
        avg: 1.3,
        avgText: "1.30",
        maxCount: 30,
        minCellsPerItem: 1,
        maxCellsPerItem: 30
    });

    assert.deepEqual(compact.countDistribution.map((entry) => entry.count), [10, 20, 30]);
    assert.deepEqual(fixed.countDistribution.map((entry) => entry.count), [13, 23, 26]);
});

test("buildAverageProbabilityToolResult rejects invalid count bounds", () => {
    const result = buildAverageProbabilityToolResult({
        avg: 2.66,
        maxCount: 0,
        minCellsPerItem: 1,
        maxCellsPerItem: 5
    });

    assert.equal(result.error, true);
    assert.match(result.messages.join(" "), /maxCount/);
});
