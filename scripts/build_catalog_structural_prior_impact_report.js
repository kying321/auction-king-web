const path = require("node:path");
const {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PRIOR_PATH,
    buildCatalogStructuralPriorImpactReport,
    writeCatalogStructuralPriorImpactReport
} = require("../catalog_structural_prior_impact_runtime.js");

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const mapIds = [];
    argv.forEach((arg) => {
        const value = String(arg);
        if (value.startsWith("--map=")) {
            mapIds.push(value.slice("--map=".length));
            return;
        }
        positional.push(value);
    });
    if (positional.length > 2) {
        throw new Error("最多只接受 2 个位置参数: <structural-prior.json> [output.json]");
    }
    return {
        inputPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_PRIOR_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        mapIds
    };
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildCatalogStructuralPriorImpactReport({
        structuralPriorPath: args.inputPath,
        mapIds: args.mapIds
    });
    const markdownPath = writeCatalogStructuralPriorImpactReport(report, args.outputPath);
    process.stdout.write(`${args.outputPath}\n${markdownPath}\n`);
    return report;
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    main,
    resolveArgs
};
