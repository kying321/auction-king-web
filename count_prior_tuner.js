const { resolveEstimatorConfig } = require("./estimator.js");
const { buildSettlementCountReplayReport } = require("./sample_count_replay.js");
const { createBattleSampleRecord } = require("./source_data_runtime.js");

const QUALITIES = ["w", "g", "b", "p", "o", "r"];

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function roundTo(value, digits = 6) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePositiveNumberList(values = [], fallback = []) {
    const source = Array.isArray(values) && values.length ? values : fallback;
    const unique = new Set();
    source.forEach((value) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) unique.add(roundTo(numeric, 6));
    });
    return Array.from(unique).sort((left, right) => left - right);
}

function buildScaledSearchValues(baseValue, multipliers = [], minimum = 0.05) {
    const baseline = Number(baseValue);
    if (!Number.isFinite(baseline) || baseline <= 0) return [];
    return normalizePositiveNumberList(
        multipliers.map((multiplier) => Math.max(minimum, baseline * Number(multiplier))),
        [baseline]
    );
}

function readStructuredMapNode(config = {}, mapId) {
    if (!isPlainObject(config.app) || !isPlainObject(config.model) || !isPlainObject(config.maps)) return null;
    return isPlainObject(config.maps[mapId]) ? config.maps[mapId] : {};
}

function buildMapCountPriorCandidateConfig(baselineConfig = {}, mapId, candidate = {}) {
    if (!mapId) throw new Error("需要 mapId 才能生成地图级爆率候选配置");

    const next = cloneValue(baselineConfig);
    const alphaCountsOverride = isPlainObject(candidate.alpha_counts) ? candidate.alpha_counts : {};
    const solverOverride = isPlainObject(candidate.solver) ? candidate.solver : {};

    if (readStructuredMapNode(next, mapId) !== null) {
        const mapNode = isPlainObject(next.maps[mapId]) ? next.maps[mapId] : {};
        next.maps[mapId] = {
            ...mapNode,
            alpha_counts: {
                ...(mapNode.alpha_counts || {}),
                ...cloneValue(alphaCountsOverride)
            }
        };
        if (Object.keys(solverOverride).length) {
            next.maps[mapId].solver = {
                ...(mapNode.solver || {}),
                ...cloneValue(solverOverride)
            };
        }
        return next;
    }

    next.map_presets = isPlainObject(next.map_presets) ? next.map_presets : {};
    const presetNode = isPlainObject(next.map_presets[mapId]) ? next.map_presets[mapId] : {};
    next.map_presets[mapId] = {
        ...presetNode,
        alpha_counts: {
            ...(presetNode.alpha_counts || {}),
            ...cloneValue(alphaCountsOverride)
        }
    };
    if (Object.keys(solverOverride).length) {
        next.map_presets[mapId].solver = {
            ...(presetNode.solver || {}),
            ...cloneValue(solverOverride)
        };
    }
    return next;
}

function scoreCountReplayMetrics(metrics = {}, objective = {}) {
    const qualityWeights = {
        o: 1,
        r: 1,
        ...(isPlainObject(objective.quality_weights) ? objective.quality_weights : {})
    };
    const absErrorWeight = Number.isFinite(objective.abs_error_weight)
        ? Number(objective.abs_error_weight)
        : 0.15;
    const missingSupportPenalty = Number.isFinite(objective.missing_support_penalty)
        ? Number(objective.missing_support_penalty)
        : 3;

    let totalWeight = 0;
    let score = 0;
    ["o", "r"].forEach((quality) => {
        const weight = Number(qualityWeights[quality]);
        if (!Number.isFinite(weight) || weight <= 0) return;

        const entry = isPlainObject(metrics[quality]) ? metrics[quality] : {};
        const meanLogLoss = Number.isFinite(entry.mean_log_loss) ? entry.mean_log_loss : 30;
        const meanAbsError = Number.isFinite(entry.mean_abs_error) ? entry.mean_abs_error : 0;
        const supportRate = Number.isFinite(entry.support_rate) ? entry.support_rate : 0;

        score += weight * (
            meanLogLoss
            + (absErrorWeight * meanAbsError)
            + (missingSupportPenalty * (1 - supportRate))
        );
        totalWeight += weight;
    });

    if (totalWeight <= 0) return Infinity;
    return roundTo(score / totalWeight, 6);
}

function buildDefaultMapCountPriorSearchSpace(baselineConfig = {}, mapId) {
    const resolved = resolveEstimatorConfig(baselineConfig, mapId);
    const alphaCounts = isPlainObject(resolved.alpha_counts) ? resolved.alpha_counts : {};
    const currentStrength = Number(resolved.solver && resolved.solver.count_prior_strength) || 1;

    return {
        alpha_counts: {
            w: buildScaledSearchValues(alphaCounts.w, [0.65, 0.85, 1, 1.15, 1.35]),
            g: buildScaledSearchValues(alphaCounts.g, [0.65, 0.85, 1, 1.15, 1.35]),
            b: buildScaledSearchValues(alphaCounts.b, [0.75, 0.9, 1, 1.1, 1.25]),
            p: buildScaledSearchValues(alphaCounts.p, [0.6, 0.8, 1, 1.2, 1.4]),
            o: buildScaledSearchValues(alphaCounts.o, [0.5, 0.75, 1, 1.25, 1.5]),
            r: buildScaledSearchValues(alphaCounts.r, [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5], 0.02)
        },
        solver: {
            count_prior_strength: normalizePositiveNumberList([1, 2, 4, 6, 8, 12, 16, currentStrength])
        },
        max_rounds: 8
    };
}

function buildTuningParameterSpecs(searchSpace = {}) {
    const specs = [];
    const alphaCounts = isPlainObject(searchSpace.alpha_counts) ? searchSpace.alpha_counts : {};
    QUALITIES.forEach((quality) => {
        const values = normalizePositiveNumberList(alphaCounts[quality]);
        if (values.length) {
            specs.push({
                scope: "alpha_counts",
                key: quality,
                label: `alpha_counts.${quality}`,
                values
            });
        }
    });

    const solver = isPlainObject(searchSpace.solver) ? searchSpace.solver : {};
    const countPriorStrength = normalizePositiveNumberList(solver.count_prior_strength);
    if (countPriorStrength.length) {
        specs.push({
            scope: "solver",
            key: "count_prior_strength",
            label: "solver.count_prior_strength",
            values: countPriorStrength
        });
    }

    return specs;
}

function getParameterValue(candidate = {}, spec = {}) {
    if (spec.scope === "alpha_counts") return candidate.alpha_counts[spec.key];
    if (spec.scope === "solver") return candidate.solver[spec.key];
    return undefined;
}

function setParameterValue(candidate = {}, spec = {}, value) {
    const next = cloneValue(candidate);
    if (spec.scope === "alpha_counts") next.alpha_counts[spec.key] = value;
    if (spec.scope === "solver") next.solver[spec.key] = value;
    return next;
}

function normalizeSamplesForMap(samples = [], mapId) {
    return (Array.isArray(samples) ? samples : [])
        .map((sample) => createBattleSampleRecord(sample))
        .filter((sample) => sample.map_id === mapId);
}

function buildInitialCandidateFromBaseline(baselineConfig = {}, mapId) {
    const resolved = resolveEstimatorConfig(baselineConfig, mapId);
    return {
        alpha_counts: QUALITIES.reduce((accumulator, quality) => {
            accumulator[quality] = Number(resolved.alpha_counts && resolved.alpha_counts[quality]) || 0.05;
            return accumulator;
        }, {}),
        solver: {
            count_prior_strength: Number(resolved.solver && resolved.solver.count_prior_strength) || 1
        }
    };
}

function buildEvaluationCacheKey(candidate = {}) {
    return JSON.stringify(candidate);
}

function normalizePositiveInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function buildTuningEvidenceAssessment(sampleCount, metrics = {}, objective = {}) {
    const minMapSampleCount = normalizePositiveInteger(objective.min_recommended_map_sample_count, 3);
    const minQualitySampleCount = normalizePositiveInteger(objective.min_recommended_quality_sample_count, 2);
    const qualitySampleCounts = {};
    const riskFlags = [];

    ["o", "r"].forEach((quality) => {
        const metric = isPlainObject(metrics[quality]) ? metrics[quality] : {};
        qualitySampleCounts[quality] = Number.isInteger(metric.sample_count) && metric.sample_count >= 0
            ? metric.sample_count
            : 0;
    });

    if (sampleCount < minMapSampleCount) riskFlags.push("map_sample_count_below_minimum");
    if (sampleCount === 1) riskFlags.push("single_sample_coordinate_search_overfit");
    Object.entries(qualitySampleCounts).forEach(([quality, count]) => {
        if (count < minQualitySampleCount) riskFlags.push(`${quality}_sample_count_below_minimum`);
    });

    const canAdoptDefaultWeight = riskFlags.length === 0;
    return {
        status: canAdoptDefaultWeight ? "sample_backed_candidate" : "insufficient_sample_size",
        sample_count: sampleCount,
        min_recommended_map_sample_count: minMapSampleCount,
        min_recommended_quality_sample_count: minQualitySampleCount,
        quality_sample_counts: qualitySampleCounts,
        can_adopt_default_weight: canAdoptDefaultWeight,
        recommended_change_class: canAdoptDefaultWeight ? "SIM_ONLY" : "RESEARCH_ONLY",
        risk_flags: riskFlags
    };
}

function buildMapCountPriorTuningReport({
    baselineConfig = {},
    mapId,
    samples = [],
    searchSpace = null,
    objective = {},
    maxRounds = null
} = {}) {
    if (!mapId) throw new Error("需要 mapId 才能执行地图级爆率调参");

    const scopedSamples = normalizeSamplesForMap(samples, mapId);
    if (scopedSamples.length === 0) throw new Error(`未找到地图 ${mapId} 的可用结算样本`);

    const effectiveSearchSpace = searchSpace || buildDefaultMapCountPriorSearchSpace(baselineConfig, mapId);
    const parameterSpecs = buildTuningParameterSpecs(effectiveSearchSpace);
    const evaluationCache = new Map();
    let evaluatedCandidateCount = 0;

    const baselineReplayReport = buildSettlementCountReplayReport(scopedSamples, baselineConfig);
    const baselineMetrics = baselineReplayReport.metrics.baseline;
    const baselineScore = scoreCountReplayMetrics(baselineMetrics, objective);
    const baselineCandidate = buildInitialCandidateFromBaseline(baselineConfig, mapId);
    const evidenceAssessment = buildTuningEvidenceAssessment(scopedSamples.length, baselineMetrics, objective);
    const iterationLimit = Number.isInteger(maxRounds) && maxRounds > 0
        ? maxRounds
        : (Number.isInteger(effectiveSearchSpace.max_rounds) && effectiveSearchSpace.max_rounds > 0 ? effectiveSearchSpace.max_rounds : 8);

    function evaluate(candidate) {
        const cacheKey = buildEvaluationCacheKey(candidate);
        if (evaluationCache.has(cacheKey)) return evaluationCache.get(cacheKey);

        evaluatedCandidateCount += 1;
        const config = buildMapCountPriorCandidateConfig(baselineConfig, mapId, candidate);
        const replayReport = buildSettlementCountReplayReport(scopedSamples, baselineConfig, config);
        const metrics = replayReport.metrics.candidate || replayReport.metrics.baseline || {};
        const result = {
            candidate: cloneValue(candidate),
            config,
            report: replayReport,
            metrics,
            score: scoreCountReplayMetrics(metrics, objective)
        };
        evaluationCache.set(cacheKey, result);
        return result;
    }

    let currentCandidate = cloneValue(baselineCandidate);
    let currentEvaluation = evaluate(currentCandidate);
    const steps = [];

    for (let round = 1; round <= iterationLimit; round += 1) {
        let bestTrial = null;
        let bestSpec = null;
        let bestPreviousValue = null;

        parameterSpecs.forEach((spec) => {
            const currentValue = getParameterValue(currentCandidate, spec);
            spec.values.forEach((value) => {
                if (Math.abs(Number(value) - Number(currentValue)) <= 1e-12) return;
                const trialCandidate = setParameterValue(currentCandidate, spec, value);
                const trialEvaluation = evaluate(trialCandidate);
                if (!bestTrial || trialEvaluation.score < bestTrial.score - 1e-9) {
                    bestTrial = trialEvaluation;
                    bestSpec = spec;
                    bestPreviousValue = currentValue;
                }
            });
        });

        if (!bestTrial || bestTrial.score >= currentEvaluation.score - 1e-9) break;

        currentCandidate = cloneValue(bestTrial.candidate);
        currentEvaluation = bestTrial;
        steps.push({
            round,
            parameter: bestSpec.label,
            from: roundTo(bestPreviousValue, 6),
            to: roundTo(getParameterValue(currentCandidate, bestSpec), 6),
            score: currentEvaluation.score,
            score_delta: roundTo(currentEvaluation.score - baselineScore, 6)
        });
    }

    return {
        map_id: mapId,
        sample_count: scopedSamples.length,
        evidence_assessment: evidenceAssessment,
        search_space: cloneValue(effectiveSearchSpace),
        evaluated_candidate_count: evaluatedCandidateCount,
        baseline: {
            candidate: baselineCandidate,
            metrics: baselineMetrics,
            score: baselineScore,
            report: baselineReplayReport
        },
        best_candidate: {
            candidate: currentEvaluation.candidate,
            config: currentEvaluation.config,
            metrics: currentEvaluation.metrics,
            report: currentEvaluation.report,
            score: currentEvaluation.score,
            score_delta: roundTo(currentEvaluation.score - baselineScore, 6)
        },
        steps
    };
}

module.exports = {
    QUALITIES,
    buildScaledSearchValues,
    buildDefaultMapCountPriorSearchSpace,
    buildMapCountPriorCandidateConfig,
    buildMapCountPriorTuningReport,
    buildTuningEvidenceAssessment,
    scoreCountReplayMetrics
};
