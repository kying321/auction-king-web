const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("front page uses Chinese task header and decision-first shell", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    const appJs = fs.readFileSync(path.join(__dirname, "..", "src", "browser", "app.js"), "utf8");

    assert.match(html, /竞拍决策台/);
    assert.doesNotMatch(html, /Auction King/);
    assert.doesNotMatch(html, /Manual Template/);
    assert.match(html, /id="workspace-form"/);
    assert.match(html, /id="probability-section"/);
    assert.match(html, /id="valuation-section"/);
    assert.match(html, /id="grid-section"/);
    assert.match(html, /workspace-command-header/);
    assert.match(html, /workspace-context-strip/);
    assert.match(html, /workspace-utility-actions/);
    assert.match(html, /class="workspace-header-nav"/);
    assert.match(html, /class="workspace-header-brief-panel workspace-brief-strip"/);
    assert.match(html, /WORKBENCH BRIEF/);
    assert.match(html, /id="btn-theme-toggle"/);
    assert.match(html, /href="research\/"[\s\S]*研究/);
    assert.match(html, /id="btn-config"[^>]+href="tools\.html"/);
    assert.doesNotMatch(html, /class="workspace-header-meta"/);
    assert.doesNotMatch(html, /class="workspace-header-brief"/);
    assert.doesNotMatch(html, /workspace-brief-popover/);
    assert.match(html, /workspace-context-strip[\s\S]*workspace-header-brief-panel workspace-brief-strip[\s\S]*workspace-header-nav[\s\S]*id="template_select"/);
    assert.match(html, /workspace-context-strip[\s\S]*id="map_select"/);
    assert.match(html, /workspace-context-strip[\s\S]*workspace-utility-actions/);
    assert.doesNotMatch(html, /workspace-toolbar-grid[\s\S]*id="template_select"/);
    assert.match(html, /class="workspace-panel-heading"/);
    assert.match(html, /workspace-result-shell/);
    assert.match(html, /class="workspace-toolbar-topline"/);
    assert.match(html, /class="workspace-report-stack"/);
    assert.doesNotMatch(html, /先收集可验证观测，再看后验与估值/);
    assert.match(html, /id="btn-save-clipboard-screenshot"[\s\S]*截图后保存/);
    assert.match(html, /id="btn-save-clipboard-screenshot"[\s\S]*id="btn-organize-chain"[\s\S]*整理链路/);
    assert.doesNotMatch(html, /id="btn-save-screenshot-clear"/);
    assert.doesNotMatch(html, /id="workspace-screenshot-clear-file"/);
    assert.match(html, /id="btn-clear"[\s\S]*id="btn-save-clipboard-screenshot"/);
    assert.match(html, /id="more-fields-search"/);
    assert.match(html, /id="more-fields-summary-meta"/);
    assert.match(html, /id="more-fields-filter-all"/);
    assert.match(html, /id="more-fields-filter-constraint"/);
    assert.doesNotMatch(html, /id="calibration-panel"/);
    assert.doesNotMatch(html, /图鉴权威校准/);
    assert.doesNotMatch(html, /id="config-modal"/);
    assert.match(html, /橙色数量后验/);
    assert.match(html, /红色数量后验/);
    assert.match(html, /出价判断/);
    assert.match(html, /id="orange-confidence-note"/);
    assert.match(html, /id="red-confidence-note"/);
    assert.match(html, /id="posterior-risk-note"/);
    assert.match(html, /class="posterior-bar-list"/);
    assert.doesNotMatch(html, /<script src=/);
    assert.match(html, /<script type="module" src="src\/browser\/app\.js\?v=/);
    assert.match(html, /src\/browser\/result_panel_runtime\.js\?v=/);
    assert.match(html, /src\/browser\/sample_dataset\.js\?v=/);
    assert.match(html, /src\/core\/source_data_runtime\.js\?v=/);
    assert.match(html, /src\/core\/authority_calibration_runtime\.js\?v=/);
    assert.match(html, /src\/browser\/numeric_input_runtime\.js\?v=/);
    assert.match(html, /src\/browser\/config_editor_runtime\.js\?v=/);
    assert.match(html, /src\/browser\/field_panel_runtime\.js\?v=/);
    assert.match(packageJson.scripts["build:static"], /cp -R src dist\/src/);
    assert.match(packageJson.scripts["build:static"], /tools\.html/);
    assert.match(packageJson.scripts["build:static"], /scripts\/build_static_review_pages\.js/);
    assert.match(packageJson.scripts["build:static"], /robots\.txt/);
    assert.match(packageJson.scripts["build:static"], /sitemap\.xml/);
    assert.match(packageJson.scripts["check:js"], /src\/browser\/result_panel_runtime\.js/);
    assert.match(packageJson.scripts["check:js"], /src\/browser\/sample_dataset\.js/);
    assert.match(packageJson.scripts["check:js"], /src\/core\/source_data_runtime\.js/);
    assert.match(packageJson.scripts["check:js"], /src\/browser\/numeric_input_runtime\.js/);
    assert.match(packageJson.scripts["check:js"], /src\/browser\/config_editor_runtime\.js/);
    assert.match(packageJson.scripts["check:js"], /src\/browser\/field_panel_runtime\.js/);
    assert.match(appJs, /window\.AK_ROLE_STRATEGY_RUNTIME \? window\.AK_ROLE_STRATEGY_RUNTIME : \{\}/);
});

test("front page exposes release SEO metadata", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const sitemap = fs.readFileSync(path.join(__dirname, "..", "sitemap.xml"), "utf8");

    assert.match(html, /<title>竞拍之王｜沉船竞拍决策台<\/title>/);
    assert.match(html, /<meta name="description" content="竞拍之王沉船决策台/);
    assert.match(html, /<link rel="canonical" href="https:\/\/ak\.fuuu\.fun\/">/);
    assert.match(html, /property="og:title" content="竞拍之王｜沉船竞拍决策台"/);
    assert.match(html, /name="twitter:card" content="summary"/);
    assert.match(html, /type="application\/ld\+json"/);
    assert.match(html, /"@type": "WebApplication"/);
    assert.match(sitemap, /https:\/\/ak\.fuuu\.fun\/research\//);
});

test("static deployment artifact mirrors the front page command surface when present", () => {
    const rootIndex = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const rootCss = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
    const distIndexPath = path.join(__dirname, "..", "dist", "index.html");
    const distCssPath = path.join(__dirname, "..", "dist", "style.css");

    if (!fs.existsSync(distIndexPath) || !fs.existsSync(distCssPath)) return;

    const distIndex = fs.readFileSync(distIndexPath, "utf8");
    const distCss = fs.readFileSync(distCssPath, "utf8");
    const rootStyleVersion = rootIndex.match(/style\.css\?v=(\d+)/)?.[1];

    assert.ok(rootStyleVersion);
    assert.match(distIndex, new RegExp(`style\\.css\\?v=${rootStyleVersion}`));
    assert.equal(fs.existsSync(path.join(__dirname, "..", "dist", "research", "index.html")), true);
    assert.match(distIndex, /workspace-context-strip[\s\S]*workspace-utility-actions/);
    assert.doesNotMatch(distIndex, /workspace-utility-actions[\s\S]*workspace-context-strip/);
    assert.equal(distCss, rootCss);
});

test("advanced tools page owns config and authority calibration surfaces", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "tools.html"), "utf8");

    assert.match(html, /高级配置与图鉴校准/);
    assert.match(html, /href="index\.html"/);
    assert.match(html, /href="research\/"[\s\S]*研究/);
    assert.match(html, /id="config-modal"/);
    assert.match(html, /id="btn-config-view-structured"/);
    assert.match(html, /id="btn-config-view-baseline"/);
    assert.match(html, /id="btn-config-view-overrides"/);
    assert.match(html, /id="btn-config-import"/);
    assert.match(html, /id="btn-config-export"/);
    assert.match(html, /id="calibration-panel"/);
    assert.match(html, /id="btn-calibration-mode-draft"/);
    assert.match(html, /id="btn-calibration-mode-apply"/);
    assert.match(html, /id="btn-calibration-apply-draft"/);
    assert.match(html, /id="btn-calibration-reset-authority"/);
    assert.match(html, /id="calibration-sample-meta"/);
    assert.match(html, /id="btn-calibration-import-samples"/);
    assert.match(html, /id="btn-calibration-export-samples"/);
    assert.match(html, /id="btn-calibration-capture-sample"/);
    assert.match(html, /id="btn-calibration-export-authority-samples"/);
    assert.match(html, /id="btn-calibration-export-current-map-authority-samples"/);
    assert.match(html, /id="btn-calibration-export-filtered-replay-samples"/);
    assert.match(html, /id="btn-calibration-export-filtered-authority-samples"/);
    assert.match(html, /id="btn-calibration-clear-samples"/);
    assert.match(html, /id="calibration-sample-review"/);
    assert.match(html, /id="calibration-alpha-grid"/);
    assert.match(html, /id="calibration-value-grid"/);
    assert.match(html, /id="calibration-cells-grid"/);
    assert.match(html, /id="role-decision-panel"/);
    assert.match(html, /id="role-strategy-select"/);
    assert.match(html, /id="role-strategy-summary"/);
    assert.match(html, /id="role-cap-steady"/);
    assert.match(html, /role_strategy\.js\?v=\d+/);
    assert.match(html, /图鉴权威校准/);
    assert.doesNotMatch(html, /runtime-support-hidden/);
    assert.doesNotMatch(html, /id="workspace-form"/);
    assert.doesNotMatch(html, /id="template-groups"/);
    assert.doesNotMatch(html, /id="probability-section"/);
    assert.doesNotMatch(html, /id="valuation-section"/);
    assert.doesNotMatch(html, /id="grid-section"/);
});

test("advanced tools page groups calibration commands by workflow instead of one flat button wall", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "tools.html"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(html, /id="calibration-panel" class="glass workspace-toolbar calibration-panel"/);
    assert.match(html, /class="workspace-toolbar-actions calibration-primary-actions"[\s\S]*data-action-group="samples"[\s\S]*id="btn-calibration-capture-sample"[\s\S]*id="btn-calibration-export-samples"/);
    assert.match(html, /class="calibration-actions calibration-secondary-actions"[\s\S]*<details class="calibration-action-group" data-action-group="workspace"/);
    assert.match(html, /data-action-group="workspace"[\s\S]*id="btn-calibration-apply-draft"[\s\S]*id="btn-calibration-reset-authority"/);
    assert.match(html, /data-action-group="drafts"[\s\S]*id="btn-calibration-import-draft"[\s\S]*id="btn-calibration-export-applied"/);
    assert.match(html, /data-action-group="authority"[\s\S]*id="btn-calibration-export-filtered-replay-samples"[\s\S]*id="btn-calibration-export-authority-samples"/);
    assert.match(html, /data-action-group="danger"[\s\S]*id="btn-calibration-clear-samples"/);
    assert.match(css, /\.calibration-secondary-actions\s*\{[\s\S]*display:\s*grid;/);
    assert.match(css, /\.calibration-secondary-actions\s*\{[\s\S]*minmax\(160px,\s*1fr\)/);
    assert.match(css, /\.calibration-primary-actions\s*\{[\s\S]*align-items:\s*stretch;/);
    assert.match(css, /\.calibration-action-group\s*\{[\s\S]*display:\s*grid;/);
    assert.match(css, /\.calibration-action-group\.danger\s*\{[\s\S]*border-color:\s*rgba\(185, 28, 28, 0\.28\);/);
});

test("structured config modal uses a bounded editor well instead of one long scroll wall", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "tools.html"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(html, /class="config-json-details"/);
    assert.match(html, /class="config-json-summary"/);
    assert.match(css, /\.workspace-config-modal\s*\{[\s\S]*overflow:\s*hidden;/);
    assert.match(css, /\.config-editor-controls\s*\{[\s\S]*max-height:\s*min\(58vh,\s*640px\);[\s\S]*overflow-y:\s*auto;/);
    assert.match(css, /\.config-actions\s*\{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;/);
    assert.match(css, /\.workspace-config-modal\s+\.code-editor\s*\{[\s\S]*min-height:\s*140px;[\s\S]*max-height:\s*22vh;/);
});

test("mobile config modal keeps action buttons in a compact two-column rail", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.config-actions\s*\{[\s\S]*flex-direction:\s*row;[\s\S]*align-items:\s*stretch;/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.config-actions\s+\.btn\s*\{[\s\S]*flex:\s*1 1 calc\(50% - 0\.35rem\);/);
});

test("config modal keeps close affordance and dark active tabs visually legible", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /body\[data-theme="dark"\]\s+\.config-view-btn\.active\s*\{[\s\S]*background:\s*var\(--bg-emphasis\);[\s\S]*border-color:\s*var\(--bg-emphasis\);/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspace-config-modal\s+\.modal-header-row\s*\{[\s\S]*flex-direction:\s*row;[\s\S]*align-items:\s*flex-start;/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspace-config-modal\s+\.close-btn\s*\{[\s\S]*margin-left:\s*auto;[\s\S]*flex:\s*0 0 auto;/);
});

test("mobile css promotes result stack ahead of inputs", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.workspace-result-panel\s*\{\s*order:\s*-1;/);
    assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.workspace-input-panel\s*\{\s*order:\s*0;/);
    assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.tools-dashboard\s+\.workspace-result-panel\s*\{\s*order:\s*0;/);
});

test("phone css keeps input rail before the tall result rail", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspace-dashboard\s+\.workspace-input-panel\s*\{\s*order:\s*0;/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspace-dashboard\s+\.workspace-result-panel\s*\{\s*order:\s*1;/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.tools-dashboard\s+\.workspace-result-panel\s*\{\s*order:\s*0;/);
});

test("mobile css keeps the grid summary horizontally scrollable instead of forcing wrapped cells", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /\.visual-section\s*\{[\s\S]*overflow-x:\s*auto;/);
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.grid-table\s*\{\s*min-width:\s*520px;/);
});

test("widescreen css keeps input and result rails close enough to scan together", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /\.workspace-dashboard\s*\{[\s\S]*minmax\(392px,\s*0\.9fr\)\s+minmax\(0,\s*1\.1fr\)/);
    assert.match(css, /@media \(min-width: 1500px\)[\s\S]*\.workspace-dashboard\s*\{[\s\S]*minmax\(420px,\s*0\.82fr\)\s+minmax\(840px,\s*1\.18fr\)/);
});

test("posterior layout no longer carries inline top-summary pill styles", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.doesNotMatch(css, /\.posterior-inline-summary\b/);
    assert.doesNotMatch(css, /\.posterior-inline-pill\b/);
});

test("primary stylesheet no longer ships removed OCR, role, or inference layers", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.doesNotMatch(css, /\.scan-section\b/);
    assert.doesNotMatch(css, /\.settlement-item-row\b/);
    assert.doesNotMatch(css, /\.inference-graph-header\b/);
    assert.doesNotMatch(css, /\.role-card\b/);
});

test("primary stylesheet preserves the published warm shell and dark palette", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /--ui-scale:\s*0\.9;/);
    assert.match(css, /html\s*\{[\s\S]*font-size:\s*90%;/);
    assert.match(css, /\.app-container\s*\{[\s\S]*transform:\s*scale\(var\(--ui-scale\)\);[\s\S]*transform-origin:\s*top center;/);
    assert.match(css, /--bg-base:\s*#f6f0e6;/);
    assert.match(css, /--accent-primary:\s*#8e5c36;/);
    assert.match(css, /body\[data-theme="dark"\][\s\S]*--bg-base:\s*#11100e;/);
    assert.match(css, /\.app-background\s*\{[\s\S]*radial-gradient\(circle at 18% 14%/);
    assert.match(css, /linear-gradient\(180deg,\s*#f9f4eb/);
    assert.match(css, /body\[data-theme="dark"\]\s+\.app-background\s*\{[\s\S]*linear-gradient\(180deg,\s*#11100e/);
});

test("primary stylesheet keeps the current published visual palette while adding only the command-band layout", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /--radius-xl:\s*28px;/);
    assert.match(css, /--radius-lg:\s*22px;/);
    assert.match(css, /\.workspace-title-block h1\s*\{[\s\S]*font-size:\s*2\.4rem;/);
    assert.match(css, /\.workspace-report-stack\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*box-shadow:\s*none;/);
    assert.match(css, /\.workspace-toolbar-actions\s*\{[\s\S]*display:\s*flex;/);
});

test("density pass trims frames and whitespace without changing type scale", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /\.app-container\s*\{[\s\S]*padding:\s*1\.45rem 1\.8rem 1\.8rem;/);
    assert.match(css, /\.workspace-shell\s*\{[\s\S]*gap:\s*0\.9rem;/);
    assert.match(css, /\.workspace-context-strip\s*\{[\s\S]*gap:\s*0\.42rem;[\s\S]*padding:\s*0\.36rem 0\.42rem;[\s\S]*box-shadow:\s*none;/);
    assert.match(css, /\.workspace-toolbar\s*\{[\s\S]*padding:\s*0\.7rem 0\.78rem;[\s\S]*gap:\s*0\.55rem;/);
    assert.match(css, /\.compute-actions,\s*[\r\n]+\.workspace-compute-meta\s*\{[\s\S]*padding:\s*0\.58rem 0 0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;[\s\S]*border-top:\s*1px solid rgba\(111, 91, 69, 0\.10\);/);
    assert.match(css, /\.mega-card,\s*[\r\n]+\.valuation-card,\s*[\r\n]+\.visual-section\s*\{[\s\S]*padding:\s*0\.92rem 1rem;[\s\S]*border-radius:\s*var\(--radius-lg\);/);
    assert.match(css, /\.posterior-risk-note\s*\{/);
    assert.match(css, /\.workspace-title-block h1\s*\{[\s\S]*font-size:\s*2\.4rem;/);
    assert.match(css, /\.workspace-header-nav select\s*\{[\s\S]*font-size:\s*0\.88rem;/);
    assert.match(css, /\.input-row input,[\s\S]*\.code-editor\s*\{[\s\S]*font-size:\s*0\.92rem;/);
});

test("header command surface balances brief selectors and utilities in one band", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /\.workspace-command-header\s*\{[\s\S]*display:\s*grid;/);
    assert.match(css, /\.workspace-command-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px,\s*0\.26fr\)\s+minmax\(0,\s*1fr\);/);
    assert.match(css, /\.workspace-context-strip\s*\{[\s\S]*grid-template-columns:\s*minmax\(420px,\s*0\.92fr\)\s+minmax\(460px,\s*1fr\)\s+max-content;/);
    assert.match(css, /\.workspace-context-strip\s+\.workspace-utility-actions\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;/);
    assert.match(css, /\.workspace-context-strip\s+\.workspace-header-nav\s*\{[\s\S]*grid-template-columns:\s*minmax\(240px,\s*1\.1fr\)\s+minmax\(180px,\s*0\.9fr\);/);
    assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.workspace-context-strip\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;/);
});

test("desktop command strip expands brief copy and keeps pill controls on one line", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /\.workspace-brief-strip\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);/);
    assert.match(css, /\.workspace-brief-strip\s+\.workspace-brief-copy\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;[\s\S]*white-space:\s*normal;/);
    assert.match(css, /\.workspace-brief-strip\s+\.workspace-brief-pills\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;[\s\S]*justify-content:\s*flex-start;[\s\S]*justify-self:\s*start;/);
    assert.doesNotMatch(css, /\.workspace-brief-strip\s+\.workspace-brief-copy\s*\{[\s\S]*text-overflow:\s*ellipsis;/);
    assert.match(css, /\.workspace-header-status\s*\{[\s\S]*white-space:\s*nowrap;/);
    assert.match(css, /\.btn\s*\{[\s\S]*white-space:\s*nowrap;/);
    assert.match(css, /\.workspace-toolbar-note\s*\{[\s\S]*max-width:\s*none;[\s\S]*text-align:\s*left;/);
    assert.match(css, /\.workspace-panel-heading\s*>\s*p\s*\{[\s\S]*max-width:\s*min\(720px,\s*68%\);/);
});

test("half-width header stacks before command strip can overflow under 90-percent browser zoom", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /@media \(max-width: 1600px\)[\s\S]*\.workspace-command-header\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
    assert.match(css, /@media \(max-width: 1600px\)[\s\S]*\.workspace-command-header\s+\.workspace-title-block\s*\{[\s\S]*max-width:\s*none;/);
    assert.match(css, /@media \(max-width: 1600px\)[\s\S]*\.workspace-context-strip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s+minmax\(320px,\s*1fr\)\s+max-content;/);
    assert.match(css, /@media \(max-width: 1180px\)[\s\S]*\.workspace-context-strip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});

test("tools page uses compact homepage-like calibration cards and decimal-friendly number fields", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "tools.html"), "utf8");
    const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

    assert.match(css, /\.tools-dashboard\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.45fr\)\s+minmax\(280px,\s*0\.55fr\);/);
    assert.match(css, /\.calibration-meta-card\s*\{[\s\S]*border-radius:\s*14px;[\s\S]*padding:\s*0\.5rem 0\.6rem;/);
    assert.match(css, /\.calibration-grid-shell\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(300px,\s*1fr\)\);/);
    assert.match(css, /\.calibration-grid-card\s*\{[\s\S]*border-radius:\s*14px;[\s\S]*background:\s*var\(--bg-panel\);[\s\S]*padding:\s*0\.58rem 0\.62rem;/);
    assert.match(css, /\.calibration-grid-heading\s*\{[\s\S]*letter-spacing:\s*0\.08em;/);
    assert.match(css, /\.calibration-grid input,\s*[\s\S]*\.calibration-grid select\s*\{[\s\S]*border-radius:\s*var\(--radius-md\);[\s\S]*background:\s*var\(--bg-panel-strong\);/);
    assert.match(css, /\.calibration-grid input\[type="file"\]::file-selector-button\s*\{[\s\S]*border-radius:\s*var\(--radius-sm\);/);
    assert.match(css, /\.calibration-grid-readonly\s*\{[\s\S]*border-radius:\s*var\(--radius-md\);/);
    assert.match(css, /\.calibration-grid input\[data-numeric-input\]/);
    assert.match(css, /\.config-map-quality-cell input\[data-numeric-input\]/);
    assert.match(html, /价值基线：图鉴均值 \/ 标准差/);
    assert.match(css, /::-webkit-outer-spin-button/);
});
