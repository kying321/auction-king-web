const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    chooseIngestStatus,
    chooseManualConfirmationSource,
    collectReviewPriorities,
    listManualConfirmationDownloads,
    main,
    resolveArgs,
    summarizeManualConfirmationPayload
} = require("../scripts/ingest_latest_manual_confirmation_download.js");

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildManualConfirmationFixture(overrides = {}) {
    const templateReviewPriority = overrides.template_review_priority;
    const sampleOverrides = { ...overrides };
    delete sampleOverrides.template_review_priority;
    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: "2026-04-26T12:00:00.000+08:00",
        fresh_capture_templates: [
            {
                map_id: "sunken_ship",
                ...(templateReviewPriority ? { review_priority: templateReviewPriority } : {}),
                samples: [
                    {
                        map_id: "sunken_ship",
                        event_timestamp: "2026-04-25T18:19:20.767Z",
                        status: "approved_count_fit_sample",
                        actual_counts_source: "manual_review",
                        actual_counts: {
                            w: 1,
                            g: 2,
                            b: 3,
                            p: 4,
                            o: 5,
                            r: 6,
                            total_items: 21
                        },
                        observed_state: {
                            r1_total_items: 21
                        },
                        ...sampleOverrides
                    }
                ]
            }
        ]
    };
}

test("package exposes latest manual confirmation ingest script", () => {
    assert.equal(
        packageJson.scripts["ingest:latest-manual-confirmation"],
        "node scripts/ingest_latest_manual_confirmation_download.js"
    );
    assert.match(
        packageJson.scripts["ingest:p0-manual-confirmation"] || "",
        /scripts\/ingest_latest_manual_confirmation_download\.js .*2026-04-27-sunken-ship-p0-manual-count-confirmation-import\.json/
    );
    assert.match(
        packageJson.scripts["ingest:p0-manual-confirmation"] || "",
        /2026-04-27-sunken-ship-p0-latest-manual-confirmation-ingest-report\.json/
    );
    assert.match(
        packageJson.scripts["ingest:p1-manual-confirmation"] || "",
        /scripts\/ingest_latest_manual_confirmation_download\.js .*2026-04-27-sunken-ship-p1-manual-count-confirmation-import\.json/
    );
    assert.match(
        packageJson.scripts["ingest:p1-manual-confirmation"] || "",
        /2026-04-27-sunken-ship-p1-latest-manual-confirmation-ingest-report\.json/
    );
    assert.match(
        packageJson.scripts["intake:p0-manual-confirmation"] || "",
        /node scripts\/refresh_p0_manual_confirmation_intake\.js/
    );
    assert.match(
        packageJson.scripts["intake:p1-manual-confirmation"] || "",
        /node scripts\/refresh_p1_manual_confirmation_intake\.js/
    );
    assert.match(
        packageJson.scripts["check:js"],
        /scripts\/refresh_p0_manual_confirmation_intake\.js/
    );
    assert.match(
        packageJson.scripts["check:js"],
        /scripts\/refresh_p1_manual_confirmation_intake\.js/
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/ingest_latest_manual_confirmation_download\.js/);
});

test("resolveArgs accepts explicit source, downloads dir, output, generated time, and blocker flag", () => {
    const args = resolveArgs([
        "manual-confirmation.json",
        "--downloads-dir=/tmp/downloads",
        "--output=/tmp/ingest.json",
        "--generated-at=2026-04-26T12:00:00.000+08:00",
        "--priority=P1",
        "--fail-on-blockers"
    ]);

    assert.equal(args.confirmationResultsPath, path.resolve("manual-confirmation.json"));
    assert.equal(args.downloadsDir, "/tmp/downloads");
    assert.equal(args.outputPath, "/tmp/ingest.json");
    assert.equal(args.generatedAt, "2026-04-26T12:00:00.000+08:00");
    assert.equal(args.requiredPriority, "P1");
    assert.equal(args.failOnBlockers, true);
});

test("listManualConfirmationDownloads keeps only valid manual confirmation results and sorts newest first", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-confirm-downloads-"));
    const olderPath = path.join(tempDir, "2026-04-26-sunken-ship-downloads-manual-count-confirmation-results.json");
    const newerPath = path.join(tempDir, "2026-04-26-sunken-ship-downloads-manual-count-confirmation-results (1).json");
    const invalidPath = path.join(tempDir, "2026-04-26-sunken-ship-downloads-manual-count-confirmation-results (2).json");
    const capturePath = path.join(tempDir, "auction-king-battle-capture-sunken-ship-20260425T181920767Z.json");
    writeJson(olderPath, buildManualConfirmationFixture());
    writeJson(newerPath, buildManualConfirmationFixture({ event_timestamp: "2026-04-25T18:24:55.589Z" }));
    writeJson(invalidPath, { schema_version: "not_manual_confirmation" });
    writeJson(capturePath, { schema_version: "ak_capture_package_v1" });
    fs.utimesSync(olderPath, new Date("2026-04-25T10:00:00Z"), new Date("2026-04-25T10:00:00Z"));
    fs.utimesSync(newerPath, new Date("2026-04-25T11:00:00Z"), new Date("2026-04-25T11:00:00Z"));

    const entries = listManualConfirmationDownloads(tempDir);
    assert.deepEqual(entries.map((entry) => path.basename(entry.path)), [
        "2026-04-26-sunken-ship-downloads-manual-count-confirmation-results (1).json",
        "2026-04-26-sunken-ship-downloads-manual-count-confirmation-results.json"
    ]);

    const selected = chooseManualConfirmationSource({ downloadsDir: tempDir });
    assert.equal(path.basename(selected.source.path), "2026-04-26-sunken-ship-downloads-manual-count-confirmation-results (1).json");
    assert.equal(selected.source.summary.import_ready_count, 1);
});

test("manual confirmation source selection can require matching review priority before newest-file selection", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-priority-manual-downloads-"));
    const p1Path = path.join(tempDir, "2026-04-27-sunken-ship-p1-manual-count-confirmation-results.json");
    const p0Path = path.join(tempDir, "2026-04-27-sunken-ship-p0-manual-count-confirmation-results.json");
    writeJson(p1Path, buildManualConfirmationFixture({
        template_review_priority: "P1",
        review_priority: "P1"
    }));
    writeJson(p0Path, buildManualConfirmationFixture({
        template_review_priority: "P0",
        review_priority: "P0"
    }));
    fs.utimesSync(p1Path, new Date("2026-04-27T10:00:00Z"), new Date("2026-04-27T10:00:00Z"));
    fs.utimesSync(p0Path, new Date("2026-04-27T11:00:00Z"), new Date("2026-04-27T11:00:00Z"));

    const selected = chooseManualConfirmationSource({ downloadsDir: tempDir, requiredPriority: "P1" });
    assert.equal(path.basename(selected.source.path), "2026-04-27-sunken-ship-p1-manual-count-confirmation-results.json");
    assert.deepEqual(collectReviewPriorities(selected.source.payload), ["P1"]);
    assert.equal(selected.source.summary.priority_counts.P1, 1);
    assert.equal(selected.filtered_candidate_count, 1);
    assert.equal(selected.candidates.length, 2);
});

test("summarizeManualConfirmationPayload separates valid, approved, and import-ready counts", () => {
    const payload = buildManualConfirmationFixture();
    payload.fresh_capture_templates[0].samples.push({
        map_id: "sunken_ship",
        event_timestamp: "2026-04-25T18:25:00.000Z",
        status: "approved_count_fit_sample",
        actual_counts_source: "manual_review",
        actual_counts: { w: 1, g: 0, b: 0, p: 0, o: 0, r: 0, total_items: 2 },
        observed_state: { r1_total_items: 2 }
    });
    payload.fresh_capture_templates[0].samples.push({
        map_id: "sunken_ship",
        event_timestamp: "2026-04-25T18:26:00.000Z",
        status: "needs_human_confirmation",
        actual_counts_source: "manual_review",
        actual_counts: { w: 2, g: 0, b: 0, p: 0, o: 0, r: 0, total_items: 2 },
        observed_state: { r1_total_items: 2 }
    });

    assert.deepEqual(summarizeManualConfirmationPayload(payload), {
        sample_count: 3,
        valid_count: 2,
        approved_count: 2,
        import_ready_count: 1
    });
});

test("main blocks explicit manual confirmation sources whose review priority does not match the focused intake", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-priority-mismatch-"));
    const sourcePath = path.join(tempDir, "p0-manual-confirmation.json");
    const importPath = path.join(tempDir, "import.json");
    const outputPath = path.join(tempDir, "ingest-report.json");
    writeJson(sourcePath, buildManualConfirmationFixture({
        template_review_priority: "P0",
        review_priority: "P0"
    }));

    const report = main([
        sourcePath,
        "--priority=P1",
        "--import-output", importPath,
        "--output", outputPath,
        "--generated-at=2026-04-26T12:35:00.000+08:00"
    ]);

    assert.equal(report.summary.status, "priority_mismatch");
    assert.equal(report.readiness.default_weight_update_allowed, false);
    assert.deepEqual(report.blockers, ["manual_confirmation_priority_mismatch"]);
    assert.equal(fs.existsSync(importPath), false);
    assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).inputs.required_priority, "P1");
});

test("main does not select newer manual confirmation downloads with the wrong required priority", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-priority-select-"));
    const p0Path = path.join(tempDir, "newer-p0-manual-count-confirmation-results.json");
    const p1Path = path.join(tempDir, "older-p1-manual-count-confirmation-results.json");
    const outputPath = path.join(tempDir, "ingest-report.json");
    writeJson(p0Path, buildManualConfirmationFixture({
        template_review_priority: "P0",
        review_priority: "P0"
    }));
    writeJson(p1Path, buildManualConfirmationFixture({
        template_review_priority: "P1",
        review_priority: "P1"
    }));
    fs.utimesSync(p1Path, new Date("2026-04-27T10:00:00Z"), new Date("2026-04-27T10:00:00Z"));
    fs.utimesSync(p0Path, new Date("2026-04-27T11:00:00Z"), new Date("2026-04-27T11:00:00Z"));

    const report = main([
        "--downloads-dir", tempDir,
        "--priority=P1",
        "--output", outputPath,
        "--generated-at=2026-04-26T12:40:00.000+08:00"
    ]);

    assert.equal(report.inputs.manual_confirmation_results, p1Path);
    assert.equal(report.source_summary.priority_counts.P1, 1);
    assert.equal(report.summary.accepted_sample_count, 1);
    assert.notEqual(report.inputs.manual_confirmation_results, p0Path);
});

test("chooseIngestStatus separates partial samples, low sample count, replay blockers, and review-ready replay", () => {
    assert.equal(chooseIngestStatus({ acceptedCount: 0 }), "no_accepted_samples");
    assert.equal(chooseIngestStatus({ acceptedCount: 1, blockedCount: 1 }), "partial_or_invalid_confirmation");
    assert.equal(
        chooseIngestStatus({
            acceptedCount: 1,
            blockedCount: 0,
            manualCandidateGateBlockers: ["accepted_sample_count_below_minimum"]
        }),
        "sample_count_below_minimum"
    );
    assert.equal(
        chooseIngestStatus({
            acceptedCount: 3,
            blockedCount: 0,
            manualReplayPassed: false,
            manualCandidateGateBlockers: ["candidate_quality_regression"]
        }),
        "replay_blocked"
    );
    assert.equal(
        chooseIngestStatus({
            acceptedCount: 3,
            blockedCount: 0,
            manualReplayPassed: true
        }),
        "replay_passed_review_required"
    );
});

test("main writes a missing-source ingest report when no manual confirmation download exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-empty-manual-downloads-"));
    const outputPath = path.join(tempDir, "ingest-report.json");
    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        const report = main([
            "--downloads-dir",
            tempDir,
            "--output",
            outputPath,
            "--generated-at=2026-04-26T12:30:00.000+08:00"
        ]);
        assert.equal(report.summary.status, "missing_source");
    } finally {
        process.stdout.write = originalWrite;
    }

    const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(written.summary.status, "missing_source");
    assert.equal(written.readiness.authority_sample_import_ready, false);
    assert.equal(written.readiness.default_weight_update_allowed, false);
    assert.deepEqual(written.blockers, ["missing_manual_confirmation_download"]);
    assert.match(printed.join(""), /ingest-report\.json/);
});

test("main ingests an explicit approved manual confirmation source into isolated chain outputs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-confirm-ingest-"));
    const sourcePath = path.join(tempDir, "manual-confirmation.json");
    const importPath = path.join(tempDir, "import.json");
    const gatePath = path.join(tempDir, "gate.json");
    const manualCandidatePath = path.join(tempDir, "manual-candidate.json");
    const manualGatePath = path.join(tempDir, "manual-gate.json");
    const chainPath = path.join(tempDir, "chain.json");
    const outputPath = path.join(tempDir, "ingest-report.json");
    writeJson(sourcePath, buildManualConfirmationFixture());
    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    let report;
    try {
        report = main([
            sourcePath,
            "--import-output",
            importPath,
            "--gate-output",
            gatePath,
            "--manual-candidate-output",
            manualCandidatePath,
            "--manual-candidate-gate-output",
            manualGatePath,
            "--chain-output",
            chainPath,
            "--output",
            outputPath,
            "--generated-at=2026-04-26T12:45:00.000+08:00"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    assert.equal(report.summary.accepted_sample_count, 1);
    assert.equal(report.summary.status, "sample_count_below_minimum");
    assert.equal(report.readiness.authority_sample_import_ready, true);
    assert.equal(report.readiness.replay_candidate_ready, false);
    assert.equal(report.readiness.default_weight_update_allowed, false);
    assert.match(report.blockers.join(","), /accepted_sample_count_below_minimum/);
    assert.equal(fs.existsSync(importPath), true);
    assert.equal(fs.existsSync(gatePath), true);
    assert.equal(fs.existsSync(manualCandidatePath), true);
    assert.equal(fs.existsSync(manualGatePath), true);
    assert.equal(fs.existsSync(chainPath), true);
    assert.equal(fs.existsSync(outputPath), true);
    assert.match(printed.join(""), /ingest-report\.json/);
});
