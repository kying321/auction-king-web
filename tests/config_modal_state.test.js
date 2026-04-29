const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    getConfigModalViewState,
    CONFIG_MODAL_VIEWS
} = require("../src/browser/config_modal_state.js");

test("structured config view is the primary editable mode and keeps advanced JSON read-only", () => {
    const currentConfig = { app: { default_map_id: "villa" }, solver: { max_states: 123 } };
    const defaultConfig = { app: { default_map_id: "sunken_ship" }, solver: { max_states: 4000000 } };

    const result = getConfigModalViewState(CONFIG_MODAL_VIEWS.STRUCTURED, currentConfig, defaultConfig);

    assert.equal(result.readOnly, true);
    assert.equal(result.showSaveAction, true);
    assert.equal(result.showStructuredControls, true);
    assert.equal(result.showImportExport, true);
    assert.match(result.helpText, /结构化控件/);
    assert.equal(JSON.parse(result.jsonText).app.default_map_id, "villa");
});

test("baseline config view is read-only and hides structured controls", () => {
    const currentConfig = { app: { default_map_id: "villa" } };
    const defaultConfig = { app: { default_map_id: "sunken_ship" }, solver: { max_states: 4000000 } };

    const result = getConfigModalViewState(CONFIG_MODAL_VIEWS.BASELINE, currentConfig, defaultConfig);

    assert.equal(result.readOnly, true);
    assert.equal(result.showSaveAction, false);
    assert.equal(result.showStructuredControls, false);
    assert.equal(result.showImportExport, false);
    assert.match(result.helpText, /内置默认/);
    assert.equal(JSON.parse(result.jsonText).app.default_map_id, "sunken_ship");
});

test("override diff view only includes keys changed from bundled defaults", () => {
    const currentConfig = {
        app: { default_map_id: "villa" },
        solver: { max_states: 123, mc_samples: 180000 },
        maps: {
            villa: {
                value_model: {
                    r: { base_item_mean: 150000 }
                }
            }
        }
    };
    const defaultConfig = {
        app: { default_map_id: "sunken_ship" },
        solver: { max_states: 4000000, mc_samples: 180000 },
        maps: {
            villa: {
                value_model: {
                    r: { base_item_mean: 145000 }
                }
            }
        }
    };

    const result = getConfigModalViewState(CONFIG_MODAL_VIEWS.OVERRIDES, currentConfig, defaultConfig);
    const parsed = JSON.parse(result.jsonText);

    assert.equal(result.readOnly, true);
    assert.equal(result.showSaveAction, false);
    assert.equal(result.showStructuredControls, false);
    assert.match(result.helpText, /覆盖差异/);
    assert.deepEqual(parsed, {
        app: { default_map_id: "villa" },
        solver: { max_states: 123 },
        maps: {
            villa: {
                value_model: {
                    r: { base_item_mean: 150000 }
                }
            }
        }
    });
});

test("config modal layout exposes structured, baseline and overrides toggles", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "tools.html"), "utf8");

    assert.match(html, /id="btn-config-view-structured"/);
    assert.match(html, /id="btn-config-view-baseline"/);
    assert.match(html, /id="btn-config-view-overrides"/);
    assert.match(html, /id="btn-config-import"/);
    assert.match(html, /id="btn-config-export"/);
});
