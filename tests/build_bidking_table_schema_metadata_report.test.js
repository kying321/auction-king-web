const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_ASSEMBLY_PATH,
    buildBidKingTableSchemaMetadataReport,
    decodeFieldSignature,
    decodeMethodSignature,
    formatBidKingTableSchemaMetadataMarkdown,
    readCompressedUInt
} = require("../scripts/build_bidking_table_schema_metadata_report.js");

function primitiveResolver() {
    return "ResolvedType";
}

test("CLR metadata helpers decode compressed integers and simple signatures", () => {
    assert.deepEqual(readCompressedUInt(Buffer.from([0x7f]), 0), { value: 127, nextOffset: 1 });
    assert.deepEqual(readCompressedUInt(Buffer.from([0x80, 0x80]), 0), { value: 128, nextOffset: 2 });
    assert.equal(decodeFieldSignature(Buffer.from([0x06, 0x08]), primitiveResolver), "int");
    assert.deepEqual(decodeMethodSignature(Buffer.from([0x00, 0x01, 0x08, 0x0e]), primitiveResolver), {
        return_type: "int",
        parameters: ["string"]
    });
});

test("package exposes BidKing schema metadata entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-table-schema-metadata"], /build_bidking_table_schema_metadata_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_table_schema_metadata_report\.js/);
});

test("local BidKing schema metadata parses Table classes when assembly is available", () => {
    if (!fs.existsSync(DEFAULT_ASSEMBLY_PATH)) return;
    const report = buildBidKingTableSchemaMetadataReport();
    assert.equal(report.schema_version, "ak_bidking_table_schema_metadata_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.authority_adoption_allowed, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.reverse_engineering_source_allowed, true);
    assert.equal(report.summary.target_table_type_count, 12);
    assert.equal(report.summary.target_table_types_missing.length, 0);
    assert.ok(report.summary.target_table_types_with_schema_or_localized_column_match >= 10);

    const itemSchema = report.table_type_schemas.find((entry) => entry.type_name === "Table_Item");
    assert.ok(itemSchema);
    assert.equal(itemSchema.schema_member_count_plus_two_matches_table_columns, true);
    assert.ok(itemSchema.schema_members.some((member) => member.name === "base_value" && member.type === "int"));
    assert.match(formatBidKingTableSchemaMetadataMarkdown(report), /Schema handoff candidate: `true`/);
});
