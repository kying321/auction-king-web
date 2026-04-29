const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildMinimalFields,
    buildRecommendations,
    buildRedResidualClarificationQueue,
    classifyPriority,
    main,
    resolveArgs
} = require("../scripts/build_red_residual_clarification_queue.js");

function fixtureIntakeEntry() {
    return {
        basename: "capture.json",
        exported_at: "2026-04-26T12:00:00.000Z",
        map_id: "sunken_ship",
        capture_group_key: "same-battle-group",
        input_path: "/tmp/capture.json",
        use_class: "needs_manual_counts",
        field_values_compact: {
            total_items: 48,
            blue_count: 17,
            purple_avg_cells: "2.9",
            orange_avg_cells: "12"
        },
        observed_state: {
            r4_total_storage_cells: null
        },
        constraint_diagnostics: {
            total_items: 48,
            blue_count: 17,
            purple_count: null,
            orange_count: null,
            inferred_white_green_count: 10,
            orange_avg_cells: 12,
            orange_red_unknown_pool: 21,
            known_count_balance_complete: false,
            orange_count_missing: true
        }
    };
}

function fixtureScanEntry() {
    return {
        capture: "capture.json",
        exported_at: "2026-04-26T12:00:00.000Z",
        map_id: "sunken_ship",
        red_count_mean: 11,
        red_cell_mean: 40,
        orange_count_mean: 1,
        purple_count_mean: 9,
        mean_value_w: 220,
        q25_value_w: 200,
        q50_value_w: 222,
        orange_red_unknown_pool: 21,
        orange_avg_cells: 12,
        risk_flags: [
            "model_predicted_red_count_extreme",
            "model_predicted_red_cells_extreme",
            "extreme_orange_avg_needs_orange_count_confirmation",
            "red_residual_sensitive_to_missing_orange_count"
        ]
    };
}

function fixtureReports() {
    return {
        intakeReport: {
            schema_version: "ak_capture_package_intake_report_v1",
            summary: {
                capture_package_count: 1
            },
            entries: [fixtureIntakeEntry()]
        },
        scanReport: {
            schema_version: "ak_capture_observation_prior_scan_v1",
            scenarios: [{
                id: "current_default",
                entries: [fixtureScanEntry()]
            }]
        }
    };
}

test("package exposes red residual clarification queue entry", () => {
    assert.equal(
        packageJson.scripts["build:red-residual-clarification-queue"],
        "node scripts/build_red_residual_clarification_queue.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_red_residual_clarification_queue\.js/);
});

test("red residual clarification queue asks for minimal decisive fields first", () => {
    const fields = buildMinimalFields(fixtureIntakeEntry(), fixtureScanEntry());

    assert.deepEqual(fields, [
        "orange_count",
        "purple_count",
        "total_storage_cells",
        "red_count",
        "actual_counts.w/g/b/p/o/r/total_items"
    ]);
});

test("red residual priority marks missing orange residual extremes as P0", () => {
    assert.equal(classifyPriority(fixtureScanEntry(), fixtureIntakeEntry()), "P0");
});

test("red residual clarification queue stays review-only and source-owned", () => {
    const { intakeReport, scanReport } = fixtureReports();
    const report = buildRedResidualClarificationQueue({ intakeReport, scanReport });

    assert.equal(report.schema_version, "ak_red_residual_clarification_queue_v1");
    assert.equal(report.change_class, "RESEARCH_ONLY");
    assert.equal(report.summary.queue_item_count, 1);
    assert.equal(report.summary.priority_counts.P0, 1);
    assert.equal(report.summary.authority_merge_allowed, false);
    assert.equal(report.items[0].training_label_allowed, false);
    assert.ok(report.items[0].adoption_blockers.includes("missing_authority_ready_actual_counts"));
});

test("red residual clarification queue groups same-battle adjacent captures", () => {
    const firstIntake = fixtureIntakeEntry();
    const secondIntake = {
        ...fixtureIntakeEntry(),
        basename: "capture-later.json",
        exported_at: "2026-04-26T12:00:05.000Z",
        input_path: "/tmp/capture-later.json"
    };
    const firstScan = fixtureScanEntry();
    const secondScan = {
        ...fixtureScanEntry(),
        capture: "capture-later.json",
        exported_at: "2026-04-26T12:00:05.000Z",
        red_count_mean: 10.5
    };
    const report = buildRedResidualClarificationQueue({
        intakeReport: {
            summary: { capture_package_count: 2 },
            entries: [firstIntake, secondIntake]
        },
        scanReport: {
            scenarios: [{
                id: "current_default",
                entries: [firstScan, secondScan]
            }]
        }
    });

    assert.equal(report.summary.raw_capture_item_count, 2);
    assert.equal(report.summary.queue_item_count, 1);
    assert.equal(report.items[0].grouped_capture_count, 2);
    assert.deepEqual(report.items[0].captures, ["capture.json", "capture-later.json"]);
});

test("red residual recommendations follow actual top priority", () => {
    assert.match(buildRecommendations([{ priority: "P0" }])[0], /先处理 P0/);
    assert.match(buildRecommendations([{ priority: "P1" }])[0], /最高优先级为 P1/);
    assert.match(buildRecommendations([])[0], /没有红残差队列项/);
});

test("red residual clarification queue CLI resolves paths and writes artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-red-residual-queue-"));
    const intakePath = path.join(tempDir, "intake.json");
    const scanPath = path.join(tempDir, "scan.json");
    const outputPath = path.join(tempDir, "queue.json");
    const { intakeReport, scanReport } = fixtureReports();
    fs.writeFileSync(intakePath, `${JSON.stringify(intakeReport, null, 2)}\n`);
    fs.writeFileSync(scanPath, `${JSON.stringify(scanReport, null, 2)}\n`);
    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        const args = resolveArgs([intakePath, scanPath, outputPath]);
        assert.equal(args.intakePath, intakePath);
        assert.equal(args.scanPath, scanPath);
        assert.equal(args.outputPath, outputPath);

        main([intakePath, scanPath, outputPath]);
        const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
        const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
        assert.equal(report.summary.queue_item_count, 1);
        assert.match(markdown, /Red Residual Clarification Queue/);
        assert.equal(printed.join(""), `${outputPath}\n${outputPath.replace(/\.json$/i, ".md")}\n`);
    } finally {
        process.stdout.write = originalWrite;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
