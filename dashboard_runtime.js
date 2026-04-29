function createLruCache(limit = 12) {
    const max = Number.isInteger(limit) && limit > 0 ? limit : 12;
    const store = new Map();

    return {
        get(key) {
            if (!store.has(key)) return undefined;
            const value = store.get(key);
            store.delete(key);
            store.set(key, value);
            return value;
        },
        set(key, value) {
            if (store.has(key)) store.delete(key);
            store.set(key, value);
            while (store.size > max) {
                const oldestKey = store.keys().next().value;
                store.delete(oldestKey);
            }
            return value;
        },
        clear() {
            store.clear();
        }
    };
}

const configFingerprintCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;

function getConfigCacheFingerprint(config) {
    if (config && typeof config.cache_fingerprint === "string" && config.cache_fingerprint.length > 0) {
        return config.cache_fingerprint;
    }

    if (config === null || config === undefined) return "null";
    if (typeof config !== "object") return JSON.stringify(config);

    if (configFingerprintCache && configFingerprintCache.has(config)) {
        return configFingerprintCache.get(config);
    }

    const fingerprint = JSON.stringify(config || {});
    if (configFingerprintCache) {
        configFingerprintCache.set(config, fingerprint);
    }
    return fingerprint;
}

function buildEngineCacheKey(config, stateVars) {
    return JSON.stringify({
        map: config && (config.active_map_id || config.default_map_id || config.map_name || null),
        config_fingerprint: getConfigCacheFingerprint(config),
        state: stateVars || {}
    });
}

function getCancelledComputeState() {
    return {
        running: false,
        previewPending: false
    };
}

function countObservedSolveSignals(stateVars) {
    if (!stateVars || typeof stateVars !== "object") return 0;
    return [
        stateVars.r1_blue_count,
        stateVars.r2_orange_avg,
        stateVars.r2_purple_count,
        stateVars.r3_green_count,
        stateVars.r3_purple_avg,
        stateVars.r4_blue_avg,
        stateVars.r5_white_green_total,
        stateVars.r5_white_count,
        stateVars.custom_o_min,
        stateVars.custom_o_max,
        stateVars.custom_r_min,
        stateVars.custom_r_max
    ].filter((value) => value !== null && value !== undefined).length;
}

function buildSolveStagePlan(stateVars, solverBudget, stagingConfig = null) {
    const signalCount = countObservedSolveSignals(stateVars);
    const sparseMode = !!(solverBudget && solverBudget.is_sparse_mode);
    const baseMaxStates = solverBudget && Number.isInteger(solverBudget.max_states) ? solverBudget.max_states : 200000;
    const baseMcSamples = solverBudget && Number.isInteger(solverBudget.mc_samples) ? solverBudget.mc_samples : 14400;
    const refineRatio = Number.isFinite(stagingConfig && stagingConfig.refine_ratio) ? stagingConfig.refine_ratio : 0.45;
    const refineMinStates = Number.isInteger(stagingConfig && stagingConfig.refine_min_states) ? stagingConfig.refine_min_states : 50000;
    const refineMinSamples = Number.isInteger(stagingConfig && stagingConfig.refine_min_samples) ? stagingConfig.refine_min_samples : 4000;
    const minSignalsForFull = Number.isInteger(stagingConfig && stagingConfig.min_signals_for_full) ? stagingConfig.min_signals_for_full : 3;
    const minSignalsForFullSparse = Number.isInteger(stagingConfig && stagingConfig.min_signals_for_full_sparse) ? stagingConfig.min_signals_for_full_sparse : 5;
    const refineTimeoutSparse = Number.isInteger(stagingConfig && stagingConfig.refine_timeout_ms_sparse) ? stagingConfig.refine_timeout_ms_sparse : 1400;
    const refineTimeoutDense = Number.isInteger(stagingConfig && stagingConfig.refine_timeout_ms_dense) ? stagingConfig.refine_timeout_ms_dense : 2200;
    const fullTimeoutSparse = Number.isInteger(stagingConfig && stagingConfig.full_timeout_ms_sparse) ? stagingConfig.full_timeout_ms_sparse : 2600;
    const fullTimeoutDense = Number.isInteger(stagingConfig && stagingConfig.full_timeout_ms_dense) ? stagingConfig.full_timeout_ms_dense : 4200;
    const refineMaxStates = Math.max(refineMinStates, Math.min(baseMaxStates, Math.round(baseMaxStates * refineRatio)));
    const refineMcSamples = Math.max(refineMinSamples, Math.min(baseMcSamples, Math.round(baseMcSamples * refineRatio)));
    const shouldRunFull = signalCount >= minSignalsForFull && (!sparseMode || signalCount >= minSignalsForFullSparse);

    return {
        signalCount,
        sparseMode,
        refine: {
            solverOverride: {
                max_states: refineMaxStates,
                mc_samples: refineMcSamples
            },
            timeoutMs: sparseMode ? refineTimeoutSparse : refineTimeoutDense
        },
        full: shouldRunFull
            ? {
                solverOverride: null,
                timeoutMs: sparseMode ? fullTimeoutSparse : fullTimeoutDense
            }
            : null
    };
}

function getComputeUiState({ dirty, running, hasRequiredInput }) {
    if (arguments[0] && arguments[0].previewPending) {
        return {
            label: "阶段结果已出",
            hint: "已先显示快速结果，更高精度后验会在后台补算。",
            disabled: true
        };
    }

    if (running) {
        return {
            label: "计算中...",
            hint: "正在计算当前输入结果。",
            disabled: true
        };
    }

    if (!hasRequiredInput) {
        return {
            label: "等待总件数",
            hint: "先填入总件数，离开输入框后再计算。",
            disabled: true
        };
    }

    if (dirty) {
        return {
            label: "等待离框",
            hint: "输入完成后离开输入框会自动更新。",
            disabled: false
        };
    }

    return {
        label: "结果已最新",
        hint: "当前结果已与输入同步，可继续修改。",
        disabled: false
    };
}

function shouldAutoComputeOnFieldExit({ dirty, running, hasRequiredInput }) {
    return Boolean(dirty && !running && hasRequiredInput);
}

function getRoleGuideToggleLabel(expanded) {
    return expanded ? "收起攻略映射" : "展开攻略映射";
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        createLruCache,
        buildEngineCacheKey,
        getConfigCacheFingerprint,
        countObservedSolveSignals,
        buildSolveStagePlan,
        getCancelledComputeState,
        getComputeUiState,
        shouldAutoComputeOnFieldExit,
        getRoleGuideToggleLabel
    };
}

if (typeof window !== "undefined") {
    window.createLruCache = createLruCache;
    window.buildEngineCacheKey = buildEngineCacheKey;
    window.getConfigCacheFingerprint = getConfigCacheFingerprint;
    window.countObservedSolveSignals = countObservedSolveSignals;
    window.buildSolveStagePlan = buildSolveStagePlan;
    window.getCancelledComputeState = getCancelledComputeState;
    window.getComputeUiState = getComputeUiState;
    window.shouldAutoComputeOnFieldExit = shouldAutoComputeOnFieldExit;
    window.getRoleGuideToggleLabel = getRoleGuideToggleLabel;
}
