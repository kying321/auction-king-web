const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const DEFAULT_PANEL_CROP = {
    left: 0.596,
    top: 0.216,
    width: 0.393,
    height: 0.565
};
const DEFAULT_HEADER_HEIGHT = 34;
const DEFAULT_MIN_OVERLAP = 80;
const DEFAULT_SEARCH_STEP = 3;

function isImagePath(filePath) {
    return /\.(png|jpe?g|webp)$/i.test(filePath);
}

function normalizeName(value) {
    return String(value || "capture")
        .replace(/\.[^.]+$/, "")
        .replace(/[^A-Za-z0-9_.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "capture";
}

function parseNumberList(value, expectedLength) {
    const parts = String(value || "")
        .split(",")
        .map((part) => Number(part.trim()));
    if (parts.length !== expectedLength || parts.some((part) => !Number.isFinite(part))) return null;
    return parts;
}

function parseCrop(value) {
    const parts = parseNumberList(String(value || "").replace(/^--crop=/, ""), 4);
    if (!parts) return DEFAULT_PANEL_CROP;
    return {
        left: parts[0],
        top: parts[1],
        width: parts[2],
        height: parts[3]
    };
}

function parseArgs(argv = process.argv.slice(2)) {
    const inputPaths = [];
    let outputPath = null;
    let crop = DEFAULT_PANEL_CROP;
    let headerHeight = DEFAULT_HEADER_HEIGHT;
    let minOverlap = DEFAULT_MIN_OVERLAP;

    argv.forEach((arg) => {
        const text = String(arg);
        if (text.startsWith("--output=")) {
            outputPath = path.resolve(text.replace(/^--output=/, ""));
            return;
        }
        if (text.startsWith("--crop=")) {
            crop = parseCrop(text);
            return;
        }
        if (text.startsWith("--header-height=")) {
            const numeric = Number(text.replace(/^--header-height=/, ""));
            if (Number.isFinite(numeric) && numeric >= 0) headerHeight = Math.round(numeric);
            return;
        }
        if (text.startsWith("--min-overlap=")) {
            const numeric = Number(text.replace(/^--min-overlap=/, ""));
            if (Number.isFinite(numeric) && numeric > 0) minOverlap = Math.round(numeric);
            return;
        }
        inputPaths.push(path.resolve(text));
    });

    return {
        inputPaths,
        outputPath,
        crop,
        headerHeight,
        minOverlap
    };
}

function resolveDimension(value, total, fallback, { includeOne = false } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    if (numeric > 0 && (includeOne ? numeric <= 1 : numeric < 1)) return numeric * total;
    return numeric;
}

function clampInteger(value, min, max) {
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
}

function resolveCrop(crop, width, height) {
    const left = clampInteger(resolveDimension(crop.left ?? crop.x, width, 0), 0, Math.max(0, width - 1));
    const top = clampInteger(resolveDimension(crop.top ?? crop.y, height, 0), 0, Math.max(0, height - 1));
    const cropWidth = clampInteger(resolveDimension(crop.width, width, width - left, { includeOne: true }), 1, width - left);
    const cropHeight = clampInteger(resolveDimension(crop.height, height, height - top, { includeOne: true }), 1, height - top);
    return {
        left,
        top,
        width: cropWidth,
        height: cropHeight
    };
}

function extractDataUrl(payload) {
    return payload
        && (
            payload.screenshot_attachment?.data_url
            || payload.settlement_sample?.metadata?.screenshot_attachment?.data_url
        );
}

function decodeDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:(image\/[^;]+);base64,(.*)$/);
    if (!match) return null;
    return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], "base64")
    };
}

function readCaptureInput(inputPath) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`输入不存在: ${inputPath}`);
    }
    if (isImagePath(inputPath)) {
        return {
            input_path: inputPath,
            basename: path.basename(inputPath),
            buffer: fs.readFileSync(inputPath),
            source_kind: "image_file"
        };
    }
    if (!/\.json$/i.test(inputPath)) {
        throw new Error(`只支持 capture JSON 或图片文件: ${inputPath}`);
    }
    const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const decoded = decodeDataUrl(extractDataUrl(payload));
    if (!decoded) {
        throw new Error(`capture JSON 缺少 screenshot_attachment.data_url: ${inputPath}`);
    }
    return {
        input_path: inputPath,
        basename: path.basename(inputPath),
        buffer: decoded.buffer,
        mime_type: decoded.mimeType,
        source_kind: "capture_json",
        map_id: payload.map_id || null,
        exported_at: payload.exported_at || null,
        field_values: payload.field_values || null
    };
}

async function buildPanelFrame(source, cropSpec) {
    const metadata = await sharp(source.buffer).metadata();
    const crop = resolveCrop(cropSpec, metadata.width, metadata.height);
    const cropBuffer = await sharp(source.buffer).extract(crop).png().toBuffer();
    const raw = await sharp(cropBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
        ...source,
        image: {
            width: metadata.width,
            height: metadata.height
        },
        crop,
        crop_buffer: cropBuffer,
        raw_data: raw.data,
        raw_info: raw.info
    };
}

function contentRegionFor(frame, headerHeight) {
    const safeHeaderHeight = clampInteger(headerHeight, 0, Math.max(0, frame.crop.height - 1));
    return {
        left: 0,
        top: safeHeaderHeight,
        width: frame.crop.width,
        height: frame.crop.height - safeHeaderHeight
    };
}

async function buildContentFrame(frame, headerHeight) {
    const contentCrop = contentRegionFor(frame, headerHeight);
    const contentBuffer = await sharp(frame.crop_buffer).extract(contentCrop).png().toBuffer();
    const raw = await sharp(contentBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return {
        frame,
        content_crop: contentCrop,
        content_buffer: contentBuffer,
        raw_data: raw.data,
        raw_info: raw.info
    };
}

function scoreVerticalOverlap(previous, next, delta, searchStep = DEFAULT_SEARCH_STEP) {
    const width = Math.min(previous.raw_info.width, next.raw_info.width);
    const previousHeight = previous.raw_info.height;
    const nextHeight = next.raw_info.height;
    const previousChannels = previous.raw_info.channels;
    const nextChannels = next.raw_info.channels;
    const overlap = Math.min(previousHeight - delta, nextHeight);
    if (overlap <= 0) return Infinity;
    let sum = 0;
    let count = 0;
    const step = Math.max(1, Math.round(searchStep));

    for (let y = 0; y < overlap; y += step) {
        for (let x = 0; x < width; x += step) {
            const previousIndex = (((y + delta) * previous.raw_info.width) + x) * previousChannels;
            const nextIndex = ((y * next.raw_info.width) + x) * nextChannels;
            const redDelta = previous.raw_data[previousIndex] - next.raw_data[nextIndex];
            const greenDelta = previous.raw_data[previousIndex + 1] - next.raw_data[nextIndex + 1];
            const blueDelta = previous.raw_data[previousIndex + 2] - next.raw_data[nextIndex + 2];
            sum += (redDelta * redDelta) + (greenDelta * greenDelta) + (blueDelta * blueDelta);
            count += 3;
        }
    }

    return count > 0 ? sum / count : Infinity;
}

function findBestVerticalOffset(previous, next, {
    minOverlap = DEFAULT_MIN_OVERLAP,
    searchStep = DEFAULT_SEARCH_STEP
} = {}) {
    const height = previous.raw_info.height;
    const comparableHeight = Math.min(previous.raw_info.height, next.raw_info.height);
    const safeMinOverlap = clampInteger(minOverlap, 1, Math.max(1, comparableHeight - 1));
    let best = {
        delta: null,
        overlap: 0,
        mse: Infinity
    };

    for (let delta = 1; delta <= height - safeMinOverlap; delta += 1) {
        const mse = scoreVerticalOverlap(previous, next, delta, searchStep);
        if (mse < best.mse) {
            best = {
                delta,
                overlap: height - delta,
                mse: Math.round(mse * 1000) / 1000
            };
        }
    }

    if (best.delta === null) {
        throw new Error("没有找到可用重叠区域。");
    }
    return best;
}

function defaultOutputPath(inputPaths) {
    const names = inputPaths.map((inputPath) => normalizeName(path.basename(inputPath))).slice(0, 3);
    return path.join(process.cwd(), "tmp_capture_review", `${names.join("__") || "capture"}-stitched.png`);
}

async function cropBufferToWidth(buffer, width) {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || metadata.width === width) return buffer;
    return sharp(buffer)
        .extract({
            left: 0,
            top: 0,
            width: Math.min(width, metadata.width),
            height: metadata.height
        })
        .png()
        .toBuffer();
}

async function stitchCaptureScreenshots(inputPaths, {
    outputPath = null,
    crop = DEFAULT_PANEL_CROP,
    headerHeight = DEFAULT_HEADER_HEIGHT,
    minOverlap = DEFAULT_MIN_OVERLAP
} = {}) {
    if (!Array.isArray(inputPaths) || inputPaths.length < 1) {
        throw new Error("至少需要一个 capture JSON 或图片文件。");
    }

    const sources = inputPaths.map(readCaptureInput);
    const panelFrames = [];
    for (const source of sources) {
        panelFrames.push(await buildPanelFrame(source, crop));
    }

    const contentFrames = [];
    for (const panelFrame of panelFrames) {
        contentFrames.push(await buildContentFrame(panelFrame, headerHeight));
    }
    const contentWidths = contentFrames.map((frame) => frame.raw_info.width);
    const minContentWidth = Math.min(...contentWidths);
    const outputWidth = Math.max(...contentWidths);
    const maxContentWidth = outputWidth;
    const widthRatio = maxContentWidth > 0 ? minContentWidth / maxContentWidth : 1;
    const widthNormalization = {
        strategy: "max_width_canvas_shared_area_match",
        input_content_widths: contentWidths,
        comparison_width: minContentWidth,
        output_width: outputWidth,
        min_to_max_ratio: Math.round(widthRatio * 10000) / 10000,
        applied: contentWidths.some((width) => width !== outputWidth),
        quality_flags: [
            widthRatio < 0.5 ? "severe_width_mismatch_review_image_may_be_partial" : null,
            minContentWidth < 160 ? "narrow_capture_fragment_needs_recapture_or_manual_single_review" : null
        ].filter(Boolean)
    };

    const offsets = [0];
    const matches = [];
    for (let index = 1; index < contentFrames.length; index += 1) {
        const match = findBestVerticalOffset(contentFrames[index - 1], contentFrames[index], { minOverlap });
        offsets.push(offsets[index - 1] + match.delta);
        matches.push({
            previous: panelFrames[index - 1].basename,
            next: panelFrames[index].basename,
            delta: match.delta,
            overlap: match.overlap,
            mse: match.mse
        });
    }

    const safeHeaderHeight = clampInteger(headerHeight, 0, Math.max(0, panelFrames[0].crop.height - 1));
    const contentBottom = contentFrames.reduce(
        (maxBottom, contentFrame, index) => Math.max(maxBottom, offsets[index] + contentFrame.raw_info.height),
        0
    );
    const height = safeHeaderHeight + contentBottom;
    const headerBuffer = safeHeaderHeight > 0
        ? await sharp(panelFrames[0].crop_buffer)
            .extract({ left: 0, top: 0, width: Math.min(outputWidth, panelFrames[0].crop.width), height: safeHeaderHeight })
            .png()
            .toBuffer()
        : null;

    const composites = [];
    if (headerBuffer) composites.push({ input: headerBuffer, left: 0, top: 0 });
    for (const contentFrame of contentFrames) {
        contentFrame.normalized_content_buffer = await cropBufferToWidth(contentFrame.content_buffer, outputWidth);
    }
    contentFrames.forEach((contentFrame, index) => {
        composites.push({
            input: contentFrame.normalized_content_buffer || contentFrame.content_buffer,
            left: 0,
            top: safeHeaderHeight + offsets[index]
        });
    });

    const resolvedOutputPath = outputPath ? path.resolve(outputPath) : defaultOutputPath(inputPaths);
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    await sharp({
        create: {
            width: outputWidth,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite(composites)
        .png()
        .toFile(resolvedOutputPath);

    const manifest = {
        schema_version: "ak_capture_screenshot_stitch_v1",
        change_class: "RESEARCH_ONLY",
        output_path: resolvedOutputPath,
        output_image: {
            width: outputWidth,
            height
        },
        crop,
        resolved_panel_crop: panelFrames[0].crop,
        width_normalization: widthNormalization,
        header_height: safeHeaderHeight,
        input_count: inputPaths.length,
        inputs: panelFrames.map((frame, index) => ({
            index,
            input_path: frame.input_path,
            basename: frame.basename,
            source_kind: frame.source_kind,
            map_id: frame.map_id || null,
            field_values: frame.field_values || null,
            source_image: frame.image,
            panel_crop: frame.crop,
            stitched_content_y: safeHeaderHeight + offsets[index]
        })),
        matches
    };
    const manifestPath = resolvedOutputPath.replace(/\.[^.]+$/, ".json");
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return {
        outputPath: resolvedOutputPath,
        manifestPath,
        manifest
    };
}

async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.inputPaths.length < 1) {
        throw new Error("用法: node scripts/stitch_capture_screenshots.js <capture-a.json|image-a> [capture-b.json|image-b ...] [--output=out.png] [--crop=left,top,width,height] [--header-height=34]");
    }
    const result = await stitchCaptureScreenshots(args.inputPaths, args);
    process.stdout.write(`${result.outputPath}\n${result.manifestPath}\n`);
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_HEADER_HEIGHT,
    DEFAULT_PANEL_CROP,
    findBestVerticalOffset,
    parseArgs,
    parseCrop,
    readCaptureInput,
    resolveCrop,
    scoreVerticalOverlap,
    stitchCaptureScreenshots
};
