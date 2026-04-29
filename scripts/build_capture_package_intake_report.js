const fs = require("node:fs");
const path = require("node:path");
const {
    captureGroupKey,
    groupCapturePackages
} = require("./build_capture_full_count_review_template.js");
const {
    QUALITY_ORDER,
    getSettlementSampleAuthorityReadiness,
    getSettlementSampleCountFitReadiness,
    normalizeActualCounts
} = require("../src/browser/sample_dataset.js");
const {
    formatAverageDisplayFromTotalCells
} = require("../src/core/estimator.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-capture-package-intake-report.json"
);
const DEFAULT_GROUP_MAX_GAP_MS = 120000;
const POSTERIOR_RISK_FLAG_ORDER = [
    "extreme_orange_avg_needs_orange_count_confirmation",
    "red_residual_sensitive_to_missing_orange_count",
    "model_predicted_red_count_extreme",
    "model_predicted_red_cells_extreme",
    "model_red_share_above_25pct"
];
const POSTERIOR_RISK_FLAG_SET = new Set(POSTERIOR_RISK_FLAG_ORDER);

function resolveArgs(argv = process.argv.slice(2)) {
    const capturePackagePaths = [];
    const result = {
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: new Date().toISOString(),
        groupMaxGapMs: DEFAULT_GROUP_MAX_GAP_MS
    };

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

        if (flag === "--output") {
            result.outputPath = path.resolve(nextValue());
        } else if (flag === "--generated-at") {
            result.generatedAt = nextValue();
        } else if (flag === "--group-max-gap-ms") {
            const numeric = Number(nextValue());
            if (!Number.isFinite(numeric) || numeric <= 0) throw new Error("--group-max-gap-ms 必须为正数");
            result.groupMaxGapMs = numeric;
        } else {
            capturePackagePaths.push(path.resolve(arg));
        }
    }

    return {
        ...result,
        capturePackagePaths
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function normalizeAverageText(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("-.")) return `-0${trimmed.slice(1)}`;
    if (trimmed.startsWith(".")) return `0${trimmed}`;
    return trimmed;
}

function getAverageInterval(avg, count, { precision = 2, roundingMode = "truncate" } = {}) {
    if (!Number.isFinite(avg) || !Number.isInteger(count) || count <= 0) return null;
    const step = 10 ** (-precision);
    let low;
    let high;
    if (roundingMode === "round") {
        const half = step / 2;
        low = Math.ceil((avg - half) * count - 1e-12);
        high = Math.floor((avg + half) * count - 1e-12);
    } else {
        low = Math.ceil(avg * count - 1e-12);
        high = Math.floor((avg + step - 1e-12) * count);
    }
    if (low > high) return null;
    return [low, high];
}

function compactObject(value = {}) {
    if (!isPlainObject(value)) return {};
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== "")
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

function filterPosteriorRiskFlags(flags = []) {
    return normalizeStringList(flags).filter((flag) => POSTERIOR_RISK_FLAG_SET.has(flag));
}

function differenceOrdered(left = [], right = []) {
    const rightSet = new Set(right);
    return left.filter((entry) => !rightSet.has(entry));
}

function extractObservedState(payload = {}) {
    if (isPlainObject(payload.observed_state)) return cloneValue(payload.observed_state);
    if (isPlainObject(payload.settlement_sample?.observed_state)) return cloneValue(payload.settlement_sample.observed_state);
    if (isPlainObject(payload.settlement_sample?.state)) return cloneValue(payload.settlement_sample.state);
    return {};
}

function extractFieldValues(payload = {}) {
    if (isPlainObject(payload.field_values)) return cloneValue(payload.field_values);
    if (isPlainObject(payload.settlement_sample?.field_values)) return cloneValue(payload.settlement_sample.field_values);
    return {};
}

function summarizeScreenshot(payload = {}) {
    const attachment = payload.screenshot_attachment || payload.settlement_sample?.metadata?.screenshot_attachment || null;
    if (!attachment) {
        return {
            present: false,
            name: null,
            type: null,
            stored_width: null,
            stored_height: null,
            original_width: null,
            original_height: null,
            size: null,
            has_data_url: false
        };
    }
    return {
        present: true,
        name: attachment.name || null,
        type: attachment.type || attachment.mime_type || null,
        stored_width: normalizeNumber(attachment.stored_width ?? attachment.width),
        stored_height: normalizeNumber(attachment.stored_height ?? attachment.height),
        original_width: normalizeNumber(attachment.original_width),
        original_height: normalizeNumber(attachment.original_height),
        size: normalizeNumber(attachment.size),
        has_data_url: Boolean(attachment.data_url)
    };
}

function summarizeAnalysisSnapshot(payload = {}) {
    const snapshot = payload.analysis_snapshot || {};
    const summary = snapshot.summary || {};
    const valuation = snapshot.valuation || {};
    const posteriorRisk = extractEmbeddedPosteriorRisk(payload);
    return {
        status: snapshot.status || null,
        phase: snapshot.phase || null,
        count_means: isPlainObject(summary.count_means) ? cloneValue(summary.count_means) : {},
        cell_means: isPlainObject(summary.cell_means) ? cloneValue(summary.cell_means) : {},
        valuation: {
            mean_value: normalizeNumber(valuation.mean_value),
            q05: normalizeNumber(valuation.q05),
            q50: normalizeNumber(valuation.q50),
            q95: normalizeNumber(valuation.q95)
        },
        posterior_risk: posteriorRisk.present ? posteriorRisk.value : null
    };
}

function extractEmbeddedPosteriorRisk(payload = {}) {
    const risk = payload.analysis_snapshot?.posterior_risk;
    if (!isPlainObject(risk)) {
        return {
            present: false,
            value: null
        };
    }
    return {
        present: true,
        value: {
            status: risk.status ? String(risk.status) : null,
            warnings: normalizeStringList(risk.warnings),
            flags: normalizeStringList(risk.flags),
            constraint_diagnostics: isPlainObject(risk.constraint_diagnostics)
                ? cloneValue(risk.constraint_diagnostics)
                : {}
        }
    };
}

function extractActualCounts(payload = {}) {
    return normalizeActualCounts(payload.settlement_sample?.actual_counts || payload.actual_counts || {});
}

function inferCountFromTotalAndAverage(totalCells, avgCells, {
    rawText = null,
    roundingMode = "truncate",
    precision = 2
} = {}) {
    const total = normalizeNumber(totalCells);
    const avg = normalizeNumber(avgCells);
    if (!Number.isFinite(total) || !Number.isFinite(avg) || avg <= 0) return null;
    const inferred = total / avg;
    const rounded = Math.round(inferred);
    return Math.abs(inferred - rounded) <= 1e-9 && rounded >= 0 ? rounded : null;
}

function inferCountAnchorFromTotalAndAverage(totalCells, avgCells, options = {}) {
    const exact = inferCountFromTotalAndAverage(totalCells, avgCells);
    if (Number.isFinite(exact)) {
        return {
            count: exact,
            source: "total_cells_div_avg_cells"
        };
    }

    const total = normalizeNumber(totalCells);
    const avg = normalizeNumber(avgCells);
    if (!Number.isInteger(total) || total < 0 || !Number.isFinite(avg) || avg <= 0) {
        return {
            count: null,
            source: null
        };
    }

    const normalizedText = normalizeAverageText(options.rawText);
    const roundingMode = options.roundingMode === "round" ? "round" : "truncate";
    const precision = Number.isInteger(options.precision) && options.precision >= 0 ? options.precision : 2;
    const candidates = [];
    const maxCount = Math.max(1, total);

    for (let count = 1; count <= maxCount; count += 1) {
        if (normalizedText && roundingMode === "truncate") {
            if (formatAverageDisplayFromTotalCells(total, count, precision) === normalizedText) {
                candidates.push(count);
            }
            continue;
        }
        const interval = getAverageInterval(avg, count, { precision, roundingMode });
        if (interval && total >= interval[0] && total <= interval[1]) {
            candidates.push(count);
        }
    }

    if (candidates.length === 1) {
        return {
            count: candidates[0],
            source: normalizedText && roundingMode === "truncate"
                ? "total_cells_div_avg_display"
                : `total_cells_div_avg_${roundingMode}_interval`
        };
    }

    return {
        count: null,
        source: null
    };
}

function qualityFieldPrefix(quality) {
    return {
        w: "white",
        g: "green",
        b: "blue",
        p: "purple",
        o: "orange",
        r: "red"
    }[quality] || null;
}

function readQualityCount(fields = {}, observed = {}, quality) {
    const prefix = qualityFieldPrefix(quality);
    if (!prefix) return { count: null, source: null };
    const legacyCountKey = {
        w: "r5_white_count",
        g: "r3_green_count",
        b: "r1_blue_count",
        p: "r2_purple_count",
        o: "r2_orange_count",
        r: null
    }[quality];
    const direct = normalizeNumber(fields[`${prefix}_count`] ?? (legacyCountKey ? observed[legacyCountKey] : null));
    if (Number.isFinite(direct)) return { count: direct, source: "direct_count" };
    const totalCells = normalizeNumber(fields[`${prefix}_total_cells`] ?? observed[`${quality}_total_cells`]);
    const avgLegacyKey = {
        b: "r4_blue_avg",
        p: "r3_purple_avg",
        o: "r2_orange_avg"
    }[quality];
    const avgCells = normalizeNumber(fields[`${prefix}_avg_cells`] ?? (avgLegacyKey ? observed[avgLegacyKey] : null));
    const avgText = normalizeAverageText(fields[`${prefix}_avg_cells`])
        || (avgLegacyKey ? normalizeAverageText(observed[`${avgLegacyKey}_text`]) : null);
    const roundingMode = avgLegacyKey && observed[`${avgLegacyKey}_rounding_mode`] === "round" ? "round" : "truncate";
    const inferred = inferCountAnchorFromTotalAndAverage(totalCells, avgCells, {
        rawText: avgText,
        roundingMode
    });
    if (Number.isFinite(inferred.count)) return inferred;
    return { count: null, source: null };
}

function buildConstraintDiagnostics(payload = {}) {
    const fields = extractFieldValues(payload);
    const observed = extractObservedState(payload);
    const totalItems = normalizeNumber(fields.total_items ?? observed.r1_total_items);
    const blue = readQualityCount(fields, observed, "b");
    const purple = readQualityCount(fields, observed, "p");
    const orange = readQualityCount(fields, observed, "o");
    const blueCount = blue.count;
    const purpleCount = purple.count;
    const orangeCount = orange.count;
    const whiteGreenTotalCells = normalizeNumber(fields.white_green_total_cells ?? observed.r2_white_green_cells);
    const whiteGreenAvgCells = normalizeNumber(fields.white_green_avg_cells ?? observed.r3_white_green_avg);
    const directWhiteGreenCount = normalizeNumber(fields.white_green_total_count ?? observed.r5_white_green_total);
    const orangeAvgCells = normalizeNumber(fields.orange_avg_cells ?? observed.r2_orange_avg);
    const whiteGreenAvgText = normalizeAverageText(fields.white_green_avg_cells)
        || normalizeAverageText(observed.r3_white_green_avg_text);
    const whiteGreenRoundingMode = observed.r3_white_green_avg_rounding_mode === "round" ? "round" : "truncate";
    const inferredWhiteGreen = inferCountAnchorFromTotalAndAverage(whiteGreenTotalCells, whiteGreenAvgCells, {
        rawText: whiteGreenAvgText,
        roundingMode: whiteGreenRoundingMode
    });
    const inferredWhiteGreenCount = inferredWhiteGreen.count;
    const whiteGreenCount = Number.isFinite(directWhiteGreenCount) ? directWhiteGreenCount : inferredWhiteGreenCount;
    const knownNonRedCount = [blueCount, purpleCount, whiteGreenCount, orangeCount]
        .filter(Number.isFinite)
        .reduce((sum, value) => sum + value, 0);
    const orangeRedUnknownPool = Number.isFinite(totalItems)
        ? totalItems - knownNonRedCount
        : null;
    const knownCountBalanceComplete = [totalItems, blueCount, purpleCount, whiteGreenCount]
        .every(Number.isFinite);

    return {
        total_items: Number.isFinite(totalItems) ? totalItems : null,
        blue_count: Number.isFinite(blueCount) ? blueCount : null,
        blue_count_source: blue.source,
        purple_count: Number.isFinite(purpleCount) ? purpleCount : null,
        purple_count_source: purple.source,
        orange_count: Number.isFinite(orangeCount) ? orangeCount : null,
        orange_count_source: orange.source,
        white_green_total_cells: Number.isFinite(whiteGreenTotalCells) ? whiteGreenTotalCells : null,
        white_green_avg_cells: Number.isFinite(whiteGreenAvgCells) ? whiteGreenAvgCells : null,
        white_green_total_count: Number.isFinite(whiteGreenCount) ? whiteGreenCount : null,
        white_green_total_count_source: Number.isFinite(directWhiteGreenCount)
            ? "direct_count"
            : (Number.isFinite(inferredWhiteGreenCount) ? inferredWhiteGreen.source : null),
        inferred_white_green_count: Number.isFinite(inferredWhiteGreenCount) ? inferredWhiteGreenCount : null,
        orange_avg_cells: Number.isFinite(orangeAvgCells) ? orangeAvgCells : null,
        orange_red_unknown_pool: Number.isFinite(orangeRedUnknownPool) ? orangeRedUnknownPool : null,
        known_count_balance_complete: knownCountBalanceComplete,
        orange_count_missing: !Number.isFinite(orangeCount)
    };
}

function classifyCaptureUse(payload = {}) {
    const settlementSample = payload.settlement_sample || {
        field_values: extractFieldValues(payload),
        observed_state: extractObservedState(payload),
        actual_counts: extractActualCounts(payload),
        actual_value: payload.actual_value
    };
    const authorityReadiness = getSettlementSampleAuthorityReadiness(settlementSample);
    const countFitReadiness = getSettlementSampleCountFitReadiness(settlementSample);
    if (countFitReadiness.ready) return "count_fit_ready";
    if (authorityReadiness.missing_actual_counts || countFitReadiness.missing_full_actual_counts) {
        return "needs_manual_counts";
    }
    return "review_only_observation";
}

function addRiskFlag(target, flag) {
    if (flag && !target.includes(flag)) target.push(flag);
}

function buildRiskFlagGroups(payload = {}, analysis = summarizeAnalysisSnapshot(payload), diagnostics = buildConstraintDiagnostics(payload)) {
    const currentInputRiskFlags = [];
    const embeddedSnapshotRiskFlags = [];
    const legacyMixedRiskFlags = [];
    const addCurrent = (flag) => {
        addRiskFlag(currentInputRiskFlags, flag);
        addRiskFlag(legacyMixedRiskFlags, flag);
    };
    const addEmbedded = (flag) => {
        addRiskFlag(embeddedSnapshotRiskFlags, flag);
        addRiskFlag(legacyMixedRiskFlags, flag);
    };
    const redMean = normalizeNumber(analysis.count_means.r);
    const redCellMean = normalizeNumber(analysis.cell_means.r);
    const totalItems = normalizeNumber(extractFieldValues(payload).total_items ?? extractObservedState(payload).r1_total_items);
    if (Number.isFinite(redMean) && redMean >= 8) addEmbedded("model_predicted_red_count_extreme");
    if (Number.isFinite(redMean) && Number.isFinite(totalItems) && totalItems > 0 && redMean / totalItems >= 0.25) {
        addEmbedded("model_red_share_above_25pct");
    }
    if (Number.isFinite(redCellMean) && redCellMean >= 30) addEmbedded("model_predicted_red_cells_extreme");
    if (diagnostics.orange_count_missing && Number.isFinite(diagnostics.orange_avg_cells) && diagnostics.orange_avg_cells >= 8) {
        addCurrent("extreme_orange_avg_needs_orange_count_confirmation");
    }
    if (
        diagnostics.orange_count_missing
        && Number.isFinite(diagnostics.orange_red_unknown_pool)
        && diagnostics.orange_red_unknown_pool >= 6
        && Number.isFinite(redMean)
        && redMean >= diagnostics.orange_red_unknown_pool * 0.45
    ) {
        addEmbedded("red_residual_sensitive_to_missing_orange_count");
    }
    if (!Object.keys(extractActualCounts(payload)).length) addCurrent("missing_manual_actual_counts");
    if (!summarizeScreenshot(payload).present) addCurrent("missing_screenshot");
    return {
        risk_flags: currentInputRiskFlags,
        current_input_risk_flags: currentInputRiskFlags.slice(),
        embedded_snapshot_risk_flags: embeddedSnapshotRiskFlags,
        legacy_mixed_risk_flags: legacyMixedRiskFlags
    };
}

function buildPosteriorRiskConsistency(embeddedPosteriorRisk, recomputedRiskFlags = []) {
    const recomputedPosteriorFlags = filterPosteriorRiskFlags(recomputedRiskFlags);
    if (!embeddedPosteriorRisk) {
        return {
            embedded_present: false,
            status: "not_embedded",
            missing_from_embedded: recomputedPosteriorFlags,
            missing_from_recomputed: []
        };
    }
    const embeddedFlags = filterPosteriorRiskFlags(embeddedPosteriorRisk.flags);
    const missingFromEmbedded = differenceOrdered(recomputedPosteriorFlags, embeddedFlags);
    const missingFromRecomputed = differenceOrdered(embeddedFlags, recomputedPosteriorFlags);
    return {
        embedded_present: true,
        status: missingFromEmbedded.length || missingFromRecomputed.length ? "mismatch" : "matching",
        missing_from_embedded: missingFromEmbedded,
        missing_from_recomputed: missingFromRecomputed
    };
}

function buildCaptureEntry(capture) {
    const payload = capture.payload || {};
    const fieldValues = extractFieldValues(payload);
    const observedState = extractObservedState(payload);
    const actualCounts = extractActualCounts(payload);
    const analysis = summarizeAnalysisSnapshot(payload);
    const diagnostics = buildConstraintDiagnostics(payload);
    const riskFlagGroups = buildRiskFlagGroups(payload, analysis, diagnostics);
    return {
        input_path: capture.input_path,
        basename: path.basename(capture.input_path || "capture.json"),
        schema_version: payload.schema_version || null,
        export_kind: payload.export_kind || null,
        exported_at: payload.exported_at || null,
        map_id: payload.map_id || payload.settlement_sample?.map_id || null,
        template_id: payload.template_id || null,
        template_label: payload.template_label || null,
        config_source_version: payload.config_source_version || null,
        capture_group_key: captureGroupKey(capture),
        field_values_compact: compactObject(fieldValues),
        observed_state: observedState,
        actual_counts: actualCounts,
        actual_value: normalizeNumber(payload.settlement_sample?.actual_value ?? payload.actual_value),
        actual_cells: normalizeNumber(payload.settlement_sample?.actual_cells ?? payload.actual_cells),
        screenshot: summarizeScreenshot(payload),
        analysis_snapshot: analysis,
        constraint_diagnostics: diagnostics,
        use_class: classifyCaptureUse(payload),
        training_label_allowed: false,
        risk_flag_scope: "current_input_and_data_quality_only",
        risk_flags: riskFlagGroups.risk_flags,
        current_input_risk_flags: riskFlagGroups.current_input_risk_flags,
        embedded_snapshot_risk_flags: riskFlagGroups.embedded_snapshot_risk_flags,
        legacy_mixed_risk_flags: riskFlagGroups.legacy_mixed_risk_flags,
        posterior_risk_consistency: buildPosteriorRiskConsistency(
            analysis.posterior_risk,
            riskFlagGroups.legacy_mixed_risk_flags
        )
    };
}

function summarizeEntries(entries = [], groups = []) {
    const byUseClass = {};
    const mapCounts = {};
    entries.forEach((entry) => {
        byUseClass[entry.use_class] = (byUseClass[entry.use_class] || 0) + 1;
        if (entry.map_id) mapCounts[entry.map_id] = (mapCounts[entry.map_id] || 0) + 1;
    });
    const redMeans = entries.map((entry) => normalizeNumber(entry.analysis_snapshot.count_means.r)).filter(Number.isFinite);
    const redCellMeans = entries.map((entry) => normalizeNumber(entry.analysis_snapshot.cell_means.r)).filter(Number.isFinite);
    const maxEmbeddedRedCountMean = redMeans.length ? Math.max(...redMeans) : null;
    const maxEmbeddedRedCellMean = redCellMeans.length ? Math.max(...redCellMeans) : null;
    return {
        capture_package_count: entries.length,
        capture_group_count: groups.length,
        screenshot_present_count: entries.filter((entry) => entry.screenshot.present).length,
        count_fit_ready_count: entries.filter((entry) => entry.use_class === "count_fit_ready").length,
        needs_manual_counts_count: entries.filter((entry) => entry.use_class === "needs_manual_counts").length,
        training_label_allowed_count: entries.filter((entry) => entry.training_label_allowed === true).length,
        current_input_risk_flagged_count: entries.filter((entry) => (entry.current_input_risk_flags || []).length).length,
        embedded_snapshot_risk_flagged_count: entries.filter((entry) => (entry.embedded_snapshot_risk_flags || []).length).length,
        legacy_mixed_risk_flagged_count: entries.filter((entry) => (entry.legacy_mixed_risk_flags || []).length).length,
        embedded_posterior_risk_count: entries.filter((entry) => Boolean(entry.analysis_snapshot.posterior_risk)).length,
        posterior_risk_mismatch_count: entries.filter((entry) => entry.posterior_risk_consistency.status === "mismatch").length,
        use_class_counts: byUseClass,
        map_counts: mapCounts,
        max_embedded_red_count_mean: maxEmbeddedRedCountMean,
        max_embedded_red_cell_mean: maxEmbeddedRedCellMean,
        max_model_red_count_mean: maxEmbeddedRedCountMean,
        max_model_red_cell_mean: maxEmbeddedRedCellMean
    };
}

function formatEmbeddedRiskFlagForMarkdown(flag) {
    const normalized = String(flag || "");
    return normalized.startsWith("embedded_") ? normalized : `embedded_${normalized}`;
}

function formatMarkdownReport(report) {
    const rows = [
        "# Capture Package Intake Report",
        "",
        `- change class: \`${report.change_class}\``,
        `- capture packages: \`${report.summary.capture_package_count}\``,
        `- capture groups: \`${report.summary.capture_group_count}\``,
        `- count-fit ready: \`${report.summary.count_fit_ready_count}\``,
        `- needs manual counts: \`${report.summary.needs_manual_counts_count}\``,
        `- training label allowed: \`${report.summary.training_label_allowed_count}\``,
        `- current input risk flagged: \`${report.summary.current_input_risk_flagged_count}\``,
        `- embedded snapshot risk flagged: \`${report.summary.embedded_snapshot_risk_flagged_count}\``,
        `- embedded posterior risk: \`${report.summary.embedded_posterior_risk_count}\``,
        `- posterior risk mismatches: \`${report.summary.posterior_risk_mismatch_count}\``,
        "",
        "## Entries",
        "",
        "| exported_at | use | total | blue | p_avg | o_avg | wg_cells | embedded_r | embedded_r_cells | flags | file |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |"
    ];
    report.entries.forEach((entry) => {
        const fields = entry.field_values_compact || {};
        const diagnostics = entry.constraint_diagnostics || {};
        rows.push([
            "|",
            entry.exported_at || "-",
            "|",
            entry.use_class,
            "|",
            fields.total_items ?? "-",
            "|",
            fields.blue_count ?? "-",
            "|",
            fields.purple_avg_cells ?? "-",
            "|",
            fields.orange_avg_cells ?? "-",
            "|",
            fields.white_green_total_cells ?? "-",
            "|",
            entry.analysis_snapshot.count_means.r ?? "-",
            "|",
            entry.analysis_snapshot.cell_means.r ?? "-",
            "|",
            [
                `or_pool=${diagnostics.orange_red_unknown_pool ?? "-"}`,
                `embedded_risk=${entry.posterior_risk_consistency.status}`,
                `current=${entry.risk_flags.join(", ") || "-"}`,
                `embedded_snapshot=${(entry.embedded_snapshot_risk_flags || []).map(formatEmbeddedRiskFlagForMarkdown).join(", ") || "-"}`
            ].join("; "),
            "|",
            entry.basename,
            "|"
        ].join(" "));
    });
    rows.push(
        "",
        "## Method",
        "",
        "- Capture packages with missing manual `actual_counts` are review-only observations.",
        "- Screenshots may be stitched or OCR-reviewed later, but pixel/OCR results must not become training labels without manual confirmation.",
        "- JSON `risk_flags` now contains current input and data-quality risks only; historical model-snapshot flags are stored in `embedded_snapshot_risk_flags`.",
        "- `embedded_r` and `embedded_r_cells` are historical capture-package `analysis_snapshot` values, not current default recomputations.",
        "- `legacy_mixed_risk_flags` is retained for audit compatibility and embedded posterior-risk consistency checks.",
        "- Use the prediction drift and prior scan reports for current model diagnostics; embedded red means are retained only as stale-capture evidence."
    );
    return `${rows.join("\n")}\n`;
}

function buildCapturePackageIntakeReport(capturePackagePaths = [], options = {}) {
    const captures = capturePackagePaths
        .map((inputPath) => ({
            input_path: path.resolve(inputPath),
            payload: readJson(path.resolve(inputPath))
        }))
        .sort((left, right) => String(left.payload.exported_at || "").localeCompare(String(right.payload.exported_at || "")));
    const groups = groupCapturePackages(captures, { maxGapMs: options.groupMaxGapMs || DEFAULT_GROUP_MAX_GAP_MS });
    const entries = captures.map(buildCaptureEntry);
    const report = {
        schema_version: "ak_capture_package_intake_report_v1",
        generated_at: options.generatedAt || new Date().toISOString(),
        change_class: "RESEARCH_ONLY",
        source_paths: capturePackagePaths.map((inputPath) => path.resolve(inputPath)),
        group_max_gap_ms: options.groupMaxGapMs || DEFAULT_GROUP_MAX_GAP_MS,
        summary: summarizeEntries(entries, groups),
        group_summaries: groups.map((group, index) => ({
            group_id: `group_${index + 1}`,
            capture_count: group.length,
            exported_at_start: group[0]?.payload?.exported_at || null,
            exported_at_end: group[group.length - 1]?.payload?.exported_at || null,
            capture_group_key: captureGroupKey(group[0]),
            basenames: group.map((capture) => path.basename(capture.input_path))
        })),
        entries
    };
    return report;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const report = buildCapturePackageIntakeReport(args.capturePackagePaths, {
        generatedAt: args.generatedAt,
        groupMaxGapMs: args.groupMaxGapMs
    });
    report.markdown_path = args.outputPath.replace(/\.json$/i, ".md");
    writeJson(args.outputPath, report);
    writeText(report.markdown_path, formatMarkdownReport(report));
    process.stdout.write(`${args.outputPath}\n${report.markdown_path}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_GROUP_MAX_GAP_MS,
    DEFAULT_OUTPUT_PATH,
    buildCapturePackageIntakeReport,
    buildCaptureEntry,
    buildConstraintDiagnostics,
    formatMarkdownReport,
    resolveArgs,
    main
};
