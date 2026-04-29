const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildConstraintSet,
    buildP1ManualCountCandidateShortlist,
    enumerateCandidates,
    main,
    resolveArgs
} = require("../scripts/build_p1_manual_count_candidate_shortlist.js");

function buildConfirmationFixture() {
    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: "2026-04-27T13:35:00.000Z",
        summary: {
            manual_confirmation_draft_count: 1,
            import_ready_without_human_action: false,
            pixel_training_label_allowed_count: 0
        },
        fresh_capture_templates: [
            {
                source_task_id: "capture_full_count_sunken_ship_case",
                map_id: "sunken_ship",
                review_priority: "P1",
                samples: [
                    {
                        source_task_id: "capture_full_count_sunken_ship_case",
                        status: "needs_human_confirmation",
                        map_id: "sunken_ship",
                        event_timestamp: "2026-04-26T12:39:48.135Z",
                        observed_state: {
                            r1_total_items: 48,
                            r1_blue_count: 17,
                            r2_purple_count: 9
                        },
                        actual_counts: {
                            w: 0,
                            g: 0,
                            b: 0,
                            p: 0,
                            o: 0,
                            r: 0,
                            total_items: 48
                        },
                        metadata: {
                            red_residual_review: {
                                current_model: {
                                    red_count_mean: 3.7133,
                                    orange_count_mean: 8.2867,
                                    purple_count_mean: 9
                                },
                                constraint_diagnostics: {
                                    total_items: 48,
                                    blue_count: 17,
                                    purple_count: 9,
                                    inferred_white_green_count: 10,
                                    orange_red_unknown_pool: 12
                                },
                                training_label_allowed: false,
                                authority_merge_allowed: false
                            }
                        }
                    }
                ]
            }
        ]
    };
}

function writeJson(filePath, payload) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("package exposes P1 manual count candidate shortlist builder", () => {
    assert.equal(
        packageJson.scripts["build:p1-manual-count-candidate-shortlist"],
        "node scripts/build_p1_manual_count_candidate_shortlist.js"
    );
    assert.match(packageJson.scripts["check:js"], /scripts\/build_p1_manual_count_candidate_shortlist\.js/);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-27-sunken-ship-p1-manual-count-candidate-shortlist.json"), true);
});

test("resolveArgs accepts confirmation, output, generated time, and top count", () => {
    const result = resolveArgs([
        "--confirmation=confirmation.json",
        "--output",
        "out.json",
        "--generated-at=2026-04-27T14:00:00.000Z",
        "--top=5"
    ]);

    assert.equal(result.confirmationPath, path.resolve("confirmation.json"));
    assert.equal(result.outputPath, path.resolve("out.json"));
    assert.equal(result.generatedAt, "2026-04-27T14:00:00.000Z");
    assert.equal(result.topN, 5);
});

test("enumerateCandidates builds all constraint-satisfying count tuples", () => {
    const sample = buildConfirmationFixture().fresh_capture_templates[0].samples[0];
    const constraints = buildConstraintSet({
        ...sample,
        red_residual_review: sample.metadata.red_residual_review
    });
    const result = enumerateCandidates(constraints);

    assert.deepEqual(result.blockers, []);
    assert.equal(result.candidates.length, 143);
    assert.deepEqual(result.candidates[0].counts, { w: 5, g: 5, b: 17, p: 9, o: 8, r: 4 });
    assert.equal(result.candidates[0].quality_sum, 48);
    assert.equal(result.candidates[0].constraints_satisfied, true);
});

test("buildP1ManualCountCandidateShortlist remains non-authority and ranks top candidates", () => {
    const report = buildP1ManualCountCandidateShortlist({
        confirmation: buildConfirmationFixture(),
        generatedAt: "2026-04-27T14:00:00.000Z",
        topN: 3
    });

    assert.equal(report.schema_version, "ak_p1_manual_count_candidate_shortlist_v1");
    assert.equal(report.summary.sample_count, 1);
    assert.equal(report.summary.candidate_count, 143);
    assert.equal(report.authority_policy.training_label_allowed, false);
    assert.equal(report.authority_policy.default_weight_update_allowed, false);
    assert.equal(report.sample_shortlists[0].top_candidates.length, 3);
    assert.deepEqual(report.sample_shortlists[0].top_candidates[0].counts, {
        w: 5,
        g: 5,
        b: 17,
        p: 9,
        o: 8,
        r: 4
    });
    assert.equal(report.sample_shortlists[0].recommended_next_action, "human_select_matching_wg_or_candidate_then_approve_in_confirmation_page");
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-p1-shortlist-"));
    const confirmationPath = path.join(tempDir, "confirmation.json");
    const outputPath = path.join(tempDir, "shortlist.json");
    writeJson(confirmationPath, buildConfirmationFixture());
    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            `--confirmation=${confirmationPath}`,
            `--output=${outputPath}`,
            "--generated-at=2026-04-27T14:00:00.000Z",
            "--top=2"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.candidate_count, 143);
    assert.match(markdown, /P1 Manual Count Candidate Shortlist/);
    assert.match(markdown, /human_confirmation_required/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
