const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const packageJson = require("../package.json");
const {
    formatProducerCountPriorModelMarkdown,
    main,
    resolveArgs
} = require("../scripts/build_producer_count_prior_model_report.js");

test("package exposes producer count prior model report entry", () => {
    assert.match(
        packageJson.scripts["build:producer-count-prior-model"] || "",
        /node\s+scripts\/build_producer_count_prior_model_report\.js/
    );
});

test("resolveArgs accepts pixel shadow report, replay samples, and output path", () => {
    const result = resolveArgs(["pixel-shadow.json", "samples.json", "producer-model.json"]);

    assert.equal(result.pixelShadowReportPath, path.resolve("pixel-shadow.json"));
    assert.equal(result.replaySamplesPath, path.resolve("samples.json"));
    assert.equal(result.outputPath, path.resolve("producer-model.json"));
});

test("main writes producer count prior model JSON and markdown", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-producer-prior-"));
    const pixelPath = path.join(tempDir, "pixel-shadow.json");
    const samplesPath = path.join(tempDir, "samples.json");
    const outputPath = path.join(tempDir, "producer-model.json");

    fs.writeFileSync(pixelPath, JSON.stringify({
        maps: {
            villa: {
                pixel_input_count: 2,
                pixel_total: 20,
                pixel_counts: { w: 1, g: 1, b: 3, p: 1, o: 3, r: 11 },
                empirical_fractions: { w: 0.05, g: 0.05, b: 0.15, p: 0.05, o: 0.15, r: 0.55 },
                crop_sensitive_input_count: 2,
                low_confidence_input_count: 2,
                adoption_allowed: false
            }
        }
    }, null, 2));
    fs.writeFileSync(samplesPath, JSON.stringify({
        samples: [
            {
                id: "villa_partial",
                map_id: "villa",
                field_values: { total_items: 40 },
                actual_counts: { o: 1 }
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
        main([pixelPath, samplesPath, outputPath]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const markdown = fs.readFileSync(outputPath.replace(/\.json$/i, ".md"), "utf8");
    assert.equal(report.schema_version, "ak_producer_count_prior_model_v1");
    assert.equal(report.maps.villa.clean_replay_sample_count, 1);
    assert.match(markdown, /producer count-prior model/);
    assert.match(formatProducerCountPriorModelMarkdown(report, outputPath), /adoption allowed: `false`/);
    assert.equal(printed.join(""), `${outputPath}\n`);
});
