const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildProducerStrategyArchitectureReport,
    summarizeReplayFits
} = require("../src/research/producer_strategy_architecture_report.js");

test("summarizeReplayFits keeps partial clean replay evidence as two-sigma review data", () => {
    const summary = summarizeReplayFits({
        sample_a: { all_within_2sigma: true, max_abs_z: 1.2 },
        sample_b: { all_within_2sigma: false, max_abs_z: 2.4 }
    });

    assert.equal(summary.sample_count, 2);
    assert.equal(summary.within_2sigma_count, 1);
    assert.equal(summary.all_within_2sigma, false);
    assert.equal(summary.max_abs_z, 2.4);
});

test("buildProducerStrategyArchitectureReport blocks default adoption while keeping sim readiness explicit", () => {
    const report = buildProducerStrategyArchitectureReport({
        countPriorReport: {
            schema_version: "ak_producer_count_prior_model_v1",
            external_research_links: ["https://example.test/source"],
            maps: {
                villa: {
                    map_id: "villa",
                    alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                    count_prior_strength_candidate: 16,
                    clean_replay_sample_count: 1,
                    clean_replay_full_distribution_sample_count: 0,
                    clean_replay_two_sigma_fit: {
                        villa_partial: { all_within_2sigma: true, max_abs_z: 1.1 }
                    },
                    blockers: ["insufficient_clean_replay_sample_size", "pixel_shadow_review_only"]
                },
                shipping: {
                    map_id: "shipping",
                    alpha_counts_candidate: { w: 3, g: 4, b: 4, p: 3, o: 3, r: 1 },
                    clean_replay_sample_count: 0,
                    clean_replay_full_distribution_sample_count: 0,
                    clean_replay_two_sigma_fit: {},
                    blockers: ["missing_clean_replay_samples"]
                }
            }
        },
        valueModelReport: {
            runtime_family_status: "phase1_disabled",
            maps: {
                villa: {
                    map_id: "villa",
                    runtime_family_status: "phase1_disabled",
                    all_target_fits_within_2sigma: true,
                    quality_fits: {
                        p: { z: 0.5, within_2sigma: true },
                        o: { z: -0.9, within_2sigma: true },
                        r: { z: -0.2, within_2sigma: true }
                    },
                    red_type_value_envelope: { mean_unit_value: 215284, low_2sigma: 0, high_2sigma: 455910 },
                    blockers: ["collection_family_runtime_disabled"]
                }
            }
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.equal(report.schema_version, "ak_producer_strategy_architecture_v1");
    assert.equal(report.adoption_allowed, false);
    assert.equal(report.summary.map_count, 2);
    assert.equal(report.summary.maps_with_value_fit_within_2sigma, 1);
    assert.equal(report.summary.maps_ready_for_default_weight_update, 0);
    assert.equal(report.maps.villa.gates.partial_clean_replay_within_2sigma, true);
    assert.equal(report.maps.villa.gates.default_weight_update_allowed, false);
    assert.equal(report.maps.villa.recommended_change_class, "RESEARCH_ONLY");
    assert.ok(report.maps.villa.next_evidence_needed.includes("human_labeled_full_distribution_clean_replay_min_3"));
    assert.ok(report.maps.villa.next_evidence_needed.includes("family_runtime_gate_or_remove_family_prior_from_adoption"));
    assert.ok(report.global_blockers.includes("clean_replay_sample_size_below_default_update_gate"));
    assert.deepEqual(report.external_research_links, ["https://example.test/source"]);
});

test("buildProducerStrategyArchitectureReport separates replay candidate from replay-passed status", () => {
    const report = buildProducerStrategyArchitectureReport({
        countPriorReport: {
            maps: {
                sunken_ship: {
                    map_id: "sunken_ship",
                    alpha_counts_candidate: { w: 1, g: 2, b: 4, p: 4, o: 2, r: 2 },
                    clean_replay_sample_count: 1,
                    clean_replay_full_distribution_sample_count: 0,
                    clean_replay_two_sigma_fit: {
                        sunken_case: { all_within_2sigma: true, max_abs_z: 1.4 }
                    },
                    blockers: []
                }
            }
        },
        valueModelReport: {
            runtime_family_status: "phase1_disabled",
            maps: {
                sunken_ship: {
                    map_id: "sunken_ship",
                    runtime_family_status: "phase1_disabled",
                    all_target_fits_within_2sigma: true,
                    quality_fits: {},
                    red_type_value_envelope: {},
                    blockers: []
                }
            }
        },
        replayDiagnosticsReport: {
            decision: "candidate_loses_current_replay",
            maps: {
                sunken_ship: {
                    quality_summary: {
                        o: { classification: "degraded" },
                        r: { classification: "degraded" }
                    }
                }
            }
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.equal(report.maps.sunken_ship.gates.sim_replay_candidate, true);
    assert.equal(report.maps.sunken_ship.gates.candidate_replay_evaluated, true);
    assert.equal(report.maps.sunken_ship.gates.candidate_replay_passed, false);
    assert.ok(report.maps.sunken_ship.next_evidence_needed.includes("candidate_replay_must_not_regress_baseline"));
    assert.ok(report.global_blockers.includes("candidate_replay_regresses_baseline"));
    assert.equal(report.summary.maps_with_candidate_replay_passed, 0);
});

test("buildProducerStrategyArchitectureReport treats replay-guarded baseline fallback as not replay-passed", () => {
    const report = buildProducerStrategyArchitectureReport({
        countPriorReport: {
            maps: {
                villa: {
                    map_id: "villa",
                    alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                    clean_replay_sample_count: 1,
                    clean_replay_full_distribution_sample_count: 0,
                    clean_replay_two_sigma_fit: {
                        villa_case: { all_within_2sigma: true, max_abs_z: 1.1 }
                    },
                    blockers: []
                }
            }
        },
        valueModelReport: {
            runtime_family_status: "phase1_disabled",
            maps: {
                villa: {
                    map_id: "villa",
                    runtime_family_status: "phase1_disabled",
                    all_target_fits_within_2sigma: true,
                    quality_fits: {},
                    red_type_value_envelope: {},
                    blockers: []
                }
            }
        },
        replayDiagnosticsReport: {
            decision: "candidate_guarded_by_baseline",
            maps: {
                villa: {
                    candidate_config_status: {
                        status: "skipped",
                        reasons: ["candidate_replay_regressed_baseline"]
                    },
                    quality_summary: {
                        o: { classification: "neutral" }
                    }
                }
            }
        },
        generatedAt: "2026-04-24T00:00:00.000Z"
    });

    assert.equal(report.maps.villa.gates.candidate_replay_evaluated, true);
    assert.equal(report.maps.villa.gates.candidate_replay_passed, false);
    assert.ok(report.maps.villa.next_evidence_needed.includes("candidate_replay_must_not_regress_baseline"));
    assert.ok(report.global_blockers.includes("candidate_replay_regresses_baseline"));
});

test("buildProducerStrategyArchitectureReport does not count readiness-skipped candidates as replay-passed", () => {
    const report = buildProducerStrategyArchitectureReport({
        countPriorReport: {
            maps: {
                villa: {
                    map_id: "villa",
                    alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                    clean_replay_sample_count: 1,
                    clean_replay_full_distribution_sample_count: 0,
                    clean_replay_two_sigma_fit: {
                        villa_case: { all_within_2sigma: true, max_abs_z: 1.1 }
                    },
                    blockers: []
                }
            }
        },
        valueModelReport: {
            runtime_family_status: "phase1_disabled",
            maps: {
                villa: {
                    map_id: "villa",
                    runtime_family_status: "phase1_disabled",
                    all_target_fits_within_2sigma: true,
                    quality_fits: {},
                    red_type_value_envelope: {},
                    blockers: []
                }
            }
        },
        replayDiagnosticsReport: {
            decision: "candidate_requires_more_replay",
            maps: {
                villa: {
                    candidate_config_status: {
                        status: "skipped",
                        reasons: ["count_fit_readiness_failed"]
                    },
                    quality_summary: {
                        o: { classification: "neutral" }
                    }
                }
            }
        },
        countFitReadinessReport: {
            maps: {
                villa: {
                    map_id: "villa",
                    two_sigma_count_fit_allowed: false,
                    blocked_qualities: ["w", "g", "b", "p", "o", "r"],
                    fit_gap_by_quality: { o: 30 },
                    observed_state_fit_gap: 30,
                    risk_flags: ["quality_count_sample_count_below_minimum"]
                }
            }
        },
        generatedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(report.maps.villa.gates.candidate_replay_evaluated, false);
    assert.equal(report.maps.villa.gates.candidate_replay_passed, null);
    assert.equal(report.summary.maps_with_candidate_replay_passed, 0);
    assert.doesNotMatch(report.global_blockers.join(","), /candidate_replay_regresses_baseline/);
    assert.ok(report.global_blockers.includes("settlement_count_fit_readiness_below_two_sigma_gate"));
});

test("buildProducerStrategyArchitectureReport blocks default update when count-fit readiness gate fails", () => {
    const report = buildProducerStrategyArchitectureReport({
        countPriorReport: {
            maps: {
                villa: {
                    map_id: "villa",
                    alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                    count_prior_strength_candidate: 16,
                    clean_replay_sample_count: 3,
                    clean_replay_full_distribution_sample_count: 3,
                    clean_replay_two_sigma_fit: {
                        villa_a: { all_within_2sigma: true, max_abs_z: 1.1 },
                        villa_b: { all_within_2sigma: true, max_abs_z: 1.2 },
                        villa_c: { all_within_2sigma: true, max_abs_z: 1.3 }
                    },
                    blockers: []
                }
            }
        },
        valueModelReport: {
            runtime_family_status: "enabled",
            maps: {
                villa: {
                    map_id: "villa",
                    runtime_family_status: "enabled",
                    all_target_fits_within_2sigma: true,
                    quality_fits: {},
                    red_type_value_envelope: {},
                    blockers: []
                }
            }
        },
        countFitReadinessReport: {
            maps: {
                villa: {
                    map_id: "villa",
                    two_sigma_count_fit_allowed: false,
                    blocked_qualities: ["w", "g", "b", "p", "o", "r"],
                    fit_gap_by_quality: { w: 30, g: 30, b: 30, p: 30, o: 30, r: 30 },
                    observed_state_fit_gap: 30,
                    risk_flags: ["quality_count_sample_count_below_minimum"]
                }
            }
        },
        generatedAt: "2026-04-25T00:00:00.000Z"
    });

    assert.equal(report.maps.villa.gates.full_distribution_sample_gate, true);
    assert.equal(report.maps.villa.gates.count_fit_readiness_passed, false);
    assert.equal(report.maps.villa.default_config_update_allowed, false);
    assert.equal(report.summary.maps_with_count_fit_readiness_passed, 0);
    assert.ok(report.maps.villa.next_evidence_needed.includes("settlement_count_fit_readiness_must_pass"));
    assert.ok(report.global_blockers.includes("settlement_count_fit_readiness_below_two_sigma_gate"));
});
