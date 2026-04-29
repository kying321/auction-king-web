const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-reference-integrity-report.json"
);
const DEFAULT_STAGING_INGEST_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-staging-ingest-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-staging-overlay-reference-integrity-report.json"
);
const EXPECTED_TABLE_REFERENCE_INTEGRITY_SCHEMA_VERSION = "ak_bidking_table_reference_integrity_v1";
const EXPECTED_STAGING_INGEST_SCHEMA_VERSION = "ak_bidking_missing_item_staging_ingest_v1";
const ACCEPTED_STAGING_AUTHORITY_SOURCE_TYPES = new Set([
    "raw_item_txt_row",
    "complete_streamingassets_tables_export",
    "official_or_server_side_table_export"
]);

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
        tableReferenceIntegrityReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH,
        stagingIngestReportPath: positional[1]
            ? path.resolve(positional[1])
            : DEFAULT_STAGING_INGEST_REPORT_PATH,
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

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function isMissing(value) {
    return value === null || value === undefined || String(value).trim() === "";
}

function parseRawItemRowId(rawRow) {
    const text = String(rawRow || "").trim();
    if (!text) return null;
    const firstColumn = text.split(/\t/)[0];
    const numeric = Number(firstColumn);
    return Number.isFinite(numeric) ? numeric : null;
}

function collectStagedRows(stagingIngestReport = {}) {
    const rows = stagingIngestReport.staging_artifact && Array.isArray(stagingIngestReport.staging_artifact.rows)
        ? stagingIngestReport.staging_artifact.rows
        : [];
    return rows.filter((entry) => entry && Number.isFinite(Number(entry.item_id)));
}

function auditStagedRow(row = {}) {
    const itemId = Number(row.item_id);
    const authoritySourceType = String(row.authority_source_type || "").trim();
    const rawRowId = parseRawItemRowId(row.raw_item_txt_row);
    const blockers = [];
    if (!Number.isFinite(itemId)) addReason(blockers, "staged_row_missing_item_id");
    if (!ACCEPTED_STAGING_AUTHORITY_SOURCE_TYPES.has(authoritySourceType)) {
        addReason(blockers, "unsupported_staged_authority_source_type");
    }
    if (isMissing(row.raw_item_txt_row)) addReason(blockers, "missing_staged_raw_item_txt_row");
    if (isMissing(row.source_path_or_capture_id)) addReason(blockers, "missing_staged_source_path_or_capture_id");
    if (isMissing(row.client_build_or_version)) addReason(blockers, "missing_staged_client_build_or_version");
    if (!isMissing(row.raw_item_txt_row) && rawRowId !== itemId) addReason(blockers, "staged_raw_item_row_id_mismatch");
    if (row.staging_only !== true) addReason(blockers, "staged_row_not_marked_staging_only");
    return {
        item_id: Number.isFinite(itemId) ? itemId : null,
        authority_source_type: authoritySourceType || null,
        source_path_or_capture_id: row.source_path_or_capture_id || null,
        client_build_or_version: row.client_build_or_version || null,
        raw_item_row_id: rawRowId,
        valid_direct_staging_source: blockers.length === 0,
        blockers
    };
}

function countAuditBlockers(audits = []) {
    return audits.reduce((counts, audit) => {
        (audit.blockers || []).forEach((blocker) => {
            counts[blocker] = (counts[blocker] || 0) + 1;
        });
        return counts;
    }, {});
}

function buildMapOverlayIntegrity(projectMapIntegrity = {}, stagedItemIds = new Set()) {
    return Object.fromEntries(Object.entries(projectMapIntegrity || {}).map(([mapId, integrity]) => {
        const originalRefs = Array.isArray(integrity.missing_terminal_item_references)
            ? integrity.missing_terminal_item_references
            : [];
        const remainingRefs = originalRefs.filter((entry) => !stagedItemIds.has(Number(entry.item_id)));
        const coveredRefs = originalRefs.filter((entry) => stagedItemIds.has(Number(entry.item_id)));
        return [mapId, {
            current_map_id: integrity.current_map_id || mapId,
            original_missing_terminal_item_reference_count: originalRefs.length,
            original_missing_terminal_item_ids: uniqueSortedNumbers(integrity.missing_terminal_item_ids || originalRefs.map((entry) => entry.item_id)),
            covered_missing_terminal_item_reference_count: coveredRefs.length,
            covered_missing_terminal_item_ids: uniqueSortedNumbers(coveredRefs.map((entry) => entry.item_id)),
            missing_terminal_item_reference_count_after_overlay: remainingRefs.length,
            missing_terminal_item_ids_after_overlay: uniqueSortedNumbers(remainingRefs.map((entry) => entry.item_id)),
            missing_terminal_item_references_after_overlay: remainingRefs
        }];
    }));
}

function buildBlockers({
    stagedRows = [],
    stagedRowBlockerCounts = {},
    unresolvedProjectMissingIds = [],
    cleanForProjectScope = false,
    tableReferenceIntegritySchemaValid = false,
    stagingIngestSchemaValid = false
} = {}) {
    const blockers = [];
    if (!tableReferenceIntegritySchemaValid) addReason(blockers, "invalid_table_reference_integrity_schema");
    if (!stagingIngestSchemaValid) addReason(blockers, "invalid_staging_ingest_schema");
    if (!stagedRows.length) addReason(blockers, "no_staged_item_rows");
    Object.keys(stagedRowBlockerCounts).forEach((reason) => addReason(blockers, reason));
    if (Object.keys(stagedRowBlockerCounts).length) addReason(blockers, "invalid_staged_item_rows");
    if (unresolvedProjectMissingIds.length) addReason(blockers, "project_relevant_missing_terminal_item_references_after_overlay");
    if (!cleanForProjectScope) addReason(blockers, "staging_overlay_reference_integrity_not_clean");
    if (cleanForProjectScope) addReason(blockers, "overlay_shadow_simulator_not_rerun");
    return blockers;
}

function buildBidKingStagingOverlayReferenceIntegrityReport({
    tableReferenceIntegrityReport = readJson(DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH),
    stagingIngestReport = readJson(DEFAULT_STAGING_INGEST_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const tableReferenceIntegritySchemaValid = tableReferenceIntegrityReport.schema_version === EXPECTED_TABLE_REFERENCE_INTEGRITY_SCHEMA_VERSION;
    const stagingIngestSchemaValid = stagingIngestReport.schema_version === EXPECTED_STAGING_INGEST_SCHEMA_VERSION;
    const stagedRows = collectStagedRows(stagingIngestReport);
    const stagedRowAudits = stagedRows.map(auditStagedRow);
    const stagedRowBlockerCounts = countAuditBlockers(stagedRowAudits);
    const validStagedItemIds = new Set(stagedRowAudits
        .filter((entry) => entry.valid_direct_staging_source)
        .map((entry) => Number(entry.item_id)));
    const allStagedItemIds = new Set(stagedRows.map((entry) => Number(entry.item_id)));
    const originalProjectMissingIds = uniqueSortedNumbers(
        tableReferenceIntegrityReport.summary
            ? tableReferenceIntegrityReport.summary.project_relevant_missing_terminal_item_ids
            : []
    );
    const coveredProjectMissingIds = originalProjectMissingIds.filter((itemId) => validStagedItemIds.has(itemId));
    const unresolvedProjectMissingIds = originalProjectMissingIds.filter((itemId) => !validStagedItemIds.has(itemId));
    const projectMapOverlayIntegrity = buildMapOverlayIntegrity(
        tableReferenceIntegrityReport.project_map_integrity || {},
        validStagedItemIds
    );
    const mapsStillBlocked = uniqueSortedStrings(Object.values(projectMapOverlayIntegrity)
        .filter((entry) => entry.missing_terminal_item_reference_count_after_overlay > 0)
        .map((entry) => entry.current_map_id));
    const cleanForProjectScope = tableReferenceIntegritySchemaValid
        && stagingIngestSchemaValid
        && originalProjectMissingIds.length > 0
        && stagedRows.length > 0
        && Object.keys(stagedRowBlockerCounts).length === 0
        && unresolvedProjectMissingIds.length === 0
        && mapsStillBlocked.length === 0;
    const blockers = buildBlockers({
        stagedRows,
        stagedRowBlockerCounts,
        unresolvedProjectMissingIds,
        cleanForProjectScope,
        tableReferenceIntegritySchemaValid,
        stagingIngestSchemaValid
    });

    return {
        schema_version: "ak_bidking_staging_overlay_reference_integrity_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            table_reference_integrity_report: paths.tableReferenceIntegrityReportPath || DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH,
            staging_ingest_report: paths.stagingIngestReportPath || DEFAULT_STAGING_INGEST_REPORT_PATH
        },
        summary: {
            table_reference_integrity_schema_version: tableReferenceIntegrityReport.schema_version || null,
            staging_ingest_schema_version: stagingIngestReport.schema_version || null,
            original_project_missing_item_ids: originalProjectMissingIds,
            staged_item_ids: uniqueSortedNumbers(Array.from(allStagedItemIds)),
            valid_staged_item_ids: uniqueSortedNumbers(Array.from(validStagedItemIds)),
            invalid_staged_item_ids: uniqueSortedNumbers(stagedRowAudits
                .filter((entry) => !entry.valid_direct_staging_source)
                .map((entry) => entry.item_id)),
            covered_project_missing_item_ids: coveredProjectMissingIds,
            unresolved_project_missing_item_ids_after_overlay: unresolvedProjectMissingIds,
            maps_still_blocked_after_overlay: mapsStillBlocked,
            staging_overlay_reference_integrity_clean_for_project_scope: cleanForProjectScope,
            staging_overlay_shadow_replay_candidate_allowed: cleanForProjectScope,
            source_tables_mutated: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            recommended_next_action: cleanForProjectScope
                ? "run_overlay_shadow_simulator_before_any_authority_or_default_change"
                : "complete_staging_item_rows_before_overlay_shadow_simulator",
            blockers
        },
        gates: {
            staging_overlay_reference_integrity_clean_for_project_scope: cleanForProjectScope,
            staging_overlay_shadow_replay_candidate_allowed: cleanForProjectScope,
            source_tables_mutated: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false
        },
        project_map_overlay_integrity: projectMapOverlayIntegrity,
        staged_row_audit: {
            row_count: stagedRowAudits.length,
            valid_row_count: stagedRowAudits.filter((entry) => entry.valid_direct_staging_source).length,
            blocker_reason_counts: stagedRowBlockerCounts,
            entries: stagedRowAudits
        },
        staged_rows_reviewed: stagedRows.map((entry, index) => ({
            item_id: Number(entry.item_id),
            authority_source_type: entry.authority_source_type || null,
            source_path_or_capture_id: entry.source_path_or_capture_id || null,
            client_build_or_version: entry.client_build_or_version || null,
            staging_only: entry.staging_only === true,
            valid_direct_staging_source: stagedRowAudits[index] ? stagedRowAudits[index].valid_direct_staging_source : false,
            blockers: stagedRowAudits[index] ? stagedRowAudits[index].blockers : ["staged_row_audit_missing"]
        })),
        notes: [
            "This overlay check consumes staged rows only and does not mutate source BidKing tables.",
            "Input artifact schema versions must match the expected source-owned builders before coverage can clear missing references.",
            "A clean overlay may authorize only an overlay shadow-simulator candidate, not default config or authority handoff.",
            "Default config and authority handoff stay closed."
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

function formatBidKingStagingOverlayReferenceIntegrityMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const mapRows = Object.values(report.project_map_overlay_integrity || {}).map((entry) => (
        `| ${markdownCode(entry.current_map_id)} | ${markdownCode(entry.original_missing_terminal_item_reference_count)} | ${markdownCell(JSON.stringify(entry.covered_missing_terminal_item_ids || []))} | ${markdownCode(entry.missing_terminal_item_reference_count_after_overlay)} | ${markdownCell(JSON.stringify(entry.missing_terminal_item_ids_after_overlay || []))} |`
    )).join("\n");

    return `# BidKing staging overlay reference integrity

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Original project missing item ids: ${markdownCell(JSON.stringify(summary.original_project_missing_item_ids || []))}
- Staged item ids: ${markdownCell(JSON.stringify(summary.staged_item_ids || []))}
- Unresolved after overlay: ${markdownCell(JSON.stringify(summary.unresolved_project_missing_item_ids_after_overlay || []))}
- Overlay clean for project scope: \`${summary.staging_overlay_reference_integrity_clean_for_project_scope === true}\`
- Overlay shadow replay candidate allowed: \`${summary.staging_overlay_shadow_replay_candidate_allowed === true}\`
- Source tables mutated: \`${summary.source_tables_mutated === true}\`
- Table-backed shadow replay allowed: \`${summary.table_backed_shadow_replay_allowed === true}\`
- Authority handoff allowed: \`${summary.authority_handoff_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Map Overlay Integrity

| map | original missing refs | covered item ids | missing refs after overlay | missing item ids after overlay |
| --- | --- | --- | --- | --- |
${mapRows || "| `-` | `0` | [] | `0` | [] |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Staging overlay integrity does not mutate source tables or open default config, authority handoff, or table-backed replay promotion. A clean overlay only permits a future overlay-shadow simulator candidate.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingStagingOverlayReferenceIntegrityReport({
        tableReferenceIntegrityReport: readJson(args.tableReferenceIntegrityReportPath),
        stagingIngestReport: readJson(args.stagingIngestReportPath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            tableReferenceIntegrityReportPath: args.tableReferenceIntegrityReportPath,
            stagingIngestReportPath: args.stagingIngestReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingStagingOverlayReferenceIntegrityMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_STAGING_INGEST_REPORT_PATH,
    DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH,
    EXPECTED_STAGING_INGEST_SCHEMA_VERSION,
    EXPECTED_TABLE_REFERENCE_INTEGRITY_SCHEMA_VERSION,
    buildBidKingStagingOverlayReferenceIntegrityReport,
    formatBidKingStagingOverlayReferenceIntegrityMarkdown,
    main,
    resolveArgs
};
