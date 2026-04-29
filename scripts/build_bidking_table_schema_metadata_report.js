const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TABLES_DIR = process.env.BIDKING_TABLES_DIR || path.join(ROOT_DIR, "external", "BidKing_zip_extract_min", "Tables");
const DEFAULT_ASSEMBLY_PATH = process.env.BIDKING_ASSEMBLY_PATH || path.join(ROOT_DIR, "external", "BidKing_zip_extract_min", "dll", "Scripts.dll.bytes");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-schema-metadata-report.json"
);

const KEY_TABLE_TYPES = [
    "Table_Map",
    "Table_BidMap",
    "Table_RankMap",
    "Table_RankAi",
    "Table_Drop",
    "Table_Item",
    "Table_Skill",
    "Table_Hero",
    "Table_BattleItem",
    "Table_Condition",
    "Table_Sim",
    "Table_Constant"
];

const TABLE_NAMES = [
    "Module",
    "TypeRef",
    "TypeDef",
    "FieldPtr",
    "Field",
    "MethodPtr",
    "MethodDef",
    "ParamPtr",
    "Param",
    "InterfaceImpl",
    "MemberRef",
    "Constant",
    "CustomAttribute",
    "FieldMarshal",
    "DeclSecurity",
    "ClassLayout",
    "FieldLayout",
    "StandAloneSig",
    "EventMap",
    "EventPtr",
    "Event",
    "PropertyMap",
    "PropertyPtr",
    "Property",
    "MethodSemantics",
    "MethodImpl",
    "ModuleRef",
    "TypeSpec",
    "ImplMap",
    "FieldRVA",
    "ENCLog",
    "ENCMap",
    "Assembly",
    "AssemblyProcessor",
    "AssemblyOS",
    "AssemblyRef",
    "AssemblyRefProcessor",
    "AssemblyRefOS",
    "File",
    "ExportedType",
    "ManifestResource",
    "NestedClass",
    "GenericParam",
    "MethodSpec",
    "GenericParamConstraint"
];

const CODED_INDEXES = {
    TypeDefOrRef: { tagBits: 2, tables: [2, 1, 27] },
    HasConstant: { tagBits: 2, tables: [4, 8, 23] },
    HasCustomAttribute: {
        tagBits: 5,
        tables: [6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40, 42, 44, 43]
    },
    HasFieldMarshal: { tagBits: 1, tables: [4, 8] },
    HasDeclSecurity: { tagBits: 2, tables: [2, 6, 32] },
    MemberRefParent: { tagBits: 3, tables: [2, 1, 26, 6, 27] },
    HasSemantics: { tagBits: 1, tables: [20, 23] },
    MethodDefOrRef: { tagBits: 1, tables: [6, 10] },
    MemberForwarded: { tagBits: 1, tables: [4, 6] },
    Implementation: { tagBits: 2, tables: [38, 35, 39] },
    CustomAttributeType: { tagBits: 3, tables: [null, null, 6, 10] },
    ResolutionScope: { tagBits: 2, tables: [0, 26, 35, 1] },
    TypeOrMethodDef: { tagBits: 1, tables: [2, 6] }
};

const ELEMENT_TYPES = {
    0x01: "void",
    0x02: "bool",
    0x03: "char",
    0x04: "int8",
    0x05: "uint8",
    0x06: "int16",
    0x07: "uint16",
    0x08: "int",
    0x09: "uint",
    0x0a: "long",
    0x0b: "ulong",
    0x0c: "float",
    0x0d: "double",
    0x0e: "string",
    0x16: "typedref",
    0x18: "native int",
    0x19: "native uint",
    0x1c: "object"
};

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        assemblyPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_ASSEMBLY_PATH,
        tablesDir: argv[1] ? path.resolve(argv[1]) : DEFAULT_TABLES_DIR,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
    };
}

function fileExists(filePath) {
    return !!filePath && fs.existsSync(filePath);
}

function align4(value) {
    return (value + 3) & ~3;
}

function readNullTerminatedAscii(buffer, offset, maxLength) {
    let cursor = offset;
    const end = Math.min(buffer.length, offset + maxLength);
    while (cursor < end && buffer[cursor] !== 0) cursor += 1;
    return buffer.subarray(offset, cursor).toString("ascii");
}

function readMetadataString(stringsHeap, index) {
    if (!index || index >= stringsHeap.length) return "";
    let cursor = index;
    while (cursor < stringsHeap.length && stringsHeap[cursor] !== 0) cursor += 1;
    return stringsHeap.subarray(index, cursor).toString("utf8");
}

function readCompressedUInt(buffer, offset = 0) {
    if (offset >= buffer.length) return { value: 0, nextOffset: offset };
    const first = buffer[offset];
    if ((first & 0x80) === 0) {
        return { value: first, nextOffset: offset + 1 };
    }
    if ((first & 0xc0) === 0x80) {
        return {
            value: ((first & 0x3f) << 8) | buffer[offset + 1],
            nextOffset: offset + 2
        };
    }
    return {
        value: ((first & 0x1f) << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3],
        nextOffset: offset + 4
    };
}

function readBlob(blobHeap, index) {
    if (!index || index >= blobHeap.length) return Buffer.alloc(0);
    const length = readCompressedUInt(blobHeap, index);
    return blobHeap.subarray(length.nextOffset, Math.min(blobHeap.length, length.nextOffset + length.value));
}

function parsePeSections(buffer) {
    if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
        throw new Error("not a PE/MZ assembly");
    }
    const peOffset = buffer.readUInt32LE(0x3c);
    if (buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000") {
        throw new Error("missing PE header");
    }
    const fileHeaderOffset = peOffset + 4;
    const numberOfSections = buffer.readUInt16LE(fileHeaderOffset + 2);
    const optionalHeaderSize = buffer.readUInt16LE(fileHeaderOffset + 16);
    const optionalHeaderOffset = fileHeaderOffset + 20;
    const optionalMagic = buffer.readUInt16LE(optionalHeaderOffset);
    const dataDirectoryOffset = optionalHeaderOffset + (optionalMagic === 0x20b ? 112 : 96);
    const cliHeaderRva = buffer.readUInt32LE(dataDirectoryOffset + 14 * 8);
    const cliHeaderSize = buffer.readUInt32LE(dataDirectoryOffset + 14 * 8 + 4);
    const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
    const sections = [];
    for (let index = 0; index < numberOfSections; index += 1) {
        const offset = sectionTableOffset + index * 40;
        sections.push({
            name: readNullTerminatedAscii(buffer, offset, 8),
            virtual_size: buffer.readUInt32LE(offset + 8),
            virtual_address: buffer.readUInt32LE(offset + 12),
            raw_size: buffer.readUInt32LE(offset + 16),
            raw_pointer: buffer.readUInt32LE(offset + 20)
        });
    }
    return {
        cliHeaderRva,
        cliHeaderSize,
        sections
    };
}

function rvaToOffset(rva, sections) {
    const section = sections.find((entry) => {
        const sectionSize = Math.max(entry.virtual_size, entry.raw_size);
        return rva >= entry.virtual_address && rva < entry.virtual_address + sectionSize;
    });
    if (!section) throw new Error(`RVA not mapped to a section: 0x${rva.toString(16)}`);
    return section.raw_pointer + (rva - section.virtual_address);
}

function parseMetadataStreams(buffer, metadataOffset) {
    if (buffer.toString("ascii", metadataOffset, metadataOffset + 4) !== "BSJB") {
        throw new Error("missing CLR metadata root signature");
    }
    const versionLength = buffer.readUInt32LE(metadataOffset + 12);
    let cursor = align4(metadataOffset + 16 + versionLength);
    const flags = buffer.readUInt16LE(cursor);
    const streamCount = buffer.readUInt16LE(cursor + 2);
    cursor += 4;
    const streams = {};
    for (let index = 0; index < streamCount; index += 1) {
        const offset = buffer.readUInt32LE(cursor);
        const size = buffer.readUInt32LE(cursor + 4);
        const name = readNullTerminatedAscii(buffer, cursor + 8, 32);
        const nameLength = align4(Buffer.byteLength(name, "ascii") + 1);
        streams[name] = {
            name,
            offset: metadataOffset + offset,
            size,
            buffer: buffer.subarray(metadataOffset + offset, metadataOffset + offset + size)
        };
        cursor += 8 + nameLength;
    }
    return {
        flags,
        stream_count: streamCount,
        streams
    };
}

function hasTable(validMask, tableId) {
    return (validMask & (1n << BigInt(tableId))) !== 0n;
}

function heapIndexSize(heapSizes, flag) {
    return (heapSizes & flag) !== 0 ? 4 : 2;
}

function tableIndexSize(rowCounts, tableId) {
    return (rowCounts[tableId] || 0) < 65536 ? 2 : 4;
}

function codedIndexSize(rowCounts, codedIndexName) {
    const coded = CODED_INDEXES[codedIndexName];
    const maxRows = Math.max(...coded.tables
        .filter((tableId) => tableId !== null && tableId !== undefined)
        .map((tableId) => rowCounts[tableId] || 0));
    return maxRows < (1 << (16 - coded.tagBits)) ? 2 : 4;
}

function createSizeContext(heapSizes, rowCounts) {
    return {
        string: heapIndexSize(heapSizes, 0x01),
        guid: heapIndexSize(heapSizes, 0x02),
        blob: heapIndexSize(heapSizes, 0x04),
        table: (tableId) => tableIndexSize(rowCounts, tableId),
        coded: (name) => codedIndexSize(rowCounts, name)
    };
}

function metadataRowSize(tableId, sizes) {
    switch (tableId) {
        case 0: return 2 + sizes.string + sizes.guid + sizes.guid + sizes.guid;
        case 1: return sizes.coded("ResolutionScope") + sizes.string + sizes.string;
        case 2: return 4 + sizes.string + sizes.string + sizes.coded("TypeDefOrRef") + sizes.table(4) + sizes.table(6);
        case 3: return sizes.table(4);
        case 4: return 2 + sizes.string + sizes.blob;
        case 5: return sizes.table(6);
        case 6: return 4 + 2 + 2 + sizes.string + sizes.blob + sizes.table(8);
        case 7: return sizes.table(8);
        case 8: return 2 + 2 + sizes.string;
        case 9: return sizes.table(2) + sizes.coded("TypeDefOrRef");
        case 10: return sizes.coded("MemberRefParent") + sizes.string + sizes.blob;
        case 11: return 2 + sizes.coded("HasConstant") + sizes.blob;
        case 12: return sizes.coded("HasCustomAttribute") + sizes.coded("CustomAttributeType") + sizes.blob;
        case 13: return sizes.coded("HasFieldMarshal") + sizes.blob;
        case 14: return 2 + sizes.coded("HasDeclSecurity") + sizes.blob;
        case 15: return 2 + 4 + sizes.table(2);
        case 16: return 4 + sizes.table(4);
        case 17: return sizes.blob;
        case 18: return sizes.table(2) + sizes.table(20);
        case 19: return sizes.table(20);
        case 20: return 2 + sizes.string + sizes.coded("TypeDefOrRef");
        case 21: return sizes.table(2) + sizes.table(23);
        case 22: return sizes.table(23);
        case 23: return 2 + sizes.string + sizes.blob;
        case 24: return 2 + sizes.table(6) + sizes.coded("HasSemantics");
        case 25: return sizes.table(2) + sizes.coded("MethodDefOrRef") + sizes.coded("MethodDefOrRef");
        case 26: return sizes.string;
        case 27: return sizes.blob;
        case 28: return 2 + sizes.coded("MemberForwarded") + sizes.string + sizes.table(26);
        case 29: return 4 + sizes.table(4);
        case 30: return 8;
        case 31: return 4;
        case 32: return 4 + 2 + 2 + 2 + 2 + 4 + sizes.blob + sizes.string + sizes.string;
        case 33: return 4;
        case 34: return 4 + 4 + 4;
        case 35: return 2 + 2 + 2 + 2 + 4 + sizes.blob + sizes.string + sizes.string + sizes.blob;
        case 36: return 4 + sizes.table(35);
        case 37: return 4 + 4 + 4 + sizes.table(35);
        case 38: return 4 + sizes.string + sizes.blob;
        case 39: return 4 + 4 + sizes.string + sizes.string + sizes.coded("Implementation");
        case 40: return 4 + 4 + sizes.string + sizes.coded("Implementation");
        case 41: return sizes.table(2) + sizes.table(2);
        case 42: return 2 + 2 + sizes.coded("TypeOrMethodDef") + sizes.string;
        case 43: return sizes.coded("MethodDefOrRef") + sizes.blob;
        case 44: return sizes.table(42) + sizes.coded("TypeDefOrRef");
        default:
            throw new Error(`unsupported metadata table id ${tableId}`);
    }
}

function parseTableStream(stream) {
    const buffer = stream.buffer;
    const heapSizes = buffer[6];
    const validMask = buffer.readBigUInt64LE(8);
    const sortedMask = buffer.readBigUInt64LE(16);
    const rowCounts = {};
    let cursor = 24;
    for (let tableId = 0; tableId < 64; tableId += 1) {
        if (!hasTable(validMask, tableId)) continue;
        rowCounts[tableId] = buffer.readUInt32LE(cursor);
        cursor += 4;
    }
    const sizes = createSizeContext(heapSizes, rowCounts);
    const tableOffsets = {};
    const rowSizes = {};
    for (let tableId = 0; tableId < 64; tableId += 1) {
        if (!hasTable(validMask, tableId)) continue;
        const rowSize = metadataRowSize(tableId, sizes);
        rowSizes[tableId] = rowSize;
        tableOffsets[tableId] = cursor;
        cursor += rowSize * rowCounts[tableId];
    }
    return {
        heapSizes,
        validMask,
        sortedMask,
        rowCounts,
        tableOffsets,
        rowSizes,
        sizes,
        buffer
    };
}

function createRowReader(tableStream, offset) {
    let cursor = offset;
    return {
        u8() {
            const value = tableStream.buffer[cursor];
            cursor += 1;
            return value;
        },
        u16() {
            const value = tableStream.buffer.readUInt16LE(cursor);
            cursor += 2;
            return value;
        },
        u32() {
            const value = tableStream.buffer.readUInt32LE(cursor);
            cursor += 4;
            return value;
        },
        index(size) {
            const value = size === 4 ? tableStream.buffer.readUInt32LE(cursor) : tableStream.buffer.readUInt16LE(cursor);
            cursor += size;
            return value;
        },
        string() {
            return this.index(tableStream.sizes.string);
        },
        blob() {
            return this.index(tableStream.sizes.blob);
        },
        guid() {
            return this.index(tableStream.sizes.guid);
        },
        table(tableId) {
            return this.index(tableStream.sizes.table(tableId));
        },
        coded(name) {
            return this.index(tableStream.sizes.coded(name));
        }
    };
}

function readRows(tableStream, tableId, rowParser) {
    const count = tableStream.rowCounts[tableId] || 0;
    const rows = [];
    for (let rid = 1; rid <= count; rid += 1) {
        const offset = tableStream.tableOffsets[tableId] + (rid - 1) * tableStream.rowSizes[tableId];
        rows.push({ rid, ...rowParser(createRowReader(tableStream, offset), rid) });
    }
    return rows;
}

function decodeCodedIndex(raw, codedIndexName) {
    const coded = CODED_INDEXES[codedIndexName];
    const tagMask = (1 << coded.tagBits) - 1;
    const tag = raw & tagMask;
    return {
        table_id: coded.tables[tag],
        table_name: coded.tables[tag] === null || coded.tables[tag] === undefined ? null : TABLE_NAMES[coded.tables[tag]],
        rid: raw >> coded.tagBits,
        tag
    };
}

function simpleTypeName(namespace, name) {
    return namespace ? `${namespace}.${name}` : name;
}

function buildTypeResolver(typeDefs, typeRefs) {
    return function resolveTypeDefOrRef(raw) {
        const decoded = decodeCodedIndex(raw, "TypeDefOrRef");
        if (decoded.table_id === 2) {
            const typeDef = typeDefs[decoded.rid - 1];
            return typeDef ? simpleTypeName(typeDef.namespace, typeDef.name) : `TypeDef#${decoded.rid}`;
        }
        if (decoded.table_id === 1) {
            const typeRef = typeRefs[decoded.rid - 1];
            return typeRef ? simpleTypeName(typeRef.namespace, typeRef.name) : `TypeRef#${decoded.rid}`;
        }
        if (decoded.table_id === 27) return `TypeSpec#${decoded.rid}`;
        return `TypeDefOrRef(${raw})`;
    };
}

function buildMemberRefParentResolver(typeDefs, typeRefs, moduleRefs, methods) {
    return function resolveMemberRefParent(raw) {
        const decoded = decodeCodedIndex(raw, "MemberRefParent");
        if (decoded.table_id === 2) {
            const typeDef = typeDefs[decoded.rid - 1];
            return {
                ...decoded,
                full_name: typeDef ? simpleTypeName(typeDef.namespace, typeDef.name) : `TypeDef#${decoded.rid}`
            };
        }
        if (decoded.table_id === 1) {
            const typeRef = typeRefs[decoded.rid - 1];
            return {
                ...decoded,
                full_name: typeRef ? simpleTypeName(typeRef.namespace, typeRef.name) : `TypeRef#${decoded.rid}`
            };
        }
        if (decoded.table_id === 26) {
            const moduleRef = moduleRefs[decoded.rid - 1];
            return {
                ...decoded,
                full_name: moduleRef ? moduleRef.name : `ModuleRef#${decoded.rid}`
            };
        }
        if (decoded.table_id === 6) {
            const method = methods[decoded.rid - 1];
            return {
                ...decoded,
                full_name: method ? method.name : `MethodDef#${decoded.rid}`
            };
        }
        if (decoded.table_id === 27) {
            return {
                ...decoded,
                full_name: `TypeSpec#${decoded.rid}`
            };
        }
        return {
            ...decoded,
            full_name: `MemberRefParent(${raw})`
        };
    };
}

function decodeMemberRefSignature(blob, resolveTypeDefOrRef) {
    if (!blob.length) return { kind: "unknown" };
    if (blob[0] === 0x06) {
        return {
            kind: "field",
            type: decodeFieldSignature(blob, resolveTypeDefOrRef)
        };
    }
    return {
        kind: "method",
        ...decodeMethodSignature(blob, resolveTypeDefOrRef)
    };
}

function decodeType(blob, offset, resolveTypeDefOrRef) {
    if (offset >= blob.length) return { text: "unknown", nextOffset: offset };
    const elementType = blob[offset];
    let cursor = offset + 1;
    if (ELEMENT_TYPES[elementType]) return { text: ELEMENT_TYPES[elementType], nextOffset: cursor };
    if (elementType === 0x11 || elementType === 0x12) {
        const coded = readCompressedUInt(blob, cursor);
        return {
            text: resolveTypeDefOrRef(coded.value),
            nextOffset: coded.nextOffset
        };
    }
    if (elementType === 0x13 || elementType === 0x1e) {
        const number = readCompressedUInt(blob, cursor);
        return {
            text: `${elementType === 0x13 ? "!" : "!!"}${number.value}`,
            nextOffset: number.nextOffset
        };
    }
    if (elementType === 0x0f || elementType === 0x10) {
        const inner = decodeType(blob, cursor, resolveTypeDefOrRef);
        return {
            text: `${inner.text}${elementType === 0x0f ? "*" : "&"}`,
            nextOffset: inner.nextOffset
        };
    }
    if (elementType === 0x1d) {
        const inner = decodeType(blob, cursor, resolveTypeDefOrRef);
        return {
            text: `${inner.text}[]`,
            nextOffset: inner.nextOffset
        };
    }
    if (elementType === 0x15) {
        const kind = blob[cursor];
        cursor += 1;
        const typeIndex = readCompressedUInt(blob, cursor);
        cursor = typeIndex.nextOffset;
        const argCount = readCompressedUInt(blob, cursor);
        cursor = argCount.nextOffset;
        const args = [];
        for (let index = 0; index < argCount.value; index += 1) {
            const arg = decodeType(blob, cursor, resolveTypeDefOrRef);
            args.push(arg.text);
            cursor = arg.nextOffset;
        }
        const baseType = resolveTypeDefOrRef(typeIndex.value);
        return {
            text: `${baseType}<${args.join(", ")}>${kind === 0x11 ? "" : ""}`,
            nextOffset: cursor
        };
    }
    if (elementType === 0x14) {
        const inner = decodeType(blob, cursor, resolveTypeDefOrRef);
        cursor = inner.nextOffset;
        const rank = readCompressedUInt(blob, cursor);
        cursor = rank.nextOffset;
        const numSizes = readCompressedUInt(blob, cursor);
        cursor = numSizes.nextOffset;
        for (let index = 0; index < numSizes.value; index += 1) cursor = readCompressedUInt(blob, cursor).nextOffset;
        const numLoBounds = readCompressedUInt(blob, cursor);
        cursor = numLoBounds.nextOffset;
        for (let index = 0; index < numLoBounds.value; index += 1) cursor = readCompressedUInt(blob, cursor).nextOffset;
        return {
            text: `${inner.text}[${",".repeat(Math.max(0, rank.value - 1))}]`,
            nextOffset: cursor
        };
    }
    if (elementType === 0x1f || elementType === 0x20) {
        const modifier = readCompressedUInt(blob, cursor);
        return decodeType(blob, modifier.nextOffset, resolveTypeDefOrRef);
    }
    if (elementType === 0x45) {
        const inner = decodeType(blob, cursor, resolveTypeDefOrRef);
        return {
            text: `${inner.text} pinned`,
            nextOffset: inner.nextOffset
        };
    }
    return {
        text: `ELEMENT_TYPE_0x${elementType.toString(16)}`,
        nextOffset: cursor
    };
}

function decodeFieldSignature(blob, resolveTypeDefOrRef) {
    if (!blob.length || blob[0] !== 0x06) return "unknown";
    return decodeType(blob, 1, resolveTypeDefOrRef).text;
}

function decodePropertySignature(blob, resolveTypeDefOrRef) {
    if (!blob.length) return "unknown";
    let cursor = 1;
    const paramCount = readCompressedUInt(blob, cursor);
    cursor = paramCount.nextOffset;
    return decodeType(blob, cursor, resolveTypeDefOrRef).text;
}

function decodeMethodSignature(blob, resolveTypeDefOrRef) {
    if (!blob.length) return { return_type: "unknown", parameters: [] };
    let cursor = 1;
    const callConvention = blob[0];
    if ((callConvention & 0x10) !== 0) cursor = readCompressedUInt(blob, cursor).nextOffset;
    const paramCount = readCompressedUInt(blob, cursor);
    cursor = paramCount.nextOffset;
    const returnType = decodeType(blob, cursor, resolveTypeDefOrRef);
    cursor = returnType.nextOffset;
    const parameters = [];
    for (let index = 0; index < paramCount.value && cursor < blob.length; index += 1) {
        const parameter = decodeType(blob, cursor, resolveTypeDefOrRef);
        parameters.push(parameter.text);
        cursor = parameter.nextOffset;
    }
    return {
        return_type: returnType.text,
        parameters
    };
}

function parseDotnetMetadata(assemblyPath) {
    const assembly = fs.readFileSync(assemblyPath);
    const pe = parsePeSections(assembly);
    const cliOffset = rvaToOffset(pe.cliHeaderRva, pe.sections);
    const metadataRva = assembly.readUInt32LE(cliOffset + 8);
    const metadataSize = assembly.readUInt32LE(cliOffset + 12);
    const metadataOffset = rvaToOffset(metadataRva, pe.sections);
    const metadata = parseMetadataStreams(assembly, metadataOffset);
    const tableStream = parseTableStream(metadata.streams["#~"] || metadata.streams["#-"]);
    const stringsHeap = metadata.streams["#Strings"] ? metadata.streams["#Strings"].buffer : Buffer.alloc(0);
    const blobHeap = metadata.streams["#Blob"] ? metadata.streams["#Blob"].buffer : Buffer.alloc(0);

    const typeRefs = readRows(tableStream, 1, (reader) => ({
        resolution_scope: reader.coded("ResolutionScope"),
        name_index: reader.string(),
        namespace_index: reader.string()
    })).map((row) => ({
        ...row,
        name: readMetadataString(stringsHeap, row.name_index),
        namespace: readMetadataString(stringsHeap, row.namespace_index)
    }));

    const typeDefs = readRows(tableStream, 2, (reader) => ({
        flags: reader.u32(),
        name_index: reader.string(),
        namespace_index: reader.string(),
        extends: reader.coded("TypeDefOrRef"),
        field_list: reader.table(4),
        method_list: reader.table(6)
    })).map((row) => ({
        ...row,
        name: readMetadataString(stringsHeap, row.name_index),
        namespace: readMetadataString(stringsHeap, row.namespace_index)
    }));

    const resolveTypeDefOrRef = buildTypeResolver(typeDefs, typeRefs);

    const moduleRefs = readRows(tableStream, 26, (reader) => ({
        name_index: reader.string()
    })).map((row) => ({
        ...row,
        name: readMetadataString(stringsHeap, row.name_index)
    }));

    const fields = readRows(tableStream, 4, (reader) => ({
        flags: reader.u16(),
        name_index: reader.string(),
        signature_index: reader.blob()
    })).map((row) => ({
        ...row,
        name: readMetadataString(stringsHeap, row.name_index),
        type: decodeFieldSignature(readBlob(blobHeap, row.signature_index), resolveTypeDefOrRef)
    }));

    const methods = readRows(tableStream, 6, (reader) => ({
        rva: reader.u32(),
        impl_flags: reader.u16(),
        flags: reader.u16(),
        name_index: reader.string(),
        signature_index: reader.blob(),
        param_list: reader.table(8)
    })).map((row) => ({
        ...row,
        name: readMetadataString(stringsHeap, row.name_index),
        signature: decodeMethodSignature(readBlob(blobHeap, row.signature_index), resolveTypeDefOrRef)
    }));

    const resolveMemberRefParent = buildMemberRefParentResolver(typeDefs, typeRefs, moduleRefs, methods);
    const memberRefs = readRows(tableStream, 10, (reader) => ({
        parent: reader.coded("MemberRefParent"),
        name_index: reader.string(),
        signature_index: reader.blob()
    })).map((row) => ({
        ...row,
        name: readMetadataString(stringsHeap, row.name_index),
        parent: resolveMemberRefParent(row.parent),
        signature: decodeMemberRefSignature(readBlob(blobHeap, row.signature_index), resolveTypeDefOrRef)
    }));

    const properties = readRows(tableStream, 23, (reader) => ({
        flags: reader.u16(),
        name_index: reader.string(),
        signature_index: reader.blob()
    })).map((row) => ({
        ...row,
        name: readMetadataString(stringsHeap, row.name_index),
        type: decodePropertySignature(readBlob(blobHeap, row.signature_index), resolveTypeDefOrRef),
        getter: null,
        setter: null
    }));

    const propertyMaps = readRows(tableStream, 21, (reader) => ({
        parent: reader.table(2),
        property_list: reader.table(23)
    }));

    const methodSemantics = readRows(tableStream, 24, (reader) => ({
        semantics: reader.u16(),
        method: reader.table(6),
        association: reader.coded("HasSemantics")
    }));
    methodSemantics.forEach((row) => {
        const association = decodeCodedIndex(row.association, "HasSemantics");
        if (association.table_id !== 23) return;
        const property = properties[association.rid - 1];
        const method = methods[row.method - 1];
        if (!property || !method) return;
        if ((row.semantics & 0x0002) !== 0) property.getter = method.name;
        if ((row.semantics & 0x0001) !== 0) property.setter = method.name;
    });

    const typeEntries = typeDefs.map((typeDef, index) => {
        const nextType = typeDefs[index + 1];
        const fieldEnd = nextType ? nextType.field_list : fields.length + 1;
        const methodEnd = nextType ? nextType.method_list : methods.length + 1;
        const propertyMapIndex = propertyMaps.findIndex((row) => row.parent === typeDef.rid);
        let typeProperties = [];
        if (propertyMapIndex >= 0) {
            const propertyMap = propertyMaps[propertyMapIndex];
            const nextPropertyMap = propertyMaps[propertyMapIndex + 1];
            const propertyEnd = nextPropertyMap ? nextPropertyMap.property_list : properties.length + 1;
            typeProperties = properties.slice(Math.max(0, propertyMap.property_list - 1), Math.max(0, propertyEnd - 1));
        }
        return {
            rid: typeDef.rid,
            name: typeDef.name,
            namespace: typeDef.namespace,
            full_name: simpleTypeName(typeDef.namespace, typeDef.name),
            extends: typeDef.extends ? resolveTypeDefOrRef(typeDef.extends) : null,
            fields: fields.slice(Math.max(0, typeDef.field_list - 1), Math.max(0, fieldEnd - 1)),
            methods: methods.slice(Math.max(0, typeDef.method_list - 1), Math.max(0, methodEnd - 1)),
            properties: typeProperties
        };
    });
    const methodDefinitions = [];
    typeEntries.forEach((typeEntry) => {
        typeEntry.methods.forEach((method) => {
            methodDefinitions.push({
                ...method,
                declaring_type: typeEntry.full_name,
                declaring_type_name: typeEntry.name,
                declaring_type_namespace: typeEntry.namespace,
                declaring_type_rid: typeEntry.rid
            });
        });
    });

    return {
        assembly_path: assemblyPath,
        metadata_size: metadataSize,
        stream_names: Object.keys(metadata.streams),
        table_row_counts: Object.fromEntries(Object.entries(tableStream.rowCounts).map(([id, count]) => [TABLE_NAMES[Number(id)] || id, count])),
        module_refs: moduleRefs,
        member_refs: memberRefs,
        method_definitions: methodDefinitions,
        types: typeEntries
    };
}

function parseTableRows(tablesDir, tableName) {
    const filePath = path.join(tablesDir, `${tableName.replace(/^Table_/, "")}.txt`);
    if (!fileExists(filePath)) return [];
    return fs.readFileSync(filePath, "utf8")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .map((line) => line.split("\t"));
}

function columnDistribution(rows) {
    const counts = {};
    rows.forEach((row) => {
        counts[row.length] = (counts[row.length] || 0) + 1;
    });
    return counts;
}

function cleanAutoPropertyFieldName(name) {
    const match = String(name || "").match(/^<(.+)>k__BackingField$/);
    return match ? match[1] : name;
}

function isPublicInstanceField(field) {
    const fieldAccessMask = field.flags & 0x0007;
    const isStatic = (field.flags & 0x0010) !== 0;
    return fieldAccessMask === 0x0006 && !isStatic;
}

function likelySchemaMembers(typeEntry) {
    return typeEntry.fields
        .filter((field) => field.name && !field.name.startsWith("<>") && isPublicInstanceField(field))
        .map((field) => ({
            name: cleanAutoPropertyFieldName(field.name),
            type: field.type,
            source: "public_instance_field"
        }));
}

function buildTableTypeEntry(typeEntry, tablesDir) {
    const rows = parseTableRows(tablesDir, typeEntry.name);
    const distribution = columnDistribution(rows);
    const columns = Object.keys(distribution).map(Number).sort((a, b) => a - b);
    const schemaMembers = likelySchemaMembers(typeEntry);
    const propertyNames = typeEntry.properties.map((property) => property.name);
    const methodNames = typeEntry.methods.map((method) => method.name);
    const publicInstanceFieldCount = typeEntry.fields.filter(isPublicInstanceField).length;
    const nonDataFieldCount = typeEntry.fields.length - publicInstanceFieldCount;
    const columnOffsets = columns.map((columnCount) => columnCount - schemaMembers.length);
    const likelyLeadingNonSchemaColumns = columnOffsets.find((offset) => offset >= 0 && offset <= 3);
    return {
        type_name: typeEntry.name,
        namespace: typeEntry.namespace,
        full_name: typeEntry.full_name,
        extends: typeEntry.extends,
        table_file: `${typeEntry.name.replace(/^Table_/, "")}.txt`,
        table_row_count: rows.length,
        table_column_distribution: distribution,
        field_count: typeEntry.fields.length,
        public_instance_field_count: publicInstanceFieldCount,
        non_data_field_count: nonDataFieldCount,
        property_count: typeEntry.properties.length,
        method_count: typeEntry.methods.length,
        schema_member_count: schemaMembers.length,
        schema_member_source: schemaMembers[0] ? schemaMembers[0].source : "none",
        schema_member_count_matches_table_columns: columns.includes(schemaMembers.length),
        schema_member_count_plus_two_matches_table_columns: columns.includes(schemaMembers.length + 2),
        likely_leading_non_schema_column_count: likelyLeadingNonSchemaColumns ?? null,
        field_count_matches_table_columns: columns.includes(typeEntry.fields.length),
        property_count_matches_table_columns: columns.includes(typeEntry.properties.length),
        schema_members: schemaMembers,
        property_samples: propertyNames.slice(0, 80),
        method_samples: methodNames.filter((name) => !name.startsWith("get_") && !name.startsWith("set_")).slice(0, 40),
        accessor_samples: methodNames.filter((name) => name.startsWith("get_") || name.startsWith("set_")).slice(0, 80),
        first_row_sample: rows[0] ? rows[0].slice(0, 20) : []
    };
}

function buildBidKingTableSchemaMetadataReport({
    assemblyPath = DEFAULT_ASSEMBLY_PATH,
    tablesDir = DEFAULT_TABLES_DIR
} = {}) {
    const metadata = parseDotnetMetadata(assemblyPath);
    const tableTypeEntries = KEY_TABLE_TYPES
        .map((typeName) => metadata.types.find((typeEntry) => typeEntry.name === typeName))
        .filter(Boolean)
        .map((typeEntry) => buildTableTypeEntry(typeEntry, tablesDir));
    const matchedColumnCount = tableTypeEntries.filter((entry) => entry.schema_member_count_matches_table_columns).length;
    const matchedWithLocalizedColumns = tableTypeEntries.filter((entry) => (
        entry.schema_member_count_matches_table_columns
        || entry.schema_member_count_plus_two_matches_table_columns
    )).length;
    const refactorReady = matchedWithLocalizedColumns >= Math.min(8, tableTypeEntries.length);

    return {
        schema_version: "ak_bidking_table_schema_metadata_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            assembly_path: assemblyPath,
            tables_dir: tablesDir
        },
        summary: {
            metadata_parse_status: "parsed",
            evidence_confidence: refactorReady ? "medium_high" : "medium",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            schema_handoff_candidate: refactorReady,
            metadata_type_count: metadata.types.length,
            target_table_type_count: tableTypeEntries.length,
            target_table_types_with_column_count_match: matchedColumnCount,
            target_table_types_with_schema_or_localized_column_match: matchedWithLocalizedColumns,
            target_table_types_missing: KEY_TABLE_TYPES.filter((typeName) => !tableTypeEntries.some((entry) => entry.type_name === typeName))
        },
        metadata_inventory: {
            assembly_path: metadata.assembly_path,
            metadata_size: metadata.metadata_size,
            stream_names: metadata.stream_names,
            table_row_counts: metadata.table_row_counts
        },
        table_type_schemas: tableTypeEntries,
        refactor_impact: {
            recommended_change_class: "RESEARCH_ONLY",
            live_path_touched: false,
            useful_now: [
                "Table_* type metadata can validate table column order candidates",
                "schema names can replace anonymous column indexes in the next mechanics review artifact",
                "schema evidence is still source-owned research until manual and replay gates pass"
            ],
            blockers_before_model_change: [
                "confirm whether table loader uses property order, field order, or generated parser order",
                "align current app map ids to BidKing map and bidmap ids",
                "turn schema-backed table mechanics into a candidate config under shadow replay",
                "explicit human approval before default config or estimator changes"
            ]
        }
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatBidKingTableSchemaMetadataMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const rows = (report.table_type_schemas || []).map((entry) => (
        `| ${markdownCell(entry.type_name)} | ${markdownCell(entry.table_row_count)} | ${markdownCell(JSON.stringify(entry.table_column_distribution))} | ${markdownCell(entry.schema_member_count)} | ${markdownCell(entry.schema_member_source)} | ${markdownCell(entry.likely_leading_non_schema_column_count)} | ${markdownCell(entry.schema_member_count_matches_table_columns || entry.schema_member_count_plus_two_matches_table_columns)} |`
    )).join("\n");
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    return `# BidKing table schema metadata report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Assembly: \`${report.inputs ? report.inputs.assembly_path : "-"}\`
- Tables: \`${report.inputs ? report.inputs.tables_dir : "-"}\`
- Metadata parse: \`${summary.metadata_parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Core refactor recommended now: \`${summary.core_refactor_recommended_now === true}\`
- Schema handoff candidate: \`${summary.schema_handoff_candidate === true}\`
- Live/order/funds path touched: \`${report.refactor_impact && report.refactor_impact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| metadata types | \`${summary.metadata_type_count ?? 0}\` |
| target table types | \`${summary.target_table_type_count ?? 0}\` |
| column-count matches | \`${summary.target_table_types_with_column_count_match ?? 0}\` |
| schema-or-localized-column matches | \`${summary.target_table_types_with_schema_or_localized_column_match ?? 0}\` |
| missing target table types | ${markdownCell((summary.target_table_types_missing || []).join(", ") || "-")} |

## Table Type Schemas

| type | rows | table column distribution | schema members | source | leading non-schema columns | schema/localized count match |
| --- | --- | --- | --- | --- | --- | --- |
${rows || "| - | - | - | - | - | - | - |"}

## Conclusion

Managed metadata now provides named \`Table_*\` schema candidates. This reduces the largest blocker in the previous table-mechanics artifact, but it remains research-only until loader ordering, map alignment, shadow replay, and authority handoff are validated.
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
    const { assemblyPath, tablesDir, outputPath } = resolveArgs(argv);
    const report = buildBidKingTableSchemaMetadataReport({ assemblyPath, tablesDir });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingTableSchemaMetadataMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ASSEMBLY_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_TABLES_DIR,
    buildBidKingTableSchemaMetadataReport,
    decodeCodedIndex,
    decodeFieldSignature,
    decodeMethodSignature,
    decodePropertySignature,
    formatBidKingTableSchemaMetadataMarkdown,
    main,
    parseDotnetMetadata,
    parsePeSections,
    readCompressedUInt,
    rvaToOffset,
    resolveArgs
};
