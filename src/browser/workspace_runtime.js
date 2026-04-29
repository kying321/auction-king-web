function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function mergeConfig(base, override) {
    if (!isPlainObject(base)) return override === undefined ? cloneValue(base) : cloneValue(override);

    const output = cloneValue(base);
    if (!isPlainObject(override)) return output;

    Object.keys(override).forEach((key) => {
        const baseValue = output[key];
        const overrideValue = override[key];
        if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
            output[key] = mergeConfig(baseValue, overrideValue);
        } else {
            output[key] = cloneValue(overrideValue);
        }
    });

    return output;
}

const LEGACY_STATE_DEFAULTS = {
    r1_total_items: null,
    r1_blue_count: null,
    w_total_cells: null,
    g_total_cells: null,
    b_total_cells: null,
    p_total_cells: null,
    o_total_cells: null,
    r_total_cells: null,
    r2_orange_avg: null,
    r2_orange_avg_text: null,
    r2_purple_count: null,
    r2_orange_count: null,
    r2_white_green_cells: null,
    r3_green_count: null,
    r3_purple_avg: null,
    r3_purple_avg_text: null,
    r3_white_green_avg: null,
    r3_white_green_avg_text: null,
    r4_blue_avg: null,
    r4_blue_avg_text: null,
    r4_total_storage_cells: null,
    r5_white_green_total: null,
    r5_white_count: null,
    custom_o_min: null,
    custom_o_max: null,
    custom_r_min: null,
    custom_r_max: null,
    custom_p_value_w: null,
    custom_o_value_w: null,
    custom_r_value_w: null,
    system_avg_value_type_count: null,
    system_avg_value_per_cell: null,
    bid_price: null
};

const FIELD_TO_LEGACY_STATE_KEY = {
    total_items: "r1_total_items",
    blue_count: "r1_blue_count",
    white_total_cells: "w_total_cells",
    green_total_cells: "g_total_cells",
    blue_total_cells: "b_total_cells",
    purple_total_cells: "p_total_cells",
    orange_total_cells: "o_total_cells",
    red_total_cells: "r_total_cells",
    orange_avg_cells: "r2_orange_avg",
    purple_count: "r2_purple_count",
    orange_count: "r2_orange_count",
    white_green_total_cells: "r2_white_green_cells",
    green_count: "r3_green_count",
    purple_avg_cells: "r3_purple_avg",
    white_green_avg_cells: "r3_white_green_avg",
    blue_avg_cells: "r4_blue_avg",
    total_storage_cells: "r4_total_storage_cells",
    white_green_total_count: "r5_white_green_total",
    white_count: "r5_white_count",
    orange_count_min: "custom_o_min",
    orange_count_max: "custom_o_max",
    red_count_min: "custom_r_min",
    red_count_max: "custom_r_max",
    system_avg_value_type_count: "system_avg_value_type_count",
    system_avg_value_per_cell: "system_avg_value_per_cell",
    bid: "bid_price"
};

const EXACT_COUNT_BOUND_FIELDS = {
    red_count: ["custom_r_min", "custom_r_max"]
};

const AVG_TEXT_FIELD_MAP = {
    orange_avg_cells: "r2_orange_avg_text",
    purple_avg_cells: "r3_purple_avg_text",
    white_green_avg_cells: "r3_white_green_avg_text",
    blue_avg_cells: "r4_blue_avg_text"
};

const AVG_ROUNDING_MODE_FIELD_MAP = {
    orange_avg_cells: "r2_orange_avg_rounding_mode",
    purple_avg_cells: "r3_purple_avg_rounding_mode",
    white_green_avg_cells: "r3_white_green_avg_rounding_mode",
    blue_avg_cells: "r4_blue_avg_rounding_mode"
};

const VALUE_OVERRIDE_FIELD_MAP = {
    purple_avg_value: "custom_p_value_w",
    orange_avg_value: "custom_o_value_w",
    red_avg_value: "custom_r_value_w"
};

function normalizeNumericValue(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeNumericText(value) {
    if (value === null || value === undefined || value === "") return null;
    const text = String(value).trim();
    return text ? text : null;
}

function isAverageCellFieldId(fieldId) {
    return !!(fieldId && AVG_TEXT_FIELD_MAP[fieldId]);
}

function normalizeAverageSourceMeta(value) {
    if (!isPlainObject(value)) return null;
    const sourceMode = value.source_mode || value.sourceMode || null;
    const roundingMode = value.rounding_mode || value.roundingMode || null;
    if (sourceMode === "public_round" || roundingMode === "round") {
        return {
            source_mode: "public_round",
            rounding_mode: "round"
        };
    }
    return null;
}

function getAverageRoundingModeFromMeta(value) {
    return normalizeAverageSourceMeta(value) ? "round" : "truncate";
}

function normalizeFieldValueForStorage(field, value) {
    const numericValue = normalizeNumericValue(value);
    if (numericValue === null) return null;
    if (field && isAverageCellFieldId(field.id) && numericValue === 0) return null;
    if (field && field.input_mode === "decimal" && typeof value === "string") {
        return normalizeNumericText(value);
    }
    return numericValue;
}

function buildLegacyEstimatorStateFromFieldValues(fieldValues, fieldValueMeta = {}) {
    const state = { ...LEGACY_STATE_DEFAULTS };
    const source = isPlainObject(fieldValues) ? fieldValues : {};
    const sourceMeta = isPlainObject(fieldValueMeta) ? fieldValueMeta : {};

    Object.entries(FIELD_TO_LEGACY_STATE_KEY).forEach(([fieldId, legacyKey]) => {
        const numericValue = normalizeNumericValue(source[fieldId]);
        if (isAverageCellFieldId(fieldId) && numericValue === 0) return;
        if (numericValue !== null) state[legacyKey] = numericValue;
    });

    Object.entries(EXACT_COUNT_BOUND_FIELDS).forEach(([fieldId, legacyKeys]) => {
        const numericValue = normalizeNumericValue(source[fieldId]);
        if (numericValue === null) return;
        legacyKeys.forEach((legacyKey) => {
            state[legacyKey] = numericValue;
        });
    });

    Object.entries(AVG_TEXT_FIELD_MAP).forEach(([fieldId, legacyKey]) => {
        if (normalizeNumericValue(source[fieldId]) === 0) {
            state[legacyKey] = null;
            return;
        }
        state[legacyKey] = normalizeNumericText(source[fieldId]);
    });

    Object.entries(AVG_ROUNDING_MODE_FIELD_MAP).forEach(([fieldId, legacyKey]) => {
        const numericValue = normalizeNumericValue(source[fieldId]);
        if (numericValue !== null && numericValue !== 0) {
            state[legacyKey] = getAverageRoundingModeFromMeta(sourceMeta[fieldId]);
        }
    });

    Object.entries(VALUE_OVERRIDE_FIELD_MAP).forEach(([fieldId, legacyKey]) => {
        const numericValue = normalizeNumericValue(source[fieldId]);
        if (numericValue !== null) state[legacyKey] = numericValue;
    });

    return state;
}

function buildFieldCatalogIndex(config) {
    const index = {};
    const items = config && config.fields && Array.isArray(config.fields.items) ? config.fields.items : [];
    items.forEach((field) => {
        if (!field || typeof field.id !== "string" || !field.id) return;
        index[field.id] = field;
    });
    return index;
}

function listWorkspaceTemplates(config) {
    const builtins = config && config.templates && Array.isArray(config.templates.builtins)
        ? config.templates.builtins
        : [];
    const locals = config && config.templates && Array.isArray(config.templates.local)
        ? config.templates.local
        : [];
    return builtins.concat(locals).map((template) => cloneValue(template));
}

function cloneTemplateDefinition(template, overrides = {}) {
    const base = isPlainObject(template) ? cloneValue(template) : {};
    return mergeConfig(base, overrides);
}

function upsertLocalTemplate(localTemplates, template) {
    const nextTemplate = cloneValue(template);
    const items = Array.isArray(localTemplates) ? localTemplates.map((item) => cloneValue(item)) : [];
    const existingIndex = items.findIndex((item) => item && item.id === nextTemplate.id);
    if (existingIndex >= 0) {
        items[existingIndex] = nextTemplate;
    } else {
        items.push(nextTemplate);
    }
    return items;
}

function removeLocalTemplateById(localTemplates, templateId) {
    if (!Array.isArray(localTemplates)) return [];
    return localTemplates
        .filter((template) => template && template.id !== templateId)
        .map((template) => cloneValue(template));
}

function buildEffectiveWorkspaceConfig(defaultConfig, overrides = {}, localTemplates = []) {
    const effective = mergeConfig(defaultConfig, overrides);
    const templates = isPlainObject(effective.templates) ? effective.templates : {};
    effective.templates = {
        ...templates,
        local: Array.isArray(localTemplates) ? localTemplates.map((template) => cloneValue(template)) : []
    };
    return effective;
}

function normalizeWorkspaceState(config, savedState) {
    const fieldCatalogIndex = buildFieldCatalogIndex(config);
    const fieldIds = Object.keys(fieldCatalogIndex);
    const templateIds = new Set(listWorkspaceTemplates(config).map((template) => template.id));
    const mapIds = new Set(Object.keys(config && config.maps ? config.maps : {}));
    const defaults = config && config.app ? config.app : {};
    const source = isPlainObject(savedState) ? savedState : {};
    const rawFieldValues = isPlainObject(source.field_values) ? source.field_values : {};
    const rawFieldValueMeta = isPlainObject(source.field_value_meta) ? source.field_value_meta : {};

    const activeTemplateId = templateIds.has(source.active_template_id)
        ? source.active_template_id
        : (templateIds.has(defaults.default_template_id) ? defaults.default_template_id : (templateIds.values().next().value || null));
    const activeMapId = mapIds.has(source.active_map_id)
        ? source.active_map_id
        : (mapIds.has(defaults.default_map_id) ? defaults.default_map_id : (mapIds.values().next().value || null));

    const fieldValues = {};
    fieldIds.forEach((fieldId) => {
        fieldValues[fieldId] = normalizeFieldValueForStorage(fieldCatalogIndex[fieldId], rawFieldValues[fieldId]);
    });
    const fieldValueMeta = {};
    fieldIds.forEach((fieldId) => {
        const field = fieldCatalogIndex[fieldId];
        if (!field || field.input_mode !== "decimal") return;
        const normalizedMeta = normalizeAverageSourceMeta(rawFieldValueMeta[fieldId]);
        if (normalizedMeta) fieldValueMeta[fieldId] = normalizedMeta;
    });

    return {
        active_template_id: activeTemplateId,
        active_map_id: activeMapId,
        field_values: fieldValues,
        field_value_meta: fieldValueMeta
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        LEGACY_STATE_DEFAULTS,
        FIELD_TO_LEGACY_STATE_KEY,
        AVG_TEXT_FIELD_MAP,
        AVG_ROUNDING_MODE_FIELD_MAP,
        VALUE_OVERRIDE_FIELD_MAP,
        mergeConfig,
        normalizeAverageSourceMeta,
        getAverageRoundingModeFromMeta,
        buildFieldCatalogIndex,
        listWorkspaceTemplates,
        buildLegacyEstimatorStateFromFieldValues,
        buildEffectiveWorkspaceConfig,
        normalizeWorkspaceState,
        cloneTemplateDefinition,
        upsertLocalTemplate,
        removeLocalTemplateById
    };
}

if (typeof window !== "undefined") {
    window.AK_WORKSPACE_RUNTIME = {
        LEGACY_STATE_DEFAULTS,
        FIELD_TO_LEGACY_STATE_KEY,
        AVG_TEXT_FIELD_MAP,
        AVG_ROUNDING_MODE_FIELD_MAP,
        VALUE_OVERRIDE_FIELD_MAP,
        mergeConfig,
        normalizeAverageSourceMeta,
        getAverageRoundingModeFromMeta,
        buildFieldCatalogIndex,
        listWorkspaceTemplates,
        buildLegacyEstimatorStateFromFieldValues,
        buildEffectiveWorkspaceConfig,
        normalizeWorkspaceState,
        cloneTemplateDefinition,
        upsertLocalTemplate,
        removeLocalTemplateById
    };
}
