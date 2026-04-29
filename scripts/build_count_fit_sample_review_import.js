const fs = require("node:fs");
const path = require("node:path");
const { createBattleSampleRecord } = require("../src/core/source_data_runtime.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TEMPLATE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-template.json"
);
const DEFAULT_REVIEW_RESULTS_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-results.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-import.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const APPROVED_STATUSES = new Set([
    "approved_count_fit_sample",
    "count_fit_sample_ready",
    "approved_same_battle_sample"
]);

function formatReportPath(filePath) {
    if (!filePath) return null;
    const resolved = path.resolve(filePath);
    const relative = path.relative(ROOT_DIR, resolved);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return relative.split(path.sep).join("/");
    }
    return filePath;
}

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = new Date().toISOString();
    let failOnBlockers = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = argv[index];
        } else if (String(arg).startsWith("--generated-at=")) {
            generatedAt = String(arg).slice("--generated-at=".length);
        } else if (arg === "--fail-on-blockers") {
            failOnBlockers = true;
        } else {
            positional.push(arg);
        }
    }

    return {
        templatePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_REVIEW_RESULTS_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt,
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

function normalizeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeStatus(value) {
    return normalizeText(value).toLowerCase();
}

function normalizeActualCounts(counts = {}) {
    const normalized = {};
    if (!isPlainObject(counts)) return normalized;
    QUALITY_ORDER.forEach((quality) => {
        const numeric = normalizeNumber(counts[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) normalized[quality] = numeric;
    });
    return normalized;
}

function normalizeTotalItems(counts = {}) {
    if (!isPlainObject(counts)) return null;
    const numeric = normalizeNumber(counts.total_items);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function hasObservedState(entry = {}) {
    return isPlainObject(entry.observed_state) && Object.keys(entry.observed_state).length > 0;
}

function getReviewImageQualityFlags(entry = {}) {
    const metadataFlags = entry.metadata
        && entry.metadata.capture_review
        && Array.isArray(entry.metadata.capture_review.review_image_quality_flags)
        ? entry.metadata.capture_review.review_image_quality_flags
        : [];
    const directFlags = Array.isArray(entry.review_image_quality_flags)
        ? entry.review_image_quality_flags
        : [];
    return Array.from(new Set(directFlags.concat(metadataFlags)
        .filter((flag) => normalizeText(flag))
        .map((flag) => normalizeText(flag))));
}

function hasReviewImageQualityOverride(entry = {}) {
    return normalizeText(entry.review_image_quality_override).toLowerCase() === "manual_single_image_review_confirmed";
}

function sumActualCounts(counts = {}) {
    return QUALITY_ORDER.reduce((sum, quality) => sum + (Number(counts[quality]) || 0), 0);
}

function addReason(target, reason) {
    if (!target.includes(reason)) target.push(reason);
}

function stableIdPart(value, fallback = "sample") {
    const normalized = normalizeText(value)
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized || fallback;
}

function buildSampleId(entry = {}) {
    if (normalizeText(entry.id || entry.sample_id)) return normalizeText(entry.id || entry.sample_id);
    const sourceId = stableIdPart(
        entry.source_task_id
        || entry.source_queue_id
        || entry.confirmed_sample_id
        || entry.map_id,
        "count_fit_sample"
    );
    const timestamp = stableIdPart(normalizeText(entry.event_timestamp).replace(/[.:-]/g, ""), "event");
    return `count_fit_${sourceId}_${timestamp}`;
}

function flattenReviewEntries(template = {}) {
    const entries = [];
    (Array.isArray(template.review_results) ? template.review_results : []).forEach((entry) => {
        if (!isPlainObject(entry)) return;
        entries.push({
            source_entry_kind: "existing_candidate_review",
            ...cloneValue(entry)
        });
    });
    (Array.isArray(template.fresh_capture_templates) ? template.fresh_capture_templates : []).forEach((freshTemplate) => {
        if (!isPlainObject(freshTemplate)) return;
        const samples = Array.isArray(freshTemplate.samples)
            ? freshTemplate.samples
            : (Array.isArray(freshTemplate.filled_samples) ? freshTemplate.filled_samples : []);
        samples.forEach((sample, sampleIndex) => {
            if (!isPlainObject(sample)) return;
            entries.push({
                source_entry_kind: "fresh_capture_sample",
                source_task_id: freshTemplate.source_task_id || null,
                source_task_type: freshTemplate.source_task_type || "capture_fresh_same_battle_samples",
                output_target: freshTemplate.output_target || "count_fit_same_battle_sample",
                map_id: freshTemplate.map_id || null,
                map_priority: freshTemplate.map_priority || null,
                pixel_training_label_allowed: freshTemplate.pixel_training_label_allowed === true,
                review_image_quality_flags: Array.isArray(freshTemplate.review_image_quality_flags)
                    ? cloneValue(freshTemplate.review_image_quality_flags)
                    : [],
                fresh_sample_index: sampleIndex,
                ...cloneValue(sample)
            });
        });
    });
    return entries;
}

function auditReviewEntry(entry = {}) {
    const blockers = [];
    const warnings = [];
    const status = normalizeStatus(entry.status || entry.review_status);
    const actualCounts = normalizeActualCounts(entry.actual_counts);
    const totalItems = normalizeTotalItems(entry.actual_counts);
    const actualCountsSource = normalizeText(entry.actual_counts_source).toLowerCase();
    const actualCountSum = sumActualCounts(actualCounts);
    const reviewImageQualityFlags = getReviewImageQualityFlags(entry);

    if (!APPROVED_STATUSES.has(status)) addReason(blockers, "status_not_approved_for_import");
    if (!normalizeText(entry.map_id)) addReason(blockers, "missing_map_id");
    if (!normalizeText(entry.event_timestamp)) addReason(blockers, "missing_event_timestamp");
    if (!hasObservedState(entry)) addReason(blockers, "missing_observed_state");
    if (actualCountsSource !== "manual_review") addReason(blockers, "actual_counts_source_not_manual_review");
    if (/(pixel|ocr|system)/.test(actualCountsSource)) {
        addReason(blockers, "actual_counts_source_pixel_or_system_hint");
    }
    if (entry.pixel_training_label_allowed === true) addReason(blockers, "pixel_training_label_enabled");
    if (!QUALITY_ORDER.every((quality) => Object.prototype.hasOwnProperty.call(actualCounts, quality))) {
        addReason(blockers, "missing_full_actual_counts");
    }
    if (totalItems === null) {
        addReason(blockers, "missing_actual_counts_total_items");
    } else if (actualCountSum !== totalItems) {
        addReason(blockers, "actual_counts_total_mismatch");
    }
    if (reviewImageQualityFlags.length) {
        if (hasReviewImageQualityOverride(entry)) {
            addReason(warnings, "review_image_quality_flags_manual_override");
        } else {
            addReason(blockers, "review_image_quality_flags_require_recapture_or_single_image_manual_review");
        }
    }

    return {
        source_task_id: normalizeText(entry.source_task_id) || null,
        source_queue_id: normalizeText(entry.source_queue_id) || null,
        source_entry_kind: normalizeText(entry.source_entry_kind) || null,
        map_id: normalizeText(entry.map_id) || null,
        status: status || null,
        audit_status: blockers.length ? "blocked" : "accepted",
        blockers,
        warnings,
        review_image_quality_flags: reviewImageQualityFlags,
        review_image_quality_override: normalizeText(entry.review_image_quality_override) || null,
        actual_counts_source: normalizeText(entry.actual_counts_source) || null,
        event_timestamp: normalizeText(entry.event_timestamp) || null,
        actual_counts_quality_sum: actualCountSum,
        actual_counts_total_items: totalItems
    };
}

function buildBattleSampleFromEntry(entry = {}, generatedAt = null) {
    const actualCounts = normalizeActualCounts(entry.actual_counts);
    const metadata = isPlainObject(entry.metadata) ? cloneValue(entry.metadata) : {};
    metadata.count_fit_review = {
        source_task_id: normalizeText(entry.source_task_id) || null,
        source_queue_id: normalizeText(entry.source_queue_id) || null,
        source_entry_kind: normalizeText(entry.source_entry_kind) || null,
        source_task_type: normalizeText(entry.source_task_type) || null,
        event_timestamp: normalizeText(entry.event_timestamp),
        actual_counts_source: normalizeText(entry.actual_counts_source),
        reviewer_notes: normalizeText(entry.reviewer_notes) || null,
        review_image_quality_flags: getReviewImageQualityFlags(entry),
        review_image_quality_override: normalizeText(entry.review_image_quality_override) || null,
        imported_at: generatedAt || null
    };

    return createBattleSampleRecord({
        id: buildSampleId(entry),
        map_id: entry.map_id,
        map_variant_id: entry.map_variant_id || entry.submap_id,
        map_variant_label: entry.map_variant_label || entry.submap_label,
        observed_state: entry.observed_state,
        actual_counts: actualCounts,
        actual_value: entry.actual_value,
        actual_cells: entry.actual_cells,
        source_kind: "count_fit_manual_review",
        items: Array.isArray(entry.items) ? entry.items : [],
        metadata
    });
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

function summarizeImport({ entries = [], samples = [] } = {}) {
    const mapCounts = {};
    samples.forEach((sample) => incrementCount(mapCounts, sample.map_id || "unknown"));
    return {
        review_entry_count: entries.length,
        accepted_sample_count: samples.length,
        blocked_entry_count: entries.filter((entry) => entry.audit_status === "blocked").length,
        blocker_reason_counts: countReasons(entries, "blockers"),
        warning_reason_counts: countReasons(entries, "warnings"),
        map_counts: mapCounts,
        review_image_quality_flagged_entry_count: entries.filter((entry) => (
            Array.isArray(entry.review_image_quality_flags) && entry.review_image_quality_flags.length
        )).length,
        pixel_training_label_allowed_count: entries.filter((entry) => (
            (entry.blockers || []).includes("pixel_training_label_enabled")
        )).length
    };
}

function buildCountFitSampleReviewImport({
    template = {},
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    const flattenedEntries = flattenReviewEntries(template);
    const entries = flattenedEntries.map(auditReviewEntry);
    const samples = flattenedEntries
        .map((entry, index) => ({ entry, audit: entries[index] }))
        .filter(({ audit }) => audit.audit_status === "accepted")
        .map(({ entry }) => buildBattleSampleFromEntry(entry, generatedAt));

    return {
        schema_version: "ak_count_fit_sample_review_import_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        export_kind: "count_fit_same_battle_samples",
        inputs: {
            count_fit_sample_review_template: formatReportPath(paths.templatePath || DEFAULT_REVIEW_RESULTS_PATH),
            count_fit_sample_review_source: formatReportPath(paths.templatePath || DEFAULT_REVIEW_RESULTS_PATH)
        },
        source_template_schema_version: template && template.schema_version ? template.schema_version : null,
        source_template_generated_at: template && template.generated_at ? template.generated_at : null,
        export_context: {
            source_artifact_version: template && template.schema_version ? template.schema_version : null,
            exported_at: generatedAt,
            sample_count: samples.length,
            selected_sample_count: samples.length,
            skipped_sample_count: entries.filter((entry) => entry.audit_status === "blocked").length
        },
        sample_quality_summary: {
            sample_count: samples.length
        },
        notes: [
            "Only approved same-battle entries with manual_review actual counts are exported.",
            "Pixel/OCR/system hints remain review context and are blocked from count-fit labels.",
            "Every exported sample has one event_timestamp, observed_state, and full six-quality actual_counts."
        ],
        summary: summarizeImport({ entries, samples }),
        entries,
        samples
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

function formatCountFitSampleReviewImportMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report && report.summary ? report.summary : summarizeImport();
    const entries = Array.isArray(report && report.entries) ? report.entries : [];
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = entries.length
        ? entries.map((entry) => tableRow([
            markdownCode(entry.source_task_id),
            markdownCode(entry.source_queue_id),
            markdownCode(entry.map_id),
            markdownCode(entry.status),
            markdownCode(entry.audit_status),
            markdownCode(entry.event_timestamp),
            markdownCell(reasonList(entry.blockers))
        ])).join("\n")
        : "| `-` | `-` | `-` | `-` | `-` | `-` | - |";

    return `# count-fit sample review import

- change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- review entries: \`${summary.review_entry_count || 0}\`
- accepted samples: \`${summary.accepted_sample_count || 0}\`
- blocked entries: \`${summary.blocked_entry_count || 0}\`
- review-image flagged entries: \`${summary.review_image_quality_flagged_entry_count || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`

## Blocker Reasons

| reason | count |
| --- | ---: |
${countRows(summary.blocker_reason_counts)}

## Map Counts

| map | accepted samples |
| --- | ---: |
${countRows(summary.map_counts)}

## Import Audit

| source task | source queue | map | status | audit status | event timestamp | blockers |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## Guardrails

- \`actual_counts_source\` must be exactly \`manual_review\`.
- Full count-fit rows must include \`w/g/b/p/o/r\` and the sum must equal \`actual_counts.total_items\`.
- \`event_timestamp\` is required so replay/count-fit logic can avoid forward-looking joins.
- Pixel/OCR/system hints are never exported as training labels.
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
    const args = resolveArgs(argv);
    const template = JSON.parse(fs.readFileSync(args.templatePath, "utf8"));
    const report = buildCountFitSampleReviewImport({
        template,
        generatedAt: args.generatedAt,
        paths: args
    });
    writeJson(args.outputPath, report);
    writeMarkdown(args.outputPath.replace(/\.json$/i, ".md"), formatCountFitSampleReviewImportMarkdown(report, args.outputPath));
    if (args.failOnBlockers && report.summary.blocked_entry_count > 0) {
        throw new Error(`count-fit review import blockers: ${report.summary.blocked_entry_count}`);
    }
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    APPROVED_STATUSES,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REVIEW_RESULTS_PATH,
    DEFAULT_TEMPLATE_PATH,
    QUALITY_ORDER,
    buildCountFitSampleReviewImport,
    formatCountFitSampleReviewImportMarkdown,
    main,
    resolveArgs
};
