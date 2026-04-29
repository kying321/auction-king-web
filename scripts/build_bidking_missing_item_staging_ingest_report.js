const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_AUTHORITY_INTAKE_AUDIT_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-authority-intake-audit-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-staging-ingest-report.json"
);
const EXPECTED_AUTHORITY_INTAKE_AUDIT_SCHEMA_VERSION = "ak_bidking_missing_item_authority_intake_audit_v1";

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
        authorityIntakeAuditReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_AUTHORITY_INTAKE_AUDIT_REPORT_PATH,
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

function uniqueSortedStrings(values) {
    return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean))).sort();
}

function normalizeStagingRows(rows = []) {
    return rows.map((entry) => ({
        item_id: Number(entry.item_id),
        authority_source_type: entry.authority_source_type || null,
        source_path_or_capture_id: entry.source_path_or_capture_id || null,
        client_build_or_version: entry.client_build_or_version || null,
        raw_item_txt_row: entry.raw_item_txt_row || null,
        reviewed_row: entry.reviewed_row || null,
        staging_only: true
    }));
}

function buildBlockers({
    auditSummary = {},
    auditGates = {},
    stagingRows = [],
    authorityIntakeAuditSchemaValid = false
} = {}) {
    const blockers = [];
    (auditSummary.blockers || []).forEach((blocker) => addReason(blockers, blocker));
    if (!authorityIntakeAuditSchemaValid) addReason(blockers, "invalid_authority_intake_audit_schema");
    if (auditGates.staging_item_ingest_allowed !== true) {
        addReason(blockers, "staging_item_ingest_not_allowed");
    }
    if (!stagingRows.length) addReason(blockers, "no_valid_staging_item_rows");
    if (stagingRows.length) addReason(blockers, "table_reference_integrity_not_rerun_after_staging");
    return blockers;
}

function buildBidKingMissingItemStagingIngestReport({
    authorityIntakeAuditReport = readJson(DEFAULT_AUTHORITY_INTAKE_AUDIT_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const authorityIntakeAuditSchemaValid = authorityIntakeAuditReport.schema_version === EXPECTED_AUTHORITY_INTAKE_AUDIT_SCHEMA_VERSION;
    const auditSummary = authorityIntakeAuditReport.summary || {};
    const auditGates = authorityIntakeAuditReport.gates || {};
    const auditRows = normalizeStagingRows(authorityIntakeAuditReport.staging_item_rows || []);
    const ingestAllowed = authorityIntakeAuditSchemaValid
        && auditGates.staging_item_ingest_allowed === true
        && auditRows.length > 0;
    const stagedRows = ingestAllowed ? auditRows : [];
    const impactedProjectMaps = uniqueSortedStrings(auditSummary.impacted_project_maps || []);
    const blockers = buildBlockers({
        auditSummary,
        auditGates,
        stagingRows: stagedRows,
        authorityIntakeAuditSchemaValid
    });

    return {
        schema_version: "ak_bidking_missing_item_staging_ingest_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            authority_intake_audit_report: paths.authorityIntakeAuditReportPath || DEFAULT_AUTHORITY_INTAKE_AUDIT_REPORT_PATH
        },
        summary: {
            authority_intake_audit_schema_version: authorityIntakeAuditReport.schema_version || null,
            audited_valid_item_count: Number(auditSummary.valid_authority_item_count || 0),
            audited_blocked_item_count: Number(auditSummary.blocked_authority_item_count || 0),
            staged_item_row_count: stagedRows.length,
            staging_materialized: stagedRows.length > 0,
            impacted_project_maps: impactedProjectMaps,
            source_tables_mutated: false,
            table_reference_integrity_clean_after_recovery: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            recommended_next_action: stagedRows.length
                ? "rerun_table_reference_integrity_against_staging_overlay_before_any_replay"
                : "complete_authority_intake_audit_before_staging_ingest",
            blockers
        },
        gates: {
            staging_item_ingest_allowed: ingestAllowed,
            staging_materialized: stagedRows.length > 0,
            source_tables_mutated: false,
            recovered_rows_ingested_to_source_tables: false,
            table_reference_integrity_clean_after_recovery: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false
        },
        staging_artifact: {
            schema_version: "ak_bidking_staged_item_rows_v1",
            generated_at: generatedAt,
            source_authority_intake_audit_report: paths.authorityIntakeAuditReportPath || DEFAULT_AUTHORITY_INTAKE_AUDIT_REPORT_PATH,
            source_tables_mutated: false,
            rows: stagedRows
        },
        notes: [
            "This report materializes audited rows only as staging evidence.",
            "The authority-intake audit schema must match the expected source-owned builder before staging rows can materialize.",
            "It does not write to BidKing source tables or default estimator config.",
            "Table-reference integrity must pass against a staging overlay before table-backed replay can advance."
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

function formatBidKingMissingItemStagingIngestMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const rows = ((report.staging_artifact && report.staging_artifact.rows) || []).map((entry) => (
        `| ${markdownCode(entry.item_id)} | ${markdownCode(entry.authority_source_type)} | ${markdownCode(entry.client_build_or_version)} | ${markdownCell(entry.source_path_or_capture_id)} | ${markdownCode(entry.staging_only === true)} |`
    )).join("\n");

    return `# BidKing missing item staging ingest

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Staged item rows: \`${summary.staged_item_row_count ?? 0}\`
- Staging materialized: \`${summary.staging_materialized === true}\`
- Source tables mutated: \`${summary.source_tables_mutated === true}\`
- Table-backed shadow replay allowed: \`${summary.table_backed_shadow_replay_allowed === true}\`
- Authority handoff allowed: \`${summary.authority_handoff_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Staging Rows

| item id | source type | build/version | source path or capture id | staging only |
| --- | --- | --- | --- | --- |
${rows || "| `-` | `-` | `-` | - | `true` |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Staging ingest does not mutate source tables, authority handoff, replay gates, or default configuration. It only carries audited row evidence forward for a future staging-overlay integrity check.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingMissingItemStagingIngestReport({
        authorityIntakeAuditReport: readJson(args.authorityIntakeAuditReportPath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            authorityIntakeAuditReportPath: args.authorityIntakeAuditReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingMissingItemStagingIngestMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_AUTHORITY_INTAKE_AUDIT_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    EXPECTED_AUTHORITY_INTAKE_AUDIT_SCHEMA_VERSION,
    buildBidKingMissingItemStagingIngestReport,
    formatBidKingMissingItemStagingIngestMarkdown,
    main,
    resolveArgs
};
