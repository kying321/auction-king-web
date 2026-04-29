const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_DOWNLOADS_DIR
} = require("./ingest_latest_manual_confirmation_download.js");
const {
    formatMarkdown,
    refreshP0ManualConfirmationIntake
} = require("./refresh_p0_manual_confirmation_intake.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const FOCUS_LABEL = "P1";
const SCRIPT_NAME = "intake:p1-manual-confirmation";
const DEFAULT_PATHS = {
    importOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-count-confirmation-import.json"),
    gateOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-codex-visual-shadow-candidate-replay-gate.json"),
    manualCandidateOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-count-prior-shadow-candidate-config.json"),
    manualCandidateGateOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-count-prior-shadow-candidate-replay-gate.json"),
    chainOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-confirmation-chain-refresh.json"),
    ingestOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-latest-manual-confirmation-ingest-report.json"),
    handoffOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-confirmation-authority-handoff-gate.json"),
    outputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-confirmation-intake-refresh.json")
};

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const result = {
        confirmationResultsPath: null,
        downloadsDir: DEFAULT_DOWNLOADS_DIR,
        generatedAt: new Date().toISOString(),
        failOnBlockers: false,
        focusLabel: FOCUS_LABEL,
        scriptName: SCRIPT_NAME,
        ...DEFAULT_PATHS
    };
    const flagMap = {
        "--downloads-dir": "downloadsDir",
        "--import-output": "importOutputPath",
        "--gate-output": "gateOutputPath",
        "--manual-candidate-output": "manualCandidateOutputPath",
        "--manual-candidate-gate-output": "manualCandidateGateOutputPath",
        "--chain-output": "chainOutputPath",
        "--ingest-output": "ingestOutputPath",
        "--handoff-output": "handoffOutputPath",
        "--output": "outputPath",
        "--generated-at": "generatedAt"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const eqIndex = String(arg).indexOf("=");
        const flagName = eqIndex > -1 ? String(arg).slice(0, eqIndex) : arg;
        const inlineValue = eqIndex > -1 ? String(arg).slice(eqIndex + 1) : null;
        if (arg === "--fail-on-blockers") {
            result.failOnBlockers = true;
        } else if (flagMap[flagName]) {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flagName} 缺少值`);
            if (inlineValue === null) index += 1;
            const targetKey = flagMap[flagName];
            result[targetKey] = targetKey === "generatedAt" ? value : path.resolve(value);
        } else {
            positional.push(arg);
        }
    }

    if (positional.length > 1) {
        throw new Error("最多只接受 1 个位置参数: [manual-confirmation-results.json]");
    }
    if (positional[0]) result.confirmationResultsPath = path.resolve(positional[0]);
    return result;
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function refreshP1ManualConfirmationIntake(args = resolveArgs()) {
    return refreshP0ManualConfirmationIntake({
        ...args,
        focusLabel: FOCUS_LABEL,
        scriptName: SCRIPT_NAME
    });
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = refreshP1ManualConfirmationIntake(args);
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatMarkdown(report, args.outputPath));
    if (args.failOnBlockers && report.blockers.length) {
        throw new Error(`p1 manual confirmation intake blockers: ${report.blockers.join(", ")}`);
    }
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PATHS,
    FOCUS_LABEL,
    SCRIPT_NAME,
    main,
    refreshP1ManualConfirmationIntake,
    resolveArgs
};
