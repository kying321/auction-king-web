const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildRecognitionPlan,
    buildBattleRegionAttempts,
    buildTesseractParameters,
    mergeRecognitionResults
} = require("../ocr_runtime.js");

test("buildRecognitionPlan uses multi-pass preprocessing for battle screenshots", () => {
    const battlePlan = buildRecognitionPlan("battle");
    const settlementPlan = buildRecognitionPlan("settlement");

    assert.equal(battlePlan.length, 4);
    assert.equal(settlementPlan.length, 1);
    assert.ok(
        battlePlan.some((attempt) => Number.isFinite(attempt.preprocess.threshold)),
        `expected threshold-based battle attempts, got ${JSON.stringify(battlePlan)}`
    );
    assert.ok(
        battlePlan.some((attempt) => attempt.preprocess.adaptiveThreshold),
        `expected adaptive-threshold battle attempt, got ${JSON.stringify(battlePlan)}`
    );
    assert.equal(battlePlan.find((attempt) => attempt.label === "battle-soft-threshold").tesseract.psm, 11);
});

test("buildBattleRegionAttempts normalizes valid relative crop presets and ignores invalid ones", () => {
    const attempts = buildBattleRegionAttempts({
        battle_region_presets: {
            header_band: { x: 0, y: 0, width: 1, height: 0.28, scale: 2.4, contrastBoost: 42, threshold: 168, adaptiveThreshold: true, psm: 7, whitelist: "0123456789." },
            invalid_box: { x: -0.1, y: 0.2, width: 0.5, height: 0.4 }
        }
    });

    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].label, "battle-region:header_band");
    assert.deepEqual(attempts[0].preprocess.cropRelative, {
        x: 0,
        y: 0,
        width: 1,
        height: 0.28
    });
    assert.equal(attempts[0].preprocess.scale, 2.4);
    assert.equal(attempts[0].preprocess.adaptiveThreshold.blockSize, 31);
    assert.equal(attempts[0].tesseract.psm, 7);
    assert.equal(attempts[0].tesseract.whitelist, "0123456789.");
});

test("buildRecognitionPlan appends configured battle crop attempts after the full-image passes", () => {
    const battlePlan = buildRecognitionPlan("battle", {
        ocrConfig: {
            battle_region_presets: {
                summary_panel: { x: 0.48, y: 0.18, width: 0.48, height: 0.34, threshold: 170 }
            }
        }
    });

    assert.equal(battlePlan.length, 5);
    assert.equal(battlePlan[4].label, "battle-region:summary_panel");
    assert.equal(battlePlan[4].preprocess.cropRelative.width, 0.48);
});

test("buildTesseractParameters emits constrained OCR settings for field crops", () => {
    assert.deepEqual(buildTesseractParameters({
        psm: 7,
        dpi: 360,
        preserveInterwordSpaces: false,
        whitelist: "0123456789."
    }), {
        tessedit_pageseg_mode: "7",
        preserve_interword_spaces: "0",
        user_defined_dpi: "360",
        tessedit_char_whitelist: "0123456789."
    });
});

test("mergeRecognitionResults combines complementary OCR lines and keeps the best confidence", () => {
    const merged = mergeRecognitionResults([
        {
            label: "battle-default",
            text: "总件数:24\n场上蓝色件数:11\n橙色均格:0.30",
            confidence: 61,
            processedImage: "data:image/png;base64,a"
        },
        {
            label: "battle-threshold",
            text: "场上橙色件数:3\n绿白总格数:16\n总仓储空间:40",
            confidence: 74,
            processedImage: "data:image/png;base64,b"
        }
    ]);

    assert.match(merged.text, /总件数:24/);
    assert.match(merged.text, /场上橙色件数:3/);
    assert.match(merged.text, /总仓储空间:40/);
    assert.equal(merged.confidence, 74);
    assert.equal(merged.attempts.length, 2);
    assert.deepEqual(merged.processedImages, [
        "data:image/png;base64,a",
        "data:image/png;base64,b"
    ]);
});
