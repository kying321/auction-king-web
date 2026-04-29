const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_VISUAL_RESULTS_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-capture-full-count-codex-visual-review-results.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-manual-confirmation-results.json"
);
const DEFAULT_RED_RESIDUAL_REVIEW_PACK_PATH = null;
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;
    let force = false;
    let redResidualReviewPackPath = DEFAULT_RED_RESIDUAL_REVIEW_PACK_PATH;
    const priorityFilter = [];

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const eqIndex = String(arg).indexOf("=");
        const flag = eqIndex >= 0 ? String(arg).slice(0, eqIndex) : arg;
        const inlineValue = eqIndex >= 0 ? String(arg).slice(eqIndex + 1) : null;
        const nextValue = () => {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flag} 缺少值`);
            if (inlineValue === null) index += 1;
            return String(value);
        };
        if (flag === "--generated-at") {
            generatedAt = nextValue();
        } else if (flag === "--priority") {
            priorityFilter.push(nextValue());
        } else if (flag === "--red-residual-review-pack") {
            redResidualReviewPackPath = path.resolve(nextValue());
        } else if (arg === "--force") {
            force = true;
        } else {
            positional.push(arg);
        }
    }

    return {
        visualResultsPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_VISUAL_RESULTS_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt,
        force,
        redResidualReviewPackPath,
        priorityFilter: normalizePriorityFilter(priorityFilter)
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

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeStringList(value = []) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    value.forEach((entry) => {
        if (entry === null || entry === undefined || entry === "") return;
        const normalized = String(entry);
        if (seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

function normalizePriorityFilter(value = []) {
    return normalizeStringList(value)
        .flatMap((entry) => entry.split(","))
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean);
}

function normalizePriority(value) {
    return normalizeText(value).toUpperCase();
}

function sampleReviewPriority(template = {}, sample = {}) {
    return normalizePriority(sample.review_priority || template.review_priority || "unknown") || "unknown";
}

function stableIdPart(value, fallback = "item") {
    const normalized = normalizeText(value)
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized || fallback;
}

function sourceTaskIdFor(template = {}, sample = {}) {
    return normalizeText(sample.source_task_id || template.source_task_id) || null;
}

function eventTimestampFor(sample = {}, template = {}) {
    return normalizeText(sample.event_timestamp || template.event_timestamp) || null;
}

function buildRedResidualReviewIndex(redResidualReviewPack = null) {
    const bySourceTaskId = new Map();
    const byEventTimestamp = new Map();
    if (!redResidualReviewPack || !Array.isArray(redResidualReviewPack.items)) {
        return {
            source_path: null,
            item_count: 0,
            bySourceTaskId,
            byEventTimestamp
        };
    }
    redResidualReviewPack.items.forEach((item) => {
        const compact = buildRedResidualReviewContext(item, redResidualReviewPack);
        if (compact.source_task_id) bySourceTaskId.set(compact.source_task_id, compact);
        if (compact.event_timestamp) byEventTimestamp.set(compact.event_timestamp, compact);
    });
    return {
        source_path: redResidualReviewPack.source_paths
            ? redResidualReviewPack.source_paths.red_residual_clarification_queue || null
            : null,
        item_count: redResidualReviewPack.items.length,
        bySourceTaskId,
        byEventTimestamp
    };
}

function buildRedResidualReviewContext(item = {}, reviewPack = {}) {
    const fieldPlan = isPlainObject(item.field_plan) ? item.field_plan : {};
    return {
        schema_version: reviewPack.schema_version || "ak_red_residual_review_pack_v1",
        source_task_id: normalizeText(item.source_task_id) || null,
        event_timestamp: normalizeText(item.event_timestamp) || null,
        queue_id: normalizeText(item.queue_id) || null,
        group_id: normalizeText(item.group_id) || null,
        priority: normalizeText(item.priority) || null,
        priority_score: Number.isFinite(Number(item.priority_score)) ? Number(item.priority_score) : null,
        first_decisive_field: normalizeText(fieldPlan.first_decisive_field) || null,
        decisive_fields: normalizeStringList(fieldPlan.decisive_fields),
        one_field_fallback: normalizeText(fieldPlan.one_field_fallback) || null,
        current_model: isPlainObject(item.current_model) ? cloneValue(item.current_model) : {},
        constraint_diagnostics: isPlainObject(item.constraint_diagnostics) ? cloneValue(item.constraint_diagnostics) : {},
        model_error_hypothesis: normalizeText(item.model_error_hypothesis) || null,
        recommended_next_action: normalizeText(item.recommended_next_action) || null,
        review_image_path: normalizeText(item.review_image_path) || null,
        training_label_allowed: false,
        authority_merge_allowed: false
    };
}

function findRedResidualReviewContext(template = {}, sample = {}, redResidualReviewIndex = null) {
    if (!redResidualReviewIndex) return null;
    const sourceTaskId = sourceTaskIdFor(template, sample);
    const eventTimestamp = eventTimestampFor(sample, template);
    return (sourceTaskId && redResidualReviewIndex.bySourceTaskId.get(sourceTaskId))
        || (eventTimestamp && redResidualReviewIndex.byEventTimestamp.get(eventTimestamp))
        || null;
}

function priorityMatches(template = {}, sample = {}, prioritySet = new Set()) {
    if (!prioritySet.size) return true;
    return prioritySet.has(sampleReviewPriority(template, sample));
}

function isCodexVisualSample(sample = {}) {
    return normalizeText(sample.actual_counts_source).toLowerCase() === "codex_visual_review"
        || Boolean(sample.metadata && sample.metadata.codex_visual_review);
}

function isCaptureManualInputSample(sample = {}, template = {}) {
    return normalizeText(template.source_task_type) === "capture_clipboard_full_count_review"
        && normalizeText(sample.actual_counts_source).toLowerCase() === "manual_review"
        && normalizeText(sample.status || sample.review_status).toLowerCase() !== "approved_count_fit_sample";
}

function normalizeActualCounts(actualCounts = {}) {
    const next = {};
    if (!isPlainObject(actualCounts)) return next;
    QUALITY_ORDER.forEach((quality) => {
        if (actualCounts[quality] === null || actualCounts[quality] === undefined || actualCounts[quality] === "") return;
        const numeric = Number(actualCounts[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) next[quality] = numeric;
    });
    if (actualCounts.total_items === null || actualCounts.total_items === undefined || actualCounts.total_items === "") {
        return next;
    }
    const totalItems = Number(actualCounts.total_items);
    if (Number.isInteger(totalItems) && totalItems >= 0) next.total_items = totalItems;
    return next;
}

function expectedTotalItems(sample = {}) {
    const metadataTotal = sample.metadata
        && sample.metadata.capture_review
        && sample.metadata.capture_review.expected_total_items;
    const observedTotal = sample.observed_state
        && (sample.observed_state.r1_total_items ?? sample.observed_state.total_items);
    const numeric = Number(metadataTotal ?? observedTotal);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function buildManualEntryActualCounts(sample = {}) {
    const counts = normalizeActualCounts(sample.actual_counts || {});
    QUALITY_ORDER.forEach((quality) => {
        if (!Object.prototype.hasOwnProperty.call(counts, quality)) counts[quality] = 0;
    });
    if (!Object.prototype.hasOwnProperty.call(counts, "total_items")) {
        const expectedTotal = expectedTotalItems(sample);
        counts.total_items = expectedTotal === null ? 0 : expectedTotal;
    }
    return counts;
}

function withRedResidualReviewContext(sample = {}, redResidualReviewContext = null) {
    if (!redResidualReviewContext) return sample;
    const next = cloneValue(sample);
    next.metadata = {
        ...(isPlainObject(next.metadata) ? next.metadata : {}),
        red_residual_review: cloneValue(redResidualReviewContext)
    };
    return next;
}

function buildManualConfirmationSample(sample = {}, redResidualReviewContext = null) {
    const originalMetadata = isPlainObject(sample.metadata) ? cloneValue(sample.metadata) : {};
    const originalSource = normalizeText(sample.actual_counts_source) || null;
    const originalStatus = normalizeText(sample.status || sample.review_status) || null;
    return withRedResidualReviewContext({
        ...cloneValue(sample),
        status: "needs_human_confirmation",
        actual_counts: normalizeActualCounts(sample.actual_counts),
        actual_counts_source: "manual_review",
        reviewer_notes: [
            "Manual confirmation draft prefilled from Codex visual candidate.",
            "Verify the stitched image manually; edit counts if needed; only then set status=approved_count_fit_sample."
        ].join(" "),
        pixel_training_label_allowed: false,
        metadata: {
            ...originalMetadata,
            codex_visual_manual_confirmation: {
                prefilled_from_actual_counts_source: originalSource,
                original_status: originalStatus,
                original_actual_counts: normalizeActualCounts(sample.actual_counts),
                approval_required: true,
                user_actions: [
                    "verify_w_g_b_p_o_r_against_review_image",
                    "edit_actual_counts_if_needed",
                    "set_status_approved_count_fit_sample_after_human_review"
                ]
            }
        }
    }, redResidualReviewContext);
}

function buildManualEntrySample(sample = {}, redResidualReviewContext = null) {
    const originalMetadata = isPlainObject(sample.metadata) ? cloneValue(sample.metadata) : {};
    const originalStatus = normalizeText(sample.status || sample.review_status) || null;
    return withRedResidualReviewContext({
        ...cloneValue(sample),
        status: "needs_human_confirmation",
        actual_counts: buildManualEntryActualCounts(sample),
        actual_counts_source: "manual_review",
        reviewer_notes: normalizeText(sample.reviewer_notes) || [
            "Manual count entry draft from capture package.",
            "Fill w/g/b/p/o/r from the review image; only then set status=approved_count_fit_sample."
        ].join(" "),
        pixel_training_label_allowed: false,
        metadata: {
            ...originalMetadata,
            manual_count_entry: {
                original_status: originalStatus,
                approval_required: true,
                user_actions: [
                    "fill_w_g_b_p_o_r_against_review_image",
                    "ensure_quality_sum_matches_total_items",
                    "set_status_approved_count_fit_sample_after_human_review"
                ]
            }
        }
    }, redResidualReviewContext);
}

function buildManualConfirmationFreshTemplate(template = {}, redResidualReviewIndex = null) {
    const samples = Array.isArray(template.samples) ? template.samples : [];
    const convertedSamples = samples
        .map((sample) => {
            const redResidualReviewContext = findRedResidualReviewContext(template, sample, redResidualReviewIndex);
            if (isCodexVisualSample(sample)) return buildManualConfirmationSample(sample, redResidualReviewContext);
            if (isCaptureManualInputSample(sample, template)) return buildManualEntrySample(sample, redResidualReviewContext);
            return null;
        })
        .filter(Boolean)
        .map((sample) => {
            const next = cloneValue(sample);
            if (!next.review_priority && template.review_priority) next.review_priority = template.review_priority;
            if (!Array.isArray(next.review_reasons) && Array.isArray(template.review_reasons)) {
                next.review_reasons = cloneValue(template.review_reasons);
            }
            return next;
        });
    if (!convertedSamples.length) return null;
    return {
        ...cloneValue(template),
        status: "needs_human_confirmation",
        actual_counts_source: "manual_review",
        pixel_training_label_allowed: false,
        guardrails: [
            ...(Array.isArray(template.guardrails) ? template.guardrails : []),
            "manual_confirmation_required_before_import",
            "status_must_remain_unapproved_until_human_verified"
        ].filter((value, index, values) => values.indexOf(value) === index),
        samples: convertedSamples
    };
}

function filterFreshTemplatesByPriority(freshTemplates = [], priorityFilter = []) {
    const normalizedPriorityFilter = normalizePriorityFilter(priorityFilter);
    const prioritySet = new Set(normalizedPriorityFilter);
    if (!prioritySet.size) {
        return {
            priorityFilter: normalizedPriorityFilter,
            freshTemplates
        };
    }
    return {
        priorityFilter: normalizedPriorityFilter,
        freshTemplates: freshTemplates
            .map((template) => {
                const samples = (Array.isArray(template.samples) ? template.samples : [])
                    .filter((sample) => priorityMatches(template, sample, prioritySet));
                if (!samples.length) return null;
                return {
                    ...cloneValue(template),
                    samples
                };
            })
            .filter(Boolean)
    };
}

function buildMapCounts(freshTemplates = []) {
    return freshTemplates.reduce((counts, template) => {
        const mapId = template.map_id || "unknown";
        const sampleCount = Array.isArray(template.samples) ? template.samples.length : 0;
        counts[mapId] = (counts[mapId] || 0) + sampleCount;
        return counts;
    }, {});
}

function buildPriorityCounts(freshTemplates = []) {
    return freshTemplates.reduce((counts, template) => {
        (Array.isArray(template.samples) ? template.samples : []).forEach((sample) => {
            const priority = sampleReviewPriority(template, sample);
            counts[priority] = (counts[priority] || 0) + 1;
        });
        return counts;
    }, {});
}

function countSamplesWithRedResidualReview(freshTemplates = []) {
    return freshTemplates.reduce((count, template) => (
        count + (Array.isArray(template.samples) ? template.samples : []).filter((sample) => (
            sample.metadata && sample.metadata.red_residual_review
        )).length
    ), 0);
}

function buildCodexVisualManualConfirmationResults({
    visualResults = {},
    generatedAt = null,
    paths = {},
    priorityFilter = [],
    redResidualReviewPack = null
} = {}) {
    const redResidualReviewIndex = buildRedResidualReviewIndex(redResidualReviewPack);
    const builtFreshTemplates = (Array.isArray(visualResults.fresh_capture_templates) ? visualResults.fresh_capture_templates : [])
        .map((template) => buildManualConfirmationFreshTemplate(template, redResidualReviewIndex))
        .filter(Boolean);
    const filtered = filterFreshTemplatesByPriority(builtFreshTemplates, priorityFilter);
    const freshTemplates = filtered.freshTemplates;
    const sampleCount = freshTemplates.reduce((sum, template) => sum + (Array.isArray(template.samples) ? template.samples.length : 0), 0);

    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: generatedAt || visualResults.generated_at || null,
        mode: "source_first_implementation",
        change_class: "RESEARCH_ONLY",
        source_template_schema_version: visualResults.schema_version || null,
        source_template_generated_at: visualResults.generated_at || null,
        inputs: {
            codex_visual_review_results: paths.visualResultsPath || DEFAULT_VISUAL_RESULTS_PATH,
            red_residual_review_pack: paths.redResidualReviewPackPath || null
        },
        notes: [
            "User-editable manual confirmation draft generated from Codex visual candidates or capture review templates.",
            "Counts are draft fields and are not authority until a human reviews the image.",
            "Importer should block this draft until status is changed to approved_count_fit_sample after human review.",
            "Keep actual_counts_source=manual_review only if the human has actually verified or corrected the counts."
        ],
        summary: {
            manual_confirmation_draft_count: sampleCount,
            fresh_capture_template_count: freshTemplates.length,
            map_counts: buildMapCounts(freshTemplates),
            priority_filter: filtered.priorityFilter,
            priority_counts: buildPriorityCounts(freshTemplates),
            red_residual_review_hint_count: countSamplesWithRedResidualReview(freshTemplates),
            pixel_training_label_allowed_count: 0,
            import_ready_without_human_action: false
        },
        review_results: [],
        fresh_capture_templates: freshTemplates
    };
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function countSummary(actualCounts = {}) {
    return QUALITY_ORDER.map((quality) => `${quality}:${actualCounts[quality] ?? "-"}`).join(" ");
}

function formatPriorityCounts(counts = {}) {
    return Object.entries(counts || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${value}`)
        .join(", ") || "-";
}

function formatCodexVisualManualConfirmationResultsMarkdown(results = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const rows = [];
    (Array.isArray(results.fresh_capture_templates) ? results.fresh_capture_templates : []).forEach((template) => {
        (Array.isArray(template.samples) ? template.samples : []).forEach((sample) => {
            rows.push([
                markdownCode(sample.map_id || template.map_id),
                markdownCode(sample.event_timestamp),
                markdownCode(countSummary(sample.actual_counts || {})),
                markdownCode(sample.actual_counts && sample.actual_counts.total_items),
                markdownCode(template.review_image_path || (sample.metadata && sample.metadata.capture_review && sample.metadata.capture_review.review_image_path)),
                markdownCode(sample.status)
            ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
        });
    });

    return [
        "# Codex Visual Manual Confirmation Results",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${results.change_class || "RESEARCH_ONLY"}\``,
        `- Draft samples: \`${results.summary ? results.summary.manual_confirmation_draft_count : 0}\``,
        `- Priority filter: \`${results.summary && Array.isArray(results.summary.priority_filter) ? results.summary.priority_filter.join(", ") || "all" : "all"}\``,
        `- Import-ready without human action: \`${results.summary ? results.summary.import_ready_without_human_action === true : false}\``,
        "",
        "| map | event timestamp | prefilled counts | total | review image | status |",
        "| --- | --- | --- | --- | --- | --- |",
        ...(rows.length ? rows : ["| - | - | - | - | - | - |"]),
        "",
        "## Human Action",
        "- Open the review image and verify each quality count.",
        "- Edit `actual_counts` if any prefilled count is wrong.",
        "- Only after manual review, set sample `status` to `approved_count_fit_sample`.",
        "- Then run `node scripts/build_count_fit_sample_review_import.js <this-json> <import-json>`.",
        ""
    ].join("\n");
}

function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeScriptJson(value) {
    return JSON.stringify(value, null, 2)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026");
}

function formatImageSrc(src) {
    if (!src) return "";
    const text = String(src);
    if (/^(https?:|data:|blob:)/i.test(text)) return text;
    const resolved = path.resolve(text);
    const relative = path.relative(ROOT_DIR, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return `/${relative.split(path.sep).join("/")}`;
    }
    return text;
}

function getSampleReviewImage(template = {}, sample = {}) {
    return template.review_image_path
        || sample.review_image_path
        || (sample.metadata && sample.metadata.capture_review && sample.metadata.capture_review.review_image_path)
        || "";
}

function getSampleRedResidualReview(sample = {}) {
    return sample.metadata && isPlainObject(sample.metadata.red_residual_review)
        ? sample.metadata.red_residual_review
        : null;
}

function flattenConfirmationSamples(results = {}) {
    const rows = [];
    (Array.isArray(results.fresh_capture_templates) ? results.fresh_capture_templates : []).forEach((template, templateIndex) => {
        (Array.isArray(template.samples) ? template.samples : []).forEach((sample, sampleIndex) => {
            rows.push({
                templateIndex,
                sampleIndex,
                map_id: sample.map_id || template.map_id || null,
                event_timestamp: sample.event_timestamp || null,
                source_task_id: sample.source_task_id || template.source_task_id || null,
                review_priority: sample.review_priority || template.review_priority || null,
                review_reasons: Array.isArray(sample.review_reasons)
                    ? sample.review_reasons
                    : (Array.isArray(template.review_reasons) ? template.review_reasons : []),
                review_image_path: getSampleReviewImage(template, sample),
                observed_state: isPlainObject(sample.observed_state) ? sample.observed_state : {},
                red_residual_review: getSampleRedResidualReview(sample),
                actual_counts: normalizeActualCounts(sample.actual_counts || {}),
                status: sample.status || null
            });
        });
    });
    return rows;
}

function formatCountInputs(row = {}) {
    const counts = row.actual_counts || {};
    return QUALITY_ORDER.map((quality) => `
        <label class="count-field">
            <span>${escapeHtml(quality)}</span>
            <input type="number" min="0" step="1" data-quality="${escapeHtml(quality)}" value="${escapeHtml(counts[quality] ?? 0)}">
        </label>
    `).join("");
}

function formatMaybeNumber(value) {
    return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatOptionalDataAttribute(name, value) {
    if (value === null || value === undefined || value === "") return "";
    return ` ${name}="${escapeHtml(value)}"`;
}

function formatConstraintAttributes(row = {}) {
    const observed = isPlainObject(row.observed_state) ? row.observed_state : {};
    const redResidualReview = row.red_residual_review || {};
    const diagnostics = isPlainObject(redResidualReview.constraint_diagnostics)
        ? redResidualReview.constraint_diagnostics
        : {};
    return [
        formatOptionalDataAttribute("data-expected-blue", observed.r1_blue_count),
        formatOptionalDataAttribute("data-expected-purple", observed.r2_purple_count),
        formatOptionalDataAttribute("data-expected-white-green", diagnostics.inferred_white_green_count),
        formatOptionalDataAttribute("data-orange-red-pool", diagnostics.orange_red_unknown_pool)
    ].join("");
}

function asNonNegativeInteger(value) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function finiteNumberOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function roundNumber(value, digits = 4) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function formatOrangeRedCandidateTableHtml(row = {}) {
    const redResidualReview = row.red_residual_review || {};
    const diagnostics = isPlainObject(redResidualReview.constraint_diagnostics)
        ? redResidualReview.constraint_diagnostics
        : {};
    const pool = asNonNegativeInteger(diagnostics.orange_red_unknown_pool);
    if (pool === null || pool > 80) return "";
    return formatPairCandidateTableHtml({
        title: "O/R 候选表",
        firstQuality: "o",
        secondQuality: "r",
        firstLabel: "o",
        secondLabel: "r",
        pool
    });
}

function formatWhiteGreenCandidateTableHtml(row = {}) {
    const redResidualReview = row.red_residual_review || {};
    const diagnostics = isPlainObject(redResidualReview.constraint_diagnostics)
        ? redResidualReview.constraint_diagnostics
        : {};
    const pool = asNonNegativeInteger(diagnostics.inferred_white_green_count);
    if (pool === null || pool > 80) return "";
    return formatPairCandidateTableHtml({
        title: "W/G 候选表",
        firstQuality: "w",
        secondQuality: "g",
        firstLabel: "w",
        secondLabel: "g",
        pool
    });
}

function formatKnownConstraintButtonHtml(row = {}) {
    const observed = isPlainObject(row.observed_state) ? row.observed_state : {};
    const attributes = [
        formatOptionalDataAttribute("data-blue", observed.r1_blue_count),
        formatOptionalDataAttribute("data-purple", observed.r2_purple_count)
    ].join("");
    if (!attributes.trim()) return "";
    return `<button type="button" class="secondary-button compact-button" data-apply-known-constraints${attributes}>填入已知 b/p</button>`;
}

function buildFullCandidateScore(counts = {}, row = {}) {
    const redResidualReview = row.red_residual_review || {};
    const model = isPlainObject(redResidualReview.current_model) ? redResidualReview.current_model : {};
    const diagnostics = isPlainObject(redResidualReview.constraint_diagnostics)
        ? redResidualReview.constraint_diagnostics
        : {};
    const redMean = finiteNumberOrNull(model.red_count_mean);
    const orangeMean = finiteNumberOrNull(model.orange_count_mean);
    const purpleMean = finiteNumberOrNull(model.purple_count_mean);
    const whiteGreenPool = asNonNegativeInteger(diagnostics.inferred_white_green_count);
    const redDistance = redMean === null ? 0 : Math.abs(counts.r - redMean);
    const orangeDistance = orangeMean === null ? 0 : Math.abs(counts.o - orangeMean);
    const purpleDistance = purpleMean === null ? 0 : Math.abs(counts.p - purpleMean);
    const wgBalanceDistance = whiteGreenPool && whiteGreenPool > 0
        ? Math.abs(counts.w - counts.g) / whiteGreenPool
        : 0;
    return roundNumber(
        (redDistance * 1.5)
        + (orangeDistance * 1.2)
        + (purpleDistance * 0.2)
        + (wgBalanceDistance * 0.15),
        6
    );
}

function buildFullCandidateRows(row = {}, limit = 8) {
    const observed = isPlainObject(row.observed_state) ? row.observed_state : {};
    const redResidualReview = row.red_residual_review || {};
    const diagnostics = isPlainObject(redResidualReview.constraint_diagnostics)
        ? redResidualReview.constraint_diagnostics
        : {};
    const total = asNonNegativeInteger(row.actual_counts && row.actual_counts.total_items)
        ?? asNonNegativeInteger(diagnostics.total_items)
        ?? asNonNegativeInteger(observed.r1_total_items);
    const blue = asNonNegativeInteger(observed.r1_blue_count) ?? asNonNegativeInteger(diagnostics.blue_count);
    const purple = asNonNegativeInteger(observed.r2_purple_count) ?? asNonNegativeInteger(diagnostics.purple_count);
    const whiteGreenPool = asNonNegativeInteger(diagnostics.inferred_white_green_count);
    const orangeRedPool = asNonNegativeInteger(diagnostics.orange_red_unknown_pool);
    if (
        total === null
        || blue === null
        || purple === null
        || whiteGreenPool === null
        || orangeRedPool === null
        || whiteGreenPool > 80
        || orangeRedPool > 80
        || blue + purple + whiteGreenPool + orangeRedPool !== total
    ) {
        return [];
    }
    const candidates = [];
    for (let w = 0; w <= whiteGreenPool; w += 1) {
        const g = whiteGreenPool - w;
        for (let o = 0; o <= orangeRedPool; o += 1) {
            const r = orangeRedPool - o;
            const counts = { w, g, b: blue, p: purple, o, r };
            candidates.push({
                counts,
                score: buildFullCandidateScore(counts, row)
            });
        }
    }
    candidates.sort((left, right) => (
        left.score - right.score
        || Math.abs(left.counts.w - left.counts.g) - Math.abs(right.counts.w - right.counts.g)
        || left.counts.r - right.counts.r
        || left.counts.w - right.counts.w
    ));
    return candidates.slice(0, limit).map((candidate, index) => ({
        ...candidate,
        rank: index + 1
    }));
}

function formatFullCandidateShortlistHtml(row = {}) {
    const candidates = buildFullCandidateRows(row, 8);
    if (!candidates.length) return "";
    const countAttrs = (counts) => QUALITY_ORDER
        .map((quality) => `data-${quality}="${escapeHtml(counts[quality])}"`)
        .join(" ");
    return `<details class="constraint-candidates full-candidates" open>
                <summary>Top 完整候选（模型排序，仅辅助）</summary>
                <table>
                    <thead><tr><th>#</th><th>w/g</th><th>b/p</th><th>o/r</th><th>score</th><th>操作</th></tr></thead>
                    <tbody>${candidates.map((candidate) => `<tr>
                        <td>${escapeHtml(candidate.rank)}</td>
                        <td>${escapeHtml(candidate.counts.w)}/${escapeHtml(candidate.counts.g)}</td>
                        <td>${escapeHtml(candidate.counts.b)}/${escapeHtml(candidate.counts.p)}</td>
                        <td>${escapeHtml(candidate.counts.o)}/${escapeHtml(candidate.counts.r)}</td>
                        <td>${escapeHtml(candidate.score)}</td>
                        <td><button type="button" class="secondary-button compact-button" data-apply-full-candidate ${countAttrs(candidate.counts)}>填完整</button></td>
                    </tr>`).join("")}</tbody>
                </table>
            </details>`;
}

function formatPairCandidateTableHtml({
    title,
    firstQuality,
    secondQuality,
    firstLabel,
    secondLabel,
    pool
} = {}) {
    if (pool === null || pool === undefined || pool > 80) return "";
    const rows = [];
    for (let first = 0; first <= pool; first += 1) {
        const second = pool - first;
        rows.push(`<tr>
                    <td>${escapeHtml(first)}</td>
                    <td>${escapeHtml(second)}</td>
                    <td><button type="button" class="secondary-button compact-button" data-apply-pair-candidate data-first-quality="${escapeHtml(firstQuality)}" data-second-quality="${escapeHtml(secondQuality)}" data-first-count="${escapeHtml(first)}" data-second-count="${escapeHtml(second)}">填 ${escapeHtml(first)}/${escapeHtml(second)}</button></td>
                </tr>`);
    }
    return `<details class="constraint-candidates" open>
                <summary>${escapeHtml(title)}</summary>
                <table>
                    <thead><tr><th>${escapeHtml(firstLabel)}</th><th>${escapeHtml(secondLabel)}</th><th>操作</th></tr></thead>
                    <tbody>${rows.join("")}</tbody>
                </table>
            </details>`;
}

function formatCountingAssistHtml(row = {}) {
    const observed = isPlainObject(row.observed_state) ? row.observed_state : {};
    const redResidualReview = row.red_residual_review || {};
    const diagnostics = isPlainObject(redResidualReview.constraint_diagnostics)
        ? redResidualReview.constraint_diagnostics
        : {};
    const firstField = normalizeText(redResidualReview.first_decisive_field)
        || normalizeStringList(redResidualReview.decisive_fields)[0]
        || "";
    const badges = [
        ["total", row.actual_counts && row.actual_counts.total_items !== undefined
            ? row.actual_counts.total_items
            : observed.r1_total_items],
        ["blue", observed.r1_blue_count],
        ["purple", observed.r2_purple_count],
        ["orange avg", observed.r2_orange_avg_text || observed.r2_orange_avg],
        ["white+green cells", observed.r2_white_green_cells],
        ["W/G inferred", diagnostics.inferred_white_green_count],
        ["O/R pool", diagnostics.orange_red_unknown_pool],
        ["priority field", firstField || "-"]
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");

    return `<div class="count-assist" data-count-assist>
                <div class="assist-title">计数辅助</div>
                <div class="assist-badges">
                    ${badges.map(([label, value]) => `<span>${escapeHtml(label)}: ${escapeHtml(formatMaybeNumber(value))}</span>`).join("")}
                </div>
                <ol>
                    <li>先确认 ${escapeHtml(firstField === "orange_count" ? "o（金色数量）" : (firstField || "缺失关键数量"))}。</li>
                    <li>再补齐 w/g/b/p/o/r，且总和必须等于 total。</li>
                    <li>截图和像素只做复核线索，下载前仍保持人工确认口径。</li>
                </ol>
                <p class="constraint-line" data-constraint-line${formatConstraintAttributes(row)}>等待输入后计算约束残差。</p>
                <div class="assist-actions">${formatKnownConstraintButtonHtml(row)}</div>
                ${formatFullCandidateShortlistHtml(row)}
                ${formatWhiteGreenCandidateTableHtml(row)}
                ${formatOrangeRedCandidateTableHtml(row)}
            </div>`;
}

function formatRedResidualHintHtml(redResidualReview = null) {
    if (!redResidualReview) return "";
    const fields = normalizeStringList(redResidualReview.decisive_fields);
    const model = isPlainObject(redResidualReview.current_model) ? redResidualReview.current_model : {};
    const diagnostics = isPlainObject(redResidualReview.constraint_diagnostics)
        ? redResidualReview.constraint_diagnostics
        : {};
    return `<div class="red-residual-hint">
                <div class="hint-title">红数残差复核</div>
                <div class="hint-badges">
                    <span>优先: ${escapeHtml(redResidualReview.first_decisive_field || fields[0] || "-")}</span>
                    <span>red mean: ${escapeHtml(model.red_count_mean ?? "-")}</span>
                    <span>O/R pool: ${escapeHtml(diagnostics.orange_red_unknown_pool ?? "-")}</span>
                </div>
                <p>${escapeHtml(redResidualReview.recommended_next_action || "补完整六品质实际数量后再进入 count-fit replay。")}</p>
                <p class="hint-fields">${escapeHtml(fields.join(", ") || "-")}</p>
            </div>`;
}

function formatConfirmationCardHtml(row = {}, index = 0) {
    const imageSrc = formatImageSrc(row.review_image_path);
    const counts = row.actual_counts || {};
    const initialSum = QUALITY_ORDER.reduce((sum, quality) => sum + (Number(counts[quality]) || 0), 0);
    const initialTotal = Number.isInteger(Number(counts.total_items)) ? Number(counts.total_items) : 0;
    const initialValid = initialSum === initialTotal;
    return `<article class="sample-card" data-template-index="${escapeHtml(row.templateIndex)}" data-sample-index="${escapeHtml(row.sampleIndex)}">
        <section class="image-panel">
            <div class="image-toolbar">
                <button type="button" class="secondary-button" data-zoom-fit>适宽</button>
                <button type="button" class="secondary-button" data-zoom-in>放大</button>
                <button type="button" class="secondary-button" data-zoom-out>缩小</button>
                <span data-zoom-label>100%</span>
            </div>
            ${imageSrc ? `<img data-review-image data-zoom="100" src="${escapeHtml(imageSrc)}" alt="review image ${escapeHtml(index + 1)}">` : "<p>No review image.</p>"}
        </section>
        <section class="control-panel">
            <div class="meta-row">
                <span>${escapeHtml(row.map_id || "unknown")}</span>
                <span>${escapeHtml(row.event_timestamp || "-")}</span>
                <span>priority: ${escapeHtml(row.review_priority || "-")}</span>
                <span>${escapeHtml(row.source_task_id || "-")}</span>
            </div>
            <p class="reason-line">${escapeHtml((row.review_reasons || []).join(", ") || "-")}</p>
            ${formatRedResidualHintHtml(row.red_residual_review)}
            ${formatCountingAssistHtml(row)}
            <div class="count-grid">
                ${formatCountInputs(row)}
                <div class="count-field total-field total-control">
                    <label>
                        <span>total</span>
                        <input type="number" min="0" step="1" data-total-items readonly data-total-locked="true" value="${escapeHtml(row.actual_counts && row.actual_counts.total_items !== undefined ? row.actual_counts.total_items : 0)}">
                    </label>
                    <button type="button" class="secondary-button" data-unlock-total data-total-lock-state="locked">解锁 total</button>
                </div>
            </div>
            <div class="action-row">
                <label class="approve-toggle">
                    <input type="checkbox" data-approve>
                    <span>approved_count_fit_sample</span>
                </label>
                <button type="button" data-download>下载全部确认 JSON</button>
            </div>
            <p class="validation-line" data-validation data-valid="${escapeHtml(initialValid ? "true" : "false")}">sum: ${escapeHtml(initialSum)} / total: ${escapeHtml(initialTotal)} ${escapeHtml(initialValid ? "ok" : "mismatch")}</p>
            <p class="status-line" data-status>status: ${escapeHtml(row.status || "-")}</p>
        </section>
    </article>`;
}

function formatCodexVisualManualConfirmationResultsHtml(results = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const rows = flattenConfirmationSamples(results);
    const cardHtml = rows.length
        ? rows.map(formatConfirmationCardHtml).join("\n")
        : "<p>No manual confirmation drafts.</p>";
    const defaultDownloadName = path.basename(outputPath);
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>Codex Visual Manual Confirmation</title>
    <style>
        :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body { margin: 0; background: #f6f7f9; color: #1f2328; }
        main { max-width: 1440px; margin: 0 auto; padding: 18px; box-sizing: border-box; }
        h1, p { margin: 0; }
        .page-header { display: grid; gap: 8px; margin-bottom: 14px; }
        .summary { display: flex; flex-wrap: wrap; gap: 8px; }
        .summary span { border: 1px solid #d0d7de; background: #fff; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
        .global-summary { position: sticky; top: 0; z-index: 2; background: #f6f7f9; border-bottom: 1px solid #d0d7de; padding: 8px 0; }
        .global-summary span[data-global-status="ready"] { border-color: #1a7f37; color: #1a7f37; }
        .global-summary span[data-global-status="blocked"] { border-color: #cf222e; color: #cf222e; }
        .sample-card { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.6fr); gap: 12px; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px; }
        .image-panel { position: relative; background: #0d1117; border-radius: 6px; overflow: auto; min-height: 320px; }
        .image-toolbar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; background: rgba(13, 17, 23, 0.92); border-bottom: 1px solid rgba(208, 215, 222, 0.24); }
        .image-toolbar span { color: #f6f8fa; font-size: 12px; font-weight: 700; }
        .image-panel img { display: block; width: 100%; height: auto; max-height: 82vh; object-fit: contain; }
        .image-panel img[data-zoomed="true"] { max-height: none; max-width: none; }
        .control-panel { display: grid; align-content: start; gap: 12px; }
        .meta-row, .action-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .meta-row span { background: #f6f8fa; border: 1px solid #d8dee4; border-radius: 6px; padding: 6px 8px; font-size: 13px; }
        .reason-line { font-size: 12px; color: #9a3412; font-weight: 700; overflow-wrap: anywhere; }
        .red-residual-hint { display: grid; gap: 6px; border: 1px solid #f59e0b; background: #fffbeb; border-radius: 8px; padding: 10px; }
        .hint-title { font-size: 13px; font-weight: 800; color: #92400e; }
        .hint-badges { display: flex; flex-wrap: wrap; gap: 6px; }
        .hint-badges span { border: 1px solid #fbbf24; background: #fff7ed; border-radius: 6px; color: #92400e; font-size: 12px; font-weight: 700; padding: 5px 7px; }
        .hint-fields { color: #92400e; font-size: 12px; overflow-wrap: anywhere; }
        .count-assist { display: grid; gap: 8px; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 8px; padding: 10px; }
        .assist-title { font-size: 13px; font-weight: 800; color: #1e3a8a; }
        .assist-badges { display: flex; flex-wrap: wrap; gap: 6px; }
        .assist-badges span { border: 1px solid #93c5fd; background: #fff; border-radius: 6px; color: #1e40af; font-size: 12px; font-weight: 700; padding: 5px 7px; }
        .count-assist ol { margin: 0; padding-left: 18px; color: #1e3a8a; font-size: 12px; line-height: 1.45; }
        .constraint-line { color: #1d4ed8; font-size: 12px; font-weight: 700; line-height: 1.45; }
        .assist-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .constraint-candidates { border: 1px solid #bfdbfe; border-radius: 6px; background: rgba(255, 255, 255, 0.72); padding: 6px; }
        .constraint-candidates summary { cursor: pointer; color: #1e40af; font-size: 12px; font-weight: 800; }
        .constraint-candidates table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
        .constraint-candidates th, .constraint-candidates td { border-top: 1px solid #dbeafe; padding: 5px 6px; text-align: left; }
        .compact-button { padding: 4px 7px; font-size: 12px; }
        .count-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .count-field { display: grid; gap: 4px; font-size: 12px; color: #57606a; }
        .count-field label { display: grid; gap: 4px; }
        .count-field input { width: 100%; box-sizing: border-box; border: 1px solid #d0d7de; border-radius: 6px; padding: 8px; font-size: 16px; color: #1f2328; background: #fff; }
        .count-field input[readonly] { background: #f6f8fa; color: #57606a; cursor: not-allowed; }
        .total-field { grid-column: 1 / -1; }
        .total-control { grid-template-columns: minmax(0, 1fr) auto; align-items: end; }
        .approve-toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
        button { border: 1px solid #1f6feb; border-radius: 6px; background: #1f6feb; color: #fff; padding: 8px 12px; font-size: 13px; cursor: pointer; }
        .secondary-button { border-color: #d0d7de; background: #fff; color: #1f2328; }
        .status-line, .validation-line { font-size: 12px; color: #57606a; }
        .validation-line[data-valid="true"] { color: #1a7f37; }
        .validation-line[data-valid="false"] { color: #cf222e; }
        @media (max-width: 920px) {
            main { padding: 10px; }
            .sample-card { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
<main>
    <header class="page-header">
        <h1>Codex Visual Manual Confirmation</h1>
	        <div class="summary">
	            <span>draft samples: ${escapeHtml(rows.length)}</span>
	            <span>priorities: ${escapeHtml(formatPriorityCounts(results.summary ? results.summary.priority_counts : {}))}</span>
	            <span>filter: ${escapeHtml(results.summary && Array.isArray(results.summary.priority_filter) ? results.summary.priority_filter.join(", ") || "all" : "all")}</span>
	            <span>schema: ${escapeHtml(results.schema_version || "-")}</span>
	            <span>generated: ${escapeHtml(results.generated_at || "-")}</span>
	        </div>
	        <div class="summary global-summary" data-global-summary>
	            <span>valid: <b data-global-valid>0</b> / ${escapeHtml(rows.length)}</span>
	            <span>approved: <b data-global-approved>0</b> / ${escapeHtml(rows.length)}</span>
	            <span>import-ready: <b data-global-ready>0</b> / ${escapeHtml(rows.length)}</span>
	            <span data-global-status="blocked">remaining: <b data-global-pending>${escapeHtml(rows.length)}</b></span>
	        </div>
	    </header>
    ${cardHtml}
</main>
<script>
const BASE_RESULTS = ${escapeScriptJson(results)};
const DEFAULT_DOWNLOAD_NAME = ${JSON.stringify(defaultDownloadName)};

function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function readInteger(input) {
    const value = Number(input.value);
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

function readQualitySum(card) {
    return Array.from(card.querySelectorAll("[data-quality]"))
        .reduce((sum, input) => sum + readInteger(input), 0);
}

function readTotalItems(card) {
    const totalInput = card.querySelector("[data-total-items]");
    return totalInput ? readInteger(totalInput) : 0;
}

function readQualityValue(card, quality) {
    const input = card.querySelector('[data-quality="' + quality + '"]');
    return input ? readInteger(input) : 0;
}

function readDatasetNumber(node, key) {
    if (!node || node.dataset[key] === undefined || node.dataset[key] === "") return null;
    const value = Number(node.dataset[key]);
    return Number.isFinite(value) ? value : null;
}

function isTotalLocked(card) {
    const totalInput = card.querySelector("[data-total-items]");
    return totalInput ? totalInput.readOnly === true : true;
}

function setTotalLockState(card, locked) {
    const totalInput = card.querySelector("[data-total-items]");
    const button = card.querySelector("[data-unlock-total]");
    if (totalInput) {
        totalInput.readOnly = locked;
        totalInput.dataset.totalLocked = locked ? "true" : "false";
    }
    if (button) {
        button.dataset.totalLockState = locked ? "locked" : "unlocked";
        button.textContent = locked ? "解锁 total" : "锁定 total";
    }
}

function toggleTotalLock(button) {
    const card = button.closest(".sample-card");
    if (!card) return;
    setTotalLockState(card, !isTotalLocked(card));
    updateCardStatus(card);
    updateGlobalSummary();
}

function setImageZoom(panel, zoom) {
    const image = panel ? panel.querySelector("[data-review-image]") : null;
    const label = panel ? panel.querySelector("[data-zoom-label]") : null;
    if (!image) return;
    const nextZoom = Math.max(75, Math.min(250, Number(zoom) || 100));
    image.dataset.zoom = String(nextZoom);
    image.dataset.zoomed = nextZoom === 100 ? "false" : "true";
    image.style.width = nextZoom + "%";
    if (label) label.textContent = nextZoom + "%";
}

function updateConstraintLine(card) {
    const line = card.querySelector("[data-constraint-line]");
    if (!line) return;
    const expectedBlue = readDatasetNumber(line, "expectedBlue");
    const expectedPurple = readDatasetNumber(line, "expectedPurple");
    const expectedWhiteGreen = readDatasetNumber(line, "expectedWhiteGreen");
    const orangeRedPool = readDatasetNumber(line, "orangeRedPool");
    const messages = [];
    if (expectedBlue !== null) {
        messages.push("b=" + expectedBlue + " / 当前 " + readQualityValue(card, "b"));
    }
    if (expectedPurple !== null) {
        messages.push("p=" + expectedPurple + " / 当前 " + readQualityValue(card, "p"));
    }
    if (expectedWhiteGreen !== null) {
        messages.push("w+g=" + expectedWhiteGreen + " / 当前 " + (readQualityValue(card, "w") + readQualityValue(card, "g")));
    }
    if (orangeRedPool !== null) {
        const orangeCount = readQualityValue(card, "o");
        messages.push("r=O/R pool-o=" + (orangeRedPool - orangeCount) + " / 当前 " + readQualityValue(card, "r"));
    }
    line.textContent = messages.length ? messages.join(" | ") : "无可用约束。";
}

function applyPairCandidate(button) {
    const card = button.closest(".sample-card");
    if (!card) return;
    const firstInput = card.querySelector('[data-quality="' + button.dataset.firstQuality + '"]');
    const secondInput = card.querySelector('[data-quality="' + button.dataset.secondQuality + '"]');
    if (firstInput) firstInput.value = button.dataset.firstCount || "0";
    if (secondInput) secondInput.value = button.dataset.secondCount || "0";
    updateCardStatus(card);
    updateGlobalSummary();
}

function applyKnownConstraints(button) {
    const card = button.closest(".sample-card");
    if (!card) return;
    const blueInput = card.querySelector('[data-quality="b"]');
    const purpleInput = card.querySelector('[data-quality="p"]');
    if (blueInput && button.dataset.blue !== undefined) blueInput.value = button.dataset.blue;
    if (purpleInput && button.dataset.purple !== undefined) purpleInput.value = button.dataset.purple;
    updateCardStatus(card);
    updateGlobalSummary();
}

function applyFullCandidate(button) {
    const card = button.closest(".sample-card");
    if (!card) return;
    ["w", "g", "b", "p", "o", "r"].forEach((quality) => {
        const input = card.querySelector('[data-quality="' + quality + '"]');
        if (input && button.dataset[quality] !== undefined) input.value = button.dataset[quality];
    });
    updateCardStatus(card);
    updateGlobalSummary();
}

function updateCardValidation(card) {
    const qualitySum = readQualitySum(card);
    const totalItems = readTotalItems(card);
    const valid = qualitySum === totalItems;
    const validation = card.querySelector("[data-validation]");
    if (validation) {
        validation.dataset.valid = valid ? "true" : "false";
        validation.textContent = "sum: " + qualitySum + " / total: " + totalItems + " " + (valid ? "ok" : "mismatch");
    }
    return { qualitySum, totalItems, valid };
}

function updateCardStatus(card) {
    const approve = card.querySelector("[data-approve]").checked;
    const validation = updateCardValidation(card);
    updateConstraintLine(card);
    const status = approve && validation.valid
        ? "approved_count_fit_sample"
        : (approve ? "needs_human_confirmation (count_sum_mismatch_kept_unapproved)" : "needs_human_confirmation");
    card.querySelector("[data-status]").textContent = "status: " + status;
    return validation;
}

function computePageConfirmationSummary(cards) {
    let validCount = 0;
    let approvedCount = 0;
    let readyCount = 0;
    cards.forEach((card) => {
        const validation = updateCardValidation(card);
        const approved = card.querySelector("[data-approve]").checked;
        if (validation.valid) validCount += 1;
        if (approved) approvedCount += 1;
        if (approved && validation.valid) readyCount += 1;
    });
    const pendingCount = Math.max(0, cards.length - readyCount);
    return {
        sampleCount: cards.length,
        validCount,
        approvedCount,
        readyCount,
        pendingCount
    };
}

function updateGlobalSummary() {
    const cards = Array.from(document.querySelectorAll(".sample-card"));
    const summary = document.querySelector("[data-global-summary]");
    if (!summary) return;
    const confirmationSummary = computePageConfirmationSummary(cards);
    const setText = (selector, value) => {
        const node = summary.querySelector(selector);
        if (node) node.textContent = String(value);
    };
    setText("[data-global-valid]", confirmationSummary.validCount);
    setText("[data-global-approved]", confirmationSummary.approvedCount);
    setText("[data-global-ready]", confirmationSummary.readyCount);
    setText("[data-global-pending]", confirmationSummary.pendingCount);
    const statusNode = summary.querySelector("[data-global-status]");
    if (statusNode) {
        statusNode.dataset.globalStatus = confirmationSummary.pendingCount === 0 ? "ready" : "blocked";
    }
}

function applyCardToResults(next, card, approve) {
    const templateIndex = Number(card.dataset.templateIndex);
    const sampleIndex = Number(card.dataset.sampleIndex);
    const sample = next.fresh_capture_templates[templateIndex].samples[sampleIndex];
    const validation = updateCardValidation(card);
    sample.actual_counts = sample.actual_counts || {};
    card.querySelectorAll("[data-quality]").forEach((input) => {
        sample.actual_counts[input.dataset.quality] = readInteger(input);
    });
    const totalInput = card.querySelector("[data-total-items]");
    if (totalInput) sample.actual_counts.total_items = readInteger(totalInput);
    sample.actual_counts_source = "manual_review";
    sample.pixel_training_label_allowed = false;
    sample.status = approve && validation.valid ? "approved_count_fit_sample" : "needs_human_confirmation";
    sample.metadata = sample.metadata || {};
    sample.metadata.manual_count_validation = {
        quality_sum: validation.qualitySum,
        total_items: validation.totalItems,
        total_items_locked: totalInput ? totalInput.readOnly === true : null,
        warning: totalInput && !totalInput.readOnly ? "total_items_manually_unlocked" : null,
        valid: validation.valid,
        blocker: validation.valid ? null : "actual_counts_total_mismatch"
    };
}

function applyAllCardsToResults() {
    const next = cloneValue(BASE_RESULTS);
    const cards = Array.from(document.querySelectorAll(".sample-card"));
    cards.forEach((card) => {
        const approve = card.querySelector("[data-approve]").checked;
        applyCardToResults(next, card, approve);
    });
    const confirmationSummary = computePageConfirmationSummary(cards);
    next.summary = next.summary || {};
    next.summary.manual_confirmation_valid_count = confirmationSummary.validCount;
    next.summary.manual_confirmation_approved_count = confirmationSummary.approvedCount;
    next.summary.manual_confirmation_import_ready_count = confirmationSummary.readyCount;
    next.summary.manual_confirmation_remaining_count = confirmationSummary.pendingCount;
    next.summary.import_ready_without_human_action = (
        confirmationSummary.sampleCount > 0
        && confirmationSummary.pendingCount === 0
    );
    next.metadata = next.metadata || {};
    next.metadata.manual_confirmation_download = {
        downloaded_at: new Date().toISOString(),
        sample_count: confirmationSummary.sampleCount,
        valid_count: confirmationSummary.validCount,
        approved_count: confirmationSummary.approvedCount,
        import_ready_count: confirmationSummary.readyCount,
        remaining_count: confirmationSummary.pendingCount
    };
    return next;
}

function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

document.querySelectorAll("[data-approve]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
        const card = checkbox.closest(".sample-card");
        updateCardStatus(card);
        updateGlobalSummary();
    });
});

document.querySelectorAll("[data-quality], [data-total-items]").forEach((input) => {
    input.addEventListener("input", () => {
        const card = input.closest(".sample-card");
        updateCardStatus(card);
        updateGlobalSummary();
    });
});

document.querySelectorAll("[data-unlock-total]").forEach((button) => {
    button.addEventListener("click", () => toggleTotalLock(button));
});

document.querySelectorAll("[data-zoom-fit], [data-zoom-in], [data-zoom-out]").forEach((button) => {
    button.addEventListener("click", () => {
        const panel = button.closest(".image-panel");
        const image = panel ? panel.querySelector("[data-review-image]") : null;
        const currentZoom = image ? Number(image.dataset.zoom || 100) : 100;
        if (button.hasAttribute("data-zoom-fit")) {
            setImageZoom(panel, 100);
        } else if (button.hasAttribute("data-zoom-in")) {
            setImageZoom(panel, currentZoom + 25);
        } else {
            setImageZoom(panel, currentZoom - 25);
        }
    });
});

document.querySelectorAll("[data-apply-pair-candidate]").forEach((button) => {
    button.addEventListener("click", () => applyPairCandidate(button));
});

document.querySelectorAll("[data-apply-known-constraints]").forEach((button) => {
    button.addEventListener("click", () => applyKnownConstraints(button));
});

document.querySelectorAll("[data-apply-full-candidate]").forEach((button) => {
    button.addEventListener("click", () => applyFullCandidate(button));
});

document.querySelectorAll(".sample-card").forEach((card) => {
    setTotalLockState(card, true);
    updateCardStatus(card);
});
updateGlobalSummary();

document.querySelectorAll("[data-download]").forEach((button) => {
    button.addEventListener("click", () => {
        const card = button.closest(".sample-card");
        const next = applyAllCardsToResults();
        downloadJson(DEFAULT_DOWNLOAD_NAME, next);
    });
});
</script>
</body>
</html>
`;
}

function main(argv = process.argv.slice(2)) {
    const { visualResultsPath, outputPath, generatedAt, force, priorityFilter, redResidualReviewPackPath } = resolveArgs(argv);
    if (fs.existsSync(outputPath) && !force) {
        throw new Error(`manual confirmation results already exists: ${outputPath}; use --force to overwrite`);
    }
    const visualResults = readJson(visualResultsPath);
    const redResidualReviewPack = redResidualReviewPackPath ? readJson(redResidualReviewPackPath) : null;
    const results = buildCodexVisualManualConfirmationResults({
        visualResults,
        generatedAt,
        paths: { visualResultsPath, redResidualReviewPackPath },
        priorityFilter,
        redResidualReviewPack
    });
    writeJson(outputPath, results);
    writeText(outputPath.replace(/\.json$/i, ".md"), formatCodexVisualManualConfirmationResultsMarkdown(results, outputPath));
    writeText(outputPath.replace(/\.json$/i, ".html"), formatCodexVisualManualConfirmationResultsHtml(results, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return results;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_RED_RESIDUAL_REVIEW_PACK_PATH,
    DEFAULT_VISUAL_RESULTS_PATH,
    buildRedResidualReviewIndex,
    buildCodexVisualManualConfirmationResults,
    buildManualEntryActualCounts,
    buildManualEntrySample,
    buildManualConfirmationSample,
    formatCodexVisualManualConfirmationResultsHtml,
    formatCodexVisualManualConfirmationResultsMarkdown,
    main,
    resolveArgs
};
