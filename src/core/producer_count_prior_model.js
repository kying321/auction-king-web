const defaultConfig = require("./default_config_bundle.js");
const { resolveEstimatorConfig } = require("./estimator.js");

const QUALITIES = ["w", "g", "b", "p", "o", "r"];

const DEFAULT_PRODUCER_MAP_PROFILES = {
    sunken_ship: {
        label: "沉船图",
        design_intent: "高难高波动，蓝紫是主体，橙红负责奖池上限但不能高到破坏单局稀缺感。",
        archetype_weights: { w: 12, g: 16, b: 30, p: 24, o: 10, r: 8 },
        target_alpha_total: 15,
        count_prior_strength: 8
    },
    villa: {
        label: "别墅图",
        design_intent: "低门槛高频图，白绿蓝作为底盘，橙红作为稀有惊喜而非主收益来源。",
        archetype_weights: { w: 30, g: 27, b: 18, p: 15, o: 7, r: 3 },
        target_alpha_total: 24,
        count_prior_strength: 16
    },
    shipping: {
        label: "航运区",
        design_intent: "中高波动物流图，蓝紫为主体，橙红概率高于别墅但低于沉船。",
        archetype_weights: { w: 15, g: 18, b: 24, p: 20, o: 15, r: 8 },
        target_alpha_total: 18.5,
        count_prior_strength: 10
    }
};

const EXTERNAL_RESEARCH_NOTES = [
    "官方与社区资料都指向地图/地区会影响角色强度与藏品价值层，因此地图级先验应独立建模。",
    "公开玩家经验更像图特定锚点，不是可直接采纳的官方爆率表；本模块只把它用于制作人先验结构。",
    "图片像素统计是 review-only shadow evidence，只能影响研究报告的方向性对照，不能进入训练标签或默认权重。"
];
const EXTERNAL_RESEARCH_LINKS = [
    "https://www.bidking.net/",
    "https://www.taptap.cn/moment/783615640878451296",
    "https://www.taptap.cn/moment/776828626745163821",
    "https://www.taptap.cn/moment/776853743374175351",
    "https://www.bilibili.com/video/BV18PP5zDEbk/",
    "https://www.bilibili.com/video/BV1dvPZzEEpE/"
];

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeFractions(weights = {}) {
    const normalizedWeights = QUALITIES.reduce((result, quality) => {
        const value = Number(weights[quality] || 0);
        result[quality] = Number.isFinite(value) && value > 0 ? value : 0;
        return result;
    }, {});
    const total = QUALITIES.reduce((sum, quality) => sum + normalizedWeights[quality], 0);

    return QUALITIES.reduce((result, quality) => {
        result[quality] = total > 0 ? roundTo(normalizedWeights[quality] / total) : 0;
        return result;
    }, {});
}

function sumQualityValues(values = {}) {
    return QUALITIES.reduce((sum, quality) => sum + (Number(values[quality]) || 0), 0);
}

function scaleFractionsToAlphaCounts(fractions = {}, total) {
    const alphaTotal = Number(total);
    return QUALITIES.reduce((result, quality) => {
        result[quality] = Number.isFinite(alphaTotal) && alphaTotal > 0
            ? roundTo((Number(fractions[quality]) || 0) * alphaTotal)
            : 0;
        return result;
    }, {});
}

function normalizeInputPayload(payload, key = "samples") {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object" && Array.isArray(payload[key])) return payload[key];
    return [];
}

function readBaselineForMap(baselineConfig = {}, mapId) {
    const resolved = resolveEstimatorConfig(baselineConfig, mapId);
    const alphaCounts = resolved && isPlainObject(resolved.alpha_counts)
        ? QUALITIES.reduce((result, quality) => {
            result[quality] = Number(resolved.alpha_counts[quality]) || 0;
            return result;
        }, {})
        : null;
    const solverStrength = Number(resolved && resolved.solver && resolved.solver.count_prior_strength);
    if (!alphaCounts || sumQualityValues(alphaCounts) <= 0) return null;
    return {
        alpha_counts: alphaCounts,
        fractions: normalizeFractions(alphaCounts),
        alpha_total: roundTo(sumQualityValues(alphaCounts)),
        count_prior_strength: Number.isFinite(solverStrength) && solverStrength > 0 ? solverStrength : null
    };
}

function buildDirichletTwoSigmaIntervals(alphaCounts = {}, z = 2) {
    const alpha = QUALITIES.reduce((result, quality) => {
        const value = Number(alphaCounts[quality] || 0);
        result[quality] = Number.isFinite(value) && value > 0 ? value : 0;
        return result;
    }, {});
    const alphaTotal = sumQualityValues(alpha);

    return QUALITIES.reduce((result, quality) => {
        if (alphaTotal <= 0) {
            result[quality] = { mean: 0, sd: 0, low_2sigma: 0, high_2sigma: 0 };
            return result;
        }
        const mean = alpha[quality] / alphaTotal;
        const variance = (alpha[quality] * (alphaTotal - alpha[quality])) / ((alphaTotal ** 2) * (alphaTotal + 1));
        const sd = Math.sqrt(Math.max(variance, 0));
        result[quality] = {
            mean: roundTo(mean),
            sd: roundTo(sd),
            low_2sigma: roundTo(Math.max(0, mean - z * sd)),
            high_2sigma: roundTo(Math.min(1, mean + z * sd))
        };
        return result;
    }, {});
}

function buildMultinomialTwoSigmaFit({ counts = {}, total = null, fractions = {} } = {}) {
    const inferredTotal = total === null || total === undefined
        ? sumQualityValues(counts)
        : Number(total);
    const safeTotal = Number.isFinite(inferredTotal) && inferredTotal > 0 ? inferredTotal : 0;
    let maxAbsZ = 0;
    let allWithinTwoSigma = true;

    const observedQualities = QUALITIES.filter((quality) => Object.prototype.hasOwnProperty.call(counts, quality));
    const qualitiesToFit = observedQualities.length ? observedQualities : QUALITIES;
    const fit = qualitiesToFit.reduce((result, quality) => {
        const observed = Number(counts[quality] || 0);
        const p = Math.max(0, Math.min(1, Number(fractions[quality]) || 0));
        const expected = safeTotal * p;
        const sd = Math.sqrt(Math.max(safeTotal * p * (1 - p), 0));
        const z = sd > 0 ? (observed - expected) / sd : (observed === expected ? 0 : Infinity);
        const absZ = Math.abs(z);
        const withinTwoSigma = absZ <= 2;
        maxAbsZ = Math.max(maxAbsZ, Number.isFinite(absZ) ? absZ : Infinity);
        if (!withinTwoSigma) allWithinTwoSigma = false;
        result[quality] = {
            observed: roundTo(observed),
            expected: roundTo(expected),
            sd: roundTo(sd),
            z: Number.isFinite(z) ? roundTo(z) : null,
            within_2sigma: withinTwoSigma
        };
        return result;
    }, {});

    fit.total = roundTo(safeTotal);
    fit.max_abs_z = Number.isFinite(maxAbsZ) ? roundTo(maxAbsZ) : null;
    fit.all_within_2sigma = allWithinTwoSigma;
    return fit;
}

function buildPixelSourceWeight(pixelEntry = null) {
    if (!pixelEntry || !Number(pixelEntry.pixel_input_count || 0)) return 0;
    const inputCount = Number(pixelEntry.pixel_input_count || 0);
    const cropSensitive = Number(pixelEntry.crop_sensitive_input_count || 0);
    const lowConfidence = Number(pixelEntry.low_confidence_input_count || 0);
    const cropPenalty = inputCount > 0 ? cropSensitive / inputCount : 1;
    const lowPenalty = inputCount > 0 ? lowConfidence / inputCount : 1;
    const reliability = Math.max(0.25, 1 - Math.max(cropPenalty, lowPenalty));
    return roundTo(0.08 * reliability, 2);
}

function buildCleanReplaySourceWeight(samples = []) {
    const count = (Array.isArray(samples) ? samples : []).filter(hasFullDistributionActualCounts).length;
    if (count <= 0) return 0;
    if (count === 1) return 0.08;
    if (count === 2) return 0.14;
    return 0.25;
}

function hasFullDistributionActualCounts(sample = {}) {
    if (!sample || !isPlainObject(sample.actual_counts)) return false;
    return QUALITIES.every((quality) => Object.prototype.hasOwnProperty.call(sample.actual_counts, quality));
}

function blendFractionSources(sources = []) {
    const activeSources = sources.filter((source) => source && Number(source.weight) > 0 && isPlainObject(source.fractions));
    const totalWeight = activeSources.reduce((sum, source) => sum + Number(source.weight), 0);
    if (totalWeight <= 0) return normalizeFractions({});
    return QUALITIES.reduce((result, quality) => {
        const value = activeSources.reduce((sum, source) => {
            return sum + (Number(source.fractions[quality]) || 0) * Number(source.weight);
        }, 0) / totalWeight;
        result[quality] = roundTo(value);
        return result;
    }, {});
}

function getMapIds({ baselineConfig = {}, profiles = DEFAULT_PRODUCER_MAP_PROFILES, pixelShadowReport = {}, replaySamples = [] } = {}) {
    const ids = new Set(Object.keys(profiles));
    Object.keys(baselineConfig.maps || {}).forEach((mapId) => ids.add(mapId));
    Object.keys(pixelShadowReport.maps || {}).forEach((mapId) => {
        if (mapId !== "unknown") ids.add(mapId);
    });
    replaySamples.forEach((sample) => {
        if (sample && sample.map_id) ids.add(sample.map_id);
    });
    return Array.from(ids).sort();
}

function getSampleTotal(sample = {}) {
    const fieldValues = isPlainObject(sample.field_values) ? sample.field_values : {};
    const observedState = isPlainObject(sample.observed_state) ? sample.observed_state : {};
    const total = Number(fieldValues.total_items ?? observedState.total_items ?? observedState.r1_total_items);
    return Number.isFinite(total) && total > 0 ? total : null;
}

function buildReplayFitBySample(samples = [], fractions = {}) {
    return samples.reduce((result, sample) => {
        const id = sample.id || `sample_${Object.keys(result).length + 1}`;
        result[id] = buildMultinomialTwoSigmaFit({
            total: getSampleTotal(sample),
            counts: sample.actual_counts || {},
            fractions
        });
        return result;
    }, {});
}

function buildMapBlockers({ cleanSamples = [], pixelSourceWeight = 0, pixelEntry = null } = {}) {
    const blockers = [];
    if (!cleanSamples.length) blockers.push("missing_clean_replay_samples");
    if (cleanSamples.length < 3) blockers.push("insufficient_clean_replay_sample_size");
    if (pixelSourceWeight > 0 || pixelEntry) blockers.push("pixel_shadow_review_only");
    if (pixelEntry && Number(pixelEntry.crop_sensitive_input_count || 0) > 0) blockers.push("crop_sensitive_pixel_counts");
    if (pixelEntry && Number(pixelEntry.low_confidence_input_count || 0) > 0) blockers.push("low_confidence_pixel_blocks");
    blockers.push("producer_assumption_not_authority");
    return Array.from(new Set(blockers));
}

function buildProducerCountPriorModelReport({
    baselineConfig = defaultConfig,
    pixelShadowReport = {},
    replaySamples = [],
    profiles = DEFAULT_PRODUCER_MAP_PROFILES,
    generatedAt = new Date().toISOString()
} = {}) {
    const samples = normalizeInputPayload(replaySamples, "samples");
    const mapIds = getMapIds({ baselineConfig, profiles, pixelShadowReport, replaySamples: samples });
    const maps = {};

    mapIds.forEach((mapId) => {
        const profile = profiles[mapId] || {
            label: mapId,
            design_intent: "未知地图，沿用当前默认先验作为制作人占位。",
            archetype_weights: null,
            target_alpha_total: null,
            count_prior_strength: null
        };
        const baseline = readBaselineForMap(baselineConfig, mapId);
        const producerFractions = normalizeFractions(profile.archetype_weights || (baseline && baseline.alpha_counts) || {});
        const pixelEntry = pixelShadowReport && pixelShadowReport.maps ? pixelShadowReport.maps[mapId] : null;
        const pixelFractions = pixelEntry && isPlainObject(pixelEntry.empirical_fractions)
            ? normalizeFractions(pixelEntry.empirical_fractions)
            : normalizeFractions(pixelEntry && pixelEntry.pixel_counts ? pixelEntry.pixel_counts : {});
        const cleanSamples = samples.filter((sample) => sample && sample.map_id === mapId);
        const fullDistributionSamples = cleanSamples.filter(hasFullDistributionActualCounts);
        const cleanCounts = fullDistributionSamples.reduce((counts, sample) => {
            QUALITIES.forEach((quality) => {
                counts[quality] = (counts[quality] || 0) + (Number(sample.actual_counts && sample.actual_counts[quality]) || 0);
            });
            return counts;
        }, {});
        const cleanFractions = normalizeFractions(cleanCounts);
        const pixelSourceWeight = buildPixelSourceWeight(pixelEntry);
        const cleanReplayWeight = buildCleanReplaySourceWeight(cleanSamples);
        const sourceWeights = {
            producer_archetype: 0.55,
            current_default: baseline ? 0.25 : 0,
            pixel_shadow_direction: pixelSourceWeight,
            clean_replay_full_distribution: cleanReplayWeight
        };
        const blendedFractions = blendFractionSources([
            { name: "producer_archetype", weight: sourceWeights.producer_archetype, fractions: producerFractions },
            { name: "current_default", weight: sourceWeights.current_default, fractions: baseline ? baseline.fractions : null },
            { name: "pixel_shadow_direction", weight: sourceWeights.pixel_shadow_direction, fractions: pixelFractions },
            { name: "clean_replay_full_distribution", weight: sourceWeights.clean_replay_full_distribution, fractions: cleanFractions }
        ]);
        const alphaTotal = Number(profile.target_alpha_total) > 0
            ? Number(profile.target_alpha_total)
            : (baseline ? baseline.alpha_total : 12);
        const alphaCountsCandidate = scaleFractionsToAlphaCounts(blendedFractions, alphaTotal);

        maps[mapId] = {
            map_id: mapId,
            label: profile.label || mapId,
            design_intent: profile.design_intent,
            source_weights: sourceWeights,
            producer_archetype_fractions: producerFractions,
            current_default_fractions: baseline ? baseline.fractions : null,
            pixel_shadow_fractions: pixelEntry ? pixelFractions : null,
            clean_replay_fractions: fullDistributionSamples.length ? cleanFractions : null,
            blended_fractions: blendedFractions,
            alpha_counts_candidate: alphaCountsCandidate,
            alpha_counts_candidate_total: roundTo(sumQualityValues(alphaCountsCandidate)),
            count_prior_strength_candidate: Number(profile.count_prior_strength) > 0
                ? Number(profile.count_prior_strength)
                : (baseline && baseline.count_prior_strength) || null,
            quality_intervals: buildDirichletTwoSigmaIntervals(alphaCountsCandidate),
            pixel_shadow_two_sigma_fit: pixelEntry
                ? buildMultinomialTwoSigmaFit({
                    total: pixelEntry.pixel_total || sumQualityValues(pixelEntry.pixel_counts || {}),
                    counts: pixelEntry.pixel_counts || {},
                    fractions: blendedFractions
                })
                : null,
            clean_replay_sample_count: cleanSamples.length,
            clean_replay_full_distribution_sample_count: fullDistributionSamples.length,
            clean_replay_two_sigma_fit: buildReplayFitBySample(cleanSamples, blendedFractions),
            adoption_allowed: false,
            recommended_change_class: "RESEARCH_ONLY",
            blockers: buildMapBlockers({ cleanSamples, pixelSourceWeight, pixelEntry })
        };
    });

    return {
        schema_version: "ak_producer_count_prior_model_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        source_architecture: [
            "producer_archetype",
            "current_default",
            "discounted_pixel_shadow_direction",
            "clean_replay_full_distribution_blend",
            "clean_replay_partial_two_sigma_fit",
            "dirichlet_two_sigma_interval",
            "multinomial_two_sigma_backtest"
        ],
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        adoption_allowed: false,
        adoption_blockers: [
            "producer_assumption_not_authority",
            "insufficient_clean_replay_sample_size",
            "pixel_shadow_review_only"
        ],
        external_research_notes: EXTERNAL_RESEARCH_NOTES,
        external_research_links: EXTERNAL_RESEARCH_LINKS,
        summary: {
            map_count: Object.keys(maps).length,
            clean_replay_sample_count: samples.length,
            pixel_shadow_map_count: Object.keys(pixelShadowReport.maps || {}).filter((mapId) => mapId !== "unknown").length,
            adoption_allowed: false
        },
        maps
    };
}

module.exports = {
    DEFAULT_PRODUCER_MAP_PROFILES,
    EXTERNAL_RESEARCH_LINKS,
    EXTERNAL_RESEARCH_NOTES,
    QUALITIES,
    blendFractionSources,
    buildDirichletTwoSigmaIntervals,
    buildMultinomialTwoSigmaFit,
    buildProducerCountPriorModelReport,
    normalizeFractions,
    normalizeInputPayload,
    scaleFractionsToAlphaCounts
};
