const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INTAKE_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-package-intake-report.json");
const DEFAULT_SCAN_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-observation-prior-scan-report.json");
const DEFAULT_DRIFT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-prediction-drift-report.json");
const DEFAULT_QUEUE_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-red-residual-clarification-queue.json");
const DEFAULT_REVIEW_PACK_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-red-residual-review-pack.json");
const DEFAULT_P0_CONFIRMATION_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-sunken-ship-p0-manual-count-confirmation-results.json"
);
const DEFAULT_P1_CONFIRMATION_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-sunken-ship-p1-manual-count-confirmation-results.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-capture-chain-contamination-audit.json"
);
const MODEL_FLAG_PREFIX = "model_";
const RED_EXTREME_THRESHOLD = 8;

function resolveArgs(argv = process.argv.slice(2)) {
    const result = {
        intakePath: DEFAULT_INTAKE_PATH,
        scanPath: DEFAULT_SCAN_PATH,
        driftPath: DEFAULT_DRIFT_PATH,
        queuePath: DEFAULT_QUEUE_PATH,
        reviewPackPath: DEFAULT_REVIEW_PACK_PATH,
        p0ConfirmationPath: DEFAULT_P0_CONFIRMATION_PATH,
        p1ConfirmationPath: DEFAULT_P1_CONFIRMATION_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: null
    };
    const flags = {
        "--intake": "intakePath",
        "--scan": "scanPath",
        "--drift": "driftPath",
        "--queue": "queuePath",
        "--review-pack": "reviewPackPath",
        "--p0-confirmation": "p0ConfirmationPath",
        "--p1-confirmation": "p1ConfirmationPath",
        "--output": "outputPath",
        "--generated-at": "generatedAt"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        const eqIndex = arg.indexOf("=");
        const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
        const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : null;
        if (!flags[flag]) throw new Error(`未知参数: ${flag}`);
        const value = inlineValue !== null ? inlineValue : argv[index + 1];
        if (value === undefined) throw new Error(`${flag} 缺少值`);
        if (inlineValue === null) index += 1;
        const key = flags[flag];
        result[key] = key === "generatedAt" ? String(value) : path.resolve(String(value));
    }

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

function addUnique(target, value) {
    if (value && !target.includes(value)) target.push(value);
}

function isModelFlag(flag) {
    return String(flag || "").startsWith(MODEL_FLAG_PREFIX);
}

function countEntriesWithModelFlags(entries = [], fieldName) {
    return entries.filter((entry) => (
        Array.isArray(entry[fieldName]) && entry[fieldName].some(isModelFlag)
    )).length;
}

function countEntriesWithAnyFlags(entries = [], fieldName) {
    return entries.filter((entry) => Array.isArray(entry[fieldName]) && entry[fieldName].length > 0).length;
}

function getCurrentDefaultScenario(scanReport = {}) {
    return (scanReport.scenarios || []).find((scenario) => scenario.id === "current_default") || null;
}

function numberOrZero(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function buildConfirmationFacts(report = {}) {
    const summary = report && report.summary ? report.summary : {};
    return {
        present: Boolean(report),
        draft_count: numberOrZero(summary.manual_confirmation_draft_count),
        fresh_capture_template_count: numberOrZero(summary.fresh_capture_template_count),
        import_ready_without_human_action: summary.import_ready_without_human_action === true,
        pixel_training_label_allowed_count: numberOrZero(summary.pixel_training_label_allowed_count),
        priority_counts: summary.priority_counts || {}
    };
}

function pushCheck(checks, blockers, warnings, { id, status, severity = "info", detail = {} }) {
    checks.push({ id, status, severity, detail });
    if (status !== "pass" && severity === "blocker") addUnique(blockers, id);
    if (status !== "pass" && severity === "warning") addUnique(warnings, id);
}

function chooseRecommendedNextAction({ blockers = [], p1Facts = {} } = {}) {
    if (blockers.length) return "fix_capture_chain_contamination_blockers";
    if (p1Facts.draft_count > 0) return "fill_p1_orange_count_then_full_manual_counts";
    return "continue_collecting_capture_packages";
}

function buildCaptureChainContaminationAudit({
    intakeReport = null,
    scanReport = null,
    driftReport = null,
    queueReport = null,
    reviewPack = null,
    p0Confirmation = null,
    p1Confirmation = null,
    generatedAt = null,
    paths = {}
} = {}) {
    const blockers = [];
    const warnings = [];
    const checks = [];
    const intakeEntries = Array.isArray(intakeReport && intakeReport.entries) ? intakeReport.entries : [];
    const currentRiskModelFlagEntries = countEntriesWithModelFlags(intakeEntries, "risk_flags");
    const embeddedSnapshotModelFlagEntries = countEntriesWithModelFlags(intakeEntries, "embedded_snapshot_risk_flags");
    const legacyMixedModelFlagEntries = countEntriesWithModelFlags(intakeEntries, "legacy_mixed_risk_flags");
    const trainingLabelAllowedCount = numberOrZero(intakeReport && intakeReport.summary
        ? intakeReport.summary.training_label_allowed_count
        : 0);
    const currentDefault = getCurrentDefaultScenario(scanReport || {});
    const driftSummary = driftReport && driftReport.summary ? driftReport.summary : {};
    const queueSummary = queueReport && queueReport.summary ? queueReport.summary : {};
    const reviewPackSummary = reviewPack && reviewPack.summary ? reviewPack.summary : {};
    const p0Facts = buildConfirmationFacts(p0Confirmation);
    const p1Facts = buildConfirmationFacts(p1Confirmation);
    const currentRedMax = currentDefault ? numberOrZero(currentDefault.max_red_count_mean) : null;
    const currentExtremeRedCount = numberOrZero(driftSummary.current_extreme_red_count);
    const queueP0Count = numberOrZero(queueSummary.priority_counts && queueSummary.priority_counts.P0);

    pushCheck(checks, blockers, warnings, {
        id: "capture_intake_present",
        status: intakeReport ? "pass" : "fail",
        severity: "blocker",
        detail: { path: paths.intakePath || null }
    });
    pushCheck(checks, blockers, warnings, {
        id: "current_risk_flags_exclude_embedded_model_flags",
        status: currentRiskModelFlagEntries === 0 ? "pass" : "fail",
        severity: "blocker",
        detail: { current_risk_model_flag_entry_count: currentRiskModelFlagEntries }
    });
    pushCheck(checks, blockers, warnings, {
        id: "embedded_snapshot_flags_are_isolated",
        status: legacyMixedModelFlagEntries >= embeddedSnapshotModelFlagEntries ? "pass" : "fail",
        severity: "blocker",
        detail: {
            embedded_snapshot_model_flag_entry_count: embeddedSnapshotModelFlagEntries,
            legacy_mixed_model_flag_entry_count: legacyMixedModelFlagEntries
        }
    });
    pushCheck(checks, blockers, warnings, {
        id: "capture_intake_training_labels_blocked",
        status: trainingLabelAllowedCount === 0 ? "pass" : "fail",
        severity: "blocker",
        detail: { training_label_allowed_count: trainingLabelAllowedCount }
    });
    pushCheck(checks, blockers, warnings, {
        id: "current_default_red_extreme_cleared",
        status: currentDefault && currentRedMax < RED_EXTREME_THRESHOLD && currentExtremeRedCount === 0 ? "pass" : "fail",
        severity: "blocker",
        detail: {
            current_red_max: currentRedMax,
            current_extreme_red_count: currentExtremeRedCount,
            threshold: RED_EXTREME_THRESHOLD
        }
    });
    pushCheck(checks, blockers, warnings, {
        id: "red_residual_queue_non_authority",
        status: queueSummary.authority_merge_allowed === false
            && numberOrZero(queueSummary.training_label_allowed_count) === 0
            ? "pass"
            : "fail",
        severity: "blocker",
        detail: {
            authority_merge_allowed: queueSummary.authority_merge_allowed,
            training_label_allowed_count: numberOrZero(queueSummary.training_label_allowed_count)
        }
    });
    pushCheck(checks, blockers, warnings, {
        id: "red_residual_review_pack_non_authority",
        status: reviewPackSummary.authority_merge_allowed === false
            && numberOrZero(reviewPackSummary.training_label_allowed_count) === 0
            ? "pass"
            : "fail",
        severity: "blocker",
        detail: {
            authority_merge_allowed: reviewPackSummary.authority_merge_allowed,
            training_label_allowed_count: numberOrZero(reviewPackSummary.training_label_allowed_count)
        }
    });
    pushCheck(checks, blockers, warnings, {
        id: "p0_queue_empty",
        status: queueP0Count === 0 ? "pass" : "fail",
        severity: "warning",
        detail: { p0_queue_count: queueP0Count }
    });
    [p0Facts, p1Facts].forEach((facts, index) => {
        const label = index === 0 ? "p0" : "p1";
        pushCheck(checks, blockers, warnings, {
            id: `${label}_manual_confirmation_requires_human_action`,
            status: facts.import_ready_without_human_action === false ? "pass" : "fail",
            severity: "blocker",
            detail: facts
        });
        pushCheck(checks, blockers, warnings, {
            id: `${label}_manual_confirmation_pixel_training_blocked`,
            status: facts.pixel_training_label_allowed_count === 0 ? "pass" : "fail",
            severity: "blocker",
            detail: { pixel_training_label_allowed_count: facts.pixel_training_label_allowed_count }
        });
    });

    const summary = {
        status: blockers.length ? "blocked" : (warnings.length ? "warning" : "clean"),
        contamination_free: blockers.length === 0,
        capture_package_count: numberOrZero(intakeReport && intakeReport.summary
            ? intakeReport.summary.capture_package_count
            : 0),
        current_risk_model_flag_entry_count: currentRiskModelFlagEntries,
        embedded_snapshot_model_flag_entry_count: embeddedSnapshotModelFlagEntries,
        legacy_mixed_model_flag_entry_count: legacyMixedModelFlagEntries,
        current_red_max: currentRedMax,
        current_extreme_red_count: currentExtremeRedCount,
        stale_extreme_cleared_count: numberOrZero(driftSummary.stale_extreme_cleared_count),
        queue_priority_counts: queueSummary.priority_counts || {},
        review_pack_priority_counts: reviewPackSummary.priority_counts || {},
        p0_manual_confirmation: p0Facts,
        p1_manual_confirmation: p1Facts,
        authority_merge_allowed: false,
        training_label_allowed_count: 0,
        blocker_count: blockers.length,
        warning_count: warnings.length,
        recommended_next_action: chooseRecommendedNextAction({ blockers, p1Facts })
    };

    return {
        schema_version: "ak_capture_chain_contamination_audit_v1",
        generated_at: generatedAt || (driftReport && driftReport.generated_at) || (intakeReport && intakeReport.generated_at) || null,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        authority_merge_allowed: false,
        training_label_allowed: false,
        source_paths: {
            capture_intake_report: paths.intakePath || null,
            capture_observation_prior_scan_report: paths.scanPath || null,
            capture_prediction_drift_report: paths.driftPath || null,
            red_residual_clarification_queue: paths.queuePath || null,
            red_residual_review_pack: paths.reviewPackPath || null,
            p0_manual_confirmation_results: paths.p0ConfirmationPath || null,
            p1_manual_confirmation_results: paths.p1ConfirmationPath || null
        },
        summary,
        blockers,
        warnings,
        checks,
        guardrails: [
            "current_risk_flags_must_not_contain_embedded_model_snapshot_flags",
            "pixel_or_model_outputs_are_never_training_labels",
            "manual_actual_counts_required_before_authority_handoff",
            "default_weight_update_requires_separate_promotion_gate"
        ]
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const lines = [
        "# Capture Chain Contamination Audit",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Status: \`${summary.status || "blocked"}\``,
        `- Contamination free: \`${summary.contamination_free === true}\``,
        `- Capture packages: \`${summary.capture_package_count || 0}\``,
        `- Current risk model flags: \`${summary.current_risk_model_flag_entry_count || 0}\``,
        `- Embedded snapshot model flags: \`${summary.embedded_snapshot_model_flag_entry_count || 0}\``,
        `- Current red max: \`${summary.current_red_max ?? "-"}\``,
        `- Current extreme red count: \`${summary.current_extreme_red_count || 0}\``,
        `- Queue priorities: \`${JSON.stringify(summary.queue_priority_counts || {})}\``,
        `- P1 drafts: \`${summary.p1_manual_confirmation ? summary.p1_manual_confirmation.draft_count : 0}\``,
        `- Next action: \`${summary.recommended_next_action || "-"}\``,
        "",
        "## Checks",
        "",
        "| check | status | severity | detail |",
        "| --- | --- | --- | --- |"
    ];
    (report.checks || []).forEach((check) => {
        lines.push(`| ${[
            check.id,
            check.status,
            check.severity,
            JSON.stringify(check.detail || {})
        ].map(markdownCell).join(" | ")} |`);
    });
    lines.push("");
    lines.push("## Blockers");
    (report.blockers || []).length
        ? report.blockers.forEach((blocker) => lines.push(`- \`${blocker}\``))
        : lines.push("- `none`");
    lines.push("");
    lines.push("## Guardrails");
    (report.guardrails || []).forEach((guardrail) => lines.push(`- \`${guardrail}\``));
    lines.push("");
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildCaptureChainContaminationAudit({
        intakeReport: readJsonIfExists(args.intakePath),
        scanReport: readJsonIfExists(args.scanPath),
        driftReport: readJsonIfExists(args.driftPath),
        queueReport: readJsonIfExists(args.queuePath),
        reviewPack: readJsonIfExists(args.reviewPackPath),
        p0Confirmation: readJsonIfExists(args.p0ConfirmationPath),
        p1Confirmation: readJsonIfExists(args.p1ConfirmationPath),
        generatedAt: args.generatedAt,
        paths: args
    });
    writeJson(args.outputPath, report);
    const markdownPath = args.outputPath.replace(/\.json$/i, ".md");
    writeText(markdownPath, formatMarkdownReport(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n${markdownPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    RED_EXTREME_THRESHOLD,
    buildCaptureChainContaminationAudit,
    formatMarkdownReport,
    resolveArgs,
    main
};
