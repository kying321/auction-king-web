const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const packageJson = require("../package.json");
const {
    buildCatalogItemExtractionReport
} = require("../catalog_item_extraction_runtime.js");
const {
    resolveArgs
} = require("../scripts/build_catalog_item_extraction_report.js");

test("package exposes catalog item extraction report entry", () => {
    assert.match(
        packageJson.scripts["build:catalog-item-extraction"] || "",
        /node\s+scripts\/build_catalog_item_extraction_report\.js/
    );
});

test("catalog item extraction CLI exposes OCR name matching switches", () => {
    const args = resolveArgs([
        "manifest.json",
        "report.json",
        "--enable-ocr-name-matching",
        "--ocr-sample-limit=8",
        "--ocr-name-accept-threshold=0.9",
        "--ocr-name-min-score-gap=0.07"
    ]);

    assert.equal(args.enableOcrNameMatching, true);
    assert.equal(args.ocrSampleLimit, 8);
    assert.deepEqual(args.ocrNameMatchOptions, {
        acceptThreshold: 0.9,
        minScoreGap: 0.07
    });
});

function drawRect(raw, width, left, top, rectWidth, rectHeight, rgb) {
    for (let y = top; y < top + rectHeight; y += 1) {
        for (let x = left; x < left + rectWidth; x += 1) {
            const offset = ((y * width) + x) * 4;
            raw[offset] = rgb[0];
            raw[offset + 1] = rgb[1];
            raw[offset + 2] = rgb[2];
            raw[offset + 3] = 255;
        }
    }
}

function drawGridCell(raw, width, left, top, active) {
    drawRect(raw, width, left, top, 10, 10, [112, 112, 112]);
    drawRect(raw, width, left + 2, top + 2, 6, 6, active ? [178, 178, 178] : [36, 36, 42]);
}

function drawGridCellWithCustomColors(raw, width, left, top, active, colors) {
    drawRect(raw, width, left, top, 10, 10, colors.border);
    drawRect(raw, width, left + 2, top + 2, 6, 6, active ? colors.active : colors.inactive);
}

function drawShape(raw, width, left, top, activeCells) {
    const active = new Set(activeCells);
    for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 2; col += 1) {
            drawGridCell(raw, width, left + (col * 14), top + (row * 14), active.has(`${row}:${col}`));
        }
    }
}

async function writeCatalogPage(filePath, shapes) {
    const width = 800;
    const height = 600;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }
    shapes.forEach((shape) => drawShape(raw, width, shape.left, shape.top, shape.activeCells));
    await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(filePath);
}

async function writeCatalogPageWithSixBySixGrids(filePath, shapes) {
    const width = 800;
    const height = 600;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }
    shapes.forEach((shape) => {
        const active = new Set(shape.activeCells);
        const colors = shape.colors || {
            border: [112, 112, 112],
            active: [178, 178, 178],
            inactive: [36, 36, 42]
        };
        for (let row = 0; row < 6; row += 1) {
            for (let col = 0; col < 6; col += 1) {
                drawGridCellWithCustomColors(
                    raw,
                    width,
                    shape.left + (col * 14),
                    shape.top + (row * 14),
                    active.has(`${row}:${col}`),
                    colors
                );
            }
        }
    });
    await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(filePath);
}

test("catalog item extraction aligns manual item values with recovered image slot contours", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-item-extraction-"));
    const manualDir = path.join(tempDir, "manual_catalog");
    fs.mkdirSync(manualDir, { recursive: true });
    const imageOne = path.join(tempDir, "page-1.png");
    const imageTwo = path.join(tempDir, "page-2.png");
    const manifestPath = path.join(tempDir, "catalog_quality_manifest.json");
    const outputPath = path.join(tempDir, "item-report.json");

    try {
        fs.writeFileSync(path.join(manualDir, "white_quality_items_batch_test.json"), `${JSON.stringify({
            batch_id: "white_quality_items_batch_test",
            source_kind: "test",
            quality: "w",
            reported_average_value: 300,
            cell_count_status: "pending_high_res",
            items: [
                { name: "item-a", value: 100, cells: null, name_confidence: "high" },
                { name: "item-b", value: 200, cells: null, name_confidence: "high" },
                { name: "item-c", value: 300, cells: null, name_confidence: "high" },
                { name: "item-d", value: 400, cells: null, name_confidence: "high" },
                { name: "item-e", value: 500, cells: null, name_confidence: "high" }
            ]
        }, null, 2)}\n`, "utf8");
        await writeCatalogPage(imageOne, [
            { left: 320, top: 220, activeCells: ["0:0", "0:1"] },
            { left: 720, top: 220, activeCells: ["0:0", "1:0"] },
            { left: 320, top: 500, activeCells: ["0:0"] },
            { left: 720, top: 500, activeCells: ["0:0", "0:1", "1:0"] }
        ]);
        await writeCatalogPage(imageTwo, [
            { left: 320, top: 220, activeCells: ["0:0", "0:1", "1:0"] }
        ]);
        fs.writeFileSync(manifestPath, `${JSON.stringify({
            manifest_id: "test_catalog_quality_manifest",
            source_thread_id: "test-thread",
            groups: [
                {
                    quality: "w",
                    label: "white",
                    image_count: 2,
                    images: [
                        { quality: "w", index: 1, file: imageOne, basename: path.basename(imageOne), width: 800, height: 600 },
                        { quality: "w", index: 2, file: imageTwo, basename: path.basename(imageTwo), width: 800, height: 600 }
                    ]
                }
            ]
        }, null, 2)}\n`, "utf8");

        const report = await buildCatalogItemExtractionReport({
            qualityManifestPath: manifestPath,
            manualCatalogDir: manualDir,
            outputPath,
            imageAnalysisOptions: {
                skipOcr: true,
                catalogPageSlotFilter: true,
                minGridCells: 2,
                minSquarePixels: 12,
                gridOccupiedLumaFloor: 96
            }
        });

        assert.equal(report.summary.total_items, 5);
        assert.equal(report.summary.items_with_cell_candidate, 5);
        assert.equal(report.summary.training_label_allowed_count, 0);
        assert.deepEqual(report.quality_summaries.w, {
            quality: "w",
            item_count: 5,
            image_count: 2,
            items_with_cell_candidate: 5,
            missing_cell_candidate_count: 0,
            max_candidate_cells: 3,
            average_candidate_cells: 2.2,
            average_value: 300
        });
        assert.equal(report.items[0].id, "w-0001");
        assert.equal(report.items[0].quality, "w");
        assert.equal(report.items[0].quality_label, "white");
        assert.equal(report.items[0].name, "item-a");
        assert.equal(report.items[0].value, 100);
        assert.deepEqual(report.items[0].slot, { row: 0, col: 0, ordinal: 0 });
        assert.equal(report.items[0].source_image_path, imageOne);
        assert.equal(report.items[0].manual_catalog_batch_id, "white_quality_items_batch_test");
        assert.equal(report.items[0].cell_candidate.cells, 2);
        assert.equal(report.items[0].cell_candidate.shape_signature, "1x2:##");
        assert.deepEqual(report.items[0].cell_candidate.shape_matrix, ["##"]);
        assert.equal(report.items[0].cell_candidate.precision_status, "grid_shape_candidate");
        assert.ok(report.items[0].cell_candidate.bounds);
        assert.equal(report.items[0].extraction_status, "cell_candidate_ready_for_review");
        assert.equal(report.items[0].training_label_allowed, false);
        assert.equal(report.items[4].name, "item-e");
        assert.equal(report.items[4].cell_candidate.cells, 3);
        assert.match(fs.readFileSync(report.markdown_path, "utf8"), /item-a/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("catalog item extraction imputes missing slot grids from same-page anchors", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-item-impute-"));
    const manualDir = path.join(tempDir, "manual_catalog");
    fs.mkdirSync(manualDir, { recursive: true });
    const imageOne = path.join(tempDir, "page-1.png");
    const manifestPath = path.join(tempDir, "catalog_quality_manifest.json");
    const outputPath = path.join(tempDir, "item-report.json");

    try {
        fs.writeFileSync(path.join(manualDir, "white_quality_items_batch_test.json"), `${JSON.stringify({
            batch_id: "white_quality_items_batch_test",
            source_kind: "test",
            quality: "w",
            reported_average_value: 250,
            cell_count_status: "pending_high_res",
            items: [
                { name: "dark-border-item", value: 100, cells: null, name_confidence: "high" },
                { name: "right-top", value: 200, cells: null, name_confidence: "high" },
                { name: "left-bottom", value: 300, cells: null, name_confidence: "high" },
                { name: "right-bottom", value: 400, cells: null, name_confidence: "high" }
            ]
        }, null, 2)}\n`, "utf8");
        await writeCatalogPageWithSixBySixGrids(imageOne, [
            {
                left: 320,
                top: 220,
                activeCells: ["0:0", "0:1"],
                colors: {
                    border: [38, 41, 48],
                    active: [180, 150, 72],
                    inactive: [34, 34, 40]
                }
            },
            { left: 720, top: 220, activeCells: ["0:0", "1:0"] },
            { left: 320, top: 500, activeCells: ["0:0"] },
            { left: 720, top: 500, activeCells: ["0:0", "0:1", "1:0"] }
        ]);
        fs.writeFileSync(manifestPath, `${JSON.stringify({
            manifest_id: "test_catalog_quality_manifest",
            source_thread_id: "test-thread",
            groups: [
                {
                    quality: "w",
                    label: "white",
                    image_count: 1,
                    images: [
                        { quality: "w", index: 1, file: imageOne, basename: path.basename(imageOne), width: 800, height: 600 }
                    ]
                }
            ]
        }, null, 2)}\n`, "utf8");

        const report = await buildCatalogItemExtractionReport({
            qualityManifestPath: manifestPath,
            manualCatalogDir: manualDir,
            outputPath,
            imageAnalysisOptions: {
                skipOcr: true,
                catalogPageSlotFilter: true,
                minGridCells: 2,
                minSquarePixels: 12,
                gridOccupiedLumaFloor: 96
            }
        });

        assert.equal(report.summary.total_items, 4);
        assert.equal(report.summary.items_with_cell_candidate, 4);
        assert.equal(report.summary.extraction_status_counts.cell_candidate_layout_imputed_review_required, 1);
        assert.equal(report.items[0].name, "dark-border-item");
        assert.equal(report.items[0].cell_candidate.layout_imputed, true);
        assert.equal(report.items[0].cell_candidate.candidate_source, "layout_imputed_fixed_grid");
        assert.equal(report.items[0].cell_candidate.cells, 2);
        assert.equal(report.items[0].extraction_status, "cell_candidate_layout_imputed_review_required");
        assert.equal(report.summary.training_label_allowed_count, 0);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("catalog item extraction records OCR name plus quality fuzzy match evidence without allowing training labels", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-item-name-match-"));
    const manualDir = path.join(tempDir, "manual_catalog");
    fs.mkdirSync(manualDir, { recursive: true });
    const imageOne = path.join(tempDir, "page-1.png");
    const manifestPath = path.join(tempDir, "catalog_quality_manifest.json");
    const outputPath = path.join(tempDir, "item-report.json");

    try {
        fs.writeFileSync(path.join(manualDir, "red_quality_items_batch_test.json"), `${JSON.stringify({
            batch_id: "red_quality_items_batch_test",
            source_kind: "test",
            quality: "r",
            reported_average_value: 800000,
            cell_count_status: "pending_high_res",
            items: [
                { name: "金陵折扇", value: 19371213, cells: null, name_confidence: "high" },
                { name: "永乐大典残本一", value: 1491800, cells: null, name_confidence: "high" },
                { name: "永乐大典残本二", value: 1553900, cells: null, name_confidence: "high" },
                { name: "超级跑车钥匙", value: 1495000, cells: null, name_confidence: "high" }
            ]
        }, null, 2)}\n`, "utf8");
        await writeCatalogPageWithSixBySixGrids(imageOne, [
            { left: 320, top: 220, activeCells: ["0:0", "0:1"] },
            { left: 720, top: 220, activeCells: ["0:0", "1:0"] },
            { left: 320, top: 500, activeCells: ["0:0"] },
            { left: 720, top: 500, activeCells: ["0:0", "0:1", "1:0"] }
        ]);
        fs.writeFileSync(manifestPath, `${JSON.stringify({
            manifest_id: "test_catalog_quality_manifest",
            source_thread_id: "test-thread",
            groups: [
                {
                    quality: "r",
                    label: "red",
                    image_count: 1,
                    images: [
                        { quality: "r", index: 1, file: imageOne, basename: path.basename(imageOne), width: 800, height: 600 }
                    ]
                }
            ]
        }, null, 2)}\n`, "utf8");

        const report = await buildCatalogItemExtractionReport({
            qualityManifestPath: manifestPath,
            manualCatalogDir: manualDir,
            outputPath,
            enableOcrNameMatching: true,
            ocrSlotCandidatesByImageBasename: {
                [path.basename(imageOne)]: {
                    "0:0": { name: "金陵折扇", confidence: 93 },
                    "0:1": { name: "永乐大典残本", confidence: 88 },
                    "1:0": { name: "超级跑车钥匙", quality: "purple", confidence: 90 }
                }
            },
            imageAnalysisOptions: {
                skipOcr: true,
                catalogPageSlotFilter: true,
                minGridCells: 2,
                minSquarePixels: 12,
                gridOccupiedLumaFloor: 96
            }
        });

        assert.deepEqual(report.summary.ocr_name_match_status_counts, {
            accepted: 1,
            needs_manual_review: 1,
            blocked: 1,
            missing_ocr_name_candidate: 1
        });
        assert.equal(report.items[0].ocr_name_candidate.best_text, "金陵折扇");
        assert.equal(report.items[0].ocr_name_match.status, "accepted");
        assert.equal(report.items[0].ocr_name_match.match.name, "金陵折扇");
        assert.equal(report.items[0].training_label_allowed, false);
        assert.equal(report.items[1].ocr_name_match.status, "needs_manual_review");
        assert.ok(report.items[1].ocr_name_match.blockers.includes("ambiguous_match_gap"));
        assert.equal(report.items[2].ocr_name_match.status, "blocked");
        assert.ok(report.items[2].ocr_name_match.blockers.includes("quality_mismatch"));
        assert.equal(report.items[3].ocr_name_match, null);
        assert.match(fs.readFileSync(report.markdown_path, "utf8"), /OCR Name Match/);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
