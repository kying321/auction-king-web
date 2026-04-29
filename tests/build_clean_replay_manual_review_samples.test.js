const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCleanReplayManualReviewSamples,
    formatManualReviewSamplesMarkdown,
    main,
    normalizeManualReviewResults,
    resolveArgs
} = require("../scripts/build_clean_replay_manual_review_samples.js");

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
                map_variant_label: "未知别墅",
                pixel_overlay_path: "/tmp/villa-overlay.png",
                pixel_quality_draft: {
                    status: "review_only",
                    training_label_allowed: false,
                    counts: { w: 0, g: 1, b: 1, p: 0, o: 2, r: 0 },
                    total: 4
                },
                confirmed_settlement_summary: {
                    bid_price: 855555,
                    loot_value: 372838,
                    profit: -482717,
                    quick_recycle_total_items: 48
                },
                manual_review_template: {
                    output_target: "clean_replay_sample_candidate",
                    training_label_allowed: false
                }
            },
            {
                id: "review_villa_p1",
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

test("package exposes clean replay manual review sample importer entry", () => {
    assert.match(
        packageJson.scripts["build:clean-replay-manual-review-samples"] || "",
        /node\s+scripts\/build_clean_replay_manual_review_samples\.js/
    );
});

test("resolveArgs accepts queue, manual review results, and output path", () => {
    const result = resolveArgs(["queue.json", "manual.json", "samples.json"]);

    assert.equal(result.queuePath, path.resolve("queue.json"));
    assert.equal(result.manualReviewResultsPath, path.resolve("manual.json"));
    assert.equal(result.outputPath, path.resolve("samples.json"));
});

test("normalizeManualReviewResults accepts arrays and wrapped review result payloads", () => {
    const results = [{ source_queue_id: "review_villa_p0" }];

    assert.deepEqual(normalizeManualReviewResults(results), results);
    assert.deepEqual(normalizeManualReviewResults({ results }), results);
    assert.deepEqual(normalizeManualReviewResults({ review_results: results }), results);
    assert.deepEqual(normalizeManualReviewResults({ items: results }), results);
    assert.deepEqual(normalizeManualReviewResults({}), []);
});

test("buildCleanReplayManualReviewSamples exports only manually approved P0 clean replay samples", () => {
    const report = buildCleanReplayManualReviewSamples({
        queue: buildQueueFixture(),
        manualReviewResults: {
            review_results: [
                {
                    source_queue_id: "review_villa_p0",
                    status: "approved_clean_replay",
                    observed_state: {
                        r1_total_items: 48,
                        r1_blue_count: 11,
                        r2_orange_avg: 2.5
                    },
                    actual_counts: {
                        w: 20,
                        g: 12,
                        b: 11,
                        p: 3,
                        o: 2,
                        r: 0,
                        total_items: 48
                    },
                    actual_counts_source: "manual_review",
                    reviewer_notes: "人工逐格复核右侧品质格。"
                },
                {
                    source_queue_id: "review_villa_p1",
                    status: "approved_clean_replay",
                    observed_state: { r1_total_items: 40 },
                    actual_counts: { o: 1, r: 0 },
                    actual_counts_source: "manual_review"
                }
            ]
        },
        generatedAt: "2026-04-24T12:00:00.000Z"
    });

    assert.equal(report.schema_version, "ak_clean_replay_manual_review_samples_v1");
    assert.equal(report.summary.review_result_count, 2);
    assert.equal(report.summary.exported_sample_count, 1);
    assert.equal(report.summary.skipped_count, 1);
    assert.equal(report.summary.reject_reason_counts.not_clean_replay_queue_item, 1);
    assert.equal(report.summary.pixel_training_label_allowed_count, 0);
    assert.equal(report.samples.length, 1);
    assert.equal(report.samples[0].id, "confirmed_villa_manual_clean");
    assert.equal(report.samples[0].record_type, "settlement_sample");
    assert.equal(report.samples[0].source_kind, "manual_clean_replay_review");
    assert.equal(report.samples[0].source_image_path, "/tmp/villa.png");
    assert.equal(report.samples[0].map_id, "villa");
    assert.equal(report.samples[0].map_variant_id, "unknown_villa");
    assert.deepEqual(report.samples[0].observed_state, {
        r1_total_items: 48,
        r1_blue_count: 11,
        r2_orange_avg: 2.5
    });
    assert.deepEqual(report.samples[0].actual_counts, {
        w: 20,
        g: 12,
        b: 11,
        p: 3,
        o: 2,
        r: 0
    });
    assert.equal(report.samples[0].actual_value, 372838);
    assert.equal(report.samples[0].bid_price, 855555);
    assert.equal(report.samples[0].loot_value, 372838);
    assert.equal(report.samples[0].metadata.manual_review_status, "approved_clean_replay");
    assert.equal(report.samples[0].metadata.source_queue_id, "review_villa_p0");
    assert.equal(report.samples[0].metadata.actual_counts_source, "manual_review");
    assert.equal(report.samples[0].metadata.pixel_quality_draft_used_as_training_label, false);
    assert.equal(report.samples[0].metadata.actual_counts_total_items, 48);
    assert.equal(report.samples[0].metadata.actual_counts_quality_sum, 48);
    assert.equal(report.samples[0].metadata.actual_counts_total_check, "matches_total_items");
    assert.match(report.skipped[0].reason, /not_clean_replay_queue_item/);
});

test("buildCleanReplayManualReviewSamples rejects pixel-source counts and missing observed state", () => {
    const report = buildCleanReplayManualReviewSamples({
        queue: buildQueueFixture(),
        manualReviewResults: [
            {
                source_queue_id: "review_villa_p0",
                status: "approved_clean_replay",
                observed_state: { r1_total_items: 48 },
                actual_counts: { o: 2, r: 0 },
                actual_counts_source: "pixel_quality_draft"
            },
            {
                source_queue_id: "review_villa_p0",
                status: "approved_clean_replay",
                actual_counts: { o: 2, r: 0 },
                actual_counts_source: "manual_review"
            }
        ]
    });

    assert.equal(report.summary.exported_sample_count, 0);
    assert.equal(report.summary.skipped_count, 2);
    assert.equal(report.summary.reject_reason_counts.actual_counts_source_pixel_draft, 1);
    assert.equal(report.summary.reject_reason_counts.missing_observed_state, 1);
});

test("formatManualReviewSamplesMarkdown summarizes exported and skipped manual review results", () => {
    const markdown = formatManualReviewSamplesMarkdown({
        summary: {
            review_result_count: 2,
            exported_sample_count: 1,
            skipped_count: 1,
            reject_reason_counts: { not_clean_replay_queue_item: 1 },
            pixel_training_label_allowed_count: 0
        },
        samples: [
            {
                id: "confirmed_villa_manual_clean",
                map_id: "villa",
                map_variant_id: "unknown_villa",
                source_image_path: "/tmp/villa.png",
                actual_counts: { o: 2, r: 0 },
                metadata: {
                    actual_counts_source: "manual_review",
                    source_queue_id: "review_villa_p0"
                }
            }
        ],
        skipped: [
            {
                source_queue_id: "review_villa_p1",
                basename: "candidate.png",
                reason: "not_clean_replay_queue_item"
            }
        ]
    }, "samples.json");

    assert.match(markdown, /manual review clean replay samples/);
    assert.match(markdown, /exported samples: `1`/);
    assert.match(markdown, /skipped: `1`/);
    assert.match(markdown, /training-label from pixel: `0`/);
    assert.match(markdown, /not_clean_replay_queue_item/);
    assert.match(markdown, /confirmed_villa_manual_clean/);
    assert.match(markdown, /review_villa_p0/);
});

test("main writes manual review clean replay samples and markdown summary", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-review-samples-"));
    const queuePath = path.join(tempDir, "queue.json");
    const manualPath = path.join(tempDir, "manual_review_results.json");
    const outputPath = path.join(tempDir, "manual_review_samples.json");

    fs.writeFileSync(queuePath, JSON.stringify(buildQueueFixture(), null, 2));
    fs.writeFileSync(manualPath, JSON.stringify({
        review_results: [
            {
                source_queue_id: "review_villa_p0",
                status: "approved_clean_replay",
                observed_state: { r1_total_items: 48 },
                actual_counts: { o: 2, r: 0 },
                actual_counts_source: "manual_review"
            }
        ]
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([queuePath, manualPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.exported_sample_count, 1);
    assert.equal(report.samples[0].metadata.actual_counts_source, "manual_review");
    assert.match(markdown, /manual review clean replay samples/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
