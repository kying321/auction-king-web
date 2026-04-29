const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_CONFIRMATION_RESULTS_PATH,
} = require("./build_codex_visual_manual_confirmation_results.js");
const {
    buildCountFitSampleReviewImport,
    formatCountFitSampleReviewImportMarkdown
} = require("./build_count_fit_sample_review_import.js");
const {
    DEFAULT_CANDIDATE_CONFIG_PATH,
    DEFAULT_OUTPUT_PATH: DEFAULT_GATE_OUTPUT_PATH,
    buildCodexVisualShadowCandidateReplayGate,
    formatCodexVisualShadowCandidateReplayGateMarkdown
} = require("./build_codex_visual_shadow_candidate_replay_gate.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_MANUAL_CANDIDATE_OUTPUT_PATH,
    buildManualCountPriorShadowCandidateConfig,
    formatManualCountPriorShadowCandidateMarkdown
} = require("./build_manual_count_prior_shadow_candidate_config.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_MANUAL_CANDIDATE_GATE_OUTPUT_PATH,
    buildManualCountPriorShadowCandidateReplayGate,
    formatManualCountPriorShadowCandidateReplayGateMarkdown
} = require("./build_manual_count_prior_shadow_candidate_replay_gate.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_IMPORT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-manual-confirmation-import.json"
);
const DEFAULT_CHAIN_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-manual-confirmation-chain-refresh.json"
);

function formatReportPath(filePath) {
    if (!filePath) return null;
    const resolved = path.resolve(filePath);
    const relative = path.relative(ROOT_DIR, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.split(path.sep).join("/");
    }
    return filePath;
}

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const result = {
        confirmationResultsPath: DEFAULT_CONFIRMATION_RESULTS_PATH,
        candidateConfigPath: DEFAULT_CANDIDATE_CONFIG_PATH,
        importOutputPath: DEFAULT_IMPORT_OUTPUT_PATH,
        gateOutputPath: DEFAULT_GATE_OUTPUT_PATH,
        manualCandidateOutputPath: DEFAULT_MANUAL_CANDIDATE_OUTPUT_PATH,
        manualCandidateGateOutputPath: DEFAULT_MANUAL_CANDIDATE_GATE_OUTPUT_PATH,
        chainOutputPath: DEFAULT_CHAIN_OUTPUT_PATH,
        generatedAt: new Date().toISOString(),
        failOnImportBlockers: false
    };
    const flagMap = {
        "--confirmation-results": "confirmationResultsPath",
        "--candidate-config": "candidateConfigPath",
        "--import-output": "importOutputPath",
        "--gate-output": "gateOutputPath",
        "--manual-candidate-output": "manualCandidateOutputPath",
        "--manual-candidate-gate-output": "manualCandidateGateOutputPath",
        "--chain-output": "chainOutputPath",
        "--generated-at": "generatedAt"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--fail-on-import-blockers") {
            result.failOnImportBlockers = true;
        } else if (String(arg).startsWith("--generated-at=")) {
            result.generatedAt = String(arg).slice("--generated-at=".length);
        } else if (flagMap[arg]) {
            index += 1;
            if (!argv[index]) throw new Error(`${arg} 缺少值`);
            const targetKey = flagMap[arg];
            result[targetKey] = targetKey === "generatedAt" ? argv[index] : path.resolve(argv[index]);
        } else {
            positional.push(arg);
        }
    }

    if (positional.length > 3) {
        throw new Error("最多只接受 3 个位置参数: <confirmation-results> <import-output> <gate-output>");
    }
    if (positional[0]) result.confirmationResultsPath = path.resolve(positional[0]);
    if (positional[1]) result.importOutputPath = path.resolve(positional[1]);
    if (positional[2]) result.gateOutputPath = path.resolve(positional[2]);
    return result;
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

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function buildCodexVisualManualConfirmationChain({
    confirmationResults = {},
    candidateConfig = {},
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const importReport = buildCountFitSampleReviewImport({
        template: confirmationResults,
        generatedAt,
        paths: {
            templatePath: paths.confirmationResultsPath || DEFAULT_CONFIRMATION_RESULTS_PATH
        }
    });
    const gateReport = buildCodexVisualShadowCandidateReplayGate({
        reviewImport: importReport,
        candidateConfig,
        generatedAt,
        paths: {
            reviewImportPath: paths.importOutputPath || DEFAULT_IMPORT_OUTPUT_PATH,
            candidateConfigPath: paths.candidateConfigPath || DEFAULT_CANDIDATE_CONFIG_PATH
        }
    });
    const manualCandidateConfig = buildManualCountPriorShadowCandidateConfig({
        reviewImport: importReport,
        generatedAt,
        sourceReviewImportPath: paths.importOutputPath || DEFAULT_IMPORT_OUTPUT_PATH
    });
    const manualCandidateGateReport = buildManualCountPriorShadowCandidateReplayGate({
        reviewImport: importReport,
        candidateConfig: manualCandidateConfig,
        generatedAt,
        paths: {
            reviewImportPath: paths.importOutputPath || DEFAULT_IMPORT_OUTPUT_PATH,
            candidateConfigPath: paths.manualCandidateOutputPath || DEFAULT_MANUAL_CANDIDATE_OUTPUT_PATH
        }
    });
    const importSummary = importReport.summary || {};
    const gateSummary = gateReport.summary || {};
    const manualCandidateMeta = manualCandidateConfig.manual_count_prior_shadow_candidate || {};
    const manualCandidateGateSummary = manualCandidateGateReport.summary || {};

    const chainReport = {
        schema_version: "ak_codex_visual_manual_confirmation_chain_refresh_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "RESEARCH_ONLY",
        inputs: {
            codex_visual_manual_confirmation_results: formatReportPath(paths.confirmationResultsPath || DEFAULT_CONFIRMATION_RESULTS_PATH),
            codex_visual_shadow_candidate_config: formatReportPath(paths.candidateConfigPath || DEFAULT_CANDIDATE_CONFIG_PATH)
        },
        outputs: {
            count_fit_sample_review_import: formatReportPath(paths.importOutputPath || DEFAULT_IMPORT_OUTPUT_PATH),
            codex_visual_shadow_candidate_replay_gate: formatReportPath(paths.gateOutputPath || DEFAULT_GATE_OUTPUT_PATH),
            manual_count_prior_shadow_candidate_config: formatReportPath(paths.manualCandidateOutputPath || DEFAULT_MANUAL_CANDIDATE_OUTPUT_PATH),
            manual_count_prior_shadow_candidate_replay_gate: formatReportPath(paths.manualCandidateGateOutputPath || DEFAULT_MANUAL_CANDIDATE_GATE_OUTPUT_PATH),
            chain_refresh_report: formatReportPath(paths.chainOutputPath || DEFAULT_CHAIN_OUTPUT_PATH)
        },
        summary: {
            review_entry_count: importSummary.review_entry_count || 0,
            accepted_sample_count: importSummary.accepted_sample_count || 0,
            blocked_entry_count: importSummary.blocked_entry_count || 0,
            import_blocker_reason_counts: cloneValue(importSummary.blocker_reason_counts || {}),
            gate_evaluated_sample_count: gateSummary.evaluated_sample_count || 0,
            gate_all_quality_abs_non_regression: gateSummary.all_quality_abs_non_regression === true,
            gate_promotion_allowed: gateSummary.promotion_allowed === true,
            gate_promotion_status: gateSummary.promotion_status || "blocked_visual_shadow_source",
            gate_recommended_next_action: gateSummary.recommended_next_action || "collect_human_confirmed_count_fit_samples",
            gate_blockers: cloneValue(gateSummary.blockers || []),
            gate_warnings: cloneValue(gateSummary.warnings || []),
            manual_candidate_applied_maps: cloneValue(manualCandidateMeta.applied_maps || []),
            manual_candidate_low_sample_maps: cloneValue(manualCandidateMeta.low_sample_maps || []),
            manual_candidate_adoption_blockers: cloneValue(manualCandidateMeta.adoption_blockers || []),
            manual_candidate_gate_evaluated_sample_count: manualCandidateGateSummary.evaluated_sample_count || 0,
            manual_candidate_replay_passed: manualCandidateGateSummary.candidate_replay_passed === true,
            manual_candidate_gate_blockers: cloneValue(manualCandidateGateSummary.blockers || []),
            manual_candidate_gate_recommended_next_action: manualCandidateGateSummary.recommended_next_action
                || "collect_human_confirmed_count_fit_samples",
            ready_for_manual_sample_backed_candidate: (
                Number(importSummary.accepted_sample_count) > 0
                && gateSummary.recommended_next_action === "rebuild_manual_sample_backed_count_prior_candidate"
            )
        },
        notes: [
            "This refresh only chains manual confirmation import and visual shadow replay gate artifacts.",
            "It does not change default weights and does not promote visual shadow configs.",
            "Use approved manual_review samples to build the next manual-sample-backed candidate."
        ]
    };

    return {
        chainReport,
        importReport,
        gateReport,
        manualCandidateConfig,
        manualCandidateGateReport
    };
}

function countRows(counts = {}) {
    const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
    if (!entries.length) return "| `none` | `0` |";
    return entries.map(([reason, count]) => `| \`${reason}\` | \`${count}\` |`).join("\n");
}

function listRows(values = []) {
    return values.length ? values.map((value) => `- \`${value}\``) : ["- `none`"];
}

function formatCodexVisualManualConfirmationChainMarkdown(report = {}, outputPath = DEFAULT_CHAIN_OUTPUT_PATH) {
    const summary = report.summary || {};
    return [
        "# Codex Visual Manual Confirmation Chain Refresh",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Accepted samples: \`${summary.accepted_sample_count || 0}\``,
        `- Blocked entries: \`${summary.blocked_entry_count || 0}\``,
        `- Gate evaluated samples: \`${summary.gate_evaluated_sample_count || 0}\``,
        `- Gate promotion allowed: \`${summary.gate_promotion_allowed === true}\``,
        `- Gate next action: \`${summary.gate_recommended_next_action || "collect_human_confirmed_count_fit_samples"}\``,
        `- Ready for manual-sample-backed candidate: \`${summary.ready_for_manual_sample_backed_candidate === true}\``,
        `- Manual candidate applied maps: \`${(summary.manual_candidate_applied_maps || []).join(", ") || "none"}\``,
        `- Manual candidate replay passed: \`${summary.manual_candidate_replay_passed === true}\``,
        `- Manual candidate gate next action: \`${summary.manual_candidate_gate_recommended_next_action || "collect_human_confirmed_count_fit_samples"}\``,
        "",
        "## Import Blockers",
        "",
        "| reason | count |",
        "| --- | ---: |",
        countRows(summary.import_blocker_reason_counts || {}),
        "",
        "## Gate Blockers",
        ...listRows(summary.gate_blockers || []),
        "",
        "## Gate Warnings",
        ...listRows(summary.gate_warnings || []),
        "",
        "## Manual Candidate Blockers",
        ...listRows(summary.manual_candidate_adoption_blockers || []),
        "",
        "## Manual Candidate Gate Blockers",
        ...listRows(summary.manual_candidate_gate_blockers || []),
        ""
    ].join("\n");
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const confirmationResults = readJson(args.confirmationResultsPath);
    const candidateConfig = readJson(args.candidateConfigPath);
    const reports = buildCodexVisualManualConfirmationChain({
        confirmationResults,
        candidateConfig,
        generatedAt: args.generatedAt,
        paths: args
    });

    writeJson(args.importOutputPath, reports.importReport);
    writeText(
        args.importOutputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleReviewImportMarkdown(reports.importReport, args.importOutputPath)
    );
    writeJson(args.gateOutputPath, reports.gateReport);
    writeText(
        args.gateOutputPath.replace(/\.json$/i, ".md"),
        formatCodexVisualShadowCandidateReplayGateMarkdown(reports.gateReport, args.gateOutputPath)
    );
    writeJson(args.manualCandidateOutputPath, reports.manualCandidateConfig);
    writeText(
        args.manualCandidateOutputPath.replace(/\.json$/i, ".md"),
        formatManualCountPriorShadowCandidateMarkdown(reports.manualCandidateConfig, args.manualCandidateOutputPath)
    );
    writeJson(args.manualCandidateGateOutputPath, reports.manualCandidateGateReport);
    writeText(
        args.manualCandidateGateOutputPath.replace(/\.json$/i, ".md"),
        formatManualCountPriorShadowCandidateReplayGateMarkdown(
            reports.manualCandidateGateReport,
            args.manualCandidateGateOutputPath
        )
    );
    writeJson(args.chainOutputPath, reports.chainReport);
    writeText(
        args.chainOutputPath.replace(/\.json$/i, ".md"),
        formatCodexVisualManualConfirmationChainMarkdown(reports.chainReport, args.chainOutputPath)
    );
    if (args.failOnImportBlockers && reports.importReport.summary.blocked_entry_count > 0) {
        throw new Error(`manual confirmation import blockers: ${reports.importReport.summary.blocked_entry_count}`);
    }
    process.stdout.write(`${args.chainOutputPath}\n`);
    return reports;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CHAIN_OUTPUT_PATH,
    DEFAULT_IMPORT_OUTPUT_PATH,
    buildCodexVisualManualConfirmationChain,
    formatCodexVisualManualConfirmationChainMarkdown,
    main,
    resolveArgs
};
