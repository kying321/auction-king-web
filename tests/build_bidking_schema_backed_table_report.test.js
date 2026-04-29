const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    DEFAULT_TABLES_DIR,
    DEFAULT_SCHEMA_METADATA_REPORT_PATH,
    buildBidKingSchemaBackedTableReport,
    formatBidKingSchemaBackedTableMarkdown,
    mapRowWithSchema,
    parseBySchemaType
} = require("../scripts/build_bidking_schema_backed_table_report.js");

function writeTable(tablesDir, tableName, rows) {
    fs.writeFileSync(path.join(tablesDir, tableName), rows.map((row) => row.join("\t")).join("\n"), "utf8");
}

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("schema-backed row mapping keeps localized columns separate from schema fields", () => {
    const schemaEntry = {
        schema_member_count_plus_two_matches_table_columns: true,
        schema_member_count_matches_table_columns: false,
        schema_members: [
            { name: "id", type: "int" },
            { name: "name_key", type: "string" },
            { name: "count_range", type: "int[]" },
            { name: "enabled", type: "bool" }
        ]
    };
    const record = mapRowWithSchema(["101", "本地名", "本地描述", "name_key_101", "[15,20]", "1"], schemaEntry, 0);
    assert.equal(record.id, 101);
    assert.equal(record.__meta.localized_name, "本地名");
    assert.equal(record.__meta.localized_description, "本地描述");
    assert.equal(record.name_key, "name_key_101");
    assert.deepEqual(record.count_range, [15, 20]);
    assert.equal(record.enabled, true);
    assert.deepEqual(parseBySchemaType("[[1,2]]", "int[][]"), [[1, 2]]);
});

test("schema-backed table report builds named tables from schema metadata", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-schema-backed-"));
    const tablesDir = path.join(tmpRoot, "Tables");
    const schemaPath = path.join(tmpRoot, "schema.json");
    fs.mkdirSync(tablesDir, { recursive: true });
    try {
        writeJson(schemaPath, {
            table_type_schemas: [
                {
                    type_name: "Table_Map",
                    table_file: "Map.txt",
                    schema_member_count_plus_two_matches_table_columns: true,
                    schema_member_count_matches_table_columns: false,
                    schema_members: [
                        { name: "id", type: "int" },
                        { name: "entrust_bidmap", type: "int" },
                        { name: "entrust_num", type: "int[]" }
                    ]
                },
                {
                    type_name: "Table_Constant",
                    table_file: "Constant.txt",
                    schema_member_count_plus_two_matches_table_columns: false,
                    schema_member_count_matches_table_columns: true,
                    schema_members: [
                        { name: "Id", type: "string" },
                        { name: "Name", type: "string" },
                        { name: "Type", type: "string" },
                        { name: "Value", type: "int[]" }
                    ]
                }
            ]
        });
        writeTable(tablesDir, "Map.txt", [["101", "未知", "描述", "2101", "[15,20]"]]);
        writeTable(tablesDir, "Constant.txt", [["init_item_quality", "道具品质", "int[]", "[1,2,3,4,5,6]"]]);

        const report = buildBidKingSchemaBackedTableReport({ tablesDir, schemaMetadataReportPath: schemaPath });
        assert.equal(report.schema_version, "ak_bidking_schema_backed_tables_v1");
        assert.equal(report.change_class, "RESEARCH_ONLY");
        assert.equal(report.summary.default_config_update_allowed, false);
        assert.equal(report.summary.named_table_count, 2);
        assert.equal(report.named_tables.Table_Map.records[0].entrust_bidmap, 2101);
        assert.deepEqual(report.named_tables.Table_Constant.records[0].Value, [1, 2, 3, 4, 5, 6]);
        assert.match(formatBidKingSchemaBackedTableMarkdown(report), /schema-backed and named/);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
});

test("package exposes BidKing schema-backed table entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-schema-backed-tables"], /build_bidking_schema_backed_table_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_schema_backed_table_report\.js/);
});

test("local BidKing schema-backed table report builds from current artifacts when available", () => {
    if (!fs.existsSync(DEFAULT_SCHEMA_METADATA_REPORT_PATH)) return;
    if (!fs.existsSync(DEFAULT_TABLES_DIR)) return;
    const report = buildBidKingSchemaBackedTableReport();
    assert.equal(report.summary.authority_adoption_allowed, false);
    assert.equal(report.summary.reverse_engineering_source_allowed, true);
    assert.equal(report.summary.named_table_count, 12);
    assert.equal(report.summary.auction_map_count, 5);
    assert.ok(report.summary.collectible_item_count > 500);
    assert.ok(report.schema_backed_mechanics.schema_field_corrections.some((entry) => (
        entry.previous_alias === "RankMap.value_distribution"
        && entry.schema_backed_field === "Table_RankMap.min_bid_range"
    )));
});
