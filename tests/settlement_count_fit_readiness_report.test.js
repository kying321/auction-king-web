const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildSettlementCountFitReadinessReport,
    normalizeInputPayload
} = require("../settlement_count_fit_readiness_report.js");

test("normalizeInputPayload accepts wrapped replay packages and legacy arrays", () => {
    const samples = [{ id: "sample_a" }];

    assert.deepEqual(normalizeInputPayload({ samples }).samples, samples);
    assert.deepEqual(normalizeInputPayload(samples).samples, samples);
    assert.deepEqual(normalizeInputPayload({}).samples, []);
});

test("buildSettlementCountFitReadinessReport gates two-sigma count fitting by map and quality coverage", () => {
    const report = buildSettlementCountFitReadinessReport({
        packages: [
            {
                source_path: "/tmp/package-a.json",
                payload: {
                    samples: [
                        {
                            id: "villa_full_a",
                            map_id: "villa",
                            observed_state: { r1_total_items: 45 },
                            actual_counts: { w: 7, g: 9, b: 11, p: 6, o: 3, r: 0 }
                        },
                        {
                            id: "villa_full_b",
                            map_id: "villa",
                            field_values: { total_items: 44 },
                            actual_counts: { w: 8, g: 10, b: 10, p: 5, o: 4, r: 1 }
                        },
                        {
                            id: "sunken_partial",
                            map_id: "sunken_ship",
                            actual_counts: { o: 2, r: 4 }
                        }
                    ]
                }
            }
        ],
        targetMaps: ["villa", "sunken_ship"],
        thresholds: {
            min_count_scored_samples_per_map_quality: 2
        }
    });

    assert.equal(report.schema_version, "ak_settlement_count_fit_readiness_report_v1");
    assert.equal(report.summary.input_sample_count, 3);
    assert.deepEqual(report.summary.maps_ready_for_count_fit, ["villa"]);
    assert.deepEqual(report.summary.maps_needing_count_samples, ["sunken_ship"]);
    assert.equal(report.maps.villa.two_sigma_count_fit_allowed, true);
    assert.equal(report.maps.villa.recommended_change_class, "SIM_ONLY");
    assert.deepEqual(report.maps.villa.ready_qualities, ["w", "g", "b", "p", "o", "r"]);
    assert.deepEqual(report.maps.villa.fit_gap_by_quality, { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 });
    assert.deepEqual(report.maps.villa.actual_count_sample_ids_by_quality.o, ["villa_full_a", "villa_full_b"]);
    assert.deepEqual(report.maps.villa.count_fit_scored_sample_ids_by_quality.o, ["villa_full_a", "villa_full_b"]);

    assert.equal(report.maps.sunken_ship.two_sigma_count_fit_allowed, false);
    assert.equal(report.maps.sunken_ship.observed_state_sample_count, 0);
    assert.equal(report.maps.sunken_ship.full_actual_counts_sample_count, 0);
    assert.equal(report.maps.sunken_ship.actual_count_sample_count_by_quality.o, 1);
    assert.equal(report.maps.sunken_ship.count_fit_scored_sample_count_by_quality.o, 0);
    assert.equal(report.maps.sunken_ship.fit_gap_by_quality.w, 2);
    assert.equal(report.maps.sunken_ship.fit_gap_by_quality.o, 2);
    assert.deepEqual(report.maps.sunken_ship.blocked_qualities, ["w", "g", "b", "p", "o", "r"]);
    assert.ok(report.maps.sunken_ship.risk_flags.includes("observed_state_sample_count_below_minimum"));
    assert.ok(report.maps.sunken_ship.risk_flags.includes("quality_count_sample_count_below_minimum"));
});

test("buildSettlementCountFitReadinessReport requires observed state and actual counts on the same samples", () => {
    const report = buildSettlementCountFitReadinessReport({
        packages: [
            {
                samples: [
                    {
                        id: "villa_observed_only_a",
                        map_id: "villa",
                        observed_state: { r1_total_items: 45 }
                    },
                    {
                        id: "villa_observed_only_b",
                        map_id: "villa",
                        field_values: { total_items: 44 }
                    },
                    {
                        id: "villa_counts_only_a",
                        map_id: "villa",
                        actual_counts: { w: 7, g: 9, b: 11, p: 6, o: 3, r: 0 }
                    },
                    {
                        id: "villa_counts_only_b",
                        map_id: "villa",
                        actual_counts: { w: 8, g: 10, b: 10, p: 5, o: 4, r: 1 }
                    }
                ]
            }
        ],
        targetMaps: ["villa"],
        thresholds: {
            min_count_scored_samples_per_map_quality: 2
        }
    });

    assert.equal(report.maps.villa.observed_state_sample_count, 2);
    assert.equal(report.maps.villa.actual_count_sample_count_by_quality.o, 2);
    assert.equal(report.maps.villa.count_fit_scored_sample_count_by_quality.o, 0);
    assert.equal(report.maps.villa.fit_gap_by_quality.o, 2);
    assert.equal(report.maps.villa.two_sigma_count_fit_allowed, false);
    assert.ok(report.maps.villa.risk_flags.includes("count_fit_scored_sample_count_below_minimum"));
});
