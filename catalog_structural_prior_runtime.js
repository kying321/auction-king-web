const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_INPUT_PATH = path.join(process.cwd(), "docs", "research", "2026-04-27-catalog-item-extraction-report.json");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "docs", "research", "2026-04-27-catalog-structural-prior-report.json");
const STATUS_WEIGHTS = {
    cell_candidate_ready_for_review: 1,
    cell_candidate_manual_review_required: 0.5,
    cell_candidate_layout_imputed_review_required: 0.35
};

function round(value, digits = 4) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function tableRow(cells) {
    return `| ${cells.map(markdownCell).join(" | ")} |`;
}

function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function candidateWeight(item) {
    return STATUS_WEIGHTS[item && item.extraction_status] || 0;
}

function cellCandidateCells(item) {
    return finiteNumber(item && item.cell_candidate ? item.cell_candidate.cells : null);
}

function mean(values = []) {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleSd(values = []) {
    if (!values.length) return null;
    if (values.length === 1) return 0;
    const avg = mean(values);
    const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function weightedMean(entries = []) {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return null;
    return entries.reduce((sum, entry) => sum + (entry.value * entry.weight), 0) / totalWeight;
}

function weightedSd(entries = []) {
    const avg = weightedMean(entries);
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (!Number.isFinite(avg) || totalWeight <= 0) return null;
    const variance = entries.reduce((sum, entry) => sum + (entry.weight * ((entry.value - avg) ** 2)), 0) / totalWeight;
    return Math.sqrt(variance);
}

function summarizeCells(items = []) {
    const strictValues = items
        .filter((item) => item.extraction_status === "cell_candidate_ready_for_review")
        .map(cellCandidateCells)
        .filter(Number.isFinite);
    const weightedEntries = items
        .map((item) => ({ value: cellCandidateCells(item), weight: candidateWeight(item) }))
        .filter((entry) => Number.isFinite(entry.value) && entry.weight > 0);
    const weightedValues = weightedEntries.map((entry) => entry.value);

    return {
        strict_ready_mean: round(mean(strictValues)),
        strict_ready_sd: round(sampleSd(strictValues)),
        strict_ready_min: strictValues.length ? Math.min(...strictValues) : null,
        strict_ready_max: strictValues.length ? Math.max(...strictValues) : null,
        weighted_candidate_mean: round(weightedMean(weightedEntries)),
        weighted_candidate_sd: round(weightedSd(weightedEntries)),
        weighted_candidate_min: weightedValues.length ? Math.min(...weightedValues) : null,
        weighted_candidate_max: weightedValues.length ? Math.max(...weightedValues) : null,
        weighted_candidate_effective_n: round(weightedEntries.reduce((sum, entry) => sum + entry.weight, 0))
    };
}

function summarizeValues(items = []) {
    const values = items.map((item) => finiteNumber(item.value)).filter(Number.isFinite);
    return {
        item_value_mean: round(mean(values), 2),
        item_value_sd: round(sampleSd(values), 2),
        item_value_min: values.length ? Math.min(...values) : null,
        item_value_max: values.length ? Math.max(...values) : null
    };
}

function summarizeShapeSignatures(items = []) {
    const map = new Map();
    items.forEach((item) => {
        const signature = item && item.cell_candidate ? item.cell_candidate.shape_signature : null;
        if (!signature) return;
        if (!map.has(signature)) {
            map.set(signature, {
                shape_signature: signature,
                item_count: 0,
                weighted_count: 0,
                examples: []
            });
        }
        const entry = map.get(signature);
        entry.item_count += 1;
        entry.weighted_count += candidateWeight(item);
        if (entry.examples.length < 3) {
            entry.examples.push({
                id: item.id || null,
                name: item.name || null,
                cells: cellCandidateCells(item),
                value: finiteNumber(item.value)
            });
        }
    });
    return Array.from(map.values())
        .map((entry) => ({ ...entry, weighted_count: round(entry.weighted_count) }))
        .sort((left, right) => right.weighted_count - left.weighted_count
            || right.item_count - left.item_count
            || String(left.shape_signature).localeCompare(String(right.shape_signature)));
}

function groupItemsByQuality(items = []) {
    return items.reduce((groups, item) => {
        const quality = item && item.quality ? String(item.quality).toLowerCase() : "";
        if (!quality) return groups;
        if (!groups[quality]) groups[quality] = [];
        groups[quality].push(item);
        return groups;
    }, {});
}

function buildQualityPrior(quality, items = []) {
    const withCandidate = items.filter((item) => Number.isFinite(cellCandidateCells(item)));
    const strictReady = items.filter((item) => item.extraction_status === "cell_candidate_ready_for_review");
    const weightedCandidate = items.filter((item) => candidateWeight(item) > 0 && Number.isFinite(cellCandidateCells(item)));

    return {
        quality,
        item_count: items.length,
        items_with_cell_candidate: withCandidate.length,
        strict_ready_item_count: strictReady.length,
        weighted_candidate_item_count: weightedCandidate.length,
        missing_cell_candidate_count: items.length - withCandidate.length,
        cells_per_item: summarizeCells(items),
        value_distribution: summarizeValues(items),
        shape_signatures: summarizeShapeSignatures(items)
    };
}

function summarizeReport(items = [], qualityPriors = {}) {
    const withCandidate = items.filter((item) => Number.isFinite(cellCandidateCells(item)));
    return {
        total_items: items.length,
        quality_count: Object.keys(qualityPriors).length,
        items_with_cell_candidate: withCandidate.length,
        strict_ready_item_count: items.filter((item) => item.extraction_status === "cell_candidate_ready_for_review").length,
        weighted_candidate_item_count: items.filter((item) => candidateWeight(item) > 0 && Number.isFinite(cellCandidateCells(item))).length,
        missing_cell_candidate_count: items.length - withCandidate.length,
        authority_merge_allowed: false
    };
}

function writeMarkdownReport(report, outputPath) {
    const markdownPath = outputPath.replace(/\.json$/i, ".md");
    const lines = [
        "# Catalog Structural Prior Report",
        "",
        `- change class: \`${report.change_class}\``,
        `- authority merge allowed: \`${report.summary.authority_merge_allowed}\``,
        `- total items: \`${report.summary.total_items}\``,
        `- items with cell candidate: \`${report.summary.items_with_cell_candidate}\``,
        `- strict ready item count: \`${report.summary.strict_ready_item_count}\``,
        `- weighted candidate item count: \`${report.summary.weighted_candidate_item_count}\``,
        "",
        "## Quality Priors",
        "",
        tableRow(["quality", "items", "candidates", "strict ready", "weighted n", "strict mean", "weighted mean", "max cells", "value mean"]),
        tableRow(["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:"])
    ];
    Object.values(report.quality_priors).forEach((entry) => {
        lines.push(tableRow([
            entry.quality,
            entry.item_count,
            entry.items_with_cell_candidate,
            entry.strict_ready_item_count,
            entry.cells_per_item.weighted_candidate_effective_n,
            entry.cells_per_item.strict_ready_mean,
            entry.cells_per_item.weighted_candidate_mean,
            entry.cells_per_item.weighted_candidate_max,
            entry.value_distribution.item_value_mean
        ]));
    });
    fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");
    return markdownPath;
}

function buildCatalogStructuralPriorReport(extractionReportOrPath = DEFAULT_INPUT_PATH, options = {}) {
    const extractionReport = typeof extractionReportOrPath === "string"
        ? readJson(extractionReportOrPath)
        : extractionReportOrPath;
    const items = Array.isArray(extractionReport && extractionReport.items) ? extractionReport.items : [];
    const qualityGroups = groupItemsByQuality(items);
    const qualityPriors = Object.fromEntries(
        Object.entries(qualityGroups)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([quality, qualityItems]) => [quality, buildQualityPrior(quality, qualityItems)])
    );
    const report = {
        schema_version: "ak_catalog_structural_prior_report_v1",
        change_class: "RESEARCH_ONLY",
        source_extraction_schema_version: extractionReport && extractionReport.schema_version ? extractionReport.schema_version : null,
        source_extraction_report: typeof extractionReportOrPath === "string" ? extractionReportOrPath : null,
        methodology: {
            quality_source: "catalog_item_extraction_report",
            value_source: "manual_catalog_transcription",
            cell_source: "catalog_contour_candidate_weighted_shadow_prior",
            strict_ready_status: "cell_candidate_ready_for_review",
            candidate_status_weights: STATUS_WEIGHTS,
            training_label_allowed: false,
            authority_merge_allowed: false
        },
        summary: null,
        quality_priors: qualityPriors
    };
    report.summary = summarizeReport(items, qualityPriors);
    if (options.outputPath) {
        report.markdown_path = writeMarkdownReport(report, options.outputPath);
        writeJson(options.outputPath, report);
    }
    return report;
}

module.exports = {
    DEFAULT_INPUT_PATH,
    DEFAULT_OUTPUT_PATH,
    STATUS_WEIGHTS,
    buildCatalogStructuralPriorReport
};
