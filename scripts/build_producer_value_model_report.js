const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    TARGET_QUALITIES,
    buildProducerValueModelReport
} = require("../producer_value_model.js");

const DEFAULT_CATALOG_CALIBRATION_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "manual_catalog_calibration_snapshot.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-producer-value-model-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        catalogCalibrationPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_CATALOG_CALIBRATION_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
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

function compactQualityFits(fits = {}) {
    return TARGET_QUALITIES.map((quality) => {
        const fit = fits[quality] || {};
        return `${quality}:z=${fit.z ?? "-"}, 2s=${fit.within_2sigma === true}`;
    }).join("; ");
}

function compactFamilies(families = {}) {
    const entries = Object.entries(families);
    if (!entries.length) return "-";
    return entries.map(([id, probability]) => `${id}:${probability}`).join(", ");
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function formatProducerValueModelMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const maps = report && report.maps ? Object.values(report.maps) : [];
    const rows = maps.length
        ? maps.map((entry) => tableRow([
            markdownCode(entry.map_id),
            markdownCell(compactQualityFits(entry.quality_fits)),
            markdownCode(entry.red_type_value_envelope.mean_unit_value),
            markdownCode(entry.red_type_value_envelope.low_2sigma),
            markdownCode(entry.red_type_value_envelope.high_2sigma),
            markdownCell(compactFamilies(entry.family_prior_probabilities)),
            markdownCode(entry.runtime_family_status),
            markdownCode(entry.adoption_allowed),
            markdownCell((entry.blockers || []).join(", "))
        ])).join("\n")
        : "| `-` | - | `-` | `-` | `-` | - | `phase1_disabled` | `false` | - |";

    return `# 2026-04-24 producer value model

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- adoption allowed: \`${report.adoption_allowed === true}\`
- family runtime: \`${report.runtime_family_status}\`
- 架构: \`${(report.architecture || []).join(" -> ")}\`

## Map value candidates

| map | p/o/r catalog fit | red type mean | red type 2s low | red type 2s high | family shadow priors | family runtime | adopt | blockers |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
${rows}

## 设计边界

- 图鉴价值只有单件价值，缺稳定占格，不能直接覆盖 \`per_cell_*\`。
- 家族配置当前是 shadow prior；运行时 family gate 仍为 \`phase1_disabled\`。
- 红件类型价值带可用于风险审计，但不能替代真实同局 settlement value replay。
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
    const { catalogCalibrationPath, outputPath } = resolveArgs(argv);
    const catalogCalibrationSnapshot = JSON.parse(fs.readFileSync(catalogCalibrationPath, "utf8"));
    const report = buildProducerValueModelReport({
        baselineConfig: defaultConfig,
        catalogCalibrationSnapshot
    });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatProducerValueModelMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CATALOG_CALIBRATION_PATH,
    DEFAULT_OUTPUT_PATH,
    formatProducerValueModelMarkdown,
    main,
    resolveArgs
};
