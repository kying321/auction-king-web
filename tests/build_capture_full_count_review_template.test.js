const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCaptureFullCountReviewTemplate,
    formatCaptureFullCountReviewTemplateMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_capture_full_count_review_template.js");

function makeCapture(exportedAt, overrides = {}) {
    return {
        schema_version: "ak_battle_clipboard_capture_v1",
        export_kind: "battle_clipboard_capture",
        exported_at: exportedAt,
        map_id: "sunken_ship",
        template_id: "local_1776929172815",
        template_label: "Ahmed 默认模板",
        config_source_version: "20260426031500",
        field_values: {
            r1_total_items: "58",
            r1_blue_count: "15",
            r2_orange_avg: "4.25"
        },
        observed_state: {
            r1_total_items: 58,
            r1_blue_count: 15,
            r2_orange_avg: 4.25,
            r2_orange_avg_text: "4.25"
        },
        screenshot_attachment: {
            name: "clipboard-screenshot.png",
            type: "image/jpeg",
            data_url: "data:image/jpeg;base64,AAAA"
        },
        ...overrides
    };
}

test("package exposes capture full-count review template builder", () => {
    assert.equal(
        packageJson.scripts["build:capture-full-count-review-template"],
        "node scripts/build_capture_full_count_review_template.js"
    );
});

test("resolveArgs accepts capture paths, output path, and generated-at", () => {
    const result = resolveArgs([
        "a.json",
        "b.json",
        "--output",
        "capture-review.json",
        "--review-image-map",
        "review-images.json",
        "--generated-at",
        "2026-04-26T04:00:00.000Z"
    ]);

    assert.deepEqual(result.capturePackagePaths, [
        path.resolve("a.json"),
        path.resolve("b.json")
    ]);
    assert.equal(result.outputPath, path.resolve("capture-review.json"));
    assert.equal(result.reviewImageMapPath, path.resolve("review-images.json"));
    assert.equal(result.generatedAt, "2026-04-26T04:00:00.000Z");
});

test("buildCaptureFullCountReviewTemplate groups same-battle capture screenshots into one fillable sample", () => {
    const template = buildCaptureFullCountReviewTemplate({
        capturePackages: [
            { input_path: "/tmp/top.json", payload: makeCapture("2026-04-25T18:24:45.635Z") },
            { input_path: "/tmp/bottom.json", payload: makeCapture("2026-04-25T18:24:55.589Z") }
        ],
        generatedAt: "2026-04-26T04:00:00.000Z",
        paths: { capturePackagePaths: ["/tmp/top.json", "/tmp/bottom.json"] },
        reviewImagePath: "/tmp/stitched.png"
    });

    assert.equal(template.schema_version, "ak_count_fit_sample_review_template_v1");
    assert.equal(template.change_class, "RESEARCH_ONLY");
    assert.equal(template.summary.capture_package_count, 2);
    assert.equal(template.summary.capture_group_count, 1);
    assert.equal(template.summary.fresh_capture_template_count, 1);
    assert.deepEqual(template.summary.map_counts, { sunken_ship: 1 });
    assert.equal(template.inputs.capture_package_paths.length, 2);
    assert.equal(template.notes.includes("Multiple screenshots from one capture group can be stitched before manual review."), true);

    const fresh = template.fresh_capture_templates[0];
    assert.equal(fresh.source_task_type, "capture_clipboard_full_count_review");
    assert.equal(fresh.status, "needs_manual_full_count_review");
    assert.equal(fresh.output_target, "count_fit_same_battle_sample");
    assert.equal(fresh.map_id, "sunken_ship");
    assert.equal(fresh.template_id, "local_1776929172815");
    assert.equal(fresh.review_image_path, "/tmp/stitched.png");
    assert.equal(fresh.capture_packages.length, 2);
    assert.deepEqual(fresh.required_fields, [
        "map_id",
        "event_timestamp",
        "observed_state",
        "actual_counts.w",
        "actual_counts.g",
        "actual_counts.b",
        "actual_counts.p",
        "actual_counts.o",
        "actual_counts.r",
        "actual_counts.total_items",
        "actual_counts_source",
        "reviewer_notes"
    ]);

    const draft = fresh.samples[0];
    assert.equal(draft.status, "needs_manual_input");
    assert.equal(draft.event_timestamp, "2026-04-25T18:24:45.635Z");
    assert.equal(draft.map_id, "sunken_ship");
    assert.deepEqual(draft.observed_state, {
        r1_total_items: 58,
        r1_blue_count: 15,
        r2_orange_avg: 4.25,
        r2_orange_avg_text: "4.25"
    });
    assert.deepEqual(draft.actual_counts, {
        w: null,
        g: null,
        b: null,
        p: null,
        o: null,
        r: null,
        total_items: null
    });
    assert.equal(draft.actual_counts_source, "manual_review");
    assert.equal(draft.review_image_quality_override, "");
    assert.equal(draft.pixel_training_label_allowed, false);
    assert.equal(draft.metadata.capture_review.expected_total_items, 58);
    assert.equal(draft.metadata.capture_review.capture_package_count, 2);
});

test("buildCaptureFullCountReviewTemplate attaches review images per capture group", () => {
    const secondBattle = makeCapture("2026-04-25T18:30:00.000Z", {
        field_values: {
            r1_total_items: "40",
            r1_blue_count: "12"
        },
        observed_state: {
            r1_total_items: 40,
            r1_blue_count: 12
        }
    });
    const template = buildCaptureFullCountReviewTemplate({
        capturePackages: [
            { input_path: "/tmp/top.json", payload: makeCapture("2026-04-25T18:24:45.635Z") },
            { input_path: "/tmp/bottom.json", payload: makeCapture("2026-04-25T18:24:55.589Z") },
            { input_path: "/tmp/second.json", payload: secondBattle }
        ],
        generatedAt: "2026-04-26T04:00:00.000Z",
        paths: { capturePackagePaths: ["/tmp/top.json", "/tmp/bottom.json", "/tmp/second.json"] },
        reviewImageByGroup: {
            "sunken_ship:2026-04-25T18:24:45.635Z": "/tmp/first-stitched.png",
            "capture_full_count_sunken_ship_2026_04_25T18_30_00_000Z": "/tmp/second.png"
        }
    });

    assert.equal(template.summary.capture_group_count, 2);
    assert.equal(template.summary.review_image_bound_group_count, 2);
    assert.equal(template.fresh_capture_templates[0].review_image_path, "/tmp/first-stitched.png");
    assert.equal(template.fresh_capture_templates[1].review_image_path, "/tmp/second.png");
    assert.equal(
        template.fresh_capture_templates[0].samples[0].metadata.capture_review.review_image_path,
        "/tmp/first-stitched.png"
    );
    assert.equal(
        template.fresh_capture_templates[1].samples[0].metadata.capture_review.review_image_path,
        "/tmp/second.png"
    );
});

test("buildCaptureFullCountReviewTemplate carries stitched review image quality flags into samples", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-capture-quality-flags-"));
    const reviewImagePath = path.join(tempDir, "stitched.png");
    const manifestPath = path.join(tempDir, "stitched.json");
    fs.writeFileSync(reviewImagePath, "");
    fs.writeFileSync(manifestPath, JSON.stringify({
        schema_version: "ak_capture_screenshot_stitch_v1",
        output_image: { width: 503, height: 568 },
        width_normalization: {
            strategy: "max_width_canvas_shared_area_match",
            input_content_widths: [503, 25],
            comparison_width: 25,
            output_width: 503,
            quality_flags: [
                "severe_width_mismatch_review_image_may_be_partial",
                "narrow_capture_fragment_needs_recapture_or_manual_single_review"
            ]
        },
        matches: []
    }, null, 2));

    const template = buildCaptureFullCountReviewTemplate({
        capturePackages: [
            { input_path: "/tmp/top.json", payload: makeCapture("2026-04-25T18:24:45.635Z") },
            { input_path: "/tmp/bottom.json", payload: makeCapture("2026-04-25T18:24:55.589Z") }
        ],
        reviewImagePath
    });
    const fresh = template.fresh_capture_templates[0];
    const draft = fresh.samples[0];

    assert.equal(template.summary.review_image_quality_flagged_group_count, 1);
    assert.deepEqual(fresh.review_image_quality_flags, [
        "severe_width_mismatch_review_image_may_be_partial",
        "narrow_capture_fragment_needs_recapture_or_manual_single_review"
    ]);
    assert.equal(fresh.review_image_manifest.manifest_path, manifestPath);
    assert.ok(fresh.guardrails.includes("review_image_quality_flags_require_recapture_or_single_image_manual_review"));
    assert.deepEqual(draft.metadata.capture_review.review_image_quality_flags, fresh.review_image_quality_flags);
    assert.equal(draft.metadata.capture_review.review_image_manifest_path, manifestPath);
});

test("buildCaptureFullCountReviewTemplate ignores stale embedded red predictions for priority", () => {
    const normalCapture = makeCapture("2026-04-25T18:24:45.635Z", {
        field_values: {
            total_items: 40,
            blue_count: 12,
            orange_avg_cells: 2,
            white_green_total_cells: 20,
            white_green_avg_cells: 2
        },
        observed_state: {
            r1_total_items: 40,
            r1_blue_count: 12,
            r2_orange_avg: 2,
            r2_white_green_cells: 20,
            r3_white_green_avg: 2
        },
        analysis_snapshot: {
            summary: {
                count_means: { r: 2 },
                cell_means: { r: 8 }
            }
        }
    });
    const residualCapture = makeCapture("2026-04-25T18:30:00.000Z", {
        field_values: {
            total_items: 48,
            blue_count: 17,
            purple_count: 9,
            orange_avg_cells: 12,
            white_green_total_cells: 24,
            white_green_avg_cells: 2.4
        },
        observed_state: {
            r1_total_items: 48,
            r1_blue_count: 17,
            r2_purple_count: 9,
            r2_orange_avg: 12,
            r2_white_green_cells: 24,
            r3_white_green_avg: 2.4
        },
        analysis_snapshot: {
            summary: {
                count_means: { r: 11 },
                cell_means: { r: 40 }
            }
        }
    });

    const template = buildCaptureFullCountReviewTemplate({
        capturePackages: [
            { input_path: "/tmp/normal.json", payload: normalCapture },
            { input_path: "/tmp/residual.json", payload: residualCapture }
        ],
        generatedAt: "2026-04-26T04:00:00.000Z",
        paths: { capturePackagePaths: ["/tmp/normal.json", "/tmp/residual.json"] }
    });

    assert.deepEqual(template.summary.review_priority_counts, { P1: 1, P2: 1 });
    assert.equal(template.fresh_capture_templates[0].review_priority, "P1");
    assert.equal(template.fresh_capture_templates[0].event_timestamp, "2026-04-25T18:30:00.000Z");
    assert.deepEqual(template.fresh_capture_templates[0].review_reasons, ["extreme_orange_avg_needs_orange_count_confirmation"]);
    assert.equal(template.fresh_capture_templates[0].samples[0].metadata.capture_review.review_priority, "P1");
    assert.deepEqual(template.fresh_capture_templates[1].review_reasons, []);
});

test("main writes capture full-count review template JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-capture-full-count-template-"));
    const captureAPath = path.join(tempDir, "capture-a.json");
    const captureBPath = path.join(tempDir, "capture-b.json");
    const outputPath = path.join(tempDir, "review-template.json");

    fs.writeFileSync(captureAPath, JSON.stringify(makeCapture("2026-04-25T18:24:45.635Z"), null, 2));
    fs.writeFileSync(captureBPath, JSON.stringify(makeCapture("2026-04-25T18:24:55.589Z"), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            captureAPath,
            captureBPath,
            "--output",
            outputPath,
            "--generated-at",
            "2026-04-26T04:00:00.000Z",
            "--review-image",
            "/tmp/stitched.png"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const template = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(template.generated_at, "2026-04-26T04:00:00.000Z");
    assert.equal(template.fresh_capture_templates.length, 1);
    assert.match(markdown, /capture full-count review template/);
    assert.match(markdown, /sunken_ship/);
    assert.match(formatCaptureFullCountReviewTemplateMarkdown(template, outputPath), /manual_review/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
