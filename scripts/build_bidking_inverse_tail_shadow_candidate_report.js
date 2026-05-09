const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TABLE_ROOT = process.env.BIDKING_TABLES_DIR
    || path.join(ROOT_DIR, "external", "BidKing_zip_extract_min", "Tables");
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-05-07-bidking-inverse-tail-shadow-candidate-report.json"
);
const JACKPOT_VALUE_THRESHOLD = 1_000_000;
const TARGET_MISSING_ITEM_ID = 1106013;
const MIN_FIT_ROWS = 3;

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = String(argv[index]);
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at requires an ISO timestamp");
            generatedAt = String(argv[index]);
        } else if (arg.startsWith("--generated-at=")) {
            generatedAt = arg.slice("--generated-at=".length);
        } else {
            positional.push(arg);
        }
    }

    return {
        tableRoot: positional[0] ? path.resolve(positional[0]) : DEFAULT_TABLE_ROOT,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt
    };
}

function writeText(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, payload) {
    writeText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function reportPathLabel(filePath) {
    const resolvedPath = path.resolve(filePath);
    const relativePath = path.relative(ROOT_DIR, resolvedPath).replace(/\\/g, "/");
    if (relativePath && !relativePath.startsWith("../") && relativePath !== "..") {
        return relativePath;
    }
    return `external:${path.basename(path.dirname(resolvedPath))}/${path.basename(resolvedPath)}`;
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function stripBom(value) {
    return String(value || "").replace(/^\uFEFF/, "");
}

function parseMaybeArray(value, fallback = []) {
    const text = String(value || "").trim();
    if (!text) return fallback;
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (_error) {
        return fallback;
    }
}

function parseItemTableText(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => stripBom(line).trimEnd())
        .filter(Boolean)
        .map((line) => {
            const columns = line.split("\t");
            return {
                id: Number(columns[0]),
                name: columns[1] || "",
                item_type_id: parseMaybeArray(columns[6], []),
                quality: Number(columns[8]),
                base_value: Number(columns[9]),
                raw_column_count: columns.length
            };
        })
        .filter((entry) => Number.isFinite(entry.id));
}

function parseDropTableText(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => stripBom(line).trimEnd())
        .filter(Boolean)
        .map((line) => {
            const columns = line.split("\t");
            return {
                group_id: Number(columns[0]),
                name: columns[1] || columns[2] || "",
                weight_type: Number(columns[3]),
                items_list: parseMaybeArray(columns[4], []),
                raw_column_count: columns.length
            };
        })
        .filter((entry) => Number.isFinite(entry.group_id));
}

function readLocalTables(tableRoot = DEFAULT_TABLE_ROOT) {
    return {
        items: parseItemTableText(fs.readFileSync(path.join(tableRoot, "Item.txt"), "utf8")),
        drops: parseDropTableText(fs.readFileSync(path.join(tableRoot, "Drop.txt"), "utf8"))
    };
}

function mean(values) {
    const finite = values.map(Number).filter(Number.isFinite);
    if (!finite.length) return null;
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function median(values) {
    const finite = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
    if (!finite.length) return null;
    const middle = Math.floor(finite.length / 2);
    return finite.length % 2 ? finite[middle] : (finite[middle - 1] + finite[middle]) / 2;
}

function correlation(xs, ys) {
    if (xs.length !== ys.length || xs.length < 2) return null;
    const xMean = mean(xs);
    const yMean = mean(ys);
    let covariance = 0;
    let xVariance = 0;
    let yVariance = 0;
    for (let index = 0; index < xs.length; index += 1) {
        const dx = xs[index] - xMean;
        const dy = ys[index] - yMean;
        covariance += dx * dy;
        xVariance += dx * dx;
        yVariance += dy * dy;
    }
    if (xVariance <= 0 || yVariance <= 0) return null;
    return covariance / Math.sqrt(xVariance * yVariance);
}

function fitLogWeightCurve(rows = []) {
    const cleanRows = rows
        .map((entry) => ({
            ...entry,
            base_value: Number(entry.base_value),
            weight: Number(entry.weight)
        }))
        .filter((entry) => entry.base_value > 0 && entry.weight > 0);
    if (cleanRows.length < 2) {
        return {
            n: cleanRows.length,
            beta: null,
            intercept: null,
            correlation: null,
            r_squared: null,
            beta_one_mape: null,
            log_rmse: null
        };
    }

    const xs = cleanRows.map((entry) => Math.log(entry.base_value));
    const ys = cleanRows.map((entry) => Math.log(entry.weight));
    const xMean = mean(xs);
    const yMean = mean(ys);
    let covariance = 0;
    let variance = 0;
    for (let index = 0; index < xs.length; index += 1) {
        covariance += (xs[index] - xMean) * (ys[index] - yMean);
        variance += (xs[index] - xMean) ** 2;
    }
    const slope = variance > 0 ? covariance / variance : 0;
    const intercept = yMean - slope * xMean;
    const corr = correlation(xs, ys);
    const logSquaredErrors = cleanRows.map((entry) => {
        const predicted = Math.exp(intercept + slope * Math.log(entry.base_value));
        return (Math.log(entry.weight) - Math.log(predicted)) ** 2;
    });
    const betaOneIntercept = mean(cleanRows.map((entry) => Math.log(entry.weight) + Math.log(entry.base_value)));
    const betaOneMape = mean(cleanRows.map((entry) => {
        const predicted = Math.exp(betaOneIntercept - Math.log(entry.base_value));
        return Math.abs(entry.weight - predicted) / entry.weight;
    }));

    return {
        n: cleanRows.length,
        _beta_exact: -slope,
        _intercept_exact: intercept,
        beta: roundTo(-slope, 6),
        intercept: roundTo(intercept, 6),
        correlation: roundTo(corr, 6),
        r_squared: roundTo(corr === null ? null : corr * corr, 6),
        beta_one_mape: roundTo(betaOneMape, 6),
        log_rmse: roundTo(Math.sqrt(mean(logSquaredErrors)), 6)
    };
}

function predictWeight(fit, baseValue) {
    if (!fit || fit.intercept === null || fit.beta === null || !(baseValue > 0)) return null;
    const intercept = Number.isFinite(fit._intercept_exact) ? fit._intercept_exact : fit.intercept;
    const beta = Number.isFinite(fit._beta_exact) ? fit._beta_exact : fit.beta;
    return Math.exp(intercept - beta * Math.log(baseValue));
}

function impliedBaseValue(fit, weight) {
    if (!fit || fit.intercept === null || fit.beta === null || fit.beta <= 0 || !(weight > 0)) return null;
    const intercept = Number.isFinite(fit._intercept_exact) ? fit._intercept_exact : fit.intercept;
    const beta = Number.isFinite(fit._beta_exact) ? fit._beta_exact : fit.beta;
    return Math.exp((intercept - Math.log(weight)) / beta);
}

function uniqueSortedNumbers(values) {
    return Array.from(new Set((values || []).map(Number).filter(Number.isFinite))).sort((left, right) => left - right);
}

function compactRows(rows) {
    return rows.map((entry) => ({
        item_id: entry.item_id,
        name: entry.name || null,
        quality: entry.quality,
        base_value: entry.base_value,
        weight: entry.weight
    }));
}

function buildGroupFit(drop, itemById) {
    const tuples = Array.isArray(drop.items_list) ? drop.items_list : [];
    const terminalRows = tuples
        .filter((tuple) => Array.isArray(tuple) && tuple.length >= 5 && Number(tuple[0]) !== 9999)
        .map((tuple) => {
            const itemId = Number(tuple[1]);
            const item = itemById.get(itemId);
            return {
                item_id: itemId,
                item_type_hint: Number(tuple[0]),
                min_count: Number(tuple[2]),
                max_count: Number(tuple[3]),
                weight: Number(tuple[4]),
                name: item ? item.name : null,
                quality: item ? item.quality : null,
                base_value: item ? item.base_value : null,
                source_item_found: Boolean(item)
            };
        });
    const knownRows = terminalRows.filter((entry) => entry.source_item_found && entry.base_value > 0 && entry.weight > 0);
    const ordinaryRows = knownRows.filter((entry) => (
        entry.item_id !== 1006001 && Number(entry.base_value) < JACKPOT_VALUE_THRESHOLD
    ));
    const jackpotRows = knownRows.filter((entry) => (
        entry.item_id === 1006001 || Number(entry.base_value) >= JACKPOT_VALUE_THRESHOLD
    ));
    if (ordinaryRows.length < MIN_FIT_ROWS) return null;

    const fit = fitLogWeightCurve(ordinaryRows);
    const missingRows = terminalRows.filter((entry) => !entry.source_item_found);
    const quality = median(ordinaryRows.map((entry) => entry.quality));
    return {
        group_id: drop.group_id,
        group_name: drop.name,
        weight_type: drop.weight_type,
        quality,
        known_item_count: ordinaryRows.length,
        jackpot_item_count: jackpotRows.length,
        missing_item_ids: uniqueSortedNumbers(missingRows.map((entry) => entry.item_id)),
        beta: fit.beta,
        correlation: fit.correlation,
        r_squared: fit.r_squared,
        beta_one_mape: fit.beta_one_mape,
        log_rmse: fit.log_rmse,
        fit_intercept: fit.intercept,
        value_min: Math.min(...ordinaryRows.map((entry) => entry.base_value)),
        value_median: roundTo(median(ordinaryRows.map((entry) => entry.base_value)), 2),
        value_max: Math.max(...ordinaryRows.map((entry) => entry.base_value)),
        top_weight_rows: compactRows([...ordinaryRows].sort((left, right) => right.weight - left.weight).slice(0, 3)),
        low_weight_rows: compactRows([...ordinaryRows].sort((left, right) => left.weight - right.weight).slice(0, 3)),
        jackpot_residuals: jackpotRows.map((entry) => {
            const predicted = predictWeight(fit, entry.base_value);
            return {
                item_id: entry.item_id,
                name: entry.name || null,
                base_value: entry.base_value,
                weight: entry.weight,
                predicted_weight_by_ordinary_curve: roundTo(predicted, 4),
                actual_over_predicted_weight: roundTo(predicted ? entry.weight / predicted : null, 8)
            };
        }),
        missing_item_diagnostics: missingRows.map((entry) => ({
            item_id: entry.item_id,
            observed_drop_weight: entry.weight,
            implied_base_value_by_fitted_curve: roundTo(impliedBaseValue(fit, entry.weight), 4),
            authority_allowed: false,
            diagnostic_only: true,
            warning: "missing item row is not authority; implied value is a curve diagnostic only"
        }))
    };
}

function summarizeByQuality(groupFits) {
    const byQuality = new Map();
    groupFits.forEach((entry) => {
        const key = String(entry.quality);
        if (!byQuality.has(key)) byQuality.set(key, []);
        byQuality.get(key).push(entry);
    });

    return Object.fromEntries(Array.from(byQuality.entries()).map(([quality, rows]) => [quality, {
        group_count: rows.length,
        beta_mean: roundTo(mean(rows.map((entry) => entry.beta)), 4),
        beta_median: roundTo(median(rows.map((entry) => entry.beta)), 4),
        beta_min: roundTo(Math.min(...rows.map((entry) => entry.beta)), 4),
        beta_max: roundTo(Math.max(...rows.map((entry) => entry.beta)), 4),
        corr_mean: roundTo(mean(rows.map((entry) => entry.correlation)), 4),
        beta_one_mape_mean: roundTo(mean(rows.map((entry) => entry.beta_one_mape)), 4),
        jackpot_group_count: rows.filter((entry) => entry.jackpot_item_count > 0).length
    }]));
}

function buildBidKingInverseTailShadowCandidateReport({
    items,
    drops,
    tableRoot = DEFAULT_TABLE_ROOT,
    generatedAt = new Date().toISOString()
} = {}) {
    const itemRows = Array.isArray(items) ? items : readLocalTables(tableRoot).items;
    const dropRows = Array.isArray(drops) ? drops : readLocalTables(tableRoot).drops;
    const itemById = new Map(itemRows.map((entry) => [Number(entry.id), entry]));
    const groupFits = dropRows
        .map((drop) => buildGroupFit(drop, itemById))
        .filter(Boolean)
        .sort((left, right) => left.group_id - right.group_id);
    const qualitySummary = summarizeByQuality(groupFits);
    const allMissingIds = uniqueSortedNumbers(groupFits.flatMap((entry) => entry.missing_item_ids));
    const targetDiagnostics = groupFits
        .flatMap((entry) => entry.missing_item_diagnostics.map((diagnostic) => ({
            group_id: entry.group_id,
            group_name: entry.group_name,
            ...diagnostic
        })))
        .filter((entry) => entry.item_id === TARGET_MISSING_ITEM_ID);
    const quality6 = qualitySummary["6"] || null;
    const inverseSupported = (quality6 && quality6.group_count >= 3 && quality6.corr_mean <= -0.7)
        || groupFits.some((entry) => entry.correlation <= -0.9);

    return {
        schema_version: "ak_bidking_inverse_tail_shadow_candidate_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        inputs: {
            table_root: reportPathLabel(tableRoot),
            item_count: itemRows.length,
            drop_count: dropRows.length,
            jackpot_value_threshold: JACKPOT_VALUE_THRESHOLD,
            min_fit_rows: MIN_FIT_ROWS
        },
        summary: {
            verdict: inverseSupported ? "inverse_value_supported_shadow_only" : "insufficient_fit_evidence",
            drop_group_fit_count: groupFits.length,
            quality_summary: qualitySummary,
            project_relevant_missing_item_ids: allMissingIds.filter((id) => id === TARGET_MISSING_ITEM_ID),
            missing_item_diagnostic_count: targetDiagnostics.length,
            default_config_update_allowed: false,
            authority_handoff_allowed: false,
            promotion_allowed: false,
            recommended_next_action: "use_as_shadow_prior_candidate_only_after_same_battle_replay_samples",
            blockers: [
                "missing_authoritative_item_row_1106013",
                "same_battle_replay_samples_missing",
                "authority_handoff_gate_closed"
            ]
        },
        gates: {
            default_config_update_allowed: false,
            authority_handoff_allowed: false,
            promotion_allowed: false,
            synthetic_item_as_authority_allowed: false,
            table_backed_shadow_replay_allowed: false
        },
        non_authority_shadow_candidate: {
            same_quality_item_weight_model: "weight ∝ value^-beta",
            recommended_beta_source: "per_drop_group_fit_then_quality_median",
            red_quality_beta_median: quality6 ? quality6.beta_median : null,
            red_tail_model: "ordinary_red_inverse_value_plus_jackpot_log_price_tail",
            missing_item_1106013_policy: "diagnostic_only_do_not_synthesize_authority"
        },
        target_missing_item_diagnostics: targetDiagnostics,
        drop_group_curve_fits: groupFits,
        forbidden_actions: [
            "synthesize_1106013_as_authority",
            "drop_tuple_to_unblock_map",
            "promote_inverse_tail_fit_without_same_battle_replay",
            "replace_default_config_from_public_or_unpack_only"
        ],
        notes: [
            "This report parses local BidKing tables and fits terminal item weights only.",
            "Jackpot rows are excluded from ordinary beta fit and recorded as residuals.",
            "Missing item implied values are diagnostics, not source data."
        ]
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function formatBidKingInverseTailShadowCandidateMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = report.summary || {};
    const jsonDisplayPath = path.relative(ROOT_DIR, jsonPath) || jsonPath;
    const qualityRows = Object.entries(summary.quality_summary || {}).map(([quality, entry]) => (
        `| ${markdownCode(quality)} | ${markdownCode(entry.group_count)} | ${markdownCode(entry.beta_mean)} | ${markdownCode(entry.beta_median)} | ${markdownCode(entry.corr_mean)} | ${markdownCode(entry.beta_one_mape_mean)} | ${markdownCode(entry.jackpot_group_count)} |`
    )).join("\n");
    const groupRows = (report.drop_group_curve_fits || [])
        .filter((entry) => Number(entry.quality) >= 5 || (entry.missing_item_ids || []).includes(TARGET_MISSING_ITEM_ID))
        .map((entry) => (
            `| ${markdownCode(entry.group_id)} | ${markdownCell(entry.group_name)} | ${markdownCode(entry.quality)} | ${markdownCode(entry.known_item_count)} | ${markdownCode(entry.beta)} | ${markdownCode(entry.correlation)} | ${markdownCode(entry.beta_one_mape)} | ${markdownCell(JSON.stringify(entry.missing_item_ids || []))} | ${markdownCode(entry.jackpot_item_count)} |`
        )).join("\n");
    const missingRows = (report.target_missing_item_diagnostics || []).map((entry) => (
        `| ${markdownCode(entry.group_id)} | ${markdownCell(entry.group_name)} | ${markdownCode(entry.observed_drop_weight)} | ${markdownCode(entry.implied_base_value_by_fitted_curve)} | ${markdownCode(entry.authority_allowed)} |`
    )).join("\n");

    return `# BidKing inverse-tail shadow candidate

- Change class: \`${report.change_class || "RESEARCH_ONLY"}\`
- Recommended change class: \`${report.recommended_change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Verdict: \`${summary.verdict || "unknown"}\`
- Drop group fit count: \`${summary.drop_group_fit_count ?? 0}\`
- Default config update allowed: \`${summary.default_config_update_allowed === true}\`
- Authority handoff allowed: \`${summary.authority_handoff_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Quality Summary

| quality | groups | beta mean | beta median | corr mean | beta=1 MAPE mean | jackpot groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${qualityRows || "| `-` | `0` | `-` | `-` | `-` | `-` | `0` |"}

## Project-Relevant Fits

| group | name | quality | known rows | beta | corr | beta=1 MAPE | missing ids | jackpot rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
${groupRows || "| `-` | - | `-` | `0` | `-` | `-` | `-` | [] | `0` |"}

## Missing 1106013 Diagnostic

| group | name | observed weight | implied base value | authority allowed |
| --- | --- | ---: | ---: | --- |
${missingRows || "| `-` | - | `-` | `-` | `false` |"}

## Decision

The inverse-value and red-tail shape is useful as a shadow prior candidate only. It does not authorize synthetic item reconstruction, tuple exclusion, authority handoff, or default config updates.
`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const tables = readLocalTables(args.tableRoot);
    const report = buildBidKingInverseTailShadowCandidateReport({
        ...tables,
        tableRoot: args.tableRoot,
        generatedAt: args.generatedAt || new Date().toISOString()
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatBidKingInverseTailShadowCandidateMarkdown(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_TABLE_ROOT,
    buildBidKingInverseTailShadowCandidateReport,
    fitLogWeightCurve,
    formatBidKingInverseTailShadowCandidateMarkdown,
    main,
    parseDropTableText,
    parseItemTableText,
    resolveArgs
};
