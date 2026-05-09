const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    buildBidKingInverseTailShadowReplayGateReport,
    formatBidKingInverseTailShadowReplayGateMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_bidking_inverse_tail_shadow_replay_gate_report.js");

function candidateReport() {
    return {
        schema_version: "ak_bidking_inverse_tail_shadow_candidate_v1",
        change_class: "RESEARCH_ONLY",
        live_path_touched: false,
        summary: {
            verdict: "inverse_value_supported_shadow_only",
            default_config_update_allowed: false
        },
        gates: {
            default_config_update_allowed: false,
            authority_handoff_allowed: false,
            promotion_allowed: false,
            table_backed_shadow_replay_allowed: false
        },
        non_authority_shadow_candidate: {
            red_quality_beta_median: 0.932
        },
        target_missing_item_diagnostics: [
            {
                group_id: 1066,
                item_id: 1106013,
                observed_drop_weight: 3333,
                implied_base_value_by_fitted_curve: 333117.9342,
                authority_allowed: false,
                diagnostic_only: true
            }
        ]
    };
}

function resolutionReport() {
    return {
        schema_version: "ak_bidking_missing_item_resolution_candidate_v1",
        summary: {
            project_relevant_missing_item_ids: [1106013],
            impacted_project_maps: ["sunken_ship", "villa"],
            default_config_update_allowed: false
        },
        gates: {
            source_item_rows_recovered_for_project_scope: false,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        }
    };
}

function sourceScanReport(recovered = false) {
    return {
        schema_version: "ak_bidking_missing_item_source_recovery_scan_v1",
        summary: {
            source_item_row_recovered_for_project_scope: recovered,
            default_config_update_allowed: false
        },
        gates: {
            source_item_row_recovered_for_project_scope: recovered,
            table_backed_shadow_replay_allowed: false,
            authority_handoff_allowed: false,
            default_config_update_allowed: false
        }
    };
}

function reviewImport(mapCounts) {
    const samples = [];
    Object.entries(mapCounts).forEach(([mapId, count]) => {
        for (let index = 0; index < count; index += 1) {
            samples.push({
                id: `${mapId}_${index}`,
                map_id: mapId,
                actual_counts: { w: 1, g: 1, b: 1, p: 1, o: 1, r: 1 },
                observed_state: { r1_total_items: 6 },
                metadata: { count_fit_review: { event_timestamp: `2026-05-07T00:0${index}:00.000Z` } }
            });
        }
    });
    return {
        schema_version: "ak_count_fit_sample_review_import_v1",
        export_kind: "count_fit_same_battle_samples",
        summary: {
            accepted_sample_count: samples.length,
            map_counts: mapCounts
        },
        samples
    };
}

test("package exposes BidKing inverse-tail shadow replay gate builder", () => {
    assert.equal(
        packageJson.scripts["build:bidking-inverse-tail-shadow-replay-gate"],
        "node scripts/build_bidking_inverse_tail_shadow_replay_gate_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_bidking_inverse_tail_shadow_replay_gate_report\.js/);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("2026-05-07-bidking-inverse-tail-shadow-replay-gate-report.json"), true);
});

test("gate blocks inverse-tail replay when source row and same-battle samples are insufficient", () => {
    const report = buildBidKingInverseTailShadowReplayGateReport({
        inverseTailCandidateReport: candidateReport(),
        missingItemResolutionReport: resolutionReport(),
        missingItemSourceRecoveryScanReport: sourceScanReport(false),
        reviewImports: [reviewImport({ sunken_ship: 1 })],
        generatedAt: "2026-05-07T22:00:00.000+08:00"
    });

    assert.equal(report.schema_version, "ak_bidking_inverse_tail_shadow_replay_gate_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.summary.diagnostic_shadow_analysis_allowed, true);
    assert.equal(report.summary.inverse_tail_shadow_replay_allowed, false);
    assert.equal(report.summary.promotion_allowed, false);
    assert.equal(report.summary.accepted_same_battle_sample_count, 1);
    assert.deepEqual(report.summary.accepted_same_battle_sample_count_by_map, { sunken_ship: 1 });
    assert.deepEqual(report.summary.same_battle_sample_deficit_by_impacted_map, {
        sunken_ship: 2,
        villa: 3
    });
    assert.match(report.summary.blockers.join(","), /missing_authoritative_item_row_1106013/);
    assert.match(report.summary.blockers.join(","), /impacted_map_sample_count_below_minimum/);
    assert.equal(report.gates.default_config_update_allowed, false);
    assert.equal(report.gates.authority_handoff_allowed, false);
});

test("gate can mark replay ready only after source recovery and sufficient impacted-map samples", () => {
    const report = buildBidKingInverseTailShadowReplayGateReport({
        inverseTailCandidateReport: candidateReport(),
        missingItemResolutionReport: {
            ...resolutionReport(),
            gates: { source_item_rows_recovered_for_project_scope: true }
        },
        missingItemSourceRecoveryScanReport: sourceScanReport(true),
        reviewImports: [reviewImport({ sunken_ship: 3, villa: 3 })],
        generatedAt: "2026-05-07T22:00:00.000+08:00"
    });

    assert.equal(report.summary.inverse_tail_shadow_replay_allowed, true);
    assert.equal(report.summary.promotion_allowed, false);
    assert.deepEqual(report.summary.same_battle_sample_deficit_by_impacted_map, {
        sunken_ship: 0,
        villa: 0
    });
    assert.match(report.summary.blockers.join(","), /shadow_replay_not_default_promotion/);
    assert.match(formatBidKingInverseTailShadowReplayGateMarkdown(report), /Promotion allowed: `false`/);
});

test("main writes JSON and Markdown inverse-tail replay gate artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-bidking-inverse-tail-gate-"));
    const candidatePath = path.join(tempDir, "candidate.json");
    const resolutionPath = path.join(tempDir, "resolution.json");
    const sourceScanPath = path.join(tempDir, "scan.json");
    const importPath = path.join(tempDir, "import.json");
    const outputPath = path.join(tempDir, "gate.json");
    fs.writeFileSync(candidatePath, JSON.stringify(candidateReport(), null, 2));
    fs.writeFileSync(resolutionPath, JSON.stringify(resolutionReport(), null, 2));
    fs.writeFileSync(sourceScanPath, JSON.stringify(sourceScanReport(false), null, 2));
    fs.writeFileSync(importPath, JSON.stringify(reviewImport({ sunken_ship: 1 }), null, 2));

    const args = resolveArgs([
        candidatePath,
        resolutionPath,
        sourceScanPath,
        outputPath,
        "--review-import",
        importPath,
        "--generated-at=2026-05-07T22:00:00.000+08:00"
    ]);
    assert.equal(args.outputPath, outputPath);
    assert.deepEqual(args.reviewImportPaths, [importPath]);

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([
            candidatePath,
            resolutionPath,
            sourceScanPath,
            outputPath,
            "--review-import",
            importPath,
            "--generated-at=2026-05-07T22:00:00.000+08:00"
        ]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.summary.inverse_tail_shadow_replay_allowed, false);
    assert.match(markdown, /inverse-tail shadow replay gate/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
