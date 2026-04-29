const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_QUEUE_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-red-residual-clarification-queue.json");
const DEFAULT_CAPTURE_TEMPLATE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-sunken-ship-latest-capture-review-queue-template.json"
);
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-red-residual-review-pack.json");
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    const priorityFilter = [];

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        const eqIndex = arg.indexOf("=");
        const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
        const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : null;
        const nextValue = () => {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flag} 缺少值`);
            if (inlineValue === null) index += 1;
            return String(value);
        };

        if (flag === "--priority") {
            priorityFilter.splice(0, priorityFilter.length, ...normalizePriorityFilter(nextValue()));
        } else if (arg === "--all") {
            priorityFilter.splice(0, priorityFilter.length);
        } else {
            positional.push(arg);
        }
    }

    if (positional.length > 3) {
        throw new Error("最多只接受 3 个位置参数: <red-queue.json> <capture-template.json> [output.json]");
    }

    return {
        queuePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_QUEUE_PATH,
        captureTemplatePath: positional[1] ? path.resolve(positional[1]) : DEFAULT_CAPTURE_TEMPLATE_PATH,
        outputPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_OUTPUT_PATH,
        priorityFilter
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

function roundTo(value, digits = 4) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeStringList(value = []) {
    const source = Array.isArray(value) ? value : String(value).split(",");
    const seen = new Set();
    const result = [];
    source.forEach((entry) => {
        const normalized = String(entry || "").trim();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        result.push(normalized);
    });
    return result;
}

function normalizePriorityFilter(value = []) {
    return normalizeStringList(value)
        .flatMap((entry) => String(entry).split(","))
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean);
}

function normalizeBasename(value) {
    if (!value) return null;
    return path.basename(String(value));
}

function captureBasenamesFromQueueItem(item = {}) {
    const names = [];
    normalizeStringList(item.captures).forEach((entry) => names.push(normalizeBasename(entry)));
    normalizeStringList(item.input_paths).forEach((entry) => names.push(normalizeBasename(entry)));
    if (item.capture) names.push(normalizeBasename(item.capture));
    if (item.input_path) names.push(normalizeBasename(item.input_path));
    return normalizeStringList(names.filter(Boolean));
}

function captureBasenamesFromTemplate(template = {}) {
    const names = [];
    (Array.isArray(template.capture_packages) ? template.capture_packages : []).forEach((entry) => {
        names.push(normalizeBasename(entry.basename));
        names.push(normalizeBasename(entry.input_path));
    });
    (Array.isArray(template.samples) ? template.samples : []).forEach((sample) => {
        const captureReview = sample.metadata && sample.metadata.capture_review;
        if (captureReview && Array.isArray(captureReview.capture_package_paths)) {
            captureReview.capture_package_paths.forEach((entry) => names.push(normalizeBasename(entry)));
        }
    });
    return normalizeStringList(names.filter(Boolean));
}

function indexCaptureTemplates(captureTemplate = {}) {
    const index = new Map();
    (Array.isArray(captureTemplate.fresh_capture_templates) ? captureTemplate.fresh_capture_templates : []).forEach((template) => {
        captureBasenamesFromTemplate(template).forEach((basename) => {
            if (!index.has(basename)) index.set(basename, template);
        });
    });
    return index;
}

function findTemplateForQueueItem(item = {}, templateIndex = new Map()) {
    for (const basename of captureBasenamesFromQueueItem(item)) {
        if (templateIndex.has(basename)) return templateIndex.get(basename);
    }
    return null;
}

function getFirstSample(template = {}) {
    return Array.isArray(template.samples) && template.samples.length ? template.samples[0] : {};
}

function getCaptureReview(sample = {}) {
    return sample.metadata && isPlainObject(sample.metadata.capture_review)
        ? sample.metadata.capture_review
        : {};
}

function buildFieldPlan(item = {}) {
    const fields = normalizeStringList(item.minimal_required_fields);
    const focus = [];
    if (fields.includes("orange_count")) focus.push("orange_count");
    if (fields.includes("red_count")) focus.push("red_count");
    if (fields.includes("total_storage_cells")) focus.push("total_storage_cells");
    if (fields.includes("purple_count")) focus.push("purple_count");
    if (fields.some((field) => field.startsWith("actual_counts"))) {
        focus.push("actual_counts.w/g/b/p/o/r/total_items");
    }
    return {
        decisive_fields: focus.length ? focus : fields,
        full_count_fields: QUALITY_ORDER.map((quality) => `actual_counts.${quality}`).concat("actual_counts.total_items"),
        first_decisive_field: focus[0] || fields[0] || null,
        one_field_fallback: fields.includes("orange_count") ? "orange_count" : (fields[0] || null)
    };
}

function buildReviewItem(item = {}, template = null) {
    const sample = getFirstSample(template || {});
    const captureReview = getCaptureReview(sample);
    const fieldPlan = buildFieldPlan(item);
    const reviewImagePath = template && template.review_image_path
        ? template.review_image_path
        : captureReview.review_image_path || null;
    return {
        queue_id: item.queue_id || null,
        group_id: item.group_id || null,
        priority: item.priority || null,
        priority_score: roundTo(item.priority_score),
        map_id: item.map_id || (template && template.map_id) || null,
        source_task_id: template ? template.source_task_id || null : null,
        event_timestamp: template ? template.event_timestamp || item.exported_at || null : item.exported_at || null,
        captures: captureBasenamesFromQueueItem(item),
        review_image_path: reviewImagePath,
        review_image_quality_flags: template && Array.isArray(template.review_image_quality_flags)
            ? cloneValue(template.review_image_quality_flags)
            : [],
        expected_total_items: captureReview.expected_total_items ?? null,
        grouped_capture_count: item.grouped_capture_count || (Array.isArray(item.captures) ? item.captures.length : 1),
        current_model: cloneValue(item.current_model || {}),
        constraint_diagnostics: cloneValue(item.constraint_diagnostics || {}),
        field_plan: fieldPlan,
        minimal_required_fields: normalizeStringList(item.minimal_required_fields),
        recommended_next_action: item.recommended_next_action || "补完整六品质实际数量后再进入 count-fit replay。",
        model_error_hypothesis: "missing_orange_or_total_count_can_push_residual_into_red",
        manual_confirmation_page_ready: Boolean(template && reviewImagePath),
        training_label_allowed: false,
        authority_merge_allowed: false,
        adoption_blockers: normalizeStringList(item.adoption_blockers).concat(
            template && reviewImagePath ? [] : ["missing_review_image_binding"]
        )
    };
}

function priorityMatches(item = {}, priorityFilter = []) {
    const filters = normalizePriorityFilter(priorityFilter);
    if (!filters.length) return true;
    return filters.includes(String(item.priority || "").toUpperCase());
}

function countBy(items = [], keyFn) {
    const counts = {};
    items.forEach((item) => {
        const key = keyFn(item) || "unknown";
        counts[key] = (counts[key] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeReviewItems(items = [], rawItems = [], priorityFilter = []) {
    return {
        source_queue_item_count: rawItems.length,
        review_item_count: items.length,
        matched_review_group_count: items.filter((item) => item.manual_confirmation_page_ready).length,
        unmatched_review_group_count: items.filter((item) => !item.manual_confirmation_page_ready).length,
        priority_filter: normalizePriorityFilter(priorityFilter),
        priority_counts: countBy(items, (item) => item.priority),
        decisive_first_field_counts: countBy(items, (item) => item.field_plan && item.field_plan.first_decisive_field),
        authority_merge_allowed: false,
        training_label_allowed_count: 0,
        top_priority: items[0] ? items[0].priority : null,
        top_source_task_id: items[0] ? items[0].source_task_id : null
    };
}

function sortReviewItems(items = []) {
    const rank = { P0: 0, P1: 1, P2: 2 };
    return items.slice().sort((left, right) => (
        (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9)
        || (right.priority_score || 0) - (left.priority_score || 0)
        || String(left.event_timestamp || "").localeCompare(String(right.event_timestamp || ""))
    ));
}

function buildRedResidualReviewPack({
    redResidualQueue = {},
    captureReviewTemplate = {},
    paths = {},
    priorityFilter = []
} = {}) {
    const templateIndex = indexCaptureTemplates(captureReviewTemplate);
    const rawQueueItems = Array.isArray(redResidualQueue.items) ? redResidualQueue.items : [];
    const items = sortReviewItems(rawQueueItems
        .filter((item) => priorityMatches(item, priorityFilter))
        .map((item) => buildReviewItem(item, findTemplateForQueueItem(item, templateIndex))));

    return {
        schema_version: "ak_red_residual_review_pack_v1",
        generated_at: captureReviewTemplate.generated_at || redResidualQueue.generated_at || null,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        source_paths: {
            red_residual_clarification_queue: paths.queuePath || null,
            capture_review_template: paths.captureTemplatePath || null
        },
        guardrails: [
            "review_pack_is_not_a_training_label",
            "fill_counts_by_human_review_only",
            "do_not_update_default_config_from_review_pack",
            "only_approved_manual_count_fit_samples_can_enter_authority_handoff"
        ],
        summary: summarizeReviewItems(items, rawQueueItems, priorityFilter),
        items,
        recommendations: buildRecommendations(items)
    };
}

function buildRecommendations(items = []) {
    const topPriority = items[0] ? items[0].priority : null;
    if (!items.length) {
        return [
            "当前没有匹配的红残差 review 项；不要继续使用旧 P0 页面。",
            "继续收集完整六品质数量，或改用当前非空优先级过滤生成 review pack。",
            "只有人工确认后的 count-fit 样本才能进入 authority handoff。"
        ];
    }
    return [
        `先处理当前最高优先级 ${topPriority} 且 first_decisive_field=orange_count 的样本。`,
        "若只能快速补一个值，优先填金色数量；完整拟合仍需要 w/g/b/p/o/r/total_items。",
        "填完人工确认 JSON 后，再运行对应 ingest 和 handoff gate。"
    ];
}

function markdownCell(value) {
    if (Array.isArray(value)) return markdownCell(value.join(", "));
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const rows = (report.items || []).map((item) => `| ${[
        markdownCode(item.priority),
        markdownCode(item.event_timestamp),
        markdownCode(item.current_model && item.current_model.red_count_mean),
        markdownCode(item.constraint_diagnostics && item.constraint_diagnostics.orange_red_unknown_pool),
        markdownCell(item.field_plan && item.field_plan.decisive_fields),
        markdownCode(item.expected_total_items),
        markdownCode(item.review_image_path),
        markdownCell(item.captures)
    ].join(" | ")} |`).join("\n");

    return [
        "# Red Residual Review Pack",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``,
        `- Review items: \`${summary.review_item_count || 0}\``,
        `- Matched review images: \`${summary.matched_review_group_count || 0}\``,
        `- Authority merge allowed: \`${summary.authority_merge_allowed === true}\``,
        "",
        "| priority | event | red mean | O/R unknown pool | decisive fields | expected total | review image | captures |",
        "| --- | --- | ---: | ---: | --- | ---: | --- | --- |",
        rows || "| `-` | `-` | `-` | `-` | - | `-` | `-` | - |",
        "",
        "## Guardrails",
        ...(report.guardrails || []).map((entry) => `- \`${entry}\``),
        "",
        "## Next",
        ...(report.recommendations || []).map((entry) => `- ${entry}`),
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

function formatBadgeList(values = []) {
    const list = Array.isArray(values) ? values : [];
    return list.length
        ? list.map((entry) => `<span>${escapeHtml(entry)}</span>`).join("")
        : "<span>-</span>";
}

function formatReviewCard(item = {}, index = 0) {
    const imageSrc = formatImageSrc(item.review_image_path);
    const model = item.current_model || {};
    const diagnostics = item.constraint_diagnostics || {};
    return `<article class="review-card">
        <section class="image-panel">
            ${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="red residual review image ${escapeHtml(index + 1)}">` : "<p>No review image binding.</p>"}
        </section>
        <section class="detail-panel">
            <div class="meta">
                <span>${escapeHtml(item.priority || "-")}</span>
                <span>${escapeHtml(item.event_timestamp || "-")}</span>
                <span>${escapeHtml(item.source_task_id || "-")}</span>
            </div>
            <div class="metrics">
                <span>red mean <b>${escapeHtml(model.red_count_mean ?? "-")}</b></span>
                <span>red cells <b>${escapeHtml(model.red_cell_mean ?? "-")}</b></span>
                <span>O/R pool <b>${escapeHtml(diagnostics.orange_red_unknown_pool ?? "-")}</b></span>
                <span>expected total <b>${escapeHtml(item.expected_total_items ?? "-")}</b></span>
            </div>
            <h2>优先补字段</h2>
            <div class="badges">${formatBadgeList(item.field_plan ? item.field_plan.decisive_fields : [])}</div>
            <h2>完整训练标签</h2>
            <div class="badges muted">${formatBadgeList(item.field_plan ? item.field_plan.full_count_fields : [])}</div>
            <p>${escapeHtml(item.recommended_next_action || "")}</p>
            <p class="captures">${escapeHtml((item.captures || []).join(" / "))}</p>
        </section>
    </article>`;
}

function formatHtmlReport(report = {}) {
    const items = Array.isArray(report.items) ? report.items : [];
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>Red Residual Review Pack</title>
    <style>
        :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body { margin: 0; background: #f6f7f9; color: #1f2328; }
        main { max-width: 1440px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
        h1, h2, p { margin: 0; }
        header { display: grid; gap: 8px; margin-bottom: 12px; }
        .summary, .meta, .metrics, .badges { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .summary span, .meta span, .metrics span, .badges span {
            border: 1px solid #d0d7de; background: #fff; border-radius: 6px; padding: 6px 9px; font-size: 13px;
        }
        .review-card { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.65fr); gap: 12px; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
        .image-panel { background: #0d1117; border-radius: 6px; overflow: auto; min-height: 300px; }
        .image-panel img { display: block; width: 100%; height: auto; max-height: 82vh; object-fit: contain; }
        .detail-panel { display: grid; align-content: start; gap: 10px; }
        h2 { font-size: 14px; }
        .metrics span { background: #f6f8fa; }
        .badges span { border-color: #f59e0b; background: #fffbeb; color: #92400e; font-weight: 700; }
        .badges.muted span { border-color: #d0d7de; background: #f6f8fa; color: #57606a; font-weight: 600; }
        .captures { color: #57606a; font-size: 12px; overflow-wrap: anywhere; }
        @media (max-width: 920px) {
            main { padding: 10px; }
            .review-card { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
<main>
    <header>
        <h1>Red Residual Review Pack</h1>
        <div class="summary">
            <span>items: ${escapeHtml(report.summary ? report.summary.review_item_count : 0)}</span>
            <span>matched images: ${escapeHtml(report.summary ? report.summary.matched_review_group_count : 0)}</span>
            <span>priority filter: ${escapeHtml(report.summary && Array.isArray(report.summary.priority_filter) ? report.summary.priority_filter.join(", ") || "all" : "all")}</span>
            <span>authority merge: ${escapeHtml(report.summary && report.summary.authority_merge_allowed === true ? "allowed" : "blocked")}</span>
        </div>
    </header>
    ${items.length ? items.map(formatReviewCard).join("\n") : "<p>No red residual review items.</p>"}
</main>
</body>
</html>
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildRedResidualReviewPack({
        redResidualQueue: readJson(args.queuePath),
        captureReviewTemplate: readJson(args.captureTemplatePath),
        paths: {
            queuePath: args.queuePath,
            captureTemplatePath: args.captureTemplatePath
        },
        priorityFilter: args.priorityFilter
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatMarkdownReport(report, args.outputPath));
    writeText(args.outputPath.replace(/\.json$/i, ".html"), formatHtmlReport(report));
    process.stdout.write(`${args.outputPath}\n${args.outputPath.replace(/\.json$/i, ".md")}\n${args.outputPath.replace(/\.json$/i, ".html")}\n`);
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
    DEFAULT_CAPTURE_TEMPLATE_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_QUEUE_PATH,
    buildRedResidualReviewPack,
    buildRecommendations,
    captureBasenamesFromQueueItem,
    captureBasenamesFromTemplate,
    formatHtmlReport,
    formatMarkdownReport,
    main,
    resolveArgs
};
