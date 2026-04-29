const fs = require("node:fs");
const path = require("node:path");
const { buildAuthoritySourcePackage } = require("../src/core/source_data_runtime.js");
const { buildAuthorityCalibrationArtifacts } = require("../src/core/authority_calibration_runtime.js");
const {
    OUTPUT_PATH: DEFAULT_BATTLE_SAMPLE_OUTPUT_PATH,
    buildAndWriteAuthorityBattleSamples,
    extractSamplesFromInputPayload
} = require("./build_authority_battle_samples.js");
const {
    listManualCatalogBatchPaths
} = require("./build_authority_source_package.js");
const {
    CALIBRATION_OUTPUT_PATH,
    loadBaseDefaultConfig
} = require("./build_authority_calibration.js");
const {
    composeDefaultConfigFromSections,
    writeDefaultConfigBundle
} = require("./build_default_config_bundle.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_PACKAGE_OUTPUT_PATH = path.join(ROOT_DIR, "data", "source_packages", "authority_source_package.json");
const DEFAULT_BUNDLE_OUTPUT_PATH = path.join(ROOT_DIR, "src", "core", "default_config_bundle.js");

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const result = {
        inputPath: null,
        workspaceRoot: ROOT_DIR,
        mergeExisting: false
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--merge-existing") {
            result.mergeExisting = true;
        } else if (arg === "--workspace-root") {
            index += 1;
            if (!argv[index]) throw new Error("--workspace-root 缺少值");
            result.workspaceRoot = path.resolve(argv[index]);
        } else {
            positional.push(arg);
        }
    }
    if (positional.length > 2) {
        throw new Error("最多只接受 2 个位置参数: <samples.json> [workspace-root]");
    }
    if (positional[0]) result.inputPath = path.resolve(positional[0]);
    if (positional[1]) result.workspaceRoot = path.resolve(positional[1]);
    return {
        inputPath: result.inputPath,
        workspaceRoot: result.workspaceRoot,
        mergeExisting: result.mergeExisting
    };
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 4)}\n`, "utf8");
}

function extractBattleSampleImportContext(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (!parsed.export_context || typeof parsed.export_context !== "object" || Array.isArray(parsed.export_context)) return null;
    return parsed.export_context;
}

function readExistingBattleSamples(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
}

function buildAuthorityArtifactsFromSettlementSamples(inputPath, workspaceRoot = ROOT_DIR, options = {}) {
    if (!inputPath) {
        throw new Error(
            "需要提供结算样本或 Authority Battle Samples JSON 路径: node scripts/build_authority_from_settlement_samples.js <samples.json> [workspace-root]"
        );
    }

    const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const incomingSamples = extractSamplesFromInputPayload(parsed);
    const battleSampleImportContext = extractBattleSampleImportContext(parsed);
    const manualCatalogDir = path.join(workspaceRoot, "data", "manual_catalog");
    const battleSampleOutputPath = path.join(workspaceRoot, path.relative(ROOT_DIR, DEFAULT_BATTLE_SAMPLE_OUTPUT_PATH));
    const sourcePackageOutputPath = path.join(workspaceRoot, path.relative(ROOT_DIR, SOURCE_PACKAGE_OUTPUT_PATH));
    const calibrationOutputPath = path.join(workspaceRoot, path.relative(ROOT_DIR, CALIBRATION_OUTPUT_PATH));
    const configDir = path.dirname(calibrationOutputPath);
    const defaultBundleOutputPath = path.join(workspaceRoot, path.relative(ROOT_DIR, DEFAULT_BUNDLE_OUTPUT_PATH));
    const existingSamples = options.mergeExisting ? readExistingBattleSamples(battleSampleOutputPath) : [];
    const samples = existingSamples.concat(incomingSamples);

    const battleSamples = buildAndWriteAuthorityBattleSamples(samples, battleSampleOutputPath);
    const sourcePackage = buildAuthoritySourcePackage({
        catalogBatchPaths: listManualCatalogBatchPaths(manualCatalogDir),
        battleSamples,
        battleSampleImportContext
    });
    writeJson(sourcePackageOutputPath, sourcePackage);

    const calibrationArtifact = buildAuthorityCalibrationArtifacts(sourcePackage, loadBaseDefaultConfig(configDir));
    writeJson(calibrationOutputPath, { calibration: calibrationArtifact });
    writeDefaultConfigBundle(composeDefaultConfigFromSections(configDir), defaultBundleOutputPath);

    return {
        workspaceRoot,
        mergeExisting: options.mergeExisting === true,
        incomingSampleCount: incomingSamples.length,
        previousBattleSampleCount: existingSamples.length,
        battleSampleCount: battleSamples.length,
        battleSampleOutputPath,
        sourcePackageOutputPath,
        calibrationOutputPath,
        defaultBundleOutputPath
    };
}

function main(argv = process.argv.slice(2)) {
    const { inputPath, workspaceRoot, mergeExisting } = resolveArgs(argv);
    const summary = buildAuthorityArtifactsFromSettlementSamples(inputPath, workspaceRoot, { mergeExisting });
    process.stdout.write(`${summary.defaultBundleOutputPath}\n`);
    return summary;
}

if (require.main === module) {
    main();
}

module.exports = {
    SOURCE_PACKAGE_OUTPUT_PATH,
    DEFAULT_BUNDLE_OUTPUT_PATH,
    resolveArgs,
    readExistingBattleSamples,
    buildAuthorityArtifactsFromSettlementSamples,
    main
};
