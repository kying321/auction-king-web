const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCatalogStructuralPriorReport
} = require("../src/core/catalog_structural_prior_runtime.js");
const {
    resolveArgs
} = require("../scripts/build_catalog_structural_prior_report.js");

function fixtureExtractionReport() {
    return {
        schema_version: "ak_catalog_item_extraction_report_v1",
        change_class: "RESEARCH_ONLY",
        items: [
            {
                id: "w-0001",
                quality: "w",
                name: "alpha",
                value: 100,
                cell_candidate: {
                    cells: 2,
                    shape_signature: "1x2:##",
                    precision_status: "grid_shape_candidate"
                },
                extraction_status: "cell_candidate_ready_for_review",
                training_label_allowed: false
            },
            {
                id: "w-0002",
                quality: "w",
                name: "beta",
                value: 300,
                cell_candidate: {
                    cells: 4,
                    shape_signature: "2x2:##/##",
                    precision_status: "grid_shape_candidate"
                },
                extraction_status: "cell_candidate_manual_review_required",
                training_label_allowed: false
            },
            {
                id: "w-0003",
                quality: "w",
                name: "missing",
                value: 400,
                cell_candidate: null,
                extraction_status: "missing_cell_candidate",
                training_label_allowed: false
            },
            {
                id: "r-0001",
                quality: "r",
                name: "tail",
                value: 500000,
                cell_candidate: {
                    cells: 10,
                    shape_signature: "2x5:#####/#####",
                    layout_imputed: true,
                    precision_status: "layout_imputed_grid_candidate"
                },
                extraction_status: "cell_candidate_layout_imputed_review_required",
                training_label_allowed: false
            }
        ]
    };
}

test("package exposes catalog structural prior report entry", () => {
    assert.match(
        packageJson.scripts["build:catalog-structural-prior"] || "",
        /node\s+scripts\/build_catalog_structural_prior_report\.js/
    );
});

test("catalog structural prior report keeps weighted candidates separate from authority labels", () => {
    const report = buildCatalogStructuralPriorReport(fixtureExtractionReport());

    assert.equal(report.schema_version, "ak_catalog_structural_prior_report_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.methodology.training_label_allowed, false);
    assert.equal(report.methodology.authority_merge_allowed, false);
    assert.deepEqual(report.summary, {
        total_items: 4,
        quality_count: 2,
        items_with_cell_candidate: 3,
        strict_ready_item_count: 1,
        weighted_candidate_item_count: 3,
        missing_cell_candidate_count: 1,
        authority_merge_allowed: false
    });
    assert.deepEqual(report.quality_priors.w.cells_per_item, {
        strict_ready_mean: 2,
        strict_ready_sd: 0,
        strict_ready_min: 2,
        strict_ready_max: 2,
        weighted_candidate_mean: 2.6667,
        weighted_candidate_sd: 0.9428,
        weighted_candidate_min: 2,
        weighted_candidate_max: 4,
        weighted_candidate_effective_n: 1.5
    });
    assert.deepEqual(report.quality_priors.w.shape_signatures.slice(0, 2).map((entry) => entry.shape_signature), [
        "1x2:##",
        "2x2:##/##"
    ]);
    assert.deepEqual(report.quality_priors.r.cells_per_item, {
        strict_ready_mean: null,
        strict_ready_sd: null,
        strict_ready_min: null,
        strict_ready_max: null,
        weighted_candidate_mean: 10,
        weighted_candidate_sd: 0,
        weighted_candidate_min: 10,
        weighted_candidate_max: 10,
        weighted_candidate_effective_n: 0.35
    });
});

test("catalog structural prior report writer emits JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-structural-prior-"));
    const outputPath = path.join(tempDir, "prior.json");
    try {
        const report = buildCatalogStructuralPriorReport(fixtureExtractionReport(), { outputPath });

        assert.equal(fs.existsSync(outputPath), true);
        assert.equal(fs.existsSync(report.markdown_path), true);
        assert.match(fs.readFileSync(report.markdown_path, "utf8"), /Catalog Structural Prior Report/);
        assert.match(fs.readFileSync(report.markdown_path, "utf8"), /authority merge allowed: `false`/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("catalog structural prior CLI resolves input and output paths", () => {
    const args = resolveArgs(["input.json", "output.json"]);

    assert.equal(args.inputPath, path.resolve("input.json"));
    assert.equal(args.outputPath, path.resolve("output.json"));
});
