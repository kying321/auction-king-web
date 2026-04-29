const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const defaultConfig = require("../default_config_bundle.js");
const {
    DEFAULT_CHAIN_OUTPUT_PATH,
    buildCodexVisualManualConfirmationChain,
    formatCodexVisualManualConfirmationChainMarkdown,
    main,
    resolveArgs
} = require("../scripts/refresh_codex_visual_manual_confirmation_chain.js");

function buildConfirmationFixture({ includeBlocked = true } = {}) {
    const samples = [
        {
            status: "approved_count_fit_sample",
            map_id: "sunken_ship",
            event_timestamp: "2026-04-26T07:40:00.000+08:00",
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
                r: 1,
                total_items: 12
            },
            actual_counts_source: "manual_review",
            pixel_training_label_allowed: false
        }
    ];
    if (includeBlocked) {
        samples.push({
            status: "needs_human_confirmation",
            map_id: "sunken_ship",
            event_timestamp: "2026-04-26T07:45:00.000+08:00",
            observed_state: {
                r1_total_items: 58,
                r1_blue_count: 15
            },
            actual_counts: {
                w: 0,
                g: 13,
                b: 15,
                p: 24,
                o: 3,
                r: 3,
                total_items: 58
            },
            actual_counts_source: "manual_review",
            pixel_training_label_allowed: false
        });
    }
    return {
        schema_version: "ak_count_fit_sample_review_results_v1",
        generated_at: "2026-04-26T07:35:00.000+08:00",
        fresh_capture_templates: [
            {
                source_task_id: "sunken_ship_manual_confirmation",
                source_task_type: "capture_fresh_same_battle_samples",
                output_target: "count_fit_same_battle_sample",
                map_id: "sunken_ship",
                pixel_training_label_allowed: false,
                samples
            }
        ]
    };
}

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
        usage: "shadow_replay_only",
        applied_maps: ["sunken_ship"],
        selected_scenarios: {
            sunken_ship: {
                scenario_id: "blend_visual_50_alpha_strength_4"
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

test("package exposes codex visual manual confirmation chain refresh entry", () => {
    assert.equal(
        packageJson.scripts["build:codex-visual-manual-confirmation-chain"],
        "node scripts/refresh_codex_visual_manual_confirmation_chain.js"
    );
});

test("resolveArgs accepts positional paths and named options", () => {
    const result = resolveArgs([
        "confirmation.json",
        "import.json",
        "gate.json",
        "--candidate-config",
        "candidate.json",
        "--manual-candidate-output",
        "manual-candidate.json",
        "--manual-candidate-gate-output",
        "manual-candidate-gate.json",
        "--chain-output",
        "chain.json",
        "--generated-at=2026-04-26T07:50:00.000+08:00",
        "--fail-on-import-blockers"
    ]);

    assert.equal(result.confirmationResultsPath, path.resolve("confirmation.json"));
    assert.equal(result.importOutputPath, path.resolve("import.json"));
    assert.equal(result.gateOutputPath, path.resolve("gate.json"));
    assert.equal(result.candidateConfigPath, path.resolve("candidate.json"));
    assert.equal(result.manualCandidateOutputPath, path.resolve("manual-candidate.json"));
    assert.equal(result.manualCandidateGateOutputPath, path.resolve("manual-candidate-gate.json"));
    assert.equal(result.chainOutputPath, path.resolve("chain.json"));
    assert.equal(result.generatedAt, "2026-04-26T07:50:00.000+08:00");
    assert.equal(result.failOnImportBlockers, true);
});

test("default chain output targets codex visual manual confirmation refresh artifact", () => {
    assert.equal(
        DEFAULT_CHAIN_OUTPUT_PATH.endsWith("2026-04-26-sunken-ship-codex-visual-manual-confirmation-chain-refresh.json"),
        true
    );
});

test("buildCodexVisualManualConfirmationChain imports approved samples and keeps gate blocked", () => {
    const reports = buildCodexVisualManualConfirmationChain({
        confirmationResults: buildConfirmationFixture(),
        candidateConfig: buildCandidateFixture(),
        generatedAt: "2026-04-26T07:50:00.000+08:00",
        paths: {
            confirmationResultsPath: "/tmp/confirmation.json",
            candidateConfigPath: "/tmp/candidate.json",
            importOutputPath: "/tmp/import.json",
            gateOutputPath: "/tmp/gate.json",
            manualCandidateOutputPath: "/tmp/manual-candidate.json",
            manualCandidateGateOutputPath: "/tmp/manual-candidate-gate.json",
            chainOutputPath: "/tmp/chain.json"
        }
    });

    assert.equal(reports.importReport.summary.accepted_sample_count, 1);
    assert.equal(reports.importReport.summary.blocked_entry_count, 1);
    assert.equal(reports.importReport.summary.blocker_reason_counts.status_not_approved_for_import, 1);
    assert.equal(reports.gateReport.summary.accepted_sample_count, 1);
    assert.equal(reports.gateReport.summary.evaluated_sample_count, 1);
    assert.equal(reports.gateReport.summary.promotion_allowed, false);
    assert.deepEqual(
        reports.manualCandidateConfig.manual_count_prior_shadow_candidate.applied_maps,
        ["sunken_ship"]
    );
    assert.match(
        reports.manualCandidateConfig.manual_count_prior_shadow_candidate.adoption_blockers.join(","),
        /map_sample_count_below_minimum/
    );
    assert.equal(reports.manualCandidateGateReport.summary.evaluated_sample_count, 1);
    assert.equal(reports.manualCandidateGateReport.summary.candidate_replay_passed, false);
    assert.match(
        reports.manualCandidateGateReport.summary.blockers.join(","),
        /map_sample_count_below_minimum/
    );
    assert.deepEqual(reports.chainReport.summary.manual_candidate_applied_maps, ["sunken_ship"]);
    assert.equal(reports.chainReport.summary.manual_candidate_gate_evaluated_sample_count, 1);
    assert.equal(reports.chainReport.summary.manual_candidate_replay_passed, false);
    assert.equal(reports.chainReport.summary.ready_for_manual_sample_backed_candidate, true);
    assert.match(
        reports.chainReport.summary.gate_blockers.join(","),
        /visual_shadow_candidate_not_deployable/
    );
    assert.match(formatCodexVisualManualConfirmationChainMarkdown(reports.chainReport), /Accepted samples: `1`/);
});

test("main writes import, gate, and chain artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-codex-visual-chain-"));
    const confirmationPath = path.join(tempDir, "confirmation.json");
    const candidatePath = path.join(tempDir, "candidate.json");
    const importPath = path.join(tempDir, "import.json");
    const gatePath = path.join(tempDir, "gate.json");
    const manualCandidatePath = path.join(tempDir, "manual-candidate.json");
    const manualCandidateGatePath = path.join(tempDir, "manual-candidate-gate.json");
    const chainPath = path.join(tempDir, "chain.json");
    fs.writeFileSync(confirmationPath, JSON.stringify(buildConfirmationFixture({ includeBlocked: false }), null, 2));
    fs.writeFileSync(candidatePath, JSON.stringify(buildCandidateFixture(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            confirmationPath,
            importPath,
            gatePath,
            "--candidate-config",
            candidatePath,
            "--manual-candidate-output",
            manualCandidatePath,
            "--manual-candidate-gate-output",
            manualCandidateGatePath,
            "--chain-output",
            chainPath,
            "--generated-at",
            "2026-04-26T07:50:00.000+08:00",
            "--fail-on-import-blockers"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const imported = JSON.parse(fs.readFileSync(importPath, "utf8"));
    const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
    const manualCandidate = JSON.parse(fs.readFileSync(manualCandidatePath, "utf8"));
    const manualCandidateGate = JSON.parse(fs.readFileSync(manualCandidateGatePath, "utf8"));
    const chain = JSON.parse(fs.readFileSync(chainPath, "utf8"));
    const chainMarkdown = fs.readFileSync(chainPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(imported.summary.accepted_sample_count, 1);
    assert.equal(imported.summary.blocked_entry_count, 0);
    assert.equal(gate.summary.evaluated_sample_count, 1);
    assert.deepEqual(manualCandidate.manual_count_prior_shadow_candidate.applied_maps, ["sunken_ship"]);
    assert.equal(manualCandidateGate.summary.evaluated_sample_count, 1);
    assert.match(manualCandidateGate.summary.blockers.join(","), /map_sample_count_below_minimum/);
    assert.deepEqual(chain.summary.manual_candidate_applied_maps, ["sunken_ship"]);
    assert.equal(chain.summary.manual_candidate_gate_evaluated_sample_count, 1);
    assert.equal(chain.summary.manual_candidate_replay_passed, false);
    assert.equal(chain.summary.ready_for_manual_sample_backed_candidate, true);
    assert.match(chainMarkdown, /Ready for manual-sample-backed candidate: `true`/);
    assert.match(chainMarkdown, /Manual candidate applied maps: `sunken_ship`/);
    assert.match(chainMarkdown, /Manual candidate replay passed: `false`/);
    assert.match(chainMarkdown, /Manual Candidate Gate Blockers/);
    assert.equal(printed.join(""), `${chainPath}\n`);
});
