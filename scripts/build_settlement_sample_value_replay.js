const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    buildValueModelOverlayFromManualCatalog,
    loadManualCatalogBatchesFromDirectory
} = require("../manual_item_catalog.js");
const { buildSettlementValueReplayReport } = require("../sample_value_replay.js");

function resolveArgs(argv = process.argv.slice(2)) {
    const inputPath = argv[0] ? path.resolve(argv[0]) : null;
    const outputPath = argv[1]
        ? path.resolve(argv[1])
        : path.join(process.cwd(), "docs", "research", "settlement_sample_value_replay_report.json");
    return { inputPath, outputPath };
}

function main(argv = process.argv.slice(2)) {
    const { inputPath, outputPath } = resolveArgs(argv);
    if (!inputPath) {
        throw new Error("需要提供结算样本 JSON 路径: node scripts/build_settlement_sample_value_replay.js <samples.json> [output.json]");
    }

    const manualCatalogDir = path.join(__dirname, "..", "data", "manual_catalog");
    const manualCatalogBatches = loadManualCatalogBatchesFromDirectory(manualCatalogDir);
    const overlay = buildValueModelOverlayFromManualCatalog(manualCatalogBatches, defaultConfig);
    const samples = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const report = buildSettlementValueReplayReport(samples, defaultConfig, overlay);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
    main();
}

module.exports = {
    main,
    resolveArgs
};
