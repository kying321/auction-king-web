const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_IMAGE_AUDIT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-downloads-image-audit.json"
);
const DEFAULT_GAP_AUDIT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-clean-replay-sample-gap-audit.json"
);
const DEFAULT_SETTLEMENT_CANDIDATES_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-confirmed-settlement-samples.json"
);
const DEFAULT_PIXEL_REPORT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-downloads-quality-pixel-report.json"
);
const DEFAULT_CROP_SENSITIVITY_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-downloads-quality-pixel-crop-sensitivity-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    path.resolve(__dirname, ".."),
    "docs",
    "research",
    "2026-04-24-clean-replay-candidate-queue.json"
);
const PIXEL_LOW_CONFIDENCE_THRESHOLD = 0.6;
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let cropSensitivityPath = DEFAULT_CROP_SENSITIVITY_PATH;
    argv.forEach((arg) => {
        if (String(arg).startsWith("--crop-sensitivity=")) {
            cropSensitivityPath = path.resolve(String(arg).replace(/^--crop-sensitivity=/, ""));
            return;
        }
        positional.push(arg);
    });
    return {
        imageAuditPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_IMAGE_AUDIT_PATH,
        gapAuditPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_GAP_AUDIT_PATH,
        settlementCandidatesPath: positional[2] ? path.resolve(positional[2]) : DEFAULT_SETTLEMENT_CANDIDATES_PATH,
        pixelReportPath: positional[3] ? path.resolve(positional[3]) : DEFAULT_PIXEL_REPORT_PATH,
        outputPath: positional[4] ? path.resolve(positional[4]) : DEFAULT_OUTPUT_PATH,
        cropSensitivityPath
    };
}

function normalizeInputPayload(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object" && Array.isArray(payload[key])) return payload[key];
    return [];
}

function basenameOf(value) {
    return value ? path.basename(String(value)) : "";
}

function makeQueueId(basename) {
    return `review_${basename.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function firstString(values = []) {
    return Array.isArray(values) && values.length ? String(values[0]) : null;
}

function buildIndexByBasename(items = [], pathSelector) {
    const index = new Map();
    items.forEach((item) => {
        const basename = basenameOf(pathSelector(item));
        if (basename) index.set(basename, item);
    });
    return index;
}

function buildGapMaps(gapAudit = {}) {
    return gapAudit && typeof gapAudit === "object" && gapAudit.maps && typeof gapAudit.maps === "object"
        ? gapAudit.maps
        : {};
}

function shouldIncludeMapCandidate(mapId, gapMaps = {}) {
    if (!mapId) return false;
    const gap = gapMaps[mapId];
    return Boolean(gap && gap.can_adopt_default_weight === false);
}

function normalizePixelCounts(counts = {}) {
    const result = {};
    QUALITY_ORDER.forEach((quality) => {
        const value = Number(counts[quality] || 0);
        result[quality] = Number.isFinite(value) && value > 0 ? value : 0;
    });
    return result;
}

function roundConfidence(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric * 10000) / 10000;
}

function buildPixelQualityDraft(pixel = null) {
    if (!pixel || !pixel.summary || typeof pixel.summary !== "object") return null;
    const counts = normalizePixelCounts(pixel.summary.counts || {});
    const blocks = Array.isArray(pixel.blocks) ? pixel.blocks : [];
    const confidences = blocks
        .map((block) => Number(block && block.confidence))
        .filter(Number.isFinite);
    const total = Number.isFinite(Number(pixel.summary.total))
        ? Number(pixel.summary.total)
        : Object.values(counts).reduce((sum, value) => sum + value, 0);

    return {
        source: "pixel_quality_report_v2",
        status: "review_only",
        training_label_allowed: false,
        counts,
        total,
        block_count: blocks.length,
        min_confidence: confidences.length ? roundConfidence(Math.min(...confidences)) : null,
        low_confidence_threshold: PIXEL_LOW_CONFIDENCE_THRESHOLD,
        low_confidence_block_count: confidences.filter((value) => value < PIXEL_LOW_CONFIDENCE_THRESHOLD).length
    };
}

function buildPixelCropSensitivityDraft(cropSensitivity = null) {
    if (!cropSensitivity || typeof cropSensitivity !== "object") return null;
    const stable = cropSensitivity.stable === true;
    return {
        source: "quality_pixel_crop_sensitivity_v1",
        status: stable ? "stable_review_only" : "crop_sensitive_review_required",
        stable,
        action: cropSensitivity.action || (stable ? "pixel_review_only_stable_candidate" : "manual_review_required_crop_sensitive"),
        variant_count: Number.isFinite(Number(cropSensitivity.variant_count)) ? Number(cropSensitivity.variant_count) : null,
        unique_signature_count: Number.isFinite(Number(cropSensitivity.unique_signature_count))
            ? Number(cropSensitivity.unique_signature_count)
            : null,
        majority_fraction: roundConfidence(cropSensitivity.majority_fraction),
        majority_summary: cropSensitivity.majority_summary && typeof cropSensitivity.majority_summary === "object"
            ? JSON.parse(JSON.stringify(cropSensitivity.majority_summary))
            : null,
        training_label_allowed: false
    };
}

function finiteNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function buildConfirmedSettlementSummary(confirmed = null) {
    if (!confirmed || typeof confirmed !== "object") return null;
    const summary = {};
    [
        "bid_price",
        "loot_value",
        "profit",
        "quick_recycle_total_items"
    ].forEach((key) => {
        const numeric = finiteNumberOrNull(confirmed[key]);
        if (numeric !== null) summary[key] = numeric;
    });
    return Object.keys(summary).length ? summary : null;
}

function buildPixelVsSettlementTotal(pixelDraft = null, settlementSummary = null) {
    const pixelTotal = pixelDraft ? finiteNumberOrNull(pixelDraft.total) : null;
    const settlementTotal = settlementSummary
        ? finiteNumberOrNull(settlementSummary.quick_recycle_total_items)
        : null;
    if (pixelTotal === null && settlementTotal === null) return null;

    let status = "needs_manual_total_review";
    let delta = null;
    if (pixelTotal === null) {
        status = "missing_pixel_total";
    } else if (settlementTotal === null) {
        status = "missing_settlement_total";
    } else {
        delta = pixelTotal - settlementTotal;
        if (delta === 0) {
            status = "pixel_total_matches_settlement_total";
        } else if (delta < 0) {
            status = "pixel_partial_under_settlement_total";
        } else {
            status = "pixel_exceeds_settlement_total";
        }
    }

    return {
        status,
        pixel_total: pixelTotal,
        settlement_total: settlementTotal,
        delta,
        training_label_allowed: false
    };
}

function buildManualReviewTemplate({
    priority = null,
    recommendedAction = null,
    sourceImagePath = null,
    mapId = null,
    mapVariantId = null,
    confirmedSampleId = null,
    pixelDraft = null,
    settlementSummary = null
} = {}) {
    const isCleanReplayCandidate = priority === "P0" || recommendedAction === "pair_observed_state_and_actual_counts";
    const requiredFields = isCleanReplayCandidate
        ? [
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
        ]
        : [
            "manual_decision",
            "observed_state_or_discard_reason",
            "pairing_notes",
            "reviewer_notes"
        ];
    const prefill = {
        source_image_path: sourceImagePath || null,
        map_id: mapId || null,
        map_variant_id: mapVariantId || null,
        confirmed_sample_id: confirmedSampleId || null,
        pixel_total: pixelDraft && pixelDraft.total !== undefined ? pixelDraft.total : null,
        settlement_total: settlementSummary && settlementSummary.quick_recycle_total_items !== undefined
            ? settlementSummary.quick_recycle_total_items
            : null
    };
    if (pixelDraft && pixelDraft.crop_sensitivity) {
        prefill.pixel_crop_sensitivity_action = pixelDraft.crop_sensitivity.action || null;
    }

    const guardrails = [
        "do_not_use_pixel_quality_draft_as_training_label",
        "do_not_train_without_observed_state",
        "do_not_train_without_manual_actual_counts",
        "settlement_total_is_cross_check_only"
    ];
    if (pixelDraft && pixelDraft.crop_sensitivity) {
        guardrails.splice(1, 0, "do_not_train_from_crop_sensitive_pixel_counts");
    }

    return {
        schema_version: "ak_clean_replay_manual_review_v1",
        status: "needs_manual_input",
        output_target: isCleanReplayCandidate ? "clean_replay_sample_candidate" : "review_or_discard_candidate",
        training_label_allowed: false,
        required_fields: requiredFields,
        prefill,
        guardrails
    };
}

function buildBlockers({ confirmed = null, auditResult = {}, mapId = null }) {
    const blockers = [];
    if (!mapId) blockers.push("missing_map_id");
    if (confirmed && typeof confirmed.status === "string" && confirmed.status.includes("settlement_only")) {
        blockers.push("missing_observed_state", "missing_actual_counts");
    } else if (auditResult.kind === "settlement") {
        blockers.push("needs_manual_settlement_confirmation", "missing_observed_state");
    } else {
        blockers.push("needs_manual_pairing");
    }
    return Array.from(new Set(blockers));
}

function buildQueueItem({ auditResult = {}, confirmed = null, pixel = null, cropSensitivity = null, gapMaps = {} }) {
    const basename = auditResult.basename || basenameOf(auditResult.file || (confirmed && confirmed.source_image_path));
    const confirmedMapId = confirmed && confirmed.map_id ? confirmed.map_id : null;
    const mapId = confirmedMapId || firstString(auditResult.map_ids);
    const submapId = (confirmed && (confirmed.map_variant_id || confirmed.submap_id)) || firstString(auditResult.submap_ids);
    const gap = mapId && gapMaps[mapId] ? gapMaps[mapId] : null;
    const isConfirmedSettlementOnly = confirmed
        && typeof confirmed.status === "string"
        && confirmed.status.includes("settlement_only");
    const isAuditSettlement = auditResult.kind === "settlement"
        || Number(auditResult.settlement_matched_fields || 0) > 0
        || Number(auditResult.settlement_item_candidates || 0) > 0;
    const hasMapContext = Boolean(mapId || submapId || Number(auditResult.battle_matched_fields || 0) > 0);

    if (!isConfirmedSettlementOnly && !isAuditSettlement && !hasMapContext) return null;
    if (mapId && !shouldIncludeMapCandidate(mapId, gapMaps) && !isAuditSettlement) return null;

    let priority = "P2";
    let recommendedAction = "manual_pair_or_discard";
    if (isConfirmedSettlementOnly) {
        priority = "P0";
        recommendedAction = "pair_observed_state_and_actual_counts";
    } else if (isAuditSettlement) {
        priority = "P1";
        recommendedAction = "manual_confirm_settlement_then_pair_observed_state";
    }
    const pixelQualityDraft = buildPixelQualityDraft(pixel);
    const pixelCropSensitivityDraft = buildPixelCropSensitivityDraft(cropSensitivity);
    if (pixelQualityDraft && pixelCropSensitivityDraft) {
        pixelQualityDraft.crop_sensitivity = pixelCropSensitivityDraft;
    }
    const confirmedSettlementSummary = buildConfirmedSettlementSummary(confirmed);

    return {
        id: makeQueueId(basename),
        priority,
        recommended_action: recommendedAction,
        source_image_path: auditResult.file || (confirmed && confirmed.source_image_path) || null,
        basename,
        confirmed_sample_id: confirmed ? confirmed.id || null : null,
        map_id: mapId,
        map_variant_id: submapId,
        audit_kind: auditResult.kind || null,
        battle_matched_fields: Number(auditResult.battle_matched_fields || 0),
        settlement_matched_fields: Number(auditResult.settlement_matched_fields || 0),
        settlement_item_candidates: Number(auditResult.settlement_item_candidates || 0),
        pixel_overlay_path: pixel && pixel.overlay_path ? pixel.overlay_path : null,
        pixel_quality_draft: pixelQualityDraft,
        confirmed_settlement_summary: confirmedSettlementSummary,
        pixel_vs_settlement_total: buildPixelVsSettlementTotal(pixelQualityDraft, confirmedSettlementSummary),
        manual_review_template: buildManualReviewTemplate({
            priority,
            recommendedAction,
            sourceImagePath: auditResult.file || (confirmed && confirmed.source_image_path) || null,
            mapId,
            mapVariantId: submapId,
            confirmedSampleId: confirmed ? confirmed.id || null : null,
            pixelDraft: pixelQualityDraft,
            settlementSummary: confirmedSettlementSummary
        }),
        gap: gap ? gap.gaps || null : null,
        blockers: buildBlockers({ confirmed, auditResult, mapId }),
        preview: auditResult.preview || null,
        warnings: Array.isArray(auditResult.warnings) ? auditResult.warnings : []
    };
}

function summarizeItems(items = []) {
    const priorityCounts = {};
    const actionCounts = {};
    const mapCounts = {};
    let pixelDraftCount = 0;
    let pixelDraftWithLowConfidenceCount = 0;
    let pixelCropSensitiveCount = 0;
    let pixelCropStableCount = 0;
    let pixelTrainingLabelAllowedCount = 0;
    let manualReviewTemplateCount = 0;
    let manualReviewTrainableCount = 0;
    items.forEach((item) => {
        priorityCounts[item.priority] = (priorityCounts[item.priority] || 0) + 1;
        actionCounts[item.recommended_action] = (actionCounts[item.recommended_action] || 0) + 1;
        const mapKey = item.map_id || "unknown";
        mapCounts[mapKey] = (mapCounts[mapKey] || 0) + 1;
        if (item.pixel_quality_draft) {
            pixelDraftCount += 1;
            if (Number(item.pixel_quality_draft.low_confidence_block_count || 0) > 0) {
                pixelDraftWithLowConfidenceCount += 1;
            }
            if (item.pixel_quality_draft.crop_sensitivity) {
                if (item.pixel_quality_draft.crop_sensitivity.stable === true) {
                    pixelCropStableCount += 1;
                } else {
                    pixelCropSensitiveCount += 1;
                }
                if (item.pixel_quality_draft.crop_sensitivity.training_label_allowed === true) {
                    pixelTrainingLabelAllowedCount += 1;
                }
            }
            if (item.pixel_quality_draft.training_label_allowed === true) {
                pixelTrainingLabelAllowedCount += 1;
            }
        }
        if (item.manual_review_template) {
            manualReviewTemplateCount += 1;
            if (item.manual_review_template.training_label_allowed === true) {
                manualReviewTrainableCount += 1;
            }
        }
    });
    return {
        queue_count: items.length,
        priority_counts: priorityCounts,
        action_counts: actionCounts,
        map_counts: mapCounts,
        pixel_draft_count: pixelDraftCount,
        pixel_draft_with_low_confidence_count: pixelDraftWithLowConfidenceCount,
        pixel_crop_sensitive_count: pixelCropSensitiveCount,
        pixel_crop_stable_count: pixelCropStableCount,
        pixel_training_label_allowed_count: pixelTrainingLabelAllowedCount,
        manual_review_template_count: manualReviewTemplateCount,
        manual_review_trainable_count: manualReviewTrainableCount
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

function countRows(counts = {}) {
    const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
    if (!entries.length) return "- none";
    return entries.map(([key, value]) => `| ${markdownCode(key)} | ${markdownCode(value)} |`).join("\n");
}

function tableRow(cells = []) {
    return `| ${cells.join(" | ")} |`;
}

function formatPixelDraft(draft = null) {
    if (!draft || !draft.counts) return "-";
    const nonZeroCounts = QUALITY_ORDER
        .filter((quality) => Number(draft.counts[quality] || 0) > 0)
        .map((quality) => `${quality}:${draft.counts[quality]}`);
    const countText = nonZeroCounts.length ? nonZeroCounts.join(", ") : "none";
    const minConfidenceText = draft.min_confidence === null || draft.min_confidence === undefined
        ? "min=-"
        : `min=${draft.min_confidence}`;
    const cropText = draft.crop_sensitivity
        ? `; crop=${draft.crop_sensitivity.action || draft.crop_sensitivity.status || "-"}; sig=${draft.crop_sensitivity.unique_signature_count ?? "-"}; majority=${draft.crop_sensitivity.majority_fraction ?? "-"}`
        : "";
    return `${countText}; total=${draft.total || 0}; low=${draft.low_confidence_block_count || 0}; ${minConfidenceText}${cropText}; review_only`;
}

function formatPixelVsSettlementTotal(check = null) {
    if (!check) return "-";
    return [
        check.status || "needs_manual_total_review",
        `pixel_total=${check.pixel_total === null || check.pixel_total === undefined ? "-" : check.pixel_total}`,
        `settlement_total=${check.settlement_total === null || check.settlement_total === undefined ? "-" : check.settlement_total}`,
        `delta=${check.delta === null || check.delta === undefined ? "-" : check.delta}`,
        "review_only"
    ].join("; ");
}

function formatManualReviewFields(template = null) {
    if (!template || !Array.isArray(template.required_fields)) return "-";
    return template.required_fields.join(", ");
}

function formatCandidateQueueMarkdown(queue, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = queue && queue.summary ? queue.summary : summarizeItems(queue && queue.items ? queue.items : []);
    const items = Array.isArray(queue && queue.items) ? queue.items : [];
    const p0Items = items.filter((item) => item.priority === "P0");
    const reviewItems = items.slice(0, 20);
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const priorityRows = countRows(summary.priority_counts);
    const actionRows = countRows(summary.action_counts);
    const mapRows = countRows(summary.map_counts);
    const p0Rows = p0Items.length
        ? p0Items.map((item) => tableRow([
            markdownCode(item.basename),
            markdownCode(item.map_id),
            markdownCode(item.map_variant_id),
            markdownCell(item.recommended_action),
            markdownCell(formatPixelDraft(item.pixel_quality_draft)),
            markdownCell(formatPixelVsSettlementTotal(item.pixel_vs_settlement_total)),
            markdownCell((item.blockers || []).join(", ")),
            markdownCode(item.pixel_overlay_path)
        ])).join("\n")
        : "| `-` | `-` | `-` | - | - | - | - | `-` |";
    const reviewRows = reviewItems.length
        ? reviewItems.map((item) => tableRow([
            markdownCode(item.priority),
            markdownCode(item.basename),
            markdownCode(item.map_id),
            markdownCell(item.recommended_action),
            markdownCell(formatPixelDraft(item.pixel_quality_draft)),
            markdownCell(formatPixelVsSettlementTotal(item.pixel_vs_settlement_total)),
            markdownCell((item.blockers || []).join(", "))
        ])).join("\n")
        : "| `-` | `-` | `-` | - | - | - | - |";

    return `# 2026-04-24 clean replay 候选队列

- 变更类: \`RESEARCH_ONLY\`
- JSON: \`${jsonDisplayPath}\`
- queue count: \`${summary.queue_count || 0}\`
- pixel drafts: \`${summary.pixel_draft_count || 0}\`
- low-confidence drafts: \`${summary.pixel_draft_with_low_confidence_count || 0}\`
- crop-sensitive drafts: \`${summary.pixel_crop_sensitive_count || 0}\`
- crop-stable drafts: \`${summary.pixel_crop_stable_count || 0}\`
- training-label allowed: \`${summary.pixel_training_label_allowed_count || 0}\`
- manual review templates: \`${summary.manual_review_template_count || 0}\`
- manual review trainable: \`${summary.manual_review_trainable_count || 0}\`
- 用途: 将 settlement-only、疑似结算图、带地图上下文图片排成复核队列；不把像素识别结果直接当训练标签。

## 优先级计数

| priority | count |
| --- | ---: |
${priorityRows}

## 动作计数

| action | count |
| --- | ---: |
${actionRows}

## 地图计数

| map | count |
| --- | ---: |
${mapRows}

## P0 优先复核

| basename | map | variant | action | 像素草稿 | 总数校验 | blockers | pixel overlay |
| --- | --- | --- | --- | --- | --- | --- | --- |
${p0Rows}

## 前 20 条队列

| priority | basename | map | action | 像素草稿 | 总数校验 | blockers |
| --- | --- | --- | --- | --- | --- | --- |
${reviewRows}

## 人工填写字段

| priority | basename | required fields |
| --- | --- | --- |
${reviewItems.length ? reviewItems.map((item) => tableRow([
        markdownCode(item.priority),
        markdownCode(item.basename),
        markdownCell(formatManualReviewFields(item.manual_review_template))
    ])).join("\n") : "| `-` | `-` | - |"}

## 复核规则

- \`P0\`: 已人工确认 settlement-only，优先补同局 observed_state 和 actual_counts。
- \`P1\`: 机器审计疑似结算图，先人工确认是不是可用结算样本。
- \`P2\`: 有地图或战局上下文，但仍需人工配对或丢弃。
- pixel overlay 只用于定位右侧品质轮廓，不进入 count prior 训练标签。
`;
}

function buildCleanReplayCandidateQueue({
    imageAudit = {},
    gapAudit = {},
    settlementCandidates = [],
    pixelReport = {},
    cropSensitivityReport = {}
} = {}) {
    const auditResults = normalizeInputPayload(imageAudit, "results");
    const confirmedCandidates = normalizeInputPayload(settlementCandidates, "samples");
    const pixelResults = normalizeInputPayload(pixelReport, "results");
    const cropSensitivityResults = normalizeInputPayload(cropSensitivityReport, "results");
    const confirmedByBasename = buildIndexByBasename(confirmedCandidates, (item) => item.source_image_path);
    const pixelByBasename = buildIndexByBasename(pixelResults, (item) => item.basename || item.file);
    const cropSensitivityByBasename = buildIndexByBasename(cropSensitivityResults, (item) => item.basename || item.file);
    const gapMaps = buildGapMaps(gapAudit);
    const items = [];
    const seen = new Set();

    auditResults.forEach((auditResult) => {
        const basename = auditResult.basename || basenameOf(auditResult.file);
        const item = buildQueueItem({
            auditResult,
            confirmed: confirmedByBasename.get(basename) || null,
            pixel: pixelByBasename.get(basename) || null,
            cropSensitivity: cropSensitivityByBasename.get(basename) || null,
            gapMaps
        });
        if (!item || seen.has(item.id)) return;
        seen.add(item.id);
        items.push(item);
    });

    confirmedCandidates.forEach((confirmed) => {
        const basename = basenameOf(confirmed.source_image_path);
        const id = makeQueueId(basename);
        if (seen.has(id)) return;
        const item = buildQueueItem({
            auditResult: {
                file: confirmed.source_image_path,
                basename,
                kind: "confirmed_settlement_only",
                map_ids: confirmed.map_id ? [confirmed.map_id] : [],
                submap_ids: confirmed.map_variant_id ? [confirmed.map_variant_id] : []
            },
            confirmed,
            pixel: pixelByBasename.get(basename) || null,
            cropSensitivity: cropSensitivityByBasename.get(basename) || null,
            gapMaps
        });
        if (!item) return;
        seen.add(item.id);
        items.push(item);
    });

    const priorityRank = { P0: 0, P1: 1, P2: 2 };
    items.sort((left, right) => {
        const priorityDelta = (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9);
        if (priorityDelta !== 0) return priorityDelta;
        return String(left.map_id || "").localeCompare(String(right.map_id || ""))
            || String(left.basename).localeCompare(String(right.basename));
    });

    return {
        schema_version: "ak_clean_replay_candidate_queue_v1",
        generated_at: new Date().toISOString(),
        summary: summarizeItems(items),
        items
    };
}

function readOptionalJson(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
    const {
        imageAuditPath,
        gapAuditPath,
        settlementCandidatesPath,
        pixelReportPath,
        outputPath,
        cropSensitivityPath
    } = resolveArgs(argv);
    const queue = buildCleanReplayCandidateQueue({
        imageAudit: JSON.parse(fs.readFileSync(imageAuditPath, "utf8")),
        gapAudit: JSON.parse(fs.readFileSync(gapAuditPath, "utf8")),
        settlementCandidates: JSON.parse(fs.readFileSync(settlementCandidatesPath, "utf8")),
        pixelReport: JSON.parse(fs.readFileSync(pixelReportPath, "utf8")),
        cropSensitivityReport: readOptionalJson(cropSensitivityPath)
    });
    writeJson(outputPath, queue);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatCandidateQueueMarkdown(queue, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return queue;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CROP_SENSITIVITY_PATH,
    DEFAULT_GAP_AUDIT_PATH,
    DEFAULT_IMAGE_AUDIT_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_PIXEL_REPORT_PATH,
    DEFAULT_SETTLEMENT_CANDIDATES_PATH,
    PIXEL_LOW_CONFIDENCE_THRESHOLD,
    buildCleanReplayCandidateQueue,
    buildConfirmedSettlementSummary,
    buildManualReviewTemplate,
    buildPixelCropSensitivityDraft,
    buildPixelQualityDraft,
    buildPixelVsSettlementTotal,
    buildQueueItem,
    formatCandidateQueueMarkdown,
    formatManualReviewFields,
    formatPixelDraft,
    formatPixelVsSettlementTotal,
    main,
    normalizeInputPayload,
    resolveArgs
};
