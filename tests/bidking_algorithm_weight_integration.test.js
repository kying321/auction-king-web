const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const defaultConfig = require("../default_config_bundle.js");
const { AuctionKingEstimator, resolveEstimatorConfig } = require("../estimator.js");
const { buildLegacyEstimatorStateFromFieldValues } = require("../workspace_runtime.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const SCHEMA_BACKED_TABLE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-schema-backed-table-report.json"
);
const DODROP_SEMANTICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-dodrop-semantics-report.json"
);
const DROP_HELPER_SEMANTICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-drop-helper-semantics-report.json"
);

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function buildDropRecordIndex(records) {
    return new Map(records.map((record) => [record.group_id, record]));
}

function getValues(rows, index, fallback) {
    return rows.map((row) => (
        Array.isArray(row) && index < row.length ? row[index] : fallback
    ));
}

function randomWeightIndex(weights, rng) {
    assert.ok(Array.isArray(weights) && weights.length > 0, "weights must be non-empty");
    if (weights.length === 1) return 0;
    const total = weights.reduce((sum, value) => sum + value, 0);
    const threshold = Math.floor(rng() * total);
    let cumulative = 0;
    for (let index = 0; index < weights.length; index += 1) {
        cumulative += weights[index];
        if (threshold < cumulative) return index;
    }
    return weights.length - 1;
}

function selectByProbability(probabilities, rng) {
    assert.ok(Array.isArray(probabilities) && probabilities.length > 0, "probabilities must be non-empty");
    const selected = [];
    probabilities.forEach((probability, index) => {
        if (rng() < probability) selected.push(index);
    });
    return selected;
}

function randomProbabilityIndexes(weights, rng) {
    const total = weights.reduce((sum, value) => sum + value, 0);
    return selectByProbability(weights.map((weight) => weight / total), rng);
}

function randomCount(a, b, rng) {
    if (a === b) return a;
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    return low + Math.floor(rng() * (high - low));
}

function addItem(result, itemId, count) {
    result[itemId] = (result[itemId] || 0) + count;
}

function addRange(result, source) {
    Object.entries(source).forEach(([itemId, count]) => addItem(result, itemId, count));
}

function doDropShadow(dropRecordsByGroup, groupId, repeatCount, rng) {
    const drop = dropRecordsByGroup.get(groupId);
    assert.ok(drop, `missing drop group ${groupId}`);
    const result = {};

    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
        const rows = Array.isArray(drop.items_list) ? drop.items_list : [];
        const weights = getValues(rows, 4, 10000);
        const selectedIndexes = drop.weight_type === 1
            ? randomProbabilityIndexes(weights, rng)
            : [randomWeightIndex(weights, rng)];

        selectedIndexes.forEach((selectedIndex) => {
            const tuple = rows[selectedIndex];
            const kindOrNestedGroupMarker = tuple[0];
            const itemOrNestedGroupId = tuple[1];
            const count = randomCount(tuple[2], tuple[3], rng);
            if (kindOrNestedGroupMarker === 9999) {
                addRange(result, doDropShadow(dropRecordsByGroup, itemOrNestedGroupId, count, rng));
            } else {
                addItem(result, itemOrNestedGroupId, count);
            }
        });
    }

    return result;
}

function finiteCountMeans(result) {
    return Object.values(result.summary.count_means).every((value) => Number.isFinite(value));
}

test("current default estimator weights remain the runtime authority", () => {
    assert.equal(defaultConfig.app.config_source_version, "ak_workspace_v2_20260428_sunken_red_tail_refit_v2");
    assert.deepEqual(resolveEstimatorConfig(defaultConfig, "sunken_ship").alpha_counts, {
        w: 5.2,
        g: 6.62,
        b: 8.5,
        p: 2.95,
        o: 1.25,
        r: 0.8
    });
    assert.equal(resolveEstimatorConfig(defaultConfig, "sunken_ship").solver.count_prior_strength, 2.4);
    assert.equal(resolveEstimatorConfig(defaultConfig, "sunken_ship").solver.open_high_orange_avg_threshold, 4);
    assert.equal(resolveEstimatorConfig(defaultConfig, "sunken_ship").solver.open_high_orange_avg_count_prior_strength, 1.4);
    assert.deepEqual(resolveEstimatorConfig(defaultConfig, "villa").alpha_counts, {
        w: 8.5,
        g: 7.6,
        b: 3.9,
        p: 3.2,
        o: 4,
        r: 0.12
    });
    assert.equal(resolveEstimatorConfig(defaultConfig, "villa").solver.count_prior_strength, 8);
    assert.deepEqual(resolveEstimatorConfig(defaultConfig, "shipping").alpha_counts, {
        w: 4.5,
        g: 4.4,
        b: 3.6,
        p: 2.9,
        o: 2.2,
        r: 0.9
    });
});

test("BidKing DoDrop shadow semantics replay deterministic table-backed samples", () => {
    const schemaReport = readJson(SCHEMA_BACKED_TABLE_REPORT_PATH);
    const dropRecords = schemaReport.named_tables.Table_Drop.records;
    const dropRecordsByGroup = buildDropRecordIndex(dropRecords);

    const probabilityGroup = dropRecordsByGroup.get(1000);
    assert.equal(probabilityGroup.weight_type, 1);
    assert.equal(probabilityGroup.items_list.length, 20);
    assert.deepEqual(doDropShadow(dropRecordsByGroup, 1000, 1, () => 0), Object.fromEntries(
        probabilityGroup.items_list.map((tuple) => [String(tuple[1]), 1])
    ));

    const weightedGroup = dropRecordsByGroup.get(1011);
    assert.equal(weightedGroup.weight_type, 2);
    assert.deepEqual(doDropShadow(dropRecordsByGroup, 1011, 1, () => 0), {
        1101006: 1
    });

    const nestedGroup = dropRecordsByGroup.get(101101);
    assert.equal(nestedGroup.items_list[0][0], 9999);
    assert.equal(nestedGroup.items_list[0][1], 1011);
    assert.deepEqual(doDropShadow(dropRecordsByGroup, 101101, 1, () => 0), {
        1101006: 1
    });
});

test("BidKing reverse-engineered semantics stay blocked from default config adoption", () => {
    const schemaReport = readJson(SCHEMA_BACKED_TABLE_REPORT_PATH);
    const doDropReport = readJson(DODROP_SEMANTICS_REPORT_PATH);
    const helperReport = readJson(DROP_HELPER_SEMANTICS_REPORT_PATH);

    [schemaReport, doDropReport, helperReport].forEach((report) => {
        assert.equal(report.summary.authority_adoption_allowed, false);
        assert.equal(report.summary.default_config_update_allowed, false);
        assert.equal(report.summary.shadow_candidate_allowed, false);
    });
    assert.equal(doDropReport.summary.weight_type_counts["1"], 47);
    assert.equal(doDropReport.summary.weight_type_counts["2"], 547);
    assert.equal(helperReport.summary.probability_mode_is_independent_bernoulli, true);
    assert.equal(helperReport.summary.weighted_mode_is_single_cumulative_choice, true);
    assert.equal(helperReport.summary.random_count_upper_bound_exclusive, true);
});

test("shadow drop replay does not mutate current estimator config or weight resolution", () => {
    const mapsBefore = JSON.stringify(defaultConfig.maps);
    const schemaReport = readJson(SCHEMA_BACKED_TABLE_REPORT_PATH);
    doDropShadow(buildDropRecordIndex(schemaReport.named_tables.Table_Drop.records), 101101, 1, () => 0);

    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 48,
        blue_count: 9,
        orange_avg_cells: 3.12,
        purple_avg_cells: 3.75,
        white_green_total_cells: 29,
        white_green_avg_cells: 1.93
    });
    const result = new AuctionKingEstimator(resolveEstimatorConfig(defaultConfig, "sunken_ship"), state).recompute();

    assert.equal(JSON.stringify(defaultConfig.maps), mapsBefore);
    assert.equal(result.error, false, result.messages ? result.messages.join("; ") : "solver should be feasible");
    assert.equal(finiteCountMeans(result), true);
    assert.deepEqual(defaultConfig.maps.sunken_ship.alpha_counts, {
        w: 5.2,
        g: 6.62,
        b: 8.5,
        p: 2.95,
        o: 1.25,
        r: 0.8
    });
    assert.deepEqual(cloneValue(resolveEstimatorConfig(defaultConfig, "sunken_ship").alpha_counts), defaultConfig.maps.sunken_ship.alpha_counts);
});
