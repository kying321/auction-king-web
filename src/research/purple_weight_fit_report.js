const defaultConfig = require("../core/default_config_bundle.js");
const { resolveEstimatorConfig } = require("../core/estimator.js");
const { buildSettlementCountReplayReport } = require("./sample_count_replay.js");

const DEFAULT_MULTIPLIERS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const FIT_QUALITIES = ["o", "r"];

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeSamples(payload = {}) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object" && Array.isArray(payload.samples)) return payload.samples;
    return [];
}

function normalizeMultipliers(values = DEFAULT_MULTIPLIERS) {
    const multipliers = (Array.isArray(values) ? values : DEFAULT_MULTIPLIERS)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
    return Array.from(new Set(multipliers)).sort((left, right) => left - right);
}

function getMapIdsFromConfig(config = defaultConfig) {
    return Object.keys(config && config.maps ? config.maps : {}).sort();
}

function buildPurpleMultiplierCandidateConfig({
    baselineConfig = defaultConfig,
    multiplier = 1,
    mapIds = getMapIdsFromConfig(baselineConfig)
} = {}) {
    const normalizedMultiplier = Number(multiplier);
    const safeMultiplier = Number.isFinite(normalizedMultiplier) && normalizedMultiplier > 0
        ? normalizedMultiplier
        : 1;
    const maps = {};

    mapIds.forEach((mapId) => {
        const resolved = resolveEstimatorConfig(baselineConfig, mapId);
        const currentPurple = Number(resolved && resolved.alpha_counts && resolved.alpha_counts.p);
        maps[mapId] = {
            alpha_counts: {
                p: roundTo((Number.isFinite(currentPurple) ? currentPurple : 0) * safeMultiplier, 6)
            }
        };
    });

    return {
        alpha_counts: {},
        maps
    };
}

function getMetricScore(metrics = {}) {
    return FIT_QUALITIES.reduce((sum, quality) => {
        const entry = metrics[quality] || {};
        const sampleCount = Number(entry.sample_count) || 0;
        if (!sampleCount) return sum;
        const logLoss = Number(entry.mean_log_loss);
        const absError = Number(entry.mean_abs_error);
        return sum
            + (Number.isFinite(logLoss) ? logLoss * sampleCount : 0)
            + (Number.isFinite(absError) ? absError * sampleCount : 0);
    }, 0);
}

function findSampleQualityEntry(sample = {}, sideKey, quality) {
    return sample && sample[sideKey] && sample[sideKey].quality_counts
        ? sample[sideKey].quality_counts[quality] || null
        : null;
}

function summarizeSampleDeltas(report = {}) {
    return (Array.isArray(report.samples) ? report.samples : []).map((sample) => {
        const qualityDeltas = {};
        QUALITY_ORDER.forEach((quality) => {
            const baseline = findSampleQualityEntry(sample, "baseline", quality);
            const candidate = findSampleQualityEntry(sample, "candidate", quality);
            if (!baseline || !candidate) return;
            qualityDeltas[quality] = {
                actual_count: baseline.actual_count,
                baseline_mean_count: baseline.mean_count,
                candidate_mean_count: candidate.mean_count,
                mean_count_delta: roundTo((Number(candidate.mean_count) || 0) - (Number(baseline.mean_count) || 0), 4),
                baseline_actual_prob: roundTo(baseline.actual_prob, 6),
                candidate_actual_prob: roundTo(candidate.actual_prob, 6),
                actual_prob_delta: roundTo((Number(candidate.actual_prob) || 0) - (Number(baseline.actual_prob) || 0), 6),
                baseline_rank: baseline.rank,
                candidate_rank: candidate.rank
            };
        });
        return {
            id: sample.id,
            map_id: sample.map_id,
            actual_counts: cloneValue(sample.actual_counts || {}),
            quality_deltas: qualityDeltas
        };
    });
}

function pickBestByScore(candidates = []) {
    return candidates.slice().sort((left, right) => {
        return left.objective_score - right.objective_score || left.multiplier - right.multiplier;
    })[0] || null;
}

function pickSafeSuppressionCandidate(candidates = [], baseline = null) {
    if (!baseline) return null;
    const redBaseline = baseline.metrics && baseline.metrics.r ? baseline.metrics.r : {};
    const redBaselineLogLoss = Number(redBaseline.mean_log_loss);
    return candidates
        .filter((entry) => entry.multiplier > 1)
        .filter((entry) => entry.red_mean_delta < 0)
        .filter((entry) => {
            const redLogLoss = Number(entry.metrics.r && entry.metrics.r.mean_log_loss);
            if (!Number.isFinite(redBaselineLogLoss) || !Number.isFinite(redLogLoss)) return true;
            return redLogLoss <= redBaselineLogLoss + 0.25;
        })
        .sort((left, right) => Math.abs(left.multiplier - 1.25) - Math.abs(right.multiplier - 1.25))[0] || null;
}

function extractAtlasSummary(atlasSnapshot = {}) {
    const summaries = Array.isArray(atlasSnapshot.quality_summaries) ? atlasSnapshot.quality_summaries : [];
    return summaries.reduce((result, entry) => {
        if (!entry || !entry.quality) return result;
        result[entry.quality] = {
            observed_average_value: roundTo(entry.observed_average_value, 2),
            observed_value_sd: roundTo(entry.observed_value_sd, 2),
            sample_count: entry.suggested_value_model && Number.isFinite(Number(entry.suggested_value_model.sample_count))
                ? Number(entry.suggested_value_model.sample_count)
                : null
        };
        return result;
    }, {});
}

function buildPurpleWeightFitReport({
    baselineConfig = defaultConfig,
    baselineConfigSource = null,
    samples: inputSamples = [],
    atlasSnapshot = {},
    multipliers = DEFAULT_MULTIPLIERS,
    generatedAt = new Date().toISOString()
} = {}) {
    const samples = normalizeSamples(inputSamples);
    const normalizedMultipliers = normalizeMultipliers(multipliers);
    const baselineReport = buildSettlementCountReplayReport(samples, baselineConfig, null);
    const baselineMetrics = baselineReport.metrics.baseline || {};

    const candidateResults = normalizedMultipliers.map((multiplier) => {
        const candidateConfig = buildPurpleMultiplierCandidateConfig({ baselineConfig, multiplier });
        const replayReport = buildSettlementCountReplayReport(samples, baselineConfig, candidateConfig);
        const metrics = replayReport.metrics.candidate || {};
        const baselineRedMean = (baselineReport.samples || [])
            .map((sample) => findSampleQualityEntry(sample, "baseline", "r"))
            .filter(Boolean)
            .reduce((sum, entry) => sum + Number(entry.mean_count || 0), 0);
        const candidateRedMean = (replayReport.samples || [])
            .map((sample) => findSampleQualityEntry(sample, "candidate", "r"))
            .filter(Boolean)
            .reduce((sum, entry) => sum + Number(entry.mean_count || 0), 0);
        const redSampleCount = Number(metrics.r && metrics.r.sample_count) || 0;
        const redMeanDelta = redSampleCount
            ? roundTo((candidateRedMean - baselineRedMean) / redSampleCount, 4)
            : 0;

        return {
            multiplier,
            objective_score: roundTo(getMetricScore(metrics), 6),
            metrics: FIT_QUALITIES.reduce((result, quality) => {
                result[quality] = metrics[quality] || {};
                return result;
            }, {}),
            red_mean_delta: redMeanDelta,
            sample_deltas: summarizeSampleDeltas(replayReport),
            candidate_alpha_counts_by_map: Object.fromEntries(
                Object.entries(candidateConfig.maps).map(([mapId, entry]) => [mapId, entry.alpha_counts])
            )
        };
    });

    const baselineEntry = {
        multiplier: 1,
        objective_score: roundTo(getMetricScore(baselineMetrics), 6),
        metrics: FIT_QUALITIES.reduce((result, quality) => {
            result[quality] = baselineMetrics[quality] || {};
            return result;
        }, {}),
        red_mean_delta: 0
    };
    const statisticalBest = pickBestByScore(candidateResults);
    const safeSuppressionCandidate = pickSafeSuppressionCandidate(candidateResults, baselineEntry);
    const nearDoubleCandidate = candidateResults.find((entry) => entry.multiplier === 2) || null;
    const selectedShadowMultiplier = statisticalBest ? statisticalBest.multiplier : null;
    const selectedDefaultMultiplier = safeSuppressionCandidate ? safeSuppressionCandidate.multiplier : null;

    return {
        schema_version: "ak_purple_weight_fit_report_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        baseline_config_source: baselineConfigSource || {
            kind: "default_config_bundle"
        },
        adoption_allowed: false,
        adoption_blockers: [
            "red_label_sample_count_below_default_update_gate",
            "fit_uses_partial_overlay_replay_samples",
            "purple_multiplier_scan_is_shadow_only"
        ],
        evidence_sources: {
            replay_sample_count: samples.length,
            red_label_sample_count: Number(baselineMetrics.r && baselineMetrics.r.sample_count) || 0,
            orange_label_sample_count: Number(baselineMetrics.o && baselineMetrics.o.sample_count) || 0,
            atlas_value_summary: extractAtlasSummary(atlasSnapshot),
            external_research_links: [
                "https://github.com/sarkozyfan/bidking-bot",
                "https://raw.githubusercontent.com/sarkozyfan/bidking-bot/main/bidking_fresh_bot/price_config.json"
            ],
            external_research_notes: [
                "公开 bidking-bot 只提供 OCR/出价决策与品质单格价格，不能作为爆率标签。",
                "图鉴可稳定支持价值层 p/o/r 单件均值，但不含地图爆率或品质数量分布。",
                "紫色倍率扫描只能作为数量先验的 shadow fit，不能覆盖 count-fit readiness gate。"
            ]
        },
        baseline: baselineEntry,
        candidates: candidateResults,
        recommendation: {
            statistical_best_multiplier: statisticalBest ? statisticalBest.multiplier : null,
            safe_red_suppression_multiplier: safeSuppressionCandidate ? safeSuppressionCandidate.multiplier : null,
            near_double_multiplier: nearDoubleCandidate ? nearDoubleCandidate.multiplier : null,
            selected_shadow_multiplier: selectedShadowMultiplier,
            selected_default_multiplier: selectedDefaultMultiplier,
            default_weight_change_class: selectedDefaultMultiplier && selectedDefaultMultiplier > 1 ? "SIM_ONLY" : "RESEARCH_ONLY",
            conclusion: nearDoubleCandidate && nearDoubleCandidate.metrics.r && nearDoubleCandidate.metrics.r.mean_log_loss > baselineEntry.metrics.r.mean_log_loss
                ? "2x purple suppresses red mean but fails the only current red-label replay; keep as aggressive shadow, not default."
                : "Purple multiplier scan did not produce enough authority to update defaults."
        }
    };
}

module.exports = {
    DEFAULT_MULTIPLIERS,
    buildPurpleMultiplierCandidateConfig,
    buildPurpleWeightFitReport,
    extractAtlasSummary,
    normalizeMultipliers,
    normalizeSamples
};
