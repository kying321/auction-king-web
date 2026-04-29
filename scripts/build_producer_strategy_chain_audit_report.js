const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_CANDIDATE_CONFIG_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-producer-strategy-candidate-config.json"
);
const DEFAULT_COUNT_REPLAY_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-producer-strategy-count-replay-report.json"
);
const DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-producer-strategy-replay-diagnostics-report.json"
);
const DEFAULT_ARCHITECTURE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-producer-strategy-architecture-report.json"
);
const DEFAULT_DEFAULT_WEIGHT_IMPLEMENTATION_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-default-weight-implementation-report.json"
);
const DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_QUEUE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-acquisition-queue.json"
);
const DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_PACK_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-acquisition-pack.json"
);
const DEFAULT_COUNT_FIT_SAMPLE_REVIEW_TEMPLATE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-template.json"
);
const DEFAULT_COUNT_FIT_READINESS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-settlement-count-fit-readiness-report.json"
);
const DEFAULT_COUNT_FIT_SAMPLE_REVIEW_IMPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-import.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-producer-strategy-chain-audit-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    const hasDefaultWeightImplementationArg = argv.length >= 6;
    const hasCountFitSampleAcquisitionQueueArg = argv.length >= 7;
    const hasCountFitSampleAcquisitionPackArg = argv.length >= 8;
    const hasCountFitSampleReviewTemplateArg = argv.length >= 9;
    const hasCountFitReadinessReportArg = argv.length >= 10;
    const hasCountFitSampleReviewImportArg = argv.length >= 11;
    let outputPath = argv[4] ? path.resolve(argv[4]) : DEFAULT_OUTPUT_PATH;
    if (hasDefaultWeightImplementationArg) outputPath = path.resolve(argv[5]);
    if (hasCountFitSampleAcquisitionQueueArg) outputPath = path.resolve(argv[6]);
    if (hasCountFitSampleAcquisitionPackArg) outputPath = path.resolve(argv[7]);
    if (hasCountFitSampleReviewTemplateArg) outputPath = path.resolve(argv[8]);
    if (hasCountFitReadinessReportArg) outputPath = path.resolve(argv[9]);
    if (hasCountFitSampleReviewImportArg) outputPath = path.resolve(argv[10]);
    return {
        candidateConfigPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_CANDIDATE_CONFIG_PATH,
        countReplayReportPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_COUNT_REPLAY_REPORT_PATH,
        replayDiagnosticsReportPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH,
        architectureReportPath: argv[3] ? path.resolve(argv[3]) : DEFAULT_ARCHITECTURE_REPORT_PATH,
        defaultWeightImplementationReportPath: hasDefaultWeightImplementationArg
            ? path.resolve(argv[4])
            : DEFAULT_DEFAULT_WEIGHT_IMPLEMENTATION_REPORT_PATH,
        countFitSampleAcquisitionQueuePath: hasCountFitSampleAcquisitionQueueArg
            ? path.resolve(argv[5])
            : DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_QUEUE_PATH,
        countFitSampleAcquisitionPackPath: hasCountFitSampleAcquisitionPackArg
            ? path.resolve(argv[6])
            : DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_PACK_PATH,
        countFitSampleReviewTemplatePath: hasCountFitSampleReviewTemplateArg
            ? path.resolve(argv[7])
            : DEFAULT_COUNT_FIT_SAMPLE_REVIEW_TEMPLATE_PATH,
        countFitReadinessReportPath: hasCountFitReadinessReportArg
            ? path.resolve(argv[8])
            : DEFAULT_COUNT_FIT_READINESS_REPORT_PATH,
        countFitSampleReviewImportPath: hasCountFitSampleReviewImportArg
            ? path.resolve(argv[9])
            : DEFAULT_COUNT_FIT_SAMPLE_REVIEW_IMPORT_PATH,
        outputPath
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeForCompare(value) {
    if (Array.isArray(value)) return value.map(normalizeForCompare);
    if (!isPlainObject(value)) return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, entryValue]) => entryValue !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entryValue]) => [key, normalizeForCompare(entryValue)])
    );
}

function stableJson(value) {
    return JSON.stringify(normalizeForCompare(value));
}

function deepEqual(left, right) {
    return stableJson(left) === stableJson(right);
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function addCheck(checks, { id, passed, blocker, detail = {} }) {
    checks.push({
        id,
        passed: passed === true,
        blocker: passed === true ? null : blocker,
        detail
    });
}

function sortedUniqueStrings(values = []) {
    return Array.from(new Set(values.filter((value) => value).map((value) => String(value)))).sort();
}

function hasLegacyStrategySourceReport(context = {}) {
    return String(context && context.source_report || "").includes("2026-04-24-producer-strategy-architecture-report");
}

function resolveMaybePath(value) {
    if (!value) return null;
    return path.resolve(String(value));
}

function collectArchitectureCountFitBlockedMaps(architectureReport = {}) {
    if (!isPlainObject(architectureReport.maps)) return [];
    return sortedUniqueStrings(Object.entries(architectureReport.maps)
        .filter(([, entry]) => {
            if (!isPlainObject(entry)) return false;
            if (entry.gates && entry.gates.count_fit_readiness_passed === false) return true;
            return entry.count_fit_readiness && entry.count_fit_readiness.two_sigma_count_fit_allowed === false;
        })
        .map(([mapId, entry]) => entry.map_id || mapId));
}

function collectQueueBlockedMaps(queue = {}) {
    const items = Array.isArray(queue.items) ? queue.items : [];
    return sortedUniqueStrings(items
        .filter((item) => item && item.two_sigma_count_fit_allowed !== true)
        .map((item) => item.map_id));
}

function collectPackBlockedMaps(pack = {}) {
    if (pack.summary && Array.isArray(pack.summary.blocked_maps)) {
        return sortedUniqueStrings(pack.summary.blocked_maps);
    }
    const freshTasks = Array.isArray(pack.fresh_capture_tasks) ? pack.fresh_capture_tasks : [];
    return sortedUniqueStrings(freshTasks.map((task) => task && task.map_id));
}

function countArray(value) {
    return Array.isArray(value) ? value.length : 0;
}

function findReadinessReviewImportPackage(readinessReport = {}, reviewImportPath = null) {
    const packages = Array.isArray(readinessReport.packages) ? readinessReport.packages : [];
    const normalizedImportPath = resolveMaybePath(reviewImportPath);
    return packages.find((entry) => {
        if (!entry || !normalizedImportPath) return false;
        return resolveMaybePath(entry.source_path) === normalizedImportPath;
    }) || null;
}

function buildProducerStrategyChainAuditReport({
    candidateConfig = {},
    countReplayReport = {},
    replayDiagnosticsReport = {},
    architectureReport = {},
    defaultWeightImplementationReport = {},
    countFitSampleAcquisitionQueue = {},
    countFitSampleAcquisitionPack = {},
    countFitSampleReviewTemplate = {},
    countFitReadinessReport = {},
    countFitSampleReviewImport = {},
    paths = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const candidateContext = isPlainObject(candidateConfig.producer_strategy_candidate)
        ? candidateConfig.producer_strategy_candidate
        : {};
    const replayContext = isPlainObject(countReplayReport.candidate_config_context)
        ? countReplayReport.candidate_config_context
        : {};
    const diagnosticsContext = isPlainObject(replayDiagnosticsReport.candidate_config_context)
        ? replayDiagnosticsReport.candidate_config_context
        : {};
    const architecturePath = paths.architectureReportPath || DEFAULT_ARCHITECTURE_REPORT_PATH;
    const defaultWeightAuthorityMetadataPresent = (
        typeof defaultWeightImplementationReport.authority_adoption_allowed === "boolean"
        && Array.isArray(defaultWeightImplementationReport.authority_blockers)
    );
    const defaultWeightAuthorityBlockers = Array.isArray(defaultWeightImplementationReport.authority_blockers)
        ? defaultWeightImplementationReport.authority_blockers.slice()
        : [];
    const architectureCountFitBlockedMaps = collectArchitectureCountFitBlockedMaps(architectureReport);
    const queueBlockedMaps = collectQueueBlockedMaps(countFitSampleAcquisitionQueue);
    const queueSchemaPresent = (
        countFitSampleAcquisitionQueue.schema_version === "ak_count_fit_sample_acquisition_queue_v1"
    );
    const packBlockedMaps = collectPackBlockedMaps(countFitSampleAcquisitionPack);
    const packSchemaPresent = (
        countFitSampleAcquisitionPack.schema_version === "ak_count_fit_sample_acquisition_pack_v1"
    );
    const reviewTemplateSchemaPresent = (
        countFitSampleReviewTemplate.schema_version === "ak_count_fit_sample_review_template_v1"
    );
    const reviewImportSchemaPresent = (
        countFitSampleReviewImport.schema_version === "ak_count_fit_sample_review_import_v1"
    );
    const reviewImportPath = paths.countFitSampleReviewImportPath || DEFAULT_COUNT_FIT_SAMPLE_REVIEW_IMPORT_PATH;
    const readinessReviewImportPackage = findReadinessReviewImportPackage(countFitReadinessReport, reviewImportPath);
    const reviewImportSampleCount = countArray(countFitSampleReviewImport.samples);
    const packExistingTaskCount = countFitSampleAcquisitionPack.summary
        ? countFitSampleAcquisitionPack.summary.existing_candidate_task_count ?? countArray(countFitSampleAcquisitionPack.existing_candidate_tasks)
        : countArray(countFitSampleAcquisitionPack.existing_candidate_tasks);
    const packFreshTaskCount = countFitSampleAcquisitionPack.summary
        ? countFitSampleAcquisitionPack.summary.fresh_capture_map_count ?? countArray(countFitSampleAcquisitionPack.fresh_capture_tasks)
        : countArray(countFitSampleAcquisitionPack.fresh_capture_tasks);
    const reviewExistingDraftCount = countFitSampleReviewTemplate.summary
        ? countFitSampleReviewTemplate.summary.existing_candidate_review_count ?? countArray(countFitSampleReviewTemplate.review_results)
        : countArray(countFitSampleReviewTemplate.review_results);
    const reviewFreshTemplateCount = countFitSampleReviewTemplate.summary
        ? countFitSampleReviewTemplate.summary.fresh_capture_template_count ?? countArray(countFitSampleReviewTemplate.fresh_capture_templates)
        : countArray(countFitSampleReviewTemplate.fresh_capture_templates);
    const checks = [];

    addCheck(checks, {
        id: "candidate_source_report_points_to_architecture",
        passed: resolveMaybePath(candidateContext.source_report) === resolveMaybePath(architecturePath),
        blocker: "candidate_source_report_mismatch",
        detail: {
            candidate_source_report: candidateContext.source_report || null,
            architecture_report_path: architecturePath
        }
    });
    addCheck(checks, {
        id: "count_replay_candidate_context_matches_candidate_config",
        passed: deepEqual(replayContext, candidateContext),
        blocker: "count_replay_candidate_context_mismatch",
        detail: {
            candidate_generated_at: candidateContext.generated_at || null,
            replay_context_generated_at: replayContext.generated_at || null
        }
    });
    addCheck(checks, {
        id: "diagnostics_candidate_context_matches_count_replay",
        passed: deepEqual(diagnosticsContext, replayContext),
        blocker: "diagnostics_candidate_context_mismatch",
        detail: {
            replay_context_generated_at: replayContext.generated_at || null,
            diagnostics_context_generated_at: diagnosticsContext.generated_at || null
        }
    });
    addCheck(checks, {
        id: "count_fit_readiness_guard_present_in_replay_context",
        passed: replayContext.count_fit_readiness_guard === "skip_count_fit_readiness_passed_false",
        blocker: "count_fit_readiness_guard_missing_from_replay_context",
        detail: {
            replay_guard: replayContext.count_fit_readiness_guard || null
        }
    });
    addCheck(checks, {
        id: "no_legacy_strategy_source_report_in_replay_context",
        passed: !hasLegacyStrategySourceReport(replayContext),
        blocker: "legacy_strategy_source_report_in_replay_context",
        detail: {
            replay_source_report: replayContext.source_report || null
        }
    });
    addCheck(checks, {
        id: "architecture_report_schema_present",
        passed: architectureReport.schema_version === "ak_producer_strategy_architecture_v1",
        blocker: "architecture_report_schema_missing",
        detail: {
            architecture_schema_version: architectureReport.schema_version || null
        }
    });
    addCheck(checks, {
        id: "default_weight_implementation_report_applied",
        passed: defaultWeightImplementationReport.implementation_status === "applied"
            && defaultWeightImplementationReport.summary
            && defaultWeightImplementationReport.summary.mismatched_map_count === 0,
        blocker: "default_weight_implementation_mismatch",
        detail: {
            implementation_status: defaultWeightImplementationReport.implementation_status || null,
            mismatched_map_count: defaultWeightImplementationReport.summary
                ? defaultWeightImplementationReport.summary.mismatched_map_count ?? null
                : null,
            selected_multiplier: defaultWeightImplementationReport.selected_multiplier ?? null
        }
    });
    addCheck(checks, {
        id: "default_weight_authority_adoption_status_reported",
        passed: defaultWeightAuthorityMetadataPresent,
        blocker: "default_weight_authority_adoption_metadata_missing",
        detail: {
            authority_adoption_allowed: typeof defaultWeightImplementationReport.authority_adoption_allowed === "boolean"
                ? defaultWeightImplementationReport.authority_adoption_allowed
                : null,
            authority_blocker_count: defaultWeightAuthorityBlockers.length
        }
    });
    addCheck(checks, {
        id: "count_fit_sample_acquisition_queue_schema_present",
        passed: queueSchemaPresent,
        blocker: "count_fit_sample_acquisition_queue_schema_missing",
        detail: {
            queue_schema_version: countFitSampleAcquisitionQueue.schema_version || null
        }
    });
    addCheck(checks, {
        id: "count_fit_sample_acquisition_queue_covers_count_fit_blockers",
        passed: queueSchemaPresent && deepEqual(queueBlockedMaps, architectureCountFitBlockedMaps),
        blocker: "count_fit_sample_acquisition_queue_missing_blocked_maps",
        detail: {
            architecture_count_fit_blocked_maps: architectureCountFitBlockedMaps,
            queue_blocked_maps: queueBlockedMaps
        }
    });
    addCheck(checks, {
        id: "count_fit_sample_acquisition_pack_schema_present",
        passed: packSchemaPresent,
        blocker: "count_fit_sample_acquisition_pack_schema_missing",
        detail: {
            pack_schema_version: countFitSampleAcquisitionPack.schema_version || null
        }
    });
    addCheck(checks, {
        id: "count_fit_sample_acquisition_pack_covers_queue_blockers",
        passed: packSchemaPresent && deepEqual(packBlockedMaps, queueBlockedMaps),
        blocker: "count_fit_sample_acquisition_pack_missing_queue_blocked_maps",
        detail: {
            queue_blocked_maps: queueBlockedMaps,
            pack_blocked_maps: packBlockedMaps
        }
    });
    addCheck(checks, {
        id: "count_fit_sample_review_template_schema_present",
        passed: reviewTemplateSchemaPresent,
        blocker: "count_fit_sample_review_template_schema_missing",
        detail: {
            review_template_schema_version: countFitSampleReviewTemplate.schema_version || null
        }
    });
    addCheck(checks, {
        id: "count_fit_sample_review_template_covers_acquisition_pack",
        passed: reviewTemplateSchemaPresent
            && reviewExistingDraftCount === packExistingTaskCount
            && reviewFreshTemplateCount === packFreshTaskCount,
        blocker: "count_fit_sample_review_template_task_count_mismatch",
        detail: {
            pack_existing_candidate_task_count: packExistingTaskCount,
            review_existing_candidate_draft_count: reviewExistingDraftCount,
            pack_fresh_capture_task_count: packFreshTaskCount,
            review_fresh_capture_template_count: reviewFreshTemplateCount
        }
    });
    addCheck(checks, {
        id: "count_fit_sample_review_import_schema_present",
        passed: reviewImportSchemaPresent,
        blocker: "count_fit_sample_review_import_schema_missing",
        detail: {
            review_import_schema_version: countFitSampleReviewImport.schema_version || null
        }
    });
    addCheck(checks, {
        id: "count_fit_readiness_consumes_review_import",
        passed: reviewImportSchemaPresent
            && readinessReviewImportPackage
            && readinessReviewImportPackage.schema_version === countFitSampleReviewImport.schema_version
            && readinessReviewImportPackage.sample_count === reviewImportSampleCount,
        blocker: "count_fit_readiness_missing_review_import_package",
        detail: {
            review_import_path: reviewImportPath,
            readiness_package_schema_version: readinessReviewImportPackage
                ? readinessReviewImportPackage.schema_version || null
                : null,
            readiness_package_sample_count: readinessReviewImportPackage
                ? readinessReviewImportPackage.sample_count ?? null
                : null,
            review_import_sample_count: reviewImportSampleCount
        }
    });

    const blockers = checks
        .filter((check) => !check.passed && check.blocker)
        .map((check) => check.blocker);

    return {
        schema_version: "ak_producer_strategy_chain_audit_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        status: blockers.length ? "blocked" : "passed",
        inputs: {
            candidate_config: paths.candidateConfigPath || DEFAULT_CANDIDATE_CONFIG_PATH,
            count_replay_report: paths.countReplayReportPath || DEFAULT_COUNT_REPLAY_REPORT_PATH,
            replay_diagnostics_report: paths.replayDiagnosticsReportPath || DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH,
            architecture_report: architecturePath,
            default_weight_implementation_report: paths.defaultWeightImplementationReportPath
                || DEFAULT_DEFAULT_WEIGHT_IMPLEMENTATION_REPORT_PATH,
            count_fit_sample_acquisition_queue: paths.countFitSampleAcquisitionQueuePath
                || DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_QUEUE_PATH,
            count_fit_sample_acquisition_pack: paths.countFitSampleAcquisitionPackPath
                || DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_PACK_PATH,
            count_fit_sample_review_template: paths.countFitSampleReviewTemplatePath
                || DEFAULT_COUNT_FIT_SAMPLE_REVIEW_TEMPLATE_PATH,
            count_fit_readiness_report: paths.countFitReadinessReportPath
                || DEFAULT_COUNT_FIT_READINESS_REPORT_PATH,
            count_fit_sample_review_import: reviewImportPath
        },
        summary: {
            check_count: checks.length,
            passed_check_count: checks.filter((check) => check.passed).length,
            failed_check_count: blockers.length,
            candidate_generated_at: candidateContext.generated_at || null,
            replay_context_generated_at: replayContext.generated_at || null,
            diagnostics_context_generated_at: diagnosticsContext.generated_at || null,
            maps_ready_for_default_weight_update: architectureReport.summary
                ? architectureReport.summary.maps_ready_for_default_weight_update ?? null
                : null,
            default_weight_implementation_status: defaultWeightImplementationReport.implementation_status || null,
            default_weight_mismatched_map_count: defaultWeightImplementationReport.summary
                ? defaultWeightImplementationReport.summary.mismatched_map_count ?? null
                : null,
            default_weight_selected_multiplier: defaultWeightImplementationReport.selected_multiplier ?? null,
            default_weight_authority_adoption_allowed: typeof defaultWeightImplementationReport.authority_adoption_allowed === "boolean"
                ? defaultWeightImplementationReport.authority_adoption_allowed
                : null,
            default_weight_authority_blocker_count: defaultWeightAuthorityBlockers.length,
            count_fit_sample_acquisition_blocked_map_count: countFitSampleAcquisitionQueue.summary
                ? countFitSampleAcquisitionQueue.summary.blocked_map_count ?? null
                : null,
            count_fit_sample_acquisition_total_target_new_same_battle_samples: countFitSampleAcquisitionQueue.summary
                ? countFitSampleAcquisitionQueue.summary.total_target_new_same_battle_samples ?? null
                : null,
            count_fit_sample_acquisition_priority_counts: countFitSampleAcquisitionQueue.summary
                ? countFitSampleAcquisitionQueue.summary.priority_counts || {}
                : {},
            count_fit_sample_acquisition_blocked_maps: queueBlockedMaps,
            count_fit_sample_acquisition_pack_existing_candidate_task_count: countFitSampleAcquisitionPack.summary
                ? countFitSampleAcquisitionPack.summary.existing_candidate_task_count ?? null
                : null,
            count_fit_sample_acquisition_pack_fresh_capture_map_count: countFitSampleAcquisitionPack.summary
                ? countFitSampleAcquisitionPack.summary.fresh_capture_map_count ?? null
                : null,
            count_fit_sample_acquisition_pack_blocked_maps: packBlockedMaps,
            count_fit_sample_review_template_existing_candidate_review_count: reviewExistingDraftCount,
            count_fit_sample_review_template_fresh_capture_template_count: reviewFreshTemplateCount,
            count_fit_sample_review_template_pixel_training_label_allowed_count: countFitSampleReviewTemplate.summary
                ? countFitSampleReviewTemplate.summary.pixel_training_label_allowed_count ?? null
                : null,
            count_fit_sample_review_import_accepted_sample_count: countFitSampleReviewImport.summary
                ? countFitSampleReviewImport.summary.accepted_sample_count ?? null
                : null,
            count_fit_sample_review_import_blocked_entry_count: countFitSampleReviewImport.summary
                ? countFitSampleReviewImport.summary.blocked_entry_count ?? null
                : null,
            count_fit_readiness_review_import_sample_count: readinessReviewImportPackage
                ? readinessReviewImportPackage.sample_count ?? null
                : null
        },
        default_weight_authority_blockers: defaultWeightAuthorityBlockers,
        blockers,
        checks
    };
}

function formatProducerStrategyChainAuditMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = (report.checks || []).map((check) => (
        `| ${markdownCode(check.id)} | ${markdownCode(check.passed === true)} | ${markdownCode(check.blocker)} |`
    )).join("\n");
    const defaultWeightAuthorityBlockers = Array.isArray(report.default_weight_authority_blockers)
        ? report.default_weight_authority_blockers
        : [];

    return `# producer strategy chain audit

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- status: \`${report.status}\`
- failed checks: \`${report.summary ? report.summary.failed_check_count : 0}\`
- default weight authority adoption allowed: \`${report.summary ? report.summary.default_weight_authority_adoption_allowed : "-"}\`
- default weight authority blockers: \`${defaultWeightAuthorityBlockers.join(", ") || "-"}\`
- count-fit acquisition blocked maps: \`${report.summary ? report.summary.count_fit_sample_acquisition_blocked_map_count : "-"}\`
- count-fit acquisition target samples: \`${report.summary ? report.summary.count_fit_sample_acquisition_total_target_new_same_battle_samples : "-"}\`
- count-fit acquisition existing candidate tasks: \`${report.summary ? report.summary.count_fit_sample_acquisition_pack_existing_candidate_task_count : "-"}\`
- count-fit acquisition fresh map tasks: \`${report.summary ? report.summary.count_fit_sample_acquisition_pack_fresh_capture_map_count : "-"}\`
- count-fit review template existing drafts: \`${report.summary ? report.summary.count_fit_sample_review_template_existing_candidate_review_count : "-"}\`
- count-fit review template fresh drafts: \`${report.summary ? report.summary.count_fit_sample_review_template_fresh_capture_template_count : "-"}\`
- count-fit review import accepted samples: \`${report.summary ? report.summary.count_fit_sample_review_import_accepted_sample_count : "-"}\`
- count-fit review import blocked entries: \`${report.summary ? report.summary.count_fit_sample_review_import_blocked_entry_count : "-"}\`

## Checks

| check | passed | blocker |
| --- | --- | --- |
${rows || "| `-` | `false` | `missing_checks` |"}
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: readJson(args.candidateConfigPath),
        countReplayReport: readJson(args.countReplayReportPath),
        replayDiagnosticsReport: readJson(args.replayDiagnosticsReportPath),
        architectureReport: readJson(args.architectureReportPath),
        defaultWeightImplementationReport: readJson(args.defaultWeightImplementationReportPath),
        countFitSampleAcquisitionQueue: readJson(args.countFitSampleAcquisitionQueuePath),
        countFitSampleAcquisitionPack: readJson(args.countFitSampleAcquisitionPackPath),
        countFitSampleReviewTemplate: readJson(args.countFitSampleReviewTemplatePath),
        countFitReadinessReport: readJson(args.countFitReadinessReportPath),
        countFitSampleReviewImport: readJson(args.countFitSampleReviewImportPath),
        paths: args
    });
    writeJson(args.outputPath, report);
    fs.writeFileSync(args.outputPath.replace(/\.json$/i, ".md"), formatProducerStrategyChainAuditMarkdown(report, args.outputPath), "utf8");
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ARCHITECTURE_REPORT_PATH,
    DEFAULT_CANDIDATE_CONFIG_PATH,
    DEFAULT_COUNT_FIT_READINESS_REPORT_PATH,
    DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_PACK_PATH,
    DEFAULT_COUNT_FIT_SAMPLE_ACQUISITION_QUEUE_PATH,
    DEFAULT_COUNT_FIT_SAMPLE_REVIEW_IMPORT_PATH,
    DEFAULT_COUNT_FIT_SAMPLE_REVIEW_TEMPLATE_PATH,
    DEFAULT_COUNT_REPLAY_REPORT_PATH,
    DEFAULT_DEFAULT_WEIGHT_IMPLEMENTATION_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH,
    buildProducerStrategyChainAuditReport,
    formatProducerStrategyChainAuditMarkdown,
    main,
    resolveArgs
};
