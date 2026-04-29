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
    "2026-04-24-clean-replay-manual-review-samples.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const APPROVED_STATUSES = new Set([
    "approved_clean_replay",
    "clean_replay_ready",
    "clean_replay_partial"
]);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        queuePath: argv[0] ? path.resolve(argv[0]) : DEFAULT_QUEUE_PATH,
        manualReviewResultsPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_MANUAL_REVIEW_RESULTS_PATH,
        outputPath: argv[2] ? path.resolve(argv[2]) : DEFAULT_OUTPUT_PATH
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

function normalizeObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return cloneValue(value);
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

function rejectReasonForResult(result = {}, queueItem = null) {
    if (!queueItem) return "queue_item_not_found";
    if (!isCleanReplayQueueItem(queueItem)) return "not_clean_replay_queue_item";

    const status = normalizeText(result.status || result.manual_review_status).toLowerCase();
    if (!APPROVED_STATUSES.has(status)) return "review_not_approved";
    if (!hasNonEmptyObject(result.observed_state)) return "missing_observed_state";

    const source = getActualCountsSource(result).toLowerCase();
    if (!source) return "actual_counts_source_not_manual";
    if (source.includes("pixel")) return "actual_counts_source_pixel_draft";
    if (!source.includes("manual") && !source.includes("human")) return "actual_counts_source_not_manual";

    if (!Object.keys(normalizeActualCounts(result.actual_counts)).length) return "missing_manual_actual_counts";
    if (!normalizeText(result.map_id || queueItem.map_id)) return "missing_map_id";
    return null;
}

function makeSafeId(value) {
    return normalizeText(value)
        .replace(/\.[^.]+$/, "")
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        || "manual_review_sample";
}

function buildSampleId(result = {}, queueItem = {}) {
    if (normalizeText(result.sample_id)) return makeSafeId(result.sample_id);
    if (normalizeText(result.id) && normalizeText(result.id) !== getReviewQueueRef(result)) {
        return makeSafeId(result.id);
    }
    return `${makeSafeId(queueItem.confirmed_sample_id || queueItem.id || queueItem.basename)}_manual_clean`;
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

function buildManualReviewSample(result = {}, queueItem = {}) {
    const settlementSummary = queueItem.confirmed_settlement_summary || {};
    const actualCounts = normalizeActualCounts(result.actual_counts);
    const actualCountsTotal = normalizeActualCountsTotalItems(result.actual_counts);
    const totalCheck = buildActualCountsTotalCheck(actualCounts, actualCountsTotal);
    const metadata = {
        manual_review_status: normalizeText(result.status || result.manual_review_status),
        source_queue_id: getReviewQueueRef(result) || queueItem.id || null,
        confirmed_sample_id: queueItem.confirmed_sample_id || null,
        actual_counts_source: getActualCountsSource(result),
        reviewer_notes: normalizeText(result.reviewer_notes || result.notes) || null,
        reviewed_at: normalizeText(result.reviewed_at) || null,
        reviewer: normalizeText(result.reviewer) || null,
        pixel_overlay_path: queueItem.pixel_overlay_path || null,
        pixel_quality_draft_used_as_training_label: false,
        guardrails: [
            "pixel_quality_draft_review_only",
            "manual_actual_counts_required",
            "observed_state_required"
        ],
        ...totalCheck
    };

    if (hasNonEmptyObject(result.excluded_overlay_fields)) {
        metadata.excluded_overlay_fields = cloneValue(result.excluded_overlay_fields);
    }
    if (queueItem.pixel_quality_draft) {
        metadata.pixel_quality_draft_review_only = {
            status: queueItem.pixel_quality_draft.status || "review_only",
            training_label_allowed: queueItem.pixel_quality_draft.training_label_allowed === true,
            total: queueItem.pixel_quality_draft.total ?? null,
            counts: cloneValue(queueItem.pixel_quality_draft.counts || {})
        };
    }

    const sample = {
        id: buildSampleId(result, queueItem),
        record_type: "settlement_sample",
        source_kind: "manual_clean_replay_review",
        source_image_path: normalizeText(result.source_image_path || queueItem.source_image_path) || null,
        map_id: normalizeText(result.map_id || queueItem.map_id) || null,
        map_variant_id: normalizeText(result.map_variant_id || queueItem.map_variant_id) || null,
        map_variant_label: normalizeText(result.map_variant_label || queueItem.map_variant_label) || null,
        bid_price: finiteNumberOrNull(result.bid_price ?? settlementSummary.bid_price),
        loot_value: finiteNumberOrNull(result.loot_value ?? settlementSummary.loot_value),
        profit: finiteNumberOrNull(result.profit ?? settlementSummary.profit),
        observed_state: normalizeObject(result.observed_state),
        actual_counts: actualCounts,
        actual_value: finiteNumberOrNull(result.actual_value ?? result.loot_value ?? settlementSummary.loot_value),
        metadata
    };

    if (hasNonEmptyObject(result.field_values)) sample.field_values = cloneValue(result.field_values);
    return sample;
}

function incrementCount(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function summarizeSamples({ reviewResultCount = 0, samples = [], skipped = [] } = {}) {
    const rejectReasonCounts = {};
    const mapCounts = {};
    skipped.forEach((entry) => incrementCount(rejectReasonCounts, entry.reason || "unknown"));
    samples.forEach((sample) => incrementCount(mapCounts, sample.map_id || "unknown"));
    return {
        review_result_count: reviewResultCount,
        exported_sample_count: samples.length,
        skipped_count: skipped.length,
        reject_reason_counts: rejectReasonCounts,
        map_counts: mapCounts,
        pixel_training_label_allowed_count: samples.filter((sample) => (
            sample.metadata && sample.metadata.pixel_quality_draft_used_as_training_label === true
        )).length
    };
}

function buildCleanReplayManualReviewSamples({
    queue = {},
    manualReviewResults = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const queueItems = normalizeQueueItems(queue);
    const reviewResults = normalizeManualReviewResults(manualReviewResults);
    const indexes = buildQueueIndexes(queueItems);
    const samples = [];
    const skipped = [];

    reviewResults.forEach((result) => {
        const queueItem = findQueueItem(result, indexes);
        const reason = rejectReasonForResult(result, queueItem);
        if (reason) {
            skipped.push({
                source_queue_id: getReviewQueueRef(result) || null,
                basename: result && (result.basename || (queueItem && queueItem.basename)) || null,
                priority: queueItem ? queueItem.priority || null : null,
                status: normalizeText(result && (result.status || result.manual_review_status)) || null,
                reason
            });
            return;
        }
        samples.push(buildManualReviewSample(result, queueItem));
    });

    return {
        schema_version: "ak_clean_replay_manual_review_samples_v1",
        generated_at: generatedAt,
        source_queue_schema_version: queue && queue.schema_version ? queue.schema_version : null,
        change_class: "RESEARCH_ONLY",
        notes: [
            "Only manually approved P0 clean replay queue items are exported.",
            "Pixel quality drafts remain review-only and are never used as training labels.",
            "Each exported sample must include non-empty observed_state and manual actual_counts."
        ],
        summary: summarizeSamples({
            reviewResultCount: reviewResults.length,
            samples,
            skipped
        }),
        samples,
        skipped
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

function formatCounts(counts = {}) {
    const parts = QUALITY_ORDER
        .filter((quality) => Object.prototype.hasOwnProperty.call(counts, quality))
        .map((quality) => `${quality}:${counts[quality]}`);
    return parts.length ? parts.join(", ") : "-";
}

function formatManualReviewSamplesMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report && report.summary ? report.summary : summarizeSamples();
    const samples = Array.isArray(report && report.samples) ? report.samples : [];
    const skipped = Array.isArray(report && report.skipped) ? report.skipped : [];
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const sampleRows = samples.length
        ? samples.map((sample) => tableRow([
            markdownCode(sample.id),
            markdownCode(sample.map_id),
            markdownCode(sample.map_variant_id),
            markdownCell(formatCounts(sample.actual_counts)),
            markdownCode(sample.metadata && sample.metadata.actual_counts_source),
            markdownCode(sample.metadata && sample.metadata.source_queue_id),
            markdownCode(sample.source_image_path)
        ])).join("\n")
        : "| `-` | `-` | `-` | - | `-` | `-` | `-` |";
    const skippedRows = skipped.length
        ? skipped.map((entry) => tableRow([
            markdownCode(entry.source_queue_id),
            markdownCode(entry.basename),
            markdownCode(entry.priority),
            markdownCode(entry.status),
            markdownCell(entry.reason)
        ])).join("\n")
        : "| `-` | `-` | `-` | `-` | - |";

    return `# 2026-04-24 manual review clean replay samples

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- review results: \`${summary.review_result_count || 0}\`
- exported samples: \`${summary.exported_sample_count || 0}\`
- skipped: \`${summary.skipped_count || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`
- 用途: 将人工填写的 clean replay 复核结果转成可回放样本；像素草稿只保留为复核线索。

## 跳过原因

| reason | count |
| --- | ---: |
${countRows(summary.reject_reason_counts)}

## 地图计数

| map | count |
| --- | ---: |
${countRows(summary.map_counts)}

## 导出样本

| sample | map | variant | actual counts | count source | queue id | source image |
| --- | --- | --- | --- | --- | --- | --- |
${sampleRows}

## 跳过结果

| queue id | basename | priority | status | reason |
| --- | --- | --- | --- | --- |
${skippedRows}

## 护栏

- 只导出 \`P0\` 且目标为 \`clean_replay_sample_candidate\` 的人工复核结果。
- \`actual_counts_source\` 含 \`pixel\` 的结果会被拒绝。
- 缺少 \`observed_state\` 或人工 \`actual_counts\` 的结果不会进入训练样本。
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
    const { queuePath, manualReviewResultsPath, outputPath } = resolveArgs(argv);
    const report = buildCleanReplayManualReviewSamples({
        queue: JSON.parse(fs.readFileSync(queuePath, "utf8")),
        manualReviewResults: JSON.parse(fs.readFileSync(manualReviewResultsPath, "utf8"))
    });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatManualReviewSamplesMarkdown(report, outputPath));
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
    buildCleanReplayManualReviewSamples,
    buildManualReviewSample,
    formatManualReviewSamplesMarkdown,
    main,
    normalizeActualCounts,
    normalizeManualReviewResults,
    rejectReasonForResult,
    resolveArgs
};
