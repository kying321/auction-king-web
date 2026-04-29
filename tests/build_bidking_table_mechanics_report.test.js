const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    DEFAULT_TABLES_DIR,
    buildBidKingTableMechanicsReport,
    formatBidKingTableMechanicsMarkdown,
    parseMaybeJsonField
} = require("../scripts/build_bidking_table_mechanics_report.js");

function writeTable(tablesDir, tableName, rows) {
    fs.writeFileSync(path.join(tablesDir, `${tableName}.txt`), rows.map((row) => row.join("\t")).join("\n"), "utf8");
}

function paddedRow(length, values) {
    const row = Array.from({ length }, () => "");
    Object.entries(values).forEach(([index, value]) => {
        row[Number(index)] = String(value);
    });
    return row;
}

test("BidKing table mechanics report extracts source-owned mechanics candidates from tables", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-tables-"));
    const tablesDir = path.join(tmpRoot, "Tables");
    const hotUpdatePath = path.join(tmpRoot, "Scripts.dll.bytes");
    fs.mkdirSync(tablesDir, { recursive: true });
    try {
        writeTable(tablesDir, "Map", [
            paddedRow(17, {
                0: "101",
                3: "map_name_101",
                6: "ui_map_pic",
                7: "100000",
                8: "20000",
                9: "2101",
                10: "[1,1,1000]",
                13: "[15,20]",
                15: "101",
                16: "0"
            })
        ]);
        writeTable(tablesDir, "BidMap", [
            paddedRow(21, {
                0: "2101",
                1: "unknown parcel",
                2: "desc",
                7: "101",
                8: "[[2101,100]]",
                9: "ui_value_low",
                10: "10",
                11: "[1,1,0]",
                12: "[[1,101,1]]",
                13: "[40,40,40,40,40]",
                14: "[[1,1,10000]]",
                16: "[9999,2101,16,32]",
                17: "2",
                18: "[2000,1600,1300,1100,0]",
                19: "[102,103]",
                20: "iconmap_1"
            })
        ]);
        writeTable(tablesDir, "RankMap", [
            [
                "2101",
                "unknown parcel",
                "desc",
                "[[11,15,1000],[16,20,1000]]",
                "[[101,50],[107,200]]",
                "[[1000,2000,200],[2001,5000,100]]",
                "[10,1,100,1]"
            ]
        ]);
        writeTable(tablesDir, "RankAi", [
            paddedRow(10, {
                0: "1011",
                3: "101",
                4: "1",
                5: "[[100,400,5]]",
                6: "700",
                7: "[[101,201011]]",
                8: "[[11,15,200]]",
                9: "[[100,300,50]]"
            })
        ]);
        writeTable(tablesDir, "Drop", [
            ["1011", "quality one", "quality one", "2", "[[101,1011001,1,1,844]]"]
        ]);
        writeTable(tablesDir, "Item", [
            paddedRow(38, {
                0: "1011001",
                1: "data cable",
                2: "desc",
                6: "[101,107]",
                7: "11",
                8: "1",
                9: "160",
                16: "[[2000,50]]",
                18: "10",
                24: "icon_1011001",
                25: "iconitem101",
                26: "2",
                30: "[0,101]",
                31: "[1999999,1]",
                33: "Cube"
            })
        ]);
        writeTable(tablesDir, "Skill", [
            paddedRow(27, {
                0: "100",
                1: "scan all",
                2: "\u663e\u793a all item outlines",
                8: "0",
                9: "[0]",
                15: "0",
                16: "[1000]",
                17: "5",
                23: "[[1,1000,0]]"
            })
        ]);
        writeTable(tablesDir, "Hero", [
            paddedRow(21, {
                0: "101",
                1: "hero",
                2: "desc",
                10: "[100101]",
                17: "[101]",
                18: "101"
            })
        ]);
        ["Condition", "Sim", "BattleItem", "Constant"].forEach((tableName) => writeTable(tablesDir, tableName, []));
        fs.writeFileSync(hotUpdatePath, "GameBid C2S_34_GAME_BID Table_RankMap Auctionhouse.cs", "utf8");

        const report = buildBidKingTableMechanicsReport({ tablesDir, hotUpdateDllPath: hotUpdatePath });
        assert.equal(report.schema_version, "ak_bidking_table_mechanics_v1");
        assert.equal(report.change_class, "RESEARCH_ONLY");
        assert.equal(report.summary.auction_map_count, 1);
        assert.equal(report.summary.default_config_update_allowed, false);
        assert.equal(report.summary.core_refactor_candidate_identified, true);
        assert.equal(report.mechanics.maps[0].bidmap_count, 1);
        assert.deepEqual(report.mechanics.maps[0].item_count_range, [15, 20]);
        assert.equal(report.mechanics.rank_map_summary.by_parent_map["101"].rank_map_count, 1);
        assert.equal(report.mechanics.item_summary.collectible_item_count, 1);
        assert.ok(report.hot_update_evidence.method_markers_found.includes("GameBid"));
        assert.ok(report.hot_update_evidence.protocol_markers_found.includes("C2S_34_GAME_BID"));
        assert.match(formatBidKingTableMechanicsMarkdown(report), /Core refactor candidate identified: `true`/);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
});

test("BidKing table mechanics exposes package entry and parses list fields", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-table-mechanics"], /build_bidking_table_mechanics_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_table_mechanics_report\.js/);
    assert.deepEqual(parseMaybeJsonField("[[1,2,3]]"), [[1, 2, 3]]);
});

test("local BidKing extracted tables remain research-only when available", () => {
    if (!fs.existsSync(DEFAULT_TABLES_DIR)) return;
    const report = buildBidKingTableMechanicsReport();
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.authority_adoption_allowed, false);
    assert.equal(report.summary.reverse_engineering_source_allowed, true);
    assert.ok(report.summary.key_table_count >= 10);
    assert.ok(report.summary.auction_map_count >= 5);
    assert.ok(report.summary.hot_update_method_marker_count >= 10);
    assert.ok(report.mechanics.item_summary.collectible_item_count > 500);
});
