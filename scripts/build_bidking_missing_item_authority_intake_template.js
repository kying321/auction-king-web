const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-resolution-candidate-report.json"
);
const DEFAULT_SOURCE_RECOVERY_SCAN_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-source-recovery-scan-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-authority-intake-template.json"
);
const REQUIRED_ITEM_ROW_FIELDS = [
    "id",
    "localized_name",
    "item_type_id",
    "slot_type",
    "item_quality",
    "base_value",
    "max_per_listing",
    "collection",
    "collection_coin",
    "icon_path",
    "model_3D",
    "raw_item_txt_row",
    "authority_source_type",
    "source_path_or_capture_id",
    "client_build_or_version",
    "reviewer_notes"
];

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
        missingItemCandidateReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH,
        sourceRecoveryScanReportPath: positional[1]
            ? path.resolve(positional[1])
            : DEFAULT_SOURCE_RECOVERY_SCAN_REPORT_PATH,
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

function uniqueSortedNumbers(values) {
    return Array.from(new Set((values || []).map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function uniqueSortedStrings(values) {
    return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean))).sort();
}

function buildRecoveryIndex(sourceRecoveryScanReport = {}) {
    const index = new Map();
    (sourceRecoveryScanReport.item_recovery || []).forEach((entry) => {
        const itemId = Number(entry.item_id);
        if (Number.isFinite(itemId)) index.set(itemId, entry);
    });
    return index;
}

function compactDropReference(entry = {}) {
    return {
        item_id: Number(entry.item_id),
        drop_group_id: Number(entry.drop_group_id),
        drop_localized_name: entry.drop_localized_name || null,
        tuple_index: entry.tuple_index ?? null,
        tuple: Array.isArray(entry.tuple) ? entry.tuple.slice() : [],
        weight: Array.isArray(entry.tuple) && entry.tuple.length > 4 ? Number(entry.tuple[4]) : null,
        parent_reference_count: Number(entry.parent_reference_count || 0)
    };
}

function compactReferenceHit(entry = {}) {
    return {
        source_path: entry.source_path || null,
        source_type: entry.source_type || null,
        file_path: entry.file_path || null,
        member_path: entry.member_path || null,
        relative_path: entry.relative_path || null,
        line_number: entry.line_number ?? null,
        hit_type: entry.hit_type || null
    };
}

function buildIntakeRowTemplate(itemId) {
    return {
        id: itemId,
        localized_name: null,
        item_type_id: null,
        slot_type: null,
        item_quality: null,
        base_value: null,
        max_per_listing: null,
        collection: null,
        collection_coin: null,
        icon_path: null,
        model_3D: null,
        raw_item_txt_row: null,
        authority_source_type: null,
        source_path_or_capture_id: null,
        client_build_or_version: null,
        collected_at: null,
        reviewer_notes: null
    };
}

function buildIntakeItem(candidate = {}, recovery = {}) {
    const itemId = Number(candidate.item_id);
    const sourceRowRecovered = candidate.source_item_record_found === true || recovery.source_item_row_recovered === true;
    const projectMapIds = uniqueSortedStrings(candidate.project_map_ids || []);
    const directAuthoritySourceRequired = !sourceRowRecovered;

    return {
        item_id: itemId,
        priority: directAuthoritySourceRequired && projectMapIds.length ? "P0" : "P1",
        direct_authority_source_required: directAuthoritySourceRequired,
        source_recovery_status: recovery.source_recovery_status || candidate.candidate_status || "unknown",
        source_item_row_recovered: sourceRowRecovered,
        source_item_row_hit_count: Number(recovery.source_item_row_hit_count || 0),
        reference_hit_count: Number(recovery.reference_hit_count || candidate.reference_count || 0),
        impacted_project_maps: projectMapIds,
        reference_weights: uniqueSortedNumbers(candidate.reference_weights || []),
        parent_reference_count: Number(candidate.parent_reference_count || 0),
        neighboring_same_family_item_ids: uniqueSortedNumbers(candidate.neighboring_same_family_item_ids || []),
        acceptable_direct_authority_sources: [
            `raw Tables/Item.txt row from a matching or newer BidKing client package where the row starts with ${itemId}\\t`,
            "complete StreamingAssets/Tables export containing the Item.txt row plus matching Drop.txt references",
            "official or server-side table export with build/version provenance for the missing item row"
        ],
        supporting_but_not_direct_authority_sources: [
            "in-game catalog or settlement capture that helps confirm identity but does not replace the Item.txt row",
            "asset, icon, model, or localization hits that support review but cannot authorize replay promotion alone",
            "neighboring same-family item rows used only as context"
        ],
        required_item_row_fields: REQUIRED_ITEM_ROW_FIELDS.slice(),
        source_evidence_to_collect: [
            `exact raw Item.txt line for item ${itemId}`,
            "source file path or zip member path",
            "client build, version, or package hash",
            "surrounding Item.txt family rows when available",
            "reviewer note explaining source provenance"
        ],
        drop_reference_context: (candidate.missing_drop_references || []).map(compactDropReference),
        local_reference_hits: (recovery.reference_hits || []).map(compactReferenceHit),
        intake_row_template: buildIntakeRowTemplate(itemId),
        allowed_next_actions: [
            "collect_raw_item_row_or_authoritative_table_export",
            "attach_build_version_and_source_path",
            "ingest_recovered_item_row_into_staging_artifact_only",
            "rerun_bidking_table_reference_integrity",
            "rerun_table_backed_shadow_simulator_after_integrity_clean"
        ],
        blocked_actions: [
            "synthetic_item_as_authority",
            "drop_tuple_exclusion_as_authority",
            "table_backed_shadow_replay_promotion",
            "authority_handoff",
            "default_config_update"
        ]
    };
}

function summarizeItems(items = []) {
    const unresolvedItems = items.filter((entry) => entry.direct_authority_source_required);
    return {
        item_count: items.length,
        unresolved_authority_intake_item_count: unresolvedItems.length,
        direct_authority_source_required_count: unresolvedItems.length,
        impacted_project_maps: uniqueSortedStrings(items.flatMap((entry) => entry.impacted_project_maps || [])),
        acceptable_direct_authority_source_types: [
            "raw_item_txt_row",
            "complete_streamingassets_tables_export",
            "official_or_server_side_table_export"
        ],
        required_item_row_fields: REQUIRED_ITEM_ROW_FIELDS.slice(),
        synthetic_item_as_authority_allowed: false,
        drop_tuple_exclusion_as_authority_allowed: false,
        table_backed_shadow_replay_allowed: false,
        authority_handoff_allowed: false,
        default_config_update_allowed: false,
        promotion_allowed: false,
        recommended_next_action: unresolvedItems.length
            ? "collect_authoritative_item_rows_for_missing_project_items_then_ingest_and_rerun_integrity"
            : "ingest_recovered_item_rows_then_rerun_table_reference_integrity_before_replay",
        blockers: unresolvedItems.length
            ? ["missing_item_authority_source_required", "source_item_rows_not_found_in_local_candidates"]
            : ["recovered_item_rows_not_ingested_or_integrity_verified"]
    };
}

function buildBidKingMissingItemAuthorityIntakeTemplate({
    missingItemCandidateReport = readJson(DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH),
    sourceRecoveryScanReport = readJson(DEFAULT_SOURCE_RECOVERY_SCAN_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const recoveryIndex = buildRecoveryIndex(sourceRecoveryScanReport);
    const items = (missingItemCandidateReport.missing_item_candidates || [])
        .map((candidate) => buildIntakeItem(candidate, recoveryIndex.get(Number(candidate.item_id)) || {}))
        .sort((left, right) => (
            left.priority.localeCompare(right.priority)
            || Number(left.item_id) - Number(right.item_id)
        ));
    const summary = summarizeItems(items);

    return {
        schema_version: "ak_bidking_missing_item_authority_intake_template_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            missing_item_candidate_report: paths.missingItemCandidateReportPath || DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH,
            source_recovery_scan_report: paths.sourceRecoveryScanReportPath || DEFAULT_SOURCE_RECOVERY_SCAN_REPORT_PATH
        },
        summary,
        gates: {
            authority_intake_completed: false,
            direct_authority_source_available_for_all_items: summary.direct_authority_source_required_count === 0,
            recovered_rows_ingested: false,
            table_reference_integrity_clean_after_recovery: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false
        },
        items,
        notes: [
            "This template defines evidence required for authority intake; it does not synthesize item rows.",
            "Manual captures can support identity review but cannot directly authorize table-backed replay promotion.",
            "Default estimator config and authority handoff remain closed until source rows are ingested and integrity is clean."
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

function formatBidKingMissingItemAuthorityIntakeMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const rows = (report.items || []).map((entry) => (
        `| ${markdownCode(entry.priority)} | ${markdownCode(entry.item_id)} | ${markdownCode(entry.direct_authority_source_required)} | ${markdownCell(JSON.stringify(entry.impacted_project_maps || []))} | ${markdownCell(JSON.stringify(entry.reference_weights || []))} | ${markdownCode(entry.parent_reference_count)} | ${markdownCode(entry.source_recovery_status)} |`
    )).join("\n");

    return `# BidKing missing item authority intake template

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Direct authority source required: \`${summary.direct_authority_source_required_count ?? 0}\`
- Impacted maps: ${markdownCell(JSON.stringify(summary.impacted_project_maps || []))}
- Table-backed shadow replay allowed: \`${summary.table_backed_shadow_replay_allowed === true}\`
- Authority handoff allowed: \`${summary.authority_handoff_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Intake Items

| priority | item id | direct authority source required | maps | weights | parent refs | recovery status |
| --- | --- | --- | --- | --- | --- | --- |
${rows || "| `-` | `-` | `false` | [] | [] | `0` | `-` |"}

## Required Fields

${(summary.required_item_row_fields || []).map((field) => `- \`${field}\``).join("\n") || "- `none`"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Authority intake remains open only for evidence collection. Synthetic item rows, tuple exclusion, replay promotion, authority handoff, and default config updates stay blocked until raw source rows are collected, ingested into a staging artifact, and table-reference integrity is clean.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingMissingItemAuthorityIntakeTemplate({
        missingItemCandidateReport: readJson(args.missingItemCandidateReportPath),
        sourceRecoveryScanReport: readJson(args.sourceRecoveryScanReportPath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            missingItemCandidateReportPath: args.missingItemCandidateReportPath,
            sourceRecoveryScanReportPath: args.sourceRecoveryScanReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingMissingItemAuthorityIntakeMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_MISSING_ITEM_CANDIDATE_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SOURCE_RECOVERY_SCAN_REPORT_PATH,
    REQUIRED_ITEM_ROW_FIELDS,
    buildBidKingMissingItemAuthorityIntakeTemplate,
    formatBidKingMissingItemAuthorityIntakeMarkdown,
    main,
    resolveArgs
};
