const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    AuctionKingEstimator,
    resolveEstimatorConfig,
    roundedAvgInterval,
    hasFeasibleAverageForCount,
    deriveAdaptiveSolverBudget
} = require("../src/core/estimator.js");

function createConfig() {
    return {
        alpha_counts: { w: 5.8, g: 5.0, b: 3.5, p: 2.5, o: 1.8, r: 0.9 },
        cells_per_item: {
            w: { mean: 1.25, sd: 0.55, min: 1, max: 3 },
            g: { mean: 1.50, sd: 0.65, min: 1, max: 4 },
            b: { mean: 1.85, sd: 0.75, min: 1, max: 5 },
            p: { mean: 2.20, sd: 0.85, min: 1, max: 6 },
            o: { mean: 2.65, sd: 0.95, min: 1, max: 8 },
            r: { mean: 3.25, sd: 1.20, min: 1, max: 10 }
        },
        value_model: {
            w: { base_item_mean: 80, base_item_sd: 25, per_cell_mean: 30, per_cell_sd: 8 },
            g: { base_item_mean: 170, base_item_sd: 55, per_cell_mean: 60, per_cell_sd: 18 },
            b: { base_item_mean: 420, base_item_sd: 140, per_cell_mean: 120, per_cell_sd: 35 },
            p: { base_item_mean: 1050, base_item_sd: 300, per_cell_mean: 240, per_cell_sd: 70 },
            o: { base_item_mean: 2500, base_item_sd: 700, per_cell_mean: 420, per_cell_sd: 120 },
            r: { base_item_mean: 7000, base_item_sd: 2000, per_cell_mean: 900, per_cell_sd: 250 }
        },
        solver: { max_states: 500000, mc_samples: 64 }
    };
}

function createState(overrides = {}) {
    return {
        r1_total_items: 10,
        r1_blue_count: null,
        r2_orange_avg: null,
        r2_purple_count: null,
        r2_orange_count: null,
        r2_white_green_cells: null,
        r3_green_count: null,
        r3_purple_avg: null,
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
        bid_price: null,
        ...overrides
    };
}

function createMapPresetConfig() {
    const config = createConfig();
    config.map_name = "基础模板";
    config.collection_families = {
        relics: { label: "文物", notes: ["基础家族"] }
    };
    config.map_presets = {
        sunken_ship: {
            map_name: "沉船图-高难",
            value_model: {
                r: { base_item_mean: 7000, base_item_sd: 2000, per_cell_mean: 900, per_cell_sd: 250 }
            },
            collection_families: {
                relics: { label: "文物", notes: ["沉船偏高"] }
            }
        },
        villa: {
            map_name: "别墅图-高难",
            value_model: {
                r: { base_item_mean: 2800, base_item_sd: 900, per_cell_mean: 260, per_cell_sd: 80 }
            },
            collection_families: {
                furniture: { label: "家居", notes: ["别墅常见"] }
            }
        }
    };
    return config;
}

function createPointMassPosterior(count) {
    return {
        mean_cells: count,
        p10_cells: count,
        p90_cells: count,
        feasible_low: count,
        feasible_high: count,
        mass: [{ count, prob: 1 }]
    };
}

test("resolveEstimatorConfig applies map preset overrides", () => {
    const resolved = resolveEstimatorConfig(createMapPresetConfig(), "villa");

    assert.equal(resolved.map_name, "别墅图-高难");
    assert.equal(resolved.value_model.r.base_item_mean, 2800);
    assert.equal(resolved.value_model.r.per_cell_mean, 260);
    assert.equal(resolved.collection_families.furniture.label, "家居");
    assert.equal(resolved.collection_families.relics.label, "文物");
});

test("resolveEstimatorConfig supports the new app/maps/model config structure", () => {
    const resolved = resolveEstimatorConfig({
        app: {
            default_map_id: "sunken_ship"
        },
        model: {
            alpha_counts: { w: 1, g: 2, b: 3, p: 4, o: 5, r: 6 },
            cells_per_item: createConfig().cells_per_item,
            value_model: createConfig().value_model,
            red_type_profiles: {
                profiles: {
                    small_red: { prior: 0.5 }
                }
            },
            collection_families: {
                relics: { label: "文物" }
            }
        },
        maps: {
            villa: {
                map_name: "别墅图-高难",
                value_model: {
                    r: { base_item_mean: 2800, base_item_sd: 900, per_cell_mean: 260, per_cell_sd: 80 }
                },
                collection_families: {
                    furniture: { label: "家居" }
                }
            }
        },
        solver: {
            max_states: 4000000,
            mc_samples: 180000
        }
    }, "villa");

    assert.equal(resolved.active_map_id, "villa");
    assert.equal(resolved.map_name, "别墅图-高难");
    assert.equal(resolved.value_model.r.base_item_mean, 2800);
    assert.equal(resolved.collection_families.furniture.label, "家居");
    assert.equal(resolved.collection_families.relics.label, "文物");
    assert.equal(resolved.solver.max_states, 4000000);
});

test("resolveEstimatorConfig preserves base config without map selection", () => {
    const config = createMapPresetConfig();
    const resolved = resolveEstimatorConfig(config, null);

    assert.equal(resolved.map_name, "基础模板");
    assert.equal(resolved.value_model.r.base_item_mean, 7000);
    assert.deepEqual(resolved.collection_families, config.collection_families);
});

test("map presets change valuation output for the same weighted state", () => {
    const zeroPosterior = createPointMassPosterior(0);
    const redPosterior = createPointMassPosterior(5);
    const weighted = [
        {
            p: 1,
            cand: {
                counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                color_grids: {
                    w: zeroPosterior,
                    g: zeroPosterior,
                    b: zeroPosterior,
                    p: zeroPosterior,
                    o: zeroPosterior,
                    r: redPosterior
                }
            }
        }
    ];

    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
        const sunkenEstimator = new AuctionKingEstimator(resolveEstimatorConfig(createMapPresetConfig(), "sunken_ship"), createState());
        const villaEstimator = new AuctionKingEstimator(resolveEstimatorConfig(createMapPresetConfig(), "villa"), createState());

        const sunkenValue = sunkenEstimator.valuationMc(weighted).mean_value;
        const villaValue = villaEstimator.valuationMc(weighted).mean_value;

        assert.notEqual(sunkenValue, villaValue, `expected different valuations across map presets, got ${sunkenValue} vs ${villaValue}`);
        assert.ok(sunkenValue > villaValue, `expected sunken preset to price red higher than villa, got ${sunkenValue} vs ${villaValue}`);
    } finally {
        Math.random = originalRandom;
    }
});

test("valuationMc scales a selected quality to the per-item override entered in w units", () => {
    const zeroPosterior = createPointMassPosterior(0);
    const purplePosterior = createPointMassPosterior(2);
    const weighted = [
        {
            p: 1,
            cand: {
                counts: { w: 0, g: 0, b: 0, p: 1, o: 0, r: 0 },
                color_grids: {
                    w: zeroPosterior,
                    g: zeroPosterior,
                    b: zeroPosterior,
                    p: purplePosterior,
                    o: zeroPosterior,
                    r: zeroPosterior
                }
            }
        }
    ];
    const config = createConfig();
    config.value_model = {
        w: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        g: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        b: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        p: { base_item_mean: 1000, base_item_sd: 0, per_cell_mean: 250, per_cell_sd: 0 },
        o: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        r: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 }
    };
    config.solver.mc_samples = 1;

    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
        const baselineEstimator = new AuctionKingEstimator(config, createState());
        const overriddenEstimator = new AuctionKingEstimator(config, createState({ custom_p_value_w: 0.3 }));

        const baseline = baselineEstimator.valuationMc(weighted).mean_value;
        const overridden = overriddenEstimator.valuationMc(weighted).mean_value;

        assert.equal(baseline, 1500);
        assert.equal(overridden, 3000);
    } finally {
        Math.random = originalRandom;
    }
});

test("valuationMc anchors total value to a system provided per-cell average", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({ system_avg_value_per_cell: 100 })
    );
    const weighted = [
        {
            p: 1,
            cand: {
                counts: { w: 0, g: 0, b: 0, p: 1, o: 1, r: 0 },
                color_grids: {
                    w: { mean_cells: 0, p10_cells: 0, p90_cells: 0, mass: [{ count: 0, prob: 1 }] },
                    g: { mean_cells: 0, p10_cells: 0, p90_cells: 0, mass: [{ count: 0, prob: 1 }] },
                    b: { mean_cells: 0, p10_cells: 0, p90_cells: 0, mass: [{ count: 0, prob: 1 }] },
                    p: { mean_cells: 2, p10_cells: 2, p90_cells: 2, mass: [{ count: 2, prob: 1 }] },
                    o: { mean_cells: 3, p10_cells: 3, p90_cells: 3, mass: [{ count: 3, prob: 1 }] },
                    r: { mean_cells: 0, p10_cells: 0, p90_cells: 0, mass: [{ count: 0, prob: 1 }] }
                }
            }
        }
    ];

    const valuation = estimator.valuationMc(weighted, { mc_samples: 8 });

    assert.equal(valuation.mean_value, 500);
    assert.equal(valuation.q05, 500);
    assert.equal(valuation.q95, 500);
    assert.equal(valuation.system_avg_value_per_cell, 100);
});

test("validateState rejects non-integer total item counts", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({ r1_total_items: 3.5 })
    );

    const errors = estimator.validateState();

    assert.ok(
        errors.some((error) => error.includes("正整数")),
        `expected integer validation error, received: ${errors.join(" | ")}`
    );
});

test("validateState rejects negative single-battle value overrides", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            custom_p_value_w: -0.1,
            custom_o_value_w: -0.2,
            custom_r_value_w: -0.3,
            system_avg_value_per_cell: -1
        })
    );

    const errors = estimator.validateState();

    assert.ok(errors.some((error) => error.includes("custom_p_value_w 不能为负数")));
    assert.ok(errors.some((error) => error.includes("custom_o_value_w 不能为负数")));
    assert.ok(errors.some((error) => error.includes("custom_r_value_w 不能为负数")));
    assert.ok(errors.some((error) => error.includes("system_avg_value_per_cell 不能为负数")));
});

test("validateState rejects invalid system value hint scope", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            system_avg_value_type_count: -2
        })
    );
    const nonIntegerEstimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            system_avg_value_type_count: 1.5
        })
    );

    const errors = estimator.validateState();
    const nonIntegerErrors = nonIntegerEstimator.validateState();

    assert.ok(errors.some((error) => error.includes("system_avg_value_type_count 不能为负数")));
    assert.ok(nonIntegerErrors.some((error) => error.includes("system_avg_value_type_count 必须为整数")));
});

test("deriveAdaptiveSolverBudget tightens limits for sparse early-round inputs", () => {
    const config = createConfig();
    config.solver = { max_states: 4000000, mc_samples: 180000 };

    const sparseBudget = deriveAdaptiveSolverBudget(config, createState({ r1_total_items: 42 }));
    const constrainedBudget = deriveAdaptiveSolverBudget(config, createState({
        r1_total_items: 42,
        r1_blue_count: 15,
        r2_orange_avg: 2.14,
        r3_green_count: 7,
        r3_purple_avg: 2.55,
        r4_blue_avg: 2.53,
        r5_white_green_total: 10
    }));

    assert.ok(sparseBudget.max_states < constrainedBudget.max_states, JSON.stringify({ sparseBudget, constrainedBudget }));
    assert.ok(sparseBudget.mc_samples < constrainedBudget.mc_samples, JSON.stringify({ sparseBudget, constrainedBudget }));
});

test("hasFeasibleAverageForCount handles zero-count and extreme impossible averages", () => {
    const model = createConfig().cells_per_item.o;
    assert.equal(hasFeasibleAverageForCount(model, 0, 0), true);
    assert.equal(hasFeasibleAverageForCount(model, 0, 2.66), false);
    assert.equal(hasFeasibleAverageForCount(model, 3, 2.66), true);
    assert.equal(hasFeasibleAverageForCount(model, 3, 99), false);
});

test("unbounded catalog cell max accepts observed averages above the old 12-cell cap", () => {
    const model = { mean: 3.2, sd: 1.1, min: 1, max: null };
    assert.equal(
        hasFeasibleAverageForCount(model, 1, 13, { rawText: "13" }),
        true,
        "catalog max=null should not reject a one-item 13-cell average"
    );

    const config = createConfig();
    config.cells_per_item.o = model;
    config.solver.average_observation = { rounding_mode: "truncate" };
    const estimator = new AuctionKingEstimator(
        config,
        createState({
            r1_total_items: 1,
            r2_orange_count: 1,
            r2_orange_avg: 13,
            r2_orange_avg_text: "13"
        })
    );
    const result = estimator.recompute();

    assert.equal(result.error, false, JSON.stringify(result));
    assert.equal(result.summary.count_means.o, 1);
    assert.equal(result.summary.cell_means.o, 13);
});

test("enumerateCountStates respects explicit white count constraints", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 10,
            r1_blue_count: 2,
            r2_purple_count: 1,
            r3_green_count: 3,
            r5_white_count: 2
        })
    );

    const states = estimator.enumerateCountStates();

    assert.ok(states.length > 0, "expected at least one feasible state");
    assert.ok(
        states.every((state) => state.w === 2),
        `expected all states to keep white count at 2, got: ${JSON.stringify(states.slice(0, 5))}`
    );
});

test("enumerateCountStates prunes impossible orange counts before full candidate building", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 8,
            r2_orange_avg: 2.5
        })
    );

    const states = estimator.enumerateCountStates();

    assert.ok(states.length > 0, "expected feasible states after pruning");
    assert.ok(
        states.every((state) => state.o % 2 === 0),
        `expected orange-count pruning to keep only even counts, got ${JSON.stringify(states.slice(0, 10))}`
    );
});

test("green-white total cells and average can lock the red count without requiring a green-count probe", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 10,
            r1_blue_count: 2,
            r2_purple_count: 1,
            r2_orange_count: 1,
            r2_white_green_cells: 6,
            r3_white_green_avg: 1.5,
            r3_white_green_avg_text: "1.5"
        })
    );

    const result = estimator.recompute();

    assert.equal(result.error, false, JSON.stringify(result.messages || []));
    assert.deepEqual(result.summary.red_count_probs.map((entry) => entry.count), [2]);
    assert.ok(
        Math.abs(result.summary.red_count_probs[0].prob - 1) < 1e-12,
        JSON.stringify(result.summary.red_count_probs)
    );
});

test("total storage cells can sharpen the red-cell posterior once other color grids are anchored", () => {
    const storageAnchoredEstimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 10,
            r1_blue_count: 2,
            r2_purple_count: 1,
            r2_orange_count: 1,
            r2_orange_avg: 3,
            r2_orange_avg_text: "3",
            r2_white_green_cells: 6,
            r3_purple_avg: 2,
            r3_purple_avg_text: "2",
            r4_blue_avg: 2,
            r4_blue_avg_text: "2",
            r4_total_storage_cells: 20
        })
    );
    const baselineEstimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 10,
            r1_blue_count: 2,
            r2_purple_count: 1,
            r2_orange_count: 1,
            r2_orange_avg: 3,
            r2_orange_avg_text: "3",
            r2_white_green_cells: 6,
            r3_purple_avg: 2,
            r3_purple_avg_text: "2",
            r4_blue_avg: 2,
            r4_blue_avg_text: "2"
        })
    );

    const anchored = storageAnchoredEstimator.recompute();
    const baseline = baselineEstimator.recompute();

    assert.equal(anchored.error, false, JSON.stringify(anchored.messages || []));
    assert.equal(baseline.error, false, JSON.stringify(baseline.messages || []));
    const anchoredRed5 = anchored.summary.red_cell_probs.find((entry) => entry.count === 5);
    const baselineRed5 = baseline.summary.red_cell_probs.find((entry) => entry.count === 5);
    const anchoredRed0 = anchored.summary.red_cell_probs.find((entry) => entry.count === 0);
    const baselineRed0 = baseline.summary.red_cell_probs.find((entry) => entry.count === 0);

    assert.ok(anchoredRed5 && baselineRed5, JSON.stringify({
        anchored: anchored.summary.red_cell_probs.slice(0, 8),
        baseline: baseline.summary.red_cell_probs.slice(0, 8)
    }));
    assert.ok(
        anchoredRed5.prob > baselineRed5.prob,
        JSON.stringify({
            anchored: anchored.summary.red_cell_probs.slice(0, 5),
            baseline: baseline.summary.red_cell_probs.slice(0, 5)
        })
    );
    assert.ok(anchoredRed0 && baselineRed0 && anchoredRed0.prob < baselineRed0.prob, JSON.stringify({
        anchored: anchored.summary.red_cell_probs.slice(0, 8),
        baseline: baseline.summary.red_cell_probs.slice(0, 8)
    }));
});

test("validateState rejects invalid custom orange/red bounds", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 10,
            custom_o_min: 6,
            custom_o_max: 4,
            custom_r_min: -1
        })
    );

    const errors = estimator.validateState();

    assert.ok(
        errors.some((error) => error.includes("custom_o_min 不能大于 custom_o_max")),
        `expected custom_o range validation error, received: ${errors.join(" | ")}`
    );
    assert.ok(
        errors.some((error) => error.includes("custom_r_min 不能为负数")),
        `expected custom_r non-negative validation error, received: ${errors.join(" | ")}`
    );
});

test("enumerateCountStates respects custom orange/red count bounds", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 12,
            custom_o_min: 2,
            custom_o_max: 4,
            custom_r_min: 3,
            custom_r_max: 6
        })
    );

    const states = estimator.enumerateCountStates();

    assert.ok(states.length > 0, "expected feasible states under custom o/r bounds");
    assert.ok(
        states.every((state) => state.o >= 2 && state.o <= 4 && state.r >= 3 && state.r <= 6),
        `expected all states to satisfy custom o/r bounds, got ${JSON.stringify(states.slice(0, 10))}`
    );
});

test("validateState rejects inconsistent white and green total constraints", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r3_green_count: 3,
            r5_white_count: 2,
            r5_white_green_total: 8
        })
    );

    const errors = estimator.validateState();

    assert.ok(
        errors.some((error) => error.includes("必须等于")),
        `expected consistency validation error, received: ${errors.join(" | ")}`
    );
});

test("orange average constraints eliminate impossible odd orange counts", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 8,
            r2_orange_avg: 2.5
        })
    );

    const result = estimator.recompute();

    assert.equal(result.error, false, `expected successful recompute, got ${JSON.stringify(result)}`);
    assert.ok(result.summary.orange_count_probs.length > 0, "expected non-empty orange posterior");
    assert.ok(
        result.summary.orange_count_probs.every((entry) => entry.count % 2 === 0),
        `expected only even orange counts under avg_o=2.5, got ${JSON.stringify(result.summary.orange_count_probs)}`
    );
});

test("truncated orange average 2.66 stays feasible for Ahmed-style 34 total and 10 blue", () => {
    const interval = roundedAvgInterval(2.66, 3);
    assert.deepEqual(interval, [8, 8], `expected truncated 2.66 to accept 8/3, got ${JSON.stringify(interval)}`);

    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 34,
            r1_blue_count: 10,
            r2_orange_avg: 2.66
        })
    );

    const result = estimator.recompute();

    assert.equal(result.error, false, `expected truncated 2.66 state to stay feasible, got ${JSON.stringify(result)}`);
    assert.ok(result.summary.orange_count_probs.length > 0, "expected non-empty orange posterior");
    assert.ok(
        result.summary.orange_count_probs.every((entry) => entry.count % 3 === 0),
        `expected truncated 2.66 to keep orange counts on multiples of 3, got ${JSON.stringify(result.summary.orange_count_probs)}`
    );
});

test("catalog-backed 12-cell orange average stays feasible for the reported sunken round", () => {
    const estimator = new AuctionKingEstimator(
        resolveEstimatorConfig(defaultConfig, "sunken_ship"),
        createState({
            r1_total_items: 35,
            r1_blue_count: 10,
            r2_orange_avg: 12,
            r2_orange_avg_text: "12"
        })
    );

    const result = estimator.recompute();

    assert.equal(result.error, false, `expected 12-cell gold observation to stay feasible, got ${JSON.stringify(result)}`);
    assert.ok(result.summary.orange_count_probs.length > 0, "expected non-empty orange posterior");
});

test("catalog-backed 12-cell average support applies across visible average fields", () => {
    const config = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    const cases = [
        {
            label: "blue",
            state: createState({ r1_total_items: 1, r1_blue_count: 1, r4_blue_avg: 12, r4_blue_avg_text: "12" })
        },
        {
            label: "purple",
            state: createState({ r1_total_items: 1, r2_purple_count: 1, r3_purple_avg: 12, r3_purple_avg_text: "12" })
        },
        {
            label: "orange",
            state: createState({ r1_total_items: 1, r2_orange_count: 1, r2_orange_avg: 12, r2_orange_avg_text: "12" })
        },
        {
            label: "white-green",
            state: createState({ r1_total_items: 1, r5_white_green_total: 1, r3_white_green_avg: 12, r3_white_green_avg_text: "12" })
        }
    ];

    cases.forEach((entry) => {
        const result = new AuctionKingEstimator(config, entry.state).recompute();
        assert.equal(result.error, false, `${entry.label} 12-cell average should be feasible, got ${JSON.stringify(result)}`);
    });
});

test("system rounded averages accept the lower half-cent interval", () => {
    const model = { mean: 2.67, sd: 1, min: 0, max: 3 };

    assert.equal(
        hasFeasibleAverageForCount(model, 3, 2.67, { roundingMode: "truncate" }),
        false,
        "a value that would display as 2.66 under truncation must not match the tool-data path"
    );
    assert.equal(
        hasFeasibleAverageForCount(model, 3, 2.67, { roundingMode: "round" }),
        true,
        "system hint 2.67 should cover a true average of 8/3 from the lower half-cent interval"
    );
});

test("estimator honors field-level public rounded mode without changing default truncate mode", () => {
    const config = createConfig();
    config.cells_per_item.o = { mean: 2.67, sd: 0.2, min: 1, max: 8 };

    const baseState = {
        r1_total_items: 3,
        r2_orange_count: 3,
        r2_orange_avg: 2.67,
        r2_orange_avg_text: "2.67"
    };
    const truncated = new AuctionKingEstimator(config, createState(baseState)).recompute();
    const rounded = new AuctionKingEstimator(
        config,
        createState({
            ...baseState,
            r2_orange_avg_rounding_mode: "round"
        })
    ).recompute();

    assert.equal(truncated.error, true, "default tool-data truncation should reject 8/3 displaying as 2.67");
    assert.equal(rounded.error, false, `public rounded mode should accept 8/3, got ${JSON.stringify(rounded)}`);
});

test("display text 1.3 keeps only exact tenth orange counts while 1.30 keeps truncated tails", () => {
    const model = createConfig().cells_per_item.o;
    assert.equal(hasFeasibleAverageForCount(model, 10, 1.3, { rawText: "1.3" }), true);
    assert.equal(hasFeasibleAverageForCount(model, 13, 1.3, { rawText: "1.3" }), false);
    assert.equal(hasFeasibleAverageForCount(model, 13, 1.3, { rawText: "1.30" }), true);
    assert.equal(hasFeasibleAverageForCount(model, 20, 1.3, { rawText: "1.30" }), false);
});

test("estimator uses raw average display text to disambiguate 0.3 vs 0.30", () => {
    const config = createConfig();
    config.cells_per_item.o = { mean: 1, sd: 0.1, min: 0, max: 30 };

    const compact = new AuctionKingEstimator(
        config,
        createState({
            r1_total_items: 30,
            r2_orange_avg: 0.3,
            r2_orange_avg_text: "0.3"
        })
    ).recompute();

    const fixed = new AuctionKingEstimator(
        config,
        createState({
            r1_total_items: 30,
            r2_orange_avg: 0.3,
            r2_orange_avg_text: "0.30"
        })
    ).recompute();

    assert.deepEqual(compact.summary.orange_count_probs.map((entry) => entry.count), [10, 20, 30]);
    assert.deepEqual(fixed.summary.orange_count_probs.map((entry) => entry.count), [13, 23, 26]);
});

test("relaxed average observation widens sparse high-average support while preserving low-average text disambiguation", () => {
    const purpleModel = createConfig().cells_per_item.p;
    const orangeModel = createConfig().cells_per_item.o;
    const relaxedOptions = {
        rawText: "4.75",
        relaxSparseSupport: true,
        sparseSupportThreshold: 1,
        fallbackSlackCells: 1,
        fallbackMinAvg: 1
    };

    assert.equal(hasFeasibleAverageForCount(purpleModel, 3, 4.75, { rawText: "4.75" }), false);
    assert.equal(hasFeasibleAverageForCount(purpleModel, 3, 4.75, relaxedOptions), false);
    assert.equal(hasFeasibleAverageForCount(purpleModel, 4, 4.75, relaxedOptions), true);
    assert.equal(hasFeasibleAverageForCount(orangeModel, 1, 3.75, { ...relaxedOptions, rawText: "3.75" }), false);
    assert.equal(hasFeasibleAverageForCount(orangeModel, 3, 3.75, { ...relaxedOptions, rawText: "3.75" }), false);
    assert.equal(hasFeasibleAverageForCount(orangeModel, 4, 3.75, { ...relaxedOptions, rawText: "3.75" }), true);
    assert.equal(
        hasFeasibleAverageForCount(
            orangeModel,
            13,
            0.3,
            {
                rawText: "0.3",
                relaxSparseSupport: true,
                sparseSupportThreshold: 1,
                fallbackSlackCells: 1,
                fallbackMinAvg: 1
            }
        ),
        false
    );
});

test("estimator average_observation config expands sparse purple average support beyond single-point locking", () => {
    const strictEstimator = new AuctionKingEstimator(createConfig(), createState({ r1_total_items: 36 }));
    const strict = strictEstimator.inferCellsForColor("p", 4, 4.75, "4.75");

    const relaxedConfig = createConfig();
    relaxedConfig.solver.average_observation = {
        relax_sparse_support: true,
        sparse_support_threshold: 1,
        fallback_slack_cells: 1,
        fallback_min_avg: 1
    };
    const relaxedEstimator = new AuctionKingEstimator(relaxedConfig, createState({ r1_total_items: 36 }));
    const relaxed = relaxedEstimator.inferCellsForColor("p", 4, 4.75, "4.75");

    assert.equal(strict.posterior.feasible_low, 19);
    assert.equal(strict.posterior.feasible_high, 19);
    assert.ok(relaxed.posterior.feasible_low <= 18, JSON.stringify(relaxed.posterior));
    assert.ok(relaxed.posterior.feasible_high >= 20, JSON.stringify(relaxed.posterior));
});

test("zero orange average keeps only zero orange counts instead of rejecting the state", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 8,
            r2_orange_avg: 0
        })
    );

    const result = estimator.recompute();

    assert.equal(result.error, false, `expected zero average to remain feasible via zero-count support, got ${JSON.stringify(result)}`);
    assert.equal(result.summary.orange_count_probs.length, 1);
    assert.equal(result.summary.orange_count_probs[0].count, 0);
    assert.ok(Math.abs(result.summary.orange_count_probs[0].prob - 1) < 1e-12, JSON.stringify(result.summary.orange_count_probs));
});

test("extreme orange average returns a no-feasible-solution error instead of hanging", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 8,
            r2_orange_avg: 99
        })
    );

    const result = estimator.recompute();

    assert.equal(result.error, true, `expected impossible large average to fail gracefully, got ${JSON.stringify(result)}`);
    assert.ok(
        result.messages.some((message) => message.includes("没有可行解")),
        JSON.stringify(result.messages)
    );
});

test("inferCellsForColor exposes explicit discrete mass across the full feasible red-cell range", () => {
    const estimator = new AuctionKingEstimator(createConfig(), createState());

    const info = estimator.inferCellsForColor("r", 1, null);
    const support = info.posterior.mass.map((entry) => entry.count);
    const totalProb = info.posterior.mass.reduce((sum, entry) => sum + entry.prob, 0);

    assert.deepEqual(
        support,
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        `expected full feasible support for one red item, got ${JSON.stringify(info.posterior.mass)}`
    );
    assert.ok(
        Math.abs(totalProb - 1) < 1e-9,
        `expected explicit cell posterior to normalize to 1, got ${totalProb}`
    );
});

test("summary keeps exact red-cell tail support from candidate posteriors", () => {
    const estimator = new AuctionKingEstimator(createConfig(), createState());
    const zeroPosterior = estimator.inferCellsForColor("w", 0, null).posterior;
    const redPosterior = estimator.inferCellsForColor("r", 1, null).posterior;

    const summary = estimator.summarize([
        {
            p: 1,
            cand: {
                counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                color_grids: {
                    w: zeroPosterior,
                    g: zeroPosterior,
                    b: zeroPosterior,
                    p: zeroPosterior,
                    o: zeroPosterior,
                    r: redPosterior
                }
            }
        }
    ]);

    const support = summary.red_cell_probs.map((entry) => entry.count).sort((a, b) => a - b);

    assert.equal(support[0], 1, `expected red-cell support to include lower tail, got ${JSON.stringify(summary.red_cell_probs)}`);
    assert.equal(support[support.length - 1], 10, `expected red-cell support to include upper tail, got ${JSON.stringify(summary.red_cell_probs)}`);
});

test("summary exposes a normalized red cell distribution", () => {
    const estimator = new AuctionKingEstimator(
        createConfig(),
        createState({
            r1_total_items: 12,
            r1_blue_count: 2,
            r2_orange_avg: 2.5,
            r2_purple_count: 2,
            r3_green_count: 3,
            r3_purple_avg: 2.0,
            r4_blue_avg: 2.0,
            r5_white_green_total: 5
        })
    );

    const result = estimator.recompute();
    const totalProb = result.summary.red_cell_probs.reduce((sum, entry) => sum + entry.prob, 0);

    assert.equal(result.error, false, `expected successful recompute, got ${JSON.stringify(result)}`);
    assert.ok(result.summary.red_cell_probs.length > 0, "expected red cell posterior to be present");
    assert.ok(
        Math.abs(totalProb - 1) < 1e-6,
        `expected red cell distribution to normalize to 1, got ${totalProb}`
    );
});

test("average_observation relaxation avoids rigid high-avg locking in purple/orange ranges", () => {
    const defaultConfig = require("../src/core/default_config_bundle.js");
    const resolvedConfig = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    const estimator = new AuctionKingEstimator(
        resolvedConfig,
        {
            r1_total_items: 36,
            r1_blue_count: 16,
            r2_orange_avg: 1.66,
            r2_purple_count: null,
            r3_green_count: 3,
            r3_purple_avg: 4.75,
            r4_blue_avg: null,
            r5_white_green_total: null,
            r5_white_count: null,
            bid_price: 18800
        }
    );

    const result = estimator.recompute();

    assert.equal(result.error, false, `expected successful recompute, got ${JSON.stringify(result)}`);
    assert.ok(result.summary.cell_low.p < 19, JSON.stringify(result.summary));
    assert.ok(result.summary.cell_high.o > result.summary.cell_low.o, JSON.stringify(result.summary));
    assert.ok(result.summary.orange_count_probs.length > 1, JSON.stringify(result.summary.orange_count_probs));
    const orangeTailProb = result.summary.orange_count_probs
        .slice(1)
        .reduce((sum, entry) => sum + entry.prob, 0);
    assert.ok(
        orangeTailProb > 0,
        `expected orange posterior support to avoid rigid single-count locking, got ${JSON.stringify(result.summary.orange_count_probs.slice(0, 3))}`
    );
});

test("sunken default count prior does not over-lock sparse orange-five observations", () => {
    const resolvedConfig = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    const estimator = new AuctionKingEstimator(
        resolvedConfig,
        createState({
            r1_total_items: 38,
            r1_blue_count: 9,
            r2_orange_avg: 5,
            r2_orange_avg_text: "5",
            r2_white_green_cells: 16,
            r3_purple_avg: 2.16,
            r3_purple_avg_text: "2.16",
            r3_white_green_avg: 1.33,
            r3_white_green_avg_text: "1.33"
        })
    );

    const result = estimator.recompute();
    const orangeFiveProb = result.summary.orange_count_probs
        .filter((entry) => entry.count === 5)
        .reduce((sum, entry) => sum + entry.prob, 0);
    const redMean = result.summary.count_means.r;

    assert.equal(result.error, false, `expected successful recompute, got ${JSON.stringify(result)}`);
    assert.ok(
        orangeFiveProb < 0.5,
        `expected sparse orange-five posterior to stay uncertain, got ${orangeFiveProb}`
    );
    assert.ok(redMean > 1.5, `expected red residual support to remain material, got ${redMean}`);
});

test("valuationMc honors explicit point-mass cell posteriors when available", () => {
    const config = createConfig();
    config.solver.mc_samples = 1;
    config.value_model = {
        w: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        g: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        b: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        p: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        o: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        r: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 1, per_cell_sd: 0 }
    };

    const estimator = new AuctionKingEstimator(config, createState());
    const zeroPosterior = { mean_cells: 0, p10_cells: 0, p90_cells: 0, feasible_low: 0, feasible_high: 0, mass: [{ count: 0, prob: 1 }] };
    const redPosterior = { mean_cells: 7, p10_cells: 7, p90_cells: 7, feasible_low: 7, feasible_high: 7, mass: [{ count: 7, prob: 1 }] };

    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
        const valuation = estimator.valuationMc([
            {
                p: 1,
                cand: {
                    counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                    color_grids: {
                        w: zeroPosterior,
                        g: zeroPosterior,
                        b: zeroPosterior,
                        p: zeroPosterior,
                        o: zeroPosterior,
                        r: redPosterior
                    }
                }
            }
        ]);

        assert.equal(valuation.mean_value, 7, `expected valuation to use exact point-mass cells, got ${valuation.mean_value}`);
    } finally {
        Math.random = originalRandom;
    }
});

test("valuationMc does not create value from zero-count quality variance", () => {
    const config = createConfig();
    config.solver.mc_samples = 1;
    config.value_model = {
        w: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        g: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        b: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        p: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        o: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        r: { base_item_mean: 0, base_item_sd: 1000000, per_cell_mean: 0, per_cell_sd: 0 }
    };

    const estimator = new AuctionKingEstimator(config, createState());
    const zeroPosterior = createPointMassPosterior(0);
    const originalRandom = Math.random;
    let calls = 0;
    Math.random = () => {
        calls += 1;
        return calls % 9 === 0 ? 0 : 0.5;
    };

    try {
        const valuation = estimator.valuationMc([
            {
                p: 1,
                cand: {
                    counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
                    color_grids: {
                        w: zeroPosterior,
                        g: zeroPosterior,
                        b: zeroPosterior,
                        p: zeroPosterior,
                        o: zeroPosterior,
                        r: zeroPosterior
                    }
                }
            }
        ]);

        assert.equal(valuation.mean_value, 0, `expected zero-count qualities to contribute no value, got ${valuation.mean_value}`);
    } finally {
        Math.random = originalRandom;
    }
});

test("summary exposes red type template posterior when configured", () => {
    const config = createConfig();
    config.red_type_profiles = {
        profiles: {
            small_red: {
                label: "小红",
                prior: 1,
                mean_cells_per_item: 2.0,
                sd_cells_per_item: 0.2,
                base_item_mean: 100,
                base_item_sd: 0,
                per_cell_mean: 10,
                per_cell_sd: 0
            },
            big_red: {
                label: "大红",
                prior: 1,
                mean_cells_per_item: 5.0,
                sd_cells_per_item: 0.2,
                base_item_mean: 100,
                base_item_sd: 0,
                per_cell_mean: 10,
                per_cell_sd: 0
            }
        }
    };

    const estimator = new AuctionKingEstimator(config, createState());
    const zeroPosterior = { mean_cells: 0, p10_cells: 0, p90_cells: 0, feasible_low: 0, feasible_high: 0, mass: [{ count: 0, prob: 1 }] };
    const redPosterior = { mean_cells: 5, p10_cells: 5, p90_cells: 5, feasible_low: 5, feasible_high: 5, mass: [{ count: 5, prob: 1 }] };

    const summary = estimator.summarize([
        {
            p: 1,
            cand: {
                counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                color_grids: {
                    w: zeroPosterior,
                    g: zeroPosterior,
                    b: zeroPosterior,
                    p: zeroPosterior,
                    o: zeroPosterior,
                    r: redPosterior
                }
            }
        }
    ]);

    assert.equal(summary.red_type_probs[0].id, "big_red");
    assert.equal(summary.red_type_probs[0].label, "大红");
    assert.ok(
        summary.red_type_probs[0].prob > 0.999,
        `expected big red template to dominate, got ${JSON.stringify(summary.red_type_probs)}`
    );
});

test("summary does not expose collection family posterior in phase1 runtime", () => {
    const config = createConfig();
    config.collection_families = {
        relics: { label: "文物", prior: 3, value_bias: 1.2 },
        furniture: { label: "家居", prior: 1, value_bias: 0.8 }
    };

    const estimator = new AuctionKingEstimator(config, createState());
    const summary = estimator.summarize([
        {
            p: 1,
            cand: {
                counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                color_grids: {
                    w: createPointMassPosterior(0),
                    g: createPointMassPosterior(0),
                    b: createPointMassPosterior(0),
                    p: createPointMassPosterior(0),
                    o: createPointMassPosterior(0),
                    r: createPointMassPosterior(4)
                }
            }
        }
    ]);

    assert.deepEqual(summary.family_probs, []);
});

test("summary skips collection family mixing in phase1 runtime", () => {
    const estimator = new AuctionKingEstimator(createConfig(), createState());
    const zeroPosterior = createPointMassPosterior(0);
    const redPosterior = createPointMassPosterior(4);
    let redTypeCalls = 0;
    let familyCalls = 0;

    estimator.mixRedTypePosterior = (redCount, redMass) => {
        redTypeCalls += 1;
        assert.equal(redCount, 1);
        assert.deepEqual(redMass, [{ count: 4, prob: 1 }]);
        return [{ id: "small_red", label: "小红", prob: 1, anchor_item_value: 100, per_cell_mean: 10 }];
    };
    estimator.mixCollectionFamilyPosterior = (redCount, redMass) => {
        familyCalls += 1;
        assert.equal(redCount, 1);
        assert.deepEqual(redMass, [{ count: 4, prob: 1 }]);
        return [{ id: "relics", label: "文物", prob: 1, value_bias: 1.2, notes: ["测试"] }];
    };

    const summary = estimator.summarize([
        {
            p: 0.4,
            cand: {
                counts: { w: 1, g: 0, b: 0, p: 0, o: 0, r: 1 },
                color_grids: { w: zeroPosterior, g: zeroPosterior, b: zeroPosterior, p: zeroPosterior, o: zeroPosterior, r: redPosterior }
            }
        },
        {
            p: 0.6,
            cand: {
                counts: { w: 0, g: 1, b: 0, p: 0, o: 0, r: 1 },
                color_grids: { w: zeroPosterior, g: zeroPosterior, b: zeroPosterior, p: zeroPosterior, o: zeroPosterior, r: redPosterior }
            }
        }
    ]);

    assert.equal(redTypeCalls, 1, `expected red type mixing once per red count bucket, got ${redTypeCalls}`);
    assert.equal(familyCalls, 0, `expected family mixing disabled in phase1, got ${familyCalls}`);
    assert.deepEqual(summary.red_cell_probs, [{ count: 4, prob: 1 }]);
    assert.deepEqual(summary.family_probs, []);
});

test("inferRedTypePosterior ignores collection family red type biases in phase1 runtime", () => {
    const config = createConfig();
    config.red_type_profiles = {
        profiles: {
            small_red: {
                label: "小红",
                prior: 1,
                mean_cells_per_item: 3,
                sd_cells_per_item: 0.2,
                base_item_mean: 100,
                base_item_sd: 0,
                per_cell_mean: 10,
                per_cell_sd: 0
            },
            big_red: {
                label: "大红",
                prior: 1,
                mean_cells_per_item: 3,
                sd_cells_per_item: 0.2,
                base_item_mean: 100,
                base_item_sd: 0,
                per_cell_mean: 10,
                per_cell_sd: 0
            }
        }
    };
    config.collection_families = {
        relics: { label: "文物", prior: 5, value_bias: 1.1, red_type_bias: { big_red: 5, small_red: 0.5 } },
        furniture: { label: "家居", prior: 1, value_bias: 0.9, red_type_bias: { big_red: 0.5, small_red: 5 } }
    };

    const estimator = new AuctionKingEstimator(config, createState());
    const posterior = estimator.inferRedTypePosterior(1, 3);

    assert.equal(posterior.length, 2);
    assert.ok(Math.abs(posterior[0].prob - 0.5) < 1e-9, `expected phase1 to ignore family bias, got ${JSON.stringify(posterior)}`);
    assert.ok(Math.abs(posterior[1].prob - 0.5) < 1e-9, `expected phase1 to ignore family bias, got ${JSON.stringify(posterior)}`);
});

test("valuationMc ignores collection family value bias in phase1 runtime", () => {
    const config = createConfig();
    config.solver.mc_samples = 1;
    config.value_model = {
        w: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        g: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        b: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        p: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        o: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        r: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 }
    };
    config.red_type_profiles = {
        profiles: {
            small_red: {
                label: "小红",
                prior: 1,
                mean_cells_per_item: 5,
                sd_cells_per_item: 0.2,
                base_item_mean: 10,
                base_item_sd: 0,
                per_cell_mean: 2,
                per_cell_sd: 0
            }
        }
    };
    config.collection_families = {
        relics: { label: "文物", prior: 1, value_bias: 1.5 }
    };

    const estimator = new AuctionKingEstimator(config, createState());
    const zeroPosterior = createPointMassPosterior(0);
    const redPosterior = createPointMassPosterior(5);
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
        const valuation = estimator.valuationMc([
            {
                p: 1,
                cand: {
                    counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                    color_grids: {
                        w: zeroPosterior,
                        g: zeroPosterior,
                        b: zeroPosterior,
                        p: zeroPosterior,
                        o: zeroPosterior,
                        r: redPosterior
                    }
                }
            }
        ]);

        assert.equal(valuation.mean_value, 20, `expected phase1 to ignore family value bias, got ${valuation.mean_value}`);
    } finally {
        Math.random = originalRandom;
    }
});

test("valuationMc uses red type template value params when configured", () => {
    const config = createConfig();
    config.solver.mc_samples = 1;
    config.value_model.r = { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 };
    config.red_type_profiles = {
        profiles: {
            small_red: {
                label: "小红",
                prior: 0.0001,
                mean_cells_per_item: 2.0,
                sd_cells_per_item: 0.2,
                base_item_mean: 3,
                base_item_sd: 0,
                per_cell_mean: 1,
                per_cell_sd: 0
            },
            big_red: {
                label: "大红",
                prior: 1,
                mean_cells_per_item: 5.0,
                sd_cells_per_item: 0.2,
                base_item_mean: 10,
                base_item_sd: 0,
                per_cell_mean: 2,
                per_cell_sd: 0
            }
        }
    };

    const estimator = new AuctionKingEstimator(config, createState());
    const zeroPosterior = { mean_cells: 0, p10_cells: 0, p90_cells: 0, feasible_low: 0, feasible_high: 0, mass: [{ count: 0, prob: 1 }] };
    const redPosterior = { mean_cells: 5, p10_cells: 5, p90_cells: 5, feasible_low: 5, feasible_high: 5, mass: [{ count: 5, prob: 1 }] };
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
        const valuation = estimator.valuationMc([
            {
                p: 1,
                cand: {
                    counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                    color_grids: {
                        w: zeroPosterior,
                        g: zeroPosterior,
                        b: zeroPosterior,
                        p: zeroPosterior,
                        o: zeroPosterior,
                        r: redPosterior
                    }
                }
            }
        ]);

        assert.equal(valuation.mean_value, 20, `expected red template valuation to use big-red params, got ${valuation.mean_value}`);
    } finally {
        Math.random = originalRandom;
    }
});

test("valuationMc keeps configured red jackpot values out of the common outcome band", () => {
    const config = createConfig();
    config.solver.mc_samples = 100;
    config.value_model = {
        w: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        g: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        b: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        p: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        o: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        r: {
            base_item_mean: 300,
            base_item_sd: 0,
            per_cell_mean: 0,
            per_cell_sd: 0,
            tail_model: {
                threshold: 2000,
                battle_probability: 0.01,
                replacement_item_mean: 300,
                values: [10000]
            }
        }
    };
    delete config.red_type_profiles;

    const estimator = new AuctionKingEstimator(config, createState());
    const zeroPosterior = createPointMassPosterior(0);
    const redPosterior = createPointMassPosterior(5);
    const originalRandom = Math.random;
    let callIndex = 0;
    Math.random = () => {
        callIndex += 1;
        return callIndex === 8 ? 0.005 : 0.5;
    };

    try {
        const valuation = estimator.valuationMc([
            {
                p: 1,
                cand: {
                    counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 5 },
                    color_grids: {
                        w: zeroPosterior,
                        g: zeroPosterior,
                        b: zeroPosterior,
                        p: zeroPosterior,
                        o: zeroPosterior,
                        r: redPosterior
                    }
                }
            }
        ]);

        assert.equal(valuation.q50, 1500);
        assert.equal(valuation.q95, 1500);
        assert.ok(
            valuation.mean_value > 1500 && valuation.mean_value < 1700,
            `expected rare jackpot to affect mean without entering common band, got ${JSON.stringify(valuation)}`
        );
    } finally {
        Math.random = originalRandom;
    }
});

test("valuationMc draws red tail values from configured price-decay probabilities", () => {
    const config = createConfig();
    config.solver.mc_samples = 1;
    config.value_model = {
        w: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        g: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        b: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        p: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        o: { base_item_mean: 0, base_item_sd: 0, per_cell_mean: 0, per_cell_sd: 0 },
        r: {
            base_item_mean: 0,
            base_item_sd: 0,
            per_cell_mean: 0,
            per_cell_sd: 0,
            tail_model: {
                threshold: 200000,
                battle_probability: 1,
                replacement_item_mean: 0,
                values: [1000, 10000],
                weighted_values: [
                    { value: 1000, probability: 0.9 },
                    { value: 10000, probability: 0.1 }
                ]
            }
        }
    };
    delete config.red_type_profiles;

    const estimator = new AuctionKingEstimator(config, createState());
    const zeroPosterior = createPointMassPosterior(0);
    const redPosterior = createPointMassPosterior(1);
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
        const valuation = estimator.valuationMc([
            {
                p: 1,
                cand: {
                    counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 },
                    color_grids: {
                        w: zeroPosterior,
                        g: zeroPosterior,
                        b: zeroPosterior,
                        p: zeroPosterior,
                        o: zeroPosterior,
                        r: redPosterior
                    }
                }
            }
        ]);

        assert.equal(valuation.mean_value, 1000);
    } finally {
        Math.random = originalRandom;
    }
});

test("count_prior_strength can pull villa sparse observations away from high-red tails", () => {
    const baselineConfig = JSON.parse(JSON.stringify(defaultConfig));
    baselineConfig.calibration.maps.villa.count_prior_calibration.authority_status = "fallback_only";
    baselineConfig.calibration.maps.villa.count_prior_calibration.battle_sample_count = 0;
    baselineConfig.maps.villa.alpha_counts = {
        w: 6.2,
        g: 5.4,
        b: 3.9,
        p: 2.4,
        o: 1.8,
        r: 1.2
    };
    baselineConfig.maps.villa.solver = {
        count_prior_strength: 1
    };

    const tunedConfig = JSON.parse(JSON.stringify(baselineConfig));
    tunedConfig.maps.villa.alpha_counts = {
        w: 8.5,
        g: 7.6,
        b: 3.9,
        p: 4.2,
        o: 1.8,
        r: 0.12
    };
    tunedConfig.maps.villa.solver = {
        count_prior_strength: 8
    };

    const sparseVillaState = createState({
        r1_total_items: 45,
        r1_blue_count: 11,
        r2_orange_avg: 3.33,
        r2_orange_avg_text: "3.33",
        r2_white_green_cells: 18,
        r3_purple_avg: 1.8,
        r3_purple_avg_text: "1.8"
    });

    const baselineEstimator = new AuctionKingEstimator(resolveEstimatorConfig(baselineConfig, "villa"), sparseVillaState);
    const tunedEstimator = new AuctionKingEstimator(resolveEstimatorConfig(tunedConfig, "villa"), sparseVillaState);

    const baseline = baselineEstimator.recompute();
    const tuned = tunedEstimator.recompute();
    const baselineRedLow = baseline.summary.red_count_probs
        .filter((entry) => entry.count <= 3)
        .reduce((sum, entry) => sum + entry.prob, 0);
    const tunedRedLow = tuned.summary.red_count_probs
        .filter((entry) => entry.count <= 3)
        .reduce((sum, entry) => sum + entry.prob, 0);

    assert.ok(baselineRedLow < 0.3, `expected baseline low-red support to stay weak after removing cell hard-caps, got ${baselineRedLow}`);
    assert.ok(tunedRedLow > 0.9, `expected tuned prior strength to dominate the high-red tail, got ${tunedRedLow}`);
    assert.ok(tunedRedLow - baselineRedLow > 0.65, `expected tuned prior to materially improve low-red support, got ${JSON.stringify({ baselineRedLow, tunedRedLow })}`);
    assert.equal(tuned.summary.red_count_probs[0].count, 0);
});
