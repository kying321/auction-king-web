const numericInputRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./numeric_input_runtime.js")
    : (typeof AK_NUMERIC_INPUT_RUNTIME !== "undefined" ? AK_NUMERIC_INPUT_RUNTIME : (typeof window !== "undefined" ? window.AK_NUMERIC_INPUT_RUNTIME : {}));
const {
    configureNumericInput: configureNumericInputFromRuntime,
    parseLooseNumber: parseLooseNumberFromRuntime
} = numericInputRuntime;

const DEFAULT_FIELD_PANEL_OPTIONS = {
    familyOrder: ["aggregate", "quality", "combo", "constraint"],
    familyLabels: {
        aggregate: "聚合观测",
        quality: "品质观测",
        combo: "组合观测",
        constraint: "边界约束"
    },
    qualityOrder: { w: 0, g: 1, b: 2, p: 3, o: 4, r: 5 },
    qualityLabels: { w: "白色", g: "绿色", b: "蓝色", p: "紫色", o: "金色", r: "红色" },
    metricOrder: {
        bid: 0,
        count: 1,
        avg_cells: 2,
        total_cells: 3,
        avg_value: 4,
        total_value: 5,
        min_count: 6,
        max_count: 7
    }
};

function defaultSetElementText(element, text) {
    if (!element) return;
    element.innerText = text || "";
    element.textContent = text || "";
}

function defaultClearElementContent(element) {
    if (!element) return;
    element.innerHTML = "";
    element.innerText = "";
    element.textContent = "";
    if (Array.isArray(element.children)) {
        element.children.length = 0;
    }
    if (Array.isArray(element.options)) {
        element.options.length = 0;
    }
}

function defaultParseLooseNumber(value) {
    if (typeof parseLooseNumberFromRuntime === "function") return parseLooseNumberFromRuntime(value);
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().replace(/[，,]/g, "");
    if (!normalized) return null;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
}

function getFieldInputStorageValue(field, rawValue, parseLooseNumber = defaultParseLooseNumber) {
    if (field && field.input_mode === "decimal") {
        const text = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
        if (!text) return null;
        const parsed = parseLooseNumber(text);
        if (parsed === null) return null;
        return text;
    }
    return parseLooseNumber(rawValue);
}

function normalizeAverageSourceMeta(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (value.source_mode === "public_round" || value.rounding_mode === "round") {
        return {
            source_mode: "public_round",
            rounding_mode: "round"
        };
    }
    return null;
}

function canTogglePublicAverageSource(field) {
    return !!(field && field.input_mode === "decimal");
}

function canTreatZeroAverageAsBlank() {
    return false;
}

function resolveFieldPanelHelpers(helpers = {}) {
    return {
        documentRef: helpers.documentRef || (typeof document !== "undefined" ? document : null),
        clearElementContent: typeof helpers.clearElementContent === "function" ? helpers.clearElementContent : defaultClearElementContent,
        setElementText: typeof helpers.setElementText === "function" ? helpers.setElementText : defaultSetElementText,
        parseLooseNumber: typeof helpers.parseLooseNumber === "function" ? helpers.parseLooseNumber : defaultParseLooseNumber
    };
}

function getMoreFieldsFamilyLabel(family, options = DEFAULT_FIELD_PANEL_OPTIONS) {
    return (options.familyLabels || DEFAULT_FIELD_PANEL_OPTIONS.familyLabels)[family] || "其他观测";
}

function getFieldSearchText(field, options = DEFAULT_FIELD_PANEL_OPTIONS) {
    const qualityLabels = options.qualityLabels || DEFAULT_FIELD_PANEL_OPTIONS.qualityLabels;
    return [
        field.label || "",
        field.short_help || "",
        getMoreFieldsFamilyLabel(field.family, options),
        qualityLabels[field.quality] || "",
        field.metric || ""
    ].join(" ").toLowerCase();
}

function getFieldQualityRank(field, options = DEFAULT_FIELD_PANEL_OPTIONS) {
    const qualityOrder = options.qualityOrder || DEFAULT_FIELD_PANEL_OPTIONS.qualityOrder;
    if (field && field.quality && qualityOrder[field.quality] !== undefined) {
        return qualityOrder[field.quality];
    }
    const fieldId = field && field.id ? String(field.id) : "";
    if (fieldId.startsWith("white_")) return qualityOrder.w;
    if (fieldId.startsWith("green_")) return qualityOrder.g;
    if (fieldId.startsWith("blue_")) return qualityOrder.b;
    if (fieldId.startsWith("purple_")) return qualityOrder.p;
    if (fieldId.startsWith("orange_")) return qualityOrder.o;
    if (fieldId.startsWith("red_")) return qualityOrder.r;
    return 999;
}

function compareMoreFields(a, b, options = DEFAULT_FIELD_PANEL_OPTIONS) {
    const familyOrder = options.familyOrder || DEFAULT_FIELD_PANEL_OPTIONS.familyOrder;
    const metricOrder = options.metricOrder || DEFAULT_FIELD_PANEL_OPTIONS.metricOrder;
    const familyDelta = (familyOrder.indexOf(a.family) === -1 ? 999 : familyOrder.indexOf(a.family))
        - (familyOrder.indexOf(b.family) === -1 ? 999 : familyOrder.indexOf(b.family));
    if (familyDelta !== 0) return familyDelta;

    const qualityDelta = getFieldQualityRank(a, options) - getFieldQualityRank(b, options);
    if (qualityDelta !== 0) return qualityDelta;

    const metricDelta = (metricOrder[a.metric] ?? 999) - (metricOrder[b.metric] ?? 999);
    if (metricDelta !== 0) return metricDelta;

    return String(a.label || "").localeCompare(String(b.label || ""), "zh-CN");
}

function updateMoreFieldFilterButtons(buttons, activeFilter) {
    Object.entries(buttons || {}).forEach(([filterKey, button]) => {
        if (!button) return;
        button.classList.toggle("active", filterKey === activeFilter);
    });
}

function buildFieldCard(field, state, deps = {}, helpers = {}, options = DEFAULT_FIELD_PANEL_OPTIONS) {
    const {
        templateFieldMeta = null,
        isMoreField = false,
        workspaceState,
        fieldIndex = -1,
        fieldCount = 0,
        isOrganizingChain = false
    } = state || {};
    const {
        onFieldInput,
        onFieldBlur,
        onFieldMetaInput,
        onAddFieldToTemplate,
        onMoveFieldWithinTemplate,
        onRemoveFieldFromTemplate
    } = deps || {};
    const { documentRef, setElementText, parseLooseNumber } = resolveFieldPanelHelpers(helpers);

    const wrapper = documentRef.createElement("div");
    wrapper.id = `field-row-${field.id}`;
    wrapper.className = `input-row${templateFieldMeta && templateFieldMeta.recommended ? " recommended" : ""}${!field.participates_in_solver ? " reserved" : ""}${isMoreField ? " more-field-row" : ""}`;
    wrapper.dataset.fieldLabel = field.label;
    wrapper.dataset.fieldId = field.id;

    const main = documentRef.createElement("div");
    main.className = "input-row-main";

    const meta = documentRef.createElement("div");
    meta.className = "input-row-meta";
    const titleLine = documentRef.createElement("div");
    titleLine.className = "input-row-titleline";
    if (!isMoreField && fieldIndex >= 0) {
        const order = documentRef.createElement("span");
        order.className = "input-row-order";
        order.innerText = String(fieldIndex + 1).padStart(2, "0");
        titleLine.appendChild(order);
    }
    const title = documentRef.createElement("div");
    title.className = "input-row-label";
    title.innerText = field.label;
    titleLine.appendChild(title);
    meta.appendChild(titleLine);

    const helper = documentRef.createElement("div");
    helper.id = `field-helper-${field.id}`;
    helper.className = "input-row-help";
    helper.innerText = field.short_help || "留空则忽略，本项只在已观测时填写。";
    meta.appendChild(helper);

    const badges = documentRef.createElement("div");
    badges.className = "input-row-badges";
    if (templateFieldMeta && templateFieldMeta.recommended) {
        const badge = documentRef.createElement("span");
        badge.className = "field-pill recommended";
        badge.innerText = "推荐";
        badges.appendChild(badge);
    }
    if (!field.participates_in_solver) {
        const badge = documentRef.createElement("span");
        badge.className = "field-pill reserved";
        badge.innerText = "预留";
        badges.appendChild(badge);
    }
    meta.appendChild(badges);
    main.appendChild(meta);

    const control = documentRef.createElement("div");
    control.className = "input-row-control";
    const input = documentRef.createElement("input");
    input.id = `field-input-${field.id}`;
    if (typeof configureNumericInputFromRuntime === "function") {
        configureNumericInputFromRuntime(input, {
            step: field.input_mode === "integer" ? "1" : "0.01",
            min: "0"
        });
    } else {
        input.type = "number";
        input.step = field.input_mode === "integer" ? "1" : "0.01";
        input.min = "0";
    }
    input.placeholder = field.input_mode === "integer" || canTreatZeroAverageAsBlank(field) ? "留空则忽略" : "0.00";
    const currentValue = workspaceState && workspaceState.field_values ? workspaceState.field_values[field.id] : null;
    input.value = currentValue === null || currentValue === undefined ? "" : String(currentValue);
    input.addEventListener("input", (event) => {
        if (typeof onFieldInput === "function") {
            const nextValue = getFieldInputStorageValue(field, event.currentTarget.value, parseLooseNumber);
            onFieldInput(field.id, nextValue);
        }
    });
    input.addEventListener("blur", () => {
        if (typeof onFieldBlur === "function") onFieldBlur(field.id);
    });
    control.appendChild(input);
    main.appendChild(control);
    wrapper.appendChild(main);

    const footer = documentRef.createElement("div");
    footer.className = "input-row-actions";

    if (isOrganizingChain && canTogglePublicAverageSource(field)) {
        const currentMeta = workspaceState && workspaceState.field_value_meta
            ? normalizeAverageSourceMeta(workspaceState.field_value_meta[field.id])
            : null;
        const isPublicSource = !!currentMeta;
        const publicSourceButton = documentRef.createElement("button");
        publicSourceButton.type = "button";
        publicSourceButton.id = `field-source-public-${field.id}`;
        publicSourceButton.className = `btn secondary small-btn input-row-action-btn input-row-source-toggle${isPublicSource ? " active" : ""}`;
        publicSourceButton.title = "公开数据：四舍五入到小数点后两位；关闭则按人物技能/道具数据向下取两位。";
        publicSourceButton.setAttribute("aria-pressed", isPublicSource ? "true" : "false");
        setElementText(publicSourceButton, "公开数据");
        publicSourceButton.addEventListener("click", () => {
            if (typeof onFieldMetaInput === "function") {
                onFieldMetaInput(
                    field.id,
                    isPublicSource
                        ? null
                        : { source_mode: "public_round", rounding_mode: "round" }
                );
            }
        });
        footer.appendChild(publicSourceButton);
    }

    if (isMoreField) {
        const addButton = documentRef.createElement("button");
        addButton.type = "button";
        addButton.className = "btn secondary small-btn input-row-action-btn";
        setElementText(addButton, "加入模板");
        addButton.addEventListener("click", () => {
            if (typeof onAddFieldToTemplate === "function") onAddFieldToTemplate(field.id);
        });
        footer.appendChild(addButton);
    } else if (isOrganizingChain) {
        if (typeof onMoveFieldWithinTemplate === "function" && fieldCount > 1) {
            const moveUpButton = documentRef.createElement("button");
            moveUpButton.type = "button";
            moveUpButton.id = `field-action-move-up-${field.id}`;
            moveUpButton.className = "btn secondary small-btn input-row-action-btn";
            setElementText(moveUpButton, "上移");
            moveUpButton.disabled = fieldIndex <= 0;
            moveUpButton.addEventListener("click", () => onMoveFieldWithinTemplate(field.id, "up"));
            footer.appendChild(moveUpButton);

            const moveDownButton = documentRef.createElement("button");
            moveDownButton.type = "button";
            moveDownButton.id = `field-action-move-down-${field.id}`;
            moveDownButton.className = "btn secondary small-btn input-row-action-btn";
            setElementText(moveDownButton, "下移");
            moveDownButton.disabled = fieldIndex === -1 || fieldIndex >= fieldCount - 1;
            moveDownButton.addEventListener("click", () => onMoveFieldWithinTemplate(field.id, "down"));
            footer.appendChild(moveDownButton);
        }

        if (typeof onRemoveFieldFromTemplate === "function") {
            const removeButton = documentRef.createElement("button");
            removeButton.type = "button";
            removeButton.id = `field-action-remove-${field.id}`;
            removeButton.className = "btn secondary small-btn input-row-action-btn input-row-remove-btn";
            setElementText(removeButton, "删除");
            removeButton.disabled = fieldCount <= 1;
            removeButton.addEventListener("click", () => onRemoveFieldFromTemplate(field.id));
            footer.appendChild(removeButton);
        }
    }

    if (footer.children.length > 0) {
        wrapper.appendChild(footer);
    }
    return wrapper;
}

function buildMoreFieldsGroup(family, fields, state, deps = {}, helpers = {}, options = DEFAULT_FIELD_PANEL_OPTIONS) {
    const { documentRef, setElementText } = resolveFieldPanelHelpers(helpers);
    const section = documentRef.createElement("section");
    section.className = "more-fields-family-group";
    section.dataset.family = family;

    const header = documentRef.createElement("div");
    header.className = "more-fields-group-header";

    const title = documentRef.createElement("h4");
    title.className = "more-fields-group-title";
    title.innerText = getMoreFieldsFamilyLabel(family, options);
    header.appendChild(title);

    const meta = documentRef.createElement("span");
    meta.className = "more-fields-group-meta";
    setElementText(meta, `${fields.length} 项`);
    header.appendChild(meta);

    section.appendChild(header);

    if (family === "quality") {
        const qualityLabels = options.qualityLabels || DEFAULT_FIELD_PANEL_OPTIONS.qualityLabels;
        const qualityBuckets = new Map();
        fields.forEach((field) => {
            const qualityKey = field.quality || "other";
            const bucket = qualityBuckets.get(qualityKey) || [];
            bucket.push(field);
            qualityBuckets.set(qualityKey, bucket);
        });

        Object.entries(qualityLabels).forEach(([qualityKey, qualityLabel]) => {
            const qualityFields = qualityBuckets.get(qualityKey);
            if (!qualityFields || !qualityFields.length) return;

            const subgroup = documentRef.createElement("details");
            subgroup.id = `more-fields-quality-${qualityKey}`;
            subgroup.className = "more-fields-quality-subgroup";
            subgroup.open = Boolean(state.moreFieldsSearchTerm);

            const summary = documentRef.createElement("summary");
            summary.className = "more-fields-quality-summary";

            const summaryLabel = documentRef.createElement("span");
            summaryLabel.className = "more-fields-quality-label";
            summaryLabel.innerText = qualityLabel;
            summary.appendChild(summaryLabel);

            const summaryMeta = documentRef.createElement("span");
            summaryMeta.className = "more-fields-quality-meta";
            setElementText(summaryMeta, `${qualityFields.length} 项`);
            summary.appendChild(summaryMeta);

            subgroup.appendChild(summary);
            qualityFields.forEach((field) => {
                subgroup.appendChild(buildFieldCard(field, { ...state, templateFieldMeta: null, isMoreField: true }, deps, helpers, options));
            });
            section.appendChild(subgroup);
        });

        return section;
    }

    fields.forEach((field) => {
        section.appendChild(buildFieldCard(field, { ...state, templateFieldMeta: null, isMoreField: true }, deps, helpers, options));
    });
    return section;
}

function renderFieldPanels(state, deps = {}, helpers = {}, options = DEFAULT_FIELD_PANEL_OPTIONS) {
    const {
        templateGroups,
        moreFields,
        moreFieldsPanel,
        moreFieldsSummaryMeta,
        moreFieldsFilterButtons,
        activeTemplate,
        fieldCatalogIndex,
        fieldCatalogItems,
        workspaceState,
        activeMoreFieldsFilter = "all",
        moreFieldsSearchTerm = "",
        isOrganizingChain = false
    } = state || {};
    const { documentRef, clearElementContent, setElementText } = resolveFieldPanelHelpers(helpers);

    clearElementContent(templateGroups);
    clearElementContent(moreFields);

    const templateFieldIds = new Set((activeTemplate && activeTemplate.fields ? activeTemplate.fields : []).map((field) => field.field_id));

    const visibleTemplateFields = (activeTemplate && activeTemplate.fields ? activeTemplate.fields : [])
        .filter((field) => field.default_visible !== false);

    (activeTemplate && activeTemplate.groups ? activeTemplate.groups : []).forEach((group) => {
        const groupCard = documentRef.createElement("section");
        groupCard.className = "field-group";
        const groupTitle = documentRef.createElement("h3");
        groupTitle.innerText = group.label;
        groupCard.appendChild(groupTitle);

        visibleTemplateFields
            .filter((field) => field.group_id === group.id)
            .forEach((templateField) => {
                const field = fieldCatalogIndex[templateField.field_id];
                if (!field) return;
                groupCard.appendChild(buildFieldCard(
                    field,
                    {
                        templateFieldMeta: templateField,
                        isMoreField: false,
                        workspaceState,
                        fieldIndex: visibleTemplateFields.findIndex((entry) => entry.field_id === templateField.field_id),
                        fieldCount: visibleTemplateFields.length,
                        isOrganizingChain
                    },
                    deps,
                    helpers,
                    options
                ));
            });

        templateGroups.appendChild(groupCard);
    });

    const hiddenFields = (fieldCatalogItems || [])
        .filter((field) => !templateFieldIds.has(field.id))
        .sort((a, b) => compareMoreFields(a, b, options));
    const filteredHiddenFields = hiddenFields.filter((field) => {
        const matchesFilter = activeMoreFieldsFilter === "all" ? true : field.family === activeMoreFieldsFilter;
        const matchesSearch = !moreFieldsSearchTerm
            ? true
            : getFieldSearchText(field, options).includes(moreFieldsSearchTerm);
        return matchesFilter && matchesSearch;
    });

    if (moreFieldsSummaryMeta) {
        const summaryText = filteredHiddenFields.length === hiddenFields.length
            ? `${hiddenFields.length} 项备用观测`
            : `${filteredHiddenFields.length} / ${hiddenFields.length} 项备用观测`;
        setElementText(moreFieldsSummaryMeta, summaryText);
    }

    const groupedHiddenFields = new Map();
    filteredHiddenFields.forEach((field) => {
        const familyKey = field.family || "other";
        const bucket = groupedHiddenFields.get(familyKey) || [];
        bucket.push(field);
        groupedHiddenFields.set(familyKey, bucket);
    });

    const familyOrder = options.familyOrder || DEFAULT_FIELD_PANEL_OPTIONS.familyOrder;
    familyOrder.forEach((familyKey) => {
        const fields = groupedHiddenFields.get(familyKey);
        if (!fields || !fields.length) return;
        moreFields.appendChild(buildMoreFieldsGroup(
            familyKey,
            fields,
            { workspaceState, moreFieldsSearchTerm },
            deps,
            helpers,
            options
        ));
    });

    Array.from(groupedHiddenFields.keys())
        .filter((familyKey) => !familyOrder.includes(familyKey))
        .forEach((familyKey) => {
            const fields = groupedHiddenFields.get(familyKey);
            if (!fields || !fields.length) return;
            moreFields.appendChild(buildMoreFieldsGroup(
                familyKey,
                fields,
                { workspaceState, moreFieldsSearchTerm },
                deps,
                helpers,
                options
            ));
        });

    if (!moreFields.children.length) {
        const empty = documentRef.createElement("div");
        empty.className = "more-fields-empty";
        empty.innerText = "当前筛选下没有可加入的备用观测。";
        moreFields.appendChild(empty);
    }

    updateMoreFieldFilterButtons(moreFieldsFilterButtons, activeMoreFieldsFilter);
    if (moreFieldsPanel) {
        moreFieldsPanel.open = (
            moreFieldsPanel.open
            || activeMoreFieldsFilter !== "all"
            || Boolean(moreFieldsSearchTerm)
        ) && hiddenFields.length > 0;
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        DEFAULT_FIELD_PANEL_OPTIONS,
        getMoreFieldsFamilyLabel,
        getFieldSearchText,
        getFieldQualityRank,
        compareMoreFields,
        updateMoreFieldFilterButtons,
        getFieldInputStorageValue,
        normalizeAverageSourceMeta,
        canTogglePublicAverageSource,
        canTreatZeroAverageAsBlank,
        buildFieldCard,
        buildMoreFieldsGroup,
        renderFieldPanels
    };
}

if (typeof window !== "undefined") {
    window.AK_FIELD_PANEL_RUNTIME = {
        DEFAULT_FIELD_PANEL_OPTIONS,
        getMoreFieldsFamilyLabel,
        getFieldSearchText,
        getFieldQualityRank,
        compareMoreFields,
        updateMoreFieldFilterButtons,
        getFieldInputStorageValue,
        normalizeAverageSourceMeta,
        canTogglePublicAverageSource,
        canTreatZeroAverageAsBlank,
        buildFieldCard,
        buildMoreFieldsGroup,
        renderFieldPanels
    };
}
