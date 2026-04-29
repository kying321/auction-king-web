const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildProducerValueModelReport,
    buildRedTypeValueEnvelope,
    buildValueTwoSigmaFit
} = require("../src/core/producer_value_model.js");

test("buildValueTwoSigmaFit scores unit value against observed catalog two-sigma band", () => {
    const fit = buildValueTwoSigmaFit({
        expectedValue: 32685,
        observedMean: 46325.17,
        observedSd: 28856.2
    });

    assert.equal(fit.expected_value, 32685);
    assert.equal(fit.observed_mean, 46325.17);
    assert.equal(fit.z, -0.472695);
    assert.equal(fit.within_2sigma, true);
    assert.equal(fit.low_2sigma, 0);
    assert.equal(fit.high_2sigma, 104037.57);
});

test("buildRedTypeValueEnvelope builds weighted red type unit value intervals", () => {
    const envelope = buildRedTypeValueEnvelope({
        profiles: {
            small_red: {
                prior: 3,
                mean_cells_per_item: 2,
                base_item_mean: 100,
                base_item_sd: 10,
                per_cell_mean: 20,
                per_cell_sd: 5
            },
            big_red: {
                prior: 1,
                mean_cells_per_item: 4,
                base_item_mean: 300,
                base_item_sd: 30,
                per_cell_mean: 40,
                per_cell_sd: 8
            }
        }
    });

    assert.equal(envelope.mean_unit_value, 220);
    assert.equal(envelope.sd_unit_value, 140.005357);
    assert.equal(envelope.low_2sigma, 0);
    assert.equal(envelope.high_2sigma, 500.010714);
    assert.deepEqual(envelope.type_probabilities, {
        big_red: 0.25,
        small_red: 0.75
    });
});

test("buildProducerValueModelReport audits p/o/r value and disabled family runtime", () => {
    const report = buildProducerValueModelReport({
        generatedAt: "2026-04-24T12:00:00.000Z",
        baselineConfig: {
            maps: {
                villa: {
                    label: "别墅图",
                    cells_per_item: {
                        p: { mean: 3 },
                        o: { mean: 4 },
                        r: { mean: 5 }
                    },
                    value_model: {
                        p: { base_item_mean: 7000, base_item_sd: 1800, per_cell_mean: 1700, per_cell_sd: 500 },
                        o: { base_item_mean: 11000, base_item_sd: 2800, per_cell_mean: 2200, per_cell_sd: 800 },
                        r: { base_item_mean: 145000, base_item_sd: 48000, per_cell_mean: 18000, per_cell_sd: 6000 }
                    },
                    red_type_profiles: {
                        profiles: {
                            small_red: {
                                prior: 0.68,
                                mean_cells_per_item: 2.2,
                                base_item_mean: 115000,
                                base_item_sd: 30000,
                                per_cell_mean: 14500,
                                per_cell_sd: 4000
                            }
                        }
                    },
                    collection_families: {
                        furniture: {
                            prior: 2.25,
                            value_bias: 0.84,
                            red_type_bias: { small_red: 1.22 }
                        }
                    }
                }
            }
        },
        catalogCalibrationSnapshot: {
            quality_summaries: [
                { quality: "p", observed_average_value: 9492.84, observed_value_sd: 5493.59 },
                { quality: "o", observed_average_value: 46325.17, observed_value_sd: 28856.2 },
                { quality: "r", observed_average_value: 822956.57, observed_value_sd: 2508085.59 }
            ]
        }
    });

    assert.equal(report.schema_version, "ak_producer_value_model_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.adoption_allowed, false);
    assert.equal(report.runtime_family_status, "phase1_disabled");
    assert.equal(report.maps.villa.quality_fits.o.expected_value, 19800);
    assert.equal(report.maps.villa.quality_fits.o.within_2sigma, true);
    assert.equal(report.maps.villa.red_type_value_envelope.mean_unit_value, 146900);
    assert.deepEqual(report.maps.villa.family_prior_probabilities, { furniture: 1 });
    assert.ok(report.maps.villa.blockers.includes("collection_family_runtime_disabled"));
});
