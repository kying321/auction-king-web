function clampPositiveInteger(value) {
    return Number.isInteger(value) && value > 0 ? value : null;
}

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
        const next = x % y;
        x = y;
        y = next;
    }
    return x || 1;
}

function normalizeObservedAverageText(rawText) {
    if (typeof rawText !== "string") return null;
    const trimmed = rawText.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("-.")) return `-0${trimmed.slice(1)}`;
    if (trimmed.startsWith(".")) return `0${trimmed}`;
    return trimmed;
}

function getExactDecimalPlaces(totalCells, count) {
    const remainder = Math.abs(totalCells % count);
    if (remainder === 0) return 0;
    const reducedDivisor = count / gcd(remainder, count);
    let denom = reducedDivisor;
    let twos = 0;
    let fives = 0;
    while (denom % 2 === 0) {
        denom /= 2;
        twos += 1;
    }
    while (denom % 5 === 0) {
        denom /= 5;
        fives += 1;
    }
    if (denom !== 1) return Infinity;
    return Math.max(twos, fives);
}

function buildDivisionDigits(remainder, count, precision) {
    const digits = [];
    let rem = remainder;
    for (let index = 0; index < precision; index += 1) {
        rem *= 10;
        digits.push(Math.floor(rem / count));
        rem %= count;
    }
    return digits;
}

function formatAverageDisplayFromTotalCells({ totalCells, count, precision = 2 } = {}) {
    if (!Number.isInteger(totalCells) || !Number.isInteger(count) || count <= 0) return null;
    const negative = totalCells < 0;
    const absTotal = Math.abs(totalCells);
    const integerPart = Math.floor(absTotal / count);
    const remainder = absTotal % count;
    if (remainder === 0) return `${negative ? "-" : ""}${integerPart}`;
    const exactPlaces = getExactDecimalPlaces(absTotal, count);
    const displayPlaces = exactPlaces <= precision ? exactPlaces : precision;
    const digits = buildDivisionDigits(remainder, count, displayPlaces);
    return `${negative ? "-" : ""}${integerPart}.${digits.join("")}`;
}

function normalizeWeightEntries(entries) {
    const filtered = entries.filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
    const total = filtered.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) return [];
    return filtered
        .map((entry) => ({ ...entry, prob: entry.weight / total }))
        .sort((a, b) => b.prob - a.prob || a.count - b.count);
}

function getAverageInterval(avg, count, { precision = 2, roundingMode = "truncate" } = {}) {
    if (!Number.isFinite(avg) || !Number.isInteger(count) || count <= 0) return null;
    const step = 10 ** (-precision);
    if (roundingMode === "round") {
        const half = step / 2;
        const low = Math.ceil((avg - half) * count - 1e-12);
        const high = Math.floor((avg + half) * count - 1e-12);
        return low > high ? null : { low, high };
    }
    const low = Math.ceil(avg * count - 1e-12);
    const high = Math.floor((avg + step) * count - 1e-12);
    return low > high ? null : { low, high };
}

function buildRelaxedAverageSupport({
    avg,
    count,
    minTotal,
    maxTotal,
    precision = 2,
    fallbackSlackCells = 0,
    fallbackMinAvg = 1.0
}) {
    if (!Number.isFinite(avg) || !Number.isInteger(count) || count <= 0) return [];
    if (!Number.isFinite(fallbackSlackCells) || fallbackSlackCells <= 0) return [];
    if (Math.abs(avg) < Math.max(0, fallbackMinAvg || 0)) return [];

    const step = 10 ** (-precision);
    const low = Math.max(minTotal, Math.ceil(avg * count - fallbackSlackCells - 1e-12));
    const high = Math.min(maxTotal, Math.floor((avg + step) * count + fallbackSlackCells - 1e-12));
    if (low > high) return [];
    return Array.from({ length: high - low + 1 }, (_unused, offset) => low + offset);
}

function getMatchingTotalCells({
    avg,
    avgText = null,
    count,
    minTotal,
    maxTotal,
    precision = 2,
    roundingMode = "truncate",
    relaxSparseSupport = false,
    sparseSupportThreshold = 0,
    fallbackSlackCells = 0,
    fallbackMinAvg = 1.0
}) {
    if (!Number.isInteger(count) || count <= 0) return [];
    const normalizedText = normalizeObservedAverageText(avgText);
    let support = [];
    if (!normalizedText || roundingMode !== "truncate") {
        const interval = getAverageInterval(avg, count, { precision, roundingMode });
        if (interval) {
            const low = Math.max(interval.low, minTotal);
            const high = Math.min(interval.high, maxTotal);
            if (low <= high) {
                support = Array.from({ length: high - low + 1 }, (_unused, offset) => low + offset);
            }
        }
    } else {
        for (let totalCells = minTotal; totalCells <= maxTotal; totalCells += 1) {
            if (formatAverageDisplayFromTotalCells({ totalCells, count, precision }) === normalizedText) {
                support.push(totalCells);
            }
        }
    }

    if (!relaxSparseSupport) return support;
    if (support.length === 0) return support;
    const threshold = Number.isInteger(sparseSupportThreshold) && sparseSupportThreshold >= 0
        ? sparseSupportThreshold
        : 0;
    if (support.length > threshold) return support;

    const relaxedSupport = buildRelaxedAverageSupport({
        avg,
        count,
        minTotal,
        maxTotal,
        precision,
        fallbackSlackCells,
        fallbackMinAvg
    });
    if (relaxedSupport.length === 0) return support;

    const merged = Array.from(new Set(support.concat(relaxedSupport)));
    merged.sort((a, b) => a - b);
    return merged;
}

function buildCountPosteriorFromAverage({
    avg,
    avgText = null,
    maxCount,
    minCellsPerItem,
    maxCellsPerItem,
    priorCounts = null,
    precision = 2,
    roundingMode = "truncate",
    relaxSparseSupport = false,
    sparseSupportThreshold = 0,
    fallbackSlackCells = 0,
    fallbackMinAvg = 1.0
}) {
    const limit = clampPositiveInteger(maxCount);
    if (!limit) return [];

    const entries = [];
    for (let count = 1; count <= limit; count += 1) {
        const minTotal = minCellsPerItem * count;
        const maxTotal = maxCellsPerItem * count;
        const matchingTotals = getMatchingTotalCells({
            avg,
            avgText,
            count,
            minTotal,
            maxTotal,
            precision,
            roundingMode,
            relaxSparseSupport,
            sparseSupportThreshold,
            fallbackSlackCells,
            fallbackMinAvg
        });
        if (matchingTotals.length === 0) continue;
        const low = matchingTotals[0];
        const high = matchingTotals[matchingTotals.length - 1];
        const priorWeight = Array.isArray(priorCounts) && Number.isFinite(priorCounts[count]) ? Math.max(priorCounts[count], 0) : 1;
        entries.push({
            count,
            feasibleLow: low,
            feasibleHigh: high,
            weight: priorWeight * matchingTotals.length
        });
    }
    return normalizeWeightEntries(entries);
}

function buildTotalCellPosteriorFromAverage({
    avg,
    avgText = null,
    count,
    minCellsPerItem,
    maxCellsPerItem,
    precision = 2,
    roundingMode = "truncate",
    relaxSparseSupport = false,
    sparseSupportThreshold = 0,
    fallbackSlackCells = 0,
    fallbackMinAvg = 1.0
}) {
    if (!Number.isInteger(count) || count <= 0) return [];
    const matchingTotals = getMatchingTotalCells({
        avg,
        avgText,
        count,
        minTotal: minCellsPerItem * count,
        maxTotal: maxCellsPerItem * count,
        precision,
        roundingMode,
        relaxSparseSupport,
        sparseSupportThreshold,
        fallbackSlackCells,
        fallbackMinAvg
    });
    if (matchingTotals.length === 0) return [];
    const entries = [];
    for (const totalCells of matchingTotals) {
        entries.push({ count: totalCells, weight: 1 });
    }
    return normalizeWeightEntries(entries);
}

function buildMixedTotalCellPosteriorFromAverage(options) {
    const countPosterior = buildCountPosteriorFromAverage(options);
    const totalCellMap = new Map();
    countPosterior.forEach((countEntry) => {
        const totalPosterior = buildTotalCellPosteriorFromAverage({
            avg: options.avg,
            avgText: options.avgText,
            count: countEntry.count,
            minCellsPerItem: options.minCellsPerItem,
            maxCellsPerItem: options.maxCellsPerItem,
            precision: options.precision,
            roundingMode: options.roundingMode,
            relaxSparseSupport: options.relaxSparseSupport,
            sparseSupportThreshold: options.sparseSupportThreshold,
            fallbackSlackCells: options.fallbackSlackCells,
            fallbackMinAvg: options.fallbackMinAvg
        });
        totalPosterior.forEach((cellEntry) => {
            totalCellMap.set(
                cellEntry.count,
                (totalCellMap.get(cellEntry.count) || 0) + cellEntry.prob * countEntry.prob
            );
        });
    });
    return normalizeWeightEntries(
        Array.from(totalCellMap.entries()).map(([count, weight]) => ({ count, weight }))
    );
}

function summarizeProbabilityDistribution(distribution) {
    if (!distribution || distribution.length === 0) {
        return { supportSize: 0, topCount: null, topProb: 0 };
    }
    return {
        supportSize: distribution.length,
        topCount: distribution[0].count,
        topProb: distribution[0].prob
    };
}

function getDistributionConfidence(distribution) {
    const top1 = distribution && distribution[0] ? distribution[0].prob : 0;
    const top2 = distribution && distribution[1] ? distribution[1].prob : 0;
    const denom = top1 + top2;
    return {
        top1,
        top2,
        confidence: denom > 0 ? top1 / denom : 0
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        getAverageInterval,
        formatAverageDisplayFromTotalCells,
        buildCountPosteriorFromAverage,
        buildTotalCellPosteriorFromAverage,
        buildMixedTotalCellPosteriorFromAverage,
        summarizeProbabilityDistribution,
        getDistributionConfidence
    };
}

if (typeof window !== "undefined") {
    window.getAverageInterval = getAverageInterval;
    window.formatAverageDisplayFromTotalCells = formatAverageDisplayFromTotalCells;
    window.buildCountPosteriorFromAverage = buildCountPosteriorFromAverage;
    window.buildTotalCellPosteriorFromAverage = buildTotalCellPosteriorFromAverage;
    window.buildMixedTotalCellPosteriorFromAverage = buildMixedTotalCellPosteriorFromAverage;
    window.summarizeProbabilityDistribution = summarizeProbabilityDistribution;
    window.getDistributionConfidence = getDistributionConfidence;
}
