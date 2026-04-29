const path = require("node:path");
const {
    DEFAULT_MANUAL_CATALOG_DIR,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_QUALITY_MANIFEST_PATH,
    buildCatalogItemExtractionReport
} = require("../catalog_item_extraction_runtime.js");

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const imageAnalysisOptions = {};
    const ocrNameMatchOptions = {};
    let enableOcrNameMatching = false;
    let ocrSampleLimit = null;

    argv.forEach((arg) => {
        if (String(arg) === "--enable-ocr-name-matching") {
            enableOcrNameMatching = true;
            return;
        }
        if (String(arg).startsWith("--ocr-sample-limit=")) {
            const numeric = Number(String(arg).replace(/^--ocr-sample-limit=/, ""));
            if (Number.isFinite(numeric)) ocrSampleLimit = Math.max(1, Math.round(numeric));
            return;
        }
        if (String(arg).startsWith("--ocr-name-accept-threshold=")) {
            const numeric = Number(String(arg).replace(/^--ocr-name-accept-threshold=/, ""));
            if (Number.isFinite(numeric)) ocrNameMatchOptions.acceptThreshold = numeric;
            return;
        }
        if (String(arg).startsWith("--ocr-name-min-score=")) {
            const numeric = Number(String(arg).replace(/^--ocr-name-min-score=/, ""));
            if (Number.isFinite(numeric)) ocrNameMatchOptions.minNameScore = numeric;
            return;
        }
        if (String(arg).startsWith("--ocr-name-min-score-gap=")) {
            const numeric = Number(String(arg).replace(/^--ocr-name-min-score-gap=/, ""));
            if (Number.isFinite(numeric)) ocrNameMatchOptions.minScoreGap = numeric;
            return;
        }
        if (String(arg).startsWith("--manual-catalog-dir=")) {
            imageAnalysisOptions.manualCatalogDir = path.resolve(String(arg).replace(/^--manual-catalog-dir=/, ""));
            return;
        }
        if (String(arg).startsWith("--min-grid-cells=")) {
            const numeric = Number(String(arg).replace(/^--min-grid-cells=/, ""));
            if (Number.isFinite(numeric)) imageAnalysisOptions.minGridCells = Math.round(numeric);
            return;
        }
        if (String(arg).startsWith("--min-square-pixels=")) {
            const numeric = Number(String(arg).replace(/^--min-square-pixels=/, ""));
            if (Number.isFinite(numeric)) imageAnalysisOptions.minSquarePixels = Math.round(numeric);
            return;
        }
        if (String(arg).startsWith("--grid-occupied-luma-floor=")) {
            const numeric = Number(String(arg).replace(/^--grid-occupied-luma-floor=/, ""));
            if (Number.isFinite(numeric)) imageAnalysisOptions.gridOccupiedLumaFloor = numeric;
            return;
        }
        positional.push(arg);
    });

    return {
        qualityManifestPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_QUALITY_MANIFEST_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        manualCatalogDir: imageAnalysisOptions.manualCatalogDir || DEFAULT_MANUAL_CATALOG_DIR,
        enableOcrNameMatching,
        ocrSampleLimit,
        ocrNameMatchOptions,
        imageAnalysisOptions: {
            minGridCells: imageAnalysisOptions.minGridCells,
            minSquarePixels: imageAnalysisOptions.minSquarePixels,
            gridOccupiedLumaFloor: imageAnalysisOptions.gridOccupiedLumaFloor
        }
    };
}

async function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = await buildCatalogItemExtractionReport(args);
    process.stdout.write(`${args.outputPath}\n${report.markdown_path}\n`);
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    main,
    resolveArgs
};
