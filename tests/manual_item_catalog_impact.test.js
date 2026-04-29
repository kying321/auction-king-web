const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildExpectedCellMix,
    buildExpectedCountMix,
    buildValueModelImpactReport,
    buildValueModelOverlayFromManualCatalog,
    computeDeterministicScenarioValue,
    loadManualCatalogBatchesFromDirectory
} = require("../src/core/manual_item_catalog.js");

test("expected count mix preserves the requested total via largest remainder allocation", () => {
    const counts = buildExpectedCountMix({ w: 1, g: 2, b: 3 }, 12);
    assert.deepEqual(counts, { b: 6, g: 4, w: 2 });
});

test("expected cell mix multiplies counts by mean cells and rounds to two decimals", () => {
    const cells = buildExpectedCellMix(
        { w: 2, r: 1 },
        {
            w: { mean: 1.3 },
            r: { mean: 3.7 }
        }
    );
    assert.deepEqual(cells, {
        w: 2.6,
        g: 0,
        b: 0,
        p: 0,
        o: 0,
        r: 3.7
    });
});

test("deterministic scenario value uses count base and cell contributions together", () => {
    const value = computeDeterministicScenarioValue(
        {
            w: { base_item_mean: 10, per_cell_mean: 2 },
            r: { base_item_mean: 100, per_cell_mean: 5 }
        },
        { w: 2, r: 1 },
        { w: 3, r: 4 }
    );
    assert.equal(value, 146);
});

test("value model impact report shows overlay changing expected EV on map-mix scenarios", () => {
    const batches = loadManualCatalogBatchesFromDirectory(
        path.join(__dirname, "..", "data", "manual_catalog")
    );
    const overlay = buildValueModelOverlayFromManualCatalog(batches, defaultConfig);
    const impact = buildValueModelImpactReport(overlay, defaultConfig, { totals: [24] });
    const sunken = impact.scenarios.find((entry) => entry.scenario_id === "sunken_ship_24");
    const villa = impact.scenarios.find((entry) => entry.scenario_id === "villa_24");
    const redUnit = impact.unit_impacts_by_map.sunken_ship.find((entry) => entry.quality === "r");
    const redTailThreshold = overlay.maps.sunken_ship.value_model.r.tail_model.threshold;

    assert.equal(impact.scenarios.length, 3);
    assert.ok(sunken.delta_value < 0);
    assert.ok(villa.delta_value > 0);
    assert.ok(redUnit.overlay_value < redTailThreshold);
    assert.equal(sunken.total_items, 24);
    assert.equal(
        Object.values(sunken.counts).reduce((sum, value) => sum + value, 0),
        24
    );
});
