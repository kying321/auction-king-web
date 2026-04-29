const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_CONFIRMATION_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-sunken-ship-p1-manual-count-confirmation-results.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-27-sunken-ship-p1-manual-count-candidate-shortlist.json"
);
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function resolveArgs(argv = process.argv.slice(2)) {
    const result = {
        confirmationPath: DEFAULT_CONFIRMATION_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: null,
        topN: 12
    };
    const positional = [];
    const flags = {
        "--confirmation": "confirmationPath",
        "--output": "outputPath",
        "--generated-at": "generatedAt",
        "--top": "topN"
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        const eqIndex = arg.indexOf("=");
        const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
        const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : null;
        if (flags[flag]) {
            const value = inlineValue !== null ? inlineValue : argv[index + 1];
            if (value === undefined) throw new Error(`${flag} 缺少值`);
            if (inlineValue === null) index += 1;
            const key = flags[flag];
            if (key === "topN") {
                const numeric = Number(value);
                if (!Number.isInteger(numeric) || numeric <= 0) throw new Error("--top 必须是正整数");
                result.topN = numeric;
            } else {
                result[key] = key === "generatedAt" ? String(value) : path.resolve(String(value));
            }
        } else {
            positional.push(arg);
        }
    }

    if (positional[0]) result.confirmationPath = path.resolve(positional[0]);
    if (positional[1]) result.outputPath = path.resolve(positional[1]);
    return result;
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

function integerOrNull(value) {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
}

function finiteOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function round(value, digits = 4) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

function addUnique(target, value) {
    if (value && !target.includes(value)) target.push(value);
}

function flattenSamples(confirmation = {}) {
    const rows = [];
    (Array.isArray(confirmation.fresh_capture_templates) ? confirmation.fresh_capture_templates : []).forEach((template, templateIndex) => {
        (Array.isArray(template.samples) ? template.samples : []).forEach((sample, sampleIndex) => {
            rows.push({
                templateIndex,
                sampleIndex,
                source_task_id: sample.source_task_id || template.source_task_id || null,
                map_id: sample.map_id || template.map_id || null,
                event_timestamp: sample.event_timestamp || template.event_timestamp || null,
                review_priority: sample.review_priority || template.review_priority || null,
                status: sample.status || null,
                observed_state: isPlainObject(sample.observed_state) ? sample.observed_state : {},
                actual_counts: isPlainObject(sample.actual_counts) ? sample.actual_counts : {},
                red_residual_review: sample.metadata && isPlainObject(sample.metadata.red_residual_review)
                    ? sample.metadata.red_residual_review
                    : null
            });
        });
    });
    return rows;
}

function buildConstraintSet(sample = {}) {
    const observed = isPlainObject(sample.observed_state) ? sample.observed_state : {};
    const redResidual = isPlainObject(sample.red_residual_review) ? sample.red_residual_review : {};
    const diagnostics = isPlainObject(redResidual.constraint_diagnostics)
        ? redResidual.constraint_diagnostics
        : {};
    const actual = isPlainObject(sample.actual_counts) ? sample.actual_counts : {};
    const total = integerOrNull(actual.total_items)
        ?? integerOrNull(diagnostics.total_items)
        ?? integerOrNull(observed.r1_total_items);
    const blue = integerOrNull(observed.r1_blue_count) ?? integerOrNull(diagnostics.blue_count);
    const purple = integerOrNull(observed.r2_purple_count) ?? integerOrNull(diagnostics.purple_count);
    const whiteGreenPool = integerOrNull(diagnostics.inferred_white_green_count);
    const orangeRedPool = integerOrNull(diagnostics.orange_red_unknown_pool);
    return {
        total,
        fixed: { b: blue, p: purple },
        pools: {
            w_g: whiteGreenPool,
            o_r: orangeRedPool
        },
        current_model: cloneValue(redResidual.current_model || {}),
        diagnostics: cloneValue(diagnostics)
    };
}

function buildCandidateScore(candidate = {}, constraints = {}) {
    const model = isPlainObject(constraints.current_model) ? constraints.current_model : {};
    const redMean = finiteOrNull(model.red_count_mean);
    const orangeMean = finiteOrNull(model.orange_count_mean);
    const purpleMean = finiteOrNull(model.purple_count_mean);
    const wgPool = integerOrNull(constraints.pools && constraints.pools.w_g);
    const red_distance = redMean === null ? null : Math.abs(candidate.r - redMean);
    const orange_distance = orangeMean === null ? null : Math.abs(candidate.o - orangeMean);
    const purple_distance = purpleMean === null ? null : Math.abs(candidate.p - purpleMean);
    const wg_balance_distance = wgPool && wgPool > 0 ? Math.abs(candidate.w - candidate.g) / wgPool : 0;
    const score = (
        (red_distance ?? 0) * 1.5
        + (orange_distance ?? 0) * 1.2
        + (purple_distance ?? 0) * 0.2
        + wg_balance_distance * 0.15
    );
    return {
        score: round(score, 6),
        red_distance: round(red_distance, 6),
        orange_distance: round(orange_distance, 6),
        purple_distance: round(purple_distance, 6),
        wg_balance_distance: round(wg_balance_distance, 6),
        basis: "model_mean_distance_plus_weak_wg_balance_heuristic_non_authority"
    };
}

function enumerateCandidates(constraints = {}) {
    const blockers = [];
    const { total, fixed = {}, pools = {} } = constraints;
    ["total"].forEach((key) => {
        if (constraints[key] === null || constraints[key] === undefined) addUnique(blockers, `missing_${key}`);
    });
    if (fixed.b === null || fixed.b === undefined) addUnique(blockers, "missing_blue_count");
    if (fixed.p === null || fixed.p === undefined) addUnique(blockers, "missing_purple_count");
    if (pools.w_g === null || pools.w_g === undefined) addUnique(blockers, "missing_white_green_pool");
    if (pools.o_r === null || pools.o_r === undefined) addUnique(blockers, "missing_orange_red_pool");
    const expectedTotal = (fixed.b || 0) + (fixed.p || 0) + (pools.w_g || 0) + (pools.o_r || 0);
    if (!blockers.length && total !== expectedTotal) {
        addUnique(blockers, "constraint_total_mismatch");
    }
    if (blockers.length) return { blockers, candidates: [] };

    const candidates = [];
    for (let w = 0; w <= pools.w_g; w += 1) {
        const g = pools.w_g - w;
        for (let o = 0; o <= pools.o_r; o += 1) {
            const r = pools.o_r - o;
            const counts = { w, g, b: fixed.b, p: fixed.p, o, r };
            const sum = QUALITY_ORDER.reduce((acc, quality) => acc + counts[quality], 0);
            candidates.push({
                rank: 0,
                counts,
                quality_sum: sum,
                total_items: total,
                constraints_satisfied: sum === total,
                score: buildCandidateScore(counts, constraints)
            });
        }
    }

    candidates.sort((left, right) => (
        left.score.score - right.score.score
        || Math.abs(left.counts.w - left.counts.g) - Math.abs(right.counts.w - right.counts.g)
        || left.counts.r - right.counts.r
        || left.counts.w - right.counts.w
    ));
    candidates.forEach((candidate, index) => {
        candidate.rank = index + 1;
    });
    return { blockers: [], candidates };
}

function buildSampleShortlist(sample = {}, topN = 12) {
    const constraints = buildConstraintSet(sample);
    const { blockers, candidates } = enumerateCandidates(constraints);
    const top_candidates = candidates.slice(0, topN);
    return {
        source_task_id: sample.source_task_id || null,
        map_id: sample.map_id || null,
        event_timestamp: sample.event_timestamp || null,
        review_priority: sample.review_priority || null,
        sample_status: sample.status || null,
        authority_status: "non_authority_review_assist_only",
        training_label_allowed: false,
        import_ready_without_human_action: false,
        constraints,
        candidate_count: candidates.length,
        top_candidate_count: top_candidates.length,
        top_candidates,
        blockers,
        warnings: blockers.length ? ["candidate_enumeration_incomplete"] : [
            "shortlist_scores_are_model_heuristics_not_manual_counts",
            "human_must_verify_against_review_image_before_approval"
        ],
        recommended_next_action: blockers.length
            ? "fix_missing_constraints_before_manual_shortlist"
            : "human_select_matching_wg_or_candidate_then_approve_in_confirmation_page"
    };
}

function buildP1ManualCountCandidateShortlist({
    confirmation = {},
    generatedAt = null,
    topN = 12,
    paths = {}
} = {}) {
    const samples = flattenSamples(confirmation);
    const sample_shortlists = samples.map((sample) => buildSampleShortlist(sample, topN));
    const blockers = [];
    sample_shortlists.forEach((entry) => {
        entry.blockers.forEach((blocker) => addUnique(blockers, blocker));
    });
    return {
        schema_version: "ak_p1_manual_count_candidate_shortlist_v1",
        generated_at: generatedAt || confirmation.generated_at || null,
        change_class: "RESEARCH_ONLY",
        authority_policy: {
            training_label_allowed: false,
            authority_merge_allowed: false,
            default_weight_update_allowed: false,
            human_confirmation_required: true
        },
        inputs: {
            confirmation: paths.confirmationPath || null
        },
        summary: {
            sample_count: sample_shortlists.length,
            candidate_count: sample_shortlists.reduce((sum, entry) => sum + entry.candidate_count, 0),
            blocked_sample_count: sample_shortlists.filter((entry) => entry.blockers.length).length,
            top_rank_counts: sample_shortlists.map((entry) => entry.top_candidates[0] ? entry.top_candidates[0].counts : null),
            recommended_next_action: sample_shortlists.some((entry) => entry.blockers.length)
                ? "fix_candidate_shortlist_blockers"
                : "use_shortlist_for_manual_visual_confirmation_only"
        },
        sample_shortlists,
        blockers
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined ? "-" : value).replace(/\|/g, "\\|");
}

function formatCounts(counts = {}) {
    return QUALITY_ORDER.map((quality) => `${quality}:${counts[quality] ?? "-"}`).join(" ");
}

function formatP1ManualCountCandidateShortlistMarkdown(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const lines = [];
    lines.push("# P1 Manual Count Candidate Shortlist");
    lines.push("");
    lines.push(`- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``);
    lines.push(`- Change class: \`${report.change_class || "RESEARCH_ONLY"}\``);
    lines.push(`- Authority: \`${report.authority_policy && report.authority_policy.human_confirmation_required ? "human_confirmation_required" : "unknown"}\``);
    lines.push(`- Samples: \`${report.summary ? report.summary.sample_count : 0}\``);
    lines.push(`- Candidates: \`${report.summary ? report.summary.candidate_count : 0}\``);
    lines.push(`- Blockers: \`${(report.blockers || []).join(", ") || "-"}\``);
    lines.push("");
    lines.push("## Top Candidates");
    lines.push("");
    lines.push("| sample | rank | counts | score | score basis |");
    lines.push("| --- | ---: | --- | ---: | --- |");
    (report.sample_shortlists || []).forEach((sample) => {
        (sample.top_candidates || []).slice(0, 8).forEach((candidate) => {
            lines.push(`| ${[
                markdownCell(sample.source_task_id || sample.event_timestamp || "-"),
                markdownCell(candidate.rank),
                markdownCell(formatCounts(candidate.counts)),
                markdownCell(candidate.score && candidate.score.score),
                markdownCell(candidate.score && candidate.score.basis)
            ].join(" | ")} |`);
        });
    });
    lines.push("");
    lines.push("## Guardrails");
    lines.push("");
    lines.push("- 这些候选只用于人工看图复核，不是 OCR 结果，也不是训练标签。");
    lines.push("- 必须在 manual confirmation 页面人工选择/校验并勾选批准后，才允许进入 ingest。");
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const { confirmationPath, outputPath, generatedAt, topN } = resolveArgs(argv);
    const confirmation = readJson(confirmationPath);
    const report = buildP1ManualCountCandidateShortlist({
        confirmation,
        generatedAt,
        topN,
        paths: { confirmationPath }
    });
    writeJson(outputPath, report);
    writeText(outputPath.replace(/\.json$/i, ".md"), formatP1ManualCountCandidateShortlistMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONFIRMATION_PATH,
    DEFAULT_OUTPUT_PATH,
    buildConstraintSet,
    buildP1ManualCountCandidateShortlist,
    enumerateCandidates,
    formatP1ManualCountCandidateShortlistMarkdown,
    main,
    resolveArgs
};
