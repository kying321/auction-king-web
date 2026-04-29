const avgProbabilityCore =
    typeof require === "function" && typeof module !== "undefined" && module.exports
        ? require("./avg_probability_core.js")
        : {};

const buildCountPosteriorFromAverage =
    avgProbabilityCore.buildCountPosteriorFromAverage ||
    (typeof window !== "undefined" ? window.buildCountPosteriorFromAverage : null);
const buildMixedTotalCellPosteriorFromAverage =
    avgProbabilityCore.buildMixedTotalCellPosteriorFromAverage ||
    (typeof window !== "undefined" ? window.buildMixedTotalCellPosteriorFromAverage : null);
const summarizeProbabilityDistribution =
    avgProbabilityCore.summarizeProbabilityDistribution ||
    (typeof window !== "undefined" ? window.summarizeProbabilityDistribution : null);
const getDistributionConfidence =
    avgProbabilityCore.getDistributionConfidence ||
    (typeof window !== "undefined" ? window.getDistributionConfidence : null);

function buildAverageProbabilityToolResult({
    avg,
    avgText = null,
    maxCount,
    minCellsPerItem,
    maxCellsPerItem,
    precision = 2,
    roundingMode = "truncate"
}) {
    const messages = [];
    if (!Number.isFinite(avg) || avg <= 0) messages.push("avg 必须为正数。");
    if (!Number.isInteger(maxCount) || maxCount <= 0) messages.push("maxCount 必须为正整数。");
    if (!Number.isInteger(minCellsPerItem) || minCellsPerItem <= 0) messages.push("minCellsPerItem 必须为正整数。");
    if (!Number.isInteger(maxCellsPerItem) || maxCellsPerItem < minCellsPerItem) messages.push("maxCellsPerItem 必须不小于 minCellsPerItem。");

    if (messages.length > 0) {
        return { error: true, messages, countDistribution: [], totalCellDistribution: [], summary: null, confidence: null };
    }

    const countDistribution = buildCountPosteriorFromAverage({
        avg,
        avgText,
        maxCount,
        minCellsPerItem,
        maxCellsPerItem,
        precision,
        roundingMode
    });
    const totalCellDistribution = buildMixedTotalCellPosteriorFromAverage({
        avg,
        avgText,
        maxCount,
        minCellsPerItem,
        maxCellsPerItem,
        precision,
        roundingMode
    });

    if (countDistribution.length === 0) {
        return {
            error: true,
            messages: ["当前参数下没有可行的件数/格数分布。"],
            countDistribution,
            totalCellDistribution,
            summary: summarizeProbabilityDistribution(countDistribution),
            confidence: getDistributionConfidence(countDistribution)
        };
    }

    return {
        error: false,
        messages: [],
        countDistribution,
        totalCellDistribution,
        summary: summarizeProbabilityDistribution(countDistribution),
        confidence: getDistributionConfidence(countDistribution)
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        buildAverageProbabilityToolResult
    };
}

if (typeof window !== "undefined") {
    window.buildAverageProbabilityToolResult = buildAverageProbabilityToolResult;
}
