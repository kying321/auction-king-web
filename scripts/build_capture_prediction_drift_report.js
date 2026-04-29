const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INTAKE_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-package-intake-report.json");
const DEFAULT_SCAN_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-observation-prior-scan-report.json");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-prediction-drift-report.json");
const RED_EXTREME_THRESHOLD = 8;
const RED_HIGH_THRESHOLD = 4;

function resolveArgs(argv = process.argv.slice(2)) {
    const result = {
        intakePath: DEFAULT_INTAKE_PATH,
        scanPath: DEFAULT_SCAN_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: null
    };
    const positional = [];
    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        const eqIndex = arg.indexOf("=");
        const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
        const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : null;
        const nextValue = () => {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flag} missing value`);
            if (inlineValue === null) index += 1;
            return String(value);
        };
        if (flag === "--generated-at") {
            result.generatedAt = nextValue();
        } else if (flag === "--output") {
            result.outputPath = path.resolve(nextValue());
        } else {
            positional.push(arg);
        }
    }
    if (positional[0]) result.intakePath = path.resolve(positional[0]);
    if (positional[1]) result.scanPath = path.resolve(positional[1]);
    if (positional[2]) result.outputPath = path.resolve(positional[2]);
    if (positional.length > 3) {
        throw new Error("Usage: <capture-intake.json> <prior-scan.json> [output.json]");
    }
    return result;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function summarizeNumbers(values = []) {
    const numbers = values.map(finiteNumber).filter(Number.isFinite);
    if (!numbers.length) return { count: 0, min: null, max: null, mean: null };
    return {
        count: numbers.length,
        min: roundTo(Math.min(...numbers)),
        max: roundTo(Math.max(...numbers)),
        mean: roundTo(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
    };
}

function indexCurrentDefaultEntries(scanReport = {}) {
    const scenario = (scanReport.scenarios || []).find((entry) => entry.id === "current_default") || {};
    const index = new Map();
    (scenario.entries || []).forEach((entry) => {
        [entry.capture, entry.exported_at].filter(Boolean).forEach((key) => index.set(String(key), entry));
    });
    return {
        scenario,
        index
    };
}

function buildCapturePredictionDriftReport({
    intakeReport = {},
    scanReport = {},
    generatedAt = null,
    paths = {}
} = {}) {
    const { scenario, index } = indexCurrentDefaultEntries(scanReport);
    const rows = (intakeReport.entries || []).map((entry) => {
        const current = index.get(String(entry.basename || "")) || index.get(String(entry.exported_at || "")) || {};
        const embeddedRed = finiteNumber(entry.analysis_snapshot?.count_means?.r);
        const embeddedRedCells = finiteNumber(entry.analysis_snapshot?.cell_means?.r);
        const currentRed = finiteNumber(current.red_count_mean);
        const currentRedCells = finiteNumber(current.red_cell_mean);
        const deltaRed = Number.isFinite(embeddedRed) && Number.isFinite(currentRed)
            ? currentRed - embeddedRed
            : null;
        const staleExtremeCleared = Number.isFinite(embeddedRed)
            && embeddedRed >= RED_EXTREME_THRESHOLD
            && Number.isFinite(currentRed)
            && currentRed < RED_EXTREME_THRESHOLD;
        return {
            capture: entry.basename || current.capture || null,
            exported_at: entry.exported_at || current.exported_at || null,
            map_id: entry.map_id || current.map_id || null,
            embedded_config_source_version: entry.config_source_version || null,
            embedded_red_count_mean: roundTo(embeddedRed),
            current_red_count_mean: roundTo(currentRed),
            red_count_mean_delta: roundTo(deltaRed),
            embedded_red_cell_mean: roundTo(embeddedRedCells),
            current_red_cell_mean: roundTo(currentRedCells),
            current_orange_count_mean: roundTo(current.orange_count_mean),
            current_purple_count_mean: roundTo(current.purple_count_mean),
            current_mean_value_w: roundTo(current.mean_value_w, 4),
            current_risk_flags: Array.isArray(current.risk_flags) ? current.risk_flags.slice() : [],
            stale_extreme_cleared: staleExtremeCleared,
            current_high_red: Number.isFinite(currentRed) && currentRed >= RED_HIGH_THRESHOLD,
            current_extreme_red: Number.isFinite(currentRed) && currentRed >= RED_EXTREME_THRESHOLD,
            decisive_missing_fields: buildDecisiveMissingFields(entry)
        };
    });
    const embeddedStats = summarizeNumbers(rows.map((row) => row.embedded_red_count_mean));
    const currentStats = summarizeNumbers(rows.map((row) => row.current_red_count_mean));
    return {
        schema_version: "ak_capture_prediction_drift_report_v1",
        generated_at: generatedAt || scanReport.generated_at || intakeReport.generated_at || null,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        authority_merge_allowed: false,
        source_paths: {
            capture_intake_report: paths.intakePath || null,
            capture_observation_prior_scan_report: paths.scanPath || null
        },
        guardrails: [
            "embedded_capture_analysis_is_historical_not_current_default",
            "current_scan_observations_are_not_training_labels",
            "manual_actual_counts_required_before_weight_fit"
        ],
        current_default_context: {
            scenario_id: scenario.id || "current_default",
            count_prior_strength: scenario.count_prior_strength ?? null,
            alpha_counts: scenario.alpha_counts || null,
            risk_score: scenario.risk_score ?? null
        },
        summary: {
            capture_package_count: rows.length,
            matched_current_prediction_count: rows.filter((row) => Number.isFinite(row.current_red_count_mean)).length,
            embedded_red_count: embeddedStats,
            current_red_count: currentStats,
            stale_extreme_cleared_count: rows.filter((row) => row.stale_extreme_cleared).length,
            current_high_red_count: rows.filter((row) => row.current_high_red).length,
            current_extreme_red_count: rows.filter((row) => row.current_extreme_red).length,
            current_risk_flag_count: rows.filter((row) => row.current_risk_flags.length).length
        },
        rows: rows.sort((left, right) => (
            (right.current_red_count_mean || 0) - (left.current_red_count_mean || 0)
            || String(left.exported_at || left.capture).localeCompare(String(right.exported_at || right.capture))
        )),
        conclusion: {
            current_default_red_explosion_cleared: currentStats.max !== null && currentStats.max < RED_EXTREME_THRESHOLD,
            main_remaining_issue: rows.some((row) => row.current_risk_flags.includes("extreme_orange_avg_needs_orange_count_confirmation"))
                ? "extreme_orange_average_without_confirmed_orange_count"
                : "missing_full_actual_counts_for_count_fit",
            recommended_next_action: "Use current scan results for diagnostics; ignore embedded red means except as stale-capture evidence."
        }
    };
}

function buildDecisiveMissingFields(entry = {}) {
    const diagnostics = entry.constraint_diagnostics || {};
    const fields = [];
    if (diagnostics.orange_count_missing) fields.push("orange_count");
    if (!Number.isFinite(finiteNumber(diagnostics.white_green_total_count ?? diagnostics.inferred_white_green_count))) {
        fields.push("white_green_total_count");
    }
    if (!Number.isFinite(finiteNumber(diagnostics.purple_count))) fields.push("purple_count");
    if (!Number.isFinite(finiteNumber(entry.observed_state?.r4_total_storage_cells))) fields.push("total_storage_cells");
    if (!Object.keys(entry.actual_counts || {}).length) fields.push("actual_counts.w/g/b/p/o/r");
    return fields;
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const lines = [
        "# Capture Prediction Drift Report",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Capture packages: \`${report.summary ? report.summary.capture_package_count : 0}\``,
        `- Embedded red max: \`${report.summary?.embedded_red_count?.max ?? "-"}\``,
        `- Current red max: \`${report.summary?.current_red_count?.max ?? "-"}\``,
        `- Stale red extremes cleared: \`${report.summary ? report.summary.stale_extreme_cleared_count : 0}\``,
        `- Current red extremes: \`${report.summary ? report.summary.current_extreme_red_count : 0}\``,
        "",
        "| capture | embedded red | current red | delta | current orange | current purple | flags | missing fields |",
        "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |"
    ];
    (report.rows || []).slice(0, 20).forEach((row) => {
        lines.push(`| ${[
            row.capture,
            row.embedded_red_count_mean,
            row.current_red_count_mean,
            row.red_count_mean_delta,
            row.current_orange_count_mean,
            row.current_purple_count_mean,
            row.current_risk_flags.join(", ") || "-",
            row.decisive_missing_fields.join(", ") || "-"
        ].map(markdownCell).join(" | ")} |`);
    });
    lines.push("");
    lines.push("## Guardrails");
    (report.guardrails || []).forEach((guardrail) => lines.push(`- \`${guardrail}\``));
    lines.push("");
    lines.push("## Conclusion");
    lines.push(`- current default red explosion cleared: \`${report.conclusion ? report.conclusion.current_default_red_explosion_cleared : false}\``);
    lines.push(`- main remaining issue: \`${report.conclusion ? report.conclusion.main_remaining_issue : "-"}\``);
    lines.push(`- next: ${report.conclusion ? report.conclusion.recommended_next_action : "-"}`);
    lines.push("");
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildCapturePredictionDriftReport({
        intakeReport: readJson(args.intakePath),
        scanReport: readJson(args.scanPath),
        generatedAt: args.generatedAt,
        paths: {
            intakePath: args.intakePath,
            scanPath: args.scanPath
        }
    });
    writeJson(args.outputPath, report);
    const markdownPath = args.outputPath.replace(/\.json$/i, ".md");
    writeText(markdownPath, formatMarkdownReport(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n${markdownPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    RED_EXTREME_THRESHOLD,
    buildCapturePredictionDriftReport,
    formatMarkdownReport,
    main,
    resolveArgs
};
