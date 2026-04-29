const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_INGEST_REPORT_PATH
} = require("./ingest_latest_manual_confirmation_download.js");
const {
    DEFAULT_IMPORT_OUTPUT_PATH
} = require("./refresh_codex_visual_manual_confirmation_chain.js");
const {
    DEFAULT_OUTPUT_PATH: DEFAULT_MANUAL_CANDIDATE_GATE_PATH
} = require("./build_manual_count_prior_shadow_candidate_replay_gate.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-manual-confirmation-authority-handoff-gate.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const result = {
        ingestReportPath: DEFAULT_INGEST_REPORT_PATH,
        reviewImportPath: DEFAULT_IMPORT_OUTPUT_PATH,
        manualCandidateGatePath: DEFAULT_MANUAL_CANDIDATE_GATE_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: new Date().toISOString()
    };
    const flagMap = {
        "--ingest-report": "ingestReportPath",
        "--review-import": "reviewImportPath",
        "--manual-candidate-gate": "manualCandidateGatePath",
        "--output": "outputPath",
        "--generated-at": "generatedAt"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const eqIndex = String(arg).indexOf("=");
        const flagName = eqIndex > -1 ? String(arg).slice(0, eqIndex) : arg;
        const inlineValue = eqIndex > -1 ? String(arg).slice(eqIndex + 1) : null;
        if (flagMap[flagName]) {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flagName} 缺少值`);
            if (inlineValue === null) index += 1;
            const targetKey = flagMap[flagName];
            result[targetKey] = targetKey === "generatedAt" ? value : path.resolve(value);
        } else {
            positional.push(arg);
        }
    }

    if (positional.length > 4) {
        throw new Error("最多只接受 4 个位置参数: <ingest-report.json> <review-import.json> <manual-gate.json> <output.json>");
    }
    if (positional[0]) result.ingestReportPath = path.resolve(positional[0]);
    if (positional[1]) result.reviewImportPath = path.resolve(positional[1]);
    if (positional[2]) result.manualCandidateGatePath = path.resolve(positional[2]);
    if (positional[3]) result.outputPath = path.resolve(positional[3]);
    return result;
}

function readJsonIfExists(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
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

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasObservedState(sample = {}) {
    return isPlainObject(sample.observed_state) && Object.keys(sample.observed_state).length > 0;
}

function hasFullActualCounts(sample = {}) {
    return QUALITY_ORDER.every((quality) => (
        Number.isInteger(Number(sample.actual_counts && sample.actual_counts[quality]))
        && Number(sample.actual_counts[quality]) >= 0
    ));
}

function getSampleActualCountsSource(sample = {}) {
    const reviewMeta = sample.metadata
        && isPlainObject(sample.metadata.count_fit_review)
        ? sample.metadata.count_fit_review
        : {};
    return String(reviewMeta.actual_counts_source || sample.actual_counts_source || "").trim().toLowerCase();
}

function getSampleEventTimestamp(sample = {}) {
    const reviewMeta = sample.metadata
        && isPlainObject(sample.metadata.count_fit_review)
        ? sample.metadata.count_fit_review
        : {};
    return String(reviewMeta.event_timestamp || sample.event_timestamp || "").trim();
}

function auditAuthoritySample(sample = {}) {
    const blockers = [];
    if (!String(sample.id || "").trim()) addReason(blockers, "sample_missing_id");
    if (!String(sample.map_id || "").trim()) addReason(blockers, "sample_missing_map_id");
    if (!hasObservedState(sample)) addReason(blockers, "sample_missing_observed_state");
    if (!hasFullActualCounts(sample)) addReason(blockers, "sample_missing_full_actual_counts");
    if (String(sample.source_kind || "").trim() !== "count_fit_manual_review") {
        addReason(blockers, "sample_source_kind_not_count_fit_manual_review");
    }
    if (getSampleActualCountsSource(sample) !== "manual_review") {
        addReason(blockers, "sample_actual_counts_source_not_manual_review");
    }
    if (!getSampleEventTimestamp(sample)) addReason(blockers, "sample_missing_event_timestamp");
    return {
        id: sample.id || null,
        map_id: sample.map_id || null,
        blockers
    };
}

function countReasons(audits = []) {
    return audits.reduce((counts, audit) => {
        (audit.blockers || []).forEach((reason) => {
            counts[reason] = (counts[reason] || 0) + 1;
        });
        return counts;
    }, {});
}

function isManualConfirmationMissing(blocker) {
    return [
        "missing_manual_confirmation_download",
        "selected_file_is_not_manual_confirmation_results",
        "missing_accepted_manual_count_fit_samples",
        "missing_accepted_count_fit_samples"
    ].includes(blocker);
}

function isImportBlockingReason(blocker) {
    return [
        "manual_confirmation_import_contains_blocked_entries",
        "count_fit_import_contains_blocked_entries",
        "missing_count_fit_sample_review_import"
    ].includes(blocker);
}

function commandPath(filePath) {
    if (!filePath) return "";
    const normalized = String(filePath).replace(/\\/g, "/");
    const docsIndex = normalized.indexOf("/docs/research/");
    if (docsIndex >= 0) return normalized.slice(docsIndex + 1);
    const relative = path.relative(ROOT_DIR, path.resolve(filePath)).replace(/\\/g, "/");
    return relative && !relative.startsWith("..") ? relative : normalized;
}

function chooseRecommendedNextAction({
    missingSource,
    authorityMergeAllowed,
    replayCandidateReady,
    acceptedCount = 0,
    blockedEntryCount = 0,
    importBlockerReasonCounts = {}
} = {}) {
    if (missingSource) return "download_human_approved_manual_confirmation_json";
    if (!authorityMergeAllowed) {
        const statusNotApprovedCount = Number(importBlockerReasonCounts.status_not_approved_for_import || 0) || 0;
        const totalMismatchCount = Number(importBlockerReasonCounts.actual_counts_total_mismatch || 0) || 0;
        if (acceptedCount <= 0 && blockedEntryCount > 0 && statusNotApprovedCount > 0) {
            return "approve_manual_confirmation_counts_then_download_json";
        }
        if (totalMismatchCount > 0) return "fix_manual_confirmation_counts";
        return "fix_manual_confirmation_import_blockers";
    }
    if (!replayCandidateReady) return "merge_authority_samples_after_user_approval_and_collect_more_samples";
    return "open_default_weight_promotion_review";
}

function buildManualConfirmationAuthorityHandoffGate({
    ingestReport = null,
    reviewImport = null,
    manualCandidateGate = null,
    generatedAt = null,
    paths = {}
} = {}) {
    const blockers = [];
    const warnings = [];
    const defaultWeightUpdateBlockers = [
        "default_weight_update_requires_separate_promotion_gate"
    ];
    const ingestSummary = ingestReport && ingestReport.summary ? ingestReport.summary : {};
    const ingestReadiness = ingestReport && ingestReport.readiness ? ingestReport.readiness : {};
    const importSummary = reviewImport && reviewImport.summary ? reviewImport.summary : {};
    const manualGateSummary = manualCandidateGate && manualCandidateGate.summary ? manualCandidateGate.summary : {};
    const samples = Array.isArray(reviewImport && reviewImport.samples) ? reviewImport.samples : [];
    const sampleAudits = samples.map(auditAuthoritySample);
    const sampleAuditBlockerCounts = countReasons(sampleAudits);
    const sampleAuditHasBlockers = Object.keys(sampleAuditBlockerCounts).length > 0;
    const acceptedCount = Number(importSummary.accepted_sample_count ?? ingestSummary.accepted_sample_count ?? 0) || 0;
    const blockedEntryCount = Number(importSummary.blocked_entry_count ?? ingestSummary.blocked_entry_count ?? 0) || 0;

    if (!ingestReport) {
        addReason(blockers, "missing_latest_manual_confirmation_ingest_report");
    } else if (ingestReport.schema_version !== "ak_latest_manual_confirmation_ingest_v1") {
        addReason(blockers, "invalid_latest_manual_confirmation_ingest_report");
    }

    if (!reviewImport) {
        addReason(blockers, "missing_count_fit_sample_review_import");
    } else if (reviewImport.schema_version !== "ak_count_fit_sample_review_import_v1") {
        addReason(blockers, "invalid_count_fit_sample_review_import");
    }

    if (!manualCandidateGate) {
        addReason(warnings, "missing_manual_candidate_replay_gate_report");
    } else if (manualCandidateGate.schema_version !== "ak_manual_count_prior_shadow_candidate_replay_gate_v1") {
        addReason(warnings, "invalid_manual_candidate_replay_gate_report");
    }

    (Array.isArray(ingestReport && ingestReport.blockers) ? ingestReport.blockers : []).forEach((blocker) => {
        if (isManualConfirmationMissing(blocker) || isImportBlockingReason(blocker)) addReason(blockers, blocker);
    });

    if (acceptedCount <= 0) addReason(blockers, "missing_accepted_manual_count_fit_samples");
    if (blockedEntryCount > 0) addReason(blockers, "count_fit_import_contains_blocked_entries");
    if (reviewImport && samples.length !== acceptedCount) addReason(blockers, "count_fit_import_sample_count_mismatch");
    Object.keys(importSummary.blocker_reason_counts || {}).forEach((reason) => addReason(blockers, reason));
    Object.keys(sampleAuditBlockerCounts).forEach((reason) => addReason(blockers, reason));

    const authoritySampleMergeAllowed = Boolean(
        ingestReadiness.authority_sample_import_ready === true
        && acceptedCount > 0
        && blockedEntryCount === 0
        && reviewImport
        && reviewImport.schema_version === "ak_count_fit_sample_review_import_v1"
        && samples.length === acceptedCount
        && !sampleAuditHasBlockers
    );
    const replayCandidateReady = Boolean(
        ingestReadiness.replay_candidate_ready === true
        && manualGateSummary.candidate_replay_passed === true
    );

    if (!authoritySampleMergeAllowed) addReason(defaultWeightUpdateBlockers, "authority_sample_merge_not_allowed");
    if (!replayCandidateReady) {
        addReason(blockers, "manual_candidate_replay_gate_not_passed");
        addReason(defaultWeightUpdateBlockers, "manual_candidate_replay_gate_not_passed");
    }

    const missingSource = blockers.includes("missing_manual_confirmation_download")
        || blockers.includes("missing_latest_manual_confirmation_ingest_report")
        || blockers.includes("missing_count_fit_sample_review_import");
    const authoritySampleMergeCommand = authoritySampleMergeAllowed
        ? `npm run build:authority-from-samples -- ${commandPath(paths.reviewImportPath)} --merge-existing`
        : null;

    return {
        schema_version: "ak_manual_confirmation_authority_handoff_gate_v1",
        generated_at: generatedAt || ingestReport && ingestReport.generated_at || reviewImport && reviewImport.generated_at || null,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            latest_manual_confirmation_ingest_report: paths.ingestReportPath || null,
            count_fit_sample_review_import: paths.reviewImportPath || null,
            manual_count_prior_shadow_candidate_replay_gate: paths.manualCandidateGatePath || null
        },
        summary: {
            ingest_status: ingestSummary.status || "unknown",
            accepted_sample_count: acceptedCount,
            blocked_entry_count: blockedEntryCount,
            authority_sample_merge_allowed: authoritySampleMergeAllowed,
            replay_candidate_ready: replayCandidateReady,
            default_weight_update_allowed: false,
            recommended_next_action: chooseRecommendedNextAction({
                missingSource,
                authorityMergeAllowed: authoritySampleMergeAllowed,
                replayCandidateReady,
                acceptedCount,
                blockedEntryCount,
                importBlockerReasonCounts: importSummary.blocker_reason_counts || {}
            })
        },
        readiness: {
            authority_sample_merge_allowed: authoritySampleMergeAllowed,
            replay_candidate_ready: replayCandidateReady,
            default_weight_update_allowed: false
        },
        commands: {
            authority_sample_merge: authoritySampleMergeCommand,
            default_weight_update: null
        },
        blockers,
        warnings,
        default_weight_update_blockers: defaultWeightUpdateBlockers,
        sample_audit: {
            sample_count: samples.length,
            blocker_reason_counts: sampleAuditBlockerCounts,
            entries: sampleAudits
        },
        source_summaries: {
            ingest: cloneValue(ingestSummary),
            count_fit_import: cloneValue(importSummary),
            manual_candidate_replay_gate: cloneValue(manualGateSummary)
        },
        notes: [
            "This gate is read-only and does not change default weights.",
            "Authority sample merge can be allowed from clean human-approved manual samples even when replay is still low-sample blocked.",
            "Default weight updates require a separate promotion gate after enough replay-backed samples exist."
        ]
    };
}

function listRows(values = []) {
    return values.length ? values.map((value) => `- \`${value}\``) : ["- `none`"];
}

function formatManualConfirmationAuthorityHandoffGateMarkdown(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const commands = report.commands || {};
    return [
        "# Manual Confirmation Authority Handoff Gate",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath) || outputPath}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Ingest status: \`${summary.ingest_status || "unknown"}\``,
        `- Accepted samples: \`${summary.accepted_sample_count || 0}\``,
        `- Blocked entries: \`${summary.blocked_entry_count || 0}\``,
        `- Authority sample merge allowed: \`${summary.authority_sample_merge_allowed === true}\``,
        `- Replay candidate ready: \`${summary.replay_candidate_ready === true}\``,
        `- Default weight update allowed: \`${summary.default_weight_update_allowed === true}\``,
        `- Next action: \`${summary.recommended_next_action || "collect_human_confirmed_count_fit_samples"}\``,
        "",
        "## Commands",
        `- authority sample merge: \`${commands.authority_sample_merge || "blocked"}\``,
        `- default weight update: \`${commands.default_weight_update || "blocked"}\``,
        "",
        "## Blockers",
        ...listRows(report.blockers || []),
        "",
        "## Default Weight Blockers",
        ...listRows(report.default_weight_update_blockers || []),
        "",
        "## Warnings",
        ...listRows(report.warnings || []),
        ""
    ].join("\n");
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const ingestReport = readJsonIfExists(args.ingestReportPath);
    const reviewImport = readJsonIfExists(args.reviewImportPath);
    const manualCandidateGate = readJsonIfExists(args.manualCandidateGatePath);
    const report = buildManualConfirmationAuthorityHandoffGate({
        ingestReport,
        reviewImport,
        manualCandidateGate,
        generatedAt: args.generatedAt,
        paths: args
    });
    writeJson(args.outputPath, report);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatManualConfirmationAuthorityHandoffGateMarkdown(report, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    QUALITY_ORDER,
    auditAuthoritySample,
    buildManualConfirmationAuthorityHandoffGate,
    formatManualConfirmationAuthorityHandoffGateMarkdown,
    main,
    resolveArgs
};
