const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    buildManualCatalogCalibrationSnapshot,
    loadManualCatalogBatch,
    loadManualCatalogBatchesFromDirectory
} = require("../manual_item_catalog.js");

function buildExpectedCurrentValueModel(quality) {
    return {
        global: defaultConfig.model.value_model[quality],
        maps: Object.fromEntries(
            Object.entries(defaultConfig.maps).map(([mapId, mapConfig]) => [
                mapId,
                mapConfig.value_model[quality]
            ])
        )
    };
}

function buildExpectedDeltas(quality, suggestedBaseItemMean) {
    return {
        global_base_item_mean: suggestedBaseItemMean - defaultConfig.model.value_model[quality].base_item_mean,
        ...Object.fromEntries(
            Object.entries(defaultConfig.maps).map(([mapId, mapConfig]) => [
                `${mapId}_base_item_mean`,
                suggestedBaseItemMean - mapConfig.value_model[quality].base_item_mean
            ])
        )
    };
}

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

test("manual catalog calibration snapshot compares empirical white values against current config", () => {
    const batch = loadManualCatalogBatch(
        path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json")
    );
    const snapshot = buildManualCatalogCalibrationSnapshot([batch], defaultConfig);
    const white = snapshot.quality_summaries[0];

    assert.equal(snapshot.batch_count, 1);
    assert.equal(snapshot.quality_summaries.length, 1);
    assert.equal(white.quality, "w");
    assert.equal(white.observed_average_value, 267.86);
    assert.equal(white.observed_value_sd, 158.97);
    assert.deepEqual(white.suggested_value_model, {
        base_item_mean: 267,
        base_item_sd: 160,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_reported_item_mean",
        sample_count: 100,
        source_batches: 1
    });
    assert.deepEqual(white.current_value_model, buildExpectedCurrentValueModel("w"));
    assert.deepEqual(white.deltas, buildExpectedDeltas("w", 267));
    assert.deepEqual(white.pending_fields, []);
});

test("manual catalog calibration snapshot includes orange, purple, and red data when loading all manual batches", () => {
    const batches = loadManualCatalogBatchesFromDirectory(
        path.join(__dirname, "..", "data", "manual_catalog")
    );
    const snapshot = buildManualCatalogCalibrationSnapshot(batches, defaultConfig);
    const qualities = snapshot.quality_summaries.map((entry) => entry.quality).sort();
    const orange = snapshot.quality_summaries.find((entry) => entry.quality === "o");
    const purple = snapshot.quality_summaries.find((entry) => entry.quality === "p");
    const red = snapshot.quality_summaries.find((entry) => entry.quality === "r");

    assert.equal(snapshot.batch_count, 6);
    assert.deepEqual(qualities, ["b", "g", "o", "p", "r", "w"]);
    assert.equal(orange.quality, "o");
    assert.equal(orange.observed_average_value, 46325.17);
    assert.equal(orange.observed_value_sd, 28856.2);
    assert.deepEqual(orange.suggested_value_model, {
        base_item_mean: 46325,
        base_item_sd: 29002,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_reported_item_mean",
        sample_count: 100,
        source_batches: 1
    });
    assert.deepEqual(orange.current_value_model, buildExpectedCurrentValueModel("o"));
    assert.deepEqual(orange.deltas, buildExpectedDeltas("o", 46325));
    assert.deepEqual(orange.pending_fields, []);
    assert.equal(purple.quality, "p");
    assert.equal(purple.observed_average_value, 9492.84);
    assert.equal(purple.observed_value_sd, 5493.59);
    assert.deepEqual(purple.suggested_value_model, {
        base_item_mean: 9492,
        base_item_sd: 5520,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_reported_item_mean",
        sample_count: 103,
        source_batches: 1
    });
    assert.deepEqual(purple.current_value_model, buildExpectedCurrentValueModel("p"));
    assert.deepEqual(purple.deltas, buildExpectedDeltas("p", 9492));
    assert.deepEqual(purple.pending_fields, []);
    assert.equal(red.quality, "r");
    assert.equal(red.observed_average_value, 822956.57);
    assert.equal(red.observed_value_sd, 2508085.59);
    assert.deepEqual(red.suggested_value_model, {
        base_item_mean: 128777,
        base_item_sd: 48360,
        per_cell_mean: 0,
        per_cell_sd: 0,
        value_basis: "catalog_tail_aware_common_item_mean",
        sample_count: 92,
        source_batches: 1,
        tail_model: {
            ...expectedRedTailModel(),
            weighted_values: red.suggested_value_model.tail_model.weighted_values
        }
    });
    assert.deepEqual(red.current_value_model, buildExpectedCurrentValueModel("r"));
    assert.deepEqual(red.deltas, buildExpectedDeltas("r", 128777));
    assert.deepEqual(red.pending_fields, []);
    assert.equal(red.suggested_value_model.tail_model.weighted_values.length, 48);
    assert.ok(red.suggested_value_model.tail_model.weighted_values[0].probability > red.suggested_value_model.tail_model.weighted_values.at(-1).probability);
});
