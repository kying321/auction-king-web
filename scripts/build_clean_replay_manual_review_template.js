const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_QUEUE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-candidate-queue.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-manual-review-results-template.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const GUARDRAILS = [
    "fill_observed_state_from_same_battle_only",
    "fill_actual_counts_by_human_review_only",
    "do_not_copy_pixel_quality_draft_into_actual_counts",
    "keep_actual_counts_source_manual_review"
];

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        queuePath: argv[0] ? path.resolve(argv[0]) : DEFAULT_QUEUE_PATH,
        outputPath: argv[1] ? path.resolve(argv[1]) : DEFAULT_OUTPUT_PATH
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeQueueItems(queue) {
    if (Array.isArray(queue)) return queue;
    if (queue && typeof queue === "object" && Array.isArray(queue.items)) return queue.items;
    return [];
}

function isP0CleanReplayCandidate(item = {}) {
    const outputTarget = item.manual_review_template && item.manual_review_template.output_target;
    return item.priority === "P0"
        && (
            outputTarget === "clean_replay_sample_candidate"
            || item.recommended_action === "pair_observed_state_and_actual_counts"
        );
}

function buildEmptyActualCounts() {
    const counts = {};
    QUALITY_ORDER.forEach((quality) => {
        counts[quality] = null;
    });
    counts.total_items = null;
    return counts;
}

function buildReviewResultDraft(item = {}) {
    const manualTemplate = item.manual_review_template && typeof item.manual_review_template === "object"
        ? item.manual_review_template
        : {};
    return {
        source_queue_id: item.id || null,
        status: "needs_manual_input",
        output_target: "clean_replay_sample_candidate",
        basename: item.basename || null,
        source_image_path: item.source_image_path || null,
        pixel_overlay_path: item.pixel_overlay_path || null,
        confirmed_sample_id: item.confirmed_sample_id || null,
        map_id: item.map_id || null,
        map_variant_id: item.map_variant_id || null,
        map_variant_label: item.map_variant_label || null,
        confirmed_settlement_summary: cloneValue(item.confirmed_settlement_summary || {}),
        pixel_quality_draft: item.pixel_quality_draft
            ? {
                ...cloneValue(item.pixel_quality_draft),
                training_label_allowed: false
            }
            : null,
        pixel_vs_settlement_total: item.pixel_vs_settlement_total
            ? {
                ...cloneValue(item.pixel_vs_settlement_total),
                training_label_allowed: false
            }
            : null,
        observed_state: {},
        actual_counts: buildEmptyActualCounts(),
        actual_counts_source: "manual_review",
        reviewer_notes: "",
        required_fields: Array.isArray(manualTemplate.required_fields)
            ? manualTemplate.required_fields.slice()
            : [
                "observed_state",
                "actual_counts.w",
                "actual_counts.g",
                "actual_counts.b",
                "actual_counts.p",
                "actual_counts.o",
                "actual_counts.r",
                "actual_counts.total_items",
                "actual_counts_source",
                "reviewer_notes"
            ],
        guardrails: GUARDRAILS.slice()
    };
}

function incrementCount(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function summarizeTemplate({ queueItemCount = 0, reviewResults = [], skipped = [] } = {}) {
    const mapCounts = {};
    reviewResults.forEach((result) => incrementCount(mapCounts, result.map_id || "unknown"));
    return {
        queue_item_count: queueItemCount,
        review_result_template_count: reviewResults.length,
        skipped_non_p0_count: skipped.length,
        map_counts: mapCounts,
        pixel_training_label_allowed_count: reviewResults.filter((result) => (
            result.pixel_quality_draft && result.pixel_quality_draft.training_label_allowed === true
        )).length
    };
}

function buildCleanReplayManualReviewTemplate({
    queue = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const queueItems = normalizeQueueItems(queue);
    const reviewResults = [];
    const skipped = [];

    queueItems.forEach((item) => {
        if (!isP0CleanReplayCandidate(item)) {
            skipped.push({
                source_queue_id: item && item.id ? item.id : null,
                basename: item && item.basename ? item.basename : null,
                priority: item && item.priority ? item.priority : null,
                reason: "not_p0_clean_replay_candidate"
            });
            return;
        }
        reviewResults.push(buildReviewResultDraft(item));
    });

    return {
        schema_version: "ak_clean_replay_manual_review_results_v1",
        generated_at: generatedAt,
        source_queue_schema_version: queue && queue.schema_version ? queue.schema_version : null,
        change_class: "RESEARCH_ONLY",
        notes: [
            "Fill observed_state from the same battle only.",
            "Fill actual_counts by human review only.",
            "Pixel quality drafts are review-only and must not be copied into actual_counts."
        ],
        summary: summarizeTemplate({
            queueItemCount: queueItems.length,
            reviewResults,
            skipped
        }),
        review_results: reviewResults,
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
        .filter((quality) => counts && Object.prototype.hasOwnProperty.call(counts, quality))
        .map((quality) => `${quality}:${counts[quality]}`);
    return parts.length ? parts.join(", ") : "-";
}

function formatPixelDraft(draft = null) {
    if (!draft) return "-";
    const parts = [
        formatCounts(draft.counts || {}),
        `total=${draft.total ?? "-"}`,
        `low=${draft.low_confidence_block_count ?? "-"}`
    ];
    if (draft.crop_sensitivity) {
        parts.push(`crop=${draft.crop_sensitivity.action || draft.crop_sensitivity.status || "-"}`);
        parts.push(`sig=${draft.crop_sensitivity.unique_signature_count ?? "-"}`);
        parts.push(`majority=${draft.crop_sensitivity.majority_fraction ?? "-"}`);
    }
    return parts.join("; ");
}

function formatManualReviewTemplateMarkdown(template, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = template && template.summary
        ? template.summary
        : summarizeTemplate();
    const reviewResults = Array.isArray(template && template.review_results) ? template.review_results : [];
    const skipped = Array.isArray(template && template.skipped) ? template.skipped : [];
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const reviewRows = reviewResults.length
        ? reviewResults.map((result) => tableRow([
            markdownCode(result.source_queue_id),
            markdownCode(result.basename),
            markdownCode(result.map_id),
            markdownCode(result.map_variant_id),
            markdownCell(formatPixelDraft(result.pixel_quality_draft)),
            markdownCell(result.pixel_vs_settlement_total ? result.pixel_vs_settlement_total.status : null),
            markdownCode(result.confirmed_settlement_summary && result.confirmed_settlement_summary.quick_recycle_total_items),
            markdownCode(result.pixel_overlay_path),
            markdownCode(result.source_image_path)
        ])).join("\n")
        : "| `-` | `-` | `-` | `-` | - | - | `-` | `-` | `-` |";
    const skippedRows = skipped.length
        ? skipped.map((entry) => tableRow([
            markdownCode(entry.source_queue_id),
            markdownCode(entry.basename),
            markdownCode(entry.priority),
            markdownCell(entry.reason)
        ])).join("\n")
        : "| `-` | `-` | `-` | - |";

    return `# 2026-04-24 manual review results template

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- queue items: \`${summary.queue_item_count || 0}\`
- review result templates: \`${summary.review_result_template_count || 0}\`
- skipped non-P0: \`${summary.skipped_non_p0_count || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`
- 用途: 为 P0 clean replay 队列生成待人工填写的 review_results 草稿；未填写前不会进入训练样本。

## 地图计数

| map | count |
| --- | ---: |
${countRows(summary.map_counts)}

## 待填写 P0

| queue id | basename | map | variant | pixel draft | total check | settlement total | pixel overlay | source image |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- |
${reviewRows}

## 跳过项

| queue id | basename | priority | reason |
| --- | --- | --- | --- |
${skippedRows}

## 填写护栏

- \`fill_observed_state_from_same_battle_only\`
- \`fill_actual_counts_by_human_review_only\`
- \`do_not_copy_pixel_quality_draft_into_actual_counts\`
- \`keep_actual_counts_source_manual_review\`
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
    const { queuePath, outputPath } = resolveArgs(argv);
    const template = buildCleanReplayManualReviewTemplate({
        queue: JSON.parse(fs.readFileSync(queuePath, "utf8"))
    });
    writeJson(outputPath, template);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatManualReviewTemplateMarkdown(template, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return template;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_QUEUE_PATH,
    GUARDRAILS,
    QUALITY_ORDER,
    buildCleanReplayManualReviewTemplate,
    buildReviewResultDraft,
    formatManualReviewTemplateMarkdown,
    isP0CleanReplayCandidate,
    main,
    normalizeQueueItems,
    resolveArgs
};
