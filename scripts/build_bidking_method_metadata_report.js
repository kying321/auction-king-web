const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_ASSEMBLY_PATH,
    parseDotnetMetadata,
    parsePeSections,
    rvaToOffset
} = require("./build_bidking_table_schema_metadata_report.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-method-metadata-report.json"
);

const TARGET_METHOD_FAMILIES = {
    bid_flow: [
        "GameBid",
        "RoomGameBid",
        "SimGameBidPrice",
        "AuctionHouseBidPrice"
    ],
    sim_setup: [
        "CreateSimGame",
        "InitSimGame"
    ],
    item_price_and_auction_items: [
        "ParseItemPrice",
        "InitAuctionItems"
    ],
    drop_and_randomness: [
        "DoDrop"
    ],
    skill_resolution: [
        "GetRoundSkills",
        "GetItemSkills",
        "GetHeroSkills",
        "DealSkillEffect",
        "DealRoundSkill",
        "DealPlayerSkill"
    ]
};

const TARGET_METHOD_NAMES = Object.values(TARGET_METHOD_FAMILIES).flat();

const ONE_BYTE_OPERANDS = new Map([
    [0x0e, "ShortInlineVar"], [0x0f, "ShortInlineVar"], [0x10, "ShortInlineVar"],
    [0x11, "ShortInlineVar"], [0x12, "ShortInlineVar"], [0x13, "ShortInlineVar"],
    [0x1f, "ShortInlineI"], [0x20, "InlineI"], [0x21, "InlineI8"],
    [0x22, "ShortInlineR"], [0x23, "InlineR"],
    [0x27, "InlineMethod"], [0x28, "InlineMethod"], [0x29, "InlineSig"],
    [0x2b, "ShortInlineBrTarget"], [0x2c, "ShortInlineBrTarget"], [0x2d, "ShortInlineBrTarget"],
    [0x2e, "ShortInlineBrTarget"], [0x2f, "ShortInlineBrTarget"], [0x30, "ShortInlineBrTarget"],
    [0x31, "ShortInlineBrTarget"], [0x32, "ShortInlineBrTarget"], [0x33, "ShortInlineBrTarget"],
    [0x34, "ShortInlineBrTarget"], [0x35, "ShortInlineBrTarget"], [0x36, "ShortInlineBrTarget"],
    [0x37, "ShortInlineBrTarget"],
    [0x38, "InlineBrTarget"], [0x39, "InlineBrTarget"], [0x3a, "InlineBrTarget"],
    [0x3b, "InlineBrTarget"], [0x3c, "InlineBrTarget"], [0x3d, "InlineBrTarget"],
    [0x3e, "InlineBrTarget"], [0x3f, "InlineBrTarget"], [0x40, "InlineBrTarget"],
    [0x41, "InlineBrTarget"], [0x42, "InlineBrTarget"], [0x43, "InlineBrTarget"],
    [0x44, "InlineBrTarget"], [0x45, "InlineSwitch"],
    [0x6f, "InlineMethod"], [0x70, "InlineType"], [0x71, "InlineType"],
    [0x72, "InlineString"], [0x73, "InlineMethod"], [0x74, "InlineType"],
    [0x75, "InlineType"], [0x79, "InlineType"], [0x7b, "InlineField"],
    [0x7c, "InlineField"], [0x7d, "InlineField"], [0x7e, "InlineField"],
    [0x7f, "InlineField"], [0x80, "InlineField"], [0x81, "InlineType"],
    [0x8c, "InlineType"], [0x8d, "InlineType"], [0x8f, "InlineType"],
    [0xa5, "InlineType"], [0xc2, "InlineType"], [0xc6, "InlineType"],
    [0xd0, "InlineTok"], [0xdd, "InlineBrTarget"], [0xde, "ShortInlineBrTarget"]
]);

const TWO_BYTE_OPERANDS = new Map([
    [0x09, "InlineVar"], [0x0a, "InlineVar"], [0x0b, "InlineVar"],
    [0x0c, "InlineVar"], [0x0d, "InlineVar"], [0x0e, "InlineVar"],
    [0x06, "InlineMethod"], [0x07, "InlineMethod"],
    [0x12, "ShortInlineI"], [0x15, "InlineType"], [0x16, "InlineType"],
    [0x1c, "InlineType"]
]);

const TOKEN_TABLE_NAMES = {
    0x01: "TypeRef",
    0x02: "TypeDef",
    0x04: "FieldDef",
    0x06: "MethodDef",
    0x0a: "MemberRef",
    0x1b: "TypeSpec",
    0x2b: "MethodSpec",
    0x70: "UserString"
};

const METHOD_TOKEN_OPCODES = new Set(["0x28", "0x6f", "0x73", "0xfe06", "0xfe07"]);
const TOKEN_OPERAND_TYPES = new Set(["InlineField", "InlineMethod", "InlineSig", "InlineString", "InlineTok", "InlineType"]);

const ONE_BYTE_OPCODE_NAMES = {
    0x00: "nop",
    0x01: "break",
    0x02: "ldarg.0",
    0x03: "ldarg.1",
    0x04: "ldarg.2",
    0x05: "ldarg.3",
    0x06: "ldloc.0",
    0x07: "ldloc.1",
    0x08: "ldloc.2",
    0x09: "ldloc.3",
    0x0a: "stloc.0",
    0x0b: "stloc.1",
    0x0c: "stloc.2",
    0x0d: "stloc.3",
    0x0e: "ldarg.s",
    0x0f: "ldarga.s",
    0x10: "starg.s",
    0x11: "ldloc.s",
    0x12: "ldloca.s",
    0x13: "stloc.s",
    0x14: "ldnull",
    0x15: "ldc.i4.m1",
    0x16: "ldc.i4.0",
    0x17: "ldc.i4.1",
    0x18: "ldc.i4.2",
    0x19: "ldc.i4.3",
    0x1a: "ldc.i4.4",
    0x1b: "ldc.i4.5",
    0x1c: "ldc.i4.6",
    0x1d: "ldc.i4.7",
    0x1e: "ldc.i4.8",
    0x1f: "ldc.i4.s",
    0x20: "ldc.i4",
    0x21: "ldc.i8",
    0x25: "dup",
    0x26: "pop",
    0x27: "jmp",
    0x28: "call",
    0x29: "calli",
    0x2a: "ret",
    0x2b: "br.s",
    0x2c: "brfalse.s",
    0x2d: "brtrue.s",
    0x2e: "beq.s",
    0x2f: "bge.s",
    0x30: "bgt.s",
    0x31: "ble.s",
    0x32: "blt.s",
    0x33: "bne.un.s",
    0x34: "bge.un.s",
    0x35: "bgt.un.s",
    0x36: "ble.un.s",
    0x37: "blt.un.s",
    0x38: "br",
    0x39: "brfalse",
    0x3a: "brtrue",
    0x3b: "beq",
    0x3c: "bge",
    0x3d: "bgt",
    0x3e: "ble",
    0x3f: "blt",
    0x40: "bne.un",
    0x41: "bge.un",
    0x42: "bgt.un",
    0x43: "ble.un",
    0x44: "blt.un",
    0x45: "switch",
    0x46: "ldind.i1",
    0x47: "ldind.u1",
    0x48: "ldind.i2",
    0x49: "ldind.u2",
    0x4a: "ldind.i4",
    0x4b: "ldind.u4",
    0x4c: "ldind.i8",
    0x4d: "ldind.i",
    0x4e: "ldind.r4",
    0x4f: "ldind.r8",
    0x50: "ldind.ref",
    0x51: "stind.ref",
    0x52: "stind.i1",
    0x53: "stind.i2",
    0x54: "stind.i4",
    0x55: "stind.i8",
    0x56: "stind.r4",
    0x57: "stind.r8",
    0x58: "add",
    0x59: "sub",
    0x5a: "mul",
    0x5b: "div",
    0x5c: "div.un",
    0x5d: "rem",
    0x5e: "rem.un",
    0x5f: "and",
    0x60: "or",
    0x61: "xor",
    0x62: "shl",
    0x63: "shr",
    0x64: "shr.un",
    0x65: "neg",
    0x66: "not",
    0x67: "conv.i1",
    0x68: "conv.i2",
    0x69: "conv.i4",
    0x6a: "conv.i8",
    0x6b: "conv.r4",
    0x6c: "conv.r8",
    0x6d: "conv.u4",
    0x6e: "conv.u8",
    0x6f: "callvirt",
    0x70: "cpobj",
    0x71: "ldobj",
    0x72: "ldstr",
    0x73: "newobj",
    0x74: "castclass",
    0x75: "isinst",
    0x76: "conv.r.un",
    0x79: "unbox",
    0x7a: "throw",
    0x7b: "ldfld",
    0x7c: "ldflda",
    0x7d: "stfld",
    0x7e: "ldsfld",
    0x7f: "ldsflda",
    0x80: "stsfld",
    0x81: "stobj",
    0x8c: "box",
    0x8d: "newarr",
    0x8e: "ldlen",
    0x8f: "ldelema",
    0x90: "ldelem.i1",
    0x91: "ldelem.u1",
    0x92: "ldelem.i2",
    0x93: "ldelem.u2",
    0x94: "ldelem.i4",
    0x95: "ldelem.u4",
    0x96: "ldelem.i8",
    0x97: "ldelem.i",
    0x98: "ldelem.r4",
    0x99: "ldelem.r8",
    0x9a: "ldelem.ref",
    0x9b: "stelem.i",
    0x9c: "stelem.i1",
    0x9d: "stelem.i2",
    0x9e: "stelem.i4",
    0x9f: "stelem.i8",
    0xa0: "stelem.r4",
    0xa1: "stelem.r8",
    0xa2: "stelem.ref",
    0xa3: "ldelem",
    0xa4: "stelem",
    0xa5: "unbox.any",
    0xb3: "conv.ovf.i1",
    0xb4: "conv.ovf.u1",
    0xb5: "conv.ovf.i2",
    0xb6: "conv.ovf.u2",
    0xb7: "conv.ovf.i4",
    0xb8: "conv.ovf.u4",
    0xb9: "conv.ovf.i8",
    0xba: "conv.ovf.u8",
    0xc2: "refanyval",
    0xc3: "ckfinite",
    0xc6: "mkrefany",
    0xd0: "ldtoken",
    0xd1: "conv.u2",
    0xd2: "conv.u1",
    0xd3: "conv.i",
    0xd4: "conv.ovf.i",
    0xd5: "conv.ovf.u",
    0xd6: "add.ovf",
    0xd7: "add.ovf.un",
    0xd8: "mul.ovf",
    0xd9: "mul.ovf.un",
    0xda: "sub.ovf",
    0xdb: "sub.ovf.un",
    0xdc: "endfinally",
    0xdd: "leave",
    0xde: "leave.s",
    0xdf: "stind.i",
    0xe0: "conv.u"
};

const TWO_BYTE_OPCODE_NAMES = {
    0x00: "arglist",
    0x01: "ceq",
    0x02: "cgt",
    0x03: "cgt.un",
    0x04: "clt",
    0x05: "clt.un",
    0x06: "ldftn",
    0x07: "ldvirtftn",
    0x09: "ldarg",
    0x0a: "ldarga",
    0x0b: "starg",
    0x0c: "ldloc",
    0x0d: "ldloca",
    0x0e: "stloc",
    0x0f: "localloc",
    0x11: "endfilter",
    0x12: "unaligned.",
    0x13: "volatile.",
    0x14: "tail.",
    0x15: "initobj",
    0x16: "constrained.",
    0x17: "cpblk",
    0x18: "initblk",
    0x1a: "rethrow",
    0x1c: "sizeof",
    0x1d: "refanytype",
    0x1e: "readonly."
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

function metadataToken(tableId, rid) {
    return toHex((tableId * 0x01000000) + rid, 8);
}

function familyForMarker(marker) {
    return Object.entries(TARGET_METHOD_FAMILIES)
        .find(([, names]) => names.includes(marker))?.[0] || "unknown";
}

function findRelationMarker(typeName, methodName) {
    return TARGET_METHOD_NAMES.find((marker) => (
        methodName === marker
        || methodName.includes(`<${marker}>`)
        || typeName.includes(`<${marker}>`)
        || typeName.includes(marker)
    )) || null;
}

function classifyCompilerGeneratedKind(typeName, methodName) {
    if (/^<>c__DisplayClass/.test(typeName)) return "closure_display_class";
    if (/^<.+>d__/.test(typeName) && methodName === "MoveNext") return "async_state_machine_move_next";
    if (/^<.+>d__/.test(typeName)) return "async_state_machine_support";
    if (/^<<.+>b__.+>d$/.test(typeName) && methodName === "MoveNext") return "async_lambda_state_machine_move_next";
    if (methodName.includes(">b__")) return "lambda_method";
    return "related_method";
}

function operandLength(operandType, il, operandOffset) {
    switch (operandType) {
        case "InlineNone": return 0;
        case "ShortInlineI":
        case "ShortInlineVar":
        case "ShortInlineBrTarget":
            return 1;
        case "InlineVar":
            return 2;
        case "InlineI":
        case "ShortInlineR":
        case "InlineBrTarget":
        case "InlineField":
        case "InlineMethod":
        case "InlineSig":
        case "InlineString":
        case "InlineTok":
        case "InlineType":
            return 4;
        case "InlineI8":
        case "InlineR":
            return 8;
        case "InlineSwitch": {
            if (operandOffset + 4 > il.length) return Math.max(0, il.length - operandOffset);
            const count = il.readUInt32LE(operandOffset);
            return Math.min(il.length - operandOffset, 4 + count * 4);
        }
        default:
            return 0;
    }
}

function readSignedInt8(value) {
    return value & 0x80 ? value - 0x100 : value;
}

function decodeInstructionOperand(operandType, il, operandOffset, length, nextOffset, resolveToken) {
    if (!length) return {};
    if (operandOffset + length > il.length) {
        return {
            operand_status: "truncated",
            operand_raw_hex: il.subarray(operandOffset).toString("hex")
        };
    }
    const raw = il.subarray(operandOffset, operandOffset + length);
    const decoded = {
        operand_raw_hex: raw.toString("hex")
    };
    if (TOKEN_OPERAND_TYPES.has(operandType) && length >= 4) {
        const token = il.readUInt32LE(operandOffset);
        return {
            ...decoded,
            ...resolveToken(token)
        };
    }
    if (operandType === "ShortInlineBrTarget") {
        const delta = readSignedInt8(il[operandOffset]);
        return {
            ...decoded,
            branch_delta: delta,
            branch_target_offset: nextOffset + delta
        };
    }
    if (operandType === "InlineBrTarget") {
        const delta = il.readInt32LE(operandOffset);
        return {
            ...decoded,
            branch_delta: delta,
            branch_target_offset: nextOffset + delta
        };
    }
    if (operandType === "ShortInlineI") {
        return {
            ...decoded,
            operand_value: readSignedInt8(il[operandOffset])
        };
    }
    if (operandType === "InlineI") {
        return {
            ...decoded,
            operand_value: il.readInt32LE(operandOffset)
        };
    }
    if (operandType === "InlineI8") {
        return {
            ...decoded,
            operand_value: il.readBigInt64LE(operandOffset).toString()
        };
    }
    if (operandType === "ShortInlineVar") {
        return {
            ...decoded,
            operand_value: il[operandOffset]
        };
    }
    if (operandType === "InlineVar") {
        return {
            ...decoded,
            operand_value: il.readUInt16LE(operandOffset)
        };
    }
    if (operandType === "InlineSwitch") {
        const count = il.readUInt32LE(operandOffset);
        const targets = [];
        let cursor = operandOffset + 4;
        const switchBaseOffset = operandOffset + 4 + count * 4;
        for (let index = 0; index < count && cursor + 4 <= il.length; index += 1) {
            const delta = il.readInt32LE(cursor);
            targets.push(switchBaseOffset + delta);
            cursor += 4;
        }
        return {
            ...decoded,
            switch_target_count: count,
            switch_target_offsets: targets
        };
    }
    return decoded;
}

function parseIlInstructions(il, resolveToken = (token) => ({ token: toHex(token, 8) })) {
    const instructions = [];
    let cursor = 0;
    while (cursor < il.length) {
        const ilOffset = cursor;
        let opcode = il[cursor];
        cursor += 1;
        let opcodeKey = toHex(opcode, 2);
        let opcodeName = ONE_BYTE_OPCODE_NAMES[opcode] || `op_${opcode.toString(16).padStart(2, "0")}`;
        let operandType = ONE_BYTE_OPERANDS.get(opcode) || "InlineNone";

        if (opcode === 0xfe) {
            if (cursor >= il.length) break;
            opcode = il[cursor];
            cursor += 1;
            opcodeKey = `0xfe${opcode.toString(16).padStart(2, "0")}`;
            opcodeName = TWO_BYTE_OPCODE_NAMES[opcode] || `op_fe${opcode.toString(16).padStart(2, "0")}`;
            operandType = TWO_BYTE_OPERANDS.get(opcode) || "InlineNone";
        }

        const length = operandLength(operandType, il, cursor);
        const nextOffset = cursor + length;
        const operand = decodeInstructionOperand(operandType, il, cursor, length, nextOffset, resolveToken);
        instructions.push({
            il_offset: ilOffset,
            opcode: opcodeKey,
            opcode_name: opcodeName,
            operand_type: operandType,
            operand_length: length,
            next_offset: Math.min(nextOffset, il.length),
            ...operand
        });
        cursor = nextOffset;
    }
    return instructions;
}

function parseIlMethodReferences(il, resolveToken = (token) => ({ token: toHex(token, 8) })) {
    return parseIlInstructions(il, resolveToken)
        .filter((instruction) => METHOD_TOKEN_OPCODES.has(instruction.opcode) && instruction.token)
        .map((instruction) => ({
            il_offset: instruction.il_offset,
            opcode: instruction.opcode,
            operand_type: instruction.operand_type,
            token: instruction.token,
            table_id: instruction.table_id,
            table_name: instruction.table_name,
            rid: instruction.rid,
            resolved_kind: instruction.resolved_kind,
            resolved_full_name: instruction.resolved_full_name,
            signature: instruction.signature
        }));
}

function buildMethodDefinitionLookup(metadata) {
    const lookup = new Map();
    const methodDefinitions = metadata.method_definitions || [];
    methodDefinitions.forEach((method) => {
        lookup.set(method.rid, method);
    });
    return lookup;
}

function resolveMetadataToken(token, metadata, methodDefLookup) {
    const tableId = token >>> 24;
    const rid = token & 0x00ffffff;
    const tableName = TOKEN_TABLE_NAMES[tableId] || `Table0x${tableId.toString(16)}`;
    const base = {
        token: toHex(token, 8),
        table_id: tableId,
        table_name: tableName,
        rid
    };
    if (tableId === 0x06) {
        const method = methodDefLookup.get(rid);
        return {
            ...base,
            resolved_kind: "method_def",
            resolved_full_name: method ? `${method.declaring_type}.${method.name}` : `MethodDef#${rid}`,
            signature: method ? method.signature : null
        };
    }
    if (tableId === 0x0a) {
        const memberRef = (metadata.member_refs || [])[rid - 1];
        return {
            ...base,
            resolved_kind: "member_ref",
            resolved_full_name: memberRef ? `${memberRef.parent.full_name}.${memberRef.name}` : `MemberRef#${rid}`,
            signature: memberRef ? memberRef.signature : null
        };
    }
    return {
        ...base,
        resolved_kind: "unresolved_metadata_token",
        resolved_full_name: `${tableName}#${rid}`,
        signature: null
    };
}

function parseMethodBody(assembly, sections, method, metadata, methodDefLookup) {
    if (!method.rva) {
        return {
            parse_status: "no_rva",
            rva_hex: toHex(method.rva, 8)
        };
    }
    let fileOffset;
    try {
        fileOffset = rvaToOffset(method.rva, sections);
    } catch (error) {
        return {
            parse_status: "rva_unmapped",
            rva_hex: toHex(method.rva, 8),
            error: error.message
        };
    }

    const first = assembly[fileOffset];
    let headerKind;
    let headerSize;
    let maxStack;
    let codeSize;
    let localVarSigToken = null;
    let flags = null;

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
            rva_hex: toHex(method.rva, 8),
            file_offset: fileOffset,
            header_byte_hex: toHex(first, 2)
        };
    }

    const codeStart = fileOffset + headerSize;
    const codeEnd = Math.min(assembly.length, codeStart + codeSize);
    const il = assembly.subarray(codeStart, codeEnd);
    const callReferences = parseIlMethodReferences(il, (token) => resolveMetadataToken(token, metadata, methodDefLookup));
    return {
        parse_status: codeEnd - codeStart === codeSize ? "parsed" : "truncated",
        rva_hex: toHex(method.rva, 8),
        file_offset: fileOffset,
        header_kind: headerKind,
        header_size: headerSize,
        flags_hex: toHex(flags, 4),
        max_stack: maxStack,
        code_size: codeSize,
        local_var_sig_token: localVarSigToken ? toHex(localVarSigToken, 8) : null,
        has_more_sections: flags !== null ? (flags & 0x08) !== 0 : false,
        il_head_hex: il.subarray(0, 32).toString("hex"),
        call_reference_count: callReferences.length,
        internal_method_call_reference_count: callReferences.filter((entry) => entry.resolved_kind === "method_def").length,
        member_ref_call_reference_count: callReferences.filter((entry) => entry.resolved_kind === "member_ref").length,
        call_references: callReferences.slice(0, 80)
    };
}

function buildMethodEntry(method, relation, marker, assembly, sections, metadata, methodDefLookup) {
    const typeName = method.declaring_type_name || method.declaring_type || "";
    return {
        family: familyForMarker(marker),
        relation,
        relation_marker: marker,
        compiler_generated_kind: relation === "primary" ? null : classifyCompilerGeneratedKind(typeName, method.name),
        declaring_type: method.declaring_type,
        declaring_type_rid: method.declaring_type_rid,
        method_name: method.name,
        method_rid: method.rid,
        metadata_token: metadataToken(0x06, method.rid),
        rva: method.rva,
        rva_hex: toHex(method.rva, 8),
        flags_hex: toHex(method.flags, 4),
        impl_flags_hex: toHex(method.impl_flags, 4),
        signature: method.signature,
        method_body: parseMethodBody(assembly, sections, method, metadata, methodDefLookup)
    };
}

function buildMethodOwnership(targetMethods) {
    const byType = new Map();
    targetMethods.forEach((entry) => {
        if (!byType.has(entry.declaring_type)) {
            byType.set(entry.declaring_type, {
                declaring_type: entry.declaring_type,
                method_count: 0,
                methods: []
            });
        }
        const record = byType.get(entry.declaring_type);
        record.method_count += 1;
        record.methods.push(entry.method_name);
    });
    return Array.from(byType.values()).sort((a, b) => b.method_count - a.method_count || a.declaring_type.localeCompare(b.declaring_type));
}

function buildProtocolMarkers(metadata) {
    const markerPattern = /(C2S|S2C).*?(GameBid|RoomGameBid|SimGameBidPrice|AuctionHouseBidPrice)/;
    const markers = [];
    (metadata.types || []).forEach((typeEntry) => {
        (typeEntry.fields || []).forEach((field) => {
            if (!markerPattern.test(field.name)) return;
            markers.push({
                declaring_type: typeEntry.full_name,
                field_name: field.name,
                field_type: field.type,
                field_rid: field.rid,
                metadata_token: metadataToken(0x04, field.rid)
            });
        });
    });
    return markers;
}

function addCount(target, key, increment = 1) {
    const safeKey = String(key || "unknown");
    target[safeKey] = (target[safeKey] || 0) + increment;
}

function summarizeFamilies(entries) {
    const families = {};
    entries.forEach((entry) => {
        if (!families[entry.family]) {
            families[entry.family] = {
                primary_method_count: 0,
                related_compiler_method_count: 0,
                method_names: []
            };
        }
        const family = families[entry.family];
        if (entry.relation === "primary") family.primary_method_count += 1;
        else family.related_compiler_method_count += 1;
        if (!family.method_names.includes(entry.method_name)) family.method_names.push(entry.method_name);
    });
    return families;
}

function buildBidKingMethodMetadataReport({
    assemblyPath = DEFAULT_ASSEMBLY_PATH
} = {}) {
    const assembly = fs.readFileSync(assemblyPath);
    const metadata = parseDotnetMetadata(assemblyPath);
    const pe = parsePeSections(assembly);
    const methodDefLookup = buildMethodDefinitionLookup(metadata);
    const methodDefinitions = metadata.method_definitions || [];
    const targetNameSet = new Set(TARGET_METHOD_NAMES);
    const primaryMethods = methodDefinitions
        .filter((method) => targetNameSet.has(method.name))
        .map((method) => buildMethodEntry(method, "primary", method.name, assembly, pe.sections, metadata, methodDefLookup));
    const primaryKeys = new Set(primaryMethods.map((entry) => `${entry.declaring_type}#${entry.method_rid}`));
    const relatedCompilerMethods = methodDefinitions
        .map((method) => ({ method, marker: findRelationMarker(method.declaring_type || "", method.name) }))
        .filter(({ method, marker }) => marker && !primaryKeys.has(`${method.declaring_type}#${method.rid}`))
        .map(({ method, marker }) => buildMethodEntry(method, "compiler_generated_related", marker, assembly, pe.sections, metadata, methodDefLookup));
    const protocolMarkers = buildProtocolMarkers(metadata);
    const allTrackedMethods = primaryMethods.concat(relatedCompilerMethods);
    const bodyParseCounts = {};
    allTrackedMethods.forEach((entry) => addCount(bodyParseCounts, entry.method_body.parse_status));
    const primaryMarkersFound = Array.from(new Set(primaryMethods.map((entry) => entry.method_name))).sort();
    const overloadedMarkerNames = Array.from(new Set(primaryMethods
        .filter((entry, _index, entries) => entries.filter((candidate) => candidate.method_name === entry.method_name).length > 1)
        .map((entry) => entry.method_name))).sort();

    return {
        schema_version: "ak_bidking_method_metadata_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            assembly_path: assemblyPath
        },
        summary: {
            metadata_parse_status: "parsed",
            evidence_confidence: "medium_high",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            shadow_candidate_allowed: false,
            il_decompilation_required_for_logic_refactor: true,
            metadata_type_count: metadata.types.length,
            method_def_count: methodDefinitions.length,
            member_ref_count: (metadata.member_refs || []).length,
            target_method_marker_count: TARGET_METHOD_NAMES.length,
            primary_method_count: primaryMethods.length,
            primary_method_markers_found: primaryMarkersFound,
            primary_method_markers_missing: TARGET_METHOD_NAMES.filter((name) => !primaryMarkersFound.includes(name)),
            overloaded_marker_names: overloadedMarkerNames,
            related_compiler_method_count: relatedCompilerMethods.length,
            method_body_parse_counts: bodyParseCounts,
            call_reference_count: allTrackedMethods.reduce((sum, entry) => sum + entry.method_body.call_reference_count, 0),
            internal_method_call_reference_count: allTrackedMethods.reduce((sum, entry) => sum + entry.method_body.internal_method_call_reference_count, 0),
            member_ref_call_reference_count: allTrackedMethods.reduce((sum, entry) => sum + entry.method_body.member_ref_call_reference_count, 0),
            protocol_marker_count: protocolMarkers.length,
            families: summarizeFamilies(allTrackedMethods)
        },
        method_ownership: buildMethodOwnership(primaryMethods),
        target_methods: primaryMethods,
        related_compiler_methods: relatedCompilerMethods,
        protocol_markers: protocolMarkers,
        refactor_impact: {
            recommended_change_class: "RESEARCH_ONLY",
            live_path_touched: false,
            useful_now: [
                "hot-update method ownership and signatures are now source-indexed instead of string-marker-only",
                "RVA/body summaries show which target methods need IL-level decoding before any mechanics refactor",
                "compiler-generated closures and async MoveNext bodies are surfaced for the next decompilation pass"
            ],
            blockers_before_model_change: [
                "resolve MemberRef and MethodSpec calls into a readable IL call graph",
                "decode async state-machine MoveNext bodies for bid flow and auction item loading",
                "cross-check decoded logic against schema-backed table records and manual map alignment",
                "run shadow replay and authority handoff before touching default config or estimator logic"
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

function formatBidKingMethodMetadataMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const targetRows = (report.target_methods || []).map((entry) => (
        `| ${markdownCell(entry.family)} | ${markdownCell(entry.declaring_type)} | ${markdownCell(entry.method_name)} | ${markdownCell(formatSignature(entry.signature))} | ${markdownCell(entry.rva_hex)} | ${markdownCell(entry.method_body.code_size)} | ${markdownCell(entry.method_body.call_reference_count)} |`
    )).join("\n");
    const relatedRows = (report.related_compiler_methods || []).slice(0, 40).map((entry) => (
        `| ${markdownCell(entry.relation_marker)} | ${markdownCell(entry.compiler_generated_kind)} | ${markdownCell(entry.declaring_type)} | ${markdownCell(entry.method_name)} | ${markdownCell(entry.rva_hex)} | ${markdownCell(entry.method_body.code_size)} |`
    )).join("\n");
    const ownershipRows = (report.method_ownership || []).map((entry) => (
        `| ${markdownCell(entry.declaring_type)} | ${markdownCell(entry.method_count)} | ${markdownCell(entry.methods.join(", "))} |`
    )).join("\n");
    const protocolRows = (report.protocol_markers || []).map((entry) => (
        `| ${markdownCell(entry.declaring_type)} | ${markdownCell(entry.field_name)} | ${markdownCell(entry.field_type)} | ${markdownCell(entry.metadata_token)} |`
    )).join("\n");

    return `# BidKing method metadata report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Assembly: \`${report.inputs ? report.inputs.assembly_path : "-"}\`
- Metadata parse: \`${summary.metadata_parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- IL decompilation required for logic refactor: \`${summary.il_decompilation_required_for_logic_refactor === true}\`
- Live/order/funds path touched: \`${report.refactor_impact && report.refactor_impact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| metadata types | \`${summary.metadata_type_count ?? 0}\` |
| MethodDef rows | \`${summary.method_def_count ?? 0}\` |
| MemberRef rows | \`${summary.member_ref_count ?? 0}\` |
| target method markers | \`${summary.target_method_marker_count ?? 0}\` |
| primary methods | \`${summary.primary_method_count ?? 0}\` |
| related compiler methods | \`${summary.related_compiler_method_count ?? 0}\` |
| body parse counts | ${markdownCell(JSON.stringify(summary.method_body_parse_counts || {}))} |
| call references | \`${summary.call_reference_count ?? 0}\` |
| protocol markers | \`${summary.protocol_marker_count ?? 0}\` |
| missing markers | ${markdownCell((summary.primary_method_markers_missing || []).join(", ") || "-")} |

## Primary Method Ownership

| declaring type | count | methods |
| --- | --- | --- |
${ownershipRows || "| - | - | - |"}

## Primary Methods

| family | declaring type | method | signature | RVA | IL bytes | call refs |
| --- | --- | --- | --- | --- | --- | --- |
${targetRows || "| - | - | - | - | - | - | - |"}

## Compiler Generated Related Methods

| marker | kind | declaring type | method | RVA | IL bytes |
| --- | --- | --- | --- | --- | --- |
${relatedRows || "| - | - | - | - | - | - |"}

## Protocol Markers

| declaring type | field | type | token |
| --- | --- | --- | --- |
${protocolRows || "| - | - | - | - |"}

## Conclusion

BidKing hot-update logic is now indexed at method/signature/RVA/body-summary level. This is still not enough to rewrite Auction King estimator behavior: the next step is IL call graph and async \`MoveNext\` decoding for bid, drop, skill, and auction item flows.
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
    const report = buildBidKingMethodMetadataReport({ assemblyPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingMethodMetadataMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ASSEMBLY_PATH,
    DEFAULT_OUTPUT_PATH,
    TARGET_METHOD_FAMILIES,
    TARGET_METHOD_NAMES,
    buildMethodDefinitionLookup,
    buildBidKingMethodMetadataReport,
    classifyCompilerGeneratedKind,
    formatBidKingMethodMetadataMarkdown,
    main,
    metadataToken,
    parseIlInstructions,
    parseIlMethodReferences,
    parseMethodBody,
    resolveMetadataToken,
    resolveArgs
};
