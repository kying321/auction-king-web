const defaultConfig = require("../core/default_config_bundle.js");
const {
    resolveReplaySampleActualCellsWithSource,
    resolveReplaySampleActualLootValue
} = require("./sample_value_replay.js");

const DEFAULT_THRESHOLDS = {
    min_value_scored_samples_per_map: 30
};

function normalizeInputPayload(payload) {
    if (Array.isArray(payload)) {
        return {
            samples: payload,
            export_context: null,
            sample_quality_summary: null,
            schema_version: null
        };
    }
    if (!payload || typeof payload !== "object") {
        return {
            samples: [],
            export_context: null,
            sample_quality_summary: null,
            schema_version: null
        };
    }
    return {
        samples: Array.isArray(payload.samples) ? payload.samples : [],
        export_context: payload.export_context || null,
        sample_quality_summary: payload.sample_quality_summary || null,
        schema_version: payload.schema_version || null
    };
}

function normalizePositiveInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeThresholds(thresholds = {}) {
    return {
        min_value_scored_samples_per_map: normalizePositiveInteger(
            thresholds.min_value_scored_samples_per_map,
            DEFAULT_THRESHOLDS.min_value_scored_samples_per_map
        )
    };
}

function normalizePackageEntry(entry, index) {
    const hasPayloadWrapper = entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "payload");
    const payload = hasPayloadWrapper ? entry.payload : entry;
    const normalized = normalizeInputPayload(payload);
    return {
        source_path: hasPayloadWrapper && entry.source_path ? String(entry.source_path) : null,
        source_index: index,
        ...normalized
    };
}

function getSampleMapId(sample = {}) {
    const mapId = sample && sample.map_id !== undefined ? String(sample.map_id).trim() : "";
    return mapId || "unknown";
}

function getSampleId(sample = {}) {
    const id = sample && sample.id !== undefined ? String(sample.id).trim() : "";
    return id || null;
}

function getObservedState(sample = {}) {
    const fieldValues = sample && sample.field_values && typeof sample.field_values === "object"
        ? sample.field_values
        : {};
    const observedState = sample && sample.observed_state && typeof sample.observed_state === "object"
        ? sample.observed_state
        : {};
    return {
        ...fieldValues,
        ...observedState
    };
}

function getSystemAverageValueHint(sample = {}) {
    const observedState = getObservedState(sample);
    const perCellValue = Number(observedState.system_avg_value_per_cell);
    if (!Number.isFinite(perCellValue) || perCellValue < 0) return null;
    const rawTypeCount = Number(observedState.system_avg_value_type_count);
    const typeCount = Number.isInteger(rawTypeCount) && rawTypeCount >= 0 ? rawTypeCount : null;
    return {
        system_avg_value_per_cell: perCellValue,
        system_avg_value_type_count: typeCount
    };
}

function createEmptyMapEntry(mapId) {
    return {
        map_id: mapId,
        sample_count: 0,
        system_hint_sample_count: 0,
        cell_scored_sample_count: 0,
        value_scored_sample_count: 0,
        missing_system_hint_count: 0,
        missing_actual_cells_count: 0,
        missing_actual_value_count: 0,
        system_avg_value_type_count_distribution: {},
        system_hint_sample_ids: [],
        cell_scored_sample_ids: [],
        value_scored_sample_ids: [],
        fit_gap: 0,
        can_fit_system_hint_anchor: false,
        recommended_change_class: "RESEARCH_ONLY",
        risk_flags: []
    };
}

function addTypeCountEvidence(entry, typeCount) {
    if (!Number.isInteger(typeCount) || typeCount < 0) return;
    const key = String(typeCount);
    entry.system_avg_value_type_count_distribution[key] =
        (entry.system_avg_value_type_count_distribution[key] || 0) + 1;
}

function addSampleId(target, sample) {
    const id = getSampleId(sample);
    if (id) target.push(id);
}

function buildTargetMapList({ packages = [], targetMaps = null } = {}) {
    const mapIds = new Set(Array.isArray(targetMaps) && targetMaps.length
        ? targetMaps
        : Object.keys(defaultConfig.maps || {}));
    packages.forEach((entry) => {
        if (entry.export_context && entry.export_context.map_id) {
            mapIds.add(String(entry.export_context.map_id));
        }
        entry.samples.forEach((sample) => {
            mapIds.add(getSampleMapId(sample));
        });
    });
    return Array.from(mapIds).sort();
}

function finalizeMapEntry(entry, thresholds) {
    const fitGap = Math.max(0, thresholds.min_value_scored_samples_per_map - entry.value_scored_sample_count);
    const riskFlags = [];
    if (entry.system_hint_sample_count < thresholds.min_value_scored_samples_per_map) {
        riskFlags.push("system_hint_sample_count_below_minimum");
    }
    if (fitGap > 0) {
        riskFlags.push("value_scored_sample_count_below_minimum");
    }
    if (entry.system_hint_sample_count > entry.cell_scored_sample_count) {
        riskFlags.push("system_hint_samples_missing_actual_cells");
    }
    if (entry.cell_scored_sample_count > entry.value_scored_sample_count) {
        riskFlags.push("system_hint_samples_missing_actual_value");
    }
    return {
        ...entry,
        fit_gap: fitGap,
        can_fit_system_hint_anchor: fitGap === 0,
        recommended_change_class: fitGap === 0 ? "SIM_ONLY" : "RESEARCH_ONLY",
        risk_flags: riskFlags
    };
}

function buildSystemHintCoverageReport({
    packages = [],
    targetMaps = null,
    thresholds = DEFAULT_THRESHOLDS
} = {}) {
    const normalizedThresholds = normalizeThresholds(thresholds);
    const normalizedPackages = (Array.isArray(packages) ? packages : [packages])
        .map((entry, index) => normalizePackageEntry(entry, index));
    const targetMapList = buildTargetMapList({ packages: normalizedPackages, targetMaps });
    const maps = {};
    targetMapList.forEach((mapId) => {
        maps[mapId] = createEmptyMapEntry(mapId);
    });

    normalizedPackages.forEach((packageEntry) => {
        packageEntry.samples.forEach((sample) => {
            const mapId = getSampleMapId(sample);
            if (!maps[mapId]) maps[mapId] = createEmptyMapEntry(mapId);
            const mapEntry = maps[mapId];
            const systemHint = getSystemAverageValueHint(sample);
            mapEntry.sample_count += 1;
            if (!systemHint) {
                mapEntry.missing_system_hint_count += 1;
                return;
            }

            mapEntry.system_hint_sample_count += 1;
            addSampleId(mapEntry.system_hint_sample_ids, sample);
            addTypeCountEvidence(mapEntry, systemHint.system_avg_value_type_count);

            const cells = resolveReplaySampleActualCellsWithSource(sample);
            const hasActualCells = Number.isFinite(cells.actual_cells);
            if (!hasActualCells) {
                mapEntry.missing_actual_cells_count += 1;
                return;
            }

            mapEntry.cell_scored_sample_count += 1;
            addSampleId(mapEntry.cell_scored_sample_ids, sample);

            const actualLootValue = resolveReplaySampleActualLootValue(sample);
            if (!Number.isFinite(actualLootValue)) {
                mapEntry.missing_actual_value_count += 1;
                return;
            }

            mapEntry.value_scored_sample_count += 1;
            addSampleId(mapEntry.value_scored_sample_ids, sample);
        });
    });

    Object.keys(maps).forEach((mapId) => {
        maps[mapId] = finalizeMapEntry(maps[mapId], normalizedThresholds);
    });

    const mapEntries = Object.values(maps).sort((left, right) => left.map_id.localeCompare(right.map_id));
    const summary = mapEntries.reduce((acc, entry) => {
        acc.input_sample_count += entry.sample_count;
        acc.system_hint_sample_count += entry.system_hint_sample_count;
        acc.cell_scored_sample_count += entry.cell_scored_sample_count;
        acc.value_scored_sample_count += entry.value_scored_sample_count;
        acc.missing_system_hint_count += entry.missing_system_hint_count;
        acc.missing_actual_cells_count += entry.missing_actual_cells_count;
        acc.missing_actual_value_count += entry.missing_actual_value_count;
        return acc;
    }, {
        package_count: normalizedPackages.length,
        target_map_count: mapEntries.length,
        input_sample_count: 0,
        system_hint_sample_count: 0,
        cell_scored_sample_count: 0,
        value_scored_sample_count: 0,
        missing_system_hint_count: 0,
        missing_actual_cells_count: 0,
        missing_actual_value_count: 0,
        maps_ready_for_system_hint_fit: mapEntries
            .filter((entry) => entry.can_fit_system_hint_anchor)
            .map((entry) => entry.map_id),
        maps_needing_system_hint_samples: mapEntries
            .filter((entry) => !entry.can_fit_system_hint_anchor)
            .map((entry) => entry.map_id)
    });

    return {
        schema_version: "ak_system_hint_coverage_report_v1",
        change_class: "RESEARCH_ONLY",
        thresholds: normalizedThresholds,
        summary,
        maps,
        packages: normalizedPackages.map((entry) => ({
            source_path: entry.source_path,
            source_index: entry.source_index,
            schema_version: entry.schema_version,
            sample_count: entry.samples.length,
            export_context: entry.export_context,
            sample_quality_summary: entry.sample_quality_summary
        }))
    };
}

module.exports = {
    DEFAULT_THRESHOLDS,
    buildSystemHintCoverageReport,
    getSystemAverageValueHint,
    normalizeInputPayload,
    normalizeThresholds
};
