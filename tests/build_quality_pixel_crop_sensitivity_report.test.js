const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const packageJson = require("../package.json");
const {
    buildCropVariants,
    buildQualityPixelCropSensitivityReport,
    main,
    resolveArgs
} = require("../scripts/build_quality_pixel_crop_sensitivity_report.js");

function stableSvg() {
    return Buffer.from(`
<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="180" fill="#111827"/>
  <rect x="170" y="48" width="84" height="76" fill="#28323f" stroke="#ffd04c" stroke-width="6"/>
</svg>`);
}

function edgeSensitiveSvg() {
    return Buffer.from(`
<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg">
  <rect width="320" height="180" fill="#111827"/>
  <rect x="272" y="48" width="42" height="76" fill="#28323f" stroke="#f24c4c" stroke-width="6"/>
</svg>`);
}

test("package exposes quality pixel crop sensitivity report entry", () => {
    assert.match(
        packageJson.scripts["build:quality-pixel-crop-sensitivity"] || "",
        /node\s+scripts\/build_quality_pixel_crop_sensitivity_report\.js/
    );
});

test("resolveArgs accepts pixel report, output path, and jitter", () => {
    const result = resolveArgs([
        "quality_pixel_report.json",
        "crop_sensitivity.json",
        "--jitter=0.02",
        "--profile=standard"
    ]);

    assert.equal(result.pixelReportPath, path.resolve("quality_pixel_report.json"));
    assert.equal(result.outputPath, path.resolve("crop_sensitivity.json"));
    assert.equal(result.jitter, 0.02);
    assert.equal(result.qualityProfile, "standard");
});

test("buildCropVariants creates a nine-point relative crop jitter grid", () => {
    const variants = buildCropVariants({ x: 0.6, y: 0.1, width: 0.3, height: 0.7 }, 0.02);

    assert.equal(variants.length, 9);
    assert.deepEqual(variants[0], { x: 0.58, y: 0.08, width: 0.3, height: 0.7 });
    assert.deepEqual(variants[4], { x: 0.6, y: 0.1, width: 0.3, height: 0.7 });
    assert.deepEqual(variants[8], { x: 0.62, y: 0.12, width: 0.3, height: 0.7 });
});

test("buildQualityPixelCropSensitivityReport marks stable crops as review-only stable candidates", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-pixel-crop-stable-"));
    const imagePath = path.join(tempDir, "stable.png");
    await sharp(stableSvg()).png().toFile(imagePath);

    const report = await buildQualityPixelCropSensitivityReport({
        pixelReport: {
            schema_version: "ak_quality_pixel_report_v2",
            quality_profile: "high_contrast_191",
            crop: { x: 0.45, y: 0.08, width: 0.48, height: 0.84 },
            results: [
                {
                    file: imagePath,
                    basename: "stable.png",
                    summary: { counts: { w: 0, g: 0, b: 0, p: 0, o: 1, r: 0 }, total: 1 }
                }
            ]
        },
        jitter: 0.01,
        generatedAt: "2026-04-24T12:00:00.000Z"
    });

    assert.equal(report.schema_version, "ak_quality_pixel_crop_sensitivity_v1");
    assert.equal(report.quality_profile, "high_contrast_191");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.image_count, 1);
    assert.equal(report.summary.stable_count, 1);
    assert.equal(report.summary.unstable_count, 0);
    assert.equal(report.summary.pixel_training_label_allowed_count, 0);
    assert.equal(report.results[0].action, "pixel_review_only_stable_candidate");
    assert.equal(report.results[0].stable, true);
    assert.equal(report.results[0].majority_fraction, 1);
    assert.deepEqual(report.results[0].majority_summary.counts.o, 1);
});

test("buildQualityPixelCropSensitivityReport marks edge-sensitive crops for manual review", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-pixel-crop-sensitive-"));
    const imagePath = path.join(tempDir, "edge.png");
    await sharp(edgeSensitiveSvg()).png().toFile(imagePath);

    const report = await buildQualityPixelCropSensitivityReport({
        pixelReport: {
            schema_version: "ak_quality_pixel_report_v2",
            crop: { x: 0.68, y: 0.08, width: 0.3, height: 0.84 },
            results: [
                {
                    file: imagePath,
                    basename: "edge.png",
                    summary: { counts: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 1 }, total: 1 }
                }
            ]
        },
        jitter: 0.05
    });

    assert.equal(report.summary.stable_count, 0);
    assert.equal(report.summary.unstable_count, 1);
    assert.equal(report.results[0].stable, false);
    assert.equal(report.results[0].action, "manual_review_required_crop_sensitive");
    assert.ok(report.results[0].unique_signature_count > 1);
});

test("main writes crop sensitivity JSON and markdown", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-pixel-crop-main-"));
    const imagePath = path.join(tempDir, "stable.png");
    const pixelReportPath = path.join(tempDir, "quality_pixel_report.json");
    const outputPath = path.join(tempDir, "crop_sensitivity.json");
    await sharp(stableSvg()).png().toFile(imagePath);
    fs.writeFileSync(pixelReportPath, JSON.stringify({
        schema_version: "ak_quality_pixel_report_v2",
        crop: { x: 0.45, y: 0.08, width: 0.48, height: 0.84 },
        results: [
            {
                file: imagePath,
                basename: "stable.png",
                summary: { counts: { w: 0, g: 0, b: 0, p: 0, o: 1, r: 0 }, total: 1 }
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
        await main([pixelReportPath, outputPath, "--jitter=0.01"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.image_count, 1);
    assert.match(markdown, /quality pixel crop sensitivity/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
