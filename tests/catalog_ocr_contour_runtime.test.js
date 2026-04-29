const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const packageJson = require("../package.json");
const {
    analyzeCatalogFixedGridRegionFromRaw,
    buildCatalogOcrContourReport,
    detectCatalogGridContoursFromRaw,
    inferCatalogCardBounds,
    parseTesseractTsv,
    normalizeInputPath
} = require("../src/core/catalog_ocr_contour_runtime.js");
const {
    resolveArgs
} = require("../scripts/build_catalog_ocr_contour_report.js");

test("package exposes catalog OCR contour report entry", () => {
    assert.match(
        packageJson.scripts["build:catalog-ocr-contour"] || "",
        /node\s+scripts\/build_catalog_ocr_contour_report\.js/
    );
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

function drawGridCellWithMisleadingCenter(raw, width, left, top, active) {
    drawRect(raw, width, left, top, 12, 12, [112, 112, 112]);
    drawRect(raw, width, left + 2, top + 2, 8, 8, active ? [178, 178, 178] : [34, 34, 40]);
    drawRect(raw, width, left + 4, top + 4, 4, 4, active ? [38, 176, 70] : [255, 235, 20]);
}

function drawGridCellWithCustomColors(raw, width, left, top, active, colors) {
    drawRect(raw, width, left, top, 10, 10, colors.border);
    drawRect(raw, width, left + 2, top + 2, 6, 6, active ? colors.active : colors.inactive);
}

test("resolveArgs accepts OCR options", () => {
    const result = resolveArgs([
        "input.png",
        "report.json",
        "--skip-ocr",
        "--ocr-sample-limit=4"
    ]);

    assert.equal(result.inputPath, path.resolve("input.png"));
    assert.equal(result.outputPath, path.resolve("report.json"));
    assert.equal(result.skipOcr, true);
    assert.equal(result.ocrSampleLimit, 4);
});

test("catalog contour detector uses small-grid borders and samples inward for occupied cells", () => {
    const width = 96;
    const height = 96;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }
    const active = new Set(["0:1", "1:0", "1:1", "1:2", "2:1"]);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            drawGridCell(raw, width, 20 + (col * 14), 18 + (row * 14), active.has(`${row}:${col}`));
        }
    }

    const report = detectCatalogGridContoursFromRaw(raw, width, height, {
        minGridCells: 4,
        minSquarePixels: 12,
        gridOccupiedLumaFloor: 96
    });
    assert.equal(report.summary.grid_count, 1);
    assert.equal(report.grid_candidates[0].cell_count, 5);
    assert.deepEqual(report.grid_candidates[0].shape_matrix, [".#.", "###", ".#."]);
    assert.deepEqual(report.grid_candidates[0].grid_matrix, ["+++", "+++", "+++"]);
    assert.equal(report.grid_candidates[0].threshold_basis, "adaptive_inner_luma_range");
    assert.equal(report.grid_candidates[0].grid_cells[0].inner_sample_strategy, "inner_edge_band");
    assert.ok(Array.isArray(report.grid_candidates[0].grid_cells[0].inner_sample_regions));
    assert.equal(report.grid_candidates[0].shape_signature, "3x3:.#./###/.#.");
    assert.deepEqual(report.grid_candidates[0].shape_analysis.trimmed_matrix, [".#.", "###", ".#."]);
    assert.equal(report.grid_candidates[0].shape_analysis.component_count, 1);
    assert.equal(report.grid_candidates[0].shape_analysis.perimeter_cell_count, 4);
    assert.equal(report.grid_candidates[0].shape_analysis.compactness, 0.5556);
    assert.equal(report.grid_candidates[0].shape_analysis.hole_count, 0);
    assert.ok(report.grid_candidates[0].grid_cells[0].inner_luma_quantiles);
    assert.ok(report.grid_candidates[0].grid_cells[0].inner_luma_quantiles.q50 > 36);
    assert.ok(report.grid_candidates[0].grid_cells[0].inner_luma_quantiles.q50 < 37);
});

test("catalog contour detector ignores misleading item-color centers inside grid cells", () => {
    const width = 112;
    const height = 104;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }
    const active = new Set(["0:1", "1:0", "1:1", "1:2", "2:1"]);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            drawGridCellWithMisleadingCenter(raw, width, 24 + (col * 16), 20 + (row * 16), active.has(`${row}:${col}`));
        }
    }

    const report = detectCatalogGridContoursFromRaw(raw, width, height, {
        minGridCells: 4,
        minSquarePixels: 12,
        gridOccupiedLumaFloor: 96
    });
    assert.equal(report.summary.grid_count, 1);
    assert.equal(report.grid_candidates[0].cell_count, 5);
    assert.deepEqual(report.grid_candidates[0].shape_matrix, [".#.", "###", ".#."]);
    const inactiveCorner = report.grid_candidates[0].grid_cells.find((cell) => cell.row === 0 && cell.col === 0);
    assert.equal(inactiveCorner.occupied, false);
    assert.equal(inactiveCorner.inner_sample_strategy, "inner_edge_band");
    assert.ok(inactiveCorner.inner_luma_quantiles.q90 > 34);
    assert.ok(inactiveCorner.inner_luma_quantiles.q90 < 36);
});

test("fixed catalog grid sampler recovers colored-border layout-imputed shapes", () => {
    const width = 128;
    const height = 128;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }
    const active = new Set(["0:0", "0:1", "1:0", "2:0"]);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            drawGridCellWithCustomColors(raw, width, 20 + (col * 14), 24 + (row * 14), active.has(`${row}:${col}`), {
                border: [38, 41, 48],
                active: [180, 150, 72],
                inactive: [34, 34, 40]
            });
        }
    }

    const candidate = analyzeCatalogFixedGridRegionFromRaw(raw, width, height, {
        left: 20,
        top: 24,
        width: 38,
        height: 38
    }, {
        fixedGridRows: 3,
        fixedGridCols: 3,
        gridOccupiedLumaFloor: 96
    });

    assert.equal(candidate.candidate_source, "layout_imputed_fixed_grid");
    assert.equal(candidate.precision_status, "layout_imputed_grid_candidate");
    assert.equal(candidate.cell_count, 4);
    assert.equal(candidate.shape_signature, "3x2:##/#./#.");
    assert.equal(candidate.grid_cells.every((cell) => cell.layout_predicted), true);
});

test("catalog contour detector emits normalized signatures for offset sparse shapes", () => {
    const width = 96;
    const height = 96;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }
    const active = new Set(["1:1", "1:2", "2:1"]);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 4; col += 1) {
            drawGridCell(raw, width, 16 + (col * 14), 18 + (row * 14), active.has(`${row}:${col}`));
        }
    }

    const report = detectCatalogGridContoursFromRaw(raw, width, height, {
        minGridCells: 4,
        minSquarePixels: 12,
        gridOccupiedLumaFloor: 96
    });
    const candidate = report.grid_candidates[0];

    assert.equal(candidate.cell_count, 3);
    assert.equal(candidate.shape_signature, "2x2:##/#.");
    assert.deepEqual(candidate.shape_analysis.occupied_coordinates, [
        { row: 1, col: 1 },
        { row: 1, col: 2 },
        { row: 2, col: 1 }
    ]);
    assert.equal(candidate.shape_analysis.bounding_box_cells.area, 4);
    assert.equal(candidate.shape_analysis.compactness, 0.75);
});

test("catalog OCR contour report aggregates reusable shape signatures", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-contour-test-"));
    const imagePath = path.join(tempDir, "catalog.png");
    const outputPath = path.join(tempDir, "report.json");
    const width = 96;
    const height = 96;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }
    const active = new Set(["0:1", "1:0", "1:1", "1:2", "2:1"]);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            drawGridCell(raw, width, 20 + (col * 14), 18 + (row * 14), active.has(`${row}:${col}`));
        }
    }

    try {
        await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(imagePath);
        const report = await buildCatalogOcrContourReport([imagePath], {
            outputPath,
            skipOcr: true,
            ocrSampleLimit: 1,
            minGridCells: 4,
            minSquarePixels: 12,
            gridOccupiedLumaFloor: 96
        });

        assert.equal(report.summary.grid_candidate_count, 1);
        assert.equal(report.summary.cell_count_total, 5);
        assert.equal(report.summary.shape_signature_counts["3x3:.#./###/.#."], 1);
        assert.equal(report.summary.cell_count_distribution["5"], 1);
        assert.deepEqual(report.summary.top_shape_signatures[0], {
            shape_signature: "3x3:.#./###/.#.",
            count: 1,
            cell_count: 5
        });
        assert.equal(report.results[0].shape_summary.shape_signature_counts["3x3:.#./###/.#."], 1);
        assert.match(fs.readFileSync(report.markdown_path, "utf8"), /## Shape Summary[\s\S]*3x3:\.#\.\/###\/\.\#\./);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("catalog card bounds honor configured column count and header height", () => {
    const card = inferCatalogCardBounds(
        { width: 400, height: 640 },
        {
            bounds: { height: 24 },
            center: { x: 275, y: 92 }
        },
        { columns: 4, headerHeight: 80 }
    );

    assert.equal(card.left, 200);
    assert.equal(card.width, 100);
    assert.equal(card.top, 80);
    assert.equal(card.basis, "4_column_grid_anchor_estimate");
});

test("catalog OCR contour report keeps one right-side grid candidate per catalog page slot", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-page-slot-test-"));
    const imagePath = path.join(tempDir, "catalog-page.png");
    const outputPath = path.join(tempDir, "report.json");
    const width = 800;
    const height = 600;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 4) {
        raw[index] = 24;
        raw[index + 1] = 24;
        raw[index + 2] = 30;
        raw[index + 3] = 255;
    }

    const drawShape = (left, top, activeCells) => {
        const active = new Set(activeCells);
        for (let row = 0; row < 2; row += 1) {
            for (let col = 0; col < 2; col += 1) {
                drawGridCell(raw, width, left + (col * 14), top + (row * 14), active.has(`${row}:${col}`));
            }
        }
    };

    drawShape(320, 220, ["0:0", "0:1"]);
    drawShape(720, 220, ["0:0", "1:0"]);
    drawShape(320, 500, ["0:0"]);
    drawShape(720, 500, ["0:0", "0:1", "1:0"]);
    drawShape(210, 240, ["0:0", "0:1", "1:0", "1:1"]);

    try {
        await sharp(raw, { raw: { width, height, channels: 4 } }).png().toFile(imagePath);
        const report = await buildCatalogOcrContourReport([imagePath], {
            outputPath,
            skipOcr: true,
            minGridCells: 2,
            minSquarePixels: 12,
            gridOccupiedLumaFloor: 96,
            catalogPageSlotFilter: true
        });

        assert.equal(report.results[0].summary.grid_count, 4);
        assert.equal(report.summary.grid_candidate_count, 4);
        assert.deepEqual(report.summary.cell_count_distribution, {
            "1": 1,
            "2": 2,
            "3": 1
        });
        assert.equal(report.results[0].grid_candidates.some((candidate) => candidate.bounds.left === 210), false);
        assert.equal(report.results[0].grid_candidates.every((candidate) => candidate.catalog_page_slot), true);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("parseTesseractTsv combines text by OCR line and averages confidence", () => {
    const parsed = parseTesseractTsv([
        "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
        "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t80\t金",
        "5\t1\t1\t1\t1\t2\t12\t0\t10\t10\t60\t表",
        "5\t1\t1\t1\t2\t1\t0\t12\t10\t10\t40\t红",
        ""
    ].join("\n"));

    assert.equal(parsed.text, "金表\n红");
    assert.equal(parsed.confidence, 60);
    assert.equal(parsed.word_count, 3);
});

test("normalizeInputPath rejects non-image files through JSON manifests", () => {
    const result = normalizeInputPath("package.json");
    assert.deepEqual(result, []);
});
