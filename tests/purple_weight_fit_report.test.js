const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const defaultConfig = require("../default_config_bundle.js");
const {
    buildPurpleMultiplierCandidateConfig,
    buildPurpleWeightFitReport
} = require("../purple_weight_fit_report.js");

const SAMPLE_PATH = path.join(
    __dirname,
    "..",
    "docs",
    "research",
    "2026-04-24-image-overlay-count-replay-samples.json"
);

function loadSamples() {
    const payload = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8"));
    return Array.isArray(payload) ? payload : payload.samples || [];
}

function createPreImplementationBaselineConfig() {
    const config = JSON.parse(JSON.stringify(defaultConfig));
    config.maps.sunken_ship.alpha_counts.p = 3.84;
    config.maps.villa.alpha_counts.p = 4.2;
    config.maps.shipping.alpha_counts.p = 2.9;
    return config;
}

test("purple multiplier candidate only overrides purple alpha counts", () => {
    const candidate = buildPurpleMultiplierCandidateConfig({
        baselineConfig: defaultConfig,
        multiplier: 1.25
    });

    assert.deepEqual(Object.keys(candidate.alpha_counts), []);
    assert.deepEqual(Object.keys(candidate.maps.sunken_ship.alpha_counts), ["p"]);
    assert.equal(
        candidate.maps.sunken_ship.alpha_counts.p,
        Number((defaultConfig.maps.sunken_ship.alpha_counts.p * 1.25).toFixed(6))
    );
    assert.equal(
        candidate.maps.villa.alpha_counts.p,
        Number((defaultConfig.maps.villa.alpha_counts.p * 1.25).toFixed(6))
    );
    assert.equal(candidate.maps.sunken_ship.alpha_counts.r, undefined);
});

test("purple multiplier scan keeps statistical best as shadow when no safe red suppression exists", () => {
    const report = buildPurpleWeightFitReport({
        baselineConfig: createPreImplementationBaselineConfig(),
        samples: loadSamples(),
        generatedAt: "2026-04-25T03:30:00.000Z"
    });

    const nearDouble = report.candidates.find((candidate) => candidate.multiplier === 2);

    assert.equal(report.adoption_allowed, false);
    assert.equal(report.recommendation.safe_red_suppression_multiplier, null);
    assert.equal(report.recommendation.selected_shadow_multiplier, 2.5);
    assert.equal(report.recommendation.selected_default_multiplier, null);
    assert.equal(report.recommendation.default_weight_change_class, "RESEARCH_ONLY");
    assert.equal(report.recommendation.near_double_multiplier, 2);
    assert.equal(nearDouble.red_mean_delta, -0.3406);
    assert.match(report.recommendation.conclusion, /fails the only current red-label replay/i);
});
