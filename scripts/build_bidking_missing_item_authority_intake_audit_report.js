const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_AUTHORITY_INTAKE_TEMPLATE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-authority-intake-template.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-missing-item-authority-intake-audit-report.json"
);
const ACCEPTED_AUTHORITY_SOURCE_TYPES = new Set([
    "raw_item_txt_row",
    "complete_streamingassets_tables_export",
    "official_or_server_side_table_export"
]);
const REQUIRED_REVIEW_FIELDS = [
    "raw_item_txt_row",
    "authority_source_type",
    "source_path_or_capture_id",
    "client_build_or_version"
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
        authorityIntakeTemplatePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_AUTHORITY_INTAKE_TEMPLATE_PATH,
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

function uniqueSortedStrings(values) {
    return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean))).sort();
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

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function resolveSubmittedRow(item = {}) {
    if (item.submitted_item_row && typeof item.submitted_item_row === "object") return item.submitted_item_row;
    if (item.authority_item_row && typeof item.authority_item_row === "object") return item.authority_item_row;
    if (item.intake_row_template && typeof item.intake_row_template === "object") return item.intake_row_template;
    return {};
}

function auditIntakeItem(item = {}) {
    const itemId = Number(item.item_id);
    const row = resolveSubmittedRow(item);
    const blockers = [];
    const warnings = [];
    const rawRowId = parseRawItemRowId(row.raw_item_txt_row);
    const authoritySourceType = String(row.authority_source_type || "");

    REQUIRED_REVIEW_FIELDS.forEach((field) => {
        if (isMissing(row[field])) addReason(blockers, `missing_${field}`);
    });

    if (!isMissing(row.raw_item_txt_row) && rawRowId !== itemId) {
        addReason(blockers, "raw_item_row_id_mismatch");
    }
    if (!isMissing(row.authority_source_type) && !ACCEPTED_AUTHORITY_SOURCE_TYPES.has(authoritySourceType)) {
        addReason(blockers, "unsupported_authority_source_type");
    }
    if (Array.isArray(item.neighboring_same_family_item_ids) && item.neighboring_same_family_item_ids.length) {
        addReason(warnings, "neighboring_family_rows_remain_context_only");
    }

    const valid = blockers.length === 0;
    return {
        item_id: itemId,
        priority: item.priority || null,
        valid_direct_authority_source: valid,
        staging_item_row_ingest_allowed: valid,
        raw_item_row_id: rawRowId,
        authority_source_type: authoritySourceType || null,
        source_path_or_capture_id: row.source_path_or_capture_id || null,
        client_build_or_version: row.client_build_or_version || null,
        impacted_project_maps: Array.isArray(item.impacted_project_maps) ? item.impacted_project_maps.slice() : [],
        blockers,
        warnings,
        blocked_actions: [
            "table_reference_integrity_clean_without_rerun",
            "table_backed_shadow_replay_promotion",
            "authority_handoff",
            "default_config_update"
        ],
        reviewed_row: {
            id: itemId,
            localized_name: row.localized_name || null,
            item_type_id: Array.isArray(row.item_type_id) ? row.item_type_id.slice() : row.item_type_id || null,
            slot_type: row.slot_type ?? null,
            item_quality: row.item_quality ?? null,
            base_value: row.base_value ?? null,
            max_per_listing: row.max_per_listing ?? null,
            collection: row.collection ?? null,
            collection_coin: row.collection_coin ?? null,
            icon_path: row.icon_path || null,
            model_3D: row.model_3D || null,
            raw_item_txt_row: row.raw_item_txt_row || null
        }
    };
}

function buildStagingRows(itemAudits = []) {
    return itemAudits
        .filter((entry) => entry.valid_direct_authority_source)
        .map((entry) => ({
            item_id: entry.item_id,
            authority_source_type: entry.authority_source_type,
            source_path_or_capture_id: entry.source_path_or_capture_id,
            client_build_or_version: entry.client_build_or_version,
            raw_item_txt_row: entry.reviewed_row.raw_item_txt_row,
            reviewed_row: entry.reviewed_row,
            staging_only: true
        }));
}

function summarizeItemAudits(itemAudits = [], stagingItemRows = []) {
    const validCount = itemAudits.filter((entry) => entry.valid_direct_authority_source).length;
    const blockedCount = itemAudits.length - validCount;
    const blockers = [];
    itemAudits.forEach((entry) => {
        entry.blockers.forEach((reason) => addReason(blockers, reason));
    });
    if (validCount > 0) addReason(blockers, "table_reference_integrity_not_rerun_after_staging");
    if (blockedCount > 0) addReason(blockers, "authority_intake_incomplete");

    return {
        intake_item_count: itemAudits.length,
        valid_authority_item_count: validCount,
        blocked_authority_item_count: blockedCount,
        staging_item_row_count: stagingItemRows.length,
        impacted_project_maps: uniqueSortedStrings(itemAudits.flatMap((entry) => entry.impacted_project_maps || [])),
        direct_authority_source_available_for_all_items: itemAudits.length > 0 && blockedCount === 0,
        staging_item_ingest_allowed: itemAudits.length > 0 && blockedCount === 0,
        table_reference_integrity_clean_after_recovery: false,
        table_backed_shadow_replay_allowed: false,
        authority_handoff_allowed: false,
        default_config_update_allowed: false,
        recommended_next_action: blockedCount > 0
            ? "complete_missing_authority_intake_fields_before_staging_ingest"
            : "ingest_valid_rows_into_staging_then_rerun_table_reference_integrity",
        blockers
    };
}

function buildBidKingMissingItemAuthorityIntakeAuditReport({
    authorityIntakeTemplate = readJson(DEFAULT_AUTHORITY_INTAKE_TEMPLATE_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const itemAudits = (authorityIntakeTemplate.items || []).map(auditIntakeItem);
    const stagingItemRows = buildStagingRows(itemAudits);
    const summary = summarizeItemAudits(itemAudits, stagingItemRows);

    return {
        schema_version: "ak_bidking_missing_item_authority_intake_audit_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            authority_intake_template: paths.authorityIntakeTemplatePath || DEFAULT_AUTHORITY_INTAKE_TEMPLATE_PATH
        },
        summary,
        gates: {
            direct_authority_source_available_for_all_items: summary.direct_authority_source_available_for_all_items,
            staging_item_ingest_allowed: summary.staging_item_ingest_allowed,
            recovered_rows_ingested: false,
            table_reference_integrity_clean_after_recovery: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false
        },
        item_audits: itemAudits,
        staging_item_rows: stagingItemRows,
        notes: [
            "Valid intake rows are staging-only evidence and do not mutate BidKing tables.",
            "Table-reference integrity must be rerun after staging before table-backed replay can advance.",
            "Authority handoff and default config updates remain closed."
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

function formatBidKingMissingItemAuthorityIntakeAuditMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const rows = (report.item_audits || []).map((entry) => (
        `| ${markdownCode(entry.item_id)} | ${markdownCode(entry.valid_direct_authority_source)} | ${markdownCode(entry.staging_item_row_ingest_allowed)} | ${markdownCell(JSON.stringify(entry.blockers || []))} | ${markdownCode(entry.authority_source_type)} | ${markdownCode(entry.client_build_or_version)} |`
    )).join("\n");

    return `# BidKing missing item authority intake audit

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Valid authority items: \`${summary.valid_authority_item_count ?? 0}\`
- Blocked authority items: \`${summary.blocked_authority_item_count ?? 0}\`
- Staging ingest allowed: \`${summary.staging_item_ingest_allowed === true}\`
- Table-backed shadow replay allowed: \`${summary.table_backed_shadow_replay_allowed === true}\`
- Authority handoff allowed: \`${summary.authority_handoff_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Item Audits

| item id | valid direct authority | staging ingest allowed | blockers | source type | build/version |
| --- | --- | --- | --- | --- | --- |
${rows || "| `-` | `false` | `false` | [] | `-` | `-` |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Authority intake audit can only create staging-only rows. It cannot authorize table mutation, replay promotion, authority handoff, or default config updates until table-reference integrity is rerun and clean.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildBidKingMissingItemAuthorityIntakeAuditReport({
        authorityIntakeTemplate: readJson(args.authorityIntakeTemplatePath),
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            authorityIntakeTemplatePath: args.authorityIntakeTemplatePath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingMissingItemAuthorityIntakeAuditMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_AUTHORITY_INTAKE_TEMPLATE_PATH,
    DEFAULT_OUTPUT_PATH,
    buildBidKingMissingItemAuthorityIntakeAuditReport,
    formatBidKingMissingItemAuthorityIntakeAuditMarkdown,
    main,
    resolveArgs
};
