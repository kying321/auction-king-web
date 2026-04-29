const fs = require("node:fs");
const path = require("node:path");
const {
    buildProducerStrategyReplayDiagnosticsReport
} = require("../src/research/producer_strategy_replay_diagnostics.js");

const DEFAULT_REPLAY_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-count-replay-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-25-producer-strategy-replay-diagnostics-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        replayReportPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_REPLAY_REPORT_PATH,
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

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function compactQualitySummary(summary = {}) {
    const entries = Object.entries(summary || {});
    if (!entries.length) return "-";
    return entries.map(([quality, entry]) => {
        const classification = entry.classification
            || (entry.degraded_count > entry.improved_count
                ? "degraded"
                : (entry.improved_count > entry.degraded_count ? "improved" : "neutral"));
        return `${quality}:class=${classification}; logloss_delta=${entry.mean_log_loss_delta}; abs_delta=${entry.mean_abs_error_delta}; dir=${entry.dominant_candidate_direction}`;
    }).join("; ");
}

function compactCandidateConfigStatus(entry = {}) {
    const status = entry && entry.candidate_config_status ? entry.candidate_config_status : {};
    const reasons = Array.isArray(status.reasons) ? status.reasons : [];
    return [status.status || "unknown"].concat(reasons).join(":");
}

function formatProducerStrategyReplayDiagnosticsMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const maps = report && report.maps ? Object.values(report.maps) : [];
    const rows = maps.length
        ? maps.map((entry) => tableRow([
            markdownCode(entry.map_id),
            markdownCode(entry.sample_count),
            markdownCell(compactCandidateConfigStatus(entry)),
            markdownCell(compactQualitySummary(entry.quality_summary)),
            markdownCell((entry.samples || []).map((sample) => sample.id).filter(Boolean).join(", "))
        ])).join("\n")
        : "| `-` | `0` | - | - | - |";
    const guardedByBaseline = report && report.decision === "candidate_guarded_by_baseline";
    let conclusionLines;
    if (guardedByBaseline) {
        conclusionLines = [
            "- replay guard 已生效：已知回归的 map 保留 baseline，不继续写入退化 alpha。",
            "- guard 原因以 `candidate_config_status` 和 `candidate_replay_regressed_baseline` 保留在 JSON，避免下一轮误判为候选通过。",
            "- 样本量仍不足，不能把任何 replay delta 写入默认权重。"
        ];
    } else if (report && report.decision === "candidate_loses_current_replay") {
        conclusionLines = [
            "- 当前 shadow candidate 在现有 clean replay 上弱于 baseline；它只能作为反例诊断和搜索方向约束。",
            "- 若继续搜索，应优先约束沉船红/橙不要向低数量方向偏移，别墅橙不要从 1 件实际样本过度上推均值。",
            "- 样本量仍不足，不能把任何 replay delta 写入默认权重。"
        ];
    } else {
        conclusionLines = [
            "- 当前 shadow candidate 仍只允许作为研究候选；现有 replay 不足以写入默认权重。",
            "- 后续搜索应按 JSON 中的 per-quality delta 保留改善方向，并优先补足人工实际数量样本。",
            "- 样本量仍不足，不能把任何 replay delta 写入默认权重。"
        ];
    }

    return `# producer strategy replay diagnostics

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- decision: \`${report.decision}\`
- adoption allowed: \`${report.adoption_allowed === true}\`
- candidate loses: \`${(report.global_blockers || []).includes("candidate_loses_to_current_baseline")}\`

## Replay delta

| map | samples | candidate config | quality delta | sample ids |
| --- | ---: | --- | --- | --- |
${rows}

## 结论

${conclusionLines.join("\n")}
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
    const { replayReportPath, outputPath } = resolveArgs(argv);
    const replayReport = JSON.parse(fs.readFileSync(replayReportPath, "utf8"));
    const report = buildProducerStrategyReplayDiagnosticsReport({ replayReport });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatProducerStrategyReplayDiagnosticsMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REPLAY_REPORT_PATH,
    formatProducerStrategyReplayDiagnosticsMarkdown,
    main,
    resolveArgs
};
