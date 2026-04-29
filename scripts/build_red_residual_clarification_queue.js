const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INTAKE_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-package-intake-report.json");
const DEFAULT_SCAN_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-observation-prior-scan-report.json");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-red-residual-clarification-queue.json");
const RED_RESIDUAL_FLAGS = [
    "red_residual_sensitive_to_missing_orange_count",
    "extreme_orange_avg_needs_orange_count_confirmation",
    "model_predicted_red_count_extreme",
    "model_predicted_red_cells_extreme",
    "model_red_share_above_25pct"
];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    argv.forEach((arg) => positional.push(String(arg)));
    if (positional.length > 3) {
        throw new Error("最多只接受 3 个位置参数: <capture-intake.json> <prior-scan.json> [output.json]");
    }
    return {
        intakePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_INTAKE_PATH,
        scanPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_SCAN_PATH,
        outputPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_OUTPUT_PATH
    };
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

function roundTo(value, digits = 4) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getCurrentDefaultScenario(scanReport = {}) {
    return (scanReport.scenarios || []).find((scenario) => scenario.id === "current_default") || null;
}

function indexIntakeEntries(intakeReport = {}) {
    const map = new Map();
    (intakeReport.entries || []).forEach((entry) => {
        [entry.basename, entry.exported_at].filter(Boolean).forEach((key) => map.set(String(key), entry));
    });
    return map;
}

function getScanEntryKey(entry = {}) {
    return entry.capture || entry.exported_at || "";
}

function hasResidualSignal(entry = {}) {
    const flags = Array.isArray(entry.risk_flags) ? entry.risk_flags : [];
    return flags.some((flag) => RED_RESIDUAL_FLAGS.includes(flag));
}

function addUnique(target, value) {
    if (value && !target.includes(value)) target.push(value);
}

function buildMinimalFields(intakeEntry = {}, scanEntry = {}) {
    const diagnostics = intakeEntry.constraint_diagnostics || {};
    const observed = intakeEntry.observed_state || {};
    const flags = Array.isArray(scanEntry.risk_flags) ? scanEntry.risk_flags : [];
    const fields = [];
    if (diagnostics.orange_count_missing === true || flags.includes("extreme_orange_avg_needs_orange_count_confirmation")) {
        addUnique(fields, "orange_count");
    }
    if (!Number.isFinite(finiteNumber(diagnostics.purple_count))) {
        addUnique(fields, "purple_count");
    }
    if (!Number.isFinite(finiteNumber(diagnostics.inferred_white_green_count))) {
        addUnique(fields, "white_green_total_cells");
        addUnique(fields, "white_green_avg_cells");
    }
    if (!Number.isFinite(finiteNumber(observed.r4_total_storage_cells))) {
        addUnique(fields, "total_storage_cells");
    }
    if (flags.includes("model_predicted_red_count_extreme") || flags.includes("model_predicted_red_cells_extreme")) {
        addUnique(fields, "red_count");
    }
    addUnique(fields, "actual_counts.w/g/b/p/o/r/total_items");
    return fields;
}

function classifyPriority(scanEntry = {}, intakeEntry = {}) {
    const flags = Array.isArray(scanEntry.risk_flags) ? scanEntry.risk_flags : [];
    const diagnostics = intakeEntry.constraint_diagnostics || {};
    if (
        flags.includes("red_residual_sensitive_to_missing_orange_count")
        && (flags.includes("model_predicted_red_count_extreme") || flags.includes("extreme_orange_avg_needs_orange_count_confirmation"))
    ) {
        return "P0";
    }
    if (flags.includes("model_predicted_red_count_extreme") || flags.includes("model_predicted_red_cells_extreme")) {
        return "P1";
    }
    if (Number.isFinite(finiteNumber(diagnostics.orange_red_unknown_pool)) && diagnostics.orange_red_unknown_pool >= 6) {
        return "P1";
    }
    return "P2";
}

function priorityScore(scanEntry = {}, intakeEntry = {}) {
    const flags = Array.isArray(scanEntry.risk_flags) ? scanEntry.risk_flags : [];
    const diagnostics = intakeEntry.constraint_diagnostics || {};
    let score = 0;
    score += (finiteNumber(scanEntry.red_count_mean) || 0) * 10;
    score += (finiteNumber(scanEntry.red_cell_mean) || 0) * 1.5;
    score += (finiteNumber(diagnostics.orange_red_unknown_pool) || finiteNumber(scanEntry.orange_red_unknown_pool) || 0) * 4;
    if (flags.includes("red_residual_sensitive_to_missing_orange_count")) score += 50;
    if (flags.includes("extreme_orange_avg_needs_orange_count_confirmation")) score += 35;
    if (flags.includes("model_predicted_red_count_extreme")) score += 30;
    if (flags.includes("model_predicted_red_cells_extreme")) score += 25;
    if (diagnostics.known_count_balance_complete === false) score += 15;
    return roundTo(score, 4);
}

function buildQueueItem(scanEntry = {}, intakeEntry = {}) {
    const flags = Array.isArray(scanEntry.risk_flags) ? scanEntry.risk_flags : [];
    const diagnostics = intakeEntry.constraint_diagnostics || {};
    const priority = classifyPriority(scanEntry, intakeEntry);
    const minimalRequiredFields = buildMinimalFields(intakeEntry, scanEntry);
    return {
        queue_id: `red_residual_${String(scanEntry.exported_at || scanEntry.capture || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`,
        priority,
        priority_score: priorityScore(scanEntry, intakeEntry),
        map_id: scanEntry.map_id || intakeEntry.map_id || "sunken_ship",
        capture_group_key: intakeEntry.capture_group_key || null,
        capture: scanEntry.capture || intakeEntry.basename || null,
        captures: [scanEntry.capture || intakeEntry.basename || null].filter(Boolean),
        exported_at: scanEntry.exported_at || intakeEntry.exported_at || null,
        input_path: intakeEntry.input_path || null,
        input_paths: [intakeEntry.input_path || null].filter(Boolean),
        use_class: intakeEntry.use_class || null,
        field_values_compact: intakeEntry.field_values_compact || {},
        current_model: {
            red_count_mean: roundTo(scanEntry.red_count_mean),
            red_cell_mean: roundTo(scanEntry.red_cell_mean),
            orange_count_mean: roundTo(scanEntry.orange_count_mean),
            purple_count_mean: roundTo(scanEntry.purple_count_mean),
            q25_value_w: roundTo(scanEntry.q25_value_w),
            q50_value_w: roundTo(scanEntry.q50_value_w),
            mean_value_w: roundTo(scanEntry.mean_value_w)
        },
        constraint_diagnostics: {
            total_items: finiteNumber(diagnostics.total_items),
            blue_count: finiteNumber(diagnostics.blue_count),
            purple_count: finiteNumber(diagnostics.purple_count),
            orange_count: finiteNumber(diagnostics.orange_count),
            inferred_white_green_count: finiteNumber(diagnostics.inferred_white_green_count),
            orange_avg_cells: finiteNumber(diagnostics.orange_avg_cells),
            orange_red_unknown_pool: finiteNumber(diagnostics.orange_red_unknown_pool),
            known_count_balance_complete: diagnostics.known_count_balance_complete === true,
            orange_count_missing: diagnostics.orange_count_missing === true
        },
        risk_flags: flags,
        minimal_required_fields: minimalRequiredFields,
        recommended_next_action: minimalRequiredFields.includes("orange_count")
            ? "先补金色数量；若仍异常，再补红色数量或完整六品质数量。"
            : "优先补完整六品质实际数量，用作 count-fit replay 标签。",
        training_label_allowed: false,
        authority_merge_allowed: false,
        adoption_blockers: [
            "manual_clarification_required",
            "capture_observations_are_not_training_labels",
            intakeEntry.use_class === "count_fit_ready" ? null : "missing_authority_ready_actual_counts"
        ].filter(Boolean)
    };
}

function chooseHigherPriority(left, right) {
    const rank = { P0: 0, P1: 1, P2: 2 };
    return (rank[right] ?? 9) < (rank[left] ?? 9) ? right : left;
}

function unionValues(left = [], right = []) {
    return Array.from(new Set(left.concat(right).filter(Boolean)));
}

function mergeQueueItems(left, right) {
    const score = Math.max(Number(left.priority_score) || 0, Number(right.priority_score) || 0);
    const useRightModel = (Number(right.current_model && right.current_model.red_count_mean) || 0)
        > (Number(left.current_model && left.current_model.red_count_mean) || 0);
    return {
        ...left,
        queue_id: left.queue_id,
        priority: chooseHigherPriority(left.priority, right.priority),
        priority_score: roundTo(score, 4),
        capture: left.capture,
        captures: unionValues(left.captures || [left.capture], right.captures || [right.capture]),
        exported_at: String(left.exported_at || "").localeCompare(String(right.exported_at || "")) <= 0
            ? left.exported_at
            : right.exported_at,
        input_paths: unionValues(left.input_paths || [left.input_path], right.input_paths || [right.input_path]),
        current_model: useRightModel ? right.current_model : left.current_model,
        risk_flags: unionValues(left.risk_flags, right.risk_flags),
        minimal_required_fields: unionValues(left.minimal_required_fields, right.minimal_required_fields),
        adoption_blockers: unionValues(left.adoption_blockers, right.adoption_blockers),
        grouped_capture_count: unionValues(left.captures || [left.capture], right.captures || [right.capture]).length
    };
}

function groupQueueItems(items = []) {
    const groups = new Map();
    items.forEach((item) => {
        const groupKey = item.capture_group_key || `${item.map_id}|${item.exported_at || item.capture}`;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                ...item,
                group_id: `red_residual_group_${String(groupKey).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96)}`,
                grouped_capture_count: item.captures ? item.captures.length : 1
            });
            return;
        }
        groups.set(groupKey, mergeQueueItems(groups.get(groupKey), item));
    });
    return Array.from(groups.values());
}

function sortQueueItems(items = []) {
    const rank = { P0: 0, P1: 1, P2: 2 };
    return items.slice().sort((left, right) => (
        (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9)
        || (right.priority_score || 0) - (left.priority_score || 0)
        || String(left.exported_at || left.capture).localeCompare(String(right.exported_at || right.capture))
    ));
}

function summarizeItems(items = [], intakeReport = {}, rawItemCount = items.length) {
    const priorityCounts = items.reduce((counts, item) => {
        counts[item.priority] = (counts[item.priority] || 0) + 1;
        return counts;
    }, {});
    return {
        capture_package_count: intakeReport.summary ? intakeReport.summary.capture_package_count || 0 : 0,
        raw_capture_item_count: rawItemCount,
        queue_item_count: items.length,
        priority_counts: Object.fromEntries(Object.entries(priorityCounts).sort()),
        authority_merge_allowed: false,
        training_label_allowed_count: 0,
        top_priority: items[0] ? items[0].priority : null,
        top_capture: items[0] ? items[0].capture : null
    };
}

function buildRecommendations(items = []) {
    const topPriority = items[0] ? items[0].priority : null;
    if (!items.length) {
        return [
            "当前配置没有红残差队列项；继续收集完整六品质实际数量，用于 count-fit replay。",
            "若某局视觉上仍异常，优先确认输入来源是否为公开数据四舍五入，以及是否缺橙色/紫色数量。",
            "不要从空队列直接更新默认爆率。"
        ];
    }
    const firstLine = topPriority === "P0"
        ? "先处理 P0：补金色数量、红色数量、总格数或完整六品质数量。"
        : `当前最高优先级为 ${topPriority}：优先补队列第一组的金色数量、总格数或完整六品质数量。`;
    return [
        firstLine,
        "若只能补一个字段，优先补金色数量；它直接决定红色残差是否被误吸收。",
        "完整六品质数量确认后，再进入 manual count-fit replay 和 authority handoff gate。"
    ];
}

function buildRedResidualClarificationQueue({
    intakeReport = {},
    scanReport = {},
    paths = {}
} = {}) {
    const currentDefaultScenario = getCurrentDefaultScenario(scanReport);
    const intakeIndex = indexIntakeEntries(intakeReport);
    const scanEntries = currentDefaultScenario && Array.isArray(currentDefaultScenario.entries)
        ? currentDefaultScenario.entries
        : [];
    const rawItems = scanEntries
        .filter(hasResidualSignal)
        .map((scanEntry) => {
            const intakeEntry = intakeIndex.get(getScanEntryKey(scanEntry)) || intakeIndex.get(scanEntry.exported_at) || {};
            return buildQueueItem(scanEntry, intakeEntry);
        });
    const items = sortQueueItems(groupQueueItems(rawItems));
    return {
        schema_version: "ak_red_residual_clarification_queue_v1",
        change_class: "RESEARCH_ONLY",
        source_paths: {
            capture_intake_report: paths.intakePath || null,
            capture_observation_prior_scan_report: paths.scanPath || null
        },
        guardrails: [
            "do_not_update_default_config_from_clarification_queue",
            "queue_items_require_manual_counts_before_training",
            "pixel_or_model_predictions_are_not_actual_counts"
        ],
        summary: summarizeItems(items, intakeReport, rawItems.length),
        items,
        recommendations: buildRecommendations(items)
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const lines = [
        "# Red Residual Clarification Queue",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Queue items: \`${report.summary ? report.summary.queue_item_count : 0}\``,
        `- Authority merge allowed: \`${report.summary ? report.summary.authority_merge_allowed : false}\``,
        "",
        "| priority | capture | red mean | red cells | unknown pool | fields to add | flags |",
        "| --- | --- | ---: | ---: | ---: | --- | --- |"
    ];
    (report.items || []).forEach((item) => {
        lines.push(`| ${[
            item.priority,
            item.capture,
            item.current_model.red_count_mean,
            item.current_model.red_cell_mean,
            item.constraint_diagnostics.orange_red_unknown_pool,
            item.minimal_required_fields.join(", "),
            item.risk_flags.join(", ")
        ].map(markdownCell).join(" | ")} |`);
    });
    lines.push("");
    lines.push("## Guardrails");
    (report.guardrails || []).forEach((guardrail) => lines.push(`- \`${guardrail}\``));
    lines.push("");
    lines.push("## Next");
    (report.recommendations || []).forEach((recommendation) => lines.push(`- ${recommendation}`));
    lines.push("");
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildRedResidualClarificationQueue({
        intakeReport: readJson(args.intakePath),
        scanReport: readJson(args.scanPath),
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
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_INTAKE_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_SCAN_PATH,
    buildMinimalFields,
    buildRecommendations,
    buildRedResidualClarificationQueue,
    classifyPriority,
    formatMarkdownReport,
    main,
    priorityScore,
    resolveArgs
};
