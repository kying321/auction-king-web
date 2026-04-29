const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_METHOD_METADATA_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-method-metadata-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-method-callgraph-report.json"
);

const DOMAIN_PATTERNS = {
    network_protocol: /NetworkMgr\.Send|Protodata\.C2S_|Protodata\.S2C_/,
    table_lookup: /Table_[A-Za-z0-9_]+\.(getBy|get_)/,
    random_or_weight: /Random|Weight|Probability|GetValues/,
    skill_resolution: /Skill|BattleGridItemData|GridItemData/,
    auction_item_or_price: /Auction|Price|ItemPrice|InitAuctionItems|RoomMVPData/,
    async_task: /Task|AsyncTaskMethodBuilder|TaskUtil/
};

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        methodMetadataReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_METHOD_METADATA_REPORT_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values) {
    return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== "")));
}

function methodNodeId(entry) {
    return `${entry.declaring_type}.${entry.method_name}#${entry.method_rid}`;
}

function classifyDomain(referenceName) {
    return Object.entries(DOMAIN_PATTERNS)
        .filter(([, pattern]) => pattern.test(referenceName))
        .map(([domain]) => domain);
}

function buildEdgesForMethod(entry) {
    return (entry.method_body && entry.method_body.call_references ? entry.method_body.call_references : [])
        .map((reference) => {
            const target = reference.resolved_full_name || reference.token;
            return {
                source_node_id: methodNodeId(entry),
                source_family: entry.family,
                source_relation: entry.relation,
                source_method: `${entry.declaring_type}.${entry.method_name}`,
                il_offset: reference.il_offset,
                opcode: reference.opcode,
                token: reference.token,
                token_table: reference.table_name || null,
                resolved_kind: reference.resolved_kind || null,
                target,
                domains: classifyDomain(target)
            };
        });
}

function summarizeMethod(entry, edges) {
    const domainCounts = {};
    edges.forEach((edge) => {
        edge.domains.forEach((domain) => {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        });
    });
    return {
        node_id: methodNodeId(entry),
        family: entry.family,
        relation: entry.relation,
        relation_marker: entry.relation_marker,
        declaring_type: entry.declaring_type,
        method_name: entry.method_name,
        signature: entry.signature,
        rva_hex: entry.rva_hex,
        il_code_size: entry.method_body ? entry.method_body.code_size : null,
        call_reference_count: edges.length,
        domain_counts: domainCounts,
        highlighted_calls: unique(edges
            .filter((edge) => edge.domains.length > 0)
            .map((edge) => edge.target))
            .slice(0, 40)
    };
}

function buildFlowHighlights(methodSummaries) {
    const byName = (name) => methodSummaries.filter((entry) => entry.method_name === name);
    const firstByName = (name) => byName(name)[0] || null;
    const findCall = (entry, pattern) => entry ? (entry.highlighted_calls || []).find((call) => pattern.test(call)) || null : null;
    const playerBidMethods = ["GameBid", "RoomGameBid", "SimGameBidPrice", "AuctionHouseBidPrice"]
        .map((name) => firstByName(name))
        .filter(Boolean)
        .map((entry) => ({
            method: `${entry.declaring_type}.${entry.method_name}`,
            signature: entry.signature,
            request_message: findCall(entry, /Protodata\.C2S_/),
            send_call: findCall(entry, /NetworkMgr\.Send/),
            async_or_task_call_count: entry.domain_counts.async_task || 0
        }));
    const doDrop = firstByName("DoDrop");
    const skillEffects = byName("DealSkillEffect");
    const initAuctionItems = firstByName("InitAuctionItems");
    const parseItemPrice = firstByName("ParseItemPrice");
    return {
        bid_flow: {
            status: playerBidMethods.length >= 4 ? "request_wrappers_identified" : "incomplete",
            methods: playerBidMethods
        },
        drop_flow: doDrop ? {
            status: "drop_table_and_random_helpers_identified",
            method: `${doDrop.declaring_type}.${doDrop.method_name}`,
            table_lookup: findCall(doDrop, /Table_Drop\.getBygroup_id/),
            random_or_weight_calls: (doDrop.highlighted_calls || []).filter((call) => /Random|Weight|Probability|GetValues/.test(call))
        } : {
            status: "missing"
        },
        skill_flow: {
            status: skillEffects.length ? "skill_table_and_grid_mutation_calls_identified" : "missing",
            overloads: skillEffects.map((entry) => ({
                method: `${entry.declaring_type}.${entry.method_name}`,
                signature: entry.signature,
                table_calls: (entry.highlighted_calls || []).filter((call) => /Table_/.test(call)),
                grid_calls: (entry.highlighted_calls || []).filter((call) => /BattleGridItemData|GridItemData/.test(call)).slice(0, 20)
            }))
        },
        auction_item_flow: {
            status: initAuctionItems || parseItemPrice ? "auction_item_or_price_methods_identified" : "missing",
            init_auction_items: initAuctionItems ? {
                method: `${initAuctionItems.declaring_type}.${initAuctionItems.method_name}`,
                highlighted_calls: initAuctionItems.highlighted_calls
            } : null,
            parse_item_price: parseItemPrice ? {
                method: `${parseItemPrice.declaring_type}.${parseItemPrice.method_name}`,
                highlighted_calls: parseItemPrice.highlighted_calls
            } : null
        }
    };
}

function buildBidKingMethodCallgraphReport({
    methodMetadataReportPath = DEFAULT_METHOD_METADATA_REPORT_PATH
} = {}) {
    const methodMetadataReport = readJson(methodMetadataReportPath);
    const methods = (methodMetadataReport.target_methods || [])
        .concat(methodMetadataReport.related_compiler_methods || []);
    const edges = methods.flatMap(buildEdgesForMethod);
    const methodSummaries = methods.map((entry) => summarizeMethod(
        entry,
        edges.filter((edge) => edge.source_node_id === methodNodeId(entry))
    ));
    const domainCounts = {};
    edges.forEach((edge) => {
        edge.domains.forEach((domain) => {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1;
        });
    });
    const unresolvedEdges = edges.filter((edge) => (
        edge.resolved_kind === "unresolved_metadata_token"
        || /^TypeSpec#|^MethodSpec#/.test(edge.target)
    ));

    return {
        schema_version: "ak_bidking_method_callgraph_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            method_metadata_report_path: methodMetadataReportPath
        },
        summary: {
            parse_status: "method_metadata_callgraph_built",
            evidence_confidence: "medium",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            shadow_candidate_allowed: false,
            method_node_count: methodSummaries.length,
            edge_count: edges.length,
            domain_counts: domainCounts,
            unresolved_edge_count: unresolvedEdges.length,
            unresolved_edge_ratio: edges.length ? Number((unresolvedEdges.length / edges.length).toFixed(4)) : 0
        },
        flow_highlights: buildFlowHighlights(methodSummaries),
        method_nodes: methodSummaries,
        direct_call_edges: edges,
        unresolved_edges_sample: unresolvedEdges.slice(0, 80),
        refactor_impact: {
            recommended_change_class: "RESEARCH_ONLY",
            live_path_touched: false,
            useful_now: [
                "bid methods are separated as network request wrappers rather than probability logic",
                "drop logic is isolated around Table_Drop plus random/weight helper calls",
                "skill logic is isolated around Table_SkillEffect/Table_Item and BattleGridItemData mutation calls"
            ],
            blockers_before_model_change: [
                "resolve TypeSpec and MethodSpec tokens for full generic helper names",
                "decode control flow and branch operands for DoDrop and DealSkillEffect",
                "decode async MoveNext bodies for InitAuctionItems and auction-house bid callback flow",
                "validate semantics against schema-backed table rows and manual map alignment"
            ]
        }
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatSignature(signature) {
    if (!signature) return "-";
    return `${signature.return_type || "unknown"}(${(signature.parameters || []).join(", ")})`;
}

function formatBidKingMethodCallgraphMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const highlights = report.flow_highlights || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const methodRows = (report.method_nodes || [])
        .filter((entry) => entry.relation === "primary")
        .map((entry) => (
            `| ${markdownCell(entry.family)} | ${markdownCell(entry.declaring_type)} | ${markdownCell(entry.method_name)} | ${markdownCell(formatSignature(entry.signature))} | ${markdownCell(entry.call_reference_count)} | ${markdownCell(JSON.stringify(entry.domain_counts))} |`
        )).join("\n");
    const bidRows = (((highlights.bid_flow || {}).methods) || []).map((entry) => (
        `| ${markdownCell(entry.method)} | ${markdownCell(formatSignature(entry.signature))} | ${markdownCell(entry.request_message)} | ${markdownCell(entry.send_call)} |`
    )).join("\n");
    const skillRows = (((highlights.skill_flow || {}).overloads) || []).map((entry) => (
        `| ${markdownCell(entry.method)} | ${markdownCell(formatSignature(entry.signature))} | ${markdownCell(entry.table_calls.join(", "))} | ${markdownCell(entry.grid_calls.join(", "))} |`
    )).join("\n");

    return `# BidKing method callgraph report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Method metadata: \`${report.inputs ? report.inputs.method_metadata_report_path : "-"}\`
- Parse status: \`${summary.parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- Live/order/funds path touched: \`${report.refactor_impact && report.refactor_impact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| method nodes | \`${summary.method_node_count ?? 0}\` |
| direct call edges | \`${summary.edge_count ?? 0}\` |
| domain counts | ${markdownCell(JSON.stringify(summary.domain_counts || {}))} |
| unresolved edges | \`${summary.unresolved_edge_count ?? 0}\` |
| unresolved ratio | \`${summary.unresolved_edge_ratio ?? 0}\` |

## Bid Flow

| method | signature | request message | send call |
| --- | --- | --- | --- |
${bidRows || "| - | - | - | - |"}

## Drop Flow

- Status: \`${highlights.drop_flow ? highlights.drop_flow.status : "-"}\`
- Method: \`${highlights.drop_flow && highlights.drop_flow.method ? highlights.drop_flow.method : "-"}\`
- Table lookup: \`${highlights.drop_flow && highlights.drop_flow.table_lookup ? highlights.drop_flow.table_lookup : "-"}\`
- Random/weight calls: \`${highlights.drop_flow && highlights.drop_flow.random_or_weight_calls ? highlights.drop_flow.random_or_weight_calls.join(", ") : "-"}\`

## Skill Flow

| method | signature | table calls | grid calls |
| --- | --- | --- | --- |
${skillRows || "| - | - | - | - |"}

## Primary Method Domains

| family | declaring type | method | signature | call refs | domain counts |
| --- | --- | --- | --- | --- | --- |
${methodRows || "| - | - | - | - | - | - |"}

## Conclusion

The callgraph confirms bid endpoints are network wrappers, while probability/mechanics candidates are concentrated in \`DoDrop\`, \`DealSkillEffect\`, table lookups, and async auction item loading. This remains research-only until unresolved generic tokens and control flow are decoded.
`;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeMarkdown(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { methodMetadataReportPath, outputPath } = resolveArgs(argv);
    const report = buildBidKingMethodCallgraphReport({ methodMetadataReportPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingMethodCallgraphMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_METHOD_METADATA_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    buildBidKingMethodCallgraphReport,
    buildEdgesForMethod,
    classifyDomain,
    formatBidKingMethodCallgraphMarkdown,
    main,
    resolveArgs,
    summarizeMethod
};
