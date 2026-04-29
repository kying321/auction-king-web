const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createLruCache,
    buildEngineCacheKey,
    getConfigCacheFingerprint,
    countObservedSolveSignals,
    buildSolveStagePlan,
    getCancelledComputeState,
    getComputeUiState,
    shouldAutoComputeOnFieldExit,
    getRoleGuideToggleLabel
} = require("../src/browser/dashboard_runtime.js");

test("createLruCache evicts the oldest entry after limit", () => {
    const cache = createLruCache(2);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("b"), 2);
    assert.equal(cache.get("c"), 3);
});

test("createLruCache refreshes recency on get", () => {
    const cache = createLruCache(2);

    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.get("a"), 1);
    cache.set("c", 3);

    assert.equal(cache.get("a"), 1);
    assert.equal(cache.get("b"), undefined);
    assert.equal(cache.get("c"), 3);
});

test("buildEngineCacheKey is stable for identical map and state", () => {
    const config = { active_map_id: "sunken_ship", map_name: "沉船图" };
    const state = { r1_total_items: 34, r1_blue_count: 10, r2_orange_avg: 2.66 };

    assert.equal(buildEngineCacheKey(config, state), buildEngineCacheKey(config, state));
});

test("buildEngineCacheKey changes when resolved config content changes", () => {
    const state = { r1_total_items: 24, r2_orange_avg: 2.66 };
    const configA = {
        active_map_id: "sunken_ship",
        map_name: "沉船图",
        value_model: {
            b: { base_item_mean: 4300 }
        }
    };
    const configB = {
        active_map_id: "sunken_ship",
        map_name: "沉船图",
        value_model: {
            b: { base_item_mean: 8600 }
        }
    };

    assert.notEqual(buildEngineCacheKey(configA, state), buildEngineCacheKey(configB, state));
});

test("buildEngineCacheKey prefers a precomputed config fingerprint over serializing the whole config again", () => {
    const state = { r1_total_items: 24, r2_orange_avg: 2.66 };
    const config = {
        active_map_id: "sunken_ship",
        map_name: "沉船图"
    };
    Object.defineProperty(config, "cache_fingerprint", {
        value: "cfg:v1:sunken_ship",
        enumerable: false
    });
    config.toJSON = () => {
        throw new Error("full config serialization should be skipped when cache_fingerprint is present");
    };

    assert.equal(
        buildEngineCacheKey(config, state),
        JSON.stringify({
            map: "sunken_ship",
            config_fingerprint: "cfg:v1:sunken_ship",
            state
        })
    );
});

test("getConfigCacheFingerprint memoizes fallback serialization by object identity", () => {
    let toJSONCalls = 0;
    const config = {
        active_map_id: "sunken_ship",
        value_model: { r: { base_item_mean: 7000 } },
        toJSON() {
            toJSONCalls += 1;
            return {
                active_map_id: this.active_map_id,
                value_model: this.value_model
            };
        }
    };

    const first = getConfigCacheFingerprint(config);
    const second = getConfigCacheFingerprint(config);

    assert.equal(first, second);
    assert.equal(toJSONCalls, 1);
});

test("getCancelledComputeState clears running and preview flags after interrupted compute", () => {
    assert.deepEqual(getCancelledComputeState(), {
        running: false,
        previewPending: false
    });
});

test("cancelled compute state allows immediate recompute on the next field blur", () => {
    const cancelled = getCancelledComputeState();

    assert.equal(
        shouldAutoComputeOnFieldExit({ dirty: true, running: true, hasRequiredInput: true }),
        false
    );
    assert.equal(
        shouldAutoComputeOnFieldExit({ dirty: true, running: cancelled.running, hasRequiredInput: true }),
        true
    );
    assert.deepEqual(
        getComputeUiState({
            dirty: true,
            running: cancelled.running,
            hasRequiredInput: true,
            previewPending: cancelled.previewPending
        }),
        {
            label: "等待离框",
            hint: "输入完成后离开输入框会自动更新。",
            disabled: false
        }
    );
});

test("getComputeUiState requires total items before compute", () => {
    assert.deepEqual(
        getComputeUiState({ dirty: true, running: false, hasRequiredInput: false }),
        {
            label: "等待总件数",
            hint: "先填入总件数，离开输入框后再计算。",
            disabled: true
        }
    );
});

test("getComputeUiState shows dirty blur-update state", () => {
    assert.deepEqual(
        getComputeUiState({ dirty: true, running: false, hasRequiredInput: true }),
        {
            label: "等待离框",
            hint: "输入完成后离开输入框会自动更新。",
            disabled: false
        }
    );
});

test("getComputeUiState exposes coarse-first background refinement state", () => {
    assert.deepEqual(
        getComputeUiState({ dirty: false, running: true, hasRequiredInput: true, previewPending: true }),
        {
            label: "阶段结果已出",
            hint: "已先显示快速结果，更高精度后验会在后台补算。",
            disabled: true
        }
    );
});

test("countObservedSolveSignals only counts resolved inference signals", () => {
    assert.equal(countObservedSolveSignals({
        r1_total_items: 42,
        r1_blue_count: 14,
        r2_orange_avg: 2.14,
        r3_green_count: null,
        bid_price: 18800
    }), 2);
});

test("countObservedSolveSignals includes custom o/r bound constraints", () => {
    assert.equal(
        countObservedSolveSignals({
            r1_total_items: 36,
            custom_o_min: 2,
            custom_o_max: null,
            custom_r_min: null,
            custom_r_max: 6
        }),
        2
    );
});

test("buildSolveStagePlan keeps sparse early states on refine-only path", () => {
    const plan = buildSolveStagePlan(
        { r1_total_items: 42 },
        { max_states: 200000, mc_samples: 14400, is_sparse_mode: true }
    );

    assert.equal(plan.signalCount, 0);
    assert.equal(plan.full, null);
    assert.deepEqual(plan.refine.solverOverride, {
        max_states: 90000,
        mc_samples: 6480
    });
});

test("buildSolveStagePlan enables full follow-up when constraints are strong enough", () => {
    const plan = buildSolveStagePlan(
        {
            r1_total_items: 42,
            r1_blue_count: 14,
            r2_orange_avg: 2.14,
            r3_green_count: 7,
            r3_purple_avg: 2.55,
            r5_white_green_total: 10
        },
        { max_states: 704000, mc_samples: 34560, is_sparse_mode: true }
    );

    assert.equal(plan.signalCount, 5);
    assert.ok(plan.full);
    assert.equal(plan.full.timeoutMs, 2600);
});

test("buildSolveStagePlan honors explicit staging config overrides", () => {
    const plan = buildSolveStagePlan(
        {
            r1_total_items: 42,
            r1_blue_count: 14,
            r2_orange_avg: 2.14
        },
        { max_states: 200000, mc_samples: 14400, is_sparse_mode: true },
        {
            refine_ratio: 0.3,
            refine_min_states: 30000,
            refine_min_samples: 2500,
            min_signals_for_full: 2,
            min_signals_for_full_sparse: 2,
            refine_timeout_ms_sparse: 900,
            full_timeout_ms_sparse: 1800
        }
    );

    assert.deepEqual(plan.refine.solverOverride, {
        max_states: 60000,
        mc_samples: 4320
    });
    assert.equal(plan.refine.timeoutMs, 900);
    assert.ok(plan.full);
    assert.equal(plan.full.timeoutMs, 1800);
});

test("shouldAutoComputeOnFieldExit only triggers when input is dirty and required fields exist", () => {
    assert.equal(shouldAutoComputeOnFieldExit({ dirty: false, running: false, hasRequiredInput: true }), false);
    assert.equal(shouldAutoComputeOnFieldExit({ dirty: true, running: true, hasRequiredInput: true }), false);
    assert.equal(shouldAutoComputeOnFieldExit({ dirty: true, running: false, hasRequiredInput: false }), false);
    assert.equal(shouldAutoComputeOnFieldExit({ dirty: true, running: false, hasRequiredInput: true }), true);
});

test("getRoleGuideToggleLabel reflects expanded state", () => {
    assert.equal(getRoleGuideToggleLabel(false), "展开攻略映射");
    assert.equal(getRoleGuideToggleLabel(true), "收起攻略映射");
});
