const fs = require("node:fs");
const path = require("node:path");
const { buildAuthoritySourcePackage } = require("../source_data_runtime.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const MANUAL_CATALOG_DIR = path.join(ROOT_DIR, "data", "manual_catalog");
const BATTLE_SAMPLE_PATH = path.join(ROOT_DIR, "data", "battle_samples", "authority_battle_samples.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "data", "source_packages", "authority_source_package.json");

function listManualCatalogBatchPaths(directoryPath = MANUAL_CATALOG_DIR) {
    if (!fs.existsSync(directoryPath)) return [];
    return fs.readdirSync(directoryPath)
        .filter((entry) => entry.endsWith(".json"))
        .filter((entry) => !entry.includes("manifest"))
        .sort()
        .map((entry) => path.join(directoryPath, entry));
}

function loadBattleSamples(filePath = BATTLE_SAMPLE_PATH) {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
}

function buildAndWriteAuthoritySourcePackage() {
    const sourcePackage = buildAuthoritySourcePackage({
        catalogBatchPaths: listManualCatalogBatchPaths(),
        battleSamples: loadBattleSamples()
    });
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(sourcePackage, null, 2)}\n`, "utf8");
    return sourcePackage;
}

if (require.main === module) {
    buildAndWriteAuthoritySourcePackage();
    process.stdout.write(`${OUTPUT_PATH}\n`);
}

module.exports = {
    OUTPUT_PATH,
    BATTLE_SAMPLE_PATH,
    MANUAL_CATALOG_DIR,
    listManualCatalogBatchPaths,
    loadBattleSamples,
    buildAndWriteAuthoritySourcePackage
};
