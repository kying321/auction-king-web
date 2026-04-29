const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const defaultConfig = require("../src/core/default_config_bundle.js");
const {
    DEFAULT_OUTPUT_PATH,
    blendAlphaCounts,
    buildManualCountPriorShadowCandidateConfig,
    computeBlendWeight,
    main,
    normalizeEmpiricalAlphaCounts,
    resolveArgs
} = require("../scripts/build_manual_count_prior_shadow_candidate_config.js");

function buildReviewImportFixture(samples = []) {
    return {
        schema_version: "ak_count_fit_sample_review_import_v1",
        generated_at: "2026-04-26T08:20:00.000+08:00",
        summary: {
            accepted_sample_count: samples.length,
            blocked_entry_count: 0
        },
        samples
    };
}

function buildSunkenSampleFixture(id = "sunken_manual_case") {
    return {
        record_type: "battle_sample",
        id,
        map_id: "sunken_ship",
        observed_state: {
            r1_total_items: 58,
            r1_blue_count: 15
        },
        actual_counts: {
            w: 0,
            g: 13,
            b: 15,
            p: 24,
            o: 3,
            r: 3
        },
        source_kind: "count_fit_manual_review"
    };
}

test("package exposes manual count-prior shadow candidate builder", () => {
    assert.equal(
        packageJson.scripts["build:manual-count-prior-shadow-candidate"],
        "node scripts/build_manual_count_prior_shadow_candidate_config.js"
    );
});

test("resolveArgs accepts review import, output path, generated time, and blend controls", () => {
    const result = resolveArgs([
        "review-import.json",
        "candidate.json",
        "--generated-at=2026-04-26T08:30:00.000+08:00",
        "--prior-sample-equivalent",
        "5",
        "--max-blend-weight=0.5",
        "--min-recommended-map-sample-count",
        "4"
    ]);

    assert.equal(result.reviewImportPath, path.resolve("review-import.json"));
    assert.equal(result.outputPath, path.resolve("candidate.json"));
    assert.equal(result.generatedAt, "2026-04-26T08:30:00.000+08:00");
    assert.equal(result.priorSampleEquivalent, 5);
    assert.equal(result.maxBlendWeight, 0.5);
    assert.equal(result.minRecommendedMapSampleCount, 4);
});

test("default output path targets manual count prior shadow candidate artifact", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-26-manual-count-prior-shadow-candidate-config.json"), true);
});

test("empirical alpha normalization preserves baseline alpha total", () => {
    const empirical = normalizeEmpiricalAlphaCounts(
        { w: 0, g: 13, b: 15, p: 24, o: 3, r: 3 },
        14.24
    );
    const total = Object.values(empirical).reduce((sum, value) => sum + value, 0);

    assert.equal(Math.abs(total - 14.24) < 0.00001, true);
    assert.equal(empirical.p > empirical.b, true);
    assert.equal(empirical.o < empirical.g, true);
});

test("blendAlphaCounts keeps the baseline total and positive alpha support", () => {
    const blended = blendAlphaCounts(
        { w: 0.9, g: 1.6, b: 2.9, p: 3.84, o: 2.8, r: 2.2 },
        { w: 0, g: 3.19, b: 3.68, p: 5.89, o: 0.74, r: 0.74 },
        0.25
    );
    const total = Object.values(blended).reduce((sum, value) => sum + value, 0);

    assert.equal(Math.abs(total - 14.24) < 0.00001, true);
    assert.equal(blended.w > 0, true);
    assert.equal(blended.p > 3.84, true);
    assert.equal(blended.o < 2.8, true);
});

test("computeBlendWeight is capped and sample-count aware", () => {
    assert.equal(computeBlendWeight(1, 3, 0.75), 0.25);
    assert.equal(computeBlendWeight(30, 3, 0.75), 0.75);
});

test("buildManualCountPriorShadowCandidateConfig applies only accepted full-count manual samples", () => {
    const candidate = buildManualCountPriorShadowCandidateConfig({
        baselineConfig: defaultConfig,
        reviewImport: buildReviewImportFixture([
            buildSunkenSampleFixture(),
            {
                id: "partial_case",
                map_id: "villa",
                observed_state: { r1_total_items: 45 },
                actual_counts: { o: 2, r: 1 },
                source_kind: "count_fit_manual_review"
            }
        ]),
        sourceReviewImportPath: "/tmp/import.json",
        generatedAt: "2026-04-26T08:30:00.000+08:00"
    });
    const meta = candidate.manual_count_prior_shadow_candidate;

    assert.equal(meta.schema_version, "ak_manual_count_prior_shadow_candidate_config_v1");
    assert.equal(meta.default_config_update_allowed, false);
    assert.equal(meta.usage, "shadow_replay_only");
    assert.equal(meta.accepted_sample_count, 1);
    assert.deepEqual(meta.applied_maps, ["sunken_ship"]);
    assert.deepEqual(meta.low_sample_maps, ["sunken_ship"]);
    assert.match(meta.adoption_blockers.join(","), /map_sample_count_below_minimum/);
    assert.equal(meta.selected_maps.sunken_ship.blend_weight, 0.25);
    assert.deepEqual(meta.selected_maps.sunken_ship.aggregated_actual_counts, { w: 0, g: 13, b: 15, p: 24, o: 3, r: 3 });
    assert.equal(candidate.maps.sunken_ship.alpha_counts.p > defaultConfig.maps.sunken_ship.alpha_counts.p, true);
    assert.equal(candidate.maps.sunken_ship.alpha_counts.r > defaultConfig.maps.sunken_ship.alpha_counts.r, true);
    assert.equal(candidate.maps.sunken_ship.alpha_counts.w < defaultConfig.maps.sunken_ship.alpha_counts.w, true);
    assert.equal(candidate.maps.sunken_ship.solver.count_prior_strength, defaultConfig.maps.sunken_ship.solver.count_prior_strength);
    assert.deepEqual(candidate.maps.villa.alpha_counts, defaultConfig.maps.villa.alpha_counts);
});

test("buildManualCountPriorShadowCandidateConfig emits blocker when no accepted full-count samples exist", () => {
    const candidate = buildManualCountPriorShadowCandidateConfig({
        baselineConfig: defaultConfig,
        reviewImport: buildReviewImportFixture([]),
        generatedAt: "2026-04-26T08:30:00.000+08:00"
    });

    assert.deepEqual(candidate.manual_count_prior_shadow_candidate.applied_maps, []);
    assert.match(
        candidate.manual_count_prior_shadow_candidate.adoption_blockers.join(","),
        /missing_accepted_manual_count_fit_samples/
    );
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-count-prior-candidate-"));
    const importPath = path.join(tempDir, "review-import.json");
    const outputPath = path.join(tempDir, "candidate.json");
    fs.writeFileSync(importPath, JSON.stringify(buildReviewImportFixture([buildSunkenSampleFixture()]), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([importPath, outputPath, "--generated-at=2026-04-26T08:30:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const candidate = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(candidate.manual_count_prior_shadow_candidate.applied_maps[0], "sunken_ship");
    assert.match(markdown, /Manual Count Prior Shadow Candidate Config/);
    assert.match(markdown, /sunken_ship/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
