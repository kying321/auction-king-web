const test = require("node:test");
const assert = require("node:assert/strict");
const packageJson = require("../package.json");
const defaultConfig = require("../default_config_bundle.js");
const {
    composeDefaultConfigFromSections,
    DEFAULT_CONFIG_SECTION_FILES
} = require("../scripts/build_default_config_bundle.js");

test("composeDefaultConfigFromSections rebuilds the current default bundle", () => {
    const rebuilt = composeDefaultConfigFromSections();
    assert.deepEqual(rebuilt, defaultConfig);
});

test("default config section list covers all expected categories", () => {
    assert.deepEqual(DEFAULT_CONFIG_SECTION_FILES, [
        "app.json",
        "fields.json",
        "templates.json",
        "roles.json",
        "maps.json",
        "model.json",
        "solver.json",
        "calibration.json"
    ]);
});

test("default config exposes solver staging thresholds for phased refinement", () => {
    assert.deepEqual(defaultConfig.solver.staging, {
        refine_ratio: 0.45,
        refine_min_states: 50000,
        refine_min_samples: 4000,
        min_signals_for_full: 3,
        min_signals_for_full_sparse: 5,
        refine_timeout_ms_sparse: 1400,
        refine_timeout_ms_dense: 2200,
        full_timeout_ms_sparse: 2600,
        full_timeout_ms_dense: 4200
    });
});

test("default config keeps manual prop average observations on truncate semantics", () => {
    assert.equal(defaultConfig.solver.average_observation.rounding_mode, "truncate");
});

test("default config exposes template and field catalog structure for hand-fill workspace", () => {
    assert.equal(defaultConfig.app.default_map_id, "sunken_ship");
    assert.equal(defaultConfig.app.default_template_id, "ahmed_default");
    assert.ok(Array.isArray(defaultConfig.fields.items));
    assert.ok(defaultConfig.fields.items.some((field) => field.id === "total_items"));
    assert.ok(defaultConfig.fields.items.some((field) => field.id === "orange_avg_cells"));
    assert.ok(Array.isArray(defaultConfig.templates.builtins));
    assert.ok(defaultConfig.templates.builtins.some((template) => template.id === "ahmed_default"));
    assert.equal(defaultConfig.roles.default_role_id, "ahmed");
    assert.ok(defaultConfig.roles.profiles.ahmed);
    assert.ok(defaultConfig.roles.profiles.isabella);
    assert.match(defaultConfig.roles.profiles.ahmed.sourceCue, /绿白总格/);
    assert.ok(defaultConfig.maps.sunken_ship);
    assert.deepEqual(
        defaultConfig.maps.villa.submaps.map((entry) => entry.label),
        [
            "未知别墅",
            "设计师居所",
            "科学家居所",
            "养生学家居所",
            "望族居所",
            "学者居所",
            "私人金库",
            "奢华养老院",
            "末日庇护所"
        ]
    );
    assert.deepEqual(
        defaultConfig.maps.sunken_ship.submaps.map((entry) => entry.label),
        [
            "未知残骸",
            "远洋客轮仓房",
            "军用舰艇保险库",
            "冷链货船隔离舱",
            "殖民商船宝库",
            "探险家座舰资料库",
            "皇家御用货仓",
            "生物实验室样本库"
        ]
    );
    assert.ok(defaultConfig.model.value_model.r);
    assert.equal(defaultConfig.calibration.artifact_version, "ak_authority_calibration_v1");
});

test("default config preserves short helper text for compact observation rows", () => {
    const totalItems = defaultConfig.fields.items.find((field) => field.id === "total_items");
    const orangeAvgCells = defaultConfig.fields.items.find((field) => field.id === "orange_avg_cells");
    const systemAvgValueTypeCount = defaultConfig.fields.items.find((field) => field.id === "system_avg_value_type_count");
    const systemAvgValuePerCell = defaultConfig.fields.items.find((field) => field.id === "system_avg_value_per_cell");

    assert.equal(totalItems.short_help, "本局拍品总件数");
    assert.equal(orangeAvgCells.short_help, "金色拍品平均占格");
    assert.equal(systemAvgValueTypeCount.short_help, "系统均价提示覆盖的藏品类型数量，仅作为回放证据保留");
    assert.equal(systemAvgValueTypeCount.participates_in_solver, false);
    assert.equal(systemAvgValueTypeCount.participates_in_valuation, false);
    assert.equal(systemAvgValuePerCell.short_help, "系统提示的本场占位每格均价，数值为四舍五入近似值");
    assert.equal(systemAvgValuePerCell.participates_in_valuation, true);
});

test("default value template exposes the system per-cell value hint", () => {
    const valueTemplate = defaultConfig.templates.builtins.find((template) => template.id === "value_focus");

    assert.ok(valueTemplate.fields.some((field) => field.field_id === "system_avg_value_per_cell"));
});

test("build:static regenerates the default config bundle before copying dist assets", () => {
    assert.match(
        packageJson.scripts["build:static"],
        /node\s+scripts\/build_authority_source_package\.js/,
        packageJson.scripts["build:static"]
    );
    assert.match(
        packageJson.scripts["build:static"],
        /node\s+scripts\/build_authority_calibration\.js/,
        packageJson.scripts["build:static"]
    );
    assert.match(
        packageJson.scripts["build:static"],
        /node\s+scripts\/build_default_config_bundle\.js/,
        packageJson.scripts["build:static"]
    );
    assert.match(
        packageJson.scripts["build:static"],
        /_headers/,
        packageJson.scripts["build:static"]
    );
});

test("package exposes settlement calibration replay builder", () => {
    assert.match(
        packageJson.scripts["build:settlement-calibration-replay"] || "",
        /node\s+scripts\/build_settlement_sample_calibration_replay\.js/
    );
});
