const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_QUEUE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-candidate-queue.json"
);
const DEFAULT_MANUAL_REVIEW_RESULTS_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-manual-review-results.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-manual-review-results-audit.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const APPROVED_STATUSES = new Set([
    "approved_clean_replay",
    "clean_replay_ready",
    "clean_replay_partial"
]);

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let failOnBlockers = false;
    argv.forEach((arg) => {
        if (arg === "--fail-on-blockers") {
            failOnBlockers = true;
            return;
        }
        positional.push(arg);
    });
    return {
        queuePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_QUEUE_PATH,
        manualReviewResultsPath: positional[1]
            ? path.resolve(positional[1])
            : DEFAULT_MANUAL_REVIEW_RESULTS_PATH,
        outputPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_OUTPUT_PATH,
        failOnBlockers
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

function finiteNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeManualReviewResults(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.review_results)) return payload.review_results;
    if (Array.isArray(payload.manual_review_results)) return payload.manual_review_results;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.items)) return payload.items;
    return [];
}

function normalizeQueueItems(queue) {
    if (Array.isArray(queue)) return queue;
    if (queue && typeof queue === "object" && Array.isArray(queue.items)) return queue.items;
    return [];
}

function buildQueueIndexes(items = []) {
    const byId = new Map();
    const byBasename = new Map();
    items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const id = normalizeText(item.id);
        const basename = normalizeText(item.basename || path.basename(normalizeText(item.source_image_path)));
        if (id) byId.set(id, item);
        if (basename) byBasename.set(basename, item);
    });
    return { byId, byBasename };
}

function getReviewQueueRef(result = {}) {
    return normalizeText(
        result.source_queue_id
        || result.queue_id
        || result.review_queue_id
        || result.candidate_queue_id
    );
}

function findQueueItem(result = {}, indexes) {
    const queueRef = getReviewQueueRef(result);
    if (queueRef && indexes.byId.has(queueRef)) return indexes.byId.get(queueRef);
    const basename = normalizeText(result.basename || path.basename(normalizeText(result.source_image_path)));
    if (basename && indexes.byBasename.has(basename)) return indexes.byBasename.get(basename);
    return null;
}

function isCleanReplayQueueItem(item = {}) {
    const outputTarget = item.manual_review_template && item.manual_review_template.output_target;
    return item.priority === "P0"
        && (
            outputTarget === "clean_replay_sample_candidate"
            || item.recommended_action === "pair_observed_state_and_actual_counts"
        );
}

function hasNonEmptyObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0);
}

function normalizeActualCounts(counts = {}) {
    const normalized = {};
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) return normalized;
    QUALITY_ORDER.forEach((quality) => {
        if (!Object.prototype.hasOwnProperty.call(counts, quality)) return;
        const numeric = finiteNumberOrNull(counts[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) normalized[quality] = numeric;
    });
    return normalized;
}

function normalizeActualCountsTotalItems(counts = {}) {
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) return null;
    const numeric = finiteNumberOrNull(counts.total_items);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function getActualCountsSource(result = {}) {
    const metadata = result.metadata && typeof result.metadata === "object" ? result.metadata : {};
    return normalizeText(result.actual_counts_source || metadata.actual_counts_source);
}

function trainingLabelEnabled(value) {
    return Boolean(value && typeof value === "object" && value.training_label_allowed === true);
}

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function buildActualCountsTotalCheck(actualCounts = {}, totalItems = null) {
    const qualitySum = Object.values(actualCounts).reduce((sum, value) => sum + value, 0);
    if (totalItems === null) {
        return {
            actual_counts_total_items: null,
            actual_counts_quality_sum: qualitySum,
            actual_counts_total_check: "missing_total_items"
        };
    }
    let status = "matches_total_items";
    if (qualitySum < totalItems) status = "partial_counts_under_total_items";
    if (qualitySum > totalItems) status = "counts_exceed_total_items";
    return {
        actual_counts_total_items: totalItems,
        actual_counts_quality_sum: qualitySum,
        actual_counts_total_check: status
    };
}

function countsMatchDraft(actualCounts = {}, draftCounts = {}) {
    const actualKeys = Object.keys(actualCounts).sort();
    const draftNormalized = normalizeActualCounts(draftCounts);
    const draftKeys = Object.keys(draftNormalized).sort();
    if (!actualKeys.length || actualKeys.length !== draftKeys.length) return false;
    return actualKeys.every((key, index) => key === draftKeys[index] && actualCounts[key] === draftNormalized[key]);
}

function buildAuditEntry(result = {}, indexes) {
    const queueItem = findQueueItem(result, indexes);
    const status = normalizeText(result.status || result.manual_review_status).toLowerCase();
    const approved = APPROVED_STATUSES.has(status);
    const actualCounts = normalizeActualCounts(result.actual_counts);
    const totalItems = normalizeActualCountsTotalItems(result.actual_counts);
    const totalCheck = buildActualCountsTotalCheck(actualCounts, totalItems);
    const source = getActualCountsSource(result).toLowerCase();
    const blockers = [];
    const warnings = [];
    const resultPixelDraft = result.pixel_quality_draft;
    const queuePixelDraft = queueItem && queueItem.pixel_quality_draft;

    if (!queueItem) {
        addReason(blockers, "queue_item_not_found");
    } else if (!isCleanReplayQueueItem(queueItem)) {
        addReason(blockers, "not_clean_replay_queue_item");
    }

    if (trainingLabelEnabled(result.pixel_quality_draft) || trainingLabelEnabled(queueItem && queueItem.pixel_quality_draft)) {
        addReason(blockers, "pixel_quality_draft_training_label_enabled");
    }
    if (trainingLabelEnabled(result.pixel_vs_settlement_total) || trainingLabelEnabled(queueItem && queueItem.pixel_vs_settlement_total)) {
        addReason(blockers, "pixel_vs_settlement_training_label_enabled");
    }

    if (!approved) {
        return {
            source_queue_id: getReviewQueueRef(result) || (queueItem && queueItem.id) || null,
            basename: normalizeText(result.basename || (queueItem && queueItem.basename)) || null,
            map_id: normalizeText(result.map_id || (queueItem && queueItem.map_id)) || null,
            priority: queueItem ? queueItem.priority || null : null,
            status: status || null,
            audit_status: blockers.length ? "blocked" : "pending",
            blockers,
            warnings,
            actual_counts_source: getActualCountsSource(result) || null,
            ...totalCheck
        };
    }

    if (!hasNonEmptyObject(result.observed_state)) addReason(blockers, "missing_observed_state");
    if (!source) addReason(blockers, "actual_counts_source_not_manual");
    if (source.includes("pixel")) addReason(blockers, "actual_counts_source_pixel_draft");
    if (source && !source.includes("manual") && !source.includes("human") && !source.includes("pixel")) {
        addReason(blockers, "actual_counts_source_not_manual");
    }
    if (!Object.keys(actualCounts).length) addReason(blockers, "missing_manual_actual_counts");
    if (!normalizeText(result.map_id || (queueItem && queueItem.map_id))) addReason(blockers, "missing_map_id");
    if (totalItems === null) addReason(blockers, "missing_actual_counts_total_items");
    if (totalCheck.actual_counts_total_check === "counts_exceed_total_items") {
        addReason(blockers, "counts_exceed_total_items");
    }
    if (
        totalCheck.actual_counts_total_check === "partial_counts_under_total_items"
        && status !== "clean_replay_partial"
    ) {
        addReason(blockers, "partial_counts_require_clean_replay_partial_status");
    }
    if (
        countsMatchDraft(actualCounts, resultPixelDraft && resultPixelDraft.counts)
        || countsMatchDraft(actualCounts, queuePixelDraft && queuePixelDraft.counts)
    ) {
        addReason(warnings, "actual_counts_match_pixel_draft_review_required");
    }

    return {
        source_queue_id: getReviewQueueRef(result) || (queueItem && queueItem.id) || null,
        basename: normalizeText(result.basename || (queueItem && queueItem.basename)) || null,
        map_id: normalizeText(result.map_id || (queueItem && queueItem.map_id)) || null,
        priority: queueItem ? queueItem.priority || null : null,
        status,
        audit_status: blockers.length ? "blocked" : "audit_ready",
        blockers,
        warnings,
        actual_counts_source: getActualCountsSource(result) || null,
        ...totalCheck
    };
}

function incrementCount(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function countReasons(entries = [], field) {
    const counts = {};
    entries.forEach((entry) => {
        (entry[field] || []).forEach((reason) => incrementCount(counts, reason));
    });
    return counts;
}

function summarizeAudit({ reviewResultCount = 0, entries = [] } = {}) {
    const mapCounts = {};
    entries.forEach((entry) => incrementCount(mapCounts, entry.map_id || "unknown"));
    return {
        review_result_count: reviewResultCount,
        audit_ready_count: entries.filter((entry) => entry.audit_status === "audit_ready").length,
        blocked_count: entries.filter((entry) => entry.audit_status === "blocked").length,
        pending_count: entries.filter((entry) => entry.audit_status === "pending").length,
        blocker_reason_counts: countReasons(entries, "blockers"),
        warning_reason_counts: countReasons(entries, "warnings"),
        map_counts: mapCounts,
        pixel_training_label_allowed_count: entries.filter((entry) => (
            (entry.blockers || []).includes("pixel_quality_draft_training_label_enabled")
            || (entry.blockers || []).includes("pixel_vs_settlement_training_label_enabled")
        )).length
    };
}

function buildCleanReplayManualReviewResultsAudit({
    queue = {},
    manualReviewResults = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const queueItems = normalizeQueueItems(queue);
    const reviewResults = normalizeManualReviewResults(manualReviewResults);
    const indexes = buildQueueIndexes(queueItems);
    const entries = reviewResults.map((result) => buildAuditEntry(result, indexes));
    return {
        schema_version: "ak_clean_replay_manual_review_results_audit_v1",
        generated_at: generatedAt,
        source_queue_schema_version: queue && queue.schema_version ? queue.schema_version : null,
        source_results_schema_version: manualReviewResults && manualReviewResults.schema_version
            ? manualReviewResults.schema_version
            : null,
        change_class: "RESEARCH_ONLY",
        notes: [
            "Audit gate for human-filled clean replay manual review results.",
            "Pixel-derived counts remain review-only and are blocked from exportable training labels.",
            "Approved full clean replay rows must have counts matching total_items; partial rows must use clean_replay_partial."
        ],
        summary: summarizeAudit({
            reviewResultCount: reviewResults.length,
            entries
        }),
        entries
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

function countRows(counts = {}) {
    const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
    if (!entries.length) return "| `-` | `0` |";
    return entries.map(([key, value]) => `| ${markdownCode(key)} | ${markdownCode(value)} |`).join("\n");
}

function reasonList(reasons = []) {
    return reasons.length ? reasons.join(", ") : "-";
}

function formatManualReviewResultsAuditMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report && report.summary ? report.summary : summarizeAudit();
    const entries = Array.isArray(report && report.entries) ? report.entries : [];
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = entries.length
        ? entries.map((entry) => tableRow([
            markdownCode(entry.source_queue_id),
            markdownCode(entry.basename),
            markdownCode(entry.map_id),
            markdownCode(entry.status),
            markdownCode(entry.audit_status),
            markdownCode(entry.actual_counts_total_check),
            markdownCell(reasonList(entry.blockers)),
            markdownCell(reasonList(entry.warnings))
        ])).join("\n")
        : "| `-` | `-` | `-` | `-` | `-` | `-` | - | - |";

    return `# 2026-04-24 manual review results audit

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- review results: \`${summary.review_result_count || 0}\`
- audit ready: \`${summary.audit_ready_count || 0}\`
- blocked: \`${summary.blocked_count || 0}\`
- pending: \`${summary.pending_count || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`
- 用途: 对人工填写的 clean replay review_results 做发布前审计；通过后再导出 replay sample。

## 阻断原因

| reason | count |
| --- | ---: |
${countRows(summary.blocker_reason_counts)}

## 警告原因

| reason | count |
| --- | ---: |
${countRows(summary.warning_reason_counts)}

## 地图计数

| map | count |
| --- | ---: |
${countRows(summary.map_counts)}

## 审计明细

| queue id | basename | map | review status | audit status | total check | blockers | warnings |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## 护栏

- \`actual_counts_source\` 含 \`pixel\` 的 approved 结果会被阻断。
- full clean replay 的品质计数总和必须等于 \`actual_counts.total_items\`。
- 计数小于 \`total_items\` 时必须使用 \`clean_replay_partial\` 状态。
- 像素草稿可展示为复核线索，但 \`training_label_allowed\` 不能为 \`true\`。
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
    const { queuePath, manualReviewResultsPath, outputPath, failOnBlockers } = resolveArgs(argv);
    const report = buildCleanReplayManualReviewResultsAudit({
        queue: JSON.parse(fs.readFileSync(queuePath, "utf8")),
        manualReviewResults: JSON.parse(fs.readFileSync(manualReviewResultsPath, "utf8"))
    });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatManualReviewResultsAuditMarkdown(report, outputPath));
    if (failOnBlockers && report.summary.blocked_count > 0) {
        throw new Error(`manual review audit blockers: ${report.summary.blocked_count}`);
    }
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    APPROVED_STATUSES,
    DEFAULT_MANUAL_REVIEW_RESULTS_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_QUEUE_PATH,
    QUALITY_ORDER,
    buildCleanReplayManualReviewResultsAudit,
    formatManualReviewResultsAuditMarkdown,
    main,
    resolveArgs
};
