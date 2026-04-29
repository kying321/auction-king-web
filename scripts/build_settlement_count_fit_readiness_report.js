const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_THRESHOLDS,
    buildSettlementCountFitReadinessReport
} = require("../settlement_count_fit_readiness_report.js");

const DEFAULT_INPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-confirmed-settlement-samples.json"
);
const DEFAULT_COUNT_FIT_REVIEW_IMPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-import.json"
);
const DEFAULT_INPUT_PATHS = [
    DEFAULT_INPUT_PATH,
    DEFAULT_COUNT_FIT_REVIEW_IMPORT_PATH
];
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-settlement-count-fit-readiness-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    const inputPaths = [];
    let outputPath = DEFAULT_OUTPUT_PATH;
    const thresholds = {
        ...DEFAULT_THRESHOLDS
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--output") {
            index += 1;
            if (!argv[index]) throw new Error("--output 需要提供输出 JSON 路径");
            outputPath = path.resolve(argv[index]);
        } else if (arg.startsWith("--output=")) {
            outputPath = path.resolve(arg.slice("--output=".length));
        } else if (arg === "--min-count-scored-per-map-quality") {
            index += 1;
            if (!argv[index]) throw new Error("--min-count-scored-per-map-quality 需要提供正整数");
            thresholds.min_count_scored_samples_per_map_quality = Number(argv[index]);
        } else if (arg.startsWith("--min-count-scored-per-map-quality=")) {
            thresholds.min_count_scored_samples_per_map_quality =
                Number(arg.slice("--min-count-scored-per-map-quality=".length));
        } else {
            inputPaths.push(path.resolve(arg));
        }
    }

    return {
        inputPaths: inputPaths.length ? inputPaths : DEFAULT_INPUT_PATHS.slice(),
        outputPath,
        thresholds
    };
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function compactQualityCounts(counts = {}) {
    return ["w", "g", "b", "p", "o", "r"]
        .map((quality) => `${quality}:${Number(counts[quality]) || 0}`)
        .join(" ");
}

function formatSettlementCountFitReadinessMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const maps = report && report.maps ? Object.values(report.maps).sort((left, right) => left.map_id.localeCompare(right.map_id)) : [];
    const rows = maps.length
        ? maps.map((entry) => tableRow([
            markdownCode(entry.map_id),
            markdownCode(entry.sample_count),
            markdownCode(entry.observed_state_sample_count),
            markdownCode(entry.full_actual_counts_sample_count),
            markdownCode(entry.full_count_fit_scored_sample_count),
            markdownCell(compactQualityCounts(entry.actual_count_sample_count_by_quality)),
            markdownCell(compactQualityCounts(entry.count_fit_scored_sample_count_by_quality)),
            markdownCode(entry.observed_state_fit_gap),
            markdownCode(entry.full_count_fit_scored_gap),
            markdownCell((entry.blocked_qualities || []).join(", ") || "-"),
            markdownCode(entry.two_sigma_count_fit_allowed === true),
            markdownCell((entry.risk_flags || []).join(", "))
        ])).join("\n")
        : "| `-` | `0` | `0` | `0` | `0` | - | - | `0` | `0` | - | `false` | - |";

    return `# settlement count fit readiness

- change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- packages: \`${report.summary.package_count}\`
- input samples: \`${report.summary.input_sample_count}\`
- observed-state samples: \`${report.summary.observed_state_sample_count}\`
- full actual-count samples: \`${report.summary.full_actual_counts_sample_count}\`
- full count-fit scored samples: \`${report.summary.full_count_fit_scored_sample_count}\`
- min count samples per map-quality: \`${report.thresholds.min_count_scored_samples_per_map_quality}\`
- maps ready for two-sigma count fit: \`${(report.summary.maps_ready_for_count_fit || []).join(", ") || "-"}\`

## Map readiness

| map | samples | observed | full counts | count-fit scored samples | raw quality counts | count-fit quality counts | observed gap | full scored gap | blocked qualities | two-sigma fit | risk flags |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- | --- | --- |
${rows}

## Notes

- This report gates count-prior fitting only; it does not change estimator weights or candidate config.
- \`two_sigma_count_fit_allowed\` requires enough same-sample observed-state + actual-count labels for every quality.
- Pixel/OCR drafts remain evidence until human-reviewed actual counts are present.
`;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeMarkdown(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { inputPaths, outputPath, thresholds } = resolveArgs(argv);
    const packages = inputPaths.map((inputPath) => ({
        source_path: inputPath,
        payload: JSON.parse(fs.readFileSync(inputPath, "utf8"))
    }));
    const report = buildSettlementCountFitReadinessReport({ packages, thresholds });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatSettlementCountFitReadinessMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_INPUT_PATH,
    DEFAULT_COUNT_FIT_REVIEW_IMPORT_PATH,
    DEFAULT_INPUT_PATHS,
    DEFAULT_OUTPUT_PATH,
    formatSettlementCountFitReadinessMarkdown,
    main,
    resolveArgs
};
