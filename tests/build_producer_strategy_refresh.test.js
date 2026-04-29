const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATHS,
    main,
    resolveArgs
} = require("../scripts/build_producer_strategy_refresh.js");

function createPurpleFitEvidence() {
    return {
        schema_version: "ak_purple_weight_fit_report_v1",
        generated_at: "2026-04-25T06:15:51.694Z",
        adoption_allowed: false,
        adoption_blockers: ["fit_uses_partial_overlay_replay_samples"],
        recommendation: {
            selected_default_multiplier: 1.25,
            default_weight_change_class: "SIM_ONLY"
        },
        candidates: [
            {
                multiplier: 1,
                candidate_alpha_counts_by_map: {
                    shipping: { p: 2.9 },
                    sunken_ship: { p: 3.84 },
                    villa: { p: 4.2 }
                }
            },
            {
                multiplier: 1.25,
                candidate_alpha_counts_by_map: {
                    shipping: { p: 3.625 },
                    sunken_ship: { p: 4.8 },
                    villa: { p: 5.25 }
                }
            }
        ]
    };
}

test("package exposes producer strategy refresh entry", () => {
    assert.match(
        packageJson.scripts["build:producer-strategy-refresh"] || "",
        /node\s+scripts\/build_producer_strategy_refresh\.js/
    );
});

test("resolveArgs accepts source, output, and generated-at flags", () => {
    const result = resolveArgs([
        "--count-prior", "count.json",
        "--value-model", "value.json",
        "--readiness", "readiness.json",
        "--clean-replay-queue", "clean-queue.json",
        "--purple-fit", "purple-fit.json",
        "--samples", "samples.json",
        "--candidate-output", "candidate.json",
        "--count-replay-output", "count-replay.json",
        "--diagnostics-output", "diagnostics.json",
        "--architecture-output", "architecture.json",
        "--default-weight-implementation-output", "default-weight.json",
        "--count-fit-sample-acquisition-output", "acquisition-queue.json",
        "--count-fit-sample-acquisition-pack-output", "acquisition-pack.json",
        "--count-fit-sample-review-template-output", "review-template.json",
        "--count-fit-sample-review-import", "review-import.json",
        "--audit-output", "audit.json",
        "--generated-at", "2026-04-25T00:00:00.000Z"
    ]);

    assert.equal(result.countPriorReportPath, path.resolve("count.json"));
    assert.equal(result.valueModelReportPath, path.resolve("value.json"));
    assert.equal(result.countFitReadinessReportPath, path.resolve("readiness.json"));
    assert.equal(result.cleanReplayQueuePath, path.resolve("clean-queue.json"));
    assert.equal(result.purpleFitReportPath, path.resolve("purple-fit.json"));
    assert.equal(result.samplesPath, path.resolve("samples.json"));
    assert.equal(result.candidateOutputPath, path.resolve("candidate.json"));
    assert.equal(result.countReplayOutputPath, path.resolve("count-replay.json"));
    assert.equal(result.replayDiagnosticsOutputPath, path.resolve("diagnostics.json"));
    assert.equal(result.architectureOutputPath, path.resolve("architecture.json"));
    assert.equal(result.defaultWeightImplementationOutputPath, path.resolve("default-weight.json"));
    assert.equal(result.countFitSampleAcquisitionOutputPath, path.resolve("acquisition-queue.json"));
    assert.equal(result.countFitSampleAcquisitionPackOutputPath, path.resolve("acquisition-pack.json"));
    assert.equal(result.countFitSampleReviewTemplateOutputPath, path.resolve("review-template.json"));
    assert.equal(result.countFitSampleReviewImportPath, path.resolve("review-import.json"));
    assert.equal(result.auditOutputPath, path.resolve("audit.json"));
    assert.equal(result.generatedAt, "2026-04-25T00:00:00.000Z");
});

test("default output paths use the latest producer strategy refresh chain", () => {
    assert.equal(DEFAULT_OUTPUT_PATHS.candidate.endsWith("2026-04-25-producer-strategy-candidate-config.json"), true);
    assert.equal(DEFAULT_OUTPUT_PATHS.countReplay.endsWith("2026-04-25-producer-strategy-count-replay-report.json"), true);
    assert.equal(DEFAULT_OUTPUT_PATHS.diagnostics.endsWith("2026-04-25-producer-strategy-replay-diagnostics-report.json"), true);
    assert.equal(DEFAULT_OUTPUT_PATHS.architecture.endsWith("2026-04-25-producer-strategy-architecture-report.json"), true);
    assert.equal(
        DEFAULT_OUTPUT_PATHS.defaultWeightImplementation.endsWith("2026-04-25-default-weight-implementation-report.json"),
        true
    );
    assert.equal(
        DEFAULT_OUTPUT_PATHS.countFitSampleAcquisition.endsWith("2026-04-25-count-fit-sample-acquisition-queue.json"),
        true
    );
    assert.equal(
        DEFAULT_OUTPUT_PATHS.countFitSampleAcquisitionPack.endsWith("2026-04-25-count-fit-sample-acquisition-pack.json"),
        true
    );
    assert.equal(
        DEFAULT_OUTPUT_PATHS.countFitSampleReviewTemplate.endsWith("2026-04-25-count-fit-sample-review-template.json"),
        true
    );
    assert.equal(DEFAULT_OUTPUT_PATHS.audit.endsWith("2026-04-25-producer-strategy-chain-audit-report.json"), true);
});

test("main refreshes producer strategy chain with one stable batch timestamp", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-refresh-"));
    const countPath = path.join(tempDir, "count-prior.json");
    const valuePath = path.join(tempDir, "value-model.json");
    const readinessPath = path.join(tempDir, "readiness.json");
    const cleanQueuePath = path.join(tempDir, "clean-queue.json");
    const purpleFitPath = path.join(tempDir, "purple-fit.json");
    const samplesPath = path.join(tempDir, "samples.json");
    const candidatePath = path.join(tempDir, "candidate.json");
    const countReplayPath = path.join(tempDir, "count-replay.json");
    const diagnosticsPath = path.join(tempDir, "diagnostics.json");
    const architecturePath = path.join(tempDir, "architecture.json");
    const defaultWeightPath = path.join(tempDir, "default-weight.json");
    const acquisitionQueuePath = path.join(tempDir, "acquisition-queue.json");
    const acquisitionPackPath = path.join(tempDir, "acquisition-pack.json");
    const reviewTemplatePath = path.join(tempDir, "review-template.json");
    const reviewImportPath = path.join(tempDir, "review-import.json");
    const auditPath = path.join(tempDir, "audit.json");
    const generatedAt = "2026-04-25T00:00:00.000Z";

    fs.writeFileSync(countPath, JSON.stringify({
        maps: {
            villa: {
                map_id: "villa",
                alpha_counts_candidate: { w: 7, g: 6, b: 4, p: 4, o: 2, r: 1 },
                count_prior_strength_candidate: 16,
                clean_replay_sample_count: 1,
                clean_replay_full_distribution_sample_count: 0,
                clean_replay_two_sigma_fit: {
                    villa_case: { all_within_2sigma: true, max_abs_z: 1.1 }
                },
                blockers: []
            }
        }
    }, null, 2));
    fs.writeFileSync(valuePath, JSON.stringify({
        runtime_family_status: "enabled",
        maps: {
            villa: {
                map_id: "villa",
                runtime_family_status: "enabled",
                all_target_fits_within_2sigma: true,
                quality_fits: {
                    p: { z: 0.1, within_2sigma: true },
                    o: { z: 0.2, within_2sigma: true },
                    r: { z: 0.3, within_2sigma: true }
                },
                blockers: []
            }
        }
    }, null, 2));
    fs.writeFileSync(readinessPath, JSON.stringify({
        packages: [
            {
                source_path: reviewImportPath,
                schema_version: "ak_count_fit_sample_review_import_v1",
                sample_count: 0
            }
        ],
        maps: {
            villa: {
                map_id: "villa",
                two_sigma_count_fit_allowed: false,
                blocked_qualities: ["w", "g", "b", "p", "o", "r"],
                fit_gap_by_quality: { o: 30 },
                observed_state_fit_gap: 30,
                risk_flags: ["insufficient_count_scored_samples"]
            }
        }
    }, null, 2));
    fs.writeFileSync(reviewImportPath, JSON.stringify({
        schema_version: "ak_count_fit_sample_review_import_v1",
        summary: {
            review_entry_count: 1,
            accepted_sample_count: 0,
            blocked_entry_count: 1
        },
        samples: []
    }, null, 2));
    fs.writeFileSync(cleanQueuePath, JSON.stringify({
        schema_version: "ak_clean_replay_candidate_queue_v1",
        items: [
            {
                id: "review_villa_a",
                map_id: "villa",
                priority: "P0",
                recommended_action: "pair_observed_state_and_actual_counts",
                confirmed_sample_id: "villa_settlement_a"
            }
        ]
    }, null, 2));
    fs.writeFileSync(purpleFitPath, JSON.stringify(createPurpleFitEvidence(), null, 2));
    fs.writeFileSync(samplesPath, JSON.stringify({
        samples: [
            {
                id: "villa_case",
                map_id: "villa",
                field_values: {
                    total_items: 45,
                    blue_count: 11,
                    orange_avg_cells: 3.33
                },
                actual_counts: { o: 1 }
            }
        ]
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            "--count-prior", countPath,
            "--value-model", valuePath,
            "--readiness", readinessPath,
            "--clean-replay-queue", cleanQueuePath,
            "--purple-fit", purpleFitPath,
            "--samples", samplesPath,
            "--candidate-output", candidatePath,
            "--count-replay-output", countReplayPath,
            "--diagnostics-output", diagnosticsPath,
            "--architecture-output", architecturePath,
            "--default-weight-implementation-output", defaultWeightPath,
            "--count-fit-sample-acquisition-output", acquisitionQueuePath,
            "--count-fit-sample-acquisition-pack-output", acquisitionPackPath,
            "--count-fit-sample-review-template-output", reviewTemplatePath,
            "--count-fit-sample-review-import", reviewImportPath,
            "--audit-output", auditPath,
            "--generated-at", generatedAt
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const candidate = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
    const countReplay = JSON.parse(fs.readFileSync(countReplayPath, "utf8"));
    const diagnostics = JSON.parse(fs.readFileSync(diagnosticsPath, "utf8"));
    const architecture = JSON.parse(fs.readFileSync(architecturePath, "utf8"));
    const defaultWeight = JSON.parse(fs.readFileSync(defaultWeightPath, "utf8"));
    const acquisitionQueue = JSON.parse(fs.readFileSync(acquisitionQueuePath, "utf8"));
    const acquisitionPack = JSON.parse(fs.readFileSync(acquisitionPackPath, "utf8"));
    const reviewTemplate = JSON.parse(fs.readFileSync(reviewTemplatePath, "utf8"));
    const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));

    assert.equal(candidate.producer_strategy_candidate.generated_at, generatedAt);
    assert.equal(countReplay.generated_at, generatedAt);
    assert.equal(countReplay.candidate_config_context.generated_at, generatedAt);
    assert.equal(diagnostics.generated_at, generatedAt);
    assert.equal(architecture.generated_at, generatedAt);
    assert.equal(defaultWeight.generated_at, generatedAt);
    assert.equal(defaultWeight.implementation_status, "mismatch");
    assert.equal(acquisitionQueue.generated_at, generatedAt);
    assert.equal(acquisitionQueue.inputs.settlement_count_fit_readiness_report, readinessPath);
    assert.equal(acquisitionQueue.inputs.clean_replay_candidate_queue, cleanQueuePath);
    assert.equal(acquisitionQueue.summary.blocked_map_count, 1);
    assert.equal(acquisitionQueue.summary.total_target_new_same_battle_samples, 30);
    assert.equal(acquisitionQueue.items[0].map_id, "villa");
    assert.equal(acquisitionQueue.items[0].priority, "P0");
    assert.equal(acquisitionPack.generated_at, generatedAt);
    assert.equal(acquisitionPack.inputs.count_fit_sample_acquisition_queue, acquisitionQueuePath);
    assert.equal(acquisitionPack.inputs.clean_replay_candidate_queue, cleanQueuePath);
    assert.equal(acquisitionPack.summary.existing_candidate_task_count, 1);
    assert.equal(acquisitionPack.summary.fresh_capture_map_count, 1);
    assert.equal(acquisitionPack.summary.total_fresh_same_battle_target_after_all_existing_candidates_accepted, 29);
    assert.equal(reviewTemplate.generated_at, generatedAt);
    assert.equal(reviewTemplate.inputs.count_fit_sample_acquisition_pack, acquisitionPackPath);
    assert.equal(reviewTemplate.summary.existing_candidate_review_count, 1);
    assert.equal(reviewTemplate.summary.fresh_capture_template_count, 1);
    assert.equal(reviewTemplate.summary.pixel_training_label_allowed_count, 0);
    assert.equal(audit.generated_at, generatedAt);
    assert.equal(audit.status, "blocked");
    assert.equal(audit.summary.failed_check_count, 1);
    assert.equal(audit.inputs.default_weight_implementation_report, defaultWeightPath);
    assert.equal(audit.inputs.count_fit_sample_acquisition_queue, acquisitionQueuePath);
    assert.equal(audit.inputs.count_fit_sample_acquisition_pack, acquisitionPackPath);
    assert.equal(audit.inputs.count_fit_sample_review_template, reviewTemplatePath);
    assert.equal(audit.inputs.count_fit_sample_review_import, reviewImportPath);
    assert.equal(audit.summary.default_weight_implementation_status, "mismatch");
    assert.equal(audit.summary.default_weight_mismatched_map_count, 3);
    assert.equal(audit.summary.default_weight_authority_adoption_allowed, false);
    assert.equal(audit.summary.default_weight_authority_blocker_count, 1);
    assert.equal(audit.summary.count_fit_sample_acquisition_blocked_map_count, 1);
    assert.equal(audit.summary.count_fit_sample_acquisition_total_target_new_same_battle_samples, 30);
    assert.deepEqual(audit.summary.count_fit_sample_acquisition_blocked_maps, ["villa"]);
    assert.equal(audit.summary.count_fit_sample_acquisition_pack_existing_candidate_task_count, 1);
    assert.equal(audit.summary.count_fit_sample_acquisition_pack_fresh_capture_map_count, 1);
    assert.equal(audit.summary.count_fit_sample_review_template_existing_candidate_review_count, 1);
    assert.equal(audit.summary.count_fit_sample_review_template_fresh_capture_template_count, 1);
    assert.equal(audit.summary.count_fit_sample_review_import_accepted_sample_count, 0);
    assert.equal(audit.summary.count_fit_sample_review_import_blocked_entry_count, 1);
    assert.deepEqual(audit.default_weight_authority_blockers, ["fit_uses_partial_overlay_replay_samples"]);
    assert.equal(
        audit.checks.some((check) => check.id === "default_weight_implementation_report_applied" && check.passed === false),
        true
    );
    assert.equal(
        audit.checks.some((check) => check.id === "default_weight_authority_adoption_status_reported" && check.passed === true),
        true
    );
    assert.equal(
        audit.checks.some((check) => check.id === "count_fit_sample_acquisition_queue_covers_count_fit_blockers" && check.passed === true),
        true
    );
    assert.equal(
        audit.checks.some((check) => check.id === "count_fit_sample_acquisition_pack_covers_queue_blockers" && check.passed === true),
        true
    );
    assert.equal(
        audit.checks.some((check) => check.id === "count_fit_sample_review_template_covers_acquisition_pack" && check.passed === true),
        true
    );
    assert.equal(
        audit.checks.some((check) => check.id === "count_fit_readiness_consumes_review_import" && check.passed === true),
        true
    );
    assert.deepEqual(candidate.producer_strategy_candidate.skipped_map_reasons.villa, ["count_fit_readiness_failed"]);
    assert.equal(printed.join(""), `${auditPath}\n`);
});
