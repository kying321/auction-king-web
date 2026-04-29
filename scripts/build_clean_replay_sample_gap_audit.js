const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");

const DEFAULT_REPLAY_SAMPLES_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-image-overlay-count-replay-samples.json"
);
const DEFAULT_SETTLEMENT_CANDIDATES_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-confirmed-settlement-samples.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-clean-replay-sample-gap-audit.json"
);
const TARGET_QUALITIES = ["o", "r"];
const DEFAULT_THRESHOLDS = {
    min_map_sample_count: 3,
    min_quality_sample_count: 2
};

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        replaySamplesPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_REPLAY_SAMPLES_PATH,
        settlementCandidatesPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_SETTLEMENT_CANDIDATES_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
    };
}

function normalizeInputPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object" && Array.isArray(payload.samples)) return payload.samples;
    return [];
}

function normalizePositiveInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

function hasActualCount(sample = {}, quality) {
    const actualCounts = sample && typeof sample.actual_counts === "object" ? sample.actual_counts : {};
    const numeric = Number(actualCounts[quality]);
    return Number.isInteger(numeric) && numeric >= 0;
}

function isUsableCleanReplaySample(sample = {}) {
    return Boolean(sample.map_id) && TARGET_QUALITIES.some((quality) => hasActualCount(sample, quality));
}

function isSettlementOnlyCandidate(candidate = {}) {
    return typeof candidate.status === "string" && candidate.status.includes("settlement_only");
}

function buildTargetMapList({ replaySamples = [], settlementCandidates = [], targetMaps = null } = {}) {
    const mapIds = new Set(Array.isArray(targetMaps) && targetMaps.length
        ? targetMaps
        : Object.keys(defaultConfig.maps || {}));
    replaySamples.forEach((sample) => {
        if (sample && sample.map_id) mapIds.add(sample.map_id);
    });
    settlementCandidates.forEach((candidate) => {
        if (candidate && candidate.map_id) mapIds.add(candidate.map_id);
    });
    return Array.from(mapIds).sort();
}

function buildMapGapEntry({
    mapId,
    replaySamples = [],
    settlementCandidates = [],
    thresholds = DEFAULT_THRESHOLDS
}) {
    const minMapSampleCount = normalizePositiveInteger(
        thresholds.min_map_sample_count,
        DEFAULT_THRESHOLDS.min_map_sample_count
    );
    const minQualitySampleCount = normalizePositiveInteger(
        thresholds.min_quality_sample_count,
        DEFAULT_THRESHOLDS.min_quality_sample_count
    );
    const cleanReplaySamples = replaySamples
        .filter((sample) => sample && sample.map_id === mapId)
        .filter(isUsableCleanReplaySample);
    const settlementOnlyCandidates = settlementCandidates
        .filter((candidate) => candidate && candidate.map_id === mapId)
        .filter(isSettlementOnlyCandidate);
    const qualitySampleCounts = {};
    const qualityGaps = {};

    TARGET_QUALITIES.forEach((quality) => {
        const count = cleanReplaySamples.filter((sample) => hasActualCount(sample, quality)).length;
        qualitySampleCounts[quality] = count;
        qualityGaps[quality] = Math.max(0, minQualitySampleCount - count);
    });

    const mapSampleGap = Math.max(0, minMapSampleCount - cleanReplaySamples.length);
    const riskFlags = [];
    if (mapSampleGap > 0) riskFlags.push("map_sample_count_below_minimum");
    Object.entries(qualityGaps).forEach(([quality, gap]) => {
        if (gap > 0) riskFlags.push(`${quality}_sample_count_below_minimum`);
    });
    if (settlementOnlyCandidates.length > 0) riskFlags.push("settlement_only_candidates_need_observed_state");

    return {
        map_id: mapId,
        clean_replay_sample_count: cleanReplaySamples.length,
        clean_replay_sample_ids: cleanReplaySamples.map((sample) => sample.id || null).filter(Boolean),
        quality_sample_counts: qualitySampleCounts,
        settlement_only_candidate_count: settlementOnlyCandidates.length,
        settlement_only_candidate_ids: settlementOnlyCandidates.map((candidate) => candidate.id || null).filter(Boolean),
        gaps: {
            map_samples: mapSampleGap,
            quality_samples: qualityGaps
        },
        can_adopt_default_weight: riskFlags.length === 0,
        recommended_change_class: riskFlags.length === 0 ? "SIM_ONLY" : "RESEARCH_ONLY",
        risk_flags: riskFlags
    };
}

function buildCleanReplaySampleGapAudit({
    replaySamples = [],
    settlementCandidates = [],
    targetMaps = null,
    thresholds = DEFAULT_THRESHOLDS
} = {}) {
    const normalizedReplaySamples = normalizeInputPayload(replaySamples);
    const normalizedSettlementCandidates = normalizeInputPayload(settlementCandidates);
    const targetMapList = buildTargetMapList({
        replaySamples: normalizedReplaySamples,
        settlementCandidates: normalizedSettlementCandidates,
        targetMaps
    });
    const maps = {};

    targetMapList.forEach((mapId) => {
        maps[mapId] = buildMapGapEntry({
            mapId,
            replaySamples: normalizedReplaySamples,
            settlementCandidates: normalizedSettlementCandidates,
            thresholds
        });
    });

    const mapEntries = Object.values(maps);
    return {
        schema_version: "ak_clean_replay_sample_gap_audit_v1",
        generated_at: new Date().toISOString(),
        thresholds: {
            min_map_sample_count: normalizePositiveInteger(
                thresholds.min_map_sample_count,
                DEFAULT_THRESHOLDS.min_map_sample_count
            ),
            min_quality_sample_count: normalizePositiveInteger(
                thresholds.min_quality_sample_count,
                DEFAULT_THRESHOLDS.min_quality_sample_count
            )
        },
        summary: {
            target_map_count: targetMapList.length,
            clean_replay_sample_count: normalizedReplaySamples.filter(isUsableCleanReplaySample).length,
            settlement_only_candidate_count: normalizedSettlementCandidates.filter(isSettlementOnlyCandidate).length,
            maps_ready_for_default_weight: mapEntries.filter((entry) => entry.can_adopt_default_weight).length,
            maps_needing_samples: mapEntries.filter((entry) => !entry.can_adopt_default_weight).map((entry) => entry.map_id)
        },
        maps
    };
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { replaySamplesPath, settlementCandidatesPath, outputPath } = resolveArgs(argv);
    const replaySamples = normalizeInputPayload(JSON.parse(fs.readFileSync(replaySamplesPath, "utf8")));
    const settlementCandidates = normalizeInputPayload(JSON.parse(fs.readFileSync(settlementCandidatesPath, "utf8")));
    const audit = buildCleanReplaySampleGapAudit({ replaySamples, settlementCandidates });
    writeJson(outputPath, audit);
    process.stdout.write(`${outputPath}\n`);
    return audit;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_REPLAY_SAMPLES_PATH,
    DEFAULT_SETTLEMENT_CANDIDATES_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_THRESHOLDS,
    TARGET_QUALITIES,
    buildCleanReplaySampleGapAudit,
    buildMapGapEntry,
    isSettlementOnlyCandidate,
    isUsableCleanReplaySample,
    main,
    normalizeInputPayload,
    resolveArgs
};
