const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { createBattleSampleRecord } = require("../src/core/source_data_runtime.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_REVIEW_IMPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-manual-confirmation-import.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-manual-count-prior-shadow-candidate-config.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const DEFAULT_PRIOR_SAMPLE_EQUIVALENT = 3;
const DEFAULT_MAX_BLEND_WEIGHT = 0.75;
const DEFAULT_MIN_RECOMMENDED_MAP_SAMPLE_COUNT = 3;

function formatReportPath(filePath) {
    if (!filePath) return null;
    const resolved = path.resolve(filePath);
    const relative = path.relative(ROOT_DIR, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.split(path.sep).join("/");
    }
    return filePath;
}

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const result = {
        reviewImportPath: DEFAULT_REVIEW_IMPORT_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: null,
        priorSampleEquivalent: DEFAULT_PRIOR_SAMPLE_EQUIVALENT,
        maxBlendWeight: DEFAULT_MAX_BLEND_WEIGHT,
        minRecommendedMapSampleCount: DEFAULT_MIN_RECOMMENDED_MAP_SAMPLE_COUNT
    };
    const flagMap = {
        "--generated-at": "generatedAt",
        "--prior-sample-equivalent": "priorSampleEquivalent",
        "--max-blend-weight": "maxBlendWeight",
        "--min-recommended-map-sample-count": "minRecommendedMapSampleCount"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const eqIndex = String(arg).indexOf("=");
        const flagName = eqIndex > -1 ? String(arg).slice(0, eqIndex) : arg;
        const inlineValue = eqIndex > -1 ? String(arg).slice(eqIndex + 1) : null;
        if (flagMap[flagName]) {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flagName} 缺少值`);
            if (inlineValue === null) index += 1;
            const targetKey = flagMap[flagName];
            if (targetKey === "generatedAt") {
                result.generatedAt = value;
            } else {
                result[targetKey] = Number(value);
            }
        } else {
            positional.push(arg);
        }
    }

    if (positional.length > 2) {
        throw new Error("最多只接受 2 个位置参数: <review-import.json> [candidate-output.json]");
    }
    if (positional[0]) result.reviewImportPath = path.resolve(positional[0]);
    if (positional[1]) result.outputPath = path.resolve(positional[1]);
    return result;
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

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function roundTo(value, digits = 6) {
    if (!Number.isFinite(Number(value))) return 0;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
}

function normalizePositiveNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeSampleCount(value, fallback) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function sumQualityValues(counts = {}) {
    return QUALITY_ORDER.reduce((sum, quality) => sum + (Number(counts[quality]) || 0), 0);
}

function hasFullQualityCounts(sample = {}) {
    return QUALITY_ORDER.every((quality) => (
        Number.isInteger(sample.actual_counts && sample.actual_counts[quality])
        && sample.actual_counts[quality] >= 0
    ));
}

function normalizeSamples(reviewImport = {}) {
    return (Array.isArray(reviewImport.samples) ? reviewImport.samples : [])
        .map((sample) => createBattleSampleRecord(sample))
        .filter((sample) => sample.map_id && hasFullQualityCounts(sample));
}

function groupSamplesByMap(samples = []) {
    return samples.reduce((groups, sample) => {
        if (!groups[sample.map_id]) groups[sample.map_id] = [];
        groups[sample.map_id].push(sample);
        return groups;
    }, {});
}

function buildAggregatedCounts(samples = []) {
    return samples.reduce((counts, sample) => {
        QUALITY_ORDER.forEach((quality) => {
            counts[quality] += Number(sample.actual_counts[quality]) || 0;
        });
        return counts;
    }, Object.fromEntries(QUALITY_ORDER.map((quality) => [quality, 0])));
}

function getBaselineAlphaCounts(config = {}, mapId) {
    const mapAlpha = config.maps && config.maps[mapId] && config.maps[mapId].alpha_counts;
    const modelAlpha = config.model && config.model.alpha_counts;
    const source = isPlainObject(mapAlpha) ? mapAlpha : (isPlainObject(modelAlpha) ? modelAlpha : {});
    return QUALITY_ORDER.reduce((result, quality) => {
        const numeric = Number(source[quality]);
        result[quality] = Number.isFinite(numeric) && numeric > 0 ? numeric : 0.05;
        return result;
    }, {});
}

function normalizeEmpiricalAlphaCounts(aggregatedCounts = {}, alphaTotal = 1) {
    const total = sumQualityValues(aggregatedCounts);
    if (total <= 0) return Object.fromEntries(QUALITY_ORDER.map((quality) => [quality, roundTo(alphaTotal / QUALITY_ORDER.length)]));
    return QUALITY_ORDER.reduce((result, quality) => {
        result[quality] = roundTo((Number(aggregatedCounts[quality]) || 0) / total * alphaTotal, 6);
        return result;
    }, {});
}

function computeBlendWeight(sampleCount, priorSampleEquivalent, maxBlendWeight) {
    const prior = normalizePositiveNumber(priorSampleEquivalent, DEFAULT_PRIOR_SAMPLE_EQUIVALENT);
    const cap = normalizePositiveNumber(maxBlendWeight, DEFAULT_MAX_BLEND_WEIGHT);
    const raw = sampleCount / (sampleCount + prior);
    return roundTo(Math.min(cap, raw), 6);
}

function blendAlphaCounts(baselineAlpha = {}, empiricalAlpha = {}, blendWeight = 0) {
    const blended = QUALITY_ORDER.reduce((result, quality) => {
        const baseline = Number(baselineAlpha[quality]) || 0.05;
        const empirical = Number(empiricalAlpha[quality]) || 0;
        result[quality] = Math.max(0.01, (baseline * (1 - blendWeight)) + (empirical * blendWeight));
        return result;
    }, {});
    const targetTotal = sumQualityValues(baselineAlpha);
    const currentTotal = sumQualityValues(blended);
    if (currentTotal <= 0 || targetTotal <= 0) return Object.fromEntries(
        QUALITY_ORDER.map((quality) => [quality, roundTo(blended[quality], 6)])
    );
    return QUALITY_ORDER.reduce((result, quality) => {
        result[quality] = roundTo(blended[quality] / currentTotal * targetTotal, 6);
        return result;
    }, {});
}

function buildMapCandidate({
    baselineConfig = defaultConfig,
    mapId,
    samples = [],
    priorSampleEquivalent = DEFAULT_PRIOR_SAMPLE_EQUIVALENT,
    maxBlendWeight = DEFAULT_MAX_BLEND_WEIGHT
} = {}) {
    const baselineAlphaCounts = getBaselineAlphaCounts(baselineConfig, mapId);
    const baselineAlphaTotal = roundTo(sumQualityValues(baselineAlphaCounts), 6);
    const aggregatedActualCounts = buildAggregatedCounts(samples);
    const empiricalAlphaCounts = normalizeEmpiricalAlphaCounts(aggregatedActualCounts, baselineAlphaTotal);
    const blendWeight = computeBlendWeight(samples.length, priorSampleEquivalent, maxBlendWeight);
    const alphaCounts = blendAlphaCounts(baselineAlphaCounts, empiricalAlphaCounts, blendWeight);
    const baselineStrength = Number(
        baselineConfig.maps
        && baselineConfig.maps[mapId]
        && baselineConfig.maps[mapId].solver
        && baselineConfig.maps[mapId].solver.count_prior_strength
    );

    return {
        map_id: mapId,
        sample_count: samples.length,
        sample_ids: samples.map((sample) => sample.id).sort(),
        aggregated_actual_counts: aggregatedActualCounts,
        aggregated_actual_total_items: sumQualityValues(aggregatedActualCounts),
        baseline_alpha_counts: baselineAlphaCounts,
        baseline_alpha_total: baselineAlphaTotal,
        empirical_alpha_counts: empiricalAlphaCounts,
        blend_weight: blendWeight,
        alpha_counts: alphaCounts,
        count_prior_strength: Number.isFinite(baselineStrength) && baselineStrength > 0 ? baselineStrength : 1
    };
}

function buildManualCountPriorShadowCandidateConfig({
    baselineConfig = defaultConfig,
    reviewImport = {},
    sourceReviewImportPath = null,
    generatedAt = null,
    priorSampleEquivalent = DEFAULT_PRIOR_SAMPLE_EQUIVALENT,
    maxBlendWeight = DEFAULT_MAX_BLEND_WEIGHT,
    minRecommendedMapSampleCount = DEFAULT_MIN_RECOMMENDED_MAP_SAMPLE_COUNT
} = {}) {
    const candidateConfig = cloneValue(baselineConfig);
    const samples = normalizeSamples(reviewImport);
    const samplesByMap = groupSamplesByMap(samples);
    const appliedMaps = [];
    const skippedMaps = [];
    const skippedMapReasons = {};
    const selectedMaps = {};
    const minSamples = normalizeSampleCount(minRecommendedMapSampleCount, DEFAULT_MIN_RECOMMENDED_MAP_SAMPLE_COUNT);

    Object.entries(samplesByMap).forEach(([mapId, mapSamples]) => {
        const skipReasons = [];
        if (!candidateConfig.maps || !candidateConfig.maps[mapId]) skipReasons.push("missing_map_config");
        if (!mapSamples.length) skipReasons.push("missing_full_quality_count_samples");
        if (skipReasons.length) {
            skippedMaps.push(mapId);
            skippedMapReasons[mapId] = skipReasons;
            return;
        }

        const candidate = buildMapCandidate({
            baselineConfig,
            mapId,
            samples: mapSamples,
            priorSampleEquivalent,
            maxBlendWeight
        });
        candidateConfig.maps[mapId] = {
            ...(candidateConfig.maps[mapId] || {}),
            alpha_counts: cloneValue(candidate.alpha_counts),
            solver: {
                ...(candidateConfig.maps[mapId].solver || {}),
                count_prior_strength: candidate.count_prior_strength
            }
        };
        appliedMaps.push(mapId);
        selectedMaps[mapId] = candidate;
    });

    const lowSampleMaps = Object.entries(selectedMaps)
        .filter(([, entry]) => entry.sample_count < minSamples)
        .map(([mapId]) => mapId)
        .sort();
    const adoptionBlockers = [
        "manual_count_prior_shadow_candidate_not_default",
        "replay_gate_required_before_default_update"
    ];
    if (!appliedMaps.length) adoptionBlockers.push("missing_accepted_manual_count_fit_samples");
    if (lowSampleMaps.length) adoptionBlockers.push("map_sample_count_below_minimum");

    candidateConfig.manual_count_prior_shadow_candidate = {
        schema_version: "ak_manual_count_prior_shadow_candidate_config_v1",
        generated_at: generatedAt || reviewImport.generated_at || null,
        change_class: "RESEARCH_ONLY",
        usage: "shadow_replay_only",
        source_review_import: formatReportPath(sourceReviewImportPath),
        policy: "blend_manual_quality_ratios_preserve_baseline_alpha_total",
        prior_sample_equivalent: normalizePositiveNumber(priorSampleEquivalent, DEFAULT_PRIOR_SAMPLE_EQUIVALENT),
        max_blend_weight: normalizePositiveNumber(maxBlendWeight, DEFAULT_MAX_BLEND_WEIGHT),
        min_recommended_map_sample_count: minSamples,
        accepted_sample_count: samples.length,
        applied_maps: Array.from(new Set(appliedMaps)).sort(),
        skipped_maps: Array.from(new Set(skippedMaps)).sort(),
        skipped_map_reasons: Object.fromEntries(
            Object.entries(skippedMapReasons).sort(([left], [right]) => left.localeCompare(right))
        ),
        low_sample_maps: lowSampleMaps,
        selected_maps: Object.fromEntries(
            Object.entries(selectedMaps).sort(([left], [right]) => left.localeCompare(right))
        ),
        adoption_blockers: adoptionBlockers,
        default_config_update_allowed: false
    };

    return candidateConfig;
}

function formatCounts(counts = {}) {
    return QUALITY_ORDER.map((quality) => `${quality}:${roundTo(counts[quality], 4)}`).join(" ");
}

function formatManualCountPriorShadowCandidateMarkdown(candidateConfig = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const meta = candidateConfig.manual_count_prior_shadow_candidate || {};
    const rows = Object.entries(meta.selected_maps || {}).map(([mapId, entry]) => [
        `\`${mapId}\``,
        `\`${entry.sample_count || 0}\``,
        `\`${entry.blend_weight || 0}\``,
        `\`${entry.count_prior_strength || "-"}\``,
        `\`${formatCounts(entry.alpha_counts || {})}\``,
        `\`${formatCounts(entry.aggregated_actual_counts || {})}\``
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));

    return [
        "# Manual Count Prior Shadow Candidate Config",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${meta.change_class || "RESEARCH_ONLY"}\``,
        `- Usage: \`${meta.usage || "shadow_replay_only"}\``,
        `- Accepted samples: \`${meta.accepted_sample_count || 0}\``,
        `- Default config update allowed: \`${meta.default_config_update_allowed === true}\``,
        `- Policy: \`${meta.policy || "blend_manual_quality_ratios_preserve_baseline_alpha_total"}\``,
        "",
        "| map | samples | blend weight | strength | candidate alpha counts | aggregated actual counts |",
        "| --- | ---: | ---: | ---: | --- | --- |",
        ...(rows.length ? rows : ["| - | 0 | 0 | - | - | - |"]),
        "",
        "## Adoption Blockers",
        ...((meta.adoption_blockers || []).length ? meta.adoption_blockers.map((blocker) => `- \`${blocker}\``) : ["- `none`"]),
        ""
    ].join("\n");
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const reviewImport = readJson(args.reviewImportPath);
    const candidateConfig = buildManualCountPriorShadowCandidateConfig({
        baselineConfig: defaultConfig,
        reviewImport,
        sourceReviewImportPath: args.reviewImportPath,
        generatedAt: args.generatedAt,
        priorSampleEquivalent: args.priorSampleEquivalent,
        maxBlendWeight: args.maxBlendWeight,
        minRecommendedMapSampleCount: args.minRecommendedMapSampleCount
    });
    writeJson(args.outputPath, candidateConfig);
    writeText(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatManualCountPriorShadowCandidateMarkdown(candidateConfig, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return candidateConfig;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_MAX_BLEND_WEIGHT,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PRIOR_SAMPLE_EQUIVALENT,
    DEFAULT_REVIEW_IMPORT_PATH,
    QUALITY_ORDER,
    blendAlphaCounts,
    buildManualCountPriorShadowCandidateConfig,
    buildMapCandidate,
    computeBlendWeight,
    formatManualCountPriorShadowCandidateMarkdown,
    main,
    normalizeEmpiricalAlphaCounts,
    resolveArgs
};
