const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const {
    findBestVerticalOffset,
    stitchCaptureScreenshots
} = require("../scripts/stitch_capture_screenshots.js");

async function createSyntheticCapture(filePath, {
    sourceTop,
    sourceHeight = 150,
    viewportHeight = 90,
    headerHeight = 10,
    width = 80
}) {
    const contentHeight = viewportHeight - headerHeight;
    const svgLines = [];
    for (let y = 0; y < contentHeight; y += 1) {
        const sourceY = sourceTop + y;
        const red = (sourceY * 7) % 255;
        const green = (sourceY * 13) % 255;
        const blue = (sourceY * 17) % 255;
        svgLines.push(`<rect x="0" y="${headerHeight + y}" width="${width}" height="1" fill="rgb(${red},${green},${blue})"/>`);
    }
    const svg = Buffer.from(`
<svg width="${width}" height="${viewportHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="#202020"/>
  ${svgLines.join("\n")}
  <text x="4" y="8" font-size="7" fill="#ffffff">战利品</text>
</svg>`);
    const image = await sharp(svg).png().toBuffer();
    const payload = {
        schema_version: "ak_battle_clipboard_capture_v1",
        map_id: "sunken_ship",
        field_values: { total_items: sourceHeight },
        screenshot_attachment: {
            mime_type: "image/png",
            data_url: `data:image/png;base64,${image.toString("base64")}`
        }
    };
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("findBestVerticalOffset recovers known overlapping content offset", async () => {
    const width = 32;
    const height = 60;
    const previous = Buffer.alloc(width * height * 3);
    const next = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const previousValue = (y * 5 + x * 3) % 255;
            const nextValue = ((y + 38) * 5 + x * 3) % 255;
            const previousIndex = ((y * width) + x) * 3;
            const nextIndex = ((y * width) + x) * 3;
            previous[previousIndex] = previousValue;
            previous[previousIndex + 1] = (previousValue * 2) % 255;
            previous[previousIndex + 2] = (previousValue * 3) % 255;
            next[nextIndex] = nextValue;
            next[nextIndex + 1] = (nextValue * 2) % 255;
            next[nextIndex + 2] = (nextValue * 3) % 255;
        }
    }

    const match = findBestVerticalOffset(
        { raw_data: previous, raw_info: { width, height, channels: 3 } },
        { raw_data: next, raw_info: { width, height, channels: 3 } },
        { minOverlap: 10 }
    );

    assert.equal(match.delta, 38);
    assert.equal(match.overlap, 22);
});

test("findBestVerticalOffset compares the shared area when content widths differ", async () => {
    const previousWidth = 40;
    const nextWidth = 32;
    const height = 60;
    const previous = Buffer.alloc(previousWidth * height * 3);
    const next = Buffer.alloc(nextWidth * height * 3);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < previousWidth; x += 1) {
            const value = (y * 5 + x * 3) % 255;
            const index = ((y * previousWidth) + x) * 3;
            previous[index] = value;
            previous[index + 1] = (value * 2) % 255;
            previous[index + 2] = (value * 3) % 255;
        }
        for (let x = 0; x < nextWidth; x += 1) {
            const value = ((y + 38) * 5 + x * 3) % 255;
            const index = ((y * nextWidth) + x) * 3;
            next[index] = value;
            next[index + 1] = (value * 2) % 255;
            next[index + 2] = (value * 3) % 255;
        }
    }

    const match = findBestVerticalOffset(
        { raw_data: previous, raw_info: { width: previousWidth, height, channels: 3 } },
        { raw_data: next, raw_info: { width: nextWidth, height, channels: 3 } },
        { minOverlap: 10 }
    );

    assert.equal(match.delta, 38);
    assert.equal(match.overlap, 22);
});

test("stitchCaptureScreenshots removes repeated header and writes stitched image manifest", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-stitch-"));
    const first = path.join(tempDir, "first.json");
    const second = path.join(tempDir, "second.json");
    const output = path.join(tempDir, "stitched.png");
    await createSyntheticCapture(first, { sourceTop: 0 });
    await createSyntheticCapture(second, { sourceTop: 55 });

    const result = await stitchCaptureScreenshots([first, second], {
        outputPath: output,
        crop: { left: 0, top: 0, width: 1, height: 1 },
        headerHeight: 10,
        minOverlap: 15
    });
    const metadata = await sharp(output).metadata();

    assert.equal(result.manifest.matches[0].delta, 55);
    assert.equal(result.manifest.header_height, 10);
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 145);
    assert.equal(fs.existsSync(result.manifestPath), true);
});

test("stitchCaptureScreenshots crops mismatched capture widths to a common review image", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-stitch-width-"));
    const first = path.join(tempDir, "first.json");
    const second = path.join(tempDir, "second.json");
    const output = path.join(tempDir, "stitched.png");
    await createSyntheticCapture(first, { sourceTop: 0, width: 84 });
    await createSyntheticCapture(second, { sourceTop: 55, width: 76 });

    const result = await stitchCaptureScreenshots([first, second], {
        outputPath: output,
        crop: { left: 0, top: 0, width: 1, height: 1 },
        headerHeight: 10,
        minOverlap: 15
    });
    const metadata = await sharp(output).metadata();

    assert.equal(result.manifest.matches[0].delta, 55);
    assert.equal(result.manifest.width_normalization.applied, true);
    assert.deepEqual(result.manifest.width_normalization.input_content_widths, [84, 76]);
    assert.equal(result.manifest.width_normalization.comparison_width, 76);
    assert.equal(metadata.width, 84);
    assert.equal(metadata.height, 145);
});

test("stitchCaptureScreenshots sizes the canvas from every stitched fragment bottom", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-stitch-height-"));
    const first = path.join(tempDir, "first.json");
    const second = path.join(tempDir, "second.json");
    const output = path.join(tempDir, "stitched.png");
    await createSyntheticCapture(first, { sourceTop: 0, viewportHeight: 120 });
    await createSyntheticCapture(second, { sourceTop: 20, viewportHeight: 90 });

    const result = await stitchCaptureScreenshots([first, second], {
        outputPath: output,
        crop: { left: 0, top: 0, width: 1, height: 1 },
        headerHeight: 10,
        minOverlap: 60
    });
    const metadata = await sharp(output).metadata();

    assert.equal(result.manifest.matches[0].delta, 20);
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 120);
});

test("stitchCaptureScreenshots flags severely narrow capture fragments", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-stitch-narrow-"));
    const first = path.join(tempDir, "first.json");
    const second = path.join(tempDir, "second.json");
    const output = path.join(tempDir, "stitched.png");
    await createSyntheticCapture(first, { sourceTop: 0, width: 84 });
    await createSyntheticCapture(second, { sourceTop: 55, width: 24 });

    const result = await stitchCaptureScreenshots([first, second], {
        outputPath: output,
        crop: { left: 0, top: 0, width: 1, height: 1 },
        headerHeight: 10,
        minOverlap: 15
    });
    const metadata = await sharp(output).metadata();

    assert.equal(metadata.width, 84);
    assert.ok(result.manifest.width_normalization.quality_flags.includes("severe_width_mismatch_review_image_may_be_partial"));
    assert.ok(result.manifest.width_normalization.quality_flags.includes("narrow_capture_fragment_needs_recapture_or_manual_single_review"));
});

test("stitchCaptureScreenshots writes a cropped review image for one capture", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-stitch-single-"));
    const first = path.join(tempDir, "first.json");
    const output = path.join(tempDir, "single.png");
    await createSyntheticCapture(first, { sourceTop: 0 });

    const result = await stitchCaptureScreenshots([first], {
        outputPath: output,
        crop: { left: 0, top: 0, width: 1, height: 1 },
        headerHeight: 10,
        minOverlap: 15
    });
    const metadata = await sharp(output).metadata();

    assert.equal(result.manifest.input_count, 1);
    assert.deepEqual(result.manifest.matches, []);
    assert.equal(result.manifest.header_height, 10);
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 90);
    assert.equal(fs.existsSync(result.manifestPath), true);
});
