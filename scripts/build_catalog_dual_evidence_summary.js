const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_ITEM_EXTRACTION_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-item-extraction-report.json");
const DEFAULT_STRUCTURAL_PRIOR_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-structural-prior-report.json");
const DEFAULT_IMPLEMENTATION_REPORT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-conservative-prior-implementation-report.json");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-dual-evidence-summary.json");
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const QUALITY_LABELS = { w: "white", g: "green", b: "blue", p: "purple", o: "orange", r: "red" };
const VALUE_TAIL_THRESHOLDS = {
    w: [300, 600],
    g: [1000, 2000],
    b: [5000, 10000],
    p: [15000, 25000],
    o: [50000, 100000, 150000],
    r: [200000, 500000, 1000000, 2000000, 5000000, 10000000]
};

function resolveArgs(argv = process.argv.slice(2)) {
    const result = {
        itemExtractionPath: DEFAULT_ITEM_EXTRACTION_PATH,
        structuralPriorPath: DEFAULT_STRUCTURAL_PRIOR_PATH,
        implementationReportPath: DEFAULT_IMPLEMENTATION_REPORT_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: "2026-04-27T12:30:00.000Z"
    };
    const positional = [];

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        const eqIndex = arg.indexOf("=");
        const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
        const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : null;
        const nextValue = () => {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flag} missing value`);
            if (inlineValue === null) index += 1;
            return String(value);
        };

        if (flag === "--item-extraction") {
            result.itemExtractionPath = path.resolve(nextValue());
        } else if (flag === "--structural-prior") {
            result.structuralPriorPath = path.resolve(nextValue());
        } else if (flag === "--implementation-report") {
            result.implementationReportPath = path.resolve(nextValue());
        } else if (flag === "--output") {
            result.outputPath = path.resolve(nextValue());
        } else if (flag === "--generated-at") {
            result.generatedAt = nextValue();
        } else {
            positional.push(arg);
        }
    }

    if (positional[0]) result.itemExtractionPath = path.resolve(positional[0]);
    if (positional[1]) result.structuralPriorPath = path.resolve(positional[1]);
    if (positional[2]) result.outputPath = path.resolve(positional[2]);
    if (positional.length > 3) {
        throw new Error("Usage: <item-extraction.json> <structural-prior.json> [output.json]");
    }
    return result;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath, fallback = null) {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return readJson(filePath);
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

function finiteNumbers(values = []) {
    return values.map(Number).filter(Number.isFinite);
}

function quantile(values = [], probability = 0.5) {
    const sorted = finiteNumbers(values).sort((left, right) => left - right);
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * Math.max(0, Math.min(1, probability));
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}

function summarizeNumeric(values = []) {
    const numbers = finiteNumbers(values);
    if (!numbers.length) {
        return { count: 0, min: null, p50: null, p90: null, p95: null, max: null, mean: null, sd: null };
    }
    const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    const variance = numbers.length > 1
        ? numbers.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (numbers.length - 1)
        : 0;
    return {
        count: numbers.length,
        min: Math.min(...numbers),
        p50: roundTo(quantile(numbers, 0.5), 4),
        p90: roundTo(quantile(numbers, 0.9), 4),
        p95: roundTo(quantile(numbers, 0.95), 4),
        max: Math.max(...numbers),
        mean: roundTo(mean, 4),
        sd: roundTo(Math.sqrt(variance), 4)
    };
}

function groupItemsByQuality(items = []) {
    const groups = Object.fromEntries(QUALITY_ORDER.map((quality) => [quality, []]));
    items.forEach((item) => {
        const quality = String(item && item.quality || "").toLowerCase();
        if (!groups[quality]) groups[quality] = [];
        groups[quality].push(item);
    });
    return groups;
}

function countBy(items = [], resolver) {
    return items.reduce((counts, item) => {
        const key = resolver(item);
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function buildTailBands(values = [], quality) {
    const numbers = finiteNumbers(values);
    const thresholds = VALUE_TAIL_THRESHOLDS[quality] || [];
    return thresholds.map((threshold) => {
        const count = numbers.filter((value) => value >= threshold).length;
        return {
            threshold,
            item_count: count,
            catalog_rate: numbers.length ? roundTo(count / numbers.length, 6) : 0
        };
    });
}

function getStructuralEntry(structuralPriorReport = {}, quality) {
    const entry = structuralPriorReport.quality_priors && structuralPriorReport.quality_priors[quality];
    if (!entry) return null;
    const cells = entry.cells_per_item || {};
    return {
        items_with_cell_candidate: entry.items_with_cell_candidate ?? null,
        strict_ready_item_count: entry.strict_ready_item_count ?? null,
        weighted_candidate_effective_n: cells.weighted_candidate_effective_n ?? null,
        weighted_candidate_mean: cells.weighted_candidate_mean ?? null,
        weighted_candidate_sd: cells.weighted_candidate_sd ?? null,
        weighted_candidate_max: cells.weighted_candidate_max ?? null
    };
}

function summarizeQualityEvidence({ items = [], structuralPriorReport = {}, config = defaultConfig, mapId = "sunken_ship" } = {}) {
    const grouped = groupItemsByQuality(items);
    return Object.fromEntries(QUALITY_ORDER.map((quality) => {
        const qualityItems = grouped[quality] || [];
        const values = qualityItems.map((item) => item.value);
        const cellItems = qualityItems.filter((item) => item.cell_candidate && Number.isFinite(Number(item.cell_candidate.cells)));
        const cellValues = cellItems.map((item) => Number(item.cell_candidate.cells));
        const detectedCellItems = cellItems.filter((item) => item.cell_candidate.layout_imputed !== true);
        const layoutImputedItems = cellItems.filter((item) => item.cell_candidate.layout_imputed === true);
        const nameReadyItems = qualityItems.filter((item) => item.name && Number.isFinite(Number(item.value)));
        const currentMap = config.maps && config.maps[mapId] ? config.maps[mapId] : {};
        const currentCells = currentMap.cells_per_item && currentMap.cells_per_item[quality]
            ? currentMap.cells_per_item[quality]
            : null;

        return [quality, {
            quality,
            label: QUALITY_LABELS[quality] || quality,
            item_count: qualityItems.length,
            name_value_ready_count: nameReadyItems.length,
            cell_candidate_count: cellItems.length,
            detected_cell_candidate_count: detectedCellItems.length,
            layout_imputed_cell_candidate_count: layoutImputedItems.length,
            missing_cell_candidate_count: qualityItems.length - cellItems.length,
            dual_evidence_count: nameReadyItems.filter((item) => item.cell_candidate).length,
            dual_evidence_rate: qualityItems.length
                ? roundTo(nameReadyItems.filter((item) => item.cell_candidate).length / qualityItems.length, 4)
                : 0,
            extraction_status_counts: countBy(qualityItems, (item) => item.extraction_status || "unknown"),
            value_stats: summarizeNumeric(values),
            cell_stats: summarizeNumeric(cellValues),
            value_tail_bands: buildTailBands(values, quality),
            structural_prior: getStructuralEntry(structuralPriorReport, quality),
            current_sunken_ship_cells_per_item: currentCells ? {
                mean: currentCells.mean ?? null,
                sd: currentCells.sd ?? null,
                min: currentCells.min ?? null,
                max: currentCells.max ?? null
            } : null
        }];
    }));
}

function buildCatalogDualEvidenceSummary({
    itemExtractionReport = {},
    structuralPriorReport = {},
    implementationReport = null,
    config = defaultConfig,
    generatedAt = "2026-04-27T12:30:00.000Z",
    mapId = "sunken_ship"
} = {}) {
    const items = Array.isArray(itemExtractionReport.items) ? itemExtractionReport.items : [];
    const qualitySummaries = summarizeQualityEvidence({ items, structuralPriorReport, config, mapId });
    const currentMap = config.maps && config.maps[mapId] ? config.maps[mapId] : {};
    const redSummary = qualitySummaries.r || {};
    const backtestAfter = implementationReport && implementationReport.summary
        ? implementationReport.summary.after_current_default || null
        : (implementationReport && implementationReport.after ? implementationReport.after : null);

    return {
        schema_version: "ak_catalog_dual_evidence_summary_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        authority_merge_allowed: false,
        map_id: mapId,
        source_reports: {
            item_extraction_schema: itemExtractionReport.schema_version || null,
            structural_prior_schema: structuralPriorReport.schema_version || null,
            implementation_schema: implementationReport && implementationReport.schema_version || null
        },
        methodology: {
            name_value_source: "manual_catalog_name_price_quality_batches",
            grid_source: "thread_catalog_image_pixel_contour_inner_grid",
            ocr_name_source: "auxiliary_only_low_acceptance_not_used_as_authority",
            no_manual_review_required_for_rough_prior: true,
            training_label_allowed: false
        },
        totals: {
            item_count: items.length,
            dual_evidence_count: Object.values(qualitySummaries).reduce((sum, entry) => sum + entry.dual_evidence_count, 0),
            cell_candidate_count: Object.values(qualitySummaries).reduce((sum, entry) => sum + entry.cell_candidate_count, 0),
            missing_cell_candidate_count: Object.values(qualitySummaries).reduce((sum, entry) => sum + entry.missing_cell_candidate_count, 0),
            strict_ready_item_count: structuralPriorReport.summary
                ? structuralPriorReport.summary.strict_ready_item_count ?? null
                : null
        },
        quality_summaries: qualitySummaries,
        current_sunken_ship_prior: {
            alpha_counts: currentMap.alpha_counts || null,
            count_prior_strength: currentMap.solver && currentMap.solver.count_prior_strength || null,
            cells_per_item: currentMap.cells_per_item || null,
            red_type_profiles: currentMap.red_type_profiles || null,
            red_tail_battle_probability: config.calibration
                && config.calibration.maps
                && config.calibration.maps[mapId]
                && config.calibration.maps[mapId].value_model_calibration
                && config.calibration.maps[mapId].value_model_calibration.value_model
                && config.calibration.maps[mapId].value_model_calibration.value_model.r
                && config.calibration.maps[mapId].value_model_calibration.value_model.r.tail_model
                ? config.calibration.maps[mapId].value_model_calibration.value_model.r.tail_model.battle_probability
                : null
        },
        red_value_tail_summary: {
            catalog_item_count: redSummary.item_count || 0,
            value_stats: redSummary.value_stats || null,
            tail_bands: redSummary.value_tail_bands || []
        },
        replay_guardrail_snapshot: backtestAfter,
        conclusion: {
            rough_default_usable: true,
            primary_fix: "keep red count prior very low and red high-price values in rare tail bands",
            main_remaining_risk: "no accepted same-battle full actual-count labels; high orange averages without orange count can still move residual mass",
            next_calibration_input: "settlement capture packages with full quality counts and optional stitched large inventory screenshots"
        }
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function tableRow(cells = []) {
    return `| ${cells.map(markdownCell).join(" | ")} |`;
}

function writeMarkdownReport(report, outputPath) {
    const mdPath = outputPath.replace(/\.json$/i, ".md");
    const lines = [
        "# Catalog Dual Evidence Summary",
        "",
        `- change class: \`${report.change_class}\``,
        `- authority merge allowed: \`${report.authority_merge_allowed}\``,
        `- items: \`${report.totals.item_count}\``,
        `- dual evidence items: \`${report.totals.dual_evidence_count}\``,
        `- cell candidates: \`${report.totals.cell_candidate_count}\``,
        "",
        "## Quality Summary",
        "",
        tableRow(["quality", "items", "dual evidence", "cell candidates", "avg cells", "p90 cells", "max cells", "avg value", "p95 value", "max value"]),
        tableRow(["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:"])
    ];
    QUALITY_ORDER.forEach((quality) => {
        const entry = report.quality_summaries[quality];
        lines.push(tableRow([
            quality,
            entry.item_count,
            entry.dual_evidence_count,
            entry.cell_candidate_count,
            entry.cell_stats.mean,
            entry.cell_stats.p90,
            entry.cell_stats.max,
            entry.value_stats.mean,
            entry.value_stats.p95,
            entry.value_stats.max
        ]));
    });
    lines.push(
        "",
        "## Red Tail Bands",
        "",
        tableRow(["threshold", "items", "catalog rate"]),
        tableRow(["---:", "---:", "---:"])
    );
    (report.red_value_tail_summary.tail_bands || []).forEach((entry) => {
        lines.push(tableRow([entry.threshold, entry.item_count, entry.catalog_rate]));
    });
    lines.push(
        "",
        "## Current Rough Prior",
        "",
        `- alpha counts: \`${JSON.stringify(report.current_sunken_ship_prior.alpha_counts)}\``,
        `- count prior strength: \`${report.current_sunken_ship_prior.count_prior_strength}\``,
        `- red tail battle probability: \`${report.current_sunken_ship_prior.red_tail_battle_probability}\``,
        "",
        "## Conclusion",
        "",
        `- rough default usable: \`${report.conclusion.rough_default_usable}\``,
        `- primary fix: ${report.conclusion.primary_fix}`,
        `- remaining risk: ${report.conclusion.main_remaining_risk}`
    );
    writeText(mdPath, `${lines.join("\n")}\n`);
    return mdPath;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const itemExtractionReport = readJson(args.itemExtractionPath);
    const structuralPriorReport = readOptionalJson(args.structuralPriorPath, {});
    const implementationReport = readOptionalJson(args.implementationReportPath, null);
    const report = buildCatalogDualEvidenceSummary({
        itemExtractionReport,
        structuralPriorReport,
        implementationReport,
        generatedAt: args.generatedAt
    });
    report.source_paths = {
        item_extraction: path.relative(process.cwd(), args.itemExtractionPath) || args.itemExtractionPath,
        structural_prior: path.relative(process.cwd(), args.structuralPriorPath) || args.structuralPriorPath,
        implementation_report: args.implementationReportPath && fs.existsSync(args.implementationReportPath)
            ? (path.relative(process.cwd(), args.implementationReportPath) || args.implementationReportPath)
            : null
    };
    writeJson(args.outputPath, report);
    report.markdown_path = writeMarkdownReport(report, args.outputPath);
    writeJson(args.outputPath, report);
    process.stdout.write(`${args.outputPath}\n${report.markdown_path}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ITEM_EXTRACTION_PATH,
    DEFAULT_OUTPUT_PATH,
    buildCatalogDualEvidenceSummary,
    resolveArgs
};
