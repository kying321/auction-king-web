const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildSystemHintCoverageReport,
    normalizeInputPayload
} = require("../system_hint_coverage_report.js");

test("normalizeInputPayload accepts wrapped replay packages and legacy arrays", () => {
    const samples = [{ id: "sample_a" }];

    assert.deepEqual(normalizeInputPayload({ samples }).samples, samples);
    assert.deepEqual(normalizeInputPayload(samples).samples, samples);
    assert.deepEqual(normalizeInputPayload({}).samples, []);
});

test("buildSystemHintCoverageReport flags map readiness from value-scored system hint samples", () => {
    const report = buildSystemHintCoverageReport({
        packages: [
            {
                source_path: "/tmp/villa-package.json",
                payload: {
                    schema_version: "ak_settlement_calibration_replay_package_v1",
                    export_context: {
                        map_id: "villa",
                        filter_value: "pending_export"
                    },
                    sample_quality_summary: {
                        sample_count: 3,
                        system_hint: {
                            sample_count: 3,
                            scored_sample_count: 2,
                            missing_system_hint_count: 0,
                            missing_actual_cells_count: 1
                        }
                    },
                    samples: [
                        {
                            id: "villa_hint_actual_cells",
                            map_id: "villa",
                            observed_state: {
                                system_avg_value_type_count: 2,
                                system_avg_value_per_cell: 8735.34
                            },
                            actual_cells: 8,
                            actual_value: 70000
                        },
                        {
                            id: "villa_hint_item_cells",
                            map_id: "villa",
                            field_values: {
                                system_avg_value_type_count: 2,
                                system_avg_value_per_cell: 9100
                            },
                            items: [
                                { cells: 3, value: 12000 },
                                { cells: 2, value: 9000 }
                            ]
                        },
                        {
                            id: "villa_hint_missing_cells",
                            map_id: "villa",
                            observed_state: {
                                system_avg_value_type_count: 1,
                                system_avg_value_per_cell: 7000
                            },
                            actual_value: 21000
                        }
                    ]
                }
            },
            {
                source_path: "/tmp/sunken.json",
                payload: [
                    {
                        id: "sunken_without_hint",
                        map_id: "sunken_ship",
                        actual_cells: 9,
                        actual_value: 45000
                    }
                ]
            }
        ],
        targetMaps: ["villa", "sunken_ship"],
        thresholds: {
            min_value_scored_samples_per_map: 2
        }
    });

    assert.equal(report.schema_version, "ak_system_hint_coverage_report_v1");
    assert.equal(report.summary.package_count, 2);
    assert.equal(report.summary.input_sample_count, 4);
    assert.equal(report.summary.system_hint_sample_count, 3);
    assert.equal(report.summary.cell_scored_sample_count, 2);
    assert.equal(report.summary.value_scored_sample_count, 2);
    assert.deepEqual(report.summary.maps_ready_for_system_hint_fit, ["villa"]);
    assert.deepEqual(report.summary.maps_needing_system_hint_samples, ["sunken_ship"]);

    assert.equal(report.maps.villa.can_fit_system_hint_anchor, true);
    assert.equal(report.maps.villa.fit_gap, 0);
    assert.equal(report.maps.villa.system_hint_sample_count, 3);
    assert.equal(report.maps.villa.cell_scored_sample_count, 2);
    assert.equal(report.maps.villa.value_scored_sample_count, 2);
    assert.equal(report.maps.villa.missing_actual_cells_count, 1);
    assert.equal(report.maps.villa.missing_actual_value_count, 0);
    assert.deepEqual(report.maps.villa.system_avg_value_type_count_distribution, { "1": 1, "2": 2 });
    assert.deepEqual(report.maps.villa.value_scored_sample_ids, [
        "villa_hint_actual_cells",
        "villa_hint_item_cells"
    ]);

    assert.equal(report.maps.sunken_ship.can_fit_system_hint_anchor, false);
    assert.equal(report.maps.sunken_ship.fit_gap, 2);
    assert.deepEqual(report.maps.sunken_ship.risk_flags, [
        "system_hint_sample_count_below_minimum",
        "value_scored_sample_count_below_minimum"
    ]);
});
