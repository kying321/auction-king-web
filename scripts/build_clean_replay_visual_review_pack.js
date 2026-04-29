const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TEMPLATE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-manual-review-results-template.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-24-clean-replay-visual-review-pack.html"
);
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
            priorityFilter.push(nextValue());
        } else {
            positional.push(arg);
        }
    }
    return {
        templatePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_TEMPLATE_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        priorityFilter: normalizePriorityFilter(priorityFilter)
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

function normalizePriorityFilter(value = []) {
    return normalizeStringList(value)
        .flatMap((entry) => entry.split(","))
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean);
}

function normalizeReviewResults(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    const results = [];
    if (Array.isArray(payload.review_results)) results.push(...payload.review_results);
    if (Array.isArray(payload.results)) results.push(...payload.results);
    if (Array.isArray(payload.items)) results.push(...payload.items);
    if (Array.isArray(payload.fresh_capture_templates)) {
        payload.fresh_capture_templates.forEach((template) => {
            if (!template || typeof template !== "object") return;
            const samples = Array.isArray(template.samples)
                ? template.samples
                : (Array.isArray(template.filled_samples) ? template.filled_samples : []);
            samples.forEach((sample) => {
                if (!sample || typeof sample !== "object") return;
                const normalized = {
                    source_entry_kind: "fresh_capture_sample",
                    source_task_id: template.source_task_id || null,
                    source_task_type: template.source_task_type || null,
                    map_id: template.map_id || sample.map_id || null,
                    review_image_path: template.review_image_path || sample.review_image_path || null,
                    ...(Array.isArray(template.review_image_quality_flags) && template.review_image_quality_flags.length
                        ? { review_image_quality_flags: cloneValue(template.review_image_quality_flags) }
                        : {}),
                    capture_packages: Array.isArray(template.capture_packages) ? cloneValue(template.capture_packages) : [],
                    ...cloneValue(sample)
                };
                const reviewPriority = template.review_priority || sample.review_priority || null;
                const reviewReasons = Array.isArray(template.review_reasons)
                    ? cloneValue(template.review_reasons)
                    : (Array.isArray(sample.review_reasons) ? cloneValue(sample.review_reasons) : []);
                if (reviewPriority) normalized.review_priority = reviewPriority;
                if (reviewReasons.length) normalized.review_reasons = reviewReasons;
                const guardrails = Array.isArray(sample.guardrails)
                    ? sample.guardrails
                    : (Array.isArray(template.guardrails) ? template.guardrails : []);
                if (guardrails.length) normalized.guardrails = cloneValue(guardrails);
                results.push(normalized);
            });
        });
    }
    if (results.length) return results;
    return [];
}

function incrementCount(target, key) {
    target[key] = (target[key] || 0) + 1;
}

function normalizeCounts(counts = {}) {
    const normalized = {};
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) return normalized;
    QUALITY_ORDER.forEach((quality) => {
        if (Object.prototype.hasOwnProperty.call(counts, quality)) {
            normalized[quality] = counts[quality];
        }
    });
    if (Object.prototype.hasOwnProperty.call(counts, "total_items")) {
        normalized.total_items = counts.total_items;
    }
    return normalized;
}

function buildCard(result = {}) {
    const pixelQualityDraft = result.pixel_quality_draft
        ? {
            ...cloneValue(result.pixel_quality_draft),
            training_label_allowed: false
        }
        : null;
    const sourceImagePath = result.source_image_path || result.review_image_path || null;
    const sourceId = result.source_queue_id || result.source_task_id || null;
    const captureReview = result.capture_review
        || (result.metadata && result.metadata.capture_review)
        || {};
    const reviewImageQualityFlags = Array.isArray(result.review_image_quality_flags)
        ? result.review_image_quality_flags.slice()
        : (Array.isArray(captureReview.review_image_quality_flags)
            ? captureReview.review_image_quality_flags.slice()
            : []);
    const reviewPriority = result.review_priority
        || captureReview.review_priority
        || null;
    const reviewReasons = Array.isArray(result.review_reasons)
        ? result.review_reasons.slice()
        : (Array.isArray(captureReview.review_reasons) ? captureReview.review_reasons.slice() : []);
    return {
        source_queue_id: sourceId,
        status: result.status || null,
        source_entry_kind: result.source_entry_kind || null,
        basename: result.basename || (sourceImagePath ? path.basename(sourceImagePath) : null),
        source_image_path: sourceImagePath,
        pixel_overlay_path: result.pixel_overlay_path || null,
        event_timestamp: result.event_timestamp || null,
        review_priority: reviewPriority,
        review_reasons: reviewReasons,
        observed_state: cloneValue(result.observed_state || {}),
        capture_review: cloneValue(captureReview),
        review_image_quality_flags: reviewImageQualityFlags,
        capture_packages: Array.isArray(result.capture_packages) ? cloneValue(result.capture_packages) : [],
        confirmed_sample_id: result.confirmed_sample_id || null,
        map_id: result.map_id || null,
        map_variant_id: result.map_variant_id || null,
        map_variant_label: result.map_variant_label || null,
        confirmed_settlement_summary: cloneValue(result.confirmed_settlement_summary || {}),
        pixel_quality_draft: pixelQualityDraft,
        pixel_vs_settlement_total: result.pixel_vs_settlement_total
            ? {
                ...cloneValue(result.pixel_vs_settlement_total),
                training_label_allowed: false
            }
            : null,
        actual_counts: normalizeCounts(result.actual_counts || {}),
        actual_counts_source: result.actual_counts_source || "manual_review",
        guardrails: Array.isArray(result.guardrails) ? result.guardrails.slice() : []
    };
}

function summarizeCards(cards = []) {
    const mapCounts = {};
    const priorityCounts = {};
    cards.forEach((card) => incrementCount(mapCounts, card.map_id || "unknown"));
    cards.forEach((card) => incrementCount(priorityCounts, card.review_priority || "unknown"));
    return {
        review_card_count: cards.length,
        map_counts: mapCounts,
        priority_counts: priorityCounts,
        review_image_quality_flagged_count: cards.filter((card) => (
            Array.isArray(card.review_image_quality_flags) && card.review_image_quality_flags.length
        )).length,
        pixel_training_label_allowed_count: cards.filter((card) => (
            card.pixel_quality_draft && card.pixel_quality_draft.training_label_allowed === true
        )).length
    };
}

function buildCleanReplayVisualReviewPack({
    template = {},
    generatedAt = new Date().toISOString(),
    priorityFilter = []
} = {}) {
    const normalizedPriorityFilter = normalizePriorityFilter(priorityFilter);
    const prioritySet = new Set(normalizedPriorityFilter);
    const cards = normalizeReviewResults(template)
        .map(buildCard)
        .filter((card) => !prioritySet.size || prioritySet.has(String(card.review_priority || "").toUpperCase()));
    const summary = summarizeCards(cards);
    summary.priority_filter = normalizedPriorityFilter;
    return {
        schema_version: "ak_clean_replay_visual_review_pack_v1",
        generated_at: generatedAt,
        source_template_schema_version: template && template.schema_version ? template.schema_version : null,
        change_class: "RESEARCH_ONLY",
        summary,
        cards
    };
}

function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatCounts(counts = {}) {
    const parts = QUALITY_ORDER
        .filter((quality) => counts && Object.prototype.hasOwnProperty.call(counts, quality))
        .map((quality) => `${quality}:${counts[quality]}`);
    if (counts && Object.prototype.hasOwnProperty.call(counts, "total_items")) {
        parts.push(`total_items:${counts.total_items}`);
    }
    return parts.length ? parts.join(", ") : "-";
}

function formatMetricRows(card = {}) {
    const settlement = card.confirmed_settlement_summary || {};
    const pixelCheck = card.pixel_vs_settlement_total || {};
    return [
        ["bid_price", settlement.bid_price],
        ["loot_value", settlement.loot_value],
        ["profit", settlement.profit],
        ["settlement_total", settlement.quick_recycle_total_items],
        ["pixel_total", pixelCheck.pixel_total],
        ["pixel_delta", pixelCheck.delta],
        ["pixel_total_status", pixelCheck.status],
        ["actual_counts_source", card.actual_counts_source]
    ].map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value ?? "-")}</td></tr>`).join("");
}

function formatCropSensitivity(draft = {}) {
    const crop = draft && draft.crop_sensitivity ? draft.crop_sensitivity : null;
    if (!crop) return "-";
    return [
        `action=${crop.action || crop.status || "-"}`,
        `stable=${crop.stable === true ? "true" : "false"}`,
        `signatures=${crop.unique_signature_count ?? "-"}`,
        `majority=${crop.majority_fraction ?? "-"}`,
        `training_label_allowed=${crop.training_label_allowed === true ? "true" : "false"}`
    ].join(" ");
}

function formatJsonPreview(value = {}) {
    const keys = Object.keys(value || {});
    if (!keys.length) return "-";
    return JSON.stringify(value, null, 2);
}

function formatPriorityCounts(counts = {}) {
    return Object.entries(counts || {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${value}`)
        .join(", ") || "-";
}

function formatQualityWarning(flags = []) {
    if (!Array.isArray(flags) || !flags.length) return "";
    const list = flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join("");
    return `<section class="quality-warning">
                <h3>review image quality warning</h3>
                <ul>${list}</ul>
                <p>Use this card only after recapture or explicit single-image manual review.</p>
            </section>`;
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

function formatImageFigure(src, caption, alt) {
    if (!src) return "";
    const displaySrc = formatImageSrc(src);
    return `<figure>
                <figcaption>${escapeHtml(caption)}</figcaption>
                <img src="${escapeHtml(displaySrc)}" alt="${escapeHtml(alt || caption)}">
            </figure>`;
}

function formatCardHtml(card = {}, index = 0) {
    const pixelDraft = card.pixel_quality_draft || {};
    const queueId = card.source_queue_id || `card_${index + 1}`;
    const guardrails = (card.guardrails || []).length
        ? card.guardrails.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("")
        : "<li>do_not_copy_pixel_quality_draft_into_actual_counts</li>";
    const imageFigures = [
        formatImageFigure(card.source_image_path, card.source_entry_kind === "fresh_capture_sample" ? "review image" : "source image", `${card.basename || "source image"} source`),
        formatImageFigure(card.pixel_overlay_path, "pixel overlay", `${card.basename || "source image"} pixel overlay`)
    ].filter(Boolean).join("");
    const qualityWarning = formatQualityWarning(card.review_image_quality_flags || []);
    return `<article class="review-card" id="${escapeHtml(queueId)}">
        <header class="card-header">
            <div>
                <p class="eyebrow">${escapeHtml(card.source_entry_kind === "fresh_capture_sample" ? "manual_full_count_review" : "pixel_review_only")}</p>
                <h2>${escapeHtml(card.basename || queueId)}</h2>
                <p class="priority-line">priority: ${escapeHtml(card.review_priority || "-")} | reasons: ${escapeHtml((card.review_reasons || []).join(", ") || "-")}</p>
                <p>${escapeHtml(card.map_id || "unknown")} / ${escapeHtml(card.map_variant_id || "-")} / ${escapeHtml(card.event_timestamp || "-")}</p>
            </div>
            <code>${escapeHtml(queueId)}</code>
        </header>
        <div class="image-grid">
            ${imageFigures || "<p>No review image.</p>"}
        </div>
        ${qualityWarning}
        <div class="detail-grid">
            <section>
                <h3>pixel draft</h3>
                <p>${escapeHtml(formatCounts(pixelDraft.counts || {}))}</p>
                <p>total=${escapeHtml(pixelDraft.total ?? "-")} low=${escapeHtml(pixelDraft.low_confidence_block_count ?? "-")} min=${escapeHtml(pixelDraft.min_confidence ?? "-")}</p>
                <p>crop_sensitivity: ${escapeHtml(formatCropSensitivity(pixelDraft))}</p>
                <p>training_label_allowed=${escapeHtml(pixelDraft.training_label_allowed === true ? "true" : "false")}</p>
            </section>
            <section>
                <h3>manual target</h3>
                <p>actual_counts_source: ${escapeHtml(card.actual_counts_source || "manual_review")}</p>
                <p>${escapeHtml(formatCounts(card.actual_counts || {}))}</p>
            </section>
            <section>
                <h3>capture context</h3>
                <p>capture packages: ${escapeHtml((card.capture_packages || []).length)}</p>
                <p>review priority: ${escapeHtml(card.review_priority || "-")}</p>
                <p>review reasons: ${escapeHtml((card.review_reasons || []).join(", ") || "-")}</p>
                <p>image flags: ${escapeHtml((card.review_image_quality_flags || []).join(", ") || "-")}</p>
                <pre>${escapeHtml(formatJsonPreview(card.observed_state || {}))}</pre>
            </section>
            <section>
                <h3>settlement check</h3>
                <table><tbody>${formatMetricRows(card)}</tbody></table>
            </section>
            <section>
                <h3>guardrails</h3>
                <ul>${guardrails}</ul>
            </section>
        </div>
    </article>`;
}

function formatVisualReviewPackHtml(pack = {}) {
    const summary = pack.summary || summarizeCards(pack.cards || []);
    const cards = Array.isArray(pack.cards) ? pack.cards : [];
    const cardHtml = cards.length
        ? cards.map(formatCardHtml).join("\n")
        : "<p>No review cards.</p>";
    return `<!doctype html>
<html lang="zh-CN">
	<head>
	    <meta charset="utf-8">
	    <meta name="viewport" content="width=device-width, initial-scale=1">
	    <link rel="icon" href="data:,">
	    <title>clean replay visual review pack</title>
    <style>
        :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body { margin: 0; background: #f6f7f9; color: #1f2328; }
        main { max-width: 1440px; width: 100%; box-sizing: border-box; margin: 0 auto; padding: 24px; }
        h1, h2, h3, p { margin: 0; }
        .page-header { display: grid; gap: 8px; margin-bottom: 20px; }
        .summary { display: flex; flex-wrap: wrap; gap: 8px; }
        .summary span { border: 1px solid #d0d7de; background: #fff; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
        .review-card { background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; margin: 16px 0; }
        .quality-warning { border-color: #d1242f; background: #fff1f1; margin-top: 12px; }
        .quality-warning h3 { color: #a40e26; }
        .card-header { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
        .card-header > * { min-width: 0; }
        .card-header code { overflow-wrap: anywhere; word-break: break-word; }
	        .eyebrow { color: #0969da; font-size: 12px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
	        .priority-line { color: #9a3412; font-weight: 700; }
        .image-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        figure { margin: 0; border: 1px solid #d8dee4; border-radius: 8px; overflow: hidden; background: #0d1117; }
        figcaption { padding: 8px 10px; background: #24292f; color: #fff; font-size: 13px; }
        img { display: block; width: 100%; height: auto; max-height: 760px; object-fit: contain; }
        .detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }
        section { border: 1px solid #d8dee4; border-radius: 8px; padding: 10px; background: #fbfbfc; }
        section h3 { font-size: 14px; margin-bottom: 8px; }
        section p, li, td, th, code { font-size: 12px; overflow-wrap: anywhere; }
        pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; line-height: 1.35; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; color: #57606a; font-weight: 600; }
        td, th { border-top: 1px solid #d8dee4; padding: 4px 0; vertical-align: top; }
        ul { margin: 0; padding-left: 18px; }
        @media (max-width: 900px) {
            main { padding: 12px; }
            .image-grid, .detail-grid { grid-template-columns: 1fr; }
            .card-header { display: grid; }
        }
    </style>
</head>
<body>
<main>
    <header class="page-header">
        <h1>clean replay visual review pack</h1>
        <p>RESEARCH_ONLY. Pixel overlays are review aids only; manual counts and same-battle observed_state are required before importer export.</p>
        <div class="summary">
            <span>cards: ${escapeHtml(summary.review_card_count || 0)}</span>
	            <span>flagged images: ${escapeHtml(summary.review_image_quality_flagged_count || 0)}</span>
	            <span>pixel training labels: ${escapeHtml(summary.pixel_training_label_allowed_count || 0)}</span>
	            <span>priorities: ${escapeHtml(formatPriorityCounts(summary.priority_counts || {}))}</span>
	            <span>filter: ${escapeHtml((summary.priority_filter || []).join(", ") || "all")}</span>
	            <span>schema: ${escapeHtml(pack.schema_version || "-")}</span>
            <span>generated: ${escapeHtml(pack.generated_at || "-")}</span>
        </div>
    </header>
    ${cardHtml}
</main>
</body>
</html>
`;
}

function writeFile(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const { templatePath, outputPath, priorityFilter } = resolveArgs(argv);
    const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const pack = buildCleanReplayVisualReviewPack({ template, priorityFilter });
    writeFile(outputPath, formatVisualReviewPackHtml(pack));
    process.stdout.write(`${outputPath}\n`);
    return pack;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_TEMPLATE_PATH,
    QUALITY_ORDER,
    buildCleanReplayVisualReviewPack,
    formatVisualReviewPackHtml,
    main,
    normalizeReviewResults,
    resolveArgs
};
