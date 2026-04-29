const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");

const DEFAULT_STRATEGY_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-architecture-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-candidate-config.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        strategyReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_STRATEGY_REPORT_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getCandidateConfigSkipReasons(entry = {}, mapConfig = null) {
    const gates = isPlainObject(entry && entry.gates) ? entry.gates : {};
    const alphaCounts = isPlainObject(entry && entry.alpha_counts_candidate)
        ? entry.alpha_counts_candidate
        : null;
    const reasons = [];
    if (!mapConfig) reasons.push("missing_map_config");
    if (gates.sim_replay_candidate !== true) reasons.push("not_sim_replay_candidate");
    if (!alphaCounts) reasons.push("missing_alpha_counts_candidate");
    if (gates.candidate_replay_passed === false) reasons.push("candidate_replay_regressed_baseline");
    if (gates.count_fit_readiness_passed === false) reasons.push("count_fit_readiness_failed");
    return reasons;
}

function buildProducerStrategyCandidateConfig({
    baselineConfig = defaultConfig,
    strategyReport = {},
    sourceReportPath = null,
    generatedAt = new Date().toISOString()
} = {}) {
    const candidateConfig = cloneValue(baselineConfig);
    const appliedMaps = [];
    const skippedMaps = [];
    const skippedMapReasons = {};

    Object.entries(strategyReport.maps || {}).forEach(([mapId, entry]) => {
        const gates = isPlainObject(entry && entry.gates) ? entry.gates : {};
        const alphaCounts = isPlainObject(entry && entry.alpha_counts_candidate)
            ? entry.alpha_counts_candidate
            : null;
        const mapConfig = candidateConfig.maps && candidateConfig.maps[mapId];
        const skipReasons = getCandidateConfigSkipReasons(entry, mapConfig);
        if (skipReasons.length) {
            skippedMaps.push(mapId);
            skippedMapReasons[mapId] = skipReasons;
            return;
        }

        mapConfig.alpha_counts = cloneValue(alphaCounts);
        if (!isPlainObject(mapConfig.solver)) mapConfig.solver = {};
        const strength = Number(entry.count_prior_strength_candidate);
        if (Number.isFinite(strength) && strength > 0) {
            mapConfig.solver.count_prior_strength = strength;
        }
        appliedMaps.push(mapId);
    });

    candidateConfig.producer_strategy_candidate = {
        schema_version: "ak_producer_strategy_candidate_config_v1",
        generated_at: generatedAt,
        change_class: "RESEARCH_ONLY",
        usage: "shadow_replay_only",
        source_report: sourceReportPath,
        applied_maps: appliedMaps.sort(),
        skipped_maps: skippedMaps.sort(),
        skipped_map_reasons: Object.fromEntries(Object.entries(skippedMapReasons).sort(([left], [right]) => left.localeCompare(right))),
        replay_guard: "skip_candidate_replay_passed_false",
        count_fit_readiness_guard: "skip_count_fit_readiness_passed_false",
        default_config_update_allowed: false
    };

    return candidateConfig;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { strategyReportPath, outputPath } = resolveArgs(argv);
    const strategyReport = JSON.parse(fs.readFileSync(strategyReportPath, "utf8"));
    const candidateConfig = buildProducerStrategyCandidateConfig({
        baselineConfig: defaultConfig,
        strategyReport,
        sourceReportPath: strategyReportPath
    });
    writeJson(outputPath, candidateConfig);
    process.stdout.write(`${outputPath}\n`);
    return candidateConfig;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_STRATEGY_REPORT_PATH,
    buildProducerStrategyCandidateConfig,
    getCandidateConfigSkipReasons,
    main,
    resolveArgs
};
