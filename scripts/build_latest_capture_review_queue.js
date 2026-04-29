const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    buildCaptureFullCountReviewTemplate,
    captureGroupKey,
    formatCaptureFullCountReviewTemplateMarkdown,
    groupCapturePackages
} = require("./build_capture_full_count_review_template.js");
const {
    buildCountFitSampleReviewResultsSeed,
    formatCountFitSampleReviewResultsSeedMarkdown
} = require("./build_count_fit_sample_review_results_seed.js");
const {
    buildCountFitSampleReviewImport,
    formatCountFitSampleReviewImportMarkdown
} = require("./build_count_fit_sample_review_import.js");
const {
    stitchCaptureScreenshots
} = require("./stitch_capture_screenshots.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INPUT_DIR = path.join(os.homedir(), "Downloads");
const DEFAULT_MAP_ID = "sunken_ship";
const DEFAULT_GROUP_MAX_GAP_MS = 120000;

function resolveArgs(argv = process.argv.slice(2)) {
    const result = {
        inputDir: DEFAULT_INPUT_DIR,
        mapId: DEFAULT_MAP_ID,
        outputPrefix: null,
        reviewImageDir: path.join(ROOT_DIR, "tmp_capture_review"),
        generatedAt: new Date().toISOString(),
        groupMaxGapMs: DEFAULT_GROUP_MAX_GAP_MS,
        skipStitch: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        const eqIndex = arg.indexOf("=");
        const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
        const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : null;
        const nextValue = () => {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flag} 缺少值`);
            if (inlineValue === null) index += 1;
            return String(value);
        };

        if (flag === "--input-dir") {
            result.inputDir = path.resolve(nextValue());
        } else if (flag === "--map-id") {
            result.mapId = nextValue();
        } else if (flag === "--output-prefix") {
            result.outputPrefix = path.resolve(nextValue());
        } else if (flag === "--review-image-dir") {
            result.reviewImageDir = path.resolve(nextValue());
        } else if (flag === "--generated-at") {
            result.generatedAt = nextValue();
        } else if (flag === "--group-max-gap-ms") {
            const numeric = Number(nextValue());
            if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("--group-max-gap-ms 必须为正数");
            result.groupMaxGapMs = numeric;
        } else if (flag === "--skip-stitch") {
            result.skipStitch = true;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!result.outputPrefix) {
        const day = String(result.generatedAt || "").slice(0, 10) || "latest";
        result.outputPrefix = path.join(
            ROOT_DIR,
            "docs",
            "research",
            `${day}-${result.mapId}-latest-capture-review-queue`
        );
    }

    return result;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function normalizeName(value, fallback = "capture") {
    return String(value || fallback)
        .replace(/\.[^.]+$/, "")
        .replace(/[^A-Za-z0-9_.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || fallback;
}

function timestampPart(value, fallback = "capture") {
    return normalizeName(String(value || "").replace(/[:.]/g, ""), fallback);
}

function isCapturePackageForMap(inputPath, mapId) {
    if (!/\.json$/i.test(inputPath)) return false;
    const basename = path.basename(inputPath);
    if (!basename.startsWith("auction-king-battle-capture-")) return false;
    try {
        const payload = readJson(inputPath);
        return payload && payload.export_kind === "battle_input_clipboard_screenshot"
            && (!mapId || payload.map_id === mapId);
    } catch {
        return false;
    }
}

function readCapturePackage(inputPath) {
    return {
        input_path: inputPath,
        payload: readJson(inputPath)
    };
}

function findCapturePackagePaths(inputDir = DEFAULT_INPUT_DIR, mapId = DEFAULT_MAP_ID) {
    if (!fs.existsSync(inputDir)) return [];
    return fs.readdirSync(inputDir)
        .map((entry) => path.join(inputDir, entry))
        .filter((entryPath) => isCapturePackageForMap(entryPath, mapId))
        .sort((left, right) => {
            const leftPayload = readJson(left);
            const rightPayload = readJson(right);
            return String(leftPayload.exported_at || "").localeCompare(String(rightPayload.exported_at || ""));
        });
}

function buildReviewImagePath(group = [], index = 0, reviewImageDir = path.join(ROOT_DIR, "tmp_capture_review")) {
    const first = group[0] || {};
    const last = group[group.length - 1] || first;
    const mapId = first.payload && first.payload.map_id ? first.payload.map_id : "unknown_map";
    const firstStamp = timestampPart(first.payload && first.payload.exported_at, `group_${index + 1}`);
    const lastStamp = timestampPart(last.payload && last.payload.exported_at, firstStamp);
    const name = firstStamp === lastStamp
        ? `${normalizeName(mapId)}_${firstStamp}_review.png`
        : `${normalizeName(mapId)}_${firstStamp}_${lastStamp}_review.png`;
    return path.join(reviewImageDir, name);
}

async function buildReviewImageMap(groups = [], {
    reviewImageDir = path.join(ROOT_DIR, "tmp_capture_review"),
    skipStitch = false,
    stitcher = stitchCaptureScreenshots
} = {}) {
    const reviewImageMap = {};
    const reviewImages = [];

    for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        const outputPath = buildReviewImagePath(group, index, reviewImageDir);
        if (!skipStitch) {
            await stitcher(group.map((entry) => entry.input_path), { outputPath });
        }
        const groupKey = `group_${index + 1}`;
        reviewImageMap[groupKey] = outputPath;
        reviewImageMap[captureGroupKey(group[0])] = outputPath;
        reviewImages.push({
            group_key: groupKey,
            capture_group_key: captureGroupKey(group[0]),
            output_path: outputPath,
            capture_package_count: group.length,
            capture_package_paths: group.map((entry) => entry.input_path)
        });
    }

    return { reviewImageMap, reviewImages };
}

function outputPathsForPrefix(outputPrefix) {
    return {
        manifestPath: `${outputPrefix}.json`,
        templatePath: `${outputPrefix}-template.json`,
        resultsPath: `${outputPrefix}-results.json`,
        importPath: `${outputPrefix}-import.json`,
        reviewImageMapPath: `${outputPrefix}-review-image-map.json`
    };
}

async function buildLatestCaptureReviewQueue({
    inputDir = DEFAULT_INPUT_DIR,
    mapId = DEFAULT_MAP_ID,
    outputPrefix = null,
    reviewImageDir = path.join(ROOT_DIR, "tmp_capture_review"),
    generatedAt = new Date().toISOString(),
    groupMaxGapMs = DEFAULT_GROUP_MAX_GAP_MS,
    skipStitch = false,
    stitcher = stitchCaptureScreenshots
} = {}) {
    const resolvedOutputPrefix = outputPrefix || path.join(
        ROOT_DIR,
        "docs",
        "research",
        `${String(generatedAt).slice(0, 10)}-${mapId}-latest-capture-review-queue`
    );
    const paths = outputPathsForPrefix(resolvedOutputPrefix);
    const capturePackagePaths = findCapturePackagePaths(inputDir, mapId);
    const capturePackages = capturePackagePaths.map(readCapturePackage);
    const groups = groupCapturePackages(capturePackages, { maxGapMs: groupMaxGapMs });
    const { reviewImageMap, reviewImages } = await buildReviewImageMap(groups, {
        reviewImageDir,
        skipStitch,
        stitcher
    });
    writeJson(paths.reviewImageMapPath, reviewImageMap);

    const template = buildCaptureFullCountReviewTemplate({
        capturePackages,
        generatedAt,
        paths: {
            capturePackagePaths,
            reviewImageMapPath: paths.reviewImageMapPath
        },
        reviewImageByGroup: reviewImageMap,
        groupMaxGapMs
    });
    writeJson(paths.templatePath, template);
    writeText(paths.templatePath.replace(/\.json$/i, ".md"), formatCaptureFullCountReviewTemplateMarkdown(template, paths.templatePath));

    const results = buildCountFitSampleReviewResultsSeed({
        template,
        generatedAt,
        paths: { templatePath: paths.templatePath }
    });
    writeJson(paths.resultsPath, results);
    writeText(paths.resultsPath.replace(/\.json$/i, ".md"), formatCountFitSampleReviewResultsSeedMarkdown(results, paths.resultsPath));

    const importReport = buildCountFitSampleReviewImport({
        template: results,
        generatedAt,
        paths: { templatePath: paths.resultsPath }
    });
    writeJson(paths.importPath, importReport);
    writeText(paths.importPath.replace(/\.json$/i, ".md"), formatCountFitSampleReviewImportMarkdown(importReport, paths.importPath));

    const manifest = {
        schema_version: "ak_latest_capture_review_queue_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            input_dir: inputDir,
            map_id: mapId,
            group_max_gap_ms: groupMaxGapMs,
            skip_stitch: skipStitch
        },
        outputs: paths,
        summary: {
            capture_package_count: capturePackages.length,
            capture_group_count: groups.length,
            review_image_count: reviewImages.length,
            accepted_sample_count: importReport.summary.accepted_sample_count,
            blocked_entry_count: importReport.summary.blocked_entry_count,
            latest_capture_exported_at: capturePackages.length
                ? capturePackages[capturePackages.length - 1].payload.exported_at || null
                : null
        },
        review_images: reviewImages
    };
    writeJson(paths.manifestPath, manifest);
    return {
        manifest,
        template,
        results,
        importReport
    };
}

async function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const { manifest } = await buildLatestCaptureReviewQueue(args);
    process.stdout.write(`${manifest.outputs.manifestPath}\n${manifest.outputs.templatePath}\n${manifest.outputs.resultsPath}\n${manifest.outputs.importPath}\n`);
    return manifest;
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_GROUP_MAX_GAP_MS,
    DEFAULT_INPUT_DIR,
    DEFAULT_MAP_ID,
    buildLatestCaptureReviewQueue,
    buildReviewImageMap,
    buildReviewImagePath,
    findCapturePackagePaths,
    outputPathsForPrefix,
    readCapturePackage,
    resolveArgs
};
