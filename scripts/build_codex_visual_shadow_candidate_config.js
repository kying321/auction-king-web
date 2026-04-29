const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_GAP_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-candidate-posterior-gap.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-shadow-candidate-config.json"
);
const SHADOW_BLEND_SOURCE = "codex_visual_shadow_blend_not_adoptable";
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;
    let selectionPolicy = "best_blend";

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = argv[index];
        } else if (String(arg).startsWith("--generated-at=")) {
            generatedAt = String(arg).slice("--generated-at=".length);
        } else if (arg === "--selection-policy") {
            index += 1;
            if (!argv[index]) throw new Error("--selection-policy 需要提供策略名");
            selectionPolicy = String(argv[index]);
        } else if (String(arg).startsWith("--selection-policy=")) {
            selectionPolicy = String(arg).slice("--selection-policy=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        gapReportPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_GAP_REPORT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt,
        selectionPolicy
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

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}

function roundTo(value, digits = 6) {
    if (!Number.isFinite(Number(value))) return 0;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
}

function formatAlphaCounts(alphaCounts = {}) {
    return QUALITY_ORDER.map((quality) => `${quality}:${roundTo(alphaCounts[quality], 4)}`).join(" ");
}

function selectScenario(sample = {}, selectionPolicy = "best_blend") {
    const scenarios = sample.prior_sensitivity && Array.isArray(sample.prior_sensitivity.scenarios)
        ? sample.prior_sensitivity.scenarios
        : [];
    if (selectionPolicy !== "best_blend") {
        throw new Error(`unsupported selection policy: ${selectionPolicy}`);
    }
    return scenarios
        .filter((scenario) => scenario && scenario.source_classification === SHADOW_BLEND_SOURCE)
        .filter((scenario) => isPlainObject(scenario.alpha_counts))
        .filter((scenario) => Number.isFinite(Number(scenario.count_prior_strength)) && Number(scenario.count_prior_strength) > 0)
        .sort((left, right) => (
            (Number(left.total_abs_error) || Infinity) - (Number(right.total_abs_error) || Infinity)
            || String(left.id || "").localeCompare(String(right.id || ""))
        ))[0] || null;
}

function getSampleSkipReasons(sample = {}, scenario = null) {
    const reasons = [];
    const blockers = Array.isArray(sample.blockers) ? sample.blockers : [];
    if (!normalizeText(sample.map_id)) reasons.push("missing_map_id");
    if (sample.import_allowed === true) reasons.push("sample_import_allowed_not_visual_shadow");
    if (!blockers.includes("codex_visual_review_is_shadow_only")) {
        reasons.push("missing_codex_visual_shadow_blocker");
    }
    if (!scenario) reasons.push("missing_shadow_blend_scenario");
    return reasons;
}

function buildCodexVisualShadowCandidateConfig({
    baselineConfig = defaultConfig,
    gapReport = {},
    sourceGapReportPath = null,
    generatedAt = null,
    selectionPolicy = "best_blend"
} = {}) {
    const candidateConfig = cloneValue(baselineConfig);
    const appliedMaps = [];
    const skippedMaps = [];
    const skippedMapReasons = {};
    const selectedScenarios = {};

    const samples = Array.isArray(gapReport.samples) ? gapReport.samples : [];
    samples.forEach((sample) => {
        const mapId = normalizeText(sample.map_id);
        const scenario = selectScenario(sample, selectionPolicy);
        const skipReasons = getSampleSkipReasons(sample, scenario);
        if (!candidateConfig.maps || !candidateConfig.maps[mapId]) skipReasons.push("missing_map_config");

        if (skipReasons.length) {
            if (mapId) {
                skippedMaps.push(mapId);
                skippedMapReasons[mapId] = skipReasons;
            }
            return;
        }

        candidateConfig.maps[mapId] = {
            ...(candidateConfig.maps[mapId] || {}),
            alpha_counts: cloneValue(scenario.alpha_counts),
            solver: {
                ...(candidateConfig.maps[mapId].solver || {}),
                count_prior_strength: Number(scenario.count_prior_strength)
            }
        };
        appliedMaps.push(mapId);
        selectedScenarios[mapId] = {
            scenario_id: scenario.id || null,
            source_classification: scenario.source_classification,
            label: scenario.label || null,
            alpha_counts: cloneValue(scenario.alpha_counts),
            count_prior_strength: Number(scenario.count_prior_strength),
            total_abs_error: Number.isFinite(Number(scenario.total_abs_error)) ? Number(scenario.total_abs_error) : null,
            high_rarity_abs_error: Number.isFinite(Number(scenario.high_rarity_abs_error)) ? Number(scenario.high_rarity_abs_error) : null
        };
    });

    candidateConfig.codex_visual_shadow_candidate = {
        schema_version: "ak_codex_visual_shadow_candidate_config_v1",
        generated_at: generatedAt || gapReport.generated_at || null,
        change_class: "RESEARCH_ONLY",
        usage: "shadow_replay_only",
        source_gap_report: sourceGapReportPath,
        selection_policy: selectionPolicy,
        selected_source_classification: SHADOW_BLEND_SOURCE,
        applied_maps: Array.from(new Set(appliedMaps)).sort(),
        skipped_maps: Array.from(new Set(skippedMaps)).sort(),
        skipped_map_reasons: Object.fromEntries(
            Object.entries(skippedMapReasons).sort(([left], [right]) => left.localeCompare(right))
        ),
        selected_scenarios: Object.fromEntries(
            Object.entries(selectedScenarios).sort(([left], [right]) => left.localeCompare(right))
        ),
        adoption_blockers: [
            "codex_visual_review_shadow_only",
            "missing_human_confirmed_count_fit_sample",
            "single_visual_candidate_overfit_risk"
        ],
        default_config_update_allowed: false
    };

    return candidateConfig;
}

function formatCodexVisualShadowCandidateMarkdown(candidateConfig = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const meta = candidateConfig.codex_visual_shadow_candidate || {};
    const rows = Object.entries(meta.selected_scenarios || {}).map(([mapId, scenario]) => [
        `\`${mapId}\``,
        `\`${scenario.scenario_id || "-"}\``,
        `\`${scenario.count_prior_strength || "-"}\``,
        `\`${scenario.total_abs_error ?? "-"}\``,
        `\`${scenario.high_rarity_abs_error ?? "-"}\``,
        `\`${formatAlphaCounts(scenario.alpha_counts || {})}\``
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));

    return [
        "# Codex Visual Shadow Candidate Config",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${meta.change_class || "RESEARCH_ONLY"}\``,
        `- Usage: \`${meta.usage || "shadow_replay_only"}\``,
        `- Default config update allowed: \`${meta.default_config_update_allowed === true}\``,
        `- Source classification: \`${meta.selected_source_classification || SHADOW_BLEND_SOURCE}\``,
        "",
        "| map | selected scenario | strength | total abs | high rarity abs | alpha counts |",
        "| --- | --- | --- | --- | --- | --- |",
        ...(rows.length ? rows : ["| - | - | - | - | - | - |"]),
        "",
        "## Adoption Blockers",
        ...(meta.adoption_blockers || []).map((blocker) => `- \`${blocker}\``),
        ""
    ].join("\n");
}

function main(argv = process.argv.slice(2)) {
    const { gapReportPath, outputPath, generatedAt, selectionPolicy } = resolveArgs(argv);
    const gapReport = readJson(gapReportPath);
    const candidateConfig = buildCodexVisualShadowCandidateConfig({
        baselineConfig: defaultConfig,
        gapReport,
        sourceGapReportPath: gapReportPath,
        generatedAt,
        selectionPolicy
    });
    writeJson(outputPath, candidateConfig);
    writeText(outputPath.replace(/\.json$/i, ".md"), formatCodexVisualShadowCandidateMarkdown(candidateConfig, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return candidateConfig;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_GAP_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    SHADOW_BLEND_SOURCE,
    buildCodexVisualShadowCandidateConfig,
    formatCodexVisualShadowCandidateMarkdown,
    getSampleSkipReasons,
    main,
    resolveArgs,
    selectScenario
};
