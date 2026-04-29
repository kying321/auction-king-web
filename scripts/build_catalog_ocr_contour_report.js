const path = require("node:path");
const {
    DEFAULT_OUTPUT_PATH,
    buildCatalogOcrContourReport,
    normalizeInputPath
} = require("../src/core/catalog_ocr_contour_runtime.js");

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let skipOcr = false;
    let ocrSampleLimit = null;
    let columns = null;
    let headerHeight = null;

    argv.forEach((arg) => {
        if (arg === "--skip-ocr") {
            skipOcr = true;
            return;
        }
        if (String(arg).startsWith("--ocr-sample-limit=")) {
            const numeric = Number(String(arg).replace(/^--ocr-sample-limit=/, ""));
            if (Number.isFinite(numeric) && numeric >= 0) ocrSampleLimit = Math.round(numeric);
            return;
        }
        if (String(arg).startsWith("--columns=")) {
            const numeric = Number(String(arg).replace(/^--columns=/, ""));
            if (Number.isFinite(numeric) && numeric > 0) columns = Math.round(numeric);
            return;
        }
        if (String(arg).startsWith("--header-height=")) {
            const numeric = Number(String(arg).replace(/^--header-height=/, ""));
            if (Number.isFinite(numeric) && numeric >= 0) headerHeight = Math.round(numeric);
            return;
        }
        positional.push(arg);
    });

    return {
        inputPath: positional[0] ? path.resolve(positional[0]) : null,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        skipOcr,
        ocrSampleLimit,
        columns,
        headerHeight
    };
}

async function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    if (!args.inputPath) {
        throw new Error("Usage: node scripts/build_catalog_ocr_contour_report.js <image|dir|json> [output.json] [--skip-ocr] [--ocr-sample-limit=N]");
    }

    const inputFiles = normalizeInputPath(args.inputPath);
    if (!inputFiles.length) {
        throw new Error(`No input images found: ${args.inputPath}`);
    }

    const report = await buildCatalogOcrContourReport(inputFiles, {
        outputPath: args.outputPath,
        skipOcr: args.skipOcr,
        ocrSampleLimit: args.ocrSampleLimit,
        columns: args.columns,
        headerHeight: args.headerHeight
    });
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
