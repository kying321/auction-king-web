const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
    main,
    normalizeInputSamples,
    resolveArgs
} = require("../scripts/build_settlement_sample_count_replay.js");

test("normalizeInputSamples accepts legacy arrays and samples payloads", () => {
    const samples = [{ id: "a" }];

    assert.deepEqual(normalizeInputSamples(samples), samples);
    assert.deepEqual(normalizeInputSamples({ samples }), samples);
    assert.deepEqual(normalizeInputSamples({}), []);
});

test("resolveArgs accepts input, optional candidate config, and output path", () => {
    const result = resolveArgs(["samples.json", "candidate.json", "report.json"]);

    assert.equal(result.inputPath, path.resolve("samples.json"));
    assert.equal(result.candidateConfigPath, path.resolve("candidate.json"));
    assert.equal(result.outputPath, path.resolve("report.json"));
});

test("main writes a count replay report from a samples payload", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-count-replay-"));
    const samplesPath = path.join(tempDir, "samples.json");
    const outputPath = path.join(tempDir, "report.json");

    fs.writeFileSync(samplesPath, JSON.stringify({
        samples: [
            {
                id: "sunken_clean_case",
                map_id: "sunken_ship",
                field_values: {
                    total_items: 43,
                    blue_count: 11,
                    orange_avg_cells: 1,
                    purple_avg_cells: 2.66,
                    white_green_total_cells: 38,
                    white_green_avg_cells: 2.23
                },
                actual_counts: {
                    o: 2,
                    r: 4
                }
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
        main([samplesPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.sample_count, 1);
    assert.equal(report.samples[0].id, "sunken_clean_case");
    assert.equal(report.samples[0].baseline.orange.actual_count, 2);
    assert.equal(report.samples[0].baseline.red.actual_count, 4);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
