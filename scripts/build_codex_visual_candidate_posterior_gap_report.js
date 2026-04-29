const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../src/core/default_config_bundle.js");
const { resolveEstimatorConfig } = require("../src/core/estimator.js");
const { buildSettlementCountReplayReport } = require("../src/research/sample_count_replay.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_REVIEW_RESULTS_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-capture-full-count-codex-visual-review-results.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-26-sunken-ship-codex-visual-candidate-posterior-gap.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;

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
        reviewResultsPath: positional[0] ? path.resolve(positional[0]) : DEFAULT_REVIEW_RESULTS_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt
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

function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeActualCounts(counts = {}) {
    const actualCounts = {};
    if (!isPlainObject(counts)) return actualCounts;
    QUALITY_ORDER.forEach((quality) => {
        const numeric = Number(counts[quality]);
        if (Number.isInteger(numeric) && numeric >= 0) actualCounts[quality] = numeric;
    });
    return actualCounts;
}

function sumActualCounts(counts = {}) {
    return QUALITY_ORDER.reduce((sum, quality) => sum + (Number(counts[quality]) || 0), 0);
}

function sumQualityValues(values = {}) {
    return QUALITY_ORDER.reduce((sum, quality) => sum + (Number(values[quality]) || 0), 0);
}

function hasFullActualCounts(counts = {}) {
    return QUALITY_ORDER.every((quality) => Number.isInteger(counts[quality]) && counts[quality] >= 0);
}

function buildSampleId(entry = {}, fallbackIndex = 0) {
    const raw = [
        entry.source_task_id,
        entry.map_id,
        entry.event_timestamp || entry.created_at,
        fallbackIndex
    ].map((part) => normalizeText(part)).filter(Boolean).join("_");
    const normalized = raw
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return `codex_visual_${normalized || fallbackIndex}`;
}

function collectReviewEntries(reviewResults = {}) {
    const entries = [];
    (Array.isArray(reviewResults.review_results) ? reviewResults.review_results : []).forEach((entry, index) => {
        if (!isPlainObject(entry)) return;
        entries.push({
            source_entry_kind: "existing_candidate_review",
            source_index: index,
            ...cloneValue(entry)
        });
    });
    (Array.isArray(reviewResults.fresh_capture_templates) ? reviewResults.fresh_capture_templates : []).forEach((template, templateIndex) => {
        if (!isPlainObject(template)) return;
        const samples = Array.isArray(template.samples)
            ? template.samples
            : (Array.isArray(template.filled_samples) ? template.filled_samples : []);
        samples.forEach((sample, sampleIndex) => {
            if (!isPlainObject(sample)) return;
            entries.push({
                source_entry_kind: "fresh_capture_sample",
                source_template_index: templateIndex,
                source_sample_index: sampleIndex,
                source_task_id: template.source_task_id || null,
                source_task_type: template.source_task_type || null,
                map_id: template.map_id || null,
                ...cloneValue(sample)
            });
        });
    });
    return entries;
}

function isCodexVisualEntry(entry = {}) {
    const source = normalizeText(entry.actual_counts_source).toLowerCase();
    return source === "codex_visual_review"
        || Boolean(entry.metadata && entry.metadata.codex_visual_review);
}

function buildReplaySample(entry = {}, index = 0) {
    const actualCounts = normalizeActualCounts(entry.actual_counts);
    return {
        id: buildSampleId(entry, index),
        created_at: normalizeText(entry.event_timestamp || entry.created_at) || null,
        map_id: normalizeText(entry.map_id) || null,
        observed_state: cloneValue(entry.observed_state || entry.state || {}),
        actual_counts: actualCounts,
        source_kind: "codex_visual_review_blocked"
    };
}

function auditVisualEntry(entry = {}) {
    const blockers = [];
    const warnings = [];
    const status = normalizeText(entry.status || entry.review_status).toLowerCase();
    const actualCountsSource = normalizeText(entry.actual_counts_source).toLowerCase();
    const actualCounts = normalizeActualCounts(entry.actual_counts);
    const totalItems = Number(entry.actual_counts && entry.actual_counts.total_items);
    const actualSum = sumActualCounts(actualCounts);

    if (status !== "approved_count_fit_sample") blockers.push("status_not_approved_for_import");
    if (actualCountsSource !== "manual_review") blockers.push("actual_counts_source_not_manual_review");
    if (actualCountsSource === "codex_visual_review") blockers.push("codex_visual_review_is_shadow_only");
    if (!hasFullActualCounts(actualCounts)) blockers.push("missing_full_actual_counts");
    if (!Number.isInteger(totalItems) || totalItems < 0) {
        blockers.push("missing_actual_counts_total_items");
    } else if (actualSum !== totalItems) {
        blockers.push("actual_counts_total_mismatch");
    }
    if (entry.pixel_training_label_allowed === true) blockers.push("pixel_training_label_enabled");
    if (!isPlainObject(entry.observed_state || entry.state)) blockers.push("missing_observed_state");
    if (!normalizeText(entry.event_timestamp || entry.created_at)) warnings.push("missing_event_timestamp");

    return {
        status: status || null,
        actual_counts_source: actualCountsSource || null,
        blockers,
        warnings,
        actual_counts_quality_sum: actualSum,
        actual_counts_total_items: Number.isInteger(totalItems) && totalItems >= 0 ? totalItems : null,
        import_allowed: blockers.length === 0
    };
}

function roundTo(value, digits = 4) {
    if (!Number.isFinite(value)) return value;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function summarizeQualityGap(qualityReport = null) {
    if (!qualityReport) return null;
    const direction = qualityReport.actual_count > qualityReport.mean_count
        ? "baseline_underpredicts_count"
        : (qualityReport.actual_count < qualityReport.mean_count ? "baseline_overpredicts_count" : "baseline_matches_mean");
    return {
        actual_count: qualityReport.actual_count,
        mean_count: qualityReport.mean_count,
        signed_error_actual_minus_mean: roundTo(qualityReport.actual_count - qualityReport.mean_count, 4),
        abs_error: qualityReport.abs_error,
        actual_prob: qualityReport.actual_prob,
        rank: qualityReport.rank,
        in_support: qualityReport.in_support,
        direction,
        top_counts: qualityReport.top_counts
    };
}

function buildSampleGapSummary(replaySampleReport = {}, audit = {}) {
    const qualityGaps = {};
    QUALITY_ORDER.forEach((quality) => {
        qualityGaps[quality] = summarizeQualityGap(
            replaySampleReport.baseline && replaySampleReport.baseline.quality_counts
                ? replaySampleReport.baseline.quality_counts[quality]
                : null
        );
    });
    const rankedByAbsError = QUALITY_ORDER
        .map((quality) => ({ quality, ...(qualityGaps[quality] || {}) }))
        .filter((entry) => Number.isFinite(entry.abs_error))
        .sort((left, right) => right.abs_error - left.abs_error || QUALITY_ORDER.indexOf(left.quality) - QUALITY_ORDER.indexOf(right.quality));

    return {
        id: replaySampleReport.id,
        map_id: replaySampleReport.map_id,
        source_kind: "codex_visual_review_blocked",
        import_allowed: audit.import_allowed,
        blockers: audit.blockers,
        warnings: audit.warnings,
        actual_counts: cloneValue(replaySampleReport.actual_counts),
        observed_state: cloneValue(replaySampleReport.state),
        quality_gaps: qualityGaps,
        largest_abs_error_quality: rankedByAbsError[0] ? rankedByAbsError[0].quality : null,
        ranked_abs_errors: rankedByAbsError.map((entry) => ({
            quality: entry.quality,
            actual_count: entry.actual_count,
            mean_count: entry.mean_count,
            abs_error: entry.abs_error,
            direction: entry.direction,
            rank: entry.rank
        }))
    };
}

function countBy(items = [], keyFn = (item) => item) {
    return items.reduce((counts, item) => {
        const key = keyFn(item) || "unknown";
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
}

function buildScenarioConfig(mapId, alphaCounts = {}, countPriorStrength = null) {
    const next = cloneValue(defaultConfig);
    if (!mapId || !next.maps || !next.maps[mapId]) return next;
    next.maps[mapId] = {
        ...(next.maps[mapId] || {}),
        alpha_counts: {
            ...(next.maps[mapId].alpha_counts || {}),
            ...cloneValue(alphaCounts)
        },
        solver: {
            ...(next.maps[mapId].solver || {})
        }
    };
    if (Number.isFinite(countPriorStrength) && countPriorStrength > 0) {
        next.maps[mapId].solver.count_prior_strength = countPriorStrength;
    }
    return next;
}

function buildSmoothedVisualAlpha(actualCounts = {}, baselineAlpha = {}, smoothing = 0.5) {
    const baselineTotal = sumQualityValues(baselineAlpha);
    const countTotal = sumActualCounts(actualCounts);
    const denominator = countTotal + QUALITY_ORDER.length * smoothing;
    return QUALITY_ORDER.reduce((result, quality) => {
        const raw = Number(actualCounts[quality]) || 0;
        result[quality] = denominator > 0 && baselineTotal > 0
            ? roundTo(((raw + smoothing) / denominator) * baselineTotal, 6)
            : roundTo(Number(baselineAlpha[quality]) || 0, 6);
        return result;
    }, {});
}

function blendAlphaCounts(baselineAlpha = {}, candidateAlpha = {}, candidateWeight = 0.25) {
    const weight = Math.min(1, Math.max(0, Number(candidateWeight) || 0));
    return QUALITY_ORDER.reduce((result, quality) => {
        const baselineValue = Number(baselineAlpha[quality]) || 0;
        const candidateValue = Number(candidateAlpha[quality]) || 0;
        result[quality] = roundTo((baselineValue * (1 - weight)) + (candidateValue * weight), 6);
        return result;
    }, {});
}

function buildPriorScenarioDefinitions(replaySample = {}) {
    const mapId = replaySample.map_id;
    const resolved = resolveEstimatorConfig(defaultConfig, mapId);
    const baselineAlpha = cloneValue(resolved.alpha_counts || {});
    const baselineStrength = Number(resolved.solver && resolved.solver.count_prior_strength) || 1;
    const visualAlpha = buildSmoothedVisualAlpha(replaySample.actual_counts, baselineAlpha, 0.5);
    const strengths = [4, 2, 1].filter((strength) => strength !== baselineStrength);
    const definitions = strengths.map((strength) => ({
        id: `baseline_alpha_strength_${strength}`,
        label: `baseline alpha, strength ${strength}`,
        source_classification: "prior_hardness_shadow",
        alpha_counts: baselineAlpha,
        count_prior_strength: strength
    }));

    [4, 2].forEach((strength) => {
        definitions.push({
            id: `visual_smoothed_alpha_strength_${strength}`,
            label: `visual smoothed alpha, strength ${strength}`,
            source_classification: "codex_visual_shadow_fit_not_adoptable",
            alpha_counts: visualAlpha,
            count_prior_strength: strength
        });
    });

    [0.1, 0.25, 0.5].forEach((visualWeight) => {
        [4, 2].forEach((strength) => {
            const pct = Math.round(visualWeight * 100);
            definitions.push({
                id: `blend_visual_${pct}_alpha_strength_${strength}`,
                label: `${pct}% visual-smoothed alpha blend, strength ${strength}`,
                source_classification: "codex_visual_shadow_blend_not_adoptable",
                alpha_counts: blendAlphaCounts(baselineAlpha, visualAlpha, visualWeight),
                count_prior_strength: strength
            });
        });
    });

    return definitions;
}

function sumAbsError(qualityGaps = {}, qualities = QUALITY_ORDER) {
    return roundTo(qualities.reduce((sum, quality) => {
        const entry = qualityGaps[quality];
        return sum + (entry && Number.isFinite(entry.abs_error) ? entry.abs_error : 0);
    }, 0), 4);
}

function evaluatePriorScenario(replaySample = {}, scenario = {}) {
    const scenarioConfig = buildScenarioConfig(
        replaySample.map_id,
        scenario.alpha_counts,
        scenario.count_prior_strength
    );
    const report = buildSettlementCountReplayReport([replaySample], scenarioConfig);
    const sample = report.samples && report.samples[0] ? report.samples[0] : null;
    const qualityGaps = {};
    QUALITY_ORDER.forEach((quality) => {
        qualityGaps[quality] = summarizeQualityGap(
            sample && sample.baseline && sample.baseline.quality_counts
                ? sample.baseline.quality_counts[quality]
                : null
        );
    });

    return {
        id: scenario.id,
        label: scenario.label,
        source_classification: scenario.source_classification,
        alpha_counts: cloneValue(scenario.alpha_counts),
        count_prior_strength: scenario.count_prior_strength,
        total_abs_error: sumAbsError(qualityGaps),
        high_rarity_abs_error: sumAbsError(qualityGaps, ["p", "o", "r"]),
        quality_gaps: qualityGaps
    };
}

function buildPriorSensitivity(replaySample = {}) {
    const scenarios = buildPriorScenarioDefinitions(replaySample)
        .map((scenario) => evaluatePriorScenario(replaySample, scenario))
        .sort((left, right) => left.total_abs_error - right.total_abs_error || left.id.localeCompare(right.id));
    const bestBySource = {};
    scenarios.forEach((scenario) => {
        if (!bestBySource[scenario.source_classification]) {
            bestBySource[scenario.source_classification] = scenario.id;
        }
    });
    return {
        source_classification: "shadow_sensitivity_not_authority",
        scenario_count: scenarios.length,
        best_total_abs_error_scenario: scenarios[0] ? scenarios[0].id : null,
        best_scenario_by_source_classification: bestBySource,
        scenarios
    };
}

function buildCodexVisualCandidatePosteriorGapReport({
    reviewResults = {},
    generatedAt = null,
    paths = {}
} = {}) {
    const entries = collectReviewEntries(reviewResults).filter(isCodexVisualEntry);
    const audits = entries.map(auditVisualEntry);
    const samples = entries.map(buildReplaySample);
    const replayReport = buildSettlementCountReplayReport(samples, defaultConfig);
    const sampleGapSummaries = replayReport.samples.map((sampleReport, index) => (
        {
            ...buildSampleGapSummary(sampleReport, audits[index] || {}),
            prior_sensitivity: buildPriorSensitivity(samples[index] || {})
        }
    ));

    return {
        schema_version: "ak_codex_visual_candidate_posterior_gap_v1",
        generated_at: generatedAt || reviewResults.generated_at || null,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        inputs: {
            codex_visual_review_results: paths.reviewResultsPath || null
        },
        guardrails: [
            "codex_visual_review_samples_are_shadow_only",
            "do_not_import_until_status_approved_and_actual_counts_source_manual_review",
            "do_not_update_default_weights_from_single_visual_candidate"
        ],
        summary: {
            visual_candidate_entry_count: entries.length,
            replay_sample_count: samples.length,
            import_allowed_sample_count: audits.filter((audit) => audit.import_allowed).length,
            blocked_sample_count: audits.filter((audit) => !audit.import_allowed).length,
            map_counts: countBy(samples, (sample) => sample.map_id),
            blocker_reason_counts: countBy(audits.flatMap((audit) => audit.blockers || [])),
            largest_abs_error_quality_counts: countBy(sampleGapSummaries, (sample) => sample.largest_abs_error_quality),
            research_status: "shadow_gap_only"
        },
        samples: sampleGapSummaries,
        replay_report: replayReport,
        recommendations: [
            "让用户人工确认 w/g/b/p/o/r 后再进入 count-fit import。",
            "如果人工确认后仍出现同方向大误差，再生成 shadow candidate config，而不是直接改默认权重。",
            "blend_visual_* 场景只回答小步混合是否可能改善；它仍继承视觉草稿风险，不可直接发布。",
            "如果 sensitivity 中只有 visual_smoothed 场景显著改善，优先怀疑当前视觉候选或单样本过拟合，而不是立即发布权重。",
            "当前样本只含 r1_total_items 与 r1_blue_count，posterior gap 主要反映 count prior，不足以独立校准价值模型。"
        ]
    };
}

function formatQualityCell(entry = null) {
    if (!entry) return "-";
    return `${entry.actual_count}/${entry.mean_count} (${entry.direction}; rank ${entry.rank || "-"})`;
}

function formatCodexVisualCandidatePosteriorGapMarkdown(report = {}) {
    const lines = [];
    lines.push("# Codex Visual Candidate Posterior Gap");
    lines.push("");
    lines.push(`- JSON: \`${path.relative(ROOT_DIR, report.output_path || DEFAULT_OUTPUT_PATH)}\``);
    lines.push(`- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``);
    lines.push(`- Research status: \`${report.summary ? report.summary.research_status : "shadow_gap_only"}\``);
    lines.push(`- Import allowed samples: \`${report.summary ? report.summary.import_allowed_sample_count : 0}\``);
    lines.push("");
    lines.push("| sample | map | blocked | largest gap | w | g | b | p | o | r |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    (report.samples || []).forEach((sample) => {
        lines.push([
            `\`${sample.id || "-"}\``,
            `\`${sample.map_id || "unknown"}\``,
            sample.import_allowed ? "`false`" : "`true`",
            `\`${sample.largest_abs_error_quality || "-"}\``,
            formatQualityCell(sample.quality_gaps && sample.quality_gaps.w),
            formatQualityCell(sample.quality_gaps && sample.quality_gaps.g),
            formatQualityCell(sample.quality_gaps && sample.quality_gaps.b),
            formatQualityCell(sample.quality_gaps && sample.quality_gaps.p),
            formatQualityCell(sample.quality_gaps && sample.quality_gaps.o),
            formatQualityCell(sample.quality_gaps && sample.quality_gaps.r)
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    });
    lines.push("");
    lines.push("## Guardrails");
    (report.guardrails || []).forEach((guardrail) => lines.push(`- \`${guardrail}\``));
    lines.push("");
    (report.samples || []).forEach((sample) => {
        const scenarios = sample.prior_sensitivity && Array.isArray(sample.prior_sensitivity.scenarios)
            ? sample.prior_sensitivity.scenarios.slice(0, 8)
            : [];
        if (!scenarios.length) return;
        lines.push(`## Prior Sensitivity: ${sample.map_id || "unknown"}`);
        lines.push("");
        lines.push(`- Best by source: \`${JSON.stringify(sample.prior_sensitivity.best_scenario_by_source_classification || {})}\``);
        lines.push("");
        lines.push("| scenario | source | strength | total abs | high rarity abs | p | o | r |");
        lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
        scenarios.forEach((scenario) => {
            lines.push([
                `\`${scenario.id}\``,
                `\`${scenario.source_classification}\``,
                `\`${scenario.count_prior_strength}\``,
                `\`${scenario.total_abs_error}\``,
                `\`${scenario.high_rarity_abs_error}\``,
                formatQualityCell(scenario.quality_gaps && scenario.quality_gaps.p),
                formatQualityCell(scenario.quality_gaps && scenario.quality_gaps.o),
                formatQualityCell(scenario.quality_gaps && scenario.quality_gaps.r)
            ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
        });
        lines.push("");
    });
    lines.push("");
    lines.push("## Next");
    (report.recommendations || []).forEach((recommendation) => lines.push(`- ${recommendation}`));
    lines.push("");
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const { reviewResultsPath, outputPath, generatedAt } = resolveArgs(argv);
    const reviewResults = readJson(reviewResultsPath);
    const report = buildCodexVisualCandidatePosteriorGapReport({
        reviewResults,
        generatedAt,
        paths: { reviewResultsPath }
    });
    report.output_path = outputPath;
    writeJson(outputPath, report);
    writeText(outputPath.replace(/\.json$/i, ".md"), formatCodexVisualCandidatePosteriorGapMarkdown(report));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_REVIEW_RESULTS_PATH,
    buildCodexVisualCandidatePosteriorGapReport,
    collectReviewEntries,
    formatCodexVisualCandidatePosteriorGapMarkdown,
    main,
    resolveArgs
};
