const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { AuctionKingEstimator, resolveEstimatorConfig } = require("../src/core/estimator.js");
const { buildLegacyEstimatorStateFromFieldValues } = require("../src/browser/workspace_runtime.js");

test("bundled default config keeps global model defaults and per-map overrides separate", () => {
    assert.equal(defaultConfig.app.default_map_id, "sunken_ship");
    assert.equal(defaultConfig.model.value_model.r.base_item_mean, 128000);
    assert.equal(defaultConfig.model.red_type_profiles.profiles.gold_red.base_item_mean, 140000);
    assert.equal(defaultConfig.maps.sunken_ship.alpha_counts.r, 0.8);
    assert.equal(defaultConfig.maps.sunken_ship.cells_per_item.p.mean, 2.7773);
    assert.equal(defaultConfig.maps.sunken_ship.value_model.r.base_item_mean, 128000);
});

test("bundled default config exposes calibrated solver limits", () => {
    assert.equal(defaultConfig.solver.max_states, 4000000);
    assert.equal(defaultConfig.solver.mc_samples, 180000);
});

test("bundled cell models do not hard-cap catalog-backed item shapes at 12 cells", () => {
    const assertCellMax = (label, cellsPerItem) => {
        ["w", "g", "b", "p", "o", "r"].forEach((quality) => {
            assert.equal(
                cellsPerItem[quality].max,
                null,
                `${label}.${quality} max cell cap should be catalog-driven/unbounded`
            );
        });
    };

    assertCellMax("model", defaultConfig.model.cells_per_item);
    Object.entries(defaultConfig.maps).forEach(([mapId, mapConfig]) => {
        assertCellMax(`maps.${mapId}`, mapConfig.cells_per_item);
    });
    assert.equal(defaultConfig.solver.unbounded_cell_max_per_item, 30);
});

test("bundled map count priors include current red-tail refit fallback candidates", () => {
    assert.equal(defaultConfig.maps.villa.alpha_counts.o, 4.0);
    assert.equal(defaultConfig.maps.villa.alpha_counts.p, 3.2);
    assert.equal(defaultConfig.maps.villa.solver.count_prior_strength, 8);
    assert.equal(defaultConfig.maps.sunken_ship.alpha_counts.p, 2.95);
    assert.equal(defaultConfig.maps.sunken_ship.solver.count_prior_strength, 2.4);
    assert.equal(defaultConfig.maps.shipping.alpha_counts.p, 2.9);
});

test("bundled map priors keep high-average screenshot-like input feasible without red residual inflation", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 48,
        blue_count: 9,
        orange_avg_cells: 3.12,
        purple_avg_cells: 3.75,
        white_green_total_cells: 29,
        white_green_avg_cells: 1.93
    });
    const sunken = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();
    const villa = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "villa"), state).recompute();

    assert.equal(sunken.error, false, sunken.messages ? sunken.messages.join("; ") : "sunken should solve");
    assert.equal(villa.error, false, JSON.stringify(villa));
    assert.ok(
        sunken.summary.count_means.r < 1,
        `expected conservative red prior to avoid red residual inflation, got ${sunken.summary.count_means.r}`
    );
    assert.ok(
        villa.summary.count_means.p < 9,
        `expected villa purple count to avoid 16-lock, got ${villa.summary.count_means.p}`
    );
    assert.ok(
        (villa.summary.count_probs.p[16] || 0) < 0.02,
        `expected villa p=16 mass below 1%, got ${JSON.stringify(villa.summary.count_probs.p)}`
    );
});

test("bundled sunken sparse fallback keeps large-warehouse purple expectation near current refit prior", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 58,
        blue_count: 15
    });
    const sunken = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();

    assert.equal(sunken.error, false, sunken.messages ? sunken.messages.join("; ") : "sunken should solve");
    assert.ok(
        sunken.summary.count_means.p >= 6.9 && sunken.summary.count_means.p <= 7.6,
        `expected sunken sparse purple count near red-tail refit prior, got ${sunken.summary.count_means.p}`
    );
    assert.ok(
        sunken.summary.count_means.o < 4 && sunken.summary.count_means.r < 3,
        `expected sparse orange/red defaults to stay conservative, got ${JSON.stringify(sunken.summary.count_means)}`
    );
});

test("bundled red type value templates stay inside conservative public-grid envelopes", () => {
    const caps = {
        sunken_ship: { small_red: 60000, big_red: 100000, gold_red: 165000 },
        villa: { small_red: 45000, big_red: 65000, gold_red: 120000 },
        shipping: { small_red: 65000, big_red: 90000, gold_red: 170000 }
    };

    Object.entries(caps).forEach(([mapId, profileCaps]) => {
        const profiles = defaultConfig.maps[mapId].red_type_profiles.profiles;
        Object.entries(profileCaps).forEach(([profileId, cap]) => {
            const profile = profiles[profileId];
            const effectivePerCell = (
                profile.base_item_mean + profile.mean_cells_per_item * profile.per_cell_mean
            ) / profile.mean_cells_per_item;
            assert.ok(
                effectivePerCell <= cap,
                `${mapId}.${profileId} effective per-cell ${effectivePerCell} exceeds ${cap}`
            );
        });
    });
});

test("bundled red value model separates common red values from rare jackpot tail", () => {
    const resolved = resolveEstimatorConfig(defaultConfig, "sunken_ship");
    const gold = defaultConfig.maps.sunken_ship.red_type_profiles.profiles.gold_red;

    assert.equal(defaultConfig.app.config_source_version, "ak_workspace_v2_20260428_sunken_red_tail_refit_v2");
    assert.equal(resolved.value_model.r.base_item_mean, 149381);
    assert.equal(resolved.value_model.r.value_basis, "catalog_tail_aware_common_item_mean");
    assert.equal(resolved.value_model.r.tail_model.threshold, 200000);
    assert.equal(resolved.value_model.r.tail_model.battle_probability, 0.14);
    assert.equal(resolved.value_model.r.tail_model.weighted_values.length, 48);
    assert.ok(
        resolved.value_model.r.base_item_mean < resolved.value_model.r.tail_model.threshold,
        `expected common red replacement mean below jackpot threshold, got ${JSON.stringify(resolved.value_model.r)}`
    );
    assert.ok(
        gold.base_item_mean >= resolved.value_model.r.tail_model.threshold,
        `expected sunken gold red profile to remain a tail anchor, got ${JSON.stringify(gold)}`
    );
});

test("bundled sunken conservative defaults reject the 2026-04-27 large-loss settlement input", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 35,
        bid: 1111111,
        blue_count: 13,
        blue_avg_cells: "1.76",
        purple_avg_cells: "3.75",
        orange_count: 4,
        orange_avg_cells: "3.5",
        orange_total_cells: 14,
        white_green_total_cells: 14,
        white_green_avg_cells: "1.75"
    });
    const result = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();

    assert.equal(result.error, false, result.messages ? result.messages.join("; ") : "solver should be feasible");
    assert.ok(
        result.summary.count_probs.r[2] > 0.88,
        `expected current default to prefer red=2, got ${JSON.stringify(result.summary.red_count_probs)}`
    );
    assert.ok(
        result.valuation.mean_value > 820000 && result.valuation.mean_value < 940000,
        `expected red-tail refit valuation to stay below bid, got ${result.valuation.mean_value}`
    );
    assert.ok(
        result.valuation.expected_profit < 0,
        `expected 1,111,111 bid to remain negative EV, got ${JSON.stringify(result.valuation)}`
    );
    assert.ok(
        result.valuation.profit_prob < 0.3,
        `expected profit probability below 30%, got ${result.valuation.profit_prob}`
    );
});

test("bundled solver uses matching quality average and total cells to lock the quality count", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 28,
        blue_count: 5,
        orange_avg_cells: "6",
        orange_total_cells: 6
    });
    const result = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();

    assert.equal(result.error, false, result.messages ? result.messages.join("; ") : "solver should be feasible");
    assert.ok(
        result.summary.count_probs.o[1] > 0.999,
        `expected orange/gold count to lock to 1 when avg=6 and total cells=6, got ${JSON.stringify(result.summary.orange_count_probs)}`
    );
    assert.equal(result.summary.cell_low.o, 6);
    assert.equal(result.summary.cell_high.o, 6);
});

test("bundled solver accepts two-decimal blue average text from screenshot capture packages", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 46,
        blue_count: 11,
        blue_avg_cells: "2.90",
        purple_avg_cells: "3.27",
        orange_avg_cells: "9.5",
        white_green_total_cells: 44,
        white_green_avg_cells: "2.44",
        white_green_total_count: 18
    });
    const result = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();

    assert.equal(result.error, false, result.messages ? result.messages.join("; ") : "solver should be feasible");
    assert.ok(
        result.summary.red_count_probs.length > 1,
        `expected two-decimal screenshot input to keep nonzero red alternatives, got ${JSON.stringify(result.summary.red_count_probs)}`
    );
    assert.ok(
        result.summary.orange_count_probs.length > 1,
        `expected two-decimal screenshot input to keep nonzero orange alternatives, got ${JSON.stringify(result.summary.orange_count_probs)}`
    );
});

test("bundled sunken high-orange-average evidence no longer forces red residual to five-plus", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 55,
        blue_count: 22,
        blue_avg_cells: "2.68",
        purple_avg_cells: "2.92",
        orange_avg_cells: "4.66",
        white_green_total_cells: 23,
        white_green_avg_cells: "2.09"
    });
    const result = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();

    assert.equal(result.error, false, result.messages ? result.messages.join("; ") : "solver should be feasible");
    assert.ok(
        result.summary.count_means.r <= 4.25,
        `expected orange high-average tail to avoid red=5+ forcing, got ${result.summary.count_means.r}`
    );
    assert.ok(
        result.summary.count_means.o >= 4.3,
        `expected orange count to absorb high-average residual, got ${result.summary.count_means.o}`
    );
});

test("bundled sunken fallback-only priors do not saturate ambiguous capture count posteriors", () => {
    const captureLikeInputs = [
        {
            label: "20260427T1636 large warehouse",
            field_values: {
                total_items: 55,
                blue_count: 15,
                purple_avg_cells: "2.9",
                orange_avg_cells: "4.33",
                white_green_total_cells: 31,
                white_green_avg_cells: "1.63"
            }
        },
        {
            label: "20260427T1640 compact warehouse",
            field_values: {
                total_items: 37,
                blue_count: 12,
                blue_avg_cells: "1.75",
                purple_count: 8,
                purple_avg_cells: "1.62",
                orange_avg_cells: "2.5",
                white_green_total_cells: 13,
                white_green_avg_cells: "1.85"
            }
        }
    ];

    captureLikeInputs.forEach(({ label, field_values }) => {
        const state = buildLegacyEstimatorStateFromFieldValues(field_values);
        const result = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();

        assert.equal(result.error, false, result.messages ? result.messages.join("; ") : `${label} should solve`);
        const orangeTop = result.summary.orange_count_probs[0];
        const redTop = result.summary.red_count_probs[0];
        assert.ok(
            orangeTop.prob < 0.99,
            `${label} orange posterior should not saturate without exact orange count, got ${JSON.stringify(result.summary.orange_count_probs.slice(0, 3))}`
        );
        assert.ok(
            redTop.prob < 0.99,
            `${label} red posterior should not saturate without exact red count, got ${JSON.stringify(result.summary.red_count_probs.slice(0, 3))}`
        );
    });
});

test("fallback-only calibration count priors mirror current map defaults", () => {
    assert.equal(defaultConfig.calibration.maps.villa.count_prior_calibration.authority_status, "fallback_only");
    assert.deepEqual(
        defaultConfig.calibration.maps.villa.count_prior_calibration.alpha_counts,
        defaultConfig.maps.villa.alpha_counts
    );
    assert.equal(defaultConfig.calibration.maps.sunken_ship.count_prior_calibration.authority_status, "fallback_only");
    assert.deepEqual(
        defaultConfig.calibration.maps.sunken_ship.count_prior_calibration.alpha_counts,
        defaultConfig.maps.sunken_ship.alpha_counts
    );
});

test("bundled default config includes Ahmed hand-fill template in the requested field order", () => {
    const ahmedTemplate = defaultConfig.templates.builtins.find((template) => template.id === "ahmed_default");
    assert.ok(ahmedTemplate);
    assert.deepEqual(
        ahmedTemplate.fields.map((field) => field.field_id),
        [
            "total_items",
            "orange_avg_cells",
            "blue_count",
            "purple_avg_cells",
            "white_green_total_cells",
            "white_green_avg_cells",
            "blue_avg_cells",
            "total_storage_cells"
        ]
    );
});

test("resolveEstimatorConfig keeps fallback-only count priors editable while still applying value-model calibration", () => {
    const resolved = resolveEstimatorConfig(defaultConfig, "villa");

    assert.equal(defaultConfig.calibration.maps.villa.count_prior_calibration.authority_status, "fallback_only");
    assert.equal(resolved.alpha_counts.p, defaultConfig.maps.villa.alpha_counts.p);
    assert.equal(resolved.value_model.p.base_item_mean, defaultConfig.calibration.maps.villa.value_model_calibration.value_model.p.base_item_mean);
    assert.equal(resolved.value_model.p.per_cell_mean, 0);
    assert.equal(resolved.value_model.p.value_basis, "catalog_reported_item_mean");
});
