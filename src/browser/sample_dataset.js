const SETTLEMENT_SAMPLE_STORAGE_KEY = "ak_settlement_samples_v1";
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const DEFAULT_COUNT_FIT_TARGET_PER_MAP = 30;
const sourceDataRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("../core/source_data_runtime.js")
    : (typeof AK_SOURCE_DATA_RUNTIME !== "undefined" ? AK_SOURCE_DATA_RUNTIME : (typeof window !== "undefined" ? window.AK_SOURCE_DATA_RUNTIME : {}));
const workspaceRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./workspace_runtime.js")
    : (typeof AK_WORKSPACE_RUNTIME !== "undefined" ? AK_WORKSPACE_RUNTIME : (typeof window !== "undefined" ? window.AK_WORKSPACE_RUNTIME : {}));
const {
    createBattleSampleRecord: createBattleSampleRecordFromRuntime
} = sourceDataRuntime;
const {
    buildLegacyEstimatorStateFromFieldValues: buildLegacyEstimatorStateFromRuntime
} = workspaceRuntime;

function cloneSampleValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function safeReadStorage(storage, key) {
    try {
        return storage && typeof storage.getItem === "function" ? storage.getItem(key) : null;
    } catch (_error) {
        return null;
    }
}

function safeWriteStorage(storage, key, value) {
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(key, value);
}

function safeRemoveStorage(storage, key) {
    if (!storage || typeof storage.removeItem !== "function") return;
    storage.removeItem(key);
}

function normalizeSampleNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeSampleText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function normalizeSampleObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const normalized = {};
    Object.entries(value).forEach(([key, entryValue]) => {
        if (entryValue === undefined) return;
        if (entryValue === null || entryValue === "") {
            normalized[key] = null;
            return;
        }
        if (typeof entryValue === "number") {
            normalized[key] = Number.isFinite(entryValue) ? entryValue : null;
            return;
        }
        if (typeof entryValue === "string") {
            const trimmed = entryValue.trim();
            if (!trimmed) {
                normalized[key] = null;
                return;
            }
            const numeric = Number(trimmed);
            normalized[key] = Number.isFinite(numeric) ? numeric : trimmed;
            return;
        }
        normalized[key] = cloneSampleValue(entryValue);
    });
    return normalized;
}

function normalizeActualCounts(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const normalized = {};
    QUALITY_ORDER.forEach((quality) => {
        const numeric = normalizeSampleNumber(value[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) normalized[quality] = numeric;
    });
    return normalized;
}

function compactSampleObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
    );
}

function getSettlementSampleAuthorityReadiness(sample) {
    const normalized = sample && typeof sample === "object" ? sample : {};
    const hasObservedState = Boolean(
        (normalized.field_values && Object.keys(normalized.field_values).length)
        || (normalized.state && Object.keys(normalized.state).length)
        || (normalized.observed_state && Object.keys(normalized.observed_state).length)
    );
    const hasActualCounts = Boolean(normalized.actual_counts && Object.keys(normalized.actual_counts).length);
    return {
        ready: hasObservedState && hasActualCounts,
        missing_observed_state: !hasObservedState,
        missing_actual_counts: !hasActualCounts
    };
}

function getSettlementSampleCountFitReadiness(sample) {
    const authorityReadiness = getSettlementSampleAuthorityReadiness(sample);
    const actualCounts = normalizeActualCounts(sample && sample.actual_counts);
    const missingQualityCounts = QUALITY_ORDER.filter((quality) => !Object.prototype.hasOwnProperty.call(actualCounts, quality));
    const missingFullActualCounts = missingQualityCounts.length > 0;

    return {
        ready: !authorityReadiness.missing_observed_state && !missingFullActualCounts,
        missing_observed_state: authorityReadiness.missing_observed_state,
        missing_full_actual_counts: missingFullActualCounts,
        missing_quality_counts: missingQualityCounts
    };
}

function isAuthorityReadySettlementSample(sample) {
    return getSettlementSampleAuthorityReadiness(sample).ready;
}

function isCountFitReadySettlementSample(sample) {
    return getSettlementSampleCountFitReadiness(sample).ready;
}

function buildAuthorityComparableSample(sample) {
    if (typeof createBattleSampleRecordFromRuntime === "function") {
        const record = createBattleSampleRecordFromRuntime(sample);
        const comparable = {
            map_id: record.map_id || null,
            observed_state: cloneSampleValue(record.observed_state || {}),
            actual_counts: cloneSampleValue(record.actual_counts || {}),
            actual_value: normalizeSampleNumber(record.actual_value),
            actual_cells: normalizeSampleNumber(record.actual_cells),
            source_kind: normalizeSampleText(record.source_kind) || null,
            items: Array.isArray(record.items) ? cloneSampleValue(record.items) : []
        };
        if (record.map_variant_id) comparable.map_variant_id = record.map_variant_id;
        if (record.map_variant_label) comparable.map_variant_label = record.map_variant_label;
        return comparable;
    }

    const comparable = {
        map_id: sample && sample.map_id ? sample.map_id : null,
        observed_state: cloneSampleValue(sample && sample.observed_state ? sample.observed_state : {}),
        actual_counts: cloneSampleValue(sample && sample.actual_counts ? sample.actual_counts : {}),
        actual_value: normalizeSampleNumber(sample && sample.actual_value),
        actual_cells: normalizeSampleNumber(sample && sample.actual_cells),
        source_kind: normalizeSampleText(sample && sample.source_kind) || null,
        items: Array.isArray(sample && sample.items) ? cloneSampleValue(sample.items) : []
    };
    if (sample && sample.map_variant_id) comparable.map_variant_id = sample.map_variant_id;
    if (sample && sample.map_variant_label) comparable.map_variant_label = sample.map_variant_label;
    return comparable;
}

function getSettlementSampleAuthorityExportFingerprint(sample) {
    return JSON.stringify(buildAuthorityComparableSample(sample));
}

function isSettlementSampleAuthorityExported(sample) {
    if (!isAuthorityReadySettlementSample(sample)) return false;
    const authorityExportMeta = sample
        && sample.metadata
        && typeof sample.metadata.authority_export === "object"
        && !Array.isArray(sample.metadata.authority_export)
        ? sample.metadata.authority_export
        : null;
    if (!authorityExportMeta || !normalizeSampleText(authorityExportMeta.exported_at)) return false;
    return normalizeSampleText(authorityExportMeta.fingerprint) === getSettlementSampleAuthorityExportFingerprint(sample);
}

function getSettlementSampleAuthorityExportMeta(sample) {
    if (!isSettlementSampleAuthorityExported(sample)) return null;
    const authorityExportMeta = sample
        && sample.metadata
        && typeof sample.metadata.authority_export === "object"
        && !Array.isArray(sample.metadata.authority_export)
        ? sample.metadata.authority_export
        : null;
    if (!authorityExportMeta) return null;
    return {
        exported_at: normalizeSampleText(authorityExportMeta.exported_at) || null,
        scope: normalizeSampleText(authorityExportMeta.scope) || null,
        batch_id: normalizeSampleText(authorityExportMeta.batch_id) || null,
        sample_count: normalizeSampleNumber(authorityExportMeta.sample_count)
    };
}

function normalizeSettlementItem(item) {
    if (!item || typeof item !== "object") return null;
    const quality = normalizeSampleText(item.quality).toLowerCase();
    const category = normalizeSampleText(item.category).toLowerCase();
    const cells = normalizeSampleNumber(item.cells);
    const value = normalizeSampleNumber(item.value);
    const note = normalizeSampleText(item.note);

    if (!quality || !category || !Number.isFinite(cells) || !Number.isFinite(value) || cells <= 0 || value < 0) {
        return null;
    }

    const normalized = {
        quality,
        category,
        cells,
        value
    };
    if (note) normalized.note = note;
    return normalized;
}

function estimateDataUrlByteSize(dataUrl) {
    const normalizedDataUrl = normalizeSampleText(dataUrl);
    if (!normalizedDataUrl) return null;
    const commaIndex = normalizedDataUrl.indexOf(",");
    if (commaIndex === -1) return normalizedDataUrl.length;
    const payload = normalizedDataUrl.slice(commaIndex + 1);
    if (!payload) return 0;
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function normalizeScreenshotCompressionMeta(compression, hasPreviewDataUrl) {
    const source = compression && typeof compression === "object" && !Array.isArray(compression)
        ? compression
        : {};
    const normalized = {};
    const applied = source.applied === true || hasPreviewDataUrl === true;
    normalized.applied = applied;
    const maxDimension = normalizeSampleNumber(source.max_dimension ?? source.maxDimension);
    const quality = normalizeSampleNumber(source.quality);
    if (Number.isFinite(maxDimension)) normalized.max_dimension = maxDimension;
    if (Number.isFinite(quality)) normalized.quality = quality;
    const method = normalizeSampleText(source.method);
    if (method) normalized.method = method;
    return normalized;
}

function normalizeSettlementScreenshotAttachment(attachment = {}) {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) return null;
    const name = normalizeSampleText(attachment.name);
    const originalType = normalizeSampleText(attachment.original_type || attachment.originalType || attachment.type);
    const storageType = normalizeSampleText(
        attachment.thumbnail_type
        || attachment.thumbnailType
        || attachment.storage_type
        || attachment.storageType
        || attachment.type
    );
    const rawDataUrl = normalizeSampleText(attachment.data_url || attachment.dataUrl);
    const previewDataUrl = normalizeSampleText(
        attachment.thumbnail_data_url
        || attachment.thumbnailDataUrl
        || attachment.storage_data_url
        || attachment.storageDataUrl
    );
    const dataUrl = previewDataUrl || rawDataUrl;
    if (!name && !dataUrl) return null;
    const storageSize = normalizeSampleNumber(
        attachment.thumbnail_size
        ?? attachment.thumbnailSize
        ?? attachment.storage_size
        ?? attachment.storageSize
    );
    const originalSize = normalizeSampleNumber(attachment.original_size ?? attachment.originalSize ?? attachment.size);
    const estimatedStorageSize = Number.isFinite(storageSize)
        ? storageSize
        : previewDataUrl
        ? estimateDataUrlByteSize(dataUrl)
        : normalizeSampleNumber(attachment.size);
    const normalized = {
        name: name || "settlement-screenshot",
        type: storageType || "application/octet-stream",
        size: Number.isFinite(estimatedStorageSize) ? estimatedStorageSize : normalizeSampleNumber(attachment.size),
        data_url: dataUrl || null
    };
    if (Number.isFinite(originalSize) && (previewDataUrl || originalSize !== normalized.size)) normalized.original_size = originalSize;
    if (originalType && (previewDataUrl || originalType !== normalized.type)) normalized.original_type = originalType;
    [
        ["original_width", attachment.original_width ?? attachment.originalWidth],
        ["original_height", attachment.original_height ?? attachment.originalHeight],
        ["stored_width", attachment.stored_width ?? attachment.storedWidth],
        ["stored_height", attachment.stored_height ?? attachment.storedHeight]
    ].forEach(([key, value]) => {
        const numeric = normalizeSampleNumber(value);
        if (Number.isFinite(numeric)) normalized[key] = numeric;
    });
    if (previewDataUrl || attachment.compression) {
        normalized.compression = normalizeScreenshotCompressionMeta(attachment.compression, Boolean(previewDataUrl));
    }
    const lastModified = normalizeSampleNumber(attachment.last_modified ?? attachment.lastModified);
    if (Number.isFinite(lastModified)) normalized.last_modified = lastModified;
    return normalized;
}

function createSettlementSample(payload = {}) {
    return {
        record_type: normalizeSampleText(payload.record_type) || "settlement_sample",
        id: payload.id || `sample_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        created_at: payload.created_at || new Date().toISOString(),
        map_id: payload.map_id || null,
        map_variant_id: normalizeSampleText(payload.map_variant_id || payload.submap_id) || null,
        map_variant_label: normalizeSampleText(payload.map_variant_label || payload.submap_label) || null,
        bid_price: normalizeSampleNumber(payload.bid_price),
        loot_value: normalizeSampleNumber(payload.loot_value ?? payload.actual_value),
        profit: normalizeSampleNumber(payload.profit),
        items: Array.isArray(payload.items) ? payload.items.map((item) => normalizeSettlementItem(item)).filter(Boolean) : [],
        field_values: normalizeSampleObject(payload.field_values),
        field_value_meta: normalizeSampleObject(payload.field_value_meta),
        state: normalizeSampleObject(payload.state),
        observed_state: normalizeSampleObject(payload.observed_state),
        actual_counts: normalizeActualCounts(payload.actual_counts),
        actual_value: normalizeSampleNumber(payload.actual_value ?? payload.loot_value),
        actual_cells: normalizeSampleNumber(payload.actual_cells),
        raw_text: typeof payload.raw_text === "string" ? payload.raw_text : "",
        ocr_confidence: normalizeSampleNumber(payload.ocr_confidence),
        source_kind: payload.source_kind || "settlement_ocr",
        metadata: payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
            ? cloneSampleValue(payload.metadata)
            : {}
    };
}

function deriveActualCountsFromWorkspaceFieldValues(fieldValues = {}, fieldCatalogItems = []) {
    const normalizedFieldValues = fieldValues && typeof fieldValues === "object" ? fieldValues : {};
    const actualCounts = {};
    (Array.isArray(fieldCatalogItems) ? fieldCatalogItems : []).forEach((field) => {
        if (!field || field.family !== "quality" || field.metric !== "count") return;
        const quality = normalizeSampleText(field.quality).toLowerCase();
        if (!QUALITY_ORDER.includes(quality)) return;
        const numeric = normalizeSampleNumber(normalizedFieldValues[field.id]);
        if (Number.isInteger(numeric) && numeric >= 0) actualCounts[quality] = numeric;
    });
    return actualCounts;
}

function createSettlementSampleFromWorkspaceCapture(payload = {}) {
    const fieldValues = normalizeSampleObject(payload.field_values);
    const fieldValueMeta = normalizeSampleObject(payload.field_value_meta);
    const derivedState = typeof buildLegacyEstimatorStateFromRuntime === "function"
        ? compactSampleObject(buildLegacyEstimatorStateFromRuntime(fieldValues, fieldValueMeta))
        : compactSampleObject(fieldValues);
    const actualCounts = normalizeActualCounts(
        payload.actual_counts && typeof payload.actual_counts === "object"
            ? payload.actual_counts
            : deriveActualCountsFromWorkspaceFieldValues(fieldValues, payload.fieldCatalogItems)
    );
    const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
        ? cloneSampleValue(payload.metadata)
        : {};
    if (!metadata.capture_source) metadata.capture_source = "workspace_panel";

    return createSettlementSample({
        record_type: payload.record_type || "settlement_sample",
        map_id: payload.map_id || null,
        map_variant_id: payload.map_variant_id || payload.submap_id || null,
        map_variant_label: payload.map_variant_label || payload.submap_label || null,
        bid_price: payload.bid_price ?? fieldValues.bid,
        field_values: fieldValues,
        field_value_meta: fieldValueMeta,
        state: derivedState,
        observed_state: payload.observed_state || derivedState,
        actual_counts: actualCounts,
        actual_value: payload.actual_value,
        actual_cells: payload.actual_cells,
        source_kind: payload.source_kind || "workspace_capture",
        metadata
    });
}

function loadSettlementSamples(storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const raw = safeReadStorage(storage, SETTLEMENT_SAMPLE_STORAGE_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry) => createSettlementSample(entry));
    } catch (_error) {
        return [];
    }
}

function saveSettlementSamples(samples, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    safeWriteStorage(storage, SETTLEMENT_SAMPLE_STORAGE_KEY, JSON.stringify(samples.map((entry) => createSettlementSample(entry))));
    return samples;
}

function appendSettlementSample(sample, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const samples = loadSettlementSamples(storage);
    const next = samples.concat(createSettlementSample(sample));
    saveSettlementSamples(next, storage);
    return next;
}

function updateSettlementSampleById(sampleId, patch = {}, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedSampleId = normalizeSampleText(sampleId);
    if (!normalizedSampleId) return null;
    const samples = loadSettlementSamples(storage);
    const sampleIndex = samples.findIndex((entry) => entry && entry.id === normalizedSampleId);
    if (sampleIndex === -1) return null;

    const current = samples[sampleIndex];
    const nextMetadata = patch && patch.metadata && typeof patch.metadata === "object" && !Array.isArray(patch.metadata)
        ? { ...(current.metadata || {}), ...cloneSampleValue(patch.metadata) }
        : current.metadata;
    const nextSample = createSettlementSample({
        ...current,
        ...patch,
        id: current.id,
        created_at: current.created_at,
        metadata: nextMetadata
    });

    samples[sampleIndex] = nextSample;
    saveSettlementSamples(samples, storage);
    return nextSample;
}

function removeSettlementSampleById(sampleId, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedSampleId = normalizeSampleText(sampleId);
    if (!normalizedSampleId) return loadSettlementSamples(storage);
    const samples = loadSettlementSamples(storage);
    const nextSamples = samples.filter((entry) => !(entry && entry.id === normalizedSampleId));
    saveSettlementSamples(nextSamples, storage);
    return nextSamples;
}

function attachSettlementSampleScreenshot(sampleId, attachment = {}, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedAttachment = normalizeSettlementScreenshotAttachment(attachment);
    if (!normalizedAttachment) return null;
    return updateSettlementSampleById(sampleId, {
        metadata: {
            screenshot_attachment: normalizedAttachment
        }
    }, storage);
}

function clearSettlementSamples(storage = typeof localStorage !== "undefined" ? localStorage : null) {
    safeRemoveStorage(storage, SETTLEMENT_SAMPLE_STORAGE_KEY);
    return [];
}

function markSettlementSamplesExported(sampleIds, exportContext = {}, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedIds = new Set(
        (Array.isArray(sampleIds) ? sampleIds : [sampleIds])
            .map((sampleId) => normalizeSampleText(sampleId))
            .filter(Boolean)
    );
    if (!normalizedIds.size) return loadSettlementSamples(storage);

    const exportedAt = normalizeSampleText(exportContext.exported_at) || new Date().toISOString();
    const scope = normalizeSampleText(exportContext.scope) || "global";
    const batchId = normalizeSampleText(exportContext.batch_id) || `authority_export_${scope}_${Date.now()}`;
    const sampleCount = normalizeSampleNumber(exportContext.sample_count) || normalizedIds.size;
    const samples = loadSettlementSamples(storage);
    const nextSamples = samples.map((entry) => {
        if (!entry || !normalizedIds.has(entry.id) || !isAuthorityReadySettlementSample(entry)) return entry;
        return createSettlementSample({
            ...entry,
            metadata: {
                ...(entry.metadata || {}),
                authority_export: {
                    exported_at: exportedAt,
                    scope,
                    batch_id: batchId,
                    sample_count: sampleCount,
                    fingerprint: getSettlementSampleAuthorityExportFingerprint(entry)
                }
            }
        });
    });
    saveSettlementSamples(nextSamples, storage);
    return nextSamples;
}

function average(numbers) {
    if (!numbers.length) return null;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function getSystemAverageValueHint(sample) {
    const candidates = [
        sample && sample.observed_state,
        sample && sample.state,
        sample && sample.field_values
    ].filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));

    for (const source of candidates) {
        const perCellValue = normalizeSampleNumber(source.system_avg_value_per_cell);
        if (!Number.isFinite(perCellValue) || perCellValue < 0) continue;
        const typeCount = normalizeSampleNumber(source.system_avg_value_type_count);
        return {
            system_avg_value_per_cell: perCellValue,
            system_avg_value_type_count: Number.isInteger(typeCount) && typeCount >= 0 ? typeCount : null
        };
    }
    return null;
}

function resolveActualCellsForSystemHintScore(sample) {
    const directCells = normalizeSampleNumber(sample && sample.actual_cells);
    if (Number.isFinite(directCells) && directCells >= 0) return directCells;

    const items = Array.isArray(sample && sample.items) ? sample.items : [];
    if (!items.length) return null;
    const itemCells = items.map((item) => normalizeSampleNumber(item && item.cells));
    if (!itemCells.every((value) => Number.isFinite(value) && value > 0)) return null;
    return itemCells.reduce((sum, value) => sum + value, 0);
}

function normalizeBreakdownMap(sourceMap) {
    const total = Object.values(sourceMap).reduce((sum, value) => sum + value, 0);
    return Object.entries(sourceMap)
        .map(([key, count]) => ({
            key,
            count,
            weight: total > 0 ? count / total : 0
        }))
        .sort((a, b) => b.count - a.count);
}

function buildSettlementSampleStats(samples) {
    const normalized = Array.isArray(samples) ? samples.map((entry) => createSettlementSample(entry)) : [];
    const bidValues = normalized.map((entry) => entry.bid_price).filter((value) => value !== null);
    const lootValues = normalized.map((entry) => entry.loot_value ?? entry.actual_value).filter((value) => value !== null);
    const profitValues = normalized.map((entry) => entry.profit).filter((value) => value !== null);
    const mapCounts = {};
    const authorityReadyMapCounts = {};
    const qualityCounts = {};
    const categoryCounts = {};
    const qualityPerCell = {};
    const authorityUnreadyReasonCounts = {
        missing_observed_state: 0,
        missing_actual_counts: 0
    };
    const countFitUnreadyReasonCounts = {
        missing_observed_state: 0,
        missing_full_actual_counts: 0
    };
    let itemCount = 0;
    let authorityReadySampleCount = 0;
    let countFitReadySampleCount = 0;
    let authorityExportedSampleCount = 0;
    let authorityPendingExportSampleCount = 0;
    let latestAuthorityExportMeta = null;
    let systemHintSampleCount = 0;
    let systemHintScoredSampleCount = 0;

    normalized.forEach((entry) => {
        const mapKey = entry.map_id || "unknown";
        mapCounts[mapKey] = (mapCounts[mapKey] || 0) + 1;
        if (getSystemAverageValueHint(entry)) {
            systemHintSampleCount += 1;
            if (Number.isFinite(resolveActualCellsForSystemHintScore(entry))) {
                systemHintScoredSampleCount += 1;
            }
        }
        const readiness = getSettlementSampleAuthorityReadiness(entry);
        if (readiness.ready) {
            authorityReadySampleCount += 1;
            authorityReadyMapCounts[mapKey] = (authorityReadyMapCounts[mapKey] || 0) + 1;
            const exportMeta = getSettlementSampleAuthorityExportMeta(entry);
            if (exportMeta) {
                authorityExportedSampleCount += 1;
                if (!latestAuthorityExportMeta || String(exportMeta.exported_at).localeCompare(String(latestAuthorityExportMeta.exported_at)) > 0) {
                    latestAuthorityExportMeta = exportMeta;
                }
            } else authorityPendingExportSampleCount += 1;
        } else {
            if (readiness.missing_observed_state) authorityUnreadyReasonCounts.missing_observed_state += 1;
            if (readiness.missing_actual_counts) authorityUnreadyReasonCounts.missing_actual_counts += 1;
        }
        const countFitReadiness = getSettlementSampleCountFitReadiness(entry);
        if (countFitReadiness.ready) {
            countFitReadySampleCount += 1;
        } else {
            if (countFitReadiness.missing_observed_state) countFitUnreadyReasonCounts.missing_observed_state += 1;
            if (countFitReadiness.missing_full_actual_counts) countFitUnreadyReasonCounts.missing_full_actual_counts += 1;
        }
        entry.items.forEach((item) => {
            itemCount += 1;
            if (item && item.quality) qualityCounts[item.quality] = (qualityCounts[item.quality] || 0) + 1;
            if (item && item.category) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
            if (item && item.quality && Number.isFinite(item.cells) && item.cells > 0 && Number.isFinite(item.value)) {
                if (!qualityPerCell[item.quality]) qualityPerCell[item.quality] = [];
                qualityPerCell[item.quality].push(item.value / item.cells);
            }
        });
    });

    return {
        sample_count: normalized.length,
        authority_ready_sample_count: authorityReadySampleCount,
        authority_exported_sample_count: authorityExportedSampleCount,
        authority_pending_export_sample_count: authorityPendingExportSampleCount,
        count_fit_ready_sample_count: countFitReadySampleCount,
        latest_authority_exported_at: latestAuthorityExportMeta ? latestAuthorityExportMeta.exported_at : null,
        latest_authority_export_scope: latestAuthorityExportMeta ? latestAuthorityExportMeta.scope : null,
        latest_authority_export_batch_id: latestAuthorityExportMeta ? latestAuthorityExportMeta.batch_id : null,
        latest_authority_export_sample_count: latestAuthorityExportMeta ? latestAuthorityExportMeta.sample_count : null,
        authority_unready_reason_counts: authorityUnreadyReasonCounts,
        count_fit_unready_reason_counts: countFitUnreadyReasonCounts,
        system_hint_sample_count: systemHintSampleCount,
        system_hint_scored_sample_count: systemHintScoredSampleCount,
        item_count: itemCount,
        average_items_per_sample: normalized.length ? itemCount / normalized.length : null,
        average_bid_price: average(bidValues),
        average_loot_value: average(lootValues),
        average_profit: average(profitValues),
        scene_distribution: normalizeBreakdownMap(mapCounts),
        authority_ready_scene_distribution: normalizeBreakdownMap(authorityReadyMapCounts),
        quality_weights: normalizeBreakdownMap(qualityCounts),
        category_weights: normalizeBreakdownMap(categoryCounts),
        per_cell_avg_by_quality: Object.entries(qualityPerCell)
            .map(([quality, values]) => ({ quality, average_value_per_cell: average(values), sample_count: values.length }))
            .sort((a, b) => b.sample_count - a.sample_count)
    };
}

function normalizeCollectionMapIds(samples = [], mapIds = []) {
    const explicitMapIds = (Array.isArray(mapIds) ? mapIds : [])
        .map((mapId) => normalizeSampleText(mapId))
        .filter(Boolean);
    if (explicitMapIds.length) return Array.from(new Set(explicitMapIds));

    return Array.from(new Set(
        (Array.isArray(samples) ? samples : [])
            .map((sample) => normalizeSampleText(sample && sample.map_id))
            .filter(Boolean)
    )).sort();
}

function buildSettlementCollectionProgress(samples = [], mapIds = [], options = {}) {
    const normalized = Array.isArray(samples) ? samples.map((entry) => createSettlementSample(entry)) : [];
    const targetFromOptions = Number(options && options.target_per_map);
    const targetPerMap = Number.isInteger(targetFromOptions) && targetFromOptions > 0
        ? targetFromOptions
        : DEFAULT_COUNT_FIT_TARGET_PER_MAP;
    const normalizedMapIds = normalizeCollectionMapIds(normalized, mapIds);
    const mapProgress = {};
    let totalCountFitReadySampleCount = 0;
    let totalCountFitGap = 0;
    let nextMapId = null;

    normalizedMapIds.forEach((mapId) => {
        const mapSamples = normalized.filter((sample) => sample && sample.map_id === mapId);
        const authorityReadySampleCount = mapSamples.filter((sample) => isAuthorityReadySettlementSample(sample)).length;
        const countFitReadySampleCount = mapSamples.filter((sample) => isCountFitReadySettlementSample(sample)).length;
        const countFitGap = Math.max(0, targetPerMap - countFitReadySampleCount);
        const entry = {
            map_id: mapId,
            sample_count: mapSamples.length,
            authority_ready_sample_count: authorityReadySampleCount,
            count_fit_ready_sample_count: countFitReadySampleCount,
            target_count_fit_ready_sample_count: targetPerMap,
            count_fit_gap: countFitGap,
            ready_for_count_fit: countFitGap === 0
        };

        mapProgress[mapId] = entry;
        totalCountFitReadySampleCount += countFitReadySampleCount;
        totalCountFitGap += countFitGap;
        if (!nextMapId && countFitGap > 0) nextMapId = mapId;
    });

    return {
        target_per_map: targetPerMap,
        map_count: normalizedMapIds.length,
        target_total_count_fit_ready_sample_count: targetPerMap * normalizedMapIds.length,
        total_count_fit_ready_sample_count: totalCountFitReadySampleCount,
        total_count_fit_gap: totalCountFitGap,
        next_map_id: nextMapId,
        next_action: nextMapId ? "capture_same_battle_full_quality_counts" : "ready_for_count_fit_replay",
        maps: mapProgress
    };
}

function exportSettlementSamples(storage = typeof localStorage !== "undefined" ? localStorage : null) {
    return JSON.stringify(loadSettlementSamples(storage), null, 2);
}

function serializeAuthorityBattleSamples(samples) {
    return JSON.stringify(
        samples
            .filter((entry) => isAuthorityReadySettlementSample(entry))
            .map((entry) => (
                typeof createBattleSampleRecordFromRuntime === "function"
                    ? createBattleSampleRecordFromRuntime(entry)
                    : entry
            )),
        null,
        2
    );
}

function exportAuthorityBattleSamples(storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const samples = loadSettlementSamples(storage)
    return serializeAuthorityBattleSamples(samples);
}

function exportAuthorityBattleSamplesForMap(mapId, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedMapId = normalizeSampleText(mapId);
    if (!normalizedMapId) return JSON.stringify([], null, 2);
    const samples = loadSettlementSamples(storage)
        .filter((entry) => entry && entry.map_id === normalizedMapId);
    return serializeAuthorityBattleSamples(samples);
}

function exportAuthorityBattleSamplesByIds(sampleIds, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedIds = new Set(
        (Array.isArray(sampleIds) ? sampleIds : [sampleIds])
            .map((sampleId) => normalizeSampleText(sampleId))
            .filter(Boolean)
    );
    if (!normalizedIds.size) return JSON.stringify([], null, 2);
    const samples = loadSettlementSamples(storage)
        .filter((entry) => entry && normalizedIds.has(entry.id));
    return serializeAuthorityBattleSamples(samples);
}

function buildSampleQualitySummary(samples = []) {
    const normalized = Array.isArray(samples) ? samples.map((entry) => createSettlementSample(entry)) : [];
    const stats = buildSettlementSampleStats(normalized);
    return {
        sample_count: normalized.length,
        system_hint: {
            sample_count: stats.system_hint_sample_count,
            scored_sample_count: stats.system_hint_scored_sample_count,
            missing_system_hint_count: Math.max(0, normalized.length - stats.system_hint_sample_count),
            missing_actual_cells_count: Math.max(0, stats.system_hint_sample_count - stats.system_hint_scored_sample_count)
        }
    };
}

function buildSettlementCalibrationReplayPackage(sampleIds, exportContext = {}, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedIds = (Array.isArray(sampleIds) ? sampleIds : [sampleIds])
        .map((sampleId) => normalizeSampleText(sampleId))
        .filter(Boolean);
    const samples = JSON.parse(exportAuthorityBattleSamplesByIds(normalizedIds, storage));
    return {
        schema_version: "ak_settlement_calibration_replay_package_v1",
        export_kind: "settlement_calibration_replay",
        export_context: {
            map_id: normalizeSampleText(exportContext.map_id) || null,
            filter_value: normalizeSampleText(exportContext.filter_value) || "all",
            filter_label: normalizeSampleText(exportContext.filter_label) || null,
            exported_at: normalizeSampleText(exportContext.exported_at) || new Date().toISOString(),
            sample_count: samples.length,
            selected_sample_count: normalizedIds.length,
            skipped_sample_count: Math.max(0, normalizedIds.length - samples.length)
        },
        sample_quality_summary: buildSampleQualitySummary(samples),
        samples
    };
}

function buildSettlementAuthorityExportPackage(sampleIds, exportContext = {}, storage = typeof localStorage !== "undefined" ? localStorage : null) {
    const normalizedIds = (Array.isArray(sampleIds) ? sampleIds : [sampleIds])
        .map((sampleId) => normalizeSampleText(sampleId))
        .filter(Boolean);
    const samples = JSON.parse(exportAuthorityBattleSamplesByIds(normalizedIds, storage));
    return {
        schema_version: "ak_authority_battle_sample_package_v1",
        export_kind: "authority_battle_samples",
        export_context: {
            map_id: normalizeSampleText(exportContext.map_id) || null,
            filter_value: normalizeSampleText(exportContext.filter_value) || "all",
            filter_label: normalizeSampleText(exportContext.filter_label) || null,
            scope: normalizeSampleText(exportContext.scope) || "global",
            batch_id: normalizeSampleText(exportContext.batch_id) || null,
            source_artifact_version: normalizeSampleText(exportContext.source_artifact_version) || null,
            exported_at: normalizeSampleText(exportContext.exported_at) || new Date().toISOString(),
            sample_count: samples.length,
            selected_sample_count: normalizedIds.length,
            skipped_sample_count: Math.max(0, normalizedIds.length - samples.length)
        },
        samples
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SETTLEMENT_SAMPLE_STORAGE_KEY,
        QUALITY_ORDER,
        DEFAULT_COUNT_FIT_TARGET_PER_MAP,
        createSettlementSample,
        createSettlementSampleFromWorkspaceCapture,
        normalizeSettlementItem,
        normalizeSettlementScreenshotAttachment,
        normalizeActualCounts,
        getSettlementSampleAuthorityReadiness,
        getSettlementSampleCountFitReadiness,
        isAuthorityReadySettlementSample,
        isCountFitReadySettlementSample,
        getSettlementSampleAuthorityExportFingerprint,
        isSettlementSampleAuthorityExported,
        getSettlementSampleAuthorityExportMeta,
        loadSettlementSamples,
        saveSettlementSamples,
        appendSettlementSample,
        updateSettlementSampleById,
        removeSettlementSampleById,
        attachSettlementSampleScreenshot,
        clearSettlementSamples,
        markSettlementSamplesExported,
        buildSettlementSampleStats,
        buildSettlementCollectionProgress,
        buildSettlementCalibrationReplayPackage,
        buildSettlementAuthorityExportPackage,
        exportAuthorityBattleSamplesByIds,
        exportAuthorityBattleSamplesForMap,
        exportAuthorityBattleSamples,
        exportSettlementSamples
    };
}

if (typeof window !== "undefined") {
    window.AK_SAMPLE_DATASET_RUNTIME = {
        SETTLEMENT_SAMPLE_STORAGE_KEY,
        QUALITY_ORDER,
        DEFAULT_COUNT_FIT_TARGET_PER_MAP,
        createSettlementSample,
        createSettlementSampleFromWorkspaceCapture,
        normalizeSettlementItem,
        normalizeSettlementScreenshotAttachment,
        normalizeActualCounts,
        getSettlementSampleAuthorityReadiness,
        getSettlementSampleCountFitReadiness,
        isAuthorityReadySettlementSample,
        isCountFitReadySettlementSample,
        getSettlementSampleAuthorityExportFingerprint,
        isSettlementSampleAuthorityExported,
        getSettlementSampleAuthorityExportMeta,
        loadSettlementSamples,
        saveSettlementSamples,
        appendSettlementSample,
        updateSettlementSampleById,
        removeSettlementSampleById,
        attachSettlementSampleScreenshot,
        clearSettlementSamples,
        markSettlementSamplesExported,
        buildSettlementSampleStats,
        buildSettlementCollectionProgress,
        buildSettlementCalibrationReplayPackage,
        buildSettlementAuthorityExportPackage,
        exportAuthorityBattleSamplesByIds,
        exportAuthorityBattleSamplesForMap,
        exportAuthorityBattleSamples,
        exportSettlementSamples
    };
    window.SETTLEMENT_SAMPLE_STORAGE_KEY = SETTLEMENT_SAMPLE_STORAGE_KEY;
    window.QUALITY_ORDER = QUALITY_ORDER;
    window.DEFAULT_COUNT_FIT_TARGET_PER_MAP = DEFAULT_COUNT_FIT_TARGET_PER_MAP;
    window.createSettlementSample = createSettlementSample;
    window.createSettlementSampleFromWorkspaceCapture = createSettlementSampleFromWorkspaceCapture;
    window.normalizeSettlementItem = normalizeSettlementItem;
    window.normalizeSettlementScreenshotAttachment = normalizeSettlementScreenshotAttachment;
    window.normalizeActualCounts = normalizeActualCounts;
    window.getSettlementSampleAuthorityReadiness = getSettlementSampleAuthorityReadiness;
    window.getSettlementSampleCountFitReadiness = getSettlementSampleCountFitReadiness;
    window.isAuthorityReadySettlementSample = isAuthorityReadySettlementSample;
    window.isCountFitReadySettlementSample = isCountFitReadySettlementSample;
    window.getSettlementSampleAuthorityExportFingerprint = getSettlementSampleAuthorityExportFingerprint;
    window.isSettlementSampleAuthorityExported = isSettlementSampleAuthorityExported;
    window.getSettlementSampleAuthorityExportMeta = getSettlementSampleAuthorityExportMeta;
    window.loadSettlementSamples = loadSettlementSamples;
    window.saveSettlementSamples = saveSettlementSamples;
    window.appendSettlementSample = appendSettlementSample;
    window.updateSettlementSampleById = updateSettlementSampleById;
    window.removeSettlementSampleById = removeSettlementSampleById;
    window.attachSettlementSampleScreenshot = attachSettlementSampleScreenshot;
    window.clearSettlementSamples = clearSettlementSamples;
    window.markSettlementSamplesExported = markSettlementSamplesExported;
    window.buildSettlementSampleStats = buildSettlementSampleStats;
    window.buildSettlementCollectionProgress = buildSettlementCollectionProgress;
    window.buildSettlementCalibrationReplayPackage = buildSettlementCalibrationReplayPackage;
    window.buildSettlementAuthorityExportPackage = buildSettlementAuthorityExportPackage;
    window.exportAuthorityBattleSamplesByIds = exportAuthorityBattleSamplesByIds;
    window.exportAuthorityBattleSamplesForMap = exportAuthorityBattleSamplesForMap;
    window.exportAuthorityBattleSamples = exportAuthorityBattleSamples;
    window.exportSettlementSamples = exportSettlementSamples;
}
