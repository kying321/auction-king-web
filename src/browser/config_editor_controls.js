const numericInputRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./numeric_input_runtime.js")
    : (typeof AK_NUMERIC_INPUT_RUNTIME !== "undefined" ? AK_NUMERIC_INPUT_RUNTIME : (typeof window !== "undefined" ? window.AK_NUMERIC_INPUT_RUNTIME : {}));
const {
    parseLooseNumber: parseLooseNumberFromRuntime
} = numericInputRuntime;

function cloneConfig(value) {
    return JSON.parse(JSON.stringify(value));
}

const BUILTIN_TEMPLATE_FALLBACKS = {
    ahmed_default: {
        groups: [
            { id: "core", label: "核心链路" }
        ],
        fields: [
            { field_id: "total_items", group_id: "core", recommended: true, default_visible: true },
            { field_id: "orange_avg_cells", group_id: "core", recommended: true, default_visible: true },
            { field_id: "blue_count", group_id: "core", recommended: true, default_visible: true },
            { field_id: "purple_avg_cells", group_id: "core", recommended: true, default_visible: true },
            { field_id: "white_green_total_cells", group_id: "core", recommended: true, default_visible: true },
            { field_id: "white_green_avg_cells", group_id: "core", recommended: true, default_visible: true },
            { field_id: "blue_avg_cells", group_id: "core", recommended: true, default_visible: true },
            { field_id: "total_storage_cells", group_id: "core", recommended: true, default_visible: true }
        ]
    },
    generic_full_observation: {
        groups: [
            { id: "counts", label: "数量" },
            { id: "cells", label: "格数" },
            { id: "value", label: "价值" }
        ],
        fields: [
            { field_id: "total_items", group_id: "counts", recommended: true, default_visible: true },
            { field_id: "white_count", group_id: "counts", recommended: false, default_visible: true },
            { field_id: "green_count", group_id: "counts", recommended: false, default_visible: true },
            { field_id: "blue_count", group_id: "counts", recommended: true, default_visible: true },
            { field_id: "purple_count", group_id: "counts", recommended: true, default_visible: true },
            { field_id: "orange_count", group_id: "counts", recommended: false, default_visible: true },
            { field_id: "white_green_total_count", group_id: "counts", recommended: true, default_visible: true },
            { field_id: "white_green_total_cells", group_id: "cells", recommended: true, default_visible: true },
            { field_id: "white_green_avg_cells", group_id: "cells", recommended: true, default_visible: true },
            { field_id: "blue_avg_cells", group_id: "cells", recommended: true, default_visible: true },
            { field_id: "purple_avg_cells", group_id: "cells", recommended: true, default_visible: true },
            { field_id: "orange_avg_cells", group_id: "cells", recommended: true, default_visible: true },
            { field_id: "total_storage_cells", group_id: "cells", recommended: true, default_visible: true },
            { field_id: "system_avg_value_per_cell", group_id: "value", recommended: true, default_visible: true },
            { field_id: "purple_avg_value", group_id: "value", recommended: false, default_visible: true },
            { field_id: "orange_avg_value", group_id: "value", recommended: false, default_visible: true },
            { field_id: "red_avg_value", group_id: "value", recommended: false, default_visible: true },
            { field_id: "total_value", group_id: "value", recommended: false, default_visible: true },
            { field_id: "bid", group_id: "value", recommended: true, default_visible: true }
        ]
    },
    value_focus: {
        groups: [
            { id: "solver", label: "核心约束" },
            { id: "value", label: "价值观察" }
        ],
        fields: [
            { field_id: "total_items", group_id: "solver", recommended: true, default_visible: true },
            { field_id: "orange_avg_cells", group_id: "solver", recommended: true, default_visible: true },
            { field_id: "purple_avg_cells", group_id: "solver", recommended: true, default_visible: true },
            { field_id: "blue_count", group_id: "solver", recommended: true, default_visible: true },
            { field_id: "white_green_total_cells", group_id: "solver", recommended: true, default_visible: true },
            { field_id: "system_avg_value_per_cell", group_id: "value", recommended: true, default_visible: true },
            { field_id: "purple_avg_value", group_id: "value", recommended: true, default_visible: true },
            { field_id: "orange_avg_value", group_id: "value", recommended: true, default_visible: true },
            { field_id: "red_avg_value", group_id: "value", recommended: true, default_visible: true },
            { field_id: "total_value", group_id: "value", recommended: false, default_visible: true },
            { field_id: "bid", group_id: "value", recommended: true, default_visible: true }
        ]
    }
};

const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const QUALITY_LABELS = {
    w: "白",
    g: "绿",
    b: "蓝",
    p: "紫",
    o: "金",
    r: "红"
};
const AVERAGE_ROUNDING_MODE_OPTIONS = [
    { value: "truncate", label: "道具截断两位" },
    { value: "round", label: "系统四舍五入" }
];

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveTemplatePath(path, mapId) {
    return String(path || "").replaceAll(":mapId", mapId || "");
}

function parseStructuredPath(path, mapId) {
    return resolveTemplatePath(path, mapId)
        .split(".")
        .filter(Boolean)
        .map((segment) => {
            const separatorIndex = segment.indexOf(":");
            if (separatorIndex === -1) {
                return { type: "property", key: segment };
            }
            return {
                type: "arrayById",
                key: segment.slice(0, separatorIndex),
                id: segment.slice(separatorIndex + 1)
            };
        });
}

function getNestedValue(source, path, mapId) {
    const segments = parseStructuredPath(path, mapId);
    let cursor = source;

    for (const segment of segments) {
        if (segment.type === "property") {
            if (cursor === null || cursor === undefined) return undefined;
            cursor = cursor[segment.key];
            continue;
        }

        if (!Array.isArray(cursor && cursor[segment.key])) return undefined;
        cursor = cursor[segment.key].find((item) => item && item.id === segment.id);
        if (!cursor) return undefined;
    }

    return cursor;
}

function ensureNestedParent(target, path, mapId) {
    const segments = parseStructuredPath(path, mapId);
    let cursor = target;

    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        if (segment.type === "property") {
            if (!isPlainObject(cursor[segment.key])) cursor[segment.key] = {};
            cursor = cursor[segment.key];
            continue;
        }

        if (!Array.isArray(cursor[segment.key])) cursor[segment.key] = [];
        let next = cursor[segment.key].find((item) => item && item.id === segment.id);
        if (!next) {
            next = { id: segment.id };
            cursor[segment.key].push(next);
        }
        cursor = next;
    }

    return {
        parent: cursor,
        leaf: segments[segments.length - 1]
    };
}

function inferControlKind(path) {
    if (
        path === "app.default_map_id" ||
        path === "app.default_template_id" ||
        path === "solver.average_observation.rounding_mode"
    ) return "select";
    if (path === "solver.average_observation.relax_sparse_support") return "boolean";
    if (path.endsWith(".label") || path.endsWith(".map_name")) return "text";
    return "number";
}

function parseEditorValueForPath(path, rawValue) {
    const controlKind = inferControlKind(path);
    if (controlKind === "select" || controlKind === "text") {
        if (rawValue === null || rawValue === undefined) return undefined;
        const text = String(rawValue).trim();
        return text ? text : undefined;
    }
    if (controlKind === "boolean") {
        if (rawValue === "" || rawValue === null || rawValue === undefined) return undefined;
        return Number(rawValue) > 0;
    }
    if (rawValue === "" || rawValue === null || rawValue === undefined) return undefined;
    const numeric = typeof parseLooseNumberFromRuntime === "function"
        ? parseLooseNumberFromRuntime(rawValue)
        : Number(rawValue);
    return Number.isFinite(numeric) ? numeric : undefined;
}

function setNestedValue(target, path, rawValue, mapId) {
    const parsedValue = parseEditorValueForPath(path, rawValue);
    const { parent, leaf } = ensureNestedParent(target, path, mapId);

    if (leaf.type === "property") {
        if (parsedValue === undefined) delete parent[leaf.key];
        else parent[leaf.key] = parsedValue;
        return;
    }

    if (!Array.isArray(parent[leaf.key])) parent[leaf.key] = [];
    const collection = parent[leaf.key];
    const existingIndex = collection.findIndex((item) => item && item.id === leaf.id);
    if (parsedValue === undefined) {
        if (existingIndex >= 0) collection.splice(existingIndex, 1);
        return;
    }
    if (existingIndex >= 0) {
        collection[existingIndex] = parsedValue;
    } else {
        collection.push(parsedValue);
    }
}

function buildSelectControl(id, label, path, value, options) {
    return {
        id,
        label,
        path,
        kind: "select",
        value,
        options
    };
}

function buildTextControl(id, label, path, value) {
    return {
        id,
        label,
        path,
        kind: "text",
        value
    };
}

function buildNumberControl(id, label, path, value, step = "1") {
    return {
        id,
        label,
        path,
        kind: "number",
        value,
        step
    };
}

function buildBooleanControl(id, label, path, value) {
    return {
        id,
        label,
        path,
        kind: "boolean",
        value: Boolean(value)
    };
}

function buildMapQualityMatrixControl(id, label, maps) {
    return {
        id,
        label,
        kind: "map-quality-matrix",
        maps
    };
}

function buildMapValueMatrixControl(id, label, maps) {
    return {
        id,
        label,
        kind: "map-value-matrix",
        maps
    };
}

function buildValueModelMatrixControl(id, label, rows) {
    return {
        id,
        label,
        kind: "value-model-matrix",
        rows
    };
}

function buildProfilePriorMatrixControl(id, label, rows) {
    return {
        id,
        label,
        kind: "profile-prior-matrix",
        rows
    };
}

function buildFamilyBiasMatrixControl(id, label, rows) {
    return {
        id,
        label,
        kind: "family-bias-matrix",
        rows
    };
}

function buildMapQualityMatrix(config) {
    const mapEntries = Object.entries(config && config.maps ? config.maps : {});
    const maps = mapEntries.map(([mapId, mapConfig]) => ({
        map_id: mapId,
        label: (mapConfig && (mapConfig.label || mapConfig.map_name)) || mapId,
        rows: QUALITY_ORDER.map((qualityId) => ({
            quality_id: qualityId,
            quality_label: QUALITY_LABELS[qualityId] || qualityId,
            values: {
                alpha: {
                    path: `maps.${mapId}.alpha_counts.${qualityId}`,
                    value: getNestedValue(config, `maps.${mapId}.alpha_counts.${qualityId}`),
                    step: "0.01"
                },
                cells_mean: {
                    path: `maps.${mapId}.cells_per_item.${qualityId}.mean`,
                    value: getNestedValue(config, `maps.${mapId}.cells_per_item.${qualityId}.mean`),
                    step: "0.01"
                }
            }
        }))
    }));

    return buildMapQualityMatrixControl(
        "map_quality_matrix",
        "三图品质先验与均格",
        maps
    );
}

function buildMapValueMatrix(config) {
    const mapEntries = Object.entries(config && config.maps ? config.maps : {});
    const maps = mapEntries.map(([mapId, mapConfig]) => ({
        map_id: mapId,
        label: (mapConfig && (mapConfig.label || mapConfig.map_name)) || mapId,
        rows: QUALITY_ORDER.map((qualityId) => ({
            quality_id: qualityId,
            quality_label: QUALITY_LABELS[qualityId] || qualityId,
            values: {
                base_item_mean: {
                    path: `maps.${mapId}.value_model.${qualityId}.base_item_mean`,
                    value: getNestedValue(config, `maps.${mapId}.value_model.${qualityId}.base_item_mean`),
                    step: "0.01"
                },
                per_cell_mean: {
                    path: `maps.${mapId}.value_model.${qualityId}.per_cell_mean`,
                    value: getNestedValue(config, `maps.${mapId}.value_model.${qualityId}.per_cell_mean`),
                    step: "0.01"
                }
            }
        }))
    }));

    return buildMapValueMatrixControl(
        "map_value_matrix",
        "三图价值参数",
        maps
    );
}

function buildGlobalValueModelMatrix(config) {
    return buildValueModelMatrixControl(
        "model_value_matrix",
        "全局价值模型",
        QUALITY_ORDER.map((qualityId) => ({
            quality_id: qualityId,
            quality_label: QUALITY_LABELS[qualityId] || qualityId,
            values: {
                base_item_mean: {
                    path: `model.value_model.${qualityId}.base_item_mean`,
                    value: getNestedValue(config, `model.value_model.${qualityId}.base_item_mean`),
                    step: "0.01"
                },
                per_cell_mean: {
                    path: `model.value_model.${qualityId}.per_cell_mean`,
                    value: getNestedValue(config, `model.value_model.${qualityId}.per_cell_mean`),
                    step: "0.01"
                }
            }
        }))
    );
}

function buildMapRedProfileMatrix(config, mapId) {
    const profileEntries = Object.entries(getNestedValue(config, "maps.:mapId.red_type_profiles.profiles", mapId) || {});
    return buildProfilePriorMatrixControl(
        "map_red_profile_matrix",
        "当前地图红件模板",
        profileEntries.map(([profileId, profileConfig]) => ({
            profile_id: profileId,
            profile_label: (profileConfig && profileConfig.label) || profileId,
            values: {
                prior: {
                    path: `maps.:mapId.red_type_profiles.profiles.${profileId}.prior`,
                    value: getNestedValue(config, `maps.:mapId.red_type_profiles.profiles.${profileId}.prior`, mapId),
                    step: "0.01"
                }
            }
        }))
    );
}

function buildFamilyBiasMatrix(config, sourcePath, controlId, label, mapId) {
    const families = getNestedValue(config, sourcePath, mapId) || {};
    return buildFamilyBiasMatrixControl(
        controlId,
        label,
        Object.entries(families).map(([familyId, familyConfig]) => ({
            family_id: familyId,
            family_label: (familyConfig && familyConfig.label) || familyId,
            values: {
                prior: {
                    path: `${sourcePath}.${familyId}.prior`,
                    value: getNestedValue(config, `${sourcePath}.${familyId}.prior`, mapId),
                    step: "0.01"
                },
                value_bias: {
                    path: `${sourcePath}.${familyId}.value_bias`,
                    value: getNestedValue(config, `${sourcePath}.${familyId}.value_bias`, mapId),
                    step: "0.01"
                }
            }
        }))
    );
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

function cloneFallbackTemplateParts(templateId) {
    const fallback = BUILTIN_TEMPLATE_FALLBACKS[templateId];
    return fallback
        ? cloneConfig(fallback)
        : {
            groups: [{ id: "custom", label: "自定义字段" }],
            fields: []
        };
}

function normalizeTemplateForEditor(template) {
    const fallback = cloneFallbackTemplateParts(template && template.id);
    const groups = Array.isArray(template && template.groups) && template.groups.length
        ? cloneConfig(template.groups)
        : fallback.groups;
    const fields = Array.isArray(template && template.fields) && template.fields.length
        ? cloneConfig(template.fields)
        : fallback.fields;
    return {
        ...(template || {}),
        groups,
        fields
    };
}

function buildTemplateFieldControl(template, fieldCatalogIndex) {
    const normalizedTemplate = normalizeTemplateForEditor(template);
    const groupLabelIndex = {};
    normalizedTemplate.groups.forEach((group) => {
        if (!group || !group.id) return;
        groupLabelIndex[group.id] = group.label || group.id;
    });
    const selectedFieldIds = new Set(normalizedTemplate.fields.map((field) => field.field_id));
    const availableFields = Object.values(fieldCatalogIndex)
        .filter((field) => !selectedFieldIds.has(field.id))
        .map((field) => ({
            field_id: field.id,
            label: field.label || field.id
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));

    return {
        id: `template_fields_${normalizedTemplate.id}`,
        label: normalizedTemplate.label || normalizedTemplate.id,
        kind: "template-fields",
        template_id: normalizedTemplate.id,
        description: normalizedTemplate.description || "",
        groups: normalizedTemplate.groups.map((group) => ({
            id: group.id,
            label: group.label || group.id
        })),
        available_fields: availableFields,
        value: normalizedTemplate.fields.map((field) => {
            const fieldMeta = fieldCatalogIndex[field.field_id] || null;
            return {
                field_id: field.field_id,
                label: fieldMeta && fieldMeta.label ? fieldMeta.label : field.field_id,
                group_id: field.group_id || (normalizedTemplate.groups[0] ? normalizedTemplate.groups[0].id : "custom"),
                group_label: groupLabelIndex[field.group_id] || field.group_id || "custom",
                recommended: Boolean(field.recommended),
                default_visible: field.default_visible !== false,
                participates_in_solver: fieldMeta ? fieldMeta.participates_in_solver !== false : false,
                participates_in_valuation: Boolean(fieldMeta && fieldMeta.participates_in_valuation)
            };
        })
    };
}

function buildMapDetailControls(config, mapId, mapOptions) {
    return [
        buildSelectControl("default_map_id", "默认地图", "app.default_map_id", getNestedValue(config, "app.default_map_id"), mapOptions),
        buildMapRedProfileMatrix(config, mapId),
        buildFamilyBiasMatrix(config, "maps.:mapId.collection_families", "map_family_bias_matrix", "当前地图家族偏置", mapId)
    ];
}

function buildConfigEditorSections(config, selectedMapId) {
    const mapId = selectedMapId || getNestedValue(config, "app.default_map_id");
    const builtinTemplates = config && config.templates && Array.isArray(config.templates.builtins)
        ? config.templates.builtins
        : [];
    const localTemplates = config && config.templates && Array.isArray(config.templates.local)
        ? config.templates.local
        : [];
    const editableTemplates = builtinTemplates.concat(localTemplates);
    const fieldCatalogIndex = buildFieldCatalogIndex(config);
    const mapOptions = Object.keys(config && config.maps ? config.maps : {}).map((key) => ({
        value: key,
        label: (config.maps[key] && (config.maps[key].label || config.maps[key].map_name)) || key
    }));
    const templateOptions = builtinTemplates.map((template) => ({
        value: template.id,
        label: template.label || template.id
    }));

    return [
        {
            id: "template-management",
            title: "模板管理",
            description: "控制默认模板与内置模板命名，用户本地克隆模板走浏览器本地存储。",
            controls: [
                buildSelectControl("default_template_id", "默认模板", "app.default_template_id", getNestedValue(config, "app.default_template_id"), templateOptions),
                buildTextControl("template_ahmed_label", "Ahmed 模板标签", "templates.builtins:ahmed_default.label", getNestedValue(config, "templates.builtins:ahmed_default.label")),
                buildTextControl("template_value_focus_label", "价值模板标签", "templates.builtins:value_focus.label", getNestedValue(config, "templates.builtins:value_focus.label"))
            ]
        },
        {
            id: "template-field-layout",
            title: "模板字段布局",
            description: "直接调整当前可用模板的字段顺序、推荐态和默认显示态。本地模板也在这里编辑。",
            controls: editableTemplates.map((template) => buildTemplateFieldControl(template, fieldCatalogIndex))
        },
        {
            id: "field-directory",
            title: "字段目录",
            description: "规范字段标签，避免模板和表单使用零散命名。",
            controls: [
                buildTextControl("field_total_items_label", "总数量标签", "fields.items:total_items.label", getNestedValue(config, "fields.items:total_items.label")),
                buildTextControl("field_orange_avg_cells_label", "金色均格标签", "fields.items:orange_avg_cells.label", getNestedValue(config, "fields.items:orange_avg_cells.label")),
                buildTextControl("field_purple_avg_value_label", "紫色平均价值标签", "fields.items:purple_avg_value.label", getNestedValue(config, "fields.items:purple_avg_value.label"))
            ]
        },
        {
            id: "map-quality-calibration",
            title: "地图品质校准",
            description: "三张地图直接平铺显示各品质先验和均格均值，避免只看到零散字段。",
            controls: [
                buildMapQualityMatrix(config)
            ]
        },
        {
            id: "map-value-calibration",
            title: "地图价值校准",
            description: "三张地图直接平铺显示各品质基础价值和每格价值，方便按图修正估值权重。",
            controls: [
                buildMapValueMatrix(config)
            ]
        },
        {
            id: "map-detail-calibration",
            title: "当前地图专项偏置",
            description: "围绕当前选中地图调整红件先验与家族偏置；默认地图也在这里切换。",
            controls: buildMapDetailControls(config, mapId, mapOptions)
        },
        {
            id: "valuation-model",
            title: "概率与估值权重",
            description: "编辑全局模型层，不与具体地图绑定。",
            controls: [
                buildGlobalValueModelMatrix(config),
                buildFamilyBiasMatrix(config, "model.collection_families", "model_family_bias_matrix", "全局家族偏置")
            ]
        },
        {
            id: "solver",
            title: "Solver 参数",
            description: "控制状态上限、采样预算与均格观测放宽开关。",
            controls: [
                buildNumberControl("solver_max_states", "状态上限", "solver.max_states", getNestedValue(config, "solver.max_states"), "1"),
                buildNumberControl("solver_mc_samples", "Monte Carlo 样本数", "solver.mc_samples", getNestedValue(config, "solver.mc_samples"), "1"),
                buildSelectControl("solver_average_rounding_mode", "均格小数语义", "solver.average_observation.rounding_mode", getNestedValue(config, "solver.average_observation.rounding_mode") || "truncate", AVERAGE_ROUNDING_MODE_OPTIONS),
                buildBooleanControl("solver_relax_sparse_support", "放宽稀疏均格支持", "solver.average_observation.relax_sparse_support", getNestedValue(config, "solver.average_observation.relax_sparse_support")),
                buildNumberControl("solver_refine_ratio", "Refine 比例", "solver.staging.refine_ratio", getNestedValue(config, "solver.staging.refine_ratio"), "0.01")
            ]
        }
    ];
}

function applyTemplateFieldMutation(config, templateId, action) {
    const nextConfig = cloneConfig(config);
    if (!nextConfig.templates) return nextConfig;

    const templateCollections = ["builtins", "local"];
    let collectionKey = null;
    let templateIndex = -1;

    templateCollections.some((key) => {
        if (!Array.isArray(nextConfig.templates[key])) return false;
        const foundIndex = nextConfig.templates[key].findIndex((template) => template && template.id === templateId);
        if (foundIndex === -1) return false;
        collectionKey = key;
        templateIndex = foundIndex;
        return true;
    });

    if (!collectionKey || templateIndex === -1) return nextConfig;

    const template = normalizeTemplateForEditor(nextConfig.templates[collectionKey][templateIndex]);
    const fields = Array.isArray(template.fields) ? template.fields.map((field) => ({ ...field })) : [];
    const fieldIndex = fields.findIndex((field) => field && field.field_id === action.field_id);

    if (!action || typeof action !== "object" || !action.type) {
        nextConfig.templates[collectionKey][templateIndex] = template;
        return nextConfig;
    }

    if (action.type === "move" && fieldIndex >= 0) {
        const delta = action.direction === "up" ? -1 : 1;
        const nextIndex = fieldIndex + delta;
        if (nextIndex >= 0 && nextIndex < fields.length) {
            const [entry] = fields.splice(fieldIndex, 1);
            fields.splice(nextIndex, 0, entry);
        }
    }

    if (action.type === "toggle_recommended" && fieldIndex >= 0) {
        fields[fieldIndex] = {
            ...fields[fieldIndex],
            recommended: !fields[fieldIndex].recommended
        };
    }

    if (action.type === "toggle_visible" && fieldIndex >= 0) {
        fields[fieldIndex] = {
            ...fields[fieldIndex],
            default_visible: fields[fieldIndex].default_visible === false
        };
    }

    if (action.type === "remove" && fieldIndex >= 0) {
        fields.splice(fieldIndex, 1);
    }

    if (action.type === "add" && action.field_id && fieldIndex === -1) {
        if (!Array.isArray(template.groups) || !template.groups.length) {
            template.groups = [{ id: "custom", label: "自定义字段" }];
        }
        fields.push({
            field_id: action.field_id,
            group_id: action.group_id || template.groups[0].id,
            recommended: Boolean(action.recommended),
            default_visible: action.default_visible !== false
        });
    }

    nextConfig.templates[collectionKey][templateIndex] = {
        ...template,
        fields
    };
    return nextConfig;
}

function applyConfigEditorValue(config, mapId, path, rawValue) {
    const nextConfig = cloneConfig(config);
    setNestedValue(nextConfig, path, rawValue, mapId);
    return nextConfig;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        buildConfigEditorSections,
        applyTemplateFieldMutation,
        applyConfigEditorValue,
        getNestedValue,
        parseEditorValueForPath
    };
}

if (typeof window !== "undefined") {
    window.buildConfigEditorSections = buildConfigEditorSections;
    window.applyTemplateFieldMutation = applyTemplateFieldMutation;
    window.applyConfigEditorValue = applyConfigEditorValue;
}
