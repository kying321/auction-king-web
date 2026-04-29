const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const packageJson = require("../package.json");
const {
    main,
    normalizeInputPath,
    resolveArgs
} = require("../scripts/build_quality_pixel_report.js");

function oneBlockSvg(stroke = "#ffd04c") {
    return Buffer.from(`
<svg width="220" height="140" xmlns="http://www.w3.org/2000/svg">
  <rect width="220" height="140" fill="#111827"/>
  <rect x="90" y="24" width="84" height="76" fill="#28323f" stroke="${stroke}" stroke-width="6"/>
</svg>`);
}

test("package exposes a quality pixel report entry", () => {
    assert.match(
        packageJson.scripts["build:quality-pixel-report"] || "",
        /node\s+scripts\/build_quality_pixel_report\.js/
    );
});

test("resolveArgs accepts input path and optional output path", () => {
    const result = resolveArgs(["input", "report.json"]);

    assert.equal(result.inputPath, path.resolve("input"));
    assert.equal(result.outputPath, path.resolve("report.json"));
    assert.equal(result.qualityProfile, "high_contrast_191");
});

test("resolveArgs accepts an explicit quality profile override", () => {
    const result = resolveArgs(["input", "report.json", "--profile=standard"]);

    assert.equal(result.qualityProfile, "standard");
});

test("normalizeInputPath accepts a single image and directories of images", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-quality-pixel-input-"));
    const imagePath = path.join(tempDir, "one.png");
    const ignoredPath = path.join(tempDir, "ignore.txt");
    await sharp(oneBlockSvg()).png().toFile(imagePath);
    fs.writeFileSync(ignoredPath, "ignore", "utf8");

    assert.deepEqual(normalizeInputPath(imagePath), [imagePath]);
    assert.deepEqual(normalizeInputPath(tempDir), [imagePath]);
});

test("normalizeInputPath extracts clipboard screenshots from battle capture JSON", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-quality-pixel-capture-"));
    const capturePath = path.join(tempDir, "capture.json");
    const extractionDir = path.join(tempDir, "extracted");
    const image = await sharp(oneBlockSvg("#a65cff")).png().toBuffer();
    fs.writeFileSync(capturePath, JSON.stringify({
        schema_version: "ak_battle_clipboard_capture_v1",
        export_kind: "battle_input_clipboard_screenshot",
        map_id: "sunken_ship",
        screenshot_attachment: {
            name: "clipboard-screenshot.png",
            type: "image/png",
            data_url: `data:image/png;base64,${image.toString("base64")}`
        }
    }, null, 2));

    const inputs = normalizeInputPath(capturePath, { extractionDir });

    assert.equal(inputs.length, 1);
    assert.equal(path.basename(inputs[0]), "capture-screenshot.png");
    assert.equal(fs.existsSync(inputs[0]), true);
});

test("main writes a quality count report and overlay image", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-quality-pixel-report-"));
    const imagePath = path.join(tempDir, "one.png");
    const outputPath = path.join(tempDir, "report.json");
    await sharp(oneBlockSvg()).png().toFile(imagePath);

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        await main([imagePath, outputPath, "--crop=0.35,0,0.65,1"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.image_count, 1);
    assert.equal(report.quality_profile, "high_contrast_191");
    assert.equal(report.results[0].quality_profile, "high_contrast_191");
    assert.equal(report.results[0].summary.counts.o, 1);
    assert.equal(report.results[0].summary.total, 1);
    assert.ok(fs.existsSync(report.results[0].overlay_path));
    assert.equal(path.basename(path.dirname(report.results[0].overlay_path)), "report_quality_pixel_overlays");
    assert.equal(printed.join(""), `${outputPath}\n`);
});

test("main writes a quality count report from a battle capture JSON screenshot", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-quality-pixel-capture-main-"));
    const capturePath = path.join(tempDir, "capture.json");
    const outputPath = path.join(tempDir, "report.json");
    const image = await sharp(oneBlockSvg("#f24c4c")).png().toBuffer();
    fs.writeFileSync(capturePath, JSON.stringify({
        schema_version: "ak_battle_clipboard_capture_v1",
        export_kind: "battle_input_clipboard_screenshot",
        map_id: "sunken_ship",
        screenshot_attachment: {
            name: "clipboard-screenshot.png",
            type: "image/png",
            data_url: `data:image/png;base64,${image.toString("base64")}`
        }
    }, null, 2));

    const printed = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        printed.push(String(chunk));
        return true;
    };

    try {
        await main([capturePath, outputPath, "--crop=0.35,0,0.65,1"]);
    } finally {
        process.stdout.write = originalWrite;
    }

    const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(report.image_count, 1);
    assert.equal(report.quality_profile, "high_contrast_191");
    assert.equal(report.results[0].summary.counts.r, 1);
    assert.equal(report.results[0].summary.total, 1);
    assert.ok(report.results[0].file.endsWith("capture-screenshot.png"));
    assert.equal(printed.join(""), `${outputPath}\n`);
});
