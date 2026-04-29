const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { resolveEstimatorConfig } = require("../src/core/estimator.js");

const DEFAULT_CANDIDATE_QUEUE_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-clean-replay-candidate-queue.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-pixel-shadow-count-prior-fit-report.json"
);
const QUALITIES = ["w", "g", "b", "p", "o", "r"];
const SOURCE_CLASSIFICATION = "pixel_review_only_shadow_fit";

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        candidateQueuePath: argv[0] ? path.resolve(argv[0]) : DEFAULT_CANDIDATE_QUEUE_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeInputPayload(payload, key = "items") {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object" && Array.isArray(payload[key])) return payload[key];
    return [];
}

function normalizeCounts(counts = {}) {
    return QUALITIES.reduce((result, quality) => {
        const value = Number(counts[quality] || 0);
        result[quality] = Number.isFinite(value) && value > 0 ? value : 0;
        return result;
    }, {});
}

function addCounts(left = {}, right = {}) {
    return QUALITIES.reduce((result, quality) => {
        result[quality] = (Number(left[quality]) || 0) + (Number(right[quality]) || 0);
        return result;
    }, {});
}

function sumCounts(counts = {}) {
    return QUALITIES.reduce((sum, quality) => sum + (Number(counts[quality]) || 0), 0);
}

function sortedObject(object = {}) {
    return Object.keys(object).sort().reduce((result, key) => {
        result[key] = object[key];
        return result;
    }, {});
}

function incrementCounter(counter = {}, key, amount = 1) {
    const safeKey = key || "unknown";
    counter[safeKey] = (counter[safeKey] || 0) + amount;
}

function hasMapSpecificBaseline(config = {}, mapId) {
    if (!mapId || mapId === "unknown") return false;
    if (isPlainObject(config.maps) && isPlainObject(config.maps[mapId])) return true;
    if (isPlainObject(config.map_presets) && isPlainObject(config.map_presets[mapId])) return true;
    return false;
}

function readBaselineForMap(baselineConfig = {}, mapId) {
    if (!hasMapSpecificBaseline(baselineConfig, mapId)) return null;
    const resolved = resolveEstimatorConfig(baselineConfig, mapId);
    const alphaCounts = resolved && isPlainObject(resolved.alpha_counts)
        ? normalizeCounts(resolved.alpha_counts)
        : null;
    const alphaTotal = alphaCounts ? roundTo(sumCounts(alphaCounts), 6) : 0;
    const countPriorStrength = Number(resolved && resolved.solver && resolved.solver.count_prior_strength);

    if (!alphaCounts || alphaTotal <= 0) return null;
    return {
        alpha_counts: alphaCounts,
        alpha_total: alphaTotal,
        solver: {
            count_prior_strength: Number.isFinite(countPriorStrength) && countPriorStrength > 0
                ? countPriorStrength
                : null
        }
    };
}

function buildFractions(counts = {}) {
    const total = sumCounts(counts);
    return QUALITIES.reduce((result, quality) => {
        result[quality] = total > 0 ? roundTo((Number(counts[quality]) || 0) / total, 6) : 0;
        return result;
    }, {});
}

function buildScaledAlphaCandidateFromCounts(counts = {}, scaleTotal) {
    const countTotal = sumCounts(counts);
    const total = Number(scaleTotal);
    return QUALITIES.reduce((result, quality) => {
        result[quality] = countTotal > 0 && Number.isFinite(total) && total > 0
            ? roundTo(((Number(counts[quality]) || 0) / countTotal) * total, 6)
            : 0;
        return result;
    }, {});
}

function buildDelta(candidate = {}, baseline = null) {
    if (!baseline) return null;
    return QUALITIES.reduce((result, quality) => {
        result[quality] = roundTo((Number(candidate[quality]) || 0) - (Number(baseline[quality]) || 0), 6);
        return result;
    }, {});
}

function buildL1Distance(candidate = {}, baseline = null) {
    if (!baseline) return null;
    return roundTo(QUALITIES.reduce((sum, quality) => {
        return sum + Math.abs((Number(candidate[quality]) || 0) - (Number(baseline[quality]) || 0));
    }, 0), 6);
}

function normalizePixelDraft(item = {}) {
    const draft = item && isPlainObject(item.pixel_quality_draft) ? item.pixel_quality_draft : null;
    if (!draft || !isPlainObject(draft.counts)) return null;
    const counts = normalizeCounts(draft.counts);
    const countSum = sumCounts(counts);
    const rawTotal = Number(draft.total);
    const pixelTotal = Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : countSum;
    const cropSensitivity = isPlainObject(draft.crop_sensitivity) ? draft.crop_sensitivity : null;
    return {
        item_id: item.id || item.basename || null,
        map_id: item.map_id || "unknown",
        priority: item.priority || null,
        counts,
        count_sum: countSum,
        pixel_total: pixelTotal,
        low_confidence: Number(draft.low_confidence_block_count || 0) > 0,
        crop_sensitive: cropSensitivity ? cropSensitivity.stable !== true : false,
        crop_stable: cropSensitivity ? cropSensitivity.stable === true : false,
        missing_crop_sensitivity: !cropSensitivity,
        training_label_allowed: draft.training_label_allowed === true
            || (cropSensitivity && cropSensitivity.training_label_allowed === true)
    };
}

function createEmptyMapAccumulator(mapId) {
    return {
        map_id: mapId,
        pixel_input_count: 0,
        source_item_ids: [],
        priority_counts: {},
        pixel_counts: normalizeCounts({}),
        pixel_total: 0,
        pixel_count_sum: 0,
        low_confidence_input_count: 0,
        crop_sensitive_input_count: 0,
        crop_stable_input_count: 0,
        missing_crop_sensitivity_count: 0,
        training_label_allowed_count: 0
    };
}

function addPixelDraftToMap(accumulator, draft) {
    accumulator.pixel_input_count += 1;
    if (draft.item_id) accumulator.source_item_ids.push(draft.item_id);
    incrementCounter(accumulator.priority_counts, draft.priority || "unknown");
    accumulator.pixel_counts = addCounts(accumulator.pixel_counts, draft.counts);
    accumulator.pixel_total = roundTo(accumulator.pixel_total + draft.pixel_total, 6);
    accumulator.pixel_count_sum = roundTo(accumulator.pixel_count_sum + draft.count_sum, 6);
    if (draft.low_confidence) accumulator.low_confidence_input_count += 1;
    if (draft.crop_sensitive) accumulator.crop_sensitive_input_count += 1;
    if (draft.crop_stable) accumulator.crop_stable_input_count += 1;
    if (draft.missing_crop_sensitivity) accumulator.missing_crop_sensitivity_count += 1;
    if (draft.training_label_allowed) accumulator.training_label_allowed_count += 1;
}

function buildMapBlockers(mapEntry = {}) {
    const blockers = [
        "pixel_counts_not_training_labels",
        "missing_same_battle_observed_state",
        "missing_manual_actual_counts"
    ];
    if (mapEntry.map_id === "unknown") blockers.push("unknown_map_id");
    if (mapEntry.crop_sensitive_input_count > 0) blockers.push("crop_sensitive_pixel_counts");
    if (mapEntry.missing_crop_sensitivity_count > 0) blockers.push("missing_crop_sensitivity_review");
    if (mapEntry.low_confidence_input_count > 0) blockers.push("low_confidence_pixel_blocks");
    if (mapEntry.training_label_allowed_count > 0) blockers.push("unexpected_pixel_training_label_allowed");
    return blockers;
}

function finalizeMapEntry(accumulator = {}, baselineConfig = {}) {
    const empiricalFractions = buildFractions(accumulator.pixel_counts);
    const baseline = readBaselineForMap(baselineConfig, accumulator.map_id);
    const scaleTotal = baseline ? baseline.alpha_total : accumulator.pixel_count_sum;
    const alphaCountsCandidate = buildScaledAlphaCandidateFromCounts(accumulator.pixel_counts, scaleTotal);
    const baselineAlphaCounts = baseline ? baseline.alpha_counts : null;
    const blockers = buildMapBlockers(accumulator);

    return {
        map_id: accumulator.map_id,
        source_classification: SOURCE_CLASSIFICATION,
        pixel_input_count: accumulator.pixel_input_count,
        source_item_ids: accumulator.source_item_ids,
        priority_counts: sortedObject(accumulator.priority_counts),
        pixel_counts: accumulator.pixel_counts,
        pixel_total: accumulator.pixel_total,
        pixel_count_sum: accumulator.pixel_count_sum,
        empirical_fractions: empiricalFractions,
        baseline_alpha_counts: baselineAlphaCounts,
        baseline_alpha_total: baseline ? baseline.alpha_total : null,
        alpha_counts_candidate: alphaCountsCandidate,
        alpha_counts_delta_from_baseline: buildDelta(alphaCountsCandidate, baselineAlphaCounts),
        l1_delta_from_baseline: buildL1Distance(alphaCountsCandidate, baselineAlphaCounts),
        solver_candidate: {
            count_prior_strength: baseline && baseline.solver.count_prior_strength !== null
                ? baseline.solver.count_prior_strength
                : null
        },
        low_confidence_input_count: accumulator.low_confidence_input_count,
        crop_sensitive_input_count: accumulator.crop_sensitive_input_count,
        crop_stable_input_count: accumulator.crop_stable_input_count,
        missing_crop_sensitivity_count: accumulator.missing_crop_sensitivity_count,
        training_label_allowed_count: accumulator.training_label_allowed_count,
        adoption_allowed: false,
        recommended_change_class: "RESEARCH_ONLY",
        blockers
    };
}

function buildPixelShadowCountPriorFitReport({
    candidateQueue = {},
    baselineConfig = defaultConfig,
    generatedAt = new Date().toISOString()
} = {}) {
    const items = normalizeInputPayload(candidateQueue, "items");
    const mapAccumulators = {};
    const summaryCounts = {
        map_counts: {},
        priority_counts: {},
        pixel_total: 0,
        pixel_count_sum: 0,
        pixel_input_count: 0,
        low_confidence_input_count: 0,
        crop_sensitive_input_count: 0,
        crop_stable_input_count: 0,
        missing_crop_sensitivity_count: 0,
        training_label_allowed_count: 0
    };

    items.forEach((item) => {
        const draft = normalizePixelDraft(item);
        if (!draft) return;
        const mapId = draft.map_id || "unknown";
        mapAccumulators[mapId] = mapAccumulators[mapId] || createEmptyMapAccumulator(mapId);
        addPixelDraftToMap(mapAccumulators[mapId], draft);

        summaryCounts.pixel_input_count += 1;
        summaryCounts.pixel_total = roundTo(summaryCounts.pixel_total + draft.pixel_total, 6);
        summaryCounts.pixel_count_sum = roundTo(summaryCounts.pixel_count_sum + draft.count_sum, 6);
        incrementCounter(summaryCounts.map_counts, mapId);
        incrementCounter(summaryCounts.priority_counts, draft.priority || "unknown");
        if (draft.low_confidence) summaryCounts.low_confidence_input_count += 1;
        if (draft.crop_sensitive) summaryCounts.crop_sensitive_input_count += 1;
        if (draft.crop_stable) summaryCounts.crop_stable_input_count += 1;
        if (draft.missing_crop_sensitivity) summaryCounts.missing_crop_sensitivity_count += 1;
        if (draft.training_label_allowed) summaryCounts.training_label_allowed_count += 1;
    });

    const maps = {};
    Object.keys(mapAccumulators).sort().forEach((mapId) => {
        maps[mapId] = finalizeMapEntry(mapAccumulators[mapId], baselineConfig);
    });

    const adoptionBlockers = [
        "pixel_counts_not_training_labels",
        "missing_same_battle_observed_state",
        "missing_manual_actual_counts"
    ];
    if (summaryCounts.crop_sensitive_input_count > 0) adoptionBlockers.push("crop_sensitive_pixel_counts");
    if (summaryCounts.low_confidence_input_count > 0) adoptionBlockers.push("low_confidence_pixel_blocks");
    if (summaryCounts.training_label_allowed_count > 0) adoptionBlockers.push("unexpected_pixel_training_label_allowed");

    return {
        schema_version: "ak_pixel_shadow_count_prior_fit_v1",
        generated_at: generatedAt,
        source_classification: SOURCE_CLASSIFICATION,
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        adoption_allowed: false,
        adoption_blockers: adoptionBlockers,
        summary: {
            queue_count: items.length,
            pixel_input_count: summaryCounts.pixel_input_count,
            map_count: Object.keys(maps).length,
            map_counts: sortedObject(summaryCounts.map_counts),
            priority_counts: sortedObject(summaryCounts.priority_counts),
            pixel_total: summaryCounts.pixel_total,
            pixel_count_sum: summaryCounts.pixel_count_sum,
            low_confidence_input_count: summaryCounts.low_confidence_input_count,
            crop_sensitive_input_count: summaryCounts.crop_sensitive_input_count,
            crop_stable_input_count: summaryCounts.crop_stable_input_count,
            missing_crop_sensitivity_count: summaryCounts.missing_crop_sensitivity_count,
            training_label_allowed_count: summaryCounts.training_label_allowed_count,
            adoption_allowed: false
        },
        maps
    };
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function compactCounts(counts = {}) {
    return QUALITIES
        .map((quality) => `${quality}:${Number(counts[quality] || 0)}`)
        .join(", ");
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function formatPixelShadowCountPriorFitMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report && report.summary ? report.summary : {};
    const maps = report && report.maps ? Object.values(report.maps) : [];
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = maps.length
        ? maps.map((entry) => tableRow([
            markdownCode(entry.map_id),
            markdownCode(entry.pixel_input_count),
            markdownCode(entry.pixel_total),
            markdownCell(compactCounts(entry.pixel_counts)),
            markdownCell(compactCounts(entry.empirical_fractions)),
            markdownCell(compactCounts(entry.alpha_counts_candidate)),
            markdownCode(entry.l1_delta_from_baseline),
            markdownCode(entry.crop_sensitive_input_count),
            markdownCode(entry.low_confidence_input_count),
            markdownCode(entry.adoption_allowed),
            markdownCell((entry.blockers || []).join(", "))
        ])).join("\n")
        : "| `-` | `0` | `0` | - | - | - | `-` | `0` | `0` | `false` | - |";

    return `# 2026-04-24 pixel shadow count-prior fit

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- source classification: \`${report.source_classification || SOURCE_CLASSIFICATION}\`
- adoption allowed: \`${report.adoption_allowed === true}\`
- pixel input count: \`${summary.pixel_input_count || 0}\`
- crop-sensitive inputs: \`${summary.crop_sensitive_input_count || 0}\`
- crop-stable inputs: \`${summary.crop_stable_input_count || 0}\`
- low-confidence inputs: \`${summary.low_confidence_input_count || 0}\`
- training-label allowed: \`${summary.training_label_allowed_count || 0}\`
- adoption blockers: \`${(report.adoption_blockers || []).join(", ")}\`
- 用途: 只做图片像素统计的影子拟合候选；不写入默认权重，不作为训练标签。

## Map shadow candidates

| map | pixel inputs | pixel total | pixel counts | empirical fractions | alpha candidate | L1 delta | crop-sensitive | low-conf | adopt | blockers |
| --- | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- |
${rows}

## Guardrails

- \`pixel_quality_draft\` 不是 \`actual_counts\`。
- 只有同局 \`observed_state + human/manual actual_counts\` 才能进入正式 count-prior tuning。
- 本报告输出的 \`alpha_counts_candidate\` 只能用于后续人工复核或 shadow 对照，不允许直接改 \`default_config_bundle.js\`。
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
    const { candidateQueuePath, outputPath } = resolveArgs(argv);
    const candidateQueue = JSON.parse(fs.readFileSync(candidateQueuePath, "utf8"));
    const report = buildPixelShadowCountPriorFitReport({ candidateQueue });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatPixelShadowCountPriorFitMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CANDIDATE_QUEUE_PATH,
    DEFAULT_OUTPUT_PATH,
    QUALITIES,
    SOURCE_CLASSIFICATION,
    buildPixelShadowCountPriorFitReport,
    formatPixelShadowCountPriorFitMarkdown,
    main,
    normalizeCounts,
    normalizeInputPayload,
    resolveArgs
};
