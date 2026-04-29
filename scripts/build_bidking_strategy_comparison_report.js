const fs = require("node:fs");
const path = require("node:path");

const defaultConfig = require("../default_config_bundle.js");
const { resolveEstimatorConfig } = require("../estimator.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const QUALITIES = ["w", "g", "b", "p", "o", "r"];
const TARGET_MAP_IDS = ["shipping", "sunken_ship", "villa"];

const DEFAULT_DECOMPILE_AUDIT_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-zip-decompile-audit-report.json"
);
const DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-schema-backed-table-report.json"
);
const DEFAULT_TABLE_MECHANICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-table-mechanics-report.json"
);
const DEFAULT_DODROP_SEMANTICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-dodrop-semantics-report.json"
);
const DEFAULT_DROP_HELPER_SEMANTICS_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-drop-helper-semantics-report.json"
);
const DEFAULT_MANUAL_REVIEW_TEMPLATE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-manual-mechanics-review-template.json"
);
const DEFAULT_PRODUCER_STRATEGY_CHAIN_AUDIT_REPORT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-producer-strategy-chain-audit-report.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-29-bidking-strategy-comparison-report.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    return {
        outputPath: argv[0] ? path.resolve(argv[0]) : DEFAULT_OUTPUT_PATH
    };
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeAlphaCounts(alphaCounts = {}) {
    return QUALITIES.reduce((result, quality) => {
        const value = Number(alphaCounts[quality]);
        result[quality] = Number.isFinite(value) && value > 0 ? roundTo(value) : 0;
        return result;
    }, {});
}

function sumQualities(values = {}) {
    return roundTo(QUALITIES.reduce((sum, quality) => sum + (Number(values[quality]) || 0), 0));
}

function normalizeFractions(values = {}) {
    const total = sumQualities(values);
    return QUALITIES.reduce((result, quality) => {
        result[quality] = total > 0 ? roundTo((Number(values[quality]) || 0) / total) : 0;
        return result;
    }, {});
}

function getValueModelSummary(resolvedConfig = {}) {
    const valueModel = isPlainObject(resolvedConfig.value_model) ? resolvedConfig.value_model : {};
    return ["p", "o", "r"].reduce((result, quality) => {
        const entry = isPlainObject(valueModel[quality]) ? valueModel[quality] : {};
        result[quality] = {
            base_item_mean: Number.isFinite(Number(entry.base_item_mean)) ? roundTo(Number(entry.base_item_mean)) : null,
            base_item_sd: Number.isFinite(Number(entry.base_item_sd)) ? roundTo(Number(entry.base_item_sd)) : null,
            per_cell_mean: Number.isFinite(Number(entry.per_cell_mean)) ? roundTo(Number(entry.per_cell_mean)) : null,
            per_cell_sd: Number.isFinite(Number(entry.per_cell_sd)) ? roundTo(Number(entry.per_cell_sd)) : null
        };
        return result;
    }, {});
}

function compareNumberToRange(value, range = []) {
    const numeric = Number(value);
    const low = Number(range[0]);
    const high = Number(range[1]);
    if (!Number.isFinite(numeric) || !Number.isFinite(low) || !Number.isFinite(high)) {
        return {
            relation: "unknown",
            delta_to_low: null,
            delta_to_high: null
        };
    }
    if (numeric < low) {
        return {
            relation: "below_range",
            delta_to_low: roundTo(numeric - low),
            delta_to_high: roundTo(numeric - high)
        };
    }
    if (numeric > high) {
        return {
            relation: "above_range",
            delta_to_low: roundTo(numeric - low),
            delta_to_high: roundTo(numeric - high)
        };
    }
    return {
        relation: "inside_range",
        delta_to_low: roundTo(numeric - low),
        delta_to_high: roundTo(numeric - high)
    };
}

function summarizeRootRankMapSample(mechanicsMap = {}) {
    const samples = Array.isArray(mechanicsMap.rank_map_count_distribution_samples)
        ? mechanicsMap.rank_map_count_distribution_samples
        : [];
    const root = samples.find((entry) => entry && entry.bidmap_id === mechanicsMap.bidmap_root_id) || samples[0] || null;
    if (!root) return null;
    return {
        bidmap_id: root.bidmap_id ?? null,
        label: root.label || null,
        count_distribution_summary: root.count_distribution_summary || null,
        value_distribution_summary: root.value_distribution_summary || null
    };
}

function compareRedValueToBidKingRange(redBaseItemMean, rankMapSample = null) {
    const summary = rankMapSample && rankMapSample.value_distribution_summary
        ? rankMapSample.value_distribution_summary
        : {};
    const low = Number(summary.min_low);
    const high = Number(summary.max_high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
        return {
            relation: "unknown",
            bidking_value_range: null
        };
    }
    return {
        ...compareNumberToRange(redBaseItemMean, [low, high]),
        bidking_value_range: [low, high]
    };
}

function buildCurrentMapSummary(config, mapId) {
    const resolved = resolveEstimatorConfig(config, mapId);
    const alphaCounts = normalizeAlphaCounts(resolved && resolved.alpha_counts);
    const solver = isPlainObject(resolved && resolved.solver) ? resolved.solver : {};
    return {
        map_id: mapId,
        alpha_counts: alphaCounts,
        alpha_total: sumQualities(alphaCounts),
        alpha_fractions: normalizeFractions(alphaCounts),
        solver: {
            count_prior_strength: Number.isFinite(Number(solver.count_prior_strength))
                ? roundTo(Number(solver.count_prior_strength))
                : null,
            open_high_orange_avg_threshold: Number.isFinite(Number(solver.open_high_orange_avg_threshold))
                ? roundTo(Number(solver.open_high_orange_avg_threshold))
                : null,
            open_high_orange_avg_count_prior_strength: Number.isFinite(Number(solver.open_high_orange_avg_count_prior_strength))
                ? roundTo(Number(solver.open_high_orange_avg_count_prior_strength))
                : null
        },
        value_model_summary: getValueModelSummary(resolved)
    };
}

function getReportSummary(report = {}) {
    return isPlainObject(report.summary) ? report.summary : {};
}

function getBooleanSummary(report = {}, key) {
    return getReportSummary(report)[key] === true;
}

function buildEvidenceSummary(reports = {}) {
    const decompileSummary = getReportSummary(reports.decompileAuditReport);
    const schemaSummary = getReportSummary(reports.schemaBackedTableReport);
    const mechanicsSummary = getReportSummary(reports.tableMechanicsReport);
    const doDropSummary = getReportSummary(reports.doDropSemanticsReport);
    const helperSummary = getReportSummary(reports.dropHelperSemanticsReport);
    const manualReviewSummary = getReportSummary(reports.manualReviewTemplate);
    const strategyChainSummary = getReportSummary(reports.producerStrategyChainAuditReport);
    const reverseSourceReports = [
        reports.decompileAuditReport,
        reports.schemaBackedTableReport,
        reports.tableMechanicsReport,
        reports.doDropSemanticsReport,
        reports.dropHelperSemanticsReport
    ];
    const authorityGateReports = [
        ...reverseSourceReports,
        reports.manualReviewTemplate
    ];

    return {
        decompile_status: decompileSummary.mechanics_recovery_status || decompileSummary.parse_status || "unknown",
        table_schema_status: schemaSummary.parse_status || "unknown",
        table_mechanics_status: mechanicsSummary.mechanics_recovery_status || "unknown",
        dodrop_semantics_status: doDropSummary.parse_status || "unknown",
        helper_semantics_status: helperSummary.parse_status || "unknown",
        manual_review_status: manualReviewSummary.review_status || "unknown",
        producer_strategy_default_weight_status: strategyChainSummary.default_weight_implementation_status || "unknown",
        reverse_engineering_source_allowed: reverseSourceReports.every((report) => getBooleanSummary(report, "reverse_engineering_source_allowed")),
        all_reverse_default_update_gates_closed: authorityGateReports.every((report) => getReportSummary(report).default_config_update_allowed === false),
        all_reverse_authority_gates_closed: authorityGateReports.every((report) => getReportSummary(report).authority_adoption_allowed === false),
        helper_semantics_complete: (
            helperSummary.probability_mode_is_independent_bernoulli === true
            && helperSummary.weighted_mode_is_single_cumulative_choice === true
            && helperSummary.random_count_upper_bound_exclusive === true
        ),
        dodrop_il_signal_complete: doDropSummary.il_signal_complete === true,
        unresolved_callgraph_edge_ratio: getReportSummary(reports.methodCallgraphReport).unresolved_edge_ratio ?? null,
        maps_ready_for_default_weight_update_before_bidking: strategyChainSummary.maps_ready_for_default_weight_update ?? null
    };
}

function buildMapComparisonEntries({ config = defaultConfig, tableMechanicsReport = {} } = {}) {
    const alignments = Array.isArray(tableMechanicsReport.candidate_map_alignment)
        ? tableMechanicsReport.candidate_map_alignment
        : [];
    const mechanicsMaps = Array.isArray(tableMechanicsReport.mechanics && tableMechanicsReport.mechanics.maps)
        ? tableMechanicsReport.mechanics.maps
        : [];
    const mechanicsByMapId = new Map(mechanicsMaps.map((entry) => [entry.map_id, entry]));

    return TARGET_MAP_IDS.reduce((result, mapId) => {
        const current = buildCurrentMapSummary(config, mapId);
        const alignment = alignments.find((entry) => entry && entry.current_map_id === mapId) || null;
        const mechanicsMap = alignment ? mechanicsByMapId.get(alignment.bidking_map_id_candidate) : null;
        const rootRankMapSample = summarizeRootRankMapSample(mechanicsMap || {});
        const redBaseItemMean = current.value_model_summary.r.base_item_mean;

        result[mapId] = {
            current,
            bidking_alignment_candidate: alignment ? {
                bidking_map_id_candidate: alignment.bidking_map_id_candidate,
                bidking_bidmap_root_candidate: alignment.bidking_bidmap_root_candidate,
                evidence_labels: alignment.evidence_labels || [],
                confidence: alignment.confidence || "unknown",
                blocker: alignment.blocker || "manual confirmation required before config mapping"
            } : null,
            bidking_mechanics_candidate: mechanicsMap ? {
                map_id: mechanicsMap.map_id,
                bidmap_root_id: mechanicsMap.bidmap_root_id,
                item_count_range: mechanicsMap.item_count_range || null,
                bidmap_count: mechanicsMap.bidmap_count ?? null,
                rank_ai_rank_count: mechanicsMap.rank_ai_rank_count ?? null,
                root_rank_map_sample: rootRankMapSample
            } : null,
            comparison: {
                current_alpha_total_vs_bidking_item_count_range: compareNumberToRange(
                    current.alpha_total,
                    mechanicsMap ? mechanicsMap.item_count_range : []
                ),
                current_red_base_item_mean_vs_bidking_value_range: compareRedValueToBidKingRange(
                    redBaseItemMean,
                    rootRankMapSample
                ),
                default_weight_update_allowed: false,
                authority_adoption_allowed: false,
                shadow_candidate_allowed: false,
                correction_role: "shadow_sanity_check_only"
            },
            recommended_next_evidence: [
                "manual approve map alignment and table schema parse order",
                "attach same-battle replay samples before changing defaults",
                "run table-backed shadow replay before another Dirichlet weight fit"
            ]
        };
        return result;
    }, {});
}

function buildOptimizationQueue(mapEntries = {}) {
    const mapsWithAlphaBelowRange = Object.entries(mapEntries)
        .filter(([, entry]) => entry.comparison.current_alpha_total_vs_bidking_item_count_range.relation === "below_range")
        .map(([mapId]) => mapId);
    const mapsWithRedAboveRange = Object.entries(mapEntries)
        .filter(([, entry]) => entry.comparison.current_red_base_item_mean_vs_bidking_value_range.relation === "above_range")
        .map(([mapId]) => mapId);

    return [
        {
            id: "keep_default_config_as_authority",
            priority: "P0",
            status: "applied_guard",
            current_gap: "Reverse-engineered mechanics are not source-authoritative for live defaults.",
            action: "Keep default_config_bundle.js unchanged until manual review and replay gates pass.",
            default_config_update_allowed: false
        },
        {
            id: "table_backed_shadow_replay_before_next_weight_fit",
            priority: "P0",
            status: "blocked_by_manual_review",
            current_gap: "Current strategy optimizes map-level quality priors, while BidKing evidence points to Map/RankMap/Drop table mechanics.",
            action: "Build the next candidate from schema-backed table/drop mechanics as shadow replay, then compare against current estimator outputs.",
            blockers: [
                "manual_mechanics_review_pending",
                "same_battle_replay_samples_missing",
                "authority_handoff_gate_closed"
            ]
        },
        {
            id: "item_count_range_shadow_sanity_check",
            priority: "P1",
            status: "ready_for_shadow_report",
            current_gap: "Current alpha_total is a count-prior shape, not a recovered table item-count contract.",
            action: "Use recovered item_count_range only as a sanity diagnostic beside user-entered total_items.",
            affected_maps: mapsWithAlphaBelowRange
        },
        {
            id: "red_tail_value_band_alignment",
            priority: "P1",
            status: mapsWithRedAboveRange.length ? "needs_manual_alignment_review" : "shadow_compare_only",
            current_gap: "Current red value model and BidKing RankMap value bands are different evidence families.",
            action: "Compare red-tail settlement fit against recovered RankMap value ranges before changing value_model.",
            affected_maps: mapsWithRedAboveRange
        },
        {
            id: "drop_helper_runtime_contract",
            priority: "P1",
            status: "semantics_recovered_not_adopted",
            current_gap: "DoDrop has independent Bernoulli groups, single weighted-choice groups, nested groups, and exclusive RandomCount upper bounds.",
            action: "Any future shadow simulator must preserve these four semantics exactly and remain blocked from default config adoption."
        }
    ];
}

function buildBidKingStrategyComparisonReport({
    config = defaultConfig,
    decompileAuditReport = readJson(DEFAULT_DECOMPILE_AUDIT_REPORT_PATH),
    schemaBackedTableReport = readJson(DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH),
    tableMechanicsReport = readJson(DEFAULT_TABLE_MECHANICS_REPORT_PATH),
    doDropSemanticsReport = readJson(DEFAULT_DODROP_SEMANTICS_REPORT_PATH),
    dropHelperSemanticsReport = readJson(DEFAULT_DROP_HELPER_SEMANTICS_REPORT_PATH),
    manualReviewTemplate = readJson(DEFAULT_MANUAL_REVIEW_TEMPLATE_PATH),
    producerStrategyChainAuditReport = readJson(DEFAULT_PRODUCER_STRATEGY_CHAIN_AUDIT_REPORT_PATH),
    methodCallgraphReport = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const reports = {
        decompileAuditReport,
        schemaBackedTableReport,
        tableMechanicsReport,
        doDropSemanticsReport,
        dropHelperSemanticsReport,
        manualReviewTemplate,
        producerStrategyChainAuditReport,
        methodCallgraphReport
    };
    const evidence = buildEvidenceSummary(reports);
    const maps = buildMapComparisonEntries({ config, tableMechanicsReport });
    const optimizationQueue = buildOptimizationQueue(maps);
    const mapEntries = Object.values(maps);

    return {
        schema_version: "ak_bidking_strategy_comparison_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "SIM_ONLY",
        recommended_change_class: "SIM_ONLY",
        live_path_touched: false,
        summary: {
            comparison_status: "bidking_reverse_mechanics_compared_to_current_strategy",
            current_config_source_version: config && config.app ? config.app.config_source_version : null,
            compared_map_count: mapEntries.length,
            evidence_confidence: "medium",
            authority_adoption_allowed: false,
            default_config_update_allowed: false,
            shadow_candidate_allowed: false,
            reverse_engineering_source_allowed: evidence.reverse_engineering_source_allowed,
            helper_semantics_complete: evidence.helper_semantics_complete,
            dodrop_il_signal_complete: evidence.dodrop_il_signal_complete,
            maps_with_alpha_total_below_bidking_range: mapEntries.filter((entry) => (
                entry.comparison.current_alpha_total_vs_bidking_item_count_range.relation === "below_range"
            )).length,
            maps_with_red_value_above_bidking_value_range: mapEntries.filter((entry) => (
                entry.comparison.current_red_base_item_mean_vs_bidking_value_range.relation === "above_range"
            )).length,
            optimization_queue_count: optimizationQueue.length
        },
        gates: {
            manual_mechanics_review_approved: false,
            same_battle_replay_samples_attached: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        },
        evidence,
        algorithm_decision: {
            keep_current_default_weights: true,
            direct_bidking_weight_adoption_allowed: false,
            next_safe_algorithm_step: "table_backed_shadow_replay_after_manual_mechanics_review",
            reason: "Recovered mechanics are useful for shadow modeling, but map alignment, schema parse order, and replay evidence are still pending."
        },
        maps,
        optimization_queue: optimizationQueue,
        source_artifacts: {
            decompile_audit_report: DEFAULT_DECOMPILE_AUDIT_REPORT_PATH,
            schema_backed_table_report: DEFAULT_SCHEMA_BACKED_TABLE_REPORT_PATH,
            table_mechanics_report: DEFAULT_TABLE_MECHANICS_REPORT_PATH,
            dodrop_semantics_report: DEFAULT_DODROP_SEMANTICS_REPORT_PATH,
            drop_helper_semantics_report: DEFAULT_DROP_HELPER_SEMANTICS_REPORT_PATH,
            manual_review_template: DEFAULT_MANUAL_REVIEW_TEMPLATE_PATH,
            producer_strategy_chain_audit_report: DEFAULT_PRODUCER_STRATEGY_CHAIN_AUDIT_REPORT_PATH
        }
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

function compactAlpha(values = {}) {
    return QUALITIES.map((quality) => `${quality}:${values[quality] ?? 0}`).join(", ");
}

function formatBidKingStrategyComparisonMarkdown(report, jsonPath = DEFAULT_OUTPUT_PATH) {
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    const rows = Object.entries(report.maps || {}).map(([mapId, entry]) => {
        const current = entry.current || {};
        const bidking = entry.bidking_mechanics_candidate || {};
        const alphaRange = entry.comparison.current_alpha_total_vs_bidking_item_count_range || {};
        const redRange = entry.comparison.current_red_base_item_mean_vs_bidking_value_range || {};
        return `| ${markdownCode(mapId)} | ${markdownCell(compactAlpha(current.alpha_counts || {}))} | ${markdownCode(current.alpha_total)} | ${markdownCode((bidking.item_count_range || []).join("-"))} | ${markdownCode(alphaRange.relation)} | ${markdownCode(current.value_model_summary && current.value_model_summary.r && current.value_model_summary.r.base_item_mean)} | ${markdownCode((redRange.bidking_value_range || []).join("-"))} | ${markdownCode(redRange.relation)} | ${markdownCode(entry.comparison.default_weight_update_allowed === true)} |`;
    }).join("\n");
    const queueRows = (report.optimization_queue || []).map((entry) => (
        `| ${markdownCode(entry.priority)} | ${markdownCode(entry.id)} | ${markdownCode(entry.status)} | ${markdownCell(entry.action)} |`
    )).join("\n");

    return `# BidKing strategy comparison

- Change class: \`${report.change_class || "SIM_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- Current config source: \`${report.summary.current_config_source_version || "-"}\`
- Authority adoption allowed: \`${report.summary.authority_adoption_allowed === true}\`
- Default config update allowed: \`${report.summary.default_config_update_allowed === true}\`
- Shadow candidate allowed: \`${report.summary.shadow_candidate_allowed === true}\`
- Live/order/funds path touched: \`${report.live_path_touched === true}\`

## Evidence Gates

| gate | value |
| --- | --- |
| reverse engineering source allowed | \`${report.summary.reverse_engineering_source_allowed === true}\` |
| helper semantics complete | \`${report.summary.helper_semantics_complete === true}\` |
| DoDrop IL signal complete | \`${report.summary.dodrop_il_signal_complete === true}\` |
| manual mechanics review approved | \`${report.gates.manual_mechanics_review_approved === true}\` |
| table-backed shadow replay allowed | \`${report.gates.table_backed_shadow_replay_allowed === true}\` |
| authority handoff allowed | \`${report.gates.authority_handoff_allowed === true}\` |

## Map Comparison

| map | current alpha | alpha total | BidKing item range | alpha relation | current red mean | BidKing value range | red relation | default update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows || "| `-` | - | `-` | `-` | `-` | `-` | `-` | `-` | `false` |"}

## Optimization Queue

| priority | id | status | action |
| --- | --- | --- | --- |
${queueRows || "| `-` | `-` | `-` | - |"}

## Decision

Keep the current default estimator as runtime authority. The safe next algorithm step is a table-backed shadow replay only after manual mechanics review and same-battle replay evidence.
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
    const { outputPath } = resolveArgs(argv);
    const methodCallgraphReport = fs.existsSync(path.join(ROOT_DIR, "docs", "research", "2026-04-29-bidking-method-callgraph-report.json"))
        ? readJson(path.join(ROOT_DIR, "docs", "research", "2026-04-29-bidking-method-callgraph-report.json"))
        : {};
    const report = buildBidKingStrategyComparisonReport({ methodCallgraphReport });
    writeJson(outputPath, report);
    writeMarkdown(outputPath.replace(/\.json$/i, ".md"), formatBidKingStrategyComparisonMarkdown(report, outputPath));
    process.stdout.write(`${outputPath}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    buildBidKingStrategyComparisonReport,
    buildCurrentMapSummary,
    buildEvidenceSummary,
    buildMapComparisonEntries,
    compareNumberToRange,
    compareRedValueToBidKingRange,
    formatBidKingStrategyComparisonMarkdown,
    main,
    normalizeFractions,
    resolveArgs
};
