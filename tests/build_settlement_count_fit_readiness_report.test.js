const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    formatSettlementCountFitReadinessMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_settlement_count_fit_readiness_report.js");

test("package exposes settlement count fit readiness report entry", () => {
    assert.match(
        packageJson.scripts["build:settlement-count-fit-readiness"] || "",
        /node\s+scripts\/build_settlement_count_fit_readiness_report\.js/
    );
});

test("resolveArgs defaults include confirmed settlement samples and count-fit review import", () => {
    const result = resolveArgs([]);

    assert.equal(result.inputPaths.length, 2);
    assert.ok(result.inputPaths[0].endsWith("2026-04-24-confirmed-settlement-samples.json"));
    assert.ok(result.inputPaths[1].endsWith("2026-04-25-count-fit-sample-review-import.json"));
});

test("resolveArgs accepts multiple inputs, output path, and count threshold", () => {
    const result = resolveArgs([
        "package-a.json",
        "package-b.json",
        "--output",
        "readiness.json",
        "--min-count-scored-per-map-quality",
        "12"
    ]);

    assert.deepEqual(result.inputPaths, [
        path.resolve("package-a.json"),
        path.resolve("package-b.json")
    ]);
    assert.equal(result.outputPath, path.resolve("readiness.json"));
    assert.equal(result.thresholds.min_count_scored_samples_per_map_quality, 12);
});

test("main writes settlement count fit readiness JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-fit-readiness-"));
    const inputPath = path.join(tempDir, "samples.json");
    const outputPath = path.join(tempDir, "readiness.json");

    fs.writeFileSync(inputPath, JSON.stringify({
        samples: [
            {
                id: "villa_ready_a",
                map_id: "villa",
                observed_state: { r1_total_items: 45 },
                actual_counts: { w: 7, g: 9, b: 11, p: 6, o: 3, r: 0 }
            }
        ]
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([inputPath, "--output", outputPath, "--min-count-scored-per-map-quality", "1"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.maps.villa.two_sigma_count_fit_allowed, true);
    assert.equal(report.maps.villa.count_fit_scored_sample_count_by_quality.o, 1);
    assert.match(markdown, /settlement count fit readiness/);
    assert.match(markdown, /count-fit scored samples/);
    assert.match(formatSettlementCountFitReadinessMarkdown(report, outputPath), /villa/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
