const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    QUALITIES,
    buildProducerCountPriorModelReport,
    normalizeInputPayload
} = require("../src/core/producer_count_prior_model.js");

const DEFAULT_PIXEL_SHADOW_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-pixel-shadow-count-prior-fit-report.json"
);
const DEFAULT_REPLAY_SAMPLES_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-image-overlay-count-replay-samples.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-producer-count-prior-model-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        pixelShadowReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_PIXEL_SHADOW_REPORT_PATH,
        replaySamplesPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_REPLAY_SAMPLES_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
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

function compactQualityMap(values = {}) {
    return QUALITIES.map((quality) => `${quality}:${values && values[quality] !== undefined ? values[quality] : 0}`).join(", ");
}

function compactIntervalMap(intervals = {}) {
    return QUALITIES.map((quality) => {
        const entry = intervals[quality] || {};
        return `${quality}:${entry.low_2sigma ?? 0}-${entry.high_2sigma ?? 0}`;
    }).join(", ");
}

function compactFitSummary(fit = null) {
    if (!fit) return "-";
    return `max_z=${fit.max_abs_z ?? "-"}; all_2sigma=${fit.all_within_2sigma === true}`;
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function formatProducerCountPriorModelMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const maps = report && report.maps ? Object.values(report.maps) : [];
    const rows = maps.length
        ? maps.map((entry) => tableRow([
            markdownCode(entry.map_id),
            markdownCell(entry.design_intent),
            markdownCell(compactQualityMap(entry.blended_fractions)),
            markdownCell(compactQualityMap(entry.alpha_counts_candidate)),
            markdownCell(compactIntervalMap(entry.quality_intervals)),
            markdownCell(compactFitSummary(entry.pixel_shadow_two_sigma_fit)),
            markdownCell(Object.entries(entry.clean_replay_two_sigma_fit || {}).map(([id, fit]) => `${id}:${compactFitSummary(fit)}`).join("; ")),
            markdownCode(entry.adoption_allowed),
            markdownCell((entry.blockers || []).join(", "))
        ])).join("\n")
        : "| `-` | - | - | - | - | - | - | `false` | - |";

    return `# 2026-04-24 producer count-prior model

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- adoption allowed: \`${report.adoption_allowed === true}\`
- 架构: \`${(report.source_architecture || []).join(" -> ")}\`
- 外部信息用法: 只作为地图/家族/场景建模启发，不作为官方爆率。

## Map candidates

| map | producer intent | blended fractions | alpha candidate | 2sigma proportion band | pixel shadow fit | clean replay fit | adopt | blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## 设计边界

- 制作人先验表达“如果我是数值策划，我会如何让地图有差异”，不是权威爆率。
- \`pixel_shadow_direction\` 被强折扣，只用于方向性约束。
- 只有 \`clean_replay\` 样本达到阈值并通过 2sigma fit，才可能进入正式调权流程。
`;
}

function readOptionalJson(filePath, fallback) {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
    const { pixelShadowReportPath, replaySamplesPath, outputPath } = resolveArgs(argv);
    const pixelShadowReport = readOptionalJson(pixelShadowReportPath, { maps: {} });
    const replaySamplesPayload = readOptionalJson(replaySamplesPath, { samples: [] });
    const report = buildProducerCountPriorModelReport({
        baselineConfig: defaultConfig,
        pixelShadowReport,
        replaySamples: normalizeInputPayload(replaySamplesPayload, "samples")
    });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatProducerCountPriorModelMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PIXEL_SHADOW_REPORT_PATH,
    DEFAULT_REPLAY_SAMPLES_PATH,
    formatProducerCountPriorModelMarkdown,
    main,
    resolveArgs
};
