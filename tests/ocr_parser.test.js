const test = require("node:test");
const assert = require("node:assert/strict");
const {
    parseBattleSnapshotText,
    parseSettlementText,
    parseSettlementItemCandidates,
    setAuctionKingOcrConfig
} = require("../src/core/ocr_parser.js");

test("battle OCR parser extracts the new main-chain fields from normalized review text", () => {
    const parsed = parseBattleSnapshotText(`
        总件数：24
        场上蓝色件数：11
        橙色均格：1.66
        场上橙色件数：3
        场上紫色件数：3
        绿白总格数：16
        绿白均格：2.30
        紫色平均格数：4.75
        总仓储空间：40
        绿+白总件数：7
        场上白色件数：9
        出价：18800
    `);

    assert.deepEqual(parsed.fields, {
        total_items: 24,
        known_b: 11,
        avg_o: "1.66",
        known_o: 3,
        known_p: 3,
        wg_cells_total: 16,
        avg_wg: "2.30",
        avg_p: "4.75",
        total_storage_cells: 40,
        known_sum_wg: 7,
        known_w: 9,
        bid_price: 18800
    });
    assert.equal(parsed.warnings.length, 0);
});

test("battle OCR parser preserves average display text so trailing zeros are not lost", () => {
    const parsed = parseBattleSnapshotText(`
        橙色均格：0.30
        绿白均格：4.70
        蓝色均格：1.50
    `);

    assert.equal(parsed.fields.avg_o, "0.30");
    assert.equal(parsed.fields.avg_wg, "4.70");
    assert.equal(parsed.fields.avg_b, "1.50");
});

test("battle OCR parser extracts system per-cell value hints with type count scope", () => {
    const parsed = parseBattleSnapshotText(`
        总件数：34
        本场拍卖，有2种藏品类型占位每格的均价约8735.34
        出价：423500
    `);

    assert.equal(parsed.fields.total_items, 34);
    assert.equal(parsed.fields.system_avg_value_type_count, 2);
    assert.equal(parsed.fields.system_avg_value_per_cell, 8735.34);
    assert.equal(parsed.fields.bid_price, 423500);
});

test("battle OCR parser accepts battle alias and replacement overrides without parser code changes", () => {
    const parsed = parseBattleSnapshotText(
        `
            总藏品：24
            藍件：11
            橙均挌：0.30
            倉儲總格數：40
        `,
        {
            ocrConfig: {
                battle_text_replacements: {
                    "橙均挌": "橙均格",
                    "倉儲總格數": "总仓储格数"
                },
                battle_field_aliases: {
                    total_items: ["总藏品"],
                    known_b: ["藍件"],
                    total_storage_cells: ["总仓储格数"]
                }
            }
        }
    );

    assert.equal(parsed.fields.total_items, 24);
    assert.equal(parsed.fields.known_b, 11);
    assert.equal(parsed.fields.avg_o, "0.30");
    assert.equal(parsed.fields.total_storage_cells, 40);
});

test("battle OCR parser can use the active runtime battle OCR config override", () => {
    setAuctionKingOcrConfig({
        battle_field_aliases: {
            total_items: ["总藏品"]
        }
    });

    const parsed = parseBattleSnapshotText(`总藏品：24`);

    assert.equal(parsed.fields.total_items, 24);

    setAuctionKingOcrConfig(null);
});

test("settlement OCR parser extracts bid, loot value, and profit", () => {
    const parsed = parseSettlementText(`
        最终竞拍价：18,888
        战利品价格：26,666
        利润：7,778
    `);

    assert.deepEqual(parsed.draft, {
        bid_price: 18888,
        loot_value: 26666,
        profit: 7778
    });
    assert.equal(parsed.warnings.length, 0);
});

test("settlement OCR parser extracts item candidates from mixed Chinese lines", () => {
    const parsed = parseSettlementItemCandidates(`
        紫 武器 8格 12000
        橙 医疗 4格 16000
        蓝 数码 2格 3000
        最终竞拍价：18888
    `);

    assert.deepEqual(parsed.items, [
        { quality: "p", category: "weapon", cells: 8, value: 12000 },
        { quality: "o", category: "medical", cells: 4, value: 16000 },
        { quality: "b", category: "digital", cells: 2, value: 3000 }
    ]);
    assert.equal(parsed.matchedItemCount, 3);
});

test("settlement OCR parser supports compact x1 and w-unit formats", () => {
    const parsed = parseSettlementItemCandidates(`
        紫色武器x1 8格 1.2w
        橙色医疗x1 16格 2.6万
    `);

    assert.deepEqual(parsed.items, [
        { quality: "p", category: "weapon", cells: 8, value: 12000 },
        { quality: "o", category: "medical", cells: 16, value: 26000 }
    ]);
    assert.equal(parsed.matchedItemCount, 2);
});

test("settlement OCR parser tolerates common OCR typo aliases in item lines", () => {
    const parsed = parseSettlementItemCandidates(`
        紫 武噐 8格 1.2w
        橙 医疔 4格 16000
        蓝 数玛 2格 3000
    `);

    assert.deepEqual(parsed.items, [
        { quality: "p", category: "weapon", cells: 8, value: 12000 },
        { quality: "o", category: "medical", cells: 4, value: 16000 },
        { quality: "b", category: "digital", cells: 2, value: 3000 }
    ]);
    assert.equal(parsed.matchedItemCount, 3);
});

test("settlement OCR parser accepts ad-hoc alias overrides without parser code changes", () => {
    const parsed = parseSettlementItemCandidates(
        `
            紫 医药 8格 1.2w
            红 兵器 4格 2.4w
        `,
        {
            ocrConfig: {
                settlement_item_category_aliases: {
                    medical: ["医药"],
                    weapon: ["兵器"]
                }
            }
        }
    );

    assert.deepEqual(parsed.items, [
        { quality: "p", category: "medical", cells: 8, value: 12000 },
        { quality: "r", category: "weapon", cells: 4, value: 24000 }
    ]);
});

test("settlement OCR parser can use the active runtime OCR config override", () => {
    setAuctionKingOcrConfig({
        settlement_item_replacements: {
            武哭: "武器"
        }
    });

    const parsed = parseSettlementItemCandidates(`紫 武哭 8格 1.2w`);

    assert.deepEqual(parsed.items, [
        { quality: "p", category: "weapon", cells: 8, value: 12000 }
    ]);

    setAuctionKingOcrConfig(null);
});
