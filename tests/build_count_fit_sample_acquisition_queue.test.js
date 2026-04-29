const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCountFitSampleAcquisitionQueue,
    formatCountFitSampleAcquisitionMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_count_fit_sample_acquisition_queue.js");

function makeReadinessReport() {
    return {
        schema_version: "ak_settlement_count_fit_readiness_report_v1",
        thresholds: {
            min_count_scored_samples_per_map_quality: 30
        },
        evaluated_qualities: ["w", "g", "b", "p", "o", "r"],
        summary: {
            maps_ready_for_count_fit: [],
            maps_needing_count_samples: ["shipping", "sunken_ship", "villa"]
        },
        maps: {
            shipping: {
                map_id: "shipping",
                full_count_fit_scored_sample_count: 0,
                full_count_fit_scored_gap: 30,
                fit_gap_by_quality: { w: 30, g: 30, b: 30, p: 30, o: 30, r: 30 },
                count_fit_scored_sample_count_by_quality: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
                two_sigma_count_fit_allowed: false,
                risk_flags: ["full_count_fit_scored_sample_count_below_minimum"]
            },
            sunken_ship: {
                map_id: "sunken_ship",
                full_count_fit_scored_sample_count: 0,
                full_count_fit_scored_gap: 30,
                fit_gap_by_quality: { w: 30, g: 30, b: 30, p: 30, o: 30, r: 30 },
                count_fit_scored_sample_count_by_quality: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
                two_sigma_count_fit_allowed: false,
                risk_flags: ["full_count_fit_scored_sample_count_below_minimum"]
            },
            villa: {
                map_id: "villa",
                full_count_fit_scored_sample_count: 0,
                full_count_fit_scored_gap: 30,
                fit_gap_by_quality: { w: 30, g: 30, b: 30, p: 30, o: 30, r: 30 },
                count_fit_scored_sample_count_by_quality: { w: 0, g: 0, b: 0, p: 0, o: 0, r: 0 },
                two_sigma_count_fit_allowed: false,
                risk_flags: ["samples_missing_observed_state"]
            }
        }
    };
}

function makeCleanReplayQueue() {
    return {
        schema_version: "ak_clean_replay_candidate_queue_v1",
        items: [
            {
                id: "review_villa_a",
                map_id: "villa",
                priority: "P0",
                recommended_action: "pair_observed_state_and_actual_counts",
                confirmed_sample_id: "villa_settlement_a"
            },
            {
                id: "review_sunken_a",
                map_id: "sunken_ship",
                priority: "P2",
                recommended_action: "manual_pair_or_discard"
            }
        ]
    };
}

test("package exposes count-fit sample acquisition queue builder", () => {
    assert.equal(
        packageJson.scripts["build:count-fit-sample-acquisition-queue"],
        "node scripts/build_count_fit_sample_acquisition_queue.js"
    );
});

test("resolveArgs accepts readiness, clean replay queue, and output paths", () => {
    const result = resolveArgs(["readiness.json", "clean-queue.json", "acquisition.json"]);

    assert.equal(result.readinessReportPath, path.resolve("readiness.json"));
    assert.equal(result.cleanReplayQueuePath, path.resolve("clean-queue.json"));
    assert.equal(result.outputPath, path.resolve("acquisition.json"));
});

test("buildCountFitSampleAcquisitionQueue ranks map sampling gaps with existing candidates first", () => {
    const queue = buildCountFitSampleAcquisitionQueue({
        readinessReport: makeReadinessReport(),
        cleanReplayQueue: makeCleanReplayQueue(),
        generatedAt: "2026-04-25T05:30:00.000Z"
    });

    assert.equal(queue.schema_version, "ak_count_fit_sample_acquisition_queue_v1");
    assert.equal(queue.change_class, "RESEARCH_ONLY");
    assert.equal(queue.summary.map_count, 3);
    assert.equal(queue.summary.blocked_map_count, 3);
    assert.equal(queue.summary.total_full_count_fit_scored_gap, 90);
    assert.deepEqual(queue.summary.priority_counts, { P0: 1, P1: 1, P2: 1 });
    assert.deepEqual(queue.summary.required_same_battle_fields, [
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
    assert.equal(queue.items[0].map_id, "villa");
    assert.equal(queue.items[0].priority, "P0");
    assert.equal(queue.items[0].recommended_action, "finish_existing_settlement_only_pairs");
    assert.equal(queue.items[0].target_new_same_battle_samples, 30);
    assert.equal(queue.items[0].existing_candidate_summary.pairable_candidate_count, 1);
    assert.deepEqual(queue.items[0].existing_candidate_ids, ["review_villa_a"]);
    assert.equal(queue.items[1].map_id, "sunken_ship");
    assert.equal(queue.items[1].priority, "P1");
    assert.equal(queue.items[2].map_id, "shipping");
    assert.equal(queue.items[2].priority, "P2");
});

test("main writes count-fit sample acquisition JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-fit-acquisition-"));
    const readinessPath = path.join(tempDir, "readiness.json");
    const cleanQueuePath = path.join(tempDir, "clean-queue.json");
    const outputPath = path.join(tempDir, "acquisition.json");

    fs.writeFileSync(readinessPath, JSON.stringify(makeReadinessReport(), null, 2));
    fs.writeFileSync(cleanQueuePath, JSON.stringify(makeCleanReplayQueue(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([readinessPath, cleanQueuePath, outputPath, "--generated-at", "2026-04-25T05:30:00.000Z"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const queue = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(queue.generated_at, "2026-04-25T05:30:00.000Z");
    assert.equal(queue.items[0].map_id, "villa");
    assert.match(markdown, /count-fit sample acquisition queue/);
    assert.match(markdown, /finish_existing_settlement_only_pairs/);
    assert.match(formatCountFitSampleAcquisitionMarkdown(queue, outputPath), /same-battle/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
