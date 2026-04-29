const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildManualConfirmationAuthorityHandoffGate,
    formatManualConfirmationAuthorityHandoffGateMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_manual_confirmation_authority_handoff_gate.js");

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildIngestReportFixture(overrides = {}) {
    return {
        schema_version: "ak_latest_manual_confirmation_ingest_v1",
        generated_at: "2026-04-26T14:00:00.000+08:00",
        summary: {
            status: "sample_count_below_minimum",
            accepted_sample_count: 1,
            blocked_entry_count: 0,
            manual_candidate_replay_passed: false,
            recommended_next_action: "collect_more_human_confirmed_count_fit_samples"
        },
        readiness: {
            authority_sample_import_ready: true,
            replay_candidate_ready: false,
            default_weight_update_allowed: false
        },
        blockers: ["accepted_sample_count_below_minimum"],
        ...overrides
    };
}

function buildReviewImportFixture(overrides = {}) {
    return {
        schema_version: "ak_count_fit_sample_review_import_v1",
        generated_at: "2026-04-26T14:00:00.000+08:00",
        export_kind: "count_fit_same_battle_samples",
        summary: {
            review_entry_count: 1,
            accepted_sample_count: 1,
            blocked_entry_count: 0,
            blocker_reason_counts: {},
            map_counts: {
                sunken_ship: 1
            }
        },
        samples: [
            {
                record_type: "battle_sample",
                id: "sunken_manual_case",
                map_id: "sunken_ship",
                observed_state: {
                    r1_total_items: 21
                },
                actual_counts: {
                    w: 1,
                    g: 2,
                    b: 3,
                    p: 4,
                    o: 5,
                    r: 6
                },
                source_kind: "count_fit_manual_review",
                metadata: {
                    count_fit_review: {
                        event_timestamp: "2026-04-25T18:19:20.767Z",
                        actual_counts_source: "manual_review"
                    }
                }
            }
        ],
        ...overrides
    };
}

function buildManualGateFixture(overrides = {}) {
    return {
        schema_version: "ak_manual_count_prior_shadow_candidate_replay_gate_v1",
        generated_at: "2026-04-26T14:00:00.000+08:00",
        summary: {
            accepted_sample_count: 1,
            evaluated_sample_count: 1,
            candidate_replay_passed: false,
            promotion_allowed: false,
            promotion_status: "blocked_manual_shadow_replay_gate",
            recommended_next_action: "collect_more_human_confirmed_count_fit_samples",
            blockers: [
                "manual_shadow_candidate_not_directly_deployable",
                "accepted_sample_count_below_minimum"
            ]
        },
        ...overrides
    };
}

test("package exposes manual confirmation authority handoff gate builder", () => {
    assert.equal(
        packageJson.scripts["build:manual-confirmation-authority-handoff-gate"],
        "node scripts/build_manual_confirmation_authority_handoff_gate.js"
    );
    assert.match(
        packageJson.scripts["build:p0-manual-confirmation-authority-handoff-gate"] || "",
        /scripts\/build_manual_confirmation_authority_handoff_gate\.js .*2026-04-27-sunken-ship-p0-latest-manual-confirmation-ingest-report\.json/
    );
    assert.match(
        packageJson.scripts["build:p0-manual-confirmation-authority-handoff-gate"] || "",
        /2026-04-27-sunken-ship-p0-manual-confirmation-authority-handoff-gate\.json/
    );
    assert.match(
        packageJson.scripts["build:p1-manual-confirmation-authority-handoff-gate"] || "",
        /scripts\/build_manual_confirmation_authority_handoff_gate\.js .*2026-04-27-sunken-ship-p1-latest-manual-confirmation-ingest-report\.json/
    );
    assert.match(
        packageJson.scripts["build:p1-manual-confirmation-authority-handoff-gate"] || "",
        /2026-04-27-sunken-ship-p1-manual-confirmation-authority-handoff-gate\.json/
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_manual_confirmation_authority_handoff_gate\.js/);
});

test("resolveArgs accepts report paths, output path, and generated time", () => {
    const result = resolveArgs([
        "ingest.json",
        "import.json",
        "manual-gate.json",
        "handoff.json",
        "--generated-at=2026-04-26T14:10:00.000+08:00"
    ]);

    assert.equal(result.ingestReportPath, path.resolve("ingest.json"));
    assert.equal(result.reviewImportPath, path.resolve("import.json"));
    assert.equal(result.manualCandidateGatePath, path.resolve("manual-gate.json"));
    assert.equal(result.outputPath, path.resolve("handoff.json"));
    assert.equal(result.generatedAt, "2026-04-26T14:10:00.000+08:00");
});

test("default output path targets manual confirmation authority handoff gate artifact", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-26-manual-confirmation-authority-handoff-gate.json"), true);
});

test("buildManualConfirmationAuthorityHandoffGate blocks when manual confirmation download is missing", () => {
    const report = buildManualConfirmationAuthorityHandoffGate({
        ingestReport: buildIngestReportFixture({
            summary: {
                status: "missing_source",
                accepted_sample_count: 0,
                blocked_entry_count: 0,
                manual_candidate_replay_passed: false,
                recommended_next_action: "download_human_approved_manual_confirmation_json"
            },
            readiness: {
                authority_sample_import_ready: false,
                replay_candidate_ready: false,
                default_weight_update_allowed: false
            },
            blockers: ["missing_manual_confirmation_download"]
        }),
        reviewImport: null,
        manualCandidateGate: null,
        generatedAt: "2026-04-26T14:10:00.000+08:00"
    });

    assert.equal(report.summary.authority_sample_merge_allowed, false);
    assert.equal(report.summary.default_weight_update_allowed, false);
    assert.match(report.blockers.join(","), /missing_manual_confirmation_download/);
    assert.match(report.blockers.join(","), /missing_count_fit_sample_review_import/);
    assert.equal(report.commands.authority_sample_merge, null);
});

test("buildManualConfirmationAuthorityHandoffGate allows only authority sample merge for clean manual samples", () => {
    const report = buildManualConfirmationAuthorityHandoffGate({
        ingestReport: buildIngestReportFixture(),
        reviewImport: buildReviewImportFixture(),
        manualCandidateGate: buildManualGateFixture(),
        generatedAt: "2026-04-26T14:10:00.000+08:00",
        paths: {
            reviewImportPath: "/repo/docs/research/import.json"
        }
    });

    assert.equal(report.summary.authority_sample_merge_allowed, true);
    assert.equal(report.summary.replay_candidate_ready, false);
    assert.equal(report.summary.default_weight_update_allowed, false);
    assert.deepEqual(report.blockers, ["manual_candidate_replay_gate_not_passed"]);
    assert.match(
        report.commands.authority_sample_merge,
        /npm run build:authority-from-samples -- docs\/research\/import\.json --merge-existing/
    );
    assert.match(report.default_weight_update_blockers.join(","), /default_weight_update_requires_separate_promotion_gate/);
});

test("buildManualConfirmationAuthorityHandoffGate blocks sample merge when import has blocked entries", () => {
    const report = buildManualConfirmationAuthorityHandoffGate({
        ingestReport: buildIngestReportFixture({
            summary: {
                status: "partial_or_invalid_confirmation",
                accepted_sample_count: 1,
                blocked_entry_count: 1,
                manual_candidate_replay_passed: false,
                recommended_next_action: "fix_manual_confirmation_counts"
            },
            readiness: {
                authority_sample_import_ready: false,
                replay_candidate_ready: false,
                default_weight_update_allowed: false
            },
            blockers: ["manual_confirmation_import_contains_blocked_entries"]
        }),
        reviewImport: buildReviewImportFixture({
            summary: {
                review_entry_count: 2,
                accepted_sample_count: 1,
                blocked_entry_count: 1,
                blocker_reason_counts: {
                    actual_counts_total_mismatch: 1
                },
                map_counts: {
                    sunken_ship: 1
                }
            }
        }),
        manualCandidateGate: buildManualGateFixture(),
        generatedAt: "2026-04-26T14:10:00.000+08:00"
    });

    assert.equal(report.summary.authority_sample_merge_allowed, false);
    assert.match(report.blockers.join(","), /manual_confirmation_import_contains_blocked_entries/);
    assert.match(report.blockers.join(","), /count_fit_import_contains_blocked_entries/);
    assert.equal(report.commands.authority_sample_merge, null);
});

test("buildManualConfirmationAuthorityHandoffGate points unapproved drafts back to manual approval", () => {
    const report = buildManualConfirmationAuthorityHandoffGate({
        ingestReport: buildIngestReportFixture({
            summary: {
                status: "no_accepted_samples",
                accepted_sample_count: 0,
                blocked_entry_count: 2,
                manual_candidate_replay_passed: false,
                recommended_next_action: "collect_human_confirmed_count_fit_samples"
            },
            readiness: {
                authority_sample_import_ready: false,
                replay_candidate_ready: false,
                default_weight_update_allowed: false
            },
            blockers: [
                "missing_accepted_manual_count_fit_samples",
                "manual_confirmation_import_contains_blocked_entries"
            ]
        }),
        reviewImport: buildReviewImportFixture({
            summary: {
                review_entry_count: 2,
                accepted_sample_count: 0,
                blocked_entry_count: 2,
                blocker_reason_counts: {
                    status_not_approved_for_import: 2,
                    actual_counts_total_mismatch: 1
                },
                map_counts: {}
            },
            samples: []
        }),
        manualCandidateGate: buildManualGateFixture({
            summary: {
                accepted_sample_count: 0,
                evaluated_sample_count: 0,
                candidate_replay_passed: false,
                promotion_allowed: false,
                promotion_status: "blocked_manual_shadow_replay_gate",
                recommended_next_action: "collect_human_confirmed_count_fit_samples",
                blockers: [
                    "manual_shadow_candidate_not_directly_deployable",
                    "missing_accepted_count_fit_samples"
                ]
            }
        }),
        generatedAt: "2026-04-27T13:10:00.000Z"
    });

    assert.equal(report.summary.authority_sample_merge_allowed, false);
    assert.equal(report.summary.accepted_sample_count, 0);
    assert.equal(report.summary.blocked_entry_count, 2);
    assert.equal(
        report.summary.recommended_next_action,
        "approve_manual_confirmation_counts_then_download_json"
    );
    assert.match(report.blockers.join(","), /status_not_approved_for_import/);
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-confirm-handoff-"));
    const ingestPath = path.join(tempDir, "ingest.json");
    const importPath = path.join(tempDir, "import.json");
    const manualGatePath = path.join(tempDir, "manual-gate.json");
    const outputPath = path.join(tempDir, "handoff.json");
    writeJson(ingestPath, buildIngestReportFixture());
    writeJson(importPath, buildReviewImportFixture());
    writeJson(manualGatePath, buildManualGateFixture());

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            ingestPath,
            importPath,
            manualGatePath,
            outputPath,
            "--generated-at=2026-04-26T14:10:00.000+08:00"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.authority_sample_merge_allowed, true);
    assert.match(markdown, /Manual Confirmation Authority Handoff Gate/);
    assert.match(markdown, /Authority sample merge allowed: `true`/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});

test("formatManualConfirmationAuthorityHandoffGateMarkdown renders blockers and commands", () => {
    const report = buildManualConfirmationAuthorityHandoffGate({
        ingestReport: buildIngestReportFixture(),
        reviewImport: buildReviewImportFixture(),
        manualCandidateGate: buildManualGateFixture(),
        generatedAt: "2026-04-26T14:10:00.000+08:00"
    });
    const markdown = formatManualConfirmationAuthorityHandoffGateMarkdown(report, "/tmp/handoff.json");

    assert.match(markdown, /manual_candidate_replay_gate_not_passed/);
    assert.match(markdown, /build:authority-from-samples/);
});
