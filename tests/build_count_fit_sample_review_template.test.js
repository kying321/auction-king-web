const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCountFitSampleReviewTemplate,
    formatCountFitSampleReviewTemplateMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_count_fit_sample_review_template.js");

const REQUIRED_FIELDS = [
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
];

function makePack() {
    return {
        schema_version: "ak_count_fit_sample_acquisition_pack_v1",
        generated_at: "2026-04-25T08:05:43.000Z",
        summary: {
            blocked_map_count: 2,
            blocked_maps: ["shipping", "villa"],
            existing_candidate_task_count: 2,
            pairable_candidate_task_count: 1,
            manual_pair_candidate_task_count: 1,
            fresh_capture_map_count: 2,
            total_fresh_same_battle_target_if_existing_candidates_fail: 60,
            total_fresh_same_battle_target_after_all_existing_candidates_accepted: 58
        },
        existing_candidate_tasks: [
            {
                id: "complete_review_villa_pairable",
                task_type: "complete_existing_candidate",
                map_id: "villa",
                map_priority: "P0",
                source_queue_id: "review_villa_pairable",
                basename: "villa_pairable.png",
                candidate_priority: "P0",
                task_action: "fill_same_battle_observed_state_and_actual_counts",
                confirmed_sample_id: "villa_settlement_a",
                source_image_path: "/tmp/villa_pairable.png",
                pixel_overlay_path: "/tmp/villa_pairable_overlay.png",
                required_same_battle_fields: REQUIRED_FIELDS,
                pixel_training_label_allowed: false
            },
            {
                id: "complete_review_villa_manual",
                task_type: "complete_existing_candidate",
                map_id: "villa",
                map_priority: "P0",
                source_queue_id: "review_villa_manual",
                basename: "villa_manual.png",
                candidate_priority: "P2",
                task_action: "manual_pair_existing_candidate_or_discard",
                source_image_path: "/tmp/villa_manual.png",
                pixel_overlay_path: "/tmp/villa_manual_overlay.png",
                required_same_battle_fields: REQUIRED_FIELDS,
                pixel_training_label_allowed: false
            }
        ],
        fresh_capture_tasks: [
            {
                id: "fresh_same_battle_villa",
                task_type: "capture_fresh_same_battle_samples",
                map_id: "villa",
                map_priority: "P0",
                target_same_battle_samples_if_existing_candidates_fail: 30,
                target_same_battle_samples_after_all_existing_candidates_accepted: 28,
                required_same_battle_fields: REQUIRED_FIELDS
            },
            {
                id: "fresh_same_battle_shipping",
                task_type: "capture_fresh_same_battle_samples",
                map_id: "shipping",
                map_priority: "P2",
                target_same_battle_samples_if_existing_candidates_fail: 30,
                target_same_battle_samples_after_all_existing_candidates_accepted: 30,
                required_same_battle_fields: REQUIRED_FIELDS
            }
        ]
    };
}

test("package exposes count-fit sample review template builder", () => {
    assert.equal(
        packageJson.scripts["build:count-fit-sample-review-template"],
        "node scripts/build_count_fit_sample_review_template.js"
    );
});

test("resolveArgs accepts acquisition pack and output paths", () => {
    const result = resolveArgs(["pack.json", "template.json"]);

    assert.equal(result.acquisitionPackPath, path.resolve("pack.json"));
    assert.equal(result.outputPath, path.resolve("template.json"));
});

test("buildCountFitSampleReviewTemplate creates fillable drafts from existing and fresh tasks", () => {
    const template = buildCountFitSampleReviewTemplate({
        acquisitionPack: makePack(),
        generatedAt: "2026-04-25T08:30:00.000Z",
        paths: { acquisitionPackPath: "/tmp/pack.json" }
    });

    assert.equal(template.schema_version, "ak_count_fit_sample_review_template_v1");
    assert.equal(template.change_class, "RESEARCH_ONLY");
    assert.equal(template.inputs.count_fit_sample_acquisition_pack, "/tmp/pack.json");
    assert.equal(template.summary.existing_candidate_review_count, 2);
    assert.equal(template.summary.fresh_capture_template_count, 2);
    assert.equal(template.summary.total_fresh_same_battle_target_after_all_existing_candidates_accepted, 58);
    assert.equal(template.summary.pixel_training_label_allowed_count, 0);
    assert.deepEqual(template.summary.map_counts, { shipping: 1, villa: 3 });

    const draft = template.review_results[0];
    assert.equal(draft.source_task_id, "complete_review_villa_pairable");
    assert.equal(draft.source_queue_id, "review_villa_pairable");
    assert.equal(draft.status, "needs_manual_input");
    assert.equal(draft.output_target, "count_fit_same_battle_sample");
    assert.equal(draft.task_action, "fill_same_battle_observed_state_and_actual_counts");
    assert.equal(draft.map_id, "villa");
    assert.equal(draft.actual_counts_source, "manual_review");
    assert.deepEqual(draft.actual_counts, {
        w: null,
        g: null,
        b: null,
        p: null,
        o: null,
        r: null,
        total_items: null
    });
    assert.deepEqual(draft.observed_state, {});
    assert.equal(draft.pixel_training_label_allowed, false);
    assert.deepEqual(draft.required_fields, REQUIRED_FIELDS);
    assert.ok(draft.guardrails.includes("do_not_copy_pixel_or_system_hint_into_actual_counts"));

    const fresh = template.fresh_capture_templates[0];
    assert.equal(fresh.map_id, "villa");
    assert.equal(fresh.target_same_battle_samples_after_all_existing_candidates_accepted, 28);
    assert.equal(fresh.sample_draft.actual_counts_source, "manual_review");
    assert.equal(fresh.sample_draft.map_id, "villa");
    assert.deepEqual(fresh.sample_draft.actual_counts, {
        w: null,
        g: null,
        b: null,
        p: null,
        o: null,
        r: null,
        total_items: null
    });
});

test("main writes count-fit review template JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-fit-review-template-"));
    const packPath = path.join(tempDir, "pack.json");
    const outputPath = path.join(tempDir, "review-template.json");

    fs.writeFileSync(packPath, JSON.stringify(makePack(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([packPath, outputPath, "--generated-at", "2026-04-25T08:30:00.000Z"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const template = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(template.generated_at, "2026-04-25T08:30:00.000Z");
    assert.equal(template.review_results.length, 2);
    assert.match(markdown, /count-fit sample review template/);
    assert.match(markdown, /count_fit_same_battle_sample/);
    assert.match(formatCountFitSampleReviewTemplateMarkdown(template, outputPath), /same-battle/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
