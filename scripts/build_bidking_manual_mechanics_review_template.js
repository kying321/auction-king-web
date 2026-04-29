const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TABLE_MECHANICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-mechanics-report.json"
);
const DEFAULT_SCHEMA_METADATA_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-schema-metadata-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-manual-mechanics-review-template.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        tableMechanicsReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_TABLE_MECHANICS_REPORT_PATH,
        schemaMetadataReportPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_SCHEMA_METADATA_REPORT_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function toReviewDecision(base) {
    return {
        ...base,
        review_decision: "pending",
        reviewer_notes: null,
        approved_for_shadow_candidate: false,
        approved_for_authority_handoff: false
    };
}

function buildMapAlignmentReviews(tableMechanicsReport) {
    return (tableMechanicsReport.candidate_map_alignment || []).map((entry) => toReviewDecision({
        current_map_id: entry.current_map_id,
        bidking_map_id_candidate: entry.bidking_map_id_candidate,
        bidking_bidmap_root_candidate: entry.bidking_bidmap_root_candidate,
        evidence_labels: entry.evidence_labels || [],
        confidence: entry.confidence || "unknown",
        blocker: entry.blocker || "manual confirmation required",
        required_evidence: [
            "confirm in-game or capture label maps to current app map_id",
            "confirm bidmap root appears in the same battle family",
            "confirm no alternate BidKing map id better matches current app naming"
        ]
    }));
}

function buildTableSchemaReviews(schemaMetadataReport) {
    return (schemaMetadataReport.table_type_schemas || []).map((entry) => toReviewDecision({
        type_name: entry.type_name,
        table_file: entry.table_file,
        table_row_count: entry.table_row_count,
        table_column_distribution: entry.table_column_distribution,
        schema_member_count: entry.schema_member_count,
        schema_member_source: entry.schema_member_source,
        likely_leading_non_schema_column_count: entry.likely_leading_non_schema_column_count,
        schema_or_localized_count_match: !!(
            entry.schema_member_count_matches_table_columns
            || entry.schema_member_count_plus_two_matches_table_columns
        ),
        first_schema_members: (entry.schema_members || []).slice(0, 20),
        required_evidence: [
            "confirm table loader skips leading localized/display columns when present",
            "confirm public instance field order is the parse order",
            "confirm cache/static fields are not serialized table columns"
        ]
    }));
}

function buildMechanicsScopeReviews(tableMechanicsReport) {
    const mechanics = tableMechanicsReport.mechanics || {};
    const maps = Array.isArray(mechanics.maps) ? mechanics.maps : [];
    return maps.map((entry) => toReviewDecision({
        bidking_map_id: entry.map_id,
        bidmap_root_id: entry.bidmap_root_id,
        item_count_range: entry.item_count_range,
        bidmap_count: entry.bidmap_count,
        rank_ai_rank_count: entry.rank_ai_rank_count,
        rank_map_count_distribution_samples: entry.rank_map_count_distribution_samples || [],
        required_evidence: [
            "confirm count distribution should replace or only shadow current count prior",
            "confirm value distribution should be map-family specific",
            "confirm rank AI rows represent opponent behavior and not only UI rank labels"
        ]
    }));
}

function buildBidKingManualMechanicsReviewTemplate({
    tableMechanicsReportPath = DEFAULT_TABLE_MECHANICS_REPORT_PATH,
    schemaMetadataReportPath = DEFAULT_SCHEMA_METADATA_REPORT_PATH
} = {}) {
    const tableMechanicsReport = readJson(tableMechanicsReportPath);
    const schemaMetadataReport = readJson(schemaMetadataReportPath);
    const mapAlignmentReviews = buildMapAlignmentReviews(tableMechanicsReport);
    const tableSchemaReviews = buildTableSchemaReviews(schemaMetadataReport);
    const mechanicsScopeReviews = buildMechanicsScopeReviews(tableMechanicsReport);

    return {
        schema_version: "ak_bidking_manual_mechanics_review_template_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            table_mechanics_report_path: tableMechanicsReportPath,
            schema_metadata_report_path: schemaMetadataReportPath
        },
        summary: {
            review_status: "pending_manual_validation",
            authority_adoption_allowed: false,
            default_config_update_allowed: false,
            shadow_candidate_allowed: false,
            live_path_touched: false,
            map_alignment_review_count: mapAlignmentReviews.length,
            table_schema_review_count: tableSchemaReviews.length,
            mechanics_scope_review_count: mechanicsScopeReviews.length,
            schema_handoff_candidate: schemaMetadataReport.summary
                ? schemaMetadataReport.summary.schema_handoff_candidate === true
                : false,
            table_mechanics_status: tableMechanicsReport.summary
                ? tableMechanicsReport.summary.mechanics_recovery_status
                : "unknown"
        },
        gates: {
            all_map_alignments_approved: false,
            all_table_schemas_approved: false,
            all_mechanics_scopes_approved: false,
            same_battle_replay_samples_attached: false,
            authority_handoff_allowed: false
        },
        review_items: {
            map_alignment_reviews: mapAlignmentReviews,
            table_schema_reviews: tableSchemaReviews,
            mechanics_scope_reviews: mechanicsScopeReviews
        },
        next_source_lane: [
            "manual_mechanics_review_results",
            "schema_backed_shadow_candidate_config",
            "shadow_replay_candidate",
            "authority_handoff_gate"
        ],
        hard_blocks_before_core_refactor: [
            "manual review decisions must approve map alignment and schema parse order",
            "candidate config must be generated as shadow-only first",
            "same-battle replay must pass before any default weight update",
            "authority handoff must remain blocked while any review item is pending"
        ]
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatBidKingManualMechanicsReviewMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const mapRows = (report.review_items && report.review_items.map_alignment_reviews || []).map((entry) => (
        `| ${markdownCell(entry.current_map_id)} | ${markdownCell(entry.bidking_map_id_candidate)} | ${markdownCell(entry.bidking_bidmap_root_candidate)} | ${markdownCell((entry.evidence_labels || []).join(", "))} | ${markdownCell(entry.review_decision)} |`
    )).join("\n");
    const schemaRows = (report.review_items && report.review_items.table_schema_reviews || []).map((entry) => (
        `| ${markdownCell(entry.type_name)} | ${markdownCell(entry.table_file)} | ${markdownCell(entry.schema_member_count)} | ${markdownCell(entry.likely_leading_non_schema_column_count)} | ${markdownCell(entry.schema_or_localized_count_match)} | ${markdownCell(entry.review_decision)} |`
    )).join("\n");

    return `# BidKing manual mechanics review template

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Review status: \`${summary.review_status || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- Live/order/funds path touched: \`${summary.live_path_touched === true}\`

## Review Coverage

| signal | value |
| --- | --- |
| map alignment reviews | \`${summary.map_alignment_review_count ?? 0}\` |
| table schema reviews | \`${summary.table_schema_review_count ?? 0}\` |
| mechanics scope reviews | \`${summary.mechanics_scope_review_count ?? 0}\` |
| schema handoff candidate | \`${summary.schema_handoff_candidate === true}\` |
| table mechanics status | \`${summary.table_mechanics_status || "-"}\` |

## Map Alignment Review

| current map | BidKing map | BidKing bidmap root | evidence labels | decision |
| --- | --- | --- | --- | --- |
${mapRows || "| - | - | - | - | - |"}

## Table Schema Review

| type | table | schema members | leading non-schema columns | count match | decision |
| --- | --- | --- | --- | --- | --- |
${schemaRows || "| - | - | - | - | - | - |"}

## Gates

- all_map_alignments_approved: \`${report.gates ? report.gates.all_map_alignments_approved === true : false}\`
- all_table_schemas_approved: \`${report.gates ? report.gates.all_table_schemas_approved === true : false}\`
- all_mechanics_scopes_approved: \`${report.gates ? report.gates.all_mechanics_scopes_approved === true : false}\`
- same_battle_replay_samples_attached: \`${report.gates ? report.gates.same_battle_replay_samples_attached === true : false}\`
- authority_handoff_allowed: \`${report.gates ? report.gates.authority_handoff_allowed === true : false}\`

## Conclusion

This template is the manual review boundary before any shadow candidate or core refactor. It intentionally keeps all downstream gates closed while review decisions are pending.
`;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeMarkdown(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { tableMechanicsReportPath, schemaMetadataReportPath, outputPath } = resolveArgs(argv);
    const report = buildBidKingManualMechanicsReviewTemplate({
        tableMechanicsReportPath,
        schemaMetadataReportPath
    });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingManualMechanicsReviewMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SCHEMA_METADATA_REPORT_PATH,
    DEFAULT_TABLE_MECHANICS_REPORT_PATH,
    buildBidKingManualMechanicsReviewTemplate,
    formatBidKingManualMechanicsReviewMarkdown,
    main,
    resolveArgs
};
