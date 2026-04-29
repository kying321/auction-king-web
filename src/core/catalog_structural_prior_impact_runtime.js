const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("./default_config_bundle.js");
const { resolveEstimatorConfig } = require("./estimator.js");

const DEFAULT_PRIOR_PATH = path.join(process.cwd(), "docs", "research", "2026-04-27-catalog-structural-prior-report.json");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "docs", "research", "2026-04-27-catalog-structural-prior-impact-report.json");
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

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

function roundTo(value, digits = 4) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function classifyEvidence(prior = {}) {
    const strictReady = finiteNumber(prior.strict_ready_item_count) || 0;
    const weightedN = finiteNumber(prior.cells_per_item && prior.cells_per_item.weighted_candidate_effective_n) || 0;
    const missing = finiteNumber(prior.missing_cell_candidate_count) || 0;
    if (strictReady >= 10 && weightedN >= 40 && missing <= 5) return "strong_review_prior";
    if (strictReady >= 3 && weightedN >= 30) return "medium_shadow_prior";
    if (weightedN >= 20) return "weak_shadow_prior";
    return "insufficient_prior";
}

function buildBlockers(quality, prior = {}, evidenceClass, delta = null) {
    const blockers = [
        "structural_prior_is_not_authority",
        "manual_shape_review_required_before_config_merge"
    ];
    const strictReady = finiteNumber(prior.strict_ready_item_count) || 0;
    if (strictReady === 0) blockers.push("no_strict_ready_shapes_for_quality");
    if (quality === "r") blockers.push("red_catalog_tail_requires_manual_review");
    if (evidenceClass === "weak_shadow_prior" || evidenceClass === "insufficient_prior") {
        blockers.push("evidence_class_below_authority_threshold");
    }
    if (Number.isFinite(delta) && Math.abs(delta) >= 0.75) {
        blockers.push("large_config_delta_requires_shadow_replay");
    }
    return Array.from(new Set(blockers));
}

function compareQualityCells(mapId, quality, resolvedConfig = {}, prior = {}) {
    const configCells = resolvedConfig.cells_per_item && resolvedConfig.cells_per_item[quality]
        ? resolvedConfig.cells_per_item[quality]
        : {};
    const priorCells = prior.cells_per_item || {};
    const configMean = finiteNumber(configCells.mean);
    const configSd = finiteNumber(configCells.sd);
    const priorMean = finiteNumber(priorCells.weighted_candidate_mean);
    const priorSd = finiteNumber(priorCells.weighted_candidate_sd);
    const delta = Number.isFinite(configMean) && Number.isFinite(priorMean) ? roundTo(priorMean - configMean) : null;
    const deltaPct = Number.isFinite(delta) && Number.isFinite(configMean) && configMean !== 0
        ? roundTo(delta / configMean, 4)
        : null;
    const evidenceClass = classifyEvidence(prior);
    return {
        map_id: mapId,
        quality,
        current_config: {
            mean: configMean,
            sd: configSd,
            min: finiteNumber(configCells.min),
            max: finiteNumber(configCells.max)
        },
        structural_prior: {
            weighted_mean: priorMean,
            weighted_sd: priorSd,
            weighted_effective_n: finiteNumber(priorCells.weighted_candidate_effective_n),
            weighted_min: finiteNumber(priorCells.weighted_candidate_min),
            weighted_max: finiteNumber(priorCells.weighted_candidate_max),
            strict_ready_mean: finiteNumber(priorCells.strict_ready_mean),
            strict_ready_count: finiteNumber(prior.strict_ready_item_count) || 0,
            candidate_count: finiteNumber(prior.items_with_cell_candidate) || 0,
            missing_count: finiteNumber(prior.missing_cell_candidate_count) || 0
        },
        delta_prior_minus_config: delta,
        delta_pct_of_config: deltaPct,
        direction: !Number.isFinite(delta) || Math.abs(delta) < 0.05
            ? "aligned"
            : (delta > 0 ? "prior_higher_than_config" : "prior_lower_than_config"),
        evidence_class: evidenceClass,
        authority_merge_allowed: false,
        adoption_blockers: buildBlockers(quality, prior, evidenceClass, delta)
    };
}

function buildMapImpact(mapId, structuralPrior = {}, baseConfig = defaultConfig) {
    const resolved = resolveEstimatorConfig(baseConfig, mapId);
    const qualityRows = QUALITY_ORDER.map((quality) => compareQualityCells(
        mapId,
        quality,
        resolved,
        structuralPrior.quality_priors && structuralPrior.quality_priors[quality] ? structuralPrior.quality_priors[quality] : {}
    ));
    const deltas = qualityRows.map((row) => row.delta_prior_minus_config).filter(Number.isFinite);
    const largest = qualityRows
        .filter((row) => Number.isFinite(row.delta_prior_minus_config))
        .sort((left, right) => Math.abs(right.delta_prior_minus_config) - Math.abs(left.delta_prior_minus_config))[0] || null;
    return {
        map_id: mapId,
        authority_merge_allowed: false,
        largest_abs_delta_quality: largest ? largest.quality : null,
        largest_abs_delta: largest ? roundTo(Math.abs(largest.delta_prior_minus_config)) : null,
        mean_abs_delta: deltas.length
            ? roundTo(deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length)
            : null,
        quality_impacts: qualityRows
    };
}

function resolveMapIds(baseConfig = defaultConfig, requestedMapIds = []) {
    const available = Object.keys(baseConfig.maps || {}).sort();
    if (!requestedMapIds.length) return available;
    return requestedMapIds.filter((mapId) => available.includes(mapId));
}

function buildCatalogStructuralPriorImpactReport({
    structuralPrior = null,
    structuralPriorPath = null,
    baseConfig = defaultConfig,
    mapIds = []
} = {}) {
    const prior = structuralPrior || readJson(structuralPriorPath || DEFAULT_PRIOR_PATH);
    const resolvedMapIds = resolveMapIds(baseConfig, mapIds);
    const mapImpacts = resolvedMapIds.map((mapId) => buildMapImpact(mapId, prior, baseConfig));
    const allRows = mapImpacts.flatMap((entry) => entry.quality_impacts);
    const weakRows = allRows.filter((row) => row.evidence_class === "weak_shadow_prior" || row.evidence_class === "insufficient_prior");
    const largeRows = allRows.filter((row) => Number.isFinite(row.delta_prior_minus_config) && Math.abs(row.delta_prior_minus_config) >= 0.75);
    return {
        schema_version: "ak_catalog_structural_prior_impact_report_v1",
        change_class: "RESEARCH_ONLY",
        source_paths: {
            structural_prior_report: structuralPriorPath || null
        },
        guardrails: [
            "do_not_update_default_config_from_structural_prior",
            "strict_ready_shapes_required_before_authority_merge",
            "run_shadow_replay_before_adopting_cell_model_deltas"
        ],
        summary: {
            map_count: mapImpacts.length,
            quality_row_count: allRows.length,
            authority_merge_allowed: false,
            weak_or_insufficient_quality_rows: weakRows.length,
            large_delta_quality_rows: largeRows.length,
            largest_abs_delta: allRows
                .map((row) => Math.abs(row.delta_prior_minus_config))
                .filter(Number.isFinite)
                .sort((left, right) => right - left)[0] || null
        },
        map_impacts: mapImpacts,
        recommendations: [
            "先把 large_delta_quality_rows 作为 shadow replay 候选，不直接写默认配置。",
            "红色当前没有 strict ready 图鉴轮廓，需人工复核若干红色格形后再允许影响权威 cells_per_item。",
            "高金均格但缺金色数量的样本，应优先补金数或总格数；单靠格形先验不能消除红色残差不确定性。"
        ]
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const rows = (report.map_impacts || []).flatMap((mapImpact) => mapImpact.quality_impacts || []);
    const lines = [
        "# Catalog Structural Prior Impact Report",
        "",
        `- JSON: \`${path.relative(process.cwd(), outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Authority merge allowed: \`${report.summary ? report.summary.authority_merge_allowed : false}\``,
        `- Weak/insufficient rows: \`${report.summary ? report.summary.weak_or_insufficient_quality_rows : 0}\``,
        `- Large delta rows: \`${report.summary ? report.summary.large_delta_quality_rows : 0}\``,
        "",
        "| map | quality | config mean | prior mean | delta | evidence | strict ready | weighted n | blockers |",
        "| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |"
    ];
    rows.forEach((row) => {
        lines.push(`| ${[
            row.map_id,
            row.quality,
            row.current_config.mean,
            row.structural_prior.weighted_mean,
            row.delta_prior_minus_config,
            row.evidence_class,
            row.structural_prior.strict_ready_count,
            row.structural_prior.weighted_effective_n,
            (row.adoption_blockers || []).join(", ")
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

function writeCatalogStructuralPriorImpactReport(report, outputPath = DEFAULT_OUTPUT_PATH) {
    writeJson(outputPath, report);
    const markdownPath = outputPath.replace(/\.json$/i, ".md");
    writeText(markdownPath, formatMarkdownReport(report, outputPath));
    return markdownPath;
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PRIOR_PATH,
    QUALITY_ORDER,
    buildCatalogStructuralPriorImpactReport,
    buildMapImpact,
    compareQualityCells,
    formatMarkdownReport,
    resolveMapIds,
    writeCatalogStructuralPriorImpactReport
};
