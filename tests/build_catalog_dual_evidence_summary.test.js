const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCatalogDualEvidenceSummary,
    resolveArgs
} = require("../scripts/build_catalog_dual_evidence_summary.js");

test("package exposes catalog dual evidence summary builder", () => {
    assert.equal(
        packageJson.scripts["build:catalog-dual-evidence-summary"],
        "node scripts/build_catalog_dual_evidence_summary.js"
    );
});

test("resolveArgs accepts explicit source and output paths", () => {
    const result = resolveArgs(["items.json", "structural.json", "summary.json", "--generated-at=2026-04-27T00:00:00.000Z"]);

    assert.equal(result.itemExtractionPath, path.resolve("items.json"));
    assert.equal(result.structuralPriorPath, path.resolve("structural.json"));
    assert.equal(result.outputPath, path.resolve("summary.json"));
    assert.equal(result.generatedAt, "2026-04-27T00:00:00.000Z");
});

test("buildCatalogDualEvidenceSummary combines name-value and pixel-grid evidence", () => {
    const report = buildCatalogDualEvidenceSummary({
        generatedAt: "2026-04-27T00:00:00.000Z",
        config: {
            maps: {
                sunken_ship: {
                    alpha_counts: { w: 1, g: 1, b: 1, p: 1, o: 1, r: 0.03 },
                    solver: { count_prior_strength: 12 },
                    cells_per_item: {
                        w: { mean: 1, sd: 1, min: 1, max: null },
                        g: { mean: 2, sd: 1, min: 1, max: null },
                        b: { mean: 3, sd: 1, min: 1, max: null },
                        p: { mean: 4, sd: 1, min: 1, max: null },
                        o: { mean: 5, sd: 1, min: 1, max: null },
                        r: { mean: 2, sd: 1, min: 1, max: null }
                    },
                    red_type_profiles: { profiles: {} }
                }
            },
            calibration: {
                maps: {
                    sunken_ship: {
                        value_model_calibration: {
                            value_model: {
                                r: { tail_model: { battle_probability: 0.05 } }
                            }
                        }
                    }
                }
            }
        },
        itemExtractionReport: {
            schema_version: "ak_catalog_item_extraction_report_v1",
            items: [
                {
                    id: "r-0001",
                    quality: "r",
                    name: "tail red",
                    value: 2500000,
                    cell_candidate: { cells: 4, layout_imputed: false },
                    extraction_status: "cell_candidate_ready_for_review"
                },
                {
                    id: "r-0002",
                    quality: "r",
                    name: "common red",
                    value: 120000,
                    cell_candidate: null,
                    extraction_status: "missing_cell_candidate"
                },
                {
                    id: "o-0001",
                    quality: "o",
                    name: "orange",
                    value: 100000,
                    cell_candidate: { cells: 6, layout_imputed: true },
                    extraction_status: "cell_candidate_layout_imputed_review_required"
                }
            ]
        },
        structuralPriorReport: {
            schema_version: "ak_catalog_structural_prior_report_v1",
            summary: { strict_ready_item_count: 1 },
            quality_priors: {
                r: {
                    items_with_cell_candidate: 1,
                    strict_ready_item_count: 1,
                    cells_per_item: {
                        weighted_candidate_effective_n: 1,
                        weighted_candidate_mean: 4,
                        weighted_candidate_sd: 0,
                        weighted_candidate_max: 4
                    }
                }
            }
        }
    });

    assert.equal(report.schema_version, "ak_catalog_dual_evidence_summary_v1");
    assert.equal(report.totals.item_count, 3);
    assert.equal(report.totals.dual_evidence_count, 2);
    assert.equal(report.quality_summaries.r.item_count, 2);
    assert.equal(report.quality_summaries.r.dual_evidence_count, 1);
    assert.equal(report.quality_summaries.r.value_tail_bands.find((entry) => entry.threshold === 2000000).item_count, 1);
    assert.equal(report.current_sunken_ship_prior.red_tail_battle_probability, 0.05);
    assert.equal(report.conclusion.rough_default_usable, true);
});
