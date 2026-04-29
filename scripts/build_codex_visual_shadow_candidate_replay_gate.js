const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const { buildSettlementCountReplayReport } = require("../sample_count_replay.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_REVIEW_IMPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-capture-full-count-codex-visual-review-import.json"
);
const DEFAULT_CANDIDATE_CONFIG_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-shadow-candidate-config.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-shadow-candidate-replay-gate.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

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
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = argv[index];
        } else if (String(arg).startsWith("--generated-at=")) {
            generatedAt = String(arg).slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        reviewImportPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_REVIEW_IMPORT_PATH,
        candidateConfigPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_CANDIDATE_CONFIG_PATH,
        outputPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_OUTPUT_PATH,
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

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function roundTo(value, digits = 6) {
    if (!Number.isFinite(Number(value))) return 0;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
}

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function normalizeSamples(reviewImport = {}) {
    return Array.isArray(reviewImport.samples) ? reviewImport.samples : [];
}

function buildMetricDeltas(replayReport = {}) {
    const baselineMetrics = replayReport.metrics && replayReport.metrics.baseline ? replayReport.metrics.baseline : {};
    const candidateMetrics = replayReport.metrics && replayReport.metrics.candidate ? replayReport.metrics.candidate : {};
    return QUALITY_ORDER.reduce((result, quality) => {
        const baseline = isPlainObject(baselineMetrics[quality]) ? baselineMetrics[quality] : {};
        const candidate = isPlainObject(candidateMetrics[quality]) ? candidateMetrics[quality] : {};
        const baselineAbs = Number(baseline.mean_abs_error);
        const candidateAbs = Number(candidate.mean_abs_error);
        const baselineLogLoss = Number(baseline.mean_log_loss);
        const candidateLogLoss = Number(candidate.mean_log_loss);
        const absErrorDelta = Number.isFinite(candidateAbs) && Number.isFinite(baselineAbs)
            ? roundTo(candidateAbs - baselineAbs, 6)
            : null;
        const logLossDelta = Number.isFinite(candidateLogLoss) && Number.isFinite(baselineLogLoss)
            ? roundTo(candidateLogLoss - baselineLogLoss, 6)
            : null;
        result[quality] = {
            sample_count: Number.isInteger(candidate.sample_count) ? candidate.sample_count : 0,
            baseline_mean_abs_error: Number.isFinite(baselineAbs) ? baselineAbs : null,
            candidate_mean_abs_error: Number.isFinite(candidateAbs) ? candidateAbs : null,
            mean_abs_error_delta: absErrorDelta,
            abs_error_improved: absErrorDelta !== null ? absErrorDelta < 0 : false,
            baseline_mean_log_loss: Number.isFinite(baselineLogLoss) ? baselineLogLoss : null,
            candidate_mean_log_loss: Number.isFinite(candidateLogLoss) ? candidateLogLoss : null,
            mean_log_loss_delta: logLossDelta,
            log_loss_improved: logLossDelta !== null ? logLossDelta < 0 : false
        };
        return result;
    }, {});
}

function summarizeSampleDeltas(replayReport = {}) {
    return (Array.isArray(replayReport.samples) ? replayReport.samples : []).map((sample) => {
        const qualityDeltas = QUALITY_ORDER.reduce((result, quality) => {
            const baseline = sample.baseline && sample.baseline.quality_counts
                ? sample.baseline.quality_counts[quality]
                : null;
            const candidate = sample.candidate && sample.candidate.quality_counts
                ? sample.candidate.quality_counts[quality]
                : null;
            const baselineAbs = baseline && Number.isFinite(baseline.abs_error) ? baseline.abs_error : null;
            const candidateAbs = candidate && Number.isFinite(candidate.abs_error) ? candidate.abs_error : null;
            result[quality] = {
                actual_count: baseline ? baseline.actual_count : (candidate ? candidate.actual_count : null),
                baseline_mean_count: baseline ? baseline.mean_count : null,
                candidate_mean_count: candidate ? candidate.mean_count : null,
                baseline_abs_error: baselineAbs,
                candidate_abs_error: candidateAbs,
                mean_abs_error_delta: baselineAbs !== null && candidateAbs !== null
                    ? roundTo(candidateAbs - baselineAbs, 6)
                    : null,
                baseline_rank: baseline ? baseline.rank : null,
                candidate_rank: candidate ? candidate.rank : null
            };
            return result;
        }, {});
        return {
            id: sample.id,
            map_id: sample.map_id,
            actual_counts: cloneValue(sample.actual_counts),
            quality_deltas: qualityDeltas
        };
    });
}

function buildCodexVisualShadowCandidateReplayGate({
    reviewImport = {},
    candidateConfig = {},
    generatedAt = null,
    paths = {}
} = {}) {
    const candidateMeta = candidateConfig.codex_visual_shadow_candidate || {};
    const samples = normalizeSamples(reviewImport);
    const blockers = [];
    const warnings = [];

    addReason(blockers, "visual_shadow_candidate_not_deployable");
    (Array.isArray(candidateMeta.adoption_blockers) ? candidateMeta.adoption_blockers : []).forEach((blocker) => {
        addReason(blockers, blocker);
    });
    if (samples.length === 0) addReason(blockers, "missing_accepted_count_fit_samples");
    if (candidateMeta.default_config_update_allowed === true) {
        addReason(blockers, "unexpected_default_config_update_allowed_true");
    }
    if (!candidateMeta || candidateMeta.schema_version !== "ak_codex_visual_shadow_candidate_config_v1") {
        addReason(blockers, "missing_codex_visual_shadow_candidate_metadata");
    }
    if (reviewImport.summary && Number(reviewImport.summary.blocked_entry_count) > 0) {
        warnings.push("review_import_contains_blocked_entries");
    }

    const replayReport = samples.length
        ? buildSettlementCountReplayReport(samples, defaultConfig, candidateConfig)
        : null;
    const metricDeltas = replayReport ? buildMetricDeltas(replayReport) : {};
    const sampleDeltas = replayReport ? summarizeSampleDeltas(replayReport) : [];
    const allQualityAbsNonRegression = QUALITY_ORDER.every((quality) => {
        const delta = metricDeltas[quality] ? metricDeltas[quality].mean_abs_error_delta : null;
        return delta !== null && delta <= 0;
    });

    return {
        schema_version: "ak_codex_visual_shadow_candidate_replay_gate_v1",
        generated_at: generatedAt || reviewImport.generated_at || candidateMeta.generated_at || null,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            count_fit_sample_review_import: formatReportPath(paths.reviewImportPath),
            codex_visual_shadow_candidate_config: formatReportPath(paths.candidateConfigPath)
        },
        summary: {
            accepted_sample_count: samples.length,
            evaluated_sample_count: replayReport ? replayReport.sample_count : 0,
            applied_maps: Array.isArray(candidateMeta.applied_maps) ? candidateMeta.applied_maps.slice() : [],
            selected_scenarios: cloneValue(candidateMeta.selected_scenarios || {}),
            all_quality_abs_non_regression: samples.length > 0 ? allQualityAbsNonRegression : false,
            promotion_allowed: false,
            promotion_status: "blocked_visual_shadow_source",
            recommended_next_action: samples.length > 0
                ? "rebuild_manual_sample_backed_count_prior_candidate"
                : "collect_human_confirmed_count_fit_samples",
            blockers,
            warnings
        },
        metric_deltas: metricDeltas,
        sample_deltas: sampleDeltas,
        replay_report: replayReport,
        notes: [
            "Visual shadow candidates are replay comparators only.",
            "Even if replay improves on future manual samples, generate a new manual-sample-backed candidate before default config adoption.",
            "This gate must never set promotion_allowed=true for codex_visual_shadow_candidate configs."
        ]
    };
}

function formatDeltaCell(delta = {}) {
    if (!delta || delta.mean_abs_error_delta === null || delta.mean_abs_error_delta === undefined) return "-";
    return `${delta.baseline_mean_abs_error}->${delta.candidate_mean_abs_error} (${delta.mean_abs_error_delta})`;
}

function formatCodexVisualShadowCandidateReplayGateMarkdown(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const rows = QUALITY_ORDER.map((quality) => [
        `\`${quality}\``,
        formatDeltaCell(report.metric_deltas && report.metric_deltas[quality]),
        `\`${report.metric_deltas && report.metric_deltas[quality] ? report.metric_deltas[quality].abs_error_improved : false}\``
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));

    return [
        "# Codex Visual Shadow Candidate Replay Gate",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Accepted samples: \`${summary.accepted_sample_count || 0}\``,
        `- Promotion allowed: \`${summary.promotion_allowed === true}\``,
        `- Promotion status: \`${summary.promotion_status || "blocked_visual_shadow_source"}\``,
        `- Next action: \`${summary.recommended_next_action || "collect_human_confirmed_count_fit_samples"}\``,
        "",
        "| quality | mean abs error baseline->candidate | improved |",
        "| --- | --- | --- |",
        ...rows,
        "",
        "## Blockers",
        ...(summary.blockers || []).map((blocker) => `- \`${blocker}\``),
        "",
        "## Warnings",
        ...((summary.warnings || []).length ? summary.warnings.map((warning) => `- \`${warning}\``) : ["- `none`"]),
        ""
    ].join("\n");
}

function main(argv = process.argv.slice(2)) {
    const { reviewImportPath, candidateConfigPath, outputPath, generatedAt } = resolveArgs(argv);
    const reviewImport = readJson(reviewImportPath);
    const candidateConfig = readJson(candidateConfigPath);
    const report = buildCodexVisualShadowCandidateReplayGate({
        reviewImport,
        candidateConfig,
        generatedAt,
        paths: { reviewImportPath, candidateConfigPath }
    });
    writeJson(outputPath, report);
    writeText(outputPath.replace(/\.json$/i, ".md"), formatCodexVisualShadowCandidateReplayGateMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CANDIDATE_CONFIG_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REVIEW_IMPORT_PATH,
    buildCodexVisualShadowCandidateReplayGate,
    buildMetricDeltas,
    formatCodexVisualShadowCandidateReplayGateMarkdown,
    main,
    resolveArgs
};
