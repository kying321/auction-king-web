const path = require("node:path");
const {
    DEFAULT_INPUT_PATH,
    DEFAULT_OUTPUT_PATH,
    buildCatalogStructuralPriorReport
} = require("../catalog_structural_prior_runtime.js");

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        inputPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_INPUT_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildCatalogStructuralPriorReport(args.inputPath, {
        outputPath: args.outputPath
    });
    process.stdout.write(`${args.outputPath}\n${report.markdown_path}\n`);
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
