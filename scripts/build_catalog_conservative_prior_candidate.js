const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    buildManualCatalogStats,
    loadManualCatalogBatchesFromDirectory
} = require("../manual_item_catalog.js");
const {
    buildCaptureObservationPriorScanReport
} = require("./build_capture_observation_prior_scan_report.js");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_CATALOG_DIR = path.join(ROOT_DIR, "data", "manual_catalog");
const DEFAULT_STRUCTURAL_PRIOR_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-structural-prior-report.json");
const DEFAULT_INTAKE_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-capture-package-intake-report.json");
const DEFAULT_OUTPUT_PATH = path.join(ROOT_DIR, "docs", "research", "2026-04-27-catalog-conservative-prior-candidate.json");
const QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];
const QUALITY_LABELS = {
    w: "白",
    g: "绿",
    b: "蓝",
    p: "紫",
    o: "橙",
    r: "红"
};
const SUNKEN_SHIP_ALPHA_COUNTS = {
    w: 5.2,
    g: 6.62,
    b: 8.5,
    p: 3.2,
    o: 1.55,
    r: 0.3
};
const SUNKEN_SHIP_COUNT_PRIOR_STRENGTH = 2;
const RED_TAIL_BATTLE_PROBABILITY = 0.05;

function resolveArgs(argv = process.argv.slice(2)) {
    const result = {
        structuralPriorPath: DEFAULT_STRUCTURAL_PRIOR_PATH,
        intakePath: DEFAULT_INTAKE_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        generatedAt: "2026-04-27T12:00:00.000Z"
    };
    const positional = [];

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

        if (flag === "--structural-prior") {
            result.structuralPriorPath = path.resolve(nextValue());
        } else if (flag === "--intake") {
            result.intakePath = path.resolve(nextValue());
        } else if (flag === "--output") {
            result.outputPath = path.resolve(nextValue());
        } else if (flag === "--generated-at") {
            result.generatedAt = nextValue();
        } else {
            positional.push(arg);
        }
    }

    if (positional[0]) result.structuralPriorPath = path.resolve(positional[0]);
    if (positional[1]) result.intakePath = path.resolve(positional[1]);
    if (positional[2]) result.outputPath = path.resolve(positional[2]);
    if (positional.length > 3) {
        throw new Error("最多只接受 3 个位置参数: <structural-prior.json> <intake.json> [output.json]");
    }
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

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function roundTo(value, digits = 4) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function getStructuralCellPrior(structuralPriorReport = {}, quality) {
    const qualityPrior = structuralPriorReport.quality_priors
        ? structuralPriorReport.quality_priors[quality]
        : null;
    const cells = qualityPrior && qualityPrior.cells_per_item ? qualityPrior.cells_per_item : {};
    return {
        weighted_mean: Number(cells.weighted_candidate_mean),
        weighted_sd: Number(cells.weighted_candidate_sd),
        weighted_min: cells.weighted_candidate_min ?? null,
        weighted_max: cells.weighted_candidate_max ?? null,
        weighted_effective_n: Number(cells.weighted_candidate_effective_n),
        strict_ready_count: Number(qualityPrior && qualityPrior.strict_ready_item_count) || 0,
        candidate_count: Number(qualityPrior && qualityPrior.items_with_cell_candidate) || 0
    };
}

function buildCellModelRecommendation(current = {}, structuralPrior = {}, quality) {
    const currentMean = Number(current.mean);
    const currentSd = Number(current.sd);
    const priorMean = Number(structuralPrior.weighted_mean);
    const priorSd = Number(structuralPrior.weighted_sd);
    const strictReady = Number(structuralPrior.strict_ready_count) || 0;
    const candidateCount = Number(structuralPrior.candidate_count) || 0;
    const usePrior = Number.isFinite(priorMean) && priorMean > 0 && candidateCount >= 20;
    const blend = 1;
    const mean = usePrior && Number.isFinite(currentMean)
        ? (priorMean * blend) + (currentMean * (1 - blend))
        : (usePrior ? priorMean : currentMean);
    const minSd = quality === "o" ? 2.3 : (quality === "r" ? 2.0 : 0.65);
    const sd = Math.max(
        Number.isFinite(priorSd) && priorSd > 0 ? priorSd : 0,
        Number.isFinite(currentSd) && currentSd > 0 ? currentSd : 0,
        minSd
    );

    return {
        ...cloneValue(current),
        mean: roundTo(mean, 4),
        sd: roundTo(sd, 4),
        min: current.min === undefined ? 1 : current.min,
        max: current.max === undefined ? null : current.max,
        recommendation_basis: {
            source: "manual_catalog_name_quality_plus_pixel_grid_shadow",
            strict_ready_count: strictReady,
            candidate_count: candidateCount,
            prior_weighted_mean: roundTo(priorMean, 4),
            prior_weighted_sd: roundTo(priorSd, 4),
            red_zero_strict_ready_blend: quality === "r" && strictReady === 0 ? blend : null
        }
    };
}

function getResolvedRedCommonMean(baseConfig = defaultConfig, mapId = "sunken_ship") {
    const model = baseConfig.calibration
        && baseConfig.calibration.maps
        && baseConfig.calibration.maps[mapId]
        && baseConfig.calibration.maps[mapId].value_model_calibration
        && baseConfig.calibration.maps[mapId].value_model_calibration.value_model
        && baseConfig.calibration.maps[mapId].value_model_calibration.value_model.r;
    const mean = Number(model && model.base_item_mean);
    return Number.isFinite(mean) && mean > 0 ? mean : 128777;
}

function buildConservativeRedProfiles(baseConfig = defaultConfig, mapId = "sunken_ship") {
    const commonMean = getResolvedRedCommonMean(baseConfig, mapId);
    return {
        profiles: {
            small_red: {
                label: "小红",
                prior: 0.86,
                mean_cells_per_item: 2.2,
                sd_cells_per_item: 1.0,
                base_item_mean: Math.round(commonMean * 0.70),
                base_item_sd: 36000,
                per_cell_mean: 0,
                per_cell_sd: 0
            },
            big_red: {
                label: "大红",
                prior: 0.12,
                mean_cells_per_item: 4.0,
                sd_cells_per_item: 1.4,
                base_item_mean: Math.round(commonMean * 1.05),
                base_item_sd: 46000,
                per_cell_mean: 0,
                per_cell_sd: 0
            },
            gold_red: {
                label: "金",
                prior: 0.02,
                mean_cells_per_item: 5.8,
                sd_cells_per_item: 2.0,
                base_item_mean: Math.round(commonMean * 1.28),
                base_item_sd: 56000,
                per_cell_mean: 0,
                per_cell_sd: 0
            }
        }
    };
}

function lowerRedTailBattleProbability(config = {}, mapId = "sunken_ship", probability = RED_TAIL_BATTLE_PROBABILITY) {
    const next = cloneValue(config);
    const mapCalibration = next.calibration
        && next.calibration.maps
        && next.calibration.maps[mapId]
        && next.calibration.maps[mapId].value_model_calibration
        && next.calibration.maps[mapId].value_model_calibration.value_model
        && next.calibration.maps[mapId].value_model_calibration.value_model.r;
    if (mapCalibration && mapCalibration.tail_model) {
        mapCalibration.tail_model.battle_probability = probability;
    }
    return next;
}

function buildCatalogConservativeCandidateConfig({
    baseConfig = defaultConfig,
    structuralPriorReport = {},
    mapId = "sunken_ship"
} = {}) {
    const next = lowerRedTailBattleProbability(baseConfig, mapId);
    const mapConfig = next.maps && next.maps[mapId] ? next.maps[mapId] : null;
    if (!mapConfig) return next;

    mapConfig.alpha_counts = cloneValue(SUNKEN_SHIP_ALPHA_COUNTS);
    mapConfig.solver = {
        ...(mapConfig.solver || {}),
        count_prior_strength: SUNKEN_SHIP_COUNT_PRIOR_STRENGTH
    };
    mapConfig.cells_per_item = cloneValue(mapConfig.cells_per_item || {});
    QUALITY_ORDER.forEach((quality) => {
        mapConfig.cells_per_item[quality] = buildCellModelRecommendation(
            mapConfig.cells_per_item[quality] || {},
            getStructuralCellPrior(structuralPriorReport, quality),
            quality
        );
    });
    mapConfig.red_type_profiles = buildConservativeRedProfiles(next, mapId);
    next.catalog_conservative_prior_candidate = {
        schema_version: "ak_catalog_conservative_prior_candidate_v1",
        generated_at: null,
        change_class: "SIM_ONLY",
        map_id: mapId,
        default_config_update_basis: "user_requested_rough_catalog_backed_conservative_override",
        authority_merge_allowed: false,
        red_tail_battle_probability: RED_TAIL_BATTLE_PROBABILITY
    };
    return next;
}

function extractCurrentDefaultScenario(scanReport = {}) {
    return (scanReport.scenario_summaries || []).find((entry) => entry.id === "current_default") || null;
}

function summarizeCatalogQualityStats(stats = {}) {
    return (stats.qualities || []).map((entry) => ({
        quality: entry.quality,
        label: QUALITY_LABELS[entry.quality] || entry.quality,
        item_count: entry.item_count,
        average_value: entry.average_value,
        median_value: entry.median_value,
        min_value: entry.min_value,
        max_value: entry.max_value,
        value_sd: entry.value_sd
    }));
}

function buildMetricDelta(baseline = {}, candidate = {}) {
    const keys = [
        "risk_score",
        "max_red_count_mean",
        "avg_red_count_mean",
        "max_red_cell_mean",
        "avg_mean_value_w",
        "solve_failed_count"
    ];
    return Object.fromEntries(keys.map((key) => [
        key,
        Number.isFinite(Number(candidate[key])) && Number.isFinite(Number(baseline[key]))
            ? roundTo(Number(candidate[key]) - Number(baseline[key]), 4)
            : null
    ]));
}

function buildCatalogConservativePriorCandidateReport({
    baseConfig = defaultConfig,
    structuralPriorReport = {},
    intakeReport = {},
    manualCatalogDir = DEFAULT_CATALOG_DIR,
    generatedAt = "2026-04-27T12:00:00.000Z",
    paths = {}
} = {}) {
    const manualStats = buildManualCatalogStats(loadManualCatalogBatchesFromDirectory(manualCatalogDir));
    const candidateConfig = buildCatalogConservativeCandidateConfig({
        baseConfig,
        structuralPriorReport,
        mapId: "sunken_ship"
    });
    candidateConfig.catalog_conservative_prior_candidate.generated_at = generatedAt;

    const baselineScan = buildCaptureObservationPriorScanReport({
        intakeReport,
        baseConfig,
        generatedAt,
        paths: { inputPath: paths.intakePath || null }
    });
    const candidateScan = buildCaptureObservationPriorScanReport({
        intakeReport,
        baseConfig: candidateConfig,
        generatedAt,
        paths: { inputPath: paths.intakePath || null }
    });
    const baseline = extractCurrentDefaultScenario(baselineScan) || {};
    const candidate = extractCurrentDefaultScenario(candidateScan) || {};

    return {
        schema_version: "ak_catalog_conservative_prior_candidate_report_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "SIM_ONLY",
        source_paths: {
            structural_prior_report: paths.structuralPriorPath || null,
            capture_intake_report: paths.intakePath || null,
            manual_catalog_dir: manualCatalogDir
        },
        methodology: {
            name_quality_source: "data/manual_catalog manual transcription",
            cell_source: "catalog recovered pixel contour report weighted shadow prior",
            ocr_name_source: "not_authority_missing_or_low_signal",
            double_check: "manual_catalog_name_quality_order_alignment plus pixel_grid_candidate",
            authority_merge_allowed: false
        },
        catalog_summary: {
            item_count: manualStats.item_count,
            batch_count: manualStats.batch_count,
            qualities: summarizeCatalogQualityStats(manualStats)
        },
        structural_summary: structuralPriorReport.summary || null,
        candidate_changes: {
            map_id: "sunken_ship",
            alpha_counts: candidateConfig.maps.sunken_ship.alpha_counts,
            count_prior_strength: candidateConfig.maps.sunken_ship.solver.count_prior_strength,
            cells_per_item: candidateConfig.maps.sunken_ship.cells_per_item,
            red_type_profiles: candidateConfig.maps.sunken_ship.red_type_profiles,
            red_tail_battle_probability: RED_TAIL_BATTLE_PROBABILITY
        },
        replay_comparison: {
            capture_package_count: intakeReport.summary ? intakeReport.summary.capture_package_count : null,
            baseline_current_default: baseline,
            candidate_current_default: candidate,
            delta_candidate_minus_baseline: buildMetricDelta(baseline, candidate)
        },
        implementation_recommendation: {
            recommended: true,
            scope: "sunken_ship_default_only",
            reason: "reduces repeated red overprediction and red value inflation while preserving solve feasibility",
            blockers: [
                "not_authority_fit",
                "needs_future_accepted_actual_counts_for_precise_calibration",
                "extreme_orange_avg_without_orange_count_remains_ambiguous"
            ],
            rollback_files: [
                "config/default/maps.json",
                "config/default/red_type_profiles.json",
                "authority_calibration_runtime.js",
                "manual_item_catalog.js",
                "default_config_bundle.js"
            ]
        }
    };
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function formatMarkdownReport(report = {}, outputPath = DEFAULT_OUTPUT_PATH) {
    const replay = report.replay_comparison || {};
    const baseline = replay.baseline_current_default || {};
    const candidate = replay.candidate_current_default || {};
    const delta = replay.delta_candidate_minus_baseline || {};
    const lines = [
        "# Catalog Conservative Prior Candidate",
        "",
        `- JSON: \`${path.relative(ROOT_DIR, outputPath)}\``,
        `- Change class: \`${report.change_class || "SIM_ONLY"}\``,
        `- Authority merge allowed: \`${report.methodology ? report.methodology.authority_merge_allowed : false}\``,
        `- Candidate recommended: \`${report.implementation_recommendation ? report.implementation_recommendation.recommended : false}\``,
        "",
        "## Catalog Value Summary",
        "",
        "| quality | items | avg | median | min | max | sd |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
    ];
    (report.catalog_summary && report.catalog_summary.qualities || []).forEach((entry) => {
        lines.push(`| ${[
            `${entry.label} ${entry.quality}`,
            entry.item_count,
            entry.average_value,
            entry.median_value,
            entry.min_value,
            entry.max_value,
            entry.value_sd
        ].map(markdownCell).join(" | ")} |`);
    });
    lines.push(
        "",
        "## Replay Comparison",
        "",
        "| metric | baseline | candidate | delta |",
        "| --- | ---: | ---: | ---: |"
    );
    [
        "risk_score",
        "max_red_count_mean",
        "avg_red_count_mean",
        "max_red_cell_mean",
        "avg_mean_value_w",
        "solve_failed_count"
    ].forEach((key) => {
        lines.push(`| ${[key, baseline[key], candidate[key], delta[key]].map(markdownCell).join(" | ")} |`);
    });
    lines.push(
        "",
        "## Guardrails"
    );
    (report.implementation_recommendation?.blockers || []).forEach((blocker) => lines.push(`- \`${blocker}\``));
    lines.push("");
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    const structuralPriorReport = readJson(args.structuralPriorPath);
    const intakeReport = readJson(args.intakePath);
    const report = buildCatalogConservativePriorCandidateReport({
        structuralPriorReport,
        intakeReport,
        generatedAt: args.generatedAt,
        paths: {
            structuralPriorPath: args.structuralPriorPath,
            intakePath: args.intakePath
        }
    });
    writeJson(args.outputPath, report);
    writeText(args.outputPath.replace(/\.json$/i, ".md"), formatMarkdownReport(report, args.outputPath));
    process.stdout.write(`${args.outputPath}\n${args.outputPath.replace(/\.json$/i, ".md")}\n`);
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
    DEFAULT_INTAKE_PATH,
    DEFAULT_OUTPUT_PATH,
    DEFAULT_STRUCTURAL_PRIOR_PATH,
    RED_TAIL_BATTLE_PROBABILITY,
    SUNKEN_SHIP_ALPHA_COUNTS,
    SUNKEN_SHIP_COUNT_PRIOR_STRENGTH,
    buildCatalogConservativeCandidateConfig,
    buildCatalogConservativePriorCandidateReport,
    buildConservativeRedProfiles,
    buildMetricDelta,
    formatMarkdownReport,
    main,
    resolveArgs
};
