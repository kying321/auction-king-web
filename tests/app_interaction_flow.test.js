const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../dashboard_runtime.js");
const configModalRuntime = require("../config_modal_state.js");
const configEditorControlsRuntime = require("../config_editor_controls.js");
const workspaceRuntime = require("../workspace_runtime.js");
const sampleDatasetRuntime = require("../sample_dataset.js");

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(...names) {
        names.forEach((name) => this.values.add(name));
    }

    remove(...names) {
        names.forEach((name) => this.values.delete(name));
    }

    toggle(name, force) {
        if (force === true) {
            this.values.add(name);
            return true;
        }
        if (force === false) {
            this.values.delete(name);
            return false;
        }
        if (this.values.has(name)) {
            this.values.delete(name);
            return false;
        }
        this.values.add(name);
        return true;
    }

    contains(name) {
        return this.values.has(name);
    }
}

class FakeElement {
    constructor(id = "", tagName = "div", ownerDocument = null) {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.value = "";
        this.innerText = "";
        this.textContent = "";
        this.innerHTML = "";
        this.placeholder = "";
        this.disabled = false;
        this.readOnly = false;
        this.checked = false;
        this.open = false;
        this.hidden = false;
        this.listeners = new Map();
        this.style = {};
        this.classList = new FakeClassList();
        this.attributes = new Map();
        this.children = [];
        this.options = [];
        this.dataset = {};
        this.parentNode = null;
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    dispatch(type, extra = {}) {
        const event = {
            type,
            target: this,
            currentTarget: this,
            preventDefault() {},
            ...extra
        };
        for (const handler of this.listeners.get(type) || []) {
            handler(event);
        }
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        if (this.tagName === "SELECT" && child.tagName === "OPTION") {
            this.options.push(child);
            if (!this.value && child.value) this.value = child.value;
        }
        if (child.id && this.ownerDocument) {
            this.ownerDocument.elements.set(child.id, child);
        }
        return child;
    }

    removeChild(child) {
        this.children = this.children.filter((item) => item !== child);
    }

    remove() {
        this.removed = true;
        if (this.parentNode) {
            this.parentNode.removeChild(this);
        }
    }

    click() {
        if (
            this.tagName === "A"
            && this.ownerDocument
            && Array.isArray(this.ownerDocument.downloads)
        ) {
            const href = typeof this.href === "string" ? this.href : "";
            const blobText = this.ownerDocument.blobUrls && this.ownerDocument.blobUrls.get(href);
            this.ownerDocument.downloads.push({
                filename: this.download || null,
                href,
                text: typeof blobText === "string" ? blobText : null
            });
        }
        this.dispatch("click");
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === "id") {
            this.id = String(value);
            if (this.ownerDocument) this.ownerDocument.elements.set(this.id, this);
        }
        if (name.startsWith("data-")) {
            const dataKey = name.slice(5).replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
            this.dataset[dataKey] = String(value);
        }
    }

    querySelector(selector) {
        if (selector.startsWith("#")) {
            const id = selector.slice(1);
            return this.children.find((child) => child.id === id) || null;
        }
        return this.children.find((child) => child.dataset && child.dataset.testid === selector) || null;
    }

    querySelectorAll(selector) {
        if (selector === "option") return this.options;
        return [];
    }
}

class FakeDocument {
    constructor(options = {}) {
        this.elements = new Map();
        this.domContentLoadedHandler = null;
        this.namedSelectors = new Map();
        this.downloads = [];
        this.blobUrls = new Map();
        this.body = new FakeElement("body", "body", this);
        this.missingIds = new Set(options.missingIds || []);
    }

    addEventListener(type, handler) {
        if (type === "DOMContentLoaded") {
            this.domContentLoadedHandler = handler;
        }
    }

    getElementById(id) {
        if (this.missingIds.has(id)) return null;
        if (!this.elements.has(id)) {
            this.elements.set(id, new FakeElement(id, "div", this));
        }
        return this.elements.get(id);
    }

    querySelector(selector) {
        return this.namedSelectors.get(selector) || null;
    }

    createElement(tagName) {
        return new FakeElement("", tagName, this);
    }

    fireDOMContentLoaded() {
        assert.ok(this.domContentLoadedHandler, "expected DOMContentLoaded handler");
        this.domContentLoadedHandler();
    }
}

function createAppConfig() {
    return {
        app: {
            default_map_id: "sunken_ship",
            default_template_id: "ahmed_default",
            config_source_version: "ak_workspace_v2_20260425_bid_value_rebalance"
        },
        fields: {
            items: [
                { id: "total_items", label: "总数量", short_help: "本局拍品总件数", input_mode: "integer", participates_in_solver: true },
                { id: "orange_avg_cells", label: "金色均格", short_help: "金色拍品平均占格", input_mode: "decimal", participates_in_solver: true },
                { id: "blue_count", label: "蓝色数量", short_help: "已观测到的蓝色件数", input_mode: "integer", participates_in_solver: true },
                { id: "purple_avg_cells", label: "紫色均格", short_help: "紫色拍品平均占格", input_mode: "decimal", participates_in_solver: true },
                { id: "white_green_total_cells", label: "绿白总格数", short_help: "绿色与白色合计占格", input_mode: "integer", participates_in_solver: true },
                { id: "white_green_avg_cells", label: "绿白均格", short_help: "绿白拍品平均占格", input_mode: "decimal", participates_in_solver: true },
                { id: "blue_avg_cells", label: "蓝色均格", short_help: "蓝色拍品平均占格", input_mode: "decimal", participates_in_solver: true },
                { id: "total_storage_cells", label: "总格数", short_help: "本局仓储总占格", input_mode: "integer", participates_in_solver: true },
                { id: "system_avg_value_type_count", label: "系统均价类型数", input_mode: "integer", participates_in_solver: false, participates_in_valuation: false },
                { id: "system_avg_value_per_cell", label: "系统每格均价", input_mode: "decimal", participates_in_solver: false, participates_in_valuation: true },
                { id: "white_count", label: "白色数量", family: "quality", quality: "w", metric: "count", input_mode: "integer", participates_in_solver: true },
                { id: "orange_count", label: "金色数量", family: "quality", quality: "o", metric: "count", input_mode: "integer", participates_in_solver: true },
                { id: "purple_avg_value", label: "紫色平均价值", input_mode: "decimal", participates_in_solver: false, participates_in_valuation: true },
                { id: "bid", label: "出价", input_mode: "integer", participates_in_solver: true },
                { id: "orange_count_min", label: "金色数量下界", family: "constraint", metric: "min_count", input_mode: "integer", participates_in_solver: true },
                { id: "orange_count_max", label: "金色数量上界", family: "constraint", metric: "max_count", input_mode: "integer", participates_in_solver: true },
                { id: "red_count_min", label: "红色数量下界", family: "constraint", metric: "min_count", input_mode: "integer", participates_in_solver: true },
                { id: "red_count_max", label: "红色数量上界", family: "constraint", metric: "max_count", input_mode: "integer", participates_in_solver: true }
            ]
        },
        templates: {
            builtins: [
                {
                    id: "ahmed_default",
                    label: "Ahmed 默认模板",
                    groups: [{ id: "core", label: "核心链路" }],
                    fields: [
                        { field_id: "total_items", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "orange_avg_cells", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "blue_count", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "purple_avg_cells", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "white_green_total_cells", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "white_green_avg_cells", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "blue_avg_cells", group_id: "core", recommended: true, default_visible: true },
                        { field_id: "total_storage_cells", group_id: "core", recommended: true, default_visible: true }
                    ]
                },
                {
                    id: "value_focus",
                    label: "价值观察模板",
                    groups: [{ id: "value", label: "价值观察" }],
                    fields: [
                        { field_id: "total_items", group_id: "value", recommended: true, default_visible: true },
                        { field_id: "orange_avg_cells", group_id: "value", recommended: true, default_visible: true },
                        { field_id: "purple_avg_value", group_id: "value", recommended: true, default_visible: true },
                        { field_id: "bid", group_id: "value", recommended: true, default_visible: true }
                    ]
                }
            ]
        },
        maps: {
            sunken_ship: {
                label: "沉船图",
                map_name: "沉船图",
                alpha_counts: { o: 2.4, r: 1.8 }
            },
            villa: {
                label: "别墅图",
                map_name: "别墅图",
                alpha_counts: { o: 1.8, r: 1.2 }
            }
        },
        model: {
            alpha_counts: { w: 1, g: 2, b: 3, p: 4, o: 5, r: 6 },
            cells_per_item: {
                w: { mean: 1, sd: 0.1, min: 1, max: 3 },
                g: { mean: 1, sd: 0.1, min: 1, max: 4 },
                b: { mean: 2, sd: 0.2, min: 1, max: 5 },
                p: { mean: 2, sd: 0.2, min: 1, max: 6 },
                o: { mean: 3, sd: 0.2, min: 1, max: 8 },
                r: { mean: 4, sd: 0.2, min: 1, max: 10 }
            },
            value_model: {
                w: { base_item_mean: 1, per_cell_mean: 1 },
                g: { base_item_mean: 2, per_cell_mean: 1 },
                b: { base_item_mean: 3, per_cell_mean: 1 },
                p: { base_item_mean: 4, per_cell_mean: 1 },
                o: { base_item_mean: 5, per_cell_mean: 1 },
                r: { base_item_mean: 6, per_cell_mean: 1 }
            }
        },
        calibration: {
            artifact_version: "ak_authority_calibration_v1",
            generated_at: "2026-04-24T00:00:00.000Z",
            source_summary: {
                catalog_batch_count: 6,
                battle_sample_count: 1
            },
            manifest: {
                adopted_fields: ["alpha_counts", "value_model.base_item_mean", "value_model.base_item_sd"],
                pending_fields: ["cells_per_item", "value_model.per_cell_mean", "value_model.per_cell_sd"],
                ignored_fields: ["collection_families"]
            },
            maps: {
                sunken_ship: {
                    count_prior_calibration: {
                        battle_sample_count: 1,
                        authority_status: "sample_backed",
                        alpha_counts: { w: 1, g: 2, b: 3, p: 3.4, o: 2.6, r: 1.6 }
                    },
                    value_model_calibration: {
                        value_model: {
                            p: { base_item_mean: 9493, base_item_sd: 5520, per_cell_mean: 1, per_cell_sd: 0 },
                            o: { base_item_mean: 46325, base_item_sd: 29002, per_cell_mean: 1, per_cell_sd: 0 }
                        }
                    },
                    cells_per_item_status: {
                        adopted_fields: [],
                        pending_fields: ["cells_per_item"],
                        ignored_fields: ["collection_families"]
                    }
                },
                villa: {
                    count_prior_calibration: {
                        battle_sample_count: 2,
                        authority_status: "sample_backed",
                        alpha_counts: { w: 6, g: 5, b: 4, p: 3, o: 2, r: 1 }
                    },
                    value_model_calibration: {
                        value_model: {
                            p: { base_item_mean: 9001, base_item_sd: 5000, per_cell_mean: 1, per_cell_sd: 0 },
                            o: { base_item_mean: 41000, base_item_sd: 25000, per_cell_mean: 1, per_cell_sd: 0 }
                        }
                    },
                    cells_per_item_status: {
                        adopted_fields: [],
                        pending_fields: ["cells_per_item"],
                        ignored_fields: ["collection_families"]
                    }
                }
            }
        },
        solver: {
            max_states: 4000000,
            mc_samples: 180000,
            average_observation: {
                relax_sparse_support: true
            },
            staging: {
                refine_ratio: 0.45,
                refine_min_states: 50000,
                refine_min_samples: 4000,
                min_signals_for_full: 3,
                min_signals_for_full_sparse: 5,
                refine_timeout_ms_sparse: 1400,
                refine_timeout_ms_dense: 2200,
                full_timeout_ms_sparse: 2600,
                full_timeout_ms_dense: 4200
            }
        }
    };
}

function collectFieldLabels(root) {
    if (!root || !Array.isArray(root.children)) return [];
    return root.children.flatMap((child) => {
        const labels = [];
        if (child.dataset && child.dataset.fieldLabel) {
            labels.push(child.dataset.fieldLabel);
        }
        return labels.concat(collectFieldLabels(child));
    });
}

function collectElementsByDataset(root, datasetKey) {
    if (!root || !Array.isArray(root.children)) return [];
    return root.children.flatMap((child) => {
        const matches = child.dataset && child.dataset[datasetKey] ? [child] : [];
        return matches.concat(collectElementsByDataset(child, datasetKey));
    });
}

function collectText(root) {
    if (!root) return "";
    const ownText = [root.innerText, root.textContent].filter(Boolean).join(" ");
    const childText = Array.isArray(root.children)
        ? root.children.map((child) => collectText(child)).filter(Boolean).join(" ")
        : "";
    return [ownText, childText].filter(Boolean).join(" ");
}

function installAppHarness(options = {}) {
    const document = new FakeDocument({ missingIds: options.missingIds });
    const storage = new Map();
    const requiredIds = [
        "status-text",
        "btn-theme-toggle",
        "btn-config",
        "template_select",
        "map_select",
        "btn-clone-template",
        "btn-new-template",
        "btn-delete-template",
        "btn-clear",
        "btn-save-clipboard-screenshot",
        "compute-status-label",
        "compute-hint",
        "workspace-save-status",
        "workspace-form",
        "template-groups",
        "more-fields-panel",
        "more-fields-summary-meta",
        "more-fields-search",
        "more-fields-filter-all",
        "more-fields-filter-aggregate",
        "more-fields-filter-quality",
        "more-fields-filter-combo",
        "more-fields-filter-constraint",
        "more-fields",
        "error-box",
        "orange-confidence-note",
        "list-orange",
        "red-confidence-note",
        "posterior-risk-note",
        "list-red",
        "grid-section",
        "grid-tbody",
        "valuation-section",
        "val-decision-headline",
        "val-decision-summary",
        "val-ev",
        "val-prob",
        "val-roi",
        "val-q05",
        "val-q25",
        "val-q75",
        "config-modal",
        "config-modal-title",
        "close-config",
        "btn-config-view-structured",
        "btn-config-view-baseline",
        "btn-config-view-overrides",
        "config-editor-controls",
        "config-editor-status",
        "config-json-details",
        "config-json",
        "btn-config-import",
        "btn-config-export",
        "btn-save-config",
        "btn-reset-config",
        "config-import-file",
        "config-help-text",
        "calibration-panel",
        "btn-calibration-mode-draft",
        "btn-calibration-mode-apply",
        "btn-calibration-apply-draft",
        "btn-calibration-reset-authority",
        "btn-calibration-import-draft",
        "btn-calibration-export-draft",
        "btn-calibration-import-applied",
        "btn-calibration-export-applied",
        "calibration-import-draft-file",
        "calibration-import-applied-file",
        "btn-calibration-import-samples",
        "btn-calibration-export-samples",
        "btn-calibration-export-filtered-replay-samples",
        "btn-calibration-export-filtered-authority-samples",
        "btn-calibration-export-current-map-authority-samples",
        "btn-calibration-export-filtered-replay-samples",
        "calibration-sample-review",
        "btn-calibration-clear-samples",
        "calibration-import-samples-file",
        "calibration-artifact-meta",
        "calibration-map-meta",
        "calibration-sample-meta",
        "calibration-status",
        "calibration-alpha-grid",
        "calibration-value-grid",
        "calibration-cells-grid"
    ];

    const missingIds = new Set(options.missingIds || []);
    requiredIds.forEach((id) => {
        if (missingIds.has(id)) return;
        document.getElementById(id);
    });

    document.namedSelectors.set(".status-dot", new FakeElement("status-dot", "div", document));

    const runtimeLog = {
        dispatches: [],
        terminations: 0
    };
    let blobCounter = 0;

    const globals = {
        AUCTION_KING_DEFAULT_CONFIG: options.config || createAppConfig(),
        document,
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            },
            removeItem(key) {
                storage.delete(key);
            }
        },
        window: {},
        alert() {},
        Blob: function Blob(parts = []) {
            this.text = parts.map((part) => String(part)).join("");
        },
        URL: {
            createObjectURL(blob) {
                const url = `blob:test:${blobCounter += 1}`;
                document.blobUrls.set(url, blob && typeof blob.text === "string" ? blob.text : null);
                return url;
            },
            revokeObjectURL() {}
        },
        Worker: function Worker() {},
        ...runtime,
        ...configModalRuntime,
        buildConfigEditorSections: configEditorControlsRuntime.buildConfigEditorSections,
        applyTemplateFieldMutation: configEditorControlsRuntime.applyTemplateFieldMutation,
        applyConfigEditorValue: configEditorControlsRuntime.applyConfigEditorValue,
        AK_WORKSPACE_RUNTIME: workspaceRuntime,
        AK_SAMPLE_DATASET_RUNTIME: sampleDatasetRuntime,
        buildCoarseEngineResult: options.buildCoarseEngineResult || (() => null),
        createFullSolveRuntime: options.createFullSolveRuntime || (() => ({
            dispatch(payload) {
                runtimeLog.dispatches.push(payload);
            },
            terminate() {
                runtimeLog.terminations += 1;
            }
        }))
    };

    return {
        document,
        downloads: document.downloads,
        globals,
        runtimeLog,
        storage,
        restore(previousGlobals) {
            delete require.cache[require.resolve("../app.js")];
            Object.keys(globals).forEach((key) => {
                if (previousGlobals[key] === undefined) delete global[key];
                else global[key] = previousGlobals[key];
            });
        }
    };
}

test("manual workspace layout removes round/OCR/role layers from the page shell", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

    assert.doesNotMatch(html, /回合 1/);
    assert.doesNotMatch(html, /btn-battle-ocr/);
    assert.doesNotMatch(html, /role-strategy-section/);
    assert.doesNotMatch(html, /inference-graph-section/);
    assert.match(html, /workspace-command-header/);
    assert.match(html, /workspace-context-strip/);
    assert.match(html, /workspace-utility-actions/);
    assert.match(html, /class="workspace-header-nav"/);
    assert.match(html, /class="workspace-header-brief-panel workspace-brief-strip"/);
    assert.match(html, /WORKBENCH BRIEF/);
    assert.doesNotMatch(html, /class="workspace-header-meta"/);
    assert.doesNotMatch(html, /<p class="workspace-header-brief">/);
    assert.doesNotMatch(html, /workspace-brief-popover/);
    assert.doesNotMatch(html, /id="calibration-panel"/);
    assert.match(html, /id="btn-config"[^>]+href="tools\.html"/);
    assert.match(html, /id="btn-theme-toggle"/);
    assert.match(html, /id="template_select"/);
    assert.match(html, /id="more-fields-panel"/);
    assert.match(html, /id="workspace-form"/);
});

test("theme toggle persists night mode and updates the page theme", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const toggle = harness.document.getElementById("btn-theme-toggle");
        assert.equal(harness.document.body.dataset.theme, "light");
        assert.equal(toggle.innerText, "夜间");

        toggle.click();

        assert.equal(harness.document.body.dataset.theme, "dark");
        assert.equal(harness.storage.get("ak_theme_mode_v1"), "dark");
        assert.equal(toggle.innerText, "日间");
        assert.equal(toggle.attributes.get("aria-pressed"), "true");
    } finally {
        harness.restore(previousGlobals);
    }
});

test("advanced tools page initializes without hidden main workspace support nodes", () => {
    const harness = installAppHarness({
        missingIds: [
            "btn-clone-template",
            "btn-new-template",
            "btn-delete-template",
            "btn-clear",
            "compute-status-label",
            "compute-hint",
            "workspace-save-status",
            "workspace-form",
            "template-groups",
            "more-fields-panel",
            "more-fields-summary-meta",
            "more-fields-search",
            "more-fields-filter-all",
            "more-fields-filter-aggregate",
            "more-fields-filter-quality",
            "more-fields-filter-combo",
            "more-fields-filter-constraint",
            "more-fields",
            "error-box",
            "orange-confidence-note",
            "list-orange",
            "red-confidence-note",
            "posterior-risk-note",
            "list-red",
            "grid-section",
            "grid-tbody",
            "valuation-section",
            "val-decision-headline",
            "val-decision-summary",
            "val-ev",
            "val-prob",
            "val-roi",
            "val-q05",
            "val-q25",
            "val-q75"
        ]
    });
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        assert.doesNotThrow(() => harness.document.fireDOMContentLoaded());

        assert.ok(harness.document.getElementById("template_select").children.length > 0);
        assert.ok(harness.document.getElementById("map_select").children.length > 0);
        assert.match(harness.document.getElementById("calibration-artifact-meta").innerText, /版本|未发现权威产物/);
        assert.equal(harness.runtimeLog.dispatches.length, 0);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("app restores the last workspace state and renders Ahmed default fields in order", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24,
            blue_count: 8,
            orange_avg_cells: 2.66
        }
    }));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        assert.equal(harness.document.getElementById("template_select").value, "ahmed_default");
        assert.equal(harness.document.getElementById("map_select").value, "villa");
        assert.equal(harness.document.getElementById("field-input-total_items").value, "24");
        assert.equal(harness.document.getElementById("field-input-blue_count").value, "8");
        assert.equal(harness.document.getElementById("field-input-orange_avg_cells").value, "2.66");
        assert.equal(harness.document.getElementById("field-row-total_items") !== null, true);
        assert.equal(harness.document.getElementById("field-helper-total_items").innerText, "本局拍品总件数");

        const groupLabels = collectFieldLabels(harness.document.getElementById("template-groups"));

        assert.deepEqual(groupLabels, [
            "总数量",
            "金色均格",
            "蓝色数量",
            "紫色均格",
            "绿白总格数",
            "绿白均格",
            "蓝色均格",
            "总格数"
        ]);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("app clears persisted zero average cells before solving restored workspace state", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 49,
            blue_count: 9,
            orange_avg_cells: "4.14",
            white_green_total_cells: 16,
            purple_avg_cells: "0.00",
            white_green_avg_cells: "0.00",
            blue_avg_cells: "0.00"
        }
    }));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        assert.equal(harness.document.getElementById("field-input-purple_avg_cells").value, "");
        assert.equal(harness.document.getElementById("field-input-white_green_avg_cells").value, "");
        assert.equal(harness.document.getElementById("field-input-blue_avg_cells").value, "");
        assert.equal(harness.runtimeLog.dispatches.length, 1);
        assert.equal(harness.runtimeLog.dispatches[0].stateVars.r3_purple_avg, null);
        assert.equal(harness.runtimeLog.dispatches[0].stateVars.r3_white_green_avg, null);
        assert.equal(harness.runtimeLog.dispatches[0].stateVars.r4_blue_avg, null);
        assert.equal(harness.runtimeLog.dispatches[0].stateVars.r1_blue_count, 9);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("engine error explains hidden solver constraints and can clear them", () => {
    const harness = installAppHarness({
        buildCoarseEngineResult: () => ({
            error: true,
            messages: ["当前输入组合下没有可行解。"]
        })
    });
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "value_focus",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 49,
            orange_avg_cells: "4.14",
            red_count_min: 2
        }
    }));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const errorText = collectText(harness.document.getElementById("error-box"));
        assert.match(errorText, /参与求解的隐藏\/备用约束/);
        assert.match(errorText, /红色数量下界=2/);

        harness.document.getElementById("btn-clear-hidden-solver-constraints").click();

        const workspaceState = JSON.parse(harness.storage.get("ak_workspace_state_v2"));
        assert.equal(workspaceState.field_values.red_count_min, null);
        assert.equal(workspaceState.field_values.total_items, 49);
        assert.equal(workspaceState.field_values.orange_avg_cells, "4.14");
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel keeps draft edits local until apply, then pushes applied overrides into storage and triggers recompute", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const initialDispatchCount = harness.runtimeLog.dispatches.length;
        const draftButton = harness.document.getElementById("btn-calibration-mode-draft");
        const purpleAlphaInput = harness.document.getElementById("calibration-alpha-input-p");
        const purpleValueInput = harness.document.getElementById("calibration-value-base-item-mean-input-p");

        assert.equal(draftButton.classList.contains("active"), true);
        assert.equal(purpleAlphaInput.value, "3");
        assert.equal(purpleValueInput.step, "0.01");

        purpleAlphaInput.value = "7.5";
        purpleAlphaInput.dispatch("input");

        assert.equal(harness.runtimeLog.dispatches.length, initialDispatchCount);
        assert.match(harness.storage.get("ak_calibration_panel_draft_v1"), /7.5/);

        purpleValueInput.value = "9173.25";
        let defaultPrevented = false;
        purpleValueInput.dispatch("wheel", {
            deltaY: -1,
            preventDefault() {
                defaultPrevented = true;
            }
        });
        assert.equal(defaultPrevented, true);
        assert.equal(purpleValueInput.value, "9173.26");
        assert.match(harness.storage.get("ak_calibration_panel_draft_v1"), /9173.26/);

        harness.document.getElementById("btn-calibration-apply-draft").click();

        assert.equal(harness.runtimeLog.dispatches.length, initialDispatchCount + 1);
        assert.match(harness.storage.get("ak_calibration_panel_applied_v1"), /7.5/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel surfaces fallback-only alpha status when authority battle samples are still empty", () => {
    const config = createAppConfig();
    config.calibration.source_summary.battle_sample_count = 0;
    config.calibration.maps.sunken_ship.count_prior_calibration.battle_sample_count = 0;
    config.calibration.maps.sunken_ship.count_prior_calibration.authority_status = "fallback_only";
    const harness = installAppHarness({ config });
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        assert.match(harness.document.getElementById("calibration-artifact-meta").innerText, /alpha_counts fallback_only/);
        assert.match(harness.document.getElementById("calibration-map-meta").innerText, /alpha_counts 仍为地图默认值/);
        assert.match(harness.document.getElementById("calibration-map-meta").innerText, /尚未被真实样本接管/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel can capture the current workspace into local settlement samples", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 42,
            blue_count: 10,
            orange_avg_cells: 3.2,
            orange_count: 2,
            system_avg_value_type_count: 2,
            system_avg_value_per_cell: 8735.34,
            bid: 18888
        }
    }));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-capture-sample").click();

        const stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.equal(stored.length, 1);
        assert.equal(stored[0].map_id, "sunken_ship");
        assert.equal(stored[0].source_kind, "workspace_capture");
        assert.equal(stored[0].bid_price, 18888);
        assert.deepEqual(stored[0].actual_counts, { o: 2 });
        assert.equal(stored[0].metadata.template_id, "ahmed_default");
        assert.match(harness.document.getElementById("calibration-status").innerText, /已保存当前 workspace 为本地结算样本/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /本地结算样本 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /采集目标 sunken_ship 0\/30；还差 30；下一补样 sunken_ship/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /可转 authority 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /权重拟合可用 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺完整六色 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /系统均价 1\/可评分 0/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel can review and complete missing actual counts for the latest current-map sample", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 42,
            blue_count: 10,
            orange_avg_cells: 3.2,
            bid: 18888
        }
    }));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-capture-sample").click();
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /可转 authority 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺实际数量 1/);
        assert.ok(harness.document.getElementById("calibration-sample-review").children.length > 0);

        harness.document.getElementById("calibration-review-actual-count-o").value = "2";
        harness.document.getElementById("calibration-review-actual-count-r").value = "1";
        harness.document.getElementById("calibration-review-actual-value").value = "88000";
        harness.document.getElementById("btn-calibration-save-sample-review").click();

        const stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.deepEqual(stored[0].actual_counts, { o: 2, r: 1 });
        assert.equal(stored[0].actual_value, 88000);
        assert.match(harness.document.getElementById("calibration-status").innerText, /已更新本地样本校对/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /可转 authority 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺实际数量 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /权重拟合可用 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺完整六色 1/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel can bind a settlement screenshot to the selected sample", async () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 45,
            blue_count: 11
        }
    }));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-capture-sample").click();
        const fileInput = harness.document.getElementById("calibration-review-screenshot-file");
        fileInput.files = [{
            name: "settlement.png",
            type: "image/png",
            size: 18,
            data_url: "data:image/png;base64,AAAA",
            thumbnail_data_url: "data:image/jpeg;base64,THUMB",
            thumbnail_type: "image/jpeg",
            thumbnail_size: 9,
            original_width: 1920,
            original_height: 1080,
            stored_width: 960,
            stored_height: 540
        }];
        fileInput.dispatch("change");
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        const stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.equal(stored[0].metadata.screenshot_attachment.name, "settlement.png");
        assert.equal(stored[0].metadata.screenshot_attachment.type, "image/jpeg");
        assert.equal(stored[0].metadata.screenshot_attachment.size, 9);
        assert.equal(stored[0].metadata.screenshot_attachment.original_size, 18);
        assert.equal(stored[0].metadata.screenshot_attachment.data_url, "data:image/jpeg;base64,THUMB");
        assert.equal(stored[0].metadata.screenshot_attachment.original_width, 1920);
        assert.equal(stored[0].metadata.screenshot_attachment.stored_width, 960);
        assert.equal(stored[0].metadata.screenshot_attachment.compression.applied, true);
        assert.match(harness.document.getElementById("calibration-status").innerText, /已绑定结算截图 settlement\.png/);
        assert.match(harness.document.getElementById("calibration-review-screenshot-hint").textContent, /settlement\.png/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("front toolbar downloads current input with the clipboard screenshot without clearing the battle", async () => {
    const harness = installAppHarness();
    const previousGlobals = {};
    let clipboardReadCount = 0;

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 45,
            blue_count: 11,
            bid: 18800
        }
    }));

    harness.globals.navigator = {
        clipboard: {
            read() {
                clipboardReadCount += 1;
                return Promise.resolve([
                    {
                        types: ["image/png"],
                        getType(type) {
                            return Promise.resolve({
                                name: "",
                                type,
                                size: 1200000,
                                data_url: "data:image/png;base64,ORIGINAL",
                                thumbnail_data_url: "data:image/jpeg;base64,SMALL",
                                thumbnail_type: "image/jpeg",
                                thumbnail_size: 60000,
                                original_width: 1920,
                                original_height: 1080,
                                stored_width: 1280,
                                stored_height: 720
                            });
                        }
                    }
                ]);
            }
        }
    };
    harness.globals.window.navigator = harness.globals.navigator;

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-save-clipboard-screenshot").click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(clipboardReadCount, 1);
        assert.equal(harness.storage.has("ak_settlement_samples_v1"), false);
        assert.equal(harness.downloads.length, 1);
        assert.match(harness.downloads[0].filename, /^auction-king-battle-capture-villa-\d{8}T\d{6}\d{3}Z\.json$/);
        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.schema_version, "ak_battle_clipboard_capture_v1");
        assert.equal(payload.export_kind, "battle_input_clipboard_screenshot");
        assert.equal(payload.map_id, "villa");
        assert.equal(payload.template_id, "ahmed_default");
        assert.equal(payload.field_values.total_items, 45);
        assert.equal(payload.field_values.blue_count, 11);
        assert.equal(payload.field_values.bid, 18800);
        assert.equal(payload.observed_state.r1_total_items, 45);
        assert.equal(payload.screenshot_attachment.name, "clipboard-screenshot.png");
        assert.equal(payload.screenshot_attachment.type, "image/jpeg");
        assert.equal(payload.screenshot_attachment.original_type, "image/png");
        assert.equal(payload.screenshot_attachment.original_size, 1200000);
        assert.equal(payload.screenshot_attachment.data_url, "data:image/jpeg;base64,SMALL");
        assert.equal(payload.screenshot_attachment.stored_width, 1280);
        assert.equal(payload.settlement_sample.metadata.screenshot_attachment, undefined);
        assert.equal(payload.settlement_sample.metadata.screenshot_attachment_ref, "$.screenshot_attachment");
        assert.equal(payload.settlement_sample.metadata.screenshot_attachment_summary.name, "clipboard-screenshot.png");
        assert.equal(payload.settlement_sample.metadata.screenshot_attachment_summary.type, "image/jpeg");
        assert.equal(payload.settlement_sample.metadata.screenshot_attachment_summary.data_url, undefined);
        assert.equal((harness.downloads[0].text.match(/data:image\/jpeg;base64,SMALL/g) || []).length, 1);

        const workspaceState = JSON.parse(harness.storage.get("ak_workspace_state_v2"));
        assert.equal(workspaceState.field_values.total_items, 45);
        assert.equal(workspaceState.field_values.blue_count, 11);
        assert.match(harness.document.getElementById("workspace-save-status").innerText, /已下载本局输入和剪贴板截图/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("front toolbar still downloads current input when clipboard screenshot is unavailable", async () => {
    const harness = installAppHarness();
    const previousGlobals = {};
    let clipboardReadCount = 0;

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 37,
            orange_count: 2,
            bid: 22100
        }
    }));

    harness.globals.navigator = {
        clipboard: {
            read() {
                clipboardReadCount += 1;
                return Promise.reject(new Error("剪贴板里没有图片。请先截图复制到剪贴板。"));
            }
        }
    };
    harness.globals.window.navigator = harness.globals.navigator;

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-save-clipboard-screenshot").click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(clipboardReadCount, 1);
        assert.equal(harness.downloads.length, 1);
        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.schema_version, "ak_battle_clipboard_capture_v1");
        assert.equal(payload.export_kind, "battle_input_clipboard_screenshot");
        assert.equal(payload.map_id, "villa");
        assert.equal(payload.field_values.total_items, 37);
        assert.equal(payload.field_values.orange_count, 2);
        assert.equal(payload.field_values.bid, 22100);
        assert.equal(payload.screenshot_attachment, null);
        assert.equal(payload.capture_context.screenshot_status, "missing");
        assert.match(payload.capture_context.screenshot_error, /剪贴板里没有图片/);
        assert.equal(harness.storage.has("ak_settlement_samples_v1"), false);
        assert.match(harness.document.getElementById("workspace-save-status").innerText, /已下载本局输入；剪贴板截图未包含/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("front toolbar rejects tiny clipboard thumbnails as missing screenshots", async () => {
    const harness = installAppHarness();
    const previousGlobals = {};
    let clipboardReadCount = 0;

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 46,
            blue_avg_cells: "2.90"
        }
    }));

    harness.globals.navigator = {
        clipboard: {
            read() {
                clipboardReadCount += 1;
                return Promise.resolve([
                    {
                        types: ["image/png"],
                        getType(type) {
                            return Promise.resolve({
                                name: "",
                                type,
                                size: 729,
                                data_url: "data:image/png;base64,TINY",
                                thumbnail_data_url: "data:image/jpeg;base64,TINY",
                                thumbnail_type: "image/jpeg",
                                thumbnail_size: 845,
                                original_width: 64,
                                original_height: 52,
                                stored_width: 64,
                                stored_height: 52
                            });
                        }
                    }
                ]);
            }
        }
    };
    harness.globals.window.navigator = harness.globals.navigator;

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-save-clipboard-screenshot").click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(clipboardReadCount, 1);
        assert.equal(harness.downloads.length, 1);
        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.field_values.blue_avg_cells, "2.90");
        assert.equal(payload.observed_state.r4_blue_avg_text, "2.90");
        assert.equal(payload.screenshot_attachment, null);
        assert.equal(payload.capture_context.screenshot_status, "missing");
        assert.match(payload.capture_context.screenshot_error, /尺寸过小/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("front toolbar exports public average metadata and rounded observed state", async () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 46,
            blue_avg_cells: "2.67"
        },
        field_value_meta: {
            blue_avg_cells: { source_mode: "public_round" }
        }
    }));

    harness.globals.navigator = {
        clipboard: {
            read() {
                return Promise.reject(new Error("剪贴板里没有图片。请先截图复制到剪贴板。"));
            }
        }
    };
    harness.globals.window.navigator = harness.globals.navigator;

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-save-clipboard-screenshot").click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(harness.downloads.length, 1);
        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.field_values.blue_avg_cells, "2.67");
        assert.deepEqual(payload.field_value_meta.blue_avg_cells, {
            source_mode: "public_round",
            rounding_mode: "round"
        });
        assert.equal(payload.observed_state.r4_blue_avg_text, "2.67");
        assert.equal(payload.observed_state.r4_blue_avg_rounding_mode, "round");
        assert.equal(payload.settlement_sample.observed_state.r4_blue_avg_rounding_mode, "round");
        assert.equal(payload.settlement_sample.field_value_meta.blue_avg_cells.rounding_mode, "round");
    } finally {
        harness.restore(previousGlobals);
    }
});

test("front toolbar capture package embeds the latest posterior and valuation snapshot", async () => {
    const harness = installAppHarness({
        buildCoarseEngineResult: () => ({
            error: false,
            summary: {
                orange_count_probs: [
                    { count: 3, prob: 0.78 },
                    { count: 2, prob: 0.16 }
                ],
                red_count_probs: [
                    { count: 1, prob: 0.64 },
                    { count: 0, prob: 0.22 }
                ],
                count_means: { w: 3.4, g: 4.2, b: 5.1, p: 2.3, o: 3.0, r: 1.1 },
                cell_means: { w: 4.0, g: 6.0, b: 9.0, p: 6.0, o: 8.0, r: 5.0 },
                cell_low: { w: 2, g: 4, b: 7, p: 4, o: 6, r: 3 },
                cell_high: { w: 6, g: 8, b: 11, p: 8, o: 10, r: 7 }
            },
            valuation: {
                mean_value: 2180000,
                q05: 1600000,
                q25: 1900000,
                q75: 2450000,
                profit_prob: 0.63
            }
        })
    });
    const previousGlobals = {};

    harness.globals.navigator = {
        clipboard: {
            read() {
                return Promise.reject(new Error("剪贴板里没有图片。请先截图复制到剪贴板。"));
            }
        }
    };
    harness.globals.window.navigator = harness.globals.navigator;

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const totalItems = harness.document.getElementById("field-input-total_items");
        const bid = harness.document.getElementById("field-input-bid");
        totalItems.value = "24";
        totalItems.dispatch("input");
        bid.value = "1800000";
        bid.dispatch("input");
        bid.dispatch("blur");

        harness.document.getElementById("btn-save-clipboard-screenshot").click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));

        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.capture_context.analysis_status, "available");
        assert.equal(payload.analysis_snapshot.status, "available");
        assert.equal(payload.analysis_snapshot.phase, "coarse");
        assert.equal(payload.analysis_snapshot.map_id, "sunken_ship");
        assert.equal(payload.analysis_snapshot.template_id, "ahmed_default");
        assert.equal(payload.analysis_snapshot.bid_price, 1800000);
        assert.equal(payload.analysis_snapshot.summary.orange_count_probs[0].count, 3);
        assert.equal(payload.analysis_snapshot.summary.red_count_probs[0].prob, 0.64);
        assert.equal(payload.analysis_snapshot.valuation.mean_value, 2180000);
        assert.ok(payload.analysis_snapshot.cache_key);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("front toolbar capture package embeds posterior residual risk diagnostics", async () => {
    const config = createAppConfig();
    config.fields.items.splice(3, 0, {
        id: "purple_count",
        label: "紫色数量",
        family: "quality",
        quality: "p",
        metric: "count",
        input_mode: "integer",
        participates_in_solver: true
    });
    config.templates.builtins[0].fields.splice(3, 0, {
        field_id: "purple_count",
        group_id: "core",
        recommended: true,
        default_visible: true
    });
    const harness = installAppHarness({
        config,
        buildCoarseEngineResult: () => ({
            error: false,
            summary: {
                orange_count_probs: [
                    { count: 1, prob: 0.52 },
                    { count: 2, prob: 0.48 }
                ],
                red_count_probs: [
                    { count: 11, prob: 0.74 },
                    { count: 10, prob: 0.18 }
                ],
                count_means: { w: 4, g: 6, b: 17, p: 8, o: 1, r: 11 },
                cell_means: { w: 7, g: 17, b: 36, p: 29, o: 12, r: 40 },
                cell_low: { w: 4, g: 10, b: 34, p: 24, o: 12, r: 36 },
                cell_high: { w: 10, g: 20, b: 38, p: 34, o: 12, r: 45 }
            },
            valuation: {
                mean_value: 2200000,
                q05: 1200000,
                q25: 1600000,
                q75: 2600000,
                profit_prob: 0.5
            }
        })
    });
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 48,
            blue_count: 17,
            purple_count: 9,
            orange_avg_cells: "12",
            white_green_total_cells: 24,
            white_green_avg_cells: "2.4"
        },
        field_value_meta: {}
    }));
    harness.globals.navigator = {
        clipboard: {
            read() {
                return Promise.reject(new Error("剪贴板里没有图片。请先截图复制到剪贴板。"));
            }
        }
    };
    harness.globals.window.navigator = harness.globals.navigator;

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const totalItems = harness.document.getElementById("field-input-total_items");
        totalItems.value = "48";
        totalItems.dispatch("input");
        harness.document.getElementById("field-input-orange_avg_cells").dispatch("blur");
        harness.document.getElementById("btn-save-clipboard-screenshot").click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));

        const payload = JSON.parse(harness.downloads[0].text);
        const posteriorRisk = payload.analysis_snapshot.posterior_risk;
        assert.equal(posteriorRisk.status, "warning");
        assert.deepEqual(posteriorRisk.flags, [
            "extreme_orange_avg_needs_orange_count_confirmation",
            "red_residual_sensitive_to_missing_orange_count",
            "model_predicted_red_count_extreme",
            "model_predicted_red_cells_extreme"
        ]);
        assert.equal(posteriorRisk.constraint_diagnostics.orange_red_unknown_pool, 12);
        assert.equal(posteriorRisk.constraint_diagnostics.inferred_white_green_count, 10);
        assert.equal(payload.capture_context.posterior_risk_status, "warning");
        assert.deepEqual(payload.capture_context.posterior_risk_flags, posteriorRisk.flags);
        assert.equal(payload.capture_context.posterior_risk_warning_count, 3);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("front toolbar capture package does not export a stale analysis snapshot after input edits", async () => {
    const harness = installAppHarness({
        buildCoarseEngineResult: () => ({
            error: false,
            summary: {
                orange_count_probs: [{ count: 3, prob: 0.78 }],
                red_count_probs: [{ count: 1, prob: 0.64 }],
                count_means: { w: 3.4, g: 4.2, b: 5.1, p: 2.3, o: 3.0, r: 1.1 },
                cell_means: { w: 4.0, g: 6.0, b: 9.0, p: 6.0, o: 8.0, r: 5.0 },
                cell_low: { w: 2, g: 4, b: 7, p: 4, o: 6, r: 3 },
                cell_high: { w: 6, g: 8, b: 11, p: 8, o: 10, r: 7 }
            },
            valuation: { mean_value: 2180000, q05: 1600000, q25: 1900000, q75: 2450000, profit_prob: 0.63 }
        })
    });
    const previousGlobals = {};

    harness.globals.navigator = {
        clipboard: {
            read() {
                return Promise.reject(new Error("剪贴板里没有图片。请先截图复制到剪贴板。"));
            }
        }
    };
    harness.globals.window.navigator = harness.globals.navigator;

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const totalItems = harness.document.getElementById("field-input-total_items");
        const bid = harness.document.getElementById("field-input-bid");
        totalItems.value = "24";
        totalItems.dispatch("input");
        bid.value = "1800000";
        bid.dispatch("input");
        bid.dispatch("blur");

        bid.value = "2300000";
        bid.dispatch("input");
        harness.document.getElementById("btn-save-clipboard-screenshot").click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setImmediate(resolve));

        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.field_values.bid, 2300000);
        assert.equal(payload.capture_context.analysis_status, "missing");
        assert.equal(payload.capture_context.analysis_phase, null);
        assert.equal(payload.analysis_snapshot.status, "missing");
        assert.equal(payload.analysis_snapshot.reason, "no_current_analysis");
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel can delete the selected current-map sample without clearing the whole cache", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "sunken_ship",
        field_values: {
            total_items: 42
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "sunken_local_a",
            map_id: "sunken_ship",
            created_at: "2026-04-24T12:00:00.000Z",
            field_values: { total_items: 42 }
        },
        {
            id: "villa_local_b",
            map_id: "villa",
            created_at: "2026-04-24T13:00:00.000Z",
            field_values: { total_items: 45 }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-delete-sample-review").click();

        const stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.equal(stored.length, 1);
        assert.equal(stored[0].id, "villa_local_b");
        assert.match(harness.document.getElementById("calibration-status").innerText, /已删除当前本地样本/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /本地结算样本 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /当前地图 0/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel renders local settlement sample summary, supports import, and can clear local samples", async () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_local_1",
            map_id: "villa",
            loot_value: 36000,
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: {
                total_items: 24
            },
            actual_counts: {
                o: 2,
                r: 0
            }
        },
        {
            id: "sunken_local_1",
            map_id: "sunken_ship",
            loot_value: 50000,
            created_at: "2026-04-24T11:00:00.000Z"
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /本地结算样本 2/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /当前地图 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /可转 authority 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺观测 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺实际数量 0/);

        harness.document.getElementById("btn-calibration-export-authority-samples").click();
        assert.match(harness.document.getElementById("calibration-status").innerText, /build:authority-from-samples/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /Authority Battle Samples/);

        const sampleImportFile = harness.document.getElementById("calibration-import-samples-file");
        sampleImportFile.files = [{
            text: async () => JSON.stringify([
                {
                    id: "villa_import_1",
                    map_id: "villa",
                    loot_value: 42000,
                    created_at: "2026-04-24T12:00:00.000Z",
                    field_values: {
                        total_items: 45
                    },
                    actual_counts: {
                        o: 3,
                        r: 0
                    }
                },
                {
                    id: "villa_import_2",
                    map_id: "villa",
                    loot_value: 46000,
                    created_at: "2026-04-24T13:00:00.000Z",
                    state: {
                        r1_total_items: 48
                    },
                    actual_counts: {
                        o: 2,
                        r: 1
                    }
                }
            ])
        }];
        sampleImportFile.dispatch("change");
        await Promise.resolve();
        await Promise.resolve();

        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /本地结算样本 2/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /当前地图 2/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /可转 authority 2/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺观测 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺实际数量 0/);
        assert.match(harness.storage.get("ak_settlement_samples_v1"), /villa_import_1/);

        harness.document.getElementById("btn-calibration-clear-samples").click();

        assert.equal(harness.storage.get("ak_settlement_samples_v1") == null, true);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /本地结算样本 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /可转 authority 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺观测 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /缺实际数量 0/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("clearing local settlement samples downloads raw backup and current-map replay package before removal", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_ready_before_clear",
            map_id: "villa",
            loot_value: 42000,
            created_at: "2026-04-24T12:00:00.000Z",
            field_values: {
                total_items: 45
            },
            actual_counts: {
                o: 3,
                r: 0
            }
        },
        {
            id: "sunken_ready_before_clear",
            map_id: "sunken_ship",
            loot_value: 52000,
            created_at: "2026-04-24T12:30:00.000Z",
            field_values: {
                total_items: 50
            },
            actual_counts: {
                o: 2,
                r: 1
            }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-clear-samples").click();

        assert.equal(harness.downloads.length, 2);

        const rawDownload = harness.downloads.find((entry) => entry.filename && entry.filename.startsWith("auction-king-settlement-samples-before-clear-"));
        const replayDownload = harness.downloads.find((entry) => entry.filename && entry.filename.startsWith("auction-king-replay-package-before-clear-villa-all-"));
        assert.ok(rawDownload, "expected raw settlement sample backup download");
        assert.ok(replayDownload, "expected current-map replay package download");

        const rawPayload = JSON.parse(rawDownload.text);
        assert.deepEqual(rawPayload.map((sample) => sample.id), [
            "villa_ready_before_clear",
            "sunken_ready_before_clear"
        ]);

        const replayPayload = JSON.parse(replayDownload.text);
        assert.equal(replayPayload.schema_version, "ak_settlement_calibration_replay_package_v1");
        assert.equal(replayPayload.export_context.map_id, "villa");
        assert.equal(replayPayload.export_context.filter_value, "all");
        assert.equal(replayPayload.export_context.selected_sample_count, 1);
        assert.equal(replayPayload.samples.length, 1);
        assert.equal(replayPayload.samples[0].map_id, "villa");
        assert.ok(replayPayload.candidate_config.maps.villa);

        assert.equal(harness.storage.get("ak_settlement_samples_v1") == null, true);
        assert.match(harness.document.getElementById("calibration-status").innerText, /清空前已导出本地样本 2 条/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /当前地图 replay package 1 条/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /已清空本地结算样本缓存/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration panel separates global and current-map authority-ready sample counts", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_local_1",
            map_id: "villa",
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: {
                total_items: 24
            },
            actual_counts: {
                o: 2,
                r: 0
            }
        },
        {
            id: "sunken_local_1",
            map_id: "sunken_ship",
            created_at: "2026-04-24T11:00:00.000Z",
            field_values: {
                total_items: 36
            },
            actual_counts: {
                o: 1,
                r: 1
            }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const metaText = harness.document.getElementById("calibration-sample-meta").innerText;
        assert.match(metaText, /本地结算样本 2/);
        assert.match(metaText, /全局可转 authority 2/);
        assert.match(metaText, /全局未导出 2/);
        assert.match(metaText, /当前地图 1/);
        assert.match(metaText, /当前地图可转 authority 1/);
        assert.match(metaText, /当前地图未导出 1/);
        assert.match(metaText, /最近导出 无/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("current-map authority export does not treat other maps' ready samples as exportable", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "sunken_ready_1",
            map_id: "sunken_ship",
            created_at: "2026-04-24T11:00:00.000Z",
            field_values: {
                total_items: 36
            },
            actual_counts: {
                o: 1,
                r: 1
            }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-export-current-map-authority-samples").click();
        assert.match(harness.document.getElementById("calibration-status").innerText, /当前地图没有 authority-ready 样本可导出/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("current-map authority export downloads a wrapped package with current_map context", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_ready_1",
            map_id: "villa",
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: {
                total_items: 24
            },
            actual_counts: {
                o: 2,
                r: 0
            }
        },
        {
            id: "sunken_ready_1",
            map_id: "sunken_ship",
            created_at: "2026-04-24T11:00:00.000Z",
            field_values: {
                total_items: 36
            },
            actual_counts: {
                o: 1,
                r: 1
            }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-export-current-map-authority-samples").click();

        assert.equal(harness.downloads.length, 1);
        assert.equal(harness.downloads[0].filename, "auction-king-authority-battle-samples-villa.json");
        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.schema_version, "ak_authority_battle_sample_package_v1");
        assert.equal(payload.export_kind, "authority_battle_samples");
        assert.equal(payload.export_context.map_id, "villa");
        assert.equal(payload.export_context.scope, "current_map");
        assert.equal(payload.export_context.filter_value, "all");
        assert.equal(payload.export_context.sample_count, 1);
        assert.equal(payload.export_context.selected_sample_count, 1);
        assert.equal(payload.export_context.skipped_sample_count, 0);
        assert.deepEqual(payload.samples.map((entry) => entry.id), ["villa_ready_1"]);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("authority export marks current-map samples as exported and review edits make them pending again", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_ready_1",
            map_id: "villa",
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: {
                total_items: 24
            },
            actual_counts: {
                o: 2,
                r: 0
            }
        },
        {
            id: "sunken_ready_1",
            map_id: "sunken_ship",
            created_at: "2026-04-24T11:00:00.000Z",
            field_values: {
                total_items: 36
            },
            actual_counts: {
                o: 1,
                r: 1
            }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /全局未导出 2/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /当前地图未导出 1/);
        assert.match(harness.document.getElementById("calibration-sample-review").children[1].children[2].textContent, /未导出/);

        harness.document.getElementById("btn-calibration-export-current-map-authority-samples").click();

        let stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.equal(Boolean(stored[0].metadata && stored[0].metadata.authority_export && stored[0].metadata.authority_export.exported_at), true);
        assert.equal(typeof stored[0].metadata.authority_export.batch_id, "string");
        assert.equal(stored[0].metadata.authority_export.sample_count, 1);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /全局未导出 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /当前地图未导出 0/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /当前地图已导出 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /最近导出 current_map @ /);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /batch /);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /1条/);
        assert.match(harness.document.getElementById("calibration-sample-review").children[1].children[2].textContent, /已导出 current_map @ /);
        assert.match(harness.document.getElementById("calibration-sample-review").children[1].children[2].textContent, /batch /);
        assert.match(harness.document.getElementById("calibration-sample-review").children[1].children[2].textContent, /1条/);

        harness.document.getElementById("calibration-review-actual-count-r").value = "1";
        harness.document.getElementById("btn-calibration-save-sample-review").click();

        stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.deepEqual(stored[0].actual_counts, { o: 2, r: 1 });
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /全局未导出 2/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /当前地图未导出 1/);
        assert.match(harness.document.getElementById("calibration-sample-meta").innerText, /最近导出 无/);
        assert.match(harness.document.getElementById("calibration-sample-review").children[1].children[2].textContent, /未导出/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("global authority export downloads a wrapped package with global context", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_ready_1",
            map_id: "villa",
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: {
                total_items: 24
            },
            actual_counts: {
                o: 2,
                r: 0
            }
        },
        {
            id: "sunken_ready_1",
            map_id: "sunken_ship",
            created_at: "2026-04-24T11:00:00.000Z",
            field_values: {
                total_items: 36
            },
            actual_counts: {
                o: 1,
                r: 1
            }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-calibration-export-authority-samples").click();

        assert.equal(harness.downloads.length, 1);
        assert.equal(harness.downloads[0].filename, "auction-king-authority-battle-samples.json");
        const payload = JSON.parse(harness.downloads[0].text);
        assert.equal(payload.schema_version, "ak_authority_battle_sample_package_v1");
        assert.equal(payload.export_kind, "authority_battle_samples");
        assert.equal(payload.export_context.map_id, null);
        assert.equal(payload.export_context.scope, "global");
        assert.equal(payload.export_context.filter_value, "all");
        assert.equal(payload.export_context.sample_count, 2);
        assert.equal(payload.export_context.selected_sample_count, 2);
        assert.equal(payload.export_context.skipped_sample_count, 0);
        assert.deepEqual(payload.samples.map((entry) => entry.id), ["villa_ready_1", "sunken_ready_1"]);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("calibration sample review can filter current-map samples by pending export and exported batch id", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_batch_a_1",
            map_id: "villa",
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: { total_items: 24 },
            actual_counts: { o: 2, r: 0 },
            metadata: {
                authority_export: {
                    exported_at: "2026-04-24T10:05:00.000Z",
                    scope: "current_map",
                    batch_id: "batch_a",
                    sample_count: 1,
                    fingerprint: JSON.stringify({
                        map_id: "villa",
                        observed_state: { r1_total_items: 24 },
                        actual_counts: { o: 2, r: 0 },
                        actual_value: null,
                        actual_cells: null,
                        source_kind: "settlement_ocr",
                        items: []
                    })
                }
            }
        },
        {
            id: "villa_batch_b_1",
            map_id: "villa",
            created_at: "2026-04-24T11:00:00.000Z",
            field_values: { total_items: 36 },
            actual_counts: { o: 1, r: 1 },
            metadata: {
                authority_export: {
                    exported_at: "2026-04-24T11:05:00.000Z",
                    scope: "global",
                    batch_id: "batch_b",
                    sample_count: 2,
                    fingerprint: JSON.stringify({
                        map_id: "villa",
                        observed_state: { r1_total_items: 36 },
                        actual_counts: { o: 1, r: 1 },
                        actual_value: null,
                        actual_cells: null,
                        source_kind: "settlement_ocr",
                        items: []
                    })
                }
            }
        },
        {
            id: "villa_pending_1",
            map_id: "villa",
            created_at: "2026-04-24T12:00:00.000Z",
            field_values: { total_items: 48 },
            actual_counts: { o: 3, r: 0 }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const filterSelect = harness.document.getElementById("calibration-review-batch-filter");
        assert.equal(filterSelect.options.length, 4);
        assert.deepEqual(filterSelect.options.map((option) => option.value), [
            "all",
            "pending_export",
            "batch:batch_b",
            "batch:batch_a"
        ]);

        filterSelect.value = "pending_export";
        filterSelect.dispatch("change");
        let sampleSelect = harness.document.getElementById("calibration-review-sample-select");
        assert.deepEqual(sampleSelect.options.map((option) => option.value), ["villa_pending_1"]);

        const rerenderedFilter = harness.document.getElementById("calibration-review-batch-filter");
        rerenderedFilter.value = "batch:batch_a";
        rerenderedFilter.dispatch("change");
        sampleSelect = harness.document.getElementById("calibration-review-sample-select");
        assert.deepEqual(sampleSelect.options.map((option) => option.value), ["villa_batch_a_1"]);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("filtered replay export follows the current batch filter and does not rewrite authority export markers", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_batch_a_1",
            map_id: "villa",
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: { total_items: 24 },
            actual_counts: { o: 2, r: 0 },
            metadata: {
                authority_export: {
                    exported_at: "2026-04-24T10:05:00.000Z",
                    scope: "current_map",
                    batch_id: "batch_a",
                    sample_count: 1,
                    fingerprint: JSON.stringify({
                        map_id: "villa",
                        observed_state: { r1_total_items: 24 },
                        actual_counts: { o: 2, r: 0 },
                        actual_value: null,
                        actual_cells: null,
                        source_kind: "settlement_ocr",
                        items: []
                    })
                }
            }
        },
        {
            id: "villa_batch_b_1",
            map_id: "villa",
            created_at: "2026-04-24T11:00:00.000Z",
            field_values: { total_items: 36 },
            actual_counts: { o: 1, r: 1 },
            metadata: {
                authority_export: {
                    exported_at: "2026-04-24T11:05:00.000Z",
                    scope: "global",
                    batch_id: "batch_b",
                    sample_count: 2,
                    fingerprint: JSON.stringify({
                        map_id: "villa",
                        observed_state: { r1_total_items: 36 },
                        actual_counts: { o: 1, r: 1 },
                        actual_value: null,
                        actual_cells: null,
                        source_kind: "settlement_ocr",
                        items: []
                    })
                }
            }
        },
        {
            id: "villa_batch_b_2",
            map_id: "villa",
            created_at: "2026-04-24T11:01:00.000Z",
            field_values: { total_items: 40 },
            actual_counts: { o: 2, r: 1 },
            metadata: {
                authority_export: {
                    exported_at: "2026-04-24T11:05:00.000Z",
                    scope: "global",
                    batch_id: "batch_b",
                    sample_count: 2,
                    fingerprint: JSON.stringify({
                        map_id: "villa",
                        observed_state: { r1_total_items: 40 },
                        actual_counts: { o: 2, r: 1 },
                        actual_value: null,
                        actual_cells: null,
                        source_kind: "settlement_ocr",
                        items: []
                    })
                }
            }
        },
        {
            id: "villa_pending_1",
            map_id: "villa",
            created_at: "2026-04-24T12:00:00.000Z",
            field_values: { total_items: 48 },
            actual_counts: { o: 3, r: 0 }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const filterSelect = harness.document.getElementById("calibration-review-batch-filter");
        filterSelect.value = "batch:batch_b";
        filterSelect.dispatch("change");

        harness.document.getElementById("btn-calibration-export-filtered-replay-samples").click();

        const stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.equal(stored[3].metadata && stored[3].metadata.authority_export, undefined);
        assert.match(harness.document.getElementById("calibration-status").innerText, /当前筛选 2 条，其中可回放 2 条，跳过 0 条/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /当前 draft 候选配置已内嵌/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /auction-king-replay-package-villa-batch-b\.json/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /auction-king-replay-report-villa-batch-b\.json/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /build:settlement-calibration-replay/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("filtered replay export reports skipped non-replayable samples for the current filter", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_pending_ready_1",
            map_id: "villa",
            created_at: "2026-04-24T12:00:00.000Z",
            field_values: { total_items: 48 },
            actual_counts: { o: 3, r: 0 }
        },
        {
            id: "villa_pending_unready_1",
            map_id: "villa",
            created_at: "2026-04-24T12:01:00.000Z",
            field_values: { total_items: 50 }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const filterSelect = harness.document.getElementById("calibration-review-batch-filter");
        filterSelect.value = "pending_export";
        filterSelect.dispatch("change");

        harness.document.getElementById("btn-calibration-export-filtered-replay-samples").click();

        assert.match(harness.document.getElementById("calibration-status").innerText, /当前筛选 2 条/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /可回放 1 条/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /跳过 1 条/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("filtered authority export follows the current filter and marks only publishable matches", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    harness.storage.set("ak_workspace_state_v2", JSON.stringify({
        active_template_id: "ahmed_default",
        active_map_id: "villa",
        field_values: {
            total_items: 24
        }
    }));
    harness.storage.set("ak_settlement_samples_v1", JSON.stringify([
        {
            id: "villa_batch_a_1",
            map_id: "villa",
            created_at: "2026-04-24T10:00:00.000Z",
            field_values: { total_items: 24 },
            actual_counts: { o: 2, r: 0 },
            metadata: {
                authority_export: {
                    exported_at: "2026-04-24T10:05:00.000Z",
                    scope: "current_map",
                    batch_id: "batch_a",
                    sample_count: 1,
                    fingerprint: JSON.stringify({
                        map_id: "villa",
                        observed_state: { r1_total_items: 24 },
                        actual_counts: { o: 2, r: 0 },
                        actual_value: null,
                        actual_cells: null,
                        source_kind: "settlement_ocr",
                        items: []
                    })
                }
            }
        },
        {
            id: "villa_pending_ready_1",
            map_id: "villa",
            created_at: "2026-04-24T12:00:00.000Z",
            field_values: { total_items: 48 },
            actual_counts: { o: 3, r: 0 }
        },
        {
            id: "villa_pending_ready_2",
            map_id: "villa",
            created_at: "2026-04-24T12:01:00.000Z",
            field_values: { total_items: 50 },
            actual_counts: { o: 2, r: 1 }
        },
        {
            id: "villa_pending_unready_1",
            map_id: "villa",
            created_at: "2026-04-24T12:02:00.000Z",
            field_values: { total_items: 52 }
        }
    ]));

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const filterSelect = harness.document.getElementById("calibration-review-batch-filter");
        filterSelect.value = "pending_export";
        filterSelect.dispatch("change");

        harness.document.getElementById("btn-calibration-export-filtered-authority-samples").click();

        const stored = JSON.parse(harness.storage.get("ak_settlement_samples_v1"));
        assert.equal(stored[0].metadata.authority_export.batch_id, "batch_a");
        assert.equal(stored[1].metadata.authority_export.scope, "filtered");
        assert.equal(stored[2].metadata.authority_export.scope, "filtered");
        assert.equal(stored[1].metadata.authority_export.sample_count, 2);
        assert.equal(stored[2].metadata.authority_export.sample_count, 2);
        assert.equal(stored[3].metadata && stored[3].metadata.authority_export, undefined);
        assert.match(harness.document.getElementById("calibration-status").innerText, /当前筛选 3 条，其中可发布 2 条，跳过 1 条/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /auction-king-authority-battle-samples-villa-pending-export\.json/);
        assert.match(harness.document.getElementById("calibration-status").innerText, /build:authority-from-samples/);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("clear button resets compute state so the next blur can recompute immediately", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const totalItems = harness.document.getElementById("field-input-total_items");
        const computeStatusLabel = harness.document.getElementById("compute-status-label");

        totalItems.value = "24";
        totalItems.dispatch("input");
        assert.equal(computeStatusLabel.innerText, "等待离框");

        totalItems.dispatch("blur");
        assert.equal(computeStatusLabel.innerText, "计算中...");
        assert.equal(harness.runtimeLog.dispatches.length, 1);

        harness.document.getElementById("btn-clear").click();
        assert.equal(computeStatusLabel.innerText, "等待总数量");
        assert.equal(harness.runtimeLog.terminations, 1);

        totalItems.value = "36";
        totalItems.dispatch("input");
        totalItems.dispatch("blur");
        assert.equal(computeStatusLabel.innerText, "计算中...");
        assert.equal(harness.runtimeLog.dispatches.length, 2);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("switching templates rerenders visible fields and moves non-template fields into more-fields", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const templateSelect = harness.document.getElementById("template_select");
        assert.ok(harness.document.getElementById("field-input-blue_avg_cells"));

        templateSelect.value = "value_focus";
        templateSelect.dispatch("change");

        const visibleLabels = collectFieldLabels(harness.document.getElementById("template-groups"));

        assert.deepEqual(visibleLabels, [
            "总数量",
            "金色均格",
            "紫色平均价值",
            "出价"
        ]);
        assert.equal(
            collectElementsByDataset(harness.document.getElementById("more-fields"), "fieldId")
                .some((child) => child.id === "field-row-blue_avg_cells"),
            true
        );
    } finally {
        harness.restore(previousGlobals);
    }
});

test("more-fields panel stays collapsed by default and supports search and family filtering", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const moreFieldsPanel = harness.document.getElementById("more-fields-panel");
        const moreFieldsSearch = harness.document.getElementById("more-fields-search");
        const moreFieldsSummaryMeta = harness.document.getElementById("more-fields-summary-meta");

        assert.equal(moreFieldsPanel.open, false);
        assert.match(moreFieldsSummaryMeta.innerText, /备用观测/);
        assert.equal(harness.document.elements.has("more-fields-quality-w"), true);
        assert.equal(harness.document.elements.has("more-fields-quality-o"), true);
        assert.equal(harness.document.getElementById("more-fields-quality-w").open, false);
        assert.equal(harness.document.getElementById("more-fields-quality-o").open, false);

        moreFieldsSearch.value = "出价";
        moreFieldsSearch.dispatch("input");

        const bidLabels = collectFieldLabels(harness.document.getElementById("more-fields"));

        assert.deepEqual(bidLabels, ["出价"]);
        assert.equal(moreFieldsPanel.open, true);

        moreFieldsSearch.value = "";
        moreFieldsSearch.dispatch("input");
        harness.document.getElementById("more-fields-filter-constraint").click();

        const constraintLabels = collectFieldLabels(harness.document.getElementById("more-fields"));

        assert.deepEqual(constraintLabels, [
            "金色数量下界",
            "金色数量上界",
            "红色数量下界",
            "红色数量上界"
        ]);
        assert.match(harness.document.getElementById("more-fields-summary-meta").innerText, /^4 \/ /);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("main field panel supports inline reordering and clones builtin templates before persisting", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        assert.equal(harness.document.elements.has("field-action-move-down-total_items"), false);
        assert.equal(harness.document.elements.has("field-source-public-orange_avg_cells"), false);

        const organizeButton = harness.document.getElementById("btn-organize-chain");
        organizeButton.click();

        assert.equal(organizeButton.attributes.get("aria-pressed"), "true");
        assert.equal(harness.document.elements.has("field-action-move-down-total_items"), true);
        assert.equal(harness.document.elements.has("field-source-public-orange_avg_cells"), true);
        assert.equal(harness.document.elements.has("field-action-remove-blue_count"), true);

        harness.document.getElementById("field-action-move-down-total_items").click();

        const activeTemplateId = harness.document.getElementById("template_select").value;
        const visibleLabels = collectFieldLabels(harness.document.getElementById("template-groups"));

        assert.match(activeTemplateId, /^local_/);
        assert.deepEqual(visibleLabels.slice(0, 3), [
            "金色均格",
            "总数量",
            "蓝色数量"
        ]);

        const storageTemplates = JSON.parse(harness.storage.get("ak_templates_local_v2"));
        const clonedTemplate = storageTemplates.find((template) => template.id === activeTemplateId);
        assert.equal(clonedTemplate.fields[0].field_id, "orange_avg_cells");
        assert.equal(clonedTemplate.fields[1].field_id, "total_items");

        organizeButton.click();
        organizeButton.click();
        harness.document.getElementById("field-action-remove-blue_count").click();

        const afterDeleteLabels = collectFieldLabels(harness.document.getElementById("template-groups"));
        assert.deepEqual(afterDeleteLabels.slice(0, 3), [
            "金色均格",
            "总数量",
            "紫色均格"
        ]);
        assert.equal(
            collectElementsByDataset(harness.document.getElementById("more-fields"), "fieldId")
                .some((child) => child.id === "field-row-blue_count"),
            true
        );
    } finally {
        harness.restore(previousGlobals);
    }
});

test("template clone supports reordering and recommended toggle with local persistence", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-clone-template").click();

        const activeTemplateId = harness.document.getElementById("template_select").value;
        assert.match(activeTemplateId, /^local_/);
        assert.equal(harness.document.elements.has("field-action-move-down-total_items"), false);
        harness.document.getElementById("btn-organize-chain").click();
        assert.equal(harness.document.elements.has("field-action-move-down-total_items"), true);

        harness.document.getElementById("btn-config").click();
        harness.document.getElementById(`config-template-field-move-down-${activeTemplateId}-total_items`).click();
        harness.document.getElementById(`config-template-field-toggle-recommended-${activeTemplateId}-total_items`).click();
        harness.document.getElementById("btn-save-config").click();

        const visibleLabels = collectFieldLabels(harness.document.getElementById("template-groups"));

        assert.deepEqual(visibleLabels.slice(0, 3), [
            "金色均格",
            "总数量",
            "蓝色数量"
        ]);

        const storageTemplates = JSON.parse(harness.storage.get("ak_templates_local_v2"));
        const clonedTemplate = storageTemplates.find((template) => template.id === activeTemplateId);
        assert.equal(clonedTemplate.fields[0].field_id, "orange_avg_cells");
        assert.equal(clonedTemplate.fields[1].field_id, "total_items");
        assert.equal(clonedTemplate.fields[1].recommended, false);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("structured config editor can reorder builtin template fields and persist overrides", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-config").click();
        harness.document.getElementById("config-template-field-move-down-ahmed_default-total_items").click();
        harness.document.getElementById("config-template-field-toggle-recommended-ahmed_default-total_items").click();
        harness.document.getElementById("btn-save-config").click();

        const visibleLabels = collectFieldLabels(harness.document.getElementById("template-groups"));

        assert.deepEqual(visibleLabels.slice(0, 3), [
            "金色均格",
            "总数量",
            "蓝色数量"
        ]);
        harness.document.getElementById("btn-organize-chain").click();
        assert.equal(harness.document.elements.has("field-action-move-down-total_items"), true);
        assert.equal(harness.document.getElementById("field-row-total_items") !== null, true);
        assert.equal(harness.document.getElementById("field-helper-total_items").innerText, "本局拍品总件数");

        const overrides = JSON.parse(harness.storage.get("ak_config_overrides_v2"));
        const ahmedTemplate = overrides.templates.builtins.find((template) => template.id === "ahmed_default");
        assert.equal(ahmedTemplate.fields[0].field_id, "orange_avg_cells");
        assert.equal(ahmedTemplate.fields[1].field_id, "total_items");
        assert.equal(ahmedTemplate.fields[1].recommended, false);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("config modal opens JSON details automatically for raw comparison views", () => {
    const harness = installAppHarness();
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-config").click();
        assert.equal(harness.document.getElementById("config-json-details").open, false);

        harness.document.getElementById("btn-config-view-baseline").click();
        assert.equal(harness.document.getElementById("config-json-details").open, true);
        assert.equal(harness.document.getElementById("config-json").readOnly, true);

        harness.document.getElementById("btn-config-view-structured").click();
        assert.equal(harness.document.getElementById("config-json-details").open, false);
    } finally {
        harness.restore(previousGlobals);
    }
});

test("structured config editor renders direct map and global value matrices", () => {
    const config = createAppConfig();
    config.maps.sunken_ship.value_model = {
        r: { base_item_mean: 180000, per_cell_mean: 9000 }
    };
    config.maps.sunken_ship.red_type_profiles = {
        profiles: {
            small_red: { prior: 0.4 },
            big_red: { prior: 0.3 },
            gold_red: { prior: 0.2 }
        }
    };
    config.maps.sunken_ship.collection_families = {
        relics: { prior: 1.25, value_bias: 1.12 }
    };
    config.model.collection_families = {
        relics: { prior: 1.1, value_bias: 1.16 }
    };
    const harness = installAppHarness({ config });
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        harness.document.getElementById("btn-config").click();

        assert.equal(
            harness.document.getElementById("config-map-quality-input-sunken_ship-o-alpha").value,
            "2.6"
        );
        assert.equal(
            harness.document.getElementById("config-map-value-input-sunken_ship-r-base_item_mean").value,
            "180000"
        );
        assert.equal(
            harness.document.getElementById("config-model-value-input-r-base_item_mean").value,
            "6"
        );
        assert.equal(
            harness.document.getElementById("config-map-red-profile-input-gold_red-prior").value,
            "0.2"
        );
        assert.equal(
            harness.document.getElementById("config-map-family-bias-input-relics-value_bias").value,
            "1.12"
        );
        assert.equal(
            harness.document.getElementById("config-model-family-bias-input-relics-value_bias").value,
            "1.16"
        );
    } finally {
        harness.restore(previousGlobals);
    }
});

test("valuation panel leads with a bid decision sentence and posterior bars stay readable without wrapping cards", () => {
    const harness = installAppHarness({
        buildCoarseEngineResult: () => ({
            error: false,
            summary: {
                orange_count_probs: [
                    { count: 3, prob: 0.78 },
                    { count: 2, prob: 0.16 },
                    { count: 4, prob: 0.06 }
                ],
                red_count_probs: [
                    { count: 1, prob: 0.64 },
                    { count: 0, prob: 0.22 },
                    { count: 2, prob: 0.14 }
                ],
                count_means: { w: 3.4, g: 4.2, b: 5.1, p: 2.3, o: 3.0, r: 1.1 },
                cell_means: { w: 4.0, g: 6.0, b: 9.0, p: 6.0, o: 8.0, r: 5.0 },
                cell_low: { w: 2, g: 4, b: 7, p: 4, o: 6, r: 3 },
                cell_high: { w: 6, g: 8, b: 11, p: 8, o: 10, r: 7 }
            },
            valuation: {
                mean_value: 2180000,
                q05: 1600000,
                q25: 1900000,
                q75: 2450000,
                profit_prob: 0.63
            }
        })
    });
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const totalItems = harness.document.getElementById("field-input-total_items");
        const bid = harness.document.getElementById("field-input-bid");
        totalItems.value = "24";
        totalItems.dispatch("input");
        bid.value = "1800000";
        bid.dispatch("input");
        bid.dispatch("blur");

        assert.equal(harness.document.getElementById("valuation-section").classList.contains("hidden"), false);
        assert.equal(
            harness.document.getElementById("val-decision-headline").innerText,
            "建议上限 1,787,600，当前出价 1,800,000，压线"
        );
        assert.equal(
            harness.document.getElementById("val-decision-summary").innerText,
            "EV 2,180,000 | ROI +21.1% | 盈利概率 63.0% | Q25 1,900,000"
        );
        assert.equal(
            harness.document.getElementById("orange-confidence-note").innerText,
            "高把握 | 主分支 3件 78.0%，次分支 2件 16.0%"
        );
        assert.equal(
            harness.document.getElementById("red-confidence-note").innerText,
            "中等把握 | 主分支 1件 64.0%，次分支 0件 22.0%"
        );
        assert.equal(harness.document.getElementById("posterior-risk-note").classList.contains("hidden"), true);

        const firstOrange = harness.document.getElementById("list-orange").children[0];
        assert.equal(firstOrange.className, "mega-prob-item");
        assert.equal(firstOrange.classList.contains("top-result"), true);
        assert.equal(firstOrange.children[0].innerText, "3件");
        assert.equal(firstOrange.children[1].className, "mega-bar-container");
        assert.equal(firstOrange.children[2].innerText, "78.0%");
    } finally {
        harness.restore(previousGlobals);
    }
});

test("posterior risk note warns when missing orange count drives red residual", () => {
    const harness = installAppHarness({
        buildCoarseEngineResult: () => ({
            error: false,
            summary: {
                orange_count_probs: [
                    { count: 1, prob: 0.52 },
                    { count: 2, prob: 0.48 }
                ],
                red_count_probs: [
                    { count: 11, prob: 0.74 },
                    { count: 10, prob: 0.18 }
                ],
                count_means: { w: 4, g: 6, b: 17, p: 8, o: 1, r: 11 },
                cell_means: { w: 7, g: 17, b: 36, p: 29, o: 12, r: 40 },
                cell_low: { w: 4, g: 10, b: 34, p: 24, o: 12, r: 36 },
                cell_high: { w: 10, g: 20, b: 38, p: 34, o: 12, r: 45 }
            },
            valuation: {
                mean_value: 2200000,
                q05: 1200000,
                q25: 1600000,
                q75: 2600000,
                profit_prob: 0.5
            }
        })
    });
    const previousGlobals = {};

    Object.keys(harness.globals).forEach((key) => {
        previousGlobals[key] = global[key];
        global[key] = harness.globals[key];
    });

    try {
        delete require.cache[require.resolve("../app.js")];
        require("../app.js");
        harness.document.fireDOMContentLoaded();

        const values = {
            total_items: "48",
            blue_count: "17",
            orange_avg_cells: "12",
            white_green_total_cells: "24",
            white_green_avg_cells: "2.4"
        };
        Object.entries(values).forEach(([fieldId, value]) => {
            const input = harness.document.getElementById(`field-input-${fieldId}`);
            input.value = value;
            input.dispatch("input");
        });
        harness.document.getElementById("field-input-orange_avg_cells").dispatch("blur");

        const note = harness.document.getElementById("posterior-risk-note");
        assert.equal(note.classList.contains("hidden"), false);
        assert.match(note.innerText, /橙色均格极高但缺橙色数量/);
        assert.match(note.innerText, /未知池残差/);
        assert.match(note.innerText, /不要按 EV 上沿追价/);
    } finally {
        harness.restore(previousGlobals);
    }
});
