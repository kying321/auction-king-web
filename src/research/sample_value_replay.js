const { resolveEstimatorConfig } = require("../core/estimator.js");
const { createBattleSampleRecord } = require("../core/source_data_runtime.js");
const {
    deepMergeConfig,
    extractValueModelOverrides,
    isStructuredWorkspaceConfig
} = require("../core/calibration_override_runtime.js");

function roundTo(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function getResolvedValueModel(config = {}, mapId = null) {
    const resolved = resolveEstimatorConfig(config || {}, mapId);
    return resolved && resolved.value_model ? resolved.value_model : {};
}

function resolveReplaySampleActualLootValue(sample = {}) {
    if (Number.isFinite(sample.actual_value)) return sample.actual_value;
    if (Number.isFinite(sample.loot_value)) return sample.loot_value;
    const itemValues = Array.isArray(sample.items)
        ? sample.items.map((item) => Number(item && item.value)).filter(Number.isFinite)
        : [];
    if (!itemValues.length) return null;
    return itemValues.reduce((sum, value) => sum + value, 0);
}

function resolveReplaySampleActualCellsWithSource(sample = {}) {
    if (Number.isFinite(sample.actual_cells)) {
        return {
            actual_cells: sample.actual_cells,
            actual_cells_source: "sample_actual_cells"
        };
    }
    if (!Array.isArray(sample.items) || !sample.items.length) {
        return {
            actual_cells: null,
            actual_cells_source: null
        };
    }
    const itemCells = sample.items.map((item) => Number(item && item.cells));
    if (!itemCells.every(Number.isFinite)) {
        return {
            actual_cells: null,
            actual_cells_source: null
        };
    }
    return {
        actual_cells: itemCells.reduce((sum, value) => sum + value, 0),
        actual_cells_source: "item_cells_sum"
    };
}

function buildSystemHintDiagnostic(sample = {}, actualLootValue = null) {
    const observedState = sample.observed_state && typeof sample.observed_state === "object"
        ? sample.observed_state
        : {};
    const perCellValue = Number(observedState.system_avg_value_per_cell);
    if (!Number.isFinite(perCellValue) || perCellValue < 0) return null;

    const rawTypeCount = Number(observedState.system_avg_value_type_count);
    const typeCount = Number.isInteger(rawTypeCount) && rawTypeCount >= 0 ? rawTypeCount : null;
    const { actual_cells: actualCells, actual_cells_source: actualCellsSource } = resolveReplaySampleActualCellsWithSource(sample);
    const predictedLootValue = Number.isFinite(actualCells)
        ? roundTo(perCellValue * actualCells, 2)
        : null;
    const error = Number.isFinite(predictedLootValue) && Number.isFinite(actualLootValue)
        ? roundTo(predictedLootValue - actualLootValue, 2)
        : null;

    return {
        system_avg_value_per_cell: roundTo(perCellValue, 2),
        system_avg_value_type_count: typeCount,
        actual_cells: Number.isFinite(actualCells) ? roundTo(actualCells, 2) : null,
        actual_cells_source: actualCellsSource,
        predicted_loot_value: predictedLootValue,
        actual_loot_value: Number.isFinite(actualLootValue) ? actualLootValue : null,
        error
    };
}

function predictSettlementItemValue(valueModelEntry = {}, item = {}) {
    const base = Number(valueModelEntry.base_item_mean) || 0;
    const perCell = Number(valueModelEntry.per_cell_mean) || 0;
    const cells = Number(item.cells) || 0;
    return roundTo(base + (cells * perCell), 2);
}

function average(numbers = []) {
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function buildMetricSummary(sampleReports = [], key) {
    const values = sampleReports.map((entry) => entry[key]).filter(Boolean);
    const errors = values.map((entry) => entry.error);
    const absErrors = values.map((entry) => Math.abs(entry.error));
    const pctErrors = values.map((entry) => entry.actual_loot_value > 0 ? Math.abs(entry.error) / entry.actual_loot_value : null).filter((value) => value !== null);

    return {
        sample_count: values.length,
        mean_error: roundTo(average(errors) || 0, 2),
        mae: roundTo(average(absErrors) || 0, 2),
        mean_abs_pct_error: roundTo(average(pctErrors) || 0, 4)
    };
}

function buildSystemHintMetricSummary(sampleReports = []) {
    const hints = sampleReports.map((entry) => entry.system_hint).filter(Boolean);
    const scoredHints = hints.filter((entry) => Number.isFinite(entry.error));
    const errors = scoredHints.map((entry) => entry.error);
    const absErrors = scoredHints.map((entry) => Math.abs(entry.error));
    const pctErrors = scoredHints
        .map((entry) => entry.actual_loot_value > 0 ? Math.abs(entry.error) / entry.actual_loot_value : null)
        .filter((value) => value !== null);

    return {
        hint_sample_count: hints.length,
        scored_sample_count: scoredHints.length,
        mean_error: roundTo(average(errors) || 0, 2),
        mae: roundTo(average(absErrors) || 0, 2),
        mean_abs_pct_error: roundTo(average(pctErrors) || 0, 4)
    };
}

function buildQualityBreakdown(sampleReports = [], key) {
    const qualityMap = new Map();
    sampleReports.forEach((sample) => {
        (sample.item_reports || []).forEach((item) => {
            const report = item[key];
            if (!report || !item.quality) return;
            if (!qualityMap.has(item.quality)) {
                qualityMap.set(item.quality, {
                    quality: item.quality,
                    sample_count: 0,
                    actual_total: 0,
                    predicted_total: 0,
                    error_total: 0
                });
            }
            const entry = qualityMap.get(item.quality);
            entry.sample_count += 1;
            entry.actual_total += item.actual_value;
            entry.predicted_total += report.predicted_value;
            entry.error_total += report.error;
        });
    });

    return Array.from(qualityMap.values())
        .map((entry) => ({
            quality: entry.quality,
            sample_count: entry.sample_count,
            actual_total: roundTo(entry.actual_total, 2),
            predicted_total: roundTo(entry.predicted_total, 2),
            error_total: roundTo(entry.error_total, 2),
            mae: roundTo(Math.abs(entry.error_total) / entry.sample_count, 2)
        }))
        .sort((left, right) => left.quality.localeCompare(right.quality));
}

function buildSettlementValueReplayReport(samples = [], baselineConfig = {}, overlayConfig = {}) {
    const normalizedSamples = Array.isArray(samples)
        ? samples.map((sample) => createBattleSampleRecord({
            ...sample,
            actual_value: sample && sample.actual_value !== undefined ? sample.actual_value : sample && sample.loot_value,
            observed_state: sample && sample.observed_state ? sample.observed_state : undefined
        }))
        : [];
    const sampleReports = normalizedSamples.map((sample) => {
        const actualLootValue = resolveReplaySampleActualLootValue(sample);
        const systemHint = buildSystemHintDiagnostic(sample, actualLootValue);
        const baselineValueModel = getResolvedValueModel(baselineConfig, sample.map_id);
        const overlayValueModel = isStructuredWorkspaceConfig(overlayConfig)
            ? getResolvedValueModel(overlayConfig, sample.map_id)
            : deepMergeConfig(baselineValueModel, extractValueModelOverrides(overlayConfig, sample.map_id));
        const itemReports = sample.items.map((item) => {
            const baselinePredictedValue = predictSettlementItemValue(baselineValueModel[item.quality], item);
            const overlayPredictedValue = predictSettlementItemValue(overlayValueModel[item.quality], item);
            return {
                quality: item.quality,
                category: item.category || (item.metadata && item.metadata.category) || null,
                cells: item.cells,
                actual_value: item.value,
                baseline: {
                    predicted_value: baselinePredictedValue,
                    error: roundTo(baselinePredictedValue - item.value, 2)
                },
                overlay: {
                    predicted_value: overlayPredictedValue,
                    error: roundTo(overlayPredictedValue - item.value, 2)
                }
            };
        });
        const baselinePredictedLootValue = roundTo(itemReports.reduce((sum, item) => sum + item.baseline.predicted_value, 0), 2);
        const overlayPredictedLootValue = roundTo(itemReports.reduce((sum, item) => sum + item.overlay.predicted_value, 0), 2);
        return {
            id: sample.id,
            map_id: sample.map_id || "unknown",
            actual_loot_value: actualLootValue,
            ...(systemHint ? { system_hint: systemHint } : {}),
            item_reports: itemReports,
            baseline: {
                predicted_loot_value: baselinePredictedLootValue,
                error: actualLootValue === null ? null : roundTo(baselinePredictedLootValue - actualLootValue, 2),
                actual_loot_value: actualLootValue
            },
            overlay: {
                predicted_loot_value: overlayPredictedLootValue,
                error: actualLootValue === null ? null : roundTo(overlayPredictedLootValue - actualLootValue, 2),
                actual_loot_value: actualLootValue
            }
        };
    }).filter((sample) => Number.isFinite(sample.actual_loot_value));

    return {
        sample_count: sampleReports.length,
        metrics: {
            baseline: buildMetricSummary(sampleReports, "baseline"),
            overlay: buildMetricSummary(sampleReports, "overlay"),
            system_hint_actual_cell_anchor: buildSystemHintMetricSummary(sampleReports)
        },
        quality_breakdown: {
            baseline: buildQualityBreakdown(sampleReports, "baseline"),
            overlay: buildQualityBreakdown(sampleReports, "overlay")
        },
        samples: sampleReports
    };
}

module.exports = {
    getMergedValueModel: getResolvedValueModel,
    resolveReplaySampleActualLootValue,
    resolveReplaySampleActualCellsWithSource,
    predictSettlementItemValue,
    buildSettlementValueReplayReport
};
