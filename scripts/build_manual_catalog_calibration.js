const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    buildManualCatalogCalibrationSnapshot,
    loadManualCatalogBatchesFromDirectory
} = require("../manual_item_catalog.js");

function main() {
    const root = path.join(__dirname, "..");
    const inputDir = path.join(root, "data", "manual_catalog");
    const outputPath = path.join(root, "docs", "research", "manual_catalog_calibration_snapshot.json");
    const batches = loadManualCatalogBatchesFromDirectory(inputDir);
    const snapshot = buildManualCatalogCalibrationSnapshot(batches, defaultConfig);
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
    main();
}

module.exports = { main };
