const fs = require("node:fs");
const path = require("node:path");
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const RED_TAIL_THRESHOLD = 200000;
const RED_TAIL_BATTLE_PROBABILITY = 0.05;
const RED_TAIL_LOG_SIGMA_BASE = 3;

function roundTo(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function normalizeCatalogText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function normalizeCatalogNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeManualCatalogItem(item) {
    if (!item || typeof item !== "object") return null;
    const name = normalizeCatalogText(item.name);
    const value = normalizeCatalogNumber(item.value);
    const cells = normalizeCatalogNumber(item.cells);
    const nameConfidence = normalizeCatalogText(item.name_confidence) || "medium";

    if (!name || !Number.isFinite(value) || value < 0) return null;

    return {
        name,
        value,
        cells: Number.isFinite(cells) && cells > 0 ? cells : null,
        name_confidence: nameConfidence
    };
}

function normalizeManualCatalogBatch(payload = {}) {
    return {
        batch_id: normalizeCatalogText(payload.batch_id) || `manual_catalog_${Date.now()}`,
        source_kind: normalizeCatalogText(payload.source_kind) || "manual_thread_images",
        quality: normalizeCatalogText(payload.quality).toLowerCase(),
        reported_average_value: normalizeCatalogNumber(payload.reported_average_value),
        cell_count_status: normalizeCatalogText(payload.cell_count_status) || "unknown",
        name_status: normalizeCatalogText(payload.name_status) || "unknown",
        notes: Array.isArray(payload.notes) ? payload.notes.map((entry) => normalizeCatalogText(entry)).filter(Boolean) : [],
        items: Array.isArray(payload.items) ? payload.items.map((item) => normalizeManualCatalogItem(item)).filter(Boolean) : []
    };
}

function loadManualCatalogBatch(filePath) {
    return normalizeManualCatalogBatch(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function loadManualCatalogBatchesFromDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) return [];
    return fs.readdirSync(directoryPath)
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .map((entry) => loadManualCatalogBatch(path.join(directoryPath, entry)))
        .filter((batch) => batch.quality && Array.isArray(batch.items) && batch.items.length > 0);
}

function median(numbers) {
    if (!numbers.length) return null;
    const sorted = [...numbers].sort((left, right) => left - right);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(numbers) {
    if (!numbers.length) return null;
    const avg = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    const variance = numbers.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / numbers.length;
    return Math.sqrt(variance);
}

function sampleStandardDeviation(numbers) {
    if (numbers.length <= 1) return 0;
    const avg = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    const variance = numbers.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (numbers.length - 1);
    return Math.sqrt(variance);
}

function average(numbers) {
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function buildRedTailAwareValueModel(values = [], baseFields = {}) {
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

function buildManualCatalogStats(batches = []) {
    const normalized = batches.map((batch) => normalizeManualCatalogBatch(batch));
    const qualityMap = new Map();
    const reportedAverageMap = new Map();

    normalized.forEach((batch) => {
        let batchItemCount = 0;
        batch.items.forEach((item) => {
            if (!item || !batch.quality) return;
            if (!qualityMap.has(batch.quality)) qualityMap.set(batch.quality, []);
            qualityMap.get(batch.quality).push(item.value);
            batchItemCount += 1;
        });
        if (batch.quality && Number.isFinite(batch.reported_average_value)) {
            if (!reportedAverageMap.has(batch.quality)) reportedAverageMap.set(batch.quality, []);
            reportedAverageMap.get(batch.quality).push({
                value: batch.reported_average_value,
                weight: batchItemCount || 1
            });
        }
    });

    const qualities = Array.from(qualityMap.entries())
        .map(([quality, values]) => {
            const reportedEntries = reportedAverageMap.get(quality) || [];
            const reportedWeight = reportedEntries.reduce((sum, entry) => sum + entry.weight, 0);
            const reportedAverage = reportedWeight > 0
                ? roundTo(reportedEntries.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / reportedWeight, 2)
                : null;
            return {
                quality,
                item_count: values.length,
                average_value: roundTo(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
                reported_average_value: reportedAverage,
                median_value: roundTo(median(values), 2),
                min_value: Math.min(...values),
                max_value: Math.max(...values),
                value_sd: roundTo(standardDeviation(values), 2)
            };
        })
        .sort((left, right) => left.quality.localeCompare(right.quality));

    return {
        batch_count: normalized.length,
        item_count: qualities.reduce((sum, entry) => sum + entry.item_count, 0),
        qualities
    };
}

function buildValueModelCalibrationFromManualCatalog(batches = []) {
    const normalized = batches.map((batch) => normalizeManualCatalogBatch(batch));
    const stats = buildManualCatalogStats(normalized);
    const batchCountByQuality = {};
    const valueMapByQuality = {};

    normalized.forEach((batch) => {
        if (!batch.quality) return;
        batchCountByQuality[batch.quality] = (batchCountByQuality[batch.quality] || 0) + 1;
        if (!valueMapByQuality[batch.quality]) valueMapByQuality[batch.quality] = [];
        batch.items.forEach((item) => {
            if (item && Number.isFinite(item.value)) valueMapByQuality[batch.quality].push(item.value);
        });
    });

    return Object.fromEntries(
        stats.qualities.map((entry) => {
            const values = valueMapByQuality[entry.quality] || [];
            const baseFields = {
                base_item_mean: Math.round(Number.isFinite(entry.reported_average_value)
                    ? entry.reported_average_value
                    : entry.average_value),
                base_item_sd: Math.round(sampleStandardDeviation(values)),
                per_cell_mean: Number.isFinite(entry.reported_average_value) ? 0 : null,
                per_cell_sd: Number.isFinite(entry.reported_average_value) ? 0 : null,
                value_basis: Number.isFinite(entry.reported_average_value) ? "catalog_reported_item_mean" : "catalog_item_average",
                sample_count: entry.item_count,
                source_batches: batchCountByQuality[entry.quality] || 0
            };
            return [
                entry.quality,
                entry.quality === "r" ? buildRedTailAwareValueModel(values, baseFields) : baseFields
            ];
        })
    );
}

function getCurrentValueModelByQuality(config, quality) {
    const maps = Object.entries(config && config.maps ? config.maps : {})
        .map(([mapId, mapConfig]) => [mapId, mapConfig && mapConfig.value_model ? mapConfig.value_model[quality] || null : null])
        .filter(([, valueModel]) => valueModel);

    return {
        global: config && config.model && config.model.value_model ? config.model.value_model[quality] || null : null,
        maps: Object.fromEntries(maps)
    };
}

function buildManualCatalogCalibrationSnapshot(batches = [], config = {}) {
    const normalized = batches.map((batch) => normalizeManualCatalogBatch(batch));
    const stats = buildManualCatalogStats(normalized);
    const calibration = buildValueModelCalibrationFromManualCatalog(normalized);

    return {
        batch_count: normalized.length,
        quality_summaries: stats.qualities.map((entry) => {
            const suggested = calibration[entry.quality] || null;
            const current = getCurrentValueModelByQuality(config, entry.quality);
            return {
                quality: entry.quality,
                observed_average_value: entry.average_value,
                observed_value_sd: entry.value_sd,
                suggested_value_model: suggested,
                current_value_model: current,
                deltas: {
                    global_base_item_mean: current.global ? suggested.base_item_mean - current.global.base_item_mean : null,
                    ...Object.fromEntries(
                        Object.entries(current.maps || {}).map(([mapId, valueModel]) => [
                            `${mapId}_base_item_mean`,
                            valueModel ? suggested.base_item_mean - valueModel.base_item_mean : null
                        ])
                    )
                },
                pending_fields: suggested && ["catalog_reported_item_mean", "catalog_tail_aware_common_item_mean"].includes(suggested.value_basis)
                    ? []
                    : ["per_cell_mean", "per_cell_sd"]
            };
        })
    };
}

function mergeValueModelWithCalibration(baseValueModel = {}, calibration = {}) {
    const nextValueModel = {};
    const qualities = new Set([
        ...Object.keys(baseValueModel || {}),
        ...Object.keys(calibration || {})
    ]);

    qualities.forEach((quality) => {
        const current = baseValueModel && baseValueModel[quality] ? baseValueModel[quality] : null;
        const suggested = calibration && calibration[quality] ? calibration[quality] : null;
        if (!current && !suggested) return;

        nextValueModel[quality] = {
            ...(current || {}),
            ...(suggested ? {
                base_item_mean: suggested.base_item_mean,
                base_item_sd: suggested.base_item_sd,
                ...(["catalog_reported_item_mean", "catalog_tail_aware_common_item_mean"].includes(suggested.value_basis) ? {
                    per_cell_mean: suggested.per_cell_mean,
                    per_cell_sd: suggested.per_cell_sd,
                    value_basis: suggested.value_basis,
                    ...(suggested.tail_model ? { tail_model: suggested.tail_model } : {})
                } : {})
            } : {})
        };
    });

    return nextValueModel;
}

function buildValueModelOverlayFromManualCatalog(batches = [], config = {}) {
    const normalized = batches.map((batch) => normalizeManualCatalogBatch(batch));
    const calibration = buildValueModelCalibrationFromManualCatalog(normalized);
    const globalValueModel = config && config.model ? config.model.value_model || {} : {};
    const maps = Object.fromEntries(
        Object.entries(config && config.maps ? config.maps : {}).map(([mapId, mapConfig]) => [
            mapId,
            {
                value_model: mergeValueModelWithCalibration(
                    mapConfig && mapConfig.value_model ? mapConfig.value_model : {},
                    calibration
                )
            }
        ])
    );

    return {
        source_batch_count: normalized.length,
        source_quality_count: Object.keys(calibration).length,
        caution: [
            "research_only",
            "catalog_item_mean_value_basis",
            "per_cell_params_zeroed_when_reported_average_is_used"
        ],
        model: {
            value_model: mergeValueModelWithCalibration(globalValueModel, calibration)
        },
        maps
    };
}

function buildExpectedCountMix(alphaCounts = {}, totalItems = 0) {
    if (!Number.isInteger(totalItems) || totalItems <= 0) return {};
    const entries = QUALITY_ORDER
        .map((quality) => ({
            quality,
            alpha: Number(alphaCounts[quality]) || 0
        }))
        .filter((entry) => entry.alpha > 0);
    const totalAlpha = entries.reduce((sum, entry) => sum + entry.alpha, 0);
    if (totalAlpha <= 0) return {};

    const seeded = entries.map((entry) => {
        const exact = (entry.alpha / totalAlpha) * totalItems;
        const floor = Math.floor(exact);
        return {
            quality: entry.quality,
            floor,
            remainder: exact - floor
        };
    });
    let remaining = totalItems - seeded.reduce((sum, entry) => sum + entry.floor, 0);
    seeded.sort((left, right) => {
        if (right.remainder !== left.remainder) return right.remainder - left.remainder;
        return QUALITY_ORDER.indexOf(left.quality) - QUALITY_ORDER.indexOf(right.quality);
    });
    for (let index = 0; index < seeded.length && remaining > 0; index += 1, remaining -= 1) {
        seeded[index].floor += 1;
    }
    return Object.fromEntries(seeded.map((entry) => [entry.quality, entry.floor]));
}

function buildExpectedCellMix(counts = {}, cellsPerItem = {}) {
    return Object.fromEntries(
        QUALITY_ORDER.map((quality) => [
            quality,
            roundTo((Number(counts[quality]) || 0) * ((cellsPerItem[quality] && Number(cellsPerItem[quality].mean)) || 0), 2)
        ])
    );
}

function computeDeterministicScenarioValue(valueModel = {}, counts = {}, cells = {}) {
    return roundTo(
        QUALITY_ORDER.reduce((sum, quality) => {
            const vm = valueModel[quality] || {};
            return sum
                + ((Number(counts[quality]) || 0) * (Number(vm.base_item_mean) || 0))
                + ((Number(cells[quality]) || 0) * (Number(vm.per_cell_mean) || 0));
        }, 0),
        2
    );
}

function getMergedMapResearchConfig(config = {}, mapId) {
    const model = config.model || {};
    const mapConfig = config.maps && config.maps[mapId] ? config.maps[mapId] : {};
    return {
        alpha_counts: { ...(model.alpha_counts || {}), ...(mapConfig.alpha_counts || {}) },
        cells_per_item: { ...(model.cells_per_item || {}), ...(mapConfig.cells_per_item || {}) },
        value_model: { ...(model.value_model || {}), ...(mapConfig.value_model || {}) }
    };
}

function buildValueModelImpactReport(overlay = {}, config = {}, options = {}) {
    const totals = Array.isArray(options.totals) && options.totals.length ? options.totals : [24, 30, 36];
    const scenarios = [];
    const unitImpactsByMap = {};

    Object.keys(config.maps || {}).forEach((mapId) => {
        const baseline = getMergedMapResearchConfig(config, mapId);
        const overlayValueModel = overlay.maps && overlay.maps[mapId] ? overlay.maps[mapId].value_model || {} : baseline.value_model;
        unitImpactsByMap[mapId] = QUALITY_ORDER.map((quality) => {
            const counts = { [quality]: 1 };
            const cells = { [quality]: roundTo((baseline.cells_per_item[quality] && Number(baseline.cells_per_item[quality].mean)) || 0, 2) };
            const baselineValue = computeDeterministicScenarioValue(baseline.value_model, counts, cells);
            const overlayValue = computeDeterministicScenarioValue(overlayValueModel, counts, cells);
            return {
                quality,
                expected_cells: cells[quality],
                baseline_value: baselineValue,
                overlay_value: overlayValue,
                delta_value: roundTo(overlayValue - baselineValue, 2),
                delta_ratio: baselineValue > 0 ? roundTo((overlayValue - baselineValue) / baselineValue, 4) : null
            };
        });

        totals.forEach((totalItems) => {
            const counts = buildExpectedCountMix(baseline.alpha_counts, totalItems);
            const cells = buildExpectedCellMix(counts, baseline.cells_per_item);
            const baselineValue = computeDeterministicScenarioValue(baseline.value_model, counts, cells);
            const overlayValue = computeDeterministicScenarioValue(overlayValueModel, counts, cells);
            scenarios.push({
                scenario_id: `${mapId}_${totalItems}`,
                map_id: mapId,
                total_items: totalItems,
                counts,
                expected_cells: cells,
                baseline_value: baselineValue,
                overlay_value: overlayValue,
                delta_value: roundTo(overlayValue - baselineValue, 2),
                delta_ratio: baselineValue > 0 ? roundTo((overlayValue - baselineValue) / baselineValue, 4) : null
            });
        });
    });

    return {
        caution: [
            "research_only",
            "deterministic_expected_mix",
            "uses_alpha_counts_and_mean_cells",
            "per_cell_params_preserved_from_overlay"
        ],
        totals,
        unit_impacts_by_map: unitImpactsByMap,
        scenarios
    };
}

module.exports = {
    QUALITY_ORDER,
    normalizeManualCatalogItem,
    normalizeManualCatalogBatch,
    loadManualCatalogBatch,
    loadManualCatalogBatchesFromDirectory,
    buildManualCatalogStats,
    buildValueModelCalibrationFromManualCatalog,
    buildManualCatalogCalibrationSnapshot,
    buildValueModelOverlayFromManualCatalog,
    buildExpectedCountMix,
    buildExpectedCellMix,
    computeDeterministicScenarioValue,
    buildValueModelImpactReport
};
