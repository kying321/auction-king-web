const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TABLES_DIR = process.env.BIDKING_TABLES_DIR || path.join(ROOT_DIR, "external", "BidKing_zip_extract_min", "Tables");
const DEFAULT_HOT_UPDATE_DLL_PATH = process.env.BIDKING_HOT_UPDATE_DLL_PATH || path.join(ROOT_DIR, "external", "BidKing_zip_extract_min", "dll", "Scripts.dll.bytes");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-mechanics-report.json"
);

const KEY_TABLES = [
    "Map",
    "BidMap",
    "RankMap",
    "RankAi",
    "Drop",
    "Item",
    "Skill",
    "Hero",
    "Condition",
    "Sim",
    "BattleItem",
    "Constant"
];

const HOT_UPDATE_METHOD_MARKERS = [
    "GameBid",
    "RoomGameBid",
    "SimGameBidPrice",
    "AuctionHouseBidPrice",
    "ParseItemPrice",
    "CreateSimGame",
    "InitSimGame",
    "DoDrop",
    "InitAuctionItems",
    "GetRoundSkills",
    "GetItemSkills",
    "GetHeroSkills",
    "DealSkillEffect",
    "DealRoundSkill",
    "DealPlayerSkill"
];

const PROTOCOL_MARKERS = [
    "C2S_34_GAME_BID",
    "C2S_126_SIM_GAME_BID_PRICE",
    "C2S_188_ROOM_GAME_BID",
    "C2S_280_AUCTION_HOUSE_BID_PRICE",
    "C2S34GameBid",
    "C2S126SimGameBidPrice",
    "C2S188RoomGameBid",
    "C2S280AuctionHouseBidPrice"
];

const TABLE_CLASS_MARKERS = [
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
    "Table_Sim"
];

const SOURCE_FILE_MARKERS = [
    "Auctionhouse.cs",
    "Simgame.cs",
    "GameLogic.cs",
    "Table_Map.cs",
    "Table_BidMap.cs",
    "Table_RankMap.cs",
    "Table_RankAi.cs",
    "Table_Drop.cs",
    "Table_Item.cs",
    "Table_Skill.cs",
    "Table_Hero.cs"
];

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        tablesDir: argv[0] ? path.resolve(argv[0]) : DEFAULT_TABLES_DIR,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH,
        hotUpdateDllPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_HOT_UPDATE_DLL_PATH
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fileExists(filePath) {
    return !!filePath && fs.existsSync(filePath);
}

function readText(filePath) {
    return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function parseMaybeJsonField(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
        try {
            return JSON.parse(text);
        } catch (_error) {
            return text;
        }
    }
    const numberValue = Number(text);
    return Number.isFinite(numberValue) && /^-?\d+(\.\d+)?$/.test(text) ? numberValue : text;
}

function parseNumber(value) {
    const numberValue = Number(String(value ?? "").trim());
    return Number.isFinite(numberValue) ? numberValue : null;
}

function parseTableRows(tablesDir, tableName) {
    const filePath = path.join(tablesDir, `${tableName}.txt`);
    if (!fileExists(filePath)) return [];
    return readText(filePath)
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .map((line) => line.split("\t"));
}

function columnDistribution(rows) {
    const counts = {};
    rows.forEach((row) => {
        counts[row.length] = (counts[row.length] || 0) + 1;
    });
    return counts;
}

function summarizeTableInventory(tablesDir) {
    const files = fileExists(tablesDir)
        ? fs.readdirSync(tablesDir).filter((name) => /\.txt$/i.test(name)).sort()
        : [];
    const tables = {};
    KEY_TABLES.forEach((tableName) => {
        const rows = parseTableRows(tablesDir, tableName);
        tables[tableName] = {
            exists: rows.length > 0,
            row_count: rows.length,
            column_distribution: columnDistribution(rows),
            first_row_sample: rows[0] ? rows[0].slice(0, 12) : []
        };
    });
    return {
        source_path: tablesDir,
        txt_file_count: files.length,
        txt_files: files,
        key_tables: tables
    };
}

function sortedNumericEntries(objectValue) {
    return Object.entries(objectValue)
        .map(([key, value]) => [Number(key), value])
        .filter(([key]) => Number.isFinite(key))
        .sort((a, b) => a[0] - b[0]);
}

function addCount(target, key, increment = 1) {
    const safeKey = String(key ?? "unknown");
    target[safeKey] = (target[safeKey] || 0) + increment;
}

function summarizeWeightedPairs(pairs, limit = 10) {
    if (!Array.isArray(pairs)) {
        return {
            total_weight: 0,
            entry_count: 0,
            top_entries: []
        };
    }
    const normalized = pairs
        .filter((entry) => Array.isArray(entry) && entry.length >= 2)
        .map((entry) => ({
            key: entry[0],
            weight: Number(entry[entry.length - 1]) || 0,
            raw: entry
        }));
    return {
        total_weight: normalized.reduce((sum, entry) => sum + entry.weight, 0),
        entry_count: normalized.length,
        top_entries: normalized
            .sort((a, b) => b.weight - a.weight)
            .slice(0, limit)
            .map((entry) => entry.raw)
    };
}

function summarizeWeightedRanges(ranges, limit = 8) {
    if (!Array.isArray(ranges)) {
        return {
            total_weight: 0,
            range_count: 0,
            min_low: null,
            max_high: null,
            top_ranges: []
        };
    }
    const normalized = ranges
        .filter((entry) => Array.isArray(entry) && entry.length >= 3)
        .map((entry) => ({
            low: Number(entry[0]),
            high: Number(entry[1]),
            weight: Number(entry[2]) || 0,
            raw: entry
        }))
        .filter((entry) => Number.isFinite(entry.low) && Number.isFinite(entry.high));
    return {
        total_weight: normalized.reduce((sum, entry) => sum + entry.weight, 0),
        range_count: normalized.length,
        min_low: normalized.length ? Math.min(...normalized.map((entry) => entry.low)) : null,
        max_high: normalized.length ? Math.max(...normalized.map((entry) => entry.high)) : null,
        top_ranges: normalized
            .sort((a, b) => b.weight - a.weight)
            .slice(0, limit)
            .map((entry) => entry.raw)
    };
}

function parseMaps(rows) {
    return rows
        .map((row) => ({
            map_id: parseNumber(row[0]),
            name_key: row[3] || null,
            desc_key: row[4] || null,
            map_image: row[6] || null,
            unlock_cost: parseNumber(row[7]),
            start_money_or_budget: parseNumber(row[8]),
            bidmap_root_id: parseNumber(row[9]),
            entry_reward_or_cost: parseMaybeJsonField(row[10]),
            item_count_range: parseMaybeJsonField(row[13]),
            unlock_map_ref: parseNumber(row[15]),
            difficulty_tier: parseNumber(row[16])
        }))
        .filter((entry) => Number.isFinite(entry.map_id));
}

function parseBidMaps(rows) {
    return rows
        .map((row) => ({
            bidmap_id: parseNumber(row[0]),
            label: row[1] || null,
            description: row[2] || null,
            parent_map_id: parseNumber(row[7]),
            sibling_roll_weights: parseMaybeJsonField(row[8]),
            value_band_label: row[9] ? row[9].trim() : null,
            value_band_floor_hint: parseNumber(row[10]),
            cost_or_floor_vector: parseMaybeJsonField(row[11]),
            forced_drop_refs: parseMaybeJsonField(row[12]),
            quality_or_round_vector: parseMaybeJsonField(row[13]),
            value_cap_distribution: parseMaybeJsonField(row[14]),
            bid_count_contract: parseMaybeJsonField(row[16]),
            round_count_hint: parseNumber(row[17]),
            bid_ladder: parseMaybeJsonField(row[18]),
            skill_or_ai_hints: parseMaybeJsonField(row[19]),
            icon: row[20] || null
        }))
        .filter((entry) => Number.isFinite(entry.bidmap_id));
}

function parseRankMaps(rows, bidMapsById = {}) {
    return rows
        .map((row) => {
            const bidmapId = parseNumber(row[0]);
            return {
                bidmap_id: bidmapId,
                label: row[1] || null,
                description: row[2] || null,
                parent_map_id: bidMapsById[bidmapId] ? bidMapsById[bidmapId].parent_map_id : null,
                item_count_distribution: parseMaybeJsonField(row[3]),
                item_type_weights: parseMaybeJsonField(row[4]),
                value_distribution: parseMaybeJsonField(row[5]),
                price_curve_params: parseMaybeJsonField(row[6])
            };
        })
        .filter((entry) => Number.isFinite(entry.bidmap_id));
}

function parseRankAi(rows) {
    return rows
        .map((row) => ({
            rank_ai_id: parseNumber(row[0]),
            map_id: parseNumber(row[3]),
            rank: parseNumber(row[4]),
            bid_price_distribution: parseMaybeJsonField(row[5]),
            base_budget_or_pressure: parseNumber(row[6]),
            skill_pool_weights: parseMaybeJsonField(row[7]),
            item_count_distribution: parseMaybeJsonField(row[8]),
            value_distribution: parseMaybeJsonField(row[9])
        }))
        .filter((entry) => Number.isFinite(entry.rank_ai_id));
}

function parseDrops(rows) {
    return rows
        .map((row) => ({
            drop_id: parseNumber(row[0]),
            label: row[1] || row[2] || null,
            drop_type: parseNumber(row[3]),
            entries: parseMaybeJsonField(row[4])
        }))
        .filter((entry) => Number.isFinite(entry.drop_id));
}

function parseItems(rows) {
    return rows
        .map((row) => ({
            item_id: parseNumber(row[0]),
            name: row[1] || null,
            description: row[2] || null,
            type_tags: parseMaybeJsonField(row[6]),
            slot_or_shape_hint: parseNumber(row[7]),
            quality: parseNumber(row[8]),
            base_price: parseNumber(row[9]),
            price_band: parseMaybeJsonField(row[16]),
            grid_size_or_space: parseNumber(row[18]),
            icon: row[24] || null,
            icon_group: row[25] || null,
            normalized_price_hint: parseNumber(row[26]),
            catalog_tags: parseMaybeJsonField(row[30]),
            sale_limit_or_unlock: parseMaybeJsonField(row[31]),
            geometry: row[33] || null
        }))
        .filter((entry) => Number.isFinite(entry.item_id));
}

function parseSkills(rows) {
    return rows
        .map((row) => ({
            skill_id: parseNumber(row[0]),
            label: row[1] || null,
            description: row[2] || null,
            target_quality_mode: parseNumber(row[8]),
            target_quality_list: parseMaybeJsonField(row[9]),
            target_item_type_mode: parseNumber(row[10]),
            target_item_type_list: parseMaybeJsonField(row[11]),
            reveal_count: parseNumber(row[15]),
            skill_effect_groups: parseMaybeJsonField(row[16]),
            rarity_or_level: parseNumber(row[17]),
            cost_or_condition: parseMaybeJsonField(row[23])
        }))
        .filter((entry) => Number.isFinite(entry.skill_id));
}

function parseHeroes(rows) {
    return rows
        .map((row) => ({
            hero_id: parseNumber(row[0]),
            label: row[1] || null,
            description: row[2] || null,
            skill_ids: parseMaybeJsonField(row[10]),
            item_type_focus: parseMaybeJsonField(row[17]),
            hero_table_ref: parseNumber(row[18])
        }))
        .filter((entry) => Number.isFinite(entry.hero_id));
}

function buildMapMechanics(maps, bidMaps, rankMaps, rankAiEntries) {
    const bidMapsByMap = {};
    bidMaps.forEach((entry) => {
        if (!Array.isArray(bidMapsByMap[entry.parent_map_id])) bidMapsByMap[entry.parent_map_id] = [];
        bidMapsByMap[entry.parent_map_id].push(entry.bidmap_id);
    });
    const rankMapsByMap = {};
    rankMaps.forEach((entry) => {
        const mapId = entry.parent_map_id || "unknown";
        if (!Array.isArray(rankMapsByMap[mapId])) rankMapsByMap[mapId] = [];
        rankMapsByMap[mapId].push(entry);
    });
    const rankAiByMap = {};
    rankAiEntries.forEach((entry) => {
        if (!Array.isArray(rankAiByMap[entry.map_id])) rankAiByMap[entry.map_id] = [];
        rankAiByMap[entry.map_id].push(entry);
    });

    return maps
        .filter((entry) => Number.isFinite(entry.bidmap_root_id) && entry.bidmap_root_id > 0 && Array.isArray(entry.item_count_range))
        .map((entry) => {
            const rankEntries = rankMapsByMap[entry.map_id] || [];
            return {
                map_id: entry.map_id,
                bidmap_root_id: entry.bidmap_root_id,
                map_image: entry.map_image,
                unlock_cost: entry.unlock_cost,
                start_money_or_budget: entry.start_money_or_budget,
                item_count_range: entry.item_count_range,
                difficulty_tier: entry.difficulty_tier,
                bidmap_count: (bidMapsByMap[entry.map_id] || []).length,
                bidmap_ids: (bidMapsByMap[entry.map_id] || []).slice(0, 20),
                rank_ai_rank_count: (rankAiByMap[entry.map_id] || []).length,
                rank_map_count_distribution_samples: rankEntries.slice(0, 3).map((rankEntry) => ({
                    bidmap_id: rankEntry.bidmap_id,
                    label: rankEntry.label,
                    count_distribution: rankEntry.item_count_distribution,
                    count_distribution_summary: summarizeWeightedRanges(rankEntry.item_count_distribution),
                    value_distribution_summary: summarizeWeightedRanges(rankEntry.value_distribution)
                }))
            };
        });
}

function buildRankMapSummary(rankMaps) {
    const byParentMap = {};
    const samples = [];
    rankMaps.forEach((entry) => {
        const mapId = entry.parent_map_id || "unknown";
        if (!byParentMap[mapId]) {
            byParentMap[mapId] = {
                map_id: mapId,
                rank_map_count: 0,
                count_distribution_shapes: {},
                value_distribution_min: null,
                value_distribution_max: null,
                top_item_type_weight_samples: []
            };
        }
        const bucket = byParentMap[mapId];
        bucket.rank_map_count += 1;
        const countShape = JSON.stringify(entry.item_count_distribution);
        addCount(bucket.count_distribution_shapes, countShape);
        const valueSummary = summarizeWeightedRanges(entry.value_distribution);
        if (valueSummary.min_low !== null) {
            bucket.value_distribution_min = bucket.value_distribution_min === null
                ? valueSummary.min_low
                : Math.min(bucket.value_distribution_min, valueSummary.min_low);
            bucket.value_distribution_max = bucket.value_distribution_max === null
                ? valueSummary.max_high
                : Math.max(bucket.value_distribution_max, valueSummary.max_high);
        }
        if (bucket.top_item_type_weight_samples.length < 5) {
            bucket.top_item_type_weight_samples.push({
                bidmap_id: entry.bidmap_id,
                label: entry.label,
                top_item_type_weights: summarizeWeightedPairs(entry.item_type_weights).top_entries
            });
        }
        if (samples.length < 12) {
            samples.push({
                bidmap_id: entry.bidmap_id,
                label: entry.label,
                parent_map_id: entry.parent_map_id,
                count_distribution: entry.item_count_distribution,
                item_type_weight_summary: summarizeWeightedPairs(entry.item_type_weights),
                value_distribution_summary: summarizeWeightedRanges(entry.value_distribution)
            });
        }
    });

    return {
        row_count: rankMaps.length,
        by_parent_map: Object.fromEntries(sortedNumericEntries(byParentMap)),
        samples
    };
}

function buildDropSummary(drops) {
    const qualityLikeGroups = drops.filter((entry) => /品质\d+/.test(String(entry.label || "")));
    const byQuality = {};
    qualityLikeGroups.forEach((entry) => {
        const match = String(entry.label || "").match(/品质(\d+)/);
        const quality = match ? match[1] : "unknown";
        addCount(byQuality, quality);
    });
    return {
        row_count: drops.length,
        quality_like_group_count: qualityLikeGroups.length,
        quality_like_group_counts: byQuality,
        samples: qualityLikeGroups.slice(0, 10).map((entry) => ({
            drop_id: entry.drop_id,
            label: entry.label,
            drop_type: entry.drop_type,
            entry_count: Array.isArray(entry.entries) ? entry.entries.length : 0,
            weight_summary: summarizeWeightedPairs(entry.entries)
        }))
    };
}

function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * ratio)));
    return sortedValues[index];
}

function buildItemSummary(items) {
    const collectibleItems = items.filter((entry) => {
        const tags = Array.isArray(entry.type_tags) ? entry.type_tags : [];
        return tags.some((tag) => Number(tag) >= 101 && Number(tag) <= 399);
    });
    const byQuality = {};
    const byType = {};
    const priceByQuality = {};
    collectibleItems.forEach((entry) => {
        addCount(byQuality, entry.quality);
        (Array.isArray(entry.type_tags) ? entry.type_tags : []).forEach((tag) => {
            if (Number(tag) >= 101 && Number(tag) <= 399) addCount(byType, tag);
        });
        if (Number.isFinite(entry.base_price)) {
            const quality = String(entry.quality ?? "unknown");
            if (!Array.isArray(priceByQuality[quality])) priceByQuality[quality] = [];
            priceByQuality[quality].push(entry.base_price);
        }
    });
    const priceStatsByQuality = {};
    Object.entries(priceByQuality).forEach(([quality, values]) => {
        const sorted = values.slice().sort((a, b) => a - b);
        priceStatsByQuality[quality] = {
            count: sorted.length,
            min: sorted[0] ?? null,
            p50: percentile(sorted, 0.5),
            p90: percentile(sorted, 0.9),
            max: sorted[sorted.length - 1] ?? null
        };
    });
    return {
        row_count: items.length,
        collectible_item_count: collectibleItems.length,
        quality_counts: Object.fromEntries(sortedNumericEntries(byQuality)),
        item_type_counts: Object.fromEntries(sortedNumericEntries(byType)),
        base_price_by_quality: Object.fromEntries(sortedNumericEntries(priceStatsByQuality)),
        samples: collectibleItems.slice(0, 12).map((entry) => ({
            item_id: entry.item_id,
            name: entry.name,
            type_tags: entry.type_tags,
            quality: entry.quality,
            base_price: entry.base_price,
            grid_size_or_space: entry.grid_size_or_space,
            catalog_tags: entry.catalog_tags
        }))
    };
}

function buildSkillSummary(skills, heroes) {
    const revealSkills = skills.filter((entry) => /显示|揭示|扫描|透视|轮廓|品质|总价值|总格数/.test(String(entry.description || entry.label || "")));
    return {
        skill_row_count: skills.length,
        hero_row_count: heroes.length,
        reveal_or_scan_skill_count: revealSkills.length,
        reveal_or_scan_samples: revealSkills.slice(0, 20).map((entry) => ({
            skill_id: entry.skill_id,
            label: entry.label,
            description: entry.description,
            target_quality_list: entry.target_quality_list,
            reveal_count: entry.reveal_count,
            skill_effect_groups: entry.skill_effect_groups,
            rarity_or_level: entry.rarity_or_level
        })),
        hero_samples: heroes.slice(0, 20).map((entry) => ({
            hero_id: entry.hero_id,
            label: entry.label,
            description: entry.description,
            skill_ids: entry.skill_ids,
            item_type_focus: entry.item_type_focus
        }))
    };
}

function extractAsciiStrings(filePath, minLength = 4) {
    if (!fileExists(filePath)) return [];
    const buffer = fs.readFileSync(filePath);
    const results = [];
    let current = "";
    for (const byte of buffer) {
        if (byte >= 32 && byte <= 126) {
            current += String.fromCharCode(byte);
            continue;
        }
        if (current.length >= minLength) results.push(current);
        current = "";
    }
    if (current.length >= minLength) results.push(current);
    return Array.from(new Set(results));
}

function collectMatchingStrings(strings, markers) {
    return markers.filter((marker) => strings.some((value) => value.includes(marker)));
}

function buildHotUpdateEvidence(hotUpdateDllPath) {
    const dllStrings = extractAsciiStrings(hotUpdateDllPath);
    const pdbPath = hotUpdateDllPath.replace(/Scripts\.dll\.bytes$/i, "Scripts.pdb.bytes");
    const pdbStrings = extractAsciiStrings(pdbPath);
    const allStrings = Array.from(new Set([...dllStrings, ...pdbStrings]));
    return {
        hot_update_dll_path: hotUpdateDllPath,
        hot_update_dll_exists: fileExists(hotUpdateDllPath),
        pdb_path: pdbPath,
        pdb_exists: fileExists(pdbPath),
        method_markers_found: collectMatchingStrings(allStrings, HOT_UPDATE_METHOD_MARKERS),
        protocol_markers_found: collectMatchingStrings(allStrings, PROTOCOL_MARKERS),
        table_class_markers_found: collectMatchingStrings(allStrings, TABLE_CLASS_MARKERS),
        source_file_markers_found: collectMatchingStrings(allStrings, SOURCE_FILE_MARKERS),
        sampled_bid_related_strings: allStrings
            .filter((value) => /Bid|Auction|SimGame|RankMap|Drop|Table_Item|GameLogic/.test(value))
            .slice(0, 80)
    };
}

function buildCandidateMapAlignment(bidMaps) {
    const byId = Object.fromEntries(bidMaps.map((entry) => [entry.bidmap_id, entry]));
    return [
        {
            current_map_id: "villa",
            bidking_map_id_candidate: 104,
            bidking_bidmap_root_candidate: 2401,
            evidence_labels: [2401, 2407].map((id) => byId[id]).filter(Boolean).map((entry) => entry.label),
            confidence: "medium",
            blocker: "manual confirmation required before config mapping"
        },
        {
            current_map_id: "sunken_ship",
            bidking_map_id_candidate: 105,
            bidking_bidmap_root_candidate: 2501,
            evidence_labels: [2501, 2507].map((id) => byId[id]).filter(Boolean).map((entry) => entry.label),
            confidence: "medium",
            blocker: "manual confirmation required before config mapping"
        },
        {
            current_map_id: "shipping",
            bidking_map_id_candidate: 103,
            bidking_bidmap_root_candidate: 2301,
            evidence_labels: [2301].map((id) => byId[id]).filter(Boolean).map((entry) => entry.label),
            confidence: "low_medium",
            blocker: "label overlap is weaker than villa/sunken_ship; requires screenshot or manual label alignment"
        }
    ];
}

function buildRefactorImpact() {
    return {
        recommended_change_class: "RESEARCH_ONLY",
        live_path_touched: false,
        default_config_update_allowed: false,
        core_refactor_recommended_now: false,
        core_refactor_candidate_identified: true,
        position: "official tables expose map count priors, item type weights, value ranges, drop groups, item quality/price fields, skill/hero reveal semantics, and bid protocol markers; refactor should consume reviewed artifacts rather than hard-coded heuristic priors",
        proposed_source_lane: [
            "bidking_zip_inventory",
            "bidking_table_mechanics",
            "manual_mechanics_review",
            "shadow_replay_candidate",
            "authority_handoff_gate"
        ],
        blockers_before_model_change: [
            "confirm table column names against decompiled Table_*.cs or runtime behavior",
            "confirm current map ids map to BidKing map/bidmap ids",
            "turn table distributions into a reviewed candidate config without replacing current defaults",
            "pass replay gates on same-battle human-labeled samples",
            "explicit human approval before authority merge"
        ]
    };
}

function buildBidKingTableMechanicsReport({
    tablesDir = DEFAULT_TABLES_DIR,
    hotUpdateDllPath = DEFAULT_HOT_UPDATE_DLL_PATH
} = {}) {
    const inventory = summarizeTableInventory(tablesDir);
    const maps = parseMaps(parseTableRows(tablesDir, "Map"));
    const bidMaps = parseBidMaps(parseTableRows(tablesDir, "BidMap"));
    const bidMapsById = Object.fromEntries(bidMaps.map((entry) => [entry.bidmap_id, entry]));
    const rankMaps = parseRankMaps(parseTableRows(tablesDir, "RankMap"), bidMapsById);
    const rankAiEntries = parseRankAi(parseTableRows(tablesDir, "RankAi"));
    const drops = parseDrops(parseTableRows(tablesDir, "Drop"));
    const items = parseItems(parseTableRows(tablesDir, "Item"));
    const skills = parseSkills(parseTableRows(tablesDir, "Skill"));
    const heroes = parseHeroes(parseTableRows(tablesDir, "Hero"));
    const hotUpdateEvidence = buildHotUpdateEvidence(hotUpdateDllPath);
    const refactorImpact = buildRefactorImpact();
    const mapMechanics = buildMapMechanics(maps, bidMaps, rankMaps, rankAiEntries);

    return {
        schema_version: "ak_bidking_table_mechanics_v1",
        generated_at: new Date().toISOString(),
        mode: "architecture_review",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: refactorImpact.recommended_change_class,
        inputs: {
            tables_dir: tablesDir,
            hot_update_dll_path: hotUpdateDllPath
        },
        summary: {
            mechanics_recovery_status: "table_mechanics_candidate_extracted",
            evidence_confidence: "medium",
            authority_adoption_allowed: false,
            reverse_engineering_source_allowed: true,
            default_config_update_allowed: false,
            core_refactor_recommended_now: false,
            core_refactor_candidate_identified: true,
            key_table_count: Object.values(inventory.key_tables).filter((entry) => entry.exists).length,
            map_count: maps.length,
            auction_map_count: mapMechanics.length,
            bidmap_count: bidMaps.length,
            rankmap_count: rankMaps.length,
            drop_group_count: drops.length,
            item_count: items.length,
            skill_count: skills.length,
            hero_count: heroes.length,
            hot_update_method_marker_count: hotUpdateEvidence.method_markers_found.length,
            protocol_marker_count: hotUpdateEvidence.protocol_markers_found.length
        },
        table_inventory: inventory,
        mechanics: {
            maps: mapMechanics,
            bidmap_samples: bidMaps.slice(0, 20),
            rank_map_summary: buildRankMapSummary(rankMaps),
            rank_ai_samples: rankAiEntries.slice(0, 20),
            drop_summary: buildDropSummary(drops),
            item_summary: buildItemSummary(items),
            skill_and_hero_summary: buildSkillSummary(skills, heroes)
        },
        hot_update_evidence: hotUpdateEvidence,
        candidate_map_alignment: buildCandidateMapAlignment(bidMaps),
        refactor_impact: refactorImpact
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatBidKingTableMechanicsMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const mechanics = report.mechanics || {};
    const refactorImpact = report.refactor_impact || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const mapRows = Array.isArray(mechanics.maps) ? mechanics.maps.map((entry) => (
        `| ${markdownCell(entry.map_id)} | ${markdownCell(entry.bidmap_root_id)} | ${markdownCell(JSON.stringify(entry.item_count_range))} | ${markdownCell(entry.bidmap_count)} | ${markdownCell(entry.rank_ai_rank_count)} |`
    )).join("\n") : "";
    const alignmentRows = Array.isArray(report.candidate_map_alignment) ? report.candidate_map_alignment.map((entry) => (
        `| ${markdownCell(entry.current_map_id)} | ${markdownCell(entry.bidking_map_id_candidate)} | ${markdownCell(entry.bidking_bidmap_root_candidate)} | ${markdownCell((entry.evidence_labels || []).join(", "))} | ${markdownCell(entry.confidence)} | ${markdownCell(entry.blocker)} |`
    )).join("\n") : "";

    return `# BidKing table mechanics report

- Change class: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- Tables: \`${report.inputs ? report.inputs.tables_dir : "-"}\`
- Hot update DLL: \`${report.inputs ? report.inputs.hot_update_dll_path : "-"}\`
- Mechanics recovery: \`${summary.mechanics_recovery_status || "-"}\`
- Evidence confidence: \`${summary.evidence_confidence || "-"}\`
- Authority adoption allowed: \`${summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Core refactor recommended now: \`${summary.core_refactor_recommended_now === true}\`
- Core refactor candidate identified: \`${summary.core_refactor_candidate_identified === true}\`
- Live/order/funds path touched: \`${refactorImpact.live_path_touched === true}\`

## Coverage

| signal | value |
| --- | --- |
| key tables present | \`${summary.key_table_count ?? 0}\` |
| maps | \`${summary.map_count ?? 0}\` |
| auction maps with count ranges | \`${summary.auction_map_count ?? 0}\` |
| bidmaps | \`${summary.bidmap_count ?? 0}\` |
| rank maps | \`${summary.rankmap_count ?? 0}\` |
| drop groups | \`${summary.drop_group_count ?? 0}\` |
| items | \`${summary.item_count ?? 0}\` |
| skills | \`${summary.skill_count ?? 0}\` |
| heroes | \`${summary.hero_count ?? 0}\` |
| hot-update method markers | \`${summary.hot_update_method_marker_count ?? 0}\` |
| bid protocol markers | \`${summary.protocol_marker_count ?? 0}\` |

## Map Priors

| map id | bidmap root | item count range | bidmap count | rank AI rows |
| --- | --- | --- | --- | --- |
${mapRows || "| - | - | - | - | - |"}

## Candidate Map Alignment

| current map | BidKing map candidate | BidKing bidmap root | labels | confidence | blocker |
| --- | --- | --- | --- | --- | --- |
${alignmentRows || "| - | - | - | - | - | - |"}

## Refactor Position

${refactorImpact.position || "-"}

Proposed source lane: ${(refactorImpact.proposed_source_lane || []).map((item) => `\`${item}\``).join(" -> ") || "`-`"}

Blocked before model change: ${(refactorImpact.blockers_before_model_change || []).map((item) => `\`${item}\``).join(", ") || "`-`"}

## Conclusion

The extracted tables are useful enough to drive a complete mechanics candidate lane, especially for count priors, value distributions, item quality/type priors, and skill/hero observation semantics. They are not authority yet: keep them as reviewed research artifacts until schema confirmation, current-map alignment, shadow replay, and authority handoff pass.
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
    const { tablesDir, outputPath, hotUpdateDllPath } = resolveArgs(argv);
    const report = buildBidKingTableMechanicsReport({ tablesDir, hotUpdateDllPath });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingTableMechanicsMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_HOT_UPDATE_DLL_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_TABLES_DIR,
    buildBidKingTableMechanicsReport,
    buildHotUpdateEvidence,
    buildItemSummary,
    buildMapMechanics,
    buildRankMapSummary,
    formatBidKingTableMechanicsMarkdown,
    main,
    parseMaybeJsonField,
    parseTableRows,
    resolveArgs,
    summarizeTableInventory
};
