const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildCaptureObservationPriorScanReport
} = require("./build_capture_observation_prior_scan_report.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INTAKE_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-package-intake-report.json");
const DEFAULT_IMPACT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-structural-prior-impact-report.json");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-structural-cell-shadow-replay-report.json");
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;
    argv.forEach((arg) => {
        const value = String(arg);
        if (value.startsWith("--generated-at=")) {
            generatedAt = value.slice("--generated-at=".length);
            return;
        }
        positional.push(value);
    });
    if (positional.length > 3) {
        throw new Error("最多只接受 3 个位置参数: <intake.json> <impact.json> [output.json]");
    }
    return {
        intakePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_INTAKE_PATH,
        impactPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_IMPACT_PATH,
        outputPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_OUTPUT_PATH,
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

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function isMediumOrBetter(row = {}) {
    return row.evidence_class === "medium_shadow_prior" || row.evidence_class === "strong_review_prior";
}

function getMapImpact(impactReport = {}, mapId) {
    return (impactReport.map_impacts || []).find((entry) => entry.map_id === mapId) || null;
}

function buildCellScenarioDefinitions(mapImpact = {}) {
    const rows = Array.isArray(mapImpact.quality_impacts) ? mapImpact.quality_impacts : [];
    return [
        {
            id: "current_default_cells",
            label: "current default cells",
            included_qualities: [],
            include_weak_red: false,
            adoption_allowed: false
        },
        {
            id: "structural_medium_cells",
            label: "structural medium-prior cells",
            included_qualities: rows.filter((row) => isMediumOrBetter(row)).map((row) => row.quality),
            include_weak_red: false,
            adoption_allowed: false
        },
        {
            id: "structural_medium_plus_red_weak_cells",
            label: "structural medium + weak red cells",
            included_qualities: rows.filter((row) => isMediumOrBetter(row) || row.quality === "r").map((row) => row.quality),
            include_weak_red: true,
            adoption_allowed: false
        }
    ];
}

function buildScenarioConfig(baseConfig = defaultConfig, mapImpact = {}, scenario = {}) {
    const next = cloneValue(baseConfig);
    const mapId = mapImpact.map_id;
    if (!mapId || !next.maps || !next.maps[mapId]) return next;
    const rowsByQuality = Object.fromEntries((mapImpact.quality_impacts || []).map((row) => [row.quality, row]));
    next.maps[mapId].cells_per_item = cloneValue(next.maps[mapId].cells_per_item || {});
    QUALITY_ORDER.forEach((quality) => {
        if (!(scenario.included_qualities || []).includes(quality)) return;
        const row = rowsByQuality[quality];
        const prior = row && row.structural_prior ? row.structural_prior : {};
        const current = next.maps[mapId].cells_per_item[quality] || {};
        const mean = Number(prior.weighted_mean);
        const sd = Number(prior.weighted_sd);
        if (!Number.isFinite(mean) || mean <= 0) return;
        next.maps[mapId].cells_per_item[quality] = {
            ...current,
            mean: roundTo(mean, 4),
            sd: Number.isFinite(sd) && sd > 0 ? roundTo(sd, 4) : current.sd,
            min: current.min === undefined ? 1 : current.min,
            max: current.max === undefined ? null : current.max
        };
    });
    return next;
}

function extractCurrentDefaultScan(scanReport = {}) {
    return (scanReport.scenario_summaries || []).find((entry) => entry.id === "current_default") || null;
}

function summarizeScenario(mapImpact = {}, scenario = {}, scanSummary = {}, baselineSummary = {}) {
    const flagCounts = scanSummary.flag_counts || {};
    const baselineRisk = Number(baselineSummary.risk_score);
    const risk = Number(scanSummary.risk_score);
    return {
        id: scenario.id,
        label: scenario.label,
        map_id: mapImpact.map_id,
        included_qualities: scenario.included_qualities,
        adoption_allowed: false,
        adoption_blockers: [
            "capture_observations_lack_manual_actual_counts",
            "structural_cells_are_shadow_only",
            scenario.include_weak_red ? "red_shape_prior_is_weak" : null,
            "requires_count_fit_replay_with_authority_samples"
        ].filter(Boolean),
        risk_score: roundTo(risk, 4),
        risk_delta_from_baseline: Number.isFinite(risk) && Number.isFinite(baselineRisk) ? roundTo(risk - baselineRisk, 4) : null,
        max_red_count_mean: scanSummary.max_red_count_mean ?? null,
        avg_red_count_mean: scanSummary.avg_red_count_mean ?? null,
        max_red_cell_mean: scanSummary.max_red_cell_mean ?? null,
        avg_mean_value_w: scanSummary.avg_mean_value_w ?? null,
        residual_risk_count: flagCounts.red_residual_sensitive_to_missing_orange_count || 0,
        red_extreme_count: flagCounts.model_predicted_red_count_extreme || 0,
        red_cell_extreme_count: flagCounts.model_predicted_red_cells_extreme || 0,
        solve_failed_count: scanSummary.solve_failed_count || 0,
        flag_counts: flagCounts
    };
}

function collectMapIds(intakeReport = {}, impactReport = {}) {
    const fromIntake = new Set((intakeReport.entries || []).map((entry) => entry.map_id || "sunken_ship"));
    return (impactReport.map_impacts || [])
        .map((entry) => entry.map_id)
        .filter((mapId) => fromIntake.has(mapId))
        .sort();
}

function buildCatalogStructuralCellShadowReplayReport({
    intakeReport = {},
    impactReport = {},
    baseConfig = defaultConfig,
    generatedAt = null,
    paths = {}
} = {}) {
    const mapIds = collectMapIds(intakeReport, impactReport);
    const scenarioReports = [];
    mapIds.forEach((mapId) => {
        const mapImpact = getMapImpact(impactReport, mapId);
        const scenarios = buildCellScenarioDefinitions(mapImpact);
        const scans = scenarios.map((scenario) => {
            const scenarioConfig = buildScenarioConfig(baseConfig, mapImpact, scenario);
            const scan = buildCaptureObservationPriorScanReport({
                intakeReport,
                baseConfig: scenarioConfig,
                generatedAt,
                paths: { inputPath: paths.intakePath || null }
            });
            return { scenario, scanSummary: extractCurrentDefaultScan(scan) };
        });
        const baselineSummary = scans.find((entry) => entry.scenario.id === "current_default_cells").scanSummary || {};
        scans.forEach((entry) => {
            scenarioReports.push(summarizeScenario(mapImpact, entry.scenario, entry.scanSummary || {}, baselineSummary));
        });
    });
    scenarioReports.sort((left, right) => (left.risk_score ?? Infinity) - (right.risk_score ?? Infinity) || left.id.localeCompare(right.id));
    return {
        schema_version: "ak_catalog_structural_cell_shadow_replay_v1",
        generated_at: generatedAt || intakeReport.generated_at || null,
        change_class: "RESEARCH_ONLY",
        source_paths: {
            capture_intake_report: paths.intakePath || null,
            structural_prior_impact_report: paths.impactPath || null
        },
        guardrails: [
            "do_not_update_default_config_from_shadow_cell_replay",
            "capture_observations_are_not_training_labels",
            "red_weak_shape_prior_cannot_be_authority"
        ],
        summary: {
            map_count: mapIds.length,
            scenario_count: scenarioReports.length,
            training_label_allowed_count: intakeReport.summary
                ? Number(intakeReport.summary.training_label_allowed_count) || 0
                : 0,
            best_shadow_scenario_id: scenarioReports[0] ? scenarioReports[0].id : null,
            best_shadow_risk_score: scenarioReports[0] ? scenarioReports[0].risk_score : null,
            baseline_risk_score: scenarioReports.find((scenario) => scenario.id === "current_default_cells")?.risk_score ?? null,
            authority_merge_allowed: false
        },
        scenarios: scenarioReports,
        recommendations: [
            "结构格形先验当前更适合做诊断，不适合直接合并配置。",
            "若 structural_medium_cells 改善有限，说明红色离谱主要不是格形均值，而是缺金色数量时的残差归因问题。",
            "下一步优先收集带实际六品质数量的结算样本，尤其补金色数量或总格数。"
        ]
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const lines = [
        "# Catalog Structural Cell Shadow Replay",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Authority merge allowed: \`${report.summary ? report.summary.authority_merge_allowed : false}\``,
        `- Best shadow scenario: \`${report.summary ? report.summary.best_shadow_scenario_id : "-"}\``,
        "",
        "| scenario | map | included qualities | risk | delta | max red | avg red | residual risk | red extreme | red cells extreme |",
        "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    ];
    (report.scenarios || []).forEach((scenario) => {
        lines.push(`| ${[
            scenario.id,
            scenario.map_id,
            (scenario.included_qualities || []).join(", ") || "-",
            scenario.risk_score,
            scenario.risk_delta_from_baseline,
            scenario.max_red_count_mean,
            scenario.avg_red_count_mean,
            scenario.residual_risk_count,
            scenario.red_extreme_count,
            scenario.red_cell_extreme_count
        ].map(markdownCell).join(" | ")} |`);
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
    const args = resolveArgs(argv);
    const intakeReport = readJson(args.intakePath);
    const impactReport = readJson(args.impactPath);
    const report = buildCatalogStructuralCellShadowReplayReport({
        intakeReport,
        impactReport,
        generatedAt: args.generatedAt,
        paths: {
            intakePath: args.intakePath,
            impactPath: args.impactPath
        }
    });
    writeJson(args.outputPath, report);
    const markdownPath = args.outputPath.replace(/\.json$/i, ".md");
    writeText(markdownPath, formatMarkdownReport(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n${markdownPath}\n`);
    return report;
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_IMPACT_PATH,
    DEFAULT_INTAKE_PATH,
    DEFAULT_OUTPUT_PATH,
    buildCatalogStructuralCellShadowReplayReport,
    buildCellScenarioDefinitions,
    buildScenarioConfig,
    formatMarkdownReport,
    main,
    resolveArgs
};
