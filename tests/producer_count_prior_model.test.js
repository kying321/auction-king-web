const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildDirichletTwoSigmaIntervals,
    buildMultinomialTwoSigmaFit,
    buildProducerCountPriorModelReport,
    normalizeFractions
} = require("../producer_count_prior_model.js");

test("normalizeFractions converts arbitrary positive weights into quality fractions", () => {
    assert.deepEqual(normalizeFractions({ w: 2, g: 2, r: 6 }), {
        w: 0.2,
        g: 0.2,
        b: 0,
        p: 0,
        o: 0,
        r: 0.6
    });
});

test("buildDirichletTwoSigmaIntervals returns clipped two-sigma proportion bands", () => {
    const intervals = buildDirichletTwoSigmaIntervals({ w: 3, g: 1 });

    assert.equal(intervals.w.mean, 0.75);
    assert.equal(intervals.g.mean, 0.25);
    assert.equal(intervals.w.sd, 0.193649);
    assert.equal(intervals.w.low_2sigma, 0.362702);
    assert.equal(intervals.w.high_2sigma, 1);
    assert.equal(intervals.r.mean, 0);
});

test("buildMultinomialTwoSigmaFit scores observed counts against a candidate fraction model", () => {
    const fit = buildMultinomialTwoSigmaFit({
        total: 43,
        counts: { o: 2, r: 4 },
        fractions: { o: 0.12, r: 0.08 }
    });

    assert.equal(fit.o.expected, 5.16);
    assert.equal(fit.o.observed, 2);
    assert.equal(fit.o.within_2sigma, true);
    assert.equal(fit.r.expected, 3.44);
    assert.equal(fit.r.within_2sigma, true);
    assert.equal(fit.max_abs_z, 1.482931);
    assert.equal(fit.all_within_2sigma, true);
});

test("buildProducerCountPriorModelReport blends producer intent with discounted shadow evidence", () => {
    const report = buildProducerCountPriorModelReport({
        generatedAt: "2026-04-24T12:00:00.000Z",
        baselineConfig: {
            maps: {
                sunken_ship: {
                    alpha_counts: { w: 1, g: 2, b: 3, p: 4, o: 3, r: 2 },
                    solver: { count_prior_strength: 8 }
                },
                villa: {
                    alpha_counts: { w: 8, g: 7, b: 4, p: 3, o: 1, r: 0.5 },
                    solver: { count_prior_strength: 16 }
                }
            }
        },
        pixelShadowReport: {
            maps: {
                sunken_ship: {
                    pixel_input_count: 3,
                    pixel_total: 54,
                    pixel_counts: { w: 0, g: 2, b: 10, p: 5, o: 19, r: 18 },
                    empirical_fractions: { w: 0, g: 0.037037, b: 0.185185, p: 0.092593, o: 0.351852, r: 0.333333 },
                    crop_sensitive_input_count: 3,
                    low_confidence_input_count: 3,
                    adoption_allowed: false
                }
            }
        },
        replaySamples: [
            {
                id: "sunken_clean",
                map_id: "sunken_ship",
                field_values: { total_items: 43 },
                actual_counts: { o: 2, r: 4 }
            }
        ]
    });

    assert.equal(report.schema_version, "ak_producer_count_prior_model_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.adoption_allowed, false);
    assert.ok(report.external_research_notes.some((note) => note.includes("地图")));

    const sunken = report.maps.sunken_ship;
    assert.equal(sunken.adoption_allowed, false);
    assert.equal(sunken.source_weights.producer_archetype, 0.55);
    assert.equal(sunken.source_weights.pixel_shadow_direction, 0.02);
    assert.equal(sunken.source_weights.clean_replay_full_distribution, 0);
    assert.equal(sunken.alpha_counts_candidate_total, 15);
    assert.ok(sunken.blockers.includes("insufficient_clean_replay_sample_size"));
    assert.ok(sunken.blockers.includes("pixel_shadow_review_only"));
    assert.ok(sunken.clean_replay_two_sigma_fit.sunken_clean.all_within_2sigma);
    assert.equal(sunken.quality_intervals.r.mean, sunken.blended_fractions.r);
    assert.ok(sunken.alpha_counts_candidate.r > 0);

    const villa = report.maps.villa;
    assert.equal(villa.source_weights.pixel_shadow_direction, 0);
    assert.equal(villa.clean_replay_sample_count, 0);
    assert.ok(villa.blockers.includes("missing_clean_replay_samples"));
});
