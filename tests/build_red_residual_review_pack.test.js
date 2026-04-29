const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildRedResidualReviewPack,
    buildRecommendations,
    captureBasenamesFromQueueItem,
    captureBasenamesFromTemplate,
    formatHtmlReport,
    formatMarkdownReport,
    main,
    resolveArgs
} = require("../scripts/build_red_residual_review_pack.js");

function queueItem(overrides = {}) {
    return {
        queue_id: "red_residual_2026_04_26T12_39_48_135Z",
        group_id: "red_residual_group_case",
        priority: "P0",
        priority_score: 359.0311,
        map_id: "sunken_ship",
        capture: "auction-king-battle-capture-sunken-ship-20260426T123948135Z.json",
        captures: [
            "auction-king-battle-capture-sunken-ship-20260426T123948135Z.json",
            "auction-king-battle-capture-sunken-ship-20260426T123954089Z.json"
        ],
        exported_at: "2026-04-26T12:39:48.135Z",
        input_paths: [
            "/tmp/auction-king-battle-capture-sunken-ship-20260426T123948135Z.json"
        ],
        current_model: {
            red_count_mean: 10.9988,
            red_cell_mean: 40.6955,
            orange_count_mean: 1.0012,
            purple_count_mean: 9
        },
        constraint_diagnostics: {
            total_items: 48,
            blue_count: 17,
            purple_count: 9,
            orange_count: null,
            orange_red_unknown_pool: 12,
            orange_count_missing: true
        },
        minimal_required_fields: [
            "orange_count",
            "total_storage_cells",
            "red_count",
            "actual_counts.w/g/b/p/o/r/total_items"
        ],
        recommended_next_action: "先补金色数量；若仍异常，再补红色数量或完整六品质数量。",
        training_label_allowed: false,
        authority_merge_allowed: false,
        adoption_blockers: [
            "manual_clarification_required",
            "capture_observations_are_not_training_labels"
        ],
        ...overrides
    };
}

function queueFixture() {
    return {
        schema_version: "ak_red_residual_clarification_queue_v1",
        change_class: "RESEARCH_ONLY",
        summary: {
            queue_item_count: 2
        },
        items: [
            queueItem(),
            queueItem({
                queue_id: "red_residual_p2",
                priority: "P2",
                priority_score: 5,
                capture: "p2.json",
                captures: ["p2.json"],
                input_paths: ["/tmp/p2.json"],
                minimal_required_fields: ["actual_counts.w/g/b/p/o/r/total_items"]
            })
        ]
    };
}

function templateFixture() {
    return {
        schema_version: "ak_count_fit_sample_review_template_v1",
        generated_at: "2026-04-27T00:00:00.000+08:00",
        fresh_capture_templates: [
            {
                source_task_id: "capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z",
                source_task_type: "capture_clipboard_full_count_review",
                review_priority: "P0",
                map_id: "sunken_ship",
                event_timestamp: "2026-04-26T12:39:48.135Z",
                review_image_path: "/tmp/auction_king_web/tmp_capture_review/sunken_ship_case_review.png",
                review_image_quality_flags: [],
                capture_packages: [
                    {
                        basename: "auction-king-battle-capture-sunken-ship-20260426T123948135Z.json",
                        input_path: "/tmp/auction-king-battle-capture-sunken-ship-20260426T123948135Z.json"
                    },
                    {
                        basename: "auction-king-battle-capture-sunken-ship-20260426T123954089Z.json",
                        input_path: "/tmp/auction-king-battle-capture-sunken-ship-20260426T123954089Z.json"
                    }
                ],
                samples: [
                    {
                        source_task_id: "capture_full_count_sunken_ship_2026_04_26T12_39_48_135Z",
                        status: "needs_manual_input",
                        map_id: "sunken_ship",
                        event_timestamp: "2026-04-26T12:39:48.135Z",
                        observed_state: {
                            r1_total_items: 48,
                            r1_blue_count: 17
                        },
                        actual_counts_source: "manual_review",
                        metadata: {
                            capture_review: {
                                expected_total_items: 48,
                                review_image_path: "/tmp/auction_king_web/tmp_capture_review/sunken_ship_case_review.png",
                                capture_package_paths: [
                                    "/tmp/auction-king-battle-capture-sunken-ship-20260426T123948135Z.json"
                                ]
                            }
                        }
                    }
                ]
            }
        ]
    };
}

test("package exposes red residual review pack entry", () => {
    assert.equal(
        packageJson.scripts["build:red-residual-review-pack"],
        "node scripts/build_red_residual_review_pack.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_red_residual_review_pack\.js/);
});

test("capture basename helpers normalize queue items and review templates", () => {
    assert.deepEqual(captureBasenamesFromQueueItem(queueItem()), [
        "auction-king-battle-capture-sunken-ship-20260426T123948135Z.json",
        "auction-king-battle-capture-sunken-ship-20260426T123954089Z.json"
    ]);
    assert.deepEqual(captureBasenamesFromTemplate(templateFixture().fresh_capture_templates[0]), [
        "auction-king-battle-capture-sunken-ship-20260426T123948135Z.json",
        "auction-king-battle-capture-sunken-ship-20260426T123954089Z.json"
    ]);
});

test("red residual review pack joins P0 queue items to stitched review images", () => {
    const report = buildRedResidualReviewPack({
        redResidualQueue: queueFixture(),
        captureReviewTemplate: templateFixture(),
        priorityFilter: ["P0"]
    });

    assert.equal(report.schema_version, "ak_red_residual_review_pack_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.source_queue_item_count, 2);
    assert.equal(report.summary.review_item_count, 1);
    assert.equal(report.summary.matched_review_group_count, 1);
    assert.equal(report.summary.authority_merge_allowed, false);
    assert.equal(report.summary.training_label_allowed_count, 0);
    assert.deepEqual(report.summary.priority_filter, ["P0"]);
    assert.deepEqual(report.summary.decisive_first_field_counts, { orange_count: 1 });
    assert.equal(report.items[0].manual_confirmation_page_ready, true);
    assert.equal(report.items[0].review_image_path.endsWith("sunken_ship_case_review.png"), true);
    assert.equal(report.items[0].expected_total_items, 48);
    assert.equal(report.items[0].field_plan.one_field_fallback, "orange_count");
    assert.equal(report.items[0].training_label_allowed, false);
    assert.equal(report.items[0].authority_merge_allowed, false);
});

test("red residual review pack keeps unmatched items blocked and visible", () => {
    const report = buildRedResidualReviewPack({
        redResidualQueue: {
            items: [queueItem({ capture: "missing.json", captures: ["missing.json"], input_paths: ["/tmp/missing.json"] })]
        },
        captureReviewTemplate: templateFixture(),
        priorityFilter: []
    });

    assert.equal(report.summary.review_item_count, 1);
    assert.equal(report.summary.matched_review_group_count, 0);
    assert.equal(report.summary.unmatched_review_group_count, 1);
    assert.equal(report.items[0].manual_confirmation_page_ready, false);
    assert.ok(report.items[0].adoption_blockers.includes("missing_review_image_binding"));
});

test("red residual review pack renders markdown and html hints", () => {
    const report = buildRedResidualReviewPack({
        redResidualQueue: queueFixture(),
        captureReviewTemplate: templateFixture(),
        priorityFilter: ["P0"]
    });
    const markdown = formatMarkdownReport(report, "/tmp/red-residual-review-pack.json");
    const html = formatHtmlReport(report);

    assert.match(markdown, /Red Residual Review Pack/);
    assert.match(markdown, /orange_count/);
    assert.match(html, /Red Residual Review Pack/);
    assert.match(html, /优先补字段/);
    assert.match(html, /\/tmp_capture_review\/sunken_ship_case_review\.png/);
    assert.match(html, /authority merge: blocked/);
});

test("red residual review pack defaults to all current priorities", () => {
    const args = resolveArgs(["queue.json", "template.json", "pack.json"]);
    assert.deepEqual(args.priorityFilter, []);
    assert.match(buildRecommendations([{ priority: "P1" }])[0], /最高优先级 P1/);
    assert.match(buildRecommendations([])[0], /没有匹配/);
});

test("red residual review pack CLI resolves paths and writes json, markdown, and html", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-red-review-pack-"));
    const queuePath = path.join(tempDir, "queue.json");
    const templatePath = path.join(tempDir, "template.json");
    const outputPath = path.join(tempDir, "pack.json");
    fs.writeFileSync(queuePath, `${JSON.stringify(queueFixture(), null, 2)}\n`);
    fs.writeFileSync(templatePath, `${JSON.stringify(templateFixture(), null, 2)}\n`);

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        const args = resolveArgs([queuePath, templatePath, outputPath, "--priority=P0"]);
        assert.equal(args.queuePath, queuePath);
        assert.equal(args.captureTemplatePath, templatePath);
        assert.equal(args.outputPath, outputPath);
        assert.deepEqual(args.priorityFilter, ["P0"]);

        main([queuePath, templatePath, outputPath, "--priority=P0"]);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
        const html = fs.readFileSync(outputPath.replace(/\.json$/i, ".html"), "utf8");
        assert.equal(report.summary.review_item_count, 1);
        assert.match(markdown, /Matched review images/);
        assert.match(html, /red mean/);
        assert.equal(
            printed.join(""),
            `${outputPath}\n${outputPath.replace(/\.json$/i, ".md")}\n${outputPath.replace(/\.json$/i, ".html")}\n`
        );
    } finally {
        process.stdout.write = originalWrite;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
