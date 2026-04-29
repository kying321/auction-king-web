const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const DEFAULT_CHROME_ROOT = path.join(os.homedir(), "Library", "Application Support", "Google", "Chrome");
const DEFAULT_OUTPUT_PATH = path.join(path.resolve(__dirname, ".."), "output", "browser_state_audit.json");
const APP_KEY_PREFIX = "ak_";
const APP_HISTORY_MATCHERS = [
    "ak.fuuu.fun",
    "auction_king_web/index.html",
    "127.0.0.1:8123",
    "127.0.0.1:4173"
];

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        chromeRoot: argv[0] ? path.resolve(argv[0]) : DEFAULT_CHROME_ROOT,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function parseAkKeysFromStringsOutput(output = "") {
    return Array.from(new Set(
        String(output)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith(APP_KEY_PREFIX))
    )).sort();
}

function buildProfileStateSummary({ profileName, historyMatches = [], akKeys = [], errors = {} }) {
    const keySet = new Set(akKeys);
    return {
        profile_name: profileName,
        history_match_count: historyMatches.length,
        history_matches: historyMatches,
        app_urls: historyMatches.map((entry) => entry.url),
        ak_keys: akKeys,
        has_workspace_state: keySet.has("ak_workspace_state_v2"),
        has_config_overrides: keySet.has("ak_config_overrides_v2"),
        has_sample_dataset: keySet.has("ak_settlement_samples_v1"),
        has_calibration_draft: keySet.has("ak_calibration_panel_draft_v1"),
        has_calibration_applied: keySet.has("ak_calibration_panel_applied_v1"),
        errors
    };
}

function buildChromeBrowserStateAudit(profileSummaries = []) {
    const profilesWithHistory = profileSummaries
        .filter((entry) => entry.history_match_count > 0)
        .map((entry) => entry.profile_name);
    const profilesWithSampleDataset = profileSummaries
        .filter((entry) => entry.has_sample_dataset)
        .map((entry) => entry.profile_name);
    const profilesWithCalibrationDraft = profileSummaries
        .filter((entry) => entry.has_calibration_draft)
        .map((entry) => entry.profile_name);
    const profilesWithCalibrationApplied = profileSummaries
        .filter((entry) => entry.has_calibration_applied)
        .map((entry) => entry.profile_name);

    return {
        generated_at: new Date().toISOString(),
        chrome_root: DEFAULT_CHROME_ROOT,
        profile_count: profileSummaries.length,
        profiles_with_history: profilesWithHistory,
        profiles_with_sample_dataset: profilesWithSampleDataset,
        profiles_with_calibration_draft: profilesWithCalibrationDraft,
        profiles_with_calibration_applied: profilesWithCalibrationApplied,
        summary: {
            any_sample_dataset_present: profilesWithSampleDataset.length > 0,
            any_calibration_draft_present: profilesWithCalibrationDraft.length > 0,
            any_calibration_applied_present: profilesWithCalibrationApplied.length > 0
        },
        profiles: profileSummaries
    };
}

function listChromeProfiles(chromeRoot = DEFAULT_CHROME_ROOT) {
    if (!fs.existsSync(chromeRoot)) return [];
    return fs.readdirSync(chromeRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
            profileName: entry.name,
            profilePath: path.join(chromeRoot, entry.name)
        }))
        .filter((entry) => fs.existsSync(path.join(entry.profilePath, "Local Storage", "leveldb")));
}

function queryProfileHistory(historyPath) {
    if (!fs.existsSync(historyPath)) return { rows: [], error: null };
    const whereClause = APP_HISTORY_MATCHERS
        .map((matcher) => `url like '%${matcher.replace(/'/g, "''")}%'`)
        .join(" or ");
    const sql = `select title || char(9) || url || char(9) || last_visit_time from urls where ${whereClause} order by last_visit_time desc limit 20;`;

    try {
        const output = execFileSync("sqlite3", [historyPath, sql], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"]
        });
        const rows = output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const [title, url, lastVisitTime] = line.split("\t");
                return { title, url, last_visit_time: lastVisitTime || null };
            });
        return { rows, error: null };
    } catch (error) {
        return { rows: [], error: error.stderr ? String(error.stderr).trim() : error.message };
    }
}

function readProfileAkKeys(leveldbPath) {
    if (!fs.existsSync(leveldbPath)) return { akKeys: [], error: null };
    const files = fs.readdirSync(leveldbPath)
        .filter((fileName) => fileName.endsWith(".ldb") || fileName.endsWith(".log"))
        .map((fileName) => path.join(leveldbPath, fileName));
    if (!files.length) return { akKeys: [], error: null };

    try {
        const output = execFileSync("strings", ["-a", ...files], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 16 * 1024 * 1024
        });
        return { akKeys: parseAkKeysFromStringsOutput(output), error: null };
    } catch (error) {
        return { akKeys: [], error: error.stderr ? String(error.stderr).trim() : error.message };
    }
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildChromeBrowserStateAuditFromFilesystem(chromeRoot = DEFAULT_CHROME_ROOT) {
    const profileSummaries = listChromeProfiles(chromeRoot).map(({ profileName, profilePath }) => {
        const history = queryProfileHistory(path.join(profilePath, "History"));
        const storage = readProfileAkKeys(path.join(profilePath, "Local Storage", "leveldb"));
        return buildProfileStateSummary({
            profileName,
            historyMatches: history.rows,
            akKeys: storage.akKeys,
            errors: {
                history: history.error,
                local_storage: storage.error
            }
        });
    });

    const audit = buildChromeBrowserStateAudit(profileSummaries);
    audit.chrome_root = chromeRoot;
    return audit;
}

function main(argv = process.argv.slice(2)) {
    const { chromeRoot, outputPath } = resolveArgs(argv);
    const audit = buildChromeBrowserStateAuditFromFilesystem(chromeRoot);
    writeJson(outputPath, audit);
    process.stdout.write(`${outputPath}\n`);
    return audit;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CHROME_ROOT,
    DEFAULT_OUTPUT_PATH,
    APP_KEY_PREFIX,
    APP_HISTORY_MATCHERS,
    resolveArgs,
    parseAkKeysFromStringsOutput,
    buildProfileStateSummary,
    buildChromeBrowserStateAudit,
    buildChromeBrowserStateAuditFromFilesystem,
    main
};
