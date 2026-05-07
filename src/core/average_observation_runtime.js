function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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

function formatAverageDisplayFromTotalCells(totalCells, count, precision = 2) {
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

function getAverageInterval(avg, n, { precision = 2, roundingMode = "truncate" } = {}) {
    if (avg === null || avg === undefined || isNaN(avg)) return null;
    if (n <= 0) return null;
    const step = 10 ** (-precision);
    let lo;
    let hi;
    if (roundingMode === "round") {
        const half = step / 2;
        lo = Math.ceil((avg - half) * n - 1e-12);
        hi = Math.floor((avg + half) * n - 1e-12);
    } else {
        lo = Math.ceil(avg * n - 1e-12);
        hi = Math.floor((avg + step - 1e-12) * n);
    }
    if (lo > hi) return null;
    return [lo, hi];
}

function roundedAvgInterval(avg, n) {
    return getAverageInterval(avg, n, { precision: 2, roundingMode: "truncate" });
}

function buildRelaxedAverageSupport(
    avg,
    n,
    minTotal,
    maxTotal,
    {
        precision = 2,
        fallbackSlackCells = 0,
        fallbackMinAvg = 1.0
    } = {}
) {
    if (!Number.isFinite(avg) || !Number.isInteger(n) || n <= 0) return [];
    if (!Number.isFinite(fallbackSlackCells) || fallbackSlackCells <= 0) return [];
    if (Math.abs(avg) < Math.max(0, fallbackMinAvg || 0)) return [];

    const step = 10 ** (-precision);
    const low = Math.max(minTotal, Math.ceil(avg * n - fallbackSlackCells - 1e-12));
    const high = Math.min(maxTotal, Math.floor((avg + step) * n + fallbackSlackCells - 1e-12));
    if (low > high) return [];
    return Array.from({ length: high - low + 1 }, (_unused, offset) => low + offset);
}

function getCellModelMin(model = {}) {
    const raw = Number(model.min);
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function getCellModelMax(model = {}) {
    if (model.max === null || model.max === undefined || model.max === "") return null;
    const raw = Number(model.max);
    if (!Number.isFinite(raw)) return null;
    return Math.max(getCellModelMin(model), raw);
}

function getCellTotalBounds(
    model,
    n,
    {
        maxTotal = null,
        avg = null,
        precision = 2,
        roundingMode = "truncate",
        fallbackSlackCells = 0,
        unboundedMaxCellsPerItem = 30
    } = {}
) {
    const minTotal = Math.max(0, Math.ceil(getCellModelMin(model) * n));
    const finiteModelMax = getCellModelMax(model);
    if (finiteModelMax !== null) {
        return {
            min: minTotal,
            max: Math.max(minTotal, Math.floor(finiteModelMax * n))
        };
    }

    if (Number.isFinite(maxTotal)) {
        return {
            min: minTotal,
            max: Math.max(minTotal, Math.floor(maxTotal))
        };
    }

    if (Number.isFinite(avg)) {
        const interval = getAverageInterval(avg, n, { precision, roundingMode });
        if (interval) {
            const slack = Number.isFinite(fallbackSlackCells) ? Math.max(0, fallbackSlackCells) : 0;
            return {
                min: minTotal,
                max: Math.max(minTotal, Math.floor(interval[1] + slack))
            };
        }
    }

    const fallbackMax = Number.isFinite(unboundedMaxCellsPerItem) && unboundedMaxCellsPerItem > 0
        ? unboundedMaxCellsPerItem
        : 30;
    return {
        min: minTotal,
        max: Math.max(minTotal, Math.ceil(n * fallbackMax))
    };
}

function getMatchingAverageTotals(
    model,
    n,
    avg,
    {
        rawText = null,
        precision = 2,
        roundingMode = "truncate",
        relaxSparseSupport = false,
        sparseSupportThreshold = 0,
        fallbackSlackCells = 0,
        fallbackMinAvg = 1.0,
        maxTotal = null,
        unboundedMaxCellsPerItem = 30
    } = {}
) {
    if (avg === null || avg === undefined || isNaN(avg)) return null;
    if (!Number.isInteger(n) || n < 0) return [];
    if (n === 0) return Math.abs(avg) < 1e-12 ? [0] : [];

    const bounds = getCellTotalBounds(model, n, {
        maxTotal,
        avg,
        precision,
        roundingMode,
        fallbackSlackCells: relaxSparseSupport ? fallbackSlackCells : 0,
        unboundedMaxCellsPerItem
    });
    const minTotal = bounds.min;
    const maxTotalBound = bounds.max;
    const normalizedText = normalizeObservedAverageText(rawText);
    let support = [];
    const interval = getAverageInterval(avg, n, { precision, roundingMode });

    if (!normalizedText || roundingMode !== "truncate") {
        if (interval) {
            const low = Math.max(interval[0], minTotal);
            const high = Math.min(interval[1], maxTotalBound);
            if (low <= high) {
                support = Array.from({ length: high - low + 1 }, (_unused, offset) => low + offset);
            }
        }
    } else {
        if (!interval) return [];
        const low = Math.max(interval[0], minTotal);
        const high = Math.min(interval[1], maxTotalBound);
        for (let total = low; total <= high; total += 1) {
            if (formatAverageDisplayFromTotalCells(total, n, precision) === normalizedText) {
                support.push(total);
            }
        }
    }

    if (!relaxSparseSupport) return support;
    if (support.length === 0) return support;
    const threshold = Number.isInteger(sparseSupportThreshold) && sparseSupportThreshold >= 0
        ? sparseSupportThreshold
        : 0;
    if (support.length > threshold) return support;

    const relaxedSupport = buildRelaxedAverageSupport(avg, n, minTotal, maxTotalBound, {
        precision,
        fallbackSlackCells,
        fallbackMinAvg
    });
    if (relaxedSupport.length === 0) return support;

    const merged = Array.from(new Set(support.concat(relaxedSupport)));
    merged.sort((a, b) => a - b);
    return merged;
}

function hasFeasibleAverageForCount(model, n, avg, options = {}) {
    if (avg === null || avg === undefined || isNaN(avg)) return true;
    if (!Number.isInteger(n) || n < 0) return false;
    if (n === 0) return Math.abs(avg) < 1e-12;
    return getMatchingAverageTotals(model, n, avg, options).length > 0;
}

function getMatchingAverageTotalsInRange(
    minTotal,
    maxTotal,
    count,
    avg,
    {
        rawText = null,
        precision = 2,
        roundingMode = "truncate"
    } = {}
) {
    if (avg === null || avg === undefined || isNaN(avg)) return null;
    if (!Number.isInteger(count) || count < 0) return [];
    if (count === 0) return Math.abs(avg) < 1e-12 && minTotal <= 0 && maxTotal >= 0 ? [0] : [];

    const low = Math.max(0, Math.min(minTotal, maxTotal));
    const high = Math.max(low, Math.max(minTotal, maxTotal));
    const normalizedText = normalizeObservedAverageText(rawText);

    if (!normalizedText || roundingMode !== "truncate") {
        const interval = getAverageInterval(avg, count, { precision, roundingMode });
        if (!interval) return [];
        const boundedLow = Math.max(low, interval[0]);
        const boundedHigh = Math.min(high, interval[1]);
        if (boundedLow > boundedHigh) return [];
        return Array.from({ length: boundedHigh - boundedLow + 1 }, (_unused, offset) => boundedLow + offset);
    }

    const support = [];
    for (let total = low; total <= high; total += 1) {
        if (formatAverageDisplayFromTotalCells(total, count, precision) === normalizedText) {
            support.push(total);
        }
    }
    return support;
}

function getAverageObservationOptions(config) {
    const solver = config && isPlainObject(config.solver) ? config.solver : {};
    const averageObservation = isPlainObject(solver.average_observation) ? solver.average_observation : {};
    const rawRoundingMode = averageObservation.rounding_mode;
    return {
        roundingMode: rawRoundingMode === "round" ? "round" : "truncate",
        relaxSparseSupport: !!averageObservation.relax_sparse_support,
        sparseSupportThreshold: Number.isInteger(averageObservation.sparse_support_threshold)
            ? Math.max(0, averageObservation.sparse_support_threshold)
            : 0,
        fallbackSlackCells: Number.isFinite(averageObservation.fallback_slack_cells)
            ? Math.max(0, Number(averageObservation.fallback_slack_cells))
            : 0,
        fallbackMinAvg: Number.isFinite(averageObservation.fallback_min_avg)
            ? Math.max(0, Number(averageObservation.fallback_min_avg))
            : 1
    };
}

function resolveAverageRoundingMode(config, state, stateKey) {
    const modeKey = `${stateKey}_rounding_mode`;
    const stateMode = state && state[modeKey];
    if (stateMode === "round" || stateMode === "truncate") return stateMode;
    return getAverageObservationOptions(config).roundingMode;
}

function getAverageObservationOptionsForState(config, state, stateKey) {
    return {
        ...getAverageObservationOptions(config),
        roundingMode: resolveAverageRoundingMode(config, state, stateKey)
    };
}

function getAverageObservationOptionsForQuality(config, state, quality) {
    const stateKeyByQuality = {
        o: "r2_orange_avg",
        p: "r3_purple_avg",
        b: "r4_blue_avg"
    };
    const stateKey = stateKeyByQuality[quality];
    return stateKey
        ? getAverageObservationOptionsForState(config, state, stateKey)
        : getAverageObservationOptions(config);
}

const averageObservationRuntime = {
    gcd,
    normalizeObservedAverageText,
    getExactDecimalPlaces,
    buildDivisionDigits,
    formatAverageDisplayFromTotalCells,
    getAverageInterval,
    roundedAvgInterval,
    buildRelaxedAverageSupport,
    getCellModelMin,
    getCellModelMax,
    getCellTotalBounds,
    getMatchingAverageTotals,
    hasFeasibleAverageForCount,
    getMatchingAverageTotalsInRange,
    getAverageObservationOptions,
    resolveAverageRoundingMode,
    getAverageObservationOptionsForState,
    getAverageObservationOptionsForQuality
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = averageObservationRuntime;
}

if (typeof globalThis !== "undefined") {
    globalThis.AK_AVERAGE_OBSERVATION_RUNTIME = averageObservationRuntime;
}
