const bundledDefaultConfig = require("./default_config_bundle.js");

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function nearlyEqual(left, right, epsilon = 1e-9) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return Number.isFinite(leftNumber)
        && Number.isFinite(rightNumber)
        && Math.abs(leftNumber - rightNumber) <= epsilon;
}

function findCandidateByMultiplier(purpleFitReport = {}, multiplier) {
    const target = Number(multiplier);
    return (Array.isArray(purpleFitReport.candidates) ? purpleFitReport.candidates : [])
        .find((candidate) => nearlyEqual(candidate && candidate.multiplier, target)) || null;
}

function getCandidateMapPurple(candidate = {}, mapId) {
    const entry = candidate
        && candidate.candidate_alpha_counts_by_map
        && candidate.candidate_alpha_counts_by_map[mapId];
    return roundTo(entry && entry.p);
}

function getDefaultMapPurple(defaultConfig = {}, mapId) {
    const mapConfig = defaultConfig && defaultConfig.maps ? defaultConfig.maps[mapId] : null;
    return roundTo(mapConfig && mapConfig.alpha_counts && mapConfig.alpha_counts.p);
}

function buildDefaultWeightImplementationReport({
    defaultConfig = bundledDefaultConfig,
    purpleFitReport = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const selectedMultiplier = roundTo(
        purpleFitReport
            && purpleFitReport.recommendation
            && purpleFitReport.recommendation.selected_default_multiplier
    );
    const hasSelectedMultiplier = Number.isFinite(Number(selectedMultiplier));
    const baselineCandidate = findCandidateByMultiplier(purpleFitReport, 1);
    const selectedCandidate = findCandidateByMultiplier(purpleFitReport, selectedMultiplier);
    const candidateMaps = selectedCandidate && selectedCandidate.candidate_alpha_counts_by_map
        ? selectedCandidate.candidate_alpha_counts_by_map
        : {};
    const mapIds = Object.keys(candidateMaps).sort();

    const maps = Object.fromEntries(mapIds.map((mapId) => {
        const baselineP = getCandidateMapPurple(baselineCandidate, mapId);
        const expectedP = getCandidateMapPurple(selectedCandidate, mapId);
        const currentP = getDefaultMapPurple(defaultConfig, mapId);
        const appliedMultiplier = baselineP && currentP !== null ? roundTo(currentP / baselineP) : null;
        const matchesExpected = nearlyEqual(currentP, expectedP);

        return [mapId, {
            map_id: mapId,
            baseline_p: baselineP,
            expected_p: expectedP,
            current_p: currentP,
            applied_multiplier: appliedMultiplier,
            matches_expected: matchesExpected,
            update_scope: ["alpha_counts.p"]
        }];
    }));

    const appliedMapCount = Object.values(maps).filter((entry) => entry.matches_expected).length;
    const mismatchedMapCount = mapIds.length - appliedMapCount;

    return {
        schema_version: "ak_default_weight_implementation_report_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: hasSelectedMultiplier && mismatchedMapCount === 0 && selectedMultiplier > 1
            ? "SIM_ONLY"
            : "RESEARCH_ONLY",
        implementation_status: hasSelectedMultiplier
            ? (mismatchedMapCount === 0 ? "applied" : "mismatch")
            : "not_applicable",
        update_scope: ["maps.*.alpha_counts.p"],
        selected_multiplier: selectedMultiplier,
        source_fit_report: {
            schema_version: purpleFitReport.schema_version || null,
            generated_at: purpleFitReport.generated_at || null
        },
        authority_adoption_allowed: purpleFitReport.adoption_allowed === true,
        authority_blockers: Array.isArray(purpleFitReport.adoption_blockers)
            ? purpleFitReport.adoption_blockers.slice()
            : [],
        summary: {
            map_count: mapIds.length,
            applied_map_count: appliedMapCount,
            mismatched_map_count: mismatchedMapCount
        },
        maps
    };
}

module.exports = {
    buildDefaultWeightImplementationReport,
    findCandidateByMultiplier,
    roundTo
};
