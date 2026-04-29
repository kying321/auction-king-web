const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCleanReplayVisualReviewPack,
    formatVisualReviewPackHtml,
    main,
    normalizeReviewResults,
    resolveArgs
} = require("../scripts/build_clean_replay_visual_review_pack.js");

function buildTemplateFixture() {
    return {
        schema_version: "ak_clean_replay_manual_review_results_v1",
        summary: {
            review_result_template_count: 1,
            skipped_non_p0_count: 1,
            pixel_training_label_allowed_count: 0
        },
        review_results: [
            {
                source_queue_id: "review_villa_p0",
                status: "needs_manual_input",
                basename: "villa.png",
                source_image_path: "/tmp/villa.png",
                pixel_overlay_path: "/tmp/villa-overlay.png",
                map_id: "villa",
                map_variant_id: "unknown_villa",
                confirmed_settlement_summary: {
                    bid_price: 855555,
                    loot_value: 372838,
                    profit: -482717,
                    quick_recycle_total_items: 48
                },
                pixel_quality_draft: {
                    status: "review_only",
                    training_label_allowed: false,
                    counts: { w: 0, g: 1, b: 1, p: 0, o: 2, r: 6 },
                    total: 10,
                    min_confidence: 0.4375,
                    low_confidence_block_count: 4,
                    crop_sensitivity: {
                        source: "quality_pixel_crop_sensitivity_v1",
                        status: "crop_sensitive_review_required",
                        stable: false,
                        action: "manual_review_required_crop_sensitive",
                        variant_count: 9,
                        unique_signature_count: 3,
                        majority_fraction: 0.3333,
                        training_label_allowed: false
                    }
                },
                pixel_vs_settlement_total: {
                    status: "pixel_partial_under_settlement_total",
                    pixel_total: 10,
                    settlement_total: 48,
                    delta: -38,
                    training_label_allowed: false
                },
                actual_counts: {
                    w: null,
                    g: null,
                    b: null,
                    p: null,
                    o: null,
                    r: null,
                    total_items: null
                },
                actual_counts_source: "manual_review",
                guardrails: [
                    "fill_observed_state_from_same_battle_only",
                    "fill_actual_counts_by_human_review_only",
                    "do_not_copy_pixel_quality_draft_into_actual_counts",
                    "keep_actual_counts_source_manual_review"
                ]
            }
        ],
        skipped: [
            {
                source_queue_id: "review_p1",
                basename: "candidate.png",
                priority: "P1",
                reason: "not_p0_clean_replay_candidate"
            }
        ]
    };
}

test("package exposes clean replay visual review pack entry", () => {
    assert.match(
        packageJson.scripts["build:clean-replay-visual-review-pack"] || "",
        /node\s+scripts\/build_clean_replay_visual_review_pack\.js/
    );
});

test("resolveArgs accepts template and output HTML path", () => {
    const result = resolveArgs(["template.json", "review.html"]);

    assert.equal(result.templatePath, path.resolve("template.json"));
    assert.equal(result.outputPath, path.resolve("review.html"));
    assert.deepEqual(result.priorityFilter, []);
});

test("resolveArgs accepts priority filter for focused visual review packs", () => {
    const result = resolveArgs(["template.json", "review.html", "--priority=P0", "--priority", "P1"]);

    assert.equal(result.templatePath, path.resolve("template.json"));
    assert.equal(result.outputPath, path.resolve("review.html"));
    assert.deepEqual(result.priorityFilter, ["P0", "P1"]);
});

test("normalizeReviewResults accepts arrays and wrapped template payloads", () => {
    const reviewResults = [{ source_queue_id: "review_villa_p0" }];

    assert.deepEqual(normalizeReviewResults(reviewResults), reviewResults);
    assert.deepEqual(normalizeReviewResults({ review_results: reviewResults }), reviewResults);
    assert.deepEqual(normalizeReviewResults({ results: reviewResults }), reviewResults);
    assert.deepEqual(
        normalizeReviewResults({
            fresh_capture_templates: [
                {
                    source_task_id: "capture_full_count_sunken_ship",
                    source_task_type: "capture_clipboard_full_count_review",
                    map_id: "sunken_ship",
                    review_image_path: "/tmp/sunken-stitched.png",
                    capture_packages: [{ input_path: "/tmp/capture-a.json" }],
                    samples: [
                        {
                            status: "needs_manual_input",
                            event_timestamp: "2026-04-25T18:24:45.635Z",
                            observed_state: { r1_total_items: 58, r1_blue_count: 15 },
                            actual_counts: {
                                w: null,
                                g: null,
                                b: null,
                                p: null,
                                o: null,
                                r: null,
                                total_items: null
                            },
                            actual_counts_source: "manual_review"
                        }
                    ]
                }
            ]
        }),
        [
            {
                source_entry_kind: "fresh_capture_sample",
                source_task_id: "capture_full_count_sunken_ship",
                source_task_type: "capture_clipboard_full_count_review",
                map_id: "sunken_ship",
                review_image_path: "/tmp/sunken-stitched.png",
                capture_packages: [{ input_path: "/tmp/capture-a.json" }],
                status: "needs_manual_input",
                event_timestamp: "2026-04-25T18:24:45.635Z",
                observed_state: { r1_total_items: 58, r1_blue_count: 15 },
                actual_counts: {
                    w: null,
                    g: null,
                    b: null,
                    p: null,
                    o: null,
                    r: null,
                    total_items: null
                },
                actual_counts_source: "manual_review"
            }
        ]
    );
    assert.deepEqual(normalizeReviewResults({}), []);
});

test("buildCleanReplayVisualReviewPack summarizes fillable visual review cards without allowing pixel labels", () => {
    const pack = buildCleanReplayVisualReviewPack({
        template: buildTemplateFixture(),
        generatedAt: "2026-04-24T12:00:00.000Z"
    });

    assert.equal(pack.schema_version, "ak_clean_replay_visual_review_pack_v1");
    assert.equal(pack.summary.review_card_count, 1);
    assert.equal(pack.summary.pixel_training_label_allowed_count, 0);
    assert.equal(pack.summary.map_counts.villa, 1);
    assert.equal(pack.cards.length, 1);
    assert.equal(pack.cards[0].source_queue_id, "review_villa_p0");
    assert.equal(pack.cards[0].source_image_path, "/tmp/villa.png");
    assert.equal(pack.cards[0].pixel_overlay_path, "/tmp/villa-overlay.png");
    assert.deepEqual(pack.cards[0].pixel_quality_draft.counts, { w: 0, g: 1, b: 1, p: 0, o: 2, r: 6 });
    assert.equal(pack.cards[0].pixel_quality_draft.training_label_allowed, false);
    assert.equal(pack.cards[0].pixel_quality_draft.crop_sensitivity.action, "manual_review_required_crop_sensitive");
    assert.equal(pack.cards[0].pixel_quality_draft.crop_sensitivity.training_label_allowed, false);
    assert.equal(pack.cards[0].actual_counts_source, "manual_review");
    assert.deepEqual(pack.cards[0].actual_counts, {
        w: null,
        g: null,
        b: null,
        p: null,
        o: null,
        r: null,
        total_items: null
    });
});

test("buildCleanReplayVisualReviewPack renders capture full-count samples as manual review cards", () => {
    const pack = buildCleanReplayVisualReviewPack({
        template: {
            schema_version: "ak_count_fit_sample_review_template_v1",
            fresh_capture_templates: [
                {
                    source_task_id: "capture_full_count_sunken_ship",
                    source_task_type: "capture_clipboard_full_count_review",
                    map_id: "sunken_ship",
                    review_image_path: "/tmp/sunken-stitched.png",
                    review_image_quality_flags: ["severe_width_mismatch_review_image_may_be_partial"],
                    capture_packages: [
                        { input_path: "/tmp/capture-a.json", exported_at: "2026-04-25T18:24:45.635Z" },
                        { input_path: "/tmp/capture-b.json", exported_at: "2026-04-25T18:24:55.589Z" }
                    ],
                    samples: [
                        {
                            status: "needs_manual_input",
                            event_timestamp: "2026-04-25T18:24:45.635Z",
                            observed_state: { r1_total_items: 58, r1_blue_count: 15 },
                            actual_counts: {
                                w: null,
                                g: null,
                                b: null,
                                p: null,
                                o: null,
                                r: null,
                                total_items: null
                            },
                            actual_counts_source: "manual_review",
                            guardrails: ["same_battle_multiple_screenshots_should_share_one_sample"],
                            metadata: {
                                capture_review: {
                                    review_image_quality_flags: ["severe_width_mismatch_review_image_may_be_partial"]
                                }
                            }
                        }
                    ]
                }
            ]
        },
        generatedAt: "2026-04-26T04:30:00.000Z"
    });

    assert.equal(pack.summary.review_card_count, 1);
    assert.equal(pack.summary.map_counts.sunken_ship, 1);
    assert.equal(pack.summary.review_image_quality_flagged_count, 1);
    assert.equal(pack.cards[0].source_queue_id, "capture_full_count_sunken_ship");
    assert.equal(pack.cards[0].source_image_path, "/tmp/sunken-stitched.png");
    assert.deepEqual(pack.cards[0].review_image_quality_flags, ["severe_width_mismatch_review_image_may_be_partial"]);
    assert.equal(pack.cards[0].pixel_overlay_path, null);
    assert.equal(pack.cards[0].capture_packages.length, 2);
    assert.deepEqual(pack.cards[0].observed_state, { r1_total_items: 58, r1_blue_count: 15 });
    assert.equal(pack.cards[0].event_timestamp, "2026-04-25T18:24:45.635Z");

    const html = formatVisualReviewPackHtml(pack);
    assert.match(html, /capture_full_count_sunken_ship/);
    assert.match(html, /src="\/tmp\/sunken-stitched\.png"/);
    assert.match(html, /capture packages: 2/);
    assert.match(html, /review image quality warning/);
    assert.match(html, /severe_width_mismatch_review_image_may_be_partial/);
    assert.match(html, /r1_total_items/);
    assert.match(html, /same_battle_multiple_screenshots_should_share_one_sample/);
	});

test("buildCleanReplayVisualReviewPack can focus capture templates by review priority", () => {
    const template = {
        schema_version: "ak_count_fit_sample_review_template_v1",
        fresh_capture_templates: [
            {
                source_task_id: "capture_p0",
                source_task_type: "capture_clipboard_full_count_review",
                map_id: "sunken_ship",
                review_priority: "P0",
                review_reasons: ["red_residual_sensitive_to_missing_orange_count"],
                review_image_path: "/tmp/p0.png",
                samples: [
                    {
                        status: "needs_manual_input",
                        event_timestamp: "2026-04-26T12:39:48.135Z",
                        observed_state: { r1_total_items: 48 },
                        actual_counts: { w: null, g: null, b: null, p: null, o: null, r: null, total_items: null },
                        actual_counts_source: "manual_review"
                    }
                ]
            },
            {
                source_task_id: "capture_p2",
                source_task_type: "capture_clipboard_full_count_review",
                map_id: "sunken_ship",
                review_priority: "P2",
                review_reasons: [],
                review_image_path: "/tmp/p2.png",
                samples: [
                    {
                        status: "needs_manual_input",
                        event_timestamp: "2026-04-26T12:01:50.493Z",
                        observed_state: { r1_total_items: 49 },
                        actual_counts: { w: null, g: null, b: null, p: null, o: null, r: null, total_items: null },
                        actual_counts_source: "manual_review"
                    }
                ]
            }
        ]
    };

    const pack = buildCleanReplayVisualReviewPack({
        template,
        generatedAt: "2026-04-27T00:00:00.000Z",
        priorityFilter: ["P0"]
    });

    assert.equal(pack.summary.review_card_count, 1);
    assert.deepEqual(pack.summary.priority_counts, { P0: 1 });
    assert.deepEqual(pack.summary.priority_filter, ["P0"]);
    assert.equal(pack.cards[0].source_queue_id, "capture_p0");
    assert.equal(pack.cards[0].review_priority, "P0");
    assert.deepEqual(pack.cards[0].review_reasons, ["red_residual_sensitive_to_missing_orange_count"]);

    const html = formatVisualReviewPackHtml(pack);
    assert.match(html, /priority: P0/);
    assert.match(html, /red_residual_sensitive_to_missing_orange_count/);
    assert.doesNotMatch(html, /capture_p2/);
});

test("formatVisualReviewPackHtml renders original and overlay images plus guardrail text", () => {
    const html = formatVisualReviewPackHtml(buildCleanReplayVisualReviewPack({
        template: buildTemplateFixture(),
        generatedAt: "2026-04-24T12:00:00.000Z"
    }));

    assert.match(html, /clean replay visual review pack/);
    assert.match(html, /review_villa_p0/);
    assert.match(html, /src="\/tmp\/villa\.png"/);
    assert.match(html, /src="\/tmp\/villa-overlay\.png"/);
    assert.match(html, /pixel_review_only/);
    assert.match(html, /do_not_copy_pixel_quality_draft_into_actual_counts/);
    assert.match(html, /actual_counts_source: manual_review/);
    assert.match(html, /w:0, g:1, b:1, p:0, o:2, r:6/);
    assert.match(html, /crop_sensitivity/);
    assert.match(html, /manual_review_required_crop_sensitive/);
    assert.doesNotMatch(html, /<script/i);
});

test("formatVisualReviewPackHtml rewrites project-local image paths for local server review", () => {
    const localImagePath = path.join(process.cwd(), "tmp_capture_review", "sunken.png");
    const html = formatVisualReviewPackHtml(buildCleanReplayVisualReviewPack({
        template: {
            review_results: [
                {
                    source_queue_id: "local_image_review",
                    source_image_path: localImagePath,
                    map_id: "sunken_ship",
                    actual_counts_source: "manual_review"
                }
            ]
        }
    }));

    assert.match(html, /src="\/tmp_capture_review\/sunken\.png"/);
    assert.doesNotMatch(html, new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("main writes visual review HTML", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-visual-review-"));
    const templatePath = path.join(tempDir, "template.json");
    const outputPath = path.join(tempDir, "review.html");

    fs.writeFileSync(templatePath, JSON.stringify(buildTemplateFixture(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([templatePath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const html = fs.readFileSync(outputPath, "utf8");
    assert.match(html, /review_villa_p0/);
    assert.match(html, /\/tmp\/villa-overlay\.png/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
