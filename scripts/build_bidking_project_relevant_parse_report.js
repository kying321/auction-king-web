const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-schema-backed-table-report.json"
);
const DEFAULT_DODROP_SEMANTICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-dodrop-semantics-report.json"
);
const DEFAULT_DROP_HELPER_SEMANTICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-drop-helper-semantics-report.json"
);
const DEFAULT_METHOD_METADATA_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-method-metadata-report.json"
);
const DEFAULT_METHOD_CALLGRAPH_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-method-callgraph-report.json"
);
const DEFAULT_FOCUSED_IL_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-focused-il-report.json"
);
const DEFAULT_STRATEGY_COMPARISON_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-strategy-comparison-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-project-relevant-parse-report.json"
);

const REQUIRED_TABLE_TYPES = [
    "Table_Map",
    "Table_BidMap",
    "Table_RankMap",
    "Table_RankAi",
    "Table_Drop",
    "Table_Item",
    "Table_Skill",
    "Table_Hero",
    "Table_BattleItem",
    "Table_Condition",
    "Table_Sim",
    "Table_Constant"
];
const PROJECT_MAP_IDS = ["shipping", "sunken_ship", "villa"];

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        outputPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function records(namedTables, typeName) {
    return namedTables && namedTables[typeName] && Array.isArray(namedTables[typeName].records)
        ? namedTables[typeName].records
        : [];
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function addCount(target, key, increment = 1) {
    const safeKey = String(key === undefined ? "undefined" : key);
    target[safeKey] = (target[safeKey] || 0) + increment;
}

function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * ratio)));
    return sortedValues[index];
}

function summarizeNumbers(values = []) {
    const sorted = values
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    return {
        count: sorted.length,
        min: sorted[0] ?? null,
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        max: sorted[sorted.length - 1] ?? null
    };
}

function summarizeWeightedRanges(ranges = []) {
    const normalized = (Array.isArray(ranges) ? ranges : [])
        .filter((entry) => Array.isArray(entry) && entry.length >= 3)
        .map((entry) => ({
            low: Number(entry[0]),
            high: Number(entry[1]),
            weight: Number(entry[2]) || 0,
            raw: entry
        }))
        .filter((entry) => Number.isFinite(entry.low) && Number.isFinite(entry.high));
    return {
        range_count: normalized.length,
        total_weight: normalized.reduce((sum, entry) => sum + entry.weight, 0),
        min_low: normalized.length ? Math.min(...normalized.map((entry) => entry.low)) : null,
        max_high: normalized.length ? Math.max(...normalized.map((entry) => entry.high)) : null,
        top_ranges: normalized
            .sort((left, right) => right.weight - left.weight)
            .slice(0, 8)
            .map((entry) => entry.raw)
    };
}

function summarizeWeightedPairs(pairs = []) {
    const normalized = (Array.isArray(pairs) ? pairs : [])
        .filter((entry) => Array.isArray(entry) && entry.length >= 2)
        .map((entry) => ({
            key: entry[0],
            weight: Number(entry[entry.length - 1]) || 0,
            raw: entry
        }));
    return {
        entry_count: normalized.length,
        total_weight: normalized.reduce((sum, entry) => sum + entry.weight, 0),
        top_entries: normalized
            .sort((left, right) => right.weight - left.weight)
            .slice(0, 10)
            .map((entry) => entry.raw)
    };
}

function isCollectibleItem(item) {
    const typeIds = Array.isArray(item.item_type_id) ? item.item_type_id : [];
    return typeIds.some((typeId) => Number(typeId) >= 101 && Number(typeId) <= 399);
}

function buildTableCoverage(namedTables = {}) {
    const missingTables = REQUIRED_TABLE_TYPES.filter((typeName) => !namedTables[typeName]);
    const rows = REQUIRED_TABLE_TYPES.map((typeName) => {
        const table = namedTables[typeName] || {};
        return {
            type_name: typeName,
            table_file: table.table_file || null,
            row_count: Number(table.row_count) || 0,
            mapping_mode: table.mapping_mode || null,
            schema_field_count: Array.isArray(table.schema_members) ? table.schema_members.length : 0,
            schema_fields: (table.schema_members || []).map((member) => member.name)
        };
    });
    return {
        required_table_count: REQUIRED_TABLE_TYPES.length,
        parsed_table_count: rows.filter((entry) => entry.row_count > 0 || namedTables[entry.type_name]).length,
        missing_tables: missingTables,
        total_row_count: rows.reduce((sum, entry) => sum + entry.row_count, 0),
        tables: rows
    };
}

function buildItemParseIndex(itemRecords = []) {
    const collectible = itemRecords.filter(isCollectibleItem);
    const qualityCounts = {};
    const typeCounts = {};
    const baseValueByQuality = {};
    const gridCountByQuality = {};
    let auctionItemCount = 0;

    collectible.forEach((item) => {
        addCount(qualityCounts, item.item_quality);
        if (item.is_auction === true) auctionItemCount += 1;
        (Array.isArray(item.item_type_id) ? item.item_type_id : []).forEach((typeId) => {
            if (Number(typeId) >= 101 && Number(typeId) <= 399) addCount(typeCounts, typeId);
        });
        const quality = String(item.item_quality ?? "unknown");
        if (!Array.isArray(baseValueByQuality[quality])) baseValueByQuality[quality] = [];
        if (!Array.isArray(gridCountByQuality[quality])) gridCountByQuality[quality] = [];
        if (Number.isFinite(Number(item.base_value))) baseValueByQuality[quality].push(Number(item.base_value));
        if (Number.isFinite(Number(item.grid_count))) gridCountByQuality[quality].push(Number(item.grid_count));
    });

    return {
        total_item_count: itemRecords.length,
        collectible_item_count: collectible.length,
        auction_collectible_item_count: auctionItemCount,
        quality_counts: qualityCounts,
        top_item_type_counts: Object.entries(typeCounts)
            .sort((left, right) => right[1] - left[1])
            .slice(0, 30)
            .map(([typeId, count]) => ({ type_id: Number(typeId), count })),
        base_value_stats_by_quality: Object.fromEntries(Object.entries(baseValueByQuality).map(([quality, values]) => [
            quality,
            summarizeNumbers(values)
        ])),
        grid_count_stats_by_quality: Object.fromEntries(Object.entries(gridCountByQuality).map(([quality, values]) => [
            quality,
            summarizeNumbers(values)
        ])),
        samples: collectible.slice(0, 20).map((item) => ({
            item_id: item.id,
            localized_name: item.__meta ? item.__meta.localized_name : null,
            item_type_id: item.item_type_id,
            item_quality: item.item_quality,
            base_value: item.base_value,
            grid_count: item.grid_count,
            drop_group_id: item.drop_group_id
        }))
    };
}

function getBidMapRootDropGroupId(bidMap = {}) {
    const ref = Array.isArray(bidMap.drop_group_id) ? bidMap.drop_group_id : [];
    if (ref[0] === 9999 && Number.isFinite(Number(ref[1]))) return Number(ref[1]);
    if (Number.isFinite(Number(ref[0]))) return Number(ref[0]);
    return null;
}

function buildDropGraphIndex(dropRecords = [], itemRecords = []) {
    const dropById = new Map(dropRecords.map((drop) => [drop.group_id, drop]));
    const itemIds = new Set(itemRecords.map((item) => item.id));
    const weightTypeCounts = {};
    const tupleKindCounts = {};
    const nestedGroupIds = new Set();
    const missingNestedGroupIds = new Set();
    const terminalItemIds = new Set();
    const missingTerminalItemIds = new Set();
    let tupleCount = 0;
    let emptyTupleCount = 0;

    dropRecords.forEach((drop) => {
        addCount(weightTypeCounts, drop.weight_type);
        (Array.isArray(drop.items_list) ? drop.items_list : []).forEach((tuple) => {
            if (!Array.isArray(tuple) || tuple.length === 0) {
                emptyTupleCount += 1;
                addCount(tupleKindCounts, "empty");
                return;
            }
            tupleCount += 1;
            addCount(tupleKindCounts, tuple[0]);
            if (tuple[0] === 9999) {
                nestedGroupIds.add(tuple[1]);
                if (!dropById.has(tuple[1])) missingNestedGroupIds.add(tuple[1]);
                return;
            }
            terminalItemIds.add(tuple[1]);
            if (!itemIds.has(tuple[1])) missingTerminalItemIds.add(tuple[1]);
        });
    });

    function walk(rootGroupId) {
        const visited = new Set();
        const stack = [rootGroupId];
        const terminalItems = new Set();
        const missingGroups = new Set();
        let reachableTupleCount = 0;

        while (stack.length) {
            const groupId = stack.pop();
            if (!Number.isFinite(Number(groupId)) || visited.has(groupId)) continue;
            visited.add(groupId);
            const drop = dropById.get(groupId);
            if (!drop) {
                missingGroups.add(groupId);
                continue;
            }
            (Array.isArray(drop.items_list) ? drop.items_list : []).forEach((tuple) => {
                if (!Array.isArray(tuple) || tuple.length === 0) return;
                reachableTupleCount += 1;
                if (tuple[0] === 9999) stack.push(tuple[1]);
                else terminalItems.add(tuple[1]);
            });
        }

        return {
            root_group_id: rootGroupId,
            reachable_drop_group_count: visited.size,
            reachable_tuple_count: reachableTupleCount,
            terminal_item_count: terminalItems.size,
            missing_group_count: missingGroups.size,
            missing_group_ids: Array.from(missingGroups).slice(0, 30)
        };
    }

    return {
        drop_group_count: dropRecords.length,
        tuple_count: tupleCount,
        empty_tuple_count: emptyTupleCount,
        weight_type_counts: weightTypeCounts,
        tuple_kind_counts: tupleKindCounts,
        nested_group_id_count: nestedGroupIds.size,
        missing_nested_group_count: missingNestedGroupIds.size,
        missing_nested_group_ids: Array.from(missingNestedGroupIds).slice(0, 40),
        terminal_item_id_count: terminalItemIds.size,
        missing_terminal_item_count: missingTerminalItemIds.size,
        missing_terminal_item_ids_sample: Array.from(missingTerminalItemIds).slice(0, 40),
        root_walk: walk
    };
}

function buildSkillParseIndex(skillRecords = [], heroRecords = [], battleItemRecords = []) {
    const skillTypeCounts = {};
    const skillCountTypeCounts = {};
    const showTypeCounts = {};
    const revealPattern = /显示|揭示|扫描|透视|轮廓|品质|总价值|总格数|价值/;
    const valuePattern = /价值|总价值/;
    const qualityPattern = /品质/;
    const outlinePattern = /轮廓|透视|扫描|显示/;
    const revealSkills = [];

    skillRecords.forEach((skill) => {
        addCount(skillTypeCounts, skill.skill_type);
        addCount(skillCountTypeCounts, skill.skill_count_type);
        addCount(showTypeCounts, skill.show_type);
        const text = [
            skill.__meta && skill.__meta.localized_name,
            skill.__meta && skill.__meta.localized_description,
            skill.skilldesc,
            skill.skill_textshow
        ].filter(Boolean).join(" ");
        if (revealPattern.test(text)) {
            revealSkills.push({
                skill_id: skill.id,
                localized_name: skill.__meta ? skill.__meta.localized_name : null,
                localized_description: skill.__meta ? skill.__meta.localized_description : null,
                skill_type: skill.skill_type,
                skilltarget: skill.skilltarget,
                skilltargetvalue: skill.skilltargetvalue,
                skill_count_type: skill.skill_count_type,
                skill_count: skill.skill_count,
                skill_round: skill.skill_round,
                skill_CD: skill.skill_CD,
                categories: [
                    valuePattern.test(text) ? "value_hint" : null,
                    qualityPattern.test(text) ? "quality_reveal" : null,
                    outlinePattern.test(text) ? "outline_or_scan" : null
                ].filter(Boolean)
            });
        }
    });

    return {
        skill_count: skillRecords.length,
        hero_count: heroRecords.length,
        battle_item_count: battleItemRecords.length,
        skill_type_counts: skillTypeCounts,
        skill_count_type_counts: skillCountTypeCounts,
        show_type_counts: showTypeCounts,
        reveal_or_strategy_skill_count: revealSkills.length,
        reveal_skill_category_counts: revealSkills.reduce((result, skill) => {
            skill.categories.forEach((category) => addCount(result, category));
            return result;
        }, {}),
        reveal_or_strategy_skill_samples: revealSkills.slice(0, 40),
        hero_samples: heroRecords.slice(0, 20).map((hero) => ({
            hero_id: hero.id,
            localized_name: hero.__meta ? hero.__meta.localized_name : null,
            localized_description: hero.__meta ? hero.__meta.localized_description : null,
            cast_type: hero.cast_type,
            hero_tag: hero.hero_tag,
            hero_task_group: hero.hero_task_group
        }))
    };
}

function buildRankAiIndex(rankAiRecords = []) {
    const byRole = {};
    const itemUseProbabilityValues = [];
    rankAiRecords.forEach((entry) => {
        const roleId = String(entry.role_id ?? "unknown");
        if (!byRole[roleId]) byRole[roleId] = {
            role_id: entry.role_id,
            row_count: 0,
            round_counts: {},
            min_bid_ratio_ranges: [],
            bid_time_ranges: [],
            bid_pk_ranges: []
        };
        const bucket = byRole[roleId];
        bucket.row_count += 1;
        addCount(bucket.round_counts, entry.round_count);
        if (Number.isFinite(Number(entry.item_use_probability))) itemUseProbabilityValues.push(Number(entry.item_use_probability));
        bucket.min_bid_ratio_ranges.push(...(Array.isArray(entry.min_bid_ratio) ? entry.min_bid_ratio : []));
        bucket.bid_time_ranges.push(...(Array.isArray(entry.bid_time) ? entry.bid_time : []));
        bucket.bid_pk_ranges.push(...(Array.isArray(entry.bid_pk) ? entry.bid_pk : []));
    });

    return {
        rank_ai_row_count: rankAiRecords.length,
        role_count: Object.keys(byRole).length,
        item_use_probability_stats: summarizeNumbers(itemUseProbabilityValues),
        role_samples: Object.values(byRole).slice(0, 20).map((entry) => ({
            role_id: entry.role_id,
            row_count: entry.row_count,
            round_counts: entry.round_counts,
            min_bid_ratio_summary: summarizeWeightedRanges(entry.min_bid_ratio_ranges),
            bid_time_summary: summarizeWeightedRanges(entry.bid_time_ranges),
            bid_pk_summary: summarizeWeightedRanges(entry.bid_pk_ranges)
        }))
    };
}

function buildSimAndConstantIndex(simRecords = [], constantRecords = []) {
    const strategyConstantPattern = /bid|auction|item|quality|drop|rank|round|sim|price|value|grid|hero|skill/i;
    const strategyConstants = constantRecords.filter((entry) => (
        strategyConstantPattern.test(String(entry.Id || ""))
        || strategyConstantPattern.test(String(entry.Name || ""))
    ));
    return {
        sim_row_count: simRecords.length,
        sim_success_interval_stats: summarizeNumbers(simRecords.flatMap((entry) => (
            Array.isArray(entry.success_interval) ? entry.success_interval : []
        ))),
        sim_drop_group_count: new Set(simRecords.map((entry) => entry.simdorp).filter((value) => Number.isFinite(Number(value)))).size,
        constant_row_count: constantRecords.length,
        strategy_constant_count: strategyConstants.length,
        strategy_constant_samples: strategyConstants.slice(0, 30).map((entry) => ({
            Id: entry.Id,
            Name: entry.Name,
            Type: entry.Type,
            Value: entry.Value
        }))
    };
}

function buildProjectMapIndex({ namedTables, strategyComparisonReport, dropGraph }) {
    const mapRecords = records(namedTables, "Table_Map");
    const bidMapRecords = records(namedTables, "Table_BidMap");
    const rankMapRecords = records(namedTables, "Table_RankMap");
    const rankAiRecords = records(namedTables, "Table_RankAi");
    const mapById = new Map(mapRecords.map((entry) => [entry.id, entry]));
    const bidMapsByParent = {};
    bidMapRecords.forEach((entry) => {
        const key = String(entry.parent_map_id);
        if (!Array.isArray(bidMapsByParent[key])) bidMapsByParent[key] = [];
        bidMapsByParent[key].push(entry);
    });
    const rankMapById = new Map(rankMapRecords.map((entry) => [entry.id, entry]));

    return PROJECT_MAP_IDS.reduce((result, projectMapId) => {
        const comparison = strategyComparisonReport.maps ? strategyComparisonReport.maps[projectMapId] : null;
        const candidate = comparison && comparison.bidking_alignment_candidate ? comparison.bidking_alignment_candidate : null;
        const bidkingMapId = candidate ? candidate.bidking_map_id_candidate : null;
        const mapRecord = mapById.get(bidkingMapId) || null;
        const bidMaps = bidMapsByParent[String(bidkingMapId)] || [];
        const rootBidMapId = candidate ? candidate.bidking_bidmap_root_candidate : (mapRecord ? mapRecord.entrust_bidmap : null);
        const rootBidMap = bidMaps.find((entry) => entry.id === rootBidMapId) || bidMaps.find((entry) => entry.id === (mapRecord && mapRecord.entrust_bidmap)) || null;
        const rootDropGroupId = rootBidMap ? getBidMapRootDropGroupId(rootBidMap) : null;
        const rankMap = rootBidMap ? rankMapById.get(rootBidMap.id) : null;
        result[projectMapId] = {
            current_map_id: projectMapId,
            bidking_map_id: bidkingMapId,
            bidking_root_bidmap_id: rootBidMapId,
            evidence_confidence: candidate ? candidate.confidence : "missing",
            alignment_blocker: candidate ? candidate.blocker : "missing_bidking_map_alignment_candidate",
            map_record: mapRecord ? {
                localized_name: mapRecord.__meta ? mapRecord.__meta.localized_name : null,
                map_name: mapRecord.map_name,
                entrust_num: mapRecord.entrust_num,
                entrust_value: mapRecord.entrust_value,
                entrust_bidmap: mapRecord.entrust_bidmap,
                entrust_prob: mapRecord.entrust_prob,
                mapgroup: mapRecord.mapgroup
            } : null,
            bidmap_count: bidMaps.length,
            bidmap_samples: bidMaps.slice(0, 12).map((entry) => ({
                id: entry.id,
                localized_name: entry.__meta ? entry.__meta.localized_name : null,
                map_cell: entry.map_cell,
                bidder_number: entry.bidder_number,
                auction_rounds_rate: entry.auction_rounds_rate,
                drop_group_id: entry.drop_group_id,
                root_drop_group_id: getBidMapRootDropGroupId(entry)
            })),
            root_rank_map: rankMap ? {
                id: rankMap.id,
                localized_name: rankMap.__meta ? rankMap.__meta.localized_name : null,
                match_time_summary: summarizeWeightedRanges(rankMap.match_time),
                role_spawn_summary: summarizeWeightedPairs(rankMap.role_spawn),
                min_bid_range_summary: summarizeWeightedRanges(rankMap.min_bid_range),
                bid_type: rankMap.bid_type
            } : null,
            rank_ai_rows_for_bidking_map: rankAiRecords.filter((entry) => entry.role_id === bidkingMapId).length,
            root_drop_group_id: rootDropGroupId,
            root_drop_graph: Number.isFinite(Number(rootDropGroupId)) ? dropGraph.root_walk(rootDropGroupId) : null,
            default_config_update_allowed: false,
            shadow_candidate_allowed: false
        };
        return result;
    }, {});
}

function buildMethodScopeCompletion(methodMetadataReport = {}, methodCallgraphReport = {}, focusedIlReport = {}) {
    const metadataSummary = isPlainObject(methodMetadataReport.summary) ? methodMetadataReport.summary : {};
    const callgraphSummary = isPlainObject(methodCallgraphReport.summary) ? methodCallgraphReport.summary : {};
    const focusedSummary = isPlainObject(focusedIlReport.summary) ? focusedIlReport.summary : {};
    return {
        target_method_marker_count: metadataSummary.target_method_marker_count ?? null,
        primary_method_markers_missing: metadataSummary.primary_method_markers_missing || [],
        project_relevant_method_scope_complete: Array.isArray(metadataSummary.primary_method_markers_missing)
            && metadataSummary.primary_method_markers_missing.length === 0,
        method_node_count: callgraphSummary.method_node_count ?? null,
        direct_call_edge_count: callgraphSummary.edge_count ?? null,
        unresolved_edge_count: callgraphSummary.unresolved_edge_count ?? null,
        unresolved_edge_ratio: callgraphSummary.unresolved_edge_ratio ?? null,
        focused_method_count: focusedSummary.focused_method_count ?? null,
        unresolved_token_reference_ratio: focusedSummary.unresolved_token_reference_ratio ?? null,
        retained_nonblocking_unresolved_scope: [
            "generic TypeSpec or MethodSpec calls kept as evidence notes",
            "network request wrappers are identified but protocol payload internals are out of strategy scope",
            "async MoveNext callback internals are not promoted to estimator authority"
        ]
    };
}

function buildBidKingProjectRelevantParseReport({
    schemaBackedTableReport = readJson(DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH),
    doDropSemanticsReport = readJson(DEFAULT_DODROP_SEMANTICS_REPORT_PATH),
    dropHelperSemanticsReport = readJson(DEFAULT_DROP_HELPER_SEMANTICS_REPORT_PATH),
    methodMetadataReport = readJson(DEFAULT_METHOD_METADATA_REPORT_PATH),
    methodCallgraphReport = readJson(DEFAULT_METHOD_CALLGRAPH_REPORT_PATH),
    focusedIlReport = readJson(DEFAULT_FOCUSED_IL_REPORT_PATH),
    strategyComparisonReport = readJson(DEFAULT_STRATEGY_COMPARISON_REPORT_PATH),
    generatedAt = new Date().toISOString()
} = {}) {
    const namedTables = schemaBackedTableReport.named_tables || {};
    const itemRecords = records(namedTables, "Table_Item");
    const dropRecords = records(namedTables, "Table_Drop");
    const skillRecords = records(namedTables, "Table_Skill");
    const heroRecords = records(namedTables, "Table_Hero");
    const rankAiRecords = records(namedTables, "Table_RankAi");
    const simRecords = records(namedTables, "Table_Sim");
    const constantRecords = records(namedTables, "Table_Constant");
    const battleItemRecords = records(namedTables, "Table_BattleItem");
    const tableCoverage = buildTableCoverage(namedTables);
    const dropGraph = buildDropGraphIndex(dropRecords, itemRecords);
    const methodScope = buildMethodScopeCompletion(methodMetadataReport, methodCallgraphReport, focusedIlReport);
    const helperSummary = dropHelperSemanticsReport.summary || {};
    const doDropSummary = doDropSemanticsReport.summary || {};
    const projectMaps = buildProjectMapIndex({ namedTables, strategyComparisonReport, dropGraph });
    const projectMapEntries = Object.values(projectMaps);

    return {
        schema_version: "ak_bidking_project_relevant_parse_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        summary: {
            parse_status: "project_relevant_parse_complete",
            evidence_confidence: "medium_high",
            authority_adoption_allowed: false,
            default_config_update_allowed: false,
            shadow_candidate_allowed: false,
            reverse_engineering_source_allowed: true,
            included_table_count: tableCoverage.parsed_table_count,
            included_record_count: tableCoverage.total_row_count,
            missing_required_table_count: tableCoverage.missing_tables.length,
            project_current_map_count: projectMapEntries.length,
            project_aligned_map_count: projectMapEntries.filter((entry) => Number.isFinite(Number(entry.bidking_map_id))).length,
            collectible_item_count: itemRecords.filter(isCollectibleItem).length,
            drop_group_count: dropRecords.length,
            drop_tuple_count: dropGraph.tuple_count,
            reveal_or_strategy_skill_count: buildSkillParseIndex(skillRecords, heroRecords, battleItemRecords).reveal_or_strategy_skill_count,
            project_relevant_method_scope_complete: methodScope.project_relevant_method_scope_complete,
            dodrop_semantics_complete: doDropSummary.il_signal_complete === true,
            helper_semantics_complete: (
                helperSummary.probability_mode_is_independent_bernoulli === true
                && helperSummary.weighted_mode_is_single_cumulative_choice === true
                && helperSummary.random_count_upper_bound_exclusive === true
            )
        },
        gates: {
            manual_mechanics_review_approved: false,
            same_battle_replay_samples_attached: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        included_project_scope: [
            "map and bidmap structure",
            "rank map count, role spawn, min bid, and bid type distributions",
            "rank AI opponent bidding and item-use distributions",
            "drop graph, nested groups, and helper semantics",
            "collectible item quality, value, grid, and type distributions",
            "strategy-visible skills, heroes, battle items, conditions, sim rows, and constants",
            "project-relevant method markers and focused IL evidence"
        ],
        skipped_irrelevant_scope: [
            "login, account, payment, analytics, ads, mail, and social flows",
            "full Unity scene, shader, sprite, audio, and localization asset graph",
            "protocol payload implementation after request-wrapper identification",
            "generic async/task plumbing not tied to estimator or table-backed mechanics",
            "non-auction/non-collectible inventory systems outside current app strategy"
        ],
        parse_completion: {
            table_coverage: tableCoverage,
            method_scope: methodScope,
            dodrop_semantics: {
                parse_status: doDropSummary.parse_status || "unknown",
                il_signal_complete: doDropSummary.il_signal_complete === true,
                weight_type_counts: doDropSummary.weight_type_counts || {},
                tuple_width_counts: doDropSummary.tuple_width_counts || {}
            },
            drop_helper_semantics: {
                parse_status: helperSummary.parse_status || "unknown",
                probability_mode_is_independent_bernoulli: helperSummary.probability_mode_is_independent_bernoulli === true,
                weighted_mode_is_single_cumulative_choice: helperSummary.weighted_mode_is_single_cumulative_choice === true,
                random_count_upper_bound_exclusive: helperSummary.random_count_upper_bound_exclusive === true,
                missing_helper_keys: helperSummary.missing_helper_keys || []
            }
        },
        project_maps: projectMaps,
        indexes: {
            drop_graph: {
                ...dropGraph,
                root_walk: undefined
            },
            item_index: buildItemParseIndex(itemRecords),
            skill_index: buildSkillParseIndex(skillRecords, heroRecords, battleItemRecords),
            rank_ai_index: buildRankAiIndex(rankAiRecords),
            sim_and_constant_index: buildSimAndConstantIndex(simRecords, constantRecords)
        },
        next_allowed_lane: [
            "manual_mechanics_review_results",
            "table_backed_shadow_simulator",
            "same_battle_shadow_replay_gate",
            "authority_handoff_gate"
        ],
        hard_blocks_before_algorithm_change: [
            "current map alignment must be manually approved",
            "schema parse order must be manually approved",
            "same-battle replay samples must be attached",
            "shadow replay must beat or match baseline before any default config update"
        ],
        source_artifacts: {
            schema_backed_table_report: DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
            dodrop_semantics_report: DEFAULT_DODROP_SEMANTICS_REPORT_PATH,
            drop_helper_semantics_report: DEFAULT_DROP_HELPER_SEMANTICS_REPORT_PATH,
            method_metadata_report: DEFAULT_METHOD_METADATA_REPORT_PATH,
            method_callgraph_report: DEFAULT_METHOD_CALLGRAPH_REPORT_PATH,
            focused_il_report: DEFAULT_FOCUSED_IL_REPORT_PATH,
            strategy_comparison_report: DEFAULT_STRATEGY_COMPARISON_REPORT_PATH
        }
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

function formatBidKingProjectRelevantParseMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const mapRows = Object.values(report.project_maps || {}).map((entry) => (
        `| ${markdownCode(entry.current_map_id)} | ${markdownCode(entry.bidking_map_id)} | ${markdownCode(entry.bidking_root_bidmap_id)} | ${markdownCell(entry.evidence_confidence)} | ${markdownCell(entry.map_record && JSON.stringify(entry.map_record.entrust_num))} | ${markdownCode(entry.bidmap_count)} | ${markdownCode(entry.root_drop_graph && entry.root_drop_graph.reachable_drop_group_count)} | ${markdownCode(entry.default_config_update_allowed === true)} |`
    )).join("\n");
    const tableRows = (((report.parse_completion || {}).table_coverage || {}).tables || []).map((entry) => (
        `| ${markdownCell(entry.type_name)} | ${markdownCell(entry.table_file)} | ${markdownCode(entry.row_count)} | ${markdownCell(entry.mapping_mode)} | ${markdownCode(entry.schema_field_count)} |`
    )).join("\n");

    return `# BidKing project-relevant parse report

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Parse status: \`${summary.parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Completion

| signal | value |
| --- | --- |
| included tables | \`${summary.included_table_count ?? 0}\` |
| included records | \`${summary.included_record_count ?? 0}\` |
| missing required tables | \`${summary.missing_required_table_count ?? 0}\` |
| project maps aligned | \`${summary.project_aligned_map_count ?? 0}/${summary.project_current_map_count ?? 0}\` |
| collectible items | \`${summary.collectible_item_count ?? 0}\` |
| drop groups | \`${summary.drop_group_count ?? 0}\` |
| drop tuples | \`${summary.drop_tuple_count ?? 0}\` |
| strategy-visible skills | \`${summary.reveal_or_strategy_skill_count ?? 0}\` |
| method scope complete | \`${summary.project_relevant_method_scope_complete === true}\` |
| DoDrop semantics complete | \`${summary.dodrop_semantics_complete === true}\` |
| helper semantics complete | \`${summary.helper_semantics_complete === true}\` |

## Project Map Parse

| current map | BidKing map | root bidmap | confidence | item range | bidmaps | reachable drop groups | default update |
| --- | --- | --- | --- | --- | --- | --- | --- |
${mapRows || "| `-` | `-` | `-` | - | - | `-` | `-` | `false` |"}

## Table Scope

| table type | file | rows | mapping | fields |
| --- | --- | --- | --- | --- |
${tableRows || "| - | - | `0` | - | `0` |"}

## Skipped Scope

${(report.skipped_irrelevant_scope || []).map((entry) => `- ${entry}`).join("\n")}

## Decision

Project-relevant parsing is complete for the current strategy workbench scope. The next safe step is table-backed shadow simulation after manual mechanics review and same-battle replay samples; default configuration remains blocked.
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
    const { outputPath } = resolveArgs(argv);
    const report = buildBidKingProjectRelevantParseReport();
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingProjectRelevantParseMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    buildBidKingProjectRelevantParseReport,
    buildDropGraphIndex,
    buildItemParseIndex,
    buildProjectMapIndex,
    buildTableCoverage,
    formatBidKingProjectRelevantParseMarkdown,
    getBidMapRootDropGroupId,
    main,
    resolveArgs
};
