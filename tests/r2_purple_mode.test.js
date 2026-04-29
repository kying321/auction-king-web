const test = require("node:test");
const assert = require("node:assert/strict");
const {
    getDefaultR2PurpleMode,
    getR2PurpleModeSummary,
    normalizeR2PurpleCount,
    shouldDisableR2PurpleCount,
    syncR2PurpleCountInput
} = require("../src/core/r2_purple_mode.js");

test("getDefaultR2PurpleMode defaults Ahmed flow to orange-only probe", () => {
    assert.equal(getDefaultR2PurpleMode(), "orange_only");
});

test("normalizeR2PurpleCount keeps purple count in standard mode", () => {
    assert.equal(normalizeR2PurpleCount(3, "with_purple"), 3);
    assert.equal(normalizeR2PurpleCount(null, "with_purple"), null);
});

test("normalizeR2PurpleCount forces null when player chooses no purple probe", () => {
    assert.equal(normalizeR2PurpleCount(3, "orange_only"), null);
});

test("shouldDisableR2PurpleCount reflects the selected info mode", () => {
    assert.equal(shouldDisableR2PurpleCount("with_purple"), false);
    assert.equal(shouldDisableR2PurpleCount("orange_only"), true);
});

test("syncR2PurpleCountInput disables and clears the field in orange-only mode", () => {
    const input = { disabled: false, placeholder: "未知留空", value: "5" };

    syncR2PurpleCountInput(input, "orange_only");

    assert.equal(input.disabled, true);
    assert.equal(input.placeholder, "本局不使用该情报");
    assert.equal(input.value, "");
});

test("syncR2PurpleCountInput restores editable placeholder in standard mode", () => {
    const input = { disabled: true, placeholder: "本局不使用该情报", value: "" };

    syncR2PurpleCountInput(input, "with_purple");

    assert.equal(input.disabled, false);
    assert.equal(input.placeholder, "未知留空");
    assert.equal(input.value, "");
});

test("getR2PurpleModeSummary explains orange-only inference mode", () => {
    assert.equal(
        getR2PurpleModeSummary("orange_only"),
        "R2 当前未使用紫数情报，橙色后验仅由橙色均格约束。"
    );
});

test("getR2PurpleModeSummary explains standard inference mode", () => {
    assert.equal(
        getR2PurpleModeSummary("with_purple"),
        "R2 当前已使用紫数情报，橙色后验同时受橙色均格与紫色件数约束。"
    );
});
