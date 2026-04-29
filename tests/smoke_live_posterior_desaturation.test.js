const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    DEFAULT_SAMPLES,
    buildAssetFreshnessCheck,
    buildPageUrl,
    buildPosteriorCheck,
    evaluateDefaultConfigBundle,
    extractDefaultConfigBundlePath,
    parseArgs,
    runPosteriorDesaturation
} = require("../scripts/smoke_live_posterior_desaturation.js");

test("live posterior smoke is registered in package scripts and js checks", () => {
    const packageJson = require("../package.json");
    assert.equal(
        packageJson.scripts["smoke:live-posterior-desaturation"],
        "node scripts/smoke_live_posterior_desaturation.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/smoke_live_posterior_desaturation\.js/);
});

test("live posterior smoke samples stay desaturated against bundled defaults", () => {
    const report = runPosteriorDesaturation({
        config: defaultConfig,
        threshold: 0.99,
        origin: "local-test",
        bundleUrl: "https://ak.local/default_config_bundle.js?v=20260428173500"
    });
    assert.equal(report.ok, true, JSON.stringify(report.failures));
    assert.equal(report.samples.length, DEFAULT_SAMPLES.length);
    report.samples.forEach((sample) => {
        assert.equal(sample.ok, true, sample.label);
        assert.ok(sample.orange.top_prob < 0.99, sample.label);
        assert.ok(sample.red.top_prob < 0.99, sample.label);
    });
});

test("posterior smoke fails closed on single-count saturated posteriors", () => {
    const check = buildPosteriorCheck("red", [{ count: 1, prob: 1 }], 0.99);
    assert.equal(check.ok, false);
    assert.equal(check.top_count, 1);
    assert.equal(check.top_prob, 1);
    assert.equal(check.support_count, 1);
});

test("default config bundle evaluator accepts the generated browser bundle", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "core", "default_config_bundle.js"), "utf8");
    const evaluated = evaluateDefaultConfigBundle(source, "local-default-config-bundle.js");
    assert.equal(evaluated.app.config_source_version, defaultConfig.app.config_source_version);
    Object.entries(defaultConfig.maps.sunken_ship.alpha_counts).forEach(([quality, value]) => {
        assert.equal(evaluated.maps.sunken_ship.alpha_counts[quality], value);
    });
});

test("live posterior smoke argument parser keeps thresholds bounded", () => {
    assert.equal(parseArgs(["--threshold=0.95"]).threshold, 0.95);
    assert.throws(() => parseArgs(["--threshold=1"]), /between 0 and 1/);
    assert.throws(() => parseArgs(["--threshold=0"]), /between 0 and 1/);
});

test("live posterior smoke resolves the bundle from the actual page script reference", () => {
    const html = `
        <script type="module" src="src/core/estimator.js?v=20260428173000"></script>
        <script type="module" src="src/core/default_config_bundle.js?v=20260428173000"></script>
    `;
    assert.equal(extractDefaultConfigBundlePath(html), "src/core/default_config_bundle.js?v=20260428173000");
    const pageUrl = buildPageUrl(parseArgs(["--origin=https://ak.fuuu.fun", "--no-page-cache-bust"]));
    assert.equal(pageUrl, "https://ak.fuuu.fun/");
});

test("live posterior smoke flags stale html asset version keys", () => {
    const stale = buildAssetFreshnessCheck(
        "https://ak.fuuu.fun/default_config_bundle.js?v=20260427212800",
        "ak_workspace_v2_20260428_sunken_prior_desaturation"
    );
    assert.equal(stale.ok, false);
    assert.equal(stale.asset_date, "20260427");
    assert.equal(stale.config_date, "20260428");

    const fresh = buildAssetFreshnessCheck(
        "https://ak.fuuu.fun/default_config_bundle.js?v=20260428173000",
        "ak_workspace_v2_20260428_sunken_prior_desaturation"
    );
    assert.equal(fresh.ok, true);
});
