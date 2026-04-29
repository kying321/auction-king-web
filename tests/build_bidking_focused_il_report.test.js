const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_ASSEMBLY_PATH,
    buildBidKingFocusedIlReport,
    formatBidKingFocusedIlMarkdown
} = require("../scripts/build_bidking_focused_il_report.js");

test("package exposes BidKing focused IL entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-focused-il"], /build_bidking_focused_il_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_focused_il_report\.js/);
});

test("local BidKing focused IL report disassembles priority mechanics when assembly is available", () => {
    if (!fs.existsSync(DEFAULT_ASSEMBLY_PATH)) return;
    const report = buildBidKingFocusedIlReport();
    assert.equal(report.schema_version, "ak_bidking_focused_il_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.authority_adoption_allowed, false);
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.ok(report.summary.focused_method_count >= 12);
    assert.ok(report.summary.signal_instruction_count > 100);

    const doDrop = report.focused_methods.find((entry) => (
        entry.declaring_type === "GameServerDemo.Utils" && entry.method_name === "DoDrop"
    ));
    assert.ok(doDrop);
    assert.ok(doDrop.signal_instructions.some((instruction) => instruction.resolved_full_name === "Table_Drop.getBygroup_id"));
    assert.ok(doDrop.signal_instructions.some((instruction) => /RandomWeightIndex/.test(instruction.resolved_full_name || "")));
    assert.ok(report.flow_implications.bid_wrappers.some((entry) => (
        entry.method === "PlayerManager.GameBid"
        && entry.request_messages.includes("Protodata.C2S_34_game_bid..ctor")
    )));
    assert.match(formatBidKingFocusedIlMarkdown(report), /Focused Methods/);
});
