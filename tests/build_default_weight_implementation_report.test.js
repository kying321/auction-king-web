const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    main,
    resolveArgs
} = require("../scripts/build_default_weight_implementation_report.js");

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

test("package exposes default weight implementation report builder", () => {
    assert.equal(
        packageJson.scripts["build:default-weight-implementation"],
        "node scripts/build_default_weight_implementation_report.js"
    );
});

test("resolveArgs accepts purple fit evidence and output path", () => {
    const result = resolveArgs(["purple-fit.json", "implementation.json"]);

    assert.equal(result.purpleFitReportPath, path.resolve("purple-fit.json"));
    assert.equal(result.outputPath, path.resolve("implementation.json"));
});

test("main writes default weight implementation JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-weight-impl-"));
    const evidencePath = path.join(tempDir, "purple-fit.json");
    const outputPath = path.join(tempDir, "implementation.json");

    fs.writeFileSync(evidencePath, JSON.stringify(createPurpleFitEvidence(), null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([evidencePath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");

    assert.equal(report.schema_version, "ak_default_weight_implementation_report_v1");
    assert.equal(report.implementation_status, "mismatch");
    assert.match(markdown, /default weight implementation/i);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
