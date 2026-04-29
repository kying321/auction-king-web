const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    DEFAULT_BIDKING_PATH,
    DEFAULT_BIDKING_ZIP_PATH,
    buildBidKingDecompileAuditReport,
    formatBidKingDecompileAuditMarkdown,
    parseUnzipListOutput
} = require("../scripts/build_bidking_decompile_audit_report.js");

function writeMinimalPe(filePath) {
    const buffer = Buffer.alloc(0x400);
    buffer.write("MZ", 0, "ascii");
    buffer.writeUInt32LE(0x80, 0x3c);
    buffer.write("PE\0\0", 0x80, "ascii");
    const fileHeader = 0x84;
    buffer.writeUInt16LE(0x8664, fileHeader);
    buffer.writeUInt16LE(2, fileHeader + 2);
    buffer.writeUInt32LE(1780000000, fileHeader + 4);
    buffer.writeUInt16LE(0xf0, fileHeader + 16);
    buffer.writeUInt16LE(0x22, fileHeader + 18);
    const optionalHeader = fileHeader + 20;
    buffer.writeUInt16LE(0x20b, optionalHeader);
    buffer.writeUInt32LE(0x1260, optionalHeader + 16);
    buffer.writeBigUInt64LE(0x140000000n, optionalHeader + 24);
    buffer.writeUInt32LE(0xa5000, optionalHeader + 56);
    buffer.writeUInt16LE(2, optionalHeader + 68);
    const sectionTable = optionalHeader + 0xf0;
    buffer.write(".text\0\0\0", sectionTable, "ascii");
    buffer.writeUInt32LE(0xa140, sectionTable + 8);
    buffer.writeUInt32LE(0x1000, sectionTable + 12);
    buffer.writeUInt32LE(0xa200, sectionTable + 16);
    buffer.writeUInt32LE(0x400, sectionTable + 20);
    buffer.writeUInt32LE(0x60000020, sectionTable + 36);
    buffer.write(".rsrc\0\0\0", sectionTable + 40, "ascii");
    buffer.writeUInt32LE(0x100, sectionTable + 48);
    buffer.writeUInt32LE(0x19000, sectionTable + 52);
    buffer.writeUInt32LE(0x200, sectionTable + 56);
    buffer.writeUInt32LE(0x600, sectionTable + 60);
    buffer.writeUInt32LE(0x40000040, sectionTable + 76);
    fs.writeFileSync(filePath, buffer);
}

test("BidKing decompile audit treats incomplete Unity player packages as research-only evidence", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-audit-"));
    try {
        const il2cppDir = path.join(tmpRoot, "BidKing_BackUpThisFolder_ButDontShipItWithYourGame", "il2cppOutput");
        fs.mkdirSync(il2cppDir, { recursive: true });
        writeMinimalPe(path.join(tmpRoot, "BidKing.exe"));
        fs.writeFileSync(path.join(tmpRoot, "baselib.dll"), "dll placeholder");
        fs.writeFileSync(path.join(il2cppDir, "Assembly-CSharp.cpp"), [
            "// AuctionManager",
            "// ProGifManager",
            "void example() { /* auction bid price value item inventory */ }"
        ].join("\n"));
        fs.writeFileSync(path.join(il2cppDir, "analytics.json"), JSON.stringify({
            DataTable: {
                option_convert_to_cpp: true,
                option_compile_cpp: false
            }
        }));

        const report = buildBidKingDecompileAuditReport({ bidkingPath: tmpRoot });
        assert.equal(report.schema_version, "ak_bidking_decompile_audit_v1");
        assert.equal(report.change_class, "RESEARCH_ONLY");
        assert.equal(report.summary.default_config_update_allowed, false);
        assert.equal(report.summary.core_refactor_recommended_now, false);
        assert.equal(report.summary.mechanics_recovery_status, "partial_reverse_engineering_only");
        assert.deepEqual(report.summary.missing_required_for_full_recovery, [
            "missing_BidKing_Data",
            "missing_global_metadata_dat",
            "missing_GameAssembly_dll"
        ]);
        assert.equal(report.inventory.pe_header_summary.format, "PE32+");
        assert.deepEqual(report.inventory.pe_header_summary.sections.map((section) => section.name), [".text", ".rsrc"]);
        assert.equal(report.il2cpp_type_summary.gameplay_type_count, 1);
        assert.match(formatBidKingDecompileAuditMarkdown(report), /Core refactor recommended now: `false`/);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
});

test("package exposes BidKing decompile audit entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-decompile-audit"], /build_bidking_decompile_audit_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_decompile_audit_report\.js/);
});

test("BidKing decompile audit parses complete zip inventory evidence without full extraction", () => {
    const entries = parseUnzipListOutput([
        "Archive:  BidKing.zip",
        "  Length      Date    Time    Name",
        "---------  ---------- -----   ----",
        "        0  04-25-2026 17:44   BidKing/BidKing_Data/",
        "    6144  04-18-2026 17:11   BidKing/BidKing_Data/StreamingAssets/dll/Assembly-CSharp.dll.bytes",
        " 2642944  04-25-2026 17:43   BidKing/BidKing_Data/StreamingAssets/dll/Scripts.dll.bytes",
        "   40239  04-21-2026 13:43   BidKing/BidKing_Data/StreamingAssets/Tables/BidMap.txt",
        "     835  04-19-2026 08:55   BidKing/BidKing_Data/StreamingAssets/Tables/Map.txt",
        " 6947184  04-25-2026 17:43   BidKing/BidKing_Data/il2cpp_data/Metadata/global-metadata.dat",
        "29024768  04-25-2026 17:43   BidKing/GameAssembly.dll",
        "29377048  04-18-2026 17:10   BidKing/UnityPlayer.dll",
        "   283648  04-25-2026 17:43   BidKing/BidKing_BackUpThisFolder_ButDontShipItWithYourGame/Managed/Assembly-CSharp.dll",
        "---------                     -------",
        "0 files"
    ].join("\n"));

    assert.equal(entries.length, 9);
    assert.equal(entries[0].is_directory, true);
    assert.equal(entries.find((entry) => entry.name.endsWith("Scripts.dll.bytes")).size, 2642944);
});

test("local BidKing audit records the current package as insufficient when available", () => {
    if (!fs.existsSync(DEFAULT_BIDKING_PATH)) return;
    const report = buildBidKingDecompileAuditReport({ bidkingPath: DEFAULT_BIDKING_PATH });
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.core_refactor_recommended_now, false);
    assert.equal(report.inventory.detected_files.data_dir, null);
    assert.equal(report.inventory.detected_files.gameassembly, null);
    assert.equal(report.inventory.detected_files.global_metadata, null);
    assert.equal(report.inventory.pe_header_summary.format, "PE32+");
    assert.ok(report.summary.missing_required_for_full_recovery.includes("missing_BidKing_Data"));
});

test("local BidKing.zip audit records complete package intake when available", () => {
    if (!fs.existsSync(DEFAULT_BIDKING_ZIP_PATH)) return;
    const report = buildBidKingDecompileAuditReport({ bidkingPath: DEFAULT_BIDKING_ZIP_PATH });
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.core_refactor_recommended_now, false);
    assert.equal(report.inventory.source_type, "zip");
    assert.equal(report.inventory.detected_files.data_dir, "BidKing_Data");
    assert.equal(report.inventory.detected_files.gameassembly, "GameAssembly.dll");
    assert.ok(/global-metadata\.dat$/i.test(report.inventory.detected_files.global_metadata));
    assert.ok(report.summary.streaming_table_file_count >= 10);
    assert.ok(report.summary.hot_update_assembly_count >= 2);
    assert.equal(report.summary.mechanics_recovery_status, "complete_package_table_and_hotupdate_evidence_ready");
    assert.equal(report.summary.reverse_engineering_source_allowed, true);
    assert.match(formatBidKingDecompileAuditMarkdown(report), /Source type: `zip`/);
});
