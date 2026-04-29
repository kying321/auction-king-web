const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildValueModelImpactReport,
    buildValueModelOverlayFromManualCatalog,
    loadManualCatalogBatchesFromDirectory
} = require("../src/core/manual_item_catalog.js");

function main() {
    const root = path.join(__dirname, "..");
    const inputDir = path.join(root, "data", "manual_catalog");
    const outputPath = path.join(root, "docs", "research", "manual_catalog_value_model_impact.json");
    const batches = loadManualCatalogBatchesFromDirectory(inputDir);
    const overlay = buildValueModelOverlayFromManualCatalog(batches, defaultConfig);
    const impact = buildValueModelImpactReport(overlay, defaultConfig);
    fs.writeFileSync(outputPath, `${JSON.stringify(impact, null, 2)}\n`, "utf8");
    process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
    main();
}

module.exports = { main };
