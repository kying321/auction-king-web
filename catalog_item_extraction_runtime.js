const fs = require("node:fs");
const path = require("node:path");
const {
    analyzeCatalogFixedGridRegionFromImageFile,
    analyzeCatalogCardImage
} = require("./catalog_ocr_contour_runtime.js");
const {
    loadManualCatalogBatchesFromDirectory
} = require("./manual_item_catalog.js");
const {
    buildCatalogItemIndex,
    matchCatalogItem
} = require("./catalog_item_matcher.js");

const DEFAULT_THREAD_ID = "019db037-61a7-7660-8e1c-e0b56a22750d";
const DEFAULT_QUALITY_MANIFEST_PATH = path.join(
    process.cwd(),
    "data",
    "thread_image_backups",
    DEFAULT_THREAD_ID,
    "catalog_quality_manifest.json"
);
const DEFAULT_MANUAL_CATALOG_DIR = path.join(process.cwd(), "data", "manual_catalog");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "docs", "research", "2026-04-27-catalog-item-extraction-report.json");
const SLOT_ORDER = [
    { row: 0, col: 0, ordinal: 0 },
    { row: 0, col: 1, ordinal: 1 },
    { row: 1, col: 0, ordinal: 2 },
    { row: 1, col: 1, ordinal: 3 }
];
const QUALITY_LABELS = {
    w: "white",
    g: "green",
    b: "blue",
    p: "purple",
    o: "orange",
    r: "red"
};

function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round(Number(value || 0) * factor) / factor;
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

function loadQualityManifest(manifestPath = DEFAULT_QUALITY_MANIFEST_PATH) {
    const payload = readJson(manifestPath);
    return {
        ...payload,
        groups: Array.isArray(payload.groups)
            ? payload.groups.map((group) => ({
                ...group,
                quality: String(group.quality || "").toLowerCase(),
                label: group.label || QUALITY_LABELS[String(group.quality || "").toLowerCase()] || String(group.quality || ""),
                images: Array.isArray(group.images) ? group.images.map((image) => ({
                    ...image,
                    file: path.resolve(image.file),
                    basename: image.basename || path.basename(image.file)
                })) : []
            })).filter((group) => group.quality && group.images.length)
            : []
    };
}

function buildManualCatalogBatchMap(manualCatalogDir = DEFAULT_MANUAL_CATALOG_DIR) {
    return Object.fromEntries(
        loadManualCatalogBatchesFromDirectory(manualCatalogDir).map((batch) => [batch.quality, batch])
    );
}

function normalizeManualCatalogBatches(manualCatalogDir = DEFAULT_MANUAL_CATALOG_DIR) {
    return loadManualCatalogBatchesFromDirectory(manualCatalogDir);
}

function makeGridCandidateMap(gridCandidates = []) {
    const map = new Map();
    gridCandidates.forEach((candidate) => {
        const slot = candidate && candidate.catalog_page_slot;
        if (!slot || !Number.isInteger(slot.row) || !Number.isInteger(slot.col)) return;
        map.set(`${slot.row}:${slot.col}`, candidate);
    });
    return map;
}

function median(values = []) {
    const normalized = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!normalized.length) return null;
    const mid = Math.floor(normalized.length / 2);
    return normalized.length % 2 ? normalized[mid] : (normalized[mid - 1] + normalized[mid]) / 2;
}

function slotKey(slot) {
    return `${slot.row}:${slot.col}`;
}

function candidateLooksLikeFullGrid(candidate, image) {
    if (!candidate || !candidate.bounds) return false;
    const minFullGridSide = Math.max(34, (image.height || 0) * 0.04);
    return candidate.row_count >= 5
        && candidate.col_count >= 5
        && candidate.bounds.width >= minFullGridSide
        && candidate.bounds.height >= minFullGridSide;
}

function medianFromCandidates(candidates, accessor) {
    return median(candidates.map(accessor).filter(Number.isFinite));
}

function inferMissingGridBounds(slot, candidates = [], image = {}) {
    const withSlots = candidates.filter((candidate) => candidate && candidate.bounds && candidate.catalog_page_slot);
    if (!withSlots.length) return null;
    const fullGridCandidates = withSlots.filter((candidate) => candidateLooksLikeFullGrid(candidate, image));
    const anchorCandidates = fullGridCandidates.length ? fullGridCandidates : withSlots;
    const gridWidth = medianFromCandidates(fullGridCandidates, (candidate) => candidate.bounds.width)
        || medianFromCandidates(withSlots, (candidate) => candidate.bounds.width)
        || Math.round((image.height || 900) * 0.067);
    const gridHeight = medianFromCandidates(fullGridCandidates, (candidate) => candidate.bounds.height)
        || medianFromCandidates(withSlots, (candidate) => candidate.bounds.height)
        || Math.round((image.height || 900) * 0.067);
    const columnLeft = medianFromCandidates(
        anchorCandidates.filter((candidate) => candidate.catalog_page_slot.col === slot.col),
        (candidate) => candidate.bounds.left
    );
    const rowTop = medianFromCandidates(
        anchorCandidates.filter((candidate) => candidate.catalog_page_slot.row === slot.row),
        (candidate) => candidate.bounds.top
    );
    let left = columnLeft;
    let top = rowTop;

    if (!Number.isFinite(left)) {
        const otherColumnLeft = medianFromCandidates(
            anchorCandidates.filter((candidate) => candidate.catalog_page_slot.col !== slot.col),
            (candidate) => candidate.bounds.left
        );
        if (Number.isFinite(otherColumnLeft)) {
            const columnGap = Math.round((image.width || 1400) * 0.47);
            left = slot.col === 0 ? otherColumnLeft - columnGap : otherColumnLeft + columnGap;
        } else {
            left = slot.col === 0
                ? Math.round((image.width || 1400) * 0.43)
                : Math.round((image.width || 1400) * 0.885);
        }
    }

    if (!Number.isFinite(top)) {
        const otherRowTop = medianFromCandidates(
            anchorCandidates.filter((candidate) => candidate.catalog_page_slot.row !== slot.row),
            (candidate) => candidate.bounds.top
        );
        if (Number.isFinite(otherRowTop)) {
            const rowGap = Math.round((image.height || 900) * 0.435);
            top = slot.row === 0 ? otherRowTop - rowGap : otherRowTop + rowGap;
        } else {
            top = slot.row === 0
                ? Math.round((image.height || 900) * 0.38)
                : Math.round((image.height || 900) * 0.79);
        }
    }

    const maxLeft = Math.max(0, (image.width || left + gridWidth) - gridWidth);
    const maxTop = Math.max(0, (image.height || top + gridHeight) - gridHeight);
    return {
        left: Math.max(0, Math.min(Math.round(left), maxLeft)),
        top: Math.max(0, Math.min(Math.round(top), maxTop)),
        width: Math.max(1, Math.round(gridWidth)),
        height: Math.max(1, Math.round(gridHeight)),
        basis: fullGridCandidates.length ? "same_page_full_grid_anchor" : "same_page_slot_anchor"
    };
}

async function inferMissingSlotCandidates(image, analysis, candidateMap, options = {}) {
    if (options.layoutImputation === false) return [];
    const inferred = [];
    for (const slot of SLOT_ORDER) {
        if (candidateMap.has(slotKey(slot))) continue;
        const bounds = inferMissingGridBounds(slot, analysis.grid_candidates, analysis.image);
        if (!bounds) continue;
        const candidate = await analyzeCatalogFixedGridRegionFromImageFile(image.file, bounds, {
            ...(options.imageAnalysisOptions || {}),
            fixedGridRows: 6,
            fixedGridCols: 6
        });
        if (!candidate) continue;
        inferred.push({
            ...candidate,
            catalog_page_slot: {
                row: slot.row,
                col: slot.col,
                local_x: null,
                local_y: null
            },
            catalog_page_slot_score: null,
            layout_imputation_basis: bounds.basis,
            id: `layout-grid-${slot.row}-${slot.col}`
        });
    }
    return inferred;
}

function compactCellCandidate(candidate) {
    if (!candidate) return null;
    return {
        cells: candidate.cell_count,
        candidate_source: candidate.candidate_source || "detected_grid_contour",
        layout_imputed: candidate.layout_imputed === true,
        layout_imputation_basis: candidate.layout_imputation_basis || null,
        shape_signature: candidate.shape_signature,
        shape_matrix: candidate.shape_analysis && Array.isArray(candidate.shape_analysis.trimmed_matrix)
            ? candidate.shape_analysis.trimmed_matrix
            : candidate.shape_matrix,
        grid_matrix: candidate.grid_matrix,
        precision_status: candidate.precision_status,
        confidence: candidate.confidence,
        bounds: candidate.bounds,
        catalog_page_slot: candidate.catalog_page_slot || null,
        catalog_page_slot_score: candidate.catalog_page_slot_score || null,
        luma_range: candidate.luma_range || null,
        occupied_threshold: candidate.occupied_threshold || null,
        shape_analysis: candidate.shape_analysis || null
    };
}

function compactImageGridCandidate(candidate) {
    if (!candidate) return null;
    return {
        id: candidate.id,
        cells: candidate.cell_count,
        row_count: candidate.row_count,
        col_count: candidate.col_count,
        detected_grid_cell_count: candidate.detected_grid_cell_count,
        candidate_source: candidate.candidate_source || "detected_grid_contour",
        layout_imputed: candidate.layout_imputed === true,
        layout_imputation_basis: candidate.layout_imputation_basis || null,
        shape_signature: candidate.shape_signature,
        grid_matrix: candidate.grid_matrix,
        precision_status: candidate.precision_status,
        confidence: candidate.confidence,
        bounds: candidate.bounds,
        center: candidate.center,
        catalog_page_slot: candidate.catalog_page_slot || null,
        catalog_page_slot_score: candidate.catalog_page_slot_score || null,
        luma_range: candidate.luma_range || null,
        occupied_threshold: candidate.occupied_threshold || null
    };
}

function resolveExtractionStatus(candidate) {
    if (!candidate) return "missing_cell_candidate";
    if (candidate.layout_imputed) return "cell_candidate_layout_imputed_review_required";
    return candidate.precision_status === "grid_shape_candidate"
        ? "cell_candidate_ready_for_review"
        : "cell_candidate_manual_review_required";
}

function summarizeImageCandidates(candidates = [], inferredCount = 0) {
    return {
        grid_count: candidates.length,
        cell_count_total: candidates.reduce((sum, candidate) => sum + (Number(candidate.cell_count) || 0), 0),
        high_confidence_count: candidates.filter((candidate) => candidate.precision_status === "grid_shape_candidate").length,
        manual_review_required_count: candidates.filter((candidate) => candidate.precision_status !== "grid_shape_candidate").length,
        layout_imputed_count: inferredCount
    };
}

async function analyzeImageSlots(image, options = {}) {
    const skipOcr = options.enableOcrNameMatching
        ? options.imageAnalysisOptions && options.imageAnalysisOptions.skipOcr === true
        : true;
    const ocrSampleLimit = options.enableOcrNameMatching
        ? (Number.isFinite(Number(options.ocrSampleLimit)) ? Number(options.ocrSampleLimit) : 4)
        : 0;
    const analysis = await analyzeCatalogCardImage(image.file, {
        skipOcr,
        ocrSampleLimit,
        catalogPageSlotFilter: true,
        ...(options.imageAnalysisOptions || {})
    });
    const candidateMap = makeGridCandidateMap(analysis.grid_candidates);
    const inferredCandidates = await inferMissingSlotCandidates(image, analysis, candidateMap, options);
    inferredCandidates.forEach((candidate) => {
        const slot = candidate.catalog_page_slot;
        if (slot) candidateMap.set(`${slot.row}:${slot.col}`, candidate);
    });
    const gridCandidates = analysis.grid_candidates.concat(inferredCandidates)
        .sort((left, right) => {
            const leftSlot = left.catalog_page_slot || { row: 99, col: 99 };
            const rightSlot = right.catalog_page_slot || { row: 99, col: 99 };
            return leftSlot.row - rightSlot.row || leftSlot.col - rightSlot.col;
        })
        .map((candidate, index) => ({ ...candidate, id: `grid-${index + 1}` }));
    return {
        image,
        analysis: {
            ...analysis,
            grid_candidates: gridCandidates,
            summary: summarizeImageCandidates(gridCandidates, inferredCandidates.length)
        },
        candidateMap
    };
}

function finiteNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeOcrNameCandidate(candidate, fallbackQuality, source) {
    if (candidate === null || candidate === undefined) return null;
    const raw = typeof candidate === "string" ? { name: candidate } : candidate;
    if (!raw || typeof raw !== "object") return null;
    const bestText = raw.best_text || raw.name || raw.ocr_name || raw.text || "";
    const normalizedText = String(bestText || "").trim();
    if (!normalizedText) return null;
    return {
        best_text: normalizedText,
        confidence: finiteNumberOrNull(raw.confidence || raw.best_confidence),
        quality: raw.quality || raw.color || raw.detected_quality || raw.detected_color || fallbackQuality,
        source: raw.source || source
    };
}

function resolveOverrideOcrNameCandidate(image, slot, fallbackQuality, options = {}) {
    const source = options.ocrSlotCandidatesByImageBasename;
    if (!source || typeof source !== "object") return null;
    const keys = [
        image.basename,
        image.file,
        image.source_image_path,
        path.basename(image.file || "")
    ].filter(Boolean);
    for (const key of keys) {
        const imageMap = source[key];
        if (!imageMap || typeof imageMap !== "object") continue;
        const raw = imageMap[slotKey(slot)] || imageMap[String(slot.ordinal)];
        const candidate = normalizeOcrNameCandidate(raw, fallbackQuality, "ocr_slot_candidate_override");
        if (candidate) return candidate;
    }
    return null;
}

function resolveCardOcrNameCandidate(imageAnalysis, slot, fallbackQuality) {
    const cards = imageAnalysis && imageAnalysis.analysis && Array.isArray(imageAnalysis.analysis.cards)
        ? imageAnalysis.analysis.cards
        : [];
    const card = cards.find((entry) => {
        const cardSlot = entry && entry.grid && entry.grid.catalog_page_slot;
        return cardSlot && cardSlot.row === slot.row && cardSlot.col === slot.col;
    });
    const candidate = card && card.ocr && card.ocr.name
        ? normalizeOcrNameCandidate({
            best_text: card.ocr.name.best_text,
            confidence: card.ocr.name.best_confidence
        }, fallbackQuality, "catalog_card_ocr")
        : null;
    return candidate;
}

function resolveOcrNameCandidate(image, imageAnalysis, slot, fallbackQuality, options = {}) {
    return resolveOverrideOcrNameCandidate(image, slot, fallbackQuality, options)
        || resolveCardOcrNameCandidate(imageAnalysis, slot, fallbackQuality);
}

function shouldEnableOcrNameMatching(options = {}) {
    return options.enableOcrNameMatching === true
        || Boolean(options.ocrSlotCandidatesByImageBasename);
}

function compactNameMatchResult(result) {
    if (!result) return null;
    return {
        accepted: result.accepted,
        status: result.status,
        candidate: result.candidate,
        match: result.match,
        scores: result.scores,
        blockers: result.blockers,
        candidates: result.candidates
    };
}

async function buildQualityItems(group, batch, options = {}) {
    const items = [];
    const imageAnalyses = [];
    let itemIndex = 0;
    const enableNameMatching = shouldEnableOcrNameMatching(options);
    const catalogItemIndex = options.catalogItemIndex || null;

    for (let pageIndex = 0; pageIndex < group.images.length && itemIndex < batch.items.length; pageIndex += 1) {
        const image = group.images[pageIndex];
        const imageAnalysis = await analyzeImageSlots(image, {
            ...options,
            enableOcrNameMatching: enableNameMatching
        });
        imageAnalyses.push({
            image,
            summary: imageAnalysis.analysis.summary,
            grid_candidates: imageAnalysis.analysis.grid_candidates.map(compactImageGridCandidate),
            ocr_cards: enableNameMatching && Array.isArray(imageAnalysis.analysis.cards)
                ? imageAnalysis.analysis.cards.map((card) => ({
                    grid_id: card.grid_id,
                    catalog_page_slot: card.grid && card.grid.catalog_page_slot ? card.grid.catalog_page_slot : null,
                    name: card.ocr && card.ocr.name ? {
                        best_text: card.ocr.name.best_text,
                        best_confidence: card.ocr.name.best_confidence
                    } : null,
                    value: card.ocr && card.ocr.value ? {
                        best_text: card.ocr.value.best_text,
                        best_value: card.ocr.value.best_value,
                        best_confidence: card.ocr.value.best_confidence
                    } : null
                }))
                : []
        });

        for (const slot of SLOT_ORDER) {
            if (itemIndex >= batch.items.length) break;
            const manualItem = batch.items[itemIndex];
            const candidate = imageAnalysis.candidateMap.get(`${slot.row}:${slot.col}`) || null;
            const itemNumber = itemIndex + 1;
            const ocrNameCandidate = enableNameMatching
                ? resolveOcrNameCandidate(image, imageAnalysis, slot, group.quality, options)
                : null;
            const ocrNameMatch = ocrNameCandidate && catalogItemIndex
                ? matchCatalogItem({
                    id: `${group.quality}-${String(itemNumber).padStart(4, "0")}`,
                    name: ocrNameCandidate.best_text,
                    quality: ocrNameCandidate.quality || group.quality
                }, catalogItemIndex, options.ocrNameMatchOptions || {})
                : null;
            items.push({
                id: `${group.quality}-${String(itemNumber).padStart(4, "0")}`,
                quality: group.quality,
                quality_label: group.label || QUALITY_LABELS[group.quality] || group.quality,
                item_index: itemIndex,
                item_number: itemNumber,
                page_index: pageIndex,
                slot,
                source_image_path: image.file,
                source_image_basename: image.basename || path.basename(image.file),
                source_image_index: image.index || null,
                manual_catalog_batch_id: batch.batch_id,
                name: manualItem.name,
                value: manualItem.value,
                name_confidence: manualItem.name_confidence,
                existing_cells: manualItem.cells,
                cell_candidate: compactCellCandidate(candidate),
                ocr_name_candidate: ocrNameCandidate,
                ocr_name_match: compactNameMatchResult(ocrNameMatch),
                extraction_status: resolveExtractionStatus(candidate),
                training_label_allowed: false
            });
            itemIndex += 1;
        }
    }

    return { items, imageAnalyses };
}

function summarizeQuality(quality, group, batch, items = []) {
    const withCandidate = items.filter((item) => item.cell_candidate && Number.isFinite(item.cell_candidate.cells));
    const candidateCells = withCandidate.map((item) => item.cell_candidate.cells);
    const values = batch.items.map((item) => item.value).filter(Number.isFinite);
    return {
        quality,
        item_count: batch.items.length,
        image_count: group.images.length,
        items_with_cell_candidate: withCandidate.length,
        missing_cell_candidate_count: batch.items.length - withCandidate.length,
        max_candidate_cells: candidateCells.length ? Math.max(...candidateCells) : null,
        average_candidate_cells: candidateCells.length
            ? round(candidateCells.reduce((sum, value) => sum + value, 0) / candidateCells.length, 2)
            : null,
        average_value: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 2) : null
    };
}

function summarizeReport(items = [], qualitySummaries = {}) {
    const itemsWithCandidate = items.filter((item) => item.cell_candidate).length;
    const layoutImputedCount = items.filter((item) => item.cell_candidate && item.cell_candidate.layout_imputed).length;
    const ocrNameMatchStatusCounts = items.reduce((counts, item) => {
        const status = item.ocr_name_match && item.ocr_name_match.status
            ? item.ocr_name_match.status
            : "missing_ocr_name_candidate";
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});
    return {
        total_items: items.length,
        quality_count: Object.keys(qualitySummaries).length,
        items_with_cell_candidate: itemsWithCandidate,
        missing_cell_candidate_count: items.filter((item) => !item.cell_candidate).length,
        detected_cell_candidate_count: itemsWithCandidate - layoutImputedCount,
        layout_imputed_cell_candidate_count: layoutImputedCount,
        cell_candidate_coverage_rate: items.length ? round(itemsWithCandidate / items.length, 4) : 0,
        training_label_allowed_count: items.filter((item) => item.training_label_allowed === true).length,
        ocr_name_match_status_counts: ocrNameMatchStatusCounts,
        extraction_status_counts: items.reduce((counts, item) => {
            counts[item.extraction_status] = (counts[item.extraction_status] || 0) + 1;
            return counts;
        }, {})
    };
}

function writeMarkdownReport(report, outputPath) {
    const markdownPath = outputPath.replace(/\.json$/i, ".md");
    const lines = [
        "# Catalog Item Extraction Report",
        "",
        `- change class: \`${report.change_class}\``,
        `- training label allowed: \`false\``,
        `- total items: \`${report.summary.total_items}\``,
        `- items with cell candidate: \`${report.summary.items_with_cell_candidate}\``,
        `- layout-imputed cell candidates: \`${report.summary.layout_imputed_cell_candidate_count}\``,
        `- candidate coverage rate: \`${report.summary.cell_candidate_coverage_rate}\``,
        `- OCR name matches accepted: \`${report.summary.ocr_name_match_status_counts.accepted || 0}\``,
        "",
        "## Quality Summary",
        "",
        tableRow(["quality", "items", "images", "cell candidates", "missing", "avg cells", "max cells", "avg value"]),
        tableRow(["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:"])
    ];
    Object.values(report.quality_summaries).forEach((entry) => {
        lines.push(tableRow([
            entry.quality,
            entry.item_count,
            entry.image_count,
            entry.items_with_cell_candidate,
            entry.missing_cell_candidate_count,
            entry.average_candidate_cells,
            entry.max_candidate_cells,
            entry.average_value
        ]));
    });
    lines.push(
        "",
        "## OCR Name Match",
        "",
        tableRow(["id", "ocr text", "status", "matched name", "name score", "quality score", "blockers"]),
        tableRow(["---", "---", "---", "---", "---:", "---:", "---"])
    );
    report.items.forEach((item) => {
        const match = item.ocr_name_match;
        lines.push(tableRow([
            item.id,
            item.ocr_name_candidate ? item.ocr_name_candidate.best_text : null,
            match ? match.status : "missing_ocr_name_candidate",
            match && match.match ? match.match.name : null,
            match && match.scores ? match.scores.name_score : null,
            match && match.scores ? match.scores.quality_score : null,
            match && Array.isArray(match.blockers) ? match.blockers.join(", ") : null
        ]));
    });
    lines.push(
        "",
        "## Items",
        "",
        tableRow(["id", "quality", "name", "value", "cells", "shape", "status", "image"]),
        tableRow(["---", "---", "---", "---:", "---:", "---", "---", "---"])
    );
    report.items.forEach((item) => {
        lines.push(tableRow([
            item.id,
            item.quality,
            item.name,
            item.value,
            item.cell_candidate ? item.cell_candidate.cells : null,
            item.cell_candidate ? item.cell_candidate.shape_signature : null,
            item.extraction_status,
            item.source_image_basename
        ]));
    });
    fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");
    return markdownPath;
}

async function buildCatalogItemExtractionReport(options = {}) {
    const qualityManifestPath = options.qualityManifestPath || DEFAULT_QUALITY_MANIFEST_PATH;
    const manualCatalogDir = options.manualCatalogDir || DEFAULT_MANUAL_CATALOG_DIR;
    const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
    const manifest = loadQualityManifest(qualityManifestPath);
    const manualCatalogBatches = normalizeManualCatalogBatches(manualCatalogDir);
    const batchMap = Object.fromEntries(manualCatalogBatches.map((batch) => [batch.quality, batch]));
    const catalogItemIndex = buildCatalogItemIndex(manualCatalogBatches);
    const allItems = [];
    const qualitySummaries = {};
    const imageSummaries = {};

    for (const group of manifest.groups) {
        const batch = batchMap[group.quality];
        if (!batch) continue;
        const { items, imageAnalyses } = await buildQualityItems(group, batch, {
            ...options,
            catalogItemIndex
        });
        allItems.push(...items);
        qualitySummaries[group.quality] = summarizeQuality(group.quality, group, batch, items);
        imageSummaries[group.quality] = imageAnalyses;
    }

    const report = {
        schema_version: "ak_catalog_item_extraction_report_v1",
        change_class: "RESEARCH_ONLY",
        source_thread_id: manifest.source_thread_id || DEFAULT_THREAD_ID,
        source_quality_manifest: qualityManifestPath,
        source_manual_catalog_dir: manualCatalogDir,
        methodology: {
            value_source: "manual_catalog_transcription",
            quality_source: "thread_catalog_quality_manifest",
            cell_source: "recovered_catalog_image_contour_candidate",
            name_match_source: shouldEnableOcrNameMatching(options)
                ? "ocr_name_plus_quality_fuzzy_catalog_match"
                : "manual_catalog_batch_order",
            training_label_allowed: false,
            item_order: "quality_batch_order_aligned_to_2x2_catalog_page_slots",
            slot_order: SLOT_ORDER
        },
        summary: null,
        quality_summaries: qualitySummaries,
        image_summaries: imageSummaries,
        items: allItems
    };
    report.summary = summarizeReport(allItems, qualitySummaries);
    report.markdown_path = writeMarkdownReport(report, outputPath);
    writeJson(outputPath, report);
    return report;
}

module.exports = {
    DEFAULT_MANUAL_CATALOG_DIR,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_QUALITY_MANIFEST_PATH,
    SLOT_ORDER,
    buildCatalogItemExtractionReport,
    loadQualityManifest
};
