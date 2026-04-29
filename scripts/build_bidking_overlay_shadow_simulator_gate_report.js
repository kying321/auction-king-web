const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OVERLAY_INTEGRITY_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-staging-overlay-reference-integrity-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-overlay-shadow-simulator-gate-report.json"
);
const EXPECTED_OVERLAY_INTEGRITY_SCHEMA_VERSION = "ak_bidking_staging_overlay_reference_integrity_v1";

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        overlayIntegrityReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_OVERLAY_INTEGRITY_REPORT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
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

function uniqueSortedNumbers(values) {
    return Array.from(new Set((values || []).map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function uniqueSortedStrings(values) {
    return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean))).sort();
}

function collectOverlayBlockers(summary = {}) {
    return Array.isArray(summary.blockers) ? summary.blockers.filter(Boolean).map(String) : [];
}

function buildBidKingOverlayShadowSimulatorGateReport({
    overlayIntegrityReport = readJson(DEFAULT_OVERLAY_INTEGRITY_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const overlaySchemaValid = overlayIntegrityReport.schema_version === EXPECTED_OVERLAY_INTEGRITY_SCHEMA_VERSION;
    const summary = overlayIntegrityReport.summary || {};
    const gates = overlayIntegrityReport.gates || {};
    const stagedItemIds = uniqueSortedNumbers(summary.staged_item_ids || []);
    const unresolvedItemIds = uniqueSortedNumbers(summary.unresolved_project_missing_item_ids_after_overlay || []);
    const mapsStillBlocked = uniqueSortedStrings(summary.maps_still_blocked_after_overlay || []);
    const overlayClean = summary.staging_overlay_reference_integrity_clean_for_project_scope === true
        && gates.staging_overlay_reference_integrity_clean_for_project_scope === true;
    const overlayCandidateInput = summary.staging_overlay_shadow_replay_candidate_allowed === true
        && gates.staging_overlay_shadow_replay_candidate_allowed === true;
    const sourceTablesMutated = summary.source_tables_mutated === true || gates.source_tables_mutated === true;
    const unexpectedPromotionGateOpen = summary.table_backed_shadow_replay_allowed === true
        || gates.table_backed_shadow_replay_allowed === true
        || summary.authority_handoff_allowed === true
        || gates.authority_handoff_allowed === true
        || summary.default_config_update_allowed === true
        || gates.default_config_update_allowed === true;

    const blockers = [];
    collectOverlayBlockers(summary).forEach((blocker) => addReason(blockers, blocker));
    if (!overlaySchemaValid) addReason(blockers, "invalid_staging_overlay_reference_integrity_schema");
    if (!stagedItemIds.length) addReason(blockers, "no_staged_item_rows");
    if (!overlayClean) addReason(blockers, "staging_overlay_reference_integrity_not_clean");
    if (!overlayCandidateInput) addReason(blockers, "staging_overlay_shadow_replay_candidate_not_allowed");
    if (unresolvedItemIds.length) addReason(blockers, "project_relevant_missing_terminal_item_references_after_overlay");
    if (mapsStillBlocked.length) addReason(blockers, "maps_still_blocked_after_overlay");
    if (sourceTablesMutated) addReason(blockers, "source_tables_mutated_unexpectedly");
    if (summary.table_backed_shadow_replay_allowed === true || gates.table_backed_shadow_replay_allowed === true) {
        addReason(blockers, "unexpected_table_backed_shadow_replay_allowed_true");
    }
    if (summary.authority_handoff_allowed === true || gates.authority_handoff_allowed === true) {
        addReason(blockers, "unexpected_authority_handoff_allowed_true");
    }
    if (summary.default_config_update_allowed === true || gates.default_config_update_allowed === true) {
        addReason(blockers, "unexpected_default_config_update_allowed_true");
    }

    const candidateAllowed = overlaySchemaValid
        && overlayClean
        && overlayCandidateInput
        && stagedItemIds.length > 0
        && unresolvedItemIds.length === 0
        && mapsStillBlocked.length === 0
        && !sourceTablesMutated
        && !unexpectedPromotionGateOpen;

    if (candidateAllowed) addReason(blockers, "overlay_shadow_simulator_not_rerun");

    return {
        schema_version: "ak_bidking_overlay_shadow_simulator_gate_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            staging_overlay_reference_integrity_report: paths.overlayIntegrityReportPath || DEFAULT_OVERLAY_INTEGRITY_REPORT_PATH
        },
        summary: {
            overlay_integrity_schema_version: overlayIntegrityReport.schema_version || null,
            original_project_missing_item_ids: uniqueSortedNumbers(summary.original_project_missing_item_ids || []),
            staged_item_ids: stagedItemIds,
            covered_project_missing_item_ids: uniqueSortedNumbers(summary.covered_project_missing_item_ids || []),
            unresolved_project_missing_item_ids_after_overlay: unresolvedItemIds,
            maps_still_blocked_after_overlay: mapsStillBlocked,
            staging_overlay_reference_integrity_clean_for_project_scope: overlayClean,
            overlay_shadow_simulator_candidate_allowed: candidateAllowed,
            overlay_shadow_simulator_status: candidateAllowed
                ? "overlay_shadow_simulator_candidate_ready"
                : "blocked_overlay_shadow_simulator_gate",
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            source_tables_mutated: sourceTablesMutated,
            recommended_next_action: candidateAllowed
                ? "run_overlay_shadow_simulator_with_staging_overlay_before_any_promotion"
                : "resolve_staging_overlay_reference_integrity_before_shadow_simulator",
            blockers
        },
        gates: {
            staging_overlay_reference_integrity_schema_valid: overlaySchemaValid,
            staging_overlay_reference_integrity_clean_for_project_scope: overlayClean,
            overlay_shadow_simulator_candidate_allowed: candidateAllowed,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            source_tables_mutated: sourceTablesMutated,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false
        },
        notes: [
            "This gate consumes the staging overlay integrity artifact and does not mutate BidKing source tables.",
            "A clean staging overlay can only permit a SIM_ONLY overlay-shadow simulator candidate.",
            "Authority handoff, table-backed replay promotion, and default config update remain closed."
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

function formatBidKingOverlayShadowSimulatorGateMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;

    return `# BidKing overlay shadow simulator gate

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Candidate allowed: \`${summary.overlay_shadow_simulator_candidate_allowed === true}\`
- Status: \`${summary.overlay_shadow_simulator_status || "blocked_overlay_shadow_simulator_gate"}\`
- Staged item ids: ${markdownCell(JSON.stringify(summary.staged_item_ids || []))}
- Unresolved after overlay: ${markdownCell(JSON.stringify(summary.unresolved_project_missing_item_ids_after_overlay || []))}
- Maps still blocked: ${markdownCell(JSON.stringify(summary.maps_still_blocked_after_overlay || []))}
- Source tables mutated: \`${summary.source_tables_mutated === true}\`
- Table-backed shadow replay allowed: \`${summary.table_backed_shadow_replay_allowed === true}\`
- Authority handoff allowed: \`${summary.authority_handoff_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Gates

| gate | value |
| --- | --- |
| ${markdownCode("staging_overlay_reference_integrity_clean_for_project_scope")} | ${markdownCode(report.gates && report.gates.staging_overlay_reference_integrity_clean_for_project_scope === true)} |
| ${markdownCode("overlay_shadow_simulator_candidate_allowed")} | ${markdownCode(report.gates && report.gates.overlay_shadow_simulator_candidate_allowed === true)} |
| ${markdownCode("table_backed_shadow_replay_allowed")} | ${markdownCode(false)} |
| ${markdownCode("authority_handoff_allowed")} | ${markdownCode(false)} |
| ${markdownCode("default_config_update_allowed")} | ${markdownCode(false)} |

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

The overlay gate is SIM_ONLY. It can authorize only a staging-overlay shadow simulator candidate after reference integrity is clean; it never opens authority handoff, table-backed replay promotion, or default config updates.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingOverlayShadowSimulatorGateReport({
        overlayIntegrityReport: readJson(args.overlayIntegrityReportPath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            overlayIntegrityReportPath: args.overlayIntegrityReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatBidKingOverlayShadowSimulatorGateMarkdown(report, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_OVERLAY_INTEGRITY_REPORT_PATH,
    EXPECTED_OVERLAY_INTEGRITY_SCHEMA_VERSION,
    buildBidKingOverlayShadowSimulatorGateReport,
    formatBidKingOverlayShadowSimulatorGateMarkdown,
    main,
    resolveArgs
};
