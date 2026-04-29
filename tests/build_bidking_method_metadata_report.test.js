const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_ASSEMBLY_PATH,
    buildBidKingMethodMetadataReport,
    classifyCompilerGeneratedKind,
    formatBidKingMethodMetadataMarkdown,
    parseIlInstructions,
    parseIlMethodReferences
} = require("../scripts/build_bidking_method_metadata_report.js");

test("IL scanner extracts method metadata tokens from call opcodes", () => {
    const il = Buffer.from([
        0x02,
        0x28, 0x01, 0x00, 0x00, 0x06,
        0x6f, 0x02, 0x00, 0x00, 0x0a,
        0x2a
    ]);
    const refs = parseIlMethodReferences(il, (token) => ({
        token: `0x${token.toString(16).padStart(8, "0")}`
    }));
    assert.deepEqual(refs.map((entry) => entry.il_offset), [1, 6]);
    assert.deepEqual(refs.map((entry) => entry.opcode), ["0x28", "0x6f"]);
    assert.deepEqual(refs.map((entry) => entry.token), ["0x06000001", "0x0a000002"]);
});

test("IL instruction scanner decodes branch, integer, and token operands", () => {
    const il = Buffer.from([
        0x16,
        0x2d, 0x02,
        0x1f, 0xfb,
        0x28, 0x01, 0x00, 0x00, 0x06,
        0x2a
    ]);
    const instructions = parseIlInstructions(il, (token) => ({
        token: `0x${token.toString(16).padStart(8, "0")}`
    }));
    assert.deepEqual(instructions.map((entry) => entry.opcode_name), ["ldc.i4.0", "brtrue.s", "ldc.i4.s", "call", "ret"]);
    assert.equal(instructions[1].branch_target_offset, 5);
    assert.equal(instructions[2].operand_value, -5);
    assert.equal(instructions[3].token, "0x06000001");
});

test("compiler-generated method kind classifier separates closures and async MoveNext", () => {
    assert.equal(classifyCompilerGeneratedKind("<InitAuctionItems>d__15", "MoveNext"), "async_state_machine_move_next");
    assert.equal(classifyCompilerGeneratedKind("<>c__DisplayClass33_0", "<GameBid>b__0"), "closure_display_class");
    assert.equal(classifyCompilerGeneratedKind("PlayerManager", "<GameBid>b__0"), "lambda_method");
});

test("package exposes BidKing method metadata entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-method-metadata"], /build_bidking_method_metadata_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_method_metadata_report\.js/);
});

test("local BidKing method metadata report indexes hot-update targets when assembly is available", () => {
    if (!fs.existsSync(DEFAULT_ASSEMBLY_PATH)) return;
    const report = buildBidKingMethodMetadataReport();
    assert.equal(report.schema_version, "ak_bidking_method_metadata_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.authority_adoption_allowed, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.equal(report.summary.primary_method_markers_missing.length, 0);
    assert.ok(report.summary.primary_method_count >= 18);
    assert.ok(report.summary.related_compiler_method_count >= 8);
    assert.ok(report.summary.protocol_marker_count >= 8);

    const gameBid = report.target_methods.find((entry) => (
        entry.declaring_type === "PlayerManager" && entry.method_name === "GameBid"
    ));
    assert.ok(gameBid);
    assert.deepEqual(gameBid.signature.parameters, ["int"]);
    assert.equal(gameBid.method_body.parse_status, "parsed");
    assert.ok(gameBid.method_body.code_size > 0);

    const skillEffectOverloads = report.target_methods.filter((entry) => entry.method_name === "DealSkillEffect");
    assert.ok(skillEffectOverloads.length >= 2);
    assert.match(formatBidKingMethodMetadataMarkdown(report), /Primary Methods/);
});
