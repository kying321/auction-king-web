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
    "2026-04-29-bidking-table-backed-shadow-simulator-report.json"
);
const DEFAULT_SEED = "ak-bidking-table-shadow-v1";
const DEFAULT_SAMPLE_COUNT = 256;
const MAX_SAMPLE_COUNT = 5000;
const DEFAULT_MAX_DEPTH = 12;

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let seed = DEFAULT_SEED;
    let sampleCount = DEFAULT_SAMPLE_COUNT;
    let generatedAt = null;
    let maxDepth = DEFAULT_MAX_DEPTH;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--seed") {
            index += 1;
            if (!argv[index]) throw new Error("--seed 需要提供值");
            seed = String(argv[index]);
        } else if (arg.startsWith("--seed=")) {
            seed = arg.slice("--seed=".length);
        } else if (arg === "--sample-count") {
            index += 1;
            if (!argv[index]) throw new Error("--sample-count 需要提供整数");
            sampleCount = Number(argv[index]);
        } else if (arg.startsWith("--sample-count=")) {
            sampleCount = Number(arg.slice("--sample-count=".length));
        } else if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else if (arg === "--max-depth") {
            index += 1;
            if (!argv[index]) throw new Error("--max-depth 需要提供整数");
            maxDepth = Number(argv[index]);
        } else if (arg.startsWith("--max-depth=")) {
            maxDepth = Number(arg.slice("--max-depth=".length));
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
        seed,
        sampleCount,
        generatedAt,
        maxDepth
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

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function hashSeed(seed) {
    let hash = 2166136261;
    for (const char of String(seed)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function buildSeededRng(seed = DEFAULT_SEED) {
    let state = hashSeed(seed) || 1;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function buildDropRecordIndex(records = []) {
    return new Map((Array.isArray(records) ? records : []).map((record) => [Number(record.group_id), record]));
}

function buildItemRecordIndex(records = []) {
    return new Map((Array.isArray(records) ? records : []).map((record) => [Number(record.id), record]));
}

function getValues(rows, index, fallback) {
    return (Array.isArray(rows) ? rows : []).map((row) => (
        Array.isArray(row) && index < row.length ? Number(row[index]) : fallback
    ));
}

function randomWeightIndex(weights, rng) {
    const normalized = (Array.isArray(weights) ? weights : []).map(Number).map((value) => (
        Number.isFinite(value) && value > 0 ? value : 0
    ));
    if (!normalized.length) return null;
    if (normalized.length === 1) return 0;
    const total = normalized.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return null;
    const threshold = Math.floor(rng() * total);
    let cumulative = 0;
    for (let index = 0; index < normalized.length; index += 1) {
        cumulative += normalized[index];
        if (threshold < cumulative) return index;
    }
    return normalized.length - 1;
}

function randomProbabilityIndexes(weights, rng) {
    const normalized = (Array.isArray(weights) ? weights : []).map(Number).map((value) => (
        Number.isFinite(value) && value > 0 ? value : 0
    ));
    const total = normalized.reduce((sum, value) => sum + value, 0);
    if (!normalized.length || total <= 0) return [];
    const selected = [];
    normalized.forEach((weight, index) => {
        if (rng() < weight / total) selected.push(index);
    });
    return selected;
}

function randomCount(a, b, rng) {
    const left = Number(a);
    const right = Number(b);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
    if (left === right) return left;
    const low = Math.min(left, right);
    const high = Math.max(left, right);
    return low + Math.floor(rng() * (high - low));
}

function createDropStats() {
    return {
        drop_group_visit_count: 0,
        weighted_choice_count: 0,
        probability_choice_count: 0,
        tuple_selection_count: 0,
        nested_group_resolution_count: 0,
        terminal_item_add_count: 0,
        missing_drop_group_count: 0,
        missing_drop_group_ids: [],
        missing_item_count: 0,
        missing_item_ids: [],
        unsupported_weight_type_count: 0,
        recursion_limit_hit_count: 0,
        max_depth_reached: 0
    };
}

function mergeStats(target, source) {
    Object.entries(source).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach((entry) => {
                if (!target[key].includes(entry)) target[key].push(entry);
            });
        } else if (key === "max_depth_reached" && Number.isFinite(value)) {
            target[key] = Math.max(target[key], value);
        } else if (Number.isFinite(value)) {
            target[key] += value;
        }
    });
}

function addItemCount(itemCounts, itemId, count) {
    const safeId = String(itemId);
    itemCounts[safeId] = (itemCounts[safeId] || 0) + count;
}

function simulateDropGroup({
    dropRecordsByGroup,
    itemRecordsById,
    groupId,
    repeatCount = 1,
    rng,
    maxDepth = DEFAULT_MAX_DEPTH,
    depth = 0
}) {
    const itemCounts = {};
    const stats = createDropStats();
    stats.max_depth_reached = Math.max(stats.max_depth_reached, depth);
    if (depth > maxDepth) {
        stats.recursion_limit_hit_count += 1;
        return { item_counts: itemCounts, stats };
    }

    const normalizedRepeatCount = Math.max(0, Math.floor(Number(repeatCount) || 0));
    const drop = dropRecordsByGroup.get(Number(groupId));
    if (!drop) {
        stats.missing_drop_group_count += 1;
        stats.missing_drop_group_ids.push(Number(groupId));
        return { item_counts: itemCounts, stats };
    }
    stats.drop_group_visit_count += 1;

    for (let repeat = 0; repeat < normalizedRepeatCount; repeat += 1) {
        const rows = Array.isArray(drop.items_list) ? drop.items_list : [];
        const weights = getValues(rows, 4, 10000);
        let selectedIndexes = [];
        if (Number(drop.weight_type) === 1) {
            selectedIndexes = randomProbabilityIndexes(weights, rng);
            stats.probability_choice_count += 1;
        } else if (Number(drop.weight_type) === 2) {
            const selected = randomWeightIndex(weights, rng);
            selectedIndexes = selected === null ? [] : [selected];
            stats.weighted_choice_count += 1;
        } else {
            stats.unsupported_weight_type_count += 1;
        }

        selectedIndexes.forEach((selectedIndex) => {
            const tuple = rows[selectedIndex];
            if (!Array.isArray(tuple) || tuple.length < 4) return;
            stats.tuple_selection_count += 1;
            const kindOrNestedGroupMarker = Number(tuple[0]);
            const itemOrNestedGroupId = Number(tuple[1]);
            const count = randomCount(tuple[2], tuple[3], rng);
            if (kindOrNestedGroupMarker === 9999) {
                stats.nested_group_resolution_count += 1;
                const nested = simulateDropGroup({
                    dropRecordsByGroup,
                    itemRecordsById,
                    groupId: itemOrNestedGroupId,
                    repeatCount: count,
                    rng,
                    maxDepth,
                    depth: depth + 1
                });
                Object.entries(nested.item_counts).forEach(([itemId, itemCount]) => {
                    addItemCount(itemCounts, itemId, itemCount);
                });
                mergeStats(stats, nested.stats);
                return;
            }
            if (!itemRecordsById.has(itemOrNestedGroupId)) {
                stats.missing_item_count += 1;
                if (!stats.missing_item_ids.includes(itemOrNestedGroupId)) {
                    stats.missing_item_ids.push(itemOrNestedGroupId);
                }
            }
            stats.terminal_item_add_count += 1;
            addItemCount(itemCounts, itemOrNestedGroupId, count);
        });
    }

    return { item_counts: itemCounts, stats };
}

function normalizeSampleCount(sampleCount) {
    const value = Math.floor(Number(sampleCount));
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_SAMPLE_COUNT;
    return Math.min(value, MAX_SAMPLE_COUNT);
}

function records(namedTables, tableName) {
    return namedTables && namedTables[tableName] && Array.isArray(namedTables[tableName].records)
        ? namedTables[tableName].records
        : [];
}

function summarizeNumbers(values = []) {
    const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return { count: 0, min: null, mean: null, p50: null, p90: null, max: null };
    const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))];
    return {
        count: sorted.length,
        min: sorted[0],
        mean: roundTo(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
        p50: pick(0.5),
        p90: pick(0.9),
        max: sorted[sorted.length - 1]
    };
}

function addNumericObject(target, key, value) {
    const safeKey = String(key === undefined || key === null ? "unknown" : key);
    target[safeKey] = (target[safeKey] || 0) + value;
}

function summarizeSimulatedItems(itemCounts, itemRecordsById) {
    const qualityCounts = {};
    let terminalItemCount = 0;
    let totalBaseValue = 0;
    let totalGridCount = 0;
    let missingItemCount = 0;

    Object.entries(itemCounts || {}).forEach(([itemId, countValue]) => {
        const count = Number(countValue) || 0;
        terminalItemCount += count;
        const item = itemRecordsById.get(Number(itemId));
        if (!item) {
            missingItemCount += count;
            addNumericObject(qualityCounts, "unknown", count);
            return;
        }
        addNumericObject(qualityCounts, item.item_quality, count);
        totalBaseValue += (Number(item.base_value) || 0) * count;
        totalGridCount += (Number(item.grid_count) || 0) * count;
    });

    return {
        terminal_item_count: terminalItemCount,
        quality_counts: qualityCounts,
        total_base_value: totalBaseValue,
        total_grid_count: totalGridCount,
        missing_item_count: missingItemCount
    };
}

function summarizeQualityMeans(samples) {
    const keys = new Set();
    samples.forEach((sample) => {
        Object.keys(sample.quality_counts || {}).forEach((key) => keys.add(key));
    });
    return Object.fromEntries(Array.from(keys).sort((left, right) => Number(left) - Number(right)).map((key) => [
        key,
        roundTo(samples.reduce((sum, sample) => sum + (Number(sample.quality_counts[key]) || 0), 0) / samples.length)
    ]));
}

function buildMissingItemReferenceContext(missingItemIds, dropRecordsByGroup) {
    const missingSet = new Set((missingItemIds || []).map(Number));
    if (!missingSet.size) return [];
    const directRefs = [];
    const parentRefs = [];

    dropRecordsByGroup.forEach((drop) => {
        (Array.isArray(drop.items_list) ? drop.items_list : []).forEach((tuple) => {
            if (!Array.isArray(tuple) || tuple.length < 2) return;
            const targetId = Number(tuple[1]);
            if (Number(tuple[0]) !== 9999 && missingSet.has(targetId)) {
                directRefs.push({
                    missing_item_id: targetId,
                    drop_group_id: drop.group_id,
                    drop_localized_name: drop.__meta ? drop.__meta.localized_name : null,
                    tuple
                });
            }
        });
    });

    const directGroupIds = new Set(directRefs.map((entry) => Number(entry.drop_group_id)));
    dropRecordsByGroup.forEach((drop) => {
        (Array.isArray(drop.items_list) ? drop.items_list : []).forEach((tuple) => {
            if (!Array.isArray(tuple) || tuple.length < 2) return;
            if (Number(tuple[0]) === 9999 && directGroupIds.has(Number(tuple[1]))) {
                parentRefs.push({
                    parent_drop_group_id: drop.group_id,
                    parent_localized_name: drop.__meta ? drop.__meta.localized_name : null,
                    child_drop_group_id: Number(tuple[1]),
                    tuple
                });
            }
        });
    });

    return directRefs.map((entry) => ({
        ...entry,
        parent_references: parentRefs
            .filter((parent) => Number(parent.child_drop_group_id) === Number(entry.drop_group_id))
            .slice(0, 20)
    })).slice(0, 20);
}

function findRootDropContract(projectMap) {
    const rootBidMapId = Number(projectMap.bidking_root_bidmap_id);
    const bidMapSamples = Array.isArray(projectMap.bidmap_samples) ? projectMap.bidmap_samples : [];
    const rootBidMap = bidMapSamples.find((entry) => Number(entry.id) === rootBidMapId)
        || bidMapSamples.find((entry) => Number(entry.root_drop_group_id) === Number(projectMap.root_drop_group_id))
        || null;
    const dropRef = rootBidMap && Array.isArray(rootBidMap.drop_group_id) ? rootBidMap.drop_group_id : null;
    if (dropRef && Number(dropRef[0]) === 9999 && Number.isFinite(Number(dropRef[1]))) {
        return {
            source: "bidmap.drop_group_id",
            root_group_id: Number(dropRef[1]),
            min_repeat: Number(dropRef[2]),
            max_repeat_exclusive: Number(dropRef[3]),
            raw: dropRef
        };
    }
    const mapRange = projectMap.map_record && Array.isArray(projectMap.map_record.entrust_num)
        ? projectMap.map_record.entrust_num
        : null;
    return {
        source: mapRange ? "map_record.entrust_num_fallback" : "root_drop_group_fallback",
        root_group_id: Number(projectMap.root_drop_group_id),
        min_repeat: mapRange ? Number(mapRange[0]) : 1,
        max_repeat_exclusive: mapRange ? Number(mapRange[1]) : 1,
        raw: mapRange || [projectMap.root_drop_group_id]
    };
}

function buildMapShadowSummary({ projectMapId, projectMap, dropRecordsByGroup, itemRecordsById, seed, sampleCount, maxDepth }) {
    const rng = buildSeededRng(`${seed}:${projectMapId}`);
    const contract = findRootDropContract(projectMap);
    const samples = [];
    const aggregateStats = createDropStats();

    for (let index = 0; index < sampleCount; index += 1) {
        const repeatCount = randomCount(contract.min_repeat, contract.max_repeat_exclusive, rng);
        const dropResult = simulateDropGroup({
            dropRecordsByGroup,
            itemRecordsById,
            groupId: contract.root_group_id,
            repeatCount,
            rng,
            maxDepth
        });
        mergeStats(aggregateStats, dropResult.stats);
        const itemSummary = summarizeSimulatedItems(dropResult.item_counts, itemRecordsById);
        samples.push({
            sample_index: index,
            root_repeat_count: repeatCount,
            ...itemSummary
        });
    }

    const itemCounts = samples.map((sample) => sample.terminal_item_count);
    const currentRange = projectMap.map_record && Array.isArray(projectMap.map_record.entrust_num)
        ? projectMap.map_record.entrust_num.map(Number)
        : [];
    const currentLow = currentRange[0];
    const currentHigh = currentRange[1];
    const rangeHitCount = Number.isFinite(currentLow) && Number.isFinite(currentHigh)
        ? itemCounts.filter((count) => count >= currentLow && count <= currentHigh).length
        : 0;

    return {
        current_map_id: projectMap.current_map_id || projectMapId,
        bidking_map_id: projectMap.bidking_map_id ?? null,
        bidking_root_bidmap_id: projectMap.bidking_root_bidmap_id ?? null,
        root_drop_group_id: contract.root_group_id,
        root_drop_contract: contract,
        evidence_confidence: projectMap.evidence_confidence || "unknown",
        sample_count: sampleCount,
        item_count_range_sanity: {
            current_map_entrust_num: currentRange.length ? currentRange : null,
            simulated_terminal_item_count: summarizeNumbers(itemCounts),
            in_current_range_sample_count: rangeHitCount,
            in_current_range_rate: sampleCount > 0 ? roundTo(rangeHitCount / sampleCount) : null
        },
        quality_count_means_by_bidking_quality: summarizeQualityMeans(samples),
        total_base_value_summary: summarizeNumbers(samples.map((sample) => sample.total_base_value)),
        total_grid_count_summary: summarizeNumbers(samples.map((sample) => sample.total_grid_count)),
        drop_resolution_stats: {
            ...aggregateStats,
            missing_drop_group_ids: aggregateStats.missing_drop_group_ids.slice(0, 40),
            missing_item_ids: aggregateStats.missing_item_ids.slice(0, 40)
        },
        missing_item_reference_context: buildMissingItemReferenceContext(
            aggregateStats.missing_item_ids,
            dropRecordsByGroup
        ),
        sample_digest: samples.slice(0, 8)
    };
}

function sumMapStats(mapSummaries, key) {
    return mapSummaries.reduce((sum, entry) => sum + (Number(entry.drop_resolution_stats[key]) || 0), 0);
}

function buildBidKingTableBackedShadowSimulatorReport({
    projectRelevantParseReport = readJson(DEFAULT_PROJECT_RELEVANT_PARSE_REPORT_PATH),
    schemaBackedTableReport = readJson(DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH),
    generatedAt = new Date().toISOString(),
    seed = DEFAULT_SEED,
    sampleCount = DEFAULT_SAMPLE_COUNT,
    maxDepth = DEFAULT_MAX_DEPTH,
    paths = {}
} = {}) {
    const normalizedSampleCount = normalizeSampleCount(sampleCount);
    const normalizedMaxDepth = Math.max(1, Math.floor(Number(maxDepth) || DEFAULT_MAX_DEPTH));
    const namedTables = schemaBackedTableReport.named_tables || {};
    const dropRecordsByGroup = buildDropRecordIndex(records(namedTables, "Table_Drop"));
    const itemRecordsById = buildItemRecordIndex(records(namedTables, "Table_Item"));
    const projectMaps = projectRelevantParseReport.project_maps || {};
    const mapShadowSummaries = Object.entries(projectMaps).map(([projectMapId, projectMap]) => (
        buildMapShadowSummary({
            projectMapId,
            projectMap,
            dropRecordsByGroup,
            itemRecordsById,
            seed,
            sampleCount: normalizedSampleCount,
            maxDepth: normalizedMaxDepth
        })
    ));

    const blockers = ["table_backed_shadow_simulator_not_authoritative"];
    const parseGates = projectRelevantParseReport.gates || {};
    if (parseGates.manual_mechanics_review_approved !== true) addReason(blockers, "manual_mechanics_review_not_approved");
    if (parseGates.same_battle_replay_samples_attached !== true) addReason(blockers, "same_battle_replay_samples_missing");
    if (sumMapStats(mapShadowSummaries, "missing_drop_group_count") > 0) addReason(blockers, "simulator_missing_drop_group_references");
    if (sumMapStats(mapShadowSummaries, "missing_item_count") > 0) addReason(blockers, "simulator_missing_item_references");
    if (sumMapStats(mapShadowSummaries, "recursion_limit_hit_count") > 0) addReason(blockers, "simulator_recursion_limit_hit");

    const warnings = [];
    if (normalizeSampleCount(sampleCount) !== Math.floor(Number(sampleCount))) warnings.push("sample_count_normalized_or_clamped");

    return {
        schema_version: "ak_bidking_table_backed_shadow_simulator_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            project_relevant_parse_report: paths.projectRelevantParseReportPath || DEFAULT_PROJECT_RELEVANT_PARSE_REPORT_PATH,
            schema_backed_table_report: paths.schemaBackedTableReportPath || DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH
        },
        simulation_controls: {
            seed,
            sample_count_requested: sampleCount,
            sample_count_per_map: normalizedSampleCount,
            max_sample_count: MAX_SAMPLE_COUNT,
            max_depth: normalizedMaxDepth,
            rng: "fnv1a_seeded_mulberry32",
            random_count_upper_bound: "exclusive",
            probability_mode: "independent_weight_over_total_bernoulli",
            weighted_mode: "single_cumulative_weighted_choice"
        },
        summary: {
            parse_status: projectRelevantParseReport.summary ? projectRelevantParseReport.summary.parse_status : null,
            project_map_count: mapShadowSummaries.length,
            simulated_sample_count: mapShadowSummaries.length * normalizedSampleCount,
            deterministic_seed: seed,
            total_missing_drop_group_count: sumMapStats(mapShadowSummaries, "missing_drop_group_count"),
            total_missing_item_count: sumMapStats(mapShadowSummaries, "missing_item_count"),
            total_recursion_limit_hit_count: sumMapStats(mapShadowSummaries, "recursion_limit_hit_count"),
            table_backed_shadow_replay_allowed: false,
            promotion_allowed: false,
            default_config_update_allowed: false,
            authority_handoff_allowed: false,
            promotion_status: "blocked_table_backed_shadow_simulator_requires_review_and_same_battle_replay",
            recommended_next_action: "attach_same_battle_replay_samples_and_open_manual_mechanics_review_before_algorithm_change",
            blockers,
            warnings
        },
        gates: {
            manual_mechanics_review_approved: parseGates.manual_mechanics_review_approved === true,
            same_battle_replay_samples_attached: parseGates.same_battle_replay_samples_attached === true,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        map_shadow_summaries: mapShadowSummaries,
        notes: [
            "This artifact is a deterministic offline simulator over recovered BidKing tables only.",
            "It is not an authority handoff, estimator mutation, or default weight update.",
            "Use same-battle replay samples and manual mechanics approval before promoting any strategy change."
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

function formatBidKingTableBackedShadowSimulatorMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const rows = (report.map_shadow_summaries || []).map((entry) => {
        const sanity = entry.item_count_range_sanity || {};
        return `| ${markdownCode(entry.current_map_id)} | ${markdownCode(entry.root_drop_group_id)} | ${markdownCode(entry.sample_count)} | ${markdownCell(JSON.stringify(sanity.current_map_entrust_num || null))} | ${markdownCode(sanity.simulated_terminal_item_count && sanity.simulated_terminal_item_count.mean)} | ${markdownCode(sanity.in_current_range_rate)} | ${markdownCell(JSON.stringify(entry.quality_count_means_by_bidking_quality || {}))} | ${markdownCode(entry.drop_resolution_stats && entry.drop_resolution_stats.missing_drop_group_count)} | ${markdownCode(entry.drop_resolution_stats && entry.drop_resolution_stats.missing_item_count)} |`;
    }).join("\n");
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;

    return `# BidKing table-backed shadow simulator report

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Seed: \`${(report.simulation_controls || {}).seed || "-"}\`
- Sample count per map: \`${(report.simulation_controls || {}).sample_count_per_map ?? 0}\`
- Simulated samples: \`${summary.simulated_sample_count ?? 0}\`
- Promotion allowed: \`${summary.promotion_allowed === true}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Map Shadow Summary

| map | root drop group | samples | current item range | mean simulated items | range hit rate | quality means | missing groups | missing items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows || "| `-` | `-` | `0` | - | `-` | `-` | - | `0` | `0` |"}

## Blockers

${(summary.blockers || []).map((blocker) => `- \`${blocker}\``).join("\n") || "- `none`"}

## Warnings

${(summary.warnings || []).map((warning) => `- \`${warning}\``).join("\n") || "- `none`"}

## Decision

This simulator is sufficient for shadow-only mechanics inspection. It does not authorize estimator/default weight changes; manual mechanics review and same-battle replay evidence remain required.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const projectRelevantParseReport = readJson(args.projectRelevantParseReportPath);
    const schemaBackedTableReport = readJson(args.schemaBackedTableReportPath);
    const report = buildBidKingTableBackedShadowSimulatorReport({
        projectRelevantParseReport,
        schemaBackedTableReport,
        generatedAt: args.generatedAt || new Date().toISOString(),
        seed: args.seed,
        sampleCount: args.sampleCount,
        maxDepth: args.maxDepth,
        paths: {
            projectRelevantParseReportPath: args.projectRelevantParseReportPath,
            schemaBackedTableReportPath: args.schemaBackedTableReportPath
        }
    });
    writeJson(args.outputPath, report);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatBidKingTableBackedShadowSimulatorMarkdown(report, args.outputPath)
    );
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
    buildBidKingTableBackedShadowSimulatorReport,
    buildDropRecordIndex,
    buildItemRecordIndex,
    buildSeededRng,
    formatBidKingTableBackedShadowSimulatorMarkdown,
    main,
    randomCount,
    randomProbabilityIndexes,
    randomWeightIndex,
    resolveArgs,
    simulateDropGroup
};
