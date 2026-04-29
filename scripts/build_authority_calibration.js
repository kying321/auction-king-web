const fs = require("node:fs");
const path = require("node:path");
const { buildAuthorityCalibrationArtifacts } = require("../src/core/authority_calibration_runtime.js");
const { buildAndWriteAuthoritySourcePackage, OUTPUT_PATH: SOURCE_PACKAGE_PATH } = require("./build_authority_source_package.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT_DIR, "config", "default");
const CALIBRATION_OUTPUT_PATH = path.join(CONFIG_DIR, "calibration.json");
const BASE_SECTION_FILES = [
    "app.json",
    "fields.json",
    "templates.json",
    "maps.json",
    "model.json",
    "solver.json"
];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadBaseDefaultConfig(configDir = CONFIG_DIR) {
    return Object.assign(
        {},
        ...BASE_SECTION_FILES.map((fileName) => readJson(path.join(configDir, fileName)))
    );
}

function buildAndWriteAuthorityCalibration() {
    const sourcePackage = fs.existsSync(SOURCE_PACKAGE_PATH)
        ? readJson(SOURCE_PACKAGE_PATH)
        : buildAndWriteAuthoritySourcePackage();
    const artifact = buildAuthorityCalibrationArtifacts(sourcePackage, loadBaseDefaultConfig());
    fs.writeFileSync(CALIBRATION_OUTPUT_PATH, `${JSON.stringify({ calibration: artifact }, null, 4)}\n`, "utf8");
    return artifact;
}

if (require.main === module) {
    buildAndWriteAuthorityCalibration();
    process.stdout.write(`${CALIBRATION_OUTPUT_PATH}\n`);
}

module.exports = {
    CALIBRATION_OUTPUT_PATH,
    BASE_SECTION_FILES,
    loadBaseDefaultConfig,
    buildAndWriteAuthorityCalibration
};
