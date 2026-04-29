const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_REVIEW_RESULTS_PATH,
    buildCountFitSampleReviewImport,
    formatCountFitSampleReviewImportMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_count_fit_sample_review_import.js");

function buildFilledTemplateFixture() {
    return {
        schema_version: "ak_count_fit_sample_review_template_v1",
        generated_at: "2026-04-25T08:30:00.000Z",
        review_results: [
            {
                source_task_id: "complete_review_villa_pairable",
                source_queue_id: "review_villa_pairable",
                source_task_type: "complete_existing_candidate",
                status: "approved_count_fit_sample",
                output_target: "count_fit_same_battle_sample",
                basename: "villa_pairable.png",
                confirmed_sample_id: "villa_settlement_a",
                map_id: "villa",
                event_timestamp: "2026-04-25T09:00:00.000Z",
                observed_state: { r1_total_items: 45, r1_blue_count: 11 },
                actual_counts: {
                    w: 18,
                    g: 9,
                    b: 11,
                    p: 4,
                    o: 3,
                    r: 0,
                    total_items: 45
                },
                actual_counts_source: "manual_review",
                reviewer_notes: "same battle screenshot reviewed",
                pixel_training_label_allowed: false
            }
        ],
        fresh_capture_templates: [
            {
                source_task_id: "fresh_same_battle_shipping",
                source_task_type: "capture_fresh_same_battle_samples",
                status: "needs_fresh_same_battle_samples",
                output_target: "count_fit_same_battle_sample",
                map_id: "shipping",
                pixel_training_label_allowed: false,
                samples: [
                    {
                        status: "approved_count_fit_sample",
                        event_timestamp: "2026-04-25T09:05:00.000Z",
                        observed_state: { r1_total_items: 30, r1_blue_count: 8 },
                        actual_counts: {
                            w: 10,
                            g: 7,
                            b: 8,
                            p: 3,
                            o: 2,
                            r: 0,
                            total_items: 30
                        },
                        actual_counts_source: "manual_review"
                    }
                ]
            }
        ]
    };
}

test("package exposes count-fit sample review import builder", () => {
    assert.equal(
        packageJson.scripts["build:count-fit-sample-review-import"],
        "node scripts/build_count_fit_sample_review_import.js"
    );
});

test("resolveArgs accepts template input, output path, generated-at, and fail-on-blockers flag", () => {
    const result = resolveArgs([
        "review-template.json",
        "review-import.json",
        "--generated-at",
        "2026-04-25T09:10:00.000Z",
        "--fail-on-blockers"
    ]);

    assert.equal(result.templatePath, path.resolve("review-template.json"));
    assert.equal(result.outputPath, path.resolve("review-import.json"));
    assert.equal(result.generatedAt, "2026-04-25T09:10:00.000Z");
    assert.equal(result.failOnBlockers, true);
});

test("resolveArgs defaults to the user-editable review results source", () => {
    const result = resolveArgs([]);

    assert.equal(result.templatePath, DEFAULT_REVIEW_RESULTS_PATH);
    assert.ok(result.templatePath.endsWith("2026-04-25-count-fit-sample-review-results.json"));
});

test("buildCountFitSampleReviewImport exports approved same-battle full-count samples", () => {
    const imported = buildCountFitSampleReviewImport({
        template: buildFilledTemplateFixture(),
        generatedAt: "2026-04-25T09:10:00.000Z",
        paths: { templatePath: "/tmp/review-template.json" }
    });

    assert.equal(imported.schema_version, "ak_count_fit_sample_review_import_v1");
    assert.equal(imported.change_class, "RESEARCH_ONLY");
    assert.equal(imported.export_kind, "count_fit_same_battle_samples");
    assert.equal(imported.inputs.count_fit_sample_review_template, "/tmp/review-template.json");
    assert.equal(imported.summary.review_entry_count, 2);
    assert.equal(imported.summary.accepted_sample_count, 2);
    assert.equal(imported.summary.blocked_entry_count, 0);
    assert.deepEqual(imported.summary.map_counts, { shipping: 1, villa: 1 });

    const villaSample = imported.samples.find((sample) => sample.map_id === "villa");
    assert.equal(villaSample.record_type, "battle_sample");
    assert.equal(villaSample.id, "count_fit_complete_review_villa_pairable_20260425T090000000Z");
    assert.deepEqual(villaSample.actual_counts, { w: 18, g: 9, b: 11, p: 4, o: 3, r: 0 });
    assert.deepEqual(villaSample.observed_state, { r1_total_items: 45, r1_blue_count: 11 });
    assert.equal(villaSample.source_kind, "count_fit_manual_review");
    assert.equal(villaSample.metadata.count_fit_review.event_timestamp, "2026-04-25T09:00:00.000Z");
    assert.equal(villaSample.metadata.count_fit_review.actual_counts_source, "manual_review");
});

test("buildCountFitSampleReviewImport blocks non-manual labels, missing timestamps, partial counts, and total mismatches", () => {
    const template = buildFilledTemplateFixture();
    template.review_results = [
        {
            source_task_id: "pixel_source",
            status: "approved_count_fit_sample",
            map_id: "villa",
            event_timestamp: "2026-04-25T09:00:00.000Z",
            observed_state: { r1_total_items: 45 },
            actual_counts: { w: 18, g: 9, b: 11, p: 4, o: 3, r: 0, total_items: 45 },
            actual_counts_source: "pixel_quality_draft",
            pixel_training_label_allowed: true
        },
        {
            source_task_id: "system_source",
            status: "approved_count_fit_sample",
            map_id: "villa",
            event_timestamp: "2026-04-25T09:01:00.000Z",
            observed_state: { r1_total_items: 45 },
            actual_counts: { w: 18, g: 9, b: 11, p: 4, o: 3, r: 0, total_items: 45 },
            actual_counts_source: "system_hint"
        },
        {
            source_task_id: "missing_timestamp",
            status: "approved_count_fit_sample",
            map_id: "villa",
            observed_state: { r1_total_items: 45 },
            actual_counts: { w: 18, g: 9, b: 11, p: 4, o: 3, r: 0, total_items: 45 },
            actual_counts_source: "manual_review"
        },
        {
            source_task_id: "partial_counts",
            status: "approved_count_fit_sample",
            map_id: "villa",
            event_timestamp: "2026-04-25T09:02:00.000Z",
            observed_state: { r1_total_items: 45 },
            actual_counts: { w: 18, g: 9, b: 11, p: 4, o: 3, total_items: 45 },
            actual_counts_source: "manual_review"
        },
        {
            source_task_id: "total_mismatch",
            status: "approved_count_fit_sample",
            map_id: "villa",
            event_timestamp: "2026-04-25T09:03:00.000Z",
            observed_state: { r1_total_items: 45 },
            actual_counts: { w: 18, g: 9, b: 11, p: 4, o: 3, r: 0, total_items: 46 },
            actual_counts_source: "manual_review"
        }
    ];
    template.fresh_capture_templates = [];

    const imported = buildCountFitSampleReviewImport({ template });

    assert.equal(imported.summary.accepted_sample_count, 0);
    assert.equal(imported.summary.blocked_entry_count, 5);
    assert.equal(imported.summary.blocker_reason_counts.actual_counts_source_not_manual_review, 2);
    assert.equal(imported.summary.blocker_reason_counts.actual_counts_source_pixel_or_system_hint, 2);
    assert.equal(imported.summary.blocker_reason_counts.pixel_training_label_enabled, 1);
    assert.equal(imported.summary.blocker_reason_counts.missing_event_timestamp, 1);
    assert.equal(imported.summary.blocker_reason_counts.missing_full_actual_counts, 1);
    assert.equal(imported.summary.blocker_reason_counts.actual_counts_total_mismatch, 1);
});

test("buildCountFitSampleReviewImport blocks flagged review images unless manually overridden", () => {
    const template = buildFilledTemplateFixture();
    template.review_results = [];
    template.fresh_capture_templates = [
        {
            source_task_id: "flagged_capture_default_blocked",
            source_task_type: "capture_clipboard_full_count_review",
            map_id: "sunken_ship",
            review_image_quality_flags: ["narrow_capture_fragment_needs_recapture_or_manual_single_review"],
            pixel_training_label_allowed: false,
            samples: [
                {
                    status: "approved_count_fit_sample",
                    event_timestamp: "2026-04-25T09:05:00.000Z",
                    observed_state: { r1_total_items: 30, r1_blue_count: 8 },
                    actual_counts: { w: 10, g: 7, b: 8, p: 3, o: 2, r: 0, total_items: 30 },
                    actual_counts_source: "manual_review",
                    metadata: {
                        capture_review: {
                            review_image_quality_flags: ["severe_width_mismatch_review_image_may_be_partial"]
                        }
                    }
                }
            ]
        },
        {
            source_task_id: "flagged_capture_override",
            source_task_type: "capture_clipboard_full_count_review",
            map_id: "sunken_ship",
            review_image_quality_flags: ["narrow_capture_fragment_needs_recapture_or_manual_single_review"],
            pixel_training_label_allowed: false,
            samples: [
                {
                    status: "approved_count_fit_sample",
                    event_timestamp: "2026-04-25T09:06:00.000Z",
                    observed_state: { r1_total_items: 30, r1_blue_count: 8 },
                    actual_counts: { w: 10, g: 7, b: 8, p: 3, o: 2, r: 0, total_items: 30 },
                    actual_counts_source: "manual_review",
                    review_image_quality_override: "manual_single_image_review_confirmed"
                }
            ]
        }
    ];

    const imported = buildCountFitSampleReviewImport({ template });

    assert.equal(imported.summary.review_entry_count, 2);
    assert.equal(imported.summary.accepted_sample_count, 1);
    assert.equal(imported.summary.blocked_entry_count, 1);
    assert.equal(imported.summary.review_image_quality_flagged_entry_count, 2);
    assert.equal(imported.summary.blocker_reason_counts.review_image_quality_flags_require_recapture_or_single_image_manual_review, 1);
    assert.equal(imported.summary.warning_reason_counts.review_image_quality_flags_manual_override, 1);
    assert.deepEqual(imported.entries[0].review_image_quality_flags, [
        "narrow_capture_fragment_needs_recapture_or_manual_single_review",
        "severe_width_mismatch_review_image_may_be_partial"
    ]);
    assert.equal(imported.samples[0].metadata.count_fit_review.review_image_quality_override, "manual_single_image_review_confirmed");
});

test("main writes count-fit review import JSON and markdown and can fail on blockers", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-fit-review-import-"));
    const templatePath = path.join(tempDir, "review-template.json");
    const outputPath = path.join(tempDir, "review-import.json");
    const fixture = buildFilledTemplateFixture();
    fixture.review_results.push({
        source_task_id: "still_needs_input",
        status: "needs_manual_input",
        map_id: "villa",
        actual_counts_source: "manual_review"
    });

    fs.writeFileSync(templatePath, JSON.stringify(fixture, null, 2));

    assert.throws(
        () => main([templatePath, outputPath, "--generated-at", "2026-04-25T09:10:00.000Z", "--fail-on-blockers"]),
        /count-fit review import blockers: 1/
    );

    const imported = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(imported.summary.accepted_sample_count, 2);
    assert.equal(imported.summary.blocked_entry_count, 1);
    assert.match(markdown, /count-fit sample review import/);
    assert.match(formatCountFitSampleReviewImportMarkdown(imported, outputPath), /accepted samples: `2`/);
});
