const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_DOWNLOADS_DIR,
    main: ingestLatestManualConfirmation
} = require("./ingest_latest_manual_confirmation_download.js");
const {
    main: buildManualConfirmationAuthorityHandoffGate
} = require("./build_manual_confirmation_authority_handoff_gate.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PATHS = {
    importOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-count-confirmation-import.json"),
    gateOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-codex-visual-shadow-candidate-replay-gate.json"),
    manualCandidateOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-count-prior-shadow-candidate-config.json"),
    manualCandidateGateOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-count-prior-shadow-candidate-replay-gate.json"),
    chainOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-confirmation-chain-refresh.json"),
    ingestOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-latest-manual-confirmation-ingest-report.json"),
    handoffOutputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-confirmation-authority-handoff-gate.json"),
    outputPath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-confirmation-intake-refresh.json")
};
const DEFAULT_FOCUS_LABEL = "P0";
const DEFAULT_SCRIPT_NAME = "intake:p0-manual-confirmation";

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const result = {
        confirmationResultsPath: null,
        downloadsDir: DEFAULT_DOWNLOADS_DIR,
        generatedAt: new Date().toISOString(),
        failOnBlockers: false,
        focusLabel: DEFAULT_FOCUS_LABEL,
        scriptName: DEFAULT_SCRIPT_NAME,
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

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function uniq(values = []) {
    return Array.from(new Set(values.filter(Boolean)));
}

function commandPath(filePath) {
    if (!filePath) return "";
    const relative = path.relative(ROOT_DIR, path.resolve(filePath)).replace(/\\/g, "/");
    return relative && !relative.startsWith("..") ? relative : String(filePath);
}

function runWithCapturedStdout(fn, args) {
    const chunks = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        chunks.push(String(chunk));
        return true;
    };
    try {
        return {
            report: fn(args),
            stdout: chunks.join("")
        };
    } finally {
        process.stdout.write = originalWrite;
    }
}

function buildWrapperReport({ args, ingestReport, handoffReport, ingestStdout, handoffStdout } = {}) {
    const focusLabel = String(args.focusLabel || DEFAULT_FOCUS_LABEL).toUpperCase();
    const focusSlug = focusLabel.toLowerCase();
    const scriptName = args.scriptName || DEFAULT_SCRIPT_NAME;
    const ingestSummary = ingestReport && ingestReport.summary ? ingestReport.summary : {};
    const handoffSummary = handoffReport && handoffReport.summary ? handoffReport.summary : {};
    const blockers = uniq([
        ...(Array.isArray(ingestReport && ingestReport.blockers) ? ingestReport.blockers : []),
        ...(Array.isArray(handoffReport && handoffReport.blockers) ? handoffReport.blockers : [])
    ]);
    const nextAction = handoffSummary.recommended_next_action
        || ingestSummary.recommended_next_action
        || "collect_human_confirmed_count_fit_samples";
    return {
        schema_version: `ak_${focusSlug}_manual_confirmation_intake_refresh_v1`,
        generated_at: args.generatedAt,
        mode: "source_first_implementation",
        change_class: "RESEARCH_ONLY",
        focus_label: focusLabel,
        inputs: {
            manual_confirmation_results: args.confirmationResultsPath,
            downloads_dir: args.downloadsDir
        },
        outputs: {
            count_fit_sample_review_import: args.importOutputPath,
            codex_visual_shadow_candidate_replay_gate: args.gateOutputPath,
            manual_count_prior_shadow_candidate_config: args.manualCandidateOutputPath,
            manual_count_prior_shadow_candidate_replay_gate: args.manualCandidateGateOutputPath,
            chain_refresh_report: args.chainOutputPath,
            ingest_report: args.ingestOutputPath,
            authority_handoff_gate: args.handoffOutputPath,
            intake_refresh_report: args.outputPath
        },
        summary: {
            ingest_status: ingestSummary.status || "unknown",
            accepted_sample_count: Number(handoffSummary.accepted_sample_count ?? ingestSummary.accepted_sample_count ?? 0) || 0,
            blocked_entry_count: Number(handoffSummary.blocked_entry_count ?? ingestSummary.blocked_entry_count ?? 0) || 0,
            authority_sample_merge_allowed: handoffSummary.authority_sample_merge_allowed === true,
            replay_candidate_ready: handoffSummary.replay_candidate_ready === true,
            default_weight_update_allowed: handoffSummary.default_weight_update_allowed === true,
            recommended_next_action: nextAction
        },
        blockers,
        source_summaries: {
            ingest: cloneValue(ingestSummary),
            handoff: cloneValue(handoffSummary)
        },
        captured_stdout: {
            ingest: ingestStdout,
            handoff: handoffStdout
        },
        commands: {
            next_human_step: `Open the ${focusLabel} manual count confirmation HTML, fill counts, approve valid cards, then download JSON.`,
            rerun_intake: args.confirmationResultsPath
                ? `npm run ${scriptName} -- ${commandPath(args.confirmationResultsPath)}`
                : `npm run ${scriptName}`,
            authority_sample_merge: handoffReport && handoffReport.commands
                ? handoffReport.commands.authority_sample_merge || null
                : null
        }
    };
}

function formatMarkdown(report = {}, outputPath = DEFAULT_PATHS.outputPath) {
    const summary = report.summary || {};
    const focusLabel = String(report.focus_label || DEFAULT_FOCUS_LABEL).toUpperCase();
    const scriptName = focusLabel === DEFAULT_FOCUS_LABEL ? DEFAULT_SCRIPT_NAME : `intake:${focusLabel.toLowerCase()}-manual-confirmation`;
    return [
        `# ${focusLabel} Manual Confirmation Intake Refresh`,
        "",
        `- JSON: \`${commandPath(outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Ingest status: \`${summary.ingest_status || "unknown"}\``,
        `- Accepted samples: \`${summary.accepted_sample_count || 0}\``,
        `- Blocked entries: \`${summary.blocked_entry_count || 0}\``,
        `- Authority sample merge allowed: \`${summary.authority_sample_merge_allowed === true}\``,
        `- Replay candidate ready: \`${summary.replay_candidate_ready === true}\``,
        `- Default weight update allowed: \`${summary.default_weight_update_allowed === true}\``,
        `- Next action: \`${summary.recommended_next_action || "collect_human_confirmed_count_fit_samples"}\``,
        "",
        "## Blockers",
        ...(report.blockers && report.blockers.length ? report.blockers.map((blocker) => `- \`${blocker}\``) : ["- `none`"]),
        "",
        "## Commands",
        `- rerun intake: \`${report.commands ? report.commands.rerun_intake : `npm run ${scriptName}`}\``,
        `- authority sample merge: \`${report.commands && report.commands.authority_sample_merge ? report.commands.authority_sample_merge : "blocked"}\``,
        ""
    ].join("\n");
}

function refreshP0ManualConfirmationIntake(args = resolveArgs()) {
    const focusLabel = String(args.focusLabel || DEFAULT_FOCUS_LABEL).toUpperCase();
    const ingestArgs = [
        ...(args.confirmationResultsPath ? [args.confirmationResultsPath] : []),
        "--downloads-dir", args.downloadsDir,
        "--import-output", args.importOutputPath,
        "--gate-output", args.gateOutputPath,
        "--manual-candidate-output", args.manualCandidateOutputPath,
        "--manual-candidate-gate-output", args.manualCandidateGateOutputPath,
        "--chain-output", args.chainOutputPath,
        "--output", args.ingestOutputPath,
        "--priority", focusLabel,
        `--generated-at=${args.generatedAt}`
    ];
    const ingestRun = runWithCapturedStdout(ingestLatestManualConfirmation, ingestArgs);
    const handoffArgs = [
        args.ingestOutputPath,
        args.importOutputPath,
        args.manualCandidateGateOutputPath,
        args.handoffOutputPath,
        `--generated-at=${args.generatedAt}`
    ];
    const handoffRun = runWithCapturedStdout(buildManualConfirmationAuthorityHandoffGate, handoffArgs);
    return buildWrapperReport({
        args,
        ingestReport: ingestRun.report,
        handoffReport: handoffRun.report,
        ingestStdout: ingestRun.stdout,
        handoffStdout: handoffRun.stdout
    });
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = refreshP0ManualConfirmationIntake(args);
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatMarkdown(report, args.outputPath));
    if (args.failOnBlockers && report.blockers.length) {
        throw new Error(`p0 manual confirmation intake blockers: ${report.blockers.join(", ")}`);
    }
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PATHS,
    buildWrapperReport,
    formatMarkdown,
    main,
    refreshP0ManualConfirmationIntake,
    resolveArgs
};
