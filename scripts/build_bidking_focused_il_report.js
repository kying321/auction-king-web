const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_ASSEMBLY_PATH,
    parseDotnetMetadata,
    parsePeSections,
    rvaToOffset
} = require("./build_bidking_table_schema_metadata_report.js");

const methodMetadataHelpers = require("./build_bidking_method_metadata_report.js");
const {
    buildMethodDefinitionLookup,
    parseIlInstructions,
    resolveMetadataToken
} = methodMetadataHelpers;

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-focused-il-report.json"
);

const FOCUS_METHODS = [
    { declaringType: "GameServerDemo.Utils", methodName: "DoDrop", reason: "drop_table_random_weight_logic" },
    { declaringType: "MainUtils", methodName: "DealSkillEffect", reason: "client_skill_visibility_and_grid_mutation" },
    { declaringType: "GameServerDemo.Utils", methodName: "DealSkillEffect", reason: "server_skill_visibility_and_grid_mutation" },
    { declaringType: "PlayerManager", methodName: "GameBid", reason: "bid_network_wrapper" },
    { declaringType: "PlayerManager", methodName: "RoomGameBid", reason: "room_bid_network_wrapper" },
    { declaringType: "PlayerManager", methodName: "SimGameBidPrice", reason: "sim_bid_network_wrapper" },
    { declaringType: "PlayerManager", methodName: "AuctionHouseBidPrice", reason: "auction_house_bid_network_wrapper" },
    { declaringType: "BattleRoomEnd_Main", methodName: "ParseItemPrice", reason: "settlement_price_projection" },
    { declaringType: "AuctionContainerPanel", methodName: "InitAuctionItems", reason: "auction_item_async_loading_entry" },
    { declaringType: "<InitAuctionItems>d__15", methodName: "MoveNext", reason: "auction_item_async_loading_body" },
    { declaringType: "<DealRoundSkill>d__18", methodName: "MoveNext", reason: "round_skill_async_body" },
    { declaringType: "<DealPlayerSkill>d__19", methodName: "MoveNext", reason: "player_skill_async_body" },
    { declaringType: "<<AuctionHouseBidPrice>b__0>d", methodName: "MoveNext", reason: "auction_house_bid_callback_async_body" }
];

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
        assemblyPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_ASSEMBLY_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function toHex(value, width = 0) {
    if (value === null || value === undefined) return null;
    return `0x${Number(value).toString(16).padStart(width, "0")}`;
}

function parseMethodIl(assembly, sections, method, metadata, methodDefLookup) {
    if (!method || !method.rva) return { parse_status: "no_rva", instructions: [] };
    let fileOffset;
    try {
        fileOffset = rvaToOffset(method.rva, sections);
    } catch (error) {
        return { parse_status: "rva_unmapped", error: error.message, instructions: [] };
    }

    const first = assembly[fileOffset];
    let headerKind;
    let headerSize;
    let maxStack;
    let codeSize;
    let flags = null;
    let localVarSigToken = null;
    if ((first & 0x03) === 0x02) {
        headerKind = "tiny";
        headerSize = 1;
        maxStack = 8;
        codeSize = first >> 2;
        flags = first & 0x03;
    } else if ((first & 0x03) === 0x03) {
        const flagsAndSize = assembly.readUInt16LE(fileOffset);
        headerKind = "fat";
        headerSize = ((flagsAndSize >> 12) & 0x0f) * 4;
        flags = flagsAndSize & 0x0fff;
        maxStack = assembly.readUInt16LE(fileOffset + 2);
        codeSize = assembly.readUInt32LE(fileOffset + 4);
        localVarSigToken = assembly.readUInt32LE(fileOffset + 8);
    } else {
        return {
            parse_status: "unknown_method_header",
            file_offset: fileOffset,
            header_byte_hex: toHex(first, 2),
            instructions: []
        };
    }

    const codeStart = fileOffset + headerSize;
    const codeEnd = Math.min(assembly.length, codeStart + codeSize);
    const il = assembly.subarray(codeStart, codeEnd);
    const resolveToken = (token) => resolveFocusedToken(token, metadata, methodDefLookup);
    return {
        parse_status: codeEnd - codeStart === codeSize ? "parsed" : "truncated",
        file_offset: fileOffset,
        header_kind: headerKind,
        header_size: headerSize,
        flags_hex: toHex(flags, 4),
        max_stack: maxStack,
        code_size: codeSize,
        local_var_sig_token: localVarSigToken ? toHex(localVarSigToken, 8) : null,
        has_more_sections: flags !== null ? (flags & 0x08) !== 0 : false,
        instruction_count: parseIlInstructions(il, resolveToken).length,
        instructions: parseIlInstructions(il, resolveToken)
    };
}

function buildFieldLookup(metadata) {
    const fields = new Map();
    (metadata.types || []).forEach((typeEntry) => {
        (typeEntry.fields || []).forEach((field) => {
            fields.set(field.rid, {
                declaring_type: typeEntry.full_name,
                field_name: field.name,
                field_type: field.type
            });
        });
    });
    return fields;
}

function resolveFocusedToken(token, metadata, methodDefLookup) {
    const tableId = token >>> 24;
    const rid = token & 0x00ffffff;
    if (tableId === 0x04) {
        const field = buildFieldLookup(metadata).get(rid);
        return {
            token: toHex(token, 8),
            table_id: tableId,
            table_name: "FieldDef",
            rid,
            resolved_kind: "field_def",
            resolved_full_name: field ? `${field.declaring_type}.${field.field_name}` : `FieldDef#${rid}`,
            signature: field ? { field_type: field.field_type } : null
        };
    }
    if (tableId === 0x02) {
        const typeEntry = (metadata.types || []).find((entry) => entry.rid === rid);
        return {
            token: toHex(token, 8),
            table_id: tableId,
            table_name: "TypeDef",
            rid,
            resolved_kind: "type_def",
            resolved_full_name: typeEntry ? typeEntry.full_name : `TypeDef#${rid}`,
            signature: null
        };
    }
    return resolveMetadataToken(token, metadata, methodDefLookup);
}

function classifyDomains(text) {
    return Object.entries(DOMAIN_PATTERNS)
        .filter(([, pattern]) => pattern.test(text))
        .map(([domain]) => domain);
}

function findFocusMethods(metadata) {
    const definitions = metadata.method_definitions || [];
    return FOCUS_METHODS.flatMap((focus) => definitions
        .filter((method) => method.declaring_type === focus.declaringType && method.name === focus.methodName)
        .map((method, overloadIndex) => ({ ...method, focus_reason: focus.reason, focus_declaring_type: focus.declaringType, overload_index: overloadIndex })));
}

function instructionKind(instruction) {
    if (/^br|^beq|^bge|^bgt|^ble|^blt|^bne|^leave|^switch$/.test(instruction.opcode_name)) return "branch";
    if (/^call|^callvirt|^newobj|^ldftn|^ldvirtftn|^jmp$/.test(instruction.opcode_name)) return "call";
    if (/^ldfld|^ldflda|^stfld|^ldsfld|^ldsflda|^stsfld$/.test(instruction.opcode_name)) return "field";
    if (/^ldc\./.test(instruction.opcode_name)) return "constant";
    if (/^ret|^throw|^endfinally|^rethrow$/.test(instruction.opcode_name)) return "exit";
    return "other";
}

function summarizeInstructions(instructions) {
    const counts = {};
    const domains = {};
    instructions.forEach((instruction) => {
        const kind = instructionKind(instruction);
        counts[kind] = (counts[kind] || 0) + 1;
        const text = instruction.resolved_full_name || "";
        classifyDomains(text).forEach((domain) => {
            domains[domain] = (domains[domain] || 0) + 1;
        });
    });
    return {
        instruction_kind_counts: counts,
        domain_counts: domains,
        branch_target_count: instructions.filter((instruction) => instruction.branch_target_offset !== undefined).length,
        token_reference_count: instructions.filter((instruction) => instruction.token).length,
        unresolved_token_reference_count: instructions.filter((instruction) => (
            instruction.token && (
                instruction.resolved_kind === "unresolved_metadata_token"
                || /^TypeSpec#|^MethodSpec#/.test(instruction.resolved_full_name || "")
            )
        )).length
    };
}

function isSignalInstruction(instruction) {
    if (instruction.token) return true;
    if (instruction.branch_target_offset !== undefined || instruction.switch_target_offsets) return true;
    return ["constant", "exit"].includes(instructionKind(instruction));
}

function compactInstruction(instruction) {
    return {
        il_offset: instruction.il_offset,
        opcode: instruction.opcode,
        opcode_name: instruction.opcode_name,
        operand_type: instruction.operand_type,
        operand_value: instruction.operand_value,
        branch_target_offset: instruction.branch_target_offset,
        switch_target_offsets: instruction.switch_target_offsets,
        token: instruction.token,
        table_name: instruction.table_name,
        rid: instruction.rid,
        resolved_kind: instruction.resolved_kind,
        resolved_full_name: instruction.resolved_full_name,
        domains: classifyDomains(instruction.resolved_full_name || "")
    };
}

function buildFocusedMethodEntry(method, assembly, sections, metadata, methodDefLookup) {
    const il = parseMethodIl(assembly, sections, method, metadata, methodDefLookup);
    const instructions = il.instructions || [];
    return {
        focus_reason: method.focus_reason,
        declaring_type: method.declaring_type,
        method_name: method.name,
        method_rid: method.rid,
        overload_index: method.overload_index,
        metadata_token: methodMetadataHelpers.metadataToken(0x06, method.rid),
        rva_hex: toHex(method.rva, 8),
        signature: method.signature,
        body: {
            parse_status: il.parse_status,
            header_kind: il.header_kind,
            max_stack: il.max_stack,
            code_size: il.code_size,
            instruction_count: il.instruction_count,
            has_more_sections: il.has_more_sections,
            local_var_sig_token: il.local_var_sig_token,
            ...summarizeInstructions(instructions)
        },
        signal_instructions: instructions.filter(isSignalInstruction).map(compactInstruction)
    };
}

function buildFlowImplications(methods) {
    const find = (declaringType, methodName) => methods.filter((entry) => entry.declaring_type === declaringType && entry.method_name === methodName);
    const targetsFor = (entry, pattern) => (entry.signal_instructions || [])
        .map((instruction) => instruction.resolved_full_name)
        .filter((name) => name && pattern.test(name));
    const doDrop = find("GameServerDemo.Utils", "DoDrop")[0] || null;
    const skillMethods = find("MainUtils", "DealSkillEffect").concat(find("GameServerDemo.Utils", "DealSkillEffect"));
    const bidMethods = find("PlayerManager", "GameBid")
        .concat(find("PlayerManager", "RoomGameBid"))
        .concat(find("PlayerManager", "SimGameBidPrice"))
        .concat(find("PlayerManager", "AuctionHouseBidPrice"));
    return {
        bid_wrappers: bidMethods.map((entry) => ({
            method: `${entry.declaring_type}.${entry.method_name}`,
            request_messages: targetsFor(entry, /Protodata\.C2S_/),
            send_calls: targetsFor(entry, /NetworkMgr\.Send/),
            refactor_implication: "network request wrapper; not a probability model source"
        })),
        drop_randomness: doDrop ? {
            method: `${doDrop.declaring_type}.${doDrop.method_name}`,
            table_calls: targetsFor(doDrop, /Table_Drop/),
            random_calls: targetsFor(doDrop, /Random|Weight|Probability|GetValues/),
            refactor_implication: "primary source candidate for table-backed drop weighting"
        } : null,
        skill_visibility: skillMethods.map((entry) => ({
            method: `${entry.declaring_type}.${entry.method_name}`,
            table_calls: targetsFor(entry, /Table_/),
            grid_calls: targetsFor(entry, /BattleGridItemData|GridItemData/),
            refactor_implication: "primary source candidate for reveal/scan/grid visibility semantics"
        }))
    };
}

function buildBidKingFocusedIlReport({
    assemblyPath = DEFAULT_ASSEMBLY_PATH
} = {}) {
    const assembly = fs.readFileSync(assemblyPath);
    const metadata = parseDotnetMetadata(assemblyPath);
    const pe = parsePeSections(assembly);
    const methodDefLookup = buildMethodDefinitionLookup(metadata);
    const focusMethods = findFocusMethods(metadata);
    const focusedMethods = focusMethods.map((method) => buildFocusedMethodEntry(method, assembly, pe.sections, metadata, methodDefLookup));
    const parseCounts = {};
    const unresolvedCount = focusedMethods.reduce((sum, entry) => sum + (entry.body.unresolved_token_reference_count || 0), 0);
    const tokenCount = focusedMethods.reduce((sum, entry) => sum + (entry.body.token_reference_count || 0), 0);
    focusedMethods.forEach((entry) => {
        parseCounts[entry.body.parse_status] = (parseCounts[entry.body.parse_status] || 0) + 1;
    });

    return {
        schema_version: "ak_bidking_focused_il_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            assembly_path: assemblyPath
        },
        summary: {
            parse_status: "focused_il_disassembly_built",
            evidence_confidence: "medium",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            shadow_candidate_allowed: false,
            focused_method_count: focusedMethods.length,
            method_parse_counts: parseCounts,
            signal_instruction_count: focusedMethods.reduce((sum, entry) => sum + entry.signal_instructions.length, 0),
            token_reference_count: tokenCount,
            unresolved_token_reference_count: unresolvedCount,
            unresolved_token_reference_ratio: tokenCount ? Number((unresolvedCount / tokenCount).toFixed(4)) : 0
        },
        flow_implications: buildFlowImplications(focusedMethods),
        focused_methods: focusedMethods,
        refactor_impact: {
            recommended_change_class: "RESEARCH_ONLY",
            live_path_touched: false,
            useful_now: [
                "focused methods now have instruction-level branch/token/constant evidence",
                "bid methods are confirmed as request wrapper candidates, not estimator logic",
                "DoDrop and DealSkillEffect are the next correct targets for semantics reconstruction"
            ],
            blockers_before_model_change: [
                "resolve TypeSpec/MethodSpec/local variable signatures enough to name generic collections",
                "reconstruct DoDrop control flow into table-backed probability equations",
                "reconstruct DealSkillEffect visibility flags against Table_SkillEffect and Table_Item",
                "run shadow replay and manual authority handoff before estimator/default config changes"
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

function formatBidKingFocusedIlMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const methodRows = (report.focused_methods || []).map((entry) => (
        `| ${markdownCell(entry.focus_reason)} | ${markdownCell(entry.declaring_type)} | ${markdownCell(entry.method_name)} | ${markdownCell(formatSignature(entry.signature))} | ${markdownCell(entry.body.code_size)} | ${markdownCell(entry.body.instruction_count)} | ${markdownCell(JSON.stringify(entry.body.instruction_kind_counts || {}))} | ${markdownCell(JSON.stringify(entry.body.domain_counts || {}))} |`
    )).join("\n");
    const bidRows = (((report.flow_implications || {}).bid_wrappers) || []).map((entry) => (
        `| ${markdownCell(entry.method)} | ${markdownCell(entry.request_messages.join(", "))} | ${markdownCell(entry.send_calls.join(", "))} | ${markdownCell(entry.refactor_implication)} |`
    )).join("\n");
    const skillRows = (((report.flow_implications || {}).skill_visibility) || []).map((entry) => (
        `| ${markdownCell(entry.method)} | ${markdownCell(entry.table_calls.join(", "))} | ${markdownCell(entry.grid_calls.join(", "))} | ${markdownCell(entry.refactor_implication)} |`
    )).join("\n");
    const drop = (report.flow_implications || {}).drop_randomness || {};

    return `# BidKing focused IL report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Assembly: \`${report.inputs ? report.inputs.assembly_path : "-"}\`
- Parse status: \`${summary.parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- Live/order/funds path touched: \`${report.refactor_impact && report.refactor_impact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| focused methods | \`${summary.focused_method_count ?? 0}\` |
| parse counts | ${markdownCell(JSON.stringify(summary.method_parse_counts || {}))} |
| signal instructions | \`${summary.signal_instruction_count ?? 0}\` |
| token references | \`${summary.token_reference_count ?? 0}\` |
| unresolved token references | \`${summary.unresolved_token_reference_count ?? 0}\` |
| unresolved token ratio | \`${summary.unresolved_token_reference_ratio ?? 0}\` |

## Bid Wrappers

| method | request messages | send calls | implication |
| --- | --- | --- | --- |
${bidRows || "| - | - | - | - |"}

## Drop Randomness

- Method: \`${drop.method || "-"}\`
- Table calls: \`${drop.table_calls ? drop.table_calls.join(", ") : "-"}\`
- Random calls: \`${drop.random_calls ? drop.random_calls.join(", ") : "-"}\`
- Implication: \`${drop.refactor_implication || "-"}\`

## Skill Visibility

| method | table calls | grid calls | implication |
| --- | --- | --- | --- |
${skillRows || "| - | - | - | - |"}

## Focused Methods

| reason | declaring type | method | signature | IL bytes | instructions | instruction kinds | domains |
| --- | --- | --- | --- | --- | --- | --- | --- |
${methodRows || "| - | - | - | - | - | - | - | - |"}

## Conclusion

Focused IL disassembly confirms the next useful reconstruction target is not the bid request wrapper layer. The refactor path should reconstruct \`DoDrop\` and \`DealSkillEffect\` semantics first, then validate them against schema-backed tables and shadow replay.
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
    const { assemblyPath, outputPath } = resolveArgs(argv);
    const report = buildBidKingFocusedIlReport({ assemblyPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingFocusedIlMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ASSEMBLY_PATH,
    DEFAULT_OUTPUT_PATH,
    FOCUS_METHODS,
    buildBidKingFocusedIlReport,
    formatBidKingFocusedIlMarkdown,
    main,
    parseMethodIl,
    resolveArgs
};
