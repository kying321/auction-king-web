const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_THRESHOLDS,
    buildSystemHintCoverageReport
} = require("../src/research/system_hint_coverage_report.js");

const DEFAULT_INPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-confirmed-settlement-samples.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-system-hint-coverage-report.json"
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
        } else if (arg === "--min-value-scored-per-map") {
            index += 1;
            if (!argv[index]) throw new Error("--min-value-scored-per-map 需要提供正整数");
            thresholds.min_value_scored_samples_per_map = Number(argv[index]);
        } else if (arg.startsWith("--min-value-scored-per-map=")) {
            thresholds.min_value_scored_samples_per_map = Number(arg.slice("--min-value-scored-per-map=".length));
        } else {
            inputPaths.push(path.resolve(arg));
        }
    }

    return {
        inputPaths: inputPaths.length ? inputPaths : [DEFAULT_INPUT_PATH],
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

function formatSystemHintCoverageMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const maps = report && report.maps ? Object.values(report.maps).sort((left, right) => left.map_id.localeCompare(right.map_id)) : [];
    const rows = maps.length
        ? maps.map((entry) => tableRow([
            markdownCode(entry.map_id),
            markdownCode(entry.sample_count),
            markdownCode(entry.system_hint_sample_count),
            markdownCode(entry.cell_scored_sample_count),
            markdownCode(entry.value_scored_sample_count),
            markdownCode(entry.fit_gap),
            markdownCode(entry.can_fit_system_hint_anchor === true),
            markdownCell((entry.risk_flags || []).join(", "))
        ])).join("\n")
        : "| `-` | `0` | `0` | `0` | `0` | `0` | `false` | - |";

    return `# system hint coverage

- change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- packages: \`${report.summary.package_count}\`
- input samples: \`${report.summary.input_sample_count}\`
- value-scored samples: \`${report.summary.value_scored_sample_count}\`
- min value-scored samples per map: \`${report.thresholds.min_value_scored_samples_per_map}\`
- maps ready for fit: \`${(report.summary.maps_ready_for_system_hint_fit || []).join(", ") || "-"}\`

## Map readiness

| map | samples | system hints | cell-scored | value-scored | fit gap | ready | risk flags |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
${rows}

## Notes

- \`system_avg_value_per_cell\` is the only system hint used for fit readiness.
- \`system_avg_value_type_count\` is retained as evidence in JSON distribution fields only.
- This report does not change estimator weights or candidate config.
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
    const report = buildSystemHintCoverageReport({ packages, thresholds });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatSystemHintCoverageMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_INPUT_PATH,
    DEFAULT_OUTPUT_PATH,
    formatSystemHintCoverageMarkdown,
    main,
    resolveArgs
};
