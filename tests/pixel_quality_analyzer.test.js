const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
    QUALITY_COLOR_PROFILES,
    analyzeQualityColorBlocksFromImageBuffer,
    classifyPixelQuality,
    summarizeQualityBlocks
} = require("../src/core/pixel_quality_analyzer.js");

function svgFixture() {
    return Buffer.from(`
<svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="360" fill="#101820"/>
  <rect x="315" y="24" width="300" height="300" fill="#222b35"/>
  <rect x="332" y="42" width="58" height="58" fill="#28323f" stroke="#e8e8e8" stroke-width="6"/>
  <rect x="402" y="42" width="58" height="58" fill="#28323f" stroke="#40d46a" stroke-width="6"/>
  <rect x="472" y="42" width="58" height="58" fill="#28323f" stroke="#4ea1ff" stroke-width="6"/>
  <rect x="542" y="42" width="58" height="58" fill="#28323f" stroke="#a65cff" stroke-width="6"/>
  <rect x="332" y="128" width="88" height="64" fill="#28323f" stroke="#ffd04c" stroke-width="6"/>
  <rect x="442" y="128" width="118" height="72" fill="#28323f" stroke="#f24c4c" stroke-width="6"/>
  <rect x="335" y="230" width="260" height="20" fill="#343c48"/>
</svg>`);
}

function tintedTileNoiseFixture() {
    return Buffer.from(`
<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg">
  <rect width="960" height="540" fill="#0f1720"/>
  <rect x="500" y="58" width="390" height="390" fill="#151d27"/>
  <rect x="520" y="88" width="96" height="76" fill="#194c2e"/>
  <rect x="626" y="88" width="96" height="76" fill="#174b73"/>
  <rect x="732" y="88" width="96" height="76" fill="#4b2872"/>
  <rect x="520" y="176" width="126" height="84" fill="#776028"/>
  <rect x="656" y="176" width="126" height="84" fill="#733034"/>
  <rect x="520" y="44" width="115" height="12" fill="#f1f5f9"/>
  <rect x="646" y="44" width="86" height="12" fill="#f1f5f9"/>
  <rect x="782" y="44" width="62" height="12" fill="#f1f5f9"/>
  <rect x="530" y="104" width="54" height="8" fill="#f1f5f9"/>
  <rect x="637" y="104" width="49" height="8" fill="#f1f5f9"/>
  <rect x="742" y="104" width="60" height="8" fill="#f1f5f9"/>
  <rect x="534" y="194" width="74" height="8" fill="#f1f5f9"/>
  <rect x="670" y="194" width="70" height="8" fill="#f1f5f9"/>
  <rect x="520" y="306" width="190" height="18" fill="#f1f5f9"/>
  <rect x="716" y="306" width="128" height="18" fill="#f1f5f9"/>
</svg>`);
}

function highContrast191SlotFixture() {
    return Buffer.from(`
<svg width="520" height="320" xmlns="http://www.w3.org/2000/svg">
  <rect width="520" height="320" fill="#0d141d"/>
  <rect x="36" y="34" width="170" height="126" fill="#38235e" stroke="#a65cff" stroke-width="5"/>
  <rect x="75" y="66" width="92" height="62" fill="#b13530"/>
  <rect x="242" y="34" width="128" height="100" fill="#51202a" stroke="#f24c4c" stroke-width="5"/>
  <rect x="270" y="60" width="72" height="44" fill="#c5a04b"/>
  <rect x="36" y="190" width="126" height="78" fill="#173f63" stroke="#4ea1ff" stroke-width="5"/>
  <rect x="62" y="208" width="78" height="42" fill="#efe7d0"/>
  <rect x="190" y="190" width="126" height="78" fill="#24472f" stroke="#40d46a" stroke-width="5"/>
  <rect x="218" y="208" width="74" height="42" fill="#7a5c35"/>
  <rect x="344" y="190" width="126" height="78" fill="#604b1f" stroke="#ffd04c" stroke-width="5"/>
  <rect x="372" y="208" width="74" height="42" fill="#6b3c84"/>
  <text x="42" y="54" fill="#f8fafc" font-size="14" font-family="Arial">噪声文字</text>
</svg>`);
}

function lowChromaHighContrastSlotFixture() {
    return Buffer.from(`
<svg width="420" height="220" xmlns="http://www.w3.org/2000/svg">
  <rect width="420" height="220" fill="#101820"/>
  <rect x="30" y="36" width="90" height="72" fill="#233026" stroke="#304438" stroke-width="4"/>
  <rect x="54" y="56" width="44" height="32" fill="#d8d2c0"/>
  <rect x="150" y="36" width="90" height="72" fill="#2f2020" stroke="#473232" stroke-width="4"/>
  <rect x="174" y="56" width="44" height="32" fill="#c8ad60"/>
  <rect x="270" y="36" width="90" height="72" fill="#20283b" stroke="#2c3a56" stroke-width="4"/>
  <rect x="294" y="56" width="44" height="32" fill="#c9c9c9"/>
</svg>`);
}

test("classifyPixelQuality maps saturated border pixels into quality buckets", () => {
    assert.equal(classifyPixelQuality(230, 230, 230), "w");
    assert.equal(classifyPixelQuality(64, 212, 106), "g");
    assert.equal(classifyPixelQuality(78, 161, 255), "b");
    assert.equal(classifyPixelQuality(166, 92, 255), "p");
    assert.equal(classifyPixelQuality(255, 208, 76), "o");
    assert.equal(classifyPixelQuality(242, 76, 76), "r");
    assert.equal(classifyPixelQuality(40, 48, 60), null);
});

test("high contrast 191 profile counts slot borders and suppresses item-color interiors", async () => {
    const input = await sharp(highContrast191SlotFixture()).png().toBuffer();
    const report = await analyzeQualityColorBlocksFromImageBuffer(input, {
        qualityProfile: "high_contrast_191",
        crop: {
            x: 0,
            y: 0,
            width: 1,
            height: 1
        }
    });

    const summary = summarizeQualityBlocks(report.blocks);

    assert.equal(report.quality_profile, "high_contrast_191");
    assert.deepEqual(summary.counts, {
        w: 0,
        g: 1,
        b: 1,
        p: 1,
        o: 1,
        r: 1
    });
    assert.equal(summary.total, 5);
    assert.ok(report.blocks.every((block) => block.detection_method !== "suppressed_object_color"));
}
);

test("high contrast 191 profile recognizes low-chroma dark slot backgrounds", async () => {
    const input = await sharp(lowChromaHighContrastSlotFixture()).png().toBuffer();
    const report = await analyzeQualityColorBlocksFromImageBuffer(input, {
        qualityProfile: "high_contrast_191",
        crop: {
            x: 0,
            y: 0,
            width: 1,
            height: 1
        }
    });

    const summary = summarizeQualityBlocks(report.blocks);

    assert.deepEqual(summary.counts, {
        w: 0,
        g: 1,
        b: 1,
        p: 0,
        o: 0,
        r: 1
    });
    assert.equal(summary.total, 3);
});

test("analyzeQualityColorBlocksFromImageBuffer counts tinted loot tiles without counting white text noise", async () => {
    const input = await sharp(tintedTileNoiseFixture()).png().toBuffer();
    const report = await analyzeQualityColorBlocksFromImageBuffer(input, {
        crop: {
            x: 0.5,
            y: 0.05,
            width: 0.45,
            height: 0.72
        }
    });

    const summary = summarizeQualityBlocks(report.blocks);

    assert.deepEqual(summary.counts, {
        w: 0,
        g: 1,
        b: 1,
        p: 1,
        o: 1,
        r: 1
    });
    assert.equal(summary.total, 5);
    assert.ok(report.blocks.every((block) => block.width >= 80 && block.height >= 64));
});

test("analyzeQualityColorBlocksFromImageBuffer counts colored loot rectangles in a right-side crop", async () => {
    const input = await sharp(svgFixture()).png().toBuffer();
    const report = await analyzeQualityColorBlocksFromImageBuffer(input, {
        crop: {
            x: 0.48,
            y: 0.04,
            width: 0.5,
            height: 0.86
        },
        minComponentPixels: 60
    });

    const summary = summarizeQualityBlocks(report.blocks);

    assert.deepEqual(summary.counts, {
        w: 1,
        g: 1,
        b: 1,
        p: 1,
        o: 1,
        r: 1
    });
    assert.equal(report.crop.width, 320);
    assert.equal(report.quality_profiles.r.label, QUALITY_COLOR_PROFILES.r.label);
    assert.equal(report.blocks.length, 6);
    assert.ok(report.blocks.every((block) => block.confidence >= 0.6));
});
