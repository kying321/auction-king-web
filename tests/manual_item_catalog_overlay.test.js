const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    buildValueModelOverlayFromManualCatalog,
    loadManualCatalogBatchesFromDirectory
} = require("../manual_item_catalog.js");

function expectedRedTailModel() {
    return {
        threshold: 200000,
        battle_probability: 0.05,
        catalog_tail_rate: 0.521739,
        catalog_tail_sample_count: 48,
        replacement_item_mean: 128777,
        values: [
            226800, 240660, 249000, 255115, 255840, 258760, 259165, 266050,
            281600, 282240, 284519, 287280, 293400, 294000, 295500, 305920,
            316000, 322560, 357040, 361000, 362400, 375000, 390000, 422002,
            444000, 452800, 457200, 465000, 470400, 475000, 512000, 531000,
            567900, 844000, 1003000, 1039000, 1089660, 1236666, 1491800,
            1495000, 1552500, 1553900, 1688400, 2516000, 3000000, 7402320,
            13145200, 19371213
        ],
        tail_weight_basis: "log_price_normal_tail",
        tail_log_sigma_base: 3,
        value_basis: "catalog_over_threshold_downweighted_battle_tail"
    };
}

test("manual catalog value-model overlay replaces item moments and zeroes reported-average per-cell params", () => {
    const batches = loadManualCatalogBatchesFromDirectory(
        path.join(__dirname, "..", "data", "manual_catalog")
    );
    const overlay = buildValueModelOverlayFromManualCatalog(batches, defaultConfig);

    assert.equal(overlay.source_batch_count, 6);
    assert.equal(overlay.source_quality_count, 6);
    assert.deepEqual(overlay.caution, [
        "research_only",
        "catalog_item_mean_value_basis",
        "per_cell_params_zeroed_when_reported_average_is_used"
    ]);

    assert.deepEqual(overlay.model.value_model.r, {
        base_item_mean: 128777,
        base_item_sd: 48360,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_tail_aware_common_item_mean",
        tail_model: {
            ...expectedRedTailModel(),
            weighted_values: overlay.model.value_model.r.tail_model.weighted_values
        }
    });
    assert.equal(overlay.model.value_model.r.tail_model.weighted_values.length, 48);
    assert.ok(overlay.model.value_model.r.tail_model.weighted_values[0].probability > overlay.model.value_model.r.tail_model.weighted_values.at(-1).probability);
    assert.deepEqual(overlay.model.value_model.o, {
        base_item_mean: 46325,
        base_item_sd: 29002,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_reported_item_mean"
    });

    assert.deepEqual(overlay.maps.sunken_ship.value_model.r, {
        base_item_mean: 128777,
        base_item_sd: 48360,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_tail_aware_common_item_mean",
        tail_model: {
            ...expectedRedTailModel(),
            weighted_values: overlay.maps.sunken_ship.value_model.r.tail_model.weighted_values
        }
    });
    assert.deepEqual(overlay.maps.villa.value_model.o, {
        base_item_mean: 46325,
        base_item_sd: 29002,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_reported_item_mean"
    });
    assert.deepEqual(overlay.maps.shipping.value_model.w, {
        base_item_mean: 267,
        base_item_sd: 160,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_reported_item_mean"
    });
});
