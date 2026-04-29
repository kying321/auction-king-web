const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getAverageInterval,
    buildCountPosteriorFromAverage,
    buildMixedTotalCellPosteriorFromAverage,
    formatAverageDisplayFromTotalCells,
    summarizeProbabilityDistribution,
    getDistributionConfidence
} = require("../src/core/avg_probability_core.js");

test("getAverageInterval uses truncate-two-decimal semantics by default", () => {
    assert.deepEqual(getAverageInterval(2.66, 3), { low: 8, high: 8 });
    assert.deepEqual(getAverageInterval(2.14, 7), { low: 15, high: 15 });
});

test("buildCountPosteriorFromAverage keeps only feasible count candidates", () => {
    const posterior = buildCountPosteriorFromAverage({
        avg: 2.66,
        maxCount: 8,
        minCellsPerItem: 1,
        maxCellsPerItem: 5
    });

    const counts = posterior.map((entry) => entry.count);
    assert.ok(counts.includes(3));
    assert.ok(!counts.includes(1));
    assert.ok(!counts.includes(2));
});

test("formatAverageDisplayFromTotalCells distinguishes 0.3 from 0.30 game display semantics", () => {
    assert.equal(formatAverageDisplayFromTotalCells({ totalCells: 3, count: 10 }), "0.3");
    assert.equal(formatAverageDisplayFromTotalCells({ totalCells: 4, count: 13 }), "0.30");
    assert.equal(formatAverageDisplayFromTotalCells({ totalCells: 8, count: 3 }), "2.66");
});

test("buildCountPosteriorFromAverage respects raw display text when trailing zeros carry information", () => {
    const compactPosterior = buildCountPosteriorFromAverage({
        avg: 0.3,
        avgText: "0.3",
        maxCount: 30,
        minCellsPerItem: 0,
        maxCellsPerItem: 30
    });
    const fixedPosterior = buildCountPosteriorFromAverage({
        avg: 0.3,
        avgText: "0.30",
        maxCount: 30,
        minCellsPerItem: 0,
        maxCellsPerItem: 30
    });

    const compactCounts = compactPosterior.map((entry) => entry.count);
    const fixedCounts = fixedPosterior.map((entry) => entry.count);

    assert.deepEqual(compactCounts, [10, 20, 30]);
    assert.deepEqual(fixedCounts, [13, 23, 26]);
});

test("buildCountPosteriorFromAverage can relax sparse high-average support with fallback slack", () => {
    const strict = buildCountPosteriorFromAverage({
        avg: 4.75,
        avgText: "4.75",
        maxCount: 6,
        minCellsPerItem: 1,
        maxCellsPerItem: 6
    });
    const relaxed = buildCountPosteriorFromAverage({
        avg: 4.75,
        avgText: "4.75",
        maxCount: 6,
        minCellsPerItem: 1,
        maxCellsPerItem: 6,
        relaxSparseSupport: true,
        sparseSupportThreshold: 1,
        fallbackSlackCells: 1,
        fallbackMinAvg: 1
    });

    assert.ok(strict.some((entry) => entry.count === 4));
    assert.ok(!strict.some((entry) => entry.count === 3));
    assert.ok(relaxed.some((entry) => entry.count === 4));
    assert.ok(!relaxed.some((entry) => entry.count === 3));
});

test("buildMixedTotalCellPosteriorFromAverage marginalizes feasible total-cell mass", () => {
    const posterior = buildMixedTotalCellPosteriorFromAverage({
        avg: 2.66,
        maxCount: 6,
        minCellsPerItem: 1,
        maxCellsPerItem: 5
    });

    assert.ok(posterior.length > 0);
    assert.ok(posterior.some((entry) => entry.count === 8));
    const totalProb = posterior.reduce((sum, entry) => sum + entry.prob, 0);
    assert.ok(Math.abs(totalProb - 1) < 1e-9);
});

test("distribution summary exposes top1 and top2 confidence", () => {
    const distribution = [
        { count: 3, prob: 0.6 },
        { count: 4, prob: 0.25 },
        { count: 5, prob: 0.15 }
    ];

    assert.deepEqual(summarizeProbabilityDistribution(distribution), {
        supportSize: 3,
        topCount: 3,
        topProb: 0.6
    });

    assert.deepEqual(getDistributionConfidence(distribution), {
        top1: 0.6,
        top2: 0.25,
        confidence: 0.7058823529411765
    });
});
