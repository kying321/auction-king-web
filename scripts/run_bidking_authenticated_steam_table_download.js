const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_ATTEMPT_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-authenticated-steam-table-download-runner-report.json"
);
const DEFAULT_FILELIST_PATH = "/tmp/ak_bidking_4128581_tables_filelist.txt";
const DEFAULT_DOWNLOAD_DIR = "/tmp/ak_bidking_depot_4128581_tables_owned";
const DEFAULT_DEPOTDOWNLOADER_PATH = "/tmp/ak_depotdownloader_3_4_0_arm64/DepotDownloader";
const DEFAULT_DOWNLOADER_TIMEOUT_MS = 5000;
const LOGIN_PROMPT_BLOCKED_MODE = "blocked_noninteractive_password_prompt";
const LEGACY_LOGIN_PROMPT_MODE = "legacy_noninteractive_password_prompt";
const SAFE_EXECUTE_AUTH_MODES = new Set(["remember-password", "qr"]);
const FILELIST_LINES = [
    "regex:.*BidKing_Data/StreamingAssets/Tables/(Item|Drop)\\.txt$",
    "regex:.*Tables/(Item|Drop)\\.txt$"
];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;
    let username = null;
    let execute = false;
    let filelistPath = DEFAULT_FILELIST_PATH;
    let downloadDir = DEFAULT_DOWNLOAD_DIR;
    let depotDownloaderPath = DEFAULT_DEPOTDOWNLOADER_PATH;
    let timeoutMs = DEFAULT_DOWNLOADER_TIMEOUT_MS;
    let authMode = null;
    let usernameEnv = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--execute") {
            execute = true;
        } else if (arg === "--username") {
            index += 1;
            if (!argv[index]) throw new Error("--username requires a value");
            username = String(argv[index]);
        } else if (arg.startsWith("--username=")) {
            username = arg.slice("--username=".length);
        } else if (arg === "--username-env") {
            index += 1;
            if (!argv[index]) throw new Error("--username-env requires a value");
            usernameEnv = String(argv[index]);
        } else if (arg.startsWith("--username-env=")) {
            usernameEnv = arg.slice("--username-env=".length);
        } else if (arg === "--auth-mode") {
            index += 1;
            if (!argv[index]) throw new Error("--auth-mode requires a value");
            authMode = normalizeAuthMode(argv[index]);
        } else if (arg.startsWith("--auth-mode=")) {
            authMode = normalizeAuthMode(arg.slice("--auth-mode=".length));
        } else if (arg === "--filelist-path") {
            index += 1;
            if (!argv[index]) throw new Error("--filelist-path requires a path");
            filelistPath = path.resolve(String(argv[index]));
        } else if (arg.startsWith("--filelist-path=")) {
            filelistPath = path.resolve(arg.slice("--filelist-path=".length));
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
        } else if (arg === "--timeout-ms") {
            index += 1;
            if (!argv[index]) throw new Error("--timeout-ms requires milliseconds");
            timeoutMs = resolveDownloaderTimeoutMs(argv[index]);
        } else if (arg.startsWith("--timeout-ms=")) {
            timeoutMs = resolveDownloaderTimeoutMs(arg.slice("--timeout-ms=".length));
        } else if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at requires an ISO timestamp");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        attemptReportPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_ATTEMPT_REPORT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        username,
        usernameEnv,
        authMode,
        execute,
        filelistPath,
        downloadDir,
        depotDownloaderPath,
        timeoutMs,
        generatedAt
    };
}

function resolveDownloaderTimeoutMs(value = DEFAULT_DOWNLOADER_TIMEOUT_MS) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_DOWNLOADER_TIMEOUT_MS;
    return Math.min(Math.floor(numeric), DEFAULT_DOWNLOADER_TIMEOUT_MS);
}

function normalizeAuthMode(value = null) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const normalized = String(value).trim().toLowerCase().replace(/_/g, "-");
    if (normalized === "remember" || normalized === "rememberpassword") return "remember-password";
    if (SAFE_EXECUTE_AUTH_MODES.has(normalized)) return normalized;
    throw new Error(`Unsupported --auth-mode: ${value}`);
}

function resolveExecutionUsername({ username = null, usernameEnv = null, env = process.env } = {}) {
    if (username) return { username: String(username), source: "argument", envName: null };
    if (!usernameEnv) return { username: null, source: null, envName: null };
    const envName = String(usernameEnv);
    const envValue = env ? env[envName] : null;
    if (!envValue) return { username: null, source: "env_missing", envName };
    return { username: String(envValue), source: "env", envName };
}

function isExecutableFile(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch (_error) {
        return false;
    }
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

function buildDownloaderArgs({ attemptSummary = {}, username, filelistPath, downloadDir, authMode = null }) {
    const normalizedAuthMode = normalizeAuthMode(authMode);
    const args = [
        "-app",
        "4128580",
        "-depot",
        String(attemptSummary.current_full_client_depot_id || 4128581),
        "-manifest",
        String(attemptSummary.current_full_client_manifest_id || "7599723101430486725"),
        "-username",
        String(username || "<STEAM_USERNAME>"),
        "-filelist",
        filelistPath,
        "-dir",
        downloadDir,
        "-validate"
    ];
    if (normalizedAuthMode === "remember-password") args.push("-remember-password");
    if (normalizedAuthMode === "qr") args.push("-qr");
    return args;
}

function shellQuote(value) {
    return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function redactRunnerText(text, username = "") {
    let redacted = String(text || "");
    if (username) {
        redacted = redacted.split(String(username)).join("<STEAM_USERNAME>");
    }
    return redacted
        .replace(/(password)\s+([^\s]+)/gi, "$1 <redacted>")
        .replace(/(access\s+token)\s+([^\s]+)/gi, "$1 <redacted>")
        .replace(/(refresh\s+token)\s+([^\s]+)/gi, "$1 <redacted>");
}

function summarizeDownloaderResult(downloaderResult = null) {
    const errorCode = downloaderResult && downloaderResult.error && downloaderResult.error.code
        ? String(downloaderResult.error.code)
        : null;
    return {
        exit_code: downloaderResult ? downloaderResult.status : null,
        signal: downloaderResult ? (downloaderResult.signal || null) : null,
        error_code: errorCode,
        timed_out: errorCode === "ETIMEDOUT"
    };
}

function getDownloaderRecommendedNextAction({
    sourceItemRow = null,
    execute = false,
    authMode = null,
    downloadBlockedReason = null,
    downloaderSummary = {}
} = {}) {
    if (sourceItemRow) return "run_source_recovery_scan_then_authority_intake_audit";
    if (downloadBlockedReason === "missing_steam_username_env") {
        return "set_steam_username_env_and_rerun_with_safe_auth_mode";
    }
    if (downloadBlockedReason === "missing_depotdownloader_binary") {
        return "install_depotdownloader_and_rerun_with_safe_auth_mode";
    }
    if (authMode === LOGIN_PROMPT_BLOCKED_MODE) {
        return "rerun_with_qr_or_remember_password_or_developer_export";
    }
    if (downloaderSummary.timed_out) return "retry_selective_download_or_use_developer_export_after_timeout";
    if (downloaderSummary.signal || downloaderSummary.error_code) {
        return "retry_with_interactive_depotdownloader_or_developer_export";
    }
    return execute
        ? "inspect_depotdownloader_output_and_retry_or_use_developer_export"
        : "rerun_with_execute_and_owned_steam_username";
}

function findTableFiles(downloadDir) {
    const files = [];
    if (!fs.existsSync(downloadDir)) return { item_files: [], drop_files: [] };

    function visit(currentPath) {
        for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
            const entryPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) visit(entryPath);
            if (entry.isFile()) files.push(entryPath);
        }
    }

    visit(downloadDir);
    return {
        item_files: files.filter((filePath) => path.basename(filePath).toLowerCase() === "item.txt"),
        drop_files: files.filter((filePath) => path.basename(filePath).toLowerCase() === "drop.txt")
    };
}

function scanSourceItemRow(itemFiles, itemId) {
    for (const filePath of itemFiles) {
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            if (new RegExp(`^\\s*${itemId}\\t`).test(lines[index])) {
                return {
                    file_path: filePath,
                    line_number: index + 1,
                    snippet: lines[index].slice(0, 240)
                };
            }
        }
    }
    return null;
}

function buildAuthenticatedSteamTableDownloadPlan({
    attemptReport = readJson(DEFAULT_ATTEMPT_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    filelistPath = DEFAULT_FILELIST_PATH,
    downloadDir = DEFAULT_DOWNLOAD_DIR,
    depotDownloaderPath = DEFAULT_DEPOTDOWNLOADER_PATH,
    username = null,
    usernameEnv = null,
    execute = false,
    authMode = null,
    downloaderAvailable = null,
    downloaderResult = null
} = {}) {
    const attemptSummary = safeSummary(attemptReport);
    const normalizedAuthMode = normalizeAuthMode(authMode);
    const usernameResolution = resolveExecutionUsername({ username, usernameEnv });
    const resolvedDownloaderAvailable = typeof downloaderAvailable === "boolean"
        ? downloaderAvailable
        : isExecutableFile(depotDownloaderPath);
    const summaryAuthMode = normalizedAuthMode
        || (execute && downloaderResult ? LEGACY_LOGIN_PROMPT_MODE : null)
        || (execute ? LOGIN_PROMPT_BLOCKED_MODE : "dry_run");
    const downloadBlockedReason = usernameResolution.source === "env_missing"
        ? "missing_steam_username_env"
        : execute && !downloaderResult && !resolvedDownloaderAvailable
            ? "missing_depotdownloader_binary"
        : summaryAuthMode === LOGIN_PROMPT_BLOCKED_MODE
            ? "execute_requires_qr_or_remember_password_to_avoid_noninteractive_password_prompt"
            : null;
    const downloaderArgs = buildDownloaderArgs({
        attemptSummary,
        username,
        filelistPath,
        downloadDir,
        authMode: normalizedAuthMode
    });
    const tableFiles = findTableFiles(downloadDir);
    const sourceItemRow = scanSourceItemRow(tableFiles.item_files, attemptSummary.target_item_id || 1106013);
    const tableFilesDownloaded = tableFiles.item_files.length > 0 && tableFiles.drop_files.length > 0;
    const downloaderSummary = summarizeDownloaderResult(downloaderResult);

    writeText(filelistPath, `${FILELIST_LINES.join("\n")}\n`);

    return {
        schema_version: "ak_bidking_authenticated_steam_table_download_runner_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        summary: {
            target_item_id: attemptSummary.target_item_id || 1106013,
            current_full_client_depot_id: attemptSummary.current_full_client_depot_id || 4128581,
            execute_requested: execute === true,
            username_provided: Boolean(usernameResolution.username),
            username_source: usernameResolution.source,
            username_env: usernameResolution.envName,
            auth_mode: summaryAuthMode,
            safe_execute_auth_mode: SAFE_EXECUTE_AUTH_MODES.has(normalizedAuthMode),
            depotdownloader_available: resolvedDownloaderAvailable,
            download_blocked_reason: downloadBlockedReason,
            download_attempted: Boolean(downloaderResult),
            downloader_exit_code: downloaderSummary.exit_code,
            downloader_signal: downloaderSummary.signal,
            downloader_error_code: downloaderSummary.error_code,
            downloader_timed_out: downloaderSummary.timed_out,
            table_files_downloaded: tableFilesDownloaded,
            item_txt_file_count: tableFiles.item_files.length,
            drop_txt_file_count: tableFiles.drop_files.length,
            source_item_row_recovered: Boolean(sourceItemRow),
            authority_intake_allowed: false,
            staging_item_ingest_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            recommended_next_action: getDownloaderRecommendedNextAction({
                sourceItemRow,
                execute,
                authMode: summaryAuthMode,
                downloadBlockedReason,
                downloaderSummary
            })
        },
        gates: {
            authority_intake_allowed: false,
            staging_item_ingest_allowed: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        plan: {
            filelist_path: filelistPath,
            filelist_lines: FILELIST_LINES.slice(),
            download_dir: downloadDir,
            depotdownloader_path: depotDownloaderPath,
            depotdownloader_args_redacted: buildDownloaderArgs({
                attemptSummary,
                username: "<STEAM_USERNAME>",
                filelistPath,
                downloadDir,
                authMode: normalizedAuthMode
            }),
            depotdownloader_command_redacted: [
                shellQuote(depotDownloaderPath),
                ...buildDownloaderArgs({
                    attemptSummary,
                    username: "<STEAM_USERNAME>",
                    filelistPath,
                    downloadDir,
                    authMode: normalizedAuthMode
                }).map(shellQuote)
            ].join(" "),
            credential_policy: "Username may be supplied; password, 2FA code, refresh token, and access token must not be written to repo artifacts.",
            supported_execute_auth_modes: ["remember-password", "qr"]
        },
        downloader: downloaderResult
            ? {
                status: downloaderResult.status,
                signal: downloaderResult.signal || null,
                error_code: downloaderSummary.error_code,
                timed_out: downloaderSummary.timed_out,
                output_redacted: redactRunnerText(
                    `${downloaderResult.stdout || ""}${downloaderResult.stderr || ""}`,
                    usernameResolution.username
                )
            }
            : null,
        table_scan: {
            item_files: tableFiles.item_files,
            drop_files: tableFiles.drop_files,
            source_item_row: sourceItemRow
        }
    };
}

function runAuthenticatedSteamTableDownload(options = {}) {
    const plan = buildAuthenticatedSteamTableDownloadPlan(options);
    if (options.execute !== true) return plan;
    const usernameResolution = resolveExecutionUsername({
        username: options.username,
        usernameEnv: options.usernameEnv
    });
    if (!usernameResolution.username) return plan;
    const normalizedAuthMode = normalizeAuthMode(options.authMode);
    if (!SAFE_EXECUTE_AUTH_MODES.has(normalizedAuthMode)) return plan;
    if (!isExecutableFile(options.depotDownloaderPath || DEFAULT_DEPOTDOWNLOADER_PATH)) return plan;

    const attemptSummary = safeSummary(options.attemptReport || {});
    const args = buildDownloaderArgs({
        attemptSummary,
        username: usernameResolution.username,
        filelistPath: options.filelistPath || DEFAULT_FILELIST_PATH,
        downloadDir: options.downloadDir || DEFAULT_DOWNLOAD_DIR,
        authMode: normalizedAuthMode
    });
    const result = childProcess.spawnSync(options.depotDownloaderPath || DEFAULT_DEPOTDOWNLOADER_PATH, args, {
        encoding: "utf8",
        timeout: resolveDownloaderTimeoutMs(options.timeoutMs)
    });
    return buildAuthenticatedSteamTableDownloadPlan({
        ...options,
        downloaderResult: result
    });
}

function formatAuthenticatedSteamTableDownloadMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    return `# BidKing authenticated Steam table download runner

- Change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Execute requested: \`${summary.execute_requested === true}\`
- Username provided: \`${summary.username_provided === true}\`
- Auth mode: \`${summary.auth_mode || "-"}\`
- Safe execute auth mode: \`${summary.safe_execute_auth_mode === true}\`
- DepotDownloader available: \`${summary.depotdownloader_available === true}\`
- Download blocked reason: \`${summary.download_blocked_reason || "-"}\`
- Download attempted: \`${summary.download_attempted === true}\`
- Downloader exit code: \`${summary.downloader_exit_code ?? "-"}\`
- Downloader signal: \`${summary.downloader_signal ?? "-"}\`
- Downloader error code: \`${summary.downloader_error_code ?? "-"}\`
- Downloader timed out: \`${summary.downloader_timed_out === true}\`
- Table files downloaded: \`${summary.table_files_downloaded === true}\`
- Source item row recovered: \`${summary.source_item_row_recovered === true}\`
- Authority intake allowed: \`${summary.authority_intake_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Redacted Command

\`\`\`bash
${report.plan ? report.plan.depotdownloader_command_redacted : ""}
\`\`\`

## Decision

This runner prepares or executes only the selective Steam table download. It never records Steam passwords, tokens, or 2FA codes, and it never opens authority, replay, or default-config gates.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = runAuthenticatedSteamTableDownload({
        attemptReport: readJson(args.attemptReportPath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        filelistPath: args.filelistPath,
        downloadDir: args.downloadDir,
        depotDownloaderPath: args.depotDownloaderPath,
        username: args.username,
        usernameEnv: args.usernameEnv,
        authMode: args.authMode,
        execute: args.execute,
        timeoutMs: args.timeoutMs
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatAuthenticatedSteamTableDownloadMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ATTEMPT_REPORT_PATH,
    LOGIN_PROMPT_BLOCKED_MODE,
    DEFAULT_DOWNLOADER_TIMEOUT_MS,
    DEFAULT_OUTPUT_PATH,
    buildAuthenticatedSteamTableDownloadPlan,
    formatAuthenticatedSteamTableDownloadMarkdown,
    main,
    normalizeAuthMode,
    redactRunnerText,
    resolveExecutionUsername,
    resolveArgs,
    resolveDownloaderTimeoutMs,
    runAuthenticatedSteamTableDownload
};
