const MIN_DEFAULT_UPDATE_FULL_DISTRIBUTION_SAMPLES = 3;

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundTo(value, digits = 6) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const factor = 10 ** digits;
    const rounded = Math.round(numeric * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

function uniqueList(values = []) {
    return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== "")));
}

function includesAny(values = [], needles = []) {
    return values.some((value) => needles.includes(value));
}

function summarizeReplayFits(fits = {}) {
    const entries = Object.entries(isPlainObject(fits) ? fits : {});
    const finiteZValues = entries
        .map(([, fit]) => Number(fit && fit.max_abs_z))
        .filter((value) => Number.isFinite(value));
    const maxAbsZ = finiteZValues.length ? Math.max(...finiteZValues) : null;
    const withinTwoSigmaCount = entries.filter(([, fit]) => fit && fit.all_within_2sigma === true).length;

    return {
        sample_count: entries.length,
        within_2sigma_count: withinTwoSigmaCount,
        all_within_2sigma: entries.length > 0 && withinTwoSigmaCount === entries.length,
        max_abs_z: maxAbsZ === null ? null : roundTo(maxAbsZ),
        sample_ids: entries.map(([id]) => id)
    };
}

function summarizeQualityFits(fits = {}) {
    const qualities = ["p", "o", "r"];
    return qualities.reduce((result, quality) => {
        const fit = isPlainObject(fits) ? fits[quality] || {} : {};
        result[quality] = {
            z: fit.z ?? null,
            within_2sigma: fit.within_2sigma === true
        };
        return result;
    }, {});
}

function buildNextEvidenceNeeded({ gates = {}, countEntry = null, valueEntry = null } = {}) {
    const needs = [];
    if (gates.count_fit_readiness_passed === false) {
        needs.push("settlement_count_fit_readiness_must_pass");
    }
    if (!gates.full_distribution_sample_gate) {
        needs.push("human_labeled_full_distribution_clean_replay_min_3");
    }
    if (gates.pixel_shadow_review_only) {
        needs.push("replace_pixel_shadow_with_same_battle_manual_actual_counts");
    }
    if (!gates.value_catalog_2sigma) {
        needs.push(valueEntry ? "catalog_or_settlement_value_replay_within_2sigma" : "producer_value_model_report");
    }
    if (!gates.family_runtime_enabled) {
        needs.push("family_runtime_gate_or_remove_family_prior_from_adoption");
    }
    if (!countEntry) {
        needs.push("producer_count_prior_model_report");
    }
    if (gates.candidate_replay_passed === false) {
        needs.push("candidate_replay_must_not_regress_baseline");
    }
    return uniqueList(needs);
}

function collectMapIds(countPriorReport = {}, valueModelReport = {}, countFitReadinessReport = {}) {
    const ids = new Set();
    Object.keys(countPriorReport.maps || {}).forEach((mapId) => ids.add(mapId));
    Object.keys(valueModelReport.maps || {}).forEach((mapId) => ids.add(mapId));
    Object.keys(countFitReadinessReport.maps || {}).forEach((mapId) => ids.add(mapId));
    return Array.from(ids).sort();
}

function hasReplayDegradation(replayDiagnosticsEntry = null) {
    if (!replayDiagnosticsEntry) return false;
    const candidateConfigStatus = isPlainObject(replayDiagnosticsEntry.candidate_config_status)
        ? replayDiagnosticsEntry.candidate_config_status
        : null;
    if (
        candidateConfigStatus
        && candidateConfigStatus.status === "skipped"
        && Array.isArray(candidateConfigStatus.reasons)
        && candidateConfigStatus.reasons.includes("candidate_replay_regressed_baseline")
    ) {
        return true;
    }
    if (!isPlainObject(replayDiagnosticsEntry.quality_summary)) return false;
    return Object.values(replayDiagnosticsEntry.quality_summary)
        .some((entry) => entry && entry.classification === "degraded");
}

function hasCandidateConfigSkipReason(candidateConfigStatus = null, reason) {
    return !!(
        candidateConfigStatus
        && candidateConfigStatus.status === "skipped"
        && Array.isArray(candidateConfigStatus.reasons)
        && candidateConfigStatus.reasons.includes(reason)
    );
}

function resolveCandidateReplayGate(replayDiagnosticsEntry = null) {
    if (!replayDiagnosticsEntry) {
        return {
            evaluated: false,
            passed: null
        };
    }

    const candidateConfigStatus = isPlainObject(replayDiagnosticsEntry.candidate_config_status)
        ? replayDiagnosticsEntry.candidate_config_status
        : null;
    if (hasCandidateConfigSkipReason(candidateConfigStatus, "candidate_replay_regressed_baseline")) {
        return {
            evaluated: true,
            passed: false
        };
    }
    if (candidateConfigStatus && candidateConfigStatus.status === "skipped") {
        return {
            evaluated: false,
            passed: null
        };
    }

    return {
        evaluated: true,
        passed: !hasReplayDegradation(replayDiagnosticsEntry)
    };
}

function hasCountFitReadinessReport(countFitReadinessReport = {}) {
    return isPlainObject(countFitReadinessReport) && isPlainObject(countFitReadinessReport.maps);
}

function summarizeCountFitReadiness(countFitReadinessEntry = null) {
    if (!isPlainObject(countFitReadinessEntry)) return null;
    return {
        two_sigma_count_fit_allowed: countFitReadinessEntry.two_sigma_count_fit_allowed === true,
        blocked_qualities: Array.isArray(countFitReadinessEntry.blocked_qualities)
            ? countFitReadinessEntry.blocked_qualities.slice()
            : [],
        fit_gap_by_quality: isPlainObject(countFitReadinessEntry.fit_gap_by_quality)
            ? countFitReadinessEntry.fit_gap_by_quality
            : {},
        observed_state_fit_gap: Number.isFinite(Number(countFitReadinessEntry.observed_state_fit_gap))
            ? Number(countFitReadinessEntry.observed_state_fit_gap)
            : null,
        risk_flags: Array.isArray(countFitReadinessEntry.risk_flags)
            ? countFitReadinessEntry.risk_flags.slice()
            : []
    };
}

function buildMapStrategyEntry(
    mapId,
    countEntry = null,
    valueEntry = null,
    globalFamilyStatus = null,
    replayDiagnosticsEntry = null,
    countFitReadinessEntry = null,
    countFitReadinessEvaluated = false
) {
    const countBlockers = Array.isArray(countEntry && countEntry.blockers) ? countEntry.blockers : [];
    const valueBlockers = Array.isArray(valueEntry && valueEntry.blockers) ? valueEntry.blockers : [];
    const replayFitSummary = summarizeReplayFits(countEntry && countEntry.clean_replay_two_sigma_fit);
    const cleanReplaySampleCount = Number(countEntry && countEntry.clean_replay_sample_count) || 0;
    const fullDistributionSampleCount = Number(countEntry && countEntry.clean_replay_full_distribution_sample_count) || 0;
    const countFitReadiness = summarizeCountFitReadiness(countFitReadinessEntry);
    const countFitReadinessPassed = countFitReadinessEvaluated
        ? !!(countFitReadiness && countFitReadiness.two_sigma_count_fit_allowed === true)
        : null;
    const familyStatus = (valueEntry && valueEntry.runtime_family_status) || globalFamilyStatus || "unknown";
    const pixelShadowReviewOnly = includesAny(countBlockers, [
        "pixel_shadow_review_only",
        "crop_sensitive_pixel_counts",
        "low_confidence_pixel_blocks"
    ]);
    const valueCatalogTwoSigma = valueEntry ? valueEntry.all_target_fits_within_2sigma === true : false;
    const candidateReplayGate = resolveCandidateReplayGate(replayDiagnosticsEntry);
    const candidateReplayEvaluated = candidateReplayGate.evaluated;
    const candidateReplayPassed = candidateReplayGate.passed;
    const gates = {
        partial_clean_replay_within_2sigma: replayFitSummary.sample_count > 0 && replayFitSummary.all_within_2sigma,
        full_distribution_sample_gate: fullDistributionSampleCount >= MIN_DEFAULT_UPDATE_FULL_DISTRIBUTION_SAMPLES,
        value_catalog_2sigma: valueCatalogTwoSigma,
        family_runtime_enabled: familyStatus !== "phase1_disabled",
        pixel_shadow_review_only: pixelShadowReviewOnly,
        producer_assumption_review_only: countBlockers.includes("producer_assumption_not_authority"),
        candidate_replay_evaluated: candidateReplayEvaluated,
        candidate_replay_passed: candidateReplayPassed,
        count_fit_readiness_evaluated: countFitReadinessEvaluated,
        count_fit_readiness_passed: countFitReadinessPassed
    };
    gates.sim_replay_candidate = gates.partial_clean_replay_within_2sigma && gates.value_catalog_2sigma;
    gates.default_weight_update_allowed = (
        gates.full_distribution_sample_gate &&
        gates.value_catalog_2sigma &&
        gates.family_runtime_enabled &&
        gates.candidate_replay_passed !== false &&
        gates.count_fit_readiness_passed !== false &&
        !gates.pixel_shadow_review_only &&
        !gates.producer_assumption_review_only
    );

    return {
        map_id: mapId,
        label: (countEntry && countEntry.label) || (valueEntry && valueEntry.label) || mapId,
        alpha_counts_candidate: countEntry && isPlainObject(countEntry.alpha_counts_candidate)
            ? countEntry.alpha_counts_candidate
            : null,
        count_prior_strength_candidate: countEntry ? countEntry.count_prior_strength_candidate ?? null : null,
        clean_replay_sample_count: cleanReplaySampleCount,
        clean_replay_full_distribution_sample_count: fullDistributionSampleCount,
        clean_replay_two_sigma_summary: replayFitSummary,
        count_fit_readiness: countFitReadiness,
        quality_value_fit_summary: valueEntry ? summarizeQualityFits(valueEntry.quality_fits) : null,
        all_target_value_fits_within_2sigma: valueCatalogTwoSigma,
        red_type_value_envelope: valueEntry && isPlainObject(valueEntry.red_type_value_envelope)
            ? valueEntry.red_type_value_envelope
            : null,
        replay_diagnostics: replayDiagnosticsEntry || null,
        runtime_family_status: familyStatus,
        gates,
        recommended_change_class: gates.default_weight_update_allowed ? "SIM_ONLY" : "RESEARCH_ONLY",
        next_change_class_candidate: gates.sim_replay_candidate ? "SIM_ONLY" : "RESEARCH_ONLY",
        default_config_update_allowed: gates.default_weight_update_allowed,
        next_evidence_needed: buildNextEvidenceNeeded({ gates, countEntry, valueEntry }),
        blockers: uniqueList([...countBlockers, ...valueBlockers])
    };
}

function buildGlobalBlockers(mapEntries = [], familyStatus = null) {
    const blockers = [];
    if (mapEntries.some((entry) => entry.gates.count_fit_readiness_passed === false)) {
        blockers.push("settlement_count_fit_readiness_below_two_sigma_gate");
    }
    if (mapEntries.some((entry) => !entry.gates.full_distribution_sample_gate)) {
        blockers.push("clean_replay_sample_size_below_default_update_gate");
    }
    if (mapEntries.some((entry) => entry.gates.pixel_shadow_review_only)) {
        blockers.push("pixel_shadow_review_only");
    }
    if (familyStatus === "phase1_disabled" || mapEntries.some((entry) => entry.runtime_family_status === "phase1_disabled")) {
        blockers.push("collection_family_runtime_disabled");
    }
    if (mapEntries.some((entry) => !entry.gates.value_catalog_2sigma)) {
        blockers.push("value_model_two_sigma_or_missing_report");
    }
    if (!mapEntries.some((entry) => entry.gates.default_weight_update_allowed)) {
        blockers.push("no_map_passed_default_update_gate");
    }
    if (mapEntries.some((entry) => entry.gates.candidate_replay_passed === false)) {
        blockers.push("candidate_replay_regresses_baseline");
    }
    return uniqueList(blockers);
}

function buildProducerStrategyArchitectureReport({
    countPriorReport = {},
    valueModelReport = {},
    replayDiagnosticsReport = {},
    countFitReadinessReport = {},
    generatedAt = new Date().toISOString()
} = {}) {
    const familyStatus = valueModelReport.runtime_family_status || null;
    const mapIds = collectMapIds(countPriorReport, valueModelReport, countFitReadinessReport);
    const countFitReadinessEvaluated = hasCountFitReadinessReport(countFitReadinessReport);
    const maps = {};
    mapIds.forEach((mapId) => {
        maps[mapId] = buildMapStrategyEntry(
            mapId,
            countPriorReport.maps ? countPriorReport.maps[mapId] : null,
            valueModelReport.maps ? valueModelReport.maps[mapId] : null,
            familyStatus,
            replayDiagnosticsReport.maps ? replayDiagnosticsReport.maps[mapId] : null,
            countFitReadinessReport.maps ? countFitReadinessReport.maps[mapId] : null,
            countFitReadinessEvaluated
        );
    });
    const mapEntries = Object.values(maps);

    return {
        schema_version: "ak_producer_strategy_architecture_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        recommended_change_class: "RESEARCH_ONLY",
        adoption_allowed: false,
        architecture: [
            "pixel_shadow_review_source",
            "producer_dirichlet_count_prior",
            "clean_replay_multinomial_two_sigma_gate",
            "settlement_count_fit_readiness_gate",
            "catalog_unit_value_two_sigma_gate",
            "red_type_value_mixture_runtime",
            "collection_family_shadow_disabled_gate",
            "default_config_adoption_gate"
        ],
        decision_policy: {
            pixel_quality_draft_role: "review_only",
            count_prior_default_gate: `>=${MIN_DEFAULT_UPDATE_FULL_DISTRIBUTION_SAMPLES}_human_labeled_full_distribution_clean_replay_samples_per_map`,
            count_fit_readiness_gate: "settlement_count_fit_readiness_report.two_sigma_count_fit_allowed",
            value_model_gate: "p_o_r_catalog_or_settlement_value_within_2sigma",
            family_prior_role: "shadow_until_runtime_enabled_or_removed_from_adoption_gate",
            default_config_update: "blocked_until_all_gates_pass"
        },
        summary: {
            map_count: mapEntries.length,
            maps_with_partial_clean_replay_within_2sigma: mapEntries.filter((entry) => entry.gates.partial_clean_replay_within_2sigma).length,
            maps_with_full_distribution_gate: mapEntries.filter((entry) => entry.gates.full_distribution_sample_gate).length,
            maps_with_count_fit_readiness_passed: mapEntries.filter((entry) => entry.gates.count_fit_readiness_passed === true).length,
            maps_with_value_fit_within_2sigma: mapEntries.filter((entry) => entry.gates.value_catalog_2sigma).length,
            maps_ready_for_sim_replay: mapEntries.filter((entry) => entry.gates.sim_replay_candidate).length,
            maps_with_candidate_replay_passed: mapEntries.filter((entry) => entry.gates.candidate_replay_passed === true).length,
            maps_ready_for_default_weight_update: mapEntries.filter((entry) => entry.gates.default_weight_update_allowed).length,
            adoption_allowed: false
        },
        global_blockers: buildGlobalBlockers(mapEntries, familyStatus),
        external_research_links: uniqueList([
            ...(Array.isArray(countPriorReport.external_research_links) ? countPriorReport.external_research_links : []),
            ...(Array.isArray(valueModelReport.external_research_links) ? valueModelReport.external_research_links : [])
        ]),
        maps
    };
}

module.exports = {
    MIN_DEFAULT_UPDATE_FULL_DISTRIBUTION_SAMPLES,
    buildProducerStrategyArchitectureReport,
    summarizeCountFitReadiness,
    summarizeReplayFits
};
