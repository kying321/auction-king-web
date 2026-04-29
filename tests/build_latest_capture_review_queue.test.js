const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildLatestCaptureReviewQueue,
    findCapturePackagePaths,
    resolveArgs
} = require("../scripts/build_latest_capture_review_queue.js");

function writeCapture(dir, stamp, overrides = {}) {
    const exportedAt = stamp;
    const basename = `auction-king-battle-capture-sunken-ship-${stamp.replace(/[-:.]/g, "").slice(0, 15)}Z.json`;
    const payload = {
        schema_version: "ak_battle_clipboard_capture_v1",
        export_kind: "battle_input_clipboard_screenshot",
        exported_at: exportedAt,
        map_id: "sunken_ship",
        template_id: "local_test",
        observed_state: {
            r1_total_items: 47,
            r1_blue_count: 14,
            ...(overrides.observed_state || {})
        },
        field_values: overrides.field_values || {},
        screenshot_attachment: overrides.screenshot_attachment || null
    };
    const outputPath = path.join(dir, basename);
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
    return outputPath;
}

test("package exposes latest capture review queue builder", () => {
    assert.equal(
        packageJson.scripts["build:latest-capture-review-queue"],
        "node scripts/build_latest_capture_review_queue.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_latest_capture_review_queue\.js/);
});

test("resolveArgs accepts latest capture queue inputs", () => {
    const args = resolveArgs([
        "--input-dir", "downloads",
        "--map-id=sunken_ship",
        "--output-prefix", "docs/research/latest",
        "--review-image-dir=tmp/reviews",
        "--generated-at", "2026-04-26T12:00:00.000Z",
        "--group-max-gap-ms", "90000",
        "--skip-stitch"
    ]);

    assert.equal(args.inputDir, path.resolve("downloads"));
    assert.equal(args.mapId, "sunken_ship");
    assert.equal(args.outputPrefix, path.resolve("docs/research/latest"));
    assert.equal(args.reviewImageDir, path.resolve("tmp/reviews"));
    assert.equal(args.generatedAt, "2026-04-26T12:00:00.000Z");
    assert.equal(args.groupMaxGapMs, 90000);
    assert.equal(args.skipStitch, true);
});

test("latest capture review queue groups adjacent captures and writes review artifacts", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-latest-capture-"));
    const outputPrefix = path.join(tempDir, "latest-capture-review");
    const reviewImageDir = path.join(tempDir, "review-images");

    writeCapture(tempDir, "2026-04-26T12:00:00.000Z");
    writeCapture(tempDir, "2026-04-26T12:00:20.000Z");
    writeCapture(tempDir, "2026-04-26T12:05:30.000Z");
    writeCapture(tempDir, "2026-04-26T12:06:00.000Z", {
        observed_state: { r1_total_items: 49, r1_blue_count: 16 }
    });

    assert.equal(findCapturePackagePaths(tempDir, "sunken_ship").length, 4);

    const { manifest, template, results, importReport } = await buildLatestCaptureReviewQueue({
        inputDir: tempDir,
        outputPrefix,
        reviewImageDir,
        generatedAt: "2026-04-26T12:10:00.000Z",
        groupMaxGapMs: 120000,
        skipStitch: true
    });

    assert.equal(manifest.schema_version, "ak_latest_capture_review_queue_v1");
    assert.equal(manifest.summary.capture_package_count, 4);
    assert.equal(manifest.summary.capture_group_count, 3);
    assert.equal(manifest.summary.review_image_count, 3);
    assert.equal(manifest.summary.accepted_sample_count, 0);
    assert.equal(manifest.summary.blocked_entry_count, 3);
    assert.equal(template.summary.capture_group_count, 3);
    assert.equal(template.inputs.group_max_gap_ms, 120000);
    assert.equal(results.summary.fresh_capture_template_count, 3);
    assert.equal(importReport.summary.review_entry_count, 3);
    assert.equal(importReport.summary.blocker_reason_counts.status_not_approved_for_import, 3);

    for (const outputPath of Object.values(manifest.outputs)) {
        assert.equal(fs.existsSync(outputPath), true, outputPath);
    }
    const reviewMap = JSON.parse(fs.readFileSync(manifest.outputs.reviewImageMapPath, "utf8"));
    assert.match(reviewMap.group_1, /review-images/);
    assert.match(fs.readFileSync(manifest.outputs.templatePath.replace(/\.json$/i, ".md"), "utf8"), /capture full-count review template/);
    assert.match(fs.readFileSync(manifest.outputs.importPath.replace(/\.json$/i, ".md"), "utf8"), /count-fit sample review import/);
});
