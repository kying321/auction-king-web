const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-resolution-candidate-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-source-recovery-scan-report.json"
);
const DEFAULT_SCAN_SOURCES = (process.env.BIDKING_SOURCE_SCAN_PATHS
    ? process.env.BIDKING_SOURCE_SCAN_PATHS.split(path.delimiter)
    : [
        path.join(ROOT_DIR, "external", "BidKing_zip_extract_min"),
        path.join(ROOT_DIR, "external", "BidKing.zip"),
        path.join(ROOT_DIR, "external", "BidKing")
    ]).filter(Boolean);
const TEXT_EXTENSIONS = new Set([
    ".txt",
    ".json",
    ".csv",
    ".xml",
    ".manifest",
    ".md",
    ".log",
    ".ini",
    ".cfg",
    ".bytes"
]);
const MAX_TEXT_SCAN_BYTES = 8 * 1024 * 1024;

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const scanSources = [];
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--source") {
            index += 1;
            if (!argv[index]) throw new Error("--source 需要提供路径");
            scanSources.push(path.resolve(String(argv[index])));
        } else if (arg.startsWith("--source=")) {
            scanSources.push(path.resolve(arg.slice("--source=".length)));
        } else if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        missingItemCandidateReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        scanSources: scanSources.length ? scanSources : DEFAULT_SCAN_SOURCES.filter((entry) => fs.existsSync(entry)),
        generatedAt
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function safeStat(filePath) {
    try {
        return fs.statSync(filePath);
    } catch (_error) {
        return null;
    }
}

function isDirectory(filePath) {
    const stat = safeStat(filePath);
    return !!stat && stat.isDirectory();
}

function isFile(filePath) {
    const stat = safeStat(filePath);
    return !!stat && stat.isFile();
}

function uniqueSortedNumbers(values) {
    return Array.from(new Set((values || []).map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function makePublicPathAliases() {
    const homeDir = os.homedir();
    return [
        [ROOT_DIR, "<repo>"],
        [path.join(homeDir, "Downloads", "BidKing_zip_extract_min"), "<local>/BidKing_zip_extract_min"],
        [path.join(homeDir, "Downloads", "BidKing"), "<local>/BidKing"],
        [path.join(homeDir, "Library", "Application Support", "Steam", "steamapps"), "<steam>/steamapps"],
        [homeDir, "<home>"]
    ];
}

function isWithinPath(basePath, candidatePath) {
    const relative = path.relative(path.resolve(basePath), path.resolve(candidatePath));
    return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function formatPublicPath(value) {
    const text = String(value || "");
    if (!path.isAbsolute(text)) return text;
    const match = makePublicPathAliases().find(([basePath]) => isWithinPath(basePath, text));
    if (!match) return text;
    const [basePath, alias] = match;
    const relative = path.relative(path.resolve(basePath), path.resolve(text));
    return relative ? `${alias}/${relative.split(path.sep).join("/")}` : alias;
}

function sanitizePublicPaths(value) {
    if (Array.isArray(value)) return value.map((entry) => sanitizePublicPaths(entry));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizePublicPaths(entry)]));
    }
    if (typeof value === "string") return formatPublicPath(value);
    return value;
}

function redactSkippedFileDetails(report) {
    (report.source_scans || []).forEach((sourceScan) => {
        Object.values(sourceScan.item_scans || {}).forEach((itemScan) => {
            if (!Array.isArray(itemScan.skipped_files) || itemScan.skipped_files.length === 0) return;
            itemScan.skipped_file_details_redacted = true;
            itemScan.skipped_files = [];
        });
    });
    return report;
}

function normalizeZipName(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function walkFiles(rootPath, maxDepth = 8) {
    const results = [];
    if (!isDirectory(rootPath)) return results;

    function visit(currentPath, depth) {
        if (depth > maxDepth) return;
        for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
            const entryPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath, depth + 1);
            } else if (entry.isFile()) {
                results.push(entryPath);
            }
        }
    }

    visit(rootPath, 0);
    return results.sort();
}

function isTextCandidate(filePath, size = null) {
    const normalized = String(filePath || "");
    const ext = path.extname(normalized).toLowerCase();
    const basename = path.basename(normalized).toLowerCase();
    const candidate = TEXT_EXTENSIONS.has(ext)
        || basename === "fileversion"
        || basename === "filediff.txt"
        || basename === "filelist.txt"
        || normalized.includes("/Tables/");
    if (!candidate) return false;
    if (Number.isFinite(Number(size)) && Number(size) > MAX_TEXT_SCAN_BYTES) return false;
    return true;
}

function makeSnippet(line, token, radius = 120) {
    const text = String(line || "");
    const index = text.indexOf(String(token));
    if (index < 0) return text.slice(0, radius * 2);
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + String(token).length + radius);
    return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function classifyTextHit({ filePath = "", memberPath = "", line = "" }, itemId) {
    const normalizedPath = String(memberPath || filePath || "").replace(/\\/g, "/");
    const basename = path.basename(normalizedPath).toLowerCase();
    if (basename === "item.txt" && new RegExp(`^\\s*${itemId}\\t`).test(String(line))) {
        return "source_item_row";
    }
    if (basename === "filelist.txt" || basename === "filediff.txt" || basename.endsWith(".manifest")) {
        return "path_hint";
    }
    if (basename === "drop.txt") return "drop_reference";
    if (/item/i.test(basename)) return "item_related_reference";
    return "text_reference";
}

function buildHit({ sourcePath, sourceType, filePath = null, memberPath = null, lineNumber = null, line = "", itemId }) {
    const classification = classifyTextHit({ filePath, memberPath, line }, itemId);
    return {
        source_path: sourcePath,
        source_type: sourceType,
        file_path: filePath,
        member_path: memberPath,
        relative_path: filePath && sourceType === "directory" ? path.relative(sourcePath, filePath) : null,
        line_number: lineNumber,
        hit_type: classification,
        snippet: makeSnippet(line, itemId)
    };
}

function scanTextContent({ text, itemId, sourcePath, sourceType, filePath = null, memberPath = null }) {
    const token = String(itemId);
    const hits = [];
    String(text || "").split(/\r?\n/).forEach((line, index) => {
        if (!line.includes(token)) return;
        hits.push(buildHit({
            sourcePath,
            sourceType,
            filePath,
            memberPath,
            lineNumber: index + 1,
            line,
            itemId
        }));
    });
    return hits;
}

function partitionHits(hits) {
    return {
        source_item_row_hits: hits.filter((entry) => entry.hit_type === "source_item_row"),
        path_hint_hits: hits.filter((entry) => entry.hit_type === "path_hint"),
        reference_hits: hits.filter((entry) => entry.hit_type !== "source_item_row" && entry.hit_type !== "path_hint"),
        all_text_hits: hits
    };
}

function scanDirectoryForItemId(sourcePath, itemId) {
    const pathHintHits = [];
    const textHits = [];
    const skipped = [];
    for (const filePath of walkFiles(sourcePath)) {
        if (filePath.includes(`${path.sep}node_modules${path.sep}`)) continue;
        if (filePath.includes(`${path.sep}.git${path.sep}`)) continue;
        const stat = safeStat(filePath);
        if (String(filePath).includes(String(itemId))) {
            pathHintHits.push({
                source_path: sourcePath,
                source_type: "directory",
                file_path: filePath,
                relative_path: path.relative(sourcePath, filePath),
                hit_type: "path_hint"
            });
        }
        if (!stat || !isTextCandidate(filePath, stat.size)) {
            skipped.push({ file_path: filePath, reason: "not_text_candidate_or_too_large", size: stat ? stat.size : null });
            continue;
        }
        try {
            const text = fs.readFileSync(filePath, "utf8");
            textHits.push(...scanTextContent({
                text,
                itemId,
                sourcePath,
                sourceType: "directory",
                filePath
            }));
        } catch (error) {
            skipped.push({ file_path: filePath, reason: "read_failed", error: error.message });
        }
    }
    return {
        source_path: sourcePath,
        source_type: "directory",
        exists: isDirectory(sourcePath),
        scanned_file_count: walkFiles(sourcePath).length,
        skipped_file_count: skipped.length,
        path_hint_hits: pathHintHits.concat(partitionHits(textHits).path_hint_hits),
        skipped_files: skipped.slice(0, 80),
        source_item_row_hits: partitionHits(textHits).source_item_row_hits,
        reference_hits: partitionHits(textHits).reference_hits,
        all_text_hits: textHits
    };
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
    } catch (_error) {
        return [];
    }
}

function readZipMember(zipPath, memberPath) {
    return childProcess.execFileSync("unzip", ["-p", zipPath, memberPath], {
        encoding: "utf8",
        maxBuffer: Math.max(MAX_TEXT_SCAN_BYTES, 16 * 1024 * 1024)
    });
}

function scanZipForItemId(sourcePath, itemId) {
    const entries = listZipEntries(sourcePath);
    const pathHintHits = [];
    const textHits = [];
    const skipped = [];

    for (const entry of entries) {
        if (entry.is_directory) continue;
        if (entry.name.includes(String(itemId))) {
            pathHintHits.push({
                source_path: sourcePath,
                source_type: "zip",
                member_path: entry.name,
                hit_type: "path_hint"
            });
        }
        if (!isTextCandidate(entry.name, entry.size)) {
            skipped.push({ member_path: entry.name, reason: "not_text_candidate_or_too_large", size: entry.size });
            continue;
        }
        try {
            const text = readZipMember(sourcePath, entry.name);
            textHits.push(...scanTextContent({
                text,
                itemId,
                sourcePath,
                sourceType: "zip",
                memberPath: entry.name
            }));
        } catch (error) {
            skipped.push({ member_path: entry.name, reason: "read_failed", error: error.message });
        }
    }

    return {
        source_path: sourcePath,
        source_type: "zip",
        exists: isFile(sourcePath),
        scanned_file_count: entries.filter((entry) => !entry.is_directory).length,
        skipped_file_count: skipped.length,
        path_hint_hits: pathHintHits.concat(partitionHits(textHits).path_hint_hits),
        skipped_files: skipped.slice(0, 80),
        source_item_row_hits: partitionHits(textHits).source_item_row_hits,
        reference_hits: partitionHits(textHits).reference_hits,
        all_text_hits: textHits
    };
}

function scanSourceForItemId(sourcePath, itemId) {
    if (/\.zip$/i.test(String(sourcePath || ""))) {
        return scanZipForItemId(sourcePath, itemId);
    }
    if (isDirectory(sourcePath)) {
        return scanDirectoryForItemId(sourcePath, itemId);
    }
    return {
        source_path: sourcePath,
        source_type: "missing",
        exists: false,
        scanned_file_count: 0,
        skipped_file_count: 0,
        path_hint_hits: [],
        source_item_row_hits: [],
        reference_hits: [],
        all_text_hits: [],
        skipped_files: []
    };
}

function buildCandidateItems(missingItemCandidateReport) {
    const explicit = (missingItemCandidateReport.missing_item_candidates || [])
        .map((entry) => Number(entry.item_id))
        .filter(Number.isFinite);
    const summary = missingItemCandidateReport.summary || {};
    return uniqueSortedNumbers(explicit.length ? explicit : summary.project_relevant_missing_item_ids);
}

function collectItemReport(itemId, sourceScanResults) {
    const itemSourceResults = sourceScanResults.map((source) => {
        const scan = source.item_scans[String(itemId)] || {};
        return {
            source_path: source.source_path,
            source_type: source.source_type,
            exists: source.exists,
            source_item_row_hits: scan.source_item_row_hits || [],
            reference_hits: scan.reference_hits || [],
            path_hint_hits: scan.path_hint_hits || []
        };
    });
    const sourceItemRowHits = itemSourceResults.flatMap((entry) => entry.source_item_row_hits);
    const referenceHits = itemSourceResults.flatMap((entry) => entry.reference_hits);
    const pathHintHits = itemSourceResults.flatMap((entry) => entry.path_hint_hits);
    return {
        item_id: itemId,
        source_item_row_recovered: sourceItemRowHits.length > 0,
        source_recovery_status: sourceItemRowHits.length > 0
            ? "local_candidate_found_requires_ingest_and_integrity_rerun"
            : "not_found_in_local_source_candidates",
        source_item_row_hit_count: sourceItemRowHits.length,
        reference_hit_count: referenceHits.length,
        path_hint_hit_count: pathHintHits.length,
        source_item_row_hits: sourceItemRowHits,
        reference_hits: referenceHits,
        path_hint_hits: pathHintHits,
        source_results: itemSourceResults,
        authority_action_allowed: false
    };
}

function buildBidKingMissingItemSourceRecoveryScanReport({
    missingItemCandidateReport = readJson(DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH),
    scanSources = DEFAULT_SCAN_SOURCES.filter((entry) => fs.existsSync(entry)),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const itemIds = buildCandidateItems(missingItemCandidateReport);
    const sourceScanResults = scanSources.map((sourcePath) => {
        const itemScans = {};
        itemIds.forEach((itemId) => {
            itemScans[String(itemId)] = scanSourceForItemId(sourcePath, itemId);
        });
        const firstScan = itemScans[String(itemIds[0])] || {};
        return {
            source_path: sourcePath,
            source_type: firstScan.source_type || (/\.zip$/i.test(sourcePath) ? "zip" : "directory"),
            exists: firstScan.exists === true,
            scanned_file_count: firstScan.scanned_file_count || 0,
            skipped_file_count: firstScan.skipped_file_count || 0,
            item_scans: itemScans
        };
    });
    const itemReports = itemIds.map((itemId) => collectItemReport(itemId, sourceScanResults));
    const recoveredItems = itemReports.filter((entry) => entry.source_item_row_recovered);
    const allRecovered = itemReports.length > 0 && recoveredItems.length === itemReports.length;

    const report = {
        schema_version: "ak_bidking_missing_item_source_recovery_scan_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            missing_item_candidate_report: paths.missingItemCandidateReportPath || DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH,
            scan_sources: scanSources
        },
        summary: {
            scanned_source_count: scanSources.length,
            project_relevant_missing_item_ids: itemIds,
            source_item_row_recovered_count: recoveredItems.length,
            source_item_row_recovered_item_ids: recoveredItems.map((entry) => entry.item_id),
            source_item_row_recovered_for_project_scope: allRecovered,
            reference_hit_count: itemReports.reduce((total, entry) => total + entry.reference_hit_count, 0),
            path_hint_hit_count: itemReports.reduce((total, entry) => total + entry.path_hint_hit_count, 0),
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            promotion_allowed: false,
            recommended_next_action: allRecovered
                ? "ingest_recovered_item_rows_then_rerun_table_reference_integrity_before_replay"
                : "acquire_additional_client_or_authoritative_capture_for_missing_item_rows",
            blockers: allRecovered
                ? ["recovered_item_rows_not_ingested_or_integrity_verified"]
                : ["source_item_rows_not_found_in_local_candidates"],
            warnings: [
                "reference hits prove the missing item is referenced, not recovered",
                "path hints and neighboring rows are not authoritative item rows"
            ]
        },
        gates: {
            source_item_row_recovered_for_project_scope: allRecovered,
            recovered_rows_ingested: false,
            table_reference_integrity_clean_after_recovery: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        item_recovery: itemReports,
        source_scans: sourceScanResults,
        notes: [
            "This scan searches local candidate sources only and does not mutate source tables.",
            "A source Item row must be ingested and table-reference integrity rerun before any replay promotion.",
            "Skipped file paths are counted but not published in public artifacts.",
            "Default estimator config and authority handoff remain closed."
        ]
    };
    return sanitizePublicPaths(redactSkippedFileDetails(report));
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function formatBidKingMissingItemSourceRecoveryScanMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const rows = (report.item_recovery || []).map((entry) => (
        `| ${markdownCode(entry.item_id)} | ${markdownCode(entry.source_item_row_recovered)} | ${markdownCode(entry.source_item_row_hit_count)} | ${markdownCode(entry.reference_hit_count)} | ${markdownCode(entry.path_hint_hit_count)} | ${markdownCode(entry.source_recovery_status)} |`
    )).join("\n");
    const sourceRows = (report.source_scans || []).map((entry) => (
        `| ${markdownCell(entry.source_path)} | ${markdownCode(entry.source_type)} | ${markdownCode(entry.exists)} | ${markdownCode(entry.scanned_file_count)} | ${markdownCode(entry.skipped_file_count)} |`
    )).join("\n");

    return `# BidKing missing item source recovery scan

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Missing item ids: ${markdownCell(JSON.stringify(summary.project_relevant_missing_item_ids || []))}
- Source item row recovered: \`${summary.source_item_row_recovered_for_project_scope === true}\`
- Recovered item row count: \`${summary.source_item_row_recovered_count ?? 0}\`
- Reference hit count: \`${summary.reference_hit_count ?? 0}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Item Recovery

| item id | source row recovered | source row hits | reference hits | path hints | status |
| --- | --- | --- | --- | --- | --- |
${rows || "| `-` | `false` | `0` | `0` | `0` | `-` |"}

## Sources

| source | type | exists | scanned files | skipped files |
| --- | --- | --- | --- | --- |
${sourceRows || "| - | `-` | `false` | `0` | `0` |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Local source recovery scan does not authorize table mutation, tuple exclusion, table-backed replay promotion, authority handoff, or default config updates. Source item rows must be recovered, ingested, and revalidated by table-reference integrity before any algorithm evidence can advance.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const missingItemCandidateReport = readJson(args.missingItemCandidateReportPath);
    const report = buildBidKingMissingItemSourceRecoveryScanReport({
        missingItemCandidateReport,
        scanSources: args.scanSources,
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            missingItemCandidateReportPath: args.missingItemCandidateReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingMissingItemSourceRecoveryScanMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SCAN_SOURCES,
    buildBidKingMissingItemSourceRecoveryScanReport,
    classifyTextHit,
    formatBidKingMissingItemSourceRecoveryScanMarkdown,
    main,
    parseUnzipListOutput,
    resolveArgs,
    scanDirectoryForItemId,
    scanSourceForItemId,
    scanZipForItemId
};
