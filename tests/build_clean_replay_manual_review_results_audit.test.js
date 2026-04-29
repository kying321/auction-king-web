const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildCleanReplayManualReviewResultsAudit,
    formatManualReviewResultsAuditMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_clean_replay_manual_review_results_audit.js");

function buildQueueFixture() {
    return {
        schema_version: "ak_clean_replay_candidate_queue_v1",
        items: [
            {
                id: "review_villa_p0",
                priority: "P0",
                recommended_action: "pair_observed_state_and_actual_counts",
                basename: "villa.png",
                source_image_path: "/tmp/villa.png",
                confirmed_sample_id: "confirmed_villa",
                map_id: "villa",
                map_variant_id: "unknown_villa",
                pixel_quality_draft: {
                    status: "review_only",
                    training_label_allowed: false,
                    counts: { w: 0, g: 1, b: 1, p: 0, o: 2, r: 0 },
                    total: 4
                },
                pixel_vs_settlement_total: {
                    status: "pixel_partial_under_settlement_total",
                    training_label_allowed: false
                },
                manual_review_template: {
                    output_target: "clean_replay_sample_candidate",
                    training_label_allowed: false
                }
            },
            {
                id: "review_p1",
                priority: "P1",
                recommended_action: "manual_confirm_settlement_then_pair_observed_state",
                basename: "candidate.png",
                source_image_path: "/tmp/candidate.png",
                map_id: "villa",
                manual_review_template: {
                    output_target: "review_or_discard_candidate",
                    training_label_allowed: false
                }
            }
        ]
    };
}

test("package exposes clean replay manual review results audit entry", () => {
    assert.match(
        packageJson.scripts["build:clean-replay-manual-review-results-audit"] || "",
        /node\s+scripts\/build_clean_replay_manual_review_results_audit\.js/
    );
});

test("resolveArgs accepts queue, manual review results, output path, and fail-on-blockers flag", () => {
    const result = resolveArgs([
        "queue.json",
        "manual-review-results.json",
        "audit.json",
        "--fail-on-blockers"
    ]);

    assert.equal(result.queuePath, path.resolve("queue.json"));
    assert.equal(result.manualReviewResultsPath, path.resolve("manual-review-results.json"));
    assert.equal(result.outputPath, path.resolve("audit.json"));
    assert.equal(result.failOnBlockers, true);
});

test("buildCleanReplayManualReviewResultsAudit marks approved manual clean replay rows exportable", () => {
    const audit = buildCleanReplayManualReviewResultsAudit({
        queue: buildQueueFixture(),
        manualReviewResults: {
            review_results: [
                {
                    source_queue_id: "review_villa_p0",
                    status: "approved_clean_replay",
                    observed_state: { r1_total_items: 48 },
                    actual_counts: {
                        w: 20,
                        g: 12,
                        b: 11,
                        p: 3,
                        o: 2,
                        r: 0,
                        total_items: 48
                    },
                    actual_counts_source: "manual_review"
                }
            ]
        },
        generatedAt: "2026-04-24T12:00:00.000Z"
    });

    assert.equal(audit.schema_version, "ak_clean_replay_manual_review_results_audit_v1");
    assert.equal(audit.change_class, "RESEARCH_ONLY");
    assert.equal(audit.summary.review_result_count, 1);
    assert.equal(audit.summary.audit_ready_count, 1);
    assert.equal(audit.summary.blocked_count, 0);
    assert.equal(audit.summary.pixel_training_label_allowed_count, 0);
    assert.deepEqual(audit.entries[0].blockers, []);
    assert.deepEqual(audit.entries[0].warnings, []);
    assert.equal(audit.entries[0].audit_status, "audit_ready");
    assert.equal(audit.entries[0].actual_counts_total_check, "matches_total_items");
});

test("buildCleanReplayManualReviewResultsAudit blocks pixel sources and training label flips", () => {
    const audit = buildCleanReplayManualReviewResultsAudit({
        queue: buildQueueFixture(),
        manualReviewResults: [
            {
                source_queue_id: "review_villa_p0",
                status: "approved_clean_replay",
                observed_state: { r1_total_items: 48 },
                actual_counts: { o: 2, r: 0, total_items: 48 },
                actual_counts_source: "pixel_quality_draft",
                pixel_quality_draft: {
                    status: "review_only",
                    training_label_allowed: true,
                    counts: { o: 2, r: 0 },
                    total: 2
                }
            }
        ]
    });

    assert.equal(audit.summary.audit_ready_count, 0);
    assert.equal(audit.summary.blocked_count, 1);
    assert.equal(audit.summary.pixel_training_label_allowed_count, 1);
    assert.equal(audit.summary.blocker_reason_counts.actual_counts_source_pixel_draft, 1);
    assert.equal(audit.summary.blocker_reason_counts.pixel_quality_draft_training_label_enabled, 1);
    assert.equal(audit.entries[0].audit_status, "blocked");
});

test("buildCleanReplayManualReviewResultsAudit requires partial status when counts are under total", () => {
    const audit = buildCleanReplayManualReviewResultsAudit({
        queue: buildQueueFixture(),
        manualReviewResults: [
            {
                source_queue_id: "review_villa_p0",
                status: "approved_clean_replay",
                observed_state: { r1_total_items: 48 },
                actual_counts: { o: 2, r: 0, total_items: 48 },
                actual_counts_source: "manual_review"
            },
            {
                source_queue_id: "review_villa_p0",
                status: "clean_replay_partial",
                observed_state: { r1_total_items: 48 },
                actual_counts: { o: 2, r: 0, total_items: 48 },
                actual_counts_source: "manual_review"
            }
        ]
    });

    assert.equal(audit.summary.audit_ready_count, 1);
    assert.equal(audit.summary.blocked_count, 1);
    assert.equal(audit.summary.blocker_reason_counts.partial_counts_require_clean_replay_partial_status, 1);
    assert.equal(audit.entries[0].audit_status, "blocked");
    assert.equal(audit.entries[1].audit_status, "audit_ready");
    assert.equal(audit.entries[1].actual_counts_total_check, "partial_counts_under_total_items");
});

test("formatManualReviewResultsAuditMarkdown summarizes audit blockers and ready rows", () => {
    const markdown = formatManualReviewResultsAuditMarkdown({
        summary: {
            review_result_count: 2,
            audit_ready_count: 1,
            blocked_count: 1,
            pending_count: 0,
            blocker_reason_counts: { actual_counts_source_pixel_draft: 1 },
            warning_reason_counts: {},
            pixel_training_label_allowed_count: 1
        },
        entries: [
            {
                source_queue_id: "review_villa_p0",
                basename: "villa.png",
                status: "approved_clean_replay",
                audit_status: "blocked",
                actual_counts_total_check: "matches_total_items",
                blockers: ["actual_counts_source_pixel_draft"],
                warnings: []
            }
        ]
    }, "audit.json");

    assert.match(markdown, /manual review results audit/);
    assert.match(markdown, /audit ready: `1`/);
    assert.match(markdown, /blocked: `1`/);
    assert.match(markdown, /actual_counts_source_pixel_draft/);
    assert.match(markdown, /training-label from pixel: `1`/);
});

test("main writes audit JSON and markdown and fails on blockers when requested", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-review-audit-"));
    const queuePath = path.join(tempDir, "queue.json");
    const manualPath = path.join(tempDir, "manual_review_results.json");
    const outputPath = path.join(tempDir, "manual_review_results_audit.json");

    fs.writeFileSync(queuePath, JSON.stringify(buildQueueFixture(), null, 2));
    fs.writeFileSync(manualPath, JSON.stringify({
        review_results: [
            {
                source_queue_id: "review_villa_p0",
                status: "approved_clean_replay",
                observed_state: { r1_total_items: 48 },
                actual_counts: { o: 2, r: 0, total_items: 48 },
                actual_counts_source: "pixel_quality_draft"
            }
        ]
    }, null, 2));

    assert.throws(
        () => main([queuePath, manualPath, outputPath, "--fail-on-blockers"]),
        /manual review audit blockers: 1/
    );

    const audit = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(audit.summary.blocked_count, 1);
    assert.match(markdown, /manual review results audit/);
});
