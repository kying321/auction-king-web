(function (root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    root.getDefaultR2PurpleMode = api.getDefaultR2PurpleMode;
    root.getR2PurpleModeSummary = api.getR2PurpleModeSummary;
    root.normalizeR2PurpleCount = api.normalizeR2PurpleCount;
    root.shouldDisableR2PurpleCount = api.shouldDisableR2PurpleCount;
    root.syncR2PurpleCountInput = api.syncR2PurpleCountInput;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    function getDefaultR2PurpleMode() {
        return "orange_only";
    }

    function normalizeR2PurpleCount(value, mode) {
        return mode === "orange_only" ? null : value;
    }

    function getR2PurpleModeSummary(mode) {
        return mode === "orange_only"
            ? "R2 当前未使用紫数情报，橙色后验仅由橙色均格约束。"
            : "R2 当前已使用紫数情报，橙色后验同时受橙色均格与紫色件数约束。";
    }

    function shouldDisableR2PurpleCount(mode) {
        return mode === "orange_only";
    }

    function syncR2PurpleCountInput(input, mode) {
        if (!input) return input;
        const disabled = shouldDisableR2PurpleCount(mode);
        input.disabled = disabled;
        input.placeholder = disabled ? "本局不使用该情报" : "未知留空";
        if (disabled) input.value = "";
        return input;
    }

    return {
        getDefaultR2PurpleMode,
        getR2PurpleModeSummary,
        normalizeR2PurpleCount,
        shouldDisableR2PurpleCount,
        syncR2PurpleCountInput
    };
}));
