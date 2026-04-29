const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT_DIR, "config", "default");
const OUTPUT_PATH = path.join(ROOT_DIR, "default_config_bundle.js");
const DEFAULT_CONFIG_SECTION_FILES = [
    "app.json",
    "fields.json",
    "templates.json",
    "roles.json",
    "maps.json",
    "model.json",
    "solver.json",
    "calibration.json"
];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function composeDefaultConfigFromSections(configDir = CONFIG_DIR) {
    const parts = DEFAULT_CONFIG_SECTION_FILES.map((fileName) => readJson(path.join(configDir, fileName)));
    return Object.assign({}, ...parts);
}

function writeDefaultConfigBundle(config, outputPath = OUTPUT_PATH) {
    const content = `const AUCTION_KING_DEFAULT_CONFIG = ${JSON.stringify(config, null, 4)};\n\nif (typeof window !== "undefined") {\n    window.AUCTION_KING_DEFAULT_CONFIG = AUCTION_KING_DEFAULT_CONFIG;\n}\n\nif (typeof module !== "undefined" && module.exports) {\n    module.exports = AUCTION_KING_DEFAULT_CONFIG;\n}\n`;
    fs.writeFileSync(outputPath, content, "utf8");
}

if (require.main === module) {
    writeDefaultConfigBundle(composeDefaultConfigFromSections());
}

module.exports = {
    OUTPUT_PATH,
    DEFAULT_CONFIG_SECTION_FILES,
    composeDefaultConfigFromSections,
    writeDefaultConfigBundle
};
