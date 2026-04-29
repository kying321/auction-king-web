const authoritySourceRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./source_data_runtime.js")
    : (typeof window !== "undefined" ? window.AK_SOURCE_DATA_RUNTIME : {});
const QUALITY_ORDER = Array.isArray(authoritySourceRuntime && authoritySourceRuntime.QUALITY_ORDER)
    ? authoritySourceRuntime.QUALITY_ORDER
    : ["w", "g", "b", "p", "o", "r"];

const AUTHORITY_CALIBRATION_VERSION = "ak_authority_calibration_v1";
const RED_TAIL_THRESHOLD = 200000;
const RED_TAIL_BATTLE_PROBABILITY = 0.05;
const RED_TAIL_LOG_SIGMA_BASE = 3;

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepMergeValue(base, override) {
    if (!isPlainObject(base)) return cloneValue(override);
    if (!isPlainObject(override)) return cloneValue(base);
    const output = cloneValue(base);
    Object.entries(override).forEach(([key, value]) => {
        output[key] = isPlainObject(output[key]) && isPlainObject(value)
            ? deepMergeValue(output[key], value)
            : cloneValue(value);
    });
    return output;
}

function getMapValueModelRefit(rootConfig = {}, mapId = null) {
    const mapConfig = mapId && rootConfig && rootConfig.maps ? rootConfig.maps[mapId] : null;
    const refit = mapConfig && isPlainObject(mapConfig.value_model_refit) ? mapConfig.value_model_refit : null;
    if (!refit) return null;
    return isPlainObject(refit.value_model) ? refit.value_model : refit;
}

function applyMapValueModelRefit(valueModel = {}, rootConfig = {}, mapId = null) {
    const refitValueModel = getMapValueModelRefit(rootConfig, mapId);
    if (!isPlainObject(refitValueModel)) return valueModel;
    const next = cloneValue(valueModel || {});
    Object.entries(refitValueModel).forEach(([quality, override]) => {
        if (!QUALITY_ORDER.includes(quality) || !isPlainObject(override)) return;
        next[quality] = deepMergeValue(next[quality] || {}, override);
    });
    return next;
}

function roundTo(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function average(values = []) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values = []) {
    if (values.length <= 1) return 0;
    const avg = average(values);
    const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function buildTailAwareCatalogValueStat(quality, values = [], baseFields = {}) {
    if (quality !== "r") return baseFields;
    const sortedValues = [...values].filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
    const commonValues = sortedValues.filter((value) => value < RED_TAIL_THRESHOLD);
    const tailValues = sortedValues.filter((value) => value >= RED_TAIL_THRESHOLD);
    if (!commonValues.length || !tailValues.length) return baseFields;

    const commonMean = Math.round(average(commonValues));
    const weightedTailValues = buildRedTailWeightedValues(tailValues, RED_TAIL_THRESHOLD);
    return {
        ...baseFields,
        base_item_mean: commonMean,
        base_item_sd: Math.round(sampleStandardDeviation(commonValues)),
        value_basis: "catalog_tail_aware_common_item_mean",
        tail_model: {
            threshold: RED_TAIL_THRESHOLD,
            battle_probability: RED_TAIL_BATTLE_PROBABILITY,
            catalog_tail_rate: roundTo(tailValues.length / sortedValues.length, 6),
            catalog_tail_sample_count: tailValues.length,
            replacement_item_mean: commonMean,
            values: tailValues,
            weighted_values: weightedTailValues,
            tail_weight_basis: "log_price_normal_tail",
            tail_log_sigma_base: RED_TAIL_LOG_SIGMA_BASE,
            value_basis: "catalog_over_threshold_downweighted_battle_tail"
        }
    };
}

function buildRedTailWeightedValues(values = [], threshold = RED_TAIL_THRESHOLD) {
    const rawEntries = [...values]
        .filter((value) => Number.isFinite(value) && value >= threshold)
        .sort((left, right) => left - right)
        .map((value) => {
            const z = Math.max(0, Math.log(value / threshold) / Math.log(RED_TAIL_LOG_SIGMA_BASE));
            return {
                value,
                z_score: roundTo(z, 6),
                weight: Math.exp(-0.5 * z * z)
            };
        });
    const totalWeight = rawEntries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return rawEntries.map(({ value, z_score }) => ({ value, z_score, probability: 0 }));
    return rawEntries.map(({ value, z_score, weight }) => ({
        value,
        z_score,
        probability: roundTo(weight / totalWeight, 8)
    }));
}

function blendCatalogValueStat(current = {}, suggested = null) {
    if (!suggested) return cloneValue(current);
    const suggestedMean = Number(suggested.base_item_mean);
    const suggestedSd = Number(suggested.base_item_sd);
    const base_item_mean = Number.isFinite(suggestedMean) ? Math.round(suggestedMean) : current.base_item_mean;
    const base_item_sd = Number.isFinite(suggestedSd) ? Math.round(suggestedSd) : current.base_item_sd;
    const catalogMeanIsItemValue = suggested.reported_average_used === true;
    const valueBasis = suggested.value_basis || (catalogMeanIsItemValue ? "catalog_reported_item_mean" : current.value_basis);

    return {
        ...cloneValue(current),
        base_item_mean,
        base_item_sd,
        ...(catalogMeanIsItemValue ? {
            per_cell_mean: Number.isFinite(Number(suggested.per_cell_mean)) ? suggested.per_cell_mean : 0,
            per_cell_sd: Number.isFinite(Number(suggested.per_cell_sd)) ? suggested.per_cell_sd : 0,
            value_basis: valueBasis
        } : {}),
        ...(suggested.tail_model ? { tail_model: cloneValue(suggested.tail_model) } : {})
    };
}

function buildCatalogValueStats(sourcePackage = {}) {
    const valuesByQuality = new Map();
    const reportedAveragesByQuality = new Map();
    for (const batch of sourcePackage.catalog_batches || []) {
        const batchValues = [];
        for (const item of batch.items || []) {
            if (!item || !item.quality || !Number.isFinite(item.value)) continue;
            if (!valuesByQuality.has(item.quality)) valuesByQuality.set(item.quality, []);
            valuesByQuality.get(item.quality).push(item.value);
            if (item.quality === batch.quality) batchValues.push(item.value);
        }
        const reportedAverage = Number(batch.reported_average_value);
        if (batch.quality && Number.isFinite(reportedAverage)) {
            if (!reportedAveragesByQuality.has(batch.quality)) reportedAveragesByQuality.set(batch.quality, []);
            reportedAveragesByQuality.get(batch.quality).push({
                value: reportedAverage,
                weight: batchValues.length || 1
            });
        }
    }

    return Object.fromEntries(
        Array.from(valuesByQuality.entries()).map(([quality, values]) => {
            const reportedAverages = reportedAveragesByQuality.get(quality) || [];
            const reportedWeight = reportedAverages.reduce((sum, entry) => sum + entry.weight, 0);
            const reportedMean = reportedWeight > 0
                ? reportedAverages.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / reportedWeight
                : null;
            const reportedAverageUsed = Number.isFinite(reportedMean);
            const baseFields = {
                base_item_mean: Math.round(reportedAverageUsed ? reportedMean : (average(values) || 0)),
                base_item_sd: Math.round(sampleStandardDeviation(values)),
                per_cell_mean: reportedAverageUsed ? 0 : null,
                per_cell_sd: reportedAverageUsed ? 0 : null,
                value_basis: reportedAverageUsed ? "catalog_reported_item_mean" : "catalog_item_average",
                sample_count: values.length,
                reported_average_used: reportedAverageUsed
            };
            return [quality, buildTailAwareCatalogValueStat(quality, values, baseFields)];
        })
    );
}

function buildMapCountPriorCalibration(sourcePackage = {}, config = {}, mapId) {
    const mapConfig = config && config.maps && config.maps[mapId] ? config.maps[mapId] : {};
    const defaultAlpha = cloneValue(mapConfig.alpha_counts || (config && config.model ? config.model.alpha_counts : {}) || {});
    const matchingSamples = (sourcePackage.battle_samples || []).filter((sample) => sample.map_id === mapId);
    const observationsByQuality = Object.fromEntries(QUALITY_ORDER.map((quality) => [quality, []]));

    matchingSamples.forEach((sample) => {
        QUALITY_ORDER.forEach((quality) => {
            const value = sample.actual_counts ? sample.actual_counts[quality] : null;
            if (Number.isInteger(value) && value >= 0) observationsByQuality[quality].push(value);
        });
    });

    const alphaCounts = {};
    QUALITY_ORDER.forEach((quality) => {
        const observed = observationsByQuality[quality];
        const fallback = Number(defaultAlpha[quality]) || 0;
        alphaCounts[quality] = observed.length ? roundTo(average(observed), 4) : fallback;
    });

    const fallbackQualities = QUALITY_ORDER.filter((quality) => observationsByQuality[quality].length === 0);
    const authorityStatus = !matchingSamples.length
        ? "fallback_only"
        : (fallbackQualities.length ? "sample_backed_partial" : "sample_backed");

    return {
        battle_sample_count: matchingSamples.length,
        authority_status: authorityStatus,
        alpha_counts: alphaCounts,
        observed_qualities: QUALITY_ORDER.filter((quality) => observationsByQuality[quality].length > 0),
        fallback_qualities: fallbackQualities,
        notes: !matchingSamples.length
            ? ["no_battle_samples_using_current_map_defaults"]
            : (fallbackQualities.length ? ["partial_actual_counts_using_current_map_defaults"] : [])
    };
}

function buildMapValueModelCalibration(sourcePackage = {}, config = {}, mapId, valueStats = null) {
    const catalogValueStats = valueStats || buildCatalogValueStats(sourcePackage);
    const mapConfig = config && config.maps && config.maps[mapId] ? config.maps[mapId] : {};
    const currentMapValueModel = cloneValue(mapConfig.value_model || {});
    const valueModel = {};

    QUALITY_ORDER.forEach((quality) => {
        const current = currentMapValueModel[quality] || {};
        const suggested = catalogValueStats[quality];
        if (!suggested) {
            valueModel[quality] = cloneValue(current);
            return;
        }
        valueModel[quality] = blendCatalogValueStat(current, suggested);
    });

    const catalogBatchCount = (sourcePackage.catalog_batches || []).length;
    const missingQualities = QUALITY_ORDER.filter((quality) => !catalogValueStats[quality]);
    const authorityStatus = !catalogBatchCount
        ? "fallback_only"
        : (missingQualities.length ? "catalog_backed_partial" : "catalog_backed");

    return {
        catalog_batch_count: catalogBatchCount,
        authority_status: authorityStatus,
        quality_sample_counts: Object.fromEntries(
            Object.entries(catalogValueStats).map(([quality, stats]) => [quality, stats.sample_count])
        ),
        missing_qualities: missingQualities,
        value_model: valueModel
    };
}

function deriveTopLevelAuthorityStatus(mapEntries = {}, selectStatus) {
    const statuses = Object.values(mapEntries)
        .map((entry) => selectStatus(entry))
        .filter(Boolean);
    if (!statuses.length) return "fallback_only";
    if (statuses.every((status) => status === "fallback_only")) return "fallback_only";
    if (statuses.every((status) => status === "sample_backed")) return "sample_backed";
    if (statuses.some((status) => status === "sample_backed" || status === "sample_backed_partial")) {
        return "sample_backed_partial";
    }
    if (statuses.every((status) => status === "catalog_backed")) return "catalog_backed";
    if (statuses.some((status) => status === "catalog_backed" || status === "catalog_backed_partial")) {
        return "catalog_backed_partial";
    }
    return statuses[0];
}

function buildAuthorityCalibrationArtifacts(sourcePackage = {}, defaultConfig = {}) {
    const mapIds = Object.keys(defaultConfig && defaultConfig.maps ? defaultConfig.maps : {});
    const valueStats = buildCatalogValueStats(sourcePackage);
    const maps = {};

    mapIds.forEach((mapId) => {
        maps[mapId] = {
            count_prior_calibration: buildMapCountPriorCalibration(sourcePackage, defaultConfig, mapId),
            value_model_calibration: buildMapValueModelCalibration(sourcePackage, defaultConfig, mapId, valueStats),
            cells_per_item_status: {
                adopted_fields: [],
                pending_fields: ["cells_per_item"],
                ignored_fields: ["collection_families"],
                notes: ["phase1_keeps_existing_map_cells_per_item"]
            }
        };
    });

    return {
        artifact_version: AUTHORITY_CALIBRATION_VERSION,
        generated_at: sourcePackage.generated_at || new Date().toISOString(),
        source_summary: cloneValue(sourcePackage.summary || {}),
        quality_status: {
            alpha_counts: deriveTopLevelAuthorityStatus(
                maps,
                (entry) => entry && entry.count_prior_calibration ? entry.count_prior_calibration.authority_status : null
            ),
            value_model_base_items: deriveTopLevelAuthorityStatus(
                maps,
                (entry) => entry && entry.value_model_calibration ? entry.value_model_calibration.authority_status : null
            ),
            cells_per_item: "pending",
            collection_families: "ignored_phase1"
        },
        manifest: {
            adopted_fields: ["alpha_counts", "value_model.base_item_mean", "value_model.base_item_sd", "value_model.per_cell_mean", "value_model.per_cell_sd"],
            pending_fields: ["cells_per_item"],
            ignored_fields: ["collection_families"],
            source_inputs: {
                catalog_batch_count: (sourcePackage.catalog_batches || []).length,
                battle_sample_count: (sourcePackage.battle_samples || []).length,
                battle_sample_import_context: cloneValue(sourcePackage.battle_sample_import_context || null)
            }
        },
        maps
    };
}

function applyAuthorityCalibration(config = {}, artifact = null, mapId = null) {
    const next = cloneValue(config || {});
    if (!artifact || typeof artifact !== "object") return next;
    next.calibration = cloneValue(artifact);

    const targetMapIds = mapId
        ? [mapId]
        : Object.keys(next.maps || {});

    targetMapIds.forEach((targetMapId) => {
        if (!next.maps || !next.maps[targetMapId] || !artifact.maps || !artifact.maps[targetMapId]) return;
        const mapCalibration = artifact.maps[targetMapId];
        const countPriorCalibration = mapCalibration.count_prior_calibration || {};
        if (
            countPriorCalibration.alpha_counts
            && countPriorCalibration.authority_status
            && countPriorCalibration.authority_status !== "fallback_only"
        ) {
            next.maps[targetMapId].alpha_counts = cloneValue(countPriorCalibration.alpha_counts);
        }
        next.maps[targetMapId].value_model = {
            ...(next.maps[targetMapId].value_model || {}),
            ...(cloneValue(mapCalibration.value_model_calibration.value_model) || {})
        };
        next.maps[targetMapId].value_model = applyMapValueModelRefit(next.maps[targetMapId].value_model, next, targetMapId);
    });

    return next;
}

function resolveAuthorityCalibrationEntry(config = {}, mapId = null) {
    if (!mapId || !config || typeof config !== "object" || !config.calibration || !config.calibration.maps) return null;
    return config.calibration.maps[mapId] || null;
}

function applyAuthorityCalibrationToResolvedConfig(resolvedConfig = {}, rootConfig = {}, mapId = null) {
    const next = cloneValue(resolvedConfig || {});
    const entry = resolveAuthorityCalibrationEntry(rootConfig, mapId || next.active_map_id);
    if (!entry) return next;

    const countPriorCalibration = entry.count_prior_calibration || null;
    const countPriorStatus = countPriorCalibration && typeof countPriorCalibration.authority_status === "string"
        ? countPriorCalibration.authority_status
        : null;

    if (
        countPriorCalibration
        && countPriorCalibration.alpha_counts
        && countPriorStatus
        && countPriorStatus !== "fallback_only"
    ) {
        next.alpha_counts = cloneValue(entry.count_prior_calibration.alpha_counts);
    }

    if (entry.value_model_calibration && entry.value_model_calibration.value_model) {
        const nextValueModel = cloneValue(next.value_model || {});
        Object.entries(entry.value_model_calibration.value_model).forEach(([quality, calibrationValueModel]) => {
            const current = nextValueModel[quality] || {};
            nextValueModel[quality] = {
                ...current,
                base_item_mean: calibrationValueModel.base_item_mean,
                base_item_sd: calibrationValueModel.base_item_sd,
                ...(["catalog_reported_item_mean", "catalog_tail_aware_common_item_mean"].includes(calibrationValueModel.value_basis) ? {
                    per_cell_mean: 0,
                    per_cell_sd: 0,
                    value_basis: calibrationValueModel.value_basis
                } : {}),
                ...(calibrationValueModel.tail_model ? { tail_model: cloneValue(calibrationValueModel.tail_model) } : {})
            };
        });
        next.value_model = applyMapValueModelRefit(nextValueModel, rootConfig, mapId || next.active_map_id);
    }

    next.calibration_context = {
        artifact_version: rootConfig.calibration.artifact_version,
        map_id: mapId || next.active_map_id,
        generated_at: rootConfig.calibration.generated_at,
        source_summary: cloneValue(rootConfig.calibration.source_summary || {}),
        manifest: cloneValue(rootConfig.calibration.manifest || {}),
        map_entry: cloneValue(entry)
    };

    return next;
}

const api = {
    AUTHORITY_CALIBRATION_VERSION,
    buildAuthorityCalibrationArtifacts,
    applyAuthorityCalibration,
    resolveAuthorityCalibrationEntry,
    applyAuthorityCalibrationToResolvedConfig
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}

if (typeof window !== "undefined") {
    window.AK_AUTHORITY_CALIBRATION_RUNTIME = api;
}
