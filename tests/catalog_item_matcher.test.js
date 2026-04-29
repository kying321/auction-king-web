const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    buildCatalogItemIndex,
    matchCatalogItem,
    matchCatalogItems,
    normalizeCatalogMatchName,
    normalizeQualityCode
} = require("../src/core/catalog_item_matcher.js");

function fixtureBatches() {
    return [
        {
            batch_id: "purple-fixture",
            quality: "p",
            items: [
                { name: "加特林重机枪", value: 31688, cells: 8, name_confidence: "high" },
                { name: "M249轻机枪", value: 12584, cells: 6, name_confidence: "high" },
                { name: "全地形卡丁车", value: 22064, cells: 9, name_confidence: "high" }
            ]
        },
        {
            batch_id: "red-fixture",
            quality: "r",
            items: [
                { name: "金陵折扇", value: 19371213, cells: 4, name_confidence: "high" },
                { name: "永乐大典残本一", value: 1491800, cells: 6, name_confidence: "high" },
                { name: "永乐大典残本二", value: 1553900, cells: 6, name_confidence: "high" }
            ]
        }
    ];
}

test("normalization keeps Chinese and ASCII signal while removing OCR punctuation noise", () => {
    assert.equal(normalizeCatalogMatchName("《加 特林-重机枪》"), "加特林重机枪");
    assert.equal(normalizeCatalogMatchName("GPU 计算柜"), "gpu计算柜");
    assert.equal(normalizeQualityCode("紫色"), "p");
    assert.equal(normalizeQualityCode("red"), "r");
});

test("exact name and matching quality is accepted with full audit fields", () => {
    const index = buildCatalogItemIndex(fixtureBatches());
    const result = matchCatalogItem({ name: "金陵折扇", quality: "红" }, index);

    assert.equal(result.status, "accepted");
    assert.equal(result.accepted, true);
    assert.equal(result.match.name, "金陵折扇");
    assert.equal(result.match.quality, "r");
    assert.equal(result.scores.name_score, 1);
    assert.equal(result.scores.quality_score, 1);
    assert.equal(result.blockers.length, 0);
});

test("same-quality OCR typo can be accepted when combined score clears threshold", () => {
    const index = buildCatalogItemIndex(fixtureBatches());
    const result = matchCatalogItem({ name: "加特林机枪", color: "purple" }, index, {
        acceptThreshold: 0.86,
        minNameScore: 0.78
    });

    assert.equal(result.status, "accepted");
    assert.equal(result.match.name, "加特林重机枪");
    assert.equal(result.match.quality, "p");
    assert.ok(result.scores.name_score >= 0.78);
    assert.ok(result.scores.combined_score >= 0.86);
});

test("low-signal OCR gibberish is blocked instead of creating a manual review candidate", () => {
    const index = buildCatalogItemIndex(fixtureBatches());
    const result = matchCatalogItem({ name: "BiBYEte", quality: "w" }, index);

    assert.equal(result.accepted, false);
    assert.equal(result.status, "blocked");
    assert.ok(result.blockers.includes("candidate_low_signal"));
});

test("strong name match with wrong quality color is blocked instead of accepted", () => {
    const index = buildCatalogItemIndex(fixtureBatches());
    const result = matchCatalogItem({ name: "金陵折扇", quality: "purple" }, index);

    assert.equal(result.accepted, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.match.name, "金陵折扇");
    assert.equal(result.match.quality, "r");
    assert.ok(result.blockers.includes("quality_mismatch"));
});

test("near-tied catalog names stay in manual review even when the top score is high", () => {
    const index = buildCatalogItemIndex(fixtureBatches());
    const result = matchCatalogItem({ name: "永乐大典残本", quality: "r" }, index, {
        acceptThreshold: 0.86,
        minNameScore: 0.78,
        minScoreGap: 0.08
    });

    assert.equal(result.accepted, false);
    assert.equal(result.status, "needs_manual_review");
    assert.equal(result.candidates.length, 2);
    assert.deepEqual(
        result.candidates.map((candidate) => candidate.name).sort(),
        ["永乐大典残本一", "永乐大典残本二"]
    );
    assert.ok(result.blockers.includes("ambiguous_match_gap"));
});

test("batch matching keeps rejected entries visible for review queues", () => {
    const index = buildCatalogItemIndex(fixtureBatches());
    const results = matchCatalogItems([
        { id: "ok", name: "全地形卡丁车", quality: "紫" },
        { id: "bad", name: "不存在物品", quality: "r" }
    ], index);

    assert.equal(results.length, 2);
    assert.equal(results[0].id, "ok");
    assert.equal(results[0].accepted, true);
    assert.equal(results[1].id, "bad");
    assert.equal(results[1].accepted, false);
    assert.ok(results[1].blockers.includes("name_score_below_minimum"));
});

test("real manual catalog index can fuzzy match a known OCR-like red item", () => {
    const manualDir = path.join(__dirname, "..", "data", "manual_catalog");
    const batches = fs.readdirSync(manualDir)
        .filter((entry) => entry.endsWith(".json") && entry.includes("_quality_items_batch_"))
        .sort()
        .map((entry) => JSON.parse(fs.readFileSync(path.join(manualDir, entry), "utf8")));
    const index = buildCatalogItemIndex(batches);
    const result = matchCatalogItem({ name: "永乐大典残本1", quality: "红色" }, index, {
        acceptThreshold: 0.84,
        minNameScore: 0.76,
        minScoreGap: 0.02
    });

    assert.equal(result.accepted, true);
    assert.equal(result.match.name, "永乐大典残本一");
    assert.equal(result.match.quality, "r");
    assert.equal(result.match.value, 1491800);
});
