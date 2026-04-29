const LEGACY_QUALITY_SIDE_KEYS = {
    o: "orange",
    r: "red"
};
const DEFAULT_QUALITY_ORDER = ["w", "g", "b", "p", "o", "r"];

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uniqueSorted(values = []) {
    return Array.from(new Set(values.filter(Boolean))).sort();
}

function resolveEvaluatedQualities(replayReport = {}) {
    const qualities = new Set();
    if (Array.isArray(replayReport.evaluated_qualities)) {
        replayReport.evaluated_qualities.forEach((quality) => {
            if (DEFAULT_QUALITY_ORDER.includes(quality)) qualities.add(quality);
        });
    }
    (Array.isArray(replayReport.samples) ? replayReport.samples : []).forEach((sample) => {
        ["baseline", "candidate"].forEach((sideKey) => {
            const side = sample && sample[sideKey];
            if (side && isPlainObject(side.quality_counts)) {
                Object.keys(side.quality_counts).forEach((quality) => {
                    if (DEFAULT_QUALITY_ORDER.includes(quality)) qualities.add(quality);
                });
            }
            Object.entries(LEGACY_QUALITY_SIDE_KEYS).forEach(([quality, legacyKey]) => {
                if (side && isPlainObject(side[legacyKey])) qualities.add(quality);
            });
        });
    });
    if (!qualities.size) {
        Object.keys(LEGACY_QUALITY_SIDE_KEYS).forEach((quality) => qualities.add(quality));
    }
    return DEFAULT_QUALITY_ORDER.filter((quality) => qualities.has(quality));
}

function getReplayQualityEntry(side = {}, quality) {
    if (!side || !isPlainObject(side)) return null;
    if (isPlainObject(side.quality_counts) && isPlainObject(side.quality_counts[quality])) {
        return side.quality_counts[quality];
    }
    const legacyKey = LEGACY_QUALITY_SIDE_KEYS[quality];
    return legacyKey && isPlainObject(side[legacyKey]) ? side[legacyKey] : null;
}

function resolveMapCandidateConfigStatus(mapId, candidateConfigContext = null) {
    if (!candidateConfigContext || !isPlainObject(candidateConfigContext)) {
        return {
            status: "unknown",
            reasons: []
        };
    }
    const appliedMaps = Array.isArray(candidateConfigContext.applied_maps)
        ? candidateConfigContext.applied_maps
        : [];
    const skippedMaps = Array.isArray(candidateConfigContext.skipped_maps)
        ? candidateConfigContext.skipped_maps
        : [];
    const skippedMapReasons = isPlainObject(candidateConfigContext.skipped_map_reasons)
        ? candidateConfigContext.skipped_map_reasons
        : {};
    if (appliedMaps.includes(mapId)) {
        return {
            status: "applied",
            reasons: []
        };
    }
    if (skippedMaps.includes(mapId)) {
        return {
            status: "skipped",
            reasons: Array.isArray(skippedMapReasons[mapId]) ? skippedMapReasons[mapId].slice() : []
        };
    }
    return {
        status: "not_listed",
        reasons: []
    };
}

function safeLogLoss(probability) {
    const prob = Number(probability);
    return -Math.log(Math.max(Number.isFinite(prob) ? prob : 0, 1e-12));
}

function countDirection(entry = {}) {
    const actual = Number(entry.actual_count);
    const mean = Number(entry.mean_count);
    if (!Number.isFinite(actual) || !Number.isFinite(mean)) return "unknown";
    const delta = mean - actual;
    if (Math.abs(delta) <= 0.1) return "near_actual";
    return delta > 0 ? "overpredicts_count" : "underpredicts_count";
}

function classifyComparison({ logLossDelta = 0, rankDelta = 0, absErrorDelta = 0 } = {}) {
    if (logLossDelta <= -0.05 && rankDelta <= 0 && absErrorDelta <= 0.1) return "improved";
    if (logLossDelta >= 0.05 || rankDelta > 0 || absErrorDelta > 0.25) return "degraded";
    return "neutral";
}

function compareReplayQuality({ quality, baseline = null, candidate = null } = {}) {
    if (!isPlainObject(baseline) || !isPlainObject(candidate)) return null;

    const baselineLogLoss = safeLogLoss(baseline.actual_prob);
    const candidateLogLoss = safeLogLoss(candidate.actual_prob);
    const rankDelta = (Number(candidate.rank) || 0) - (Number(baseline.rank) || 0);
    const absErrorDelta = (Number(candidate.abs_error) || 0) - (Number(baseline.abs_error) || 0);
    const logLossDelta = candidateLogLoss - baselineLogLoss;

    return {
        quality,
        actual_count: baseline.actual_count ?? candidate.actual_count ?? null,
        baseline_actual_prob: roundTo(baseline.actual_prob),
        candidate_actual_prob: roundTo(candidate.actual_prob),
        actual_prob_delta: roundTo((Number(candidate.actual_prob) || 0) - (Number(baseline.actual_prob) || 0)),
        baseline_log_loss: roundTo(baselineLogLoss),
        candidate_log_loss: roundTo(candidateLogLoss),
        log_loss_delta: roundTo(logLossDelta),
        baseline_rank: baseline.rank ?? null,
        candidate_rank: candidate.rank ?? null,
        rank_delta: roundTo(rankDelta),
        baseline_mean_count: roundTo(baseline.mean_count),
        candidate_mean_count: roundTo(candidate.mean_count),
        mean_count_delta: roundTo((Number(candidate.mean_count) || 0) - (Number(baseline.mean_count) || 0)),
        baseline_abs_error: roundTo(baseline.abs_error),
        candidate_abs_error: roundTo(candidate.abs_error),
        abs_error_delta: roundTo(absErrorDelta),
        baseline_direction: countDirection(baseline),
        candidate_direction: countDirection(candidate),
        classification: classifyComparison({ logLossDelta, rankDelta, absErrorDelta })
    };
}

function buildSampleDiagnostics(sample = {}, evaluatedQualities = DEFAULT_QUALITY_ORDER) {
    return evaluatedQualities.reduce((result, quality) => {
        const comparison = compareReplayQuality({
            quality,
            baseline: getReplayQualityEntry(sample.baseline, quality),
            candidate: getReplayQualityEntry(sample.candidate, quality)
        });
        if (comparison) result[quality] = comparison;
        return result;
    }, {});
}

function summarizeMapDiagnostics(samples = []) {
    const comparisons = samples.flatMap((sample) => Object.values(sample.qualities || {}));
    const summaryByQuality = {};
    DEFAULT_QUALITY_ORDER.forEach((quality) => {
        const entries = comparisons.filter((entry) => entry.quality === quality);
        if (!entries.length) return;
        const degradedCount = entries.filter((entry) => entry.classification === "degraded").length;
        const improvedCount = entries.filter((entry) => entry.classification === "improved").length;
        const neutralCount = entries.filter((entry) => entry.classification === "neutral").length;
        const dominantCandidateDirection = entries
            .map((entry) => entry.candidate_direction)
            .sort((left, right) => {
                const leftCount = entries.filter((entry) => entry.candidate_direction === left).length;
                const rightCount = entries.filter((entry) => entry.candidate_direction === right).length;
                return rightCount - leftCount || left.localeCompare(right);
            })[0];
        summaryByQuality[quality] = {
            sample_count: entries.length,
            degraded_count: degradedCount,
            improved_count: improvedCount,
            neutral_count: neutralCount,
            classification: degradedCount > improvedCount
                ? "degraded"
                : (improvedCount > degradedCount ? "improved" : "neutral"),
            mean_log_loss_delta: roundTo(entries.reduce((sum, entry) => sum + entry.log_loss_delta, 0) / entries.length),
            mean_abs_error_delta: roundTo(entries.reduce((sum, entry) => sum + entry.abs_error_delta, 0) / entries.length),
            candidate_direction: dominantCandidateDirection,
            dominant_candidate_direction: dominantCandidateDirection
        };
    });
    return summaryByQuality;
}

function buildGlobalBlockers(summary = {}) {
    const blockers = [];
    if (summary.degraded_count > summary.improved_count) blockers.push("candidate_loses_to_current_baseline");
    if (Array.isArray(summary.maps_skipped_by_replay_guard) && summary.maps_skipped_by_replay_guard.length) {
        blockers.push("candidate_config_skipped_regressed_baseline");
    }
    if (summary.evaluated_quality_count < 6) blockers.push("insufficient_replay_diagnostic_sample_size");
    blockers.push("research_only_shadow_candidate");
    return blockers;
}

function buildProducerStrategyReplayDiagnosticsReport({
    replayReport = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const evaluatedQualities = resolveEvaluatedQualities(replayReport);
    const sampleDiagnostics = (Array.isArray(replayReport.samples) ? replayReport.samples : []).map((sample) => ({
        id: sample.id || null,
        map_id: sample.map_id || "unknown",
        qualities: buildSampleDiagnostics(sample, evaluatedQualities)
    }));

    const allComparisons = sampleDiagnostics.flatMap((sample) => Object.values(sample.qualities));
    const candidateConfigContext = isPlainObject(replayReport.candidate_config_context)
        ? replayReport.candidate_config_context
        : null;
    const maps = {};
    uniqueSorted(sampleDiagnostics.map((sample) => sample.map_id)).forEach((mapId) => {
        const mapSamples = sampleDiagnostics.filter((sample) => sample.map_id === mapId);
        const candidateConfigStatus = resolveMapCandidateConfigStatus(mapId, candidateConfigContext);
        maps[mapId] = {
            map_id: mapId,
            sample_count: mapSamples.length,
            candidate_config_status: candidateConfigStatus,
            quality_summary: summarizeMapDiagnostics(mapSamples),
            samples: mapSamples
        };
    });

    const mapsSkippedByReplayGuard = uniqueSorted(Object.values(maps)
        .filter((entry) => entry.candidate_config_status
            && entry.candidate_config_status.status === "skipped"
            && Array.isArray(entry.candidate_config_status.reasons)
            && entry.candidate_config_status.reasons.includes("candidate_replay_regressed_baseline"))
        .map((entry) => entry.map_id));
    const summary = {
        sample_count: Number(replayReport.sample_count) || sampleDiagnostics.length,
        evaluated_quality_count: allComparisons.length,
        degraded_count: allComparisons.filter((entry) => entry.classification === "degraded").length,
        improved_count: allComparisons.filter((entry) => entry.classification === "improved").length,
        neutral_count: allComparisons.filter((entry) => entry.classification === "neutral").length,
        maps_skipped_by_replay_guard: mapsSkippedByReplayGuard,
        maps_with_degradation: uniqueSorted(sampleDiagnostics
            .filter((sample) => Object.values(sample.qualities).some((entry) => entry.classification === "degraded"))
            .map((sample) => sample.map_id)),
        maps_with_improvement: uniqueSorted(sampleDiagnostics
            .filter((sample) => Object.values(sample.qualities).some((entry) => entry.classification === "improved"))
            .map((sample) => sample.map_id))
    };

    return {
        schema_version: "ak_producer_strategy_replay_diagnostics_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        adoption_allowed: false,
        evaluated_qualities: evaluatedQualities,
        decision: mapsSkippedByReplayGuard.length
            ? "candidate_guarded_by_baseline"
            : (summary.degraded_count > summary.improved_count
            ? "candidate_loses_current_replay"
            : "candidate_requires_more_replay"),
        candidate_config_context: candidateConfigContext,
        summary,
        global_blockers: buildGlobalBlockers(summary),
        maps
    };
}

module.exports = {
    DEFAULT_QUALITY_ORDER,
    LEGACY_QUALITY_SIDE_KEYS,
    buildProducerStrategyReplayDiagnosticsReport,
    compareReplayQuality,
    getReplayQualityEntry,
    resolveMapCandidateConfigStatus
};
