const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildConfigEditorSections,
    applyConfigEditorValue,
    applyTemplateFieldMutation
} = require("../src/browser/config_editor_controls.js");

function createConfig() {
    return {
        app: {
            default_map_id: "sunken_ship",
            default_template_id: "ahmed_default"
        },
        fields: {
            items: [
                { id: "total_items", label: "总数量" },
                { id: "orange_avg_cells", label: "金色均格" },
                { id: "purple_avg_value", label: "紫色平均价值" }
            ]
        },
        templates: {
            builtins: [
                { id: "ahmed_default", label: "Ahmed 默认模板" },
                { id: "value_focus", label: "价值观察模板" }
            ]
        },
        maps: {
            sunken_ship: {
                map_name: "沉船图",
                alpha_counts: { w: 0.9, g: 1.6, b: 2.9, p: 3.2, o: 2.4, r: 1.8 },
                cells_per_item: {
                    w: { mean: 1.3 },
                    g: { mean: 1.6 },
                    b: { mean: 2.0 },
                    p: { mean: 2.5 },
                    o: { mean: 2.9 },
                    r: { mean: 3.7 }
                },
                red_type_profiles: {
                    profiles: {
                        small_red: { prior: 0.48 },
                        big_red: { prior: 0.34 },
                        gold_red: { prior: 0.18 }
                    }
                },
                collection_families: {
                    relics: { prior: 1.25, value_bias: 1.12 },
                    books: { prior: 1.05, value_bias: 1.06 }
                },
                value_model: {
                    r: { base_item_mean: 180000 }
                }
            },
            villa: {
                map_name: "别墅图",
                alpha_counts: { w: 6.2, g: 5.4, b: 3.9, p: 2.4, o: 1.8, r: 1.2 },
                cells_per_item: {
                    w: { mean: 1.8 },
                    g: { mean: 2.2 },
                    b: { mean: 2.7 },
                    p: { mean: 3.1 },
                    o: { mean: 3.6 },
                    r: { mean: 4.1 }
                },
                red_type_profiles: {
                    profiles: {
                        small_red: { prior: 0.68 },
                        big_red: { prior: 0.22 },
                        gold_red: { prior: 0.10 }
                    }
                },
                collection_families: {
                    furniture: { prior: 2.05, value_bias: 1.06 },
                    books: { prior: 1.35, value_bias: 1.02 }
                }
            },
            shipping: {
                map_name: "航运区",
                alpha_counts: { w: 4.5, g: 4.4, b: 3.6, p: 2.9, o: 2.2, r: 0.9 },
                cells_per_item: {
                    w: { mean: 1.3 },
                    g: { mean: 1.7 },
                    b: { mean: 2.1 },
                    p: { mean: 2.5 },
                    o: { mean: 3.1 },
                    r: { mean: 3.8 }
                },
                red_type_profiles: {
                    profiles: {
                        small_red: { prior: 0.46 },
                        big_red: { prior: 0.32 },
                        gold_red: { prior: 0.22 }
                    }
                },
                collection_families: {
                    cargo: { prior: 2.15, value_bias: 1.14 },
                    jewelry: { prior: 1.75, value_bias: 1.22 }
                }
            }
        },
        model: {
            alpha_counts: { o: 2, r: 1.3 },
            value_model: {
                p: { base_item_mean: 9000 },
                o: { base_item_mean: 16000 },
                r: { base_item_mean: 170000 }
            },
            collection_families: {
                relics: {
                    value_bias: 1.16
                }
            }
        },
        solver: {
            max_states: 4000000,
            mc_samples: 180000,
            average_observation: {
                rounding_mode: "truncate",
                relax_sparse_support: true
            },
            staging: {
                refine_ratio: 0.45
            }
        }
    };
}

test("buildConfigEditorSections exposes template, field, map, model and solver groups for the new workspace config", () => {
    const sections = buildConfigEditorSections(createConfig(), "sunken_ship");
    const sectionIds = sections.map((section) => section.id);
    const sectionsById = Object.fromEntries(sections.map((section) => [section.id, section]));

    assert.deepEqual(sectionIds, [
        "template-management",
        "template-field-layout",
        "field-directory",
        "map-quality-calibration",
        "map-value-calibration",
        "map-detail-calibration",
        "valuation-model",
        "solver"
    ]);
    assert.equal(sectionsById["template-management"].controls.find((control) => control.id === "default_template_id").kind, "select");
    assert.equal(sectionsById["template-management"].controls.find((control) => control.id === "default_template_id").value, "ahmed_default");
    assert.equal(sectionsById["template-field-layout"].controls[0].kind, "template-fields");
    assert.deepEqual(
        sectionsById["template-field-layout"].controls[0].value.map((field) => field.field_id).slice(0, 3),
        ["total_items", "orange_avg_cells", "blue_count"]
    );
    assert.equal(sectionsById["field-directory"].controls.find((control) => control.id === "field_total_items_label").value, "总数量");
    const mapQualityMatrix = sectionsById["map-quality-calibration"].controls.find((control) => control.id === "map_quality_matrix");
    assert.equal(mapQualityMatrix.kind, "map-quality-matrix");
    assert.deepEqual(mapQualityMatrix.maps.map((map) => map.map_id), ["sunken_ship", "villa", "shipping"]);
    assert.equal(mapQualityMatrix.maps[0].rows.find((row) => row.quality_id === "o").values.alpha.value, 2.4);
    assert.equal(mapQualityMatrix.maps[0].rows.find((row) => row.quality_id === "o").values.cells_mean.value, 2.9);
    const mapValueMatrix = sectionsById["map-value-calibration"].controls.find((control) => control.id === "map_value_matrix");
    assert.equal(mapValueMatrix.kind, "map-value-matrix");
    assert.equal(mapValueMatrix.maps[0].rows.find((row) => row.quality_id === "r").values.base_item_mean.value, 180000);
    assert.equal(mapValueMatrix.maps[0].rows.find((row) => row.quality_id === "r").values.per_cell_mean.value, undefined);
    assert.equal(sectionsById["map-detail-calibration"].controls.find((control) => control.id === "default_map_id").value, "sunken_ship");
    const mapRedProfileMatrix = sectionsById["map-detail-calibration"].controls.find((control) => control.id === "map_red_profile_matrix");
    assert.equal(mapRedProfileMatrix.kind, "profile-prior-matrix");
    assert.equal(mapRedProfileMatrix.rows.find((row) => row.profile_id === "gold_red").values.prior.value, 0.18);
    const mapFamilyBiasMatrix = sectionsById["map-detail-calibration"].controls.find((control) => control.id === "map_family_bias_matrix");
    assert.equal(mapFamilyBiasMatrix.kind, "family-bias-matrix");
    assert.equal(mapFamilyBiasMatrix.rows.find((row) => row.family_id === "relics").values.prior.value, 1.25);
    assert.equal(mapFamilyBiasMatrix.rows.find((row) => row.family_id === "relics").values.value_bias.value, 1.12);
    const globalValueMatrix = sectionsById["valuation-model"].controls.find((control) => control.id === "model_value_matrix");
    assert.equal(globalValueMatrix.kind, "value-model-matrix");
    assert.equal(globalValueMatrix.rows.find((row) => row.quality_id === "r").values.base_item_mean.value, 170000);
    assert.equal(globalValueMatrix.rows.find((row) => row.quality_id === "o").values.per_cell_mean.value, undefined);
    const globalFamilyBiasMatrix = sectionsById["valuation-model"].controls.find((control) => control.id === "model_family_bias_matrix");
    assert.equal(globalFamilyBiasMatrix.kind, "family-bias-matrix");
    assert.equal(globalFamilyBiasMatrix.rows.find((row) => row.family_id === "relics").values.value_bias.value, 1.16);
    const roundingMode = sectionsById["solver"].controls.find((control) => control.id === "solver_average_rounding_mode");
    assert.equal(roundingMode.kind, "select");
    assert.equal(roundingMode.value, "truncate");
    assert.deepEqual(roundingMode.options.map((option) => option.value), ["truncate", "round"]);
    assert.equal(sectionsById["solver"].controls.find((control) => control.id === "solver_relax_sparse_support").kind, "boolean");
});

test("applyConfigEditorValue updates array-backed template and field entries by stable ids", () => {
    const next = applyConfigEditorValue(
        createConfig(),
        "sunken_ship",
        "templates.builtins:ahmed_default.label",
        "Ahmed 本地模板"
    );

    assert.equal(next.templates.builtins[0].label, "Ahmed 本地模板");

    const relabeled = applyConfigEditorValue(
        next,
        "sunken_ship",
        "fields.items:orange_avg_cells.label",
        "橙色均格"
    );

    assert.equal(relabeled.fields.items[1].label, "橙色均格");
});

test("applyConfigEditorValue updates selected map parameters and preserves siblings", () => {
    const next = applyConfigEditorValue(
        createConfig(),
        "sunken_ship",
        "maps.:mapId.value_model.r.base_item_mean",
        "231000"
    );

    assert.equal(next.maps.sunken_ship.value_model.r.base_item_mean, 231000);
    assert.equal(next.maps.villa.alpha_counts.o, 1.8);
});

test("applyConfigEditorValue accepts decimal-friendly text from tools inputs", () => {
    const next = applyConfigEditorValue(
        createConfig(),
        "sunken_ship",
        "maps.:mapId.alpha_counts.p",
        "3。25"
    );

    assert.equal(next.maps.sunken_ship.alpha_counts.p, 3.25);
});

test("applyConfigEditorValue keeps boolean solver controls typed as booleans", () => {
    const next = applyConfigEditorValue(
        createConfig(),
        "sunken_ship",
        "solver.average_observation.relax_sparse_support",
        "0"
    );

    assert.equal(next.solver.average_observation.relax_sparse_support, false);
});

test("applyConfigEditorValue keeps average rounding mode as a string enum", () => {
    const next = applyConfigEditorValue(
        createConfig(),
        "sunken_ship",
        "solver.average_observation.rounding_mode",
        "round"
    );

    assert.equal(next.solver.average_observation.rounding_mode, "round");
});

test("applyTemplateFieldMutation can reorder and toggle template field metadata", () => {
    const config = createConfig();
    config.templates.builtins[0].fields = [
        { field_id: "total_items", group_id: "core", recommended: true, default_visible: true },
        { field_id: "orange_avg_cells", group_id: "core", recommended: true, default_visible: true },
        { field_id: "blue_count", group_id: "core", recommended: true, default_visible: true }
    ];

    const moved = applyTemplateFieldMutation(config, "ahmed_default", {
        type: "move",
        field_id: "total_items",
        direction: "down"
    });

    assert.deepEqual(
        moved.templates.builtins[0].fields.map((field) => field.field_id),
        ["orange_avg_cells", "total_items", "blue_count"]
    );

    const toggled = applyTemplateFieldMutation(moved, "ahmed_default", {
        type: "toggle_recommended",
        field_id: "total_items"
    });

    assert.equal(toggled.templates.builtins[0].fields[1].recommended, false);

    const hidden = applyTemplateFieldMutation(toggled, "ahmed_default", {
        type: "toggle_visible",
        field_id: "blue_count"
    });

    assert.equal(hidden.templates.builtins[0].fields[2].default_visible, false);
});
