const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildCodexVisualManualConfirmationResults,
    buildRedResidualReviewIndex,
    formatCodexVisualManualConfirmationResultsHtml,
    formatCodexVisualManualConfirmationResultsMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_codex_visual_manual_confirmation_results.js");
const {
    buildCountFitSampleReviewImport
} = require("../scripts/build_count_fit_sample_review_import.js");

function buildVisualResultsFixture() {
    const rootDir = path.resolve(__dirname, "..");
    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: "2026-04-26T04:50:00.000+08:00",
        fresh_capture_templates: [
            {
                source_task_id: "capture_full_count_sunken_ship_case",
                status: "needs_manual_full_count_review",
                output_target: "count_fit_same_battle_sample",
                map_id: "sunken_ship",
                review_image_path: path.join(rootDir, "tmp_capture_review", "stitched.png"),
                pixel_training_label_allowed: false,
                guardrails: ["fill_actual_counts_by_human_review_only"],
                samples: [
                    {
                        source_task_id: "capture_full_count_sunken_ship_case",
                        status: "needs_human_confirmation",
                        map_id: "sunken_ship",
                        event_timestamp: "2026-04-25T18:24:45.635Z",
                        observed_state: { r1_total_items: 20, r1_blue_count: 4 },
                        actual_counts: { w: 1, g: 5, b: 4, p: 7, o: 2, r: 1, total_items: 20 },
                        actual_counts_source: "codex_visual_review",
                        pixel_training_label_allowed: false,
                        metadata: {
                            codex_visual_review: { confidence: "medium_low" }
                        }
                    }
                ]
            },
            {
                source_task_id: "manual_only_case",
                status: "needs_manual_full_count_review",
                output_target: "count_fit_same_battle_sample",
                map_id: "villa",
                samples: [
                    {
                        status: "needs_human_confirmation",
                        map_id: "villa",
                        actual_counts_source: "manual_review",
                        actual_counts: { w: 1, g: 1, b: 1, p: 1, o: 1, r: 0, total_items: 5 }
                    }
                ]
            }
        ]
    };
}

function buildRedResidualReviewPackFixture() {
    return {
        schema_version: "ak_red_residual_review_pack_v1",
        source_paths: {
            red_residual_clarification_queue: "/tmp/red-queue.json"
        },
        summary: {
            review_item_count: 1,
            authority_merge_allowed: false
        },
        items: [
            {
                queue_id: "red_residual_case",
                group_id: "red_residual_group_case",
                priority: "P0",
                priority_score: 359.0311,
                source_task_id: "capture_p0",
                event_timestamp: "2026-04-26T12:39:48.135Z",
                review_image_path: "/tmp/p0.png",
                current_model: {
                    red_count_mean: 3.7133,
                    red_cell_mean: 9.6705,
                    orange_count_mean: 8.2867,
                    purple_count_mean: 9
                },
                constraint_diagnostics: {
                    total_items: 48,
                    blue_count: 17,
                    purple_count: 9,
                    inferred_white_green_count: 10,
                    orange_red_unknown_pool: 12
                },
                field_plan: {
                    first_decisive_field: "orange_count",
                    decisive_fields: ["orange_count", "red_count", "total_storage_cells"],
                    one_field_fallback: "orange_count"
                },
                model_error_hypothesis: "missing_orange_or_total_count_can_push_residual_into_red",
                recommended_next_action: "先补金色数量；若仍异常，再补红色数量或完整六品质数量。"
            }
        ]
    };
}

test("package exposes codex visual manual confirmation results builder", () => {
    assert.equal(
        packageJson.scripts["build:codex-visual-manual-confirmation-results"],
        "node scripts/build_codex_visual_manual_confirmation_results.js"
    );
    assert.equal(
        packageJson.scripts["build:capture-manual-confirmation-results"],
        "node scripts/build_codex_visual_manual_confirmation_results.js"
    );
    assert.match(
        packageJson.scripts["build:p0-manual-count-confirmation-results"] || "",
        /scripts\/build_codex_visual_manual_confirmation_results\.js .*2026-04-27-sunken-ship-latest-capture-review-queue-template\.json .*--priority=P0 .*--red-residual-review-pack .*2026-04-27-red-residual-review-pack\.json .*--force/
    );
    assert.match(
        packageJson.scripts["build:p1-manual-count-confirmation-results"] || "",
        /scripts\/build_codex_visual_manual_confirmation_results\.js .*2026-04-27-sunken-ship-latest-capture-review-queue-template\.json .*--priority=P1 .*--red-residual-review-pack .*2026-04-27-red-residual-review-pack\.json .*--force/
    );
    assert.match(
        packageJson.scripts["build:p2-manual-count-confirmation-results"] || "",
        /scripts\/build_codex_visual_manual_confirmation_results\.js .*2026-04-28-sunken-ship-latest-capture-review-queue-template\.json .*--priority=P2 .*--force/
    );
});

test("resolveArgs accepts visual results, output path, generated-at, and force flag", () => {
    const result = resolveArgs([
        "visual-results.json",
        "manual-confirmation.json",
        "--generated-at=2026-04-26T07:00:00.000+08:00",
        "--red-residual-review-pack",
        "red-pack.json",
        "--force"
    ]);

    assert.equal(result.visualResultsPath, path.resolve("visual-results.json"));
    assert.equal(result.outputPath, path.resolve("manual-confirmation.json"));
    assert.equal(result.generatedAt, "2026-04-26T07:00:00.000+08:00");
    assert.equal(result.redResidualReviewPackPath, path.resolve("red-pack.json"));
    assert.equal(result.force, true);
});

test("resolveArgs accepts focused priority filters", () => {
    const result = resolveArgs([
        "visual-results.json",
        "manual-confirmation.json",
        "--priority=P0,P1",
        "--priority",
        "p2"
    ]);

    assert.deepEqual(result.priorityFilter, ["P0", "P1", "P2"]);
});

test("default output path targets sunken ship manual confirmation results artifact", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-26-sunken-ship-codex-visual-manual-confirmation-results.json"), true);
});

test("buildCodexVisualManualConfirmationResults creates importer-compatible draft blocked only by status", () => {
    const results = buildCodexVisualManualConfirmationResults({
        visualResults: buildVisualResultsFixture(),
        generatedAt: "2026-04-26T07:00:00.000+08:00",
        paths: { visualResultsPath: "/tmp/visual-results.json" }
    });

    assert.equal(results.schema_version, "ak_count_fit_sample_review_results_v1");
    assert.equal(results.summary.manual_confirmation_draft_count, 1);
    assert.deepEqual(results.summary.map_counts, { sunken_ship: 1 });
    assert.equal(results.fresh_capture_templates.length, 1);

    const sample = results.fresh_capture_templates[0].samples[0];
    assert.equal(sample.status, "needs_human_confirmation");
    assert.equal(sample.actual_counts_source, "manual_review");
    assert.deepEqual(sample.actual_counts, { w: 1, g: 5, b: 4, p: 7, o: 2, r: 1, total_items: 20 });
    assert.equal(sample.metadata.codex_visual_manual_confirmation.prefilled_from_actual_counts_source, "codex_visual_review");
    assert.equal(sample.metadata.codex_visual_manual_confirmation.approval_required, true);

    const imported = buildCountFitSampleReviewImport({
        template: results,
        generatedAt: "2026-04-26T07:01:00.000+08:00"
    });
    assert.equal(imported.summary.accepted_sample_count, 0);
    assert.deepEqual(imported.summary.blocker_reason_counts, { status_not_approved_for_import: 1 });
});

test("approved manual confirmation draft becomes accepted by importer", () => {
    const results = buildCodexVisualManualConfirmationResults({
        visualResults: buildVisualResultsFixture(),
        generatedAt: "2026-04-26T07:00:00.000+08:00"
    });
    results.fresh_capture_templates[0].samples[0].status = "approved_count_fit_sample";
    const imported = buildCountFitSampleReviewImport({
        template: results,
        generatedAt: "2026-04-26T07:01:00.000+08:00"
    });

    assert.equal(imported.summary.accepted_sample_count, 1);
    assert.equal(imported.samples[0].map_id, "sunken_ship");
    assert.deepEqual(imported.samples[0].actual_counts, { w: 1, g: 5, b: 4, p: 7, o: 2, r: 1 });
});

test("capture full-count review templates become editable manual entry drafts", () => {
    const results = buildCodexVisualManualConfirmationResults({
        visualResults: {
            schema_version: "ak_count_fit_sample_review_template_v1",
            generated_at: "2026-04-26T10:35:00.000+08:00",
            fresh_capture_templates: [
                {
                    source_task_id: "capture_full_count_sunken_ship_case",
                    source_task_type: "capture_clipboard_full_count_review",
                    status: "needs_manual_full_count_review",
                    output_target: "count_fit_same_battle_sample",
                    map_id: "sunken_ship",
                    review_image_path: "/tmp/sunken.png",
                    samples: [
                        {
                            source_task_id: "capture_full_count_sunken_ship_case",
                            status: "needs_manual_input",
                            map_id: "sunken_ship",
                            event_timestamp: "2026-04-25T17:47:55.784Z",
                            observed_state: { r1_total_items: 53, r1_blue_count: 17 },
                            actual_counts: { w: null, g: null, b: null, p: null, o: null, r: null, total_items: null },
                            actual_counts_source: "manual_review",
                            pixel_training_label_allowed: false,
                            metadata: {
                                capture_review: {
                                    expected_total_items: 53
                                }
                            }
                        }
                    ]
                }
            ]
        },
        generatedAt: "2026-04-26T10:40:00.000+08:00"
    });

    assert.equal(results.summary.manual_confirmation_draft_count, 1);
    assert.equal(results.fresh_capture_templates[0].samples[0].status, "needs_human_confirmation");
    assert.deepEqual(results.fresh_capture_templates[0].samples[0].actual_counts, {
        w: 0,
        g: 0,
        b: 0,
        p: 0,
        o: 0,
        r: 0,
        total_items: 53
    });
    assert.equal(results.fresh_capture_templates[0].samples[0].metadata.manual_count_entry.approval_required, true);
});

test("capture manual entry drafts can be focused by review priority", () => {
    const results = buildCodexVisualManualConfirmationResults({
        visualResults: {
            schema_version: "ak_count_fit_sample_review_template_v1",
            generated_at: "2026-04-27T00:00:00.000+08:00",
            fresh_capture_templates: [
                {
                    source_task_id: "capture_p0",
                    source_task_type: "capture_clipboard_full_count_review",
                    status: "needs_manual_full_count_review",
                    output_target: "count_fit_same_battle_sample",
                    map_id: "sunken_ship",
                    review_priority: "P0",
                    review_reasons: ["red_residual_sensitive_to_missing_orange_count"],
                    review_image_path: "/tmp/p0.png",
                    samples: [
                        {
                            source_task_id: "capture_p0",
                            status: "needs_manual_input",
                            map_id: "sunken_ship",
                            event_timestamp: "2026-04-26T12:39:48.135Z",
                            observed_state: {
                                r1_total_items: 48,
                                r1_blue_count: 17,
                                r2_purple_count: 9,
                                r2_orange_avg: 12,
                                r2_orange_avg_text: "12"
                            },
                            actual_counts: { w: null, g: null, b: null, p: null, o: null, r: null, total_items: null },
                            actual_counts_source: "manual_review",
                            pixel_training_label_allowed: false
                        }
                    ]
                },
                {
                    source_task_id: "capture_p2",
                    source_task_type: "capture_clipboard_full_count_review",
                    status: "needs_manual_full_count_review",
                    output_target: "count_fit_same_battle_sample",
                    map_id: "sunken_ship",
                    review_priority: "P2",
                    review_reasons: [],
                    review_image_path: "/tmp/p2.png",
                    samples: [
                        {
                            source_task_id: "capture_p2",
                            status: "needs_manual_input",
                            map_id: "sunken_ship",
                            event_timestamp: "2026-04-26T12:01:50.493Z",
                            observed_state: { r1_total_items: 49 },
                            actual_counts: { w: null, g: null, b: null, p: null, o: null, r: null, total_items: null },
                            actual_counts_source: "manual_review",
                            pixel_training_label_allowed: false
                        }
                    ]
                }
            ]
        },
        generatedAt: "2026-04-27T00:05:00.000+08:00",
        priorityFilter: ["p0"]
    });

    assert.equal(results.summary.manual_confirmation_draft_count, 1);
    assert.deepEqual(results.summary.priority_filter, ["P0"]);
    assert.deepEqual(results.summary.priority_counts, { P0: 1 });
    assert.equal(results.fresh_capture_templates.length, 1);
    assert.equal(results.fresh_capture_templates[0].source_task_id, "capture_p0");
    assert.equal(results.fresh_capture_templates[0].samples[0].review_priority, "P0");

    const html = formatCodexVisualManualConfirmationResultsHtml(results, "/tmp/manual-confirmation.json");
    assert.match(html, /priority: P0/);
    assert.match(html, /red_residual_sensitive_to_missing_orange_count/);
    assert.doesNotMatch(html, /capture_p2/);
});

test("red residual review pack hints are carried into manual confirmation drafts", () => {
    const results = buildCodexVisualManualConfirmationResults({
        visualResults: {
            schema_version: "ak_count_fit_sample_review_template_v1",
            generated_at: "2026-04-27T00:00:00.000+08:00",
            fresh_capture_templates: [
                {
                    source_task_id: "capture_p0",
                    source_task_type: "capture_clipboard_full_count_review",
                    status: "needs_manual_full_count_review",
                    output_target: "count_fit_same_battle_sample",
                    map_id: "sunken_ship",
                    review_priority: "P0",
                    review_reasons: ["red_residual_sensitive_to_missing_orange_count"],
                    review_image_path: "/tmp/p0.png",
                    samples: [
                        {
                            source_task_id: "capture_p0",
                            status: "needs_manual_input",
                            map_id: "sunken_ship",
                            event_timestamp: "2026-04-26T12:39:48.135Z",
                            observed_state: {
                                r1_total_items: 48,
                                r1_blue_count: 17,
                                r2_purple_count: 9,
                                r2_orange_avg: 12,
                                r2_orange_avg_text: "12"
                            },
                            actual_counts: { w: null, g: null, b: null, p: null, o: null, r: null, total_items: null },
                            actual_counts_source: "manual_review",
                            pixel_training_label_allowed: false
                        }
                    ]
                }
            ]
        },
        generatedAt: "2026-04-27T00:05:00.000+08:00",
        priorityFilter: ["P0"],
        redResidualReviewPack: buildRedResidualReviewPackFixture(),
        paths: {
            redResidualReviewPackPath: "/tmp/red-pack.json"
        }
    });

    assert.equal(results.inputs.red_residual_review_pack, "/tmp/red-pack.json");
    assert.equal(results.summary.red_residual_review_hint_count, 1);
    const sample = results.fresh_capture_templates[0].samples[0];
    assert.equal(sample.metadata.red_residual_review.first_decisive_field, "orange_count");
    assert.equal(sample.metadata.red_residual_review.training_label_allowed, false);
    assert.equal(sample.metadata.red_residual_review.authority_merge_allowed, false);

    const imported = buildCountFitSampleReviewImport({
        template: results,
        generatedAt: "2026-04-27T00:06:00.000+08:00"
    });
    assert.equal(imported.summary.accepted_sample_count, 0);
    assert.deepEqual(imported.summary.blocker_reason_counts, {
        actual_counts_total_mismatch: 1,
        status_not_approved_for_import: 1
    });

    const html = formatCodexVisualManualConfirmationResultsHtml(results, "/tmp/manual-confirmation.json");
    assert.match(html, /红数残差复核/);
    assert.match(html, /优先: orange_count/);
    assert.match(html, /red mean: 3.7133/);
    assert.match(html, /O\/R pool: 12/);
    assert.match(html, /计数辅助/);
    assert.match(html, /blue: 17/);
    assert.match(html, /purple: 9/);
    assert.match(html, /orange avg: 12/);
    assert.match(html, /priority field: orange_count/);
    assert.match(html, /data-constraint-line/);
    assert.match(html, /data-expected-blue="17"/);
    assert.match(html, /data-expected-purple="9"/);
    assert.match(html, /data-orange-red-pool="12"/);
    assert.match(html, /r=O\/R pool-o=/);
    assert.match(html, /填入已知 b\/p/);
    assert.match(html, /data-apply-known-constraints/);
    assert.match(html, /data-blue="17"/);
    assert.match(html, /data-purple="9"/);
    assert.match(html, /Top 完整候选/);
    assert.match(html, /data-apply-full-candidate/);
    assert.match(html, /data-w="5"/);
    assert.match(html, /data-g="5"/);
    assert.match(html, /data-b="17"/);
    assert.match(html, /data-p="9"/);
    assert.match(html, /data-o="8"/);
    assert.match(html, /data-r="4"/);
    assert.match(html, /填完整/);
    assert.match(html, /W\/G 候选表/);
    assert.match(html, /O\/R 候选表/);
    assert.match(html, /data-apply-pair-candidate/);
    assert.match(html, /data-first-quality="o"/);
    assert.match(html, /data-second-quality="r"/);
    assert.match(html, /data-first-count="8"/);
    assert.match(html, /data-second-count="4"/);
    assert.match(html, /填 8\/4/);
    assert.match(html, /截图和像素只做复核线索/);
});

test("red residual review index can match by event timestamp when source task id is unavailable", () => {
    const index = buildRedResidualReviewIndex(buildRedResidualReviewPackFixture());
    assert.equal(index.item_count, 1);
    assert.equal(index.byEventTimestamp.get("2026-04-26T12:39:48.135Z").first_decisive_field, "orange_count");
});

test("formatCodexVisualManualConfirmationResultsHtml renders editable approval controls", () => {
    const results = buildCodexVisualManualConfirmationResults({
        visualResults: buildVisualResultsFixture(),
        generatedAt: "2026-04-26T07:00:00.000+08:00"
    });
    const html = formatCodexVisualManualConfirmationResultsHtml(results, "/tmp/manual-confirmation.json");

    assert.match(html, /Codex Visual Manual Confirmation/);
    assert.match(html, /<link rel="icon" href="data:,">/);
    assert.match(html, /data-quality="w"/);
    assert.match(html, /data-total-items[^>]*readonly/);
    assert.match(html, /data-unlock-total/);
    assert.match(html, /total_items_locked/);
    assert.match(html, /toggleTotalLock/);
    assert.match(html, /data-approve/);
    assert.match(html, /data-download/);
    assert.match(html, /data-review-image/);
    assert.match(html, /data-zoom-in/);
    assert.match(html, /data-zoom-out/);
    assert.match(html, /data-zoom-fit/);
    assert.match(html, /setImageZoom/);
    assert.match(html, /updateConstraintLine/);
    assert.match(html, /applyPairCandidate/);
    assert.match(html, /applyKnownConstraints/);
    assert.match(html, /applyFullCandidate/);
    assert.match(html, /data-validation/);
    assert.match(html, /data-global-summary/);
    assert.match(html, /data-global-ready/);
    assert.match(html, /下载全部确认 JSON/);
    assert.match(html, /approved_count_fit_sample/);
    assert.match(html, /count_sum_mismatch_kept_unapproved/);
    assert.match(html, /manual_count_validation/);
    assert.match(html, /manual_confirmation_import_ready_count/);
    assert.match(html, /manual_confirmation_download/);
    assert.match(html, /computePageConfirmationSummary/);
    assert.match(html, /\/tmp_capture_review\/stitched\.png/);
    assert.match(html, /URL\.createObjectURL/);
    assert.match(html, /applyAllCardsToResults/);
    assert.match(html, /updateGlobalSummary/);
});

test("main writes JSON and Markdown and refuses overwrite without force", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-codex-visual-manual-confirm-"));
    const visualPath = path.join(tempDir, "visual-results.json");
    const outputPath = path.join(tempDir, "manual-confirmation.json");
    fs.writeFileSync(visualPath, JSON.stringify(buildVisualResultsFixture(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([visualPath, outputPath, "--generated-at=2026-04-26T07:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    assert.throws(
        () => main([visualPath, outputPath, "--generated-at=2026-04-26T07:01:00.000+08:00"]),
        /manual confirmation results already exists/
    );
    const results = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    const html = fs.readFileSync(outputPath.replace(/\.json$/i, ".html"), "utf8");
    assert.equal(results.summary.manual_confirmation_draft_count, 1);
    assert.match(markdown, /Codex Visual Manual Confirmation Results/);
    assert.match(html, /Codex Visual Manual Confirmation/);
    assert.match(formatCodexVisualManualConfirmationResultsMarkdown(results, outputPath), /approved_count_fit_sample/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
