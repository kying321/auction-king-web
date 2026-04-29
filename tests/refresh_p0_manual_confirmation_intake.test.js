const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_PATHS,
    formatMarkdown,
    main,
    resolveArgs
} = require("../scripts/refresh_p0_manual_confirmation_intake.js");

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildManualConfirmationFixture() {
    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: "2026-04-27T00:30:00.000+08:00",
        fresh_capture_templates: [
            {
                source_task_id: "capture_full_count_sunken_ship_p0_case",
                source_task_type: "capture_clipboard_full_count_review",
                map_id: "sunken_ship",
                review_priority: "P0",
                samples: [
                    {
                        source_task_id: "capture_full_count_sunken_ship_p0_case",
                        status: "approved_count_fit_sample",
                        map_id: "sunken_ship",
                        event_timestamp: "2026-04-26T12:39:48.135Z",
                        observed_state: {
                            r1_total_items: 21,
                            r1_blue_count: 3
                        },
                        actual_counts: {
                            w: 1,
                            g: 2,
                            b: 3,
                            p: 4,
                            o: 5,
                            r: 6,
                            total_items: 21
                        },
                        actual_counts_source: "manual_review",
                        pixel_training_label_allowed: false
                    }
                ]
            }
        ]
    };
}

test("package exposes one-command P0 manual confirmation intake wrapper", () => {
    assert.equal(
        packageJson.scripts["intake:p0-manual-confirmation"],
        "node scripts/refresh_p0_manual_confirmation_intake.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/refresh_p0_manual_confirmation_intake\.js/);
});

test("resolveArgs accepts source and isolated output paths", () => {
    const result = resolveArgs([
        "manual-confirmation.json",
        "--downloads-dir=/tmp/downloads",
        "--import-output=import.json",
        "--gate-output=gate.json",
        "--manual-candidate-output=manual-candidate.json",
        "--manual-candidate-gate-output=manual-gate.json",
        "--chain-output=chain.json",
        "--ingest-output=ingest.json",
        "--handoff-output=handoff.json",
        "--output=intake.json",
        "--generated-at=2026-04-27T00:40:00.000+08:00",
        "--fail-on-blockers"
    ]);

    assert.equal(result.confirmationResultsPath, path.resolve("manual-confirmation.json"));
    assert.equal(result.downloadsDir, "/tmp/downloads");
    assert.equal(result.importOutputPath, path.resolve("import.json"));
    assert.equal(result.gateOutputPath, path.resolve("gate.json"));
    assert.equal(result.manualCandidateOutputPath, path.resolve("manual-candidate.json"));
    assert.equal(result.manualCandidateGateOutputPath, path.resolve("manual-gate.json"));
    assert.equal(result.chainOutputPath, path.resolve("chain.json"));
    assert.equal(result.ingestOutputPath, path.resolve("ingest.json"));
    assert.equal(result.handoffOutputPath, path.resolve("handoff.json"));
    assert.equal(result.outputPath, path.resolve("intake.json"));
    assert.equal(result.generatedAt, "2026-04-27T00:40:00.000+08:00");
    assert.equal(result.failOnBlockers, true);
});

test("default output path targets P0 manual confirmation intake refresh artifact", () => {
    assert.equal(
        DEFAULT_PATHS.outputPath.endsWith("2026-04-27-sunken-ship-p0-manual-confirmation-intake-refresh.json"),
        true
    );
});

test("main runs ingest and handoff gate into a compact P0 intake report", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-p0-intake-"));
    const sourcePath = path.join(tempDir, "manual-count-confirmation-results.json");
    const importPath = path.join(tempDir, "import.json");
    const gatePath = path.join(tempDir, "gate.json");
    const manualCandidatePath = path.join(tempDir, "manual-candidate.json");
    const manualGatePath = path.join(tempDir, "manual-gate.json");
    const chainPath = path.join(tempDir, "chain.json");
    const ingestPath = path.join(tempDir, "ingest.json");
    const handoffPath = path.join(tempDir, "handoff.json");
    const outputPath = path.join(tempDir, "intake.json");
    writeJson(sourcePath, buildManualConfirmationFixture());

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            sourcePath,
            "--import-output", importPath,
            "--gate-output", gatePath,
            "--manual-candidate-output", manualCandidatePath,
            "--manual-candidate-gate-output", manualGatePath,
            "--chain-output", chainPath,
            "--ingest-output", ingestPath,
            "--handoff-output", handoffPath,
            "--output", outputPath,
            "--generated-at=2026-04-27T00:45:00.000+08:00"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.schema_version, "ak_p0_manual_confirmation_intake_refresh_v1");
    assert.equal(report.summary.accepted_sample_count, 1);
    assert.equal(report.summary.authority_sample_merge_allowed, true);
    assert.equal(report.summary.default_weight_update_allowed, false);
    assert.match(report.commands.authority_sample_merge, /build:authority-from-samples/);
    assert.equal(fs.existsSync(importPath), true);
    assert.equal(fs.existsSync(gatePath), true);
    assert.equal(fs.existsSync(manualCandidatePath), true);
    assert.equal(fs.existsSync(manualGatePath), true);
    assert.equal(fs.existsSync(chainPath), true);
    assert.equal(fs.existsSync(ingestPath), true);
    assert.equal(fs.existsSync(handoffPath), true);
    assert.match(markdown, /P0 Manual Confirmation Intake Refresh/);
    assert.match(formatMarkdown(report, outputPath), /Authority sample merge allowed: `true`/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
