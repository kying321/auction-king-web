const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildProducerStrategyChainAuditReport,
    main,
    resolveArgs
} = require("../scripts/build_producer_strategy_chain_audit_report.js");

function makeCandidateContext(overrides = {}) {
    return {
        schema_version: "ak_producer_strategy_candidate_config_v1",
        generated_at: "2026-04-25T00:00:00.000Z",
        change_class: "RESEARCH_ONLY",
        usage: "shadow_replay_only",
        source_report: path.resolve("docs/research/2026-04-25-producer-strategy-architecture-report.json"),
        applied_maps: [],
        skipped_maps: ["villa"],
        skipped_map_reasons: {
            villa: ["count_fit_readiness_failed"]
        },
        replay_guard: "skip_candidate_replay_passed_false",
        count_fit_readiness_guard: "skip_count_fit_readiness_passed_false",
        default_config_update_allowed: false,
        ...overrides
    };
}

test("package exposes producer strategy chain audit report entry", () => {
    assert.match(
        packageJson.scripts["build:producer-strategy-chain-audit"] || "",
        /node\s+scripts\/build_producer_strategy_chain_audit_report\.js/
    );
});

test("resolveArgs accepts candidate, replay, diagnostics, architecture, and output paths", () => {
    const result = resolveArgs(["candidate.json", "count.json", "diagnostics.json", "architecture.json", "audit.json"]);

    assert.equal(result.candidateConfigPath, path.resolve("candidate.json"));
    assert.equal(result.countReplayReportPath, path.resolve("count.json"));
    assert.equal(result.replayDiagnosticsReportPath, path.resolve("diagnostics.json"));
    assert.equal(result.architectureReportPath, path.resolve("architecture.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
});

test("resolveArgs accepts default weight implementation path before output when provided", () => {
    const result = resolveArgs([
        "candidate.json",
        "count.json",
        "diagnostics.json",
        "architecture.json",
        "default-weight.json",
        "audit.json"
    ]);

    assert.equal(result.defaultWeightImplementationReportPath, path.resolve("default-weight.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
});

test("resolveArgs accepts count-fit acquisition queue path before output when provided", () => {
    const result = resolveArgs([
        "candidate.json",
        "count.json",
        "diagnostics.json",
        "architecture.json",
        "default-weight.json",
        "acquisition-queue.json",
        "audit.json"
    ]);

    assert.equal(result.defaultWeightImplementationReportPath, path.resolve("default-weight.json"));
    assert.equal(result.countFitSampleAcquisitionQueuePath, path.resolve("acquisition-queue.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
});

test("resolveArgs accepts count-fit acquisition pack path before output when provided", () => {
    const result = resolveArgs([
        "candidate.json",
        "count.json",
        "diagnostics.json",
        "architecture.json",
        "default-weight.json",
        "acquisition-queue.json",
        "acquisition-pack.json",
        "audit.json"
    ]);

    assert.equal(result.defaultWeightImplementationReportPath, path.resolve("default-weight.json"));
    assert.equal(result.countFitSampleAcquisitionQueuePath, path.resolve("acquisition-queue.json"));
    assert.equal(result.countFitSampleAcquisitionPackPath, path.resolve("acquisition-pack.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
});

test("resolveArgs accepts count-fit review template path before output when provided", () => {
    const result = resolveArgs([
        "candidate.json",
        "count.json",
        "diagnostics.json",
        "architecture.json",
        "default-weight.json",
        "acquisition-queue.json",
        "acquisition-pack.json",
        "review-template.json",
        "audit.json"
    ]);

    assert.equal(result.countFitSampleAcquisitionPackPath, path.resolve("acquisition-pack.json"));
    assert.equal(result.countFitSampleReviewTemplatePath, path.resolve("review-template.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
});

test("resolveArgs accepts count-fit readiness and review import paths before output when provided", () => {
    const result = resolveArgs([
        "candidate.json",
        "count.json",
        "diagnostics.json",
        "architecture.json",
        "default-weight.json",
        "acquisition-queue.json",
        "acquisition-pack.json",
        "review-template.json",
        "readiness.json",
        "review-import.json",
        "audit.json"
    ]);

    assert.equal(result.countFitSampleReviewTemplatePath, path.resolve("review-template.json"));
    assert.equal(result.countFitReadinessReportPath, path.resolve("readiness.json"));
    assert.equal(result.countFitSampleReviewImportPath, path.resolve("review-import.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
});

test("default output path uses the latest producer strategy chain audit report", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-25-producer-strategy-chain-audit-report.json"), true);
});

test("buildProducerStrategyChainAuditReport passes when replay and diagnostics share current candidate context", () => {
    const candidateContext = makeCandidateContext();
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: candidateContext },
        replayDiagnosticsReport: { candidate_config_context: candidateContext },
        architectureReport: {
            schema_version: "ak_producer_strategy_architecture_v1",
            summary: { map_count: 1, maps_ready_for_default_weight_update: 0 },
            maps: {
                villa: {
                    map_id: "villa",
                    gates: { count_fit_readiness_passed: false }
                }
            }
        },
        defaultWeightImplementationReport: {
            implementation_status: "applied",
            authority_adoption_allowed: false,
            authority_blockers: [
                "red_label_sample_count_below_default_update_gate",
                "fit_uses_partial_overlay_replay_samples"
            ],
            selected_multiplier: 1.25,
            summary: { mismatched_map_count: 0 }
        },
        countFitSampleAcquisitionQueue: {
            schema_version: "ak_count_fit_sample_acquisition_queue_v1",
            summary: {
                blocked_map_count: 1,
                total_target_new_same_battle_samples: 30,
                priority_counts: { P0: 1 }
            },
            items: [
                {
                    map_id: "villa",
                    priority: "P0",
                    two_sigma_count_fit_allowed: false,
                    target_new_same_battle_samples: 30
                }
            ]
        },
        countFitSampleAcquisitionPack: {
            schema_version: "ak_count_fit_sample_acquisition_pack_v1",
            summary: {
                blocked_map_count: 1,
                blocked_maps: ["villa"],
                existing_candidate_task_count: 2,
                fresh_capture_map_count: 1,
                total_fresh_same_battle_target_if_existing_candidates_fail: 30,
                total_fresh_same_battle_target_after_all_existing_candidates_accepted: 28
            }
        },
        countFitSampleReviewTemplate: {
            schema_version: "ak_count_fit_sample_review_template_v1",
            generated_at: "2026-04-25T00:00:00.000Z",
            summary: {
                existing_candidate_review_count: 2,
                fresh_capture_template_count: 1,
                pixel_training_label_allowed_count: 0,
                map_counts: { villa: 3 }
            },
            review_results: [
                { map_id: "villa", source_task_id: "complete_villa_a" },
                { map_id: "villa", source_task_id: "complete_villa_b" }
            ],
            fresh_capture_templates: [
                { map_id: "villa", source_task_id: "fresh_same_battle_villa" }
            ]
        },
        countFitReadinessReport: {
            packages: [
                {
                    source_path: path.resolve("docs/research/2026-04-25-count-fit-sample-review-import.json"),
                    schema_version: "ak_count_fit_sample_review_import_v1",
                    sample_count: 0
                }
            ]
        },
        countFitSampleReviewImport: {
            schema_version: "ak_count_fit_sample_review_import_v1",
            summary: {
                review_entry_count: 2,
                accepted_sample_count: 0,
                blocked_entry_count: 2
            },
            samples: []
        },
        paths: {
            architectureReportPath: candidateContext.source_report,
            countFitSampleAcquisitionQueuePath: path.resolve("docs/research/2026-04-25-count-fit-sample-acquisition-queue.json"),
            countFitSampleAcquisitionPackPath: path.resolve("docs/research/2026-04-25-count-fit-sample-acquisition-pack.json"),
            countFitSampleReviewTemplatePath: path.resolve("docs/research/2026-04-25-count-fit-sample-review-template.json"),
            countFitSampleReviewImportPath: path.resolve("docs/research/2026-04-25-count-fit-sample-review-import.json")
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "passed");
    assert.equal(report.summary.failed_check_count, 0);
    assert.equal(report.summary.default_weight_implementation_status, "applied");
    assert.equal(report.summary.default_weight_mismatched_map_count, 0);
    assert.equal(report.summary.default_weight_selected_multiplier, 1.25);
    assert.equal(report.summary.default_weight_authority_adoption_allowed, false);
    assert.equal(report.summary.default_weight_authority_blocker_count, 2);
    assert.deepEqual(report.default_weight_authority_blockers, [
        "red_label_sample_count_below_default_update_gate",
        "fit_uses_partial_overlay_replay_samples"
    ]);
    assert.equal(
        report.inputs.count_fit_sample_acquisition_queue,
        path.resolve("docs/research/2026-04-25-count-fit-sample-acquisition-queue.json")
    );
    assert.equal(
        report.inputs.count_fit_sample_acquisition_pack,
        path.resolve("docs/research/2026-04-25-count-fit-sample-acquisition-pack.json")
    );
    assert.equal(
        report.inputs.count_fit_sample_review_template,
        path.resolve("docs/research/2026-04-25-count-fit-sample-review-template.json")
    );
    assert.equal(
        report.inputs.count_fit_sample_review_import,
        path.resolve("docs/research/2026-04-25-count-fit-sample-review-import.json")
    );
    assert.equal(report.summary.count_fit_sample_acquisition_blocked_map_count, 1);
    assert.equal(report.summary.count_fit_sample_acquisition_total_target_new_same_battle_samples, 30);
    assert.deepEqual(report.summary.count_fit_sample_acquisition_priority_counts, { P0: 1 });
    assert.deepEqual(report.summary.count_fit_sample_acquisition_blocked_maps, ["villa"]);
    assert.equal(report.summary.count_fit_sample_acquisition_pack_existing_candidate_task_count, 2);
    assert.equal(report.summary.count_fit_sample_acquisition_pack_fresh_capture_map_count, 1);
    assert.equal(report.summary.count_fit_sample_review_template_existing_candidate_review_count, 2);
    assert.equal(report.summary.count_fit_sample_review_template_fresh_capture_template_count, 1);
    assert.equal(report.summary.count_fit_sample_review_template_pixel_training_label_allowed_count, 0);
    assert.equal(report.summary.count_fit_sample_review_import_accepted_sample_count, 0);
    assert.equal(report.summary.count_fit_sample_review_import_blocked_entry_count, 2);
    assert.equal(
        report.checks.some((check) => check.id === "default_weight_implementation_report_applied" && check.passed === true),
        true
    );
    assert.equal(
        report.checks.some((check) => check.id === "default_weight_authority_adoption_status_reported" && check.passed === true),
        true
    );
    assert.equal(
        report.checks.some((check) => check.id === "count_fit_sample_acquisition_queue_schema_present" && check.passed === true),
        true
    );
    assert.equal(
        report.checks.some((check) => check.id === "count_fit_sample_acquisition_queue_covers_count_fit_blockers" && check.passed === true),
        true
    );
    assert.equal(
        report.checks.some((check) => check.id === "count_fit_sample_acquisition_pack_covers_queue_blockers" && check.passed === true),
        true
    );
    assert.equal(
        report.checks.some((check) => check.id === "count_fit_sample_review_template_covers_acquisition_pack" && check.passed === true),
        true
    );
    assert.equal(
        report.checks.some((check) => check.id === "count_fit_sample_review_import_schema_present" && check.passed === true),
        true
    );
    assert.equal(
        report.checks.some((check) => check.id === "count_fit_readiness_consumes_review_import" && check.passed === true),
        true
    );
    assert.equal(report.blockers.length, 0);
});

test("buildProducerStrategyChainAuditReport blocks readiness reports that omit review import", () => {
    const candidateContext = makeCandidateContext();
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: candidateContext },
        replayDiagnosticsReport: { candidate_config_context: candidateContext },
        architectureReport: {
            schema_version: "ak_producer_strategy_architecture_v1",
            summary: { map_count: 1, maps_ready_for_default_weight_update: 0 },
            maps: {
                villa: {
                    map_id: "villa",
                    gates: { count_fit_readiness_passed: false }
                }
            }
        },
        defaultWeightImplementationReport: {
            implementation_status: "applied",
            authority_adoption_allowed: false,
            authority_blockers: ["fit_uses_partial_overlay_replay_samples"],
            selected_multiplier: 1.25,
            summary: { mismatched_map_count: 0 }
        },
        countFitSampleAcquisitionQueue: {
            schema_version: "ak_count_fit_sample_acquisition_queue_v1",
            summary: { blocked_map_count: 1, total_target_new_same_battle_samples: 30, priority_counts: { P0: 1 } },
            items: [{ map_id: "villa", priority: "P0", two_sigma_count_fit_allowed: false }]
        },
        countFitSampleAcquisitionPack: {
            schema_version: "ak_count_fit_sample_acquisition_pack_v1",
            summary: { blocked_map_count: 1, blocked_maps: ["villa"], existing_candidate_task_count: 0, fresh_capture_map_count: 1 },
            fresh_capture_tasks: [{ map_id: "villa" }]
        },
        countFitSampleReviewTemplate: {
            schema_version: "ak_count_fit_sample_review_template_v1",
            summary: { existing_candidate_review_count: 0, fresh_capture_template_count: 1, pixel_training_label_allowed_count: 0 },
            fresh_capture_templates: [{ map_id: "villa" }]
        },
        countFitReadinessReport: {
            packages: []
        },
        countFitSampleReviewImport: {
            schema_version: "ak_count_fit_sample_review_import_v1",
            summary: { accepted_sample_count: 0, blocked_entry_count: 0 },
            samples: []
        },
        paths: {
            architectureReportPath: candidateContext.source_report,
            countFitSampleReviewImportPath: path.resolve("docs/research/2026-04-25-count-fit-sample-review-import.json")
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "blocked");
    assert.match(report.blockers.join(","), /count_fit_readiness_missing_review_import_package/);
});

test("buildProducerStrategyChainAuditReport blocks stale count-fit acquisition queue coverage", () => {
    const candidateContext = makeCandidateContext();
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: candidateContext },
        replayDiagnosticsReport: { candidate_config_context: candidateContext },
        architectureReport: {
            schema_version: "ak_producer_strategy_architecture_v1",
            summary: { map_count: 2, maps_ready_for_default_weight_update: 0 },
            maps: {
                villa: {
                    map_id: "villa",
                    gates: { count_fit_readiness_passed: false }
                },
                shipping: {
                    map_id: "shipping",
                    gates: { count_fit_readiness_passed: false }
                }
            }
        },
        defaultWeightImplementationReport: {
            implementation_status: "applied",
            authority_adoption_allowed: false,
            authority_blockers: ["fit_uses_partial_overlay_replay_samples"],
            selected_multiplier: 1.25,
            summary: { mismatched_map_count: 0 }
        },
        countFitSampleAcquisitionQueue: {
            schema_version: "ak_count_fit_sample_acquisition_queue_v1",
            summary: {
                blocked_map_count: 1,
                total_target_new_same_battle_samples: 30,
                priority_counts: { P0: 1 }
            },
            items: [
                {
                    map_id: "villa",
                    priority: "P0",
                    two_sigma_count_fit_allowed: false,
                    target_new_same_battle_samples: 30
                }
            ]
        },
        paths: {
            architectureReportPath: candidateContext.source_report
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "blocked");
    assert.match(report.blockers.join(","), /count_fit_sample_acquisition_queue_missing_blocked_maps/);
});

test("buildProducerStrategyChainAuditReport blocks stale count-fit acquisition pack coverage", () => {
    const candidateContext = makeCandidateContext();
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: candidateContext },
        replayDiagnosticsReport: { candidate_config_context: candidateContext },
        architectureReport: {
            schema_version: "ak_producer_strategy_architecture_v1",
            summary: { map_count: 1, maps_ready_for_default_weight_update: 0 },
            maps: {
                villa: {
                    map_id: "villa",
                    gates: { count_fit_readiness_passed: false }
                }
            }
        },
        defaultWeightImplementationReport: {
            implementation_status: "applied",
            authority_adoption_allowed: false,
            authority_blockers: ["fit_uses_partial_overlay_replay_samples"],
            selected_multiplier: 1.25,
            summary: { mismatched_map_count: 0 }
        },
        countFitSampleAcquisitionQueue: {
            schema_version: "ak_count_fit_sample_acquisition_queue_v1",
            summary: {
                blocked_map_count: 1,
                total_target_new_same_battle_samples: 30,
                priority_counts: { P0: 1 }
            },
            items: [
                {
                    map_id: "villa",
                    priority: "P0",
                    two_sigma_count_fit_allowed: false,
                    target_new_same_battle_samples: 30
                }
            ]
        },
        countFitSampleAcquisitionPack: {
            schema_version: "ak_count_fit_sample_acquisition_pack_v1",
            summary: {
                blocked_map_count: 1,
                blocked_maps: ["shipping"],
                existing_candidate_task_count: 0,
                fresh_capture_map_count: 1
            }
        },
        paths: {
            architectureReportPath: candidateContext.source_report
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "blocked");
    assert.match(report.blockers.join(","), /count_fit_sample_acquisition_pack_missing_queue_blocked_maps/);
});

test("buildProducerStrategyChainAuditReport blocks stale count-fit review template coverage", () => {
    const candidateContext = makeCandidateContext();
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: candidateContext },
        replayDiagnosticsReport: { candidate_config_context: candidateContext },
        architectureReport: {
            schema_version: "ak_producer_strategy_architecture_v1",
            summary: { map_count: 1, maps_ready_for_default_weight_update: 0 },
            maps: {
                villa: {
                    map_id: "villa",
                    gates: { count_fit_readiness_passed: false }
                }
            }
        },
        defaultWeightImplementationReport: {
            implementation_status: "applied",
            authority_adoption_allowed: false,
            authority_blockers: ["fit_uses_partial_overlay_replay_samples"],
            selected_multiplier: 1.25,
            summary: { mismatched_map_count: 0 }
        },
        countFitSampleAcquisitionQueue: {
            schema_version: "ak_count_fit_sample_acquisition_queue_v1",
            summary: { blocked_map_count: 1, total_target_new_same_battle_samples: 30, priority_counts: { P0: 1 } },
            items: [{ map_id: "villa", priority: "P0", two_sigma_count_fit_allowed: false }]
        },
        countFitSampleAcquisitionPack: {
            schema_version: "ak_count_fit_sample_acquisition_pack_v1",
            summary: {
                blocked_map_count: 1,
                blocked_maps: ["villa"],
                existing_candidate_task_count: 2,
                fresh_capture_map_count: 1
            },
            existing_candidate_tasks: [{ map_id: "villa" }, { map_id: "villa" }],
            fresh_capture_tasks: [{ map_id: "villa" }]
        },
        countFitSampleReviewTemplate: {
            schema_version: "ak_count_fit_sample_review_template_v1",
            summary: {
                existing_candidate_review_count: 1,
                fresh_capture_template_count: 1,
                pixel_training_label_allowed_count: 0
            },
            review_results: [{ map_id: "villa" }],
            fresh_capture_templates: [{ map_id: "villa" }]
        },
        paths: {
            architectureReportPath: candidateContext.source_report
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "blocked");
    assert.match(report.blockers.join(","), /count_fit_sample_review_template_task_count_mismatch/);
});

test("buildProducerStrategyChainAuditReport blocks default weight implementation mismatches", () => {
    const candidateContext = makeCandidateContext();
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: candidateContext },
        replayDiagnosticsReport: { candidate_config_context: candidateContext },
        architectureReport: { schema_version: "ak_producer_strategy_architecture_v1", summary: { maps_ready_for_default_weight_update: 0 } },
        defaultWeightImplementationReport: {
            implementation_status: "mismatch",
            authority_adoption_allowed: false,
            authority_blockers: ["fit_uses_partial_overlay_replay_samples"],
            selected_multiplier: 1.25,
            summary: { mismatched_map_count: 1 }
        },
        paths: {
            architectureReportPath: candidateContext.source_report
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "blocked");
    assert.match(report.blockers.join(","), /default_weight_implementation_mismatch/);
});

test("buildProducerStrategyChainAuditReport blocks missing default weight authority adoption metadata", () => {
    const candidateContext = makeCandidateContext();
    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: candidateContext },
        replayDiagnosticsReport: { candidate_config_context: candidateContext },
        architectureReport: { schema_version: "ak_producer_strategy_architecture_v1", summary: { maps_ready_for_default_weight_update: 0 } },
        defaultWeightImplementationReport: {
            implementation_status: "applied",
            selected_multiplier: 1.25,
            summary: { mismatched_map_count: 0 }
        },
        paths: {
            architectureReportPath: candidateContext.source_report
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "blocked");
    assert.match(report.blockers.join(","), /default_weight_authority_adoption_metadata_missing/);
});

test("buildProducerStrategyChainAuditReport blocks stale replay candidate context", () => {
    const candidateContext = makeCandidateContext();
    const staleContext = makeCandidateContext({
        source_report: path.resolve("docs/research/2026-04-24-producer-strategy-architecture-report.json"),
        count_fit_readiness_guard: undefined
    });
    delete staleContext.count_fit_readiness_guard;

    const report = buildProducerStrategyChainAuditReport({
        candidateConfig: { producer_strategy_candidate: candidateContext },
        countReplayReport: { candidate_config_context: staleContext },
        replayDiagnosticsReport: { candidate_config_context: staleContext },
        architectureReport: { schema_version: "ak_producer_strategy_architecture_v1", summary: { maps_ready_for_default_weight_update: 0 } },
        paths: {
            architectureReportPath: candidateContext.source_report
        },
        generatedAt: "2026-04-25T00:01:00.000Z"
    });

    assert.equal(report.status, "blocked");
    assert.match(report.blockers.join(","), /count_replay_candidate_context_mismatch/);
    assert.match(report.blockers.join(","), /count_fit_readiness_guard_missing_from_replay_context/);
    assert.match(report.blockers.join(","), /legacy_strategy_source_report_in_replay_context/);
});

test("main writes producer strategy chain audit JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-chain-audit-"));
    const candidatePath = path.join(tempDir, "candidate.json");
    const countPath = path.join(tempDir, "count.json");
    const diagnosticsPath = path.join(tempDir, "diagnostics.json");
    const architecturePath = path.join(tempDir, "architecture.json");
    const outputPath = path.join(tempDir, "audit.json");
    const candidateContext = makeCandidateContext({
        source_report: architecturePath
    });

    fs.writeFileSync(candidatePath, JSON.stringify({ producer_strategy_candidate: candidateContext }, null, 2));
    fs.writeFileSync(countPath, JSON.stringify({ candidate_config_context: candidateContext }, null, 2));
    fs.writeFileSync(diagnosticsPath, JSON.stringify({ candidate_config_context: candidateContext }, null, 2));
    fs.writeFileSync(architecturePath, JSON.stringify({
        schema_version: "ak_producer_strategy_architecture_v1",
        summary: { maps_ready_for_default_weight_update: 0 }
    }, null, 2));
    const defaultWeightPath = path.join(tempDir, "default-weight.json");
    fs.writeFileSync(defaultWeightPath, JSON.stringify({
        implementation_status: "applied",
        authority_adoption_allowed: false,
        authority_blockers: [
            "red_label_sample_count_below_default_update_gate",
            "fit_uses_partial_overlay_replay_samples"
        ],
        selected_multiplier: 1.25,
        summary: { mismatched_map_count: 0 }
    }, null, 2));
    const acquisitionQueuePath = path.join(tempDir, "acquisition-queue.json");
    fs.writeFileSync(acquisitionQueuePath, JSON.stringify({
        schema_version: "ak_count_fit_sample_acquisition_queue_v1",
        summary: {
            blocked_map_count: 0,
            total_target_new_same_battle_samples: 0,
            priority_counts: {}
        },
        items: []
    }, null, 2));
    const acquisitionPackPath = path.join(tempDir, "acquisition-pack.json");
    fs.writeFileSync(acquisitionPackPath, JSON.stringify({
        schema_version: "ak_count_fit_sample_acquisition_pack_v1",
        summary: {
            blocked_map_count: 0,
            blocked_maps: [],
            existing_candidate_task_count: 0,
            fresh_capture_map_count: 0
        },
        existing_candidate_tasks: [],
        fresh_capture_tasks: []
    }, null, 2));
    const reviewTemplatePath = path.join(tempDir, "review-template.json");
    fs.writeFileSync(reviewTemplatePath, JSON.stringify({
        schema_version: "ak_count_fit_sample_review_template_v1",
        summary: {
            existing_candidate_review_count: 0,
            fresh_capture_template_count: 0,
            pixel_training_label_allowed_count: 0
        },
        review_results: [],
        fresh_capture_templates: []
    }, null, 2));
    const readinessPath = path.join(tempDir, "readiness.json");
    const reviewImportPath = path.join(tempDir, "review-import.json");
    fs.writeFileSync(readinessPath, JSON.stringify({
        packages: [
            {
                source_path: reviewImportPath,
                schema_version: "ak_count_fit_sample_review_import_v1",
                sample_count: 0
            }
        ]
    }, null, 2));
    fs.writeFileSync(reviewImportPath, JSON.stringify({
        schema_version: "ak_count_fit_sample_review_import_v1",
        summary: {
            review_entry_count: 0,
            accepted_sample_count: 0,
            blocked_entry_count: 0
        },
        samples: []
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            candidatePath,
            countPath,
            diagnosticsPath,
            architecturePath,
            defaultWeightPath,
            acquisitionQueuePath,
            acquisitionPackPath,
            reviewTemplatePath,
            readinessPath,
            reviewImportPath,
            outputPath
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.schema_version, "ak_producer_strategy_chain_audit_v1");
    assert.equal(report.status, "passed");
    assert.equal(report.inputs.default_weight_implementation_report, defaultWeightPath);
    assert.equal(report.inputs.count_fit_sample_acquisition_queue, acquisitionQueuePath);
    assert.equal(report.inputs.count_fit_sample_acquisition_pack, acquisitionPackPath);
    assert.equal(report.inputs.count_fit_sample_review_template, reviewTemplatePath);
    assert.equal(report.inputs.count_fit_sample_review_import, reviewImportPath);
    assert.equal(report.summary.default_weight_authority_adoption_allowed, false);
    assert.equal(report.summary.count_fit_sample_acquisition_blocked_map_count, 0);
    assert.equal(report.summary.count_fit_sample_acquisition_pack_existing_candidate_task_count, 0);
    assert.equal(report.summary.count_fit_sample_review_template_existing_candidate_review_count, 0);
    assert.equal(report.summary.count_fit_sample_review_import_accepted_sample_count, 0);
    assert.match(markdown, /authority adoption allowed: `false`/);
    assert.match(markdown, /count-fit acquisition blocked maps: `0`/);
    assert.match(markdown, /count-fit acquisition existing candidate tasks: `0`/);
    assert.match(markdown, /count-fit review template existing drafts: `0`/);
    assert.match(markdown, /red_label_sample_count_below_default_update_gate/);
    assert.match(markdown, /default_weight_implementation_report_applied/);
    assert.match(markdown, /count_fit_sample_acquisition_queue_schema_present/);
    assert.match(markdown, /count_fit_sample_acquisition_pack_schema_present/);
    assert.match(markdown, /count_fit_sample_review_template_schema_present/);
    assert.match(markdown, /count_fit_sample_review_import_schema_present/);
    assert.match(markdown, /count_fit_readiness_consumes_review_import/);
    assert.match(markdown, /producer strategy chain audit/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
