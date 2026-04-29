const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    RED_TAIL_BATTLE_PROBABILITY,
    SUNKEN_SHIP_ALPHA_COUNTS,
    SUNKEN_SHIP_COUNT_PRIOR_STRENGTH,
    buildCatalogConservativeCandidateConfig,
    buildCatalogConservativePriorCandidateReport,
    buildMetricDelta,
    main,
    resolveArgs
} = require("../scripts/build_catalog_conservative_prior_candidate.js");

function fixtureConfig() {
    return {
        app: { default_map_id: "sunken_ship" },
        solver: {},
        model: {
            alpha_counts: { w: 1, g: 1, b: 1, p: 1, o: 1, r: 1 },
            cells_per_item: {},
            value_model: {},
            red_type_profiles: { profiles: {} }
        },
        maps: {
            sunken_ship: {
                alpha_counts: { w: 5.5, g: 7, b: 8, p: 3, o: 1, r: 0.6 },
                solver: { count_prior_strength: 1 },
                cells_per_item: {
                    w: { mean: 1.3, sd: 0.45, min: 1, max: null },
                    g: { mean: 1.65, sd: 0.55, min: 1, max: null },
                    b: { mean: 2, sd: 0.7, min: 1, max: null },
                    p: { mean: 2.55, sd: 0.78, min: 1, max: null },
                    o: { mean: 4.1, sd: 2.2, min: 1, max: null },
                    r: { mean: 3.7, sd: 1.2, min: 1, max: null }
                },
                value_model: {},
                red_type_profiles: { profiles: {} }
            }
        },
        calibration: {
            maps: {
                sunken_ship: {
                    value_model_calibration: {
                        value_model: {
                            r: {
                                base_item_mean: 128777,
                                tail_model: { battle_probability: 0.12 }
                            }
                        }
                    }
                }
            }
        }
    };
}

function fixtureStructuralPrior() {
    const row = (mean, sd, strict, candidates) => ({
        strict_ready_item_count: strict,
        items_with_cell_candidate: candidates,
        cells_per_item: {
            weighted_candidate_mean: mean,
            weighted_candidate_sd: sd,
            weighted_candidate_effective_n: 30
        }
    });
    return {
        summary: {
            total_items: 589,
            items_with_cell_candidate: 502,
            authority_merge_allowed: false
        },
        quality_priors: {
            w: row(1.6338, 1.1307, 4, 84),
            g: row(2.0379, 1.333, 3, 85),
            b: row(2.5705, 1.8377, 6, 84),
            p: row(2.7773, 1.8794, 6, 85),
            o: row(3.1784, 2.1645, 3, 86),
            r: row(2.5984, 1.9783, 0, 78)
        }
    };
}

test("package exposes catalog conservative prior candidate builder", () => {
    assert.equal(
        packageJson.scripts["build:catalog-conservative-prior-candidate"],
        "node scripts/build_catalog_conservative_prior_candidate.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_catalog_conservative_prior_candidate\.js/);
});

test("resolveArgs accepts structural prior, intake, output, and generated time", () => {
    const args = resolveArgs([
        "structural.json",
        "intake.json",
        "candidate.json",
        "--generated-at=fixture"
    ]);

    assert.match(args.structuralPriorPath, /structural\.json$/);
    assert.match(args.intakePath, /intake\.json$/);
    assert.match(args.outputPath, /candidate\.json$/);
    assert.equal(args.generatedAt, "fixture");
});

test("candidate config lowers red prior, hardens count prior, and keeps catalog tail conservative", () => {
    const candidate = buildCatalogConservativeCandidateConfig({
        baseConfig: fixtureConfig(),
        structuralPriorReport: fixtureStructuralPrior()
    });

    assert.equal(candidate.maps.sunken_ship.solver.count_prior_strength, SUNKEN_SHIP_COUNT_PRIOR_STRENGTH);
    assert.deepEqual(candidate.maps.sunken_ship.alpha_counts, SUNKEN_SHIP_ALPHA_COUNTS);
    assert.equal(candidate.maps.sunken_ship.cells_per_item.o.mean, 3.1784);
    assert.equal(candidate.maps.sunken_ship.cells_per_item.r.mean, 2.5984);
    assert.equal(candidate.maps.sunken_ship.cells_per_item.r.recommendation_basis.red_zero_strict_ready_blend, 1);
    assert.equal(candidate.maps.sunken_ship.red_type_profiles.profiles.small_red.per_cell_mean, 0);
    assert.equal(
        candidate.calibration.maps.sunken_ship.value_model_calibration.value_model.r.tail_model.battle_probability,
        RED_TAIL_BATTLE_PROBABILITY
    );
    assert.equal(candidate.catalog_conservative_prior_candidate.default_config_update_basis, "user_requested_rough_catalog_backed_conservative_override");
});

test("metric delta is candidate minus baseline", () => {
    assert.deepEqual(
        buildMetricDelta({ risk_score: 10, avg_red_count_mean: 4 }, { risk_score: 7.25, avg_red_count_mean: 1.5 }),
        {
            risk_score: -2.75,
            max_red_count_mean: null,
            avg_red_count_mean: -2.5,
            max_red_cell_mean: null,
            avg_mean_value_w: null,
            solve_failed_count: null
        }
    );
});

test("report and CLI write candidate evidence", () => {
    const intakeReport = {
        generated_at: "fixture",
        summary: { capture_package_count: 0, training_label_allowed_count: 0 },
        entries: []
    };
    const report = buildCatalogConservativePriorCandidateReport({
        baseConfig: fixtureConfig(),
        structuralPriorReport: fixtureStructuralPrior(),
        intakeReport,
        generatedAt: "fixture"
    });
    assert.equal(report.schema_version, "ak_catalog_conservative_prior_candidate_report_v1");
    assert.equal(report.methodology.authority_merge_allowed, false);
    assert.equal(report.implementation_recommendation.recommended, true);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-candidate-"));
    const structuralPath = path.join(tempDir, "structural.json");
    const intakePath = path.join(tempDir, "intake.json");
    const outputPath = path.join(tempDir, "candidate.json");
    fs.writeFileSync(structuralPath, JSON.stringify(fixtureStructuralPrior(), null, 2));
    fs.writeFileSync(intakePath, JSON.stringify(intakeReport, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };
    try {
        main([structuralPath, intakePath, outputPath, "--generated-at=fixture"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    assert.ok(fs.existsSync(outputPath));
    assert.ok(fs.existsSync(outputPath.replace(/\.json$/i, ".md")));
    assert.equal(printed.join(""), `${outputPath}\n${outputPath.replace(/\.json$/i, ".md")}\n`);
});
