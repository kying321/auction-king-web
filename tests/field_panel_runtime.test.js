const test = require("node:test");
const assert = require("node:assert/strict");

const { buildFieldCard } = require("../field_panel_runtime.js");

class FakeElement {
    constructor(tagName = "div", ownerDocument = null) {
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.id = "";
        this.value = "";
        this.innerText = "";
        this.textContent = "";
        this.placeholder = "";
        this.type = "";
        this.step = "";
        this.min = "";
        this.title = "";
        this.attributes = new Map();
        this.children = [];
        this.listeners = new Map();
        this.classList = { toggle() {} };
        this.dataset = {};
    }

    appendChild(child) {
        this.children.push(child);
        if (child.id && this.ownerDocument) this.ownerDocument.elements.set(child.id, child);
        return child;
    }

    addEventListener(type, handler) {
        const handlers = this.listeners.get(type) || [];
        handlers.push(handler);
        this.listeners.set(type, handlers);
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    dispatch(type) {
        for (const handler of this.listeners.get(type) || []) {
            handler({ type, currentTarget: this, target: this });
        }
    }
}

class FakeDocument {
    constructor() {
        this.elements = new Map();
    }

    createElement(tagName) {
        return new FakeElement(tagName, this);
    }
}

test("decimal field input preserves the raw text so two-decimal solver semantics survive export", () => {
    const documentRef = new FakeDocument();
    const values = [];

    buildFieldCard(
        { id: "blue_avg_cells", label: "蓝色均格", input_mode: "decimal", participates_in_solver: true },
        { workspaceState: { field_values: { blue_avg_cells: null } } },
        { onFieldInput: (_fieldId, value) => values.push(value) },
        { documentRef }
    );

    const input = documentRef.elements.get("field-input-blue_avg_cells");
    assert.equal(input.type, "text");
    assert.equal(input.inputMode, "decimal");
    assert.equal(input.attributes.get("data-numeric-input"), "decimal");
    input.value = "2.90";
    input.dispatch("input");

    assert.deepEqual(values, ["2.90"]);
});

test("average cell input treats zero as blank and clears the visible value", () => {
    const documentRef = new FakeDocument();
    const values = [];

    buildFieldCard(
        { id: "blue_avg_cells", label: "蓝色均格", input_mode: "decimal", participates_in_solver: true },
        { workspaceState: { field_values: { blue_avg_cells: null } } },
        { onFieldInput: (_fieldId, value) => values.push(value) },
        { documentRef }
    );

    const input = documentRef.elements.get("field-input-blue_avg_cells");
    assert.equal(input.placeholder, "留空则忽略");

    input.value = "0.00";
    input.dispatch("input");

    assert.deepEqual(values, [null]);
    assert.equal(input.value, "");
});

test("average cell rows hide the public data toggle outside organize mode", () => {
    const documentRef = new FakeDocument();

    buildFieldCard(
        { id: "blue_avg_cells", label: "蓝色均格", input_mode: "decimal", participates_in_solver: true },
        {
            isOrganizingChain: false,
            workspaceState: {
                field_values: { blue_avg_cells: "2.67" },
                field_value_meta: { blue_avg_cells: { source_mode: "public_round" } }
            }
        },
        {},
        { documentRef }
    );

    assert.equal(documentRef.elements.has("field-source-public-blue_avg_cells"), false);
});

test("average cell rows expose a public data toggle in organize mode", () => {
    const documentRef = new FakeDocument();
    const updates = [];

    buildFieldCard(
        { id: "blue_avg_cells", label: "蓝色均格", input_mode: "decimal", participates_in_solver: true },
        {
            isOrganizingChain: true,
            workspaceState: {
                field_values: { blue_avg_cells: "2.67" },
                field_value_meta: { blue_avg_cells: { source_mode: "public_round" } }
            }
        },
        { onFieldMetaInput: (fieldId, value) => updates.push({ fieldId, value }) },
        { documentRef }
    );

    const button = documentRef.elements.get("field-source-public-blue_avg_cells");
    assert.ok(button);
    assert.match(button.title, /四舍五入/);
    assert.equal(button.innerText, "公开数据");
    assert.equal(button.attributes.get("aria-pressed"), "true");

    button.dispatch("click");

    assert.deepEqual(updates, [{ fieldId: "blue_avg_cells", value: null }]);
});

test("decimal more-field rows hide public data toggles outside organize mode", () => {
    const documentRef = new FakeDocument();

    buildFieldCard(
        { id: "total_value", label: "总价值", input_mode: "decimal", participates_in_solver: false },
        {
            isMoreField: true,
            isOrganizingChain: false,
            workspaceState: {
                field_values: { total_value: "123.45" },
                field_value_meta: {}
            }
        },
        {},
        { documentRef }
    );

    assert.equal(documentRef.elements.has("field-source-public-total_value"), false);
});

test("decimal more-field rows expose a public data toggle in organize mode", () => {
    const documentRef = new FakeDocument();
    const updates = [];

    buildFieldCard(
        { id: "total_value", label: "总价值", input_mode: "decimal", participates_in_solver: false },
        {
            isMoreField: true,
            isOrganizingChain: true,
            workspaceState: {
                field_values: { total_value: "123.45" },
                field_value_meta: {}
            }
        },
        { onFieldMetaInput: (fieldId, value) => updates.push({ fieldId, value }) },
        { documentRef }
    );

    const button = documentRef.elements.get("field-source-public-total_value");
    assert.ok(button);
    assert.match(button.title, /四舍五入/);
    assert.equal(button.innerText, "公开数据");
    assert.equal(button.attributes.get("aria-pressed"), "false");

    button.dispatch("click");

    assert.deepEqual(updates, [{
        fieldId: "total_value",
        value: { source_mode: "public_round", rounding_mode: "round" }
    }]);
});

test("integer more-field rows do not expose public data rounding toggles", () => {
    const documentRef = new FakeDocument();

    buildFieldCard(
        { id: "total_items", label: "总数量", input_mode: "integer", participates_in_solver: true },
        {
            isMoreField: true,
            workspaceState: { field_values: { total_items: 10 } }
        },
        {},
        { documentRef }
    );

    assert.equal(documentRef.elements.has("field-source-public-total_items"), false);
});

test("integer field input keeps numeric storage for existing count behavior", () => {
    const documentRef = new FakeDocument();
    const values = [];

    buildFieldCard(
        { id: "blue_count", label: "蓝色数量", input_mode: "integer", participates_in_solver: true },
        { workspaceState: { field_values: { blue_count: null } } },
        { onFieldInput: (_fieldId, value) => values.push(value) },
        { documentRef }
    );

    const input = documentRef.elements.get("field-input-blue_count");
    assert.equal(input.type, "text");
    assert.equal(input.inputMode, "numeric");
    assert.equal(input.attributes.get("data-numeric-input"), "integer");
    input.value = "11";
    input.dispatch("input");

    assert.deepEqual(values, [11]);
});
