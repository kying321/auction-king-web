const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const defaultConfig = require("../default_config_bundle.js");
const {
    DEFAULT_OUTPUT_PATH,
    buildCodexVisualShadowCandidateReplayGate,
    main,
    resolveArgs
} = require("../scripts/build_codex_visual_shadow_candidate_replay_gate.js");

function buildCandidateFixture() {
    const candidate = JSON.parse(JSON.stringify(defaultConfig));
    candidate.maps.sunken_ship.alpha_counts = {
        w: 0.5,
        g: 2.4,
        b: 3.2,
        p: 4.8,
        o: 1.8,
        r: 1.5
    };
    candidate.maps.sunken_ship.solver = {
        ...(candidate.maps.sunken_ship.solver || {}),
        count_prior_strength: 4
    };
    candidate.codex_visual_shadow_candidate = {
        schema_version: "ak_codex_visual_shadow_candidate_config_v1",
        generated_at: "2026-04-26T06:20:00.000+08:00",
        change_class: "RESEARCH_ONLY",
        usage: "shadow_replay_only",
        applied_maps: ["sunken_ship"],
        selected_scenarios: {
            sunken_ship: {
                scenario_id: "blend_visual_50_alpha_strength_4",
                alpha_counts: candidate.maps.sunken_ship.alpha_counts,
                count_prior_strength: 4
            }
        },
        adoption_blockers: [
            "codex_visual_review_shadow_only",
            "missing_human_confirmed_count_fit_sample",
            "single_visual_candidate_overfit_risk"
        ],
        default_config_update_allowed: false
    };
    return candidate;
}

function buildReviewImportFixture(samples = []) {
    return {
        schema_version: "ak_count_fit_sample_review_import_v1",
        generated_at: "2026-04-26T06:30:00.000+08:00",
        summary: {
            accepted_sample_count: samples.length,
            blocked_entry_count: 0
        },
        samples
    };
}

function buildAcceptedSampleFixture() {
    return {
        record_type: "battle_sample",
        id: "manual_sunken_small_case",
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

test("package exposes codex visual shadow candidate replay gate builder", () => {
    assert.equal(
        packageJson.scripts["build:codex-visual-shadow-candidate-replay-gate"],
        "node scripts/build_codex_visual_shadow_candidate_replay_gate.js"
    );
});

test("resolveArgs accepts review import, candidate config, output path, and generated time", () => {
    const result = resolveArgs([
        "review-import.json",
        "candidate.json",
        "gate.json",
        "--generated-at=2026-04-26T06:35:00.000+08:00"
    ]);

    assert.equal(result.reviewImportPath, path.resolve("review-import.json"));
    assert.equal(result.candidateConfigPath, path.resolve("candidate.json"));
    assert.equal(result.outputPath, path.resolve("gate.json"));
    assert.equal(result.generatedAt, "2026-04-26T06:35:00.000+08:00");
});

test("default output path targets codex visual shadow replay gate artifact", () => {
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-04-26-sunken-ship-codex-visual-shadow-candidate-replay-gate.json"), true);
});

test("buildCodexVisualShadowCandidateReplayGate blocks visual shadow candidate with no accepted samples", () => {
    const report = buildCodexVisualShadowCandidateReplayGate({
        reviewImport: buildReviewImportFixture([]),
        candidateConfig: buildCandidateFixture(),
        generatedAt: "2026-04-26T06:35:00.000+08:00",
        paths: {
            reviewImportPath: "/tmp/review-import.json",
            candidateConfigPath: "/tmp/candidate.json"
        }
    });

    assert.equal(report.schema_version, "ak_codex_visual_shadow_candidate_replay_gate_v1");
    assert.equal(report.summary.accepted_sample_count, 0);
    assert.equal(report.summary.evaluated_sample_count, 0);
    assert.equal(report.summary.promotion_allowed, false);
    assert.equal(report.replay_report, null);
    assert.match(report.summary.blockers.join(","), /missing_accepted_count_fit_samples/);
    assert.match(report.summary.blockers.join(","), /visual_shadow_candidate_not_deployable/);
});

test("buildCodexVisualShadowCandidateReplayGate compares baseline and candidate on accepted samples but still blocks promotion", () => {
    const report = buildCodexVisualShadowCandidateReplayGate({
        reviewImport: buildReviewImportFixture([buildAcceptedSampleFixture()]),
        candidateConfig: buildCandidateFixture(),
        generatedAt: "2026-04-26T06:35:00.000+08:00"
    });

    assert.equal(report.summary.accepted_sample_count, 1);
    assert.equal(report.summary.evaluated_sample_count, 1);
    assert.equal(report.summary.promotion_allowed, false);
    assert.equal(report.summary.promotion_status, "blocked_visual_shadow_source");
    assert.equal(report.summary.recommended_next_action, "rebuild_manual_sample_backed_count_prior_candidate");
    assert.equal(report.replay_report.sample_count, 1);
    assert.equal(report.sample_deltas.length, 1);
    assert.deepEqual(Object.keys(report.metric_deltas), ["w", "g", "b", "p", "o", "r"]);
});

test("main writes JSON and Markdown artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-codex-visual-shadow-gate-"));
    const reviewPath = path.join(tempDir, "review-import.json");
    const candidatePath = path.join(tempDir, "candidate.json");
    const outputPath = path.join(tempDir, "gate.json");
    fs.writeFileSync(reviewPath, JSON.stringify(buildReviewImportFixture([]), null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(buildCandidateFixture(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([reviewPath, candidatePath, outputPath, "--generated-at=2026-04-26T06:35:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.recommended_next_action, "collect_human_confirmed_count_fit_samples");
    assert.match(markdown, /Codex Visual Shadow Candidate Replay Gate/);
    assert.match(markdown, /missing_accepted_count_fit_samples/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
