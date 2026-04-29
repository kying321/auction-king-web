const test = require("node:test");
const assert = require("node:assert/strict");
const { renderConfigEditorControls } = require("../src/browser/config_editor_runtime.js");

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    toggle(name, force) {
        if (force) this.values.add(name);
        else this.values.delete(name);
    }
}

class FakeElement {
    constructor(tagName = "div") {
        this.tagName = tagName.toUpperCase();
        this.children = [];
        this.attributes = new Map();
        this.listeners = new Map();
        this.classList = new FakeClassList();
        this.className = "";
        this.innerText = "";
        this.textContent = "";
        this.value = "";
        this.disabled = false;
        this.title = "";
    }

    appendChild(child) {
        this.children.push(child);
        return child;
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
            preventDefault() {
                event.defaultPrevented = true;
            },
            defaultPrevented: false,
            ...extra
        };
        for (const handler of this.listeners.get(type) || []) {
            handler(event);
        }
        return event;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === "id") this.id = String(value);
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
    }
}

class FakeDocument {
    createElement(tagName) {
        return new FakeElement(tagName);
    }
}

function findById(root, id) {
    if (!root) return null;
    if (root.id === id) return root;
    for (const child of root.children || []) {
        const match = findById(child, id);
        if (match) return match;
    }
    return null;
}

test("template field editor renders compact accessible action buttons", () => {
    const container = new FakeElement("div");
    const statusElement = new FakeElement("p");

    renderConfigEditorControls(
        {
            container,
            activeConfigModalView: "structured",
            structuredView: "structured",
            configDraft: {},
            activeMapId: "sunken_ship"
        },
        {
            buildConfigEditorSections() {
                return [
                    {
                        id: "template-field-layout",
                        title: "模板字段布局",
                        description: "字段顺序",
                        controls: [
                            {
                                kind: "template-fields",
                                template_id: "ahmed_default",
                                title: "Ahmed 默认模板",
                                value: [
                                    {
                                        field_id: "total_items",
                                        label: "总数量",
                                        group_label: "核心链路",
                                        recommended: true,
                                        default_visible: true,
                                        participates_in_solver: true
                                    },
                                    {
                                        field_id: "orange_avg_cells",
                                        label: "金色均格",
                                        group_label: "核心链路",
                                        recommended: false,
                                        default_visible: false,
                                        participates_in_solver: true
                                    }
                                ],
                                available_fields: [],
                                groups: [{ id: "core", label: "核心链路" }]
                            }
                        ]
                    }
                ];
            },
            applyTemplateFieldMutation() {},
            applyConfigEditorValue() {},
            onDraftReplace() {},
            onMessage(message, isError) {
                statusElement.innerText = message;
                statusElement.isError = isError;
            }
        },
        {
            documentRef: new FakeDocument(),
            clearElementContent(element) {
                element.children = [];
            },
            setElementText(element, text) {
                element.innerText = text || "";
                element.textContent = text || "";
            }
        }
    );

    const moveUp = findById(container, "config-template-field-move-up-ahmed_default-total_items");
    const toggleRecommended = findById(container, "config-template-field-toggle-recommended-ahmed_default-total_items");
    const toggleVisible = findById(container, "config-template-field-toggle-visible-ahmed_default-orange_avg_cells");
    const remove = findById(container, "config-template-field-remove-ahmed_default-total_items");

    assert.equal(moveUp.innerText, "↑");
    assert.equal(moveUp.attributes.get("aria-label"), "上移 总数量");
    assert.equal(moveUp.title, "上移 总数量");
    assert.equal(toggleRecommended.innerText, "荐");
    assert.equal(toggleRecommended.attributes.get("aria-label"), "取消推荐 总数量");
    assert.equal(toggleVisible.innerText, "显");
    assert.equal(toggleVisible.attributes.get("aria-label"), "默认显示 金色均格");
    assert.equal(remove.innerText, "×");
    assert.equal(remove.attributes.get("aria-label"), "移除 总数量");
    assert.equal(statusElement.innerText, "结构化控件和只读 JSON 会同步显示当前草稿。");
});

test("value matrix number controls accept decimals and wheel-step into draft state", () => {
    const container = new FakeElement("div");
    const changes = [];

    renderConfigEditorControls(
        {
            container,
            activeConfigModalView: "structured",
            structuredView: "structured",
            configDraft: {},
            activeMapId: "sunken_ship"
        },
        {
            buildConfigEditorSections() {
                return [
                    {
                        id: "value-model",
                        title: "价值模型",
                        description: "按品质调整",
                        controls: [
                            {
                                id: "map_value_matrix",
                                kind: "map-value-matrix",
                                maps: [
                                    {
                                        map_id: "sunken_ship",
                                        label: "沉船",
                                        rows: [
                                            {
                                                quality_id: "p",
                                                quality_label: "紫",
                                                values: {
                                                    base_item_mean: {
                                                        path: "maps.sunken_ship.value_model.p.base_item_mean",
                                                        value: 9173.25,
                                                        step: "0.01"
                                                    },
                                                    per_cell_mean: {
                                                        path: "maps.sunken_ship.value_model.p.per_cell_mean",
                                                        value: 2300.5,
                                                        step: "0.01"
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                ];
            },
            applyConfigEditorValue(_configDraft, _activeMapId, path, value) {
                changes.push({ path, value });
                return {};
            },
            onDraftReplace() {},
            onMessage() {}
        },
        {
            documentRef: new FakeDocument(),
            clearElementContent(element) {
                element.children = [];
            },
            setElementText(element, text) {
                element.innerText = text || "";
                element.textContent = text || "";
            }
        }
    );

    const input = findById(container, "config-map-value-input-sunken_ship-p-base_item_mean");
    assert.equal(input.type, "text");
    assert.equal(input.inputMode, "decimal");
    assert.equal(input.attributes.get("data-numeric-input"), "decimal");
    assert.equal(input.step, "0.01");
    assert.equal(input.value, "9173.25");

    const wheelEvent = input.dispatch("wheel", { deltaY: -1 });
    assert.equal(wheelEvent.defaultPrevented, true);
    assert.equal(input.value, "9173.26");
    assert.deepEqual(changes.at(-1), {
        path: "maps.sunken_ship.value_model.p.base_item_mean",
        value: "9173.26"
    });
});
