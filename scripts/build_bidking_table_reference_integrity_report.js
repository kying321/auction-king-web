const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PROJECT_RELEVANT_PARSE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-project-relevant-parse-report.json"
);
const DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-schema-backed-table-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-reference-integrity-report.json"
);

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
        projectRelevantParseReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_PROJECT_RELEVANT_PARSE_REPORT_PATH,
        schemaBackedTableReportPath: positional[1]
            ? path.resolve(positional[1])
            : DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
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

function records(namedTables, tableName) {
    return namedTables && namedTables[tableName] && Array.isArray(namedTables[tableName].records)
        ? namedTables[tableName].records
        : [];
}

function uniqueSortedNumbers(values) {
    return Array.from(new Set((values || []).map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function collectMissingTerminalItemReferences(dropRecords = [], itemIds = new Set()) {
    const missingRefs = [];
    (Array.isArray(dropRecords) ? dropRecords : []).forEach((drop) => {
        (Array.isArray(drop.items_list) ? drop.items_list : []).forEach((tuple, tupleIndex) => {
            if (!Array.isArray(tuple) || tuple.length < 2) return;
            if (Number(tuple[0]) === 9999) return;
            const itemId = Number(tuple[1]);
            if (!Number.isFinite(itemId) || itemIds.has(itemId)) return;
            missingRefs.push({
                item_id: itemId,
                drop_group_id: Number(drop.group_id),
                drop_localized_name: drop.__meta ? drop.__meta.localized_name : null,
                tuple_index: tupleIndex,
                tuple
            });
        });
    });
    return missingRefs.sort((left, right) => (
        left.item_id - right.item_id
        || left.drop_group_id - right.drop_group_id
        || left.tuple_index - right.tuple_index
    ));
}

function walkReachableDropGroups(rootGroupId, dropRecordsByGroup = new Map()) {
    const reachable = new Set();
    const missingGroups = new Set();
    const stack = [Number(rootGroupId)];

    while (stack.length) {
        const groupId = stack.pop();
        if (!Number.isFinite(groupId) || reachable.has(groupId)) continue;
        reachable.add(groupId);
        const drop = dropRecordsByGroup.get(groupId);
        if (!drop) {
            missingGroups.add(groupId);
            continue;
        }
        (Array.isArray(drop.items_list) ? drop.items_list : []).forEach((tuple) => {
            if (!Array.isArray(tuple) || tuple.length < 2) return;
            if (Number(tuple[0]) === 9999) stack.push(Number(tuple[1]));
        });
    }

    return {
        root_group_id: Number(rootGroupId),
        reachable_group_ids: uniqueSortedNumbers(Array.from(reachable)),
        missing_group_ids: uniqueSortedNumbers(Array.from(missingGroups))
    };
}

function indexParentDropReferences(dropRecords = []) {
    const parentsByChild = new Map();
    dropRecords.forEach((drop) => {
        (Array.isArray(drop.items_list) ? drop.items_list : []).forEach((tuple, tupleIndex) => {
            if (!Array.isArray(tuple) || tuple.length < 2 || Number(tuple[0]) !== 9999) return;
            const childId = Number(tuple[1]);
            if (!parentsByChild.has(childId)) parentsByChild.set(childId, []);
            parentsByChild.get(childId).push({
                parent_drop_group_id: Number(drop.group_id),
                parent_localized_name: drop.__meta ? drop.__meta.localized_name : null,
                child_drop_group_id: childId,
                tuple_index: tupleIndex,
                tuple
            });
        });
    });
    return parentsByChild;
}

function attachParentContext(missingRefs, parentsByChild) {
    return missingRefs.map((entry) => ({
        ...entry,
        parent_references: (parentsByChild.get(Number(entry.drop_group_id)) || []).slice(0, 30)
    }));
}

function buildProjectMapIntegrity(projectMaps, dropRecordsByGroup, missingRefsWithContext) {
    return Object.fromEntries(Object.entries(projectMaps || {}).map(([projectMapId, projectMap]) => {
        const walk = walkReachableDropGroups(projectMap.root_drop_group_id, dropRecordsByGroup);
        const reachableGroups = new Set(walk.reachable_group_ids);
        const missingRefs = missingRefsWithContext.filter((entry) => reachableGroups.has(Number(entry.drop_group_id)));
        return [projectMapId, {
            current_map_id: projectMap.current_map_id || projectMapId,
            bidking_map_id: projectMap.bidking_map_id ?? null,
            bidking_root_bidmap_id: projectMap.bidking_root_bidmap_id ?? null,
            root_drop_group_id: Number(projectMap.root_drop_group_id),
            reachable_drop_group_count: walk.reachable_group_ids.length,
            missing_drop_group_ids: walk.missing_group_ids,
            missing_terminal_item_reference_count: missingRefs.length,
            missing_terminal_item_ids: uniqueSortedNumbers(missingRefs.map((entry) => entry.item_id)),
            missing_terminal_item_references: missingRefs
        }];
    }));
}

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function buildBidKingTableReferenceIntegrityReport({
    projectRelevantParseReport = readJson(DEFAULT_PROJECT_RELEVANT_PARSE_REPORT_PATH),
    schemaBackedTableReport = readJson(DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const namedTables = schemaBackedTableReport.named_tables || {};
    const dropRecords = records(namedTables, "Table_Drop");
    const itemRecords = records(namedTables, "Table_Item");
    const itemIds = new Set(itemRecords.map((entry) => Number(entry.id)).filter(Number.isFinite));
    const dropRecordsByGroup = new Map(dropRecords.map((entry) => [Number(entry.group_id), entry]));
    const parentsByChild = indexParentDropReferences(dropRecords);
    const globalMissingRefs = attachParentContext(
        collectMissingTerminalItemReferences(dropRecords, itemIds),
        parentsByChild
    );
    const projectMapIntegrity = buildProjectMapIntegrity(
        projectRelevantParseReport.project_maps || {},
        dropRecordsByGroup,
        globalMissingRefs
    );
    const projectRelevantRefs = Object.values(projectMapIntegrity).flatMap((entry) => entry.missing_terminal_item_references);
    const projectRelevantMissingIds = uniqueSortedNumbers(projectRelevantRefs.map((entry) => entry.item_id));
    const globalMissingIds = uniqueSortedNumbers(globalMissingRefs.map((entry) => entry.item_id));
    const skippedIrrelevantMissingIds = globalMissingIds.filter((itemId) => !projectRelevantMissingIds.includes(itemId));
    const blockedMaps = Object.values(projectMapIntegrity)
        .filter((entry) => entry.missing_terminal_item_reference_count > 0)
        .map((entry) => entry.current_map_id);
    const blockers = ["table_reference_integrity_not_authoritative"];
    if (projectRelevantMissingIds.length) addReason(blockers, "project_relevant_missing_terminal_item_references");
    if (blockedMaps.length) addReason(blockers, "project_maps_blocked_by_missing_item_references");

    return {
        schema_version: "ak_bidking_table_reference_integrity_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            project_relevant_parse_report: paths.projectRelevantParseReportPath || DEFAULT_PROJECT_RELEVANT_PARSE_REPORT_PATH,
            schema_backed_table_report: paths.schemaBackedTableReportPath || DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
            tables_dir: schemaBackedTableReport.inputs ? schemaBackedTableReport.inputs.tables_dir : null
        },
        summary: {
            parse_status: projectRelevantParseReport.summary ? projectRelevantParseReport.summary.parse_status : null,
            drop_group_count: dropRecords.length,
            item_record_count: itemRecords.length,
            global_missing_terminal_reference_count: globalMissingRefs.length,
            global_missing_terminal_item_id_count: globalMissingIds.length,
            project_relevant_map_count: Object.keys(projectMapIntegrity).length,
            project_relevant_missing_terminal_reference_count: projectRelevantRefs.length,
            project_relevant_missing_terminal_item_id_count: projectRelevantMissingIds.length,
            project_relevant_missing_terminal_item_ids: projectRelevantMissingIds,
            skipped_irrelevant_missing_terminal_item_ids: skippedIrrelevantMissingIds,
            maps_blocked_by_missing_item_references: blockedMaps,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            promotion_allowed: false,
            recommended_next_action: projectRelevantMissingIds.length
                ? "resolve_project_relevant_drop_item_reference_gap_before_algorithm_change"
                : "continue_same_battle_shadow_replay_gate_after_manual_mechanics_review",
            blockers,
            warnings: skippedIrrelevantMissingIds.length ? ["non_project_missing_terminal_item_references_exist"] : []
        },
        gates: {
            table_reference_integrity_clean_for_project_scope: projectRelevantMissingIds.length === 0,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        global_missing_terminal_item_references: globalMissingRefs,
        project_map_integrity: projectMapIntegrity,
        skipped_irrelevant_scope: [
            "missing item ids outside reachable project map drop graphs are retained as warnings only",
            "empty drop tuples are ignored for terminal item integrity",
            "nested drop-group marker 9999 is validated as group reference, not item reference"
        ],
        notes: [
            "This report audits table references only; it does not infer missing item values or patch source tables.",
            "Project-relevant missing terminal item references block table-backed shadow replay promotion.",
            "Default config and estimator logic remain unchanged."
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

function formatBidKingTableReferenceIntegrityMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const mapRows = Object.values(report.project_map_integrity || {}).map((entry) => (
        `| ${markdownCode(entry.current_map_id)} | ${markdownCode(entry.root_drop_group_id)} | ${markdownCode(entry.reachable_drop_group_count)} | ${markdownCode(entry.missing_terminal_item_reference_count)} | ${markdownCell(JSON.stringify(entry.missing_terminal_item_ids || []))} |`
    )).join("\n");
    const missingRows = (report.global_missing_terminal_item_references || []).map((entry) => (
        `| ${markdownCode(entry.item_id)} | ${markdownCode(entry.drop_group_id)} | ${markdownCell(entry.drop_localized_name)} | ${markdownCell(JSON.stringify(entry.tuple))} | ${markdownCode((entry.parent_references || []).length)} |`
    )).join("\n");

    return `# BidKing table reference integrity report

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Drop groups: \`${summary.drop_group_count ?? 0}\`
- Item records: \`${summary.item_record_count ?? 0}\`
- Global missing item ids: \`${summary.global_missing_terminal_item_id_count ?? 0}\`
- project-relevant missing item ids: \`${summary.project_relevant_missing_terminal_item_id_count ?? 0}\`
- project-relevant missing item ids list: ${markdownCell(JSON.stringify(summary.project_relevant_missing_terminal_item_ids || []))}
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Project Map Integrity

| map | root group | reachable groups | missing terminal refs | missing item ids |
| --- | --- | --- | --- | --- |
${mapRows || "| `-` | `-` | `0` | `0` | [] |"}

## Missing Terminal References

| item id | drop group | drop name | tuple | parent refs |
| --- | --- | --- | --- | --- |
${missingRows || "| `-` | `-` | - | - | `0` |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Project-relevant missing terminal item references must be resolved or explicitly reviewed before using table-backed shadow replay as algorithm-change evidence.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const projectRelevantParseReport = readJson(args.projectRelevantParseReportPath);
    const schemaBackedTableReport = readJson(args.schemaBackedTableReportPath);
    const report = buildBidKingTableReferenceIntegrityReport({
        projectRelevantParseReport,
        schemaBackedTableReport,
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            projectRelevantParseReportPath: args.projectRelevantParseReportPath,
            schemaBackedTableReportPath: args.schemaBackedTableReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingTableReferenceIntegrityMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PROJECT_RELEVANT_PARSE_REPORT_PATH,
    DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
    buildBidKingTableReferenceIntegrityReport,
    collectMissingTerminalItemReferences,
    formatBidKingTableReferenceIntegrityMarkdown,
    main,
    resolveArgs,
    walkReachableDropGroups
};
