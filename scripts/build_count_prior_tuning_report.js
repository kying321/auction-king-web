const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildMapCountPriorCandidateConfig,
    buildMapCountPriorTuningReport
} = require("../src/core/count_prior_tuner.js");

const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "docs", "research", "count_prior_tuning_report.json");

function resolveArgs(argv = process.argv.slice(2)) {
    const inputPath = argv[0] ? path.resolve(argv[0]) : null;
    const mapId = argv[1] ? String(argv[1]).trim() : null;
    let searchSpacePath = null;
    let outputPath = DEFAULT_OUTPUT_PATH;

    if (argv[2]) {
        const third = path.resolve(argv[2]);
        if (argv[3] || fs.existsSync(third)) {
            searchSpacePath = third;
        } else {
            outputPath = third;
        }
    }

    if (argv[3]) {
        outputPath = path.resolve(argv[3]);
    }

    return {
        inputPath,
        mapId,
        searchSpacePath,
        outputPath
    };
}

function normalizeInputPayload(parsedInput) {
    if (Array.isArray(parsedInput)) {
        return {
            samples: parsedInput,
            searchSpace: null,
            objective: null,
            exportContext: null
        };
    }

    if (parsedInput && typeof parsedInput === "object") {
        return {
            samples: Array.isArray(parsedInput.samples) ? parsedInput.samples : [],
            searchSpace: parsedInput.search_space && typeof parsedInput.search_space === "object" ? parsedInput.search_space : null,
            objective: parsedInput.objective && typeof parsedInput.objective === "object" ? parsedInput.objective : null,
            exportContext: parsedInput.export_context && typeof parsedInput.export_context === "object" ? parsedInput.export_context : null
        };
    }

    return {
        samples: [],
        searchSpace: null,
        objective: null,
        exportContext: null
    };
}

function applyBaselineOverrides(baselineConfig, mapId, searchSpace = null) {
    if (!searchSpace || typeof searchSpace !== "object" || !searchSpace.baseline_overrides) return baselineConfig;
    return buildMapCountPriorCandidateConfig(baselineConfig, mapId, searchSpace.baseline_overrides);
}

function main(argv = process.argv.slice(2)) {
    const {
        inputPath,
        mapId,
        searchSpacePath,
        outputPath
    } = resolveArgs(argv);

    if (!inputPath || !mapId) {
        throw new Error(
            "需要提供样本 JSON 和 mapId: node scripts/build_count_prior_tuning_report.js <samples.json> <map-id> [search-space.json] [output.json]"
        );
    }

    const parsedInput = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const inputPayload = normalizeInputPayload(parsedInput);
    const searchSpace = searchSpacePath
        ? JSON.parse(fs.readFileSync(searchSpacePath, "utf8"))
        : inputPayload.searchSpace;
    const baselineConfig = applyBaselineOverrides(defaultConfig, mapId, searchSpace);

    const report = buildMapCountPriorTuningReport({
        baselineConfig,
        mapId,
        samples: inputPayload.samples,
        searchSpace,
        objective: inputPayload.objective || {}
    });

    if (inputPayload.exportContext) {
        report.export_context = inputPayload.exportContext;
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${outputPath}\n`);
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    applyBaselineOverrides,
    main,
    normalizeInputPayload,
    resolveArgs
};
