const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    buildManualCountPriorShadowCandidateConfig
} = require("../scripts/build_manual_count_prior_shadow_candidate_config.js");
const {
    DEFAULT_OUTPUT_PATH,
    buildManualCountPriorShadowCandidateReplayGate,
    main,
    resolveArgs
} = require("../scripts/build_manual_count_prior_shadow_candidate_replay_gate.js");

function buildAcceptedSampleFixture(id = "manual_sunken_case") {
    return {
        record_type: "battle_sample",
        id,
        map_id: "sunken_ship",
        observed_state: {
            r1_total_items: 12,
            r1_blue_count: 3
        },
        actual_counts: {
            w: 0,
            g: 3,
            b: 3,
            p: 4,
            o: 1,
            r: 1
        },
        source_kind: "count_fit_manual_review"
    };
}

function buildReviewImportFixture(samples = []) {
    return {
        schema_version: "ak_count_fit_sample_review_import_v1",
        generated_at: "2026-04-26T09:10:00.000+08:00",
        summary: {
            accepted_sample_count: samples.length,
            blocked_entry_count: 0
        },
        samples
    };
}

function buildCandidateFixture(reviewImport) {
    return buildManualCountPriorShadowCandidateConfig({
        reviewImport,
        generatedAt: "2026-04-26T09:12:00.000+08:00"
    });
}

test("package exposes manual count-prior shadow candidate replay gate builder", () => {
    assert.equal(
        packageJson.scripts["build:manual-count-prior-shadow-candidate-replay-gate"],
        "node scripts/build_manual_count_prior_shadow_candidate_replay_gate.js"
    );
});

test("resolveArgs accepts review import, candidate config, output path, and generated time", () => {
    const result = resolveArgs([
        "review-import.json",
        "candidate.json",
        "gate.json",
        "--generated-at=2026-04-26T09:15:00.000+08:00"
    ]);

    assert.equal(result.reviewImportPath, path.resolve("review-import.json"));
    assert.equal(result.candidateConfigPath, path.resolve("candidate.json"));
    assert.equal(result.outputPath, path.resolve("gate.json"));
    assert.equal(result.generatedAt, "2026-04-26T09:15:00.000+08:00");
});

test("default output path targets manual candidate replay gate artifact", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-26-manual-count-prior-shadow-candidate-replay-gate.json"), true);
});

test("buildManualCountPriorShadowCandidateReplayGate blocks when no accepted samples exist", () => {
    const reviewImport = buildReviewImportFixture([]);
    const report = buildManualCountPriorShadowCandidateReplayGate({
        reviewImport,
        candidateConfig: buildCandidateFixture(reviewImport),
        generatedAt: "2026-04-26T09:15:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_manual_count_prior_shadow_candidate_replay_gate_v1");
    assert.equal(report.summary.accepted_sample_count, 0);
    assert.equal(report.summary.evaluated_sample_count, 0);
    assert.equal(report.summary.promotion_allowed, false);
    assert.equal(report.summary.candidate_replay_passed, false);
    assert.equal(report.replay_report, null);
    assert.match(report.summary.blockers.join(","), /missing_accepted_count_fit_samples/);
    assert.match(report.summary.blockers.join(","), /manual_shadow_candidate_not_directly_deployable/);
});

test("buildManualCountPriorShadowCandidateReplayGate replays accepted samples but blocks low sample count", () => {
    const reviewImport = buildReviewImportFixture([buildAcceptedSampleFixture()]);
    const report = buildManualCountPriorShadowCandidateReplayGate({
        reviewImport,
        candidateConfig: buildCandidateFixture(reviewImport),
        generatedAt: "2026-04-26T09:15:00.000+08:00"
    });

    assert.equal(report.summary.accepted_sample_count, 1);
    assert.equal(report.summary.evaluated_sample_count, 1);
    assert.equal(report.summary.promotion_allowed, false);
    assert.equal(report.summary.promotion_status, "blocked_manual_shadow_replay_gate");
    assert.equal(report.summary.recommended_next_action, "collect_more_human_confirmed_count_fit_samples");
    assert.match(report.summary.blockers.join(","), /accepted_sample_count_below_minimum/);
    assert.match(report.summary.blockers.join(","), /map_sample_count_below_minimum/);
    assert.equal(report.replay_report.sample_count, 1);
    assert.equal(report.sample_deltas.length, 1);
    assert.deepEqual(Object.keys(report.metric_deltas), ["w", "g", "b", "p", "o", "r"]);
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-manual-count-prior-gate-"));
    const reviewPath = path.join(tempDir, "review-import.json");
    const candidatePath = path.join(tempDir, "candidate.json");
    const outputPath = path.join(tempDir, "gate.json");
    const reviewImport = buildReviewImportFixture([buildAcceptedSampleFixture()]);
    fs.writeFileSync(reviewPath, JSON.stringify(reviewImport, null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(buildCandidateFixture(reviewImport), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([reviewPath, candidatePath, outputPath, "--generated-at=2026-04-26T09:15:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.evaluated_sample_count, 1);
    assert.match(markdown, /Manual Count Prior Shadow Candidate Replay Gate/);
    assert.match(markdown, /accepted_sample_count_below_minimum/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
