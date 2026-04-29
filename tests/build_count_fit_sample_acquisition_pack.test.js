const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCountFitSampleAcquisitionPack,
    formatCountFitSampleAcquisitionPackMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_count_fit_sample_acquisition_pack.js");

function makeAcquisitionQueue() {
    return {
        schema_version: "ak_count_fit_sample_acquisition_queue_v1",
        generated_at: "2026-04-25T07:52:25.000Z",
        summary: {
            blocked_map_count: 2,
            total_target_new_same_battle_samples: 60,
            priority_counts: { P0: 1, P2: 1 },
            required_same_battle_fields: [
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
            ]
        },
        items: [
            {
                id: "count_fit_sample_gap_villa",
                map_id: "villa",
                priority: "P0",
                recommended_action: "finish_existing_settlement_only_pairs",
                two_sigma_count_fit_allowed: false,
                target_new_same_battle_samples: 30,
                existing_candidate_ids: ["review_villa_pairable", "review_villa_manual"],
                existing_candidate_summary: {
                    existing_candidate_count: 2,
                    pairable_candidate_count: 1,
                    manual_pair_candidate_count: 1
                },
                required_same_battle_fields: [
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
                ]
            },
            {
                id: "count_fit_sample_gap_shipping",
                map_id: "shipping",
                priority: "P2",
                recommended_action: "run_fresh_same_battle_samples",
                two_sigma_count_fit_allowed: false,
                target_new_same_battle_samples: 30,
                existing_candidate_ids: [],
                existing_candidate_summary: {
                    existing_candidate_count: 0,
                    pairable_candidate_count: 0,
                    manual_pair_candidate_count: 0
                },
                required_same_battle_fields: [
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
                ]
            }
        ]
    };
}

function makeCleanReplayQueue() {
    return {
        schema_version: "ak_clean_replay_candidate_queue_v1",
        items: [
            {
                id: "review_villa_pairable",
                basename: "villa_pairable.png",
                map_id: "villa",
                priority: "P0",
                recommended_action: "pair_observed_state_and_actual_counts",
                confirmed_sample_id: "villa_settlement_a",
                source_image_path: "/tmp/villa_pairable.png",
                pixel_overlay_path: "/tmp/villa_pairable_overlay.png"
            },
            {
                id: "review_villa_manual",
                basename: "villa_manual.png",
                map_id: "villa",
                priority: "P2",
                recommended_action: "manual_pair_or_discard",
                source_image_path: "/tmp/villa_manual.png",
                pixel_overlay_path: "/tmp/villa_manual_overlay.png"
            },
            {
                id: "review_sunken_other",
                basename: "sunken_other.png",
                map_id: "sunken_ship",
                priority: "P2",
                recommended_action: "manual_pair_or_discard"
            }
        ]
    };
}

test("package exposes count-fit sample acquisition pack builder", () => {
    assert.equal(
        packageJson.scripts["build:count-fit-sample-acquisition-pack"],
        "node scripts/build_count_fit_sample_acquisition_pack.js"
    );
});

test("resolveArgs accepts acquisition queue, clean replay queue, and output paths", () => {
    const result = resolveArgs(["acquisition.json", "clean-queue.json", "pack.json"]);

    assert.equal(result.acquisitionQueuePath, path.resolve("acquisition.json"));
    assert.equal(result.cleanReplayQueuePath, path.resolve("clean-queue.json"));
    assert.equal(result.outputPath, path.resolve("pack.json"));
});

test("buildCountFitSampleAcquisitionPack expands map gaps into review and fresh-capture tasks", () => {
    const pack = buildCountFitSampleAcquisitionPack({
        acquisitionQueue: makeAcquisitionQueue(),
        cleanReplayQueue: makeCleanReplayQueue(),
        generatedAt: "2026-04-25T08:00:00.000Z",
        paths: {
            acquisitionQueuePath: "/tmp/acquisition.json",
            cleanReplayQueuePath: "/tmp/clean-queue.json"
        }
    });

    assert.equal(pack.schema_version, "ak_count_fit_sample_acquisition_pack_v1");
    assert.equal(pack.change_class, "RESEARCH_ONLY");
    assert.equal(pack.inputs.count_fit_sample_acquisition_queue, "/tmp/acquisition.json");
    assert.equal(pack.inputs.clean_replay_candidate_queue, "/tmp/clean-queue.json");
    assert.equal(pack.summary.blocked_map_count, 2);
    assert.equal(pack.summary.existing_candidate_task_count, 2);
    assert.equal(pack.summary.pairable_candidate_task_count, 1);
    assert.equal(pack.summary.manual_pair_candidate_task_count, 1);
    assert.equal(pack.summary.fresh_capture_map_count, 2);
    assert.equal(pack.summary.total_fresh_same_battle_target_if_existing_candidates_fail, 60);
    assert.equal(pack.summary.total_fresh_same_battle_target_after_all_existing_candidates_accepted, 58);
    assert.deepEqual(pack.summary.blocked_maps, ["shipping", "villa"]);
    assert.equal(pack.existing_candidate_tasks[0].map_id, "villa");
    assert.equal(pack.existing_candidate_tasks[0].task_action, "fill_same_battle_observed_state_and_actual_counts");
    assert.equal(pack.existing_candidate_tasks[0].pixel_training_label_allowed, false);
    assert.equal(pack.existing_candidate_tasks[1].task_action, "manual_pair_existing_candidate_or_discard");
    assert.equal(pack.fresh_capture_tasks[0].map_id, "villa");
    assert.equal(pack.fresh_capture_tasks[0].target_same_battle_samples_if_existing_candidates_fail, 30);
    assert.equal(pack.fresh_capture_tasks[0].target_same_battle_samples_after_all_existing_candidates_accepted, 28);
    assert.deepEqual(pack.fresh_capture_tasks[0].required_same_battle_fields, [
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
    ]);
});

test("main writes count-fit acquisition pack JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-fit-pack-"));
    const acquisitionPath = path.join(tempDir, "acquisition.json");
    const cleanQueuePath = path.join(tempDir, "clean-queue.json");
    const outputPath = path.join(tempDir, "pack.json");

    fs.writeFileSync(acquisitionPath, JSON.stringify(makeAcquisitionQueue(), null, 2));
    fs.writeFileSync(cleanQueuePath, JSON.stringify(makeCleanReplayQueue(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([acquisitionPath, cleanQueuePath, outputPath, "--generated-at", "2026-04-25T08:00:00.000Z"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const pack = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(pack.generated_at, "2026-04-25T08:00:00.000Z");
    assert.equal(pack.summary.existing_candidate_task_count, 2);
    assert.match(markdown, /count-fit sample acquisition pack/);
    assert.match(markdown, /fill_same_battle_observed_state_and_actual_counts/);
    assert.match(formatCountFitSampleAcquisitionPackMarkdown(pack, outputPath), /same-battle/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
