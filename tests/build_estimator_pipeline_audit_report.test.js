const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const packageJson = require("../package.json");
const {
    buildEstimatorPipelineAuditReport,
    main,
    resolveArgs
} = require("../scripts/build_estimator_pipeline_audit_report.js");

test("package exposes estimator pipeline audit report builder", () => {
    assert.equal(
        packageJson.scripts["build:estimator-pipeline-audit"],
        "node scripts/build_estimator_pipeline_audit_report.js"
    );
    assert.match(packageJson.scripts["check:js"], /build_estimator_pipeline_audit_report\.js/);
});

test("pipeline audit maps algorithm ownership to focused modules", () => {
    const report = buildEstimatorPipelineAuditReport({ generatedAt: "2026-05-07T00:00:00.000+08:00" });

    assert.equal(report.schema_version, "ak_estimator_pipeline_audit_v1");
    assert.equal(report.change_class, "SIM_ONLY");
    assert.equal(report.live_path_touched, false);
    assert.equal(report.default_parameter_update_allowed, false);
    assert.equal(report.generated_at, "2026-05-07T00:00:00.000+08:00");
    assert.equal(report.module_ownership.average_observation.owner, "src/core/average_observation_runtime.js");
    assert.equal(report.module_ownership.posterior.owner, "src/core/posterior_runtime.js");
    assert.equal(report.module_ownership.count_constraints.owner, "src/core/count_constraint_runtime.js");
    assert.equal(report.module_ownership.valuation.owner, "src/core/valuation_runtime.js");
});

test("pipeline audit records compatibility, gates, and verification commands", () => {
    const report = buildEstimatorPipelineAuditReport();

    assert.equal(report.public_api_compatibility.auction_king_estimator_methods_preserved, true);
    assert.ok(report.public_api_compatibility.compatibility_wrappers.includes("AuctionKingEstimator.valuationMc"));
    assert.ok(report.parameter_promotion_gates.blockers.includes("default_parameter_update_out_of_scope"));
    assert.ok(report.parameter_promotion_gates.blockers.includes("requires_separate_replay_or_shadow_evidence"));
    assert.ok(report.required_verification.includes("npm test"));
    assert.ok(report.required_verification.includes("npm run audit:public-release"));
});

test("resolveArgs accepts output path and generated timestamp", () => {
    const result = resolveArgs(["audit.json", "--generated-at=2026-05-07T00:00:00.000+08:00"]);

    assert.equal(result.outputPath, path.resolve("audit.json"));
    assert.equal(result.generatedAt, "2026-05-07T00:00:00.000+08:00");
});

test("main writes estimator pipeline audit JSON and Markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-estimator-pipeline-audit-"));
    const outputPath = path.join(tempDir, "audit.json");
    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([outputPath, "--generated-at=2026-05-07T00:00:00.000+08:00"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");

    assert.equal(report.schema_version, "ak_estimator_pipeline_audit_v1");
    assert.match(markdown, /Estimator pipeline audit/);
    assert.match(markdown, /src\/core\/valuation_runtime\.js/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
