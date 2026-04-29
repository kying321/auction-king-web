const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const { buildSettlementCountReplayReport } = require("../sample_count_replay.js");
const { normalizeInputSamples } = require("./build_settlement_sample_count_replay.js");

const DEFAULT_SAMPLES_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-image-overlay-count-replay-samples.json"
);
const DEFAULT_CANDIDATE_CONFIG_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-candidate-config.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-count-replay-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        samplesPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_SAMPLES_PATH,
        candidateConfigPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_CANDIDATE_CONFIG_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { samplesPath, candidateConfigPath, outputPath } = resolveArgs(argv);
    const samples = normalizeInputSamples(readJson(samplesPath));
    const candidateConfig = readJson(candidateConfigPath);
    const report = buildSettlementCountReplayReport(samples, defaultConfig, candidateConfig);
    writeJson(outputPath, report);
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CANDIDATE_CONFIG_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SAMPLES_PATH,
    main,
    resolveArgs
};
