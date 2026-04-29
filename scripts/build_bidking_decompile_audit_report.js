const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_BIDKING_PATH = process.env.BIDKING_PATH || path.join(ROOT_DIR, "external", "BidKing");
const DEFAULT_BIDKING_ZIP_PATH = process.env.BIDKING_ZIP_PATH || path.join(ROOT_DIR, "external", "BidKing.zip");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-28-bidking-decompile-audit-report.json"
);

const IL2CPP_SOURCE_PATTERN = /^Assembly-CSharp.*\.cpp$/i;
const GAMEPLAY_KEYWORDS = [
    "auction",
    "bid",
    "bidding",
    "bargain",
    "haggle",
    "pawn",
    "offer",
    "price",
    "value",
    "rarity",
    "item",
    "inventory",
    "loot",
    "round",
    "customer",
    "opponent",
    "profit",
    "sell",
    "buy",
    "market",
    "appraisal",
    "estimate",
    "reward"
];

const KNOWN_PLUGIN_PREFIXES = [
    "System",
    "Unity",
    "TMPro",
    "DG.",
    "Coffee.",
    "SDev.",
    "Steamworks",
    "Newtonsoft",
    "ProGif",
    "Gif",
    "MobileMedia",
    "MultipleCamera",
    "CodelessProGif",
    "TexturesToGIF",
    "SimpleStartDemo",
    "SplashScreen",
    "SDemo",
    "DCanvas",
    "DImage",
    "ImageResizer",
    "ImageRotator",
    "Frame",
    "FilePathName",
    "MinAttribute",
    "Interop"
];

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        bidkingPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_BIDKING_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fileExists(filePath) {
    return !!filePath && fs.existsSync(filePath);
}

function isDirectory(filePath) {
    return fileExists(filePath) && fs.statSync(filePath).isDirectory();
}

function safeStat(filePath) {
    try {
        return fs.statSync(filePath);
    } catch (_error) {
        return null;
    }
}

function isFile(filePath) {
    const stat = safeStat(filePath);
    return !!stat && stat.isFile();
}

function isZipPath(filePath) {
    return /\.zip$/i.test(String(filePath || ""));
}

function normalizeZipName(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function parseUnzipListOutput(output) {
    const entries = [];
    for (const line of String(output || "").split(/\r?\n/)) {
        const match = line.match(/^\s*(\d+)\s+\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s+(.+?)\s*$/);
        if (!match) continue;
        const name = normalizeZipName(match[2]);
        if (!name || name === "Name") continue;
        entries.push({
            size: Number(match[1]),
            name,
            is_directory: name.endsWith("/")
        });
    }
    return entries;
}

function listZipEntries(zipPath) {
    if (!isFile(zipPath)) return [];
    try {
        return parseUnzipListOutput(childProcess.execFileSync("unzip", ["-l", zipPath], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024
        }));
    } catch (error) {
        return [{
            size: 0,
            name: `__zip_list_error__:${error.message}`,
            is_directory: false,
            error: error.message
        }];
    }
}

function walkFiles(rootPath, options = {}) {
    const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 8;
    const results = [];
    if (!isDirectory(rootPath)) return results;

    function visit(currentPath, depth) {
        if (depth > maxDepth) return;
        for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
            const entryPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath, depth + 1);
                continue;
            }
            if (entry.isFile()) results.push(entryPath);
        }
    }

    visit(rootPath, 0);
    return results.sort();
}

function detectZipPackageRoot(entries) {
    const names = entries.map((entry) => normalizeZipName(entry.name));
    const firstSegments = Array.from(new Set(names
        .filter((name) => name.includes("/"))
        .map((name) => `${name.split("/")[0]}/`)));
    const candidates = ["", "BidKing/", ...firstSegments];
    return candidates.find((candidate) => names.some((name) => (
        name === `${candidate}BidKing.exe`
        || name === `${candidate}GameAssembly.dll`
        || name.startsWith(`${candidate}BidKing_Data/`)
    ))) || "";
}

function stripZipPackageRoot(name, packageRoot) {
    const normalized = normalizeZipName(name);
    return packageRoot && normalized.startsWith(packageRoot)
        ? normalized.slice(packageRoot.length)
        : normalized;
}

function relativeOrAbsolute(filePath, rootPath) {
    if (!filePath) return null;
    const relativePath = path.relative(rootPath, filePath);
    return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

function readText(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function readJsonOptional(filePath) {
    if (!fileExists(filePath)) return null;
    try {
        return JSON.parse(readText(filePath));
    } catch (error) {
        return {
            parse_error: error.message
        };
    }
}

function readNullTerminatedAscii(buffer, offset, length) {
    const end = Math.min(buffer.length, offset + length);
    let cursor = offset;
    while (cursor < end && buffer[cursor] !== 0) cursor += 1;
    return buffer.subarray(offset, cursor).toString("ascii");
}

function parsePeHeader(filePath) {
    if (!fileExists(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 0x40 || buffer.toString("ascii", 0, 2) !== "MZ") {
        return { format: "not_pe" };
    }
    const peOffset = buffer.readUInt32LE(0x3c);
    if (peOffset + 24 >= buffer.length || buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000") {
        return { format: "mz_without_pe_header" };
    }

    const fileHeaderOffset = peOffset + 4;
    const machine = buffer.readUInt16LE(fileHeaderOffset);
    const numberOfSections = buffer.readUInt16LE(fileHeaderOffset + 2);
    const timestamp = buffer.readUInt32LE(fileHeaderOffset + 4);
    const optionalHeaderSize = buffer.readUInt16LE(fileHeaderOffset + 16);
    const characteristics = buffer.readUInt16LE(fileHeaderOffset + 18);
    const optionalHeaderOffset = fileHeaderOffset + 20;
    const optionalMagic = optionalHeaderOffset + 2 <= buffer.length
        ? buffer.readUInt16LE(optionalHeaderOffset)
        : null;
    const isPe32Plus = optionalMagic === 0x20b;
    const addressOfEntryPoint = optionalHeaderOffset + 20 <= buffer.length
        ? buffer.readUInt32LE(optionalHeaderOffset + 16)
        : null;
    const imageBase = isPe32Plus && optionalHeaderOffset + 32 <= buffer.length
        ? Number(buffer.readBigUInt64LE(optionalHeaderOffset + 24))
        : (optionalHeaderOffset + 32 <= buffer.length ? buffer.readUInt32LE(optionalHeaderOffset + 28) : null);
    const sizeOfImage = optionalHeaderOffset + 60 <= buffer.length
        ? buffer.readUInt32LE(optionalHeaderOffset + 56)
        : null;
    const subsystem = optionalHeaderOffset + 70 <= buffer.length
        ? buffer.readUInt16LE(optionalHeaderOffset + 68)
        : null;

    const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
    const sections = [];
    for (let index = 0; index < numberOfSections; index += 1) {
        const offset = sectionTableOffset + index * 40;
        if (offset + 40 > buffer.length) break;
        sections.push({
            name: readNullTerminatedAscii(buffer, offset, 8),
            virtual_size: buffer.readUInt32LE(offset + 8),
            virtual_address: buffer.readUInt32LE(offset + 12),
            raw_size: buffer.readUInt32LE(offset + 16),
            raw_pointer: buffer.readUInt32LE(offset + 20),
            characteristics: `0x${buffer.readUInt32LE(offset + 36).toString(16)}`
        });
    }

    return {
        format: isPe32Plus ? "PE32+" : "PE32",
        machine: `0x${machine.toString(16)}`,
        timestamp,
        timestamp_iso: Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null,
        characteristics: `0x${characteristics.toString(16)}`,
        address_of_entry_point: addressOfEntryPoint,
        image_base: imageBase,
        size_of_image: sizeOfImage,
        subsystem,
        section_count: sections.length,
        sections
    };
}

function normalizeTypeName(value) {
    return String(value || "")
        .replace(/^.*?:\/\//, "")
        .replace(/^\/\//, "")
        .trim();
}

function isNoiseType(typeName) {
    if (!typeName) return true;
    if (typeName.includes("Native definition for ")) return true;
    return KNOWN_PLUGIN_PREFIXES.some((prefix) => typeName === prefix || typeName.startsWith(prefix));
}

function keywordMatchScore(value) {
    const lowered = String(value || "").toLowerCase();
    return GAMEPLAY_KEYWORDS.reduce((score, keyword) => score + (lowered.includes(keyword) ? 1 : 0), 0);
}

function extractTypeNames(il2cppFiles, bidkingPath) {
    const typeNames = new Set();
    const gameplayTypeNames = new Set();
    const pluginOrNoiseTypeNames = new Set();

    for (const filePath of il2cppFiles) {
        const text = readText(filePath);
        for (const line of text.split(/\r?\n/)) {
            const match = line.match(/^\/\/\s+([A-Za-z_][A-Za-z0-9_./<>` ,+-]*)$/);
            if (!match) continue;
            const typeName = normalizeTypeName(match[1]);
            if (!typeName) continue;
            typeNames.add(typeName);
            if (isNoiseType(typeName)) {
                pluginOrNoiseTypeNames.add(typeName);
            } else if (keywordMatchScore(typeName) > 0) {
                gameplayTypeNames.add(typeName);
            }
        }
    }

    return {
        total_type_count: typeNames.size,
        plugin_or_noise_type_count: pluginOrNoiseTypeNames.size,
        non_plugin_type_count: Array.from(typeNames).filter((typeName) => !isNoiseType(typeName)).length,
        gameplay_type_count: gameplayTypeNames.size,
        gameplay_type_samples: Array.from(gameplayTypeNames).sort().slice(0, 40),
        non_plugin_type_samples: Array.from(typeNames)
            .filter((typeName) => !isNoiseType(typeName))
            .sort()
            .slice(0, 80),
        source_files: il2cppFiles.map((filePath) => relativeOrAbsolute(filePath, bidkingPath))
    };
}

function countKeywordHits(il2cppFiles) {
    const hits = Object.fromEntries(GAMEPLAY_KEYWORDS.map((keyword) => [keyword, 0]));
    let scannedBytes = 0;

    for (const filePath of il2cppFiles) {
        const text = readText(filePath);
        scannedBytes += Buffer.byteLength(text);
        const lowered = text.toLowerCase();
        for (const keyword of GAMEPLAY_KEYWORDS) {
            const matcher = new RegExp(`\\b${keyword}\\b`, "g");
            hits[keyword] += (lowered.match(matcher) || []).length;
        }
    }

    return {
        scanned_bytes: scannedBytes,
        hits,
        positive_keyword_count: Object.values(hits).filter((count) => count > 0).length,
        total_hit_count: Object.values(hits).reduce((sum, count) => sum + count, 0)
    };
}

function buildDirectoryPackageInventory(bidkingPath) {
    const files = walkFiles(bidkingPath);
    const il2cppFiles = files.filter((filePath) => IL2CPP_SOURCE_PATTERN.test(path.basename(filePath)));
    const outputDirectory = files.find((filePath) => filePath.includes(`${path.sep}il2cppOutput${path.sep}`))
        ? path.dirname(files.find((filePath) => filePath.includes(`${path.sep}il2cppOutput${path.sep}`)))
        : path.join(bidkingPath, "BidKing_BackUpThisFolder_ButDontShipItWithYourGame", "il2cppOutput");
    const topLevelFiles = fs.existsSync(bidkingPath)
        ? fs.readdirSync(bidkingPath, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .sort()
        : [];
    const topLevelDirectories = fs.existsSync(bidkingPath)
        ? fs.readdirSync(bidkingPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
        : [];

    return {
        source_type: "directory",
        source_path: bidkingPath,
        exists: isDirectory(bidkingPath),
        file_count: files.length,
        top_level_files: topLevelFiles,
        top_level_directories: topLevelDirectories,
        detected_files: {
            exe: relativeOrAbsolute(path.join(bidkingPath, "BidKing.exe"), bidkingPath),
            baselib: relativeOrAbsolute(path.join(bidkingPath, "baselib.dll"), bidkingPath),
            gameassembly: fileExists(path.join(bidkingPath, "GameAssembly.dll"))
                ? relativeOrAbsolute(path.join(bidkingPath, "GameAssembly.dll"), bidkingPath)
                : null,
            unityplayer: fileExists(path.join(bidkingPath, "UnityPlayer.dll"))
                ? relativeOrAbsolute(path.join(bidkingPath, "UnityPlayer.dll"), bidkingPath)
                : null,
            data_dir: isDirectory(path.join(bidkingPath, "BidKing_Data"))
                ? relativeOrAbsolute(path.join(bidkingPath, "BidKing_Data"), bidkingPath)
                : null,
            global_metadata: files
                .map((filePath) => relativeOrAbsolute(filePath, bidkingPath))
                .find((filePath) => /global-metadata\.dat$/i.test(filePath)) || null,
            il2cpp_output_dir: isDirectory(outputDirectory)
                ? relativeOrAbsolute(outputDirectory, bidkingPath)
                : null,
            analytics_json: files
                .map((filePath) => relativeOrAbsolute(filePath, bidkingPath))
                .find((filePath) => /il2cppOutput\/analytics\.json$/i.test(filePath.replace(/\\/g, "/"))) || null
        },
        pe_header_summary: parsePeHeader(path.join(bidkingPath, "BidKing.exe")),
        il2cpp_source_file_count: il2cppFiles.length,
        il2cpp_source_files: il2cppFiles.map((filePath) => relativeOrAbsolute(filePath, bidkingPath)),
        byte_size: files.reduce((sum, filePath) => {
            const stat = safeStat(filePath);
            return sum + (stat ? stat.size : 0);
        }, 0)
    };
}

function buildZipPackageInventory(zipPath) {
    const entries = listZipEntries(zipPath);
    const packageRoot = detectZipPackageRoot(entries);
    const fileEntries = entries.filter((entry) => !entry.is_directory && !entry.error);
    const relativeFiles = fileEntries.map((entry) => stripZipPackageRoot(entry.name, packageRoot));
    const relativeEntries = fileEntries.map((entry) => ({
        ...entry,
        relative_name: stripZipPackageRoot(entry.name, packageRoot)
    }));
    const findRelativeFile = (matcher) => {
        const entry = relativeEntries.find((candidate) => matcher(candidate.relative_name));
        return entry ? entry.relative_name : null;
    };
    const hasRelativeDirectory = (directoryName) => entries.some((entry) => {
        const relativeName = stripZipPackageRoot(entry.name, packageRoot);
        return relativeName === directoryName
            || relativeName === `${directoryName}/`
            || relativeName.startsWith(`${directoryName}/`);
    });
    const topLevelFiles = relativeFiles
        .filter((name) => name && !name.includes("/"))
        .sort();
    const topLevelDirectories = Array.from(new Set(relativeFiles
        .filter((name) => name && name.includes("/"))
        .map((name) => name.split("/")[0])))
        .sort();
    const tableFiles = relativeFiles
        .filter((name) => /^BidKing_Data\/StreamingAssets\/Tables\/[^/]+\.txt$/i.test(name))
        .sort();
    const hotUpdateAssemblies = relativeFiles
        .filter((name) => /^BidKing_Data\/StreamingAssets\/dll\/.*\.(dll|pdb)\.bytes$/i.test(name))
        .sort();
    const managedAssemblies = relativeFiles
        .filter((name) => /\/Managed\/.*\.dll$/i.test(name) || /^Managed\/.*\.dll$/i.test(name))
        .sort();

    return {
        source_type: "zip",
        source_path: zipPath,
        exists: isFile(zipPath),
        package_root: packageRoot,
        file_count: fileEntries.length,
        top_level_files: topLevelFiles,
        top_level_directories: topLevelDirectories,
        detected_files: {
            exe: findRelativeFile((name) => name === "BidKing.exe"),
            baselib: findRelativeFile((name) => name === "baselib.dll"),
            gameassembly: findRelativeFile((name) => name === "GameAssembly.dll"),
            unityplayer: findRelativeFile((name) => name === "UnityPlayer.dll"),
            data_dir: hasRelativeDirectory("BidKing_Data") ? "BidKing_Data" : null,
            global_metadata: findRelativeFile((name) => /global-metadata\.dat$/i.test(name)),
            il2cpp_output_dir: hasRelativeDirectory("BidKing_BackUpThisFolder_ButDontShipItWithYourGame/il2cppOutput")
                ? "BidKing_BackUpThisFolder_ButDontShipItWithYourGame/il2cppOutput"
                : null,
            analytics_json: findRelativeFile((name) => /il2cppOutput\/analytics\.json$/i.test(name))
        },
        pe_header_summary: findRelativeFile((name) => name === "BidKing.exe")
            ? { format: "zip_member_not_extracted" }
            : null,
        il2cpp_source_file_count: 0,
        il2cpp_source_files: [],
        zip_member_summary: {
            total_entries: entries.length,
            table_file_count: tableFiles.length,
            table_files: tableFiles,
            hot_update_assembly_count: hotUpdateAssemblies.length,
            hot_update_assemblies: hotUpdateAssemblies,
            managed_assembly_count: managedAssemblies.length,
            managed_assemblies: managedAssemblies,
            list_errors: entries.filter((entry) => entry.error).map((entry) => entry.error)
        },
        byte_size: fileEntries.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0)
    };
}

function buildPackageInventory(bidkingPath) {
    if (isZipPath(bidkingPath) && isFile(bidkingPath)) {
        return buildZipPackageInventory(bidkingPath);
    }
    return buildDirectoryPackageInventory(bidkingPath);
}

function buildEvidenceAssessment(inventory, typeSummary, keywordSummary, analytics) {
    const missingRequiredForFullRecovery = [];
    if (!inventory.detected_files.data_dir) missingRequiredForFullRecovery.push("missing_BidKing_Data");
    if (!inventory.detected_files.global_metadata) missingRequiredForFullRecovery.push("missing_global_metadata_dat");
    if (!inventory.detected_files.gameassembly) missingRequiredForFullRecovery.push("missing_GameAssembly_dll");
    const zipMemberSummary = inventory.zip_member_summary || {};
    const hasManagedOrHotUpdateAssemblies = (zipMemberSummary.hot_update_assembly_count || 0) > 0
        || (zipMemberSummary.managed_assembly_count || 0) > 0;
    const hasStreamingTables = (zipMemberSummary.table_file_count || 0) > 0;
    const hasCompleteUnityRuntime = !!(
        inventory.detected_files.data_dir
        && inventory.detected_files.global_metadata
        && inventory.detected_files.gameassembly
    );
    if (inventory.il2cpp_source_file_count === 0 && !hasManagedOrHotUpdateAssemblies) {
        missingRequiredForFullRecovery.push("missing_Assembly_CSharp_il2cpp_sources_or_managed_hotupdate_assemblies");
    }

    const il2cppConvertedButNotCompiled = !!(
        analytics
        && isPlainObject(analytics.DataTable)
        && analytics.DataTable.option_convert_to_cpp === true
        && analytics.DataTable.option_compile_cpp === false
    );
    const noGameplayTypes = typeSummary.gameplay_type_count === 0 && !hasManagedOrHotUpdateAssemblies;
    const onlyPlayerShell = inventory.detected_files.exe
        && inventory.detected_files.baselib
        && !inventory.detected_files.data_dir
        && !inventory.detected_files.gameassembly
        && !inventory.detected_files.global_metadata;

    let mechanicsRecoveryStatus = "actionable_partial_mechanics";
    if (!inventory.exists) mechanicsRecoveryStatus = "source_path_missing";
    else if (hasCompleteUnityRuntime && hasStreamingTables && hasManagedOrHotUpdateAssemblies) {
        mechanicsRecoveryStatus = "complete_package_table_and_hotupdate_evidence_ready";
    } else if (hasCompleteUnityRuntime) {
        mechanicsRecoveryStatus = "complete_package_inventory_ready";
    }
    else if (onlyPlayerShell && noGameplayTypes) mechanicsRecoveryStatus = "insufficient_package_for_bid_mechanics";
    else if (missingRequiredForFullRecovery.length > 0 && noGameplayTypes) mechanicsRecoveryStatus = "metadata_missing_no_gameplay_types";
    else if (missingRequiredForFullRecovery.length > 0) mechanicsRecoveryStatus = "partial_reverse_engineering_only";

    const reverseEngineeringSourceAllowed = mechanicsRecoveryStatus === "actionable_partial_mechanics"
        || mechanicsRecoveryStatus === "complete_package_table_and_hotupdate_evidence_ready"
        || mechanicsRecoveryStatus === "complete_package_inventory_ready";
    const evidenceConfidence = mechanicsRecoveryStatus === "complete_package_table_and_hotupdate_evidence_ready"
        ? "medium"
        : (mechanicsRecoveryStatus === "actionable_partial_mechanics" ? "medium" : "low");

    return {
        mechanics_recovery_status: mechanicsRecoveryStatus,
        authority_adoption_allowed: false,
        reverse_engineering_source_allowed: reverseEngineeringSourceAllowed,
        default_config_update_allowed: false,
        core_refactor_recommended_now: false,
        evidence_confidence: evidenceConfidence,
        missing_required_for_full_recovery: missingRequiredForFullRecovery,
        risk_flags: [
            ...(il2cppConvertedButNotCompiled ? ["il2cpp_cpp_output_not_compiled_binary_logic"] : []),
            ...(noGameplayTypes ? ["no_detected_bid_or_auction_gameplay_types"] : []),
            ...(onlyPlayerShell ? ["package_looks_like_unity_player_shell_without_data"] : []),
            ...(hasCompleteUnityRuntime && hasStreamingTables ? ["complete_package_requires_table_schema_review_before_authority_use"] : []),
            "reverse_engineered_logic_is_not_authority_without_manual_validation"
        ],
        keyword_summary: keywordSummary
    };
}

function buildArchitectureImpact(assessment) {
    const canUseAsSource = assessment.reverse_engineering_source_allowed === true;
    const completePackageEvidence = [
        "complete_package_table_and_hotupdate_evidence_ready",
        "complete_package_inventory_ready"
    ].includes(assessment.mechanics_recovery_status);
    return {
        recommended_change_class: "RESEARCH_ONLY",
        live_path_touched: false,
        useful_now: completePackageEvidence ? [
            "complete Unity package inventory is now available as reverse-engineering intake",
            "StreamingAssets tables and hot-update assemblies can feed a source-owned mechanics report",
            "validation pressure: keep reverse-engineered findings as review-source artifacts, not default weights"
        ] : [
            "negative evidence: current BidKing package is not enough to recover bidding mechanics",
            "validation pressure: keep reverse-engineered findings as review-source artifacts, not default weights",
            "architecture direction: external mechanics should enter through a source-owned evidence lane and shadow gates"
        ],
        not_useful_now: completePackageEvidence ? [
            "inventory alone is not enough to rewrite estimator.js, default_config_bundle.js, or authority calibration",
            "table schemas and decompiled method semantics still need review-source artifacts",
            "manual validation and replay gates must pass before authority merge"
        ] : [
            "no safe basis to rewrite estimator.js, default_config_bundle.js, or authority calibration from this package",
            "no recovered item rarity, bid timing, opponent, settlement, or value formulas",
            "no executable Unity data folder or IL2CPP metadata for asset/game-state correlation"
        ],
        refactor_position: canUseAsSource
            ? "add a reverse_engineering_evidence source lane before considering model refactors"
            : "do not refactor core solver from this package; first acquire complete Unity data or authoritative samples",
        proposed_source_lane: [
            "bidking_decompile_inventory",
            "bidking_table_mechanics",
            "mechanics_candidate_extraction",
            "manual_mechanics_review",
            "shadow_replay_candidate",
            "authority_handoff_gate"
        ],
        hard_blocks_before_core_refactor: completePackageEvidence ? [
            "table schema review for Map/BidMap/RankMap/Drop/Item/Skill/Hero",
            "decompiled or string-backed method evidence tied to bid/value/count state transitions",
            "same-battle manual validation samples that pass existing replay gates",
            "explicit human approval before authority merge"
        ] : [
            "complete package with BidKing_Data/global-metadata/GameAssembly or source assemblies",
            "recovered gameplay classes/methods tied to bid/value/count state transitions",
            "same-battle manual validation samples that pass existing replay gates",
            "explicit human approval before authority merge"
        ]
    };
}

function buildBidKingDecompileAuditReport({ bidkingPath = DEFAULT_BIDKING_PATH } = {}) {
    const inventory = buildPackageInventory(bidkingPath);
    const absoluteIl2cppFiles = inventory.il2cpp_source_files.map((filePath) => path.join(bidkingPath, filePath));
    const analyticsPath = inventory.detected_files.analytics_json
        ? path.join(bidkingPath, inventory.detected_files.analytics_json)
        : null;
    const analytics = readJsonOptional(analyticsPath);
    const typeSummary = extractTypeNames(absoluteIl2cppFiles, bidkingPath);
    const keywordSummary = countKeywordHits(absoluteIl2cppFiles);
    const assessment = buildEvidenceAssessment(inventory, typeSummary, keywordSummary, analytics);
    const architectureImpact = buildArchitectureImpact(assessment);

    return {
        schema_version: "ak_bidking_decompile_audit_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: architectureImpact.recommended_change_class,
        inputs: {
            bidking_path: bidkingPath
        },
        summary: {
            mechanics_recovery_status: assessment.mechanics_recovery_status,
            evidence_confidence: assessment.evidence_confidence,
            authority_adoption_allowed: assessment.authority_adoption_allowed,
            reverse_engineering_source_allowed: assessment.reverse_engineering_source_allowed,
            default_config_update_allowed: assessment.default_config_update_allowed,
            core_refactor_recommended_now: assessment.core_refactor_recommended_now,
            il2cpp_source_file_count: inventory.il2cpp_source_file_count,
            gameplay_type_count: typeSummary.gameplay_type_count,
            streaming_table_file_count: inventory.zip_member_summary ? inventory.zip_member_summary.table_file_count : null,
            hot_update_assembly_count: inventory.zip_member_summary ? inventory.zip_member_summary.hot_update_assembly_count : null,
            managed_assembly_count: inventory.zip_member_summary ? inventory.zip_member_summary.managed_assembly_count : null,
            missing_required_for_full_recovery: assessment.missing_required_for_full_recovery
        },
        inventory,
        il2cpp_type_summary: typeSummary,
        analytics,
        assessment,
        architecture_impact: architectureImpact
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatBidKingDecompileAuditMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const inventory = report.inventory || {};
    const typeSummary = report.il2cpp_type_summary || {};
    const assessment = report.assessment || {};
    const impact = report.architecture_impact || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const missing = Array.isArray(summary.missing_required_for_full_recovery)
        ? summary.missing_required_for_full_recovery.join(", ")
        : "-";
    const gameplaySamples = Array.isArray(typeSummary.gameplay_type_samples) && typeSummary.gameplay_type_samples.length
        ? typeSummary.gameplay_type_samples.map((item) => `\`${item}\``).join(", ")
        : "`-`";
    const nonPluginSamples = Array.isArray(typeSummary.non_plugin_type_samples) && typeSummary.non_plugin_type_samples.length
        ? typeSummary.non_plugin_type_samples.slice(0, 20).map((item) => `\`${item}\``).join(", ")
        : "`-`";
    const zipSummary = inventory.zip_member_summary || {};
    const conclusion = summary.mechanics_recovery_status === "complete_package_table_and_hotupdate_evidence_ready"
        ? "Current `BidKing.zip` evidence is strong enough to continue source-owned mechanics extraction from StreamingAssets tables and hot-update assemblies. It is still not authority for default weights or solver rewrites until table schemas, method semantics, manual mechanics review, shadow replay, and authority handoff gates pass."
        : "Current local `BidKing` evidence is not strong enough to justify rewriting the solver, estimator, default weights, or authority calibration. Treat it as a reverse-engineering intake gap and acquire a complete package or source-level gameplay classes before any core refactor. If a complete build appears, route recovered mechanics through a source-owned evidence lane, manual mechanics review, shadow replay, and authority handoff gate before merge.";

    return `# BidKing decompile audit

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Source: \`${report.inputs ? report.inputs.bidking_path : "-"}\`
- Source type: \`${inventory.source_type || "-"}\`
- Mechanics recovery: \`${summary.mechanics_recovery_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Core refactor recommended now: \`${summary.core_refactor_recommended_now === true}\`
- Live/order/funds path touched: \`${impact.live_path_touched === true}\`

## Inventory

| signal | value |
| --- | --- |
| file count | \`${inventory.file_count ?? 0}\` |
| il2cpp source files | \`${inventory.il2cpp_source_file_count ?? 0}\` |
| top-level files | ${markdownCell(Array.isArray(inventory.top_level_files) ? inventory.top_level_files.join(", ") : "-")} |
| top-level dirs | ${markdownCell(Array.isArray(inventory.top_level_directories) ? inventory.top_level_directories.join(", ") : "-")} |
| BidKing_Data | \`${inventory.detected_files && inventory.detected_files.data_dir ? inventory.detected_files.data_dir : "-"}\` |
| GameAssembly.dll | \`${inventory.detected_files && inventory.detected_files.gameassembly ? inventory.detected_files.gameassembly : "-"}\` |
| UnityPlayer.dll | \`${inventory.detected_files && inventory.detected_files.unityplayer ? inventory.detected_files.unityplayer : "-"}\` |
| global-metadata.dat | \`${inventory.detected_files && inventory.detected_files.global_metadata ? inventory.detected_files.global_metadata : "-"}\` |
| StreamingAssets/Tables files | \`${zipSummary.table_file_count ?? "-"}\` |
| hot-update assemblies | \`${zipSummary.hot_update_assembly_count ?? "-"}\` |
| managed assemblies | \`${zipSummary.managed_assembly_count ?? "-"}\` |
| missing full recovery inputs | ${markdownCell(missing)} |
| PE format | \`${inventory.pe_header_summary && inventory.pe_header_summary.format ? inventory.pe_header_summary.format : "-"}\` |
| PE sections | ${markdownCell(inventory.pe_header_summary && Array.isArray(inventory.pe_header_summary.sections) ? inventory.pe_header_summary.sections.map((section) => section.name).join(", ") : "-")} |

## Decompiled Type Scan

- Total type comments: \`${typeSummary.total_type_count ?? 0}\`
- Non-plugin type comments: \`${typeSummary.non_plugin_type_count ?? 0}\`
- Gameplay-looking type comments: \`${typeSummary.gameplay_type_count ?? 0}\`
- Gameplay samples: ${gameplaySamples}
- Non-plugin samples: ${nonPluginSamples}

## Impact

- Useful now: ${(impact.useful_now || []).map((item) => `\`${item}\``).join(", ") || "`-`"}
- Not useful now: ${(impact.not_useful_now || []).map((item) => `\`${item}\``).join(", ") || "`-`"}
- Refactor position: \`${impact.refactor_position || "-"}\`
- Proposed source lane: ${(impact.proposed_source_lane || []).map((item) => `\`${item}\``).join(" -> ") || "`-`"}

## Conclusion

${conclusion}
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
    const { bidkingPath, outputPath } = resolveArgs(argv);
    const report = buildBidKingDecompileAuditReport({ bidkingPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingDecompileAuditMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_BIDKING_PATH,
    DEFAULT_BIDKING_ZIP_PATH,
    DEFAULT_OUTPUT_PATH,
    buildDirectoryPackageInventory,
    buildBidKingDecompileAuditReport,
    buildEvidenceAssessment,
    buildPackageInventory,
    buildZipPackageInventory,
    extractTypeNames,
    formatBidKingDecompileAuditMarkdown,
    main,
    parseUnzipListOutput,
    resolveArgs
};
