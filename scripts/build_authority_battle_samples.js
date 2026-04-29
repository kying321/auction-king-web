const fs = require("node:fs");
const path = require("node:path");
const { normalizeBattleSampleRecords } = require("../src/core/source_data_runtime.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "data", "battle_samples", "authority_battle_samples.json");

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        inputPath: argv[0] ? path.resolve(argv[0]) : null,
        outputPath: argv[1] ? path.resolve(argv[1]) : OUTPUT_PATH
    };
}

function extractSamplesFromInputPayload(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.samples)) return parsed.samples;
    return [];
}

function buildAndWriteAuthorityBattleSamples(samples = [], outputPath = OUTPUT_PATH) {
    const battleSamples = normalizeBattleSampleRecords(samples);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(battleSamples, null, 2)}\n`, "utf8");
    return battleSamples;
}

function main(argv = process.argv.slice(2)) {
    const { inputPath, outputPath } = resolveArgs(argv);
    if (!inputPath) {
        throw new Error(
            "需要提供样本 JSON 路径: node scripts/build_authority_battle_samples.js <samples.json> [output.json]"
        );
    }

    const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const samples = extractSamplesFromInputPayload(parsed);
    buildAndWriteAuthorityBattleSamples(samples, outputPath);
    process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
    main();
}

module.exports = {
    OUTPUT_PATH,
    extractSamplesFromInputPayload,
    buildAndWriteAuthorityBattleSamples,
    resolveArgs,
    main
};
