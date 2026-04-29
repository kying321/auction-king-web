const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { readCaptureInput } = require("./stitch_capture_screenshots.js");
const {
    QUALITY_COLOR_PROFILES,
    analyzeQualityColorBlocksFromImageFile,
    summarizeQualityBlocks
} = require("../pixel_quality_analyzer.js");

const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "docs", "research", "quality_pixel_report.json");
const DEFAULT_CROP = {
    x: 0.55,
    y: 0.05,
    width: 0.43,
    height: 0.84
};
const DEFAULT_QUALITY_PROFILE = "high_contrast_191";

function isImagePath(filePath) {
    return /\.(png|jpe?g|webp)$/i.test(filePath);
}

function isJsonPath(filePath) {
    return /\.json$/i.test(filePath);
}

function extensionFromMimeType(mimeType = "") {
    const normalized = String(mimeType || "").toLowerCase();
    if (normalized.includes("png")) return ".png";
    if (normalized.includes("webp")) return ".webp";
    if (normalized.includes("jpeg") || normalized.includes("jpg")) return ".jpg";
    return ".png";
}

function safeBaseName(value) {
    return String(value || "capture")
        .replace(/\.[^.]+$/, "")
        .replace(/[^A-Za-z0-9_.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "capture";
}

function extractCaptureJsonScreenshot(inputPath, extractionDir) {
    if (!extractionDir) return null;
    let source;
    try {
        source = readCaptureInput(inputPath);
    } catch (_error) {
        return null;
    }
    if (!source || !source.buffer || source.source_kind !== "capture_json") return null;
    fs.mkdirSync(extractionDir, { recursive: true });
    const outputPath = path.join(
        extractionDir,
        `${safeBaseName(path.basename(inputPath))}-screenshot${extensionFromMimeType(source.mime_type)}`
    );
    fs.writeFileSync(outputPath, source.buffer);
    return outputPath;
}

function normalizeJsonInputPath(resolved, extractionDir) {
    const extracted = extractCaptureJsonScreenshot(resolved, extractionDir);
    if (extracted) return [extracted];

    const payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
    const entries = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload.images) ? payload.images : (Array.isArray(payload.samples) ? payload.samples : []));
    return entries
        .map((entry) => {
            if (typeof entry === "string") return entry;
            if (!entry || typeof entry !== "object") return null;
            return entry.source_image_path || entry.file || entry.path || null;
        })
        .filter(Boolean)
        .map((entry) => path.resolve(entry))
        .filter((entry) => fs.existsSync(entry) && isImagePath(entry));
}

function normalizeInputPath(inputPath, { extractionDir = null } = {}) {
    const resolved = path.resolve(inputPath);
    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
        return fs.readdirSync(resolved)
            .sort()
            .flatMap((name) => {
                const filePath = path.join(resolved, name);
                if (isImagePath(filePath)) return [filePath];
                if (isJsonPath(filePath)) return normalizeJsonInputPath(filePath, extractionDir);
                return [];
            });
    }

    if (stat.isFile() && isImagePath(resolved)) return [resolved];

    if (stat.isFile() && isJsonPath(resolved)) {
        return normalizeJsonInputPath(resolved, extractionDir);
    }

    return [];
}

function parseCrop(value) {
    if (!value) return DEFAULT_CROP;
    const text = String(value).replace(/^--crop=/, "");
    const parts = text.split(",").map((part) => Number(part.trim()));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return DEFAULT_CROP;
    return {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3]
    };
}

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let crop = DEFAULT_CROP;
    let qualityProfile = DEFAULT_QUALITY_PROFILE;

    argv.forEach((arg) => {
        if (String(arg).startsWith("--crop=")) {
            crop = parseCrop(arg);
            return;
        }
        if (String(arg).startsWith("--profile=")) {
            qualityProfile = String(arg).replace(/^--profile=/, "").trim() || DEFAULT_QUALITY_PROFILE;
            return;
        }
        positional.push(arg);
    });

    return {
        inputPath: positional[0] ? path.resolve(positional[0]) : null,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        crop,
        qualityProfile
    };
}

function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&apos;"
    }[char]));
}

async function renderOverlay(filePath, report, overlayPath) {
    const colors = {
        w: "#f1f5f9",
        g: "#40d46a",
        b: "#4ea1ff",
        p: "#a65cff",
        o: "#ffd04c",
        r: "#f24c4c"
    };
    const width = report.image.width;
    const height = report.image.height;
    const rects = report.blocks.map((block, index) => {
        const color = colors[block.quality] || "#ffffff";
        const label = `${QUALITY_COLOR_PROFILES[block.quality].label}${index + 1}`;
        return `
<rect x="${block.x}" y="${block.y}" width="${block.width}" height="${block.height}" fill="none" stroke="${color}" stroke-width="4"/>
<text x="${block.x}" y="${Math.max(16, block.y - 5)}" fill="${color}" font-size="18" font-family="Menlo, Arial">${escapeXml(label)}</text>`;
    }).join("");
    const crop = report.crop;
    const svg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${crop.left}" y="${crop.top}" width="${crop.width}" height="${crop.height}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-dasharray="10 8"/>
  ${rects}
</svg>`);

    await sharp(filePath)
        .composite([{ input: svg, left: 0, top: 0 }])
        .png()
        .toFile(overlayPath);
}

async function buildQualityPixelReport(inputFiles, {
    crop = DEFAULT_CROP,
    outputPath = DEFAULT_OUTPUT_PATH,
    minComponentPixels = 120,
    qualityProfile = DEFAULT_QUALITY_PROFILE
} = {}) {
    const outputDir = path.dirname(outputPath);
    const outputBaseName = path.basename(outputPath).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_.-]+/g, "_") || "quality_pixel_report";
    const overlayDir = path.join(outputDir, `${outputBaseName}_quality_pixel_overlays`);
    fs.mkdirSync(overlayDir, { recursive: true });

    const results = [];
    for (const filePath of inputFiles) {
        const analysis = await analyzeQualityColorBlocksFromImageFile(filePath, {
            crop,
            minComponentPixels,
            qualityProfile
        });
        const summary = summarizeQualityBlocks(analysis.blocks);
        const base = path.basename(filePath).replace(/\.[^.]+$/, "");
        const overlayPath = path.join(overlayDir, `${base}-quality-overlay.png`);
        await renderOverlay(filePath, analysis, overlayPath);
        results.push({
            file: filePath,
            basename: path.basename(filePath),
            overlay_path: overlayPath,
            quality_profile: analysis.quality_profile,
            image: analysis.image,
            crop: analysis.crop,
            summary,
            blocks: analysis.blocks
        });
    }

    return {
        schema_version: "ak_quality_pixel_report_v2",
        generated_at: new Date().toISOString(),
        quality_profile: qualityProfile,
        image_count: results.length,
        crop,
        results
    };
}

async function main(argv = process.argv.slice(2)) {
    const { inputPath, outputPath, crop, qualityProfile } = resolveArgs(argv);
    if (!inputPath) {
        throw new Error("需要提供图片、图片目录或图片清单 JSON: node scripts/build_quality_pixel_report.js <input> [output.json] [--crop=x,y,w,h] [--profile=high_contrast_191|standard]");
    }

    const extractionDir = path.join(
        path.dirname(outputPath),
        `${path.basename(outputPath).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_.-]+/g, "_") || "quality_pixel_report"}_extracted_screenshots`
    );
    const inputFiles = normalizeInputPath(inputPath, { extractionDir });
    const report = await buildQualityPixelReport(inputFiles, { crop, outputPath, qualityProfile });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_CROP,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_QUALITY_PROFILE,
    buildQualityPixelReport,
    main,
    normalizeInputPath,
    parseCrop,
    resolveArgs
};
