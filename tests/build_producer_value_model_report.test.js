const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    formatProducerValueModelMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_producer_value_model_report.js");

test("package exposes producer value model report entry", () => {
    assert.match(
        packageJson.scripts["build:producer-value-model"] || "",
        /node\s+scripts\/build_producer_value_model_report\.js/
    );
});

test("resolveArgs accepts catalog calibration snapshot and output path", () => {
    const result = resolveArgs(["catalog.json", "value-model.json"]);

    assert.equal(result.catalogCalibrationPath, path.resolve("catalog.json"));
    assert.equal(result.outputPath, path.resolve("value-model.json"));
});

test("main writes producer value model JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-value-"));
    const catalogPath = path.join(tempDir, "catalog.json");
    const outputPath = path.join(tempDir, "value-model.json");

    fs.writeFileSync(catalogPath, JSON.stringify({
        quality_summaries: [
            { quality: "p", observed_average_value: 9492.84, observed_value_sd: 5493.59 },
            { quality: "o", observed_average_value: 46325.17, observed_value_sd: 28856.2 },
            { quality: "r", observed_average_value: 822956.57, observed_value_sd: 2508085.59 }
        ]
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        main([catalogPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.runtime_family_status, "phase1_disabled");
    assert.match(markdown, /producer value model/);
    assert.match(formatProducerValueModelMarkdown(report, outputPath), /adoption allowed: `false`/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
