const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_RESEARCH_ARTIFACTS,
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

test("buildStaticReviewPages publishes a research status page with selected artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-static-research-"));
    const sourceDir = path.join(tempDir, "source");
    const outputDir = path.join(tempDir, "dist");
    fs.mkdirSync(sourceDir, { recursive: true });
    const gatePath = path.join(sourceDir, "gate.md");
    const scanPath = path.join(sourceDir, "scan.json");
    fs.writeFileSync(gatePath, "# Gate\n\n- Promotion allowed: `false`\n", "utf8");
    fs.writeFileSync(scanPath, JSON.stringify({ summary: { source_item_row_recovered_count: 0 } }), "utf8");

    const report = buildStaticReviewPages({
        outputDir,
        reviewPages: [],
        researchArtifacts: [
            {
                label: "逆值尾部 gate",
                description: "影子 replay gate，禁止默认提升。",
                sourcePath: gatePath,
                outputName: "bidking-gate.md"
            },
            {
                label: "本地源扫描 JSON",
                description: "1106013 源扫描。",
                sourcePath: scanPath,
                outputName: "bidking-scan.json"
            }
        ],
        generatedAt: "2026-05-07T23:59:30.000+08:00"
    });

    assert.equal(report.summary.research_artifact_count, 2);
    assert.equal(fs.existsSync(path.join(outputDir, "research", "index.html")), true);
    assert.equal(fs.existsSync(path.join(outputDir, "research", "bidking-gate.md")), true);
    assert.equal(fs.existsSync(path.join(outputDir, "research", "bidking-scan.json")), true);
    const indexHtml = fs.readFileSync(path.join(outputDir, "research", "index.html"), "utf8");
    assert.match(indexHtml, /BidKing 研究状态/);
    assert.match(indexHtml, /<link rel="stylesheet" href="\.\.\/style\.css\?v=\d+">/);
    assert.match(indexHtml, /class="app-background"/);
    assert.match(indexHtml, /class="app-container"/);
    assert.match(indexHtml, /workspace-command-header/);
    assert.match(indexHtml, /research-dashboard/);
    assert.match(indexHtml, /research-artifact-card/);
    assert.match(indexHtml, /class="btn secondary small-btn" href="\.\.\/"/);
    assert.doesNotMatch(indexHtml, /background:\s*#f6f7f9/);
    assert.match(indexHtml, /逆值尾部 gate/);
    assert.match(indexHtml, /bidking-gate\.md/);
    assert.match(indexHtml, /影子 replay gate/);
    assert.match(indexHtml, /2026-05-07T23:59:30\.000\+08:00/);
});

test("default research artifacts include latest BidKing authenticated local gate", () => {
    assert.equal(
        DEFAULT_RESEARCH_ARTIFACTS.some((entry) => (
            entry.outputName === "2026-05-07-bidking-inverse-tail-authenticated-local-shadow-replay-gate-report.md"
        )),
        true
    );
    assert.equal(
        DEFAULT_RESEARCH_ARTIFACTS.some((entry) => (
            entry.outputName === "2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.md"
        )),
        true
    );
    assert.equal(
        DEFAULT_RESEARCH_ARTIFACTS.some((entry) => (
            entry.outputName === "2026-05-09-bidking-authenticated-schema-backed-table-report.md"
        )),
        true
    );
    assert.equal(
        DEFAULT_RESEARCH_ARTIFACTS.some((entry) => (
            entry.outputName === "2026-05-09-bidking-authenticated-table-reference-integrity-report.md"
        )),
        true
    );
    assert.equal(
        DEFAULT_RESEARCH_ARTIFACTS.some((entry) => (
            entry.outputName === "2026-05-09-bidking-authenticated-missing-item-resolution-candidate-report.md"
        )),
        true
    );
});

test("buildStaticReviewPages clears stale published research artifacts before writing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-static-research-stale-"));
    const outputDir = path.join(tempDir, "dist");
    const stalePath = path.join(outputDir, "research", "old-local-scan.json");
    fs.mkdirSync(path.dirname(stalePath), { recursive: true });
    fs.writeFileSync(stalePath, "{\"stale\":true}\n", "utf8");

    buildStaticReviewPages({
        outputDir,
        reviewPages: [],
        researchArtifacts: []
    });

    assert.equal(fs.existsSync(stalePath), false);
    assert.equal(fs.existsSync(path.join(outputDir, "research", "index.html")), true);
});
