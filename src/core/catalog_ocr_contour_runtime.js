const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const sharp = require("sharp");

const execFileAsync = promisify(execFile);

const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "docs", "research", "2026-04-26-catalog-card-ocr-contour-report.json");
const DEFAULT_OCR_LANGUAGES = "chi_sim+eng";
const DEFAULT_OCR_SAMPLE_LIMIT = 12;
const DEFAULT_TESSERACT_TIMEOUT_MS = 5000;

function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round(Number(value || 0) * factor) / factor;
}

function resolveTesseractTimeoutMs(options = {}) {
    const rawTimeout = Number(options.tesseractTimeoutMs ?? options.ocrTimeoutMs);
    if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) return DEFAULT_TESSERACT_TIMEOUT_MS;
    return Math.min(Math.round(rawTimeout), DEFAULT_TESSERACT_TIMEOUT_MS);
}

function isImagePath(filePath) {
    return /\.(png|jpe?g|webp)$/i.test(filePath);
}

function normalizeInputPath(inputPath) {
    const resolved = path.resolve(inputPath);
    const stat = fs.statSync(resolved);

    if (stat.isDirectory()) {
        return fs.readdirSync(resolved)
            .filter((name) => isImagePath(name))
            .sort()
            .map((name) => path.join(resolved, name));
    }

    if (stat.isFile() && isImagePath(resolved)) return [resolved];

    if (stat.isFile() && /\.json$/i.test(resolved)) {
        const payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
        const entries = Array.isArray(payload)
            ? payload
            : (Array.isArray(payload.images) ? payload.images : (Array.isArray(payload.results) ? payload.results : []));
        return entries
            .map((entry) => {
                if (typeof entry === "string") return entry;
                if (!entry || typeof entry !== "object") return null;
                return entry.file || entry.path || entry.source_image_path || entry.output_path || null;
            })
            .filter(Boolean)
            .map((entry) => path.resolve(entry))
            .filter((entry) => fs.existsSync(entry) && isImagePath(entry));
    }

    return [];
}

function luminance(r, g, b) {
    return (0.299 * r) + (0.587 * g) + (0.114 * b);
}

function isNeutralGridPixel(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = luminance(r, g, b);
    return luma >= 70 && luma <= 235 && max - min <= 46;
}

function pixelOffset(x, y, width) {
    return ((y * width) + x) * 4;
}

function collectNeutralSquareComponents(raw, width, height, options = {}) {
    const visited = new Uint8Array(width * height);
    const components = [];
    const minPixels = Number.isFinite(options.minSquarePixels) ? options.minSquarePixels : 8;
    const minSide = Number.isFinite(options.minSquareSide) ? options.minSquareSide : 3;
    const maxSide = Number.isFinite(options.maxSquareSide)
        ? options.maxSquareSide
        : Math.max(18, Math.round(Math.min(width, height) * 0.045));

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const startOffset = (y * width) + x;
            if (visited[startOffset]) continue;
            const colorOffset = pixelOffset(x, y, width);
            if (!isNeutralGridPixel(raw[colorOffset], raw[colorOffset + 1], raw[colorOffset + 2])) continue;

            const queue = [startOffset];
            visited[startOffset] = 1;
            let cursor = 0;
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let lumaSum = 0;

            while (cursor < queue.length) {
                const activeOffset = queue[cursor];
                cursor += 1;
                const pointY = Math.floor(activeOffset / width);
                const pointX = activeOffset - (pointY * width);
                const activeColorOffset = pixelOffset(pointX, pointY, width);
                lumaSum += luminance(raw[activeColorOffset], raw[activeColorOffset + 1], raw[activeColorOffset + 2]);
                minX = Math.min(minX, pointX);
                maxX = Math.max(maxX, pointX);
                minY = Math.min(minY, pointY);
                maxY = Math.max(maxY, pointY);

                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                    const nx = pointX + dx;
                    const ny = pointY + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
                    const nextOffset = (ny * width) + nx;
                    if (visited[nextOffset]) return;
                    const nextColorOffset = pixelOffset(nx, ny, width);
                    if (!isNeutralGridPixel(raw[nextColorOffset], raw[nextColorOffset + 1], raw[nextColorOffset + 2])) return;
                    visited[nextOffset] = 1;
                    queue.push(nextOffset);
                });
            }

            const componentWidth = maxX - minX + 1;
            const componentHeight = maxY - minY + 1;
            const area = componentWidth * componentHeight;
            const aspect = componentWidth / componentHeight;
            const fillRatio = queue.length / area;
            if (queue.length < minPixels) continue;
            if (componentWidth < minSide || componentHeight < minSide) continue;
            if (componentWidth > maxSide || componentHeight > maxSide) continue;
            if (aspect < 0.45 || aspect > 2.2) continue;
            if (fillRatio < 0.32) continue;

            components.push({
                x: minX,
                y: minY,
                width: componentWidth,
                height: componentHeight,
                center_x: round(minX + (componentWidth / 2), 3),
                center_y: round(minY + (componentHeight / 2), 3),
                pixel_count: queue.length,
                fill_ratio: round(fillRatio),
                luma: round(lumaSum / queue.length, 2)
            });
        }
    }

    return components.sort((left, right) => left.y - right.y || left.x - right.x);
}

function median(values = []) {
    const normalized = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!normalized.length) return null;
    const mid = Math.floor(normalized.length / 2);
    return normalized.length % 2 ? normalized[mid] : (normalized[mid - 1] + normalized[mid]) / 2;
}

function quantile(values = [], probability = 0.5) {
    const normalized = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!normalized.length) return null;
    const clamped = Math.max(0, Math.min(1, probability));
    const index = (normalized.length - 1) * clamped;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return normalized[lower];
    const ratio = index - lower;
    return normalized[lower] + ((normalized[upper] - normalized[lower]) * ratio);
}

function clusterByDistance(components, options = {}) {
    const medianSide = median(components.flatMap((component) => [component.width, component.height])) || 8;
    const maxGap = Number.isFinite(options.maxGridComponentGap)
        ? options.maxGridComponentGap
        : Math.max(16, medianSide * 3.5);
    const parent = components.map((_, index) => index);
    const find = (index) => {
        if (parent[index] !== index) parent[index] = find(parent[index]);
        return parent[index];
    };
    const unite = (left, right) => {
        const rootLeft = find(left);
        const rootRight = find(right);
        if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
    };

    for (let leftIndex = 0; leftIndex < components.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < components.length; rightIndex += 1) {
            const left = components[leftIndex];
            const right = components[rightIndex];
            const dx = Math.abs(left.center_x - right.center_x);
            const dy = Math.abs(left.center_y - right.center_y);
            if (dx <= maxGap && dy <= maxGap) unite(leftIndex, rightIndex);
        }
    }

    const clusters = new Map();
    components.forEach((component, index) => {
        const root = find(index);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(component);
    });
    return Array.from(clusters.values());
}

function clusterPositions(values = [], tolerance = 4) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    const groups = [];
    sorted.forEach((value) => {
        const last = groups[groups.length - 1];
        if (!last || Math.abs(value - last.center) > tolerance) {
            groups.push({ values: [value], center: value });
            return;
        }
        last.values.push(value);
        last.center = last.values.reduce((sum, entry) => sum + entry, 0) / last.values.length;
    });
    return groups.map((group) => round(group.center, 3));
}

function nearestIndex(values, target) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    values.forEach((value, index) => {
        const distance = Math.abs(value - target);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    });
    return bestIndex;
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function collectRegionLumas(raw, width, height, regions) {
    const values = [];
    regions.forEach((region) => {
        const left = clampNumber(Math.round(region.left), 0, width);
        const top = clampNumber(Math.round(region.top), 0, height);
        const right = clampNumber(Math.round(region.left + region.width), 0, width);
        const bottom = clampNumber(Math.round(region.top + region.height), 0, height);
        for (let y = top; y < bottom; y += 1) {
            for (let x = left; x < right; x += 1) {
                const offset = pixelOffset(x, y, width);
                values.push(luminance(raw[offset], raw[offset + 1], raw[offset + 2]));
            }
        }
    });
    return values;
}

function makeInnerEdgeBandRegions(left, top, right, bottom, bandPixels) {
    const innerWidth = Math.max(0, right - left);
    const innerHeight = Math.max(0, bottom - top);
    if (innerWidth <= 0 || innerHeight <= 0) return [];
    const band = clampNumber(Math.round(bandPixels), 1, Math.max(1, Math.floor(Math.min(innerWidth, innerHeight) / 2)));
    const regions = [
        { left, top, width: innerWidth, height: band }
    ];
    const bottomTop = bottom - band;
    if (bottomTop > top + band) regions.push({ left, top: bottomTop, width: innerWidth, height: band });

    const middleTop = top + band;
    const middleHeight = Math.max(0, bottom - top - (band * 2));
    if (middleHeight > 0) {
        regions.push({ left, top: middleTop, width: band, height: middleHeight });
        const rightLeft = right - band;
        if (rightLeft > left + band) regions.push({ left: rightLeft, top: middleTop, width: band, height: middleHeight });
    }

    return regions.filter((region) => region.width > 0 && region.height > 0);
}

function summarizeSample(values, bounds, regions, strategy, fallbackLuma) {
    const normalizedValues = values.filter(Number.isFinite);
    return {
        luma: normalizedValues.length ? round(normalizedValues.reduce((sum, value) => sum + value, 0) / normalizedValues.length, 2) : fallbackLuma,
        sample_count: normalizedValues.length,
        luma_quantiles: normalizedValues.length ? {
            q10: round(quantile(normalizedValues, 0.1), 2),
            q25: round(quantile(normalizedValues, 0.25), 2),
            q50: round(quantile(normalizedValues, 0.5), 2),
            q75: round(quantile(normalizedValues, 0.75), 2),
            q90: round(quantile(normalizedValues, 0.9), 2),
            sd: round(standardDeviation(normalizedValues), 2)
        } : null,
        bounds,
        regions,
        strategy
    };
}

function sampleInnerLuma(raw, width, height, component, options = {}) {
    const side = Math.max(1, Math.min(component.width, component.height));
    const defaultInsetPixels = clampNumber(Math.round(side * 0.18), 1, 4);
    const insetPixels = Number.isFinite(options.gridInnerInsetPixels)
        ? clampNumber(Math.round(options.gridInnerInsetPixels), 0, Math.max(0, Math.floor(side / 2) - 1))
        : defaultInsetPixels;
    const innerLeft = Math.max(0, Math.round(component.x + insetPixels));
    const innerTop = Math.max(0, Math.round(component.y + insetPixels));
    const innerRight = Math.min(width, Math.round(component.x + component.width - insetPixels));
    const innerBottom = Math.min(height, Math.round(component.y + component.height - insetPixels));
    const innerBounds = {
        left: innerLeft,
        top: innerTop,
        width: Math.max(0, innerRight - innerLeft),
        height: Math.max(0, innerBottom - innerTop)
    };
    const defaultBandPixels = clampNumber(Math.round(side * 0.18), 1, 4);
    const bandPixels = Number.isFinite(options.gridInnerBandPixels)
        ? Math.max(1, Math.round(options.gridInnerBandPixels))
        : defaultBandPixels;
    const edgeRegions = makeInnerEdgeBandRegions(innerLeft, innerTop, innerRight, innerBottom, bandPixels);
    const edgeValues = collectRegionLumas(raw, width, height, edgeRegions);
    if (edgeValues.length >= 3) {
        return summarizeSample(edgeValues, innerBounds, edgeRegions, "inner_edge_band", component.luma);
    }

    const insetFraction = Number.isFinite(options.gridInnerInsetFraction) ? options.gridInnerInsetFraction : 0.3;
    const fallbackLeft = Math.max(0, Math.round(component.x + (component.width * insetFraction)));
    const fallbackTop = Math.max(0, Math.round(component.y + (component.height * insetFraction)));
    const fallbackRight = Math.min(width, Math.round(component.x + (component.width * (1 - insetFraction))));
    const fallbackBottom = Math.min(height, Math.round(component.y + (component.height * (1 - insetFraction))));
    const fallbackBounds = {
        left: fallbackLeft,
        top: fallbackTop,
        width: Math.max(0, fallbackRight - fallbackLeft),
        height: Math.max(0, fallbackBottom - fallbackTop)
    };
    const fallbackRegions = [fallbackBounds].filter((region) => region.width > 0 && region.height > 0);
    return summarizeSample(
        collectRegionLumas(raw, width, height, fallbackRegions),
        fallbackBounds,
        fallbackRegions,
        "center_fallback",
        component.luma
    );
}

function buildOccupiedSlots(cluster, rowCenters, colCenters, raw, width, height, options = {}) {
    const slotMap = new Map();
    const cellSamples = [];
    cluster.forEach((component) => {
        const row = nearestIndex(rowCenters, component.center_y);
        const col = nearestIndex(colCenters, component.center_x);
        const sample = sampleInnerLuma(raw, width, height, component, options);
        const key = `${row}:${col}`;
        const entry = {
            row,
            col,
            component,
            inner_luma: sample.luma,
            inner_luma_quantiles: sample.luma_quantiles,
            inner_sample_count: sample.sample_count,
            inner_sample_bounds: sample.bounds,
            inner_sample_regions: sample.regions,
            inner_sample_strategy: sample.strategy
        };
        cellSamples.push(entry);
        const previous = slotMap.get(key);
        if (!previous || entry.inner_luma > previous.inner_luma) slotMap.set(key, entry);
    });

    const lumas = Array.from(slotMap.values()).map((entry) => entry.inner_luma).filter(Number.isFinite);
    const minLuma = lumas.length ? Math.min(...lumas) : 0;
    const maxLuma = lumas.length ? Math.max(...lumas) : 0;
    const medianLuma = median(lumas) || 0;
    const spread = maxLuma - minLuma;
    const fixedFloor = Number.isFinite(options.gridOccupiedLumaFloor) ? options.gridOccupiedLumaFloor : 108;
    const adaptiveThreshold = spread >= 18
        ? minLuma + (spread * 0.42)
        : medianLuma + 8;
    const threshold = Math.max(fixedFloor, adaptiveThreshold);
    const occupied = new Set();
    const gridCells = [];

    for (let row = 0; row < rowCenters.length; row += 1) {
        for (let col = 0; col < colCenters.length; col += 1) {
            const key = `${row}:${col}`;
            const entry = slotMap.get(key) || null;
            const active = Boolean(entry && entry.inner_luma >= threshold);
            if (active) occupied.add(key);
            gridCells.push({
                row,
                col,
                detected_border: Boolean(entry),
                occupied: active,
                inner_luma: entry ? entry.inner_luma : null,
                inner_luma_quantiles: entry ? entry.inner_luma_quantiles : null,
                inner_sample_strategy: entry ? entry.inner_sample_strategy : null,
                component_bounds: entry ? {
                    left: entry.component.x,
                    top: entry.component.y,
                    width: entry.component.width,
                    height: entry.component.height
                } : null,
                inner_sample_bounds: entry ? entry.inner_sample_bounds : null,
                inner_sample_regions: entry ? entry.inner_sample_regions : null
            });
        }
    }

    return {
        occupied,
        gridCells,
        slotMap,
        threshold: round(threshold, 2),
        luma_range: { min: round(minLuma, 2), median: round(medianLuma, 2), max: round(maxLuma, 2), spread: round(spread, 2) },
        threshold_basis: spread >= 18 ? "adaptive_inner_luma_range" : "low_contrast_inner_luma_floor",
        cellSamples
    };
}

function normalizeFixedGridBounds(bounds, width, height) {
    const left = clampNumber(Math.round(bounds.left), 0, Math.max(0, width - 1));
    const top = clampNumber(Math.round(bounds.top), 0, Math.max(0, height - 1));
    const right = clampNumber(
        Math.round(bounds.left + bounds.width),
        left + 1,
        width
    );
    const bottom = clampNumber(
        Math.round(bounds.top + bounds.height),
        top + 1,
        height
    );
    return {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top)
    };
}

function analyzeCatalogFixedGridRegionFromRaw(raw, width, height, bounds, options = {}) {
    const fixedBounds = normalizeFixedGridBounds(bounds, width, height);
    const rows = Number.isFinite(Number(options.fixedGridRows)) && Number(options.fixedGridRows) > 0
        ? Math.max(1, Math.round(Number(options.fixedGridRows)))
        : 6;
    const cols = Number.isFinite(Number(options.fixedGridCols)) && Number(options.fixedGridCols) > 0
        ? Math.max(1, Math.round(Number(options.fixedGridCols)))
        : 6;
    const cellSamples = [];
    const lumas = [];

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const cellLeft = fixedBounds.left + ((fixedBounds.width * col) / cols);
            const cellTop = fixedBounds.top + ((fixedBounds.height * row) / rows);
            const cellRight = fixedBounds.left + ((fixedBounds.width * (col + 1)) / cols);
            const cellBottom = fixedBounds.top + ((fixedBounds.height * (row + 1)) / rows);
            const pitchWidth = Math.max(1, cellRight - cellLeft);
            const pitchHeight = Math.max(1, cellBottom - cellTop);
            const insetFraction = Number.isFinite(options.fixedGridCellInsetFraction)
                ? Math.max(0, Math.min(0.4, options.fixedGridCellInsetFraction))
                : 0.16;
            const insetX = pitchWidth * insetFraction;
            const insetY = pitchHeight * insetFraction;
            const component = {
                x: Math.round(cellLeft + insetX),
                y: Math.round(cellTop + insetY),
                width: Math.max(1, Math.round(cellRight - insetX) - Math.round(cellLeft + insetX)),
                height: Math.max(1, Math.round(cellBottom - insetY) - Math.round(cellTop + insetY)),
                luma: null
            };
            const sample = sampleInnerLuma(raw, width, height, component, options);
            cellSamples.push({
                row,
                col,
                component,
                inner_luma: sample.luma,
                inner_luma_quantiles: sample.luma_quantiles,
                inner_sample_count: sample.sample_count,
                inner_sample_bounds: sample.bounds,
                inner_sample_regions: sample.regions,
                inner_sample_strategy: sample.strategy
            });
            if (Number.isFinite(sample.luma)) lumas.push(sample.luma);
        }
    }

    const minLuma = lumas.length ? Math.min(...lumas) : 0;
    const maxLuma = lumas.length ? Math.max(...lumas) : 0;
    const medianLuma = median(lumas) || 0;
    const spread = maxLuma - minLuma;
    const fixedFloor = Number.isFinite(options.gridOccupiedLumaFloor) ? options.gridOccupiedLumaFloor : 108;
    const adaptiveThreshold = spread >= 18
        ? minLuma + (spread * 0.42)
        : medianLuma + 8;
    const threshold = Math.max(fixedFloor, adaptiveThreshold);
    const occupied = new Set();
    const gridCells = [];

    cellSamples.forEach((entry) => {
        const active = Number.isFinite(entry.inner_luma) && entry.inner_luma >= threshold;
        if (active) occupied.add(`${entry.row}:${entry.col}`);
        gridCells.push({
            row: entry.row,
            col: entry.col,
            detected_border: false,
            layout_predicted: true,
            occupied: active,
            inner_luma: entry.inner_luma,
            inner_luma_quantiles: entry.inner_luma_quantiles,
            inner_sample_strategy: entry.inner_sample_strategy,
            component_bounds: {
                left: entry.component.x,
                top: entry.component.y,
                width: entry.component.width,
                height: entry.component.height
            },
            inner_sample_bounds: entry.inner_sample_bounds,
            inner_sample_regions: entry.inner_sample_regions
        });
    });

    if (occupied.size < 1) return null;

    const shapeMatrix = [];
    const gridMatrix = [];
    for (let row = 0; row < rows; row += 1) {
        let shapeLine = "";
        let gridLine = "";
        for (let col = 0; col < cols; col += 1) {
            const key = `${row}:${col}`;
            shapeLine += occupied.has(key) ? "#" : ".";
            gridLine += "+";
        }
        shapeMatrix.push(shapeLine);
        gridMatrix.push(gridLine);
    }

    const shapeAnalysis = analyzeShapeMatrix(shapeMatrix);
    const spreadScore = Math.min(0.22, spread / 260);
    const shapeScore = Math.min(0.12, occupied.size / Math.max(1, rows * cols));
    const confidence = Math.min(0.69, 0.38 + spreadScore + shapeScore);

    return {
        id: "layout-grid-1",
        candidate_source: "layout_imputed_fixed_grid",
        layout_imputed: true,
        cell_count: occupied.size,
        row_count: rows,
        col_count: cols,
        detected_grid_cell_count: rows * cols,
        grid_matrix: gridMatrix,
        shape_matrix: shapeMatrix,
        shape_signature: shapeAnalysis.signature,
        shape_analysis: shapeAnalysis,
        grid_cells: gridCells,
        occupied_threshold: round(threshold, 2),
        luma_range: {
            min: round(minLuma, 2),
            median: round(medianLuma, 2),
            max: round(maxLuma, 2),
            spread: round(spread, 2)
        },
        threshold_basis: spread >= 18 ? "layout_imputed_inner_luma_range" : "layout_imputed_inner_luma_floor",
        bounds: fixedBounds,
        center: {
            x: round(fixedBounds.left + (fixedBounds.width / 2), 3),
            y: round(fixedBounds.top + (fixedBounds.height / 2), 3)
        },
        cell_pitch_px: round((fixedBounds.width + fixedBounds.height) / Math.max(1, rows + cols), 3),
        median_square_side_px: round(Math.min(fixedBounds.width / cols, fixedBounds.height / rows), 3),
        component_count: rows * cols,
        grid_coverage: 1,
        confidence: round(confidence),
        precision_status: "layout_imputed_grid_candidate"
    };
}

async function analyzeCatalogFixedGridRegionFromImageFile(filePath, bounds, options = {}) {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Cannot read image size: ${filePath}`);
    const { data, info } = await sharp(filePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return analyzeCatalogFixedGridRegionFromRaw(data, info.width, info.height, bounds, options);
}

function trimShapeMatrix(shapeMatrix = []) {
    const rows = Array.isArray(shapeMatrix) ? shapeMatrix.map((row) => String(row || "")) : [];
    const occupied = [];
    rows.forEach((line, row) => {
        Array.from(line).forEach((char, col) => {
            if (char === "#") occupied.push({ row, col });
        });
    });
    if (!occupied.length) {
        return {
            matrix: [],
            row_offset: 0,
            col_offset: 0,
            row_count: 0,
            col_count: 0
        };
    }

    const minRow = Math.min(...occupied.map((cell) => cell.row));
    const maxRow = Math.max(...occupied.map((cell) => cell.row));
    const minCol = Math.min(...occupied.map((cell) => cell.col));
    const maxCol = Math.max(...occupied.map((cell) => cell.col));
    const matrix = [];
    for (let row = minRow; row <= maxRow; row += 1) {
        let line = "";
        for (let col = minCol; col <= maxCol; col += 1) {
            line += rows[row] && rows[row][col] === "#" ? "#" : ".";
        }
        matrix.push(line);
    }
    return {
        matrix,
        row_offset: minRow,
        col_offset: minCol,
        row_count: matrix.length,
        col_count: matrix[0] ? matrix[0].length : 0
    };
}

function countShapeHoles(matrix = []) {
    const rows = matrix.length;
    const cols = matrix[0] ? matrix[0].length : 0;
    if (rows <= 2 || cols <= 2) return 0;
    const visited = new Set();
    let holes = 0;
    const isOccupied = (row, col) => matrix[row] && matrix[row][col] === "#";

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const startKey = `${row}:${col}`;
            if (isOccupied(row, col) || visited.has(startKey)) continue;
            const queue = [{ row, col }];
            visited.add(startKey);
            let cursor = 0;
            let touchesEdge = row === 0 || col === 0 || row === rows - 1 || col === cols - 1;

            while (cursor < queue.length) {
                const active = queue[cursor];
                cursor += 1;
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
                    const nextRow = active.row + dr;
                    const nextCol = active.col + dc;
                    if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) return;
                    if (isOccupied(nextRow, nextCol)) return;
                    const key = `${nextRow}:${nextCol}`;
                    if (visited.has(key)) return;
                    if (nextRow === 0 || nextCol === 0 || nextRow === rows - 1 || nextCol === cols - 1) touchesEdge = true;
                    visited.add(key);
                    queue.push({ row: nextRow, col: nextCol });
                });
            }
            if (!touchesEdge) holes += 1;
        }
    }
    return holes;
}

function analyzeShapeMatrix(shapeMatrix = []) {
    const trimmed = trimShapeMatrix(shapeMatrix);
    const matrix = trimmed.matrix;
    const occupied = [];
    const occupiedSet = new Set();
    matrix.forEach((line, row) => {
        Array.from(line).forEach((char, col) => {
            if (char !== "#") return;
            const cell = {
                row: row + trimmed.row_offset,
                col: col + trimmed.col_offset
            };
            occupied.push(cell);
            occupiedSet.add(`${row}:${col}`);
        });
    });

    const visited = new Set();
    const componentSizes = [];
    let perimeterCellCount = 0;
    occupied.forEach((cell) => {
        const localRow = cell.row - trimmed.row_offset;
        const localCol = cell.col - trimmed.col_offset;
        const key = `${localRow}:${localCol}`;
        const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        if (neighbors.some(([dr, dc]) => !occupiedSet.has(`${localRow + dr}:${localCol + dc}`))) {
            perimeterCellCount += 1;
        }
        if (visited.has(key)) return;
        const queue = [{ row: localRow, col: localCol }];
        visited.add(key);
        let cursor = 0;
        while (cursor < queue.length) {
            const active = queue[cursor];
            cursor += 1;
            neighbors.forEach(([dr, dc]) => {
                const next = `${active.row + dr}:${active.col + dc}`;
                if (!occupiedSet.has(next) || visited.has(next)) return;
                visited.add(next);
                queue.push({ row: active.row + dr, col: active.col + dc });
            });
        }
        componentSizes.push(queue.length);
    });

    const bboxArea = trimmed.row_count * trimmed.col_count;
    return {
        signature: matrix.length ? `${trimmed.row_count}x${trimmed.col_count}:${matrix.join("/")}` : "0x0:",
        trimmed_matrix: matrix,
        row_offset: trimmed.row_offset,
        col_offset: trimmed.col_offset,
        bounding_box_cells: {
            rows: trimmed.row_count,
            cols: trimmed.col_count,
            area: bboxArea
        },
        occupied_coordinates: occupied,
        component_count: componentSizes.length,
        component_sizes: componentSizes.sort((left, right) => right - left),
        perimeter_cell_count: perimeterCellCount,
        hole_count: countShapeHoles(matrix),
        compactness: bboxArea ? round(occupied.length / bboxArea, 4) : 0,
        aspect_ratio_cells: trimmed.row_count ? round(trimmed.col_count / trimmed.row_count, 4) : null
    };
}

function normalizeGridCluster(cluster, index, raw, width, height, options = {}) {
    const minGridCells = Number.isFinite(options.minGridCells) ? options.minGridCells : 2;
    if (!Array.isArray(cluster) || cluster.length < minGridCells) return null;

    const medianSide = median(cluster.flatMap((component) => [component.width, component.height])) || 8;
    const positionTolerance = Math.max(3, medianSide * 0.85);
    const rowCenters = clusterPositions(cluster.map((component) => component.center_y), positionTolerance);
    const colCenters = clusterPositions(cluster.map((component) => component.center_x), positionTolerance);
    const rows = rowCenters.length;
    const cols = colCenters.length;
    if (rows < 1 || cols < 1) return null;
    if (rows < 2 && cols < 2) return null;
    if (rows * cols < minGridCells) return null;

    const occupancy = buildOccupiedSlots(cluster, rowCenters, colCenters, raw, width, height, options);
    if (occupancy.occupied.size < 1) return null;

    const shapeMatrix = [];
    const gridMatrix = [];
    for (let row = 0; row < rows; row += 1) {
        let shapeLine = "";
        let gridLine = "";
        for (let col = 0; col < cols; col += 1) {
            const key = `${row}:${col}`;
            shapeLine += occupancy.occupied.has(key) ? "#" : ".";
            gridLine += occupancy.slotMap.has(key) ? "+" : ".";
        }
        shapeMatrix.push(shapeLine);
        gridMatrix.push(gridLine);
    }

    const minX = Math.min(...cluster.map((component) => component.x));
    const minY = Math.min(...cluster.map((component) => component.y));
    const maxX = Math.max(...cluster.map((component) => component.x + component.width));
    const maxY = Math.max(...cluster.map((component) => component.y + component.height));
    const expectedArea = rows * cols;
    const rowDiffs = rowCenters.slice(1).map((value, rowIndex) => value - rowCenters[rowIndex]);
    const colDiffs = colCenters.slice(1).map((value, colIndex) => value - colCenters[colIndex]);
    const cellPitch = median(rowDiffs.concat(colDiffs)) || medianSide;
    const componentSideSd = standardDeviation(cluster.flatMap((component) => [component.width, component.height]));
    const regularityPenalty = Math.min(0.45, componentSideSd / Math.max(1, medianSide));
    const shapeFill = occupancy.occupied.size / expectedArea;
    const gridCoverage = occupancy.slotMap.size / expectedArea;
    const confidence = Math.max(0, Math.min(1, 0.7 + (shapeFill * 0.2) - regularityPenalty));
    const shapeAnalysis = analyzeShapeMatrix(shapeMatrix);

    return {
        id: `grid-${index + 1}`,
        cell_count: occupancy.occupied.size,
        row_count: rows,
        col_count: cols,
        detected_grid_cell_count: occupancy.slotMap.size,
        grid_matrix: gridMatrix,
        shape_matrix: shapeMatrix,
        shape_signature: shapeAnalysis.signature,
        shape_analysis: shapeAnalysis,
        grid_cells: occupancy.gridCells,
        occupied_threshold: occupancy.threshold,
        luma_range: occupancy.luma_range,
        threshold_basis: occupancy.threshold_basis,
        bounds: {
            left: minX,
            top: minY,
            width: maxX - minX,
            height: maxY - minY
        },
        center: {
            x: round((minX + maxX) / 2, 3),
            y: round((minY + maxY) / 2, 3)
        },
        cell_pitch_px: round(cellPitch, 3),
        median_square_side_px: round(medianSide, 3),
        component_count: cluster.length,
        grid_coverage: round(gridCoverage),
        confidence: round(confidence),
        precision_status: confidence >= 0.72 && gridCoverage >= 0.55 ? "grid_shape_candidate" : "manual_review_required_low_confidence"
    };
}

function standardDeviation(values = []) {
    const normalized = values.filter(Number.isFinite);
    if (!normalized.length) return 0;
    const avg = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
    return Math.sqrt(normalized.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / normalized.length);
}

function overlapArea(left, right) {
    const x1 = Math.max(left.left, right.left);
    const y1 = Math.max(left.top, right.top);
    const x2 = Math.min(left.left + left.width, right.left + right.width);
    const y2 = Math.min(left.top + left.height, right.top + right.height);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function dedupeGridCandidates(candidates = []) {
    const sorted = candidates
        .filter(Boolean)
        .sort((left, right) => right.confidence - left.confidence || right.cell_count - left.cell_count);
    const kept = [];
    sorted.forEach((candidate) => {
        const duplicate = kept.some((existing) => {
            const overlap = overlapArea(candidate.bounds, existing.bounds);
            const minArea = Math.min(candidate.bounds.width * candidate.bounds.height, existing.bounds.width * existing.bounds.height);
            return minArea > 0 && overlap / minArea >= 0.35;
        });
        if (!duplicate) kept.push(candidate);
    });
    return kept.sort((left, right) => left.bounds.top - right.bounds.top || left.bounds.left - right.bounds.left)
        .map((candidate, index) => ({ ...candidate, id: `grid-${index + 1}` }));
}

function summarizeDetectedGridCandidates(candidates = []) {
    return {
        grid_count: candidates.length,
        cell_count_total: candidates.reduce((sum, candidate) => sum + candidate.cell_count, 0),
        high_confidence_count: candidates.filter((candidate) => candidate.precision_status === "grid_shape_candidate").length,
        manual_review_required_count: candidates.filter((candidate) => candidate.precision_status !== "grid_shape_candidate").length
    };
}

function detectCatalogGridContoursFromRaw(raw, width, height, options = {}) {
    const squareComponents = collectNeutralSquareComponents(raw, width, height, options);
    const clusters = clusterByDistance(squareComponents, options);
    const candidates = dedupeGridCandidates(clusters.map((cluster, index) => normalizeGridCluster(cluster, index, raw, width, height, options)));
    return {
        square_components: squareComponents,
        grid_candidates: candidates,
        summary: summarizeDetectedGridCandidates(candidates)
    };
}

async function detectCatalogGridContoursFromImageFile(filePath, options = {}) {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Cannot read image size: ${filePath}`);
    const { data, info } = await sharp(filePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return {
        image: { width: info.width, height: info.height },
        ...detectCatalogGridContoursFromRaw(data, info.width, info.height, options)
    };
}

function inferCatalogCardBounds(image, grid, options = {}) {
    const columnCount = Number.isFinite(Number(options.columns)) && Number(options.columns) > 0
        ? Math.max(1, Math.round(Number(options.columns)))
        : 2;
    const headerHeight = Number.isFinite(Number(options.headerHeight)) && Number(options.headerHeight) >= 0
        ? Math.round(Number(options.headerHeight))
        : 0;
    const columnWidth = image.width / columnCount;
    const columnIndex = clampNumber(Math.floor(grid.center.x / Math.max(1, columnWidth)), 0, columnCount - 1);
    const cardLeft = Math.floor(columnIndex * columnWidth);
    const cardRight = columnIndex === columnCount - 1 ? image.width : Math.ceil((columnIndex + 1) * columnWidth);
    const cardWidth = cardRight - cardLeft;
    const estimatedHeight = Math.max(grid.bounds.height * 5.2, cardWidth * 0.52);
    const top = Math.max(headerHeight, Math.round(grid.center.y - (estimatedHeight * 0.58)));
    const bottom = Math.min(image.height, Math.round(top + estimatedHeight));
    return {
        left: cardLeft,
        top,
        width: cardWidth,
        height: Math.max(1, bottom - top),
        basis: `${columnCount}_column_grid_anchor_estimate`
    };
}

function ocrCropBoundsForCard(card) {
    return {
        name: {
            left: card.left + Math.round(card.width * 0.02),
            top: card.top + Math.round(card.height * 0.03),
            width: Math.round(card.width * 0.62),
            height: Math.round(card.height * 0.16)
        },
        value: {
            left: card.left + Math.round(card.width * 0.36),
            top: card.top + Math.round(card.height * 0.76),
            width: Math.round(card.width * 0.32),
            height: Math.round(card.height * 0.18)
        }
    };
}

async function preprocessOcrRegion(filePath, bounds, attempt) {
    const scale = Number.isFinite(attempt.scale) ? attempt.scale : 2.5;
    const contrastBoost = Number.isFinite(attempt.contrastBoost) ? attempt.contrastBoost : 36;
    const multiplier = 1 + (contrastBoost / 100);
    const bias = 128 - (128 * multiplier);
    const image = sharp(filePath);
    const metadata = await image.metadata();
    const extract = {
        left: Math.max(0, Math.round(bounds.left)),
        top: Math.max(0, Math.round(bounds.top)),
        width: Math.max(1, Math.min(metadata.width - Math.max(0, Math.round(bounds.left)), Math.round(bounds.width))),
        height: Math.max(1, Math.min(metadata.height - Math.max(0, Math.round(bounds.top)), Math.round(bounds.height)))
    };

    let pipeline = sharp(filePath)
        .extract(extract)
        .resize({
            width: Math.max(1, Math.round(extract.width * scale)),
            height: Math.max(1, Math.round(extract.height * scale)),
            fit: "fill"
        })
        .grayscale()
        .linear(multiplier, bias);
    if (Number.isFinite(attempt.threshold)) pipeline = pipeline.threshold(attempt.threshold);
    return pipeline.png().toBuffer();
}

function parseTesseractTsv(tsvText) {
    const rows = String(tsvText || "").split(/\r?\n/).filter(Boolean);
    const header = rows.shift();
    if (!header) return { text: "", confidence: 0, word_count: 0 };
    const columns = header.split("\t");
    const index = Object.fromEntries(columns.map((column, position) => [column, position]));
    const lineMap = new Map();
    const confidences = [];

    rows.forEach((row) => {
        const parts = row.split("\t");
        const rawText = parts[index.text] || "";
        const text = rawText.trim();
        const confidence = Number(parts[index.conf]);
        if (!text || !Number.isFinite(confidence) || confidence < 0) return;
        const lineKey = [
            parts[index.page_num],
            parts[index.block_num],
            parts[index.par_num],
            parts[index.line_num]
        ].join(":");
        if (!lineMap.has(lineKey)) lineMap.set(lineKey, []);
        lineMap.get(lineKey).push(text);
        confidences.push(confidence);
    });

    return {
        text: Array.from(lineMap.values()).map((parts) => parts.join("")).join("\n"),
        confidence: confidences.length
            ? round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length, 2)
            : 0,
        word_count: confidences.length
    };
}

async function runTesseractOnBuffer(buffer, attempt, options = {}) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak-catalog-ocr-"));
    const inputPath = path.join(tmpDir, "input.png");
    fs.writeFileSync(inputPath, buffer);
    const args = [
        inputPath,
        "stdout",
        "-l",
        options.languages || DEFAULT_OCR_LANGUAGES,
        "--psm",
        String(attempt.psm || 7),
        "--dpi",
        String(attempt.dpi || 300),
        "-c",
        "preserve_interword_spaces=1"
    ];
    if (attempt.whitelist) args.push("-c", `tessedit_char_whitelist=${attempt.whitelist}`);
    args.push("tsv");

    try {
        const { stdout } = await execFileAsync(options.tesseractPath || "tesseract", args, {
            maxBuffer: 12 * 1024 * 1024,
            timeout: resolveTesseractTimeoutMs(options),
            killSignal: "SIGKILL"
        });
        return {
            label: attempt.label,
            ...parseTesseractTsv(stdout)
        };
    } catch (error) {
        return {
            label: attempt.label,
            text: "",
            confidence: 0,
            word_count: 0,
            error: error && error.message ? error.message : String(error)
        };
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function recognizeCardText(filePath, card, options = {}) {
    if (options.skipOcr) return null;
    const cropBounds = ocrCropBoundsForCard(card);
    const nameAttempts = [
        { label: "name-psm7", psm: 7, dpi: 300, scale: 3, contrastBoost: 42 },
        { label: "name-threshold-psm7", psm: 7, dpi: 360, scale: 3.2, contrastBoost: 48, threshold: 150 }
    ];
    const valueAttempts = [
        { label: "value-digits-psm7", psm: 7, dpi: 300, scale: 3, contrastBoost: 48, threshold: 150, whitelist: "0123456789" },
        { label: "value-snum-psm7", psm: 7, dpi: 300, scale: 3, contrastBoost: 40, whitelist: "0123456789" }
    ];
    const runAttempts = async (bounds, attempts) => {
        const results = [];
        for (const attempt of attempts) {
            const buffer = await preprocessOcrRegion(filePath, bounds, attempt);
            results.push(await runTesseractOnBuffer(buffer, attempt, options));
        }
        return results.sort((left, right) => right.confidence - left.confidence || right.word_count - left.word_count);
    };
    const nameResults = await runAttempts(cropBounds.name, nameAttempts);
    const valueResults = await runAttempts(cropBounds.value, valueAttempts);
    const bestValueText = valueResults[0] ? valueResults[0].text.replace(/\D+/g, "") : "";
    return {
        crop_bounds: cropBounds,
        name: {
            best_text: nameResults[0] ? nameResults[0].text : "",
            best_confidence: nameResults[0] ? nameResults[0].confidence : 0,
            attempts: nameResults
        },
        value: {
            best_text: bestValueText,
            best_value: bestValueText ? Number(bestValueText) : null,
            best_confidence: valueResults[0] ? valueResults[0].confidence : 0,
            attempts: valueResults
        }
    };
}

async function renderCatalogContourOverlay(filePath, analysis, overlayPath) {
    const occupiedRects = analysis.grid_candidates.flatMap((grid) => (
        Array.isArray(grid.grid_cells) ? grid.grid_cells : []
    ))
        .filter((cell) => cell.occupied && (Array.isArray(cell.inner_sample_regions) || cell.inner_sample_bounds))
        .flatMap((cell) => {
            const regions = Array.isArray(cell.inner_sample_regions) && cell.inner_sample_regions.length
                ? cell.inner_sample_regions
                : [cell.inner_sample_bounds];
            return regions
                .filter(Boolean)
                .map((region) => `<rect x="${region.left}" y="${region.top}" width="${region.width}" height="${region.height}" fill="#facc15" opacity="0.72"/>`);
        })
        .join("\n");
    const borderRects = analysis.grid_candidates.flatMap((grid) => (
        Array.isArray(grid.grid_cells) ? grid.grid_cells : []
    ))
        .filter((cell) => cell.detected_border && cell.component_bounds)
        .map((cell) => `<rect x="${cell.component_bounds.left}" y="${cell.component_bounds.top}" width="${cell.component_bounds.width}" height="${cell.component_bounds.height}" fill="none" stroke="#94a3b8" stroke-width="1" opacity="0.55"/>`)
        .join("\n");
    const svg = Buffer.from(`
<svg width="${analysis.image.width}" height="${analysis.image.height}" xmlns="http://www.w3.org/2000/svg">
  ${borderRects}
  ${occupiedRects}
  ${analysis.grid_candidates.map((grid, index) => `
  <rect x="${grid.bounds.left}" y="${grid.bounds.top}" width="${grid.bounds.width}" height="${grid.bounds.height}" fill="none" stroke="#67e8f9" stroke-width="3"/>
  <text x="${grid.bounds.left}" y="${Math.max(14, grid.bounds.top - 5)}" fill="#67e8f9" font-size="18" font-family="Menlo, Arial">格${grid.cell_count} #${index + 1}</text>`).join("\n")}
</svg>`);
    fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
    await sharp(filePath)
        .composite([{ input: svg, left: 0, top: 0 }])
        .png()
        .toFile(overlayPath);
}

async function analyzeCatalogCardImage(filePath, options = {}) {
    const contour = await detectCatalogGridContoursFromImageFile(filePath, options);
    const gridCandidates = selectCatalogPageGridCandidates(contour.grid_candidates, contour.image, options);
    const limit = Number.isFinite(Number(options.ocrSampleLimit))
        ? Number(options.ocrSampleLimit)
        : DEFAULT_OCR_SAMPLE_LIMIT;
    const cards = [];
    for (const grid of gridCandidates.slice(0, limit)) {
        const card = inferCatalogCardBounds(contour.image, grid, options);
        cards.push({
            grid_id: grid.id,
            card_bounds: card,
            grid,
            ocr: await recognizeCardText(filePath, card, options)
        });
    }
    return {
        ...contour,
        grid_candidates: gridCandidates,
        summary: summarizeDetectedGridCandidates(gridCandidates),
        cards
    };
}

function resolveCatalogPageSlot(candidate, image, options = {}) {
    const columns = Number.isFinite(Number(options.catalogPageColumns)) && Number(options.catalogPageColumns) > 0
        ? Math.max(1, Math.round(Number(options.catalogPageColumns)))
        : 2;
    const rows = Number.isFinite(Number(options.catalogPageRows)) && Number(options.catalogPageRows) > 0
        ? Math.max(1, Math.round(Number(options.catalogPageRows)))
        : 2;
    const headerHeight = Number.isFinite(Number(options.catalogPageHeaderHeight)) && Number(options.catalogPageHeaderHeight) >= 0
        ? Math.round(Number(options.catalogPageHeaderHeight))
        : 0;
    const columnWidth = image.width / columns;
    const usableHeight = Math.max(1, image.height - headerHeight);
    const rowHeight = usableHeight / rows;
    const centerX = candidate.center && Number.isFinite(candidate.center.x)
        ? candidate.center.x
        : candidate.bounds.left + (candidate.bounds.width / 2);
    const centerY = candidate.center && Number.isFinite(candidate.center.y)
        ? candidate.center.y
        : candidate.bounds.top + (candidate.bounds.height / 2);
    const col = clampNumber(Math.floor(centerX / Math.max(1, columnWidth)), 0, columns - 1);
    const row = clampNumber(Math.floor((centerY - headerHeight) / Math.max(1, rowHeight)), 0, rows - 1);
    const localX = (centerX - (col * columnWidth)) / Math.max(1, columnWidth);
    const localY = (centerY - (headerHeight + (row * rowHeight))) / Math.max(1, rowHeight);
    const inExpectedGridBand = localX >= 0.72 && localX <= 0.98 && localY >= 0.42 && localY <= 0.96;
    const xScore = Math.max(0, 1 - (Math.abs(localX - 0.88) / 0.24));
    const yScore = Math.max(0, 1 - (Math.abs(localY - 0.78) / 0.28));
    const densityScore = Math.min(1.4, (candidate.detected_grid_cell_count || 0) / 18);
    const cellScore = Math.min(0.6, (candidate.cell_count || 0) / 10);
    return {
        row,
        col,
        key: `${row}:${col}`,
        local_x: round(localX, 4),
        local_y: round(localY, 4),
        in_expected_grid_band: inExpectedGridBand,
        score: round(xScore + yScore + densityScore + cellScore + (candidate.confidence || 0), 4)
    };
}

function selectCatalogPageGridCandidates(candidates = [], image = {}, options = {}) {
    const shouldFilter = options.catalogPageSlotFilter === true
        || (options.catalogPageSlotFilter !== false && image.width >= 600 && image.height >= 500 && candidates.length >= 4);
    if (!shouldFilter) return candidates;

    const bySlot = new Map();
    candidates.forEach((candidate) => {
        const slot = resolveCatalogPageSlot(candidate, image, options);
        if (!slot.in_expected_grid_band) return;
        const annotated = {
            ...candidate,
            catalog_page_slot: {
                row: slot.row,
                col: slot.col,
                local_x: slot.local_x,
                local_y: slot.local_y
            },
            catalog_page_slot_score: slot.score
        };
        const previous = bySlot.get(slot.key);
        if (!previous || annotated.catalog_page_slot_score > previous.catalog_page_slot_score) {
            bySlot.set(slot.key, annotated);
        }
    });

    if (!bySlot.size) return candidates;
    return Array.from(bySlot.values())
        .sort((left, right) => (
            left.catalog_page_slot.row - right.catalog_page_slot.row
            || left.catalog_page_slot.col - right.catalog_page_slot.col
        ))
        .map((candidate, index) => ({ ...candidate, id: `grid-${index + 1}` }));
}

function markdownCell(value) {
    return String(value === null || value === undefined || value === "" ? "-" : value)
        .replace(/\|/g, "\\|")
        .replace(/\n/g, " ");
}

function tableRow(cells) {
    return `| ${cells.map(markdownCell).join(" | ")} |`;
}

function incrementCounter(counter, key, amount = 1) {
    if (key === null || key === undefined || key === "") return;
    const normalizedKey = String(key);
    counter[normalizedKey] = (counter[normalizedKey] || 0) + amount;
}

function sortCounter(counter) {
    return Object.fromEntries(
        Object.entries(counter).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    );
}

function summarizeGridCandidateShapes(candidates = []) {
    const shapeSignatureCounts = {};
    const cellCountDistribution = {};
    const signatureCellCounts = new Map();
    let cellCountTotal = 0;
    let highConfidenceCount = 0;
    let manualReviewRequiredCount = 0;
    let maxCellCount = 0;

    candidates.filter(Boolean).forEach((candidate) => {
        const cellCount = Number.isFinite(candidate.cell_count) ? candidate.cell_count : 0;
        const signature = candidate.shape_signature || "unknown";
        incrementCounter(shapeSignatureCounts, signature);
        incrementCounter(cellCountDistribution, cellCount);
        cellCountTotal += cellCount;
        maxCellCount = Math.max(maxCellCount, cellCount);
        if (!signatureCellCounts.has(signature)) signatureCellCounts.set(signature, cellCount);
        if (candidate.precision_status === "grid_shape_candidate") {
            highConfidenceCount += 1;
        } else {
            manualReviewRequiredCount += 1;
        }
    });

    const sortedShapeSignatureCounts = sortCounter(shapeSignatureCounts);
    const topShapeSignatures = Object.entries(sortedShapeSignatureCounts)
        .slice(0, 12)
        .map(([shapeSignature, count]) => ({
            shape_signature: shapeSignature,
            count,
            cell_count: signatureCellCounts.has(shapeSignature) ? signatureCellCounts.get(shapeSignature) : null
        }));

    return {
        grid_candidate_count: candidates.length,
        cell_count_total: cellCountTotal,
        high_confidence_count: highConfidenceCount,
        manual_review_required_count: manualReviewRequiredCount,
        max_cell_count: maxCellCount,
        shape_signature_counts: sortedShapeSignatureCounts,
        cell_count_distribution: sortCounter(cellCountDistribution),
        top_shape_signatures: topShapeSignatures
    };
}

function summarizeReportShapes(results = []) {
    const candidates = results.flatMap((result) => Array.isArray(result.grid_candidates) ? result.grid_candidates : []);
    return {
        image_count: results.length,
        ...summarizeGridCandidateShapes(candidates)
    };
}

function formatTopShapeSignatures(topShapeSignatures = [], limit = 4) {
    const entries = topShapeSignatures.slice(0, limit).map((entry) => (
        `${entry.shape_signature} (${entry.count})`
    ));
    return entries.length ? entries.join(", ") : "-";
}

function writeMarkdownReport(report, outputPath) {
    const mdPath = outputPath.replace(/\.json$/i, ".md");
    const lines = [
        "# Catalog Card OCR / Contour Report",
        "",
        `- change class: \`${report.change_class}\``,
        `- image count: \`${report.image_count}\``,
        `- training label allowed: \`false\``,
        `- grid candidates: \`${report.summary.grid_candidate_count}\``,
        `- cell total: \`${report.summary.cell_count_total}\``,
        `- max cell count: \`${report.summary.max_cell_count}\``,
        "",
        "## Shape Summary",
        "",
        tableRow(["shape signature", "count", "cell count"]),
        tableRow(["---", "---:", "---:"]),
        ...(report.summary.top_shape_signatures.length
            ? report.summary.top_shape_signatures.map((entry) => tableRow([
                entry.shape_signature,
                entry.count,
                entry.cell_count
            ]))
            : [tableRow(["-", 0, "-"])]),
        "",
        "## Images",
        "",
        tableRow(["image", "grid candidates", "high confidence", "manual review", "cell total", "top shapes", "overlay"]),
        tableRow(["---", "---:", "---:", "---:", "---:", "---", "---"])
    ];
    report.results.forEach((result) => {
        lines.push(tableRow([
            result.basename,
            result.summary.grid_count,
            result.summary.high_confidence_count,
            result.summary.manual_review_required_count,
            result.summary.cell_count_total,
            formatTopShapeSignatures(result.shape_summary.top_shape_signatures),
            result.overlay_path
        ]));
    });
    lines.push(
        "",
        "## Method",
        "",
        "- Detect neutral grey small-grid borders, not item art color.",
        "- Cluster border squares into each catalog occupancy grid.",
        "- Sample the thin band just inside each detected grid border, then convert bright cells into `shape_matrix` and `cell_count`.",
        "- OCR is auxiliary for name/value association and should not decide occupancy."
    );
    fs.writeFileSync(mdPath, `${lines.join("\n")}\n`, "utf8");
    return mdPath;
}

async function buildCatalogOcrContourReport(inputFiles, options = {}) {
    const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;
    const outputDir = path.dirname(outputPath);
    const baseName = path.basename(outputPath).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_.-]+/g, "_");
    const overlayDir = path.join(outputDir, `${baseName}_overlays`);
    fs.mkdirSync(overlayDir, { recursive: true });
    const results = [];

    for (const filePath of inputFiles) {
        const analysis = await analyzeCatalogCardImage(filePath, options);
        const overlayPath = path.join(overlayDir, `${path.basename(filePath).replace(/\.[^.]+$/, "")}-catalog-card-contour-overlay.png`);
        await renderCatalogContourOverlay(filePath, analysis, overlayPath);
        const shapeSummary = summarizeGridCandidateShapes(analysis.grid_candidates);
        results.push({
            file: filePath,
            basename: path.basename(filePath),
            overlay_path: overlayPath,
            image: analysis.image,
            summary: analysis.summary,
            shape_summary: shapeSummary,
            grid_candidates: analysis.grid_candidates,
            cards: analysis.cards
        });
    }

    const report = {
        schema_version: "ak_catalog_card_ocr_contour_report_v1",
        generated_at: new Date().toISOString(),
        change_class: "RESEARCH_ONLY",
        image_count: results.length,
        methodology: {
            occupancy_source: "neutral grey small-grid pixels",
            ignores_item_art_color: true,
            inner_sample_strategy: "inner_edge_band",
            ocr_role: "name/value association only",
            training_label_allowed: false
        },
        ocr: {
            enabled: options.skipOcr !== true,
            languages: options.languages || DEFAULT_OCR_LANGUAGES,
            sample_limit: Number.isFinite(Number(options.ocrSampleLimit)) ? Number(options.ocrSampleLimit) : DEFAULT_OCR_SAMPLE_LIMIT
        },
        summary: summarizeReportShapes(results),
        notes: [
            "This is designed for catalog item-card screenshots, not battle inventory screenshots.",
            "Grid cell count and shape are derived from the small occupancy grid shown on each card.",
            "Low-confidence rows must be manually reviewed before writing cells back to manual_catalog batches."
        ],
        results
    };
    report.markdown_path = writeMarkdownReport(report, outputPath);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report;
}

module.exports = {
    DEFAULT_OUTPUT_PATH,
    analyzeCatalogCardImage,
    analyzeCatalogFixedGridRegionFromImageFile,
    analyzeCatalogFixedGridRegionFromRaw,
    buildCatalogOcrContourReport,
    collectNeutralSquareComponents,
    detectCatalogGridContoursFromImageFile,
    detectCatalogGridContoursFromRaw,
    inferCatalogCardBounds,
    normalizeInputPath,
    parseTesseractTsv,
    resolveTesseractTimeoutMs
};
