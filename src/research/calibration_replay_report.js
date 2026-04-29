const { resolveEstimatorConfig } = require("../core/estimator.js");
const { buildSettlementCountReplayReport } = require("./sample_count_replay.js");
const { buildSettlementValueReplayReport } = require("./sample_value_replay.js");
const { createBattleSampleRecord } = require("../core/source_data_runtime.js");
const {
    deepMergeConfig,
    extractAlphaCountOverrides,
    extractValueModelOverrides,
    isStructuredWorkspaceConfig
} = require("../core/calibration_override_runtime.js");

const QUALITIES = ["w", "g", "b", "p", "o", "r"];

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeSamples(samples = []) {
    return Array.isArray(samples)
        ? samples.map((sample) => createBattleSampleRecord(sample))
        : [];
}

function buildAlphaCountsComparison(baselineConfig = {}, candidateConfig = {}) {
    const baseline = {};
    const candidate = {};
    const delta = {};
    QUALITIES.forEach((quality) => {
        const baselineValue = Number(baselineConfig[quality]) || 0;
        const candidateValue = Number(candidateConfig[quality]) || 0;
        baseline[quality] = baselineValue;
        candidate[quality] = candidateValue;
        delta[quality] = Number((candidateValue - baselineValue).toFixed(6));
    });
    return {
        baseline,
        candidate,
        delta
    };
}

function buildValueModelComparison(baselineValueModel = {}, candidateValueModel = {}) {
    const baseline = {};
    const candidate = {};
    const delta = {};
    QUALITIES.forEach((quality) => {
        const baselineEntry = baselineValueModel[quality] || {};
        const candidateEntry = candidateValueModel[quality] || {};
        baseline[quality] = {
            base_item_mean: Number(baselineEntry.base_item_mean) || 0,
            base_item_sd: Number(baselineEntry.base_item_sd) || 0
        };
        candidate[quality] = {
            base_item_mean: Number(candidateEntry.base_item_mean) || 0,
            base_item_sd: Number(candidateEntry.base_item_sd) || 0
        };
        delta[quality] = {
            base_item_mean: Number((candidate[quality].base_item_mean - baseline[quality].base_item_mean).toFixed(6)),
            base_item_sd: Number((candidate[quality].base_item_sd - baseline[quality].base_item_sd).toFixed(6))
        };
    });
    return {
        baseline,
        candidate,
        delta
    };
}

function buildCalibrationReplayReport({
    samples = [],
    baselineConfig = {},
    candidateConfig = null
} = {}) {
    const normalizedSamples = normalizeSamples(samples);
    const effectiveCandidateConfig = candidateConfig || baselineConfig;
    const mapIds = Array.from(new Set(normalizedSamples.map((sample) => sample.map_id).filter(Boolean)));
    const maps = {};

    mapIds.forEach((mapId) => {
        const baselineResolved = resolveEstimatorConfig(baselineConfig, mapId);
        const candidateResolved = isStructuredWorkspaceConfig(effectiveCandidateConfig)
            ? resolveEstimatorConfig(effectiveCandidateConfig, mapId)
            : {
                ...cloneValue(baselineResolved),
                alpha_counts: {
                    ...(baselineResolved.alpha_counts || {}),
                    ...extractAlphaCountOverrides(effectiveCandidateConfig, mapId)
                },
                value_model: deepMergeConfig(
                    baselineResolved.value_model || {},
                    extractValueModelOverrides(effectiveCandidateConfig, mapId)
                )
            };
        maps[mapId] = {
            sample_count: normalizedSamples.filter((sample) => sample.map_id === mapId).length,
            alpha_counts: buildAlphaCountsComparison(
                baselineResolved.alpha_counts || {},
                candidateResolved.alpha_counts || {}
            ),
            value_model: buildValueModelComparison(
                baselineResolved.value_model || {},
                candidateResolved.value_model || {}
            )
        };
    });

    return {
        artifact_version: baselineConfig && baselineConfig.calibration ? baselineConfig.calibration.artifact_version || null : null,
        generated_at: baselineConfig && baselineConfig.calibration ? baselineConfig.calibration.generated_at || null : null,
        source_summary: baselineConfig && baselineConfig.calibration ? cloneValue(baselineConfig.calibration.source_summary || {}) : {},
        sample_count: normalizedSamples.length,
        map_ids: mapIds,
        count_report: buildSettlementCountReplayReport(normalizedSamples, baselineConfig, candidateConfig),
        value_report: buildSettlementValueReplayReport(normalizedSamples, baselineConfig, effectiveCandidateConfig),
        maps
    };
}

module.exports = {
    buildCalibrationReplayReport,
    buildAlphaCountsComparison,
    buildValueModelComparison
};
