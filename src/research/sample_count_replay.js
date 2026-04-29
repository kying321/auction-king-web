const { AuctionKingEstimator, resolveEstimatorConfig } = require("../core/estimator.js");
const crypto = require("node:crypto");
const { buildLegacyEstimatorStateFromFieldValues } = require("../browser/workspace_runtime.js");
const { createBattleSampleRecord } = require("../core/source_data_runtime.js");
const {
    extractAlphaCountOverrides,
    isStructuredWorkspaceConfig
} = require("../core/calibration_override_runtime.js");

const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const COUNT_POSTERIOR_KEY_MAP = {
    o: "orange_count_probs",
    r: "red_count_probs"
};
const COUNT_POSTERIOR_LEGACY_KEYS = {
    o: "orange",
    r: "red"
};

function roundTo(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function average(numbers = []) {
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map((entry) => stableJsonValue(entry));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map((key) => [key, stableJsonValue(value[key])])
    );
}

function buildStableReplaySampleId(payload = {}, prefix = "count_sample") {
    const canonical = JSON.stringify(stableJsonValue(payload || {}));
    const digest = crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 12);
    return `${prefix}_${digest}`;
}

function getExplicitCreatedAt(payload = {}) {
    if (!payload || payload.created_at === undefined || payload.created_at === null || payload.created_at === "") return null;
    return String(payload.created_at);
}

function normalizeActualCounts(actualCounts = {}) {
    const normalized = {};
    QUALITY_ORDER.forEach((quality) => {
        const numeric = Number(actualCounts[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) normalized[quality] = numeric;
    });
    return normalized;
}

function normalizeReplayState(payload = {}) {
    if (payload && typeof payload.state === "object" && payload.state && !Array.isArray(payload.state)) {
        return cloneValue(payload.state);
    }
    if (payload && typeof payload.field_values === "object" && payload.field_values && !Array.isArray(payload.field_values)) {
        return buildLegacyEstimatorStateFromFieldValues(payload.field_values, payload.field_value_meta);
    }
    return {};
}

function createSettlementCountReplaySample(payload = {}) {
    if (payload && (payload.record_type === "battle_sample" || payload.observed_state)) {
        const stableId = payload.id || buildStableReplaySampleId(payload, "battle_sample");
        const record = createBattleSampleRecord({
            ...payload,
            id: stableId
        });
        return {
            id: record.id,
            created_at: getExplicitCreatedAt(payload),
            map_id: record.map_id,
            state: cloneValue(record.observed_state),
            actual_counts: normalizeActualCounts(record.actual_counts),
            source_kind: record.source_kind
        };
    }
    return {
        id: payload.id || buildStableReplaySampleId(payload, "count_sample"),
        created_at: getExplicitCreatedAt(payload),
        map_id: payload.map_id || null,
        state: normalizeReplayState(payload),
        actual_counts: normalizeActualCounts(payload.actual_counts),
        source_kind: payload.source_kind || "settlement_count_replay"
    };
}

function normalizePosteriorEntries(entries = []) {
    return entries
        .filter((entry) => entry && Number.isInteger(entry.count) && Number.isFinite(entry.prob))
        .map((entry) => ({
            count: entry.count,
            prob: entry.prob
        }));
}

function getPosteriorEntries(summary = {}, quality) {
    if (summary.count_probs && summary.count_probs[quality] && typeof summary.count_probs[quality] === "object") {
        return normalizePosteriorEntries(
            Object.entries(summary.count_probs[quality]).map(([count, prob]) => ({
                count: parseInt(count, 10),
                prob
            }))
        );
    }
    const posteriorKey = COUNT_POSTERIOR_KEY_MAP[quality];
    if (!posteriorKey || !Array.isArray(summary[posteriorKey])) return [];
    return normalizePosteriorEntries(summary[posteriorKey]);
}

function scoreActualCount(entries = [], actualCount) {
    if (!Number.isInteger(actualCount) || actualCount < 0) return null;

    const normalizedEntries = normalizePosteriorEntries(entries);
    const sorted = normalizedEntries
        .slice()
        .sort((left, right) => right.prob - left.prob || left.count - right.count);
    const matchIndex = sorted.findIndex((entry) => entry.count === actualCount);
    const meanCount = normalizedEntries.reduce((sum, entry) => sum + (entry.count * entry.prob), 0);

    return {
        actual_count: actualCount,
        actual_prob: matchIndex >= 0 ? sorted[matchIndex].prob : 0,
        rank: matchIndex >= 0 ? matchIndex + 1 : null,
        in_support: matchIndex >= 0,
        mean_count: roundTo(meanCount, 4),
        abs_error: roundTo(Math.abs(meanCount - actualCount), 4),
        top_counts: sorted.slice(0, 5).map((entry) => ({
            count: entry.count,
            prob: roundTo(entry.prob, 6)
        }))
    };
}

function buildReplaySide(sample, configRoot) {
    const resolvedConfig = resolveEstimatorConfig(configRoot, sample.map_id);
    const estimator = new AuctionKingEstimator(resolvedConfig, sample.state);
    const result = estimator.recompute();

    if (!result || result.error || !result.summary) {
        return {
            error: true,
            messages: Array.isArray(result && result.messages) ? result.messages.slice() : ["recompute_failed"],
            quality_counts: QUALITY_ORDER.reduce((qualityResult, quality) => {
                qualityResult[quality] = null;
                return qualityResult;
            }, {}),
            orange: null,
            red: null
        };
    }

    const qualityCounts = QUALITY_ORDER.reduce((qualityResult, quality) => {
        qualityResult[quality] = scoreActualCount(getPosteriorEntries(result.summary, quality), sample.actual_counts[quality]);
        return qualityResult;
    }, {});
    const side = {
        error: false,
        messages: Array.isArray(result.messages) ? result.messages.slice() : [],
        quality_counts: qualityCounts
    };
    Object.entries(COUNT_POSTERIOR_LEGACY_KEYS).forEach(([quality, legacyKey]) => {
        side[legacyKey] = qualityCounts[quality];
    });
    return side;
}

function buildQualityMetricSummary(sampleReports = [], sideKey, quality) {
    const entries = sampleReports
        .map((sample) => sample && sample[sideKey] && sample[sideKey].quality_counts ? sample[sideKey].quality_counts[quality] : null)
        .filter(Boolean);
    const actualProbs = entries.map((entry) => entry.actual_prob);
    const logLosses = entries.map((entry) => -Math.log(Math.max(entry.actual_prob, 1e-12)));
    const absErrors = entries.map((entry) => entry.abs_error);
    const ranks = entries.map((entry) => entry.rank).filter((rank) => rank !== null);

    return {
        sample_count: entries.length,
        mean_actual_prob: roundTo(average(actualProbs) || 0, 6),
        mean_log_loss: roundTo(average(logLosses) || 0, 6),
        mean_abs_error: roundTo(average(absErrors) || 0, 6),
        mean_rank: roundTo(average(ranks) || 0, 4),
        top1_hit_rate: roundTo(average(entries.map((entry) => entry.rank === 1 ? 1 : 0)) || 0, 4),
        top3_hit_rate: roundTo(average(entries.map((entry) => entry.rank !== null && entry.rank <= 3 ? 1 : 0)) || 0, 4),
        support_rate: roundTo(average(entries.map((entry) => entry.in_support ? 1 : 0)) || 0, 4)
    };
}

function buildMetrics(sampleReports = [], sideKey) {
    return QUALITY_ORDER.reduce((result, quality) => {
        result[quality] = buildQualityMetricSummary(sampleReports, sideKey, quality);
        return result;
    }, {});
}

function buildSettlementCountReplayReport(samples = [], baselineConfig = {}, candidateConfig = null) {
    const normalizedSamples = Array.isArray(samples)
        ? samples.map((sample) => createSettlementCountReplaySample(sample))
        : [];
    const sampleReports = normalizedSamples.map((sample) => {
        const report = {
            id: sample.id,
            map_id: sample.map_id || "unknown",
            state: cloneValue(sample.state),
            actual_counts: cloneValue(sample.actual_counts),
            baseline: buildReplaySide(sample, baselineConfig)
        };
        if (candidateConfig) {
            if (isStructuredWorkspaceConfig(candidateConfig)) {
                report.candidate = buildReplaySide(sample, candidateConfig);
            } else {
                const baselineResolved = resolveEstimatorConfig(baselineConfig, sample.map_id);
                const candidateResolved = cloneValue(baselineResolved);
                delete candidateResolved.calibration;
                delete candidateResolved.app;
                delete candidateResolved.fields;
                delete candidateResolved.templates;
                delete candidateResolved.maps;
                delete candidateResolved.model;
                candidateResolved.alpha_counts = {
                    ...(baselineResolved.alpha_counts || {}),
                    ...extractAlphaCountOverrides(candidateConfig, sample.map_id)
                };
                report.candidate = buildReplaySide(sample, candidateResolved);
            }
        }
        return report;
    });

    const metrics = {
        baseline: buildMetrics(sampleReports, "baseline")
    };
    if (candidateConfig) metrics.candidate = buildMetrics(sampleReports, "candidate");

    const report = {
        sample_count: sampleReports.length,
        evaluated_qualities: QUALITY_ORDER.slice(),
        metrics,
        samples: sampleReports
    };
    if (candidateConfig && candidateConfig.producer_strategy_candidate) {
        report.candidate_config_context = cloneValue(candidateConfig.producer_strategy_candidate);
    }
    return report;
}

module.exports = {
    COUNT_POSTERIOR_KEY_MAP,
    QUALITY_ORDER,
    buildStableReplaySampleId,
    createSettlementCountReplaySample,
    scoreActualCount,
    buildSettlementCountReplayReport
};
