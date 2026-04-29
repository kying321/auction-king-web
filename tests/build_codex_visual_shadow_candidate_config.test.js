const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const defaultConfig = require("../default_config_bundle.js");
const {
    DEFAULT_OUTPUT_PATH,
    SHADOW_BLEND_SOURCE,
    buildCodexVisualShadowCandidateConfig,
    main,
    resolveArgs,
    selectScenario
} = require("../scripts/build_codex_visual_shadow_candidate_config.js");

function buildGapFixture() {
    return {
        schema_version: "ak_codex_visual_candidate_posterior_gap_v1",
        generated_at: "2026-04-26T06:05:00.000+08:00",
        samples: [
            {
                id: "visual_sunken_case",
                map_id: "sunken_ship",
                import_allowed: false,
                blockers: [
                    "status_not_approved_for_import",
                    "actual_counts_source_not_manual_review",
                    "codex_visual_review_is_shadow_only"
                ],
                prior_sensitivity: {
                    scenarios: [
                        {
                            id: "visual_smoothed_alpha_strength_2",
                            source_classification: "codex_visual_shadow_fit_not_adoptable",
                            alpha_counts: { w: 0.1, g: 4, b: 3, p: 8, o: 1, r: 1 },
                            count_prior_strength: 2,
                            total_abs_error: 2
                        },
                        {
                            id: "blend_visual_25_alpha_strength_4",
                            source_classification: SHADOW_BLEND_SOURCE,
                            alpha_counts: { w: 0.7, g: 2.5, b: 3, p: 5.2, o: 2.3, r: 1.7 },
                            count_prior_strength: 4,
                            total_abs_error: 10,
                            high_rarity_abs_error: 7
                        },
                        {
                            id: "blend_visual_50_alpha_strength_4",
                            source_classification: SHADOW_BLEND_SOURCE,
                            alpha_counts: { w: 0.45, g: 3.4, b: 2.95, p: 6, o: 1.8, r: 1.3 },
                            count_prior_strength: 4,
                            total_abs_error: 5,
                            high_rarity_abs_error: 3
                        }
                    ]
                }
            },
            {
                id: "visual_villa_case",
                map_id: "villa",
                import_allowed: true,
                blockers: [],
                prior_sensitivity: {
                    scenarios: [
                        {
                            id: "blend_visual_50_alpha_strength_4",
                            source_classification: SHADOW_BLEND_SOURCE,
                            alpha_counts: { w: 3, g: 3, b: 4, p: 5, o: 1, r: 1 },
                            count_prior_strength: 4,
                            total_abs_error: 5
                        }
                    ]
                }
            }
        ]
    };
}

test("package exposes codex visual shadow candidate config builder", () => {
    assert.equal(
        packageJson.scripts["build:codex-visual-shadow-candidate-config"],
        "node scripts/build_codex_visual_shadow_candidate_config.js"
    );
});

test("resolveArgs accepts gap report, output path, generation time, and selection policy", () => {
    const result = resolveArgs([
        "gap.json",
        "shadow-config.json",
        "--generated-at=2026-04-26T06:10:00.000+08:00",
        "--selection-policy=best_blend"
    ]);

    assert.equal(result.gapReportPath, path.resolve("gap.json"));
    assert.equal(result.outputPath, path.resolve("shadow-config.json"));
    assert.equal(result.generatedAt, "2026-04-26T06:10:00.000+08:00");
    assert.equal(result.selectionPolicy, "best_blend");
});

test("default output path targets codex visual shadow candidate config artifact", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-26-sunken-ship-codex-visual-shadow-candidate-config.json"), true);
});

test("selectScenario chooses the best blend scenario and ignores full visual replacement", () => {
    const scenario = selectScenario(buildGapFixture().samples[0]);

    assert.equal(scenario.id, "blend_visual_50_alpha_strength_4");
    assert.equal(scenario.source_classification, SHADOW_BLEND_SOURCE);
});

test("buildCodexVisualShadowCandidateConfig applies only blocked visual shadow blend scenarios", () => {
    const candidate = buildCodexVisualShadowCandidateConfig({
        baselineConfig: defaultConfig,
        gapReport: buildGapFixture(),
        sourceGapReportPath: "/tmp/gap.json",
        generatedAt: "2026-04-26T06:10:00.000+08:00"
    });

    assert.equal(candidate.codex_visual_shadow_candidate.schema_version, "ak_codex_visual_shadow_candidate_config_v1");
    assert.equal(candidate.codex_visual_shadow_candidate.default_config_update_allowed, false);
    assert.deepEqual(candidate.codex_visual_shadow_candidate.applied_maps, ["sunken_ship"]);
    assert.deepEqual(candidate.codex_visual_shadow_candidate.skipped_maps, ["villa"]);
    assert.deepEqual(candidate.codex_visual_shadow_candidate.skipped_map_reasons.villa, [
        "sample_import_allowed_not_visual_shadow",
        "missing_codex_visual_shadow_blocker"
    ]);
    assert.deepEqual(candidate.maps.sunken_ship.alpha_counts, { w: 0.45, g: 3.4, b: 2.95, p: 6, o: 1.8, r: 1.3 });
    assert.equal(candidate.maps.sunken_ship.solver.count_prior_strength, 4);
    assert.deepEqual(candidate.maps.villa.alpha_counts, defaultConfig.maps.villa.alpha_counts);
    assert.match(candidate.codex_visual_shadow_candidate.adoption_blockers.join(","), /missing_human_confirmed_count_fit_sample/);
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-codex-visual-shadow-config-"));
    const gapPath = path.join(tempDir, "gap.json");
    const outputPath = path.join(tempDir, "shadow-config.json");
    fs.writeFileSync(gapPath, JSON.stringify(buildGapFixture(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([gapPath, outputPath, "--generated-at=2026-04-26T06:10:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const candidate = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(candidate.codex_visual_shadow_candidate.usage, "shadow_replay_only");
    assert.match(markdown, /Codex Visual Shadow Candidate Config/);
    assert.match(markdown, /blend_visual_50_alpha_strength_4/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
