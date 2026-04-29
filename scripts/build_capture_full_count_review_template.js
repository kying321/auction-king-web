const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-capture-full-count-review-template.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const REQUIRED_FIELDS = [
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
    "fill_actual_counts_by_human_review_only",
    "do_not_copy_pixel_or_system_hint_into_actual_counts",
    "keep_actual_counts_source_manual_review",
    "record_explicit_event_timestamp",
    "same_battle_multiple_screenshots_should_share_one_sample"
];

function resolveArgs(argv = process.argv.slice(2)) {
    const capturePackagePaths = [];
    let outputPath = DEFAULT_OUTPUT_PATH;
    let generatedAt = new Date().toISOString();
    let reviewImagePath = null;
    let reviewImageMapPath = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--output") {
            index += 1;
            if (!argv[index]) throw new Error("--output 需要提供输出路径");
            outputPath = path.resolve(argv[index]);
        } else if (arg.startsWith("--output=")) {
            outputPath = path.resolve(arg.slice("--output=".length));
        } else if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else if (arg === "--review-image") {
            index += 1;
            if (!argv[index]) throw new Error("--review-image 需要提供图片路径");
            reviewImagePath = path.resolve(argv[index]);
        } else if (arg.startsWith("--review-image=")) {
            reviewImagePath = path.resolve(arg.slice("--review-image=".length));
        } else if (arg === "--review-image-map") {
            index += 1;
            if (!argv[index]) throw new Error("--review-image-map 需要提供 JSON 路径");
            reviewImageMapPath = path.resolve(argv[index]);
        } else if (arg.startsWith("--review-image-map=")) {
            reviewImageMapPath = path.resolve(arg.slice("--review-image-map=".length));
        } else {
            capturePackagePaths.push(path.resolve(arg));
        }
    }

    return {
        capturePackagePaths,
        outputPath,
        generatedAt,
        reviewImagePath,
        reviewImageMapPath
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (isPlainObject(value)) {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableJson(value[key])}`
        )).join(",")}}`;
    }
    return JSON.stringify(value);
}

function stableIdPart(value, fallback = "capture") {
    const normalized = String(value || "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized || fallback;
}

function normalizeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeInteger(value) {
    const numeric = normalizeNumber(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function buildEmptyActualCounts() {
    const counts = {};
    QUALITY_ORDER.forEach((quality) => {
        counts[quality] = null;
    });
    counts.total_items = null;
    return counts;
}

function readCapturePackage(inputPath) {
    const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    return {
        input_path: inputPath,
        payload
    };
}

function readReviewImageMap(inputPath) {
    if (!inputPath) return {};
    const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    if (!isPlainObject(parsed)) return {};
    const baseDir = path.dirname(inputPath);
    return Object.fromEntries(Object.entries(parsed)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => [
            key,
            path.isAbsolute(value) ? value : path.resolve(baseDir, value)
        ]));
}

function reviewImageManifestPath(reviewImagePath) {
    if (!reviewImagePath) return null;
    return String(reviewImagePath).replace(/\.[^.]+$/, ".json");
}

function readReviewImageManifestSummary(reviewImagePath) {
    const manifestPath = reviewImageManifestPath(reviewImagePath);
    if (!manifestPath || !fs.existsSync(manifestPath)) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const widthNormalization = isPlainObject(manifest.width_normalization)
        ? cloneValue(manifest.width_normalization)
        : {};
    const qualityFlags = Array.isArray(widthNormalization.quality_flags)
        ? widthNormalization.quality_flags.filter(Boolean).map(String)
        : [];
    return {
        manifest_path: manifestPath,
        schema_version: manifest.schema_version || null,
        output_image: isPlainObject(manifest.output_image) ? cloneValue(manifest.output_image) : null,
        width_normalization: widthNormalization,
        quality_flags: qualityFlags,
        matches: Array.isArray(manifest.matches) ? cloneValue(manifest.matches) : []
    };
}

function extractObservedState(payload = {}) {
    if (isPlainObject(payload.observed_state)) return cloneValue(payload.observed_state);
    if (isPlainObject(payload.settlement_sample?.observed_state)) {
        return cloneValue(payload.settlement_sample.observed_state);
    }
    if (isPlainObject(payload.field_values)) return cloneValue(payload.field_values);
    return {};
}

function expectedTotalItems(payload = {}, observedState = {}) {
    return normalizeInteger(
        observedState.r1_total_items
        ?? observedState.total_items
        ?? payload.field_values?.r1_total_items
        ?? payload.field_values?.total_items
    );
}

function normalizeStringList(value) {
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

function firstFiniteNumber(...values) {
    for (const value of values) {
        const numeric = normalizeNumber(value);
        if (Number.isFinite(numeric)) return numeric;
    }
    return null;
}

function pushUnique(target, value) {
    if (!value || target.includes(value)) return;
    target.push(value);
}

function extractCaptureReviewReasons(capture = {}) {
    const payload = capture.payload || {};
    const observedState = extractObservedState(payload);
    const fields = isPlainObject(payload.field_values) ? payload.field_values : {};
    const reasons = [];

    const orangeCount = firstFiniteNumber(fields.orange_count, fields.r2_orange_count, observedState.r2_orange_count, observedState.orange_count);
    const orangeAvg = firstFiniteNumber(fields.orange_avg_cells, fields.r2_orange_avg, observedState.r2_orange_avg, observedState.orange_avg_cells);

    if (!Number.isFinite(orangeCount) && Number.isFinite(orangeAvg) && orangeAvg >= 8) {
        pushUnique(reasons, "extreme_orange_avg_needs_orange_count_confirmation");
    }
    return reasons;
}

function resolveReviewPriority(reasons = []) {
    if (
        reasons.includes("red_residual_sensitive_to_missing_orange_count")
        || reasons.includes("model_predicted_red_count_extreme")
        || reasons.includes("model_predicted_red_cells_extreme")
    ) {
        return "P0";
    }
    if (
        reasons.includes("model_predicted_red_count_elevated")
        || reasons.includes("model_predicted_red_cells_elevated")
        || reasons.includes("extreme_orange_avg_needs_orange_count_confirmation")
    ) {
        return "P1";
    }
    return "P2";
}

function buildCaptureReviewPriority(group = []) {
    const reasons = [];
    group.forEach((capture) => {
        extractCaptureReviewReasons(capture).forEach((reason) => pushUnique(reasons, reason));
    });
    return {
        review_priority: resolveReviewPriority(reasons),
        review_reasons: reasons
    };
}

function reviewPriorityRank(priority) {
    return { P0: 0, P1: 1, P2: 2 }[priority] ?? 9;
}

function summarizeScreenshotAttachment(payload = {}) {
    const attachment = payload.screenshot_attachment
        || payload.settlement_sample?.metadata?.screenshot_attachment
        || null;
    if (!attachment) {
        return {
            present: false,
            name: null,
            type: null,
            has_data_url: false
        };
    }
    return {
        present: true,
        name: attachment.name || null,
        type: attachment.type || attachment.mime_type || null,
        has_data_url: Boolean(attachment.data_url)
    };
}

function captureGroupKey(capture = {}) {
    const payload = capture.payload || {};
    const observedState = extractObservedState(payload);
    return stableJson({
        map_id: payload.map_id || null,
        template_id: payload.template_id || null,
        observed_state: observedState
    });
}

function sortByExportedAt(left, right) {
    return String(left.payload?.exported_at || "").localeCompare(String(right.payload?.exported_at || ""));
}

function timestampMs(capture = {}) {
    const raw = capture.payload && capture.payload.exported_at;
    if (!raw) return null;
    const value = Date.parse(String(raw));
    return Number.isFinite(value) ? value : null;
}

function groupCapturePackages(capturePackages = [], options = {}) {
    const maxGapMs = Number(options.maxGapMs);
    if (Number.isFinite(maxGapMs) && maxGapMs > 0) {
        const groups = [];
        const sorted = capturePackages.slice().sort(sortByExportedAt);
        let currentGroup = [];
        let currentKey = null;
        let previousTimestamp = null;

        sorted.forEach((capture) => {
            const key = captureGroupKey(capture);
            const currentTimestamp = timestampMs(capture);
            const gapMs = currentTimestamp !== null && previousTimestamp !== null
                ? currentTimestamp - previousTimestamp
                : 0;
            const startsNewGroup = !currentGroup.length || key !== currentKey || gapMs > maxGapMs;
            if (startsNewGroup) {
                if (currentGroup.length) groups.push(currentGroup.slice());
                currentGroup = [capture];
                currentKey = key;
            } else {
                currentGroup.push(capture);
            }
            previousTimestamp = currentTimestamp;
        });
        if (currentGroup.length) groups.push(currentGroup.slice());
        return groups;
    }

    const groupsByKey = new Map();
    capturePackages.forEach((capture) => {
        const key = captureGroupKey(capture);
        if (!groupsByKey.has(key)) groupsByKey.set(key, []);
        groupsByKey.get(key).push(capture);
    });
    return Array.from(groupsByKey.values()).map((group) => group.slice().sort(sortByExportedAt));
}

function buildCapturePackageSummary(capture = {}) {
    const payload = capture.payload || {};
    return {
        input_path: capture.input_path || null,
        basename: capture.input_path ? path.basename(capture.input_path) : null,
        schema_version: payload.schema_version || null,
        export_kind: payload.export_kind || null,
        exported_at: payload.exported_at || null,
        map_id: payload.map_id || null,
        template_id: payload.template_id || null,
        template_label: payload.template_label || null,
        config_source_version: payload.config_source_version || null,
        screenshot_attachment: summarizeScreenshotAttachment(payload)
    };
}

function resolveReviewImagePathForGroup({
    group = [],
    index = 0,
    sourceTaskId = null,
    mapId = null,
    eventTimestamp = null,
    reviewImagePath = null,
    reviewImageByGroup = {}
} = {}) {
    const first = group[0] || {};
    const keys = [
        sourceTaskId,
        mapId && eventTimestamp ? `${mapId}:${eventTimestamp}` : null,
        eventTimestamp,
        captureGroupKey(first),
        `group_${index + 1}`
    ].filter(Boolean);
    for (const key of keys) {
        if (reviewImageByGroup[key]) return reviewImageByGroup[key];
    }
    return reviewImagePath || null;
}

function buildFreshCaptureTemplate(group = [], index = 0, {
    reviewImagePath = null,
    reviewImageByGroup = {}
} = {}) {
    const first = group[0] || {};
    const payload = first.payload || {};
    const observedState = extractObservedState(payload);
    const eventTimestamp = payload.exported_at || null;
    const mapId = payload.map_id || null;
    const sourceTaskId = [
        "capture_full_count",
        stableIdPart(mapId || "unknown_map"),
        stableIdPart(eventTimestamp, `group_${index + 1}`)
    ].join("_");
    const resolvedReviewImagePath = resolveReviewImagePathForGroup({
        group,
        index,
        sourceTaskId,
        mapId,
        eventTimestamp,
        reviewImagePath,
        reviewImageByGroup
    });
    const reviewImageManifest = readReviewImageManifestSummary(resolvedReviewImagePath);
    const reviewImageQualityFlags = reviewImageManifest ? reviewImageManifest.quality_flags : [];
    const guardrails = reviewImageQualityFlags.length
        ? GUARDRAILS.concat(["review_image_quality_flags_require_recapture_or_single_image_manual_review"])
        : GUARDRAILS.slice();
    const packageSummaries = group.map(buildCapturePackageSummary);
    const expectedTotal = expectedTotalItems(payload, observedState);
    const reviewPriority = buildCaptureReviewPriority(group);

    return {
        source_task_id: sourceTaskId,
        source_task_type: "capture_clipboard_full_count_review",
        status: "needs_manual_full_count_review",
        output_target: "count_fit_same_battle_sample",
        review_priority: reviewPriority.review_priority,
        review_reasons: reviewPriority.review_reasons,
        map_id: mapId,
        template_id: payload.template_id || null,
        template_label: payload.template_label || null,
        config_source_version: payload.config_source_version || null,
        event_timestamp: eventTimestamp,
        review_image_path: resolvedReviewImagePath,
        review_image_manifest: reviewImageManifest,
        review_image_quality_flags: reviewImageQualityFlags,
        capture_packages: packageSummaries,
        required_fields: REQUIRED_FIELDS.slice(),
        pixel_training_label_allowed: false,
        guardrails,
        samples: [
            {
                source_task_id: sourceTaskId,
                source_task_type: "capture_clipboard_full_count_review",
                status: "needs_manual_input",
                output_target: "count_fit_same_battle_sample",
                review_priority: reviewPriority.review_priority,
                review_reasons: reviewPriority.review_reasons,
                map_id: mapId,
                map_variant_id: payload.map_variant_id || payload.submap_id || null,
                map_variant_label: payload.map_variant_label || payload.submap_label || null,
                event_timestamp: eventTimestamp,
                observed_state: observedState,
                actual_counts: buildEmptyActualCounts(),
                actual_counts_source: "manual_review",
                reviewer_notes: "",
                review_image_quality_override: "",
                pixel_training_label_allowed: false,
                guardrails,
                metadata: {
                    capture_review: {
                        source_task_id: sourceTaskId,
                        review_priority: reviewPriority.review_priority,
                        review_reasons: reviewPriority.review_reasons,
                        capture_package_count: group.length,
                        capture_package_paths: packageSummaries.map((entry) => entry.input_path),
                        review_image_path: resolvedReviewImagePath,
                        review_image_manifest_path: reviewImageManifest ? reviewImageManifest.manifest_path : null,
                        review_image_quality_flags: reviewImageQualityFlags,
                        review_image_width_normalization: reviewImageManifest ? reviewImageManifest.width_normalization : null,
                        expected_total_items: expectedTotal,
                        screenshot_attachment_count: packageSummaries.filter((entry) => (
                            entry.screenshot_attachment && entry.screenshot_attachment.present
                        )).length
                    }
                }
            }
        ]
    };
}

function incrementCount(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function summarizeTemplate({ capturePackages = [], freshCaptureTemplates = [] } = {}) {
    const mapCounts = {};
    const priorityCounts = {};
    freshCaptureTemplates.forEach((entry) => incrementCount(mapCounts, entry.map_id || "unknown"));
    freshCaptureTemplates.forEach((entry) => incrementCount(priorityCounts, entry.review_priority || "unknown"));
    return {
        capture_package_count: capturePackages.length,
        capture_group_count: freshCaptureTemplates.length,
        fresh_capture_template_count: freshCaptureTemplates.length,
        existing_candidate_review_count: 0,
        review_image_bound_group_count: freshCaptureTemplates.filter((entry) => entry.review_image_path).length,
        review_image_quality_flagged_group_count: freshCaptureTemplates.filter((entry) => (
            Array.isArray(entry.review_image_quality_flags) && entry.review_image_quality_flags.length
        )).length,
        pixel_training_label_allowed_count: 0,
        map_counts: mapCounts,
        review_priority_counts: priorityCounts,
        screenshot_attachment_count: capturePackages.filter((entry) => (
            summarizeScreenshotAttachment(entry.payload).present
        )).length
    };
}

function buildCaptureFullCountReviewTemplate({
    capturePackages = [],
    generatedAt = new Date().toISOString(),
    paths = {},
    reviewImagePath = null,
    reviewImageByGroup = {},
    groupMaxGapMs = null
} = {}) {
    const groups = groupCapturePackages(capturePackages, { maxGapMs: groupMaxGapMs });
    const freshCaptureTemplates = groups.map((group, index) => (
        buildFreshCaptureTemplate(group, index, { reviewImagePath, reviewImageByGroup })
    )).sort((left, right) => (
        reviewPriorityRank(left.review_priority) - reviewPriorityRank(right.review_priority)
        || String(left.event_timestamp || "").localeCompare(String(right.event_timestamp || ""))
    ));
    return {
        schema_version: "ak_count_fit_sample_review_template_v1",
        template_kind: "ak_capture_full_count_review_template_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            capture_package_paths: (paths.capturePackagePaths || []).slice(),
            review_image_path: reviewImagePath || null,
            review_image_map_path: paths.reviewImageMapPath || null,
            group_max_gap_ms: Number.isFinite(Number(groupMaxGapMs)) && Number(groupMaxGapMs) > 0
                ? Number(groupMaxGapMs)
                : null
        },
        notes: [
            "Fill full six-quality actual_counts from human review only.",
            "Multiple screenshots from one capture group can be stitched before manual review.",
            "System/OCR/pixel hints are context, not actual_counts labels.",
            "Set sample status to approved_count_fit_sample only after w/g/b/p/o/r sum matches total_items."
        ],
        summary: summarizeTemplate({ capturePackages, freshCaptureTemplates }),
        review_results: [],
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

function formatCaptureFullCountReviewTemplateMarkdown(template, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = template.summary || {};
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = (template.fresh_capture_templates || []).map((entry) => tableRow([
        markdownCode(entry.review_priority),
        markdownCode(entry.map_id),
        markdownCode(entry.template_id),
        markdownCode(entry.event_timestamp),
        markdownCode(entry.capture_packages ? entry.capture_packages.length : 0),
        markdownCode(entry.review_image_path),
        markdownCell((entry.review_image_quality_flags || []).join(", ") || "-"),
        markdownCell((entry.review_reasons || []).join(", ") || "-"),
        markdownCell((entry.required_fields || []).join(", "))
    ])).join("\n");
    const priorityRows = countRows(summary.review_priority_counts);

    return `# capture full-count review template

- change class: \`${template.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- capture packages: \`${summary.capture_package_count || 0}\`
- capture groups: \`${summary.capture_group_count || 0}\`
- review images: \`${summary.review_image_bound_group_count || 0}\`
- flagged review images: \`${summary.review_image_quality_flagged_group_count || 0}\`
- screenshot attachments: \`${summary.screenshot_attachment_count || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`

## Map Counts

| map | review groups |
| --- | ---: |
${countRows(summary.map_counts)}

## Review Priorities

| priority | review groups |
| --- | ---: |
${priorityRows}

## Review Groups

| priority | map | template | event timestamp | screenshots | review image | image flags | reasons | required fields |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
${rows || "| `-` | `-` | `-` | `-` | `0` | `-` | - | - | - |"}

## How To Promote A Sample

1. Stitch screenshots first when one warehouse does not fit in one viewport.
2. Manually count all six qualities: \`w/g/b/p/o/r\`.
3. Fill \`actual_counts.total_items\`; the six-quality sum must match it.
4. Set \`actual_counts_source=manual_review\`.
5. Set sample \`status=approved_count_fit_sample\` only after review.

## Guardrails

- Pixel/OCR/system hints are never accepted as training labels.
- Keep one same-battle group as one sample, even if it has multiple screenshots.
- Use this template as input to \`scripts/build_count_fit_sample_review_import.js\` after filling counts.
`;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    if (!args.capturePackagePaths.length) {
        throw new Error("用法: node scripts/build_capture_full_count_review_template.js <capture-a.json> [capture-b.json ...] --output review-template.json [--review-image stitched.png] [--review-image-map review-images.json]");
    }
    const capturePackages = args.capturePackagePaths.map(readCapturePackage);
    const reviewImageByGroup = readReviewImageMap(args.reviewImageMapPath);
    const template = buildCaptureFullCountReviewTemplate({
        capturePackages,
        generatedAt: args.generatedAt,
        paths: args,
        reviewImagePath: args.reviewImagePath,
        reviewImageByGroup
    });
    writeJson(args.outputPath, template);
    fs.writeFileSync(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatCaptureFullCountReviewTemplateMarkdown(template, args.outputPath),
        "utf8"
    );
    process.stdout.write(`${args.outputPath}\n`);
    return template;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    QUALITY_ORDER,
    buildCaptureFullCountReviewTemplate,
    captureGroupKey,
    formatCaptureFullCountReviewTemplateMarkdown,
    groupCapturePackages,
    main,
    readReviewImageManifestSummary,
    readReviewImageMap,
    resolveReviewImagePathForGroup,
    resolveArgs
};
