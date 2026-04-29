const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, "dist");
const DEFAULT_REVIEW_IMAGE_ROOT = path.join(ROOT_DIR, "tmp_capture_review");
const DEFAULT_REVIEW_PAGES = [
    {
        label: "P0 手动复核",
        description: "高优先级复核样本。只在人工确认并下载 JSON 后进入校准链。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p0-manual-count-confirmation-results.html"),
        outputName: "p0-manual-count-confirmation-results.html"
    },
    {
        label: "P1 手动复核",
        description: "当前主线复核样本。候选仅辅助，不会自动变成权威样本。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-04-27-sunken-ship-p1-manual-count-confirmation-results.html"),
        outputName: "p1-manual-count-confirmation-results.html"
    },
    {
        label: "P2 最新截图复核",
        description: "低优先级新截图样本。空闲时补全六品质实际数量，下载后再进入校准候选。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-04-28-sunken-ship-p2-manual-count-confirmation-results.html"),
        outputName: "p2-manual-count-confirmation-results.html"
    }
];

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function commandPath(filePath) {
    const relative = path.relative(ROOT_DIR, path.resolve(filePath)).replace(/\\/g, "/");
    return relative && !relative.startsWith("..") ? relative : String(filePath);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function extractReviewImageRefs(html = "") {
    const refs = new Set();
    const regex = /(?:src|href)=["']\/tmp_capture_review\/([^"']+)["']/g;
    let match = regex.exec(html);
    while (match) {
        refs.add(match[1]);
        match = regex.exec(html);
    }
    return Array.from(refs).sort();
}

function copyReviewImage(ref, { reviewImageRoot = DEFAULT_REVIEW_IMAGE_ROOT, outputDir = DEFAULT_OUTPUT_DIR } = {}) {
    const normalizedRef = String(ref || "").replace(/^\/+/, "");
    if (!normalizedRef || normalizedRef.includes("..")) return null;
    const sourcePath = path.join(reviewImageRoot, normalizedRef);
    if (!fs.existsSync(sourcePath)) return null;
    const targetPath = path.join(outputDir, "tmp_capture_review", normalizedRef);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
    return {
        source_path: sourcePath,
        output_path: targetPath,
        public_path: `/tmp_capture_review/${normalizedRef}`
    };
}

function formatReviewIndexHtml({ pages = [], generatedAt = new Date().toISOString() } = {}) {
    const cards = pages.map((page) => `<a class="review-card" href="${escapeHtml(page.href)}">
                <span class="review-label">${escapeHtml(page.label)}</span>
                <span class="review-description">${escapeHtml(page.description || "")}</span>
                <span class="review-path">${escapeHtml(page.href)}</span>
            </a>`).join("\n");
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>Auction King Review</title>
    <style>
        :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body { margin: 0; background: #f6f7f9; color: #1f2328; }
        main { max-width: 920px; margin: 0 auto; padding: 18px; display: grid; gap: 14px; box-sizing: border-box; }
        h1, p { margin: 0; }
        .summary { display: flex; flex-wrap: wrap; gap: 8px; }
        .summary span { border: 1px solid #d0d7de; background: #fff; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
        .review-grid { display: grid; gap: 10px; }
        .review-card { display: grid; gap: 5px; text-decoration: none; color: inherit; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 12px; }
        .review-card:hover { border-color: #1f6feb; }
        .review-label { font-size: 15px; font-weight: 800; }
        .review-description { font-size: 13px; color: #57606a; }
        .review-path { font-size: 12px; color: #1f6feb; overflow-wrap: anywhere; }
    </style>
</head>
<body>
<main>
    <header>
        <h1>Auction King Review</h1>
        <div class="summary">
            <span>pages: ${escapeHtml(pages.length)}</span>
            <span>generated: ${escapeHtml(generatedAt)}</span>
            <span>review-only</span>
        </div>
    </header>
    <section class="review-grid">
        ${cards || "<p>暂无复核页。</p>"}
    </section>
</main>
</body>
</html>
`;
}

function buildStaticReviewPages({
    outputDir = DEFAULT_OUTPUT_DIR,
    reviewImageRoot = DEFAULT_REVIEW_IMAGE_ROOT,
    reviewPages = DEFAULT_REVIEW_PAGES,
    generatedAt = new Date().toISOString()
} = {}) {
    const reviewDir = path.join(outputDir, "review");
    ensureDir(reviewDir);

    const copiedPages = [];
    const copiedImages = [];
    const seenImages = new Set();
    const skippedPages = [];

    reviewPages.forEach((page) => {
        if (!fs.existsSync(page.sourcePath)) {
            skippedPages.push({
                label: page.label,
                source_path: page.sourcePath,
                reason: "missing_source_html"
            });
            return;
        }
        const html = fs.readFileSync(page.sourcePath, "utf8");
        const outputName = page.outputName || path.basename(page.sourcePath);
        const outputPath = path.join(reviewDir, outputName);
        ensureDir(path.dirname(outputPath));
        fs.copyFileSync(page.sourcePath, outputPath);

        extractReviewImageRefs(html).forEach((ref) => {
            if (seenImages.has(ref)) return;
            const copied = copyReviewImage(ref, { reviewImageRoot, outputDir });
            if (copied) {
                seenImages.add(ref);
                copiedImages.push(copied);
            }
        });

        copiedPages.push({
            label: page.label,
            description: page.description || "",
            source_path: page.sourcePath,
            output_path: outputPath,
            href: outputName
        });
    });

    const indexPath = path.join(reviewDir, "index.html");
    fs.writeFileSync(indexPath, formatReviewIndexHtml({
        pages: copiedPages,
        generatedAt
    }), "utf8");

    return {
        schema_version: "ak_static_review_pages_build_v1",
        generated_at: generatedAt,
        change_class: "SIM_ONLY + static deploy",
        outputs: {
            review_index: indexPath,
            review_dir: reviewDir
        },
        summary: {
            review_page_count: copiedPages.length,
            review_image_count: copiedImages.length,
            skipped_page_count: skippedPages.length
        },
        pages: copiedPages,
        images: copiedImages,
        skipped_pages: skippedPages
    };
}

function main() {
    const report = buildStaticReviewPages();
    process.stdout.write(`${report.outputs.review_index}\n`);
    return report;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_DIR,
    DEFAULT_REVIEW_IMAGE_ROOT,
    DEFAULT_REVIEW_PAGES,
    buildStaticReviewPages,
    extractReviewImageRefs,
    formatReviewIndexHtml,
    main
};
