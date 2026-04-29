const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    buildManualCatalogStats,
    buildValueModelCalibrationFromManualCatalog,
    loadManualCatalogBatch,
    loadManualCatalogBatchesFromDirectory
} = require("../manual_item_catalog.js");

test("white quality manual catalog batch parses and preserves the provided average/value set", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json");
    const payload = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

    assert.equal(payload.batch_id, "white_quality_items_batch_2026-04-23");
    assert.equal(payload.quality, "w");
    assert.equal(payload.reported_average_value, 267);
    assert.equal(payload.cell_count_status, "pending_high_res");
    assert.equal(payload.items.length, 100);
    assert.deepEqual(payload.items[0], {
        name: "花岗岩（毛料）",
        value: 902,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[payload.items.length - 1], {
        name: "农家土鸡蛋",
        value: 107,
        cells: null,
        name_confidence: "high"
    });
});

test("green quality manual catalog batch parses and preserves the provided average/value set", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "green_quality_items_batch_2026-04-23.json");
    const payload = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

    assert.equal(payload.batch_id, "green_quality_items_batch_2026-04-23");
    assert.equal(payload.quality, "g");
    assert.equal(payload.reported_average_value, 872);
    assert.equal(payload.cell_count_status, "pending_high_res");
    assert.equal(payload.items.length, 91);
    assert.deepEqual(payload.items[0], {
        name: "电动三轮车",
        value: 5129,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[payload.items.length - 1], {
        name: "珊瑚珠",
        value: 252,
        cells: null,
        name_confidence: "high"
    });
});

test("blue quality manual catalog batch parses and preserves the provided average/value set", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "blue_quality_items_batch_2026-04-23.json");
    const payload = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

    assert.equal(payload.batch_id, "blue_quality_items_batch_2026-04-23");
    assert.equal(payload.quality, "b");
    assert.equal(payload.reported_average_value, 3126);
    assert.equal(payload.cell_count_status, "pending_high_res");
    assert.equal(payload.items.length, 103);
    assert.deepEqual(payload.items[0], {
        name: "小型面包车",
        value: 14659,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[payload.items.length - 1], {
        name: "联名钥匙挂扣",
        value: 711,
        cells: null,
        name_confidence: "medium"
    });
});

test("purple quality manual catalog batch parses and preserves the provided average/value set", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "purple_quality_items_batch_2026-04-23.json");
    const payload = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

    assert.equal(payload.batch_id, "purple_quality_items_batch_2026-04-23");
    assert.equal(payload.quality, "p");
    assert.equal(payload.reported_average_value, 9492);
    assert.equal(payload.cell_count_status, "pending_high_res");
    assert.equal(payload.items.length, 103);
    assert.deepEqual(payload.items[0], {
        name: "加特林重机枪",
        value: 31688,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[payload.items.length - 1], {
        name: "黑钻松露",
        value: 2100,
        cells: null,
        name_confidence: "high"
    });
});

test("red quality manual catalog batch parses and closes the reported average", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "red_quality_items_batch_2026-04-23.json");
    const payload = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

    assert.equal(payload.batch_id, "red_quality_items_batch_2026-04-23");
    assert.equal(payload.quality, "r");
    assert.equal(payload.reported_average_value, 822956);
    assert.equal(payload.validation_status, "mean_closed");
    assert.equal(payload.items.length, 92);
    assert.equal(payload.observed_average_value, 822956.57);
    assert.equal(payload.observed_average_delta, 0.57);
    assert.deepEqual(payload.items[0], {
        name: "金陵折扇",
        value: 19371213,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[payload.items.length - 1], {
        name: "帕拉伊巴碧玺",
        value: 52500,
        cells: null,
        name_confidence: "high"
    });
});

test("orange quality manual catalog batch parses and closes the reported average after the missing-image correction", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "orange_quality_items_batch_2026-04-23.json");
    const payload = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

    assert.equal(payload.batch_id, "orange_quality_items_batch_2026-04-23");
    assert.equal(payload.quality, "o");
    assert.equal(payload.reported_average_value, 46325);
    assert.equal(payload.validation_status, "mean_closed");
    assert.equal(payload.items.length, 100);
    assert.equal(payload.observed_average_value, 46325.17);
    assert.equal(payload.observed_average_delta, 0.17);
    assert.deepEqual(payload.items[0], {
        name: "轻量化锂电池",
        value: 199900,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[75], {
        name: "植物水彩图",
        value: 25875,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[77], {
        name: "章丘铁锅",
        value: 24969,
        cells: null,
        name_confidence: "high"
    });
    assert.deepEqual(payload.items[payload.items.length - 1], {
        name: "旗舰手机",
        value: 7800,
        cells: null,
        name_confidence: "high"
    });
});

test("manual catalog directory loader ignores backup manifests and only returns item batches", () => {
    const batches = loadManualCatalogBatchesFromDirectory(
        path.join(__dirname, "..", "data", "manual_catalog")
    );

    assert.equal(batches.length, 6);
    assert.deepEqual(
        batches.map((entry) => entry.quality).sort(),
        ["b", "g", "o", "p", "r", "w"]
    );
});

test("manual item catalog loader normalizes the white batch and exposes stable metadata", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json");
    const payload = loadManualCatalogBatch(catalogPath);

    assert.equal(payload.quality, "w");
    assert.equal(payload.items.length, 100);
    assert.equal(payload.items[0].value, 902);
});

test("manual item catalog stats summarize the white batch into empirical value moments", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json");
    const payload = loadManualCatalogBatch(catalogPath);
    const stats = buildManualCatalogStats([payload]);

    assert.equal(stats.batch_count, 1);
    assert.equal(stats.item_count, 100);
    assert.equal(stats.qualities.length, 1);
    assert.deepEqual(stats.qualities[0], {
        quality: "w",
        item_count: 100,
        average_value: 267.86,
        reported_average_value: 267,
        median_value: 206,
        min_value: 107,
        max_value: 902,
        value_sd: 158.97
    });
});

test("manual item catalog calibration treats reported averages as full item value basis", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "white_quality_items_batch_2026-04-23.json");
    const payload = loadManualCatalogBatch(catalogPath);
    const calibration = buildValueModelCalibrationFromManualCatalog([payload]);

    assert.deepEqual(calibration, {
        w: {
            base_item_mean: 267,
            base_item_sd: 160,
            per_cell_mean: 0,
            per_cell_sd: 0,
            value_basis: "catalog_reported_item_mean",
            sample_count: 100,
            source_batches: 1
        }
    });
});

test("red manual catalog calibration keeps over-20w items as price-decayed tail", () => {
    const catalogPath = path.join(__dirname, "..", "data", "manual_catalog", "red_quality_items_batch_2026-04-23.json");
    const payload = loadManualCatalogBatch(catalogPath);
    const calibration = buildValueModelCalibrationFromManualCatalog([payload]);

    assert.equal(calibration.r.value_basis, "catalog_tail_aware_common_item_mean");
    assert.equal(calibration.r.base_item_mean, 128777);
    assert.equal(calibration.r.base_item_sd, 48360);
    assert.equal(calibration.r.tail_model.threshold, 200000);
    assert.equal(calibration.r.tail_model.battle_probability, 0.05);
    assert.equal(calibration.r.tail_model.catalog_tail_rate, 0.521739);
    assert.equal(calibration.r.tail_model.catalog_tail_sample_count, 48);
    assert.equal(calibration.r.tail_model.replacement_item_mean, 128777);
    assert.equal(calibration.r.tail_model.values[0], 226800);
    assert.equal(calibration.r.tail_model.values.at(-1), 19371213);
    assert.equal(calibration.r.tail_model.weighted_values.length, 48);
    assert.equal(calibration.r.tail_model.tail_weight_basis, "log_price_normal_tail");
    assert.ok(
        calibration.r.tail_model.weighted_values[0].probability > calibration.r.tail_model.weighted_values.at(-1).probability,
        "expected higher priced red items to sit deeper in the tail"
    );
    assert.ok(
        calibration.r.tail_model.weighted_values
            .filter((entry) => entry.value >= 2000000)
            .reduce((sum, entry) => sum + entry.probability, 0) < 0.01,
        "expected over-200w jackpot reds to remain a deep sub-tail inside the over-20w tail"
    );
});
