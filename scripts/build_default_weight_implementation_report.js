const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    buildDefaultWeightImplementationReport
} = require("../default_weight_implementation_report.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_PURPLE_FIT_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-purple-weight-fit-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-default-weight-implementation-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        purpleFitReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_PURPLE_FIT_REPORT_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatDefaultWeightImplementationMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = Object.values(report.maps || {}).map((entry) => {
        return `| ${[
            markdownCell(entry.map_id),
            markdownCell(entry.baseline_p),
            markdownCell(entry.expected_p),
            markdownCell(entry.current_p),
            markdownCell(entry.applied_multiplier),
            markdownCell(entry.matches_expected === true)
        ].join(" | ")} |`;
    }).join("\n");

    return `# default weight implementation

- 变更类: \`${report.change_class}\`
- JSON: \`${jsonDisplayPath}\`
- implementation status: \`${report.implementation_status}\`
- selected multiplier: \`${report.selected_multiplier ?? "-"}\`
- authority adoption allowed: \`${report.authority_adoption_allowed === true}\`
- authority blockers: \`${(report.authority_blockers || []).join(", ") || "-"}\`

## Map audit

| map | baseline p | expected p | current p | applied multiplier | match |
| --- | --- | --- | --- | --- | --- |
${rows || "| - | - | - | - | - | - |"}
`;
}

function main(argv = process.argv.slice(2)) {
    const { purpleFitReportPath, outputPath } = resolveArgs(argv);
    const purpleFitReport = readJson(purpleFitReportPath);
    const report = buildDefaultWeightImplementationReport({ defaultConfig, purpleFitReport });
    writeJson(outputPath, report);
    fs.writeFileSync(
        outputPath.replace(/\.json$/i, ".md"),
        formatDefaultWeightImplementationMarkdown(report, outputPath),
        "utf8"
    );
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PURPLE_FIT_REPORT_PATH,
    formatDefaultWeightImplementationMarkdown,
    main,
    resolveArgs
};
