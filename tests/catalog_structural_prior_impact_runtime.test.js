const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCatalogStructuralPriorImpactReport,
    writeCatalogStructuralPriorImpactReport
} = require("../src/core/catalog_structural_prior_impact_runtime.js");
const {
    resolveArgs
} = require("../scripts/build_catalog_structural_prior_impact_report.js");

function fixturePrior() {
    const quality = (q, mean, sd, strictReady, weightedN) => ({
        quality: q,
        item_count: 10,
        items_with_cell_candidate: 8,
        strict_ready_item_count: strictReady,
        weighted_candidate_item_count: 8,
        missing_cell_candidate_count: 2,
        cells_per_item: {
            strict_ready_mean: strictReady ? mean : null,
            weighted_candidate_mean: mean,
            weighted_candidate_sd: sd,
            weighted_candidate_min: 1,
            weighted_candidate_max: 10,
            weighted_candidate_effective_n: weightedN
        }
    });
    return {
        schema_version: "ak_catalog_structural_prior_report_v1",
        change_class: "RESEARCH_ONLY",
        quality_priors: {
            w: quality("w", 1.6, 0.9, 4, 30),
            g: quality("g", 2.0, 1.0, 4, 30),
            b: quality("b", 2.6, 1.2, 4, 30),
            p: quality("p", 2.8, 1.3, 4, 30),
            o: quality("o", 3.2, 1.5, 3, 30),
            r: quality("r", 2.6, 1.6, 0, 30)
        }
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

test("package exposes catalog structural prior impact report entry", () => {
    assert.match(
        packageJson.scripts["build:catalog-structural-prior-impact"] || "",
        /node\s+scripts\/build_catalog_structural_prior_impact_report\.js/
    );
    assert.match(packageJson.scripts["check:js"], /catalog_structural_prior_impact_runtime\.js/);
    assert.match(packageJson.scripts["check:js"], /scripts\/build_catalog_structural_prior_impact_report\.js/);
});

test("catalog structural prior impact keeps config deltas shadow-only", () => {
    const report = buildCatalogStructuralPriorImpactReport({
        structuralPrior: fixturePrior(),
        baseConfig: fixtureConfig(),
        mapIds: ["sunken_ship"]
    });
    const rows = report.map_impacts[0].quality_impacts;
    const red = rows.find((row) => row.quality === "r");
    const orange = rows.find((row) => row.quality === "o");

    assert.equal(report.schema_version, "ak_catalog_structural_prior_impact_report_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.authority_merge_allowed, false);
    assert.equal(report.summary.map_count, 1);
    assert.equal(red.delta_prior_minus_config, -1.1);
    assert.equal(red.evidence_class, "weak_shadow_prior");
    assert.ok(red.adoption_blockers.includes("no_strict_ready_shapes_for_quality"));
    assert.ok(red.adoption_blockers.includes("red_catalog_tail_requires_manual_review"));
    assert.equal(orange.delta_prior_minus_config, -0.9);
    assert.ok(orange.adoption_blockers.includes("large_config_delta_requires_shadow_replay"));
});

test("catalog structural prior impact writer emits markdown guardrails", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-prior-impact-"));
    const outputPath = path.join(tempDir, "impact.json");
    try {
        const report = buildCatalogStructuralPriorImpactReport({
            structuralPrior: fixturePrior(),
            baseConfig: fixtureConfig(),
            mapIds: ["sunken_ship"]
        });
        const markdownPath = writeCatalogStructuralPriorImpactReport(report, outputPath);

        assert.equal(fs.existsSync(outputPath), true);
        assert.equal(fs.existsSync(markdownPath), true);
        assert.match(fs.readFileSync(markdownPath, "utf8"), /Catalog Structural Prior Impact Report/);
        assert.match(fs.readFileSync(markdownPath, "utf8"), /do_not_update_default_config_from_structural_prior/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("catalog structural prior impact CLI resolves paths and map filters", () => {
    const args = resolveArgs(["input.json", "output.json", "--map=sunken_ship"]);

    assert.equal(args.inputPath, path.resolve("input.json"));
    assert.equal(args.outputPath, path.resolve("output.json"));
    assert.deepEqual(args.mapIds, ["sunken_ship"]);
});
