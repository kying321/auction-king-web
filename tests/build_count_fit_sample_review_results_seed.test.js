const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCountFitSampleReviewResultsSeed,
    formatCountFitSampleReviewResultsSeedMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_count_fit_sample_review_results_seed.js");

function makeTemplate() {
    return {
        schema_version: "ak_count_fit_sample_review_template_v1",
        generated_at: "2026-04-25T09:10:00.000Z",
        summary: {
            existing_candidate_review_count: 1,
            fresh_capture_template_count: 1,
            pixel_training_label_allowed_count: 0
        },
        review_results: [
            {
                source_task_id: "complete_review_villa_pairable",
                status: "needs_manual_input",
                map_id: "villa",
                actual_counts_source: "manual_review",
                pixel_training_label_allowed: false
            }
        ],
        fresh_capture_templates: [
            {
                source_task_id: "fresh_same_battle_shipping",
                status: "needs_fresh_same_battle_samples",
                map_id: "shipping",
                sample_draft: {
                    map_id: "shipping",
                    actual_counts_source: "manual_review"
                },
                pixel_training_label_allowed: false
            }
        ]
    };
}

test("package exposes count-fit sample review results seed builder", () => {
    assert.equal(
        packageJson.scripts["build:count-fit-sample-review-results-seed"],
        "node scripts/build_count_fit_sample_review_results_seed.js"
    );
});

test("resolveArgs accepts template, output path, generated-at, and force flag", () => {
    const result = resolveArgs([
        "review-template.json",
        "review-results.json",
        "--generated-at",
        "2026-04-25T09:15:00.000Z",
        "--force"
    ]);

    assert.equal(result.templatePath, path.resolve("review-template.json"));
    assert.equal(result.outputPath, path.resolve("review-results.json"));
    assert.equal(result.generatedAt, "2026-04-25T09:15:00.000Z");
    assert.equal(result.force, true);
});

test("buildCountFitSampleReviewResultsSeed creates a user-editable source from a generated template", () => {
    const results = buildCountFitSampleReviewResultsSeed({
        template: makeTemplate(),
        generatedAt: "2026-04-25T09:15:00.000Z",
        paths: {
            templatePath: "/tmp/review-template.json"
        }
    });

    assert.equal(results.schema_version, "ak_count_fit_sample_review_results_v1");
    assert.equal(results.change_class, "RESEARCH_ONLY");
    assert.equal(results.generated_at, "2026-04-25T09:15:00.000Z");
    assert.equal(results.source_template_schema_version, "ak_count_fit_sample_review_template_v1");
    assert.equal(results.source_template_generated_at, "2026-04-25T09:10:00.000Z");
    assert.equal(results.inputs.count_fit_sample_review_template, "/tmp/review-template.json");
    assert.equal(results.summary.existing_candidate_review_count, 1);
    assert.equal(results.summary.fresh_capture_template_count, 1);
    assert.equal(results.summary.pixel_training_label_allowed_count, 0);
    assert.equal(results.review_results[0].status, "needs_manual_input");
    assert.equal(results.review_results[0].actual_counts_source, "manual_review");
    assert.equal(results.fresh_capture_templates[0].sample_draft.actual_counts_source, "manual_review");
});

test("main writes review results and refuses to overwrite without force", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-fit-review-results-seed-"));
    const templatePath = path.join(tempDir, "review-template.json");
    const outputPath = path.join(tempDir, "review-results.json");

    fs.writeFileSync(templatePath, JSON.stringify(makeTemplate(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([templatePath, outputPath, "--generated-at", "2026-04-25T09:15:00.000Z"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    assert.throws(
        () => main([templatePath, outputPath, "--generated-at", "2026-04-25T09:16:00.000Z"]),
        /review results already exists/
    );

    const results = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(results.schema_version, "ak_count_fit_sample_review_results_v1");
    assert.equal(results.generated_at, "2026-04-25T09:15:00.000Z");
    assert.match(markdown, /count-fit sample review results seed/);
    assert.match(formatCountFitSampleReviewResultsSeedMarkdown(results, outputPath), /user-editable/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
