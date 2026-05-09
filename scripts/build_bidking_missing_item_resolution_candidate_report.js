const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-reference-integrity-report.json"
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
    "2026-04-29-bidking-missing-item-resolution-candidate-report.json"
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
        tableReferenceIntegrityReportPath: positional[0]
            ? path.resolve(positional[0])
            : DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH,
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

function isWithinPath(basePath, candidatePath) {
    const relative = path.relative(path.resolve(basePath), path.resolve(candidatePath));
    return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function formatReportPath(value) {
    const text = String(value || "");
    if (!path.isAbsolute(text)) return text;
    const aliases = [
        [ROOT_DIR, "<repo>"],
        ["/tmp/ak_bidking_depot_4128581_tables_owned", "<authenticated-steam-depot>"]
    ];
    const match = aliases.find(([basePath]) => isWithinPath(basePath, text));
    if (!match) return text;
    const [basePath, alias] = match;
    const relative = path.relative(path.resolve(basePath), path.resolve(text)).split(path.sep).join("/");
    return relative ? `${alias}/${relative}` : alias;
}

function records(namedTables, tableName) {
    return namedTables && namedTables[tableName] && Array.isArray(namedTables[tableName].records)
        ? namedTables[tableName].records
        : [];
}

function uniqueSortedNumbers(values) {
    return Array.from(new Set((values || []).map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function familyPrefixForItemId(itemId) {
    const numeric = Number(itemId);
    if (!Number.isFinite(numeric)) return null;
    return Math.floor(numeric / 1000) * 1000;
}

function buildProjectMapIdsByMissingItem(tableReferenceIntegrityReport) {
    const idsByItem = new Map();
    Object.entries(tableReferenceIntegrityReport.project_map_integrity || {}).forEach(([mapId, integrity]) => {
        (integrity.missing_terminal_item_ids || []).forEach((itemId) => {
            const numeric = Number(itemId);
            if (!idsByItem.has(numeric)) idsByItem.set(numeric, []);
            idsByItem.get(numeric).push(integrity.current_map_id || mapId);
        });
    });
    return idsByItem;
}

function buildReferencesByMissingItem(tableReferenceIntegrityReport, projectRelevantIds) {
    const refsByItem = new Map();
    (tableReferenceIntegrityReport.global_missing_terminal_item_references || []).forEach((entry) => {
        const itemId = Number(entry.item_id);
        if (!projectRelevantIds.has(itemId)) return;
        if (!refsByItem.has(itemId)) refsByItem.set(itemId, []);
        refsByItem.get(itemId).push(entry);
    });
    return refsByItem;
}

function compactItemRecord(record) {
    if (!record) return null;
    return {
        id: Number(record.id),
        localized_name: record.__meta ? record.__meta.localized_name : null,
        item_type_id: record.item_type_id || [],
        slot_type: record.slot_type ?? null,
        item_quality: record.item_quality ?? null,
        base_value: record.base_value ?? null,
        max_per_listing: record.max_per_listing ?? null,
        collection: record.collection ?? null,
        collection_coin: record.collection_coin ?? null,
        icon_path: record.icon_path || null,
        model_3D: record.model_3D || null
    };
}

function summarizeDropReference(entry) {
    const tuple = Array.isArray(entry.tuple) ? entry.tuple : [];
    return {
        item_id: Number(entry.item_id),
        drop_group_id: Number(entry.drop_group_id),
        drop_localized_name: entry.drop_localized_name || null,
        tuple_index: entry.tuple_index ?? null,
        tuple,
        item_type_hint: tuple.length ? Number(tuple[0]) : null,
        min_count: tuple.length > 2 ? Number(tuple[2]) : null,
        max_count: tuple.length > 3 ? Number(tuple[3]) : null,
        weight: tuple.length > 4 ? Number(tuple[4]) : null,
        parent_reference_count: Array.isArray(entry.parent_references) ? entry.parent_references.length : 0,
        parent_references: Array.isArray(entry.parent_references) ? entry.parent_references : []
    };
}

function safeRound(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const scale = 10 ** digits;
    return Math.round(numeric * scale) / scale;
}

function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * ratio)));
    return sortedValues[index];
}

function pearsonCorrelation(leftValues, rightValues) {
    if (!Array.isArray(leftValues) || leftValues.length < 2 || leftValues.length !== rightValues.length) return null;
    const leftMean = leftValues.reduce((sum, value) => sum + value, 0) / leftValues.length;
    const rightMean = rightValues.reduce((sum, value) => sum + value, 0) / rightValues.length;
    let numerator = 0;
    let leftDenominator = 0;
    let rightDenominator = 0;
    for (let index = 0; index < leftValues.length; index += 1) {
        const leftDelta = leftValues[index] - leftMean;
        const rightDelta = rightValues[index] - rightMean;
        numerator += leftDelta * rightDelta;
        leftDenominator += leftDelta * leftDelta;
        rightDenominator += rightDelta * rightDelta;
    }
    const denominator = Math.sqrt(leftDenominator * rightDenominator);
    return denominator > 0 ? numerator / denominator : null;
}

function fitLinear(leftValues, rightValues) {
    if (!Array.isArray(leftValues) || leftValues.length < 2 || leftValues.length !== rightValues.length) return null;
    const leftMean = leftValues.reduce((sum, value) => sum + value, 0) / leftValues.length;
    const rightMean = rightValues.reduce((sum, value) => sum + value, 0) / rightValues.length;
    let numerator = 0;
    let denominator = 0;
    for (let index = 0; index < leftValues.length; index += 1) {
        numerator += (leftValues[index] - leftMean) * (rightValues[index] - rightMean);
        denominator += (leftValues[index] - leftMean) ** 2;
    }
    if (denominator <= 0) return null;
    const slope = numerator / denominator;
    return {
        intercept: rightMean - slope * leftMean,
        slope
    };
}

function compactCurvePeer(tuple, itemRecord, totalWeight, missingWeight) {
    const weight = Number(tuple[4]);
    const baseValue = Number(itemRecord.base_value);
    return {
        item_id: Number(itemRecord.id),
        localized_name: itemRecord.__meta ? itemRecord.__meta.localized_name : null,
        item_type_hint: Number(tuple[0]),
        item_type_id: itemRecord.item_type_id || [],
        item_quality: itemRecord.item_quality ?? null,
        base_value: baseValue,
        weight,
        weight_share: totalWeight > 0 ? safeRound(weight / totalWeight, 8) : null,
        weight_delta_from_missing: Number.isFinite(missingWeight) ? Math.abs(weight - missingWeight) : null
    };
}

function buildDropGroupCurveContext(entry, dropRecordsByGroup, itemRecordsById) {
    const dropGroupId = Number(entry.drop_group_id);
    const drop = dropRecordsByGroup.get(dropGroupId);
    const tuple = Array.isArray(entry.tuple) ? entry.tuple : [];
    const missingWeight = tuple.length > 4 ? Number(tuple[4]) : null;
    if (!drop || !Array.isArray(drop.items_list)) {
        return {
            drop_group_id: dropGroupId,
            drop_localized_name: entry.drop_localized_name || null,
            curve_signal: "drop_group_missing",
            known_peer_count: 0,
            missing_weight: Number.isFinite(missingWeight) ? missingWeight : null,
            authority_action_allowed: false
        };
    }

    const totalWeight = drop.items_list.reduce((sum, itemTuple) => {
        const weight = Array.isArray(itemTuple) && itemTuple.length > 4 ? Number(itemTuple[4]) : 0;
        return sum + (Number.isFinite(weight) ? weight : 0);
    }, 0);
    const knownPeers = drop.items_list
        .filter((itemTuple) => Array.isArray(itemTuple) && itemTuple.length > 4 && Number(itemTuple[0]) !== 9999)
        .filter((itemTuple) => Number(itemTuple[1]) !== Number(entry.item_id))
        .map((itemTuple) => {
            const itemRecord = itemRecordsById.get(Number(itemTuple[1]));
            if (!itemRecord) return null;
            const weight = Number(itemTuple[4]);
            const baseValue = Number(itemRecord.base_value);
            if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(baseValue) || baseValue <= 0) return null;
            return compactCurvePeer(itemTuple, itemRecord, totalWeight, missingWeight);
        })
        .filter(Boolean);

    const logValues = knownPeers.map((peer) => Math.log(peer.base_value));
    const logWeights = knownPeers.map((peer) => Math.log(peer.weight));
    const correlation = pearsonCorrelation(logValues, logWeights);
    const fit = fitLinear(logValues, logWeights);
    const predictedBaseValue = (
        fit
        && Number.isFinite(missingWeight)
        && missingWeight > 0
        && Number.isFinite(fit.slope)
        && fit.slope !== 0
    )
        ? Math.exp((Math.log(missingWeight) - fit.intercept) / fit.slope)
        : null;
    const sortedBaseValues = knownPeers.map((peer) => peer.base_value).sort((left, right) => left - right);
    const nearestWeightPeers = knownPeers
        .slice()
        .sort((left, right) => (
            (left.weight_delta_from_missing ?? Number.POSITIVE_INFINITY)
            - (right.weight_delta_from_missing ?? Number.POSITIVE_INFINITY)
            || left.item_id - right.item_id
        ))
        .slice(0, 8);
    const curveSignal = Number.isFinite(correlation) && correlation <= -0.7
        ? "inverse_value_weight_context_only"
        : "insufficient_or_weak_curve_context";

    return {
        drop_group_id: dropGroupId,
        drop_localized_name: entry.drop_localized_name || (drop.__meta ? drop.__meta.localized_name : null),
        weight_type: drop.weight_type ?? null,
        curve_signal: curveSignal,
        known_peer_count: knownPeers.length,
        missing_weight: Number.isFinite(missingWeight) ? missingWeight : null,
        missing_weight_share: totalWeight > 0 && Number.isFinite(missingWeight) ? safeRound(missingWeight / totalWeight, 8) : null,
        total_group_weight: totalWeight,
        log_value_log_weight_correlation: safeRound(correlation, 6),
        log_log_fit: fit ? {
            intercept: safeRound(fit.intercept, 6),
            slope: safeRound(fit.slope, 6)
        } : null,
        predicted_base_value_from_missing_weight: safeRound(predictedBaseValue, 2),
        known_base_value_summary: {
            min: sortedBaseValues[0] ?? null,
            p25: percentile(sortedBaseValues, 0.25),
            p50: percentile(sortedBaseValues, 0.5),
            p75: percentile(sortedBaseValues, 0.75),
            max: sortedBaseValues[sortedBaseValues.length - 1] ?? null
        },
        nearest_weight_peers: nearestWeightPeers,
        authority_action_allowed: false
    };
}

function buildMissingItemResolutionCandidates({
    schemaBackedTableReport,
    tableReferenceIntegrityReport
}) {
    const namedTables = schemaBackedTableReport.named_tables || {};
    const itemRecords = records(namedTables, "Table_Item");
    const dropRecords = records(namedTables, "Table_Drop");
    const itemRecordsById = new Map(itemRecords.map((entry) => [Number(entry.id), entry]));
    const dropRecordsByGroup = new Map(dropRecords.map((entry) => [Number(entry.group_id), entry]));
    const projectRelevantIds = new Set(
        uniqueSortedNumbers(
            tableReferenceIntegrityReport.summary
                ? tableReferenceIntegrityReport.summary.project_relevant_missing_terminal_item_ids
                : []
        )
    );
    const projectMapIdsByItem = buildProjectMapIdsByMissingItem(tableReferenceIntegrityReport);
    const refsByItem = buildReferencesByMissingItem(tableReferenceIntegrityReport, projectRelevantIds);

    return uniqueSortedNumbers(Array.from(projectRelevantIds)).map((itemId) => {
        const sourceRecord = itemRecordsById.get(itemId) || null;
        const familyPrefix = familyPrefixForItemId(itemId);
        const sameFamilyRecords = itemRecords
            .filter((entry) => familyPrefixForItemId(entry.id) === familyPrefix)
            .sort((left, right) => Number(left.id) - Number(right.id));
        const neighboringSameFamily = sameFamilyRecords
            .filter((entry) => Math.abs(Number(entry.id) - itemId) <= 20)
            .map(compactItemRecord);
        const references = (refsByItem.get(itemId) || []).map(summarizeDropReference);
        const dropGroupCurveContexts = references.map((entry) => buildDropGroupCurveContext(
            entry,
            dropRecordsByGroup,
            itemRecordsById
        ));
        const referenceWeights = uniqueSortedNumbers(references.map((entry) => entry.weight));
        const parentReferenceCount = references.reduce((total, entry) => total + entry.parent_reference_count, 0);
        const projectMapIds = projectMapIdsByItem.get(itemId) || [];

        return {
            item_id: itemId,
            candidate_status: sourceRecord ? "source_item_record_present" : "unresolved_source_gap",
            candidate_confidence: sourceRecord ? "source_record_present" : "low_source_gap",
            source_item_record_found: Boolean(sourceRecord),
            source_item_record: compactItemRecord(sourceRecord),
            item_family_prefix: familyPrefix,
            neighboring_same_family_item_count: neighboringSameFamily.length,
            neighboring_same_family_item_ids: neighboringSameFamily.map((entry) => entry.id),
            neighboring_same_family_items: neighboringSameFamily,
            project_map_ids: projectMapIds,
            reference_count: references.length,
            parent_reference_count: parentReferenceCount,
            reference_weights: referenceWeights,
            missing_drop_references: references,
            drop_group_curve_contexts: dropGroupCurveContexts,
            authority_action_allowed: false,
            resolution_options: [
                "recover_original_item_row_from_matching_client_or_table_export",
                "confirm_item_identity_from_in_game_catalog_or_authoritative_capture",
                "keep_table_backed_shadow_replay_blocked_until_source_row_is_recovered",
                "do_not_promote_synthetic_item_or_drop_tuple_exclusion_to_authority"
            ],
            blockers: sourceRecord
                ? ["source_record_present_but_integrity_report_stale"]
                : ["missing_item_source_row_unresolved", "synthetic_item_not_authoritative"]
        };
    });
}

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function buildBidKingMissingItemResolutionCandidateReport({
    tableReferenceIntegrityReport = readJson(DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH),
    schemaBackedTableReport = readJson(DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const candidates = buildMissingItemResolutionCandidates({
        schemaBackedTableReport,
        tableReferenceIntegrityReport
    });
    const unresolvedCandidates = candidates.filter((entry) => !entry.source_item_record_found);
    const projectRelevantMissingIds = uniqueSortedNumbers(candidates.map((entry) => entry.item_id));
    const curveContexts = candidates.flatMap((entry) => entry.drop_group_curve_contexts || []);
    const inverseCorrelations = curveContexts
        .map((entry) => Number(entry.log_value_log_weight_correlation))
        .filter(Number.isFinite)
        .sort((left, right) => left - right);
    const blockers = ["missing_item_resolution_not_authoritative"];
    if (unresolvedCandidates.length) addReason(blockers, "missing_item_source_row_unresolved");
    if (candidates.length) addReason(blockers, "synthetic_item_or_tuple_exclusion_not_allowed");

    return {
        schema_version: "ak_bidking_missing_item_resolution_candidate_v1",
        generated_at: generatedAt,
        mode: "source_first_implementation",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            table_reference_integrity_report: formatReportPath(paths.tableReferenceIntegrityReportPath || DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH),
            schema_backed_table_report: formatReportPath(paths.schemaBackedTableReportPath || DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH),
            tables_dir: schemaBackedTableReport.inputs ? formatReportPath(schemaBackedTableReport.inputs.tables_dir) : null
        },
        summary: {
            project_relevant_missing_item_candidate_count: candidates.length,
            unresolved_source_gap_count: unresolvedCandidates.length,
            project_relevant_missing_item_ids: projectRelevantMissingIds,
            impacted_project_maps: uniqueSortedNumbers([]).concat(
                Array.from(new Set(candidates.flatMap((entry) => entry.project_map_ids))).sort()
            ),
            curve_context_count: curveContexts.length,
            inverse_value_weight_context_count: curveContexts.filter((entry) => entry.curve_signal === "inverse_value_weight_context_only").length,
            strongest_inverse_log_value_weight_correlation: inverseCorrelations[0] ?? null,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            promotion_allowed: false,
            recommended_next_action: unresolvedCandidates.length
                ? "recover_or_manually_confirm_original_missing_item_source_row_before_replay_promotion"
                : "rerun_table_reference_integrity_after_source_recovery",
            blockers,
            warnings: [
                "neighboring item rows are context only and must not be used as authoritative reconstruction"
            ]
        },
        gates: {
            source_item_rows_recovered_for_project_scope: unresolvedCandidates.length === 0,
            synthetic_item_as_authority_allowed: false,
            drop_tuple_exclusion_as_authority_allowed: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        missing_item_candidates: candidates,
        notes: [
            "This report records candidate context for missing Item rows; it does not patch tables.",
            "Synthetic reconstruction and tuple exclusion are not valid authority sources.",
            "Default estimator config and BidKing shadow simulator gates remain closed."
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

function formatBidKingMissingItemResolutionCandidateMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const rows = (report.missing_item_candidates || []).map((entry) => (
        `| ${markdownCode(entry.item_id)} | ${markdownCode(entry.source_item_record_found)} | ${markdownCode(entry.candidate_confidence)} | ${markdownCell(JSON.stringify(entry.project_map_ids || []))} | ${markdownCode(entry.parent_reference_count)} | ${markdownCell(JSON.stringify(entry.reference_weights || []))} | ${markdownCell(JSON.stringify(entry.neighboring_same_family_item_ids || []))} |`
    )).join("\n");
    const curveRows = (report.missing_item_candidates || []).flatMap((entry) => (
        (entry.drop_group_curve_contexts || []).map((context) => (
            `| ${markdownCode(entry.item_id)} | ${markdownCode(context.drop_group_id)} | ${markdownCell(context.curve_signal)} | ${markdownCode(context.known_peer_count)} | ${markdownCode(context.missing_weight)} | ${markdownCode(context.log_value_log_weight_correlation)} | ${markdownCode(context.predicted_base_value_from_missing_weight)} | ${markdownCell(JSON.stringify((context.nearest_weight_peers || []).slice(0, 4).map((peer) => peer.item_id)))} |`
        ))
    )).join("\n");

    return `# BidKing missing item resolution candidate report

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- missing item resolution candidate count: \`${summary.project_relevant_missing_item_candidate_count ?? 0}\`
- unresolved source gaps: \`${summary.unresolved_source_gap_count ?? 0}\`
- project-relevant missing item ids: ${markdownCell(JSON.stringify(summary.project_relevant_missing_item_ids || []))}
- curve contexts: \`${summary.curve_context_count ?? 0}\`
- inverse value/weight contexts: \`${summary.inverse_value_weight_context_count ?? 0}\`
- strongest inverse log(value)/log(weight) correlation: \`${summary.strongest_inverse_log_value_weight_correlation ?? "-"}\`
- Synthetic item as authority allowed: \`${summary.synthetic_item_as_authority_allowed === true}\`
- Drop tuple exclusion as authority allowed: \`${summary.drop_tuple_exclusion_as_authority_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Candidates

| item id | source row found | confidence | maps | parent refs | weights | neighboring family ids |
| --- | --- | --- | --- | --- | --- | --- |
${rows || "| `-` | `false` | `-` | [] | `0` | [] | [] |"}

## Curve Context

| item id | drop group | signal | known peers | missing weight | log correlation | predicted base | nearest peers |
| --- | --- | --- | --- | --- | --- | --- | --- |
${curveRows || "| `-` | `-` | - | `0` | `-` | `-` | `-` | [] |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Decision

Source gap remains unresolved. Keep table-backed shadow replay, synthetic item reconstruction, tuple exclusion, authority handoff, and default config updates closed until the original Item source row is recovered or manually confirmed from an authoritative source.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const tableReferenceIntegrityReport = readJson(args.tableReferenceIntegrityReportPath);
    const schemaBackedTableReport = readJson(args.schemaBackedTableReportPath);
    const report = buildBidKingMissingItemResolutionCandidateReport({
        tableReferenceIntegrityReport,
        schemaBackedTableReport,
        generatedAt: args.generatedAt || new Date().toISOString(),
        paths: {
            tableReferenceIntegrityReportPath: args.tableReferenceIntegrityReportPath,
            schemaBackedTableReportPath: args.schemaBackedTableReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingMissingItemResolutionCandidateMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
    DEFAULT_TABLE_REFERENCE_INTEGRITY_REPORT_PATH,
    buildBidKingMissingItemResolutionCandidateReport,
    buildMissingItemResolutionCandidates,
    formatReportPath,
    formatBidKingMissingItemResolutionCandidateMarkdown,
    main,
    resolveArgs
};
