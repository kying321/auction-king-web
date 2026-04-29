const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const { buildCleanReplayManualReviewSamples } = require("../scripts/build_clean_replay_manual_review_samples.js");
const {
    buildCleanReplayManualReviewTemplate,
    formatManualReviewTemplateMarkdown,
    main,
    normalizeQueueItems,
    resolveArgs
} = require("../scripts/build_clean_replay_manual_review_template.js");

function buildQueueFixture() {
    return {
        schema_version: "ak_clean_replay_candidate_queue_v1",
        items: [
            {
                id: "review_villa_p0",
                priority: "P0",
                recommended_action: "pair_observed_state_and_actual_counts",
                basename: "villa.png",
                source_image_path: "/tmp/villa.png",
                confirmed_sample_id: "confirmed_villa",
                map_id: "villa",
                map_variant_id: "unknown_villa",
                pixel_overlay_path: "/tmp/villa-overlay.png",
                pixel_quality_draft: {
                    status: "review_only",
                    training_label_allowed: false,
                    counts: { w: 0, g: 1, b: 1, p: 0, o: 2, r: 0 },
                    total: 4,
                    min_confidence: 0.42,
                    low_confidence_block_count: 1,
                    crop_sensitivity: {
                        source: "quality_pixel_crop_sensitivity_v1",
                        status: "crop_sensitive_review_required",
                        stable: false,
                        action: "manual_review_required_crop_sensitive",
                        unique_signature_count: 3,
                        majority_fraction: 0.3333,
                        training_label_allowed: false
                    }
                },
                confirmed_settlement_summary: {
                    bid_price: 855555,
                    loot_value: 372838,
                    profit: -482717,
                    quick_recycle_total_items: 48
                },
                pixel_vs_settlement_total: {
                    status: "pixel_partial_under_settlement_total",
                    pixel_total: 4,
                    settlement_total: 48,
                    delta: -44,
                    training_label_allowed: false
                },
                manual_review_template: {
                    output_target: "clean_replay_sample_candidate",
                    required_fields: [
                        "observed_state",
                        "actual_counts.o",
                        "actual_counts.r",
                        "actual_counts_source"
                    ],
                    training_label_allowed: false
                }
            },
            {
                id: "review_candidate_p1",
                priority: "P1",
                recommended_action: "manual_confirm_settlement_then_pair_observed_state",
                basename: "candidate.png",
                source_image_path: "/tmp/candidate.png",
                map_id: "villa",
                manual_review_template: {
                    output_target: "review_or_discard_candidate",
                    training_label_allowed: false
                }
            }
        ]
    };
}

test("package exposes clean replay manual review template builder entry", () => {
    assert.match(
        packageJson.scripts["build:clean-replay-manual-review-template"] || "",
        /node\s+scripts\/build_clean_replay_manual_review_template\.js/
    );
});

test("resolveArgs accepts queue and output path", () => {
    const result = resolveArgs(["queue.json", "template.json"]);

    assert.equal(result.queuePath, path.resolve("queue.json"));
    assert.equal(result.outputPath, path.resolve("template.json"));
});

test("normalizeQueueItems accepts arrays and wrapped queue payloads", () => {
    const items = [{ id: "review_villa_p0" }];

    assert.deepEqual(normalizeQueueItems(items), items);
    assert.deepEqual(normalizeQueueItems({ items }), items);
    assert.deepEqual(normalizeQueueItems({}), []);
});

test("buildCleanReplayManualReviewTemplate emits only P0 fillable review result drafts", () => {
    const template = buildCleanReplayManualReviewTemplate({
        queue: buildQueueFixture(),
        generatedAt: "2026-04-24T12:00:00.000Z"
    });

    assert.equal(template.schema_version, "ak_clean_replay_manual_review_results_v1");
    assert.equal(template.summary.queue_item_count, 2);
    assert.equal(template.summary.review_result_template_count, 1);
    assert.equal(template.summary.skipped_non_p0_count, 1);
    assert.equal(template.summary.pixel_training_label_allowed_count, 0);
    assert.equal(template.review_results.length, 1);
    assert.deepEqual(template.skipped, [
        {
            source_queue_id: "review_candidate_p1",
            basename: "candidate.png",
            priority: "P1",
            reason: "not_p0_clean_replay_candidate"
        }
    ]);

    const draft = template.review_results[0];
    assert.equal(draft.source_queue_id, "review_villa_p0");
    assert.equal(draft.status, "needs_manual_input");
    assert.equal(draft.actual_counts_source, "manual_review");
    assert.deepEqual(draft.observed_state, {});
    assert.deepEqual(draft.actual_counts, {
        w: null,
        g: null,
        b: null,
        p: null,
        o: null,
        r: null,
        total_items: null
    });
    assert.equal(draft.pixel_quality_draft.status, "review_only");
    assert.equal(draft.pixel_quality_draft.training_label_allowed, false);
    assert.equal(draft.pixel_quality_draft.crop_sensitivity.action, "manual_review_required_crop_sensitive");
    assert.equal(draft.pixel_quality_draft.crop_sensitivity.training_label_allowed, false);
    assert.equal(draft.pixel_vs_settlement_total.training_label_allowed, false);
    assert.deepEqual(draft.confirmed_settlement_summary, {
        bid_price: 855555,
        loot_value: 372838,
        profit: -482717,
        quick_recycle_total_items: 48
    });
    assert.deepEqual(draft.required_fields, [
        "observed_state",
        "actual_counts.o",
        "actual_counts.r",
        "actual_counts_source"
    ]);
    assert.deepEqual(draft.guardrails, [
        "fill_observed_state_from_same_battle_only",
        "fill_actual_counts_by_human_review_only",
        "do_not_copy_pixel_quality_draft_into_actual_counts",
        "keep_actual_counts_source_manual_review"
    ]);
});

test("untouched manual review template remains non-trainable for the importer", () => {
    const template = buildCleanReplayManualReviewTemplate({
        queue: buildQueueFixture()
    });
    const imported = buildCleanReplayManualReviewSamples({
        queue: buildQueueFixture(),
        manualReviewResults: template
    });

    assert.equal(imported.summary.review_result_count, 1);
    assert.equal(imported.summary.exported_sample_count, 0);
    assert.equal(imported.summary.skipped_count, 1);
    assert.equal(imported.summary.reject_reason_counts.review_not_approved, 1);
    assert.equal(imported.summary.pixel_training_label_allowed_count, 0);
});

test("formatManualReviewTemplateMarkdown summarizes fill targets and guardrails", () => {
    const markdown = formatManualReviewTemplateMarkdown({
        summary: {
            queue_item_count: 2,
            review_result_template_count: 1,
            skipped_non_p0_count: 1,
            pixel_training_label_allowed_count: 0,
            map_counts: { villa: 1 }
        },
        review_results: [
            {
                source_queue_id: "review_villa_p0",
                basename: "villa.png",
                map_id: "villa",
                map_variant_id: "unknown_villa",
                source_image_path: "/tmp/villa.png",
                pixel_overlay_path: "/tmp/villa-overlay.png",
                confirmed_settlement_summary: {
                    quick_recycle_total_items: 48
                },
                pixel_quality_draft: {
                    counts: { o: 2, r: 0 },
                    total: 4,
                    low_confidence_block_count: 1,
                    crop_sensitivity: {
                        action: "manual_review_required_crop_sensitive",
                        unique_signature_count: 3,
                        majority_fraction: 0.3333,
                        training_label_allowed: false
                    }
                }
            }
        ]
    }, "template.json");

    assert.match(markdown, /manual review results template/);
    assert.match(markdown, /review result templates: `1`/);
    assert.match(markdown, /training-label from pixel: `0`/);
    assert.match(markdown, /review_villa_p0/);
    assert.match(markdown, /villa-overlay/);
    assert.match(markdown, /crop=manual_review_required_crop_sensitive/);
    assert.match(markdown, /do_not_copy_pixel_quality_draft_into_actual_counts/);
});

test("main writes a manual review template JSON and markdown summary", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-review-template-"));
    const queuePath = path.join(tempDir, "queue.json");
    const outputPath = path.join(tempDir, "manual_review_template.json");

    fs.writeFileSync(queuePath, JSON.stringify(buildQueueFixture(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([queuePath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const template = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(template.summary.review_result_template_count, 1);
    assert.equal(template.review_results[0].source_queue_id, "review_villa_p0");
    assert.match(markdown, /manual review results template/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
