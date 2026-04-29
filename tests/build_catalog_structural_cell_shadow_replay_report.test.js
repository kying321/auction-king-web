const test = require("node:test");
const assert = require("node:assert/strict");
const packageJson = require("../package.json");
const {
    buildCatalogStructuralCellShadowReplayReport,
    buildCellScenarioDefinitions,
    buildScenarioConfig,
    resolveArgs
} = require("../scripts/build_catalog_structural_cell_shadow_replay_report.js");

function fixtureMapImpact() {
    const row = (quality, priorMean, priorSd, evidenceClass) => ({
        map_id: "sunken_ship",
        quality,
        structural_prior: {
            weighted_mean: priorMean,
            weighted_sd: priorSd
        },
        evidence_class: evidenceClass
    });
    return {
        map_id: "sunken_ship",
        quality_impacts: [
            row("w", 1.6, 0.9, "medium_shadow_prior"),
            row("g", 2.0, 1.0, "medium_shadow_prior"),
            row("b", 2.6, 1.2, "medium_shadow_prior"),
            row("p", 2.8, 1.3, "medium_shadow_prior"),
            row("o", 3.2, 1.5, "medium_shadow_prior"),
            row("r", 2.6, 1.6, "weak_shadow_prior")
        ]
    };
}

function fixtureConfig() {
    return {
        app: { default_map_id: "sunken_ship" },
        solver: {},
        model: {
            alpha_counts: { w: 1, g: 1, b: 1, p: 1, o: 1, r: 1 },
            cells_per_item: {},
            value_model: {}
        },
        maps: {
            sunken_ship: {
                alpha_counts: { w: 1, g: 1, b: 1, p: 1, o: 1, r: 1 },
                cells_per_item: {
                    w: { mean: 1.3, sd: 0.4, min: 1, max: null },
                    g: { mean: 1.6, sd: 0.5, min: 1, max: null },
                    b: { mean: 2.0, sd: 0.7, min: 1, max: null },
                    p: { mean: 2.5, sd: 0.8, min: 1, max: null },
                    o: { mean: 4.1, sd: 2.2, min: 1, max: null },
                    r: { mean: 3.7, sd: 1.2, min: 1, max: null }
                },
                value_model: {}
            }
        }
    };
}

test("package exposes catalog structural cell shadow replay entry", () => {
    assert.match(
        packageJson.scripts["build:catalog-structural-cell-shadow-replay"] || "",
        /node\s+scripts\/build_catalog_structural_cell_shadow_replay_report\.js/
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_catalog_structural_cell_shadow_replay_report\.js/);
});

test("cell shadow scenarios separate medium structural cells from weak red", () => {
    const scenarios = buildCellScenarioDefinitions(fixtureMapImpact());

    assert.deepEqual(scenarios.map((scenario) => scenario.id), [
        "current_default_cells",
        "structural_medium_cells",
        "structural_medium_plus_red_weak_cells"
    ]);
    assert.deepEqual(scenarios[1].included_qualities, ["w", "g", "b", "p", "o"]);
    assert.deepEqual(scenarios[2].included_qualities, ["w", "g", "b", "p", "o", "r"]);
});

test("cell shadow scenario config applies prior means without mutating baseline", () => {
    const baseConfig = fixtureConfig();
    const scenario = buildCellScenarioDefinitions(fixtureMapImpact())[1];
    const next = buildScenarioConfig(baseConfig, fixtureMapImpact(), scenario);

    assert.equal(baseConfig.maps.sunken_ship.cells_per_item.o.mean, 4.1);
    assert.equal(next.maps.sunken_ship.cells_per_item.o.mean, 3.2);
    assert.equal(next.maps.sunken_ship.cells_per_item.r.mean, 3.7);
});

test("catalog structural cell shadow replay report stays non-authority", () => {
    const intakeReport = {
        generated_at: "fixture",
        summary: { training_label_allowed_count: 0 },
        entries: []
    };
    const report = buildCatalogStructuralCellShadowReplayReport({
        intakeReport,
        impactReport: { map_impacts: [fixtureMapImpact()] },
        baseConfig: fixtureConfig()
    });

    assert.equal(report.schema_version, "ak_catalog_structural_cell_shadow_replay_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.authority_merge_allowed, false);
    assert.equal(report.summary.training_label_allowed_count, 0);
    assert.ok(report.guardrails.includes("capture_observations_are_not_training_labels"));
});

test("catalog structural cell shadow replay CLI resolves paths", () => {
    const args = resolveArgs(["intake.json", "impact.json", "output.json", "--generated-at=fixture"]);

    assert.match(args.intakePath, /intake\.json$/);
    assert.match(args.impactPath, /impact\.json$/);
    assert.match(args.outputPath, /output\.json$/);
    assert.equal(args.generatedAt, "fixture");
});
