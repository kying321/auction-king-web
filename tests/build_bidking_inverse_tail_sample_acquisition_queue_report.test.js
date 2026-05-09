const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingInverseTailSampleAcquisitionQueue,
    formatBidKingInverseTailSampleAcquisitionQueueMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_bidking_inverse_tail_sample_acquisition_queue_report.js");

function gateReport() {
    return {
        schema_version: "ak_bidking_inverse_tail_shadow_replay_gate_v1",
        mode: "research_backtest",
        change_class: "SIM_ONLY",
        live_path_touched: false,
        summary: {
            diagnostic_shadow_analysis_allowed: true,
            inverse_tail_shadow_replay_allowed: false,
            promotion_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            target_item_id: 1106013,
            missing_1106013_source_recovered: false,
            impacted_project_maps: ["sunken_ship", "villa"],
            min_same_battle_samples_per_impacted_map: 3,
            accepted_same_battle_sample_count: 1,
            accepted_same_battle_sample_count_by_map: {
                sunken_ship: 1
            },
            same_battle_sample_deficit_by_impacted_map: {
                sunken_ship: 2,
                villa: 3
            },
            blockers: [
                "missing_authoritative_item_row_1106013",
                "impacted_map_sample_count_below_minimum"
            ]
        },
        gates: {
            diagnostic_shadow_analysis_allowed: true,
            inverse_tail_shadow_replay_allowed: false,
            promotion_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false,
            source_item_row_recovered_for_project_scope: false,
            impacted_map_sample_count_ready: false
        }
    };
}

test("package exposes BidKing inverse-tail sample acquisition queue builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-inverse-tail-sample-acquisition-queue"],
        "node scripts/build_bidking_inverse_tail_sample_acquisition_queue_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_inverse_tail_sample_acquisition_queue_report\.js/);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-05-07-bidking-inverse-tail-sample-acquisition-queue.json"), true);
});

test("queue converts replay gate deficits into P0 authority and same-battle tasks", () => {
    const queue = buildBidKingInverseTailSampleAcquisitionQueue({
        inverseTailReplayGateReport: gateReport(),
        generatedAt: "2026-05-07T22:30:00.000+08:00"
    });

    assert.equal(queue.schema_version, "ak_bidking_inverse_tail_sample_acquisition_queue_v1");
    assert.equal(queue.change_class, "RESEARCH_ONLY");
    assert.equal(queue.live_path_touched, false);
    assert.equal(queue.summary.authority_task_required, true);
    assert.equal(queue.summary.map_sample_task_count, 2);
    assert.equal(queue.summary.total_target_new_same_battle_samples, 5);
    assert.deepEqual(queue.summary.same_battle_sample_deficit_by_map, {
        sunken_ship: 2,
        villa: 3
    });
    assert.equal(queue.gates.default_config_update_allowed, false);
    assert.equal(queue.gates.authority_handoff_allowed, false);
    assert.equal(queue.gates.inverse_tail_shadow_replay_allowed, false);

    const authorityTask = queue.items.find((entry) => entry.id === "inverse_tail_authority_gap_1106013");
    assert.equal(authorityTask.priority, "P0");
    assert.equal(authorityTask.task_type, "recover_missing_item_authority_row");
    assert.match(authorityTask.acceptance_criteria.join(","), /raw Item.txt row begins with 1106013/);

    const villaTask = queue.items.find((entry) => entry.map_id === "villa");
    assert.equal(villaTask.priority, "P0");
    assert.equal(villaTask.target_new_same_battle_samples, 3);
    assert.equal(villaTask.current_accepted_same_battle_samples, 0);
    assert.match(villaTask.required_fields.join(","), /event_timestamp/);

    const sunkenTask = queue.items.find((entry) => entry.map_id === "sunken_ship");
    assert.equal(sunkenTask.target_new_same_battle_samples, 2);
    assert.equal(sunkenTask.current_accepted_same_battle_samples, 1);
});

test("queue marks same-battle task ready when deficits are zero but still keeps default gates closed", () => {
    const readyGate = gateReport();
    readyGate.summary.missing_1106013_source_recovered = true;
    readyGate.summary.same_battle_sample_deficit_by_impacted_map = { sunken_ship: 0, villa: 0 };
    readyGate.summary.accepted_same_battle_sample_count_by_map = { sunken_ship: 3, villa: 3 };
    readyGate.gates.source_item_row_recovered_for_project_scope = true;
    readyGate.gates.impacted_map_sample_count_ready = true;
    readyGate.gates.inverse_tail_shadow_replay_allowed = true;
    readyGate.summary.inverse_tail_shadow_replay_allowed = true;

    const queue = buildBidKingInverseTailSampleAcquisitionQueue({
        inverseTailReplayGateReport: readyGate,
        generatedAt: "2026-05-07T22:30:00.000+08:00"
    });

    assert.equal(queue.summary.queue_status, "ready_for_shadow_replay_comparison");
    assert.equal(queue.summary.total_target_new_same_battle_samples, 0);
    assert.equal(queue.summary.authority_task_required, false);
    assert.equal(queue.items.length, 0);
    assert.equal(queue.gates.default_config_update_allowed, false);
    assert.equal(queue.gates.promotion_allowed, false);
});

test("main writes JSON and Markdown inverse-tail acquisition queue artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-inverse-tail-acq-"));
    const gatePath = path.join(tempDir, "gate.json");
    const outputPath = path.join(tempDir, "queue.json");
    fs.writeFileSync(gatePath, JSON.stringify(gateReport(), null, 2));

    const args = resolveArgs([
        gatePath,
        outputPath,
        "--generated-at=2026-05-07T22:30:00.000+08:00"
    ]);
    assert.equal(args.inverseTailReplayGateReportPath, gatePath);
    assert.equal(args.outputPath, outputPath);

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([gatePath, outputPath, "--generated-at=2026-05-07T22:30:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const queue = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(queue.summary.total_target_new_same_battle_samples, 5);
    assert.match(markdown, /inverse-tail sample acquisition queue/);
    assert.match(formatBidKingInverseTailSampleAcquisitionQueueMarkdown(queue), /1106013/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
