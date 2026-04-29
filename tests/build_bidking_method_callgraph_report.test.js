const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    DEFAULT_METHOD_METADATA_REPORT_PATH,
    buildBidKingMethodCallgraphReport,
    classifyDomain,
    formatBidKingMethodCallgraphMarkdown
} = require("../scripts/build_bidking_method_callgraph_report.js");

function writeJson(filePath, payload) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("callgraph domain classifier marks protocol, table, and random calls", () => {
    assert.deepEqual(classifyDomain("NetworkMgr.Send"), ["network_protocol"]);
    assert.deepEqual(classifyDomain("Table_Drop.getBygroup_id"), ["table_lookup"]);
    assert.ok(classifyDomain("GameServerDemo.Utils.RandomWeightIndex").includes("random_or_weight"));
});

test("method callgraph report builds flow highlights from method metadata", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-callgraph-"));
    const metadataPath = path.join(tmpRoot, "method-metadata.json");
    try {
        writeJson(metadataPath, {
            target_methods: [
                {
                    family: "bid_flow",
                    relation: "primary",
                    declaring_type: "PlayerManager",
                    method_name: "GameBid",
                    method_rid: 1,
                    relation_marker: "GameBid",
                    signature: { return_type: "Task<bool>", parameters: ["int"] },
                    rva_hex: "0x01",
                    method_body: {
                        code_size: 10,
                        call_references: [
                            { il_offset: 0, opcode: "0x28", token: "0x0a000001", table_name: "MemberRef", resolved_kind: "member_ref", resolved_full_name: "Protodata.C2S_34_game_bid..ctor" },
                            { il_offset: 1, opcode: "0x6f", token: "0x0a000002", table_name: "MemberRef", resolved_kind: "member_ref", resolved_full_name: "NetworkMgr.Send" }
                        ]
                    }
                },
                {
                    family: "drop_and_randomness",
                    relation: "primary",
                    declaring_type: "GameServerDemo.Utils",
                    method_name: "DoDrop",
                    method_rid: 2,
                    relation_marker: "DoDrop",
                    signature: { return_type: "Dictionary<int,int>", parameters: ["int", "int"] },
                    rva_hex: "0x02",
                    method_body: {
                        code_size: 20,
                        call_references: [
                            { il_offset: 0, opcode: "0x28", token: "0x0a000003", table_name: "MemberRef", resolved_kind: "member_ref", resolved_full_name: "Table_Drop.getBygroup_id" },
                            { il_offset: 1, opcode: "0x28", token: "0x06000004", table_name: "MethodDef", resolved_kind: "method_def", resolved_full_name: "GameServerDemo.Utils.RandomWeightIndex" }
                        ]
                    }
                }
            ],
            related_compiler_methods: []
        });
        const report = buildBidKingMethodCallgraphReport({ methodMetadataReportPath: metadataPath });
        assert.equal(report.schema_version, "ak_bidking_method_callgraph_v1");
        assert.equal(report.summary.authority_adoption_allowed, false);
        assert.equal(report.summary.edge_count, 4);
        assert.equal(report.flow_highlights.bid_flow.methods[0].request_message, "Protodata.C2S_34_game_bid..ctor");
        assert.equal(report.flow_highlights.drop_flow.table_lookup, "Table_Drop.getBygroup_id");
        assert.match(formatBidKingMethodCallgraphMarkdown(report), /Bid Flow/);
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
});

test("package exposes BidKing method callgraph entry", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    assert.match(packageJson.scripts["build:bidking-method-callgraph"], /build_bidking_method_callgraph_report\.js/);
    assert.match(packageJson.scripts["check:js"], /build_bidking_method_callgraph_report\.js/);
});

test("local BidKing method callgraph builds from method metadata artifact when available", () => {
    if (!fs.existsSync(DEFAULT_METHOD_METADATA_REPORT_PATH)) return;
    const report = buildBidKingMethodCallgraphReport();
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.default_config_update_allowed, false);
    assert.ok(report.summary.method_node_count >= 50);
    assert.ok(report.summary.edge_count >= 500);
    assert.equal(report.flow_highlights.drop_flow.table_lookup, "Table_Drop.getBygroup_id");
    assert.ok(report.flow_highlights.bid_flow.methods.some((entry) => entry.request_message === "Protodata.C2S_34_game_bid..ctor"));
    assert.ok(report.flow_highlights.skill_flow.overloads.some((entry) => entry.table_calls.includes("Table_Item.getByid")));
});
