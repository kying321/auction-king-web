const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TABLES_DIR = process.env.BIDKING_TABLES_DIR || path.join(ROOT_DIR, "external", "BidKing_zip_extract_min", "Tables");
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
    "2026-04-29-bidking-schema-backed-table-report.json"
);

const KEY_TABLE_TYPES = [
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

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        tablesDir: argv[0] ? path.resolve(argv[0]) : DEFAULT_TABLES_DIR,
        schemaMetadataReportPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_SCHEMA_METADATA_REPORT_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileExists(filePath) {
    return !!filePath && fs.existsSync(filePath);
}

function parseTableRows(tablesDir, tableFile) {
    const filePath = path.join(tablesDir, tableFile);
    if (!fileExists(filePath)) return [];
    return fs.readFileSync(filePath, "utf8")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .map((line) => line.split("\t"));
}

function parseJsonish(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
        try {
            return JSON.parse(text);
        } catch (_error) {
            return text;
        }
    }
    return text;
}

function parseBySchemaType(value, schemaType) {
    const text = String(value ?? "").trim();
    if (text === "") return null;
    if (/\[\]$/.test(schemaType) || /\[\]\[\]$/.test(schemaType)) return parseJsonish(text);
    if (schemaType === "int" || schemaType === "long" || schemaType === "uint") {
        const numeric = Number(text);
        return Number.isFinite(numeric) ? numeric : text;
    }
    if (schemaType === "float" || schemaType === "double") {
        const numeric = Number(text);
        return Number.isFinite(numeric) ? numeric : text;
    }
    if (schemaType === "bool") {
        if (text === "1" || /^true$/i.test(text)) return true;
        if (text === "0" || /^false$/i.test(text)) return false;
        return text;
    }
    return parseJsonish(text);
}

function mapRowWithSchema(row, schemaEntry, rowIndex) {
    const schemaMembers = schemaEntry.schema_members || [];
    const hasLocalizedColumnsAfterId = schemaEntry.schema_member_count_plus_two_matches_table_columns === true;
    const directMapping = schemaEntry.schema_member_count_matches_table_columns === true;
    const record = {
        __meta: {
            row_index: rowIndex,
            raw_column_count: row.length,
            mapping_mode: hasLocalizedColumnsAfterId
                ? "id_plus_localized_columns_after_id"
                : (directMapping ? "direct_schema_columns" : "partial_schema_columns"),
            localized_name: hasLocalizedColumnsAfterId ? (row[1] || null) : null,
            localized_description: hasLocalizedColumnsAfterId ? (row[2] || null) : null
        }
    };

    if (hasLocalizedColumnsAfterId && schemaMembers.length > 0) {
        const idMember = schemaMembers[0];
        record[idMember.name] = parseBySchemaType(row[0], idMember.type);
        for (let index = 1; index < schemaMembers.length; index += 1) {
            const member = schemaMembers[index];
            record[member.name] = parseBySchemaType(row[index + 2], member.type);
        }
        return record;
    }

    schemaMembers.forEach((member, index) => {
        record[member.name] = parseBySchemaType(row[index], member.type);
    });
    return record;
}

function buildNamedTable(schemaEntry, tablesDir) {
    const rows = parseTableRows(tablesDir, schemaEntry.table_file);
    return {
        type_name: schemaEntry.type_name,
        table_file: schemaEntry.table_file,
        row_count: rows.length,
        mapping_mode: schemaEntry.schema_member_count_plus_two_matches_table_columns
            ? "id_plus_localized_columns_after_id"
            : (schemaEntry.schema_member_count_matches_table_columns ? "direct_schema_columns" : "partial_schema_columns"),
        schema_members: schemaEntry.schema_members || [],
        records: rows.map((row, rowIndex) => mapRowWithSchema(row, schemaEntry, rowIndex))
    };
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

function summarizeItemRecords(itemRecords) {
    const collectibleItems = itemRecords.filter((record) => {
        const typeIds = Array.isArray(record.item_type_id) ? record.item_type_id : [];
        return typeIds.some((typeId) => Number(typeId) >= 101 && Number(typeId) <= 399);
    });
    const qualityCounts = {};
    const typeCounts = {};
    const baseValueByQuality = {};
    collectibleItems.forEach((record) => {
        addCount(qualityCounts, record.item_quality);
        (Array.isArray(record.item_type_id) ? record.item_type_id : []).forEach((typeId) => {
            if (Number(typeId) >= 101 && Number(typeId) <= 399) addCount(typeCounts, typeId);
        });
        if (Number.isFinite(record.base_value)) {
            const quality = String(record.item_quality ?? "unknown");
            if (!Array.isArray(baseValueByQuality[quality])) baseValueByQuality[quality] = [];
            baseValueByQuality[quality].push(record.base_value);
        }
    });
    const baseValueStatsByQuality = {};
    Object.entries(baseValueByQuality).forEach(([quality, values]) => {
        const sorted = values.slice().sort((a, b) => a - b);
        baseValueStatsByQuality[quality] = {
            count: sorted.length,
            min: sorted[0] ?? null,
            p50: percentile(sorted, 0.5),
            p90: percentile(sorted, 0.9),
            max: sorted[sorted.length - 1] ?? null
        };
    });
    return {
        item_count: itemRecords.length,
        collectible_item_count: collectibleItems.length,
        quality_counts: qualityCounts,
        item_type_counts: typeCounts,
        base_value_by_quality: baseValueStatsByQuality,
        samples: collectibleItems.slice(0, 20).map((record) => ({
            id: record.id,
            localized_name: record.__meta.localized_name,
            localized_description: record.__meta.localized_description,
            item_type_id: record.item_type_id,
            item_quality: record.item_quality,
            base_value: record.base_value,
            grid_count: record.grid_count,
            auction_baseprice: record.auction_baseprice,
            collection_coin: record.collection_coin
        }))
    };
}

function summarizeMapRecords(mapRecords, bidMapRecords, rankMapRecords, rankAiRecords) {
    const bidMapsByParent = {};
    bidMapRecords.forEach((record) => {
        if (!Array.isArray(bidMapsByParent[record.parent_map_id])) bidMapsByParent[record.parent_map_id] = [];
        bidMapsByParent[record.parent_map_id].push(record);
    });
    const rankMapsById = Object.fromEntries(rankMapRecords.map((record) => [record.id, record]));
    const rankAiByRole = {};
    rankAiRecords.forEach((record) => {
        if (!Array.isArray(rankAiByRole[record.role_id])) rankAiByRole[record.role_id] = [];
        rankAiByRole[record.role_id].push(record);
    });
    return mapRecords
        .filter((record) => Number.isFinite(record.entrust_bidmap) && record.entrust_bidmap > 0 && Array.isArray(record.entrust_num))
        .map((record) => {
            const bidMaps = bidMapsByParent[record.id] || [];
            const rootRankMap = rankMapsById[record.entrust_bidmap] || null;
            return {
                map_id: record.id,
                map_name_key: record.map_name,
                map_icon: record.map_icon,
                auction_limit_notify: record.auction_limit_notify,
                entrust_value: record.entrust_value,
                entrust_bidmap: record.entrust_bidmap,
                entrust_cost: record.entrust_cost,
                entrust_num: record.entrust_num,
                is_open: record.is_open,
                mapgroup: record.mapgroup,
                world_process: record.world_process,
                bidmap_count: bidMaps.length,
                bidmap_samples: bidMaps.slice(0, 8).map((bidMap) => ({
                    id: bidMap.id,
                    localized_name: bidMap.__meta.localized_name,
                    parent_map_id: bidMap.parent_map_id,
                    map_group: bidMap.map_group,
                    map_cell: bidMap.map_cell,
                    map_time: bidMap.map_time,
                    drop_group_id: bidMap.drop_group_id,
                    bidder_number: bidMap.bidder_number,
                    auction_rounds_rate: bidMap.auction_rounds_rate,
                    map_random_skill: bidMap.map_random_skill
                })),
                root_rank_map: rootRankMap ? {
                    id: rootRankMap.id,
                    localized_name: rootRankMap.__meta.localized_name,
                    match_time: rootRankMap.match_time,
                    role_spawn: rootRankMap.role_spawn,
                    min_bid_range: rootRankMap.min_bid_range,
                    bid_type: rootRankMap.bid_type
                } : null,
                rank_ai_rows_for_map: (rankAiByRole[record.id] || []).length
            };
        });
}

function summarizeSkillRecords(skillRecords, heroRecords) {
    const revealPattern = /显示|揭示|扫描|透视|轮廓|品质|总价值|总格数/;
    const revealSkills = skillRecords.filter((record) => (
        revealPattern.test(String(record.__meta.localized_name || ""))
        || revealPattern.test(String(record.__meta.localized_description || ""))
        || revealPattern.test(String(record.skilldesc || ""))
    ));
    return {
        skill_count: skillRecords.length,
        hero_count: heroRecords.length,
        reveal_or_scan_skill_count: revealSkills.length,
        reveal_or_scan_skill_samples: revealSkills.slice(0, 30).map((record) => ({
            id: record.id,
            localized_name: record.__meta.localized_name,
            localized_description: record.__meta.localized_description,
            skill_group: record.skill_group,
            skill_type: record.skill_type,
            skilltarget: record.skilltarget,
            skilltargetvalue: record.skilltargetvalue,
            skill_count_type: record.skill_count_type,
            skill_count: record.skill_count,
            skilleffect_position: record.skilleffect_position,
            skill_value: record.skill_value,
            skill_round: record.skill_round,
            skill_CD: record.skill_CD
        })),
        hero_samples: heroRecords.slice(0, 20).map((record) => ({
            id: record.id,
            localized_name: record.__meta.localized_name,
            localized_description: record.__meta.localized_description,
            name_key: record.name,
            gender: record.gender,
            cast_type: record.cast_type,
            access: record.access,
            voices: record.voices,
            hero_tag: record.hero_tag,
            hero_task_group: record.hero_task_group
        }))
    };
}

function buildSchemaBackedMechanics(namedTables) {
    const getRecords = (typeName) => (namedTables[typeName] ? namedTables[typeName].records : []);
    return {
        map_mechanics: summarizeMapRecords(
            getRecords("Table_Map"),
            getRecords("Table_BidMap"),
            getRecords("Table_RankMap"),
            getRecords("Table_RankAi")
        ),
        item_summary: summarizeItemRecords(getRecords("Table_Item")),
        skill_and_hero_summary: summarizeSkillRecords(getRecords("Table_Skill"), getRecords("Table_Hero")),
        schema_field_corrections: [
            {
                previous_alias: "RankMap.item_count_distribution",
                schema_backed_field: "Table_RankMap.match_time",
                status: "renamed_for_review"
            },
            {
                previous_alias: "RankMap.item_type_weights",
                schema_backed_field: "Table_RankMap.role_spawn",
                status: "renamed_for_review"
            },
            {
                previous_alias: "RankMap.value_distribution",
                schema_backed_field: "Table_RankMap.min_bid_range",
                status: "renamed_for_review"
            },
            {
                previous_alias: "RankAi.bid_price_distribution",
                schema_backed_field: "Table_RankAi.min_bid_ratio",
                status: "renamed_for_review"
            }
        ]
    };
}

function buildBidKingSchemaBackedTableReport({
    tablesDir = DEFAULT_TABLES_DIR,
    schemaMetadataReportPath = DEFAULT_SCHEMA_METADATA_REPORT_PATH
} = {}) {
    const schemaMetadataReport = readJson(schemaMetadataReportPath);
    const schemaEntries = (schemaMetadataReport.table_type_schemas || [])
        .filter((entry) => KEY_TABLE_TYPES.includes(entry.type_name));
    const namedTables = {};
    schemaEntries.forEach((entry) => {
        namedTables[entry.type_name] = buildNamedTable(entry, tablesDir);
    });
    const mappingModes = {};
    Object.values(namedTables).forEach((table) => addCount(mappingModes, table.mapping_mode));
    const mechanics = buildSchemaBackedMechanics(namedTables);

    return {
        schema_version: "ak_bidking_schema_backed_tables_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        inputs: {
            tables_dir: tablesDir,
            schema_metadata_report_path: schemaMetadataReportPath
        },
        summary: {
            parse_status: "schema_backed_named_records_built",
            evidence_confidence: "medium_high",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            shadow_candidate_allowed: false,
            named_table_count: Object.keys(namedTables).length,
            total_named_record_count: Object.values(namedTables).reduce((sum, table) => sum + table.row_count, 0),
            mapping_modes: mappingModes,
            auction_map_count: mechanics.map_mechanics.length,
            collectible_item_count: mechanics.item_summary.collectible_item_count,
            reveal_or_scan_skill_count: mechanics.skill_and_hero_summary.reveal_or_scan_skill_count,
            schema_field_correction_count: mechanics.schema_field_corrections.length
        },
        named_tables: namedTables,
        schema_backed_mechanics: mechanics,
        refactor_impact: {
            recommended_change_class: "RESEARCH_ONLY",
            live_path_touched: false,
            useful_now: [
                "named table records remove most anonymous-column ambiguity from BidKing tables",
                "schema-backed field corrections prevent premature refactor using wrong aliases",
                "shadow candidate generation can now consume named records after manual review"
            ],
            blockers_before_model_change: [
                "manual review must approve schema-backed field semantics",
                "current app map ids must be aligned to BidKing map/bidmap ids",
                "shadow replay must pass before default config or estimator changes",
                "authority handoff remains blocked while any review gate is pending"
            ]
        }
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatBidKingSchemaBackedTableMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const mechanics = report.schema_backed_mechanics || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const tableRows = Object.values(report.named_tables || {}).map((table) => (
        `| ${markdownCell(table.type_name)} | ${markdownCell(table.table_file)} | ${markdownCell(table.row_count)} | ${markdownCell(table.mapping_mode)} |`
    )).join("\n");
    const mapRows = (mechanics.map_mechanics || []).map((entry) => (
        `| ${markdownCell(entry.map_id)} | ${markdownCell(entry.entrust_bidmap)} | ${markdownCell(JSON.stringify(entry.entrust_num))} | ${markdownCell(entry.bidmap_count)} | ${markdownCell(entry.rank_ai_rows_for_map)} |`
    )).join("\n");
    const correctionRows = (mechanics.schema_field_corrections || []).map((entry) => (
        `| ${markdownCell(entry.previous_alias)} | ${markdownCell(entry.schema_backed_field)} | ${markdownCell(entry.status)} |`
    )).join("\n");

    return `# BidKing schema-backed table report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Tables: \`${report.inputs ? report.inputs.tables_dir : "-"}\`
- Schema metadata: \`${report.inputs ? report.inputs.schema_metadata_report_path : "-"}\`
- Parse status: \`${summary.parse_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${summary.shadow_candidate_allowed === true}\`
- Live/order/funds path touched: \`${report.refactor_impact && report.refactor_impact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| named tables | \`${summary.named_table_count ?? 0}\` |
| named records | \`${summary.total_named_record_count ?? 0}\` |
| mapping modes | ${markdownCell(JSON.stringify(summary.mapping_modes || {}))} |
| auction maps | \`${summary.auction_map_count ?? 0}\` |
| collectible items | \`${summary.collectible_item_count ?? 0}\` |
| reveal/scan skills | \`${summary.reveal_or_scan_skill_count ?? 0}\` |
| schema field corrections | \`${summary.schema_field_correction_count ?? 0}\` |

## Named Tables

| type | table | rows | mapping mode |
| --- | --- | --- | --- |
${tableRows || "| - | - | - | - |"}

## Auction Map Mechanics

| map id | entrust bidmap | entrust num | bidmap count | rank AI rows |
| --- | --- | --- | --- | --- |
${mapRows || "| - | - | - | - | - |"}

## Field Corrections

| previous alias | schema-backed field | status |
| --- | --- | --- |
${correctionRows || "| - | - | - |"}

## Conclusion

The BidKing table records are now schema-backed and named. This is a stronger parse layer for manual review and later shadow-candidate generation, but it still does not authorize default config or estimator changes.
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
    const { tablesDir, schemaMetadataReportPath, outputPath } = resolveArgs(argv);
    const report = buildBidKingSchemaBackedTableReport({ tablesDir, schemaMetadataReportPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingSchemaBackedTableMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SCHEMA_METADATA_REPORT_PATH,
    DEFAULT_TABLES_DIR,
    buildBidKingSchemaBackedTableReport,
    buildNamedTable,
    formatBidKingSchemaBackedTableMarkdown,
    main,
    mapRowWithSchema,
    parseBySchemaType,
    resolveArgs
};
