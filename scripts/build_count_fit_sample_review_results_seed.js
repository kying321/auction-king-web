const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_TEMPLATE_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-template.json"
);
const DEFAULT_OUTPUT_PATH = path.join(
    ROOT_DIR,
    "docs",
    "research",
    "2026-04-25-count-fit-sample-review-results.json"
);

function resolveArgs(argv = process.argv.slice(2)) {
    const positional = [];
    let generatedAt = new Date().toISOString();
    let force = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--generated-at") {
            index += 1;
            if (!argv[index]) throw new Error("--generated-at 需要提供 ISO 时间");
            generatedAt = argv[index];
        } else if (String(arg).startsWith("--generated-at=")) {
            generatedAt = String(arg).slice("--generated-at=".length);
        } else if (arg === "--force") {
            force = true;
        } else {
            positional.push(arg);
        }
    }

    return {
        templatePath: positional[0] ? path.resolve(positional[0]) : DEFAULT_TEMPLATE_PATH,
        outputPath: positional[1] ? path.resolve(positional[1]) : DEFAULT_OUTPUT_PATH,
        generatedAt,
        force
    };
}

function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function countArray(value) {
    return Array.isArray(value) ? value.length : 0;
}

function summarizeSeed(template = {}) {
    const summary = template && template.summary && typeof template.summary === "object" ? template.summary : {};
    const reviewResults = Array.isArray(template.review_results) ? template.review_results : [];
    const freshCaptureTemplates = Array.isArray(template.fresh_capture_templates) ? template.fresh_capture_templates : [];
    return {
        existing_candidate_review_count: summary.existing_candidate_review_count ?? reviewResults.length,
        fresh_capture_template_count: summary.fresh_capture_template_count ?? freshCaptureTemplates.length,
        total_fresh_same_battle_target_if_existing_candidates_fail:
            summary.total_fresh_same_battle_target_if_existing_candidates_fail ?? null,
        total_fresh_same_battle_target_after_all_existing_candidates_accepted:
            summary.total_fresh_same_battle_target_after_all_existing_candidates_accepted ?? null,
        map_counts: cloneValue(summary.map_counts || {}),
        pixel_training_label_allowed_count: summary.pixel_training_label_allowed_count
            ?? [...reviewResults, ...freshCaptureTemplates].filter((entry) => entry && entry.pixel_training_label_allowed === true).length
    };
}

function buildCountFitSampleReviewResultsSeed({
    template = {},
    generatedAt = new Date().toISOString(),
    paths = {}
} = {}) {
    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: generatedAt,
        mode: "research_backtest",
        change_class: "RESEARCH_ONLY",
        source_template_schema_version: template.schema_version || null,
        source_template_generated_at: template.generated_at || null,
        inputs: {
            count_fit_sample_review_template: paths.templatePath || DEFAULT_TEMPLATE_PATH
        },
        notes: [
            "User-editable copy seeded from the generated count-fit review template.",
            "Fill event_timestamp, observed_state, actual_counts, and status here; producer refresh may overwrite the generated template but not this file.",
            "Keep pixel_training_label_allowed=false and actual_counts_source=manual_review."
        ],
        summary: summarizeSeed(template),
        review_results: cloneValue(Array.isArray(template.review_results) ? template.review_results : []),
        fresh_capture_templates: cloneValue(Array.isArray(template.fresh_capture_templates) ? template.fresh_capture_templates : [])
    };
}

function markdownCode(value) {
    if (value === null || value === undefined || value === "") return "`-`";
    return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function countRows(counts = {}) {
    const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
    if (!entries.length) return "| `-` | `0` |";
    return entries.map(([key, value]) => `| ${markdownCode(key)} | ${markdownCode(value)} |`).join("\n");
}

function formatCountFitSampleReviewResultsSeedMarkdown(results, jsonPath = DEFAULT_OUTPUT_PATH) {
    const summary = results && results.summary ? results.summary : summarizeSeed();
    const jsonDisplayPath = path.relative(process.cwd(), jsonPath) || jsonPath;
    return `# count-fit sample review results seed

- change class: \`${results.change_class || "RESEARCH_ONLY"}\`
- JSON: \`${jsonDisplayPath}\`
- source template generated at: \`${results.source_template_generated_at || "-"}\`
- existing candidate review drafts: \`${summary.existing_candidate_review_count || 0}\`
- fresh capture templates: \`${summary.fresh_capture_template_count || 0}\`
- training-label from pixel: \`${summary.pixel_training_label_allowed_count || 0}\`
- purpose: user-editable same-battle review source for count-fit sample import.

## Map Counts

| map | draft count |
| --- | ---: |
${countRows(summary.map_counts)}

## Guardrails

- Fill this results file, not the generated template file.
- Do not set \`pixel_training_label_allowed\` to \`true\`.
- Approved rows must use \`status=approved_count_fit_sample\` and \`actual_counts_source=manual_review\`.
`;
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeMarkdown(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, payload, "utf8");
}

function main(argv = process.argv.slice(2)) {
    const args = resolveArgs(argv);
    if (fs.existsSync(args.outputPath) && !args.force) {
        throw new Error(`review results already exists: ${args.outputPath}; use --force to overwrite`);
    }
    const template = JSON.parse(fs.readFileSync(args.templatePath, "utf8"));
    const results = buildCountFitSampleReviewResultsSeed({
        template,
        generatedAt: args.generatedAt,
        paths: args
    });
    writeJson(args.outputPath, results);
    writeMarkdown(
        args.outputPath.replace(/\.json$/i, ".md"),
        formatCountFitSampleReviewResultsSeedMarkdown(results, args.outputPath)
    );
    process.stdout.write(`${args.outputPath}\n`);
    return results;
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    DEFAULT_TEMPLATE_PATH,
    buildCountFitSampleReviewResultsSeed,
    formatCountFitSampleReviewResultsSeedMarkdown,
    main,
    resolveArgs
};
