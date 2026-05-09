const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_SEARCH_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-public-authority-source-search-refresh-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.json"
);
const TARGET_ITEM_ID = 1106013;
const AUTHENTICATED_FILELIST_LINES = [
    "regex:.*BidKing_Data/StreamingAssets/Tables/(Item|Drop)\\.txt$",
    "regex:.*Tables/(Item|Drop)\\.txt$"
];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const attemptLogs = [];
    let generatedAt = null;
    let downloadDir = null;
    let depotDownloaderPath = null;
    let depotDownloaderVersion = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at requires an ISO timestamp");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else if (arg === "--download-dir") {
            index += 1;
            if (!argv[index]) throw new Error("--download-dir requires a path");
            downloadDir = path.resolve(String(argv[index]));
        } else if (arg.startsWith("--download-dir=")) {
            downloadDir = path.resolve(arg.slice("--download-dir=".length));
        } else if (arg === "--depotdownloader-path") {
            index += 1;
            if (!argv[index]) throw new Error("--depotdownloader-path requires a path");
            depotDownloaderPath = path.resolve(String(argv[index]));
        } else if (arg.startsWith("--depotdownloader-path=")) {
            depotDownloaderPath = path.resolve(arg.slice("--depotdownloader-path=".length));
        } else if (arg === "--depotdownloader-version") {
            index += 1;
            if (!argv[index]) throw new Error("--depotdownloader-version requires a value");
            depotDownloaderVersion = String(argv[index]);
        } else if (arg.startsWith("--depotdownloader-version=")) {
            depotDownloaderVersion = arg.slice("--depotdownloader-version=".length);
        } else if (arg === "--attempt-log") {
            index += 1;
            if (!argv[index]) throw new Error("--attempt-log requires id:exit_code:path");
            attemptLogs.push(parseAttemptLogArg(argv[index]));
        } else if (arg.startsWith("--attempt-log=")) {
            attemptLogs.push(parseAttemptLogArg(arg.slice("--attempt-log=".length)));
        } else {
            positional.push(arg);
        }
    }

    return {
        sourceSearchReportPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_SOURCE_SEARCH_REPORT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        downloadDir,
        depotDownloaderPath,
        depotDownloaderVersion,
        attemptLogs,
        generatedAt
    };
}

function parseAttemptLogArg(rawValue) {
    const [id, exitCodeText, ...pathParts] = String(rawValue).split(":");
    if (!id || !exitCodeText || !pathParts.length) {
        throw new Error("--attempt-log must be formatted as id:exit_code:path");
    }
    return {
        id,
        exit_code: Number(exitCodeText),
        path: path.resolve(pathParts.join(":"))
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

function safeSummary(report) {
    return report && report.summary && typeof report.summary === "object" ? report.summary : {};
}

function safeGates(report) {
    return report && report.gates && typeof report.gates === "object" ? report.gates : {};
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

function isDirectory(filePath) {
    const stat = safeStat(filePath);
    return !!stat && stat.isDirectory();
}

function walkFiles(rootPath, maxDepth = 8) {
    const results = [];
    if (!isDirectory(rootPath)) return results;

    function visit(currentPath, depth) {
        if (depth > maxDepth) return;
        for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
            const entryPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) visit(entryPath, depth + 1);
            if (entry.isFile()) results.push(entryPath);
        }
    }

    visit(rootPath, 0);
    return results.sort();
}

function redactSensitiveText(text) {
    return String(text || "")
        .replace(/(password)\s+([^\s]+)/gi, "$1 <redacted>")
        .replace(/(access\s+token)\s+([^\s]+)/gi, "$1 <redacted>")
        .replace(/(refresh\s+token)\s+([^\s]+)/gi, "$1 <redacted>");
}

function readAttemptLogs(attemptLogs = []) {
    return attemptLogs.map((entry) => ({
        id: entry.id,
        exit_code: Number(entry.exit_code),
        log_path: entry.path,
        output: redactSensitiveText(fs.existsSync(entry.path) ? fs.readFileSync(entry.path, "utf8") : "")
    }));
}

function findTableFiles(downloadDir) {
    const files = walkFiles(downloadDir || "");
    const itemFiles = files.filter((filePath) => path.basename(filePath).toLowerCase() === "item.txt");
    const dropFiles = files.filter((filePath) => path.basename(filePath).toLowerCase() === "drop.txt");
    return {
        item_files: itemFiles,
        drop_files: dropFiles
    };
}

function makeSnippet(line, token, radius = 120) {
    const text = String(line || "");
    const index = text.indexOf(String(token));
    if (index < 0) return text.slice(0, radius * 2);
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + String(token).length + radius);
    return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function scanItemRow(itemFiles, itemId) {
    for (const filePath of itemFiles) {
        if (!isFile(filePath)) continue;
        const lines = readPossiblyBase64TableFile(filePath).split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            if (new RegExp(`^\\s*${itemId}\\t`).test(lines[index])) {
                return {
                    file_path: filePath,
                    line_number: index + 1,
                    snippet: makeSnippet(lines[index], itemId)
                };
            }
        }
    }
    return null;
}

function readPossiblyBase64TableFile(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    const trimmed = text.trim();
    if (
        trimmed.length > 0
        && trimmed.length % 4 === 0
        && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)
        && !/[\t\r\n]/.test(trimmed)
    ) {
        try {
            const decoded = Buffer.from(trimmed, "base64").toString("utf8");
            if (decoded.includes("\t") && /^\d+\t/m.test(decoded)) return decoded;
        } catch (_error) {
            return text;
        }
    }
    return text;
}

function attemptBlockedByAccount(attempts) {
    return attempts.some((entry) => /not available from this account|requires a username and password or access token/i.test(entry.output || ""));
}

function buildNextAuthenticatedCommands({ sourceSummary = {}, downloadDir = null, depotDownloaderPath = null } = {}) {
    const appId = 4128580;
    const depotId = sourceSummary.current_full_client_depot_id || 4128581;
    const manifestId = sourceSummary.current_full_client_manifest_id || "7599723101430486725";
    const resolvedDownloadDir = "/tmp/ak_bidking_depot_4128581_tables_owned";
    const resolvedTool = depotDownloaderPath || "/tmp/ak_depotdownloader_3_4_0_arm64/DepotDownloader";
    const filelistPath = "/tmp/ak_bidking_4128581_tables_filelist.txt";

    return {
        filelist_path: filelistPath,
        filelist_lines: AUTHENTICATED_FILELIST_LINES.slice(),
        depotdownloader_command: [
            markdownShellQuote(resolvedTool),
            `-app ${appId}`,
            `-depot ${depotId}`,
            `-manifest ${manifestId}`,
            "-username <STEAM_USERNAME>",
            `-filelist ${markdownShellQuote(filelistPath)}`,
            `-dir ${markdownShellQuote(resolvedDownloadDir)}`,
            "-validate"
        ].join(" "),
        post_download_scan_command: [
            "npm run build:bidking-missing-item-source-recovery-scan --",
            "docs/research/2026-05-07-bidking-1106013-resolution-candidate-refresh.json",
            "docs/research/2026-05-07-bidking-1106013-authenticated-steam-source-recovery-scan.json",
            `--source=${markdownShellQuote(resolvedDownloadDir)}`,
            "--generated-at=<ISO_TIMESTAMP>"
        ].join(" "),
        post_scan_intake_command: [
            "npm run build:bidking-missing-item-authority-intake-template --",
            "docs/research/2026-05-07-bidking-1106013-resolution-candidate-refresh.json",
            "docs/research/2026-05-07-bidking-1106013-authenticated-steam-source-recovery-scan.json",
            "docs/research/2026-05-07-bidking-missing-item-authority-intake-template.json",
            "--generated-at=<ISO_TIMESTAMP>"
        ].join(" "),
        credential_policy: "Do not write Steam password, 2FA code, refresh token, or access token into repository files or logs."
    };
}

function markdownShellQuote(value) {
    return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function buildBidKingSteamDepotTableAcquisitionAttemptReport({
    sourceSearchReport = readJson(DEFAULT_SOURCE_SEARCH_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    downloadDir = null,
    depotDownloaderPath = null,
    depotDownloaderVersion = null,
    attempts = []
} = {}) {
    const sourceSummary = safeSummary(sourceSearchReport);
    const sourceGates = safeGates(sourceSearchReport);
    const tableFiles = findTableFiles(downloadDir);
    const sourceItemRow = scanItemRow(tableFiles.item_files, sourceSummary.target_item_id || TARGET_ITEM_ID);
    const tableFilesDownloaded = tableFiles.item_files.length > 0 && tableFiles.drop_files.length > 0;
    const sourceItemRowRecovered = Boolean(sourceItemRow);
    const steamAccountAccessBlocked = attemptBlockedByAccount(attempts);
    const downloaderAvailable = depotDownloaderPath ? isFile(depotDownloaderPath) : false;
    const recommendedNextAction = sourceItemRowRecovered
        ? "run_missing_item_staging_intake_and_table_reference_integrity_before_any_handoff"
        : steamAccountAccessBlocked
            ? "retry_with_owned_authenticated_steam_account_or_developer_export"
            : tableFilesDownloaded
                ? "acquire_developer_or_server_side_table_export_for_1106013"
                : "run_selective_depot_table_download_then_rescan_1106013";
    const unresolvedSourceBlocker = tableFilesDownloaded
        ? "downloaded_tables_missing_source_item_row_1106013"
        : steamAccountAccessBlocked
            ? "steam_depot_requires_owned_authenticated_account"
            : "steam_depot_tables_not_downloaded";

    return {
        schema_version: "ak_bidking_steam_depot_table_acquisition_attempt_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            source_search_report: "docs/research/2026-05-07-bidking-public-authority-source-search-refresh-report.json",
            download_dir: downloadDir,
            depotdownloader_path: depotDownloaderPath,
            depotdownloader_version: depotDownloaderVersion
        },
        summary: {
            target_item_id: sourceSummary.target_item_id || TARGET_ITEM_ID,
            current_full_client_depot_id: sourceSummary.current_full_client_depot_id || 4128581,
            current_full_client_build_id: sourceSummary.current_full_client_build_id || null,
            current_full_client_manifest_id: sourceSummary.current_full_client_manifest_id || null,
            download_attempted: attempts.length > 0 || tableFilesDownloaded,
            depotdownloader_available: downloaderAvailable,
            steam_account_access_blocked: steamAccountAccessBlocked,
            table_files_downloaded: tableFilesDownloaded,
            item_txt_file_count: tableFiles.item_files.length,
            drop_txt_file_count: tableFiles.drop_files.length,
            source_item_row_recovered: sourceItemRowRecovered,
            authority_intake_allowed: false,
            staging_item_ingest_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            recommended_next_action: recommendedNextAction,
            blockers: sourceItemRowRecovered
                ? [
                    "recovered_row_not_ingested",
                    "table_reference_integrity_not_rerun",
                    "authority_handoff_gate_closed"
                ]
                : [
                    unresolvedSourceBlocker,
                    "source_item_row_1106013_not_recovered",
                    "authority_handoff_gate_closed"
                ]
        },
        gates: {
            authority_intake_allowed: false,
            staging_item_ingest_allowed: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false,
            upstream_authority_intake_allowed: sourceGates.authority_intake_allowed === true
        },
        attempts,
        next_authenticated_commands: buildNextAuthenticatedCommands({
            sourceSummary,
            downloadDir,
            depotDownloaderPath
        }),
        table_scan: {
            download_dir: downloadDir,
            item_files: tableFiles.item_files,
            drop_files: tableFiles.drop_files,
            source_item_row: sourceItemRow
        },
        notes: [
            "This report records the acquisition attempt only.",
            "Downloaded rows, if present, still require staging ingest and reference integrity checks.",
            "No runtime estimator config or authority handoff gate is updated by this report."
        ]
    };
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

function formatBidKingSteamDepotTableAcquisitionAttemptMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = safeSummary(report);
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const attemptRows = (report.attempts || []).map((entry) => (
        `| ${markdownCode(entry.id)} | ${markdownCode(entry.exit_code)} | ${markdownCell(String(entry.output || "").slice(0, 220))} |`
    )).join("\n");

    return `# BidKing Steam depot table acquisition attempt

- Change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- Recommended change class: \`${report.recommended_change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Target item id: \`${summary.target_item_id || TARGET_ITEM_ID}\`
- Current full-client depot: \`${summary.current_full_client_depot_id || "-"}\`
- Download attempted: \`${summary.download_attempted === true}\`
- DepotDownloader available: \`${summary.depotdownloader_available === true}\`
- Steam account access blocked: \`${summary.steam_account_access_blocked === true}\`
- Table files downloaded: \`${summary.table_files_downloaded === true}\`
- Source item row recovered: \`${summary.source_item_row_recovered === true}\`
- Authority intake allowed: \`${summary.authority_intake_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`
- Recommended next action: \`${summary.recommended_next_action || "-"}\`

## Attempts

| attempt | exit code | evidence |
| --- | ---: | --- |
${attemptRows || "| `-` | `-` | - |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Next Authenticated Commands

Create filelist \`${report.next_authenticated_commands.filelist_path}\` with:

\`\`\`text
${(report.next_authenticated_commands.filelist_lines || []).join("\n")}
\`\`\`

Run selective table download with an owned Steam account:

\`\`\`bash
${report.next_authenticated_commands.depotdownloader_command}
\`\`\`

Then scan the downloaded tables:

\`\`\`bash
${report.next_authenticated_commands.post_download_scan_command}
\`\`\`

## Decision

Downloaded full-client tables only count as authority when the raw \`Item.txt\` row is present. If the downloaded tables still miss \`1106013\`, continue with developer/server-side table export or an independently sourced complete table package. Do not synthesize \`1106013\`, do not drop the \`1066 -> 1106013\` tuple, and do not update defaults from this attempt.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingSteamDepotTableAcquisitionAttemptReport({
        sourceSearchReport: readJson(args.sourceSearchReportPath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        downloadDir: args.downloadDir,
        depotDownloaderPath: args.depotDownloaderPath,
        depotDownloaderVersion: args.depotDownloaderVersion,
        attempts: readAttemptLogs(args.attemptLogs)
    });
    writeJson(args.outputPath, report);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatBidKingSteamDepotTableAcquisitionAttemptMarkdown(report, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    buildBidKingSteamDepotTableAcquisitionAttemptReport,
    formatBidKingSteamDepotTableAcquisitionAttemptMarkdown,
    main,
    parseAttemptLogArg,
    redactSensitiveText,
    resolveArgs
};
