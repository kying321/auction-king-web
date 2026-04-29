const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildCaptureChainContaminationAudit,
    main,
    resolveArgs
} = require("../scripts/build_capture_chain_contamination_audit.js");

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildFixture(overrides = {}) {
    const fixture = {
        intakeReport: {
            schema_version: "ak_capture_package_intake_report_v1",
            generated_at: "2026-04-27T00:00:00.000Z",
            summary: {
                capture_package_count: 2,
                training_label_allowed_count: 0
            },
            entries: [
                {
                    basename: "capture-a.json",
                    risk_flags: ["missing_manual_actual_counts"],
                    embedded_snapshot_risk_flags: ["model_predicted_red_count_extreme"],
                    legacy_mixed_risk_flags: ["model_predicted_red_count_extreme", "missing_manual_actual_counts"]
                },
                {
                    basename: "capture-b.json",
                    risk_flags: ["extreme_orange_avg_needs_orange_count_confirmation", "missing_manual_actual_counts"],
                    embedded_snapshot_risk_flags: [],
                    legacy_mixed_risk_flags: ["extreme_orange_avg_needs_orange_count_confirmation", "missing_manual_actual_counts"]
                }
            ]
        },
        scanReport: {
            schema_version: "ak_capture_observation_prior_scan_report_v1",
            generated_at: "2026-04-27T00:00:00.000Z",
            scenarios: [
                {
                    id: "current_default",
                    max_red_count_mean: 5,
                    flag_counts: {
                        extreme_orange_avg_needs_orange_count_confirmation: 1
                    }
                }
            ]
        },
        driftReport: {
            schema_version: "ak_capture_prediction_drift_report_v1",
            generated_at: "2026-04-27T00:00:00.000Z",
            summary: {
                current_extreme_red_count: 0,
                stale_extreme_cleared_count: 1
            }
        },
        queueReport: {
            schema_version: "ak_red_residual_clarification_queue_v1",
            summary: {
                priority_counts: { P1: 1 },
                authority_merge_allowed: false,
                training_label_allowed_count: 0
            }
        },
        reviewPack: {
            schema_version: "ak_red_residual_review_pack_v1",
            summary: {
                priority_counts: { P1: 1 },
                authority_merge_allowed: false,
                training_label_allowed_count: 0
            }
        },
        p0Confirmation: {
            schema_version: "ak_codex_visual_manual_confirmation_results_v1",
            summary: {
                manual_confirmation_draft_count: 0,
                import_ready_without_human_action: false,
                pixel_training_label_allowed_count: 0,
                priority_counts: {}
            }
        },
        p1Confirmation: {
            schema_version: "ak_codex_visual_manual_confirmation_results_v1",
            summary: {
                manual_confirmation_draft_count: 1,
                import_ready_without_human_action: false,
                pixel_training_label_allowed_count: 0,
                priority_counts: { P1: 1 }
            }
        }
    };
    return { ...fixture, ...overrides };
}

test("package exposes capture chain contamination audit builder", () => {
    assert.equal(
        packageJson.scripts["build:capture-chain-contamination-audit"],
        "node scripts/build_capture_chain_contamination_audit.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_capture_chain_contamination_audit\.js/);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-27-capture-chain-contamination-audit.json"), true);
});

test("resolveArgs accepts named report paths and generated time", () => {
    const args = resolveArgs([
        "--intake=a.json",
        "--scan",
        "scan.json",
        "--drift=drift.json",
        "--queue=queue.json",
        "--review-pack=pack.json",
        "--p0-confirmation=p0.json",
        "--p1-confirmation=p1.json",
        "--output=out.json",
        "--generated-at=2026-04-27T01:00:00.000Z"
    ]);

    assert.equal(args.intakePath, path.resolve("a.json"));
    assert.equal(args.scanPath, path.resolve("scan.json"));
    assert.equal(args.driftPath, path.resolve("drift.json"));
    assert.equal(args.queuePath, path.resolve("queue.json"));
    assert.equal(args.reviewPackPath, path.resolve("pack.json"));
    assert.equal(args.p0ConfirmationPath, path.resolve("p0.json"));
    assert.equal(args.p1ConfirmationPath, path.resolve("p1.json"));
    assert.equal(args.outputPath, path.resolve("out.json"));
    assert.equal(args.generatedAt, "2026-04-27T01:00:00.000Z");
});

test("audit passes when embedded model flags are isolated from current risk flags", () => {
    const report = buildCaptureChainContaminationAudit(buildFixture());

    assert.equal(report.schema_version, "ak_capture_chain_contamination_audit_v1");
    assert.equal(report.summary.status, "clean");
    assert.equal(report.summary.contamination_free, true);
    assert.equal(report.summary.current_risk_model_flag_entry_count, 0);
    assert.equal(report.summary.embedded_snapshot_model_flag_entry_count, 1);
    assert.equal(report.summary.current_red_max, 5);
    assert.equal(report.summary.current_extreme_red_count, 0);
    assert.equal(report.summary.recommended_next_action, "fill_p1_orange_count_then_full_manual_counts");
    assert.deepEqual(report.blockers, []);
});

test("audit blocks if current risk flags contain embedded model flags", () => {
    const fixture = buildFixture();
    fixture.intakeReport.entries[0].risk_flags.push("model_predicted_red_count_extreme");
    const report = buildCaptureChainContaminationAudit(fixture);

    assert.equal(report.summary.status, "blocked");
    assert.equal(report.summary.contamination_free, false);
    assert.ok(report.blockers.includes("current_risk_flags_exclude_embedded_model_flags"));
});

test("audit blocks import-ready manual confirmation without human action", () => {
    const fixture = buildFixture({
        p1Confirmation: {
            schema_version: "ak_codex_visual_manual_confirmation_results_v1",
            summary: {
                manual_confirmation_draft_count: 1,
                import_ready_without_human_action: true,
                pixel_training_label_allowed_count: 0,
                priority_counts: { P1: 1 }
            }
        }
    });
    const report = buildCaptureChainContaminationAudit(fixture);

    assert.equal(report.summary.status, "blocked");
    assert.ok(report.blockers.includes("p1_manual_confirmation_requires_human_action"));
});

test("main writes JSON and Markdown reports", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-capture-contamination-"));
    const fixture = buildFixture();
    const paths = {
        intake: path.join(tempDir, "intake.json"),
        scan: path.join(tempDir, "scan.json"),
        drift: path.join(tempDir, "drift.json"),
        queue: path.join(tempDir, "queue.json"),
        pack: path.join(tempDir, "pack.json"),
        p0: path.join(tempDir, "p0.json"),
        p1: path.join(tempDir, "p1.json"),
        output: path.join(tempDir, "audit.json")
    };
    writeJson(paths.intake, fixture.intakeReport);
    writeJson(paths.scan, fixture.scanReport);
    writeJson(paths.drift, fixture.driftReport);
    writeJson(paths.queue, fixture.queueReport);
    writeJson(paths.pack, fixture.reviewPack);
    writeJson(paths.p0, fixture.p0Confirmation);
    writeJson(paths.p1, fixture.p1Confirmation);
    const originalWrite = process.stdout.write;
    const printed = [];
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            `--intake=${paths.intake}`,
            `--scan=${paths.scan}`,
            `--drift=${paths.drift}`,
            `--queue=${paths.queue}`,
            `--review-pack=${paths.pack}`,
            `--p0-confirmation=${paths.p0}`,
            `--p1-confirmation=${paths.p1}`,
            `--output=${paths.output}`,
            "--generated-at=2026-04-27T01:00:00.000Z"
        ]);
        const report = JSON.parse(fs.readFileSync(paths.output, "utf8"));
        const markdown = fs.readFileSync(paths.output.replace(/\.json$/i, ".md"), "utf8");
        assert.equal(report.generated_at, "2026-04-27T01:00:00.000Z");
        assert.match(markdown, /Capture Chain Contamination Audit/);
        assert.match(markdown, /current_risk_flags_exclude_embedded_model_flags/);
        assert.match(printed.join(""), new RegExp(`${paths.output.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`));
    } finally {
        process.stdout.write = originalWrite;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
