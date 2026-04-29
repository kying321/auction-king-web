const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildCodexVisualCandidatePosteriorGapReport,
    collectReviewEntries,
    main,
    resolveArgs
} = require("../scripts/build_codex_visual_candidate_posterior_gap_report.js");

function buildReviewResultsFixture() {
    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: "2026-04-26T04:50:00.000+08:00",
        review_results: [
            {
                source_task_id: "manual_source",
                status: "approved_count_fit_sample",
                map_id: "sunken_ship",
                event_timestamp: "2026-04-25T18:00:00.000Z",
                observed_state: { r1_total_items: 20, r1_blue_count: 4 },
                actual_counts: { w: 4, g: 5, b: 4, p: 5, o: 1, r: 1, total_items: 20 },
                actual_counts_source: "manual_review",
                pixel_training_label_allowed: false
            }
        ],
        fresh_capture_templates: [
            {
                source_task_id: "capture_full_count_sunken_ship_case",
                source_task_type: "capture_clipboard_full_count_review",
                map_id: "sunken_ship",
                samples: [
                    {
                        status: "needs_human_confirmation",
                        event_timestamp: "2026-04-25T18:24:45.635Z",
                        observed_state: { r1_total_items: 20, r1_blue_count: 4 },
                        actual_counts: { w: 1, g: 5, b: 4, p: 7, o: 2, r: 1, total_items: 20 },
                        actual_counts_source: "codex_visual_review",
                        pixel_training_label_allowed: false,
                        metadata: {
                            codex_visual_review: {
                                confidence: "medium_low"
                            }
                        }
                    }
                ]
            }
        ]
    };
}

test("package exposes codex visual candidate posterior gap builder", () => {
    assert.equal(
        packageJson.scripts["build:codex-visual-candidate-posterior-gap"],
        "node scripts/build_codex_visual_candidate_posterior_gap_report.js"
    );
});

test("resolveArgs accepts review results, output path, and explicit generation time", () => {
    const result = resolveArgs([
        "review-results.json",
        "posterior-gap.json",
        "--generated-at",
        "2026-04-26T05:00:00.000+08:00"
    ]);

    assert.equal(result.reviewResultsPath, path.resolve("review-results.json"));
    assert.equal(result.outputPath, path.resolve("posterior-gap.json"));
    assert.equal(result.generatedAt, "2026-04-26T05:00:00.000+08:00");
});

test("default output path targets the sunken ship codex visual posterior gap artifact", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-26-sunken-ship-codex-visual-candidate-posterior-gap.json"), true);
});

test("collectReviewEntries flattens existing and fresh capture entries", () => {
    const entries = collectReviewEntries(buildReviewResultsFixture());

    assert.equal(entries.length, 2);
    assert.equal(entries[0].source_entry_kind, "existing_candidate_review");
    assert.equal(entries[1].source_entry_kind, "fresh_capture_sample");
    assert.equal(entries[1].source_task_id, "capture_full_count_sunken_ship_case");
});

test("buildCodexVisualCandidatePosteriorGapReport scores only blocked codex visual samples", () => {
    const report = buildCodexVisualCandidatePosteriorGapReport({
        reviewResults: buildReviewResultsFixture(),
        generatedAt: "2026-04-26T05:00:00.000+08:00",
        paths: { reviewResultsPath: "/tmp/review-results.json" }
    });

    assert.equal(report.schema_version, "ak_codex_visual_candidate_posterior_gap_v1");
    assert.equal(report.generated_at, "2026-04-26T05:00:00.000+08:00");
    assert.equal(report.summary.visual_candidate_entry_count, 1);
    assert.equal(report.summary.replay_sample_count, 1);
    assert.equal(report.summary.import_allowed_sample_count, 0);
    assert.equal(report.summary.blocked_sample_count, 1);
    assert.equal(report.summary.map_counts.sunken_ship, 1);
    assert.equal(report.replay_report.sample_count, 1);
    assert.equal(report.samples[0].source_kind, "codex_visual_review_blocked");
    assert.equal(report.samples[0].quality_gaps.p.actual_count, 7);
    assert.ok(report.samples[0].prior_sensitivity.scenario_count >= 10);
    assert.match(report.samples[0].prior_sensitivity.best_total_abs_error_scenario, /strength_/);
    assert.ok(
        report.samples[0].prior_sensitivity.scenarios.some((scenario) => (
            scenario.source_classification === "codex_visual_shadow_blend_not_adoptable"
        ))
    );
    assert.ok(
        report.samples[0].prior_sensitivity.best_scenario_by_source_classification.codex_visual_shadow_blend_not_adoptable
    );
    assert.match(report.samples[0].blockers.join(","), /codex_visual_review_is_shadow_only/);
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-codex-visual-gap-"));
    const reviewPath = path.join(tempDir, "review-results.json");
    const outputPath = path.join(tempDir, "posterior-gap.json");
    fs.writeFileSync(reviewPath, JSON.stringify(buildReviewResultsFixture(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([reviewPath, outputPath, "--generated-at=2026-04-26T05:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.research_status, "shadow_gap_only");
    assert.match(markdown, /Codex Visual Candidate Posterior Gap/);
    assert.match(markdown, /blend_visual_/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
