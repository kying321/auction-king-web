const fs = require("node:fs");
const path = require("node:path");
const {
    analyzeQualityColorBlocksFromImageFile,
    summarizeQualityBlocks
} = require("../pixel_quality_analyzer.js");

const DEFAULT_PIXEL_REPORT_PATH = path.join(
    process.cwd(),
    "docs",
    "research",
    "2026-04-24-downloads-quality-pixel-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    process.cwd(),
    "docs",
    "research",
    "2026-04-24-downloads-quality-pixel-crop-sensitivity-report.json"
);
const DEFAULT_JITTER = 0.015;
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let jitter = DEFAULT_JITTER;
    let qualityProfile = null;

    argv.forEach((arg) => {
        if (String(arg).startsWith("--jitter=")) {
            const numeric = Number(String(arg).replace(/^--jitter=/, ""));
            if (Number.isFinite(numeric) && numeric >= 0) jitter = numeric;
            return;
        }
        if (String(arg).startsWith("--profile=")) {
            qualityProfile = String(arg).replace(/^--profile=/, "").trim() || null;
            return;
        }
        positional.push(arg);
    });

    return {
        pixelReportPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_PIXEL_REPORT_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        jitter,
        qualityProfile
    };
}

function roundCropValue(value) {
    return Math.round(value * 1000000) / 1000000;
}

function clampCropStart(value, size) {
    return Math.max(0, Math.min(1 - size, value));
}

function normalizeRelativeCrop(crop = {}, image = null) {
    const width = Number(crop.width ?? crop.w ?? 1);
    const height = Number(crop.height ?? crop.h ?? 1);
    const x = Number(crop.x ?? crop.left ?? 0);
    const y = Number(crop.y ?? crop.top ?? 0);

    if (width > 1 || height > 1 || x > 1 || y > 1) {
        const imageWidth = Number(image && image.width);
        const imageHeight = Number(image && image.height);
        if (!imageWidth || !imageHeight) {
            return { x: 0, y: 0, width: 1, height: 1 };
        }
        const relativeWidth = width / imageWidth;
        const relativeHeight = height / imageHeight;
        return {
            x: roundCropValue(x / imageWidth),
            y: roundCropValue(y / imageHeight),
            width: roundCropValue(relativeWidth),
            height: roundCropValue(relativeHeight)
        };
    }

    return {
        x: roundCropValue(clampCropStart(Number.isFinite(x) ? x : 0, width)),
        y: roundCropValue(clampCropStart(Number.isFinite(y) ? y : 0, height)),
        width: roundCropValue(Math.max(0.000001, Math.min(1, Number.isFinite(width) ? width : 1))),
        height: roundCropValue(Math.max(0.000001, Math.min(1, Number.isFinite(height) ? height : 1)))
    };
}

function buildCropVariants(crop = {}, jitter = DEFAULT_JITTER) {
    const normalized = normalizeRelativeCrop(crop);
    const shifts = [-jitter, 0, jitter];
    const variants = [];

    shifts.forEach((dy) => {
        shifts.forEach((dx) => {
            variants.push({
                x: roundCropValue(clampCropStart(normalized.x + dx, normalized.width)),
                y: roundCropValue(clampCropStart(normalized.y + dy, normalized.height)),
                width: normalized.width,
                height: normalized.height
            });
        });
    });

    return variants;
}

function normalizeCounts(counts = {}) {
    return Object.fromEntries(QUALITY_ORDER.map((quality) => [
        quality,
        Number.isInteger(counts[quality]) && counts[quality] >= 0 ? counts[quality] : 0
    ]));
}

function signatureForSummary(summary = {}) {
    const counts = normalizeCounts(summary.counts || {});
    return QUALITY_ORDER.map((quality) => `${quality}:${counts[quality]}`).join("|");
}

function summaryFromSignature(signature) {
    const counts = {};
    String(signature).split("|").forEach((part) => {
        const [quality, value] = part.split(":");
        if (QUALITY_ORDER.includes(quality)) counts[quality] = Number(value) || 0;
    });
    const normalizedCounts = normalizeCounts(counts);
    return {
        counts: normalizedCounts,
        total: Object.values(normalizedCounts).reduce((sum, count) => sum + count, 0)
    };
}

function buildSignatureCounts(variantReports = []) {
    const counts = {};
    variantReports.forEach((variant) => {
        const signature = signatureForSummary(variant.summary);
        counts[signature] = (counts[signature] || 0) + 1;
    });
    return counts;
}

function pickMajoritySignature(signatureCounts = {}) {
    const entries = Object.entries(signatureCounts);
    if (!entries.length) return null;
    return entries.sort(([leftSignature, leftCount], [rightSignature, rightCount]) => (
        rightCount - leftCount || leftSignature.localeCompare(rightSignature)
    ))[0][0];
}

async function analyzeCropVariants(filePath, crop, jitter, qualityProfile = null) {
    const variants = buildCropVariants(crop, jitter);
    const reports = [];

    for (const variantCrop of variants) {
        const analysis = await analyzeQualityColorBlocksFromImageFile(filePath, {
            crop: variantCrop,
            ...(qualityProfile ? { qualityProfile } : {})
        });
        reports.push({
            crop: variantCrop,
            summary: summarizeQualityBlocks(analysis.blocks),
            block_count: analysis.blocks.length,
            min_confidence: analysis.blocks.length
                ? Math.round(Math.min(...analysis.blocks.map((block) => block.confidence)) * 10000) / 10000
                : null
        });
    }

    return reports;
}

async function buildQualityPixelCropSensitivityReport({
    pixelReport = {},
    jitter = DEFAULT_JITTER,
    qualityProfile = null,
    generatedAt = new Date().toISOString()
} = {}) {
    const results = [];
    const sourceResults = Array.isArray(pixelReport.results) ? pixelReport.results : [];
    const resolvedQualityProfile = qualityProfile || pixelReport.quality_profile || null;

    for (const sourceResult of sourceResults) {
        const filePath = sourceResult.file || sourceResult.source_image_path || sourceResult.path;
        const baseCrop = normalizeRelativeCrop(sourceResult.crop || pixelReport.crop || {}, sourceResult.image || pixelReport.image);
        if (!filePath || !fs.existsSync(filePath)) {
            results.push({
                file: filePath || null,
                basename: sourceResult.basename || (filePath ? path.basename(filePath) : null),
                base_crop: baseCrop,
                stable: false,
                action: "manual_review_required_missing_source_image",
                variant_count: 0,
                unique_signature_count: 0,
                majority_fraction: 0,
                signature_counts: {},
                base_summary: sourceResult.summary || null,
                majority_summary: null,
                variants: []
            });
            continue;
        }

        const variants = await analyzeCropVariants(filePath, baseCrop, jitter, resolvedQualityProfile);
        const signatureCounts = buildSignatureCounts(variants);
        const majoritySignature = pickMajoritySignature(signatureCounts);
        const majorityCount = majoritySignature ? signatureCounts[majoritySignature] : 0;
        const uniqueSignatureCount = Object.keys(signatureCounts).length;
        const stable = uniqueSignatureCount === 1;
        results.push({
            file: filePath,
            basename: sourceResult.basename || path.basename(filePath),
            base_crop: baseCrop,
            stable,
            action: stable ? "pixel_review_only_stable_candidate" : "manual_review_required_crop_sensitive",
            variant_count: variants.length,
            unique_signature_count: uniqueSignatureCount,
            majority_fraction: variants.length ? Math.round((majorityCount / variants.length) * 10000) / 10000 : 0,
            signature_counts: signatureCounts,
            base_summary: sourceResult.summary || null,
            majority_summary: majoritySignature ? summaryFromSignature(majoritySignature) : null,
            variants
        });
    }

    const stableCount = results.filter((result) => result.stable).length;
    return {
        schema_version: "ak_quality_pixel_crop_sensitivity_v1",
        generated_at: generatedAt,
        source_pixel_report_schema_version: pixelReport.schema_version || null,
        quality_profile: resolvedQualityProfile,
        change_class: "RESEARCH_ONLY",
        methodology: {
            crop_variant_grid: "3x3",
            jitter,
            pixel_training_label_allowed: false,
            references: [
                "https://docs.opencv.org/4.x/da/d97/tutorial_threshold_inRange.html",
                "https://docs.opencv.org/4.x/d3/dc0/group__imgproc__shape.html",
                "https://docs.opencv.org/4.x/d4/dc6/tutorial_py_template_matching.html"
            ]
        },
        notes: [
            "This report checks whether quality pixel counts survive small crop shifts.",
            "Stable pixel counts are still review-only evidence, not training labels.",
            "Crop-sensitive rows should be reviewed manually before clean replay export."
        ],
        summary: {
            image_count: results.length,
            crop_variant_count: results.length ? Math.max(...results.map((result) => result.variant_count)) : 0,
            stable_count: stableCount,
            unstable_count: results.length - stableCount,
            pixel_training_label_allowed_count: 0
        },
        results
    };
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function formatSummary(summary = {}) {
    const counts = normalizeCounts(summary.counts || {});
    return `${QUALITY_ORDER.map((quality) => `${quality}:${counts[quality]}`).join(", ")}; total=${summary.total ?? 0}`;
}

function formatQualityPixelCropSensitivityMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report && report.summary ? report.summary : {};
    const results = Array.isArray(report && report.results) ? report.results : [];
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = results.length
        ? results.map((result) => tableRow([
            markdownCode(result.basename),
            markdownCode(result.action),
            markdownCode(result.stable ? "stable" : "unstable"),
            markdownCode(result.variant_count),
            markdownCode(result.unique_signature_count),
            markdownCode(result.majority_fraction),
            markdownCell(formatSummary(result.majority_summary || {})),
            markdownCode(result.file)
        ])).join("\n")
        : "| `-` | `-` | `-` | `0` | `0` | `0` | - | `-` |";

    return `# 2026-04-24 quality pixel crop sensitivity

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- images: \`${summary.image_count || 0}\`
- crop variants per image: \`${summary.crop_variant_count || 0}\`
- stable: \`${summary.stable_count || 0}\`
- unstable: \`${summary.unstable_count || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`
- 用途: 检查右侧品质格像素计数对 crop 轻微偏移是否敏感；敏感样本进入人工复核。

## 明细

| image | action | stability | variants | signatures | majority fraction | majority counts | file |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
${rows}

## 护栏

- stable 只代表像素复核线索稳定，不代表可作为训练标签。
- unstable 或缺源图时，不能进入 clean replay 样本导出。
- 后续改权重仍必须依赖人工填写的 \`observed_state + manual actual_counts\`。
`;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeMarkdown(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

async function main(argv = process.argv.slice(2)) {
    const { pixelReportPath, outputPath, jitter, qualityProfile } = resolveArgs(argv);
    const report = await buildQualityPixelCropSensitivityReport({
        pixelReport: JSON.parse(fs.readFileSync(pixelReportPath, "utf8")),
        jitter,
        qualityProfile
    });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatQualityPixelCropSensitivityMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_JITTER,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PIXEL_REPORT_PATH,
    buildCropVariants,
    buildQualityPixelCropSensitivityReport,
    formatQualityPixelCropSensitivityMarkdown,
    main,
    resolveArgs
};
