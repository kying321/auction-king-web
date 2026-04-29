const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_ACQUISITION_PACK_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-acquisition-pack.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-template.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const FALLBACK_REQUIRED_FIELDS = [
    "map_id",
    "event_timestamp",
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
];
const GUARDRAILS = [
    "fill_observed_state_from_same_battle_only",
    "fill_actual_counts_by_human_review_only",
    "do_not_copy_pixel_or_system_hint_into_actual_counts",
    "keep_actual_counts_source_manual_review",
    "record_explicit_event_timestamp"
];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = new Date().toISOString();
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = argv[index];
        } else if (String(arg).startsWith("--generated-at=")) {
            generatedAt = String(arg).slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }
    return {
        acquisitionPackPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_ACQUISITION_PACK_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function buildEmptyActualCounts() {
    const counts = {};
    QUALITY_ORDER.forEach((quality) => {
        counts[quality] = null;
    });
    counts.total_items = null;
    return counts;
}

function requiredFieldsForTask(task = {}) {
    return Array.isArray(task.required_same_battle_fields)
        ? task.required_same_battle_fields.slice()
        : FALLBACK_REQUIRED_FIELDS.slice();
}

function normalizeTaskArray(value) {
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [];
}

function buildReviewResultDraft(task = {}) {
    return {
        source_task_id: task.id || null,
        source_queue_id: task.source_queue_id || null,
        source_task_type: task.task_type || "complete_existing_candidate",
        status: "needs_manual_input",
        output_target: "count_fit_same_battle_sample",
        task_action: task.task_action || null,
        basename: task.basename || null,
        confirmed_sample_id: task.confirmed_sample_id || null,
        map_id: task.map_id || null,
        map_priority: task.map_priority || null,
        candidate_priority: task.candidate_priority || null,
        source_image_path: task.source_image_path || null,
        pixel_overlay_path: task.pixel_overlay_path || null,
        event_timestamp: null,
        observed_state: {},
        actual_counts: buildEmptyActualCounts(),
        actual_counts_source: "manual_review",
        reviewer_notes: "",
        required_fields: requiredFieldsForTask(task),
        pixel_training_label_allowed: false,
        guardrails: GUARDRAILS.slice()
    };
}

function buildFreshCaptureTemplate(task = {}) {
    return {
        source_task_id: task.id || null,
        source_task_type: task.task_type || "capture_fresh_same_battle_samples",
        status: "needs_fresh_same_battle_samples",
        output_target: "count_fit_same_battle_sample",
        map_id: task.map_id || null,
        map_priority: task.map_priority || null,
        target_same_battle_samples_if_existing_candidates_fail: task.target_same_battle_samples_if_existing_candidates_fail || 0,
        target_same_battle_samples_after_all_existing_candidates_accepted:
            task.target_same_battle_samples_after_all_existing_candidates_accepted || 0,
        required_fields: requiredFieldsForTask(task),
        sample_draft: {
            map_id: task.map_id || null,
            event_timestamp: null,
            observed_state: {},
            actual_counts: buildEmptyActualCounts(),
            actual_counts_source: "manual_review",
            reviewer_notes: ""
        },
        pixel_training_label_allowed: false,
        guardrails: GUARDRAILS.slice()
    };
}

function incrementCount(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function summarizeTemplate({ reviewResults = [], freshCaptureTemplates = [] } = {}) {
    const mapCounts = {};
    reviewResults.forEach((entry) => incrementCount(mapCounts, entry.map_id || "unknown"));
    freshCaptureTemplates.forEach((entry) => incrementCount(mapCounts, entry.map_id || "unknown"));
    return {
        existing_candidate_review_count: reviewResults.length,
        fresh_capture_template_count: freshCaptureTemplates.length,
        total_fresh_same_battle_target_if_existing_candidates_fail: freshCaptureTemplates.reduce(
            (sum, entry) => sum + Number(entry.target_same_battle_samples_if_existing_candidates_fail || 0),
            0
        ),
        total_fresh_same_battle_target_after_all_existing_candidates_accepted: freshCaptureTemplates.reduce(
            (sum, entry) => sum + Number(entry.target_same_battle_samples_after_all_existing_candidates_accepted || 0),
            0
        ),
        map_counts: mapCounts,
        pixel_training_label_allowed_count: [
            ...reviewResults,
            ...freshCaptureTemplates
        ].filter((entry) => entry.pixel_training_label_allowed === true).length
    };
}

function buildCountFitSampleReviewTemplate({
    acquisitionPack = {},
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const reviewResults = normalizeTaskArray(acquisitionPack.existing_candidate_tasks).map(buildReviewResultDraft);
    const freshCaptureTemplates = normalizeTaskArray(acquisitionPack.fresh_capture_tasks).map(buildFreshCaptureTemplate);
    return {
        schema_version: "ak_count_fit_sample_review_template_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            count_fit_sample_acquisition_pack: paths.acquisitionPackPath || DEFAULT_ACQUISITION_PACK_PATH
        },
        source_pack_generated_at: acquisitionPack.generated_at || null,
        notes: [
            "Fill observed_state and actual_counts from the same battle.",
            "Pixel/OCR/system rounded hints are review context only, not actual_counts labels.",
            "Fresh captures should use one filled sample object per battle."
        ],
        summary: summarizeTemplate({ reviewResults, freshCaptureTemplates }),
        review_results: reviewResults,
        fresh_capture_templates: freshCaptureTemplates
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

function formatCountFitSampleReviewTemplateMarkdown(template, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const summary = template.summary || {};
    const reviewRows = (template.review_results || []).map((result) => tableRow([
        markdownCode(result.map_priority),
        markdownCode(result.map_id),
        markdownCode(result.source_task_id),
        markdownCode(result.source_queue_id),
        markdownCell(result.output_target),
        markdownCell(result.task_action),
        markdownCode(result.source_image_path)
    ])).join("\n");
    const freshRows = (template.fresh_capture_templates || []).map((entry) => tableRow([
        markdownCode(entry.map_priority),
        markdownCode(entry.map_id),
        markdownCode(entry.target_same_battle_samples_if_existing_candidates_fail),
        markdownCode(entry.target_same_battle_samples_after_all_existing_candidates_accepted),
        markdownCell((entry.required_fields || []).join(", "))
    ])).join("\n");

    return `# count-fit sample review template

- change class: \`${template.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- existing candidate review drafts: \`${summary.existing_candidate_review_count || 0}\`
- fresh capture templates: \`${summary.fresh_capture_template_count || 0}\`
- fresh target if existing candidates fail: \`${summary.total_fresh_same_battle_target_if_existing_candidates_fail || 0}\`
- fresh target after existing candidates accepted: \`${summary.total_fresh_same_battle_target_after_all_existing_candidates_accepted || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`

## Map Counts

| map | draft count |
| --- | ---: |
${countRows(summary.map_counts)}

## Existing Candidate Drafts

| priority | map | source task | source queue | output target | action | source image |
| --- | --- | --- | --- | --- | --- | --- |
${reviewRows || "| `-` | `-` | `-` | `-` | - | - | `-` |"}

## Fresh Same-Battle Templates

| priority | map | target if candidates fail | target after candidates accepted | required fields |
| --- | --- | ---: | ---: | --- |
${freshRows || "| `-` | `-` | `0` | `0` | - |"}

## Guardrails

- Fill one same-battle sample per battle.
- Do not copy pixel/OCR/system hints into actual_counts.
- Use \`actual_counts_source=manual_review\` unless a later authority source is explicitly added.
`;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const template = buildCountFitSampleReviewTemplate({
        acquisitionPack: readJson(args.acquisitionPackPath),
        generatedAt: args.generatedAt,
        paths: args
    });
    writeJson(args.outputPath, template);
    fs.writeFileSync(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleReviewTemplateMarkdown(template, args.outputPath),
        "utf8"
    );
    process.stdout.write(`${args.outputPath}\n`);
    return template;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_ACQUISITION_PACK_PATH,
    DEFAULT_OUTPUT_PATH,
    buildCountFitSampleReviewTemplate,
    formatCountFitSampleReviewTemplateMarkdown,
    main,
    resolveArgs
};
