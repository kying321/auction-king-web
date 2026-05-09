const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, "dist");
const DEFAULT_REVIEW_IMAGE_ROOT = path.join(ROOT_DIR, "tmp_capture_review");
const STATIC_ASSET_VERSION = "20260508020400";
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
const DEFAULT_RESEARCH_ARTIFACTS = [
    {
        label: "逆值尾部 shadow replay gate",
        description: "记录 inverse-tail 候选仍停留在诊断影子态，默认配置和提升门保持关闭。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-07-bidking-inverse-tail-authenticated-local-shadow-replay-gate-report.md"),
        outputName: "2026-05-07-bidking-inverse-tail-authenticated-local-shadow-replay-gate-report.md"
    },
    {
        label: "逆值尾部 shadow replay gate JSON",
        description: "同一 gate 的结构化源数据，供网页端审计或下载。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-07-bidking-inverse-tail-authenticated-local-shadow-replay-gate-report.json"),
        outputName: "2026-05-07-bidking-inverse-tail-authenticated-local-shadow-replay-gate-report.json"
    },
    {
        label: "Authenticated + local source recovery scan",
        description: "Steam/本地候选源扫描结果：1106013 Item.txt 权威行仍未恢复。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-07-bidking-authenticated-and-local-source-recovery-scan.md"),
        outputName: "2026-05-07-bidking-authenticated-and-local-source-recovery-scan.md"
    },
    {
        label: "Steam selective table download runner",
        description: "DepotDownloader 尝试与凭据脱敏输出；不记录密码、token 或 2FA。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-07-bidking-authenticated-steam-table-download-runner-report.md"),
        outputName: "2026-05-07-bidking-authenticated-steam-table-download-runner-report.md"
    },
    {
        label: "Steam depot table acquisition attempt",
        description: "记录已认证下载的 full-client 表文件状态，以及 1106013 Item.txt 行仍缺失的阻塞。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.md"),
        outputName: "2026-05-07-bidking-steam-depot-table-acquisition-attempt-report.md"
    },
    {
        label: "Authenticated schema-backed table report",
        description: "Base64 解码后的 authenticated Item/Drop 表进入 schema-backed 解析链。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-09-bidking-authenticated-schema-backed-table-report.md"),
        outputName: "2026-05-09-bidking-authenticated-schema-backed-table-report.md"
    },
    {
        label: "Authenticated schema-backed table JSON",
        description: "authenticated schema-backed 表解析的结构化源数据。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-09-bidking-authenticated-schema-backed-table-report.json"),
        outputName: "2026-05-09-bidking-authenticated-schema-backed-table-report.json"
    },
    {
        label: "Authenticated reference integrity",
        description: "authenticated full-client 表完整性审计：项目相关缺口仍为 1106013。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-09-bidking-authenticated-table-reference-integrity-report.md"),
        outputName: "2026-05-09-bidking-authenticated-table-reference-integrity-report.md"
    },
    {
        label: "Authenticated reference integrity JSON",
        description: "authenticated 表引用完整性审计的结构化源数据。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-09-bidking-authenticated-table-reference-integrity-report.json"),
        outputName: "2026-05-09-bidking-authenticated-table-reference-integrity-report.json"
    },
    {
        label: "Authenticated missing item candidate",
        description: "1106013 的族谱、Drop 1066 反比曲线和非权威推断边界。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-09-bidking-authenticated-missing-item-resolution-candidate-report.md"),
        outputName: "2026-05-09-bidking-authenticated-missing-item-resolution-candidate-report.md"
    },
    {
        label: "Authenticated missing item candidate JSON",
        description: "1106013 非权威曲线诊断与门控状态的结构化源数据。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-09-bidking-authenticated-missing-item-resolution-candidate-report.json"),
        outputName: "2026-05-09-bidking-authenticated-missing-item-resolution-candidate-report.json"
    },
    {
        label: "样本补采队列",
        description: "列出当前仍需补采的 sunken_ship 与 villa 同战样本。",
        sourcePath: path.join(ROOT_DIR, "docs", "research", "2026-05-07-bidking-inverse-tail-sample-acquisition-queue.md"),
        outputName: "2026-05-07-bidking-inverse-tail-sample-acquisition-queue.md"
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

function safeOutputName(value) {
    const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.includes("..")) return null;
    return normalized;
}

function formatResearchIndexHtml({ artifacts = [], generatedAt = new Date().toISOString(), assetVersion = STATIC_ASSET_VERSION } = {}) {
    const cards = artifacts.map((artifact) => `<a class="research-card" href="${escapeHtml(artifact.href)}">
                <span class="research-label">${escapeHtml(artifact.label)}</span>
                <span class="research-description">${escapeHtml(artifact.description || "")}</span>
                <span class="research-path">${escapeHtml(artifact.href)}</span>
            </a>`).join("\n");
    const artifactCards = artifacts.map((artifact) => `<a class="research-artifact-card" href="${escapeHtml(artifact.href)}">
                            <span class="research-artifact-label">${escapeHtml(artifact.label)}</span>
                            <span class="research-artifact-description">${escapeHtml(artifact.description || "")}</span>
                            <span class="research-artifact-path">${escapeHtml(artifact.href)}</span>
                        </a>`).join("\n");
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" href="data:,">
    <title>BidKing 研究状态</title>
    <link rel="stylesheet" href="../style.css?v=${escapeHtml(assetVersion)}">
</head>
<body class="research-page">
<div class="app-background"></div>
<div class="app-container">
    <div class="workspace-shell research-shell">
        <header class="app-header workspace-header workspace-command-header">
            <div class="workspace-title-block">
                <p class="workspace-kicker">Research Rail</p>
                <h1>BidKing 研究状态</h1>
                <p class="workspace-subtitle">反编译证据、公开源扫描和影子回放门控集中在这里，只读发布。</p>
            </div>
            <div class="workspace-context-strip">
                <div class="workspace-header-brief-panel workspace-brief-strip">
                    <p class="workspace-brief-kicker">SOURCE BRIEF</p>
                    <p class="workspace-brief-copy">1106013 缺口未闭合；逆值尾部曲线继续停留在 research-only 与 shadow gate。</p>
                    <div class="workspace-brief-pills">
                        <span>research-only</span>
                        <span>default config unchanged</span>
                    </div>
                </div>
                <div class="research-summary-grid">
                    <div class="research-summary-card">
                        <span class="research-summary-label">产物数量</span>
                        <span class="research-summary-value">${escapeHtml(artifacts.length)}</span>
                    </div>
                    <div class="research-summary-card">
                        <span class="research-summary-label">生成时间</span>
                        <span class="research-summary-note">${escapeHtml(generatedAt)}</span>
                    </div>
                </div>
                <div class="workspace-utility-actions">
                    <div class="workspace-header-status"><span class="status-dot"></span><span>门控关闭</span></div>
                    <a class="btn secondary small-btn" href="../">决策台</a>
                    <a class="btn secondary small-btn" href="../tools.html">高级</a>
                </div>
            </div>
        </header>
        <main class="workspace-dashboard research-dashboard">
            <section class="sequence-panel workspace-input-panel">
                <div class="workspace-panel-heading">
                    <div>
                        <p class="workspace-panel-kicker">Evidence Rail</p>
                        <h2>研究产物</h2>
                    </div>
                    <p>只发布安全白名单内的报告、门控和补采队列。</p>
                </div>
                <div class="glass workspace-toolbar">
                    <div class="workspace-toolbar-topline">
                        <span class="workspace-toolbar-kicker">Authority Gate</span>
                        <span class="workspace-toolbar-note">1106013 的权威 Item.txt 行未恢复前，不进入默认配置、权威交接或正式提升。</span>
                    </div>
                    <div class="workspace-toolbar-actions">
                        <span class="btn secondary small-btn">shadow-only</span>
                        <span class="btn secondary small-btn">fail-closed</span>
                    </div>
                </div>
                <div class="research-artifact-grid">
                    ${artifactCards || cards || "<p class=\"research-note\">暂无研究产物。</p>"}
                </div>
            </section>
            <aside class="report-panel workspace-result-panel">
                <div class="workspace-panel-heading">
                    <div>
                        <p class="workspace-panel-kicker">Decision Rail</p>
                        <h2>算法门控</h2>
                    </div>
                </div>
                <div class="workspace-report-stack">
                    <div class="glass workspace-toolbar">
                        <div class="workspace-toolbar-topline">
                            <span class="workspace-toolbar-kicker">结论</span>
                            <span class="workspace-toolbar-note">当前默认参数不吸收 BidKing 逆值尾部候选。</span>
                        </div>
                        <p class="research-note">公开源与本地扫描尚未恢复关键权威行，现有候选只能用于影子回放和补采决策。</p>
                    </div>
                    <div class="glass workspace-toolbar">
                        <div class="workspace-toolbar-topline">
                            <span class="workspace-toolbar-kicker">下一步</span>
                            <span class="workspace-toolbar-note">补齐同战样本后再对数量先验、格数分布和价值尾部做 OOS replay。</span>
                        </div>
                        <p class="research-note">任何权重提升必须经过 source artifact、回放门控和默认配置漂移检查。</p>
                    </div>
                </div>
            </aside>
        </main>
    </div>
</div>
</body>
</html>
`;
}

function copyResearchArtifact(artifact, { outputDir = DEFAULT_OUTPUT_DIR } = {}) {
    if (!artifact || !artifact.sourcePath || !fs.existsSync(artifact.sourcePath)) return null;
    const outputName = safeOutputName(artifact.outputName || path.basename(artifact.sourcePath));
    if (!outputName) return null;
    const targetPath = path.join(outputDir, "research", outputName);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(artifact.sourcePath, targetPath);
    return {
        label: artifact.label || outputName,
        description: artifact.description || "",
        source_path: artifact.sourcePath,
        output_path: targetPath,
        href: outputName
    };
}

function buildStaticReviewPages({
    outputDir = DEFAULT_OUTPUT_DIR,
    reviewImageRoot = DEFAULT_REVIEW_IMAGE_ROOT,
    reviewPages = DEFAULT_REVIEW_PAGES,
    researchArtifacts = DEFAULT_RESEARCH_ARTIFACTS,
    generatedAt = new Date().toISOString()
} = {}) {
    const reviewDir = path.join(outputDir, "review");
    const researchDir = path.join(outputDir, "research");
    ensureDir(reviewDir);
    fs.rmSync(researchDir, { recursive: true, force: true });
    ensureDir(researchDir);

    const copiedPages = [];
    const copiedImages = [];
    const seenImages = new Set();
    const skippedPages = [];
    const copiedResearchArtifacts = [];
    const skippedResearchArtifacts = [];

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

    researchArtifacts.forEach((artifact) => {
        const copied = copyResearchArtifact(artifact, { outputDir });
        if (copied) {
            copiedResearchArtifacts.push(copied);
        } else {
            skippedResearchArtifacts.push({
                label: artifact ? artifact.label : "",
                source_path: artifact ? artifact.sourcePath : null,
                reason: "missing_or_invalid_source"
            });
        }
    });

    const researchIndexPath = path.join(researchDir, "index.html");
    fs.writeFileSync(researchIndexPath, formatResearchIndexHtml({
        artifacts: copiedResearchArtifacts,
        generatedAt
    }), "utf8");

    return {
        schema_version: "ak_static_review_pages_build_v1",
        generated_at: generatedAt,
        change_class: "SIM_ONLY + static deploy",
        outputs: {
            review_index: indexPath,
            review_dir: reviewDir,
            research_index: researchIndexPath,
            research_dir: researchDir
        },
        summary: {
            review_page_count: copiedPages.length,
            review_image_count: copiedImages.length,
            skipped_page_count: skippedPages.length,
            research_artifact_count: copiedResearchArtifacts.length,
            skipped_research_artifact_count: skippedResearchArtifacts.length
        },
        pages: copiedPages,
        images: copiedImages,
        research_artifacts: copiedResearchArtifacts,
        skipped_pages: skippedPages,
        skipped_research_artifacts: skippedResearchArtifacts
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
    DEFAULT_RESEARCH_ARTIFACTS,
    DEFAULT_REVIEW_IMAGE_ROOT,
    DEFAULT_REVIEW_PAGES,
    buildStaticReviewPages,
    extractReviewImageRefs,
    formatResearchIndexHtml,
    formatReviewIndexHtml,
    main
};
