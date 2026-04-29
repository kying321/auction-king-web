const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const { buildCalibrationReplayReport } = require("../calibration_replay_report.js");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "docs", "research", "settlement_sample_calibration_replay_report.json");

function sanitizeReplayFilterSlug(value) {
    return String(value || "all")
        .replace(/^batch:/, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "all";
}

function deriveDefaultReplayReportOutputPath(inputPath, parsedInput, fallbackOutputPath = DEFAULT_OUTPUT_PATH) {
    if (!parsedInput || typeof parsedInput !== "object" || Array.isArray(parsedInput) || !parsedInput.export_context) {
        return fallbackOutputPath;
    }
    const mapId = String(parsedInput.export_context.map_id || "unknown-map").trim() || "unknown-map";
    const filterValue = parsedInput.export_context.filter_value || "all";
    return path.join(path.dirname(fallbackOutputPath), `auction-king-replay-report-${mapId}-${sanitizeReplayFilterSlug(filterValue)}.json`);
}

function resolveArgs(argv = process.argv.slice(2)) {
    const inputPath = argv[0] ? path.resolve(argv[0]) : null;
    let candidateConfigPath = null;
    let outputPath = DEFAULT_OUTPUT_PATH;
    let explicitOutputPath = false;

    if (argv[1]) {
        const second = path.resolve(argv[1]);
        if (argv[2] || fs.existsSync(second)) {
            candidateConfigPath = second;
        } else {
            outputPath = second;
            explicitOutputPath = true;
        }
    }

    if (argv[2]) {
        outputPath = path.resolve(argv[2]);
        explicitOutputPath = true;
    }

    return { inputPath, candidateConfigPath, outputPath, explicitOutputPath };
}

function main(argv = process.argv.slice(2)) {
    const { inputPath, candidateConfigPath, outputPath, explicitOutputPath } = resolveArgs(argv);
    if (!inputPath) {
        throw new Error(
            "需要提供结算样本 JSON 路径: node scripts/build_settlement_sample_calibration_replay.js <samples.json> [candidate-config.json] [output.json]"
        );
    }

    const parsedInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const samples = Array.isArray(parsedInput)
        ? parsedInput
        : (parsedInput && Array.isArray(parsedInput.samples) ? parsedInput.samples : []);
    const candidateConfig = candidateConfigPath
        ? JSON.parse(fs.readFileSync(candidateConfigPath, "utf8"))
        : (
            parsedInput
            && typeof parsedInput === "object"
            && !Array.isArray(parsedInput)
            && parsedInput.candidate_config
                ? parsedInput.candidate_config
                : null
        );
    const report = buildCalibrationReplayReport({
        samples,
        baselineConfig: defaultConfig,
        candidateConfig
    });
    if (parsedInput && typeof parsedInput === "object" && !Array.isArray(parsedInput) && parsedInput.export_context) {
        report.export_context = parsedInput.export_context;
    }
    if (parsedInput && typeof parsedInput === "object" && !Array.isArray(parsedInput) && parsedInput.sample_quality_summary) {
        report.sample_quality_summary = parsedInput.sample_quality_summary;
    }

    const finalOutputPath = explicitOutputPath
        ? outputPath
        : deriveDefaultReplayReportOutputPath(inputPath, parsedInput, outputPath);

    fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
    fs.writeFileSync(finalOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${finalOutputPath}\n`);
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    deriveDefaultReplayReportOutputPath,
    main,
    resolveArgs
};
