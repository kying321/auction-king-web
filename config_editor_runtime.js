const numericInputRuntime = typeof require === "function" && typeof module !== "undefined" && module.exports
    ? require("./numeric_input_runtime.js")
    : (typeof AK_NUMERIC_INPUT_RUNTIME !== "undefined" ? AK_NUMERIC_INPUT_RUNTIME : (typeof window !== "undefined" ? window.AK_NUMERIC_INPUT_RUNTIME : {}));
const {
    configureNumericInput: configureNumericInputFromRuntime,
    bindNumericWheelStepper: bindNumericWheelStepperFromRuntime
} = numericInputRuntime;

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
}

function resolveConfigEditorHelpers(helpers = {}) {
    return {
        documentRef: helpers.documentRef || (typeof document !== "undefined" ? document : null),
        clearElementContent: typeof helpers.clearElementContent === "function" ? helpers.clearElementContent : defaultClearElementContent,
        setElementText: typeof helpers.setElementText === "function" ? helpers.setElementText : defaultSetElementText
    };
}

function setConfigEditorMessage(statusElement, message, isError = false, helpers = {}) {
    const { setElementText } = resolveConfigEditorHelpers(helpers);
    if (!statusElement) return;
    setElementText(statusElement, message);
    statusElement.classList.toggle("hidden", !message);
    statusElement.classList.toggle("error-text", isError);
}

function bindNumberWheelStepper(input, onValueChange) {
    if (typeof bindNumericWheelStepperFromRuntime === "function") {
        bindNumericWheelStepperFromRuntime(input, onValueChange);
    }
}

function configureNumberControl(input, options = {}) {
    if (typeof configureNumericInputFromRuntime === "function") {
        return configureNumericInputFromRuntime(input, options);
    }
    if (!input) return input;
    input.type = "number";
    input.step = options.step || "1";
    if (options.min !== undefined && options.min !== null) input.min = String(options.min);
    if (options.max !== undefined && options.max !== null) input.max = String(options.max);
    return input;
}

function renderConfigEditorControls(state, deps = {}, helpers = {}) {
    const {
        container,
        activeConfigModalView,
        structuredView = "structured",
        configDraft,
        activeMapId
    } = state || {};
    const {
        buildConfigEditorSections,
        applyTemplateFieldMutation,
        applyConfigEditorValue,
        onDraftReplace,
        onMessage
    } = deps || {};
    const {
        documentRef,
        clearElementContent,
        setElementText
    } = resolveConfigEditorHelpers(helpers);

    clearElementContent(container);
    if (activeConfigModalView !== structuredView) return;
    if (typeof buildConfigEditorSections !== "function" || !documentRef) return;

    const sections = buildConfigEditorSections(configDraft, activeMapId) || [];
    const replaceDraft = typeof onDraftReplace === "function" ? onDraftReplace : () => {};
    const reportMessage = typeof onMessage === "function" ? onMessage : () => {};

    function applyTemplateFieldEditorAction(templateId, action) {
        if (typeof applyTemplateFieldMutation !== "function") return;
        const nextDraft = applyTemplateFieldMutation(configDraft, templateId, action);
        replaceDraft(nextDraft, { rerender: true });
    }

    function applyDraftValue(path, value) {
        if (typeof applyConfigEditorValue !== "function") return;
        const nextDraft = applyConfigEditorValue(configDraft, activeMapId, path, value);
        replaceDraft(nextDraft, { rerender: false });
    }

    function setTemplateActionButton(button, visibleLabel, actionLabel, fieldLabel) {
        setElementText(button, visibleLabel);
        const accessibleLabel = `${actionLabel} ${fieldLabel || ""}`.trim();
        if (typeof button.setAttribute === "function") button.setAttribute("aria-label", accessibleLabel);
        button.title = accessibleLabel;
    }

    function buildMapQualityMatrixEditor(control) {
        const wrapper = documentRef.createElement("div");
        wrapper.id = control.id;
        wrapper.className = "config-map-quality-matrix";

        (control.maps || []).forEach((mapDef) => {
            const mapCard = documentRef.createElement("section");
            mapCard.className = "config-map-card";
            mapCard.setAttribute("data-map-id", mapDef.map_id);

            const mapHeader = documentRef.createElement("div");
            mapHeader.className = "config-map-card-header";
            const mapTitle = documentRef.createElement("h4");
            setElementText(mapTitle, mapDef.label);
            mapHeader.appendChild(mapTitle);
            mapCard.appendChild(mapHeader);

            const table = documentRef.createElement("div");
            table.className = "config-map-quality-table";

            const headerRow = documentRef.createElement("div");
            headerRow.className = "config-map-quality-row config-map-quality-row-header";
            ["品质", "先验", "均格"].forEach((labelText) => {
                const cell = documentRef.createElement("div");
                cell.className = "config-map-quality-cell config-map-quality-heading";
                setElementText(cell, labelText);
                headerRow.appendChild(cell);
            });
            table.appendChild(headerRow);

            (mapDef.rows || []).forEach((rowDef) => {
                const row = documentRef.createElement("div");
                row.className = "config-map-quality-row";

                const qualityCell = documentRef.createElement("div");
                qualityCell.className = "config-map-quality-cell config-map-quality-label";
                setElementText(qualityCell, rowDef.quality_label);
                row.appendChild(qualityCell);

                ["alpha", "cells_mean"].forEach((metricKey) => {
                    const metric = rowDef.values && rowDef.values[metricKey];
                    const cell = documentRef.createElement("label");
                    cell.className = "config-map-quality-cell";
                    const input = documentRef.createElement("input");
                    configureNumberControl(input, { step: (metric && metric.step) || "0.01", min: "0" });
                    input.value = metric && metric.value !== null && metric.value !== undefined ? String(metric.value) : "";
                    input.id = `config-map-quality-input-${mapDef.map_id}-${rowDef.quality_id}-${metricKey}`;
                    input.addEventListener("input", (event) => applyDraftValue(metric.path, event.currentTarget.value));
                    bindNumberWheelStepper(input, (value) => applyDraftValue(metric.path, value));
                    cell.appendChild(input);
                    row.appendChild(cell);
                });

                table.appendChild(row);
            });

            mapCard.appendChild(table);
            wrapper.appendChild(mapCard);
        });

        return wrapper;
    }

    function buildMapValueMatrixEditor(control) {
        const wrapper = documentRef.createElement("div");
        wrapper.id = control.id;
        wrapper.className = "config-map-value-matrix";

        (control.maps || []).forEach((mapDef) => {
            const mapCard = documentRef.createElement("section");
            mapCard.className = "config-map-card";
            mapCard.setAttribute("data-map-id", mapDef.map_id);

            const mapHeader = documentRef.createElement("div");
            mapHeader.className = "config-map-card-header";
            const mapTitle = documentRef.createElement("h4");
            setElementText(mapTitle, mapDef.label);
            mapHeader.appendChild(mapTitle);
            mapCard.appendChild(mapHeader);

            const table = documentRef.createElement("div");
            table.className = "config-map-quality-table";

            const headerRow = documentRef.createElement("div");
            headerRow.className = "config-map-quality-row config-map-quality-row-header";
            ["品质", "基础价值", "每格价值"].forEach((labelText) => {
                const cell = documentRef.createElement("div");
                cell.className = "config-map-quality-cell config-map-quality-heading";
                setElementText(cell, labelText);
                headerRow.appendChild(cell);
            });
            table.appendChild(headerRow);

            (mapDef.rows || []).forEach((rowDef) => {
                const row = documentRef.createElement("div");
                row.className = "config-map-quality-row";

                const qualityCell = documentRef.createElement("div");
                qualityCell.className = "config-map-quality-cell config-map-quality-label";
                setElementText(qualityCell, rowDef.quality_label);
                row.appendChild(qualityCell);

                ["base_item_mean", "per_cell_mean"].forEach((metricKey) => {
                    const metric = rowDef.values && rowDef.values[metricKey];
                    const cell = documentRef.createElement("label");
                    cell.className = "config-map-quality-cell";
                    const input = documentRef.createElement("input");
                    configureNumberControl(input, { step: (metric && metric.step) || "0.01", min: "0" });
                    input.value = metric && metric.value !== null && metric.value !== undefined ? String(metric.value) : "";
                    input.id = `config-map-value-input-${mapDef.map_id}-${rowDef.quality_id}-${metricKey}`;
                    input.addEventListener("input", (event) => applyDraftValue(metric.path, event.currentTarget.value));
                    bindNumberWheelStepper(input, (value) => applyDraftValue(metric.path, value));
                    cell.appendChild(input);
                    row.appendChild(cell);
                });

                table.appendChild(row);
            });

            mapCard.appendChild(table);
            wrapper.appendChild(mapCard);
        });

        return wrapper;
    }

    function buildValueModelMatrixEditor(control) {
        const wrapper = documentRef.createElement("div");
        wrapper.id = control.id;
        wrapper.className = "config-model-value-matrix";

        const table = documentRef.createElement("div");
        table.className = "config-map-quality-table";

        const headerRow = documentRef.createElement("div");
        headerRow.className = "config-map-quality-row config-map-quality-row-header";
        ["品质", "基础价值", "每格价值"].forEach((labelText) => {
            const cell = documentRef.createElement("div");
            cell.className = "config-map-quality-cell config-map-quality-heading";
            setElementText(cell, labelText);
            headerRow.appendChild(cell);
        });
        table.appendChild(headerRow);

        (control.rows || []).forEach((rowDef) => {
            const row = documentRef.createElement("div");
            row.className = "config-map-quality-row";

            const qualityCell = documentRef.createElement("div");
            qualityCell.className = "config-map-quality-cell config-map-quality-label";
            setElementText(qualityCell, rowDef.quality_label);
            row.appendChild(qualityCell);

            ["base_item_mean", "per_cell_mean"].forEach((metricKey) => {
                const metric = rowDef.values && rowDef.values[metricKey];
                const cell = documentRef.createElement("label");
                cell.className = "config-map-quality-cell";
                const input = documentRef.createElement("input");
                configureNumberControl(input, { step: (metric && metric.step) || "0.01", min: "0" });
                input.value = metric && metric.value !== null && metric.value !== undefined ? String(metric.value) : "";
                input.id = `config-model-value-input-${rowDef.quality_id}-${metricKey}`;
                input.addEventListener("input", (event) => applyDraftValue(metric.path, event.currentTarget.value));
                bindNumberWheelStepper(input, (value) => applyDraftValue(metric.path, value));
                cell.appendChild(input);
                row.appendChild(cell);
            });

            table.appendChild(row);
        });

        wrapper.appendChild(table);
        return wrapper;
    }

    function buildProfilePriorMatrixEditor(control) {
        const wrapper = documentRef.createElement("div");
        wrapper.id = control.id;
        wrapper.className = "config-model-value-matrix";

        const table = documentRef.createElement("div");
        table.className = "config-map-quality-table";

        const headerRow = documentRef.createElement("div");
        headerRow.className = "config-map-quality-row config-map-quality-row-header";
        ["模板", "先验"].forEach((labelText) => {
            const cell = documentRef.createElement("div");
            cell.className = "config-map-quality-cell config-map-quality-heading";
            setElementText(cell, labelText);
            headerRow.appendChild(cell);
        });
        table.appendChild(headerRow);

        (control.rows || []).forEach((rowDef) => {
            const row = documentRef.createElement("div");
            row.className = "config-map-quality-row config-map-profile-row";

            const profileCell = documentRef.createElement("div");
            profileCell.className = "config-map-quality-cell config-map-quality-label";
            setElementText(profileCell, rowDef.profile_label);
            row.appendChild(profileCell);

            const metric = rowDef.values && rowDef.values.prior;
            const cell = documentRef.createElement("label");
            cell.className = "config-map-quality-cell";
            const input = documentRef.createElement("input");
            configureNumberControl(input, { step: (metric && metric.step) || "0.01", min: "0" });
            input.value = metric && metric.value !== null && metric.value !== undefined ? String(metric.value) : "";
            input.id = `config-map-red-profile-input-${rowDef.profile_id}-prior`;
            input.addEventListener("input", (event) => applyDraftValue(metric.path, event.currentTarget.value));
            bindNumberWheelStepper(input, (value) => applyDraftValue(metric.path, value));
            cell.appendChild(input);
            row.appendChild(cell);

            table.appendChild(row);
        });

        wrapper.appendChild(table);
        return wrapper;
    }

    function buildFamilyBiasMatrixEditor(control, inputIdPrefix) {
        const wrapper = documentRef.createElement("div");
        wrapper.id = control.id;
        wrapper.className = "config-model-value-matrix";

        const table = documentRef.createElement("div");
        table.className = "config-map-quality-table";

        const headerRow = documentRef.createElement("div");
        headerRow.className = "config-map-quality-row config-map-quality-row-header";
        ["家族", "频率", "价值偏置"].forEach((labelText) => {
            const cell = documentRef.createElement("div");
            cell.className = "config-map-quality-cell config-map-quality-heading";
            setElementText(cell, labelText);
            headerRow.appendChild(cell);
        });
        table.appendChild(headerRow);

        (control.rows || []).forEach((rowDef) => {
            const row = documentRef.createElement("div");
            row.className = "config-map-quality-row";

            const familyCell = documentRef.createElement("div");
            familyCell.className = "config-map-quality-cell config-map-quality-label";
            setElementText(familyCell, rowDef.family_label);
            row.appendChild(familyCell);

            ["prior", "value_bias"].forEach((metricKey) => {
                const metric = rowDef.values && rowDef.values[metricKey];
                const cell = documentRef.createElement("label");
                cell.className = "config-map-quality-cell";
                const input = documentRef.createElement("input");
                    configureNumberControl(input, { step: (metric && metric.step) || "0.01" });
                input.value = metric && metric.value !== null && metric.value !== undefined ? String(metric.value) : "";
                input.id = `${inputIdPrefix}-${rowDef.family_id}-${metricKey}`;
                input.addEventListener("input", (event) => applyDraftValue(metric.path, event.currentTarget.value));
                bindNumberWheelStepper(input, (value) => applyDraftValue(metric.path, value));
                cell.appendChild(input);
                row.appendChild(cell);
            });

            table.appendChild(row);
        });

        wrapper.appendChild(table);
        return wrapper;
    }

    function buildTemplateFieldEditor(control) {
        const wrapper = documentRef.createElement("div");
        wrapper.id = `config-template-fields-${control.template_id}`;
        wrapper.className = "config-template-fields";

        const title = documentRef.createElement("div");
        title.className = "config-template-fields-title";
        setElementText(title, control.label);
        wrapper.appendChild(title);

        if (control.description) {
            const desc = documentRef.createElement("p");
            desc.className = "config-template-fields-desc";
            setElementText(desc, control.description);
            wrapper.appendChild(desc);
        }

        const fieldList = documentRef.createElement("div");
        fieldList.className = "config-template-field-list";

        (control.value || []).forEach((field, index) => {
            const row = documentRef.createElement("div");
            row.id = `config-template-field-row-${control.template_id}-${field.field_id}`;
            row.className = "config-template-field-row";

            const meta = documentRef.createElement("div");
            meta.className = "config-template-field-meta";
            const name = documentRef.createElement("div");
            name.className = "config-template-field-name";
            setElementText(name, `${index + 1}. ${field.label}`);
            meta.appendChild(name);

            const detail = documentRef.createElement("div");
            detail.className = "config-template-field-detail";
            const stateTags = [];
            stateTags.push(field.group_label || field.group_id || "默认分组");
            stateTags.push(field.recommended ? "推荐" : "非推荐");
            stateTags.push(field.default_visible ? "默认显示" : "默认折叠");
            if (!field.participates_in_solver) stateTags.push("预留字段");
            setElementText(detail, stateTags.join(" | "));
            meta.appendChild(detail);
            row.appendChild(meta);

            const actions = documentRef.createElement("div");
            actions.className = "config-template-field-actions";

            const moveUpButton = documentRef.createElement("button");
            moveUpButton.type = "button";
            moveUpButton.id = `config-template-field-move-up-${control.template_id}-${field.field_id}`;
            moveUpButton.className = "btn secondary small-btn config-icon-btn";
            setTemplateActionButton(moveUpButton, "↑", "上移", field.label);
            moveUpButton.disabled = index === 0;
            moveUpButton.addEventListener("click", () => applyTemplateFieldEditorAction(control.template_id, {
                type: "move",
                field_id: field.field_id,
                direction: "up"
            }));
            actions.appendChild(moveUpButton);

            const moveDownButton = documentRef.createElement("button");
            moveDownButton.type = "button";
            moveDownButton.id = `config-template-field-move-down-${control.template_id}-${field.field_id}`;
            moveDownButton.className = "btn secondary small-btn config-icon-btn";
            setTemplateActionButton(moveDownButton, "↓", "下移", field.label);
            moveDownButton.disabled = index === (control.value || []).length - 1;
            moveDownButton.addEventListener("click", () => applyTemplateFieldEditorAction(control.template_id, {
                type: "move",
                field_id: field.field_id,
                direction: "down"
            }));
            actions.appendChild(moveDownButton);

            const toggleRecommendedButton = documentRef.createElement("button");
            toggleRecommendedButton.type = "button";
            toggleRecommendedButton.id = `config-template-field-toggle-recommended-${control.template_id}-${field.field_id}`;
            toggleRecommendedButton.className = `btn secondary small-btn config-icon-btn${field.recommended ? " is-active" : ""}`;
            setTemplateActionButton(toggleRecommendedButton, "荐", field.recommended ? "取消推荐" : "设为推荐", field.label);
            toggleRecommendedButton.addEventListener("click", () => applyTemplateFieldEditorAction(control.template_id, {
                type: "toggle_recommended",
                field_id: field.field_id
            }));
            actions.appendChild(toggleRecommendedButton);

            const toggleVisibleButton = documentRef.createElement("button");
            toggleVisibleButton.type = "button";
            toggleVisibleButton.id = `config-template-field-toggle-visible-${control.template_id}-${field.field_id}`;
            toggleVisibleButton.className = `btn secondary small-btn config-icon-btn${field.default_visible ? " is-active" : ""}`;
            setTemplateActionButton(toggleVisibleButton, field.default_visible ? "折" : "显", field.default_visible ? "默认折叠" : "默认显示", field.label);
            toggleVisibleButton.addEventListener("click", () => applyTemplateFieldEditorAction(control.template_id, {
                type: "toggle_visible",
                field_id: field.field_id
            }));
            actions.appendChild(toggleVisibleButton);

            const removeButton = documentRef.createElement("button");
            removeButton.type = "button";
            removeButton.id = `config-template-field-remove-${control.template_id}-${field.field_id}`;
            removeButton.className = "btn secondary small-btn config-icon-btn danger";
            setTemplateActionButton(removeButton, "×", "移除", field.label);
            removeButton.addEventListener("click", () => applyTemplateFieldEditorAction(control.template_id, {
                type: "remove",
                field_id: field.field_id
            }));
            actions.appendChild(removeButton);

            row.appendChild(actions);
            fieldList.appendChild(row);
        });

        wrapper.appendChild(fieldList);

        const addRow = documentRef.createElement("div");
        addRow.className = "config-template-field-add-row";

        const addFieldSelect = documentRef.createElement("select");
        addFieldSelect.id = `config-template-field-add-select-${control.template_id}`;
        (control.available_fields || []).forEach((fieldOption) => {
            const option = documentRef.createElement("option");
            option.value = fieldOption.field_id;
            setElementText(option, fieldOption.label);
            addFieldSelect.appendChild(option);
        });
        addRow.appendChild(addFieldSelect);

        const addGroupSelect = documentRef.createElement("select");
        addGroupSelect.id = `config-template-field-add-group-${control.template_id}`;
        (control.groups || []).forEach((group) => {
            const option = documentRef.createElement("option");
            option.value = group.id;
            setElementText(option, group.label);
            addGroupSelect.appendChild(option);
        });
        addGroupSelect.disabled = (control.groups || []).length <= 1;
        addRow.appendChild(addGroupSelect);

        const addButton = documentRef.createElement("button");
        addButton.type = "button";
        addButton.id = `config-template-field-add-button-${control.template_id}`;
        addButton.className = "btn secondary small-btn";
        setElementText(addButton, "添加字段");
        addButton.disabled = !(control.available_fields || []).length;
        addButton.addEventListener("click", () => {
            if (!addFieldSelect.value) return;
            applyTemplateFieldEditorAction(control.template_id, {
                type: "add",
                field_id: addFieldSelect.value,
                group_id: addGroupSelect.value
            });
        });
        addRow.appendChild(addButton);

        wrapper.appendChild(addRow);
        return wrapper;
    }

    sections.forEach((section) => {
        const sectionEl = documentRef.createElement("section");
        sectionEl.className = "config-editor-section";
        const title = documentRef.createElement("h3");
        title.innerText = section.title;
        sectionEl.appendChild(title);

        const desc = documentRef.createElement("p");
        desc.className = "config-editor-section-desc";
        desc.innerText = section.description;
        sectionEl.appendChild(desc);

        const grid = documentRef.createElement("div");
        grid.className = "config-editor-grid";

        section.controls.forEach((control) => {
            if (control.kind === "map-quality-matrix") {
                grid.appendChild(buildMapQualityMatrixEditor(control));
                return;
            }

            if (control.kind === "map-value-matrix") {
                grid.appendChild(buildMapValueMatrixEditor(control));
                return;
            }

            if (control.kind === "value-model-matrix") {
                grid.appendChild(buildValueModelMatrixEditor(control));
                return;
            }

            if (control.kind === "profile-prior-matrix") {
                grid.appendChild(buildProfilePriorMatrixEditor(control));
                return;
            }

            if (control.kind === "family-bias-matrix") {
                const inputPrefix = control.id === "map_family_bias_matrix"
                    ? "config-map-family-bias-input"
                    : "config-model-family-bias-input";
                grid.appendChild(buildFamilyBiasMatrixEditor(control, inputPrefix));
                return;
            }

            if (control.kind === "template-fields") {
                grid.appendChild(buildTemplateFieldEditor(control));
                return;
            }

            const label = documentRef.createElement("label");
            label.className = "config-control";

            const caption = documentRef.createElement("span");
            caption.className = "config-control-label";
            caption.innerText = control.label;
            label.appendChild(caption);

            let input;
            if (control.kind === "select") {
                input = documentRef.createElement("select");
                (control.options || []).forEach((optionDef) => {
                    const option = documentRef.createElement("option");
                    option.value = optionDef.value;
                    option.innerText = optionDef.label;
                    input.appendChild(option);
                });
                input.value = control.value || "";
            } else {
                input = documentRef.createElement("input");
                input.type = control.kind === "text" ? "text" : "number";
                if (control.kind === "number") configureNumberControl(input, { step: control.step || "1" });
                if (control.kind === "boolean") {
                    configureNumberControl(input, { step: "1", min: "0", max: "1" });
                    input.value = control.value ? "1" : "0";
                } else {
                    input.value = control.value === null || control.value === undefined ? "" : String(control.value);
                }
            }
            input.addEventListener("input", (event) => applyDraftValue(control.path, event.currentTarget.value));
            bindNumberWheelStepper(input, (value) => applyDraftValue(control.path, value));
            label.appendChild(input);
            grid.appendChild(label);
        });

        sectionEl.appendChild(grid);
        container.appendChild(sectionEl);
    });

    reportMessage("结构化控件和只读 JSON 会同步显示当前草稿。", false);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        setConfigEditorMessage,
        renderConfigEditorControls
    };
}

if (typeof window !== "undefined") {
    window.AK_CONFIG_EDITOR_RUNTIME = {
        setConfigEditorMessage,
        renderConfigEditorControls
    };
}
