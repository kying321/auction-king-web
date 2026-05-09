const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INVERSE_TAIL_CANDIDATE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-inverse-tail-shadow-candidate-report.json"
);
const DEFAULT_MISSING_ITEM_RESOLUTION_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-1106013-resolution-candidate-refresh.json"
);
const DEFAULT_MISSING_ITEM_SOURCE_RECOVERY_SCAN_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-1106013-public-local-source-recovery-scan.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-inverse-tail-shadow-replay-gate-report.json"
);
const DEFAULT_REVIEW_IMPORT_PATHS = [
    path.join(ROOT_DIR, "docs", "research", "2026-04-26-sunken-ship-codex-visual-manual-confirmation-import.json"),
    path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-count-confirmation-import.json"),
    path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-count-confirmation-import.json")
];
const EXPECTED_CANDIDATE_SCHEMA = "ak_bidking_inverse_tail_shadow_candidate_v1";
const EXPECTED_RESOLUTION_SCHEMA = "ak_bidking_missing_item_resolution_candidate_v1";
const EXPECTED_SOURCE_SCAN_SCHEMA = "ak_bidking_missing_item_source_recovery_scan_v1";
const EXPECTED_REVIEW_IMPORT_SCHEMA = "ak_count_fit_sample_review_import_v1";
const TARGET_ITEM_ID = 1106013;
const MIN_SAME_BATTLE_SAMPLES_PER_IMPACTED_MAP = 3;

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const reviewImportPaths = [];
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--review-import") {
            index += 1;
            if (!argv[index]) throw new Error("--review-import requires a path");
            reviewImportPaths.push(path.resolve(String(argv[index])));
        } else if (arg.startsWith("--review-import=")) {
            reviewImportPaths.push(path.resolve(arg.slice("--review-import=".length)));
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
        inverseTailCandidateReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_INVERSE_TAIL_CANDIDATE_REPORT_PATH,
        missingItemResolutionReportPath: positional[1]
            ? path.resolve(positional[1])
            : DEFAULT_MISSING_ITEM_RESOLUTION_REPORT_PATH,
        missingItemSourceRecoveryScanReportPath: positional[2]
            ? path.resolve(positional[2])
            : DEFAULT_MISSING_ITEM_SOURCE_RECOVERY_SCAN_REPORT_PATH,
        outputPath: positional[3] ? path.resolve(positional[3]) : DEFAULT_OUTPUT_PATH,
        reviewImportPaths: reviewImportPaths.length
            ? reviewImportPaths
            : DEFAULT_REVIEW_IMPORT_PATHS.filter((entry) => fs.existsSync(entry)),
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

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function uniqueSortedStrings(values) {
    return Array.from(new Set((values || []).map((entry) => String(entry)).filter(Boolean))).sort();
}

function uniqueSortedNumbers(values) {
    return Array.from(new Set((values || []).map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function safeSummary(report) {
    return report && report.summary && typeof report.summary === "object" ? report.summary : {};
}

function safeGates(report) {
    return report && report.gates && typeof report.gates === "object" ? report.gates : {};
}

function isGateTrue(report, key) {
    return safeSummary(report)[key] === true || safeGates(report)[key] === true;
}

function countSamplesByMap(reviewImports = []) {
    const byMap = {};
    let acceptedSampleCount = 0;
    let blockedEntryCount = 0;
    const importSummaries = [];

    reviewImports.forEach((entry, index) => {
        const summary = safeSummary(entry);
        const samples = safeArray(entry.samples);
        const accepted = Number.isFinite(Number(summary.accepted_sample_count))
            ? Number(summary.accepted_sample_count)
            : samples.length;
        acceptedSampleCount += accepted;
        blockedEntryCount += Number.isFinite(Number(summary.blocked_entry_count))
            ? Number(summary.blocked_entry_count)
            : 0;

        if (summary.map_counts && typeof summary.map_counts === "object") {
            Object.entries(summary.map_counts).forEach(([mapId, count]) => {
                byMap[mapId] = (byMap[mapId] || 0) + Number(count || 0);
            });
        } else {
            samples.forEach((sample) => {
                if (!sample || !sample.map_id) return;
                byMap[sample.map_id] = (byMap[sample.map_id] || 0) + 1;
            });
        }

        importSummaries.push({
            index,
            schema_version: entry.schema_version || null,
            export_kind: entry.export_kind || null,
            accepted_sample_count: accepted,
            blocked_entry_count: Number(summary.blocked_entry_count || 0),
            map_counts: summary.map_counts || {}
        });
    });

    return {
        accepted_sample_count: acceptedSampleCount,
        blocked_entry_count: blockedEntryCount,
        by_map: Object.fromEntries(Object.entries(byMap).sort(([left], [right]) => left.localeCompare(right))),
        import_summaries: importSummaries
    };
}

function buildDeficitByMap(impactedMaps, samplesByMap, minimum) {
    return Object.fromEntries(impactedMaps.map((mapId) => {
        const current = Number(samplesByMap[mapId] || 0);
        return [mapId, Math.max(0, minimum - current)];
    }));
}

function formatReportPath(filePath) {
    if (!filePath) return null;
    const resolved = path.resolve(filePath);
    const relative = path.relative(ROOT_DIR, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.split(path.sep).join("/");
    }
    return filePath;
}

function buildBidKingInverseTailShadowReplayGateReport({
    inverseTailCandidateReport = readJson(DEFAULT_INVERSE_TAIL_CANDIDATE_REPORT_PATH),
    missingItemResolutionReport = readJson(DEFAULT_MISSING_ITEM_RESOLUTION_REPORT_PATH),
    missingItemSourceRecoveryScanReport = readJson(DEFAULT_MISSING_ITEM_SOURCE_RECOVERY_SCAN_REPORT_PATH),
    reviewImports = DEFAULT_REVIEW_IMPORT_PATHS.filter((entry) => fs.existsSync(entry)).map(readJson),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const candidateSummary = safeSummary(inverseTailCandidateReport);
    const resolutionSummary = safeSummary(missingItemResolutionReport);
    const sourceScanSummary = safeSummary(missingItemSourceRecoveryScanReport);
    const candidateSchemaValid = inverseTailCandidateReport.schema_version === EXPECTED_CANDIDATE_SCHEMA;
    const resolutionSchemaValid = missingItemResolutionReport.schema_version === EXPECTED_RESOLUTION_SCHEMA;
    const sourceScanSchemaValid = missingItemSourceRecoveryScanReport.schema_version === EXPECTED_SOURCE_SCAN_SCHEMA;
    const reviewImportSchemasValid = reviewImports.every((entry) => entry.schema_version === EXPECTED_REVIEW_IMPORT_SCHEMA);
    const candidateSupported = candidateSummary.verdict === "inverse_value_supported_shadow_only";
    const targetMissingItemIds = uniqueSortedNumbers(resolutionSummary.project_relevant_missing_item_ids || []);
    const impactedMaps = uniqueSortedStrings(resolutionSummary.impacted_project_maps || []);
    const sourceRowRecovered = isGateTrue(missingItemSourceRecoveryScanReport, "source_item_row_recovered_for_project_scope")
        || isGateTrue(missingItemResolutionReport, "source_item_rows_recovered_for_project_scope");
    const sampleSummary = countSamplesByMap(reviewImports);
    const sampleDeficitByMap = buildDeficitByMap(
        impactedMaps,
        sampleSummary.by_map,
        MIN_SAME_BATTLE_SAMPLES_PER_IMPACTED_MAP
    );
    const impactedMapSampleReady = impactedMaps.length > 0
        && Object.values(sampleDeficitByMap).every((value) => value === 0);
    const diagnosticShadowAnalysisAllowed = candidateSchemaValid && candidateSupported;
    const inverseTailShadowReplayAllowed = diagnosticShadowAnalysisAllowed
        && sourceRowRecovered
        && impactedMapSampleReady
        && reviewImportSchemasValid
        && !isGateTrue(inverseTailCandidateReport, "default_config_update_allowed")
        && !isGateTrue(inverseTailCandidateReport, "authority_handoff_allowed");

    const blockers = [];
    if (!candidateSchemaValid) addReason(blockers, "invalid_inverse_tail_candidate_schema");
    if (!resolutionSchemaValid) addReason(blockers, "invalid_missing_item_resolution_schema");
    if (!sourceScanSchemaValid) addReason(blockers, "invalid_missing_item_source_recovery_scan_schema");
    if (!reviewImportSchemasValid) addReason(blockers, "invalid_same_battle_review_import_schema");
    if (!candidateSupported) addReason(blockers, "inverse_tail_candidate_not_supported");
    if (targetMissingItemIds.includes(TARGET_ITEM_ID) && !sourceRowRecovered) {
        addReason(blockers, "missing_authoritative_item_row_1106013");
    }
    if (!impactedMaps.length) addReason(blockers, "missing_impacted_project_maps");
    if (!impactedMapSampleReady) addReason(blockers, "impacted_map_sample_count_below_minimum");
    Object.entries(sampleDeficitByMap).forEach(([mapId, deficit]) => {
        if (deficit > 0) addReason(blockers, `${mapId}_same_battle_samples_missing`);
    });
    if (sampleSummary.accepted_sample_count < MIN_SAME_BATTLE_SAMPLES_PER_IMPACTED_MAP) {
        addReason(blockers, "accepted_same_battle_sample_count_below_minimum");
    }
    addReason(blockers, "shadow_replay_not_default_promotion");
    addReason(blockers, "authority_handoff_gate_closed");
    addReason(blockers, "default_config_update_gate_closed");

    return {
        schema_version: "ak_bidking_inverse_tail_shadow_replay_gate_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            inverse_tail_shadow_candidate_report: formatReportPath(
                paths.inverseTailCandidateReportPath || DEFAULT_INVERSE_TAIL_CANDIDATE_REPORT_PATH
            ),
            missing_item_resolution_candidate_report: formatReportPath(
                paths.missingItemResolutionReportPath || DEFAULT_MISSING_ITEM_RESOLUTION_REPORT_PATH
            ),
            missing_item_source_recovery_scan_report: formatReportPath(
                paths.missingItemSourceRecoveryScanReportPath || DEFAULT_MISSING_ITEM_SOURCE_RECOVERY_SCAN_REPORT_PATH
            ),
            review_imports: safeArray(paths.reviewImportPaths).map(formatReportPath)
        },
        summary: {
            inverse_tail_candidate_schema_valid: candidateSchemaValid,
            inverse_tail_candidate_verdict: candidateSummary.verdict || null,
            diagnostic_shadow_analysis_allowed: diagnosticShadowAnalysisAllowed,
            inverse_tail_shadow_replay_allowed: inverseTailShadowReplayAllowed,
            table_backed_shadow_replay_allowed: false,
            promotion_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            target_item_id: TARGET_ITEM_ID,
            project_relevant_missing_item_ids: targetMissingItemIds,
            missing_1106013_source_recovered: sourceRowRecovered,
            impacted_project_maps: impactedMaps,
            min_same_battle_samples_per_impacted_map: MIN_SAME_BATTLE_SAMPLES_PER_IMPACTED_MAP,
            accepted_same_battle_sample_count: sampleSummary.accepted_sample_count,
            accepted_same_battle_sample_count_by_map: sampleSummary.by_map,
            same_battle_sample_deficit_by_impacted_map: sampleDeficitByMap,
            blocked_review_entry_count: sampleSummary.blocked_entry_count,
            target_missing_item_diagnostic_count: safeArray(
                inverseTailCandidateReport.target_missing_item_diagnostics
            ).filter((entry) => Number(entry.item_id) === TARGET_ITEM_ID).length,
            red_quality_beta_median: inverseTailCandidateReport.non_authority_shadow_candidate
                ? inverseTailCandidateReport.non_authority_shadow_candidate.red_quality_beta_median
                : null,
            recommended_next_action: inverseTailShadowReplayAllowed
                ? "run_shadow_replay_comparison_without_default_promotion"
                : "recover_1106013_authority_and_collect_impacted_map_same_battle_samples",
            blockers
        },
        gates: {
            diagnostic_shadow_analysis_allowed: diagnosticShadowAnalysisAllowed,
            inverse_tail_shadow_replay_allowed: inverseTailShadowReplayAllowed,
            table_backed_shadow_replay_allowed: false,
            promotion_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            source_item_row_recovered_for_project_scope: sourceRowRecovered,
            impacted_map_sample_count_ready: impactedMapSampleReady
        },
        review_import_summaries: sampleSummary.import_summaries,
        notes: [
            "This gate separates inverse-tail curve evidence from replay/adoption readiness.",
            "Even when shadow replay is allowed, promotion_allowed remains false.",
            "Default config updates require a later source-owned authority handoff and non-regression review."
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

function formatBidKingInverseTailShadowReplayGateMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = safeSummary(report);
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const deficitRows = Object.entries(summary.same_battle_sample_deficit_by_impacted_map || {}).map(([mapId, deficit]) => (
        `| ${markdownCode(mapId)} | ${markdownCode((summary.accepted_same_battle_sample_count_by_map || {})[mapId] || 0)} | ${markdownCode(deficit)} |`
    )).join("\n");

    return `# BidKing inverse-tail shadow replay gate

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Diagnostic shadow analysis allowed: \`${summary.diagnostic_shadow_analysis_allowed === true}\`
- Inverse-tail shadow replay allowed: \`${summary.inverse_tail_shadow_replay_allowed === true}\`
- Promotion allowed: \`${summary.promotion_allowed === true}\`
- Authority handoff allowed: \`${summary.authority_handoff_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Evidence

| field | value |
| --- | --- |
| ${markdownCode("candidate_verdict")} | ${markdownCode(summary.inverse_tail_candidate_verdict)} |
| ${markdownCode("red_quality_beta_median")} | ${markdownCode(summary.red_quality_beta_median)} |
| ${markdownCode("missing_1106013_source_recovered")} | ${markdownCode(summary.missing_1106013_source_recovered === true)} |
| ${markdownCode("accepted_same_battle_sample_count")} | ${markdownCode(summary.accepted_same_battle_sample_count || 0)} |
| ${markdownCode("blocked_review_entry_count")} | ${markdownCode(summary.blocked_review_entry_count || 0)} |

## Same-Battle Sample Deficit

| map | accepted samples | deficit to minimum |
| --- | ---: | ---: |
${deficitRows || "| `-` | `0` | `0` |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

The inverse-tail curve can remain a diagnostic shadow candidate. It cannot move into table-backed replay, authority handoff, or default config until the missing item source row and impacted-map same-battle samples are recovered.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const reviewImports = args.reviewImportPaths.map(readJson);
    const report = buildBidKingInverseTailShadowReplayGateReport({
        inverseTailCandidateReport: readJson(args.inverseTailCandidateReportPath),
        missingItemResolutionReport: readJson(args.missingItemResolutionReportPath),
        missingItemSourceRecoveryScanReport: readJson(args.missingItemSourceRecoveryScanReportPath),
        reviewImports,
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            inverseTailCandidateReportPath: args.inverseTailCandidateReportPath,
            missingItemResolutionReportPath: args.missingItemResolutionReportPath,
            missingItemSourceRecoveryScanReportPath: args.missingItemSourceRecoveryScanReportPath,
            reviewImportPaths: args.reviewImportPaths
        }
    });
    writeJson(args.outputPath, report);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatBidKingInverseTailShadowReplayGateMarkdown(report, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    buildBidKingInverseTailShadowReplayGateReport,
    formatBidKingInverseTailShadowReplayGateMarkdown,
    main,
    resolveArgs
};
