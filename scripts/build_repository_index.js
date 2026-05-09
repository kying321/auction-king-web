const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const RESEARCH_DIR = path.join(DOCS_DIR, "research");

const IGNORED_DIRS = new Set([
    ".git",
    "dist",
    "node_modules",
    "output",
    "tmp_capture_review",
    "backups",
    "deploy_backups",
    "external"
]);

const REMOVED_FILES = [
    {
        file: "auction_king_config_example (1).json",
        reason: "Exact duplicate of auction_king_config_example.json; no references."
    },
    {
        file: "auction_king_config_example (2).json",
        reason: "Exact duplicate of auction_king_config_example.json; no references."
    }
];

const ROOT_COMPONENT_GROUPS = [
    {
        title: "Public web surface",
        purpose: "Static entrypoints and Cloudflare/static metadata.",
        files: ["index.html", "tools.html", "style.css", "_headers", "robots.txt", "sitemap.xml", "wrangler.toml"]
    },
    {
        title: "Browser UI runtime",
        purpose: "Page orchestration, workspace state, panels, and browser-only controls.",
        files: [
            "src/browser/app.js",
            "src/browser/dashboard_runtime.js",
            "src/browser/config_modal_state.js",
            "src/browser/numeric_input_runtime.js",
            "src/browser/config_editor_controls.js",
            "src/browser/config_editor_runtime.js",
            "src/browser/field_panel_runtime.js",
            "src/browser/workspace_runtime.js",
            "src/browser/result_panel_runtime.js",
            "src/browser/full_solver_runtime.js",
            "src/browser/full_solver_worker.js",
            "src/browser/role_strategy.js",
            "src/browser/sample_dataset.js"
        ]
    },
    {
        title: "Estimator and solver core",
        purpose: "Local estimation, probability, graph, and worker-backed solving.",
        files: [
            "src/core/estimator.js",
            "src/core/coarse_estimator.js",
            "src/core/inference_graph.js",
            "src/core/avg_probability_core.js",
            "src/core/avg_probability_tool.js",
            "src/core/primary_distribution_view.js"
        ]
    },
    {
        title: "Authority and calibration runtime",
        purpose: "Source-owned config, calibration overlays, replay scoring, and default bundle generation inputs.",
        files: [
            "src/core/default_config_bundle.js",
            "src/core/source_data_runtime.js",
            "src/core/authority_calibration_runtime.js",
            "src/core/calibration_override_runtime.js",
            "src/core/count_prior_tuner.js",
            "src/research/calibration_replay_report.js",
            "src/research/default_weight_implementation_report.js",
            "src/research/sample_count_replay.js",
            "src/research/sample_value_replay.js",
            "src/research/settlement_count_fit_readiness_report.js",
            "src/research/system_hint_coverage_report.js"
        ]
    },
    {
        title: "Catalog, OCR, and item value modeling",
        purpose: "Manual catalog, item matching, OCR parsing, and structural/value priors.",
        files: [
            "src/core/manual_item_catalog.js",
            "src/core/catalog_item_matcher.js",
            "src/core/catalog_structural_prior_runtime.js",
            "src/core/catalog_structural_prior_impact_runtime.js",
            "src/core/catalog_ocr_contour_runtime.js",
            "src/core/catalog_item_extraction_runtime.js",
            "src/core/ocr_runtime.js",
            "src/core/ocr_parser.js",
            "src/core/pixel_quality_analyzer.js"
        ]
    },
    {
        title: "Strategy and research report runtimes",
        purpose: "Producer strategy, purple/count/value fit reports, and guarded candidate modeling.",
        files: [
            "src/core/producer_count_prior_model.js",
            "src/core/producer_value_model.js",
            "src/core/r2_purple_mode.js",
            "src/research/producer_strategy_architecture_report.js",
            "src/research/producer_strategy_replay_diagnostics.js",
            "src/research/purple_weight_fit_report.js"
        ]
    },
    {
        title: "Legacy Python estimator tools",
        purpose: "Older local CLI estimator and family-calibration helpers retained because tests still cover them.",
        files: [
            "legacy/python/auction_king_sunken_ship_estimator.py",
            "legacy/python/auction_king_sunken_ship_realtime.py",
            "legacy/python/authority_source_runtime.py",
            "legacy/python/avg_display_semantics.py",
            "legacy/python/collection_family_config_io.py",
            "legacy/python/family_calibration_suggester.py",
            "legacy/python/suggest_family_calibration.py",
            "auction_king_README.md",
            "auction_king_sunken_ship_realtime_README.md",
            "auction_king_config_example.json",
            "auction_king_sunken_ship_realtime_config.json",
            "my_families.json",
            "family_calibration_template.csv"
        ]
    }
];

function walkFiles(dir, baseDir = dir) {
    if (!fs.existsSync(dir)) return [];
    const results = [];
    for (const entry of fs.readdirSync(dir).sort()) {
        if (IGNORED_DIRS.has(entry)) continue;
        const fullPath = path.join(dir, entry);
        const relative = path.relative(baseDir, fullPath);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...walkFiles(fullPath, baseDir));
        } else if (stat.isFile()) {
            results.push(relative.split(path.sep).join("/"));
        }
    }
    return results;
}

function readPackageJson() {
    return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
}

function existingFiles(files) {
    return files.filter((file) => fs.existsSync(path.join(ROOT_DIR, file)));
}

function formatBulletList(files) {
    if (!files.length) return "- `none`";
    return files.map((file) => `- \`${file}\``).join("\n");
}

function categorizeScript(name, command = "") {
    const value = `${name} ${command}`.toLowerCase().replace(/_/g, "-");
    if (name === "test" || name === "check:js") return "Core verification";
    if (value.includes("bidking")) return "BidKing reverse-engineering and fail-closed gates";
    if (
        value.includes("manual-confirmation")
        || value.includes("manual-count")
        || value.includes("codex-visual")
        || value.includes("ingest:")
        || /\bp[0-9]\b/.test(value)
    ) return "Manual confirmation and visual-shadow gates";
    if (value.includes("capture") || value.includes("stitch")) return "Capture intake and visual review";
    if (value.includes("clean-replay")) return "Clean replay review";
    if (
        value.includes("count-fit")
        || value.includes("count-prior")
        || value.includes("settlement")
        || value.includes("purple")
        || value.includes("producer")
        || value.includes("pixel-shadow")
        || value.includes("quality-pixel")
        || value.includes("default-weight")
        || value.includes("red-residual")
        || value.includes("system-hint")
    ) return "Calibration, replay, and strategy research";
    if (value.includes("catalog") || value.includes("authority") || value.includes("manual-value") || value.includes("manual-calibration") || value.includes("default-config")) {
        return "Authority source and catalog builders";
    }
    if (value.includes("audit") || value.includes("static") || value.includes("smoke") || value.includes("browser-state") || value.includes("repo-index") || value.includes("repository-index")) {
        return "Release, audit, and smoke checks";
    }
    return "Other";
}

function formatCommand(command) {
    const normalized = command.replaceAll("|", "\\|");
    if (normalized.length <= 220) return normalized;
    return `${normalized.slice(0, 217)}...`;
}

function categorizeResearch(file) {
    const value = file.toLowerCase();
    if (value.includes("bidking")) return "BidKing reverse-engineering and comparison";
    if (value.includes("manual-confirmation") || value.includes("manual-count")) return "Manual confirmation and authority handoff";
    if (value.includes("codex-visual") || value.includes("visual-shadow")) return "Visual shadow candidate chain";
    if (value.includes("producer") || value.includes("purple") || value.includes("count-fit") || value.includes("count-prior")) {
        return "Calibration and producer strategy";
    }
    if (value.includes("capture") || value.includes("red-residual") || value.includes("catalog") || value.includes("pixel")) {
        return "Capture, catalog, and pixel review";
    }
    return "Other research artifacts";
}

function groupBy(values, getKey) {
    const groups = new Map();
    values.forEach((value) => {
        const key = getKey(value);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(value);
    });
    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function buildComponentIndex() {
    const packageJson = readPackageJson();
    const allFiles = walkFiles(ROOT_DIR);
    const rootFiles = allFiles.filter((file) => !file.includes("/"));
    const rootGroupFiles = new Set(ROOT_COMPONENT_GROUPS.flatMap((group) => group.files));
    const uncategorizedRootFiles = rootFiles
        .filter((file) => !rootGroupFiles.has(file))
        .filter((file) => !["package.json", "package-lock.json", ".gitignore", "README.md", "PUBLIC_RELEASE_NOTES.md"].includes(file))
        .sort();
    const scriptCount = fs.readdirSync(path.join(ROOT_DIR, "scripts")).filter((file) => file.endsWith(".js")).length;
    const testCount = fs.readdirSync(path.join(ROOT_DIR, "tests")).filter((file) => file.endsWith(".test.js") || file.startsWith("test_")).length;
    const researchCount = fs.existsSync(RESEARCH_DIR)
        ? fs.readdirSync(RESEARCH_DIR).filter((file) => fs.statSync(path.join(RESEARCH_DIR, file)).isFile()).length
        : 0;

    const lines = [
        "# Repository Index",
        "",
        "This index is generated by `npm run build:repo-index`. It is the public navigation layer for the repository.",
        "",
        "## Top-Level Map",
        "",
        "| Area | Path | Current status |",
        "| --- | --- | --- |",
        "| Browser workbench | `index.html`, `tools.html`, `src/browser/`, `style.css` | Active public static app surface. |",
        "| Runtime config | `config/default/`, `src/core/default_config_bundle.js` | Active source-owned defaults. |",
        "| Core/research runtime | `src/core/`, `src/research/` | Active estimator, catalog, replay, and report modules. |",
        "| Legacy Python tools | `legacy/python/` | Retained local estimator/calibration helpers. |",
        "| Source artifacts | `data/source_packages/`, `data/battle_samples/`, `data/manual_catalog/` | Active public source snapshots. |",
        "| Builders | `scripts/` | Active report builders and gates; see `docs/SCRIPTS_INDEX.md`. |",
        "| Tests | `tests/` | Active regression suite. |",
        "| Research reports | `docs/research/` | Curated generated evidence; see `docs/RESEARCH_INDEX.md`. |",
        "| Security notes | `security/` | Local pressure-test notes and recommendations. |",
        "| Generated output | `dist/` | Ignored; rebuild with `npm run build:static`. |",
        "",
        "## Counts",
        "",
        `- Tracked public files scanned: \`${allFiles.length}\``,
        `- Package scripts: \`${Object.keys(packageJson.scripts || {}).length}\``,
        `- Builder scripts: \`${scriptCount}\``,
        `- Tests: \`${testCount}\``,
        `- Curated research artifacts: \`${researchCount}\``,
        "",
        "## Component Groups",
        ""
    ];

    ROOT_COMPONENT_GROUPS.forEach((group) => {
        lines.push(`### ${group.title}`, "", group.purpose, "", formatBulletList(existingFiles(group.files)), "");
    });

    lines.push(
        "## Root Files Outside Source Folders",
        "",
        "Root files are limited to public static entrypoints, package metadata, and small legacy support documents/configs.",
        "",
        formatBulletList(uncategorizedRootFiles),
        "",
        "## Cleanup Summary",
        "",
        "- Removed duplicate config samples: `auction_king_config_example (1).json`, `auction_king_config_example (2).json`.",
        "- Moved root JavaScript source into `src/browser/`, `src/core/`, and `src/research/`.",
        "- Moved legacy Python estimator files into `legacy/python/` because they are still test-covered and documented.",
        "- Kept generated folders ignored rather than committed: `dist/`, `node_modules/`, `output/`, `tmp_capture_review/`, `external/`.",
        "",
        "## Verification Entry Points",
        "",
        "- `npm test`",
        "- `npm run check:js`",
        "- `npm run build:static`",
        "- `npm run audit:public-release`",
        "",
        "## Related Indexes",
        "",
        "- `docs/SCRIPTS_INDEX.md`",
        "- `docs/RESEARCH_INDEX.md`",
        "- `docs/DEPRECATIONS.md`",
        ""
    );

    return lines.join("\n");
}

function buildScriptsIndex() {
    const packageJson = readPackageJson();
    const scriptEntries = Object.entries(packageJson.scripts || {}).map(([name, command]) => ({ name, command }));
    const scriptFiles = fs.readdirSync(path.join(ROOT_DIR, "scripts"))
        .filter((file) => file.endsWith(".js"))
        .sort();
    const scriptGroups = groupBy(scriptEntries, (entry) => categorizeScript(entry.name, entry.command));
    const fileGroups = groupBy(scriptFiles, (file) => categorizeScript(file));
    const lines = [
        "# Scripts Index",
        "",
        "Generated by `npm run build:repo-index`.",
        "",
        "## Package Scripts",
        ""
    ];

    scriptGroups.forEach(([group, entries]) => {
        lines.push(`### ${group}`, "", "| script | command |", "| --- | --- |");
        entries.forEach((entry) => {
            lines.push(`| \`${entry.name}\` | \`${formatCommand(entry.command)}\` |`);
        });
        lines.push("");
    });

    lines.push("## Builder Files", "");
    fileGroups.forEach(([group, files]) => {
        lines.push(`### ${group}`, "", formatBulletList(files.map((file) => `scripts/${file}`)), "");
    });

    return lines.join("\n");
}

function buildResearchIndex() {
    const researchFiles = fs.existsSync(RESEARCH_DIR)
        ? fs.readdirSync(RESEARCH_DIR).filter((file) => fs.statSync(path.join(RESEARCH_DIR, file)).isFile()).sort()
        : [];
    const groups = groupBy(researchFiles, categorizeResearch);
    const lines = [
        "# Research Artifact Index",
        "",
        "Generated by `npm run build:repo-index`. Artifacts listed here are curated public evidence, not raw local dumps.",
        ""
    ];

    groups.forEach(([group, files]) => {
        lines.push(`## ${group}`, "", "| artifact | formats |", "| --- | --- |");
        const stems = new Map();
        files.forEach((file) => {
            const ext = path.extname(file).slice(1) || "file";
            const stem = file.slice(0, -path.extname(file).length);
            if (!stems.has(stem)) stems.set(stem, []);
            stems.get(stem).push(ext);
        });
        Array.from(stems.entries()).sort(([left], [right]) => left.localeCompare(right)).forEach(([stem, exts]) => {
            lines.push(`| \`${stem}\` | \`${exts.sort().join(", ")}\` |`);
        });
        lines.push("");
    });

    return lines.join("\n");
}

function buildDeprecationsIndex() {
    return [
        "# Deprecations And Cleanup",
        "",
        "Generated by `npm run build:repo-index`.",
        "",
        "## Removed",
        "",
        "| file | reason |",
        "| --- | --- |",
        ...REMOVED_FILES.map((entry) => `| \`${entry.file}\` | ${entry.reason} |`),
        "",
        "## Retained As Legacy",
        "",
        "| component | reason |",
        "| --- | --- |",
        "| `legacy/python/auction_king_sunken_ship_estimator.py` and `legacy/python/auction_king_sunken_ship_realtime.py` | Older CLI estimator surface; retained because tests cover red template behavior. |",
        "| `auction_king_README.md` and `auction_king_sunken_ship_realtime_README.md` | Legacy CLI instructions; retained as reference until Python entrypoints are retired. |",
        "| `my_families.json` and `family_calibration_template.csv` | Test-covered family calibration examples. |",
        "",
        "## Not Committed",
        "",
        "- `node_modules/`",
        "- `dist/`",
        "- `.cache/`, `.playwright-*`, `.pytest_cache/`",
        "- `output/`, `tmp_capture_review/`, `backups/`, `deploy_backups/`, `external/`",
        "- Raw images: `*.png`, `*.jpg`, `*.jpeg`, `*.webp`",
        ""
    ].join("\n");
}

function writeText(relativePath, text) {
    const targetPath = path.join(ROOT_DIR, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${text.trimEnd()}\n`, "utf8");
}

function main() {
    writeText("docs/INDEX.md", buildComponentIndex());
    writeText("docs/SCRIPTS_INDEX.md", buildScriptsIndex());
    writeText("docs/RESEARCH_INDEX.md", buildResearchIndex());
    writeText("docs/DEPRECATIONS.md", buildDeprecationsIndex());
    process.stdout.write("docs/INDEX.md\n");
    process.stdout.write("docs/SCRIPTS_INDEX.md\n");
    process.stdout.write("docs/RESEARCH_INDEX.md\n");
    process.stdout.write("docs/DEPRECATIONS.md\n");
}

if (require.main === module) {
    main();
}

module.exports = {
    buildComponentIndex,
    buildScriptsIndex,
    buildResearchIndex,
    buildDeprecationsIndex,
    categorizeScript,
    categorizeResearch
};
