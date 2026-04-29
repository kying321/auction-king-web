const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    DEFAULT_OUTPUT_PATH,
    resolveArgs,
    main
} = require("../scripts/build_count_prior_tuning_report.js");

test("package exposes a dedicated count-prior tuning entry", () => {
    assert.match(
        packageJson.scripts["build:count-prior-tuning"] || "",
        /node\s+scripts\/build_count_prior_tuning_report\.js/
    );
});

test("resolveArgs accepts samples, map id, optional search space, and optional output path", () => {
    const result = resolveArgs(["samples.json", "villa", "search.json", "report.json"]);

    assert.equal(result.inputPath, path.resolve("samples.json"));
    assert.equal(result.mapId, "villa");
    assert.equal(result.searchSpacePath, path.resolve("search.json"));
    assert.equal(result.outputPath, path.resolve("report.json"));
});

test("main writes a map-scoped count prior tuning report", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-prior-tuning-"));
    const samplesPath = path.join(tempDir, "samples.json");
    const searchPath = path.join(tempDir, "search.json");
    const outputPath = path.join(tempDir, "report.json");

    fs.writeFileSync(samplesPath, JSON.stringify([
        {
            id: "villa_sparse_case",
            map_id: "villa",
            observed_state: {
                r1_total_items: 45,
                r1_blue_count: 11,
                r2_orange_avg: 3.33,
                r2_orange_avg_text: "3.33",
                r3_purple_avg: 1.8,
                r3_purple_avg_text: "1.8"
            },
            actual_counts: {
                o: 3,
                r: 0
            }
        }
    ], null, 2));

    fs.writeFileSync(searchPath, JSON.stringify({
        alpha_counts: {
            w: [6.2, 8.5],
            g: [5.4, 7.6],
            p: [2.4, 4.2],
            r: [1.2, 0.12]
        },
        solver: {
            count_prior_strength: [1, 8]
        },
        baseline_overrides: {
            alpha_counts: {
                w: 6.2,
                g: 5.4,
                b: 3.9,
                p: 2.4,
                o: 1.8,
                r: 1.2
            },
            solver: {
                count_prior_strength: 1
            }
        },
        max_rounds: 6
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([samplesPath, "villa", searchPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.map_id, "villa");
    assert.equal(report.sample_count, 1);
    assert.equal(report.evidence_assessment.status, "insufficient_sample_size");
    assert.equal(report.evidence_assessment.can_adopt_default_weight, false);
    assert.equal(report.best_candidate.config.maps.villa.alpha_counts.r, 0.12);
    assert.equal(report.best_candidate.config.maps.villa.solver.count_prior_strength, 8);
    assert.ok(report.best_candidate.score < report.baseline.score);
    assert.equal(printed.join(""), `${outputPath}\n`);
    assert.equal(DEFAULT_OUTPUT_PATH.endsWith("count_prior_tuning_report.json"), true);
});
