const OCR_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const OCR_LANGUAGES = ["chi_sim", "eng"];
const OCR_ENGINE_MODE = 1;
const DEFAULT_TESSERACT_SETTINGS = {
    psm: 6,
    dpi: 300,
    preserveInterwordSpaces: true
};

let ocrScriptPromise = null;

function normalizeRelativeCrop(region) {
    if (!region || typeof region !== "object") return null;
    const x = Number(region.x);
    const y = Number(region.y);
    const width = Number(region.width);
    const height = Number(region.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    if (x < 0 || y < 0 || width <= 0 || height <= 0) return null;
    if (x >= 1 || y >= 1) return null;
    if (x + width > 1 || y + height > 1) return null;
    return { x, y, width, height };
}

function normalizeRecognizedText(value) {
    return String(value || "")
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
}

function normalizeAdaptiveThresholdConfig(value) {
    if (!value) return null;
    const source = value === true ? {} : (typeof value === "object" ? value : null);
    if (!source) return null;
    const rawBlockSize = Number(source.blockSize ?? source.block_size ?? 31);
    const blockSize = Math.max(3, Math.min(101, Math.round(Number.isFinite(rawBlockSize) ? rawBlockSize : 31)));
    const oddBlockSize = blockSize % 2 === 1 ? blockSize : blockSize + 1;
    const rawConstant = Number(source.c ?? source.constant ?? 8);
    return {
        blockSize: oddBlockSize,
        c: Number.isFinite(rawConstant) ? rawConstant : 8,
        invert: source.invert === true
    };
}

function normalizeTesseractSettings(source = {}) {
    const settings = { ...DEFAULT_TESSERACT_SETTINGS };
    const rawPsm = Number(source.psm ?? source.pageSegmentationMode ?? source.page_segmentation_mode);
    if (Number.isFinite(rawPsm) && rawPsm >= 0 && rawPsm <= 13) settings.psm = Math.round(rawPsm);
    const rawDpi = Number(source.dpi ?? source.userDefinedDpi ?? source.user_defined_dpi);
    if (Number.isFinite(rawDpi) && rawDpi > 0) settings.dpi = Math.round(rawDpi);
    if (typeof source.preserveInterwordSpaces === "boolean") settings.preserveInterwordSpaces = source.preserveInterwordSpaces;
    if (typeof source.preserve_interword_spaces === "boolean") settings.preserveInterwordSpaces = source.preserve_interword_spaces;
    const whitelist = String(source.whitelist ?? source.charWhitelist ?? source.tessedit_char_whitelist ?? "").trim();
    if (whitelist) settings.whitelist = whitelist;
    return settings;
}

function buildTesseractParameters(settings = {}) {
    const normalized = normalizeTesseractSettings(settings);
    const parameters = {
        tessedit_pageseg_mode: String(normalized.psm),
        preserve_interword_spaces: normalized.preserveInterwordSpaces ? "1" : "0",
        user_defined_dpi: String(normalized.dpi),
        tessedit_char_whitelist: normalized.whitelist || ""
    };
    return parameters;
}

function buildBattleRegionAttempts(ocrConfig = null) {
    const presets = ocrConfig && ocrConfig.battle_region_presets;
    if (!presets || typeof presets !== "object") return [];

    return Object.entries(presets).flatMap(([key, region]) => {
        const cropRelative = normalizeRelativeCrop(region);
        if (!cropRelative) return [];
        return [{
            label: `battle-region:${key}`,
            preprocess: {
                scale: Number.isFinite(Number(region.scale)) ? Number(region.scale) : 2.2,
                grayscale: region.grayscale !== false,
                contrastBoost: Number.isFinite(Number(region.contrastBoost)) ? Number(region.contrastBoost) : 38,
                threshold: Number.isFinite(Number(region.threshold)) ? Number(region.threshold) : null,
                adaptiveThreshold: normalizeAdaptiveThresholdConfig(region.adaptiveThreshold || region.adaptive_threshold),
                cropRelative
            },
            tesseract: normalizeTesseractSettings(region)
        }];
    });
}

function buildRecognitionPlan(mode = "battle", options = {}) {
    if (mode === "settlement") {
        return [
            {
                label: "settlement-default",
                preprocess: { scale: 2.2, grayscale: true, contrastBoost: 40 },
                tesseract: normalizeTesseractSettings({ psm: 6, preserveInterwordSpaces: true })
            }
        ];
    }

    return [
        {
            label: "battle-default",
            preprocess: { scale: 1.9, grayscale: true, contrastBoost: 34 },
            tesseract: normalizeTesseractSettings({ psm: 6 })
        },
        {
            label: "battle-threshold",
            preprocess: { scale: 2.3, grayscale: true, contrastBoost: 46, threshold: 176 },
            tesseract: normalizeTesseractSettings({ psm: 6 })
        },
        {
            label: "battle-soft-threshold",
            preprocess: { scale: 2.1, grayscale: true, contrastBoost: 38, threshold: 156 },
            tesseract: normalizeTesseractSettings({ psm: 11 })
        },
        {
            label: "battle-adaptive-threshold",
            preprocess: { scale: 2.2, grayscale: true, contrastBoost: 42, adaptiveThreshold: { blockSize: 33, c: 8 } },
            tesseract: normalizeTesseractSettings({ psm: 6 })
        },
        ...buildBattleRegionAttempts(options.ocrConfig || null)
    ];
}

function dedupeMergedLines(lines) {
    const seen = new Set();
    const merged = [];
    lines.forEach((line) => {
        const normalizedKey = normalizeRecognizedText(line);
        if (!normalizedKey || seen.has(normalizedKey)) return;
        seen.add(normalizedKey);
        merged.push(line.trim());
    });
    return merged;
}

function mergeRecognitionResults(results) {
    const normalizedResults = Array.isArray(results) ? results.filter(Boolean) : [];
    if (!normalizedResults.length) {
        return {
            text: "",
            confidence: 0,
            processedImages: [],
            attempts: []
        };
    }

    const mergedLines = dedupeMergedLines(
        normalizedResults.flatMap((result) => normalizeRecognizedText(result.text).split("\n"))
    );
    const bestConfidence = normalizedResults.reduce((best, result) => {
        return Math.max(best, Number.isFinite(result.confidence) ? result.confidence : 0);
    }, 0);

    return {
        text: mergedLines.join("\n"),
        confidence: bestConfidence,
        processedImages: normalizedResults.map((result) => result.processedImage).filter(Boolean),
        attempts: normalizedResults.map((result) => ({
            label: result.label || "",
            confidence: Number.isFinite(result.confidence) ? result.confidence : 0
        }))
    };
}

function loadTesseractScript() {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("OCR 仅支持浏览器环境。"));
    }
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (ocrScriptPromise) return ocrScriptPromise;

    ocrScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = OCR_SCRIPT_URL;
        script.async = true;
        script.onload = () => {
            if (window.Tesseract) resolve(window.Tesseract);
            else reject(new Error("OCR 运行时加载成功，但未找到 Tesseract 全局对象。"));
        };
        script.onerror = () => reject(new Error("OCR 运行时脚本加载失败，请检查网络。"));
        document.head.appendChild(script);
    });

    return ocrScriptPromise;
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("图片加载失败，无法执行 OCR。"));
        };
        image.src = objectUrl;
    });
}

async function preprocessImageFile(fileOrImage, { scale = 1.8, grayscale = true, contrastBoost = 32, threshold = null, adaptiveThreshold = null, cropRelative = null } = {}) {
    const image = fileOrImage && Number.isFinite(fileOrImage.width) && Number.isFinite(fileOrImage.height)
        ? fileOrImage
        : await loadImageFromFile(fileOrImage);
    const crop = normalizeRelativeCrop(cropRelative);
    const sourceX = crop ? Math.round(image.width * crop.x) : 0;
    const sourceY = crop ? Math.round(image.height * crop.y) : 0;
    const sourceWidth = crop ? Math.max(1, Math.round(image.width * crop.width)) : image.width;
    const sourceHeight = crop ? Math.max(1, Math.round(image.height * crop.height)) : image.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

    if (grayscale) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const adaptiveThresholdConfig = normalizeAdaptiveThresholdConfig(adaptiveThreshold);
        const grayValues = adaptiveThresholdConfig ? new Uint8ClampedArray(canvas.width * canvas.height) : null;
        for (let index = 0, pixelIndex = 0; index < data.length; index += 4, pixelIndex += 1) {
            const gray = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
            const boosted = Math.max(0, Math.min(255, (gray - 128) * (1 + contrastBoost / 100) + 128));
            const finalValue = Number.isFinite(threshold) ? (boosted >= threshold ? 255 : 0) : boosted;
            if (grayValues) grayValues[pixelIndex] = boosted;
            data[index] = finalValue;
            data[index + 1] = finalValue;
            data[index + 2] = finalValue;
        }
        if (adaptiveThresholdConfig) {
            applyAdaptiveThresholdToImageData(imageData, grayValues, canvas.width, canvas.height, adaptiveThresholdConfig);
        }
        ctx.putImageData(imageData, 0, 0);
    }

    return canvas.toDataURL("image/png");
}

function applyAdaptiveThresholdToImageData(imageData, grayValues, width, height, options) {
    const data = imageData.data;
    const stride = width + 1;
    const integral = new Float64Array((width + 1) * (height + 1));

    for (let y = 1; y <= height; y += 1) {
        let rowSum = 0;
        for (let x = 1; x <= width; x += 1) {
            rowSum += grayValues[((y - 1) * width) + (x - 1)];
            integral[(y * stride) + x] = integral[((y - 1) * stride) + x] + rowSum;
        }
    }

    const radius = Math.floor(options.blockSize / 2);
    for (let y = 0; y < height; y += 1) {
        const top = Math.max(0, y - radius);
        const bottom = Math.min(height, y + radius + 1);
        for (let x = 0; x < width; x += 1) {
            const left = Math.max(0, x - radius);
            const right = Math.min(width, x + radius + 1);
            const area = (right - left) * (bottom - top);
            const sum = integral[(bottom * stride) + right]
                - integral[(top * stride) + right]
                - integral[(bottom * stride) + left]
                + integral[(top * stride) + left];
            const localMean = sum / area;
            const isBright = grayValues[(y * width) + x] >= localMean - options.c;
            const finalValue = options.invert ? (isBright ? 0 : 255) : (isBright ? 255 : 0);
            const offset = ((y * width) + x) * 4;
            data[offset] = finalValue;
            data[offset + 1] = finalValue;
            data[offset + 2] = finalValue;
        }
    }
}

async function createRecognitionWorker(Tesseract, { onProgress = null } = {}) {
    if (!Tesseract || typeof Tesseract.createWorker !== "function") return null;
    return Tesseract.createWorker(OCR_LANGUAGES, OCR_ENGINE_MODE, {
        logger: (message) => {
            if (typeof onProgress === "function") onProgress(message);
        }
    });
}

async function runTesseractRecognition(Tesseract, worker, image, attempt, logger) {
    const parameters = buildTesseractParameters(attempt.tesseract);
    if (worker && typeof worker.setParameters === "function" && typeof worker.recognize === "function") {
        await worker.setParameters(parameters);
        return worker.recognize(image);
    }
    return Tesseract.recognize(image, OCR_LANGUAGES.join("+"), {
        ...parameters,
        logger
    });
}

async function recognizeImageFile(file, { mode = "battle", onProgress = null, ocrConfig = null } = {}) {
    if (!file) throw new Error("请先选择截图文件。");
    const Tesseract = await loadTesseractScript();
    const image = await loadImageFromFile(file);
    const plan = buildRecognitionPlan(mode, { ocrConfig });
    const attemptResults = [];
    let activeAttemptIndex = 0;
    let activeAttemptLabel = "ocr-runtime";

    const progressLogger = (message) => {
        if (typeof onProgress !== "function") return;
        onProgress({
            ...message,
            status: activeAttemptLabel ? `${activeAttemptLabel} ${message.status || ""}`.trim() : message.status,
            progress: Number.isFinite(message.progress)
                ? Math.min(1, (activeAttemptIndex + message.progress) / plan.length)
                : message.progress
        });
    };
    const worker = await createRecognitionWorker(Tesseract, { onProgress: progressLogger });

    try {
        for (let index = 0; index < plan.length; index += 1) {
            const attempt = plan[index];
            activeAttemptIndex = index;
            activeAttemptLabel = attempt.label || "";
            const processedImage = await preprocessImageFile(image, attempt.preprocess);
            const result = await runTesseractRecognition(Tesseract, worker, processedImage, attempt, progressLogger);

            attemptResults.push({
                label: attempt.label,
                text: result && result.data ? result.data.text || "" : "",
                confidence: result && result.data ? result.data.confidence || 0 : 0,
                processedImage
            });
        }
    } finally {
        if (worker && typeof worker.terminate === "function") {
            await worker.terminate();
        }
    }

    const merged = mergeRecognitionResults(attemptResults);
    return {
        text: merged.text,
        confidence: merged.confidence,
        processedImage: merged.processedImages[0] || null,
        processedImages: merged.processedImages,
        attempts: merged.attempts
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        OCR_SCRIPT_URL,
        buildBattleRegionAttempts,
        buildRecognitionPlan,
        buildTesseractParameters,
        mergeRecognitionResults
    };
}

if (typeof window !== "undefined") {
    window.loadTesseractScript = loadTesseractScript;
    window.recognizeImageFile = recognizeImageFile;
}
