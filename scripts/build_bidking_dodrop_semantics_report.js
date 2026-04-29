const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-schema-backed-table-report.json"
);
const DEFAULT_FOCUSED_IL_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-focused-il-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-dodrop-semantics-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        schemaBackedTableReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
        focusedIlReportPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_FOCUSED_IL_REPORT_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function addCount(target, key, increment = 1) {
    const safeKey = String(key ?? "unknown");
    target[safeKey] = (target[safeKey] || 0) + increment;
}

function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * ratio)));
    return sortedValues[index];
}

function summarizeDropTable(dropTable) {
    const records = dropTable && Array.isArray(dropTable.records) ? dropTable.records : [];
    const weightTypeCounts = {};
    const tupleWidthCounts = {};
    const tupleFifthValues = [];
    const nestedGroupIds = new Set();
    let tupleCount = 0;
    let nestedTupleCount = 0;
    records.forEach((record) => {
        addCount(weightTypeCounts, record.weight_type);
        const tuples = Array.isArray(record.items_list) ? record.items_list : [];
        tuples.forEach((tuple) => {
            if (!Array.isArray(tuple)) return;
            tupleCount += 1;
            addCount(tupleWidthCounts, tuple.length);
            if (Number.isFinite(tuple[4])) tupleFifthValues.push(tuple[4]);
            if (tuple[0] === 9999) {
                nestedTupleCount += 1;
                nestedGroupIds.add(tuple[1]);
            }
        });
    });
    const sortedFifthValues = tupleFifthValues.slice().sort((a, b) => a - b);
    return {
        drop_group_count: records.length,
        weight_type_counts: weightTypeCounts,
        tuple_count: tupleCount,
        tuple_width_counts: tupleWidthCounts,
        nested_group_tuple_count: nestedTupleCount,
        nested_group_id_count: nestedGroupIds.size,
        nested_group_id_samples: Array.from(nestedGroupIds).slice(0, 40),
        tuple_weight_or_probability_stats: {
            count: sortedFifthValues.length,
            min: sortedFifthValues[0] ?? null,
            p50: percentile(sortedFifthValues, 0.5),
            p90: percentile(sortedFifthValues, 0.9),
            max: sortedFifthValues[sortedFifthValues.length - 1] ?? null
        },
        samples: records.slice(0, 8).map((record) => ({
            group_id: record.group_id,
            localized_description: record.__meta ? record.__meta.localized_description : null,
            weight_type: record.weight_type,
            tuple_count: Array.isArray(record.items_list) ? record.items_list.length : 0,
            tuple_samples: Array.isArray(record.items_list) ? record.items_list.slice(0, 5) : []
        }))
    };
}

function findDoDropIlSignals(focusedIlReport) {
    const doDrop = (focusedIlReport.focused_methods || []).find((entry) => (
        entry.declaring_type === "GameServerDemo.Utils"
        && entry.method_name === "DoDrop"
    ));
    const signalInstructions = doDrop ? (doDrop.signal_instructions || []) : [];
    return {
        method_found: !!doDrop,
        method_signature: doDrop ? doDrop.signature : null,
        method_body: doDrop ? doDrop.body : null,
        critical_offsets: {
            table_lookup: signalInstructions.find((entry) => entry.resolved_full_name === "Table_Drop.getBygroup_id")?.il_offset ?? null,
            weight_type_branch: signalInstructions.find((entry) => entry.resolved_full_name === "Table_Drop.weight_type")?.il_offset ?? null,
            probability_index_call: signalInstructions.find((entry) => entry.resolved_full_name === "GameServerDemo.Utils.RandomProbabilityIndex")?.il_offset ?? null,
            weighted_index_call: signalInstructions.find((entry) => entry.resolved_full_name === "GameServerDemo.Utils.RandomWeightIndex")?.il_offset ?? null,
            recursive_call: signalInstructions.find((entry) => entry.resolved_full_name === "GameServerDemo.Utils.DoDrop")?.il_offset ?? null,
            add_range_call: signalInstructions.find((entry) => entry.resolved_full_name === "GameServerDemo.Utils.AddRange")?.il_offset ?? null,
            add_item_call: signalInstructions.find((entry) => entry.resolved_full_name === "GameServerDemo.Utils.AddItem")?.il_offset ?? null
        },
        constants: Array.from(new Set(signalInstructions
            .map((entry) => entry.operand_value)
            .filter((value) => Number.isFinite(value)))).sort((a, b) => a - b),
        branch_offsets: signalInstructions
            .filter((entry) => entry.branch_target_offset !== undefined)
            .map((entry) => ({
                il_offset: entry.il_offset,
                opcode_name: entry.opcode_name,
                target: entry.branch_target_offset
            }))
    };
}

function buildDoDropPseudocode() {
    return [
        "result = {}",
        "for outerIndex in range(repeatCount):",
        "  drop = Table_Drop.getBygroup_id(groupId)",
        "  if drop.weight_type == 1:",
        "    selectedIndexes = RandomProbabilityIndex(GetValues(drop.items_list, 4, 10000))",
        "  else:",
        "    selectedIndexes = [RandomWeightIndex(GetValues(drop.items_list, 4, 10000))]",
        "  for selectedIndex in selectedIndexes:",
        "    tuple = drop.items_list[selectedIndex]",
        "    kindOrNestedMarker = tuple[0]",
        "    itemOrNestedGroupId = tuple[1]",
        "    minCount = tuple[2]",
        "    maxCount = tuple[3]",
        "    count = RandomCount(minCount, maxCount)",
        "    if kindOrNestedMarker == 9999:",
        "      AddRange(result, DoDrop(itemOrNestedGroupId, count))",
        "    else:",
        "      AddItem(result, itemOrNestedGroupId, count)",
        "return result"
    ];
}

function buildBidKingDoDropSemanticsReport({
    schemaBackedTableReportPath = DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
    focusedIlReportPath = DEFAULT_FOCUSED_IL_REPORT_PATH
} = {}) {
    const schemaBackedTableReport = readJson(schemaBackedTableReportPath);
    const focusedIlReport = readJson(focusedIlReportPath);
    const dropTable = schemaBackedTableReport.named_tables ? schemaBackedTableReport.named_tables.Table_Drop : null;
    const tableSummary = summarizeDropTable(dropTable);
    const ilSignals = findDoDropIlSignals(focusedIlReport);
    const requiredSignals = [
        ilSignals.critical_offsets.table_lookup,
        ilSignals.critical_offsets.weight_type_branch,
        ilSignals.critical_offsets.probability_index_call,
        ilSignals.critical_offsets.weighted_index_call,
        ilSignals.critical_offsets.recursive_call,
        ilSignals.critical_offsets.add_range_call,
        ilSignals.critical_offsets.add_item_call
    ];
    const signalComplete = requiredSignals.every((value) => value !== null && value !== undefined);

    return {
        schema_version: "ak_bidking_dodrop_semantics_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            schema_backed_table_report_path: schemaBackedTableReportPath,
            focused_il_report_path: focusedIlReportPath
        },
        summary: {
            parse_status: signalComplete ? "dodrop_semantics_candidate_built" : "dodrop_semantics_incomplete",
            evidence_confidence: signalComplete ? "medium_high" : "medium",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            shadow_candidate_allowed: false,
            drop_group_count: tableSummary.drop_group_count,
            tuple_count: tableSummary.tuple_count,
            nested_group_tuple_count: tableSummary.nested_group_tuple_count,
            weight_type_counts: tableSummary.weight_type_counts,
            tuple_width_counts: tableSummary.tuple_width_counts,
            il_signal_complete: signalComplete
        },
        table_schema_binding: {
            table_type: "Table_Drop",
            schema_members: dropTable ? dropTable.schema_members : [],
            tuple_semantics_candidate: [
                { tuple_index: 0, inferred_name: "kind_or_nested_group_marker", evidence: "compared with sentinel 9999 before recursive DoDrop" },
                { tuple_index: 1, inferred_name: "item_id_or_nested_group_id", evidence: "passed to AddItem or recursive DoDrop" },
                { tuple_index: 2, inferred_name: "min_count", evidence: "first argument to RandomCount" },
                { tuple_index: 3, inferred_name: "max_count", evidence: "second argument to RandomCount" },
                { tuple_index: 4, inferred_name: "weight_or_probability", evidence: "GetValues(items_list, 4, 10000)" }
            ],
            table_summary: tableSummary
        },
        il_semantics_binding: ilSignals,
        pseudocode_candidate: buildDoDropPseudocode(),
        refactor_impact: {
            recommended_change_class: "RESEARCH_ONLY",
            live_path_touched: false,
            useful_now: [
                "DoDrop can now be modeled as a table-backed drop resolver candidate",
                "weight_type separates independent probability-index selection from single weighted-index selection",
                "tuple[0] == 9999 is a nested drop group recursion marker"
            ],
            blockers_before_model_change: [
                "decode RandomProbabilityIndex, RandomWeightIndex, GetValues, RandomCount, AddRange, and AddItem bodies",
                "validate tuple semantics against actual observed settlement samples",
                "convert this semantics candidate into shadow-only replay before estimator/default config changes",
                "manual authority handoff must remain closed until replay evidence passes"
            ]
        }
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatBidKingDoDropSemanticsMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const tupleRows = (report.table_schema_binding.tuple_semantics_candidate || []).map((entry) => (
        `| ${markdownCell(entry.tuple_index)} | ${markdownCell(entry.inferred_name)} | ${markdownCell(entry.evidence)} |`
    )).join("\n");
    const pseudocode = (report.pseudocode_candidate || []).map((line) => `    ${line}`).join("\n");
    const sampleRows = (((report.table_schema_binding.table_summary || {}).samples) || []).map((entry) => (
        `| ${markdownCell(entry.group_id)} | ${markdownCell(entry.localized_description)} | ${markdownCell(entry.weight_type)} | ${markdownCell(entry.tuple_count)} | ${markdownCell(JSON.stringify(entry.tuple_samples))} |`
    )).join("\n");

    return `# BidKing DoDrop semantics report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Schema-backed tables: \`${report.inputs ? report.inputs.schema_backed_table_report_path : "-"}\`
- Focused IL: \`${report.inputs ? report.inputs.focused_il_report_path : "-"}\`
- Parse status: \`${summary.parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- Live/order/funds path touched: \`${report.refactor_impact && report.refactor_impact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| drop groups | \`${summary.drop_group_count ?? 0}\` |
| tuples | \`${summary.tuple_count ?? 0}\` |
| nested group tuples | \`${summary.nested_group_tuple_count ?? 0}\` |
| weight type counts | ${markdownCell(JSON.stringify(summary.weight_type_counts || {}))} |
| tuple width counts | ${markdownCell(JSON.stringify(summary.tuple_width_counts || {}))} |
| IL signal complete | \`${summary.il_signal_complete === true}\` |

## Tuple Semantics Candidate

| tuple index | inferred name | evidence |
| --- | --- | --- |
${tupleRows || "| - | - | - |"}

## Pseudocode Candidate

\`\`\`text
${pseudocode}
\`\`\`

## Table Samples

| group id | description | weight type | tuple count | tuple samples |
| --- | --- | --- | --- | --- |
${sampleRows || "| - | - | - | - | - |"}

## Conclusion

The \`DoDrop\` method is now reconstructed as a research-only table-backed drop resolver candidate. It is strong enough for a shadow replay prototype, but not for default config or estimator mutation until helper bodies and settlement samples validate it.
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
    const { schemaBackedTableReportPath, focusedIlReportPath, outputPath } = resolveArgs(argv);
    const report = buildBidKingDoDropSemanticsReport({ schemaBackedTableReportPath, focusedIlReportPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingDoDropSemanticsMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_FOCUSED_IL_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
    buildBidKingDoDropSemanticsReport,
    formatBidKingDoDropSemanticsMarkdown,
    main,
    resolveArgs,
    summarizeDropTable
};
