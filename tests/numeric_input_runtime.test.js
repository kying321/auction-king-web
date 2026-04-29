const test = require("node:test");
const assert = require("node:assert/strict");
const {
    configureNumericInput,
    bindNumericWheelStepper,
    parseLooseNumber
} = require("../numeric_input_runtime.js");

class FakeElement {
    constructor() {
        this.type = "";
        this.step = "";
        this.min = "";
        this.max = "";
        this.value = "";
        this.inputMode = "";
        this.attributes = new Map();
        this.listeners = new Map();
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) || null;
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
            defaultPrevented: false,
            preventDefault() {
                event.defaultPrevented = true;
            },
            ...extra
        };
        for (const handler of this.listeners.get(type) || []) {
            handler(event);
        }
        return event;
    }
}

test("decimal numeric inputs use text mode so the user can type an unfinished decimal", () => {
    const input = new FakeElement();

    configureNumericInput(input, { step: "0.01" });
    input.value = "12.";

    assert.equal(input.type, "text");
    assert.equal(input.inputMode, "decimal");
    assert.equal(input.getAttribute("data-numeric-input"), "decimal");
    assert.equal(input.value, "12.");
    assert.equal(parseLooseNumber(input.value), 12);
});

test("integer numeric inputs use numeric text mode without browser spinner filtering", () => {
    const input = new FakeElement();

    configureNumericInput(input, { step: "1", min: "0", max: "12" });

    assert.equal(input.type, "text");
    assert.equal(input.inputMode, "numeric");
    assert.equal(input.step, "1");
    assert.equal(input.min, "0");
    assert.equal(input.max, "12");
});

test("wheel stepper moves in both directions, clamps bounds, and formats by step precision", () => {
    const input = new FakeElement();
    const changes = [];
    configureNumericInput(input, { step: "0.01", min: "0", max: "1" });
    input.value = "0.50";

    bindNumericWheelStepper(input, (value) => changes.push(value));

    const incrementEvent = input.dispatch("wheel", { deltaY: -40 });
    assert.equal(incrementEvent.defaultPrevented, true);
    assert.equal(input.value, "0.51");

    input.dispatch("wheel", { deltaY: 40 });
    assert.equal(input.value, "0.50");

    input.value = "0";
    input.dispatch("wheel", { deltaY: 40 });
    assert.equal(input.value, "0.00");

    assert.deepEqual(changes, ["0.51", "0.50", "0.00"]);
});
