const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildLegacyEstimatorStateFromFieldValues,
    buildEffectiveWorkspaceConfig,
    normalizeWorkspaceState,
    listWorkspaceTemplates,
    cloneTemplateDefinition,
    upsertLocalTemplate,
    removeLocalTemplateById
} = require("../src/browser/workspace_runtime.js");

function createConfig() {
    return {
        app: {
            default_map_id: "sunken_ship",
            default_template_id: "ahmed_default"
        },
        fields: {
            items: [
                { id: "total_items", label: "总数量" },
                { id: "blue_count", label: "蓝色数量" },
                { id: "total_value", label: "总价值", input_mode: "decimal" },
                { id: "orange_avg_cells", label: "金色均格", input_mode: "decimal" },
                { id: "system_avg_value_type_count", label: "系统均价类型数" },
                { id: "system_avg_value_per_cell", label: "系统每格均价" },
                { id: "purple_avg_value", label: "紫色平均价值" }
            ]
        },
        templates: {
            builtins: [
                {
                    id: "ahmed_default",
                    label: "Ahmed 默认模板",
                    groups: [{ id: "core", label: "核心字段" }],
                    fields: [
                        { field_id: "total_items", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "orange_avg_cells", group_id: "core", recommended: true, default_visible: true }
                    ]
                }
            ]
        },
        maps: {
            sunken_ship: { map_name: "沉船图" }
        },
        model: {
            alpha_counts: { w: 1, g: 2, b: 3, p: 4, o: 5, r: 6 }
        },
        solver: {
            max_states: 4000000
        }
    };
}

test("buildLegacyEstimatorStateFromFieldValues maps supported template fields into legacy estimator keys", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 24,
        blue_count: 8,
        orange_avg_cells: 2.66,
        red_count: 0,
        white_green_total_cells: 12,
        blue_avg_cells: 2.5,
        orange_total_cells: 14,
        system_avg_value_type_count: 2,
        system_avg_value_per_cell: 8735.34,
        bid: 18888
    });

    assert.deepEqual(state, {
        r1_total_items: 24,
        r1_blue_count: 8,
        w_total_cells: null,
        g_total_cells: null,
        b_total_cells: null,
        p_total_cells: null,
        o_total_cells: 14,
        r_total_cells: null,
        r2_orange_avg: 2.66,
        r2_orange_avg_text: "2.66",
        r2_orange_avg_rounding_mode: "truncate",
        r2_purple_count: null,
        r2_orange_count: null,
        r2_white_green_cells: 12,
        r3_green_count: null,
        r3_purple_avg: null,
        r3_purple_avg_text: null,
        r3_white_green_avg: null,
        r3_white_green_avg_text: null,
        r4_blue_avg: 2.5,
        r4_blue_avg_text: "2.5",
        r4_blue_avg_rounding_mode: "truncate",
        r4_total_storage_cells: null,
        r5_white_green_total: null,
        r5_white_count: null,
        custom_o_min: null,
        custom_o_max: null,
        custom_r_min: 0,
        custom_r_max: 0,
        custom_p_value_w: null,
        custom_o_value_w: null,
        custom_r_value_w: null,
        system_avg_value_type_count: 2,
        system_avg_value_per_cell: 8735.34,
        bid_price: 18888
    });
});

test("buildLegacyEstimatorStateFromFieldValues preserves raw average display text for solver precision", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        blue_avg_cells: "2.90",
        orange_avg_cells: "9.50",
        purple_avg_cells: "3.27",
        white_green_avg_cells: "2.44"
    });

    assert.equal(state.r4_blue_avg, 2.9);
    assert.equal(state.r4_blue_avg_text, "2.90");
    assert.equal(state.r2_orange_avg, 9.5);
    assert.equal(state.r2_orange_avg_text, "9.50");
    assert.equal(state.r3_purple_avg, 3.27);
    assert.equal(state.r3_purple_avg_text, "3.27");
    assert.equal(state.r3_white_green_avg, 2.44);
    assert.equal(state.r3_white_green_avg_text, "2.44");
});

test("buildLegacyEstimatorStateFromFieldValues treats zero average cells as blank constraints", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        blue_count: 9,
        blue_avg_cells: "0.00",
        orange_avg_cells: 0,
        purple_avg_cells: "0"
    });

    assert.equal(state.r1_blue_count, 9);
    assert.equal(state.r4_blue_avg, null);
    assert.equal(state.r4_blue_avg_text, null);
    assert.equal(state.r4_blue_avg_rounding_mode, undefined);
    assert.equal(state.r2_orange_avg, null);
    assert.equal(state.r2_orange_avg_text, null);
    assert.equal(state.r3_purple_avg, null);
    assert.equal(state.r3_purple_avg_text, null);
});

test("normalizeWorkspaceState clears persisted zero average cells on load", () => {
    const normalized = normalizeWorkspaceState(createConfig(), {
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 49,
            orange_avg_cells: "0.00"
        }
    });

    assert.equal(normalized.field_values.total_items, 49);
    assert.equal(normalized.field_values.orange_avg_cells, null);
});

test("buildLegacyEstimatorStateFromFieldValues maps public average metadata into rounded solver fields", () => {
    const state = buildLegacyEstimatorStateFromFieldValues(
        {
            blue_avg_cells: "2.67",
            orange_avg_cells: "2.66"
        },
        {
            blue_avg_cells: { source_mode: "public_round" },
            orange_avg_cells: { source_mode: "tool_truncate" }
        }
    );

    assert.equal(state.r4_blue_avg, 2.67);
    assert.equal(state.r4_blue_avg_text, "2.67");
    assert.equal(state.r4_blue_avg_rounding_mode, "round");
    assert.equal(state.r2_orange_avg_rounding_mode, "truncate");
});

test("buildLegacyEstimatorStateFromFieldValues ignores reserved value fields that are not yet solver-backed", () => {
    const state = buildLegacyEstimatorStateFromFieldValues({
        total_items: 24,
        purple_avg_value: 18.6,
        purple_total_value: 52.3,
        unknown_future_field: 99
    });

    assert.equal(state.r1_total_items, 24);
    assert.equal(state.custom_p_value_w, 18.6);
    assert.equal("purple_total_value" in state, false);
    assert.equal("unknown_future_field" in state, false);
});

test("buildEffectiveWorkspaceConfig merges overrides and attaches local templates without mutating defaults", () => {
    const defaults = createConfig();
    const localTemplates = [
        {
            id: "local_probe",
            label: "本地模板",
            description: "用户自定义",
            groups: [{ id: "probe", label: "Probe" }],
            fields: [{ field_id: "blue_count", group_id: "probe", recommended: true, default_visible: true }]
        }
    ];

    const effective = buildEffectiveWorkspaceConfig(
        defaults,
        {
            app: { default_map_id: "villa" },
            solver: { max_states: 123456 }
        },
        localTemplates
    );

    assert.equal(effective.app.default_map_id, "villa");
    assert.equal(effective.solver.max_states, 123456);
    assert.equal(defaults.app.default_map_id, "sunken_ship");
    assert.equal(defaults.solver.max_states, 4000000);
    assert.deepEqual(listWorkspaceTemplates(effective).map((template) => template.id), [
        "ahmed_default",
        "local_probe"
    ]);
});

test("normalizeWorkspaceState falls back to default template and map while preserving known field values", () => {
    const workspaceState = normalizeWorkspaceState(
        createConfig(),
        {
            active_template_id: "missing_template",
            active_map_id: "missing_map",
            field_values: {
                total_items: 24,
                blue_count: 8,
                unknown_field: 999
            }
        }
    );

    assert.equal(workspaceState.active_template_id, "ahmed_default");
    assert.equal(workspaceState.active_map_id, "sunken_ship");
    assert.deepEqual(workspaceState.field_values, {
        total_items: 24,
        blue_count: 8,
        total_value: null,
        orange_avg_cells: null,
        system_avg_value_type_count: null,
        system_avg_value_per_cell: null,
        purple_avg_value: null
    });
});

test("normalizeWorkspaceState preserves decimal raw text while keeping integer fields numeric", () => {
    const config = createConfig();
    const workspaceState = normalizeWorkspaceState(
        config,
        {
            active_template_id: "ahmed_default",
            active_map_id: "sunken_ship",
            field_values: {
                total_items: "46",
                blue_count: "11",
                orange_avg_cells: "9.50"
            }
        }
    );

    assert.equal(workspaceState.field_values.total_items, 46);
    assert.equal(workspaceState.field_values.blue_count, 11);
    assert.equal(workspaceState.field_values.orange_avg_cells, "9.50");
});

test("normalizeWorkspaceState preserves public source metadata for decimal fields only", () => {
    const config = createConfig();
    const workspaceState = normalizeWorkspaceState(
        config,
        {
            active_template_id: "ahmed_default",
            active_map_id: "sunken_ship",
            field_values: {
                total_items: "46",
                orange_avg_cells: "2.67"
            },
            field_value_meta: {
                orange_avg_cells: { source_mode: "public_round" },
                total_value: { source_mode: "public_round" },
                blue_count: { source_mode: "public_round" },
                missing_field: { source_mode: "public_round" }
            }
        }
    );

    assert.deepEqual(workspaceState.field_value_meta, {
        orange_avg_cells: {
            source_mode: "public_round",
            rounding_mode: "round"
        },
        total_value: {
            source_mode: "public_round",
            rounding_mode: "round"
        }
    });
});

test("template clone/upsert/delete keeps local template ids stable", () => {
    const source = createConfig().templates.builtins[0];
    const cloned = cloneTemplateDefinition(source, {
        id: "ahmed_clone",
        label: "Ahmed 克隆"
    });

    assert.equal(cloned.id, "ahmed_clone");
    assert.equal(cloned.label, "Ahmed 克隆");
    assert.notEqual(cloned, source);

    const appended = upsertLocalTemplate([], cloned);
    assert.deepEqual(appended.map((template) => template.id), ["ahmed_clone"]);

    const updated = upsertLocalTemplate(appended, {
        ...cloned,
        label: "Ahmed 克隆 v2"
    });
    assert.deepEqual(updated.map((template) => template.label), ["Ahmed 克隆 v2"]);

    const removed = removeLocalTemplateById(updated, "ahmed_clone");
    assert.deepEqual(removed, []);
});
