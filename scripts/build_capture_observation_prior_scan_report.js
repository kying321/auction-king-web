const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { AuctionKingEstimator, resolveEstimatorConfig } = require("../src/core/estimator.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-capture-package-intake-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-capture-observation-prior-scan-report.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const SCAN_MC_SAMPLES = 256;

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 缺少值");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }
    if (positional.length > 2) {
        throw new Error("最多只接受 2 个位置参数: <capture-intake.json> [output.json]");
    }
    return {
        inputPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_INPUT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt
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

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function sumQualityValues(values = {}) {
    return QUALITY_ORDER.reduce((sum, quality) => sum + (Number(values[quality]) || 0), 0);
}

function normalizeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function stableHash(text) {
    let hash = 2166136261;
    const raw = String(text || "");
    for (let index = 0; index < raw.length; index += 1) {
        hash ^= raw.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function createSeededRandom(seedText) {
    let state = stableHash(seedText) || 1;
    return () => {
        state = Math.imul(1664525, state) + 1013904223;
        return ((state >>> 0) + 0.5) / 4294967296;
    };
}

function withDeterministicRandom(seedText, fn) {
    const originalRandom = Math.random;
    Math.random = createSeededRandom(seedText);
    try {
        return fn();
    } finally {
        Math.random = originalRandom;
    }
}

function getBaselineAlphaCounts(config = defaultConfig, mapId) {
    const resolved = resolveEstimatorConfig(config, mapId);
    const source = resolved && isPlainObject(resolved.alpha_counts) ? resolved.alpha_counts : {};
    return QUALITY_ORDER.reduce((result, quality) => {
        const numeric = Number(source[quality]);
        result[quality] = Number.isFinite(numeric) && numeric > 0 ? numeric : 0.01;
        return result;
    }, {});
}

function getBaselineStrength(config = defaultConfig, mapId) {
    const resolved = resolveEstimatorConfig(config, mapId);
    const numeric = Number(resolved && resolved.solver && resolved.solver.count_prior_strength);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function applyAlphaMultipliers(alpha = {}, multipliers = {}) {
    const baselineTotal = sumQualityValues(alpha);
    const scaled = QUALITY_ORDER.reduce((result, quality) => {
        const base = Number(alpha[quality]) || 0.01;
        const multiplier = Number(multipliers[quality]);
        result[quality] = Math.max(0.01, base * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1));
        return result;
    }, {});
    const scaledTotal = sumQualityValues(scaled);
    if (baselineTotal <= 0 || scaledTotal <= 0) return scaled;
    return QUALITY_ORDER.reduce((result, quality) => {
        result[quality] = roundTo(scaled[quality] / scaledTotal * baselineTotal, 6);
        return result;
    }, {});
}

function buildScenarioDefinitionsForMap(mapId, config = defaultConfig) {
    const baselineAlpha = getBaselineAlphaCounts(config, mapId);
    const baselineStrength = getBaselineStrength(config, mapId);
    const definitions = [{
        id: "current_default",
        label: "current default",
        source_classification: "current_default_observation",
        count_prior_strength: baselineStrength,
        alpha_counts: baselineAlpha
    }];

    [6, 8, 10, 12].forEach((strength) => {
        if (strength === baselineStrength) return;
        definitions.push({
            id: `baseline_alpha_strength_${strength}`,
            label: `baseline alpha, strength ${strength}`,
            source_classification: "prior_hardness_shadow",
            count_prior_strength: strength,
            alpha_counts: baselineAlpha
        });
    });

    [
        {
            id: "red_half_strength_8",
            label: "red half, strength 8",
            source_classification: "red_tail_rarity_shadow",
            count_prior_strength: 8,
            multipliers: { r: 0.5 }
        },
        {
            id: "red_035_orange_purple_up_strength_8",
            label: "red 0.35, orange/purple up, strength 8",
            source_classification: "red_tail_rarity_shadow",
            count_prior_strength: 8,
            multipliers: { p: 1.1, o: 1.25, r: 0.35 }
        },
        {
            id: "red_quarter_high_prior_strength_10",
            label: "red quarter, high prior, strength 10",
            source_classification: "residual_caution_shadow",
            count_prior_strength: 10,
            multipliers: { b: 1.05, p: 1.15, o: 1.35, r: 0.25 }
        },
        {
            id: "red_low_residual_caution_strength_12",
            label: "red low, residual caution, strength 12",
            source_classification: "residual_caution_shadow",
            count_prior_strength: 12,
            multipliers: { b: 1.1, p: 1.25, o: 1.4, r: 0.2 }
        }
    ].forEach((entry) => {
        definitions.push({
            id: entry.id,
            label: entry.label,
            source_classification: entry.source_classification,
            count_prior_strength: entry.count_prior_strength,
            alpha_counts: applyAlphaMultipliers(baselineAlpha, entry.multipliers)
        });
    });

    return definitions;
}

function buildScenarioConfig(baseConfig = defaultConfig, mapId, scenario = {}) {
    const next = cloneValue(baseConfig);
    if (!next.maps || !next.maps[mapId]) return next;
    next.maps[mapId] = {
        ...(next.maps[mapId] || {}),
        alpha_counts: cloneValue(scenario.alpha_counts || {}),
        solver: {
            ...(next.maps[mapId].solver || {}),
            count_prior_strength: Number(scenario.count_prior_strength) || 1
        }
    };
    next.solver = {
        ...(next.solver || {}),
        mc_samples: SCAN_MC_SAMPLES
    };
    return next;
}

function inferResidualFlags(entry = {}, scenarioResult = {}) {
    const diagnostics = isPlainObject(entry.constraint_diagnostics) ? entry.constraint_diagnostics : {};
    const redMean = normalizeNumber(scenarioResult.red_count_mean);
    const redCellMean = normalizeNumber(scenarioResult.red_cell_mean);
    const totalItems = normalizeNumber(diagnostics.total_items ?? entry.field_values_compact?.total_items);
    const flags = [];
    if (Number.isFinite(redMean) && redMean >= 8) flags.push("model_predicted_red_count_extreme");
    if (Number.isFinite(redCellMean) && redCellMean >= 30) flags.push("model_predicted_red_cells_extreme");
    if (Number.isFinite(redMean) && Number.isFinite(totalItems) && totalItems > 0 && redMean / totalItems >= 0.25) {
        flags.push("model_red_share_above_25pct");
    }
    if (
        diagnostics.orange_count_missing === true
        && Number.isFinite(diagnostics.orange_avg_cells)
        && diagnostics.orange_avg_cells >= 8
    ) {
        flags.push("extreme_orange_avg_needs_orange_count_confirmation");
    }
    if (
        diagnostics.orange_count_missing === true
        && Number.isFinite(diagnostics.orange_red_unknown_pool)
        && diagnostics.orange_red_unknown_pool >= 6
        && Number.isFinite(redMean)
        && redMean >= diagnostics.orange_red_unknown_pool * 0.45
    ) {
        flags.push("red_residual_sensitive_to_missing_orange_count");
    }
    return flags;
}

function evaluateScenarioForEntry(entry = {}, scenario = {}, baseConfig = defaultConfig) {
    const mapId = entry.map_id || "sunken_ship";
    const observedState = isPlainObject(entry.observed_state) ? entry.observed_state : {};
    const scenarioConfig = buildScenarioConfig(baseConfig, mapId, scenario);
    const resolved = resolveEstimatorConfig(scenarioConfig, mapId);
    const result = withDeterministicRandom(`${scenario.id}|${entry.basename || entry.exported_at || "capture"}`, () => (
        new AuctionKingEstimator(resolved, observedState).recompute()
    ));

    if (result.error) {
        return {
            capture: entry.basename || entry.exported_at || null,
            exported_at: entry.exported_at || null,
            map_id: mapId,
            error: true,
            messages: Array.isArray(result.messages) ? result.messages.slice() : ["unknown_error"],
            risk_flags: ["scenario_solve_failed"]
        };
    }

    const redCountMean = roundTo(result.summary.count_means.r, 6);
    const redCellMean = roundTo(result.summary.cell_means.r, 6);
    const output = {
        capture: entry.basename || entry.exported_at || null,
        exported_at: entry.exported_at || null,
        map_id: mapId,
        error: false,
        red_count_mean: redCountMean,
        red_cell_mean: redCellMean,
        orange_count_mean: roundTo(result.summary.count_means.o, 6),
        purple_count_mean: roundTo(result.summary.count_means.p, 6),
        mean_value_w: roundTo((result.valuation && result.valuation.mean_value ? result.valuation.mean_value : 0) / 10000, 4),
        q25_value_w: roundTo((result.valuation && result.valuation.q25 ? result.valuation.q25 : 0) / 10000, 4),
        q50_value_w: roundTo((result.valuation && result.valuation.q50 ? result.valuation.q50 : 0) / 10000, 4),
        orange_red_unknown_pool: normalizeNumber(entry.constraint_diagnostics?.orange_red_unknown_pool),
        orange_avg_cells: normalizeNumber(entry.constraint_diagnostics?.orange_avg_cells)
    };
    output.risk_flags = inferResidualFlags(entry, output);
    return output;
}

function countFlags(results = []) {
    return results.reduce((counts, result) => {
        (Array.isArray(result.risk_flags) ? result.risk_flags : []).forEach((flag) => {
            counts[flag] = (counts[flag] || 0) + 1;
        });
        return counts;
    }, {});
}

function summarizeScenarioResults(scenario = {}, results = []) {
    const nonError = results.filter((result) => !result.error);
    const redMeans = nonError.map((result) => result.red_count_mean).filter(Number.isFinite);
    const redCellMeans = nonError.map((result) => result.red_cell_mean).filter(Number.isFinite);
    const values = nonError.map((result) => result.mean_value_w).filter(Number.isFinite);
    const flagCounts = countFlags(results);
    const riskScore = (
        (flagCounts.model_predicted_red_count_extreme || 0) * 25
        + (flagCounts.red_residual_sensitive_to_missing_orange_count || 0) * 30
        + (flagCounts.model_predicted_red_cells_extreme || 0) * 15
        + (flagCounts.model_red_share_above_25pct || 0) * 15
        + (flagCounts.scenario_solve_failed || 0) * 100
        + (redMeans.length ? Math.max(...redMeans) * 2 : 0)
    );
    return {
        id: scenario.id,
        label: scenario.label,
        source_classification: scenario.source_classification,
        alpha_counts: cloneValue(scenario.alpha_counts),
        count_prior_strength: scenario.count_prior_strength,
        sample_count: results.length,
        solve_failed_count: results.filter((result) => result.error).length,
        flag_counts: flagCounts,
        max_red_count_mean: redMeans.length ? roundTo(Math.max(...redMeans), 6) : null,
        avg_red_count_mean: redMeans.length ? roundTo(redMeans.reduce((sum, value) => sum + value, 0) / redMeans.length, 6) : null,
        max_red_cell_mean: redCellMeans.length ? roundTo(Math.max(...redCellMeans), 6) : null,
        avg_mean_value_w: values.length ? roundTo(values.reduce((sum, value) => sum + value, 0) / values.length, 4) : null,
        risk_score: roundTo(riskScore, 4),
        adoption_allowed: false,
        adoption_blockers: [
            "capture_observations_lack_manual_actual_counts",
            "scenario_scan_is_shadow_only",
            "requires_authority_count_fit_replay"
        ]
    };
}

function collectMapIds(entries = []) {
    return Array.from(new Set(entries.map((entry) => entry.map_id || "sunken_ship"))).sort();
}

function buildCaptureObservationPriorScanReport({
    intakeReport = {},
    baseConfig = defaultConfig,
    generatedAt = null,
    paths = {}
} = {}) {
    const entries = Array.isArray(intakeReport.entries) ? intakeReport.entries : [];
    const mapIds = collectMapIds(entries);
    const scenarios = mapIds.flatMap((mapId) => buildScenarioDefinitionsForMap(mapId, baseConfig)
        .map((scenario) => ({ ...scenario, map_id: mapId })));
    const scenarioReports = scenarios.map((scenario) => {
        const mapEntries = entries.filter((entry) => (entry.map_id || "sunken_ship") === scenario.map_id);
        const results = mapEntries.map((entry) => evaluateScenarioForEntry(entry, scenario, baseConfig));
        return {
            ...summarizeScenarioResults(scenario, results),
            map_id: scenario.map_id,
            entries: results
        };
    }).sort((left, right) => left.risk_score - right.risk_score || left.id.localeCompare(right.id));

    return {
        schema_version: "ak_capture_observation_prior_scan_v1",
        generated_at: generatedAt || intakeReport.generated_at || null,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        source_paths: {
            capture_intake_report: paths.inputPath || null
        },
        guardrails: [
            "capture_observations_are_not_training_labels",
            "do_not_update_default_config_from_prior_scan",
            "manual_actual_counts_required_before_fit",
            "ranking_minimizes_red_residual_risk_not_true_error"
        ],
        summary: {
            capture_package_count: entries.length,
            map_count: mapIds.length,
            scenario_count: scenarioReports.length,
            training_label_allowed_count: intakeReport.summary
                ? Number(intakeReport.summary.training_label_allowed_count) || 0
                : 0,
            best_shadow_scenario_id: scenarioReports[0] ? scenarioReports[0].id : null,
            best_shadow_risk_score: scenarioReports[0] ? scenarioReports[0].risk_score : null,
            baseline_risk_score: scenarioReports.find((scenario) => scenario.id === "current_default")?.risk_score ?? null
        },
        scenario_summaries: scenarioReports.map((scenario) => {
            const { entries: omittedEntries, ...summary } = scenario;
            return summary;
        }),
        scenarios: scenarioReports,
        recommendations: [
            "先把 residual risk 警告接到 UI，不直接改默认爆率。",
            "用户补 orange_count、red_count、total_storage_cells 或最终六品质数量后，再进入 manual count-fit replay。",
            "如果人工标签仍显示同向红色过估，再把最优 shadow scenario 转为候选配置并跑 shadow replay。",
            "对极端橙均格但缺橙数的样本，推荐优先追问橙数，因为这是决定红色残差的关键字段。"
        ]
    };
}

function formatScenarioRow(scenario = {}) {
    const flags = scenario.flag_counts || {};
    return [
        `\`${scenario.id}\``,
        `\`${scenario.source_classification}\``,
        `\`${scenario.count_prior_strength}\``,
        `\`${scenario.risk_score}\``,
        `\`${scenario.max_red_count_mean ?? "-"}\``,
        `\`${scenario.avg_red_count_mean ?? "-"}\``,
        `\`${flags.red_residual_sensitive_to_missing_orange_count || 0}\``,
        `\`${flags.model_predicted_red_count_extreme || 0}\``,
        `\`${flags.model_predicted_red_cells_extreme || 0}\``,
        `\`${scenario.avg_mean_value_w ?? "-"}\``
    ].join(" | ");
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const lines = [];
    lines.push("# Capture Observation Prior Scan");
    lines.push("");
    lines.push(`- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``);
    lines.push(`- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``);
    lines.push(`- Capture packages: \`${report.summary ? report.summary.capture_package_count : 0}\``);
    lines.push(`- Training labels allowed: \`${report.summary ? report.summary.training_label_allowed_count : 0}\``);
    lines.push(`- Best shadow scenario: \`${report.summary ? report.summary.best_shadow_scenario_id : "-"}\``);
    lines.push("");
    lines.push("| scenario | source | strength | risk | max red | avg red | residual risk | red extreme | red cells extreme | avg value(w) |");
    lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    (report.scenario_summaries || []).forEach((scenario) => {
        lines.push(`| ${formatScenarioRow(scenario)} |`);
    });
    lines.push("");
    lines.push("## Guardrails");
    (report.guardrails || []).forEach((guardrail) => lines.push(`- \`${guardrail}\``));
    lines.push("");
    lines.push("## Next");
    (report.recommendations || []).forEach((recommendation) => lines.push(`- ${recommendation}`));
    lines.push("");
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const { inputPath, outputPath, generatedAt } = resolveArgs(argv);
    const intakeReport = readJson(inputPath);
    const report = buildCaptureObservationPriorScanReport({
        intakeReport,
        generatedAt,
        paths: { inputPath }
    });
    report.output_path = outputPath;
    writeJson(outputPath, report);
    writeText(outputPath.replace(/\.json$/i, ".md"), formatMarkdownReport(report, outputPath));
    process.stdout.write(`${outputPath}\n${outputPath.replace(/\.json$/i, ".md")}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_INPUT_PATH,
    DEFAULT_OUTPUT_PATH,
    QUALITY_ORDER,
    applyAlphaMultipliers,
    buildCaptureObservationPriorScanReport,
    buildScenarioDefinitionsForMap,
    createSeededRandom,
    formatMarkdownReport,
    inferResidualFlags,
    main,
    resolveArgs
};
