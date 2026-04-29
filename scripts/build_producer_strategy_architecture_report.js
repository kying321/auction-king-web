const fs = require("node:fs");
const path = require("node:path");
const {
    buildProducerStrategyArchitectureReport
} = require("../src/research/producer_strategy_architecture_report.js");

const DEFAULT_COUNT_PRIOR_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-producer-count-prior-model-report.json"
);
const DEFAULT_VALUE_MODEL_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-producer-value-model-report.json"
);
const DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-replay-diagnostics-report.json"
);
const DEFAULT_COUNT_FIT_READINESS_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-settlement-count-fit-readiness-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-architecture-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        countPriorReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_COUNT_PRIOR_REPORT_PATH,
        valueModelReportPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_VALUE_MODEL_REPORT_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH,
        replayDiagnosticsReportPath: argv[3] ? path.resolve(argv[3]) : DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH,
        countFitReadinessReportPath: argv[4] ? path.resolve(argv[4]) : DEFAULT_COUNT_FIT_READINESS_REPORT_PATH
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

function compactAlpha(values = {}) {
    if (!values || typeof values !== "object") return "-";
    return ["w", "g", "b", "p", "o", "r"]
        .map((quality) => `${quality}:${values[quality] ?? 0}`)
        .join(", ");
}

function compactQualityFits(fits = {}) {
    if (!fits || typeof fits !== "object") return "-";
    return ["p", "o", "r"].map((quality) => {
        const fit = fits[quality] || {};
        return `${quality}:z=${fit.z ?? "-"}, 2s=${fit.within_2sigma === true}`;
    }).join("; ");
}

function compactReplaySummary(summary = {}) {
    return [
        `n=${summary.sample_count ?? 0}`,
        `2s=${summary.within_2sigma_count ?? 0}/${summary.sample_count ?? 0}`,
        `max_z=${summary.max_abs_z ?? "-"}`
    ].join(", ");
}

function compactCandidateReplay(gates = {}) {
    if (!gates.candidate_replay_evaluated) return "not_evaluated";
    return gates.candidate_replay_passed === true ? "passed" : "regressed";
}

function compactCountFitReadiness(entry = null, gates = {}) {
    if (!gates.count_fit_readiness_evaluated) return "not_evaluated";
    if (!entry) return "missing";
    if (entry.two_sigma_count_fit_allowed === true) return "passed";
    const blocked = Array.isArray(entry.blocked_qualities) && entry.blocked_qualities.length
        ? `blocked=${entry.blocked_qualities.join(",")}`
        : "blocked=-";
    const observedGap = entry.observed_state_fit_gap === null || entry.observed_state_fit_gap === undefined
        ? "observed_gap=-"
        : `observed_gap=${entry.observed_state_fit_gap}`;
    return `failed; ${observedGap}; ${blocked}`;
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function formatProducerStrategyArchitectureMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const maps = report && report.maps ? Object.values(report.maps) : [];
    const rows = maps.length
        ? maps.map((entry) => tableRow([
            markdownCode(entry.map_id),
            markdownCell(compactAlpha(entry.alpha_counts_candidate)),
            markdownCell(compactReplaySummary(entry.clean_replay_two_sigma_summary)),
            markdownCell(compactCountFitReadiness(entry.count_fit_readiness, entry.gates || {})),
            markdownCell(compactQualityFits(entry.quality_value_fit_summary)),
            markdownCode(entry.runtime_family_status),
            markdownCode(entry.gates && entry.gates.sim_replay_candidate === true),
            markdownCode(compactCandidateReplay(entry.gates || {})),
            markdownCode(entry.default_config_update_allowed === true),
            markdownCell((entry.next_evidence_needed || []).join(", "))
        ])).join("\n")
        : "| `-` | - | - | - | `-` | `false` | `not_evaluated` | `false` | - |";

    return `# producer strategy architecture

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- adoption allowed: \`${report.adoption_allowed === true}\`
- 架构: \`${(report.architecture || []).join(" -> ")}\`
- 默认权重写入: \`blocked_until_all_gates_pass\`

## Gate matrix

| map | alpha candidate | clean replay 2sigma | count fit readiness | p/o/r value fit | family runtime | sim candidate | candidate replay | default update | next evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## 结论

- 图片像素与制作人假设只保留为 research/review source，不能进入 \`default_config_bundle.js\`。
- \`sim candidate\` 只表示可生成 shadow 回放候选；\`candidate replay\` 才表示候选是否击败 baseline。
- 默认权重门槛需要同图、同局、人工标注的完整分布 clean replay、count fit readiness 通过，且 family gate 问题被显式解决。
`;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath, fallback = {}) {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return readJson(filePath);
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
    const {
        countPriorReportPath,
        valueModelReportPath,
        outputPath,
        replayDiagnosticsReportPath,
        countFitReadinessReportPath
    } = resolveArgs(argv);
    const countPriorReport = readJson(countPriorReportPath);
    const valueModelReport = readJson(valueModelReportPath);
    const replayDiagnosticsReport = readOptionalJson(replayDiagnosticsReportPath, {});
    const countFitReadinessReport = readOptionalJson(countFitReadinessReportPath, {});
    const report = buildProducerStrategyArchitectureReport({
        countPriorReport,
        valueModelReport,
        replayDiagnosticsReport,
        countFitReadinessReport
    });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatProducerStrategyArchitectureMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_COUNT_FIT_READINESS_REPORT_PATH,
    DEFAULT_COUNT_PRIOR_REPORT_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REPLAY_DIAGNOSTICS_REPORT_PATH,
    DEFAULT_VALUE_MODEL_REPORT_PATH,
    formatProducerStrategyArchitectureMarkdown,
    main,
    resolveArgs
};
