const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildPurpleWeightFitReport,
    normalizeSamples
} = require("../src/research/purple_weight_fit_report.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_SAMPLES_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-image-overlay-count-replay-samples.json"
);
const DEFAULT_ATLAS_SNAPSHOT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "manual_catalog_calibration_snapshot.json"
);
const DEFAULT_BASELINE_OVERRIDES_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-purple-weight-fit-baseline-overrides.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-purple-weight-fit-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        samplesPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_SAMPLES_PATH,
        atlasSnapshotPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_ATLAS_SNAPSHOT_PATH,
        baselineOverridesPath: argv[3] ? path.resolve(argv[2]) : null,
        outputPath: argv[3] ? path.resolve(argv[3]) : (argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH)
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath, fallback = {}) {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return readJson(filePath);
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getEffectiveBaselineOverridesPath(baselineOverridesPath = null) {
    if (baselineOverridesPath) return baselineOverridesPath;
    return fs.existsSync(DEFAULT_BASELINE_OVERRIDES_PATH) ? DEFAULT_BASELINE_OVERRIDES_PATH : null;
}

function applyBaselineOverrides(config, overrides = {}) {
    const next = cloneValue(config);
    Object.entries(overrides.maps || {}).forEach(([mapId, mapOverrides]) => {
        if (!next.maps || !next.maps[mapId]) return;
        next.maps[mapId] = {
            ...next.maps[mapId],
            alpha_counts: {
                ...(next.maps[mapId].alpha_counts || {}),
                ...((mapOverrides && mapOverrides.alpha_counts) || {})
            }
        };
    });
    if (next.calibration && next.calibration.maps) {
        Object.entries(next.calibration.maps).forEach(([mapId, mapCalibration]) => {
            if (!next.maps || !next.maps[mapId] || !mapCalibration.count_prior_calibration) return;
            if (mapCalibration.count_prior_calibration.authority_status !== "fallback_only") return;
            mapCalibration.count_prior_calibration.alpha_counts = cloneValue(next.maps[mapId].alpha_counts || {});
        });
    }
    return next;
}

function buildBaselineConfigSource(effectiveBaselineOverridesPath = null) {
    if (!effectiveBaselineOverridesPath) {
        return {
            kind: "default_config_bundle"
        };
    }
    return {
        kind: "default_config_plus_overrides",
        overrides_path: path.relative(process.cwd(), effectiveBaselineOverridesPath) || effectiveBaselineOverridesPath
    };
}

function resolveBaselineConfig(baselineOverridesPath = null) {
    const effectiveBaselineOverridesPath = getEffectiveBaselineOverridesPath(baselineOverridesPath);
    if (!effectiveBaselineOverridesPath) return cloneValue(defaultConfig);
    return applyBaselineOverrides(defaultConfig, readJson(effectiveBaselineOverridesPath));
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function compactMetric(metric = {}) {
    return [
        `n=${metric.sample_count ?? 0}`,
        `p=${metric.mean_actual_prob ?? "-"}`,
        `loss=${metric.mean_log_loss ?? "-"}`,
        `abs=${metric.mean_abs_error ?? "-"}`
    ].join(", ");
}

function formatPurpleWeightFitMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = (report.candidates || []).map((candidate) => {
        return `| ${[
            markdownCell(candidate.multiplier),
            markdownCell(candidate.red_mean_delta),
            markdownCell(candidate.objective_score),
            markdownCell(compactMetric(candidate.metrics && candidate.metrics.o)),
            markdownCell(compactMetric(candidate.metrics && candidate.metrics.r))
        ].join(" | ")} |`;
    }).join("\n");
    const recommendation = report.recommendation || {};

    return `# purple weight fit

- 变更类: \`${report.change_class}\`
- JSON: \`${jsonDisplayPath}\`
- adoption allowed: \`${report.adoption_allowed === true}\`
- selected default multiplier: \`${recommendation.selected_default_multiplier ?? "-"}\`
- near-double multiplier: \`${recommendation.near_double_multiplier ?? "-"}\`
- default change class: \`${recommendation.default_weight_change_class ?? "-"}\`
- baseline config source: \`${report.baseline_config_source && report.baseline_config_source.kind || "-"}\`

## Candidate scan

| multiplier | red mean delta | objective | orange metrics | red metrics |
| --- | --- | --- | --- | --- |
${rows || "| - | - | - | - | - |"}

## Evidence

- replay samples: \`${report.evidence_sources && report.evidence_sources.replay_sample_count || 0}\`
- red label samples: \`${report.evidence_sources && report.evidence_sources.red_label_sample_count || 0}\`
- orange label samples: \`${report.evidence_sources && report.evidence_sources.orange_label_sample_count || 0}\`
- blockers: \`${(report.adoption_blockers || []).join(", ") || "-"}\`

## Conclusion

${recommendation.conclusion || "-"}
`;
}

function main(argv = process.argv.slice(2)) {
    const { samplesPath, atlasSnapshotPath, baselineOverridesPath, outputPath } = resolveArgs(argv);
    const samples = normalizeSamples(readJson(samplesPath));
    const atlasSnapshot = readOptionalJson(atlasSnapshotPath, {});
    const effectiveBaselineOverridesPath = getEffectiveBaselineOverridesPath(baselineOverridesPath);
    const baselineConfig = resolveBaselineConfig(effectiveBaselineOverridesPath);
    const report = buildPurpleWeightFitReport({
        baselineConfig,
        baselineConfigSource: buildBaselineConfigSource(effectiveBaselineOverridesPath),
        samples,
        atlasSnapshot
    });
    writeJson(outputPath, report);
    fs.writeFileSync(outputPath.replace(/\.json$/i, ".md"), formatPurpleWeightFitMarkdown(report, outputPath), "utf8");
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ATLAS_SNAPSHOT_PATH,
    DEFAULT_BASELINE_OVERRIDES_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SAMPLES_PATH,
    buildBaselineConfigSource,
    formatPurpleWeightFitMarkdown,
    main,
    resolveBaselineConfig,
    resolveArgs
};
