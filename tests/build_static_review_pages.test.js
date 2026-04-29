const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_REVIEW_PAGES,
    buildStaticReviewPages
} = require("../scripts/build_static_review_pages.js");

test("buildStaticReviewPages copies review pages, referenced images, and index", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-static-review-"));
    const sourceDir = path.join(tempDir, "source");
    const imageDir = path.join(tempDir, "tmp_capture_review");
    const outputDir = path.join(tempDir, "dist");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(imageDir, { recursive: true });
    const sourcePath = path.join(sourceDir, "p1.html");
    const imagePath = path.join(imageDir, "case_review.png");
    fs.writeFileSync(sourcePath, '<html><body><img src="/tmp_capture_review/case_review.png"></body></html>');
    fs.writeFileSync(imagePath, "png");

    const report = buildStaticReviewPages({
        outputDir,
        reviewImageRoot: imageDir,
        reviewPages: [{
            label: "P1 手动复核",
            description: "测试页面",
            sourcePath,
            outputName: "p1-manual-count-confirmation-results.html"
        }]
    });

    assert.equal(report.summary.review_page_count, 1);
    assert.equal(report.summary.review_image_count, 1);
    assert.equal(
        fs.existsSync(path.join(outputDir, "review", "p1-manual-count-confirmation-results.html")),
        true
    );
    assert.equal(fs.existsSync(path.join(outputDir, "review", "index.html")), true);
    assert.equal(fs.existsSync(path.join(outputDir, "tmp_capture_review", "case_review.png")), true);
    const indexHtml = fs.readFileSync(path.join(outputDir, "review", "index.html"), "utf8");
    assert.match(indexHtml, /P1 手动复核/);
    assert.match(indexHtml, /p1-manual-count-confirmation-results\.html/);
});

test("package static build and js check include static review page builder", () => {
    assert.match(packageJson.scripts["build:static"] || "", /scripts\/build_static_review_pages\.js/);
    assert.match(packageJson.scripts["check:js"] || "", /scripts\/build_static_review_pages\.js/);
});

test("default static review index includes the latest P2 manual confirmation page", () => {
    assert.equal(
        DEFAULT_REVIEW_PAGES.some((page) => page.outputName === "p2-manual-count-confirmation-results.html"),
        true
    );
});
