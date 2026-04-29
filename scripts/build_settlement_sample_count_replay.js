const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { buildSettlementCountReplayReport } = require("../src/research/sample_count_replay.js");

function resolveArgs(argv = process.argv.slice(2)) {
    const inputPath = argv[0] ? path.resolve(argv[0]) : null;
    let candidateConfigPath = null;
    let outputPath = path.join(process.cwd(), "docs", "research", "settlement_sample_count_replay_report.json");

    if (argv[1]) {
        const second = path.resolve(argv[1]);
        if (argv[2] || fs.existsSync(second)) {
            candidateConfigPath = second;
        } else {
            outputPath = second;
        }
    }

    if (argv[2]) {
        outputPath = path.resolve(argv[2]);
    }

    return { inputPath, candidateConfigPath, outputPath };
}

function normalizeInputSamples(parsedInput) {
    if (Array.isArray(parsedInput)) return parsedInput;
    if (parsedInput && typeof parsedInput === "object" && Array.isArray(parsedInput.samples)) {
        return parsedInput.samples;
    }
    return [];
}

function main(argv = process.argv.slice(2)) {
    const { inputPath, candidateConfigPath, outputPath } = resolveArgs(argv);
    if (!inputPath) {
        throw new Error(
            "需要提供结算样本 JSON 路径: node scripts/build_settlement_sample_count_replay.js <samples.json> [candidate-config.json] [output.json]"
        );
    }

    const samples = normalizeInputSamples(JSON.parse(fs.readFileSync(inputPath, "utf8")));
    const candidateConfig = candidateConfigPath ? JSON.parse(fs.readFileSync(candidateConfigPath, "utf8")) : null;
    const report = buildSettlementCountReplayReport(samples, defaultConfig, candidateConfig);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
    main();
}

module.exports = {
    main,
    normalizeInputSamples,
    resolveArgs
};
