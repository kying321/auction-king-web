const defaultConfig = require("../core/default_config_bundle.js");

const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const DEFAULT_THRESHOLDS = {
    min_count_scored_samples_per_map_quality: 30
};

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeInputPayload(payload) {
    if (Array.isArray(payload)) {
        return {
            samples: payload,
            export_context: null,
            sample_quality_summary: null,
            schema_version: null
        };
    }
    if (!isPlainObject(payload)) {
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
        min_count_scored_samples_per_map_quality: normalizePositiveInteger(
            thresholds.min_count_scored_samples_per_map_quality,
            DEFAULT_THRESHOLDS.min_count_scored_samples_per_map_quality
        )
    };
}

function normalizePackageEntry(entry, index) {
    const hasPayloadWrapper = isPlainObject(entry) && Object.prototype.hasOwnProperty.call(entry, "payload");
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

function hasKeys(value) {
    return isPlainObject(value) && Object.keys(value).length > 0;
}

function hasObservedState(sample = {}) {
    return hasKeys(sample.observed_state) || hasKeys(sample.state) || hasKeys(sample.field_values);
}

function normalizeActualCounts(actualCounts = {}) {
    if (!isPlainObject(actualCounts)) return {};
    return QUALITY_ORDER.reduce((result, quality) => {
        const numeric = Number(actualCounts[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) result[quality] = numeric;
        return result;
    }, {});
}

function buildQualityCounter(initialValue) {
    return QUALITY_ORDER.reduce((result, quality) => {
        result[quality] = initialValue;
        return result;
    }, {});
}

function createEmptyMapEntry(mapId) {
    return {
        map_id: mapId,
        sample_count: 0,
        observed_state_sample_count: 0,
        missing_observed_state_count: 0,
        full_actual_counts_sample_count: 0,
        full_actual_count_sample_ids: [],
        full_count_fit_scored_sample_count: 0,
        full_count_fit_scored_sample_ids: [],
        actual_count_sample_count_by_quality: buildQualityCounter(0),
        actual_count_sample_ids_by_quality: buildQualityCounter(null),
        count_fit_scored_sample_count_by_quality: buildQualityCounter(0),
        count_fit_scored_sample_ids_by_quality: buildQualityCounter(null),
        fit_gap_by_quality: buildQualityCounter(0),
        ready_qualities: [],
        blocked_qualities: [],
        observed_state_fit_gap: 0,
        full_count_fit_scored_gap: 0,
        two_sigma_count_fit_allowed: false,
        recommended_change_class: "RESEARCH_ONLY",
        risk_flags: []
    };
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
    const threshold = thresholds.min_count_scored_samples_per_map_quality;
    const fitGapByQuality = {};
    const readyQualities = [];
    const blockedQualities = [];
    QUALITY_ORDER.forEach((quality) => {
        const gap = Math.max(0, threshold - entry.count_fit_scored_sample_count_by_quality[quality]);
        fitGapByQuality[quality] = gap;
        if (gap === 0) readyQualities.push(quality);
        else blockedQualities.push(quality);
    });
    const observedStateFitGap = Math.max(0, threshold - entry.observed_state_sample_count);
    const fullCountFitScoredGap = Math.max(0, threshold - entry.full_count_fit_scored_sample_count);
    const riskFlags = [];
    if (observedStateFitGap > 0) riskFlags.push("observed_state_sample_count_below_minimum");
    if (blockedQualities.length) riskFlags.push("quality_count_sample_count_below_minimum");
    if (blockedQualities.length) riskFlags.push("count_fit_scored_sample_count_below_minimum");
    if (entry.full_actual_counts_sample_count < threshold) riskFlags.push("full_actual_counts_sample_count_below_minimum");
    if (fullCountFitScoredGap > 0) riskFlags.push("full_count_fit_scored_sample_count_below_minimum");
    if (entry.missing_observed_state_count > 0) riskFlags.push("samples_missing_observed_state");
    if (QUALITY_ORDER.some((quality) => (
        entry.actual_count_sample_count_by_quality[quality] > entry.count_fit_scored_sample_count_by_quality[quality]
    ))) {
        riskFlags.push("actual_count_labels_without_observed_state");
    }

    return {
        ...entry,
        fit_gap_by_quality: fitGapByQuality,
        ready_qualities: readyQualities,
        blocked_qualities: blockedQualities,
        observed_state_fit_gap: observedStateFitGap,
        full_count_fit_scored_gap: fullCountFitScoredGap,
        two_sigma_count_fit_allowed: observedStateFitGap === 0
            && blockedQualities.length === 0
            && fullCountFitScoredGap === 0,
        recommended_change_class: observedStateFitGap === 0
            && blockedQualities.length === 0
            && fullCountFitScoredGap === 0
            ? "SIM_ONLY"
            : "RESEARCH_ONLY",
        risk_flags: riskFlags
    };
}

function buildSettlementCountFitReadinessReport({
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
            const actualCounts = normalizeActualCounts(sample && sample.actual_counts);
            const observed = hasObservedState(sample);

            mapEntry.sample_count += 1;
            if (observed) mapEntry.observed_state_sample_count += 1;
            else mapEntry.missing_observed_state_count += 1;

            if (QUALITY_ORDER.every((quality) => Object.prototype.hasOwnProperty.call(actualCounts, quality))) {
                mapEntry.full_actual_counts_sample_count += 1;
                addSampleId(mapEntry.full_actual_count_sample_ids, sample);
                if (observed) {
                    mapEntry.full_count_fit_scored_sample_count += 1;
                    addSampleId(mapEntry.full_count_fit_scored_sample_ids, sample);
                }
            }

            QUALITY_ORDER.forEach((quality) => {
                if (!Object.prototype.hasOwnProperty.call(actualCounts, quality)) return;
                mapEntry.actual_count_sample_count_by_quality[quality] += 1;
                if (!Array.isArray(mapEntry.actual_count_sample_ids_by_quality[quality])) {
                    mapEntry.actual_count_sample_ids_by_quality[quality] = [];
                }
                addSampleId(mapEntry.actual_count_sample_ids_by_quality[quality], sample);
                if (!observed) return;
                mapEntry.count_fit_scored_sample_count_by_quality[quality] += 1;
                if (!Array.isArray(mapEntry.count_fit_scored_sample_ids_by_quality[quality])) {
                    mapEntry.count_fit_scored_sample_ids_by_quality[quality] = [];
                }
                addSampleId(mapEntry.count_fit_scored_sample_ids_by_quality[quality], sample);
            });
        });
    });

    Object.keys(maps).forEach((mapId) => {
        maps[mapId] = finalizeMapEntry(maps[mapId], normalizedThresholds);
    });

    const mapEntries = Object.values(maps).sort((left, right) => left.map_id.localeCompare(right.map_id));
    const summary = mapEntries.reduce((acc, entry) => {
        acc.input_sample_count += entry.sample_count;
        acc.observed_state_sample_count += entry.observed_state_sample_count;
        acc.full_actual_counts_sample_count += entry.full_actual_counts_sample_count;
        acc.full_count_fit_scored_sample_count += entry.full_count_fit_scored_sample_count;
        return acc;
    }, {
        package_count: normalizedPackages.length,
        target_map_count: mapEntries.length,
        input_sample_count: 0,
        observed_state_sample_count: 0,
        full_actual_counts_sample_count: 0,
        full_count_fit_scored_sample_count: 0,
        maps_ready_for_count_fit: mapEntries
            .filter((entry) => entry.two_sigma_count_fit_allowed)
            .map((entry) => entry.map_id),
        maps_needing_count_samples: mapEntries
            .filter((entry) => !entry.two_sigma_count_fit_allowed)
            .map((entry) => entry.map_id)
    });

    return {
        schema_version: "ak_settlement_count_fit_readiness_report_v1",
        change_class: "RESEARCH_ONLY",
        thresholds: normalizedThresholds,
        evaluated_qualities: QUALITY_ORDER.slice(),
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
    QUALITY_ORDER,
    buildSettlementCountFitReadinessReport,
    normalizeActualCounts,
    normalizeInputPayload,
    normalizeThresholds
};
