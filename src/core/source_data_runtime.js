const fs = typeof require === "function" && typeof module !== "undefined" && module.exports ? require("node:fs") : null;
const path = typeof require === "function" && typeof module !== "undefined" && module.exports ? require("node:path") : null;
const sourceWorkspaceRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("../browser/workspace_runtime.js")
    : (typeof window !== "undefined" ? window.AK_WORKSPACE_RUNTIME : {});
const {
    buildLegacyEstimatorStateFromFieldValues
} = sourceWorkspaceRuntime || {};

const AUTHORITY_SOURCE_SCHEMA_VERSION = "ak_authority_source_v1";
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function normalizeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBattleSampleImportContext(payload = null) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return {
        map_id: normalizeText(payload.map_id) || null,
        map_variant_id: normalizeText(payload.map_variant_id || payload.submap_id) || null,
        map_variant_label: normalizeText(payload.map_variant_label || payload.submap_label) || null,
        filter_value: normalizeText(payload.filter_value) || "all",
        filter_label: normalizeText(payload.filter_label) || null,
        scope: normalizeText(payload.scope) || "global",
        batch_id: normalizeText(payload.batch_id) || null,
        source_artifact_version: normalizeText(payload.source_artifact_version) || null,
        exported_at: normalizeText(payload.exported_at) || null,
        sample_count: normalizeNumber(payload.sample_count),
        selected_sample_count: normalizeNumber(payload.selected_sample_count),
        skipped_sample_count: normalizeNumber(payload.skipped_sample_count)
    };
}

function normalizeSourceItem(item = {}, defaults = {}) {
    const name = normalizeText(item.name);
    const quality = normalizeText(item.quality || defaults.quality).toLowerCase();
    const value = normalizeNumber(item.value);
    const cells = normalizeNumber(item.cells);
    const nameConfidence = normalizeText(item.name_confidence) || "high";
    const metadata = cloneValue(item.metadata || {});

    if (!name || !quality || !QUALITY_ORDER.includes(quality) || !Number.isFinite(value) || value < 0) return null;

    if (item.category) metadata.category = normalizeText(item.category).toLowerCase();
    if (item.note) metadata.note = normalizeText(item.note);

    return {
        name,
        quality,
        value,
        cells: Number.isFinite(cells) && cells > 0 ? cells : null,
        name_confidence: nameConfidence,
        metadata
    };
}

function normalizeObservedState(payload = {}) {
    if (
        payload.observed_state
        && typeof payload.observed_state === "object"
        && !Array.isArray(payload.observed_state)
        && Object.keys(payload.observed_state).length > 0
    ) {
        return cloneValue(payload.observed_state);
    }
    if (
        payload.state
        && typeof payload.state === "object"
        && !Array.isArray(payload.state)
        && Object.keys(payload.state).length > 0
    ) {
        return cloneValue(payload.state);
    }
    if (payload.field_values && typeof payload.field_values === "object" && !Array.isArray(payload.field_values)) {
        const legacyState = buildLegacyEstimatorStateFromFieldValues(payload.field_values, payload.field_value_meta);
        return Object.fromEntries(
            Object.entries(legacyState).filter(([, value]) => value !== null && value !== undefined)
        );
    }
    return {};
}

function loadJson(filePath) {
    if (!fs) {
        throw new Error("Catalog file loading is only available in Node.js");
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadCatalogBatchAsSourceRecord(input) {
    const payload = typeof input === "string" ? loadJson(input) : cloneValue(input);
    const quality = normalizeText(payload.quality).toLowerCase();
    const sourceKind = normalizeText(payload.source_kind) || "manual_thread_images";
    const batchId = normalizeText(payload.batch_id) || `catalog_batch_${Date.now()}`;
    const items = Array.isArray(payload.items)
        ? payload.items.map((item) => normalizeSourceItem(item, {
            quality
        })).filter(Boolean).map((item) => ({
            ...item,
            metadata: {
                ...item.metadata,
                source_batch_id: batchId,
                source_kind: sourceKind
            }
        }))
        : [];

    return {
        record_type: "catalog_batch",
        batch_id: batchId,
        quality,
        reported_average_value: normalizeNumber(payload.reported_average_value),
        cells_status: normalizeText(payload.cells_status || payload.cell_count_status) || "unknown",
        name_status: normalizeText(payload.name_status) || "unknown",
        source_kind: sourceKind,
        notes: Array.isArray(payload.notes) ? payload.notes.map((entry) => normalizeText(entry)).filter(Boolean) : [],
        items,
        metadata: {}
    };
}

function createBattleSampleRecord(payload = {}) {
    const actualCounts = {};
    const rawActualCounts = payload.actual_counts && typeof payload.actual_counts === "object" ? payload.actual_counts : {};
    QUALITY_ORDER.forEach((quality) => {
        const numeric = normalizeNumber(rawActualCounts[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) actualCounts[quality] = numeric;
    });

    const items = Array.isArray(payload.items)
        ? payload.items.map((item, index) => normalizeSourceItem({
            name: item && item.name ? item.name : `item_${index + 1}`,
            ...item
        })).filter(Boolean)
        : [];

    return {
        record_type: "battle_sample",
        id: normalizeText(payload.id) || `battle_sample_${Date.now()}`,
        map_id: normalizeText(payload.map_id) || null,
        map_variant_id: normalizeText(payload.map_variant_id || payload.submap_id) || null,
        map_variant_label: normalizeText(payload.map_variant_label || payload.submap_label) || null,
        observed_state: normalizeObservedState(payload),
        actual_counts: actualCounts,
        actual_value: normalizeNumber(payload.actual_value ?? payload.loot_value),
        actual_cells: normalizeNumber(payload.actual_cells),
        source_kind: normalizeText(payload.source_kind) || "settlement_sample",
        items,
        metadata: payload.metadata && typeof payload.metadata === "object" ? cloneValue(payload.metadata) : {}
    };
}

function normalizeBattleSampleRecords(samples = []) {
    const uniqueRecords = new Map();
    (Array.isArray(samples) ? samples : []).forEach((entry) => {
        const record = createBattleSampleRecord(entry);
        uniqueRecords.set(record.id, record);
    });
    return Array.from(uniqueRecords.values());
}

function buildAuthoritySourcePackage({
    catalogBatchPaths = [],
    catalogBatches = [],
    battleSamples = [],
    battleSampleImportContext = null
} = {}) {
    const catalogRecords = catalogBatchPaths
        .map((filePath) => loadCatalogBatchAsSourceRecord(path ? path.resolve(filePath) : filePath))
        .concat((catalogBatches || []).map((entry) => loadCatalogBatchAsSourceRecord(entry)));
    const battleRecords = normalizeBattleSampleRecords(battleSamples);
    const normalizedBattleSampleImportContext = normalizeBattleSampleImportContext(battleSampleImportContext);

    return {
        schema_version: AUTHORITY_SOURCE_SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        catalog_batches: catalogRecords,
        battle_samples: battleRecords,
        battle_sample_import_context: normalizedBattleSampleImportContext,
        summary: {
            catalog_batch_count: catalogRecords.length,
            battle_sample_count: battleRecords.length,
            catalog_qualities: Array.from(new Set(catalogRecords.map((entry) => entry.quality))).sort(),
            maps_with_battle_samples: Array.from(new Set(battleRecords.map((entry) => entry.map_id).filter(Boolean))).sort(),
            battle_sample_import_context: cloneValue(normalizedBattleSampleImportContext)
        }
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        AUTHORITY_SOURCE_SCHEMA_VERSION,
        QUALITY_ORDER,
        normalizeBattleSampleImportContext,
        normalizeSourceItem,
        normalizeObservedState,
        loadCatalogBatchAsSourceRecord,
        createBattleSampleRecord,
        normalizeBattleSampleRecords,
        buildAuthoritySourcePackage
    };
}

if (typeof window !== "undefined") {
    window.AK_SOURCE_DATA_RUNTIME = {
        AUTHORITY_SOURCE_SCHEMA_VERSION,
        QUALITY_ORDER,
        normalizeBattleSampleImportContext,
        normalizeSourceItem,
        normalizeObservedState,
        loadCatalogBatchAsSourceRecord,
        createBattleSampleRecord,
        normalizeBattleSampleRecords,
        buildAuthoritySourcePackage
    };
}
