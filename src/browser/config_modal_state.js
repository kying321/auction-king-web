const CONFIG_MODAL_VIEWS = {
    STRUCTURED: "structured",
    BASELINE: "baseline",
    OVERRIDES: "overrides"
};

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildConfigDiff(currentValue, defaultValue) {
    if (isPlainObject(currentValue) && isPlainObject(defaultValue)) {
        const diff = {};
        Object.keys(currentValue).forEach((key) => {
            const nestedDiff = buildConfigDiff(currentValue[key], defaultValue[key]);
            if (nestedDiff !== undefined) diff[key] = nestedDiff;
        });
        return Object.keys(diff).length ? diff : undefined;
    }

    if (Array.isArray(currentValue) || Array.isArray(defaultValue)) {
        return JSON.stringify(currentValue) === JSON.stringify(defaultValue) ? undefined : currentValue;
    }

    return Object.is(currentValue, defaultValue) ? undefined : currentValue;
}

function getConfigModalViewState(view, currentConfig, defaultConfig) {
    if (view === CONFIG_MODAL_VIEWS.BASELINE) {
        return {
            view,
            title: "内置默认配置",
            jsonText: JSON.stringify(defaultConfig, null, 2),
            readOnly: true,
            showSaveAction: false,
            showStructuredControls: false,
            showImportExport: false,
            helpText: "这里展示站点内置默认配置，便于核对 source-of-truth。"
        };
    }

    if (view === CONFIG_MODAL_VIEWS.OVERRIDES) {
        return {
            view,
            title: "本地覆盖差异",
            jsonText: JSON.stringify(buildConfigDiff(currentConfig, defaultConfig) || {}, null, 2),
            readOnly: true,
            showSaveAction: false,
            showStructuredControls: false,
            showImportExport: false,
            helpText: "这里只显示相对默认配置的本地覆盖差异。"
        };
    }

    return {
        view: CONFIG_MODAL_VIEWS.STRUCTURED,
        title: "结构化配置",
        jsonText: JSON.stringify(currentConfig, null, 2),
        readOnly: true,
        showSaveAction: true,
        showStructuredControls: true,
        showImportExport: true,
        helpText: "结构化控件是主编辑入口；下方 JSON 仅作高级只读、导入和导出参考。"
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        CONFIG_MODAL_VIEWS,
        getConfigModalViewState,
        buildConfigDiff
    };
}

if (typeof window !== "undefined") {
    window.CONFIG_MODAL_VIEWS = CONFIG_MODAL_VIEWS;
    window.getConfigModalViewState = getConfigModalViewState;
    window.buildConfigDiff = buildConfigDiff;
}
