const test = require("node:test");
const assert = require("node:assert/strict");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    buildDefaultWeightImplementationReport
} = require("../src/research/default_weight_implementation_report.js");

function createPurpleFitEvidence() {
    return {
        schema_version: "ak_purple_weight_fit_report_v1",
        generated_at: "2026-04-25T06:15:51.694Z",
        adoption_allowed: false,
        adoption_blockers: [
            "red_label_sample_count_below_default_update_gate",
            "fit_uses_partial_overlay_replay_samples"
        ],
        recommendation: {
            selected_default_multiplier: 1.25,
            default_weight_change_class: "SIM_ONLY"
        },
        candidates: [
            {
                multiplier: 1,
                candidate_alpha_counts_by_map: {
                    shipping: { p: 2.9 },
                    sunken_ship: { p: 3.84 },
                    villa: { p: 4.2 }
                }
            },
            {
                multiplier: 1.25,
                candidate_alpha_counts_by_map: {
                    shipping: { p: 3.625 },
                    sunken_ship: { p: 4.8 },
                    villa: { p: 5.25 }
                }
            }
        ]
    };
}

test("buildDefaultWeightImplementationReport keeps conservative defaults as mismatch against shadow fit", () => {
    const report = buildDefaultWeightImplementationReport({
        defaultConfig,
        purpleFitReport: createPurpleFitEvidence(),
        generatedAt: "2026-04-25T07:00:00.000Z"
    });

    assert.equal(report.schema_version, "ak_default_weight_implementation_report_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.implementation_status, "mismatch");
    assert.equal(report.selected_multiplier, 1.25);
    assert.equal(report.summary.map_count, 3);
    assert.equal(report.summary.applied_map_count, 0);
    assert.equal(report.summary.mismatched_map_count, 3);
    assert.deepEqual(report.update_scope, ["maps.*.alpha_counts.p"]);
    assert.equal(report.maps.sunken_ship.baseline_p, 3.84);
    assert.equal(report.maps.sunken_ship.expected_p, 4.8);
    assert.equal(report.maps.sunken_ship.current_p, defaultConfig.maps.sunken_ship.alpha_counts.p);
    assert.equal(report.maps.sunken_ship.applied_multiplier, 0.768229);
    assert.equal(report.maps.sunken_ship.matches_expected, false);
    assert.equal(report.authority_adoption_allowed, false);
    assert.deepEqual(report.authority_blockers, createPurpleFitEvidence().adoption_blockers);
});

test("buildDefaultWeightImplementationReport flags mismatched current defaults", () => {
    const config = JSON.parse(JSON.stringify(defaultConfig));
    config.maps.sunken_ship.alpha_counts.p = 9.6;

    const report = buildDefaultWeightImplementationReport({
        defaultConfig: config,
        purpleFitReport: createPurpleFitEvidence()
    });

    assert.equal(report.implementation_status, "mismatch");
    assert.equal(report.summary.applied_map_count, 0);
    assert.equal(report.summary.mismatched_map_count, 3);
    assert.equal(report.maps.sunken_ship.matches_expected, false);
});

test("buildDefaultWeightImplementationReport keeps null selected defaults as not applicable", () => {
    const purpleFitReport = createPurpleFitEvidence();
    purpleFitReport.recommendation.selected_default_multiplier = null;

    const report = buildDefaultWeightImplementationReport({
        defaultConfig,
        purpleFitReport,
        generatedAt: "2026-04-25T07:00:00.000Z"
    });

    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.implementation_status, "not_applicable");
    assert.equal(report.selected_multiplier, null);
    assert.equal(report.summary.map_count, 0);
    assert.equal(report.summary.applied_map_count, 0);
    assert.equal(report.summary.mismatched_map_count, 0);
    assert.deepEqual(report.maps, {});
});
